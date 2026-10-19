// Tipi iz pogodbe specs/015-flight-deals/contracts/openapi.yaml in ČISTE funkcije prikaza.
//
// Brez Angularja: datoteka je testabilna brez TestBed (tests/unit/flight-deals-model.spec.ts),
// enak dogovor kot `recipes.model.ts` in `todos.model.ts`. Vse, kar se lahko pokvari tiho (oblika
// cene, besedilo spremembe, pretvorba obrazca v vnos), je tu in ne v predlogah.

export type ChangeType = 'NEW' | 'PRICE_DOWN' | 'PRICE_UP' | 'UNCHANGED' | 'UNAVAILABLE';
export type ProviderOutcome = 'ok' | 'noFlights' | 'unsupported' | 'unreachable' | 'rateLimited' | 'incomplete' | 'disabled';
export type DateMode = 'fixed' | 'range' | 'rolling';
export type DestinationMode = 'any' | 'countries' | 'airports';
export type BaggageOption = 'any' | 'cabin' | 'checked';
export type OfferSort = 'price' | 'departure' | 'appeared' | 'change';
export type RunStatus = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled' | 'interrupted';
export type SchedulePresetId = 'daily-06' | 'daily-06-18' | 'every-6h' | 'monday-08' | 'custom';

export interface Money {
  amount: number;
  currency: string;
}

export interface Person {
  id: string;
  displayName: string;
  initials: string;
}

export interface Recipient extends Person {
  emailHint?: string;
  notify: boolean;
  addedAt: string;
}

export interface DayWindow {
  weekdays: number[];
  earliest: string | null;
  latest: string | null;
}

export interface SearchDates {
  mode: DateMode;
  departDate?: string;
  returnDate?: string | null;
  from?: string;
  to?: string;
  months?: number;
}

