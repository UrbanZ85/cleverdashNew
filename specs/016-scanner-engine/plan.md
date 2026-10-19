# Implementation Plan: Univerzalni modularni scanner engine (Skenerji)

**Branch**: `016-scanner-engine` | **Date**: 2026-10-19 | **Spec**: [spec.md](spec.md)
**Input**: Naročilo "Refactor Existing Flight Scanner into a Universal Modular Scanner Engine" in
odločitve lastnika z dne 19. 10. 2026 (research.md §2, §3, §9).

## Summary

Zanka "urnik → zajem → primerjava → obvestilo" se iz modula Leti (015) izvleče v skupno
zmogljivost `platform/scanner/`: register tipov, definicije, urnik tipa in urnik skenerja, zagon z
zaporami, generična shramba rezultatov, outbox dopisov, administracija in zavihek "Skenerji".
Modul Leti ostane svoj modul z lastnimi zbirkami in vmesnikom ter se v jedro registrira kot tip
`flights` z batch izvajanjem; svoj tik, zagone, urnik, outbox in admin preda jedru. Testni tip
`echo` dokaže, da nov tip pride brez spremembe jedra.

| kaj je tu prvič | kako je rešeno |
|---|---|
| skupna zmogljivost, ki izvaja kodo modulov po urniku | register tipov v `platform/scanner/registry.ts`; tik kliče `type.execute(ctx)` (research §1, §12) |
| dva načina izvajanja v enem tiku | `execution: 'batch' \| 'single'`; urnik tipa proti urniku definicije; `slotKey` z obsegom (research §2, §4) |
| seznam, ki združi zapise iz dveh shramb | `ScannerSummary` iz `scannerdefinitions` + `type.definitions.listForUser()` (research §3) |
| dopis, ki ga sestavi jedro, izriše pa tip | `ScannerNotification.items[].payload` + kavlja `verify`/`render` (research §6) |
| namerno brisanje zbirk ob zagonu | `legacy-cleanup.service.ts`, odločitev lastnika (research §9) |

## Technical Context

- **Jezik**: TypeScript, Node 22, Express 5, Mongoose 8, Zod, `croner`, Luxon (zaledje); Angular
  20 + Ionic 8 standalone + signals (odjemalec). Vse že v repozitoriju.
- **Nove odvisnosti**: NOBENE na obeh straneh.
- **Nove spremenljivke okolja**: `SCANNER_TICK_SECONDS` (60), `SCANNER_RUN_STALE_MINUTES` (30),
  `SCANNER_RUN_RETENTION_DAYS` (90), `SCANNER_HISTORY_RETENTION_DAYS` (180),
  `SCANNER_MAX_CONCURRENT_RUNS` (1), `SCANNER_MAX_DEFINITIONS_PER_USER` (20),
  `SCANNER_ECHO_ENABLED` (false, produkcija zavrne). Trije `FLIGHT_*` postanejo rezerve z
  opozorilom (research §9). Vse s privzetkom → `docker compose up` iz čiste kopije deluje.
- **Shramba**: 6 zbirk jedra (data-model.md); 3 zbirke 015 se dropnejo ob zagonu; 5 zbirk 015
  nedotaknjenih (samo `ref` oznake).
- **Zmogljivost**: SC-009 — seznam z 20 iskanji letov in 5 echo skenerji v < 2 s (dve poizvedbi
  na tip, brez N+1: `readOfferCounts` za lete, `countDocuments` po `definitionId` za generične).
  Tik izvede vse čakajoče zagone zaporedno; pri `SCANNER_MAX_CONCURRENT_RUNS=1` je to današnje
  vedenje letov.
- **Omejitve**: brez transakcij → unikatni indeksi in `findOneAndUpdate` s pogojem v filtru
  (kot 015). Ena API instanca; zaščita med izvodi vseeno (FR-016).
- **Obseg**: 6 zbirk, ~17 poti, 4 strani + 2 komponenti odjemalca, 1 testni modul, ~25 novih
  testnih datotek, ~10 preseljenih.

## Constitution Check

