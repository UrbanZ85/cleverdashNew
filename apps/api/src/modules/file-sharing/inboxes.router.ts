import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { loadEnv } from '../../platform/config/env.js';
import { requireScopes } from '../../platform/auth/scopes.js';
import { badRequest, notFound, ProblemError } from '../../platform/errors/problem.js';
import { FILE_SHARE_SCOPES } from './scopes.js';
import { resolveOwnerUserId } from './owner.js';
import { FileInboxModel } from './models/file-inbox.model.js';
import { canTransition, isOpenForUpload, type InboxState } from './domain/inbox-lifecycle.js';
import { computeExpiresAt, isExpired } from './domain/share-lifecycle.js';
import { remainingBytes, remainingFiles } from './domain/inbox-capacity.js';
import { formatForDisplay, generatePassword, hashPassword } from './domain/share-password.js';
import { buildDropUrl, generateShareToken } from './domain/share-token.js';
import { inboxReceived, inboxLimitsOf, receivedGroupedFor, revokeTickets } from './services/inbox.service.js';
import { resetInbox } from './services/throttle.service.js';

// Endpointi LASTNIKA pod /api/v1/inboxes* (009b) — sprejemni predali, obrnjena smer deljenja:
// lastnik pošlje naslov in kodo, nekdo brez računa mu po njiju odda datoteko.
//
// Vsaka pot v tej datoteki kliče `requireScopes`. Javna, neavtenticirana polovica te
// funkcionalnosti je v `public.router.ts`, skupaj z javnimi potmi za prevzem — javnost mora biti
// razvidna iz imena datoteke in ne iz odsotnosti enega klica sredi tristo vrstic (research.md §2).
//
// Zavestno LOČEN usmerjevalnik od `router.ts` in ne nove poti pod `/files`: predal ni datoteka.
// Pod `/files/{fileId}` bi se `/files/inboxes` ujel kot identifikator datoteke, in pravilnost bi
// bila odvisna od vrstnega reda registracije — kar je natanko tista vrsta odvisnosti, ki se pri
// naslednjem dodajanju poti tiho podre. Prejete datoteke ostanejo pod `/files`, ker so od
// trenutka prejema navadne lastnikove datoteke (FR-092).
export const fileInboxesRouter = Router();

const MB = 1024 * 1024;

const createInboxSchema = z.object({
  label: z.string().min(1).max(80),
  note: z.string().max(500).optional(),
  // Ista trojica kot pri deljenju: `undefined` (izpuščeno) = privzetek namestitve, izrecni `null`
  // = BREZ ROKA (domain/share-lifecycle.ts).
  expiresInDays: z.union([z.literal(1), z.literal(7), z.literal(30), z.null()]).optional(),
  // Meji predala izbere lastnik (FR-087). Izpuščeno pomeni strop namestitve.
  maxFiles: z.number().int().positive().optional(),
  maxTotalMb: z.number().int().positive().optional(),
});

interface InboxLean {
  _id: unknown;
  label: string;
  note: string;
  token: string | null;
  state: InboxState;
  expiresAt: Date | null;
  maxFiles: number;
  maxTotalBytes: number;
  failedAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
}

interface ReceivedSummary {
  files: number;
  bytes: number;
  lastAt: Date | null;
}

const NOTHING_RECEIVED: ReceivedSummary = { files: 0, bytes: 0, lastAt: null };

/**
 * Predal, kakor ga vidi lastnik.
 *
 * KODE TU NI in je ni nikjer razen v odgovoru, ki jo je ustvaril (FR-082) — enako kot geslo za
 * prevzem. `expired` in `openForUpload` sta IZPELJANA iz časa in stanja, ne shranjena
 * (domain/inbox-lifecycle.ts).
 */
function toInboxResponse(doc: InboxLean, received: ReceivedSummary, now = new Date()) {
  const limits = inboxLimitsOf(doc);
  return {
    id: String(doc._id),
    label: doc.label,
    note: doc.note ?? '',
    state: doc.state,
    expired: isExpired(doc.expiresAt, now),
    openForUpload: isOpenForUpload({ state: doc.state, expiresAt: doc.expiresAt ?? null }, now),
    dropUrl: doc.token ? buildDropUrl(loadEnv().PUBLIC_BASE_URL, doc.token) : null,
    expiresAt: doc.expiresAt ?? null,
    maxFiles: doc.maxFiles,
    maxTotalBytes: doc.maxTotalBytes,
    // Kaj je predal DEJANSKO prejel — brez nedokončanih oddaj (services/inbox.service.ts).
    receivedFiles: received.files,
    receivedBytes: received.bytes,
    lastReceivedAt: received.lastAt,
    remainingFiles: remainingFiles({ files: received.files, bytes: received.bytes }, limits),
    remainingBytes: remainingBytes({ files: received.files, bytes: received.bytes }, limits),
    // Lastnik MORA videti, da nekdo ugiba kodo (FR-090) — v odgovoru API-ja, ne le v dnevniku.
    failedAttempts: doc.failedAttempts,
    lockedUntil: doc.lockedUntil ?? null,
    createdAt: doc.createdAt,
  };
}

