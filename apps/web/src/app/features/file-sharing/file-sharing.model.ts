// Čist podatkovni model in logika modula "Deljenje datotek" — BREZ uvozov iz @angular/*, da je
// preverljiva z enotnimi testi brez TestBed-a (isti vzorec kot features/notes/notes.model.ts).
//
// Člen I: ta mapa je last modula. Nič od tod se ne uvaža v druge funkcionalnosti in nič se ne
// uvaža od tam — odstranitev zavihka je brisanje te mape.

/** Shranjena stanja iz pogodbe. "Poteklo" NI med njimi: strežnik ga izpelje iz roka in pošlje
 * kot ločeno polje `expired` (specs/009-file-sharing/data-model.md). */
export type ShareState = 'uploading' | 'ready' | 'revoked' | 'broken';

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
