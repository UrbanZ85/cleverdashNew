import { isAlreadyDone, isStateAllowedBefore, type ClockState } from '../../../domain/clock-state.js';
import type { ActionOutcome, ClockPortal, Diagnostics, ResolvedLocation } from '../clock-portal/index.js';

// research.md §1, plan.md B.4: predpreverjanje (already_done/unexpected_state) pred
// klikom, verifikacija po njem. Točki "že opravljeno" in "stanje pred ni dovoljeno" sta
// ključni varovalki, ki jih star sistem ni imel — preprečita klik, ki bi vpisal napačno
// stvar, in odpravita napačne alarme, ko je uporabnik akcijo že opravil sam.

export interface AlreadyDoneResult {
  outcome: 'already_done';
  stateBefore: ClockState;
  availableActionsBefore: string[];
  diagnostics: Diagnostics;
}

export interface UnexpectedStateResult {
  outcome: 'unexpected_state';
  stateBefore: ClockState;
  availableActionsBefore: string[];
  diagnostics: Diagnostics;
}

export interface ExecutedResult extends ActionOutcome {
  outcome: 'succeeded' | 'not_verified';
}

export type ExecuteResult = AlreadyDoneResult | UnexpectedStateResult | ExecutedResult;

/** `ExecuteResult` brez `unexpected_state` — ta se obravnava LOČENO in prej (klicatelj ga
 * filtrira, preden pokliče kar koli, kar rezultat zapiše), zato ga funkcije za beleženje
 * izvedbe (record-execution.service.ts) v svojem tipu sploh ne sprejmejo. */
export type RetryableResult = AlreadyDoneResult | ExecutedResult;

export class ActionExecutor {
  constructor(private readonly clockPortal: ClockPortal) {}

  async execute(location: ResolvedLocation, actionName: string): Promise<ExecuteResult> {
    const reading = await this.clockPortal.readState(location);

    // FR-033: stanje je že tisto, ki bi nastopilo PO akciji → already_done, brez klika.
    if (isAlreadyDone(actionName, reading.state)) {
      return {
        outcome: 'already_done',
        stateBefore: reading.state,
        availableActionsBefore: reading.availableActions,
        diagnostics: reading.diagnostics,
      };
    }

    // FR-033: akcija v trenutnem stanju ni smiselna → unexpected_state, brez klika. Ta
    // varovalka prepreči npr. "Prijava na delo" takoj po restartu, ko si že na delu.
    if (!isStateAllowedBefore(actionName, reading.state)) {
      return {
        outcome: 'unexpected_state',
        stateBefore: reading.state,
        availableActionsBefore: reading.availableActions,
        diagnostics: reading.diagnostics,
      };
    }

    const result = await this.clockPortal.performAction(location, actionName);
    return { ...result, outcome: result.verified ? 'succeeded' : 'not_verified' };
  }
}
