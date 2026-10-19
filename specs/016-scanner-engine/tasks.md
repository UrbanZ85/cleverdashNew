---

description: "Task list for feature implementation"
---

# Tasks: Univerzalni modularni scanner engine — Skenerji (016)

**Vhod**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/openapi.yaml](contracts/openapi.yaml),
[quickstart.md](quickstart.md)

Oznaka `[P]` pomeni, da naloga ne blokira naslednje in bi lahko tekla vzporedno (druga datoteka,
brez odvisnosti). Oznaka `[USn]` veže nalogo na uporabniško zgodbo iz specifikacije.

**Testi niso neobvezni.** Kakovostna vrata ustave (točka 2), FR-039 in SC-011 zahtevajo
avtomatiziran test za vsak scenarij; regresijski posnetek letov (T010) MORA nastati PRED prvo
spremembo modula Leti, sicer SC-002 nima referenčne vrednosti.

## Path Conventions

- zaledje: `apps/api/src/`, testi `apps/api/tests/`
- odjemalec: `apps/web/src/app/`, testi `apps/web/tests/`
- jedro: `apps/api/src/platform/scanner/` in `apps/web/src/app/core/scanners/`
- generični zavihek: `apps/web/src/app/features/scanners/`
- modul Leti: `apps/api/src/modules/flight-deals/` in `apps/web/src/app/features/flight-deals/`
- testni tip: `apps/api/src/modules/echo-scanner/` in `apps/web/src/app/features/echo-scanner/`

---

## Phase 1: Setup (Shared Infrastructure)

**Namen**: okolje, obsegi, zavihek, ikone, pogodba — vpisi, brez katerih se nič ne pojavi.

- [X] T001 Dodaj `SCANNER_TICK_SECONDS` (60), `SCANNER_RUN_STALE_MINUTES` (30), `SCANNER_RUN_RETENTION_DAYS` (90), `SCANNER_HISTORY_RETENTION_DAYS` (180), `SCANNER_MAX_CONCURRENT_RUNS` (1, max 8), `SCANNER_MAX_DEFINITIONS_PER_USER` (20), `SCANNER_ECHO_ENABLED` (false) v `apps/api/src/platform/config/env.ts`; `FLIGHT_SCHEDULER_TICK_SECONDS`, `FLIGHT_RUN_STALE_MINUTES`, `FLIGHT_RUN_RETENTION_DAYS` postanejo REZERVE (`SCANNER_*` ima prednost; kadar je nastavljen samo stari, se uporabi z `logger.warn({ event: 'env.deprecated' })` ob `loadEnv`); `SCANNER_ECHO_ENABLED=true` pri `NODE_ENV=production` zavrni v isti `superRefine` veji kot `FLIGHT_FAKE_PROVIDER_ENABLED`
- [X] T002 [P] Enotski test okolja v `apps/api/tests/unit/env.spec.ts`: privzetki `SCANNER_*`; `FLIGHT_RUN_STALE_MINUTES=45` brez `SCANNER_RUN_STALE_MINUTES` da 45; oba nastavljena → `SCANNER_*` zmaga; `SCANNER_ECHO_ENABLED=true` + produkcija vrže napako z imenom spremenljivke
- [X] T003 [P] Dodaj obsega `scanners:read`, `scanners:write` v `BASE_USER_SCOPES` v `apps/api/src/platform/keycloak/role-mapping.ts` s komentarjem po vzorcu 015 (nizi prepisani, ne uvoženi)
- [X] T004 [P] Dodaj vnos zavihka v `apps/api/src/platform/tabs/registry.ts`: `id: 'scanners'`, `title: 'Skenerji'`, `icon: 'scan-outline'`, `route: '/scanners'`, `order: 13`, `requiredScopes: ['scanners:read']`, `enabled: true`, s komentarjem, zakaj `order: 13` (0–12 zasedene)
- [X] T005 [P] Registriraj ikone `scan-outline`, `play-outline`, `stop-circle-outline`, `layers-outline` v `apps/web/src/app/core/icons/register-icons.ts` in jih dodaj v `apps/web/tests/unit/icons.spec.ts` (seznam `SCANNERS_ICONS` + `TAB_REGISTRY_ICONS`)
- [X] T006 [P] Dodaj cilj `specs/016-scanner-engine/contracts/openapi.yaml → src/generated/scanners.d.ts` v `packages/contracts/scripts/generate.ts` (in opombo v glavi) ter vrstico `npx --yes @redocly/cli lint specs/016-scanner-engine/contracts/openapi.yaml` v `.github/workflows/ci.yml`
- [X] T007 [P] (odstranitev `flightDeals.scheduler` odložena na T057, ker jo `admin.page.ts` še uporablja) Dodaj teme pomoči `scanners.types` (kaj je tip, batch proti single), `scanners.schedule` (preseljena vsebina `flightDeals.scheduler` + urnik skenerja) in `scanners.results` v `apps/web/src/app/shared/help/help-topics.ts`; `flightDeals.scheduler` odstrani in `apps/web/tests/unit/help-topics.spec.ts` posodobi
- [X] T008 [P] Dodaj razdelek `# ─── Skenerji (016) ───` s `SCANNER_*` v `.env.example` in razdelek "Skenerji (016)" v `docs/env-reference.md`; tri `FLIGHT_*` spremenljivke označi kot zastarele z napotkom na `SCANNER_*`

**Checkpoint**: `npm run typecheck` čist; `GET /tabs` vrne zavihek Skenerji navadnemu uporabniku (pot še ne obstaja — to je pričakovano do T075).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Namen**: regresijski posnetek letov PRED refaktoringom; vmesniki, register, modeli in čiste
domenske funkcije jedra, od katerih so odvisne vse zgodbe.

**⚠️ CRITICAL**: T010 mora biti zelen nad današnjo kodo, preden se dotakneš modula Leti.

### Regresijski posnetek (naročilo §15, faza 2)

- [X] T010 Integracijski test `apps/api/tests/integration/flight-deals/digest-regression.spec.ts`: s `FLIGHT_FAKE_PROVIDER_ENABLED=true`, enim iskanjem (`seedRule`) in prejemnikom (`notify: true`) izvedi tri zagone s `processOutbox: false` in po vsakem preveri posnetek: število dopisov na prejemnika, za vsako postavko `changeType`, `price.amount`, `previousPrice`, `ruleName`; po 1. zagonu 2 postavki NEW (120 € STN, BGY), po 2. ena PRICE_DOWN 89 ← 120, po 3. ena PRICE_UP 110 ← 89; pričakovanja zapiši DOBESEDNO (ne izpeljano iz kode), ker so referenca za SC-002. Test teče zelen nad kodo 015 PRED T030; po refaktoringu se spremenijo samo uvozi (`ScannerNotificationModel`, `requestManualRun` iz jedra)

### Vmesniki, register, varuh