function requireObjectId(value: string): string {
  if (!Types.ObjectId.isValid(value)) throw notFound('Predal ne obstaja.');
  return value;
}

/** Predal TEGA uporabnika ali 404 — nikoli 403: obstoj tujega predala ni podatek (FR-053). */
async function findOwnInbox(inboxId: string, userId: string) {
  const inbox = await FileInboxModel.findOne({ _id: requireObjectId(inboxId), userId });
  if (!inbox) throw notFound('Predal ne obstaja.');
  return inbox;
}

/**
 * Meji predala iz lastnikove izbire, omejeni s stropom namestitve.
 *
 * Presežen strop je 400 in ne tiho znižanje: lastnik, ki je predal naredil za 2 GB in dobil 1 GB,
 * bi mislil, da ima prostora dvakrat več, kot ga ima — in to bi izvedel takrat, ko bi bila oddaja
 * zavrnjena nekomu drugemu.
 */
function resolveLimits(input: { maxFiles?: number; maxTotalMb?: number }): { maxFiles: number; maxTotalBytes: number } {
  const env = loadEnv();
  if (input.maxFiles !== undefined && input.maxFiles > env.FILE_SHARE_INBOX_MAX_FILES) {
    throw badRequest(`Največ datotek na predal je ${env.FILE_SHARE_INBOX_MAX_FILES}.`);
  }
  if (input.maxTotalMb !== undefined && input.maxTotalMb > env.FILE_SHARE_INBOX_MAX_MB) {
    throw badRequest(`Največ skupaj na predal je ${env.FILE_SHARE_INBOX_MAX_MB} MB.`);
  }
  return {
    maxFiles: input.maxFiles ?? env.FILE_SHARE_INBOX_MAX_FILES,
    maxTotalBytes: (input.maxTotalMb ?? env.FILE_SHARE_INBOX_MAX_MB) * MB,
  };
}

/** Nova koda IN nov naslov, z razveljavitvijo vsega, kar je viselo na starem (FR-083). */
async function issueNewCode(inbox: { _id: unknown; set: (v: Record<string, unknown>) => void; save: () => Promise<unknown> }) {
  const code = generatePassword();
  inbox.set({
    state: 'open',
    token: generateShareToken(),
    codeHash: await hashPassword(code),
    failedAttempts: 0,
    lockedUntil: null,
  });
  await inbox.save();
  await revokeTickets(inbox._id);
  await resetInbox(String(inbox._id));
  return code;
}

// ── Seznam in podrobnosti ────────────────────────────────────────────────────────────────

fileInboxesRouter.get('/inboxes', requireScopes(FILE_SHARE_SCOPES.read), async (req, res, next) => {
  try {
    const userId = await resolveOwnerUserId(req);
    const env = loadEnv();
    const [inboxes, received] = await Promise.all([
      FileInboxModel.find({ userId }).sort({ createdAt: -1 }).lean<InboxLean[]>(),
      receivedGroupedFor(userId),
    ]);
    const now = new Date();
    res.json({
      inboxes: inboxes.map((inbox) => toInboxResponse(inbox, received.get(String(inbox._id)) ?? NOTHING_RECEIVED, now)),
      // Stropi namestitve — da jih vmesnik ne ugiba in ne ponudi izbire, ki bo zavrnjena
      // (isti namen kot `maxBytes` v odgovoru na `POST /files`).
      limits: {
        maxFiles: env.FILE_SHARE_INBOX_MAX_FILES,
        maxTotalBytes: env.FILE_SHARE_INBOX_MAX_MB * MB,
        maxFileBytes: env.FILE_SHARE_MAX_MB * MB,
      },
    });
  } catch (err) {
    next(err);
  }
});

fileInboxesRouter.get('/inboxes/:inboxId', requireScopes(FILE_SHARE_SCOPES.read), async (req, res, next) => {
  try {
    const inbox = await findOwnInbox(String(req.params.inboxId), await resolveOwnerUserId(req));
    const received = await inboxReceived(inbox._id);
    res.json(toInboxResponse(inbox.toObject() as unknown as InboxLean, received));
  } catch (err) {
    next(err);
  }
});

// ── Nastanek ─────────────────────────────────────────────────────────────────────────────

