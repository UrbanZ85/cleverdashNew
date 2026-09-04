import { DateTime } from 'luxon';
import { AutomationSettingModel } from '../models/automation-setting.model.js';
import { PlannedActionModel } from '../models/planned-action.model.js';
import { TrackingProfileModel } from '../models/tracking-profile.model.js';
import { buildPlanForDay } from './schedule-builder.service.js';
import { ljubljanaCalendarDay } from '../../../domain/timezone.js';

const ZONE = 'Europe/Ljubljana';

export interface AutomationState {
  /** Stikalo NAMESTITVE (`SCHEDULER_ENABLED`) — tik sploh teče. */
  schedulerEnabled: boolean;
  /** Stikalo OSEBE — ta uporabnik je avtomatiko vklopil. */
  userEnabled: boolean;
  /** Oboje hkrati. Samo to pomeni, da se bo kaj res izvedlo. */
  effective: boolean;
  changedAt: string | null;
}

/** Ali ima ta uporabnik avtomatiko vklopljeno. Manjkajoč dokument = izklopljeno
 * (automation-setting.model.ts). */
export async function isAutomationEnabledForUser(userId: string): Promise<boolean> {
  const doc = await AutomationSettingModel.findOne({ userId }).lean();
  return doc?.enabled === true;
}

/** Presejalnik za korake tika: vrne množico `userId`-jev z vklopljeno avtomatiko. Ena
 * poizvedba na tik namesto ene na profil/akcijo. */
export async function enabledUserIds(): Promise<Set<string>> {
  const docs = await AutomationSettingModel.find({ enabled: true }, { userId: 1 }).lean();
  return new Set(docs.map((d) => String(d.userId)));
}

export async function readAutomationState(userId: string, schedulerEnabled: boolean): Promise<AutomationState> {
  const doc = await AutomationSettingModel.findOne({ userId }).lean();
  const userEnabled = doc?.enabled === true;
  return {
    schedulerEnabled,
    userEnabled,
    effective: schedulerEnabled && userEnabled,
    changedAt: doc?.changedAt ? doc.changedAt.toISOString() : null,
  };
}

export interface AutomationChangeResult extends AutomationState {
  /** Koliko načrtovanih akcij je izklop preklical. */
  cancelled: number;
  /** Koliko jih je vklop na novo sestavil za danes in jutri. */
  rebuilt: number;
}

/**
 * Premakne osebno stikalo in TAKOJ uveljavi posledico — brez tega bi sprememba obveljala
 * šele ob naslednjem tiku in bi bila videti, kot da gumb ne dela.
 *
 * Izklop: prihodnje še neizvedene akcije se prekličejo (isti postopek kot ob brisanju profila
 * ali vnosu odsotnosti, router.ts). Zgodovina se ne dotakne.
 *
 * Vklop: preklicane akcije iz urnika za danes in naprej se ODSTRANIJO, nato se načrt sestavi
 * znova. Brisanje je nujno, ker `buildPlanForDay` piše z `upsert` na
 * (localDate, profileId, actionName) — preklican zapis bi se ujel in nič se ne bi obnovilo,
 * torej bi bil preostanek dneva izgubljen. Odstranijo se samo zapisi s `source: "schedule"`
 * v stanju `cancelled`; ročne akcije in vse, kar se je že izvedlo, ostanejo. Če je dan medtem
 * postal prost (dopust, praznik), ga `buildPlanForDay` tako ali tako ne bo obnovil — presoja
 * ostane na enem mestu.
 */
export async function setAutomationEnabled(
  userId: string,
  enabled: boolean,
  schedulerEnabled: boolean,
): Promise<AutomationChangeResult> {
  const changedAt = new Date();
  await AutomationSettingModel.findOneAndUpdate(
    { userId },
    { enabled, changedAt },
    { upsert: true, new: true },
  );

  const today = ljubljanaCalendarDay(new Date());
  let cancelled = 0;
  let rebuilt = 0;

  if (!enabled) {
    const result = await PlannedActionModel.updateMany(
      { userId, localDate: { $gte: today }, state: { $in: ['planned', 'due'] } },
      { state: 'cancelled' },
    );
    cancelled = result.modifiedCount;
  } else {
    await PlannedActionModel.deleteMany({
      userId,
      localDate: { $gte: today },
      state: 'cancelled',
      source: 'schedule',
    });

    const tomorrow = ljubljanaCalendarDay(
      DateTime.fromJSDate(new Date(), { zone: 'utc' }).setZone(ZONE).plus({ days: 1 }).toJSDate(),
    );
    const profiles = await TrackingProfileModel.find({ userId, active: true });
    for (const profile of profiles) {
      for (const localDate of [today, tomorrow]) {
        const result = await buildPlanForDay(profile, localDate);
        rebuilt += result.created;
      }
    }
  }

  return {
    schedulerEnabled,
    userEnabled: enabled,
    effective: schedulerEnabled && enabled,
    changedAt: changedAt.toISOString(),
    cancelled,
    rebuilt,
  };
}