- [X] T011 [P] Ustvari `apps/api/src/platform/scanner/types.ts`: nabori `RUN_STATUSES`, `RUN_TRIGGERS`, `CHANGE_TYPES` (`NEW, PRICE_DOWN, PRICE_UP, CHANGED, UNCHANGED, UNAVAILABLE`), `NOTIFICATION_STATUSES`, `SUPPRESSED_REASONS` (+ `no-items`, `type-unavailable`), `SCHEDULE_PRESET_IDS` (+ `hourly`), `DEFINITION_OUTCOMES` (`ok, failed, skipped`), `Money`; vmesniki `ScannerType<TConfig>` (type, label, icon, description, execution, scopes?, results: 'generic'|'custom', isEnabled(env), configSchema, validateConfig?, describeConfig?, defaultSchedule?, createRoute?, definitions?: { listForUser, findForUser }, execute(ctx), resultReader?, notifications: { verify, render }, admin?: { extras(env) }), `ExecutionContext<TConfig>` (runId, now, env, logger, definition?: ScannerDefinitionLean, heartbeat(), shouldCancel(), results: GenericResultStore), `ExecutionOutcome`, `ScannerEvent`, `ScannerSummary`, `NormalizedResult` (identity, source, externalId?, title, url?, price?, data, comparable?, dataAt?, expiresAt?), `ResultReader` (list, count, get), `VerifiedItem`, `RenderedDigest` (subject, html, text); datoteka brez uvozov iz mongoose/express (člen IX), samo `zod` tip in `Env`/`Logger` tipi
- [X] T012 [P] Ustvari `apps/api/src/platform/scanner/registry.ts`: `registerScannerType(type)` (Map, ponovna registracija zamenja), `listScannerTypes()` (po abecedi `type`), `findScannerType(type)`, `enabledScannerTypes(env)`, `resetScannerTypesForTests()` — komentar po vzorcu `platform/ingest/registry.ts`
- [X] T013 [P] Ustvari `apps/api/src/platform/scanner/scopes.ts` (`SCANNER_SCOPES = { read: 'scanners:read', write: 'scanners:write' }`) in `apps/api/src/platform/scanner/scanner.audit.ts` z dogodki `scanner.definition.created|updated|deleted`, `scanner.run.started|finished|interrupted|cancelled`, `scanner.schedule.updated`, `scanner.notification.sent|failed|suppressed`, `scanner.legacy.dropped`, `scanner.type.unavailable` (vsi s `scannerType`, brez skrivnosti in e-naslovov)
- [X] T014 [P] Dvigni varuha: ustvari `apps/api/src/platform/auth/admin-guard.ts` z `requireAdminUser()` (pogoj in komentar iz `modules/flight-deals/admin-guard.ts`; enak 403 za "ni admin" in "je ključ"); modula 014 se ne dotikaj
- [X] T015 [P] Enotski test `apps/api/tests/unit/scanner/registry.spec.ts`: registracija, zamenjava ob ponovni registraciji, abecedni vrstni red, `enabledScannerTypes` spoštuje `isEnabled(env)`, `findScannerType` neznanega vrne `null`
- [X] T016 [P] Enotski test `apps/api/tests/unit/scanner-core-boundary.spec.ts`: prebere vse `.ts` pod `apps/api/src/platform/scanner/` in zavrne vsak uvoz, ki razreši v `apps/api/src/modules/`, ter vsak niz `flight` (neobčutljivo na velikost; izjema: komentar z `015` v `legacy-cleanup.service.ts` sme našteti imena zbirk — test dovoli datoteko po imenu) — SC-003

### Preseljena in nova domena

- [X] T017 Preseli `apps/api/src/modules/flight-deals/domain/schedule-slots.ts` v `apps/api/src/platform/scanner/domain/schedule-slots.ts`: dodaj preset `hourly` (`0 * * * *`, "Vsako uro"), `slotKeyFor(scope, slot, timezone)` z obsegom (`schedule:type:<tip>:…` / `schedule:def:<id>:…`); preseli test v `apps/api/tests/unit/scanner/schedule-slots.spec.ts` in dodaj primer za `slotKeyFor` z obsegom ter za prehod 25. 10. 2026 (`+02:00` pred, `+01:00` po); stara datoteka in stari test se izbrišeta, modul Leti uvoze še ne rabi (T033)
- [X] T018 [P] Preseli `apps/api/src/modules/flight-deals/domain/price-change.ts` v `apps/api/src/platform/scanner/domain/price-change.ts` (brez sprememb vsebine); preseli pripadajoči del `apps/api/tests/unit/flight-deals/identity-and-price.spec.ts` v `apps/api/tests/unit/scanner/price-change.spec.ts`; v modulu Leti posodobi uvoze (`reconcile.service.ts`, `offer-query.service.ts`, `rule-matcher.ts` če uvaža) na `../../../platform/scanner/domain/price-change.js`
- [X] T019 [P] Ustvari `apps/api/src/platform/scanner/domain/identity.ts` (`identityKeyOf(identity: string)` → sha256, 32 hex) in `apps/api/src/platform/scanner/domain/change-detection.ts` (`comparableHash(value: unknown) → string | null` determinističen nad JSON s sortiranimi ključi; `detectChange({ existingPrice, existingHash, incomingPrice, incomingHash })` → `NEW` brez obstoječega, `classifyChange` pri ceni, `CHANGED` pri drugem hashu brez cene, sicer `UNCHANGED`)
- [X] T020 [P] Ustvari `apps/api/src/platform/scanner/domain/run-status.ts`: `statusFromOutcomes(definitions: Array<{outcome}>, hadError: boolean)` → `succeeded` (vsi ok ali prazno), `partial` (mešano), `failed` (noben ok in vsaj en failed); in `apps/api/src/platform/scanner/domain/schedule-label.ts`: `scheduleLabel(schedule | typeSchedule)` → slovenski opis ("vsakih 6 ur", "vsak dan ob 6:00 in 18:00", "po urniku tipa (…)", "po meri: 0 */3 * * *")
- [X] T021 [P] Ustvari `apps/api/src/platform/scanner/domain/definition-input.ts`: Zod `scheduleInputSchema` (preset | cronExpression, timezone default `Europe/Ljubljana`), `definitionCreateSchema` (name 1–80, type, enabled default true, schedule, notifications { enabled }, config: `z.record(z.unknown())`), `definitionPatchSchema` (vse neobvezno, `refine` vsaj eno polje), `listQuerySchema` (type?), `resultsQuerySchema` (sort `seen|price|change`, includeUnavailable, limit ≤ 500), `runsQuerySchema`, `adminRunsQuerySchema` (type?, limit), `adminNotificationsQuerySchema`, `typeSchedulePutSchema`, `adminTriggerSchema` (natanko eno od type | scannerId)
- [X] T022 [P] Enotski testi `apps/api/tests/unit/scanner/change-detection.spec.ts` (cena 120→89 PRICE_DOWN, enaka cena UNCHANGED, brez cene različen hash CHANGED, brez cene enak hash UNCHANGED, hash neodvisen od vrstnega reda ključev), `apps/api/tests/unit/scanner/run-status.spec.ts`, `apps/api/tests/unit/scanner/schedule-label.spec.ts`, `apps/api/tests/unit/scanner/definition-input.spec.ts` (prazen patch zavrnjen, `config` ne sprejme funkcij/razredov — samo JSON)

### Modeli jedra

- [X] T023 [P] Ustvari `apps/api/src/platform/scanner/models/scanner-definition.model.ts` po data-model.md (`userId`, `name`, `type`, `enabled`, `schedule{mode,preset,cronExpression,timezone,lastScheduledSlotAt}`, `notifications{enabled,mode}`, `config: Mixed`, `status{…}`, `timestamps: true`, `versionKey: false`; indeksi `{userId, updatedAt}`, `{type, enabled}`, `{userId, type}`) in `apps/api/src/platform/scanner/models/scanner-type-settings.model.ts` (`type` unique, `enabled`, `preset`, `cronExpression`, `timezone`, `lastScheduledSlotAt`, `updatedBy`, `updatedAt`)
- [X] T024 [P] Ustvari `apps/api/src/platform/scanner/models/scanner-run.model.ts` po data-model.md (`scannerType`, `scope{kind,definitionId,ownerId}`, `slotKey` unique, `trigger`, `requestedBy`, `status`, časi, `heartbeatAt`, `cancelRequested`, `counters: Map<Number>`, `definitions[]`, `extras: Mixed`, `runErrors[]` ≤ `MAX_RUN_ERRORS`, `expiresAt` TTL; indeksi iz data-model.md) — komentar o `slotKey` z obsegom
- [X] T025 [P] Ustvari `apps/api/src/platform/scanner/models/scanner-result.model.ts` (unikat `{definitionId, identityKey}`, ostali indeksi, TTL) in `apps/api/src/platform/scanner/models/scanner-result-history.model.ts` (`{resultId, checkedAt}`, TTL)
- [X] T026 [P] Ustvari `apps/api/src/platform/scanner/models/scanner-notification.model.ts` po data-model.md (`scannerType`, `channel: 'email'`, `items[]` s `payload: Mixed`, unikat `{recipientUserId, runId}`, outbox indeks, TTL)
- [X] T027 Dopolni `apps/api/tests/unit/no-owner-fields.spec.ts`: `ScannerDefinition` in `ScannerResult` NOSITA `userId`; `ScannerRun` NE nosi `userId` (namestitveni zapis; `scope.ownerId` je oznaka, ne pogoj dostopa) — s komentarjem po vzorcu 015
- [X] T028 [P] Integracijski test `apps/api/tests/integration/scanner/indexes.spec.ts` (vzorec `flight-deals/indexes.spec.ts`): unikati `slotKey`, `{definitionId, identityKey}`, `{recipientUserId, runId}`, `{type}` na nastavitvah; TTL indeksi na `expiresAt` obstajajo z `expireAfterSeconds: 0`