| člen | kako je izpolnjen |
|---|---|
| I — modul je samostojen | Jedro v `platform/scanner/` ne uvaža iz `modules/` (test `scanner-core-boundary.spec.ts`, SC-003). Leti se registrirajo z eno vrstico v `main.ts` in eno v `apps/web/src/main.ts`; echo enako. Brisanje modula Leti: mapa × 2, vnos zavihka, 2 vrstici registracije, poti, obsegi, ikone — jedro teče naprej (US1 scenarij 4, `tab-removal.spec.ts` ostane). Brisanje echo: mapa × 2 + 2 vrstici (SC-004). |
| II — enoten izvor | Iste poti pod `/api/v1`; preusmeritev `/flight-deals/admin → /scanners/admin` je pot odjemalca. |
| III — API-first | Pogodba [`contracts/openapi.yaml`](contracts/openapi.yaml): vse v vmesniku je pot; `Idempotency-Key` na vseh mutacijah; `DELETE` vrne `200` s telesom; `409` za zaseden obseg, `404` za tuje. Administracija brez API ključa (`platform/auth/admin-guard.ts`). 015 pogodba izgubi `/admin/*` — zapisano v obeh pogodbah. |
| IV — skrivnosti | Jedro ne pozna žetonov; `config` tipa je preverjen z Zod shemo brez skrivnosti (tip, ki bi potreboval poverilnice, jih bere iz okolja, kot leti). `extras` tipa za admin brez skrivnosti (leti že izpolnjujejo). E-naslovi samo prek `readUserEmails` v poštno sejo. |
| V — determinizem in idempotentnost | V.1: urnik je `ScannerTypeSettings`/`ScannerDefinition.schedule`, zagon je `ScannerRun`; v pomnilniku samo `setInterval`. V.2: tik vpraša "kateri termin je zapadel in nima zagona" za oba obsega; dohitevanje zadnjega termina. V.3: unikatni `slotKey` (z obsegom), `(definitionId, identityKey)`, `(recipientUserId, runId)`. V.4: `Europe/Ljubljana` privzeto; cona na urniku; `slotKey` v coni urnika. |
| VI — nobene neverificirane akcije | Dopis: outbox s poskusi, `lastError`, `sentAt`, `messageId`, `failed` z razlogom; `UNAVAILABLE` samo iz uspešnega odgovora vira (generična shramba in leti enako). |
| VII — pokvarjen sistem pove | `ScannerRun.definitions[]` z izidom na skener, `runErrors[]`, `extras`; `ScannerDefinition.status` in `ScannerSummary.lastRun`; `typeAvailable: false` na seznamu; `suppressed` z razlogom; dnevnik `scanner.*` z `runId`; srčni utrip ostane pri 002 oz. `startHeartbeat`, tik jedra ga ne podvaja (research §12, korak 5 samo kadar 002 ne teče). |
| VIII — vljudnost do virov | Jedro NE kliče virov (FR-004); tipi gredo prek `platform/cache` in lastnih semaforjev (leti nespremenjeni). Echo ne gre po omrežju. |
| IX — testabilno brez brskalnika | `schedule-slots`, `price-change`, `change-detection`, `definition-input`, `run-status` so čiste funkcije v `platform/scanner/domain/`; `result-store` in `notification-builder` testirani nad v-pomnilniško bazo; tip `echo` je determinističen. |
| X — slovenščina v domeni | `id: 'scanners'`, `route: '/scanners'`, `type: 'flights' \| 'echo'` angleško; naslov "Skenerji", besedila slovenska; presets z slovenskimi `label`. |
| XI — mobilna naprava je odjemalec | Vse izvajanje na strežniku; odjemalec bere in nastavlja. |
| XII — meje | Jedro ne dodaja nobenega dostopa do tujih sistemov; `config` ne izvaja kode (FR-005). |

### Kakovostna vrata

1. `npm run typecheck`, `npm run lint` čista; brez `any` v `platform/scanner/**` (pravilo že velja
   za `platform/**`).
