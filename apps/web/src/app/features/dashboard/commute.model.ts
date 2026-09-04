// Čista logika ploščice "Pot" — brez uvozov iz @angular/*, da je preverljiva brez TestBed-a
// (isti razlog kot pri core/settings/settings.model.ts in features/timesheet/timesheet.model.ts).
//
// Ploščica pokaže dva vdelana zemljevida (pot v službo in pot domov) s časom poti, in ima
// eno samo odločitev: KATERA smer je zdaj zgoraj. Dopoldne je to pot v službo, od poldneva
// naprej pot domov — enaka meja kot razvrstitev kamer po času dneva na strežniku
// (apps/api/src/domain/camera-ordering.ts, "localHour < 12").
//
// Ura se bere v coni `Europe/Ljubljana` in NE iz `Date.getHours()`: člen V.4 ustave velja
// tudi za odjemalca, telefon na poti pa je lahko v drugi coni, kjer bi bila smer napačna
// natanko takrat, ko je človek na poti.
//
// Podatki o poti (trajanje, zamuda, razdalja) pridejo s strežnika — `GET /dashboard/commute`,
// ker ključ za Google Routes API ostane na strežniku (člen IV) in ker zunanji vir gre prek
// predpomnilnika (člen VIII). Tu se samo izpišejo.

export const ZONE = 'Europe/Ljubljana';

/** Meja med smerema. Ni nastavitev: stara aplikacija je imela isto vrednost, in nastavitev,
 * ki jo uporabnik nastavi enkrat in nikoli več, je dražja od dokumentirane konstante. */
export const COMMUTE_SWITCH_HOUR = 12;

/** Najdaljši premor med dvema preveritvama smeri. Sama meja je izračunana natančno (spodaj),
 * ta zgornja meja pa poskrbi, da se ploščica pobere tudi, ko se je med tem premaknil sistemski
 * čas ali se je zgodil prehod na poletni/zimski čas. */
export const COMMUTE_MAX_WAIT_MS = 15 * 60 * 1000;

export type CommuteDirection = 'to-work' | 'to-home';

// Videz ploščice (višina zemljevida, postavitev) je uporabnikova nastavitev, zato njene meje
// živijo v `core/settings` — potrebuje jih tudi obrazec v drugem zavihku (člen I). Tukaj so
// ponovno izvožene, da ima ploščica vse o sebi na enem mestu.
export {
  MIN_MAP_HEIGHT_PX,
  MAX_MAP_HEIGHT_PX,
  DEFAULT_MAP_HEIGHT_PX,
  clampMapHeightPx,
  type CommuteLayout,
} from '../../core/settings/settings.model.js';

/**
 * Širina ploščice glede na postavitev. Pri dveh zemljevidih drug ob drugem mora biti
 * ploščica približno dvakrat širša, sicer je vsak zemljevid ožji od tega, kar je še berljivo
 * — zato širina ni konstanta v registru, ampak sledi uporabnikovi izbiri.
 */
export function commuteTileWidthPx(layout: 'vertical' | 'horizontal'): number {
  return layout === 'horizontal' ? 780 : 440;
}

export type CommuteTravelUnavailable = 'not-configured' | 'no-api-key' | 'no-route' | 'source-unavailable';

export interface CommuteTravel {
  durationSeconds: number;
  staticDurationSeconds: number;
  delaySeconds: number;
  distanceMeters: number;
}

/** Ena smer, kot jo vrne `GET /dashboard/commute`. */
export interface CommuteLeg {
  direction: CommuteDirection;
  label: string;
  from: string;
  to: string;
  mapEmbedUrl: string | null;
  travel: CommuteTravel | null;
  travelUnavailable: CommuteTravelUnavailable | null;
  stale: boolean;
  ageSeconds: number | null;
}

export interface CommuteResponse {
  configured: boolean;
  legs: CommuteLeg[];
  source: { nextPollSeconds: number; attribution: { text: string; url: string } };
}

const ICONS: Record<CommuteDirection, string> = {
  'to-work': 'business-outline',
  'to-home': 'home-outline',
};

export function directionIcon(direction: CommuteDirection): string {
  return ICONS[direction];
}

// Formatiranje je drago, formatar pa je brez stanja — zato je ustvarjen enkrat.
// `hourCycle: 'h23'` je bistven: pri `hour12: false` nekatera okolja vrnejo "24" za polnoč
// in izračun bi ob polnoči padel v napačno smer.
const CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export interface LjubljanaClock {
  hour: number;
  minute: number;
  second: number;
}

