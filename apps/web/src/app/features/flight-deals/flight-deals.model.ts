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

export interface FlightSearch extends SearchInput {
  id: string;
  isOwn: true;
  recipients: Recipient[];
  preview: SearchPreview;
  lastCheck: { runId: string; at: string; outcomes: CheckOutcome[] } | null;
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
