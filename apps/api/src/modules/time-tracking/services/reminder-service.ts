import { expectedStateAfter } from '../../../domain/clock-state.js';
import { notify } from '../../../platform/notifications/notify.service.js';
import { resolveLocationForPortal } from './location-resolver.service.js';
import type { ClockPortal } from '../clock-portal/index.js';
import type { PlannedActionModel } from '../models/planned-action.model.js';
import type { TrackingProfileModel } from '../models/tracking-profile.model.js';

// FR-040/FR-041/FR-042: v REMIND_ONLY sistem NIKOLI ne klikne. Ob načrtovanem času plus
// strpnem obdobju prebere stanje; če sprememba ni nastopila, opozori. Opozorilo se
// ponavlja do nastavljenega števila ponovitev. Če uporabnik akcijo opravi sam, naslednje
// branje to zazna in opozarjanje se ustavi SAMO OD SEBE — brez posebne logike za to, ker
// je "ali je stanje že pravo" preverjeno pred vsakim opozorilom, ne samo enkrat.

export type ReminderCheckOutcome = 'completed_externally' | 'not_yet_due' | 'reminded' | 'reminder_suppressed' | 'reminders_exhausted';

export async function checkReminder(
  plannedAction: InstanceType<typeof PlannedActionModel>,
  profile: InstanceType<typeof TrackingProfileModel>,
  clockPortal: ClockPortal,
): Promise<ReminderCheckOutcome> {
  const { locationDoc, resolved } = await resolveLocationForPortal(
    String(plannedAction.userId),
    String(plannedAction.locationId),
  );
  const reading = await clockPortal.readState(resolved);

  // FR-042: uporabnik je akcijo opravil sam (na telefonu, računalniku ali v aplikaciji) —
  // zazna se tukaj, PRED pošiljanjem kakršnega koli opozorila, kar opozarjanje ustavi
  // samo od sebe, brez posebnega "prekliči opozarjanje" koraka.
  if (expectedStateAfter(plannedAction.actionName) === reading.state) {
    plannedAction.state = 'succeeded';
    plannedAction.source = 'schedule';
    plannedAction.stateBefore = reading.state;
    plannedAction.stateAfter = reading.state;
    plannedAction.completedAt = new Date();
    await plannedAction.save();
    return 'completed_externally';
  }

  const graceMs = profile.graceMinutes * 60_000;
  const dueAt = plannedAction.scheduledAt.getTime() + graceMs;
  if (Date.now() < dueAt) {
    plannedAction.state = 'due';
    await plannedAction.save();
    return 'not_yet_due';
  }

  if (plannedAction.reminderCount >= profile.maxReminders) {
    // FR-041: opozarjanje se ustavi po doseženi meji — akcija sama ostane odprta (FR-045
    // jo bo ob polnoči zaprla kot `missed`, če ostane nedokončana).
    plannedAction.state = 'due';
    await plannedAction.save();
    return 'reminders_exhausted';
  }

  const intervalMs = profile.reminderIntervalMinutes * 60_000;
  const readyForNextReminder =
    !plannedAction.lastReminderAt || Date.now() - plannedAction.lastReminderAt.getTime() >= intervalMs;

  if (!readyForNextReminder) {
    plannedAction.state = 'due';
    await plannedAction.save();
    return 'reminder_suppressed';
  }

  const nextReminderNumber = plannedAction.reminderCount + 1;
  await notify({
    type: 'reminder',
    title: 'Beleženje časa — opozorilo',
    body: `Nisi pritisnil gumba "${plannedAction.actionName}" (načrtovano ob ${plannedAction.baseLocalTime.slice(0, 5)}) na lokaciji ${locationDoc.name}.`,
    plannedActionId: String(plannedAction._id),
    // FR-073/FR-074: vsak zaporeden opomnik je NOV dedupeKey — enak opomnik se ne podvoji,
    // a naslednji opomnik v isti akciji ni isti dogodek kot prejšnji.
    dedupeKey: `reminder:${String(plannedAction._id)}:${nextReminderNumber}`,
    deepLink: '/time-tracking',
  });

  plannedAction.reminderCount = nextReminderNumber;
  plannedAction.lastReminderAt = new Date();
  plannedAction.state = 'due';
  await plannedAction.save();
  return 'reminded';
}
