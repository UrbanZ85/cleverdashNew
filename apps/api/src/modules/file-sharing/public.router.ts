import { Router } from 'express';
import { z } from 'zod';
import { loadEnv } from '../../platform/config/env.js';
import { notFound, ProblemError, serviceUnavailable, unauthorized } from '../../platform/errors/problem.js';
import { SharedFileModel } from './models/shared-file.model.js';
import { FileShareGrantModel } from './models/file-share-grant.model.js';
import { isDownloadable, type ShareState } from './domain/share-lifecycle.js';
import { generateGrant, isShareTokenShaped } from './domain/share-token.js';
import { verifyPassword } from './domain/share-password.js';
import { absoluteBlobPath, statBlob } from './services/blob-storage.service.js';
import { checkBoth, registerFailedAttempt, resetLink } from './services/throttle.service.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  JAVNE POTI — /api/v1/share/*
//
//  To je edina datoteka v tem zaledju, ki namenoma NE kliče `requireScopes`. Prejemnik nima
//  računa in ga ne bo dobil (FR-020); zahtevati obseg od nekoga brez računa je nemogoče.
//
//  Zakaj ločena datoteka: javnost mora biti razvidna iz IMENA datoteke, ne iz odsotnosti enega
//  klica sredi tristo vrstic (research.md §2). Kdor doda pot sem, ve, kaj dela.
//
//  PRAVILA, KI VELJAJO ZA VSE POTI V TEJ DATOTEKI:
//
//   1. `req.auth` se NE bere. Nikjer. Če lastnik odpre svojo povezavo prijavljen v istem
//      brskalniku, se prevzem obnaša enako kot za tujca (FR-024).
//   2. Neznana, potekla, preklicana in izbrisana povezava dajo ENAK odgovor z ENAKIM
//      besedilom (FR-023) — kdor ima naslov, ne sme izvedeti, katera od možnosti drži.
//   3. Ime datoteke se NE izda pred pravilno vpisanim geslom (FR-022).
//   4. Poskušeno geslo ne gre nikamor: ne v bazo, ne v dnevnik (FR-032).
//   5. `Idempotency-Key` se pri teh poteh ne upošteva — `unlock` izdaja dovolilnico, kar je
//      izjema člena III (platform/idempotency/middleware.ts, EXEMPT_PREFIXES).
// ═══════════════════════════════════════════════════════════════════════════════════════════

export const fileSharingPublicRouter = Router();

/** Piškotek z dovolilnico. Ime je kratko, ker gre v vsako zahtevo za vsebino. */
const GRANT_COOKIE = 'cd_share';

const unlockSchema = z.object({
  password: z.string().min(1).max(128),
});

/** FR-023: en sam odgovor za štiri razloge. Besedilo je namenoma splošno. */
function unavailable(): ProblemError {
  return notFound('Ta povezava ne velja — ne obstaja, je potekla ali je bila preklicana.');
}

interface PublicFile {
  _id: unknown;
  displayName: string;
  mimeType: string;
  byteSize: number;
  storageId: string;
  state: ShareState;
  expiresAt: Date | null;
  passwordHash: string | null;
}

/** Poišče datoteko po žetonu. Vrne `null` za VSE razloge nedosegljivosti — klicatelj jih ne
 * sme razlikovati. */
async function findByToken(rawToken: unknown): Promise<PublicFile | null> {
  if (!isShareTokenShaped(rawToken)) return null;
  const file = await SharedFileModel.findOne({ token: rawToken }).lean<PublicFile | null>();
  if (!file) return null;
  if (!isDownloadable({ state: file.state, expiresAt: file.expiresAt ?? null }, new Date())) return null;
  return file;
}

// ── Kaj čaka za to povezavo ──────────────────────────────────────────────────────────────

fileSharingPublicRouter.get('/share/:token', async (req, res, next) => {
  try {
    const file = await findByToken(req.params.token);
    if (!file) throw unavailable();

    // Velikost in rok — nič drugega. IMENA DATOTEKE TU NI: `pogodba-najem-2026.pdf` pogosto
    // pove vsebino in bi ušlo vsakomur, ki naslov dobi naprej (FR-022, research.md §11).
    res.setHeader('Cache-Control', 'no-store');
    res.json({ byteSize: file.byteSize, expiresAt: file.expiresAt ?? null });
  } catch (err) {
    next(err);
  }
});

// ── Odklenitev z geslom ──────────────────────────────────────────────────────────────────

