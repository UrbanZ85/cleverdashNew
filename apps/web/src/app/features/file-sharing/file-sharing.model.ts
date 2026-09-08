// Čist podatkovni model in logika modula "Deljenje datotek" — BREZ uvozov iz @angular/*, da je
// preverljiva z enotnimi testi brez TestBed-a (isti vzorec kot features/notes/notes.model.ts).
//
// Člen I: ta mapa je last modula. Nič od tod se ne uvaža v druge funkcionalnosti in nič se ne
// uvaža od tam — odstranitev zavihka je brisanje te mape.

/** Shranjena stanja iz pogodbe. "Poteklo" NI med njimi: strežnik ga izpelje iz roka in pošlje
 * kot ločeno polje `expired` (specs/009-file-sharing/data-model.md). */
export type ShareState = 'uploading' | 'ready' | 'revoked' | 'broken';

/** 009b: ali je datoteko naložil lastnik sam (`owner`) ali je prispela prek sprejemnega
 * predala (`inbox`). Strežnik to IZPELJE iz `inboxId`. */
export type FileOrigin = 'owner' | 'inbox';

export interface SharedFile {
  id: string;
  displayName: string;
  mimeType: string;
  byteSize: number;
  state: ShareState;
  expired: boolean;
  shareUrl: string | null;
  expiresAt: string | null;
  downloadCount: number;
  lastDownloadedAt: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  origin: FileOrigin;
  /** Predal, po katerem je datoteka prišla. Ostane tudi, ko predala ni več (FR-094). */
  inboxId: string | null;
  /** Kar je o sebi napisal pošiljatelj — NAVEDBA, ne ugotovljena istovetnost. */
  senderName: string | null;
}

export interface Quota {
  usedBytes: number;
  limitBytes: number;
}

export interface FilesListResponse {
  files: SharedFile[];
  quota: Quota;
}

export interface CreatedFile {
  id: string;
  uploadUrl: string;
  maxBytes: number;
}

/** Odgovor, ki EDINI vsebuje geslo v čistopisu — ob nalaganju in ob izdaji novega gesla. */
export interface UploadResult {
  file: SharedFile;
  shareUrl: string;
  password: string;
}

/** Kar sme videti prejemnik, preden vpiše geslo: velikost in rok. Imena datoteke NI (FR-022). */
export interface PublicShareInfo {
  byteSize: number;
  expiresAt: string | null;
}

export interface UnlockResult {
  fileName: string;
  byteSize: number;
  mimeType: string;
  downloadUrl: string;
  grantExpiresAt: string;
}

/** Izbire roka iz pogodbe. `null` je BREZ ROKA in ni isto kot "nisem izbral". */
export type ExpiryChoice = 1 | 7 | 30 | null;

export const EXPIRY_OPTIONS: ReadonlyArray<{ value: ExpiryChoice; label: string }> = [
  { value: 1, label: '1 dan' },
  { value: 7, label: '7 dni' },
  { value: 30, label: '30 dni' },
  { value: null, label: 'Brez roka' },
];

/** Lastna izvedba in ne uvoz iz `features/notes` — člen I prepoveduje uvoz med
 * funkcionalnostmi. Pet vrstic z lastnimi testi je cenejše od skupnega paketa zanje. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Kaj o datoteki piše na seznamu.
 *
 * Vrstni red pogojev ni poljuben: pokvarjeno je pomembnejše od preklicanega, preklicano od
 * poteklega. Uporabnik, ki je povezavo preklical IN ji je medtem potekel rok, mora videti, da
 * jo je preklical — to je njegovo dejanje, ne posledica časa.
 */
export function describeState(file: Pick<SharedFile, 'state' | 'expired'>): string {
  if (file.state === 'broken') return 'Pokvarjeno — vsebine ni na disku';
  if (file.state === 'uploading') return 'Se nalaga';
  if (file.state === 'revoked') return 'Preklicano';
  if (file.expired) return 'Poteklo';
  return 'Na voljo';
}

export function isShareable(file: Pick<SharedFile, 'state' | 'expired'>): boolean {
  return file.state === 'ready' && !file.expired;
}

/** Rok za prikaz. `null` je izrecno označen — pozabljene povezave brez roka so razlog, da rok
 * sploh obstaja (spec.md, US4 scenarij 3). */
