import { Router, type Request } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { loadEnv } from '../../platform/config/env.js';
import { badRequest, notFound, ProblemError, serviceUnavailable, unauthorized } from '../../platform/errors/problem.js';
import { SharedFileModel } from './models/shared-file.model.js';
import { FileShareGrantModel } from './models/file-share-grant.model.js';
import { FileInboxModel } from './models/file-inbox.model.js';
import { isDownloadable, type ShareState } from './domain/share-lifecycle.js';
import { isOpenForUpload, type InboxState } from './domain/inbox-lifecycle.js';
import { checkCapacity, maxSingleFileBytes, remainingBytes, remainingFiles } from './domain/inbox-capacity.js';
import { generateGrant, isGrantShaped, isShareTokenShaped } from './domain/share-token.js';
import { verifyPassword } from './domain/share-password.js';
import { sanitizeFileName } from './domain/file-name.js';
import { sanitizeSenderName } from './domain/sender-name.js';
import { isStreamableBody } from './domain/body-type.js';
import { checkDeclared } from './domain/size-guard.js';
import { absoluteBlobPath, discardTemp, newStorageId, removeBlob, statBlob } from './services/blob-storage.service.js';
import { streamToStorage } from './services/upload.service.js';
import {
  checkBoth,
  checkInbox,
  registerFailedAttempt,
  registerFailedInboxAttempt,
  resetInbox,
  resetLink,
} from './services/throttle.service.js';
import {
  MAX_PENDING_UPLOADS,
  inboxLimitsOf,
  inboxUsage,
  issueTicket,
  pendingUploads,
  ticketIsValid,
} from './services/inbox.service.js';
import { fitsAfterReserving, usedBytesFor } from './services/quota.service.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  JAVNE POTI — /api/v1/share/* (prevzem) in /api/v1/drop/* (oddaja)
//
//  To je edina datoteka v tem zaledju, ki namenoma NE kliče `requireScopes`. Človek na drugi
//  strani nima računa in ga ne bo dobil (FR-020, FR-081); zahtevati obseg od nekoga brez računa
//  je nemogoče.
//
//  Zakaj ločena datoteka: javnost mora biti razvidna iz IMENA datoteke, ne iz odsotnosti enega
//  klica sredi tristo vrstic (research.md §2). Kdor doda pot sem, ve, kaj dela. Zato sta OBE
//  javni površini tukaj in ne v dveh datotekah — pregled javnega dela modula je pregled ene
//  datoteke, in `tests/contract/file-sharing/auth-surface.spec.ts` bere seznam poti iz pogodbe,
//  da nova pot ne more tiho uiti.
//
//  PRAVILA, KI VELJAJO ZA VSE POTI V TEJ DATOTEKI:
//
//   1. `req.auth` se NE bere. Nikjer. Če lastnik odpre svojo povezavo prijavljen v istem
//      brskalniku, se prevzem (in oddaja) obnašata enako kot za tujca (FR-024).
//   2. Neznana, potekla, preklicana in izbrisana povezava — in prav tako neznan, potekel, zaprt
//      in izbrisan predal — dajo ENAK odgovor z ENAKIM besedilom (FR-023, FR-085): kdor ima
//      naslov, ne sme izvedeti, katera od možnosti drži.
//   3. Pred pravilno vpisanim geslom se NE izda ime datoteke (FR-022); pred pravilno vpisano
//      kodo se NE izda oznaka predala ne navodilo (FR-084). Oboje pogosto pove vsebino.
//   4. Poskušeno geslo in poskušena koda ne gresta nikamor: ne v bazo, ne v dnevnik (FR-032).
//   5. `Idempotency-Key` se pri teh poteh ne upošteva — `unlock` izdaja dovolilnico, kar je
//      izjema člena III (platform/idempotency/middleware.ts, EXEMPT_PREFIXES). Drugi razlog je
//      javnost: neomejeno pisanje v zbirko ključev z zahtevo brez poverilnic je pot do njenega
//      polnjenja.
//
//  DRUGA POLOVICA DATOTEKE PIŠE NA DISK, in to je druga vrsta nevarnosti kot branje. Kar iz tega
//  sledi, je zbrano v glavi razdelka "SPREJEMNI PREDAL" spodaj — dokler bereš samo prvo
//  polovico, velja: javna pot za prevzem ne ustvari niti enega zapisa razen dovolilnice.
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
        { $inc: { failedAttempts: 1 }, $set: { lockedUntil: after.subjectLockedUntil } },
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

    // OBLIKA se preveri PRED poizvedbo, in `unknown` namesto `string` v tipu ni podrobnost:
    // `cookie-parser` vrednost, ki se začne z `j:`, razčleni v OBJEKT, ta pa bi v pogoju
    // poizvedbe deloval kot operator in odprl vsebino brez gesla (glej `isGrantShaped`).
    const grant = (req.cookies as Record<string, unknown> | undefined)?.[GRANT_COOKIE];
    if (!isGrantShaped(grant)) throw unauthorized('Za prenos je treba vpisati geslo.');

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
    // 009b: vsebina zdaj lahko pride od TUJCA (sprejemni predal), zato tudi `nosniff`. Prenos je
    // že `attachment` in se v brskalniku ne izriše, a ugibanje vrste vsebine je edina pot, po
    // kateri bi datoteka, ki jo je oddal nekdo drug, lahko postala nekaj drugega kot datoteka —
    // in ta namestitev streže aplikacijo z ISTEGA izvora (člen II).
    res.setHeader('X-Content-Type-Options', 'nosniff');
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