2. **Domenska logika ima enotske teste.** Od štirih imenovanih primerov imata predmet dva; ostala
   dva sta nadomeščena:

   | imenovan primer | ima predmet? | kaj ga tu pokriva |
   |---|---|---|
   | prehod na poletni/zimski čas | **DA** | `latestDueSlot('0 6 * * *', 'Europe/Ljubljana')` čez 25. 10. 2026 da 06:00 lokalno, `slotKey` nosi `+01:00` po prehodu in `+02:00` pred njim (preseljen test); urnik echo skenerja v coni `America/New_York` da termin v tisti coni |
   | praznik na delovni dan | ne — jedro koledarja ne pozna | izraz `0 8 * * 1` da ponedeljek po ISO; izraz, ki se nikoli ne sproži, da `nextRunAt: null` in ne zagona |
   | dopust čez mejo meseca | ne — obdobij ni | hramba: `expiresAt` rezultatov in zgodovine čez prelom meseca in leta; `latestDueSlot` čez prelom leta |
   | neuspel klic, ki se uspešno ponovi | **DA** | pošta pade, nato uspe → en dopis, `attemptCount` 2; `execute()` vrže v zagonu 1, uspe v zagonu 2 → prvi `failed`, drugi `succeeded`, rezultati samo iz drugega; `sending` obtiči → po roku nazaj v `pending` |

3. OpenAPI pogodba 016 validna (`@redocly/cli lint`), dodana v `packages/contracts/scripts/generate.ts`
   in v CI; pogodba 015 posodobljena (odstranjen `admin`).
4. Zagon iz čiste kopije brez dopolnjevanja `.env`: vse ima privzetek; brez vklopljenih tipov
   tik ne naredi nič in to zabeleži enkrat.
5. Noben nov niz, ki je videti kot skrivnost.

## Project Structure

### Dokumentacija

```
specs/016-scanner-engine/
├── spec.md
├── plan.md            ← ta datoteka
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
├── contracts/openapi.yaml
└── tasks.md           ← /speckit-tasks
docs/
├── scanner-engine.md             arhitektura jedra, cevovod, zbirke, drop starih zbirk, okolje
└── adding-a-scanner-type.md      korak za korakom (tip, adapter, korak obdelave, obrazec, prikaz, urnik), echo kot predloga
```

### Nova koda (API) — jedro

```
apps/api/src/platform/scanner/
├── types.ts                        ScannerType<TConfig>, ExecutionContext, ExecutionOutcome, ScannerEvent,
│                                   ScannerSummary, ResultReader, NotificationHooks; enumi (RUN_STATUSES, CHANGE_TYPES …)
├── registry.ts                     registerScannerType, listScannerTypes(env?), findScannerType, resetScannerTypesForTests
├── scopes.ts                       scanners:read | scanners:write
├── scanner.audit.ts                scanner.run.*, scanner.notification.*, scanner.schedule.updated, scanner.definition.*, scanner.legacy.dropped
├── router.ts                       /scanners/types, /scanners, /scanners/{id}, /run, /runs, /results, /results/{resultId}
├── admin.router.ts                 /scanners/admin/types, /types/{type}/schedule, /runs, /runs/{id}, /cancel, /notifications
├── models/
│   ├── scanner-definition.model.ts
│   ├── scanner-type-settings.model.ts
│   ├── scanner-run.model.ts
│   ├── scanner-result.model.ts
│   ├── scanner-result-history.model.ts
│   └── scanner-notification.model.ts
├── domain/
│   ├── schedule-slots.ts           ← preseljeno iz flight-deals (presets + hourly, validateCron, nextRun, latestDueSlot, slotKeyFor)
│   ├── price-change.ts             ← preseljeno iz flight-deals (classifyChange, isNotifiable)
│   ├── change-detection.ts         detectChange(existing, incoming) → ChangeType (cena ali comparableHash)
│   ├── identity.ts                 identityKeyOf(identity: string)
│   ├── definition-input.ts         Zod: create/patch ovojnica, query sheme, admin sheme
│   ├── run-status.ts               statusFromDefinitions(outcomes) → succeeded | partial | failed
│   └── schedule-label.ts           slovenski opis urnika ("vsakih 6 ur", "po urniku tipa …")
└── services/
    ├── definition-access.service.ts   requireOwnDefinition → 404, listOwn, assertRoom, configValidation prek tipa
    ├── definition-listing.service.ts  ScannerSummary: generične + type.definitions.listForUser; nextRunAt; resultCount
    ├── type-settings.service.ts       getOrCreateTypeSettings(type), updateTypeSchedule, markTypeSlot
    ├── scheduler.service.ts           markInterruptedRuns, scheduleDueRuns (type + definition), requestManualRun(scope)
    ├── run-executor.service.ts        claim → ctx → type.execute → notifications → finish; heartbeat, cancel
    ├── result-store.service.ts        reconcileResults(definition, run, items, {sourceSucceeded}) → events; genericReader
    ├── notification-builder.service.ts  events → ScannerNotification (1/prejemnik/zagon; merge po resultRef)
    ├── notification-sender.service.ts   outbox: claim, type.verify, type.render, sendEmail, backoff, reclaim
    ├── legacy-cleanup.service.ts      drop flightsearchruns | flightschedulersettings | flightnotifications
    └── tick.ts                        runScannerTick(env, logger, now, opts), startScannerScheduler, stopForTests
apps/api/src/platform/auth/
└── admin-guard.ts                  requireAdminUser()  (dvig iz modules/flight-deals/admin-guard.ts, research §11)
```