// `Idempotency-Key` ta pot in `POST /inboxes/{id}/code` NE upoštevata
// (platform/idempotency/middleware.ts): njuna odgovora sta edina mesta, kjer se koda pojavi v
// čistopisu, shranjen odgovor pa je zapis v bazi. Ponovljen klic zato naredi DRUG predal — kar je
// namerno: odvečen predal je viden in ga je mogoče izbrisati, shranjena koda pa je skrivnost, ki
// 24 ur leži v zbirki `idempotencyKeys`.
fileInboxesRouter.post('/inboxes', requireScopes(FILE_SHARE_SCOPES.write), async (req, res, next) => {
  try {
    const input = createInboxSchema.parse(req.body);
    const env = loadEnv();
    const userId = await resolveOwnerUserId(req);
    const limits = resolveLimits(input);

    const code = generatePassword();
    const inbox = await FileInboxModel.create({
      userId,
      label: input.label.trim(),
      note: input.note?.trim() ?? '',
      token: generateShareToken(),
      codeHash: await hashPassword(code),
      state: 'open',
      expiresAt: computeExpiresAt(input.expiresInDays, new Date(), env.FILE_SHARE_DEFAULT_EXPIRY_DAYS),
      maxFiles: limits.maxFiles,
      maxTotalBytes: limits.maxTotalBytes,
    });

    res.status(201).json({
      inbox: toInboxResponse(inbox.toObject() as unknown as InboxLean, NOTHING_RECEIVED),
      dropUrl: buildDropUrl(env.PUBLIC_BASE_URL, inbox.token!),
      // EDINO mesto v pogodbi, kjer se pojavi koda v čistopisu — poleg izdaje nove (FR-082).
      code: formatForDisplay(code),
    });
  } catch (err) {
    next(err);
  }
});

// ── Zaprtje, nova koda, brisanje ─────────────────────────────────────────────────────────

fileInboxesRouter.post('/inboxes/:inboxId/close', requireScopes(FILE_SHARE_SCOPES.write), async (req, res, next) => {
  try {
    const inbox = await findOwnInbox(String(req.params.inboxId), await resolveOwnerUserId(req));
    if (!canTransition(inbox.state as InboxState, 'closed')) {
      throw new ProblemError(409, 'Zaprtje ni mogoče', 'Ta predal je že zaprt.');
    }

    inbox.set({ state: 'closed' });
    await inbox.save();
    // Zaprtje razveljavi tudi ŽE IZDANE dovolilnice (FR-083) — sicer bi pošiljatelj, ki je kodo
    // vpisal pred zaprtjem, še eno uro lahko oddajal.
    await revokeTickets(inbox._id);

    const received = await inboxReceived(inbox._id);
    res.json(toInboxResponse(inbox.toObject() as unknown as InboxLean, received));
  } catch (err) {
    next(err);
  }
});

fileInboxesRouter.post('/inboxes/:inboxId/code', requireScopes(FILE_SHARE_SCOPES.write), async (req, res, next) => {
  try {
    const inbox = await findOwnInbox(String(req.params.inboxId), await resolveOwnerUserId(req));

    // NOVA koda in NOV naslov (FR-083, isti razlog kot research.md §12 pri geslu): namen je
    // odvzeti oddajo tistemu, ki ima staro kodo. Če bi naslov ostal isti, bi mu polovica ključa
    // ostala v rokah. Zaprt ali potekel predal to tudi vrne v obtok — zato ni ločene operacije
    // "odpri znova", ki bi stari kodi podaljšala življenje.
    const code = await issueNewCode(inbox);

    const received = await inboxReceived(inbox._id);
    res.json({
      inbox: toInboxResponse(inbox.toObject() as unknown as InboxLean, received),
      dropUrl: buildDropUrl(loadEnv().PUBLIC_BASE_URL, inbox.token!),
      code: formatForDisplay(code),
    });
  } catch (err) {
    next(err);
  }
});

fileInboxesRouter.delete('/inboxes/:inboxId', requireScopes(FILE_SHARE_SCOPES.write), async (req, res, next) => {
  try {
    const inbox = await findOwnInbox(String(req.params.inboxId), await resolveOwnerUserId(req));

    // PREJETE DATOTEKE OSTANEJO (FR-094). Predal je bil pot, po kateri so prišle, in ne njihov
    // imetnik: brisanje poti ne sme pobrisati tega, kar je po njej prispelo. Na zapisih ostane
    // `inboxId`, ki kaže na predal, ki ga ni več — namenoma, ker pove, kako je datoteka prišla,
    // in to se z izbrisom predala ni spremenilo. Kdor hoče datoteke stran, jih izbriše pod
    // `/files`, kjer je brisanje vsebine z diska izrecno dejanje.
    await revokeTickets(inbox._id);
    await resetInbox(String(inbox._id));
    await FileInboxModel.deleteOne({ _id: inbox._id });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
