// research.md §1: stara stran nikoli ne pokaže vseh gumbov hkrati — samo tiste, ki so v
// trenutnem stanju smiselni. Množica razpoložljivih gumbov JE berljivo stanje ure. Ta
// funkcija je edini kraj, ki to pravilo formalizira; ClockPortal, ActionExecutor in
// ReminderService jo vsi kličejo enako, namesto da bi vsak sam ugibal.
//
// Vrstni red preverjanja je pomemben: "Konec malice" se preveri PRED "Konec dela", ker sta
// med odmorom lahko na voljo oba (docs/legacy-engine.md §2).

export type ClockState = 'OFF_DUTY' | 'ON_DUTY' | 'ON_BREAK' | 'UNKNOWN';

/** Gumbi, ki delo ZAČNEJO. Vsi vodijo v `ON_DUTY` in se med sabo izključujejo — razlikujejo
 * se po kraju, s katerega delo poteka. Kateri od njih velja, določa LOKACIJA
 * (`TrackingLocation.startAction`, FR-090), ne profil: isti urnik, izveden iz pisarne, od
 * doma ali s terena, pritisne drug gumb, časi in vse ostale akcije pa ostanejo isti. */
export const START_ACTIONS = ['Prijava na delo', 'Prihod na delo', 'Delo od doma', 'Delo na terenu'] as const;
export type StartAction = (typeof START_ACTIONS)[number];

const END_BREAK_ACTIONS = ['Konec malice'];
const ON_DUTY_ACTIONS = ['Malica', 'Odmor med delom', 'Konec dela'];

export function isStartAction(actionName: string): actionName is StartAction {
  return (START_ACTIONS as readonly string[]).includes(actionName);
}

/** Ime gumba, ki naj se dejansko pritisne na lokaciji: akcija za začetek dela prevzame gumb
 * lokacije, vse ostale (`Malica`, `Konec malice`, `Konec dela`) ostanejo nespremenjene.
 * Uporabljeno ob sestavljanju načrta in v predogledu, da je v načrtu, zgodovini in obvestilu
 * zapisan tisti gumb, ki je bil res pritisnjen — ne tisti, ki je zapisan v profilu. */
export function resolveActionForLocation(actionName: string, locationStartAction?: string | null): string {
  if (!locationStartAction || !isStartAction(actionName)) return actionName;
  return locationStartAction;
}

/**
 * Izpelje stanje ure iz trenutno razpoložljivih akcij. Prazen nabor NI veljavno stanje —
 * je okvara (FR-022), zato vrne `UNKNOWN`, ne privzeto `OFF_DUTY`.
 */
export function deriveClockState(availableActions: readonly string[]): ClockState {
  if (availableActions.length === 0) return 'UNKNOWN';

  const has = (names: readonly string[]) => names.some((n) => availableActions.includes(n));

  // Konec malice PRED Konec dela — med odmorom sta lahko na voljo oba.
  if (has(END_BREAK_ACTIONS)) return 'ON_BREAK';
  if (has(ON_DUTY_ACTIONS)) return 'ON_DUTY';
  if (has(START_ACTIONS)) return 'OFF_DUTY';
  return 'UNKNOWN';
}

/** Pričakovano stanje potem, ko akcija uspešno učinkuje — research.md §1, tabela. */
const EXPECTED_STATE_AFTER: Record<string, ClockState> = {
  'Prijava na delo': 'ON_DUTY',
  'Prihod na delo': 'ON_DUTY',
  'Delo od doma': 'ON_DUTY',
  'Delo na terenu': 'ON_DUTY',
  Malica: 'ON_BREAK',
  'Odmor med delom': 'ON_BREAK',
  'Konec malice': 'ON_DUTY',
  'Konec dela': 'OFF_DUTY',
};

/** Dovoljeno stanje PRED izvedbo dane akcije — če trenutno stanje ni med njimi, klik ni
 * smiseln (FR-033: `unexpected_state`, brez klika). */
const ALLOWED_STATE_BEFORE: Record<string, ClockState[]> = {
  'Prijava na delo': ['OFF_DUTY'],
  'Prihod na delo': ['OFF_DUTY'],
  'Delo od doma': ['OFF_DUTY'],
  'Delo na terenu': ['OFF_DUTY'],
  Malica: ['ON_DUTY'],
  'Odmor med delom': ['ON_DUTY'],
  'Konec malice': ['ON_BREAK'],
  'Konec dela': ['ON_DUTY'],
};

export function expectedStateAfter(actionName: string): ClockState | undefined {
  return EXPECTED_STATE_AFTER[actionName];
}

export function isStateAllowedBefore(actionName: string, state: ClockState): boolean {
  const allowed = ALLOWED_STATE_BEFORE[actionName];
  return allowed ? allowed.includes(state) : false;
}

/** `true`, če je trenutno stanje že tisto, ki bi nastopilo PO uspešni izvedbi akcije —
 * FR-033, `already_done`, brez klika. */
export function isAlreadyDone(actionName: string, currentState: ClockState): boolean {
  return expectedStateAfter(actionName) === currentState;
}

/** Ena akcija dneva, kot jo za presojo verige potrebuje `brokenChainPredecessor`. */
export interface DayChainAction {
  actionName: string;
  actionOrder: number;
  state: string;
}

/** Stanja, ki verigo dneva pretrgajo: akcija bi se morala zgoditi, pa se ni. `skipped` in
 * `cancelled` nista med njimi — tam je bila odločitev, da akcije ne bo, zavestna (uporabnikova
 * ali koledarjeva) in uporabnik ve, kaj sledi. */
const CHAIN_BREAKING_STATES = ['failed', 'missed'];

/**
 * Prva akcija dneva pred `actionOrder`, ki se ni zgodila, čeprav bi se morala — ali `null`,
 * kadar je veriga cela.
 *
 * Zakaj to sploh potrebujemo: `already_done` (FR-033) pomeni "stanje je že tisto, ki bi
 * nastopilo po tej akciji", in je praviloma dobra novica — uporabnik je akcijo opravil sam.
 * Kadar je pred njo padla druga akcija, pa isto stanje pomeni ravno nasprotno. Primer iz
 * prakse: "Malica" trikrat ni bila potrjena, zato je ura ostala `ON_DUTY` — kar je hkrati
 * pričakovano stanje PO "Konec malice", zato je bil "Konec malice" razglašen za
 * `already_done`. Ena padla akcija je naslednjo naredila videti opravljeno in dan je bil v
 * zgodovini videti cel (člen VI: tih "uspeh" ni sprejemljiv).
 *
 * Čista funkcija, ker je to sklep o stanju in ne o bazi: klicatelj prinese akcije dneva.
 */
export function brokenChainPredecessor(
  actionOrder: number,
  day: readonly DayChainAction[],
): DayChainAction | null {
  return (
    day
      .filter((a) => a.actionOrder < actionOrder && CHAIN_BREAKING_STATES.includes(a.state))
      .sort((a, b) => a.actionOrder - b.actionOrder)[0] ?? null
  );
}