// ═══════════════════════════════════════════════════════════════════════════════════════════
//  SPREJEMNI PREDAL — /api/v1/drop/*  (009b: obrnjena smer — nekdo BREZ RAČUNA nam odda datoteko)
//
//  Do tu je bila vsa javna površina samo za BRANJE: najhujše, kar je lahko naredil kdor koli z
//  naslovom, je bilo, da je prebral, kar mu je bilo namenjeno. Te poti PIŠEJO NA DISK v imenu
//  nekoga, ki ni prijavljen in nikoli ne bo. To je osrednje tveganje tega razdelka, ne
//  postranska podrobnost — enako, kot je bila javna stran za prevzem osrednje tveganje 009.
//
//  ŠTIRI MEJE, IN VSE ŠTIRI SE PREVERIJO PRI VSAKI ODDAJI (FR-088):
//
//    1. velikost ENE datoteke  — `FILE_SHARE_MAX_MB` (meja namestitve);
//    2. prostor PREDALA        — `maxFiles` in `maxTotalBytes`, ki jih je izbral lastnik ob
//                                nastanku predala (domain/inbox-capacity.ts);
//    3. kvota LASTNIKA         — `FILE_SHARE_QUOTA_MB` (services/quota.service.ts);
//    4. rok in stanje PREDALA  — odprt in ne potekel (domain/inbox-lifecycle.ts).
//
//  Prve tri se uveljavijo DVAKRAT: iz napovedane velikosti, preden se odpre datoteka na disku, in
//  med samim pisanjem. Napovedana velikost je obljuba pošiljatelja, ne dejstvo — in ta
//  pošiljatelj je tujec (FR-089).
//
//  KAJ POŠILJATELJ NE MORE:
//
//   - ne more ničesar prebrati. Predal je enosmeren; oddane datoteke po tej poti ni mogoče niti
//     našteti niti prenesti niti izbrisati (FR-086). Edini bralec je lastnik, prek `/files*`.
//   - ne more oddati brez dovolilnice, in ta ne potuje v piškotku, ampak v glavi
//     `X-Drop-Ticket`, ki jo mora odjemalec pripeti IZRECNO (FR-091). Tuja stran je ne more:
//     brez CORS-a (člen II) ji preverjanje pred zahtevo (preflight) ne uspe. Piškotek bi
//     brskalnik pripel sam in bi bila oddaja s tuje strani mogoča v imenu obiskovalca; pri poti,
//     ki piše na disk, je razlika med `SameSite` in odsotnostjo ambientne poverilnice bistvena.
//   - ne more izvedeti, čigav je predal, kaj je v njem ali koliko je že prispelo, dokler ne vpiše
//     kode (FR-084).
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Glava z dovolilnico za oddajo. Isto ime pripenja odjemalec (file-sharing.api.ts). */
const TICKET_HEADER = 'X-Drop-Ticket';

const MB = 1024 * 1024;