export function describeExpiry(expiresAt: string | null, now: Date = new Date()): string {
  if (expiresAt === null) return 'Brez roka';
  const target = new Date(expiresAt);
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return 'Poteklo';
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days >= 1) return `Še ${days} ${days === 1 ? 'dan' : days === 2 ? 'dneva' : days < 5 ? 'dni' : 'dni'}`;
  const hours = Math.max(1, Math.floor(diffMs / (60 * 60 * 1000)));
  return `Še ${hours} ${hours === 1 ? 'uro' : hours === 2 ? 'uri' : hours < 5 ? 'ure' : 'ur'}`;
}

/** Ali je smiselno opozoriti lastnika, da nekdo ugiba geslo (FR-033). */
export function hasGuessingWarning(file: Pick<SharedFile, 'failedAttempts' | 'lockedUntil'>, now = new Date()): boolean {
  if (file.failedAttempts > 0) return true;
  return file.lockedUntil !== null && new Date(file.lockedUntil).getTime() > now.getTime();
}

export function describeQuota(quota: Quota): string {
  return `${formatBytes(quota.usedBytes)} od ${formatBytes(quota.limitBytes)}`;
}

/** Odstotek zasedenosti za prikaz — omejen na [0, 1], da znižana kvota ne izriše črte čez rob. */
export function quotaRatio(quota: Quota): number {
  if (quota.limitBytes <= 0) return 1;
  return Math.min(1, Math.max(0, quota.usedBytes / quota.limitBytes));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  009b — SPREJEMNI PREDALI (obrnjena smer: naslov in koda, po katerih nam nekdo odda datoteko)
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Shranjeni stanji predala. "Poteklo" NI med njima — strežnik ga izpelje in pošlje kot
 * `expired`, enako kot pri datoteki. */
export type InboxState = 'open' | 'closed';

export interface FileInbox {
  id: string;
  label: string;
  note: string;
  state: InboxState;
  expired: boolean;
  /** IZPELJANO na strežniku: odprt IN rok še ni minil. Prostor v tem ni upoštevan. */
  openForUpload: boolean;
  dropUrl: string | null;
  expiresAt: string | null;
  maxFiles: number;
  maxTotalBytes: number;
  receivedFiles: number;
  receivedBytes: number;
  lastReceivedAt: string | null;
  remainingFiles: number;
  remainingBytes: number;
  failedAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
}

/** Stropi NAMESTITVE (ne predala): iz njih sestavimo izbire, da vmesnik ne ponudi vrednosti,
 * ki jo bo strežnik zavrnil. */
export interface InboxLimits {
  maxFiles: number;
  maxTotalBytes: number;
  maxFileBytes: number;
}

export interface InboxesResponse {
  inboxes: FileInbox[];
  limits: InboxLimits;
}

/** Odgovor, ki EDINI vsebuje kodo v čistopisu — ob nastanku predala in ob izdaji nove kode. */
export interface CreatedInbox {
  inbox: FileInbox;
  dropUrl: string;
  code: string;
}

export interface CreateInboxInput {
  label: string;
  note?: string;
  expiresInDays?: ExpiryChoice;
  maxFiles?: number;
  maxTotalMb?: number;
}

/** Kar sme videti nekdo, ki ima zgolj naslov predala. Oznake NI (FR-084). */
export interface DropInfo {
  maxFileBytes: number;
  expiresAt: string | null;
}

/** Kar pošiljatelj dobi po pravilno vpisani kodi. `ticket` živi samo v pomnilniku zavihka:
 * v piškotek ne gre, ker bi ga brskalnik pripenjal sam tudi zahtevam s tujih strani (FR-091). */
export interface DropSession {
  label: string;
  note: string;
  ticket: string;
  ticketExpiresAt: string;
  maxFileBytes: number;
  remainingFiles: number;
  remainingBytes: number;
}

/** Prvi korak oddaje: prostor je rezerviran in `byteSize` je od zdaj zavezujoč (FR-089). */
export interface DeclaredUpload {
  id: string;
  uploadUrl: string;
  byteSize: number;
}

export interface DropReceipt {
  fileName: string;
  byteSize: number;
  remainingFiles: number;
  remainingBytes: number;
}

/** Ali je datoteka PRIŠLA k nam (prek predala) ali smo jo naložili sami. */
export function isReceived(file: Pick<SharedFile, 'origin'>): boolean {
  return file.origin === 'inbox';
}

/**
 * Od kod je datoteka, za vrstico na seznamu.
 *
 * Navedba pošiljatelja je NJEGOV vnos in ne ugotovljena istovetnost, zato je predstavljena kot
 * navedba ("oddal: Janez") in ne kot dejstvo o osebi.
 */
export function describeSource(file: Pick<SharedFile, 'origin' | 'senderName'>): string | null {
  if (file.origin !== 'inbox') return null;
  return file.senderName ? `Prejeto — oddal: ${file.senderName}` : 'Prejeto prek povezave za oddajo';
}

/**
 * Kaj o predalu piše na seznamu.
 *
 * Vrstni red pogojev ni poljuben, po istem pravilu kot `describeState`: lastnikovo dejanje
 * (zaprtje) je pomembnejše od posledice časa (potek), oboje pa od tega, da je predal poln —
 * polnega je mogoče spraviti v rabo z brisanjem, zaprtega ne.
 */
export function describeInboxState(inbox: Pick<FileInbox, 'state' | 'expired' | 'remainingFiles' | 'remainingBytes'>): string {
  if (inbox.state === 'closed') return 'Zaprt';
  if (inbox.expired) return 'Poteklo';
  if (inbox.remainingFiles === 0 || inbox.remainingBytes === 0) return 'Poln';
  return 'Sprejema';
}

/** Ali predal še sprejema — stanje, rok IN prostor. `openForUpload` s strežnika prostora ne
 * upošteva, ker je to druga vrsta meje; za gumb v vmesniku šteje oboje. */
export function acceptsUploads(
  inbox: Pick<FileInbox, 'openForUpload' | 'remainingFiles' | 'remainingBytes'>,
): boolean {
  return inbox.openForUpload && inbox.remainingFiles > 0 && inbox.remainingBytes > 0;
}

export function describeInboxCapacity(inbox: Pick<FileInbox, 'receivedFiles' | 'maxFiles' | 'receivedBytes' | 'maxTotalBytes'>): string {
  return `${inbox.receivedFiles} od ${inbox.maxFiles} datotek · ${formatBytes(inbox.receivedBytes)} od ${formatBytes(inbox.maxTotalBytes)}`;
}

/** Koliko sme pošiljatelj še oddati — besedilo za javno stran. */
export function describeDropCapacity(session: Pick<DropSession, 'remainingFiles' | 'remainingBytes'>): string {
  if (session.remainingFiles === 0 || session.remainingBytes === 0) return 'Predal je poln.';
  const datotek = session.remainingFiles === 1 ? '1 datoteko' : `${session.remainingFiles} datotek`;
  return `Oddaš lahko še ${datotek}, skupaj do ${formatBytes(session.remainingBytes)}.`;
}

/**
 * Kdaj je predal nazadnje kaj prejel.
 *
 * `sl-SI` in izrecna cona `Europe/Ljubljana`, ne Angularjev `DatePipe` — enak dogovor kot v
 * `todos.model.ts` in `time-tracking-section.component.ts`, in člen V.4: čas je vedno ljubljanski
 * in nikoli ne prepuščen coni naprave.
 */
export function describeReceivedAt(iso: string | null): string {
  if (!iso) return 'Še nič oddanega.';
  const moment = new Date(iso).toLocaleString('sl-SI', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Ljubljana',
  });
  return `Zadnja oddaja: ${moment}`;
}