**Checkpoint**: jedro ima vmesnike, register, modele in domeno; nič še ne teče. `npm run typecheck`, `npm run lint` in vsi obstoječi testi 015 čisti; T010 zelen.

---

## Phase 3: User Story 1 — Leti tečejo po skupnem urniku in nič se ne spremeni (Priority: P1) 🎯 MVP

**Cilj**: tik, zagon, urnik tipa, outbox in drop starih zbirk v jedru; modul Leti registriran kot
tip `flights`; stari tik, modeli in admin modula izbrisani; vsi testi 015 zeleni (SC-001, SC-002).

**Independent Test**: `npm test --workspace apps/api -- flight-deals` zelen s spremenjenimi
samo uvozi in potmi; `digest-regression.spec.ts` da iste postavke; `tab-removal.spec.ts` še velja.

### Testi za US1

- [X] T030 [P] [US1] Integracijski test `apps/api/tests/integration/scanner/_helpers.ts` + `run-lifecycle.spec.ts` z MOCK tipom, registriranim v testu (`execution: 'batch'`, `execute` vrne podane izide): dva sočasna `scheduleDueRuns` → en zagon s `slotKey` `schedule:type:mock:2026-10-17T06:00+02:00`; `lastScheduledSlotAt` posodobljen; tik: termin → zagon → izveden; drugi tik v isti uri nič; `running` brez utripa → `interrupted` in termin se ne ponovi; `cancelRequested` med koraki → `cancelled` brez dopisov; ročni zagon obsega, ki teče → 409; `SCANNER_MAX_CONCURRENT_RUNS=1`: dva `queued` različnih obsegov se izvedeta zaporedno v istem tiku; tip, ki ni registriran, nima zagona in `scanner.type.unavailable` se zabeleži enkrat
- [X] T031 [P] [US1] Integracijski test `apps/api/tests/integration/scanner/notification-outbox.spec.ts` (nodemailer mockan kot v `flight-deals/notification-outbox.spec.ts`) z mock tipom: dva dogodka istega `resultRef` za istega prejemnika → ena postavka z združenimi imeni in močnejšo vrsto; en dopis na prejemnika na zagon tudi ob ponovnem `buildNotifications`; `verify` vrne prazno → `suppressed: no-items`; brez SMTP → `smtp-not-configured`; tip odjavljen pred pošiljanjem → `type-unavailable`; pošta pade nato uspe → `attemptCount` 2, `sentAt`; `sending` obtiči → po `SCANNER_RUN_STALE_MINUTES` nazaj v `pending`
- [X] T032 [P] [US1] Integracijski test `apps/api/tests/integration/scanner/legacy-cleanup.spec.ts`: ustvari zbirke `flightsearchruns`, `flightschedulersettings`, `flightnotifications` z dokumentom; `dropLegacyFlightSchedulerCollections(logger)` jih odstrani in zabeleži `scanner.legacy.dropped` s števci; drugi klic ne naredi nič; `flightsearchrules` in `flightoffers` ostanejo

### Jedro — storitve

- [X] T033 [US1] Ustvari `apps/api/src/platform/scanner/services/type-settings.service.ts`: `getOrCreateTypeSettings(type, now)` (`upsert` + `$setOnInsert` iz `type.defaultSchedule` ali `daily-06-18`), `updateTypeSchedule(type, patch, actorUserId, now)` (preset/custom/cron/timezone preverba, `lastScheduledSlotAt = now` ob spremembi izraza ali cone — prenos iz `scheduler-settings.service.ts`), `markTypeSlot(type, slot)`, `toTypeScheduleResponse(settings, now)` (nextRunAt, nextRunLocal, updatedBy prek `readUserSummaries`)
- [X] T034 [US1] Ustvari `apps/api/src/platform/scanner/services/scheduler.service.ts`: `markInterruptedRuns(env, logger, now)`; `scheduleDueRuns(env, logger, now)` → za vsak `batch` tip z `enabled` nastavitvami `latestDueSlot` → `ScannerRunModel.create` s `scope {kind:'type'}` (E11000 = že prevzet) + `markTypeSlot`; za vsako `enabled` definicijo `single` tipa z `schedule.mode: 'own'` → isto s `scope {kind:'definition', definitionId, ownerId}` in `$set schedule.lastScheduledSlotAt` s pogojem `$lt`; definicije neregistriranega ali izklopljenega tipa preskoči (dnevnik enkrat na tip na proces); `requestManualRun(env, scope, actorUserId, now)` → 409 (`ProblemError`), kadar zagon ISTEGA obsega `queued|running`; `latestFinishedRun(type)`; `activeRuns()`
- [X] T035 [US1] Ustvari `apps/api/src/platform/scanner/services/notification-builder.service.ts`: `buildNotificationsForRun({ runId, scannerType, events, now, env })` — iz `ScannerEvent.recipients` sestavi `perRecipient` Map; dedup po `resultRef` (imena definicij zlij z ` · `, prioriteta `NEW 3 > PRICE_DOWN 2 > PRICE_UP 1 > CHANGED 1`), `ownerName` iz `readUserSummaries` samo kadar prejemnik ≠ lastnik; `create` z E11000 kot "že obstaja"; vrne `{ created, recipients }` (prenos iz `flight-deals/services/notification-builder.service.ts` brez letalskih polj)
- [X] T036 [US1] Ustvari `apps/api/src/platform/scanner/services/notification-sender.service.ts`: `RETRY_BACKOFF_SECONDS`, `MAX_ATTEMPTS`, `MAX_PER_TICK`, `reclaimStuckSending`, `processNotificationOutbox(env, logger, now)` — prevzem `pending → sending`, `findScannerType(n.scannerType)` (manjka → `suppressed: type-unavailable`), `type.notifications.verify(items, recipientUserId, now)`, prazno → `no-items`, `isEmailConfigured`, `readUserEmails`, `type.notifications.render(verified, { baseUrl, checkedAt, appName })`, `sendEmail`, `bumpRunCounter` na `counters.notifications*` (Map), backoff; prenos iz `flight-deals/services/notification-sender.service.ts`
- [X] T037 [US1] Ustvari `apps/api/src/platform/scanner/services/run-executor.service.ts`: `executeRun(runId, env, logger, now, options)` — prevzem `queued → running`; `type = findScannerType(run.scannerType)` (manjka → `failed` z `code: 'type-unavailable'`); `ctx` z `heartbeat`, `shouldCancel`, `definition` (pri `scope.kind === 'definition'`: naloži `ScannerDefinitionModel`, izbrisana → `cancelled` z razlogom "skener izbrisan"), `results: genericResultStoreFor(definition, runId)` (T060 — do takrat `null`); `outcome = await type.execute(ctx)` v `try/catch` (→ `failed`, `runErrors` ≤ 100); po preklicu `cancelled` brez dopisov; sicer `buildNotificationsForRun(outcome.events)`; `finish`: `status` (iz outcome ali `statusFromOutcomes`), `counters` (jedro + tip), `definitions`, `extras`, `runErrors`; posodobi `ScannerDefinition.status` pri `single`; `processOutbox` po vzorcu 015 (`now` proti `finishedAt`); `auditRunStarted/Finished`
- [X] T038 [US1] Ustvari `apps/api/src/platform/scanner/services/tick.ts`: `runScannerTick(env, logger, now, options)` → `markInterruptedRuns`, `scheduleDueRuns`, `executeQueuedRuns` (zanka: dokler `queued` obstaja in `running < SCANNER_MAX_CONCURRENT_RUNS`; zagon obsega, ki že teče, preskoči; vsak `executeRun` v `try/catch`, napaka enega ne ustavi zanke), `processNotificationOutbox`; `tickInFlight` varovalka; `startScannerScheduler(env, logger)` (`setInterval(...).unref()`, prvi tik takoj), `stopScannerSchedulerForTests()`; `TickSummary { interrupted, scheduled: number, executedRunIds: string[], outbox }`
- [X] T039 [US1] Ustvari `apps/api/src/platform/scanner/services/legacy-cleanup.service.ts`: `dropLegacyFlightSchedulerCollections(logger)` — `listCollections` nad `mongoose.connection.db`, za vsako od treh imen `countDocuments` + `drop`, `auditLegacyDropped`; idempotentno; komentar z odločitvijo lastnika 19. 10. 2026

### Modul Leti kot tip `flights`

