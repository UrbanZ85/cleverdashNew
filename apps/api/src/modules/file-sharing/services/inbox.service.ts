import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { SharedFileModel } from '../models/shared-file.model.js';
import { FileInboxTicketModel } from '../models/file-inbox-ticket.model.js';
import type { InboxLimits, InboxUsage } from '../domain/inbox-capacity.js';

// Poizvedbeni del sprejemnega predala (009b). Presoje same so čiste funkcije v
// `domain/inbox-capacity.ts` in `domain/inbox-lifecycle.ts` (člen IX).

/**
 * Koliko NEDOKONČANIH oddaj sme viseti na enem predalu hkrati.
 *
 * Brez te meje ima kdor koli s kodo brezplačen način, da predal napolni, ne da bi poslal en sam
 * bajt: napoved (`POST /drop/{token}/files`) prostor REZERVIRA, in dokler pometač obtičalih
 * nalaganj ne pride na vrsto (`FILE_SHARE_UPLOAD_TIMEOUT_MINUTES`, privzeto 6 ur), je predal za
 * vse ostale poln. Meja je namenoma nizka: zakonit pošiljatelj pošilja po vrsti, brskalnik pa
 * ima vedno največ eno oddajo v teku.
 */
export const MAX_PENDING_UPLOADS = 5;

const TICKET_BYTES = 32;
const TICKET_LENGTH = 43; // 32 bajtov v base64url

export interface InboxReceived extends InboxUsage {
  /** Kdaj je prispela zadnja datoteka. `null`, dokler ni prispela nobena. */
  lastAt: Date | null;
}

export function inboxLimitsOf(inbox: { maxFiles: number; maxTotalBytes: number }): InboxLimits {
  return { maxFiles: inbox.maxFiles, maxTotalBytes: inbox.maxTotalBytes };
}

async function aggregateInbox(match: Record<string, unknown>): Promise<InboxReceived> {
  const [row] = await SharedFileModel.aggregate<{ files: number; bytes: number; lastAt: Date | null }>([
    { $match: match },
    { $group: { _id: null, files: { $sum: 1 }, bytes: { $sum: '$byteSize' }, lastAt: { $max: '$createdAt' } } },
  ]);
  return { files: row?.files ?? 0, bytes: row?.bytes ?? 0, lastAt: row?.lastAt ?? null };
}

/**
 * Zasedenost predala za PRESOJO O SPREJEMU — všteti so tudi zapisi v stanju `uploading`.
 *
 * To ni netočnost, ampak namen: napoved prostor rezervira, zato ga naslednja napoved vidi, še
 * preden je vsebina prispela. Brez tega bi dve hkratni oddaji obe videli prazen predal.
 *
 * `upTo` omeji seštevek na zapise do danega `_id` (in nanj) — razsodba med vzporednima
 * napovedma, po istem vzorcu kot `quota.service.ts`.
 */
export async function inboxUsage(inboxId: unknown, upTo?: unknown): Promise<InboxUsage> {
  const match: Record<string, unknown> = { inboxId: new Types.ObjectId(String(inboxId)) };
  if (upTo !== undefined) match._id = { $lte: upTo };
  const { files, bytes } = await aggregateInbox(match);
  return { files, bytes };
}

/**
 * Kaj je predal DEJANSKO prejel — brez nedokončanih oddaj.
 *
 * Ločeno od `inboxUsage` zato, ker gre za dve različni vprašanji. Za presojo o sprejemu je
 * rezervacija zasedena; za lastnika na zaslonu pa je "prejeto: 3" pri dveh prispelih datotekah
 * napačen podatek, ki ga ne more preveriti.
 */
export async function inboxReceived(inboxId: unknown): Promise<InboxReceived> {
  return aggregateInbox({ inboxId: new Types.ObjectId(String(inboxId)), state: { $ne: 'uploading' } });
}

/**
 * Prejeto po VSEH predalih danega lastnika, v enem prehodu.
 *
 * Seznam predalov bi sicer pomenil eno agregacijo na predal — vzorec "N+1", ki pri desetih
 * predalih naredi enajst poizvedb za en zaslon. Ključ zemljevida je `inboxId` kot niz.
 */
export async function receivedGroupedFor(userId: string): Promise<Map<string, InboxReceived>> {
  const rows = await SharedFileModel.aggregate<{
    _id: unknown;
    files: number;
    bytes: number;
    lastAt: Date | null;
  }>([
    {
      $match: {
        userId: new Types.ObjectId(userId),
        inboxId: { $ne: null },
        state: { $ne: 'uploading' },
      },
    },
    { $group: { _id: '$inboxId', files: { $sum: 1 }, bytes: { $sum: '$byteSize' }, lastAt: { $max: '$createdAt' } } },
  ]);
  return new Map(
    rows.map((row) => [String(row._id), { files: row.files, bytes: row.bytes, lastAt: row.lastAt ?? null }]),
  );
}

export async function pendingUploads(inboxId: unknown): Promise<number> {
  return SharedFileModel.countDocuments({ inboxId: new Types.ObjectId(String(inboxId)), state: 'uploading' });
}

// ── Dovolilnice za oddajo ─────────────────────────────────────────────────────────────────

export async function issueTicket(inboxId: unknown, minutes: number): Promise<{ ticket: string; expiresAt: Date }> {
  const ticket = randomBytes(TICKET_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
  await FileInboxTicketModel.create({ inboxId, ticket, expiresAt });
  return { ticket, expiresAt };
}

/** Oblikovno preverjanje PRED poizvedbo: glava, ki je videti kot smet, ne sme postati poizvedba
 * v bazo. Javna pot, ki jo kdor koli lahko kliče v zanki, je edino mesto, kjer to šteje. */
function isTicketShaped(value: unknown): value is string {
  return typeof value === 'string' && new RegExp(`^[A-Za-z0-9_-]{${TICKET_LENGTH}}$`).test(value);
}

/**
 * Ali glava nosi dovolilnico, ki velja za TA predal.
 *
 * Veljavnost se preveri V POIZVEDBI, ne prek TTL indeksa: TTL monitor teče na ~60 s in zamika ne
 * obljublja — dovolilnica bi bila sicer lahko minuto predolgo veljavna (research.md §13).
 *
 * Vezanost na `inboxId` je bistvena: dovolilnica enega predala ne sme odpreti drugega, tudi če
 * oba pripadata istemu lastniku (isti razlog kot FR-016 pri geslu za prevzem).
 */
export async function ticketIsValid(inboxId: unknown, raw: unknown): Promise<boolean> {
  if (!isTicketShaped(raw)) return false;
  const found = await FileInboxTicketModel.findOne({
    ticket: raw,
    inboxId,
    expiresAt: { $gt: new Date() },
  }).lean();
  return found !== null;
}

/** Zaprtje predala in izdaja nove kode razveljavita VSE izdane dovolilnice (FR-083) — sicer bi
 * pošiljatelj, ki je kodo vpisal pred tem, še eno uro lahko oddajal. */
export async function revokeTickets(inboxId: unknown): Promise<void> {
  await FileInboxTicketModel.deleteMany({ inboxId });
}
