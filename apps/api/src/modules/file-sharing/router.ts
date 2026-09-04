import { Router, type Request } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { loadEnv } from '../../platform/config/env.js';
import { requireScopes } from '../../platform/auth/scopes.js';
import { resolveAutomationOwnerUserId } from '../../platform/auth/automation-owner.js';
import { badRequest, notFound, ProblemError, serviceUnavailable } from '../../platform/errors/problem.js';
import { FILE_SHARE_SCOPES } from './scopes.js';
import { SharedFileModel } from './models/shared-file.model.js';
import { FileShareGrantModel } from './models/file-share-grant.model.js';
import { sanitizeFileName } from './domain/file-name.js';
import { checkQuota, bytesToMb } from './domain/quota.js';
import { checkDeclared } from './domain/size-guard.js';
import { generatePassword, formatForDisplay, hashPassword } from './domain/share-password.js';
import { buildShareUrl, generateShareToken } from './domain/share-token.js';
import {
  canReissue,
  canTransition,
  computeExpiresAt,
  isExpired,
  type ShareState,
} from './domain/share-lifecycle.js';
import { absoluteBlobPath, discardTemp, newStorageId, removeBlob, statBlob } from './services/blob-storage.service.js';
import { streamToStorage } from './services/upload.service.js';
import { resetLink } from './services/throttle.service.js';

// Endpointi LASTNIKA pod /api/v1/files* — glej specs/009-file-sharing/contracts/openapi.yaml.
//
// Vsaka pot v tej datoteki kliče `requireScopes`. Javne poti so v LOČENI datoteki
// (public.router.ts), da je javnost razvidna iz imena datoteke in ne iz odsotnosti enega klica
// sredi tristo vrstic (research.md §2).
export const fileSharingRouter = Router();

const MB = 1024 * 1024;

const createFileSchema = z.object({
  fileName: z.string().max(400),
  byteSize: z.number().int().positive(),
  mimeType: z.string().max(200).optional(),
  // `undefined` (izpuščeno) = privzetek namestitve; izrecni `null` = BREZ ROKA. Razlika je
  // namerna in je edini način, da sta obe izbiri izrazljivi (domain/share-lifecycle.ts).
  expiresInDays: z.union([z.literal(1), z.literal(7), z.literal(30), z.null()]).optional(),
});

interface SharedFileLean {
  _id: unknown;
  displayName: string;
  mimeType: string;
  byteSize: number;
  storageId: string;
  state: ShareState;
  token: string | null;
  expiresAt: Date | null;
  downloadCount: number;
  lastDownloadedAt: Date | null;
  failedAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
}

function toFileResponse(doc: SharedFileLean, now = new Date()) {
  const token = doc.token ?? null;
  return {
    id: String(doc._id),
    displayName: doc.displayName,
    mimeType: doc.mimeType,
    byteSize: doc.byteSize,
    state: doc.state,
    // IZPELJANO iz časa, ne shranjeno — glej data-model.md, "Izpeljano, ne shranjeno".
    expired: isExpired(doc.expiresAt, now),
    shareUrl: token ? buildShareUrl(loadEnv().PUBLIC_BASE_URL, token) : null,
    expiresAt: doc.expiresAt ?? null,
    downloadCount: doc.downloadCount,
    lastDownloadedAt: doc.lastDownloadedAt ?? null,
    failedAttempts: doc.failedAttempts,
    lockedUntil: doc.lockedUntil ?? null,
    createdAt: doc.createdAt,
  };
}

/** Neveljaven ObjectId bi v Mongoose vrgel CastError, ki se navzven pokaže kot 500 — za
 * uporabnika, ki je odprl staro povezavo, je to 404 (isti vzorec kot v modulu beležk). */
function requireObjectId(value: string): string {
  if (!Types.ObjectId.isValid(value)) throw notFound('Datoteka ne obstaja.');
  return value;
}

/** Isti pomočnik kot v `modules/timesheet/router.ts`: API ključ ni vezan na uporabnika, zato je
 * treba ugotoviti, v čigavem imenu deluje avtomatizacija (platform/auth/automation-owner.ts).
 * Brez tega bi `userId` na zapisu postal identifikator ključa in datoteka ne bi pripadala
 * nikomur. */