- [X] T040 [US1] Ustvari `apps/api/src/modules/flight-deals/scanner/execute.ts`: `executeFlightBatch(ctx)` — telo današnjega `run-executor.service.ts` (providers, `advanceFakeProviderRun`, `rules = find({active:true})`, `computeWindows`, `buildQueries` v `try/catch` na pravilo, `buildQueryPlan`, `ctx.heartbeat()`, `ctx.shouldCancel()`, `runQueries` z `onProgress → heartbeat`, `reconcileRun`) → `ExecutionOutcome` s `counters` (rules, queries, providerRequests, offersSeen, newMatches, priceDrops, priceRises, unavailable), `definitions[]` (ena vrstica na pravilo: `ok`, ali `failed` z razlogom, kadar `reconcile` za to pravilo vrže — ovij obdelavo pravila v `try/catch` znotraj `reconcileRun` prek novega `onRuleError`), `events` (iz `MatchEvent`), `extras: { providers: [...] }` (tallies kot v 015), `status` po pravilih 015 (anyFailure/anySuccess), `errors`
- [X] T041 [US1] Posodobi `apps/api/src/modules/flight-deals/services/reconcile.service.ts`: `MatchEvent` postane `ScannerEvent` (`definitionId: ruleId`, `definitionName: rule.name`, `ownerId`, `recipients: [owner, ...recipients.filter(notify)]`, `resultRef: offerId`, `changeType`, `payload: { offerId, price, previousPrice }`); `onRuleError(ruleId, err)` kavelj; uvoz `classifyChange` iz `platform/scanner/domain/price-change.js`; `ref` oznake `FlightSearchRun` → `ScannerRun` v `flight-search-rule.model.ts`, `flight-search-match.model.ts`, `flight-offer-history.model.ts`
- [X] T042 [US1] Ustvari `apps/api/src/modules/flight-deals/scanner/notifications.ts`: `verifyFlightItems(items, recipientUserId, now)` (prenos `verifyItems` iz `notification-sender.service.ts`; `item.payload.offerId`, `item.definitionId` kot `ruleId`, `item.definitionName` kot `ruleName`) → `DigestItem[]`; `renderFlightDigest(items, ctx)` → `renderDigest` iz `domain/email-template.ts`
- [X] T043 [US1] Ustvari `apps/api/src/modules/flight-deals/scanner/admin-extras.ts`: `flightAdminExtras(env)` → `{ providers: [{ id, label, official, enabled, lastSuccessAt, notice, lastErrorAt, lastError, lastOutcome, requestsToday, dailyLimit }] }` (prenos iz `admin.router.ts` `GET /admin/providers`, brez `email` — ta je v jedru)
- [X] T044 [US1] Ustvari `apps/api/src/modules/flight-deals/scanner/type.ts` in `index.ts`: `flightScannerType: ScannerType` (`type: 'flights'`, `label: 'Leti'`, `icon: 'airplane-outline'`, `description`, `execution: 'batch'`, `results: 'custom'`, `scopes: FLIGHT_DEALS_SCOPES`, `isEnabled: () => true`, `defaultSchedule: { preset: 'daily-06-18', cronExpression: '0 6,18 * * *', timezone: 'Europe/Ljubljana' }`, `createRoute: '/flight-deals/searches/new'`, `configSchema: z.never()` s komentarjem (definicije ima modul), `execute: executeFlightBatch`, `notifications: { verify, render }`, `admin: { extras }`; `definitions` in `resultReader` pridejo v T052 in T062); `registerFlightScannerType()` kliče `registerScannerType`
- [X] T045 [US1] Izbriši iz modula Leti (vse poti pod `apps/api/src/modules/flight-deals/`): `services/tick.ts`, `services/run-executor.service.ts`, `services/scheduler-settings.service.ts`, `services/notification-builder.service.ts`, `services/notification-sender.service.ts`, `models/flight-search-run.model.ts`, `models/flight-notification.model.ts`, `models/flight-scheduler-settings.model.ts`, `admin.router.ts`, `admin-guard.ts`; iz `domain/types.ts` odstrani `RUN_*`, `NOTIFICATION_STATUSES`, `SUPPRESSED_REASONS`, `SCHEDULE_PRESET_IDS` (uvoz iz `platform/scanner/types.js`, kjer modul še potrebuje `ChangeType` — ta ostane v modulu, ker je del pogodbe 015, a mora biti enak naboru jedra brez `CHANGED`: dodaj komentar); iz `domain/rule-input.ts` odstrani `runsQuerySchema`, `notificationsQuerySchema`, `schedulerPutSchema`; iz `flight-deals.audit.ts` odstrani run/notification/scheduler dogodke
- [X] T046 [US1] Posodobi `apps/api/src/modules/flight-deals/router.ts`: `GET /flight-deals/overview` bere `lastRun` prek `latestFinishedRun('flights')` iz `platform/scanner/services/scheduler.service.js`; odstrani uvoz `FlightSearchRunModel`; vse ostalo nespremenjeno
- [X] T047 [US1] Posodobi `apps/api/src/main.ts`: odstrani `flightDealsAdminRouter`, `startFlightDealsScheduler`; dodaj `registerFlightScannerType()` (poleg registracij ciljev uvoza), `await dropLegacyFlightSchedulerCollections(logger)` (po `connectMongo`, pred tikom), `if (env.NODE_ENV !== 'test') startScannerScheduler(env, logger)`; `apiV1Router.use(scannersRouter)` in `scannersAdminRouter` pridejo v T053/T050 — tu pusti komentar z mestom
- [X] T048 [US1] Prilagodi obstoječe teste 015 (samo uvozi in poti): `apps/api/tests/integration/flight-deals/_run.ts` (`requestManualRun(env, { kind: 'type', type: 'flights' }, ACTOR, now)`, `executeRun` iz jedra), `run-lifecycle.spec.ts` (`runScannerTick`, `scheduleDueRuns`, `ScannerRunModel`, `getOrCreateTypeSettings('flights')`, `updateTypeSchedule('flights', …)`, `slotKey` `schedule:type:flights:…`), `notification-outbox.spec.ts`, `price-history.spec.ts`, `provider-runs.spec.ts`, `ryanair-fallback.spec.ts`, `digest-regression.spec.ts` (`ScannerNotificationModel`); `tests/contract/flight-deals/admin.spec.ts` se preimenuje v `tests/contract/scanner/flights-admin.spec.ts` s potmi `/scanners/admin/types/flights/schedule`, `/scanners/admin/runs` (`{ type: 'flights' }`), `/scanners/admin/types` (extras providers) — pričakovanja ostanejo; `api-key-and-offers.spec.ts` / `access.spec.ts`: `/flight-deals/admin/*` z API ključem → zdaj `/scanners/admin/*` → 403
- [X] T049 [US1] Zaženi `npm test --workspace apps/api -- flight-deals scanner` in `npm run typecheck && npm run lint`; vse zeleno, `digest-regression.spec.ts` brez sprememb pričakovanj (SC-001, SC-002)

**Checkpoint**: leti tečejo po jedru; `POST /scanners/admin/*` še ne obstaja (T050) — testi iz T048, ki ga rabijo, so rdeči do T050, kar je dovoljeno samo znotraj te faze.

---

## Phase 4: User Story 2 — Administrator upravlja urnike in zagone vseh skenerjev na enem mestu (Priority: P1)

**Cilj**: `/scanners/admin/*` v jedru in generična administracijska stran; stara pot letov preusmeri.

**Independent Test**: admin vidi tip `flights` z urnikom, sproži zagon, prekine, vidi outbox;
navaden uporabnik in API ključ dobita 403; sprememba urnika velja ob naslednjem tiku.

### Testi za US2

- [X] T050 [P] [US2] Pogodbeni test `apps/api/tests/contract/scanner/_helpers.ts` (loginAs, loginAsAdmin, seedApiKey, `registerMockType()` z `single` in `batch` različico, `seedDefinition`) in `apps/api/tests/contract/scanner/admin.spec.ts`: `GET /scanners/admin/types` (tipi z `schedule` pri batch in `null` pri single, `definitionCount`, `extras`, `email.configured`); `GET/PUT /scanners/admin/types/{type}/schedule` (preset prepiše izraz, custom zahteva izraz, neveljaven izraz/cona 400, single tip 400, neznan tip 404, `updatedBy`); `POST /scanners/admin/runs` (`{type}` → 202, `{scannerId}` → 202, oboje/nič → 400, isti obseg teče → 409 s telesom zagona); `GET /scanners/admin/runs?type=`; `GET /scanners/admin/runs/{id}` (`definitions[]`, `extras`, `errors[]`); `cancel` (queued → cancelled, running → cancelRequested, končan → 409); `GET /scanners/admin/notifications?type=&status=`; navaden uporabnik 403 na vsem; API ključ z `admin` obsega ne more dobiti → 403; `X-Acting-User` ne spremeni odgovora