const unlockDropSchema = z.object({
  code: z.string().min(1).max(128),
});

const declareUploadSchema = z.object({
  fileName: z.string().max(400),
  byteSize: z.number().int().positive(),
  mimeType: z.string().max(200).optional(),
  /** Kar o sebi napiše pošiljatelj. Zgornja meja je tu velikodušna, ker `sanitizeSenderName` niz
   * vseeno skrajša — zavrnitev cele oddaje zaradi 90 znakov v polju, ki na nič ne vpliva, bi bila
   * nesmiselna ovira. */
  senderName: z.string().max(200).optional(),
});

interface PublicInbox {
  _id: unknown;
  userId: unknown;
  label: string;
  note: string;
  state: InboxState;
  expiresAt: Date | null;
  maxFiles: number;
  maxTotalBytes: number;
  codeHash: string;
}

interface PendingUpload {
  _id: unknown;
  storageId: string;
  byteSize: number;
  displayName: string;
}

/** Poišče ODPRT predal po žetonu. Vrne `null` za VSE razloge nedosegljivosti — klicatelj jih ne
 * sme razlikovati (FR-085), zato je odgovor povsod `unavailable()`, isti kot pri deljenju. */
async function findOpenInbox(rawToken: unknown): Promise<PublicInbox | null> {
  if (!isShareTokenShaped(rawToken)) return null;
  const inbox = await FileInboxModel.findOne({ token: rawToken }).lean<PublicInbox | null>();
  if (!inbox) return null;
  if (!isOpenForUpload({ state: inbox.state, expiresAt: inbox.expiresAt ?? null }, new Date())) return null;
  return inbox;
}

/** Dovolilnica iz glave ali 401. Vezana je na TA predal (services/inbox.service.ts) — dovolilnica
 * enega predala ne odpre drugega, tudi če sta oba istega lastnika. */
async function requireTicket(req: Request, inbox: PublicInbox): Promise<void> {
  if (!(await ticketIsValid(inbox._id, req.header(TICKET_HEADER)))) {
    throw unauthorized('Dovolilnica za oddajo je potekla ali je bila preklicana. Vpiši kodo znova.');
  }
}

/** Zavrnitev zaradi prostora. Besedilo je NAMENOMA brez številk o lastniku: pošiljatelj mora
 * izvedeti, da datoteka ne gre skozi, ne pa koliko prostora ima lastnik in koliko ga je porabil. */
function noRoom(detail: string): ProblemError {
  return new ProblemError(507, 'Ni dovolj prostora', detail);
}

// ── Kaj je za tem naslovom ───────────────────────────────────────────────────────────────