/** Ura, minuta in sekunda v Ljubljanski coni. NIKOLI `date.getHours()`. */
export function ljubljanaClock(now: Date): LjubljanaClock {
  const parts = CLOCK.formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { hour: value('hour'), minute: value('minute'), second: value('second') };
}

/** Smer, ki je zdaj zgoraj: dopoldne v službo, od 12:00 naprej domov. */
export function commuteDirection(now: Date): CommuteDirection {
  return ljubljanaClock(now).hour < COMMUTE_SWITCH_HOUR ? 'to-work' : 'to-home';
}

/**
 * Smeri v vrstnem redu za prikaz: ustrezna prva, druga pod njo. Vrstni red je edino, kar
 * ploščica na odjemalcu odloči — vsebina smeri pride s strežnika taka, kot je.
 */
export function orderedCommuteLegs(legs: readonly CommuteLeg[], now: Date): CommuteLeg[] {
  const primary = commuteDirection(now);
  const first = legs.filter((leg) => leg.direction === primary);
  const rest = legs.filter((leg) => leg.direction !== primary);
  return [...first, ...rest];
}

/**
 * Koliko časa do naslednje menjave smeri (poldne ali polnoč po Ljubljani), omejeno navzgor
 * s `COMMUTE_MAX_WAIT_MS`. Ploščica s tem ve, kdaj se mora sama prerisati — in ob 12:00 se
 * vrstni red zamenja brez ponovnega nalaganja strani.
 */
export function msUntilNextSwitch(now: Date): number {
  const { hour, minute, second } = ljubljanaClock(now);
  const secondsOfDay = hour * 3600 + minute * 60 + second;
  const switchAt = COMMUTE_SWITCH_HOUR * 3600;
  // Po poldnevu je naslednja menjava polnoč. Izračun je v LOKALNEM času, zato je na dan
  // prehoda na poletni/zimski čas lahko do ene ure narobe — kar zgornja meja pobere.
  const secondsLeft = secondsOfDay < switchAt ? switchAt - secondsOfDay : 24 * 3600 - secondsOfDay;
  return Math.min(secondsLeft * 1000, COMMUTE_MAX_WAIT_MS);
}

/**
 * Kdaj naslednja osvežitev: prej od menjave smeri in od izteka strežniškega predpomnilnika.
 * Pogosteje od `nextPollSeconds` klicati nima smisla — strežnik do izteka TTL vrača isti
 * podatek in zunanjega vira ne kliče (člen VIII).
 */
export function nextRefreshMs(nextPollSeconds: number, now: Date): number {
  return Math.min(Math.max(nextPollSeconds, 30) * 1000, msUntilNextSwitch(now));
}

// ─────────────────────────── izpis ───────────────────────────
//
// Zaokroževanje na minute je zavestno: sekunde v oceni trajanja poti so navidezna
// natančnost — vir sam napove razpon, ne sekunde.

/** 2400 → "40 min", 5400 → "1 h 30 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * Zamuda kot besedilo, ali `null`, kadar je zanemarljiva. Meja ene minute obstaja zato, ker
 * "+0 min zaradi prometa" ni podatek, je šum — vir vrne razliko tudi takrat, ko prometa ni.
 */
export function formatDelay(delaySeconds: number): string | null {
  if (delaySeconds < 60) return null;
  return `+${formatDuration(delaySeconds)} zaradi prometa`;
}

/** 18 400 → "18,4 km" (decimalna vejica, člen X). Pod kilometrom v metrih. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  const value = km < 100 ? km.toFixed(1) : String(Math.round(km));
  return `${value.replace('.', ',')} km`;
}

/** Slovensko pojasnilo, zakaj časa poti ni — vsako stanje ima svojo pot ven (člen VII). */
export function travelUnavailableMessage(reason: CommuteTravelUnavailable): string {
  switch (reason) {
    case 'not-configured':
      return 'Kraja še nista nastavljena.';
    case 'no-api-key':
      return 'Čas poti ni na voljo: strežnik nima ključa za Google Routes API.';
    case 'no-route':
      return 'Med tema krajema ni bilo mogoče izračunati poti.';
    case 'source-unavailable':
      return 'Čas poti trenutno ni dosegljiv.';
  }
}