### Zaledje

- [X] T051 [US2] Ustvari `apps/api/src/platform/scanner/admin.router.ts` z `requireAdminUser()` na `/scanners/admin`: `GET /types` (register + `getOrCreateTypeSettings` za batch + `countDocuments` definicij, pri tipih z `definitions` prek `type.definitions.countAll?()` — doda se v vmesnik; `extras` iz `type.admin?.extras(env)` v `try/catch`; `email.configured`), `GET/PUT /types/:type/schedule`, `GET /runs` (filter `type`, `active[]`), `POST /runs` (`adminTriggerSchema` → `requestManualRun` + takojšnji `executeRun` kot v 015), `GET /runs/:runId`, `POST /runs/:runId/cancel`, `GET /notifications`; odgovori `Run`, `TypeSchedule`, `NotificationAdmin` po pogodbi (`toRunResponse` z `scope.owner` in `requestedBy` prek `readUserSummaries`, `counters` iz Map v objekt)
- [X] T052 [US2] Vpni `apiV1Router.use(scannersAdminRouter)` v `apps/api/src/main.ts` (za `flightDealsRouter`) in zaženi T050 ter preimenovani `flights-admin.spec.ts` — zeleno

### Odjemalec

- [X] T053 [P] [US2] Ustvari `apps/web/src/app/core/scanners/scanners.model.ts` (tipi iz pogodbe 016: `ScannerTypeInfo`, `ScannerSummary`, `Scanner`, `ScannerInput`, `Result`, `ResultDetail`, `Run`, `RunSummary`, `TypeSchedule`, `NotificationAdmin`, `SchedulePreset`; čiste funkcije `runStatusLabel/Color`, `changeLabel`, `formatPrice`, `scheduleSummary`, `describeError` — kjer so generične, preseli iz `flight-deals.model.ts` in ju tam uvozi iz `core`) in `apps/web/src/app/core/scanners/scanners.api.ts` (`types`, `list`, `get`, `create`, `update`, `delete`, `run`, `runs`, `results`, `result`, `adminTypes`, `typeSchedule`, `updateTypeSchedule`, `adminRuns`, `adminRun`, `triggerRun`, `cancelRun`, `adminNotifications`; vzorec `flight-deals.api.ts`)
- [X] T054 [P] [US2] Ustvari `apps/web/src/app/core/scanners/scanner-ui.registry.ts`: `ScannerUiPlugin { type, configComponent?, resultsComponent?, adminExtrasComponent?, createRoute? }`, `registerScannerUi`, `findScannerUi`, `resetScannerUiForTests`; enotski test `apps/web/tests/unit/scanner-ui-registry.spec.ts`
- [X] T055 [P] [US2] Ustvari `apps/web/src/app/features/scanners/schedule-form.component.ts`: vhodi `presets`, `value { preset, cronExpression, timezone }`, `disabled`; izhod `valueChange`; polje po meri se pokaže pri `custom`; brez validacije crona na odjemalcu (strežnik vrne razlog) — skupna za čarovnik (T082) in admin (T056)
- [X] T056 [US2] Ustvari `apps/web/src/app/features/scanners/scanners-admin.page.ts` (prenos iz `flight-deals/admin.page.ts`): segment po tipih iz `adminTypes()` (query `?type=` izbere tip); za izbran tip: urnik (`schedule-form` + stikalo `enabled`, samo batch; pri single napis "urnik je na skenerju"), **Preveri zdaj** (`triggerRun({type})`), zagoni (`adminRuns({type})`, osveževanje na 5 s med `active`), podrobnosti zagona z `definitions[]` in `errors[]`, prekini, obvestila (`adminNotifications({type, status})`), in `NgComponentOutlet` za `adminExtrasComponent` tipa iz registra; `forbidden()` ob 403
- [X] T057 [US2] Ustvari `apps/web/src/app/features/flight-deals/providers-panel.component.ts` (izvlečeno iz `admin.page.ts` zavihek "Viri": tabela virov z `official`, `enabled`, `lastSuccessAt`, `lastErrorAt`, `lastError`, `requestsToday/dailyLimit`, `notice`; vhod `extras`) in `apps/web/src/app/features/flight-deals/scanner-ui.ts` z `registerFlightScannerUi()` (`type: 'flights'`, `createRoute: '/flight-deals/searches/new'`, `adminExtrasComponent: () => import('./providers-panel.component.js')`); izbriši `admin.page.ts`; iz `flight-deals.api.ts` odstrani `scheduler/runs/adminProviders/notifications`; iz `flight-deals.model.ts` odstrani `Run`, `SchedulerSettings`, `NotificationAdmin`, `SchedulePresetId`, `RUN_STATUS_LABELS`, `runStatusColor` (uvoz iz `core/scanners`); gumb Administracija v `flight-deals.page.ts` kaže na `/scanners/admin?type=flights`
- [X] T058 [US2] Posodobi `apps/web/src/app/app.routes.ts`: `scanners/admin` (authGuard, `scanners-admin.page`), `flight-deals/admin` → `redirectTo: '/scanners/admin?type=flights'`; `apps/web/src/main.ts`: `registerFlightScannerUi()` pred `bootstrapApplication`; posodobi `apps/web/tests/unit/flight-deals-routes.spec.ts` (admin je redirect, brez komponente) in ustvari `apps/web/tests/unit/scanners-routes.spec.ts` (`scanners/admin` authGuard brez tabGuard, brez adminGuard na odjemalcu)

**Checkpoint**: administracija deluje za `flights`; `npm test --workspace apps/web` zelen.

---

## Phase 5: User Story 3 — Vidim vse svoje skenerje, tudi iskanja letov, na enem seznamu (Priority: P2)

**Cilj**: `GET /scanners`, `GET /scanners/types`, zavihek Skenerji s seznamom, iskanja letov na njem.

**Independent Test**: uporabnik z dvema iskanjema letov in enim mock skenerjem vidi tri vrstice z
istimi števci kot zavihek Leti; tuji skenerji nevidni; tip brez registracije označen.

### Testi za US3

- [X] T060 [P] [US3] Pogodbeni test `apps/api/tests/contract/scanner/types.spec.ts` (`GET /scanners/types`: `enabled`, `available` po obsegih klicatelja — ključ brez `flight-deals:read` dobi `flights.available: false`; `presets` vključuje `hourly`) in `apps/api/tests/contract/scanner/list.spec.ts` (`GET /scanners`: vrstice `flights` iz `seedRule` z `resultCount` iz `seedMatch`, `schedule.mode: 'type'` z `nextRunAt`, `links.edit: /flight-deals/searches/<id>`; mock `single` definicija z `schedule.mode: 'own'`; `?type=`; tuje vrstice ne; definicija neregistriranega tipa `typeAvailable: false`; razvrstitev po `updatedAt`)
- [X] T061 [P] [US3] Integracijski test `apps/api/tests/integration/scanner/tab.spec.ts` (vzorec `flight-deals/tab-removal.spec.ts`): vnos `scanners` z `order: 13`, `requiredScopes: ['scanners:read']`; brez vnosa ga v `GET /tabs` ni, ostali ostanejo; `order` enolični

### Zaledje

