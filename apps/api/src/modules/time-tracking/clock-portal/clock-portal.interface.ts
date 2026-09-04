import type { ClockState } from '../../../domain/clock-state.js';

// research.md §1: edini stik z zunanjim svetom, dve operaciji, obe brez STRANSKIH UČINKOV
// NAD DOMENSKIM STANJEM (branje ne spremeni ničesar; izvedba spremeni samo tuje stanje, ne
// naše lastno). Vse ostalo (kdaj, kaj, ali je delovni dan) je čista logika v `domain/`, ki
// tega vmesnika sploh ne pozna. Člen IX: domenska plast je testabilna brez tega vmesnika,
// ta vmesnik pa je testabilen z eno samo lažno izvedbo (`FakeClockPortal`).

/** Lokacija z že razrešenim raztrosom koordinat — domena odloči o številkah
 * (`docs/legacy-engine.md` §3), portal jih samo uporabi. */
export interface ResolvedLocation {
  url: string;
  /** NEOBVEZNI: če je pošiljanje lokacije na tej lokaciji izklopljeno (FR-094), ju resolver
   * ne vstavi. Portal brskalniku takrat ne podeli dovoljenja za geolokacijo in mu ne nastavi
   * lege — stran vidi napravo brez znane lokacije. */
  latitude?: number;
  longitude?: number;
  cookieName: string;
  cookieValue: string;
  cookieDomain: string;
  /** Unix SEKUNDE, kot jih pričakuje Puppeteerjev `setCookie` (in kot jih je hranilo staro
   * okolje v `cookie_property_expires`). Če roka ne poznamo, ostane neopredeljen in piškotek
   * je sejni — tako je delovala prejšnja izvedba tega modula. */
  cookieExpiresAt?: number;
}

/** Zakaj branje ali izvedba ni uspela — loči vzroke, ki so v starem sistemu bili videti
 * enako (FR-022). `ok` pomeni uspešno branje, ne diagnozo napake. */
export type DiagnosticsReason =
  | 'ok'
  | 'session_expired'
  | 'page_unreachable'
  | 'selector_not_found'
  | 'geolocation_denied'
  | 'browser_launch_failed'
  | 'timeout';

export interface Diagnostics {
  reason: DiagnosticsReason;
  message?: string;
  hint?: string;
}

export interface StateReading {
  state: ClockState;
  availableActions: string[];
  readAt: Date;
  diagnostics: Diagnostics;
}

/** Izid ene izvedbe akcije — vključno z verifikacijo. Portal PO KLIKU sam znova prebere
 * stanje (research.md §1: "ponovno naloži stran"); klicatelj (`ActionExecutor`) svoje
 * `readState()` kliče LOČENO, samo za predpreverjanje pred klikom (FR-033). */
export interface ActionOutcome {
  clicked: boolean;
  stateBefore: ClockState;
  stateAfter: ClockState;
  availableActionsBefore: string[];
  availableActionsAfter: string[];
  /** `true` samo, če je ponovno branje potrdilo pričakovano spremembo (FR-030). Klik brez
   * potrditve NI uspeh — člen VI, `docs/legacy-engine.md` §4.5. */
  verified: boolean;
  durationMs: number;
  screenshotPath?: string;
  errorMessage?: string;
  diagnostics: Diagnostics;
}

export interface ClockPortal {
  /** Ne spremeni ničesar — samo bere. */
  readState(location: ResolvedLocation): Promise<StateReading>;
  /** Pritisne gumb `actionName`, nato ponovno prebere stanje in vrne PREVERJEN izid. */
  performAction(location: ResolvedLocation, actionName: string): Promise<ActionOutcome>;
}
