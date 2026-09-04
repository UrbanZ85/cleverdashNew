import { DateTime } from 'luxon';
import { registerTickStep } from './scheduler.js';
import { TrackingProfileModel } from './models/tracking-profile.model.js';
import { PlannedActionModel } from './models/planned-action.model.js';
import { buildPlanForDay } from './services/schedule-builder.service.js';
import { ActionExecutor } from './services/action-executor.service.js';
import { recordExecution, recordScheduledAttempt, finalizeAsMissed } from './services/record-execution.service.js';
import { TrackingLocationModel } from './models/tracking-location.model.js';
import { resolveLocationForPortal } from './services/location-resolver.service.js';
import { checkReminder } from './services/reminder-service.js';
import { checkSessionExpiry } from './services/session-monitor.service.js';
import { reclaimStaleRunning } from './services/stale-running.service.js';
import { enabledUserIds } from './services/automation.service.js';
import { cleanupOldPlannedActions } from './services/history-cleanup.service.js';
import { getClockPortal } from './clock-portal/index.js';
import { brokenChainPredecessor } from '../../domain/clock-state.js';
import { ljubljanaCalendarDay } from '../../domain/timezone.js';
import { notify } from '../../platform/notifications/notify.service.js';
import { dispatchEvent, processPendingDeliveries } from '../../platform/webhooks/dispatcher.service.js';

// research.md §3: korak 1 "poskrbi za načrt" (T052) in korak 2 "pobere zapadle akcije,
// obdela zaporedno" (T053) — registrirana v `scheduler.ts`'s `tickSteps` prek
// `registerSchedulerSteps()`, klicane iz `createApp()` (main.ts). Ločeno od `router.ts`,
// ker gre za isto operacijo (branje+izvedba), sproženo po urniku namesto na dotik
// uporabnika.
//
// Registracija je namenoma IDEMPOTENTNA (`registered` zastavica), ker `createApp()` teče
// enkrat na test v celotnem paketu — brez tega bi vsak klic podvojil korake v `tickSteps`.

const ZONE = 'Europe/Ljubljana';
let registered = false;

export function registerSchedulerSteps(): void {
  if (registered) return;
  registered = true;
  // Vrstni red je pomemben: polnočno zaprtje MORA teči pred obdelavo zapadlih, sicer bi
  // tik še vedno poskušal klikniti akcijo za včeraj (FR-045).
  registerMidnightCloseStep();
  // Pred obdelavo zapadlih, da akcija, sproščena iz obtičalega `running`, dobi svojo priložnost
  // že v ISTEM tiku in ne šele čez 30 sekund.
  registerStaleRunningStep();
  registerBuildPlanStep();
  registerProcessDueStep();
  registerSessionExpiryStep();
  registerHistoryCleanupStep();
  registerWebhookRetryStep();
}

/** US11, FR-083: ponovni poskusi neuspelih webhook dostav, z eksponentnim zamikom
 * (dispatcher.service.ts). */
function registerWebhookRetryStep(): void {
  registerTickStep(async () => {
    await processPendingDeliveries();
    return {};
  });
}

/** US10, FR-045 (clarify seja 2026-08-20): akcija, ki ob prehodu koledarskega dne še ni
 * zaključena — vključno s tisto sredi niza ponovnih poskusov (FR-031) — se TAKOJ zapre kot
 * `missed`. Prednost pred obdelavo zapadlih zagotavlja vrstni red registracije zgoraj. */
