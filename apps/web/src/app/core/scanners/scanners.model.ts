// Tipi iz pogodbe specs/016-scanner-engine/contracts/openapi.yaml in ČISTE funkcije prikaza
// jedra skenerjev. Brez Angularja: testabilno brez TestBed (tests/unit/scanners-model.spec.ts),
// enak dogovor kot `flight-deals.model.ts`. Funkcije, ki so bile v 015 letalske, a so generične
// (cena, čas, napaka, stanje zagona), živijo tu; modul Leti jih uvaža od tod (core sme vsak).

export type ExecutionMode = 'batch' | 'single';
export type RunStatus = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled' | 'interrupted';
export type SchedulePresetId = 'hourly' | 'daily-06' | 'daily-06-18' | 'every-6h' | 'monday-08' | 'custom';
export type ScheduleMode = 'own' | 'type';
export type ChangeType = 'NEW' | 'PRICE_DOWN' | 'PRICE_UP' | 'CHANGED' | 'UNCHANGED' | 'UNAVAILABLE';
export type DefinitionOutcome = 'ok' | 'failed' | 'skipped';
export type NotificationStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'suppressed';
export type ResultSort = 'seen' | 'price' | 'change';

export interface Money {
  amount: number;
  currency: string;
}

export interface Person {
  id: string;
  displayName: string;
  initials: string;
  emailHint?: string;
}

export interface SchedulePreset {
  id: SchedulePresetId;
  label: string;
  cronExpression: string;
}

export interface ScannerTypeInfo {
  type: string;
  label: string;
  icon: string;
  description: string;
  execution: ExecutionMode;
  enabled: boolean;
  available: boolean;
  ownsDefinitions: boolean;
  customResults: boolean;
  createRoute: string | null;
}

export interface ScheduleInfo {
  mode: ScheduleMode;
  preset?: SchedulePresetId;
  cronExpression?: string;
  timezone?: string;
  label: string;
  nextRunAt: string | null;
  nextRunLocal: string | null;
}

export interface LastRunInfo {
  at: string;
  outcome: DefinitionOutcome;
  message: string | null;
}