- [X] T062 [US3] Dopolni `apps/api/src/modules/flight-deals/scanner/definitions.ts` in `type.ts`: `definitions.listForUser(userId, env, now)` → `ScannerSummary[]` iz `listOwnRules` + `readOfferCounts` (`schedule: { mode: 'type', label: scheduleLabel(typeSettings), nextRunAt }` — nastavitve tipa poda jedro v klicu, da modul ne bere `ScannerTypeSettingsModel`), `lastRun` iz `lastCheck` (`outcome: ok` kadar kateri vir `ok|noFlights`, sicer `failed`, `message` iz prvega izida z `message`), `links: { edit: '/flight-deals/searches/<id>', results: '/flight-deals?search=<id>' }`; `definitions.findForUser(userId, id)`; `definitions.countAll()`
- [X] T063 [US3] Ustvari `apps/api/src/platform/scanner/services/definition-access.service.ts` (`requireOwnDefinition(userId, id)` → 404, `listOwnDefinitions(userId, type?)`, `assertRoomForDefinition(userId, type, max)`, `validateConfigWithType(type, config, env)` → normaliziran config ali 400 s stavkom tipa, `requireRegisteredEnabledType(type, env)`) in `apps/api/src/platform/scanner/services/definition-listing.service.ts` (`listSummariesForUser(userId, callerScopes, env, now, typeFilter?)`: generične definicije → `ScannerSummary` (nextRunAt iz `nextRun`, `resultCount` z enim `aggregate` po `definitionId`, `typeAvailable`), + za vsak registriran tip z `definitions` in `available` obsegi `type.definitions.listForUser(...)` s `typeSettings`; združi, razvrsti po `updatedAt` padajoče; `toTypeInfo(type, env, callerScopes)`)
- [X] T064 [US3] Ustvari `apps/api/src/platform/scanner/router.ts` z `GET /scanners/types` (`requireScopes()`, `types[]` + `SCHEDULE_PRESETS`) in `GET /scanners` (`requireScopes(SCANNER_SCOPES.read)`, `actorUserId` po vzorcu 015 (`req.auth` / `req.apiKey.ownerId` / `resolveAutomationOwnerUserId`), `limits.maxPerUser`); vpni `apiV1Router.use(scannersRouter)` v `apps/api/src/main.ts` PRED admin usmerjevalnikom; zaženi T060, T061

### Odjemalec

- [X] T065 [US3] Ustvari `apps/web/src/app/features/scanners/scanners.page.ts`: seznam iz `list()` (ime, značka tipa z ikono, stikalo `enabled` za generične — pri `links.edit` zunaj `/scanners` stikalo kliče obstoječi API tipa? NE: stikalo je samo za generične, pri letih je vrstica povezava), `schedule.label`, `lastRun` z barvo, `nextRunLocal`, `resultCount`, oznaka "tip ni na voljo"; klik → `links.results`; gumb **Nov skener** → `/scanners/new`; gumb Administracija (admin) → `/scanners/admin`; prazno stanje z razlago; `ionViewWillEnter` osveži (vzorec `searches.page.ts`)
- [X] T066 [US3] Posodobi `apps/web/src/app/app.routes.ts`: `scanners` (authGuard + tabGuard, `scanners.page`) PRED `scanners/admin` in prihodnjimi `scanners/new`, `scanners/:scannerId`; posodobi `apps/web/tests/unit/scanners-routes.spec.ts` (koren tabGuard, podstrani brez)
- [X] T067 [US3] Enotski test `apps/web/tests/unit/scanners-model.spec.ts`: `scheduleSummary`, `runStatusLabel`, `changeLabel` (vključno `CHANGED`), `formatPrice` brez cene vrne `—`

**Checkpoint**: zavihek Skenerji kaže iskanja letov; klik vodi v Leti.

---

## Phase 6: User Story 4 — Ustvarim skener novega tipa v treh korakih (Priority: P2)

**Cilj**: CRUD generičnih definicij, čarovnik v treh korakih, tip `echo` z obrazcem.

**Independent Test**: uporabnik ustvari echo skener v treh korakih in ga vidi na seznamu z lastnim
urnikom; izbira tipa Leti preusmeri na urejevalnik iskanja; neveljaven cron 400 z razlago.

### Testi za US4

- [X] T070 [P] [US4] Pogodbeni test `apps/api/tests/contract/scanner/scanners-crud.spec.ts`: `POST /scanners` (201 z `Scanner`; `config` zavrnjen po shemi mock tipa s slovenskim stavkom → 400; tip `ownsDefinitions` → 400 z `createRoute` v `detail`; neregistriran tip 400; izklopljen tip 400; neveljaven cron/cona 400; meja `SCANNER_MAX_DEFINITIONS_PER_USER` 400); `GET /scanners/{id}` (tuj → 404, id iskanja letov → 404); `PATCH` (delni, `config` preverjen kot celota, sprememba izraza premakne `lastScheduledSlotAt`); `DELETE` (200 `{deleted:true}`, rezultati in zgodovina izbrisani); `Idempotency-Key` ponovljen vrne isti odgovor; API ključ s `scanners:write` brez obsega tipa → 403
- [X] T071 [P] [US4] Pogodbeni test `apps/api/tests/contract/scanner/access.spec.ts`: brez `scanners:read` 403 na seznamu; z `admin` vse; `X-Acting-User` admin vidi skenerje prevzetega uporabnika

### Zaledje

- [X] T072 [US4] Dopolni `apps/api/src/platform/scanner/router.ts`: `POST /scanners` (`definitionCreateSchema` → `requireRegisteredEnabledType` → `ownsDefinitions` 400 s `createRoute` → `validateConfigWithType` → `validateCron`/`isValidTimezone` → `assertRoom` → `create` s `schedule.mode: 'own'`, `lastScheduledSlotAt: now`; `auditDefinitionCreated`), `GET /scanners/:scannerId` (`requireOwnDefinition` → `Scanner`), `PATCH` (zlij, preveri celoto, `lastScheduledSlotAt = now` ob spremembi izraza/cone), `DELETE` (`deleteOne` + `ScannerResultModel.deleteMany` + `ScannerResultHistoryModel.deleteMany` po `resultId`); `toScannerResponse`
- [X] T073 [P] [US4] Ustvari `apps/api/src/modules/echo-scanner/scenario.ts` (čista: `echoResults(runIndex, items, label)` → `NormalizedResult[]`: `identity: echo:<label>:<i>`, `title: "<label> #<i>"`, `price: { amount: 100 + i, currency: 'EUR' }`; zagon ≥ 3: rezultat 1 cena −10; zagon ≥ 4: rezultat `items` manjka), `apps/api/src/modules/echo-scanner/notifications.ts` (`verify` vrne postavke, kot so, s `title` in `price` iz `payload`; `render` → zadeva `emailSubject(appName, 'Skenerji', '<n> sprememb')`, html/text s seznamom), `apps/api/src/modules/echo-scanner/scanner-type.ts` (`type: 'echo'`, `label: 'Echo (testni)'`, `icon: 'layers-outline'`, `execution: 'single'`, `results: 'generic'`, `isEnabled: env.SCANNER_ECHO_ENABLED`, `configSchema: z.object({ items: z.number().int().min(1).max(20), label: z.string().max(40).default('Echo') })`, `validateConfig` vrne slovenski stavek, `describeConfig`, `execute` (T086 — tu stub, ki vrne prazen izid), `notifications`), `apps/api/src/modules/echo-scanner/index.ts` (`registerEchoScannerType()`); vrstica v `apps/api/src/main.ts`
- [X] T074 [P] [US4] Enotski test `apps/api/tests/unit/echo-scanner/scenario.spec.ts` (zagon 1–4 vzorec, determinističnost) in `apps/api/tests/unit/echo-scanner/config.spec.ts` (`items: 0` in `items: 21` zavrnjeno s slovenskim stavkom)

### Odjemalec

- [X] T075 [P] [US4] Ustvari `apps/web/src/app/core/scanners/scanner-config-form.ts`: vmesnik `ScannerConfigForm { config: WritableSignal<Record<string, unknown>>; validate(): string | null }` (vsak `configComponent` ga izpolni) in `apps/web/src/app/features/echo-scanner/echo-config.component.ts` (polje "Število rezultatov" 1–20, "Oznaka"; `validate()` slovensko) ter `apps/web/src/app/features/echo-scanner/scanner-ui.ts` (`registerEchoScannerUi()` z `configComponent: () => import('./echo-config.component.js')`); vrstica v `apps/web/src/main.ts`
- [X] T076 [US4] Ustvari `apps/web/src/app/features/scanners/scanner-wizard.page.ts` (`/scanners/new` in `/scanners/:scannerId/edit`): korak 1 izbira tipa iz `types()` filtrirana `enabled && available` (kartice z ikono, imenom, opisom); tip z `createRoute` → `router.navigateByUrl(createRoute)`; korak 2 `NgComponentOutlet` z `configComponent` tipa (brez komponente → sporočilo "tip nima obrazca") in `validate()` pred naprej; korak 3 ime, `schedule-form` (presets iz `types()`), stikalo obvestil; **Shrani** → `create`/`update`, napaka strežnika kot eno sporočilo (`describeError`); pri urejanju korak 1 preskočen
- [X] T077 [US4] Posodobi `apps/web/src/app/app.routes.ts`: `scanners/new` in `scanners/:scannerId/edit` (authGuard) PRED `scanners/:scannerId`; `scanners-routes.spec.ts`: statična `scanners/new` pred parametrično; `scanners.page.ts`: vrstica generične definicije ima gumb Uredi → `links.edit` (`/scanners/<id>/edit`) in brisanje s potrditvijo (vzorec `searches.page.ts`)