export interface SearchInput {
  name: string;
  active: boolean;
  departureAirports: string[];
  destination: { mode: DestinationMode; countries: string[]; airports: string[] };
  excluded: { countries: string[]; airports: string[] };
  dates: SearchDates;
  flexDays: number;
  returnWithinWindow: boolean;
  minNights: number | null;
  maxNights: number | null;
  outbound: DayWindow;
  inbound: DayWindow;
  minStayHours: number | null;
  passengers: { adults: number; childrenAges: number[] };
  price: { maxPerPerson: number | null; maxTotal: number | null; currency: string };
  airlines: string[];
  maxStops: number;
  baggage: BaggageOption;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface SearchPreview {
  outboundWindow: DateRange;
  returnWindow: DateRange | null;
  dateCombinations: number;
  queries: number;
  truncated: boolean;
  warnings: string[];
}

export interface CheckOutcome {
  providerId: string;
  outcome: ProviderOutcome;
  message?: string | null;
  queries: number;
  offers: number;
}

/** Analiza zadnjega preverjanja: vrnjeno / ujemanja / zavrnjeno po razlogih (padajoče). */
export interface CheckAnalysis {
  returned: number;
  matched: number;
  rejected: Array<{ reason: string; label: string; count: number }>;
}

export interface FlightSearch extends SearchInput {
  id: string;
  isOwn: true;
  recipients: Recipient[];
  preview: SearchPreview;
  lastCheck: { runId: string; at: string; outcomes: CheckOutcome[]; analysis?: CheckAnalysis | null } | null;
  lastSuccessfulCheckAt: string | null;
  offerCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Limits {
  maxSearchesPerUser: number;
  maxRecipients: number;
  maxQueriesPerSearch: number;
  maxFlexDays: number;
}

export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
  countryName: string;
  latitude: number;
  longitude: number;
  timezone: string;
  distanceKm?: number;
}

export interface Country {
  code: string;
  name: string;
  airportCount: number;
}

export interface Segment {
  departureAt: string;
  departureTz: string;
  arrivalAt: string | null;
  arrivalTz: string;
  flightNumbers: string[];
  stops: number;
}

export interface OfferMatch {
  searchId: string;
  searchName: string;
  isOwn: boolean;
  owner: Person | null;
  changeType: ChangeType;
  firstMatchedAt: string;
  status: 'active' | 'unavailable' | 'stale';
}

export interface OfferChange {
  type: ChangeType;
  absolute: number;
  percent: number;
}

export interface Offer {
  id: string;
  providerId: string;
  providerLabel: string;
  providerOfficial: boolean;
  airline: string;
  airlineName: string | null;
  /** Vsi prevozniki (glavni + iz številk letov); strežnik jih sestavi, ime je `null` pri neznani kodi. */
  airlines?: Array<{ code: string; name: string | null }>;
  origin: Airport;
  destination: Airport;
  outbound: Segment;
  inbound: Segment | null;
  nights: number | null;
  price: Money;
  pricePerPerson: Money;
  priceIncludes: string | null;
  previousPrice: Money | null;
  change: OfferChange | null;
  passengers: { adults: number; children: number };
  fare?: { type: string | null; baggage: string | null };
  bookingUrl: string | null;
  /** Prejšnja cena po navedbi vira (Ryanair); ne vpliva na `change`. */
  providerPreviousPrice?: Money | null;
  dataAt: string;
  lastCheckedAt: string;
  availability: 'available' | 'unavailable';
  matches: OfferMatch[];
}

export interface HistoryPoint {
  checkedAt: string;
  price: Money | null;
  previousPrice: Money | null;
  changeType: ChangeType;
}

export interface OfferDetail extends Offer {
  history: HistoryPoint[];
}

export interface OfferList {
  offers: Offer[];
  total: number;
}

export interface Overview {
  searches: FlightSearch[];
  newOffers: OfferList;
  priceChanges: OfferList;
  cheapest: OfferList;
  lastRun: { at: string; status: string } | null;
  limits: Limits;
}

export interface ProviderPublic {
  id: string;
  label: string;
  official: boolean;
  enabled: boolean;
  lastSuccessAt: string | null;
  notice: string | null;
}

export interface ProviderAdmin extends ProviderPublic {
  lastErrorAt: string | null;
  lastError: string | null;
  lastOutcome: ProviderOutcome | null;
  requestsToday: number;
  dailyLimit: number | null;
}

export interface SchedulerSettings {
  enabled: boolean;
  preset: SchedulePresetId;
  cronExpression: string;
  timezone: string;
  nextRunAt: string | null;
  nextRunLocal: string | null;
  presets: Array<{ id: SchedulePresetId; label: string; cronExpression: string }>;
  updatedAt: string;
  updatedBy: Person | null;
}

export interface RunCounters {
  rules: number;
  queries: number;
  providerRequests: number;
  offersSeen: number;
  newMatches: number;
  priceDrops: number;
  priceRises: number;
  unavailable: number;
  notificationsPending: number;
  notificationsSent: number;
  notificationsSuppressed: number;
  notificationsFailed: number;
}

export interface Run {
  id: string;
  trigger: 'schedule' | 'manual';
  status: RunStatus;
  scheduledFor: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  requestedBy: Person | null;
  cancelRequested: boolean;
  counters: RunCounters;
  providers: Array<{ providerId: string; enabled: boolean; ok: number; noFlights: number; unsupported: number; unreachable: number; rateLimited: number; incomplete: number }>;
  errors: Array<{ at: string; providerId?: string; searchId?: string; code: string; message: string }>;
}

export interface NotificationAdmin {
  id: string;
  runId: string;
  recipient: Person & { emailHint: string };
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'suppressed';
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

export function formatPrice(money: Money | null | undefined): string {
  if (!money) return '';
  const amount = Number.isInteger(money.amount)
    ? String(money.amount)
    : money.amount.toFixed(2).replace('.', ',');
  const symbol = money.currency === 'EUR' ? '€' : money.currency;
  return `${amount} ${symbol}`;
}

/** "−31 € (−25,8 %)" oziroma "+21 € (+23,6 %)"; prazno pri NOVO ali brez primerjave (FR-030). */
export function changeText(change: OfferChange | null | undefined, currency = 'EUR'): string {
  if (!change || change.type === 'NEW' || change.type === 'UNCHANGED' || change.type === 'UNAVAILABLE') return '';
  const sign = change.absolute < 0 ? '−' : '+';
  const abs = Math.abs(change.absolute);
  const absText = Number.isInteger(abs) ? String(abs) : abs.toFixed(2).replace('.', ',');
  const pct = String(Math.abs(change.percent)).replace('.', ',');
  return `${sign}${absText} ${currency === 'EUR' ? '€' : currency} (${sign}${pct} %)`;
}

/** Ionic barva za spremembo: pocenitev `success`, podražitev `danger`, sicer `null`. */
export function changeColor(type: ChangeType | null | undefined): 'success' | 'danger' | null {
  if (type === 'PRICE_DOWN') return 'success';
  if (type === 'PRICE_UP') return 'danger';
  return null;
}

export const CHANGE_LABELS: Record<ChangeType, string> = {
  NEW: 'Novo',
  PRICE_DOWN: 'Pocenitev',
  PRICE_UP: 'Podražitev',
  UNCHANGED: 'Nespremenjeno',
  UNAVAILABLE: 'Ni več na voljo',
};

export const OUTCOME_LABELS: Record<ProviderOutcome, string> = {
  ok: 'v redu',
  noFlights: 'ni ustreznih letov',
  unsupported: 'vir tega iskanja ne podpira',
  unreachable: 'vir ni dosegljiv',
  rateLimited: 'vir omejuje zahteve',
  incomplete: 'podatki so nepopolni',
  disabled: 'vir ni vklopljen',
};

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  queued: 'čaka',
  running: 'teče',
  succeeded: 'uspešno',
  partial: 'delno (en vir ni odgovoril)',
  failed: 'neuspešno',
  cancelled: 'preklicano',
  interrupted: 'prekinjeno',
};

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

export const WEEKDAYS: ReadonlyArray<{ iso: number; label: string; long: string }> = [
  { iso: 1, label: 'pon', long: 'ponedeljek' },
  { iso: 2, label: 'tor', long: 'torek' },
  { iso: 3, label: 'sre', long: 'sreda' },
  { iso: 4, label: 'čet', long: 'četrtek' },
  { iso: 5, label: 'pet', long: 'petek' },
  { iso: 6, label: 'sob', long: 'sobota' },
  { iso: 7, label: 'ned', long: 'nedelja' },
];

/** "pon, pet" oziroma "kateri koli dan" za prazen seznam. */
export function weekdayLabels(weekdays: readonly number[]): string {
  if (weekdays.length === 0 || weekdays.length === 7) return 'kateri koli dan';
  return [...weekdays]
    .sort((a, b) => a - b)
    .map((iso) => WEEKDAYS.find((d) => d.iso === iso)?.label ?? String(iso))
    .join(', ');
}

/** "pet po 15:00" / "ned do 16:00" / "kateri koli dan". */
export function dayWindowText(window: DayWindow): string {
  const days = weekdayLabels(window.weekdays);
  const parts: string[] = [];
  if (window.earliest) parts.push(`po ${window.earliest}`);
  if (window.latest) parts.push(`do ${window.latest}`);
  return parts.length > 0 ? `${days} ${parts.join(' ')}` : days;
}

function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12));
}