export interface ScannerSummary {
  id: string;
  type: string;
  typeLabel: string;
  name: string;
  enabled: boolean;
  schedule: ScheduleInfo;
  lastRun: LastRunInfo | null;
  lastSuccessAt: string | null;
  resultCount: number;
  typeAvailable: boolean;
  links: { edit: string; results: string };
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleInput {
  preset?: SchedulePresetId;
  cronExpression?: string;
  timezone?: string;
}

export interface ScannerInput {
  name: string;
  type: string;
  enabled?: boolean;
  schedule?: ScheduleInput;
  notifications?: { enabled?: boolean };
  config: Record<string, unknown>;
}

export interface ScannerPatch {
  name?: string;
  enabled?: boolean;
  schedule?: ScheduleInput;
  notifications?: { enabled?: boolean };
  config?: Record<string, unknown>;
}

export interface Scanner extends ScannerSummary {
  config: Record<string, unknown>;
  notifications: { enabled: boolean; mode: 'all-changes' };
}

export interface PriceChange {
  type: ChangeType;
  absolute: number;
  percent: number;
}

export interface Result {
  id: string;
  scannerId: string;
  type: string;
  source: string;
  externalId: string | null;
  title: string;
  url: string | null;
  price: Money | null;
  data: unknown;
  dataAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
  availability: 'available' | 'unavailable';
  previousPrice: (Money & { at: string }) | null;
  lastChangeType: ChangeType;
  change: PriceChange | null;
}

export interface HistoryPoint {
  checkedAt: string;
  price: Money | null;
  changeType: ChangeType;
}

export interface ResultDetail extends Result {
  history: HistoryPoint[];
}

export interface ResultList {
  results: Result[];
  total: number;
}

export interface Limits {
  maxPerUser: number;
}

export interface TypeSchedule {
  type: string;
  enabled: boolean;
  preset: SchedulePresetId;
  cronExpression: string;
  timezone: string;
  label: string;
  nextRunAt: string | null;
  nextRunLocal: string | null;
  updatedAt: string;
  updatedBy: Person | null;
}

export interface ScannerTypeAdmin extends ScannerTypeInfo {
  schedule: TypeSchedule | null;
  definitionCount: number;
  extras: unknown;
}

export interface RunSummary {
  id: string;
  type: string;
  trigger: 'schedule' | 'manual';
  status: RunStatus;
  scheduledFor: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  counters: Record<string, number>;
}

export interface Run extends RunSummary {
  scope: { kind: 'type' | 'definition'; scannerId?: string; owner: Person | null };
  requestedBy: Person | null;
  cancelRequested: boolean;
  definitions: Array<{ scannerId: string; name?: string; outcome: DefinitionOutcome; message: string | null }>;
  extras: unknown;
  errors: Array<{ at: string; scannerId?: string; code: string; message: string }>;
  createdAt: string;
}

export interface NotificationAdmin {
  id: string;
  type: string;
  runId: string;
  recipient: Person;
  status: NotificationStatus;
  suppressedReason: string | null;
  attemptCount: number;
  nextAttemptAt: string | null;
  sentAt: string | null;
  lastError: string | null;
  itemCount: number;
  createdAt: string;
}

// ─── prikaz ──────────────────────────────────────────────────────────────────────────────────

const ZONE = 'Europe/Ljubljana';

/** "89 €", "89,50 €", "12 GBP"; prazno brez cene. */
export function formatPrice(money: Money | null | undefined): string {
  if (!money) return '';
  const amount = Number.isInteger(money.amount) ? String(money.amount) : money.amount.toFixed(2).replace('.', ',');
  const symbol = money.currency === 'EUR' ? '€' : money.currency;
  return `${amount} ${symbol}`;
}

/** Cena ali pomišljaj — za rezultate brez cene (FR-022). */
export function formatPriceOrDash(money: Money | null | undefined): string {
  return money ? formatPrice(money) : '—';
}

export function formatLjubljana(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('sl-SI', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONE,
  }).format(new Date(iso));
}

/** Sporočilo napake iz problem+json, sicer nadomestek (vzorec vseh modulov). */
export function describeError(err: unknown, fallback: string): string {
  const detail = (err as { error?: { detail?: unknown } } | null)?.error?.detail;
  return typeof detail === 'string' && detail.length > 0 ? detail : fallback;
}

export function errorStatus(err: unknown): number | null {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : null;
}

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  queued: 'čaka',
  running: 'teče',
  succeeded: 'uspešno',
  partial: 'delno',
  failed: 'neuspešno',
  cancelled: 'preklicano',
  interrupted: 'prekinjeno',
};

export function runStatusLabel(status: RunStatus | string): string {
  return RUN_STATUS_LABELS[status as RunStatus] ?? status;
}

export function runStatusColor(status: RunStatus): 'success' | 'warning' | 'danger' | 'medium' | 'primary' {
  switch (status) {
    case 'succeeded':
      return 'success';
    case 'partial':
      return 'warning';
    case 'failed':
    case 'interrupted':
      return 'danger';
    case 'running':
    case 'queued':
      return 'primary';
    case 'cancelled':
      return 'medium';
  }
}

export const CHANGE_LABELS: Record<ChangeType, string> = {
  NEW: 'Novo',
  PRICE_DOWN: 'Pocenitev',
  PRICE_UP: 'Podražitev',
  CHANGED: 'Spremenjeno',
  UNCHANGED: 'Nespremenjeno',
  UNAVAILABLE: 'Ni več na voljo',
};

export function changeLabel(type: ChangeType | string | null | undefined): string {
  if (!type) return '';
  return CHANGE_LABELS[type as ChangeType] ?? String(type);
}

/** Ionic barva: pocenitev `success`, podražitev `danger`, novo in spremenjeno `primary`, nedosegljivo `medium`. */
export function changeColor(type: ChangeType | null | undefined): 'success' | 'danger' | 'primary' | 'medium' | null {
  switch (type) {
    case 'PRICE_DOWN':
      return 'success';
    case 'PRICE_UP':
      return 'danger';
    case 'NEW':
    case 'CHANGED':
      return 'primary';
    case 'UNAVAILABLE':
      return 'medium';
    default:
      return null;
  }
}

