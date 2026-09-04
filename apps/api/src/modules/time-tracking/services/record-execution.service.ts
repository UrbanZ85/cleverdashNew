import { ActionAttemptModel } from '../models/action-attempt.model.js';
import { ActionRecordModel } from '../models/action-record.model.js';
import { PlannedActionModel } from '../models/planned-action.model.js';
import type { ExecuteResult, RetryableResult } from './action-executor.service.js';

// Deljeno med US1 (ročni/API endpoint) in US2 (scheduler) — ista logika beleženja izvedbe
// ne glede na to, kdo jo je sprožil (člen I: ena resnica, ne dve vzporedni implementaciji).

export interface RecordExecutionParams {
  localDate: string;
  actionName: string;
  locationName: string;
  result: ExecuteResult;
  source: 'manual' | 'api' | 'schedule';
  plannedAction: InstanceType<typeof PlannedActionModel> | null;
  // 004: obvezen, kadar `plannedAction` ne obstaja (ad-hoc ročna/API akcija) — sicer se
  // izpelje iz `plannedAction.userId` (denormaliziran, glej data-model.md).
  userId: string;
}

/** Zapiše izvedeno akcijo v zgodovino (FR-050) in po potrebi zaključi ujemajočo se
 * načrtovano akcijo (FR-042). `already_done` in `not_verified` sta prav tako zapisana —
 * tiha napaka ni sprejemljiva (člen VI). */
export async function recordExecution(params: RecordExecutionParams): Promise<void> {
  const { localDate, actionName, locationName, result, source, plannedAction } = params;
  const userId = plannedAction?.userId ?? params.userId;
  const finalOutcome = result.outcome === 'not_verified' ? 'failed' : result.outcome;
  const now = new Date();

  if ('durationMs' in result) {
    await ActionAttemptModel.create({
      userId,
      plannedActionId: plannedAction?._id ?? null,
      attemptNumber: (plannedAction?.attemptCount ?? 0) + 1,
      startedAt: now,
      finishedAt: now,
      outcome: result.verified ? 'verified' : 'not_verified',
      availableActionsBefore: result.availableActionsBefore,
      availableActionsAfter: result.availableActionsAfter,
      clockStateBefore: result.stateBefore,
      clockStateAfter: result.stateAfter,
      errorMessage: result.errorMessage ?? null,
      screenshotPath: result.screenshotPath ?? null,
      durationMs: result.durationMs,
    });
  }

  if (plannedAction) {
    plannedAction.state = finalOutcome as typeof plannedAction.state;
    plannedAction.source = source;
    plannedAction.completedAt = now;
    plannedAction.attemptCount = (plannedAction.attemptCount ?? 0) + 1;
    plannedAction.stateBefore = result.stateBefore;
    if ('stateAfter' in result) plannedAction.stateAfter = result.stateAfter;
    if ('errorMessage' in result) plannedAction.failureReason = result.errorMessage ?? null;
    await plannedAction.save();
  }

  await ActionRecordModel.create({
    userId,
    localDate,
    plannedActionId: plannedAction?._id ?? null,
    profileId: plannedAction?.profileId ?? null,
    profileName: plannedAction ? 'Načrtovan profil' : 'Ročna akcija',
    locationName,
    actionName,
    scheduledAt: plannedAction?.scheduledAt ?? now,
    completedAt: now,
    finalOutcome,
    source,
    stateBefore: result.stateBefore,
    stateAfter: 'stateAfter' in result ? result.stateAfter : result.stateBefore,
    attemptSummary: { count: 1, firstAt: now, lastAt: now },
    failureReason: 'errorMessage' in result ? (result.errorMessage ?? null) : null,
  });
}

export type RetryOutcome = 'succeeded' | 'already_done' | 'retry_scheduled' | 'failed_exhausted';

/**
 * US3: za samodejno (`schedule`) izvedene akcije — za razliko od `recordExecution`, ki
 * vsak `not_verified` takoj zaključi kot `failed` (pravilno za US1/US11, kjer ni
 * ponovnega poskusa), tukaj `not_verified` NAJPREJ preveri, ali so poskusi izčrpani.
 * Vsak poskus se zabeleži (FR-032), a `ActionRecord`/dokončno stanje nastane šele ob
 * uspehu ali izčrpanju — docs/legacy-engine.md §4.5: nikoli tih "uspeh".
 */