function registerMidnightCloseStep(): void {
  registerTickStep(async () => {
    const today = ljubljanaCalendarDay(new Date());
    // Niz "YYYY-MM-DD" primerjan leksikografsko je enakovreden primerjavi datumov.
    const stale = await PlannedActionModel.find({
      localDate: { $lt: today },
      state: { $in: ['planned', 'due', 'running'] },
    });

    let actionsProcessed = 0;
    for (const action of stale) {
      const locationName = (await TrackingLocationModel.findById(action.locationId).lean())?.name ?? 'neznana lokacija';
      await finalizeAsMissed(
        action,
        locationName,
        'Koledarski dan se je iztekel, preden je bila akcija zaključena — polnočno zaprtje (FR-045).',
      );
      await notifyMissedDueToOutage(action);
      await dispatchWebhookForAction('action.missed', action);
      actionsProcessed += 1;
    }
    return { actionsProcessed };
  });
}

/** Člen V.2: vsak tik dohiti tisto, kar bi moralo biti narejeno in ni. Akcija, ki je obtičala
 * v `running` (proces je ugasnil sredi izvedbe), je natanko to — brez tega koraka obvisi do
 * polnoči in z edinstvenim indeksom blokira vsako ponovno sestavljanje načrta za tisti dan. */
function registerStaleRunningStep(): void {
  registerTickStep(async ({ env, logger }) => {
    const reclaimed = await reclaimStaleRunning(env, logger);
    return { actionsProcessed: reclaimed };
  });
}

/** US11, FR-083: pretvori PlannedAction v webhook payload — deljeno med vsemi dogodki
 * `action.*`, da oblika ni podvojena na treh krajih. */
async function dispatchWebhookForAction(
  event: 'action.succeeded' | 'action.failed' | 'action.missed',
  action: InstanceType<typeof PlannedActionModel>,
): Promise<void> {
  await dispatchEvent(event, {
    plannedActionId: String(action._id),
    profileId: String(action.profileId),
    localDate: action.localDate,
    actionName: action.actionName,
    scheduledAt: action.scheduledAt.toISOString(),
    state: action.state,
  });
}

/** US9 (T102): `deleteMany` je poceni tudi, če ne najde ničesar — brez ločenega "enkrat na
 * dan" zaklepa, iz istega razloga kot registerSessionExpiryStep zgoraj. */
function registerHistoryCleanupStep(): void {
  registerTickStep(async () => {
    await cleanupOldPlannedActions();
    return {};
  });
}

/** US8, FR-063: "dnevno" preverjanje — brez ločenega časovnega zamika, ker
 * `notify()`-jev `dedupeKey` (na dan preostanka) naravno prepreči, da bi isti prag
 * (7/3/1 dan) sprožil več kot eno obvestilo na dan, ne glede na to, kako pogosto teče tik. */
function registerSessionExpiryStep(): void {
  registerTickStep(async () => {
    await checkSessionExpiry();
    return {};
  });
}

/** Samo za teste, ki eksplicitno preverjajo `scheduler.ts` v izolaciji prek
 * `resetTickStepsForTests()` — po klicu je treba `registerSchedulerSteps()` poklicati
 * znova, če je resnično potrebno obnoviti korake 002 v istem testnem procesu. */
export function resetSchedulerStepsRegistrationForTests(): void {
  registered = false;
}

/** T052: za [danes, jutri] in vsak aktiven profil poskrbi, da načrt obstaja. Vedno kliče
 * `buildPlanForDay` (idempotentno prek upsert-a) — brez ločenega "ali že obstaja"
 * preverjanja, ker bi to podvojilo logiko, ki jo `upsert` že zagotavlja ceneje. */
function registerBuildPlanStep(): void {
  registerTickStep(async () => {
    // Drugo od dveh stikal (automation-setting.model.ts): `SCHEDULER_ENABLED` je že odločil,
    // ali ta korak sploh teče, tukaj pa se izloči vsak uporabnik, ki avtomatike ni vklopil.
    // Načrt se mu NE sestavi — brez tega bi mu ob vklopljenem schedulerju vsak dan nastajale
    // akcije, ki jih naslednji korak samo preskoči, koledar pa bi kazal načrtovan dan.
    const enabled = await enabledUserIds();
    const profiles = (await TrackingProfileModel.find({ active: true })).filter((p) =>
      enabled.has(String(p.userId)),
    );
    const today = ljubljanaCalendarDay(new Date());
    const tomorrow = ljubljanaCalendarDay(
      DateTime.fromJSDate(new Date(), { zone: 'utc' }).setZone(ZONE).plus({ days: 1 }).toJSDate(),
    );

    let plansBuilt = 0;
    for (const profile of profiles) {
      await buildPlanForDay(profile, today);
      await buildPlanForDay(profile, tomorrow);
      plansBuilt += 2;
    }
    return { plansBuilt };
  });
}