async function resolveOwnerUserId(req: Request): Promise<string> {
  if (req.auth!.subjectType === 'user') return req.auth!.subjectId;
  const ownerId = await resolveAutomationOwnerUserId();
  if (!ownerId) {
    throw notFound(
      'Avtomatizacija ne more ugotoviti, na katerega uporabnika se nanaša — ni podedovanih podatkov niti natanko enega uporabnika.',
    );
  }
  return ownerId;
}

/** Datoteka TEGA uporabnika ali 404 — nikoli 403: obstoj tuje datoteke ni podatek (FR-053). */
async function findOwnFile(fileId: string, userId: string) {
  const file = await SharedFileModel.findOne({ _id: requireObjectId(fileId), userId });
  if (!file) throw notFound('Datoteka ne obstaja.');
  return file;
}

/** Zasedeno se VEDNO sešteje z agregacijo, nikoli iz števca na uporabniku — števec bi se ob
 * prvi pozabljeni poti tiho razsinhroniziral (domain/quota.ts).
 *
 * `upTo` omeji seštevek na zapise, ki so nastali PRED danim (in nanj samega) — podlaga za
 * razsodbo med vzporednima napovedma, glej `reserveQuota`. */
async function usedBytesFor(userId: string, upTo?: unknown): Promise<number> {
  const match: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
  if (upTo !== undefined) match._id = { $lte: upTo };
  const [row] = await SharedFileModel.aggregate<{ total: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$byteSize' } } },
  ]);
  return row?.total ?? 0;
}

function quotaExceeded(availableBytes: number): ProblemError {
  return new ProblemError(
    507,
    'Ni dovolj prostora',
    `Na voljo je še ${bytesToMb(availableBytes)} MB. Sprosti prostor z brisanjem starejših datotek.`,
  );
}

// ── Seznam in podrobnosti ────────────────────────────────────────────────────────────────

fileSharingRouter.get('/files', requireScopes(FILE_SHARE_SCOPES.read), async (req, res, next) => {
  try {
    const userId = await resolveOwnerUserId(req);
    const env = loadEnv();
    // Zapisi v stanju `uploading` NISO na seznamu: nalaganje, ki teče (ali je obtičalo), ni
    // deljena datoteka (FR-006).
    const files = await SharedFileModel.find({ userId, state: { $ne: 'uploading' } })
      .sort({ createdAt: -1 })
      .lean<SharedFileLean[]>();
    const now = new Date();
    res.json({
      files: files.map((f) => toFileResponse(f, now)),
      quota: { usedBytes: await usedBytesFor(userId), limitBytes: env.FILE_SHARE_QUOTA_MB * MB },
    });
  } catch (err) {
    next(err);
  }
});

fileSharingRouter.get('/files/:fileId', requireScopes(FILE_SHARE_SCOPES.read), async (req, res, next) => {
  try {
    const file = await findOwnFile(String(req.params.fileId), await resolveOwnerUserId(req));
    res.json(toFileResponse(file.toObject() as unknown as SharedFileLean));
  } catch (err) {
    next(err);
  }
});

// ── Nalaganje, prvi korak: napoved ───────────────────────────────────────────────────────