export async function recordScheduledAttempt(params: {
  locationName: string;
  result: RetryableResult;
  plannedAction: InstanceType<typeof PlannedActionModel>;
  maxAttempts: number;
  retryBackoffSeconds: number[];
}): Promise<RetryOutcome> {
  const { locationName, result, plannedAction, maxAttempts, retryBackoffSeconds } = params;
  const now = new Date();

  if ('durationMs' in result) {
    await ActionAttemptModel.create({
      userId: plannedAction.userId,
      plannedActionId: plannedAction._id,
      attemptNumber: (plannedAction.attemptCount ?? 0) + 1,
      startedAt: now,
      finishedAt: now,
      outcome: result.verified ? 'verified' : 'not_verified',
      availableActionsBefore: result.availableActionsBefore,
      availableActionsAfter: result.availableActionsAfter,
      clockStateBefore: result.stateBefore,
      clockStateAfter: result.stateAfter,
      errorMessage: result.errorMessage ?? null,
      screenshotPath: result.screenshotPath ?? null,
      durationMs: result.durationMs,
    });
  }

  plannedAction.attemptCount = (plannedAction.attemptCount ?? 0) + 1;
  plannedAction.stateBefore = result.stateBefore;
  if ('stateAfter' in result) plannedAction.stateAfter = result.stateAfter;

  if (result.outcome === 'succeeded' || result.outcome === 'already_done') {
    plannedAction.state = result.outcome;
    plannedAction.source = 'schedule';
    plannedAction.completedAt = now;
    await plannedAction.save();
    await finalizeActionRecord(plannedAction, locationName, result.outcome, result);
    return result.outcome;
  }

  // not_verified: preveri, ali so poskusi izčrpani.
  if (plannedAction.attemptCount >= maxAttempts) {
    plannedAction.state = 'failed';
    plannedAction.source = 'schedule';
    plannedAction.completedAt = now;
    plannedAction.failureReason = result.errorMessage ?? 'Klik ni bil potrjen po vseh poskusih.';
    await plannedAction.save();
    await finalizeActionRecord(plannedAction, locationName, 'failed', result);
    return 'failed_exhausted';
  }

  // Naraščajoč zamik (docs/legacy-engine.md §4.4-duh: eksplicitna, shranjena vrednost, ne
  // preračunana ob vsakem branju). Ostane v `due`, da ga naslednji tik znova pobere.
  const backoffIndex = plannedAction.attemptCount - 1;
  const backoffSeconds = retryBackoffSeconds[backoffIndex] ?? retryBackoffSeconds.at(-1) ?? 60;
  plannedAction.state = 'due';
  plannedAction.nextAttemptAt = new Date(now.getTime() + backoffSeconds * 1000);
  await plannedAction.save();
  return 'retry_scheduled';
}

/**
 * US10, FR-045/FR-062: zapre akcijo kot `missed` (zamuda nad `maxDelayMinutes`, ali
 * polnočno zaprtje) in zapiše `ActionRecord` — FR-050 zahteva zapis za VSAKO akcijo, tudi
 * zamujeno, ne samo za uspešno/neuspešno izvedeno.
 */
export async function finalizeAsMissed(
  plannedAction: InstanceType<typeof PlannedActionModel>,
  locationName: string,
  reason: string,
): Promise<void> {
  const now = new Date();
  plannedAction.state = 'missed';
  plannedAction.completedAt = now;
  plannedAction.failureReason = reason;
  await plannedAction.save();

  await ActionRecordModel.create({
    userId: plannedAction.userId,
    localDate: plannedAction.localDate,
    plannedActionId: plannedAction._id,
    profileId: plannedAction.profileId,
    profileName: 'Načrtovan profil',
    locationName,
    actionName: plannedAction.actionName,
    scheduledAt: plannedAction.scheduledAt,
    completedAt: now,
    finalOutcome: 'missed',
    source: 'schedule',
    stateBefore: plannedAction.stateBefore ?? null,
    stateAfter: plannedAction.stateAfter ?? null,
    attemptSummary: { count: plannedAction.attemptCount ?? 0, firstAt: plannedAction.get('createdAt'), lastAt: now },
    failureReason: reason,
  });
}

async function finalizeActionRecord(
  plannedAction: InstanceType<typeof PlannedActionModel>,
  locationName: string,
  finalOutcome: 'succeeded' | 'already_done' | 'failed',
  result: RetryableResult,
): Promise<void> {
  await ActionRecordModel.create({
    userId: plannedAction.userId,
    localDate: plannedAction.localDate,
    plannedActionId: plannedAction._id,
    profileId: plannedAction.profileId,
    profileName: 'Načrtovan profil',
    locationName,
    actionName: plannedAction.actionName,
    scheduledAt: plannedAction.scheduledAt,
    completedAt: new Date(),
    finalOutcome,
    source: 'schedule',
    stateBefore: result.stateBefore,
    stateAfter: 'stateAfter' in result ? result.stateAfter : result.stateBefore,
    attemptSummary: { count: plannedAction.attemptCount, firstAt: plannedAction.get('createdAt'), lastAt: new Date() },
    failureReason: plannedAction.failureReason ?? null,
  });
}