/** T053: pobere zapadle akcije (`state ∈ {planned, due} ∧ scheduledAt ≤ now`), obdela
 * ZAPOREDNO (FR-034 — nikoli dve hkrati za en profil; zaporedna `for...of` zanka to
 * zagotavlja tudi med različnimi profili, kar je preprostejše od ločenega zaklepa in
 * dovolj za obremenitev tega sistema). Atomarni `findOneAndUpdate` iz `due`/`planned` v
 * `running` je hkrati zaklep PROTI PREKRIVAJOČIM SE TIKOM (glej scheduler.ts tudi na tej
 * ravni) — če bi kdaj tekli dve instanci, druga tukaj preprosto ne bi dobila zapisa. */
function registerProcessDueStep(): void {
  registerTickStep(async ({ env, logger }) => {
    const now = new Date();
    // US3: `nextAttemptAt` (če je nastavljen) mora biti PRETEKEL — ponovni poskus se ne
    // sme zgoditi prej kot naraščajoči zamik narekuje (docs/legacy-engine.md §4.4-duh).
    const due = await PlannedActionModel.find({
      state: { $in: ['planned', 'due'] },
      scheduledAt: { $lte: now },
      $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
    }).sort({ scheduledAt: 1 });

    // Osebno stikalo velja tudi tu, ne le pri sestavljanju načrta: akcija je lahko nastala,
    // preden je uporabnik avtomatiko izklopil, ali pa jo je vnesel ročno. Izklopljen uporabnik
    // ne sme dobiti NOBENEGA klika po delodajalčevi strani — niti opomnika, ki bi ga terjal.
    const enabled = await enabledUserIds();

    let actionsProcessed = 0;
    for (const action of due) {
      if (!enabled.has(String(action.userId))) continue;
      const locked = await PlannedActionModel.findOneAndUpdate(
        { _id: action._id, state: { $in: ['planned', 'due'] } },
        { state: 'running' },
        { new: true },
      );
      if (!locked) continue; // druga instanca (ali ta ista, prek prekrivanja) je že zgrabila

      if (locked.mode === 'OFF') {
        locked.state = 'cancelled';
        await locked.save();
        continue;
      }

      const profile = await TrackingProfileModel.findById(locked.profileId);
      if (!profile) {
        locked.state = 'failed';
        locked.failureReason = 'Profil, na katerega se akcija sklicuje, ne obstaja več.';
        await locked.save();
        continue;
      }

      if (locked.mode === 'REMIND_ONLY') {
        // US4: nikoli ne klikne — samo prebere stanje in po potrebi opozori (FR-040/FR-041).
        try {
          await checkReminder(locked, profile, getClockPortal(env, logger));
          actionsProcessed += 1;
        } catch (err) {
          logger.error({ err, plannedActionId: String(locked._id) }, 'Preverjanje opomnika je spodletelo');
          locked.state = 'due';
          await locked.save().catch(() => undefined);
        }
        continue;
      }

      // US10, FR-062/Assumptions: zamuda nad maxDelayMinutes od NAČRTOVANEGA (ne od
      // zagona sistema) pomeni, da akcija ni več smiselna — "prijava na delo ob 14:00
      // zaradi izpada je slabša od nobene prijave". Označi se kot `missed`, NE poskusi
      // klikniti. To pokriva tako dohitevanje po restartu kot navaden zamik tika.
      const delayMinutes = (now.getTime() - locked.scheduledAt.getTime()) / 60_000;
      if (delayMinutes > profile.maxDelayMinutes) {
        const locationName = (await TrackingLocationModel.findById(locked.locationId).lean())?.name ?? 'neznana lokacija';
        await finalizeAsMissed(
          locked,
          locationName,
          `Zamuda ${Math.round(delayMinutes)} min presega dovoljenih ${profile.maxDelayMinutes} min.`,
        );
        await notifyMissedDueToOutage(locked);
        await dispatchWebhookForAction('action.missed', locked);
        actionsProcessed += 1;
        continue;
      }

      try {
        const { locationDoc, resolved } = await resolveLocationForPortal(String(locked.userId), String(locked.locationId));
        const portal = getClockPortal(env, logger);
        const executor = new ActionExecutor(portal);
        const result = await executor.execute(resolved, locked.actionName);

        if (result.outcome === 'unexpected_state') {
          // Ne moremo klikniti, a to ni "zamujeno" — pusti odprto za naslednji tik/ponovni poskus.
          locked.state = 'due';
          await locked.save();
          continue;
        }

        if (result.outcome === 'already_done') {
          // `already_done` je vredno zaupanja samo, kadar je veriga dneva cela. Če je pred to
          // akcijo katera padla, je stanje "kot po akciji" posledica manjkajočega koraka in ne
          // uporabnikovega ročnega klika — zato `missed` z razlogom, ne tiho "opravljeno".
          const daySoFar = await PlannedActionModel.find(
            {
              userId: locked.userId,
              localDate: locked.localDate,
              profileId: locked.profileId,
              _id: { $ne: locked._id },
            },
            { actionName: 1, actionOrder: 1, state: 1 },
          ).lean();
          const broken = brokenChainPredecessor(locked.actionOrder, daySoFar);
          if (broken) {
            locked.stateBefore = result.stateBefore;
            await finalizeAsMissed(
              locked,
              locationDoc.name,
              `Prejšnja akcija "${broken.actionName}" se ni zabeležila (${broken.state}), zato "${locked.actionName}" ni smiselna — ura je videti opravljena samo zato, ker manjka prejšnji korak.`,
            );
            await notifyMissedBrokenChain(locked, broken.actionName);
            await dispatchWebhookForAction('action.missed', locked);
            actionsProcessed += 1;
            continue;
          }

          await recordExecution({
            localDate: locked.localDate,
            actionName: locked.actionName,
            locationName: locationDoc.name,
            result,
            source: 'schedule',
            plannedAction: locked,
            userId: String(locked.userId),
          });
          actionsProcessed += 1;
          continue;
        }

        // 'succeeded' ali 'not_verified' — US3: naraščajoči zamik do izčrpanja poskusov
        // (FR-031), preden se karkoli šteje kot dokončno neuspelo (člen VI).
        const retryOutcome = await recordScheduledAttempt({
          locationName: locationDoc.name,
          result,
          plannedAction: locked,
          maxAttempts: profile.maxAttempts,
          retryBackoffSeconds: profile.retryBackoffSeconds,
        });
        actionsProcessed += 1;

        if (retryOutcome === 'succeeded') {
          await notifyConfirmationIfFirstOrLast(locked);
          await dispatchWebhookForAction('action.succeeded', locked);
        } else if (retryOutcome === 'failed_exhausted') {
          await notifyFailure(locked);
          await dispatchWebhookForAction('action.failed', locked);
        }
      } catch (err) {
        logger.error({ err, plannedActionId: String(locked._id) }, 'Obdelava zapadle akcije je spodletela');
        locked.state = 'due';
        await locked.save().catch(() => undefined);
      }
    }

    return { actionsProcessed };
  });
}

