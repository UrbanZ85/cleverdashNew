import { deriveClockState, expectedStateAfter } from '../../../domain/clock-state.js';
import type {
  ActionOutcome,
  ClockPortal,
  Diagnostics,
  ResolvedLocation,
  StateReading,
} from './clock-portal.interface.js';

// research.md §9/§1: uporabljajo jo VSI enotski in integracijski testi, namesto pravega
// Chromiuma. Skriptirana zaporedja stanj, ne naključno vedenje — testi morajo biti
// deterministični (Kakovostno vrato 2).

type ClickEffect = 'apply' | 'no-effect' | 'error';

/**
 * Lažna izvedba `ClockPortal` za teste. Privzeto klik učinkuje pravilno (stanje se
 * premakne, kot ga narekuje `expectedStateAfter`); testi lahko skriptirajo drugačno
 * vedenje za posamezno ime akcije z `scriptClickNoEffect`/`scriptClickError`, ali
 * poljubno stanje z `setAvailableActions`.
 */
export class FakeClockPortal implements ClockPortal {
  private availableActions: string[] = [];
  private readError: Diagnostics | null = null;
  private clickEffects = new Map<string, ClickEffect>();
  /** Koliko klikov na posamezno ime akcije je bilo že opravljenih — za skripte, ki
   * uspejo šele po N-tem poskusu (Story 3: klik uspe šele ob ponovitvi). */
  private clickAttempts = new Map<string, number>();
  private succeedAfterAttempt = new Map<string, number>();

  setAvailableActions(actions: readonly string[]): void {
    this.availableActions = [...actions];
    this.readError = null;
  }

  /** Naslednje branje (in samo naslednje) vrne prazen nabor z dano diagnozo — simulira
   * okvaro (FR-022): potekla seja, nedosegljiva stran ipd. */
  scriptReadFailure(diagnostics: Diagnostics): void {
    this.readError = diagnostics;
  }

  /** Klik na `actionName` ne spremeni stanja — simulira neuspel klik (Story 2/3). */
  scriptClickNoEffect(actionName: string): void {
    this.clickEffects.set(actionName, 'no-effect');
  }

  /** Klik na `actionName` vrže napako (npr. brskalnik se je sesul). */
  scriptClickError(actionName: string): void {
    this.clickEffects.set(actionName, 'error');
  }

  /** Klik na `actionName` ne učinkuje prve `attemptsBeforeSuccess` poskuse, nato uspe —
   * za teste ponovnih poskusov (Story 3, quickstart.md §4 primer 5). */
  scriptSucceedAfterAttempt(actionName: string, attemptsBeforeSuccess: number): void {
    this.succeedAfterAttempt.set(actionName, attemptsBeforeSuccess);
  }

  reset(): void {
    this.availableActions = [];
    this.readError = null;
    this.clickEffects.clear();
    this.clickAttempts.clear();
    this.succeedAfterAttempt.clear();
  }

  async readState(_location: ResolvedLocation): Promise<StateReading> {
    if (this.readError) {
      return {
        state: 'UNKNOWN',
        availableActions: [],
        readAt: new Date(),
        diagnostics: this.readError,
      };
    }
    return {
      state: deriveClockState(this.availableActions),
      availableActions: [...this.availableActions],
      readAt: new Date(),
      diagnostics: { reason: 'ok' },
    };
  }

  async performAction(_location: ResolvedLocation, actionName: string): Promise<ActionOutcome> {
    const availableActionsBefore = [...this.availableActions];
    const stateBefore = deriveClockState(availableActionsBefore);

    const attemptNumber = (this.clickAttempts.get(actionName) ?? 0) + 1;
    this.clickAttempts.set(actionName, attemptNumber);

    const requiredAttempts = this.succeedAfterAttempt.get(actionName);
    const willSucceedByAttemptCount = requiredAttempts === undefined || attemptNumber > requiredAttempts;

    const effect = this.clickEffects.get(actionName) ?? 'apply';

    if (effect === 'error') {
      return {
        clicked: false,
        stateBefore,
        stateAfter: stateBefore,
        availableActionsBefore,
        availableActionsAfter: availableActionsBefore,
        verified: false,
        durationMs: 1,
        errorMessage: 'Simuliran padec brskalnika (FakeClockPortal.scriptClickError)',
        diagnostics: { reason: 'browser_launch_failed' },
      };
    }

    const shouldApply = effect === 'apply' && willSucceedByAttemptCount;

    if (shouldApply) {
      this.availableActions = nextAvailableActionsAfter(actionName, availableActionsBefore);
    }
    // effect === 'no-effect', ali effect === 'apply' a še ni dosežen zahtevan poskus:
    // stanje se namenoma NE spremeni (docs/legacy-engine.md §4.5 — verifikacija po dejanju,
    // ne po odsotnosti napake).

    const availableActionsAfter = [...this.availableActions];
    const stateAfter = deriveClockState(availableActionsAfter);
    const verified = expectedStateAfter(actionName) === stateAfter;

    return {
      clicked: true,
      stateBefore,
      stateAfter,
      availableActionsBefore,
      availableActionsAfter,
      verified,
      durationMs: 1,
      diagnostics: { reason: 'ok' },
    };
  }
}

/** Preprost prehodni model za testni namen: po kliku na znano akcijo se razpoložljivi
 * nabor premakne na "naslednjo pričakovano" akcijo, po vzoru
 * `docs/legacy-engine.md` §2 tabele. Uporablja se SAMO v `FakeClockPortal`, ne v domeni. */
function nextAvailableActionsAfter(actionName: string, current: readonly string[]): string[] {
  const NEXT: Record<string, string[]> = {
    'Prijava na delo': ['Malica', 'Konec dela'],
    'Prihod na delo': ['Malica', 'Konec dela'],
    'Delo od doma': ['Malica', 'Konec dela'],
    'Delo na terenu': ['Malica', 'Konec dela'],
    Malica: ['Konec malice'],
    'Odmor med delom': ['Konec malice'],
    'Konec malice': ['Malica', 'Konec dela'],
    'Konec dela': ['Prijava na delo'],
  };
  return NEXT[actionName] ?? [...current];
}