### Spremembe modula Leti (API)

```
apps/api/src/modules/flight-deals/
├── scanner/
│   ├── type.ts                     flightScannerType — registracija: type 'flights', label 'Leti', icon, execution 'batch',
│   │                               results 'custom', scopes FLIGHT_DEALS_SCOPES, defaultSchedule daily-06-18, isEnabled → true
│   ├── execute.ts                  execute(ctx): telo današnjega run-executor (rules → windows → plan → runQueries → reconcile) → ExecutionOutcome
│   ├── definitions.ts              listForUser / findForUser → ScannerSummary (iz FlightSearchRule + readOfferCounts; links na /flight-deals/…)
│   ├── results.ts                  ResultReader nad offer-query (listOffersForRule → Result[])
│   ├── notifications.ts            verify (današnji verifyItems) + render (renderDigest)
│   └── admin-extras.ts             providers status + dailyLimit + email configured (iz admin.router.ts)
├── services/reconcile.service.ts   MatchEvent → ScannerEvent (recipients, definitionName, payload)
├── services/run-executor.service.ts   IZBRISANO (telo v scanner/execute.ts)
├── services/tick.ts, scheduler-settings.service.ts, notification-builder.service.ts, notification-sender.service.ts  IZBRISANO
├── models/flight-search-run.model.ts, flight-notification.model.ts, flight-scheduler-settings.model.ts  IZBRISANO
├── admin.router.ts, admin-guard.ts   IZBRISANO
├── domain/schedule-slots.ts, domain/price-change.ts   IZBRISANO (preseljeno; uvoz iz platform/scanner/domain)
├── domain/types.ts                 brez RUN_*, NOTIFICATION_*, SUPPRESSED_*, SCHEDULE_PRESET_IDS (iz platform/scanner/types)
├── domain/rule-input.ts            brez runsQuerySchema, notificationsQuerySchema, schedulerPutSchema
├── router.ts                       /overview: lastRun prek latestFinishedRun('flights'); brez sprememb pogodbe
└── flight-deals.audit.ts           brez run/notification/scheduler dogodkov (v scanner.audit.ts)
```

### Nova koda (API) — testni tip

```
apps/api/src/modules/echo-scanner/
├── scanner-type.ts                 echoScannerType: execution 'single', results 'generic', configSchema {items 1–20, label?},
│                                   isEnabled = env.SCANNER_ECHO_ENABLED, execute po scenariju (indeks iz števila prejšnjih zagonov definicije)
├── scenario.ts                     čista funkcija: (runIndex, items) → NormalizedResult[] (120/89/… vzorec kot fake provider)
├── notifications.ts                verify (vrne, kot je) + render (preprost dopis z naslovom in ceno)
└── index.ts                        registerEchoScannerType()
```

### Nova koda (web)