**Checkpoint**: echo skener nastane v treh korakih; izvajanje še ne (US5).

---

## Phase 7: User Story 5 — Skener po lastnem urniku zbere rezultate, zazna spremembe in me obvesti (Priority: P2)

**Cilj**: generična shramba rezultatov z dedupom, spremembami, zgodovino in nedosegljivostjo;
ročni zagon lastnika; zagoni skenerja; rezultati prek API in na generični strani; echo scenarij
od konca do konca; izolacija napak.

**Independent Test**: echo skener v štirih zagonih da NEW → UNCHANGED → PRICE_DOWN → UNAVAILABLE
z dopisi 1, 0, 1, 0; dva skenerja, eden vedno odpove, drugi uspe.

### Testi za US5

- [X] T080 [P] [US5] Enotski test `apps/api/tests/unit/scanner/result-store.spec.ts` (nad v-pomnilniško bazo): prvi `reconcileResults` ustvari N rezultatov `NEW` + N vrstic zgodovine + N dogodkov; ponovitev z istimi → `UNCHANGED`, brez dogodkov, `lastSeenAt` posodobljen, brez podvojitve; drugačna cena → `PRICE_DOWN` z `previousPrice`, dogodek; rezultat brez cene z drugim `comparable` → `CHANGED`; `sourceSucceeded: false` NE označi manjkajočih; `sourceSucceeded: true` označi manjkajoče `UNAVAILABLE` + zgodovina + brez dogodka; rezultat brez `identity` se zavrže in šteje `incomplete`; `url` z gostiteljem zunaj `allowedHosts` tipa → `null`
- [X] T081 [P] [US5] Integracijski test `apps/api/tests/integration/scanner/echo-scenario.spec.ts`: `SCANNER_ECHO_ENABLED=true`, uporabnik, `POST /scanners` echo `items: 3`, urnik `hourly`; štirje `runScannerTick` ob terminih → stanja rezultatov in dopisov kot v quickstart §3 (nodemailer mockan); `GET /scanners/{id}/results` razvrstitve `seen|price|change`, `includeUnavailable`; `GET /scanners/{id}/results/{resultId}` z `history` 4 točk; `GET /scanners/{id}/runs` 4 zagoni; `ScannerDefinition.status` po zadnjem zagonu; v produkcijskem okolju `loadEnv` zavrne
- [X] T082 [P] [US5] Integracijski test `apps/api/tests/integration/scanner/error-isolation.spec.ts`: mock `single` tip, katerega `execute` vrže pri definiciji A in uspe pri B: isti tik → zagon A `failed` z `runErrors[0].code`, zagon B `succeeded` z dopisom; mock `batch` tip, ki v `definitions[]` vrne `failed` za eno in `ok` za drugo → zagon `partial`, dopis samo za `ok`; `execute` vrže v zagonu 1 in uspe v zagonu 2 → rezultati samo iz drugega; izbris definicije med zagonom (mock čaka na signal) → zagon `cancelled` brez rezultatov in dopisov
- [X] T083 [P] [US5] Pogodbeni test `apps/api/tests/contract/scanner/manual-run.spec.ts`: `POST /scanners/{id}/run` lastnik → 202 `Run`; tuj → 404; iskanje letov (batch) → 403; isti skener teče → 409; deluje pri `enabled: false`; `GET /scanners/{id}/runs` samo zagoni tega skenerja, pri letih zagoni tipa

### Zaledje

- [X] T084 [US5] Ustvari `apps/api/src/platform/scanner/services/result-store.service.ts`: `reconcileResults({ definition, runId, scannerType, items, sourceSucceeded, now, env, allowedHosts? })` → `{ events, counters: { seen, new, changed, unavailable, incomplete } }` (upsert po `{definitionId, identityKey}`, `detectChange`, `previousPrice`, zgodovina z `expiresAt`, `UNAVAILABLE` za `availability: available` z `lastSeenAt < now` pri `sourceSucceeded`, dogodki z `recipients: [definition.userId]`, `payload: { resultId, title, price, previousPrice, url }`); `genericResultReader: ResultReader` (`list` po `sort`, `includeUnavailable`, `limit`; `count` z `aggregate`; `get` z `history`); `toResultResponse` (+ `change` iz `classifyChange`)
- [X] T085 [US5] Dopolni `apps/api/src/platform/scanner/services/run-executor.service.ts` (T037): `ctx.results = { reconcile: (items, opts) => reconcileResults({...}) }` pri `scope.kind === 'definition'` in `results: 'generic'`; po zagonu `ScannerDefinition.status` (`lastRunId, lastRunAt, lastOutcome, message, lastSuccessAt`)
- [X] T086 [US5] Dopolni `apps/api/src/modules/echo-scanner/scanner-type.ts` `execute(ctx)`: `runIndex = countDocuments({ 'scope.definitionId', status: { $in: [succeeded, partial, failed] } }) + 1` prek `ctx.previousRunCount` (doda se v `ExecutionContext`, jedro ga izračuna — modul ne bere `ScannerRunModel`), `echoResults(...)`, `ctx.results.reconcile(items, { sourceSucceeded: true })` → `ExecutionOutcome` (`definitions: [{ outcome: 'ok' }]`, `counters` iz reconcile, `events`)
- [X] T087 [US5] Dopolni `apps/api/src/modules/flight-deals/scanner/results.ts` in `type.ts`: `resultReader` nad `offer-query.service.ts` (`list(definitionId, userId, query)` → `listOffersForRule` preslikan v `Result` (`title: "LJU → STN, pet 23. 10."`, `url: bookingUrl`, `price`, `data: Offer` iz pogodbe 015, `firstSeenAt: match.firstMatchedAt`), `count` → `readOfferCounts`, `get` → `getOfferDetail` s `history`)
- [X] T088 [US5] Dopolni `apps/api/src/platform/scanner/router.ts`: `POST /scanners/:scannerId/run` (generična → `requestManualRun({kind:'definition'})` + takojšnji `executeRun`; id iz `type.definitions.findForUser` (leti) → 403 "zagon tipa sproži administrator"), `GET /scanners/:scannerId/runs` (generična: po `scope.definitionId`; tip z definicijami: `scannerType` + `scope.kind: 'type'`; `RunSummary`), `GET /scanners/:scannerId/results` in `/results/:resultId` (generična → `genericResultReader`; tip → `type.resultReader`); vrstni red: statične poti pred `:scannerId`
- [X] T089 [US5] Zaženi T080–T083 in cel `scanner` + `echo` nabor — zeleno

### Odjemalec

- [X] T090 [P] [US5] Ustvari `apps/web/src/app/features/scanners/result-list.component.ts` (privzeti prikaz: naslov s povezavo `url`, vir, cena ali `—`, značka spremembe z barvo kot pri ponudbah, prvič/zadnjič videno, nedosegljivi zatemnjeni; vhod `results`, izhod `select`) in `apps/web/src/app/core/scanners/scanner-results-view.ts` (vmesnik `ScannerResultsView { scannerId: InputSignal<string>; results: InputSignal<Result[]> }`)
- [X] T091 [US5] Ustvari `apps/web/src/app/features/scanners/scanner-results.page.ts` (`/scanners/:scannerId`): glava z imenom, tipom, urnikom, zadnjim zagonom; gumb **Zaženi zdaj** (samo `schedule.mode === 'own'`; po 202 osvežuje na 3 s do konca zagona), Uredi, stikalo `enabled`; `NgComponentOutlet` z `resultsComponent` tipa ali `result-list`; segment Rezultati / Zagoni (`runs()` z `RunSummary`); klik na rezultat → podrobnosti z zgodovino (modal ali razširjena vrstica, točke `history`); 404 → "skener ne obstaja"
- [X] T092 [US5] Posodobi `apps/web/src/app/app.routes.ts`: `scanners/:scannerId` (authGuard) ZA statičnimi; `scanners-routes.spec.ts` dopolni; `scanners.page.ts`: klik na generično vrstico → `/scanners/<id>`