fileSharingRouter.post('/files', requireScopes(FILE_SHARE_SCOPES.write), async (req, res, next) => {
  try {
    const input = createFileSchema.parse(req.body);
    const env = loadEnv();
    const userId = await resolveOwnerUserId(req);
    const maxBytes = env.FILE_SHARE_MAX_MB * MB;

    if (input.byteSize > maxBytes) {
      throw new ProblemError(
        413,
        'Datoteka je prevelika',
        `Največja velikost ene datoteke je ${env.FILE_SHARE_MAX_MB} MB.`,
      );
    }

    const limitBytes = env.FILE_SHARE_QUOTA_MB * MB;

    // Kvota se preveri PRED prenosom — sicer bi 500 MB priteklo do konca in bilo šele nato
    // zavrnjeno (research.md §3).
    const quota = checkQuota(await usedBytesFor(userId), input.byteSize, limitBytes);
    if (!quota.ok) throw quotaExceeded(quota.availableBytes);

    // Zapis prostor REZERVIRA: `uploading` ima `byteSize` in ga seštevek zasedenosti šteje,
    // zato ga naslednja napoved vidi, še preden je vsebina prispela.
    const file = await SharedFileModel.create({
      userId,
      displayName: sanitizeFileName(input.fileName),
      mimeType: input.mimeType?.trim() || 'application/octet-stream',
      byteSize: input.byteSize,
      storageId: newStorageId(),
      state: 'uploading',
      expiresAt: computeExpiresAt(input.expiresInDays, new Date(), env.FILE_SHARE_DEFAULT_EXPIRY_DAYS),
    });

    // Dve VZPOREDNI napovedi bi obe prebrali kvoto, preden bi katera od njiju pisala, in obe bi
    // šli skozi. Zato po zapisu še enkrat — a seštejemo samo zapise, ki so nastali PRED tem
    // (in tega). S tem je razsodnik `_id`, ki je enolično urejen: pri dveh napovedih uspe
    // natanko tista, ki je bila prva, druga pa se pobriše. Brez tega bi bila potrebna
    // transakcija ali števec na uporabniku — oboje dražje od ene poizvedbe.
    if ((await usedBytesFor(userId, file._id)) > limitBytes) {
      await SharedFileModel.deleteOne({ _id: file._id });
      throw quotaExceeded(Math.max(0, limitBytes - (await usedBytesFor(userId))));
    }

    res.status(201).json({
      id: String(file._id),
      uploadUrl: `/api/v1/files/${String(file._id)}/content`,
      maxBytes,
    });
  } catch (err) {
    next(err);
  }
});

// ── Nalaganje, drugi korak: vsebina ──────────────────────────────────────────────────────

/**
 * POZOR: za to pot NI registriranega razčlenjevalnika telesa in ne sme biti.
 *
 * Vzorec iz `modules/notes/router.ts` (`express.raw({ limit })`) se tu NE ponovi: `express.raw`
 * telo zbere v `Buffer`, kar je pri 10 MB posnetku pravilno in pri 500 MB datoteki napaka —
 * vsebnik ima `mem_limit: 1200m`. `req` gre naravnost v datoteko (services/upload.service.ts,
 * research.md §4). Globalni `express.json()` iz main.ts se binarnega telesa ne dotakne, ker
 * razume samo `application/json`.
 */