```
apps/web/src/app/core/scanners/
├── scanner-ui.registry.ts          registerScannerUi, findScannerUi; ScannerUiPlugin (configComponent?, resultsComponent?, adminExtrasComponent?, createRoute?)
├── scanners.api.ts                 types, list, get, create, update, delete, run, runs, results, result, admin/*
└── scanners.model.ts               tipi iz pogodbe + čiste funkcije: scheduleLabel, runStatusLabel, changeLabel, formatPrice (preseljeno iz flight-deals.model kjer generično)
apps/web/src/app/features/scanners/
├── scanners.page.ts                seznam (zavihek), stikalo vklopa, brisanje, "Nov skener", povezava Administracija (admin)
├── scanner-wizard.page.ts          3 koraki; korak 1 preusmeri na createRoute pri ownsDefinitions; korak 2 NgComponentOutlet; korak 3 schedule-form + obvestila
├── scanner-results.page.ts         kontejner: resultsComponent tipa ali privzeti seznam; zgodovina rezultata
├── schedule-form.component.ts      preset/cron/timezone, skupna za čarovnik in admin
├── scanners-admin.page.ts          tipi (urnik, Preveri zdaj), zagoni, obvestila, adminExtrasComponent tipa
└── result-list.component.ts        privzeti prikaz rezultatov
apps/web/src/app/features/flight-deals/
├── scanner-ui.ts                   registerFlightScannerUi(): createRoute '/flight-deals/searches/new', adminExtrasComponent → providers-panel
├── providers-panel.component.ts    izvlečeno iz admin.page.ts (viri, dnevne meje, pošta)
└── admin.page.ts                   IZBRISANO; pot 'flight-deals/admin' → redirectTo '/scanners/admin?type=flights'
apps/web/src/app/features/echo-scanner/
├── echo-config.component.ts        ScannerConfigForm: ena številka
└── scanner-ui.ts                   registerEchoScannerUi()
```

### Dotiki obstoječih datotek

| datoteka | sprememba |
|---|---|
| `apps/api/src/main.ts` | `apiV1Router.use(scannersRouter); apiV1Router.use(scannersAdminRouter);` `registerFlightScannerType(); registerEchoScannerType();` `await dropLegacyFlightSchedulerCollections(logger); if (NODE_ENV !== 'test') startScannerScheduler(env, logger);` — odstrani `flightDealsAdminRouter`, `startFlightDealsScheduler` |
| `apps/api/src/platform/tabs/registry.ts` | vnos `scanners`, "Skenerji", `scan-outline`, `/scanners`, `order: 13`, `requiredScopes: ['scanners:read']`, `enabled: true` |
| `apps/api/src/platform/keycloak/role-mapping.ts` | `scanners:read`, `scanners:write` v `BASE_USER_SCOPES` |
| `apps/api/src/platform/config/env.ts` | `SCANNER_*` + rezerve `FLIGHT_*` z opozorilom; `SCANNER_ECHO_ENABLED` v produkciji zavrnjen |
| `apps/web/src/main.ts` | `registerFlightScannerUi(); registerEchoScannerUi();` |
| `apps/web/src/app/app.routes.ts` | `scanners` (tabGuard), `scanners/new`, `scanners/admin`, `scanners/:scannerId` (authGuard); `flight-deals/admin` → redirect |
| `apps/web/src/app/core/icons/register-icons.ts` + `tests/unit/icons.spec.ts` | `scan-outline`, `play-outline`, `stop-circle-outline` |
| `apps/web/src/app/shared/help/help-topics.ts` | `flightDeals.scheduler` → `scanners.schedule`; nov `scanners.types` |
| `apps/api/tests/unit/no-owner-fields.spec.ts` | `ScannerDefinition`, `ScannerResult` NOSITA; `ScannerRun` NE |
| `apps/api/tests/contract/flight-deals/admin.spec.ts`, `tests/integration/flight-deals/*` | poti `/scanners/admin/*`, `runScannerTick`, `requestManualRun({ kind: 'type', type: 'flights' })` |
| `specs/015-flight-deals/contracts/openapi.yaml` | odstrani `/flight-deals/admin/*`, `SchedulerSettings`, `Run`, `NotificationAdmin`, tag `admin`; opomba na 016 |
| `packages/contracts/scripts/generate.ts`, `.github/workflows/ci.yml` | cilj in lint za 016 |
| `.env.example`, `docs/env-reference.md` | razdelek "Skenerji (016)"; `FLIGHT_*` trije označeni kot zastareli |
| `README.md`, `docs/adding-a-tab.md` | razdelek 016; napotek "modul, ki preverja po urniku, je tip skenerja" |

### Testi