/** "20. 10. – 3. 11. 2026" iz dveh koledarskih dni; isti dan → en datum. */
export function windowText(range: DateRange | null | undefined): string {
  if (!range) return '';
  const from = parseDay(range.from);
  const to = parseDay(range.to);
  const fmtShort = new Intl.DateTimeFormat('sl-SI', { day: 'numeric', month: 'numeric', timeZone: 'UTC' });
  const fmtLong = new Intl.DateTimeFormat('sl-SI', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });
  if (range.from === range.to) return fmtLong.format(from);
  return `${fmtShort.format(from)} – ${fmtLong.format(to)}`;
}

export function formatLocalDateTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('sl-SI', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  }).format(new Date(iso));
}

export function formatLocalTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('sl-SI', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso));
}

export function formatLocalDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('sl-SI', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: tz }).format(new Date(iso));
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

export function pluralNights(n: number | null): string {
  if (n === null) return '';
  const mod = n % 100;
  if (mod === 1) return `${n} nočitev`;
  if (mod === 2) return `${n} nočitvi`;
  if (mod === 3 || mod === 4) return `${n} nočitve`;
  return `${n} nočitev`;
}

export function pluralSearches(n: number): string {
  const mod = n % 100;
  if (mod === 1) return `${n} iskanje`;
  if (mod === 2) return `${n} iskanji`;
  if (mod === 3 || mod === 4) return `${n} iskanja`;
  return `${n} iskanj`;
}

export function pluralOffers(n: number): string {
  const mod = n % 100;
  if (mod === 1) return `${n} ponudba`;
  if (mod === 2) return `${n} ponudbi`;
  if (mod === 3 || mod === 4) return `${n} ponudbe`;
  return `${n} ponudb`;
}

export function passengersText(p: { adults: number; children: number }): string {
  const adults = p.adults === 1 ? '1 odrasel' : p.adults === 2 ? '2 odrasla' : p.adults <= 4 ? `${p.adults} odrasli` : `${p.adults} odraslih`;
  if (p.children === 0) return adults;
  const kids = p.children === 1 ? '1 otrok' : p.children === 2 ? '2 otroka' : p.children <= 4 ? `${p.children} otroci` : `${p.children} otrok`;
  return `${adults}, ${kids}`;
}

/** Stanje iskanja za seznam: "še ni preverjeno", "preverjeno 17. 10. 2026 06:00", "vir ni dosegljiv". */
export function searchStatusText(search: Pick<FlightSearch, 'active' | 'lastCheck' | 'lastSuccessfulCheckAt'>): { text: string; color: 'success' | 'warning' | 'danger' | 'medium' } {
  if (!search.active) return { text: 'neaktivno', color: 'medium' };
  if (!search.lastCheck) return { text: 'še ni preverjeno', color: 'medium' };
  const failing = search.lastCheck.outcomes.filter((o) => o.outcome === 'unreachable' || o.outcome === 'rateLimited' || o.outcome === 'incomplete');
  const anyOk = search.lastCheck.outcomes.some((o) => o.outcome === 'ok' || o.outcome === 'noFlights');
  if (failing.length > 0 && !anyOk) return { text: `zadnje preverjanje ni uspelo: ${OUTCOME_LABELS[failing[0]!.outcome]}`, color: 'danger' };
  if (failing.length > 0) return { text: `preverjeno ${formatLjubljana(search.lastCheck.at)}, en vir ni odgovoril`, color: 'warning' };
  if (search.lastCheck.outcomes.every((o) => o.outcome === 'disabled')) return { text: 'noben vir ni vklopljen', color: 'warning' };
  return { text: `preverjeno ${formatLjubljana(search.lastCheck.at)}`, color: 'success' };
}

/**
 * Analiza zadnjega preverjanja v eni vrstici: "vir vrnil 1.240 ponudb · 10 ujemanj · zavrnjeno: cena na osebo
 * nad mejo 900, odhod na nedovoljen dan 280". `null`, kadar preverjanja ali analize (starejši zapisi) ni.
 */