fileSharingPublicRouter.post('/share/:token/unlock', async (req, res, next) => {
  try {
    const input = unlockSchema.parse(req.body ?? {});
    const file = await findByToken(req.params.token);
    if (!file) throw unavailable();

    const env = loadEnv();
    const fileId = String(file._id);

    // Dušenje se preveri PRED preverjanjem gesla in po OBEH ključih (povezava, naslov). Med
    // zaklepom je zavrnjeno tudi pravilno geslo — drugače bi bil zaklep zgolj upočasnitev
    // (FR-030, research.md §9).
    const before = await checkBoth(fileId, req.ip);
    if (before.locked) {
      res.setHeader('Retry-After', String(before.retryAfterSeconds));
      throw new ProblemError(
        429,
        'Preveč poskusov',
        'Zaradi preveč napačnih poskusov je ta povezava začasno zaklenjena. Poskusi znova pozneje.',
      );
    }

    const ok = file.passwordHash ? await verifyPassword(input.password, file.passwordHash) : false;

    if (!ok) {
      const after = await registerFailedAttempt(fileId, req.ip);
      // Lastniku se pokaže zaklep POVEZAVE, ne zaklep naslova: naslov je zaklenjen napadalcu,
      // ne datoteki, in bi bilo zavajajoče, če bi lastnik svojo povezavo videl kot zaklenjeno,
      // ker je nekdo drug ugibal po tujih.
      await SharedFileModel.updateOne(
        { _id: file._id },
        { $inc: { failedAttempts: 1 }, $set: { lockedUntil: after.linkLockedUntil } },
      );
      // V dnevniku je vse razen poskušenega gesla (FR-032).
      req.log?.warn(
        { event: 'fileShare.unlock.failed', fileId, ip: req.ip, remaining: after.remaining },
        'Napačno geslo za prevzem datoteke',
      );
      if (after.locked) {
        res.setHeader('Retry-After', String(after.retryAfterSeconds));
        throw new ProblemError(429, 'Preveč poskusov', 'Ta povezava je začasno zaklenjena. Poskusi znova pozneje.');
      }
      throw new ProblemError(401, 'Geslo ni pravilno', `Geslo ni pravilno. Poskusov do zaklepa: ${after.remaining}.`);
    }

    // Uspeh ponastavi števec POVEZAVE, ne pa števca naslova (throttle.service.ts).
    await resetLink(fileId);
    await SharedFileModel.updateOne({ _id: file._id }, { $set: { failedAttempts: 0, lockedUntil: null } });

    const grant = generateGrant();
    const expiresAt = new Date(Date.now() + env.FILE_SHARE_GRANT_MINUTES * 60 * 1000);
    await FileShareGrantModel.create({ fileId: file._id, grant, expiresAt });

    // Dovolilnica gre v PIŠKOTEK, ne v naslov: prenos mora sprožiti navigacija brskalnika, da
    // 500 MB prevzame brskalnikov lastni prenašalnik. Naslov bi končal v zgodovini, v `Referer`
    // in v dnevnikih posrednika (research.md §8). `Path` je vezan na žeton, zato dovolilnica
    // ene datoteke ni poslana pri zahtevi za drugo (FR-016).
    res.cookie(GRANT_COOKIE, grant, {
      path: `/api/v1/share/${String(req.params.token)}`,
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: env.FILE_SHARE_GRANT_MINUTES * 60 * 1000,
    });
    res.setHeader('Cache-Control', 'no-store');

    res.json({
      // Ime datoteke je prvič vidno šele tu.
      fileName: file.displayName,
      byteSize: file.byteSize,
      mimeType: file.mimeType,
      downloadUrl: `/api/v1/share/${String(req.params.token)}/content`,
      grantExpiresAt: expiresAt,
    });
  } catch (err) {
    next(err);
  }
});

// ── Prevzem ──────────────────────────────────────────────────────────────────────────────

fileSharingPublicRouter.get('/share/:token/content', async (req, res, next) => {
  try {
    const file = await findByToken(req.params.token);
    if (!file) throw unavailable();

    const grant = (req.cookies as Record<string, string> | undefined)?.[GRANT_COOKIE];
    if (!grant) throw unauthorized('Za prenos je treba vpisati geslo.');

    // Veljavnost se preveri V POIZVEDBI, ne prek TTL indeksa: TTL monitor teče na ~60 s in
    // zamika ne obljublja — dovolilnica bi bila sicer lahko minuto predolgo veljavna
    // (research.md §13).
    const valid = await FileShareGrantModel.findOne({
      grant,
      fileId: file._id,
      expiresAt: { $gt: new Date() },
    }).lean();
    if (!valid) throw unauthorized('Dovolilnica je potekla ali je bila preklicana. Vpiši geslo znova.');

    const info = await statBlob(file.storageId);
    if (!info || info.size !== file.byteSize) {
      // Prenos prazne ali okrnjene datoteke, ki je videti uspešen, je tiha napaka (člen VI/VII).
      await SharedFileModel.updateOne({ _id: file._id }, { $set: { state: 'broken' } });
      req.log?.error(
        { event: 'fileShare.download.contentMissing', fileId: String(file._id), storageId: file.storageId },
        'Vsebina deljene datoteke manjka ali se ne ujema z zapisano velikostjo',
      );
      throw serviceUnavailable('Vsebina te datoteke ni več na voljo.');
    }

    res.setHeader('Cache-Control', 'no-store');
    // `res.download` (Expressov `send`) sam postavi `Content-Length`, `Accept-Ranges` in
    // obravnava `Range` — s tem je nadaljevanje prekinjenega prenosa (FR-025) izpolnjeno brez
    // lastne kode. Lastna izvedba delnega odgovora ima robove (`If-Range`, več razponov), ki
    // jih `send` že pozna.
    res.download(absoluteBlobPath(file.storageId), file.displayName, (err) => {
      if (err) {
        // Prekinjen prenos (prejemnik je odšel, lastnik je medtem preklical) ni napaka
        // strežnika; odgovor je že v teku, zato ga ni več mogoče zamenjati.
        req.log?.warn({ event: 'fileShare.download.interrupted', fileId: String(file._id) }, 'Prenos prekinjen');
        return;
      }
      void SharedFileModel.updateOne(
        { _id: file._id },
        { $inc: { downloadCount: 1 }, $set: { lastDownloadedAt: new Date() } },
      ).catch(() => undefined);
    });
  } catch (err) {
    next(err);
  }
});

