// Tipi po pogodbi (specs/014-admin-analytics/contracts/openapi.yaml) in čiste funkcije za prikaz.
//
// Funkcije so tu in ne v komponentah, ker so edini del tega zaslona, ki ga je smiselno testirati
// brez brskalnika (člen IX) — in ker se oblikovanje bajtov pojavi na treh mestih hkrati.

export interface StorageSource {
  id: string;
  label: string;
  present: boolean;
  totalBytes: number;
  recordCount: number;
}

export interface StorageUserRow {
  userId: string | null;
  displayName: string;
  maskedEmail: string | null;
  totalBytes: number;
  perSource: Record<string, number>;
  counts: Record<string, number>;
}

export interface VolumeStats {
  path: string;
  totalBytes: number;
  freeBytes: number;
}

export type FindingKind = 'missing-content' | 'orphan-blob' | 'broken-record' | 'stalled-upload';

export interface IntegrityFinding {
  kind: FindingKind;
  recordCount: number;
  bytes: number;
}

export interface IntegrityReport {
  checkedAt: string;
  clean: boolean;
  findings: IntegrityFinding[];
}

export interface StorageSnapshot {
  computedAt: string;
  cachedUntil: string;
  totalBytes: number;
  sources: StorageSource[];
  byUser: StorageUserRow[];
  volume: VolumeStats | null;
  volumeUnavailableReason: string | null;
  integrity: IntegrityReport;
}

export interface UsageUserRow {
  userId: string;
  displayName: string;
  maskedEmail: string | null;
  logins: number;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
  tabs: Record<string, number>;
}

export interface UsageTabRow {
  tabId: string;
  title: string;
  views: number;
  users: number;
}

export interface UsageSnapshot {
  window: { days: number; fromDay: string; toDay: string };
  coverage: { dataSince: string | null; retentionDays: number; truncated: boolean };
  logins: { total: number; activeUsers: number; inactiveUsers: number };
  byUser: UsageUserRow[];
  tabs: UsageTabRow[];
}

const UNITS = ['B', 'kB', 'MB', 'GB', 'TB'];

/**
 * Bajti v berljivo obliko, s slovensko decimalno vejico.
 *
 * Nič je `0 B` in NE prazen niz: prazna celica v tabeli porabe je videti kot manjkajoč podatek,
 * ničla pa je odgovor — "ta oseba ne hrani ničesar" je ravno tako veljavna ugotovitev kot velika
 * številka (FR-008).
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Bajti in kilobajti brez decimalk — "1,0 kB" je natančnost, ki je ni.
  //
  // Samo `maximumFractionDigits` in NE tudi `minimumFractionDigits`: z minimumom bi okrogla
  // vrednost postala "2,0 GB", kar je ista navidezna natančnost, le eno enoto više. Decimalka se
  // torej pokaže samo, kadar kaj pove.
  const digits = unit <= 1 ? 0 : value < 10 ? 1 : 0;
  return `${value.toLocaleString('sl-SI', { maximumFractionDigits: digits })} ${UNITS[unit]}`;
}

/** Delež za širino vodoravnega stolpca. Brez celote je 0 — nikoli `NaN` v slogu elementa. */
export function percentOf(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, (part / total) * 100));
}

/** Datum in ura v slovenski obliki; `null` postane pomišljaj, ne prazna celica. */
export function formatMoment(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('sl-SI', { dateStyle: 'short', timeStyle: 'short' });
}

/** Slovenski opis ugotovitve o celovitosti (člen X). */
export function findingLabel(kind: FindingKind): string {
  switch (kind) {
    case 'missing-content':
      return 'Zapis brez vsebine na disku';
    case 'orphan-blob':
      return 'Vsebina na disku brez zapisa';
    case 'broken-record':
      return 'Zapis, označen kot okvarjen';
    case 'stalled-upload':
      return 'Nalaganje, ki je obtičalo';
  }
}

/**
 * Besedilo o pokritosti obdobja (FR-038).
 *
 * Vrne `null`, kadar je obdobje v celoti pokrito — takrat opozorila ni. To je edino mesto, ki
 * prazno obdobje loči od "nihče se ni prijavljal", in zato ne sme biti okrasno besedilo, ki se ga
 * da spregledati.
 */
export function coverageNotice(coverage: UsageSnapshot['coverage']): string | null {
  if (!coverage.truncated) return null;
  if (coverage.dataSince === null) {
    return 'Meritev še ni. Zbirati so se začele z uvedbo tega zaslona; podatkov za nazaj ni.';
  }
  return `Meritve obstajajo od ${coverage.dataSince}. Izbrano obdobje sega pred ta dan ali pred rok hrambe (${coverage.retentionDays} dni), zato je del obdobja prazen — to ni isto kot “nihče se ni prijavljal”.`;
}