/** Ali je smiselno opozoriti lastnika, da nekdo ugiba kodo (FR-090). Isto pravilo kot pri
 * povezavi za prevzem — zato ista oblika vprašanja, le drug zapis. */
export function inboxHasGuessingWarning(
  inbox: Pick<FileInbox, 'failedAttempts' | 'lockedUntil'>,
  now = new Date(),
): boolean {
  if (inbox.failedAttempts > 0) return true;
  return inbox.lockedUntil !== null && new Date(inbox.lockedUntil).getTime() > now.getTime();
}

/** Izbire za "največ datotek", omejene s stropom namestitve. Vrednosti nad stropom se ne
 * ponudijo — izbira, ki jo bo strežnik zavrnil, ni izbira. Strop je vedno med izbirami, tudi
 * kadar ni v predlogah. */
export function fileCountChoices(limits: Pick<InboxLimits, 'maxFiles'>): number[] {
  const presets = [1, 3, 5, 10, 25].filter((n) => n <= limits.maxFiles);
  return presets.includes(limits.maxFiles) ? presets : [...presets, limits.maxFiles].sort((a, b) => a - b);
}

/** Isto za "skupaj največ", v MB. */
export function totalMbChoices(limits: Pick<InboxLimits, 'maxTotalBytes'>): number[] {
  const ceilingMb = Math.floor(limits.maxTotalBytes / (1024 * 1024));
  const presets = [50, 100, 500, 1000, 2000].filter((n) => n <= ceilingMb);
  return presets.includes(ceilingMb) ? presets : [...presets, ceilingMb].sort((a, b) => a - b);
}