**Checkpoint**: echo skener živi od konca do konca; leti nedotaknjeni.

---

## Phase 8: User Story 6 — Razvijalec doda nov tip skenerja brez spremembe jedra (Priority: P3)

**Cilj**: dokumentacija, dokaz odstranitve, pogodbi usklajeni.

**Independent Test**: izbris echo modula (mapa × 2, vrstici × 2) pusti preverjanja čista;
`docs/adding-a-scanner-type.md` pokriva vseh šest tem iz FR-052.

- [ ] T100 [P] [US6] Integracijski test `apps/api/tests/integration/echo-scanner/removal.spec.ts`: brez `registerEchoScannerType()` (reset registra + registracija samo `flights`) `GET /scanners/types` tipa `echo` ne vsebuje, obstoječa echo definicija ima `typeAvailable: false`, tik zanjo ne ustvari zagona, `DELETE` deluje; jedro in leti zeleni
- [ ] T101 [P] [US6] Napiši `docs/adding-a-scanner-type.md`: korak za korakom (1 mapa modula, 2 `ScannerType` z vsemi polji in kaj pomeni `batch`/`single`, `generic`/`custom`; 3 adapter do vira prek `platform/cache` po vzorcu `flight-deals/providers/types.ts`; 4 korak obdelave: normalizacija, `identity`, `comparable`, kdaj `reconcile`; 5 `notifications.verify/render`; 6 `admin.extras`; 7 registracija v `main.ts`; 8 odjemalec: `ScannerConfigForm`, `ScannerResultsView`, `registerScannerUi`, vrstica v `main.ts`; 9 urnik: presets, cona, `defaultSchedule`; 10 obsegi in `BASE_USER_SCOPES`; 11 testi, ki jih tip MORA imeti; 12 odstranitev) z echo kot zgledom in sklici na datoteke
- [ ] T102 [P] [US6] Napiši `docs/scanner-engine.md`: arhitektura (plasti iz naročila §3 preslikane na datoteke), cevovod tika (research §12), zbirke in TTL, `slotKey` in zapore, sočasnost, outbox in zadušitve, drop starih zbirk 015 (kaj, kdaj, dnevnik), okolje (`SCANNER_*`, rezerve `FLIGHT_*`), kako leti uporabljajo jedro in česa jedro o letih ne ve; posodobi `docs/adding-a-tab.md` (korak "modul, ki preverja po urniku, je tip skenerja — glej adding-a-scanner-type.md") in `README.md` (razdelek "Skenerji (016)")
- [ ] T103 [US6] Posodobi `specs/015-flight-deals/contracts/openapi.yaml`: odstrani `/flight-deals/admin/*`, sheme `SchedulerSettings`, `Run`, `NotificationAdmin`, tag `admin`; v `info.description` opomba "administracija je od 016 v `/scanners/admin/*`"; `npm run generate:contracts`; `npx --yes @redocly/cli lint` obeh pogodb; posodobi `specs/015-flight-deals/data-model.md` (tri zbirke označene kot nadomeščene z 016) in `quickstart.md` 015 §4, §6, §8 (poti admina)

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T110 Preveri `apps/api/src/platform/health/router.ts` in `extension.ts`: jedro NE registrira health razširitve (slot je 002); dodaj `scanner` polje v `/health` SAMO, če obstaja prosto mesto brez spremembe pogodbe 001 — sicer zapiši v `docs/scanner-engine.md` kot omejitev (kot 015 research §16)
- [ ] T111 [P] Preglej vse nize v `platform/scanner/**` in `features/scanners/**`: slovenščina, tikanje, brez tehničnih podrobnosti v sporočilih uporabniku (člen X); angleški identifikatorji
- [ ] T112 [P] `apps/api/tests/unit/scanner-core-boundary.spec.ts` zelen po vseh spremembah; `grep -ri flight apps/api/src/platform/scanner` vrne samo `legacy-cleanup.service.ts`
- [ ] T113 Izvedi `quickstart.md` §1–§5 ročno nad `npm run dev:api` + `npm run dev:web` s `FLIGHT_FAKE_PROVIDER_ENABLED=true` in `SCANNER_ECHO_ENABLED=true`; zabeleži odstopanja kot naloge
- [ ] T114 `npm run typecheck && npm run lint && npm test` v korenu zeleno; `npx --yes @redocly/cli lint` obeh pogodb; `git status` brez nepričakovanih datotek; nobenega novega niza, ki je videti kot skrivnost

---

## Dependencies & Execution Order

### Faze

- **Setup (1)** → **Foundational (2)** → **US1 (3)** → **US2 (4)** → **US3 (5)** → **US4 (6)** →
  **US5 (7)** → **US6 (8)** → **Polish (9)**.
- T010 (regresijski posnetek) MORA biti zelen nad kodo 015 pred T040–T048.
- US2 je odvisna od US1 (admin potrebuje jedro, ki teče); US3 od US2 (tip-settings za `nextRunAt`
  na seznamu); US4 od US3 (seznam prikaže ustvarjeno); US5 od US4 (echo definicija obstaja); US6
  od US5 (odstranitev dokazuje celoten tip).

### Vzporedne priložnosti

- Phase 1: T002–T008 vzporedno po T001.
- Phase 2: T011–T016 vzporedno; T017–T022 vzporedno (T017 pred T033); T023–T026 vzporedno, T027–T028 po njih.
- Phase 3: T030–T032 vzporedno z T033–T039 (testi z mock tipom ne potrebujejo letov); T040–T044 po T033–T039; T045–T047 zaporedno; T048 po T047.
- Phase 4: T050 vzporedno s T051; T053–T055 vzporedno s T051; T056–T058 po njih.
- Phase 5: T060–T061 vzporedno z T062–T063; T064 po njih; T065–T067 vzporedno po T064.
- Phase 6: T070–T071 vzporedno z T072–T074; T075 vzporedno s T076; T077 na koncu.
- Phase 7: T080–T083 vzporedno z T084; T085–T088 zaporedno; T090 vzporedno s T091.
- Phase 8: T100–T102 vzporedno; T103 na koncu.

### Parallel Example: Phase 3 (US1)

```bash
# Testi z mock tipom in storitve jedra tečejo hkrati (različne datoteke):
Task: "run-lifecycle.spec.ts z mock batch tipom"          (T030)
Task: "notification-outbox.spec.ts z mock tipom"          (T031)
Task: "legacy-cleanup.spec.ts"                            (T032)
Task: "type-settings.service.ts"                          (T033)
Task: "scheduler.service.ts"                              (T034)
Task: "notification-builder.service.ts"                   (T035)
Task: "notification-sender.service.ts"                    (T036)
# Nato zaporedno: run-executor (T037) → tick (T038) → leti (T040–T048)
```

---

## Implementation Strategy

### MVP (Phase 1–3: jedro + leti)

1. Setup in Foundational (T001–T028), vključno z regresijskim posnetkom T010.
2. US1 (T030–T049): leti tečejo po jedru, vsi testi 015 zeleni.
3. **STOP in preveri**: quickstart §2 ročno; SC-001, SC-002 izpolnjena. To je že samostojno
   uporabno stanje — nič, kar vidi uporabnik, se ni spremenilo, admin pa še nima zaslona
   (naslednja faza).

### Postopna dostava

1. + US2 → administracija na enem mestu, preusmeritev stare poti.
2. + US3 → zavihek Skenerji s seznamom (vključno z leti).
3. + US4 + US5 → nov tip od ustvarjanja do dopisa (echo).
4. + US6 → dokumentacija in dokaz odstranitve; pogodbi usklajeni.
5. Polish.

### Kaj se ne sme zgoditi med izvedbo

- Sprememba pričakovanj v testih 015 razen poti/uvozov (FR-039).
- Uvoz iz `modules/` v `platform/scanner/` (T016 to ujame).
- Ročno brisanje zbirk, ki niso tri iz research §9.

---

## Notes

- `[P]` = druga datoteka, brez odvisnosti od nedokončane naloge.
- Vsaka faza se konča s `npm run typecheck && npm run lint` in testi faze zelenimi.
- Commit po vsaki fazi ali logični skupini; sporočila po vzorcu repozitorija (`feat(scanner): …`,
  `refactor(flight-deals): …`).
- Kjer naloga pravi "prenos iz" datoteke 015, se koda prenese z obstoječimi komentarji in se
  spremeni samo tisto, kar je letalsko; zgodovina odločitev v komentarjih je del vrednosti.