fileSharingRouter.put('/files/:fileId/content', requireScopes(FILE_SHARE_SCOPES.write), async (req, res, next) => {
  let file;
  try {
    file = await findOwnFile(String(req.params.fileId), await resolveOwnerUserId(req));
    const env = loadEnv();
    const maxBytes = env.FILE_SHARE_MAX_MB * MB;

    if (file.state !== 'uploading') {
      throw new ProblemError(
        409,
        'Vsebina je že naložena',
        'Ta zapis ima vsebino. Za novo datoteko začni nov prenos.',
      );
    }

    // Prvo od dveh preverjanj meje (FR-003). Drugo je med pisanjem, v upload.service.ts.
    const declared = checkDeclared(req.header('content-length'), maxBytes);
    if (declared === 'missing' || declared === 'invalid') {
      throw badRequest('Manjka ali je neveljavna glava Content-Length.');
    }
    if (declared === 'empty') throw badRequest('Datoteka je prazna.');
    if (declared === 'too-large') {
      // Odgovor pride, preden je telo prebrano. Node ob nepobranem telesu poruši povezavo, zato
      // je `Connection: close` edini način, da se zaključi kolikor mogoče čisto. Preostanka
      // NAMENOMA ne požremo: prebrati 600 MB samo zato, da lahko rečemo "preveliko", je
      // brezplačen kanal za tistega, ki to počne namerno.
      //
      // Za odjemalca to praktično ni pot: velikost je preverjena že v prvem koraku
      // (`POST /files`), ki na majhno telo odgovori s čistim 413 (research.md §3). Sem pride
      // samo klicatelj, ki je prvi korak preskočil.
      res.setHeader('Connection', 'close');
      throw new ProblemError(413, 'Datoteka je prevelika', `Največja velikost je ${env.FILE_SHARE_MAX_MB} MB.`);
    }

    const outcome = await streamToStorage(req, file.storageId, maxBytes);

    if (outcome.status === 'too-large') {
      await SharedFileModel.deleteOne({ _id: file._id });
      throw new ProblemError(
        413,
        'Datoteka je prevelika',
        `Prenos je bil prekinjen: največja velikost je ${env.FILE_SHARE_MAX_MB} MB.`,
      );
    }
    if (outcome.status === 'empty') {
      await SharedFileModel.deleteOne({ _id: file._id });
      throw badRequest('Datoteka je prazna.');
    }
    if (outcome.status === 'aborted') {
      // Odjemalec je odšel — zapisa in delne datoteke ne sme ostati nič (FR-006). Odgovora
      // nima kdo prebrati, zato ga ne pišemo.
      await SharedFileModel.deleteOne({ _id: file._id });
      return;
    }
    if (outcome.status === 'failed') {
      await SharedFileModel.deleteOne({ _id: file._id });
      req.log?.error({ err: outcome.error, fileId: String(file._id) }, 'fileShare.upload.failed');
      throw serviceUnavailable('Nalaganja ni bilo mogoče dokončati. Poskusi znova.');
    }

    // Drugo preverjanje kvote — z DEJANSKO velikostjo. Napovedana je bila obljuba; do sem je
    // lahko medtem prišlo tudi vzporedno nalaganje, ki je prostor porabilo (FR-009).
    const userId = await resolveOwnerUserId(req);
    const withActualSize = (await usedBytesFor(userId)) - file.byteSize + outcome.byteSize;
    if (withActualSize > env.FILE_SHARE_QUOTA_MB * MB) {
      await removeBlob(file.storageId);
      await SharedFileModel.deleteOne({ _id: file._id });
      throw quotaExceeded(Math.max(0, env.FILE_SHARE_QUOTA_MB * MB - (await usedBytesFor(userId))));
    }

    // Šele tu, ko je vsebina cela, nastaneta povezava in geslo — geslo za datoteko, ki še ni
    // prispela, ni za nobeno rabo (research.md §3).
    const password = generatePassword();
    file.set({
      byteSize: outcome.byteSize,
      state: 'ready',
      token: generateShareToken(),
      passwordHash: await hashPassword(password),
    });
    await file.save();

    res.status(201).json({
      file: toFileResponse(file.toObject() as unknown as SharedFileLean),
      shareUrl: buildShareUrl(env.PUBLIC_BASE_URL, file.token!),
      // EDINO mesto v celi pogodbi, kjer se pojavi geslo v čistopisu (FR-011).
      password: formatForDisplay(password),
    });
  } catch (err) {
    if (file && file.state === 'uploading') await discardTemp(file.storageId).catch(() => undefined);
    next(err);
  }
});

// ── Lastnikov prenos (brez gesla) ────────────────────────────────────────────────────────

fileSharingRouter.get('/files/:fileId/content', requireScopes(FILE_SHARE_SCOPES.read), async (req, res, next) => {
  try {
    const file = await findOwnFile(String(req.params.fileId), await resolveOwnerUserId(req));
    if (file.state === 'uploading') throw notFound('Datoteka ne obstaja.');

    const info = await statBlob(file.storageId);
    if (!info || info.size !== file.byteSize) {
      // Zapis brez vsebine ali okrnjena vsebina: NIKOLI tih prenos prazne datoteke (člen VII).
      await SharedFileModel.updateOne({ _id: file._id }, { $set: { state: 'broken' } });
      req.log?.error({ fileId: String(file._id), storageId: file.storageId }, 'fileShare.content.missing');
      throw serviceUnavailable('Vsebina te datoteke ni več na voljo. Zapis je označen kot pokvarjen.');
    }

    // Naložena datoteka je osebni podatek — nikoli v skupni predpomnilnik posrednika (isti
    // vzorec kot posnetki beležk, člen II: pred tem endpointom je Caddy na istem izvoru).
    res.setHeader('Cache-Control', 'private, no-store');
    // Lastnikov lastni prenos se NE šteje med prevzeme — števec meri, kolikokrat je datoteko
    // dobil prejemnik (FR-027, FR-028).
    res.download(absoluteBlobPath(file.storageId), file.displayName);
  } catch (err) {
    next(err);
  }
});