/** US10, Story 9/FR-062: zamujena akcija zaradi izpada MORA biti sporočena kot zamujena,
 * ne tiho preskočena — besedilo se namenoma razlikuje od `notifyFailure` (ki pomeni "poskusili
 * smo in ni uspelo"), ker gre tu za "sploh nismo poskusili, ker je bilo prepozno". */
async function notifyMissedDueToOutage(action: InstanceType<typeof PlannedActionModel>): Promise<void> {
  await notify({
    type: 'failure',
    title: 'Beleženje časa — zamujeno',
    body: `"${action.actionName}" (načrtovano ob ${action.baseLocalTime.slice(0, 5)}) je bilo zamujeno zaradi izpada sistema, ne tiho preskočeno.`,
    plannedActionId: String(action._id),
    dedupeKey: `missed:${String(action._id)}`,
    deepLink: '/time-tracking',
  });
}

/** Pretrgana veriga dneva (glej `brokenChainPredecessor`): besedilo se namenoma razlikuje od
 * `notifyMissedDueToOutage` — sistem je deloval, akcija pa je izgubila pomen, ker manjka
 * prejšnji korak. Uporabnik mora vedeti, da je v evidenci delodajalca luknja, ne da je bilo
 * "vse opravljeno". */
async function notifyMissedBrokenChain(
  action: InstanceType<typeof PlannedActionModel>,
  predecessorName: string,
): Promise<void> {
  await notify({
    type: 'failure',
    title: 'Beleženje časa — zamujeno',
    body: `"${action.actionName}" (načrtovano ob ${action.baseLocalTime.slice(0, 5)}) ni bilo izvedeno, ker se pred njim ni zabeležila akcija "${predecessorName}". Preveri evidenco pri delodajalcu.`,
    plannedActionId: String(action._id),
    dedupeKey: `missed:${String(action._id)}`,
    deepLink: '/time-tracking',
  });
}