```
apps/api/tests/unit/scanner/            registry, definition-input, schedule-slots (preseljen), price-change (preseljen),
                                        change-detection, run-status, result-store, schedule-label, env-aliases
apps/api/tests/unit/scanner-core-boundary.spec.ts   platform/scanner ne uvaža iz modules/ in ne vsebuje 'flight'
apps/api/tests/contract/scanner/        _helpers, types, scanners-crud, access, results, admin, manual-run
apps/api/tests/integration/scanner/     run-lifecycle, error-isolation, notification-outbox, echo-scenario, legacy-cleanup, tab
apps/api/tests/integration/echo-scanner/removal.spec.ts
apps/api/tests/integration/flight-deals/digest-regression.spec.ts   SC-002: 3 zagoni s testnim virom → iste postavke kot pred refaktoringom (posnetek)
apps/web/tests/unit/                    scanners-model.spec.ts, scanners-routes.spec.ts, scanner-ui-registry.spec.ts
```

Obstoječi testi 015 ostanejo in se prilagodijo samo v poteh/uvozih (FR-039, SC-001).

## Faze izvedbe (preslikava naročila §15 na naloge)

| faza iz naročila | kaj nastane | odvisno od |
|---|---|---|
| 1 — odkrivanje in arhitektura | ta mapa | — |
| 2 — regresijski testi | `digest-regression.spec.ts` (posnetek postavk dopisov s testnim virom PRED refaktoringom), pregled pokritosti 015 | 1 |
| 3 — generično jedro | `platform/scanner/*` (tipi, register, modeli, domena, scheduler, run-executor, result-store, outbox, tick, admin guard), testi jedra z mock tipom v testu | 2 |
| 4 — vtičnik letov | `modules/flight-deals/scanner/*`, brisanje preseljenih datotek, prilagoditev reconcile/router, registracija, drop starih zbirk, prilagoditev testov 015 | 3 |
| 5 — odjemalec | `core/scanners`, `features/scanners`, registracija UI, preusmeritev admina, providers-panel | 4 |
| 6 — migracija | `legacy-cleanup.service.ts` + test + docs (brez prenosa podatkov) | 4 |
| 7 — razširljivost | `modules/echo-scanner`, `features/echo-scanner`, echo-scenario test, removal test | 3, 5 |
| 8 — dokumentacija | `docs/scanner-engine.md`, `docs/adding-a-scanner-type.md`, env-reference, README, pogodbi | vse |

V `tasks.md` se faze prepletejo po uporabniških zgodbah: US1 (jedro + leti) → US2 (admin) → US3
(seznam) → US4/US5 (čarovnik, rezultati, echo) → US6 (dokumentacija, odstranitev).

## Complexity Tracking

| odstop | zakaj | enostavnejša možnost zavrnjena, ker |
|---|---|---|
| Čarovnik pri tipu z lastnimi definicijami (leti) po koraku 1 preusmeri na obstoječi urejevalnik, namesto da bi koraka 2 in 3 izrisal sam (FR-041) | obrazec iskanja (527 vrstic, predogled, prejemniki) je že celota s svojimi preverjanji; urnik je tipov in v koraku 3 ne bi imel kaj nastaviti | razbitje urejevalnika na komponento + ovoj bi spreminjalo vedenje letov, ki ga naročilo prepoveduje; "isti obrazec z istimi preverjanji" je izpolnjen dobesedno |
| Drop treh zbirk ob zagonu brez migracije | odločitev lastnika 19. 10. 2026: podatki pogrešljivi | `renameCollection` + backfill + rollback je koda za podatke, ki jih nihče ne rabi (research §9) |
| Dvig `admin-guard.ts` v `platform/auth/` (dotik zunaj modula) | jedro potrebuje varuha; kopija v `platform/scanner/` bi bila tretja kopija | 014 ostane pri svoji kopiji; dvig je bil v 015 že predlagan (research §11) |
| `counters` kot `Map<string, number>` namesto fiksne sheme | tip prispeva svoja imena števcev (leti osem) | fiksna shema z vsemi števci vseh tipov je natanko `switch` po tipu v modelu |
| Modul `echo-scanner` brez zavihka | tip ni zavihek; precedens `modules/auth` | echo v `platform/scanner/` bi pomenil, da jedro vsebuje tip (FR-001) |