fileSharingPublicRouter.get('/drop/:token', async (req, res, next) => {
  try {
    const inbox = await findOpenInbox(req.params.token);
    if (!inbox) throw unavailable();

    const env = loadEnv();
    res.setHeader('Cache-Control', 'no-store');
    // Rok in dovoljena velikost — nič drugega. OZNAKE PREDALA TU NI (FR-084).
    //
    // `maxFileBytes` je NASTAVITEV predala, ne njegov preostali prostor: preostanek bi vsakomur,
    // ki ima naslov, dal števec dogajanja v predalu ("včeraj je bilo 900 MB, danes 400"). Pravo,
    // trenutno vrednost pošiljatelj dobi po vpisu kode, ko je razpoznan kot povabljen.
    res.json({
      maxFileBytes: Math.min(env.FILE_SHARE_MAX_MB * MB, inbox.maxTotalBytes),
      expiresAt: inbox.expiresAt ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// ── Odklenitev s kodo ────────────────────────────────────────────────────────────────────

fileSharingPublicRouter.post('/drop/:token/unlock', async (req, res, next) => {
  try {
    const input = unlockDropSchema.parse(req.body ?? {});
    const inbox = await findOpenInbox(req.params.token);
    if (!inbox) throw unavailable();

    const env = loadEnv();
    const inboxId = String(inbox._id);

    // Dušenje se preveri PRED preverjanjem kode in po OBEH ključih (predal, naslov). Med zaklepom
    // je zavrnjena tudi pravilna koda — drugače bi bil zaklep zgolj upočasnitev (FR-090).
    const before = await checkInbox(inboxId, req.ip);
    if (before.locked) {
      res.setHeader('Retry-After', String(before.retryAfterSeconds));
      throw new ProblemError(
        429,
        'Preveč poskusov',
        'Zaradi preveč napačnih poskusov je ta predal začasno zaklenjen. Poskusi znova pozneje.',
      );
    }

    const ok = await verifyPassword(input.code, inbox.codeHash);

    if (!ok) {
      const after = await registerFailedInboxAttempt(inboxId, req.ip);
      // Lastniku se pokaže zaklep PREDALA, ne zaklep naslova: naslov je zaklenjen napadalcu, ne
      // predalu, in bi bilo zavajajoče, če bi lastnik svoj predal videl kot zaklenjen, ker je
      // nekdo drug ugibal po tujih.
      await FileInboxModel.updateOne(
        { _id: inbox._id },
        { $inc: { failedAttempts: 1 }, $set: { lockedUntil: after.subjectLockedUntil } },
      );
      // V dnevniku je vse razen poskušene kode (FR-032).
      req.log?.warn(
        { event: 'fileShare.drop.unlock.failed', inboxId, ip: req.ip, remaining: after.remaining },
        'Napačna koda za oddajo v predal',
      );
      if (after.locked) {
        res.setHeader('Retry-After', String(after.retryAfterSeconds));
        throw new ProblemError(429, 'Preveč poskusov', 'Ta predal je začasno zaklenjen. Poskusi znova pozneje.');
      }
      throw new ProblemError(401, 'Koda ni pravilna', `Koda ni pravilna. Poskusov do zaklepa: ${after.remaining}.`);
    }

    // Uspeh ponastavi števec PREDALA, ne pa števca naslova (throttle.service.ts).
    await resetInbox(inboxId);
    await FileInboxModel.updateOne({ _id: inbox._id }, { $set: { failedAttempts: 0, lockedUntil: null } });

    const { ticket, expiresAt } = await issueTicket(inbox._id, env.FILE_SHARE_INBOX_TICKET_MINUTES);
    const limits = inboxLimitsOf(inbox);
    const usage = await inboxUsage(inbox._id);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      // Oznaka in navodilo sta prvič vidna šele tu.
      label: inbox.label,
      note: inbox.note ?? '',
      ticket,
      ticketExpiresAt: expiresAt,
      // Zdaj sme pošiljatelj videti PRAVO stanje prostora — brez tega bi izbral datoteko, ki bo
      // zavrnjena, in bi to izvedel po petih minutah pošiljanja.
      maxFileBytes: maxSingleFileBytes(usage, limits, env.FILE_SHARE_MAX_MB * MB),
      remainingFiles: remainingFiles(usage, limits),
      remainingBytes: remainingBytes(usage, limits),
    });
  } catch (err) {
    next(err);
  }
});

// ── Oddaja, prvi korak: napoved ──────────────────────────────────────────────────────────

fileSharingPublicRouter.post('/drop/:token/files', async (req, res, next) => {
  try {
    const inbox = await findOpenInbox(req.params.token);
    if (!inbox) throw unavailable();
    await requireTicket(req, inbox);

    const input = declareUploadSchema.parse(req.body ?? {});
    const env = loadEnv();
    const maxBytes = env.FILE_SHARE_MAX_MB * MB;
    const quotaBytes = env.FILE_SHARE_QUOTA_MB * MB;
    const limits = inboxLimitsOf(inbox);
    const ownerId = String(inbox.userId);

    // 1. meja namestitve.
    if (input.byteSize > maxBytes) {
      throw new ProblemError(
        413,
        'Datoteka je prevelika',
        `Največja velikost ene datoteke je ${env.FILE_SHARE_MAX_MB} MB.`,
      );
    }

    // Nedokončane oddaje: napoved prostor REZERVIRA, zato je nekaj visečih napovedi brez vsebine
    // dovolj, da je predal za vse ostale poln (services/inbox.service.ts).
    if ((await pendingUploads(inbox._id)) >= MAX_PENDING_UPLOADS) {
      throw new ProblemError(
        429,
        'Preveč oddaj hkrati',
        'Prejšnje oddaje še niso zaključene. Počakaj, da se dokončajo, in poskusi znova.',
      );
    }

    // 2. prostor predala.
    const usage = await inboxUsage(inbox._id);
    const capacity = checkCapacity(usage, limits, input.byteSize);
    if (!capacity.ok) {
      throw noRoom(
        capacity.reason === 'file-count'
          ? 'Ta predal je sprejel toliko datotek, kolikor jih sprejme. Obvesti prejemnika.'
          : `V tem predalu ni več prostora za to datoteko. Na voljo je še ${Math.floor(
              remainingBytes(usage, limits) / MB,
            )} MB.`,
      );
    }

    // 3. kvota lastnika. Sporočilo je brez njegovih številk — pošiljatelj ni njegov skrbnik.
    if ((await usedBytesFor(ownerId)) + input.byteSize > quotaBytes) {
      throw noRoom('Prejemnik trenutno nima prostora za to datoteko. Obvesti ga.');
    }

    // Zapis prostor REZERVIRA — v predalu in v kvoti lastnika hkrati, ker je isti zapis v obeh
    // seštevkih. Od tu naprej je datoteka LASTNIKOVA (FR-092): BREZ roka veljavnosti, ker je ni
    // delil on in mu ne sme izginiti sama od sebe, in BREZ žetona in gesla, ker prejeta datoteka
    // ni samodejno deljena naprej (FR-093).
    const record = await SharedFileModel.create({
      userId: inbox.userId,
      inboxId: inbox._id,
      senderName: sanitizeSenderName(input.senderName),
      displayName: sanitizeFileName(input.fileName),
      mimeType: input.mimeType?.trim() || 'application/octet-stream',
      byteSize: input.byteSize,
      storageId: newStorageId(),
      state: 'uploading',
      token: null,
      passwordHash: null,
      expiresAt: null,
    });

    // Razsodba med VZPOREDNIMA napovedma, po istem vzorcu kot pri lastnikovem nalaganju: obe bi
    // prebrali prostor, preden bi katera pisala. Seštejemo samo zapise do tega `_id` (in tega),
    // zato uspe natanko tista, ki je bila prva. Preveriti je treba OBE meji — predal in kvoto.
    const afterInsert = await inboxUsage(inbox._id, record._id);
    const stillFits =
      afterInsert.files <= limits.maxFiles &&
      afterInsert.bytes <= limits.maxTotalBytes &&
      (await fitsAfterReserving(ownerId, record._id, quotaBytes));
    if (!stillFits) {
      await SharedFileModel.deleteOne({ _id: record._id });
      throw noRoom('Prostor je medtem zasedla druga oddaja. Poskusi znova.');
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({
      id: String(record._id),
      uploadUrl: `/api/v1/drop/${String(req.params.token)}/files/${String(record._id)}/content`,
      // Vsebina MORA biti natanko tolikšna, kot je napovedano (FR-089) — odjemalec to vrne v
      // glavi `Content-Length` in vsaka druga vrednost je zavrnjena.
      byteSize: record.byteSize,
    });
  } catch (err) {
    next(err);
  }
});

// ── Oddaja, drugi korak: vsebina ─────────────────────────────────────────────────────────

/**
 * POZOR: za to pot NI registriranega razčlenjevalnika telesa in ne sme biti — isti razlog kot pri
 * `PUT /files/{fileId}/content` (router.ts): `express.raw` bi 500 MB zbral v `Buffer`, vsebnik pa
 * ima `mem_limit`. `req` gre naravnost v datoteko (services/upload.service.ts, research.md §4).
 *
 * Ena razlika od lastnikove poti je namerna: tu se PREVERI VRSTA TELESA (domain/body-type.ts).
 * Lastnikov odjemalec je naš in pošlje `application/octet-stream`; pošiljatelj je tujec, telo, ki
 * ga požre `express.json()`, pa bi pomenilo datoteko velikosti 0, telo z mejami obrazca pa
 * pokvarjeno datoteko, ki je videti uspešno oddana.
 */
fileSharingPublicRouter.put('/drop/:token/files/:fileId/content', async (req, res, next) => {
  // Kar se ob napaki POSPRAVI, in nič več od tega.
  //
  // Sprva je bila tu kar `record.storageId`, kar je bilo narobe in je test hkratnih zahtev to tudi
  // pokazal: zahteva, ki zapore ni dobila, je ob svoji zavrnitvi pobrisala začasno datoteko, ki jo
  // je ZMAGOVALKA prav takrat pisala — ta je nato padla s "oddaje ni bilo mogoče dokončati".
  // Pospravlja torej samo tisti, ki je zaporo dobil; kdor je bil zavrnjen prej, na disku ni pustil
  // ničesar in tudi ne sme ničesar odnesti.
  let claimedStorageId: string | null = null;
  let record: PendingUpload | null = null;
  try {
    const inbox = await findOpenInbox(req.params.token);
    if (!inbox) throw unavailable();
    await requireTicket(req, inbox);

    const fileId = String(req.params.fileId);
    // Neveljaven ObjectId bi v Mongoose vrgel CastError, ki se navzven pokaže kot 500; za
    // pošiljatelja je to isti 404 kot vsaka druga neobstoječa oddaja (isti vzorec kot v router.ts).
    if (!Types.ObjectId.isValid(fileId)) throw notFound('Ta oddaja ne obstaja ali je že zaključena.');

    // Poizvedba je omejena na `inboxId` TEGA predala IN na stanje `uploading`. To ni okrasek: brez
    // `inboxId` bi dovolilnica enega predala lahko pisala v zapis drugega (ali v zapis, ki ga je
    // naložil lastnik sam), brez stanja pa bi bilo mogoče prepisati vsebino datoteke, ki je že
    // prispela. Neobstoj, tuji predal in že zaključena oddaja dajo ISTI odgovor — teh treh
    // razlogov pošiljatelj ne sme razlikovati.
    record = await SharedFileModel.findOne({
      _id: fileId,
      inboxId: inbox._id,
      state: 'uploading',
      uploadClaimedAt: null,
    }).lean<PendingUpload | null>();
    if (!record) throw notFound('Ta oddaja ne obstaja ali je že zaključena.');

    if (!isStreamableBody(req.header('content-type'))) {
      throw new ProblemError(
        415,
        'Neustrezna vrsta telesa',
        'Vsebino pošlji kot surovo telo zahteve (application/octet-stream), ne kot obrazec ali JSON.',
      );
    }

    // Prvo od dveh preverjanj meje (FR-088). Drugo je med pisanjem, v upload.service.ts.
    //
    // Meja tu ni `FILE_SHARE_MAX_MB`, ampak NAPOVEDANA velikost: prostor je bil rezerviran zanjo
    // in samo zanjo. Pošiljatelj, ki napove 1 MB in pošlje 400 MB, je s tem ustavljen na prvem
    // kosu nad mejo — ne šele takrat, ko bi ga ujela kvota lastnika (FR-089).
    const declared = checkDeclared(req.header('content-length'), record.byteSize);
    if (declared === 'missing' || declared === 'invalid') {
      throw badRequest('Manjka ali je neveljavna glava Content-Length.');
    }
    if (declared === 'empty') throw badRequest('Datoteka je prazna.');
    if (declared === 'too-large') {
      // Odgovor pride, preden je telo prebrano; `Connection: close` je edini način, da se to
      // konča kolikor mogoče čisto (isti razlog kot v router.ts).
      res.setHeader('Connection', 'close');
      throw new ProblemError(
        413,
        'Vsebina ni takšna, kot je bila napovedana',
        'Vsebina je večja od napovedane velikosti. Začni oddajo znova.',
      );
    }

    // ZAPORA nad napovedjo, in šele nato pisanje.
    //
    // Preverjanja glav zgoraj so brez posledic (zavrnjena zahteva sme biti ponovljena), tu pa se
    // napoved PORABI: `uploadClaimedAt` prevzame natanko ena zahteva, ker je pogoj `null` del
    // iste atomarne operacije. Dve hkratni zahtevi za vsebino iste napovedi bi sicer obe prestali
    // preverjanje stanja (`uploading` se prevesi šele na koncu), obe pisali v isto začasno
    // datoteko in obe videli pričakovano število bajtov — na disku bi ostala prepletena vsebina,
    // zapis pa bi bil videti uspešen (člen VII).
    const claimed = await SharedFileModel.findOneAndUpdate(
      { _id: record._id, state: 'uploading', uploadClaimedAt: null },
      { $set: { uploadClaimedAt: new Date() } },
    ).lean();
    if (!claimed) throw notFound('Ta oddaja ne obstaja ali je že zaključena.');
    claimedStorageId = record.storageId;

    const outcome = await streamToStorage(req, record.storageId, record.byteSize);

    // Vsak neuspeh pomeni, da ne ostane NIČ (FR-096): ne zapis, ne delna vsebina. Pometač je mreža
    // pod tem, ne prvi obrambni pas.
    if (outcome.status !== 'ok') {
      await SharedFileModel.deleteOne({ _id: record._id });
      if (outcome.status === 'aborted') {
        // Pošiljatelj je odšel — odgovora nima kdo prebrati, zato ga ne pišemo.
        req.log?.info({ event: 'fileShare.drop.aborted', inboxId: String(inbox._id) }, 'Oddaja prekinjena');
        return;
      }
      if (outcome.status === 'too-large') {
        throw new ProblemError(
          413,
          'Vsebina ni takšna, kot je bila napovedana',
          'Vsebina je večja od napovedane velikosti. Začni oddajo znova.',
        );
      }
      if (outcome.status === 'empty') throw badRequest('Datoteka je prazna.');
      req.log?.error(
        { event: 'fileShare.drop.failed', err: outcome.error, inboxId: String(inbox._id) },
        'Oddaje v predal ni bilo mogoče dokončati',
      );
      throw serviceUnavailable('Oddaje ni bilo mogoče dokončati. Poskusi znova.');
    }

    // Napovedano MORA biti enako prispelemu (FR-089). Manj bajtov od napovedanih pomeni telo, ki
    // se je končalo prezgodaj: Node tako zahtevo praviloma podre že prej, a tiho shranjena
    // okrnjena datoteka je natanko napaka, ki jo člen VII prepoveduje — zato izrecno.
    if (outcome.byteSize !== record.byteSize) {
      await removeBlob(record.storageId);
      await SharedFileModel.deleteOne({ _id: record._id });
      throw badRequest('Prispelo je manj vsebine, kot je bilo napovedano. Začni oddajo znova.');
    }

    // Kvote in prostora predala tu NE preverjamo znova, in to ni izpuščeno: rezervacija je bila
    // narejena z napovedano velikostjo, dejanska pa je enaka njej (vrstica zgoraj). Vsaka pot do
    // novega zapisa — lastnikova in ta — prostor rezervira ob napovedi, zato je stanje že
    // razsojeno; drugo preverjanje bi lahko samo zavrnilo nekaj, kar je pravilno prispelo.
    //
    // KAR PA se je medtem lahko spremenilo, je predal: lastnik ga je zaprl ali izbrisal, ali pa
    // mu je potekel rok. Zaprtje mora učinkovati na oddajo, ki TEČE (FR-083, isto pravilo kot
    // preklic povezave pri prevzemu) — sicer bi bilo zaprtje samo obljuba za naslednjič. Zapis
    // pred tem trenutkom ni bil nikoli na lastnikovem seznamu, zato to ni izguba prejetega
    // (FR-094), ampak zavrnitev oddaje, ki se ni dokončala pravočasno.
    if (!(await findOpenInbox(req.params.token))) {
      await removeBlob(record.storageId);
      await SharedFileModel.deleteOne({ _id: record._id });
      throw unavailable();
    }

    await SharedFileModel.updateOne({ _id: record._id }, { $set: { state: 'ready' } });

    const limits = inboxLimitsOf(inbox);
    const usage = await inboxUsage(inbox._id);

    req.log?.info(
      {
        event: 'fileShare.drop.received',
        inboxId: String(inbox._id),
        fileId: String(record._id),
        byteSize: outcome.byteSize,
        ip: req.ip,
      },
      'Prejeta datoteka prek sprejemnega predala',
    );

    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({
      // Potrdilo pošiljatelju: kaj je prispelo in koliko prostora je še. Ničesar, kar ne bi bilo
      // znano že prej — oddaja ne sme postati način za branje predala.
      fileName: record.displayName,
      byteSize: outcome.byteSize,
      remainingFiles: remainingFiles(usage, limits),
      remainingBytes: remainingBytes(usage, limits),
    });
  } catch (err) {
    if (claimedStorageId) await discardTemp(claimedStorageId).catch(() => undefined);
    next(err);
  }
});