/** US3, FR-043/FR-044: tudi v AUTO uporabnik dobi obvestilo ob končnem neuspehu, z
 * razlogom in potjo na ustrezen zaslon. */
async function notifyFailure(action: InstanceType<typeof PlannedActionModel>): Promise<void> {
  await notify({
    type: 'failure',
    title: 'Beleženje časa — neuspeh',
    body: `"${action.actionName}" ni bilo mogoče zabeležiti (načrtovano ob ${action.baseLocalTime}). ${
      action.failureReason ?? 'Preveri Diagnostiko.'
    }`,
    plannedActionId: String(action._id),
    dedupeKey: `failure:${String(action._id)}`,
    deepLink: '/time-tracking',
  });
}

/** Assumptions v spec.md: potrditveno obvestilo se privzeto pošlje samo za PRVO in
 * ZADNJO akcijo dneva (npr. prijava na delo in konec dela), da se prepreči preobilje
 * obvestil ob vsaki vmesni akciji (malica, konec malice). "Prvo"/"zadnje" se ugotovi iz
 * `actionOrder` med SOSEDNJIMI načrtovanimi akcijami istega dne in profila, ne iz fiksnega
 * imena akcije — profil lahko sestavi dan poljubno (FR-002). */
async function notifyConfirmationIfFirstOrLast(
  action: InstanceType<typeof PlannedActionModel>,
): Promise<void> {
  const siblings = await PlannedActionModel.find(
    { localDate: action.localDate, profileId: action.profileId },
    { actionOrder: 1 },
  ).lean();
  if (siblings.length === 0) return;

  const orders = siblings.map((s) => s.actionOrder);
  const isFirst = action.actionOrder === Math.min(...orders);
  const isLast = action.actionOrder === Math.max(...orders);
  if (!isFirst && !isLast) return;

  await notify({
    type: 'confirmation',
    title: 'Beleženje časa',
    body: `"${action.actionName}" je bilo uspešno zabeleženo ob ${action.baseLocalTime}.`,
    plannedActionId: String(action._id),
    dedupeKey: `confirmation:${String(action._id)}`,
    deepLink: '/time-tracking',
  });
}