// ── Preklic, novo geslo, brisanje ────────────────────────────────────────────────────────

fileSharingRouter.post('/files/:fileId/revoke', requireScopes(FILE_SHARE_SCOPES.write), async (req, res, next) => {
  try {
    const file = await findOwnFile(String(req.params.fileId), await resolveOwnerUserId(req));
    if (!canTransition(file.state as ShareState, 'revoked')) {
      throw new ProblemError(409, 'Preklic ni mogoč', 'Te datoteke ni mogoče preklicati v tem stanju.');
    }

    file.set({ state: 'revoked' });
    await file.save();
    // Preklic razveljavi tudi ŽE IZDANE dovolilnice (FR-026) — sicer bi prejemnik, ki je geslo
    // vpisal pred preklicem, deset minut še lahko prenašal.
    await FileShareGrantModel.deleteMany({ fileId: file._id });

    res.json(toFileResponse(file.toObject() as unknown as SharedFileLean));
  } catch (err) {
    next(err);
  }
});

fileSharingRouter.post('/files/:fileId/password', requireScopes(FILE_SHARE_SCOPES.write), async (req, res, next) => {
  try {
    const file = await findOwnFile(String(req.params.fileId), await resolveOwnerUserId(req));
    if (!canReissue(file.state as ShareState)) {
      throw new ProblemError(409, 'Novega gesla ni mogoče izdati', 'Datoteka ni v stanju, ki bi to dopuščalo.');
    }

    // NOV žeton in NOVO geslo (research.md §12): namen je odvzeti dostop tistemu, ki ima staro.
    // Če bi naslov ostal isti, bi mu polovica ključa ostala v rokah.
    const password = generatePassword();
    file.set({
      state: 'ready',
      token: generateShareToken(),
      passwordHash: await hashPassword(password),
      failedAttempts: 0,
      lockedUntil: null,
    });
    await file.save();
    await FileShareGrantModel.deleteMany({ fileId: file._id });
    await resetLink(String(file._id));

    res.json({
      file: toFileResponse(file.toObject() as unknown as SharedFileLean),
      shareUrl: buildShareUrl(loadEnv().PUBLIC_BASE_URL, file.token!),
      password: formatForDisplay(password),
    });
  } catch (err) {
    next(err);
  }
});

fileSharingRouter.delete('/files/:fileId', requireScopes(FILE_SHARE_SCOPES.write), async (req, res, next) => {
  try {
    const file = await findOwnFile(String(req.params.fileId), await resolveOwnerUserId(req));

    // Najprej vsebina, nato zapis (data-model.md). Obratno bi ob napaki pustilo siroto, ki je
    // nihče ne najde.
    try {
      await removeBlob(file.storageId);
      await discardTemp(file.storageId);
    } catch (err) {
      // Zapis OSTANE in postane viden kot pokvarjen — tiho izginotje zapisa ob datoteki, ki
      // ostane na disku, je natanko tisto, kar člen VII prepoveduje.
      await SharedFileModel.updateOne({ _id: file._id }, { $set: { state: 'broken' } });
      req.log?.error({ err, fileId: String(file._id) }, 'fileShare.delete.blobFailed');
      throw new ProblemError(
        500,
        'Brisanja ni bilo mogoče dokončati',
        'Vsebine ni bilo mogoče odstraniti. Zapis je označen kot pokvarjen in ostaja viden.',
      );
    }

    await FileShareGrantModel.deleteMany({ fileId: file._id });
    await resetLink(String(file._id));
    await SharedFileModel.deleteOne({ _id: file._id });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