export function checkAnalysisText(search: Pick<FlightSearch, 'lastCheck'>, maxReasons = 4): string | null {
  const a = search.lastCheck?.analysis;
  if (!a) return null;
  if (a.returned === 0) return 'viri za te poizvedbe niso vrnili nobene ponudbe';
  const parts = [`viri vrnili ${formatCount(a.returned, 'ponudbo', 'ponudbi', 'ponudbe', 'ponudb')}`, formatCount(a.matched, 'ujemanje', 'ujemanji', 'ujemanja', 'ujemanj')];
  if (a.rejected.length > 0) {
    const top = a.rejected.slice(0, maxReasons).map((r) => `${r.label} ${r.count.toLocaleString('sl-SI')}`);
    const rest = a.rejected.slice(maxReasons).reduce((sum, r) => sum + r.count, 0);
    parts.push(`zavrnjeno: ${top.join(', ')}${rest > 0 ? `, drugo ${rest.toLocaleString('sl-SI')}` : ''}`);
  }
  return parts.join(' · ');
}

function formatCount(n: number, one: string, two: string, few: string, many: string): string {
  const mod100 = n % 100;
  const word = mod100 === 1 ? one : mod100 === 2 ? two : mod100 === 3 || mod100 === 4 ? few : many;
  return `${n.toLocaleString('sl-SI')} ${word}`;
}

/** "Ryanair + Wizz Air" (ali koda, kadar ime ni znano); brez seznama pade na glavnega prevoznika. */
export function airlinesText(offer: Pick<Offer, 'airline' | 'airlineName' | 'airlines'>): string {
  const list = offer.airlines ?? [];
  if (list.length === 0) return offer.airlineName ?? offer.airline;
  return list.map((a) => a.name ?? a.code).join(' + ');
}

/** Točke za graf cen: `UNAVAILABLE` je vrzel (null), ne ničla. */
export function chartPoints(history: readonly HistoryPoint[]): { labels: string[]; values: (number | null)[] } {
  return {
    labels: history.map((h) => formatLjubljana(h.checkedAt)),
    values: history.map((h) => (h.changeType === 'UNAVAILABLE' || !h.price ? null : h.price.amount)),
  };
}

// ─── obrazec ─────────────────────────────────────────────────────────────────────────────────

/** `ion-input type="number"` vrne število, drugi vnosi niz; polja obrazca so zato tega tipa (vzorec 013). */
export type FormFieldValue = string | number | null | undefined;

export function asText(value: FormFieldValue): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/** Celo število ali `null`; sprejme decimalno vejico, prazno je `null`. Negativno in decimalno vrne NaN
 * (da strežnik pove razlog), ne tiho zaokroži. */