export const OUTCOME_LABELS: Record<DefinitionOutcome, string> = {
  ok: 'uspešno',
  failed: 'neuspešno',
  skipped: 'preskočeno',
};

export function outcomeColor(outcome: DefinitionOutcome | null | undefined): 'success' | 'danger' | 'medium' {
  if (outcome === 'ok') return 'success';
  if (outcome === 'failed') return 'danger';
  return 'medium';
}

/** "vsakih 6 ur · naslednjič 19. 10. 2026 18:00" oziroma "po urniku tipa (…) · izklopljen". */
export function scheduleSummary(schedule: ScheduleInfo, enabled = true): string {
  if (!enabled) return `${schedule.label} · izklopljen`;
  return schedule.nextRunLocal ? `${schedule.label} · naslednjič ${schedule.nextRunLocal}` : schedule.label;
}

/** Besedilo zadnjega izvajanja za vrstico seznama. */
export function lastRunText(lastRun: LastRunInfo | null): { text: string; color: 'success' | 'warning' | 'danger' | 'medium' } {
  if (!lastRun) return { text: 'še ni bilo izvedeno', color: 'medium' };
  const when = formatLjubljana(lastRun.at);
  if (lastRun.outcome === 'ok') return { text: `zadnjič ${when}`, color: 'success' };
  if (lastRun.outcome === 'failed') return { text: `zadnjič ${when} — ${lastRun.message ?? 'neuspešno'}`, color: 'danger' };
  return { text: `zadnjič ${when} — preskočeno`, color: 'warning' };
}

const NOTIFICATION_LABELS: Record<NotificationStatus, string> = {
  pending: 'čaka',
  sending: 'pošilja se',
  sent: 'poslano',
  failed: 'neuspelo',
  suppressed: 'zadržano',
};

const SUPPRESSED_LABELS: Record<string, string> = {
  'smtp-not-configured': 'pošta ni nastavljena',
  'no-email': 'brez e-naslova',
  'user-missing': 'uporabnik ne obstaja',
  'no-items': 'ni več ustreznih postavk',
  'type-unavailable': 'tip skenerja ni več na voljo',
};

export function notificationLabel(n: Pick<NotificationAdmin, 'status' | 'suppressedReason'>): string {
  const base = NOTIFICATION_LABELS[n.status];
  return n.status === 'suppressed' && n.suppressedReason ? `${base}: ${SUPPRESSED_LABELS[n.suppressedReason] ?? n.suppressedReason}` : base;
}

export function notificationColor(status: NotificationStatus): 'success' | 'warning' | 'danger' | 'medium' | 'primary' {
  switch (status) {
    case 'sent':
      return 'success';
    case 'pending':
    case 'sending':
      return 'primary';
    case 'failed':
      return 'danger';
    case 'suppressed':
      return 'warning';
  }
}

/** Števci zagona v eni vrstici — generični del (jedro) in vse, kar tip doda, po abecedi. */
export function countersText(counters: Record<string, number>): string {
  const known: Array<[string, string]> = [
    ['definitions', 'skenerjev'],
    ['seen', 'videnih'],
    ['new', 'novih'],
    ['changed', 'spremenjenih'],
    ['unavailable', 'ni več na voljo'],
    ['notificationsSent', 'dopisov poslanih'],
    ['notificationsSuppressed', 'zadržanih'],
    ['notificationsFailed', 'neuspelih'],
  ];
  const parts: string[] = [];
  const used = new Set<string>();
  for (const [key, label] of known) {
    if (key in counters) {
      parts.push(`${counters[key]} ${label}`);
      used.add(key);
    }
  }
  for (const key of Object.keys(counters).sort()) {
    if (!used.has(key) && key !== 'notificationsPending') parts.push(`${key}: ${counters[key]}`);
  }
  return parts.join(' · ');
}