export function toOptionalInt(value: FormFieldValue): number | null {
  const text = asText(value).replace(',', '.');
  if (text.length === 0) return null;
  const parsed = typeof value === 'number' ? value : Number(text);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function toOptionalNumber(value: FormFieldValue): number | null {
  const text = asText(value).replace(',', '.');
  if (text.length === 0) return null;
  const parsed = typeof value === 'number' ? value : Number(text);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export const FLEX_PRESETS = [0, 1, 2, 3] as const;
export type FlexPreset = (typeof FLEX_PRESETS)[number] | 'custom';

/** Hitre izbire ±0..±3; vse drugo je "po meri" (FR-006). */
export function flexPresetFor(days: number): FlexPreset {
  return (FLEX_PRESETS as readonly number[]).includes(days) ? (days as FlexPreset) : 'custom';
}

export interface SearchForm {
  name: string;
  active: boolean;
  departureAirports: string[];
  destinationMode: DestinationMode;
  destinationCountries: string[];
  destinationAirports: string[];
  excludedCountries: string[];
  excludedAirports: string[];
  dateMode: DateMode;
  departDate: string;
  returnDate: string;
  oneWay: boolean;
  from: string;
  to: string;
  months: FormFieldValue;
  flexPreset: FlexPreset;
  flexCustom: FormFieldValue;
  returnWithinWindow: boolean;
  minNights: FormFieldValue;
  maxNights: FormFieldValue;
  outboundWeekdays: number[];
  outboundEarliest: string;
  outboundLatest: string;
  inboundWeekdays: number[];
  inboundEarliest: string;
  inboundLatest: string;
  minStayHours: FormFieldValue;
  adults: FormFieldValue;
  childrenAgesText: string;
  maxPerPerson: FormFieldValue;
  maxTotal: FormFieldValue;
  currency: string;
  airlinesText: string;
  maxStops: FormFieldValue;
  baggage: BaggageOption;
}

export function emptySearchForm(): SearchForm {
  return {
    name: '',
    active: true,
    departureAirports: ['LJU'],
    destinationMode: 'any',
    destinationCountries: [],
    destinationAirports: [],
    excludedCountries: [],
    excludedAirports: [],
    dateMode: 'range',
    departDate: '',
    returnDate: '',
    oneWay: false,
    from: '',
    to: '',
    months: 3,
    flexPreset: 0,
    flexCustom: '',
    returnWithinWindow: true,
    minNights: 2,
    maxNights: 3,
    outboundWeekdays: [],
    outboundEarliest: '',
    outboundLatest: '',
    inboundWeekdays: [],
    inboundEarliest: '',
    inboundLatest: '',
    minStayHours: '',
    adults: 1,
    childrenAgesText: '',
    maxPerPerson: '',
    maxTotal: '',
    currency: 'EUR',
    airlinesText: '',
    maxStops: 0,
    baggage: 'any',
  };
}

export function formFromSearch(search: FlightSearch): SearchForm {
  const flex = flexPresetFor(search.flexDays);
  const oneWay = search.minNights === null && search.maxNights === null;
  return {
    name: search.name,
    active: search.active,
    departureAirports: [...search.departureAirports],
    destinationMode: search.destination.mode,
    destinationCountries: [...search.destination.countries],
    destinationAirports: [...search.destination.airports],
    excludedCountries: [...(search.excluded?.countries ?? [])],
    excludedAirports: [...(search.excluded?.airports ?? [])],
    dateMode: search.dates.mode,
    departDate: search.dates.departDate ?? '',
    returnDate: search.dates.returnDate ?? '',
    oneWay,
    from: search.dates.from ?? '',
    to: search.dates.to ?? '',
    months: search.dates.months ?? 3,
    flexPreset: flex,
    flexCustom: flex === 'custom' ? search.flexDays : '',
    returnWithinWindow: search.returnWithinWindow,
    minNights: search.minNights ?? '',
    maxNights: search.maxNights ?? '',
    outboundWeekdays: [...search.outbound.weekdays],
    outboundEarliest: search.outbound.earliest ?? '',
    outboundLatest: search.outbound.latest ?? '',
    inboundWeekdays: [...search.inbound.weekdays],
    inboundEarliest: search.inbound.earliest ?? '',
    inboundLatest: search.inbound.latest ?? '',
    minStayHours: search.minStayHours ?? '',
    adults: search.passengers.adults,
    childrenAgesText: search.passengers.childrenAges.join(', '),
    maxPerPerson: search.price.maxPerPerson ?? '',
    maxTotal: search.price.maxTotal ?? '',
    currency: search.price.currency,
    airlinesText: search.airlines.join(', '),
    maxStops: search.maxStops,
    baggage: search.baggage,
  };
}

function parseList(text: string): string[] {
  return text
    .split(/[,\s;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
}

function parseAges(text: string): number[] {
  return text
    .split(/[,\s;]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

/** Pretvorba obrazca v vnos za API. Ne preverja pomena — to pove strežnik (en razlog, eno sporočilo). */
export function toSearchInput(form: SearchForm): SearchInput {
  const flexDays = form.flexPreset === 'custom' ? (toOptionalInt(form.flexCustom) ?? 0) : form.flexPreset;
  const oneWay = form.dateMode === 'fixed' ? form.oneWay : form.oneWay;
  const dates: SearchDates =
    form.dateMode === 'fixed'
      ? { mode: 'fixed', departDate: form.departDate, returnDate: form.oneWay ? null : form.returnDate || null }
      : form.dateMode === 'range'
        ? { mode: 'range', from: form.from, to: form.to }
        : { mode: 'rolling', months: toOptionalInt(form.months) ?? 1 };
  const window = (weekdays: number[], earliest: string, latest: string): DayWindow => ({
    weekdays: [...weekdays].sort((a, b) => a - b),
    earliest: earliest || null,
    latest: latest || null,
  });
  return {
    name: form.name.trim(),
    active: form.active,
    departureAirports: form.departureAirports,
    destination: {
      mode: form.destinationMode,
      countries: form.destinationMode === 'countries' ? form.destinationCountries : [],
      airports: form.destinationMode === 'airports' ? form.destinationAirports : [],
    },
    excluded: { countries: form.excludedCountries, airports: form.excludedAirports },
    dates,
    flexDays,
    returnWithinWindow: form.returnWithinWindow,
    minNights: oneWay ? null : toOptionalInt(form.minNights),
    maxNights: oneWay ? null : toOptionalInt(form.maxNights),
    outbound: window(form.outboundWeekdays, form.outboundEarliest, form.outboundLatest),
    inbound: window(form.inboundWeekdays, form.inboundEarliest, form.inboundLatest),
    minStayHours: toOptionalInt(form.minStayHours),
    passengers: { adults: toOptionalInt(form.adults) ?? 1, childrenAges: parseAges(form.childrenAgesText) },
    price: {
      maxPerPerson: toOptionalNumber(form.maxPerPerson),
      maxTotal: toOptionalNumber(form.maxTotal),
      currency: form.currency.trim().toUpperCase() || 'EUR',
    },
    airlines: parseList(form.airlinesText),
    maxStops: toOptionalInt(form.maxStops) ?? 0,
    baggage: form.baggage,
  };
}

/** Prva napaka, ki jo zna vmesnik ujeti PRED klicem (strežnik je resnica, to je samo hitrejši odziv). */
export function quickValidate(form: SearchForm): string | null {
  if (form.name.trim().length === 0) return 'Ime iskanja je obvezno.';
  if (form.departureAirports.length === 0) return 'Izberi vsaj eno odhodno letališče.';
  if (form.destinationMode === 'countries' && form.destinationCountries.length === 0) return 'Izberi vsaj eno državo.';
  if (form.destinationMode === 'airports' && form.destinationAirports.length === 0) return 'Izberi vsaj eno ciljno letališče.';
  if (form.dateMode === 'fixed' && !form.departDate) return 'Vpiši datum odhoda.';
  if (form.dateMode === 'range' && (!form.from || !form.to)) return 'Vpiši začetek in konec obdobja.';
  if (form.flexPreset === 'custom') {
    const flex = toOptionalInt(form.flexCustom);
    if (flex === null || Number.isNaN(flex) || flex < 0 || !Number.isInteger(flex)) return 'Fleksibilnost po meri mora biti nenegativno celo število dni.';
  }
  if (!form.oneWay) {
    const min = toOptionalInt(form.minNights);
    const max = toOptionalInt(form.maxNights);
    if (min === null || max === null || Number.isNaN(min) || Number.isNaN(max)) return 'Vpiši najmanjše in največje število nočitev (ali izberi enosmerno).';
    if (max < min) return 'Največje število nočitev mora biti vsaj enako najmanjšemu.';
  }
  return null;
}

/** Sporočilo napake iz problem+json, sicer nadomestek (vzorec vseh modulov). */
export function describeError(err: unknown, fallback: string): string {
  const detail = (err as { error?: { detail?: unknown } } | null)?.error?.detail;
  return typeof detail === 'string' && detail.length > 0 ? detail : fallback;
}

// ─── tabela ponudb ───────────────────────────────────────────────────────────────────────────
//
// Glavna stran modula kaže ponudbe kot TABELO z iskanjem, filtri in razvrščanjem; vse odločitve o
// tem, katera vrstica se pokaže in v kakšnem redu, so tu (brez Angularja) in pokrite s testi
// (tests/unit/flight-deals-offer-table.spec.ts). Komponenta samo veže stanje na te funkcije.
//
// "Pretečena" ponudba je taka, ki je vir ne ponuja več (`availability: unavailable`) ALI je odhod
// že za nami. Privzeto je skrita; potrditveno polje "pokaži tudi pretečene" jo pokaže (strežnik jo
// hrani še teden po odhodu, glej data-model.md), da je mogoče pogledati nazaj, kaj je bilo.

export type OfferKind = 'new' | 'down' | 'up' | 'plain';
export type OfferKindFilter = 'all' | 'new' | 'down' | 'up';
export type OfferScope = 'all' | 'own' | 'shared';
export type OfferStatusKey = 'unavailable' | 'departed' | OfferKind;

export interface OfferStatus {
  key: OfferStatusKey;
  label: string;
  color: 'medium' | 'primary' | 'success' | 'danger' | null;
}

export type OfferSortKey = 'route' | 'departure' | 'return' | 'price' | 'perPerson' | 'change' | 'dataAt' | 'search';
export type SortDirection = 'asc' | 'desc';

export interface OfferTableSort {
  key: OfferSortKey;
  dir: SortDirection;
}

export interface OfferFilters {
  query: string;
  searchId: string | null;
  kind: OfferKindFilter;
  /** Lastna iskanja, deljena z mano ali vsa (po `isOwn` ujemanj). */
  scope: OfferScope;
  directOnly: boolean;
  showExpired: boolean;
}

export interface OfferCounts {
  all: number;
  new: number;
  down: number;
  up: number;
  /** Koliko ponudb skriva potrditveno polje "pokaži tudi pretečene" pri sicer enakih filtrih. */
  expired: number;
}

type OfferLike = Pick<Offer, 'availability' | 'outbound' | 'inbound' | 'matches' | 'change'>;

function toMs(now: Date | number): number {
  return typeof now === 'number' ? now : now.getTime();
}

export function hasDeparted(offer: Pick<Offer, 'outbound'>, now: Date | number = Date.now()): boolean {
  return new Date(offer.outbound.departureAt).getTime() < toMs(now);
}

export function isExpiredOffer(offer: Pick<Offer, 'availability' | 'outbound'>, now: Date | number = Date.now()): boolean {
  return offer.availability === 'unavailable' || hasDeparted(offer, now);
}

/** Vrsta spremembe za filter: NOVO ima prednost pred pocenitvijo/podražitvijo (kot značka kartice). */
export function offerKind(offer: Pick<Offer, 'matches' | 'change'>): OfferKind {
  if (offer.matches.some((m) => m.changeType === 'NEW')) return 'new';
  if (offer.change?.type === 'PRICE_DOWN') return 'down';
  if (offer.change?.type === 'PRICE_UP') return 'up';
  return 'plain';
}

/** Značka vrstice/kartice: pretečenost ima prednost pred spremembo cene. */
export function offerStatus(offer: OfferLike, now: Date | number = Date.now()): OfferStatus {
  if (offer.availability === 'unavailable') return { key: 'unavailable', label: CHANGE_LABELS.UNAVAILABLE, color: 'medium' };
  if (hasDeparted(offer, now)) return { key: 'departed', label: 'Pretečeno', color: 'medium' };
  const kind = offerKind(offer);
  if (kind === 'new') return { key: 'new', label: CHANGE_LABELS.NEW, color: 'primary' };
  if (kind === 'down') return { key: 'down', label: CHANGE_LABELS.PRICE_DOWN, color: 'success' };
  if (kind === 'up') return { key: 'up', label: CHANGE_LABELS.PRICE_UP, color: 'danger' };
  return { key: 'plain', label: '', color: null };
}

export function isDirect(offer: Pick<Offer, 'outbound' | 'inbound'>): boolean {
  return offer.outbound.stops === 0 && (offer.inbound?.stops ?? 0) === 0;
}

/** "direktno" / "1 prestop" / "2 prestopa" — največ prestopov med tja in nazaj. */
export function stopsText(offer: Pick<Offer, 'outbound' | 'inbound'>): string {
  const stops = Math.max(offer.outbound.stops, offer.inbound?.stops ?? 0);
  if (stops === 0) return 'direktno';
  if (stops === 1) return '1 prestop';
  if (stops === 2) return '2 prestopa';
  if (stops <= 4) return `${stops} prestopi`;
  return `${stops} prestopov`;
}

/** Imena iskanj, ki jim ponudba ustreza; pri deljenih z lastnikom v oklepaju. */
export function searchNamesText(offer: Pick<Offer, 'matches'>): string {
  return offer.matches.map((m) => (m.isOwn ? m.searchName : `${m.searchName} (${m.owner?.displayName ?? 'deljeno'})`)).join(', ');
}

/** Brez šumnikov in velikih črk, da "spanija" najde Španijo in "DUNAJ" Dunaj. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function offerSearchText(offer: Offer): string {
  const parts = [
    offer.origin.iata,
    offer.origin.city,
    offer.origin.name,
    offer.origin.countryName,
    offer.destination.iata,
    offer.destination.city,
    offer.destination.name,
    offer.destination.countryName,
    offer.airline,
    offer.airlineName,
    ...(offer.airlines ?? []).flatMap((a) => [a.code, a.name]),
    offer.providerLabel,
    ...offer.matches.flatMap((m) => [m.searchName, m.owner?.displayName]),
  ];
  return normalizeSearchText(parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' '));
}

/** Vsaka beseda poizvedbe se mora pojaviti nekje v besedilu ponudbe (letališči, mesti, državi,
 * prevoznik, vir, imena iskanj). Prazna poizvedba ustreza vsemu. */
export function offerMatchesQuery(offer: Offer, query: string): boolean {
  const terms = normalizeSearchText(query)
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (terms.length === 0) return true;
  const haystack = offerSearchText(offer);
  return terms.every((t) => haystack.includes(t));
}

export function emptyOfferFilters(): OfferFilters {
  return { query: '', scope: 'all', searchId: null, kind: 'all', directOnly: false, showExpired: false };
}

export function filterOffers(offers: readonly Offer[], filters: OfferFilters, now: Date | number = Date.now()): Offer[] {
  return offers.filter(
    (o) =>
      (filters.showExpired || !isExpiredOffer(o, now)) &&
      matchesScope(o, filters.scope) &&
      (!filters.searchId || o.matches.some((m) => m.searchId === filters.searchId)) &&
      (!filters.directOnly || isDirect(o)) &&
      (filters.kind === 'all' || offerKind(o) === filters.kind) &&
      offerMatchesQuery(o, filters.query),
  );
}

/** Števci za čipe vrste (brez filtra vrste, da čip pove, koliko bi pokazal) in za skrite pretečene. */
export function offerCounts(offers: readonly Offer[], filters: OfferFilters, now: Date | number = Date.now()): OfferCounts {
  const base = filterOffers(offers, { ...filters, kind: 'all', showExpired: true }, now);
  const expired = base.filter((o) => isExpiredOffer(o, now)).length;
  const visible = filters.showExpired ? base : base.filter((o) => !isExpiredOffer(o, now));
  const counts: OfferCounts = { all: visible.length, new: 0, down: 0, up: 0, expired };
  for (const o of visible) {
    const kind = offerKind(o);
    if (kind !== 'plain') counts[kind] += 1;
  }
  return counts;
}

/** Privzeto po datumu odhoda (lastnikova želja 19. 10. 2026): bližnji vikendi najprej, cena je drugi ključ. */
export const DEFAULT_OFFER_SORT: OfferTableSort = { key: 'departure', dir: 'asc' };

/** Klik na isti stolpec obrne smer; nov stolpec začne z naravno smerjo (čas podatka: najnovejše najprej). */
export function toggleOfferSort(current: OfferTableSort, key: OfferSortKey): OfferTableSort {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: key === 'dataAt' ? 'desc' : 'asc' };
}

function sortValue(offer: Offer, key: OfferSortKey): number | string | null {
  switch (key) {
    case 'route':
      return `${offer.origin.iata} ${offer.destination.iata}`;
    case 'departure':
      return new Date(offer.outbound.departureAt).getTime();
    case 'return':
      return offer.inbound ? new Date(offer.inbound.departureAt).getTime() : null;
    case 'price':
      return offer.price.amount;
    case 'perPerson':
      return offer.pricePerPerson.amount;
    case 'change':
      return offer.change && offer.change.type !== 'UNAVAILABLE' && offer.change.type !== 'NEW' ? offer.change.absolute : null;
    case 'dataAt':
      return new Date(offer.dataAt).getTime();
    case 'search':
      return searchNamesText(offer);
  }
}

/** Stabilno razvrščanje; manjkajoča vrednost (enosmerno brez povratka, brez spremembe) je VEDNO
 * na koncu, ne glede na smer. Izenačene vrstice loči cena, nato odhod. */
export function sortOffers(offers: readonly Offer[], sort: OfferTableSort): Offer[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  const compare = (a: number | string | null, b: number | string | null): number => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    if (typeof a === 'string' || typeof b === 'string') return sign * String(a).localeCompare(String(b), 'sl');
    return sign * (a - b);
  };
  return [...offers].sort(
    (a, b) =>
      compare(sortValue(a, sort.key), sortValue(b, sort.key)) ||
      a.price.amount - b.price.amount ||
      new Date(a.outbound.departureAt).getTime() - new Date(b.outbound.departureAt).getTime(),
  );
}

// ─── zapomnjen pogled tabele ──────────────────────────────────────────────────────────────────
//
// Kar uporabnik pritisne (obseg Vse/Moje/Deljene, izbrano iskanje, vrsta, samo direktni, pretečene,
// razvrščanje), ostane njegov PRIVZETI pogled ob naslednjem obisku — shranjeno v `localStorage`
// (offer-view.store.ts), ločeno za glavno stran in za Deljene ponudbe. Besedilo iskalnika se ne
// shranjuje: to je trenutna poizvedba, ne nastavitev pogleda. Branje je obrambno — vsako polje
// posebej pade na privzetek, da pokvarjen ali star zapis nikoli ne podre strani.

export type OfferViewPage = 'overview' | 'shared';

export interface OfferView {
  scope: OfferScope;
  searchId: string | null;
  kind: OfferKindFilter;
  directOnly: boolean;
  showExpired: boolean;
  sort: OfferTableSort;
}

export const DEFAULT_OFFER_VIEW: OfferView = {
  scope: 'all',
  searchId: null,
  kind: 'all',
  directOnly: false,
  showExpired: false,
  sort: DEFAULT_OFFER_SORT,
};

const OFFER_SCOPES: readonly OfferScope[] = ['all', 'own', 'shared'];
const OFFER_KIND_FILTERS: readonly OfferKindFilter[] = ['all', 'new', 'down', 'up'];
const OFFER_SORT_KEYS: readonly OfferSortKey[] = ['route', 'departure', 'return', 'price', 'perPerson', 'change', 'dataAt', 'search'];

export function offerViewStorageKey(page: OfferViewPage, userId: string | null | undefined): string {
  return `cd.flight-deals.view.${page}.${userId ?? 'anon'}`;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Shranjen zapis v pogled; manjkajoče ali neveljavno polje dobi privzetek, neveljaven JSON ves privzetek. */
export function parseOfferView(raw: string | null | undefined, defaults: OfferView = DEFAULT_OFFER_VIEW): OfferView {
  if (!raw) return { ...defaults };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...defaults };
  }
  if (!data || typeof data !== 'object') return { ...defaults };
  const d = data as Record<string, unknown>;
  const sort = d['sort'] && typeof d['sort'] === 'object' ? (d['sort'] as Record<string, unknown>) : {};
  return {
    scope: oneOf(d['scope'], OFFER_SCOPES, defaults.scope),
    searchId: typeof d['searchId'] === 'string' && d['searchId'].length > 0 ? d['searchId'] : null,
    kind: oneOf(d['kind'], OFFER_KIND_FILTERS, defaults.kind),
    directOnly: typeof d['directOnly'] === 'boolean' ? d['directOnly'] : defaults.directOnly,
    showExpired: typeof d['showExpired'] === 'boolean' ? d['showExpired'] : defaults.showExpired,
    sort: {
      key: oneOf(sort['key'], OFFER_SORT_KEYS, defaults.sort.key),
      dir: oneOf(sort['dir'], ['asc', 'desc'] as const, defaults.sort.dir),
    },
  };
}

export function serializeOfferView(view: OfferView): string {
  return JSON.stringify(view);
}

/** Pogled + trenutna poizvedba = filtri tabele. */
export function offerViewFilters(view: OfferView, query: string): OfferFilters {
  return { query, scope: view.scope, searchId: view.searchId, kind: view.kind, directOnly: view.directOnly, showExpired: view.showExpired };
}

/** Obseg: "own" = vsaj eno lastno ujemanje, "shared" = vsaj eno deljeno; "all" ne filtrira. */
export function matchesScope(offer: Pick<Offer, 'matches'>, scope: OfferScope): boolean {
  if (scope === 'all') return true;
  return offer.matches.some((m) => (scope === 'own' ? m.isOwn : !m.isOwn));
}
