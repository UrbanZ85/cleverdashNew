---

description: "Naloge za izvedbo funkcionalnosti 002 — beleženje časa"
---

# Tasks: Beleženje časa

**Input**: Design documents from `/specs/002-time-tracking/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/openapi.yaml](./contracts/openapi.yaml), [quickstart.md](./quickstart.md)

**Tests**: **Vključeni.** Kakovostno vrato 2 ustave zahteva enotske teste domenske logike za
vse štiri poimenske primere (tukaj imajo vsi predmet, za razliko od 001) — glej
[quickstart.md](./quickstart.md) §4 za poimenski seznam 15 obveznih primerov.

**Organization**: Naloge so razvrščene po uporabniških zgodbah iz [spec.md](./spec.md)
(P1–P11), da je vsaka zgodba samostojno izvedljiva in preverljiva. Prioriteta P1 je
namenoma ročni pritisk (Story 1: "Ročni pritisk in preverjeno stanje iz aplikacije"), ne
samodejni dan — enak vzorec kot pri 001, kjer je P1 tudi gradnik, ne končna vrednost.

**Odvisnost od 001**: vsa avtentikacija, obvestila (naprave), API ključi, idempotentnost in
register zavihkov so **že zgrajeni**. Naloge spodaj jih razširijo (nove vrednosti, nova
polja), nikoli ne podvojijo (glej [research.md](./research.md) §6–§7).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: lahko teče vzporedno (druge datoteke, brez odvisnosti)
- **[Story]**: kateri uporabniški zgodbi naloga pripada (US1–US11)
- Vsak opis vsebuje natančno pot do datoteke

## Path Conventions

Monorepo po [plan.md](./plan.md), razdelek Project Structure:

- **API**: `apps/api/src/modules/time-tracking/`, `apps/api/src/platform/`, `apps/api/src/domain/`; testi v `apps/api/tests/`
- **Web**: `apps/web/src/app/features/time-tracking/`; testi v `apps/web/tests/`
- **Deljeni tipi**: `packages/contracts/`
- **Postavitev**: `infra/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Zapolni vrzeli, ki jih je 001 predvidela, a ni dokončala (research.md §14), in
pripravi Chromium v Dockerju. Brez tega noben modul kasneje ne more zanesljivo teči proti
pravemu ali celo lažnemu brskalniku.

- [X] T001 [P] Razširi Zod shemo v `apps/api/src/platform/config/env.ts` z `PUPPETEER_SKIP_DOWNLOAD`, `PUPPETEER_EXECUTABLE_PATH`, `BROWSER_HEADLESS`, `BROWSER_TIMEOUT_MS`, `BROWSER_PROTOCOL_TIMEOUT_MS`, `BROWSER_NO_SANDBOX`, `BROWSER_USER_AGENT`, `SCHEDULER_ENABLED`, `SCHEDULER_TICK_SECONDS`, `SCHEDULE_TIMEZONE`, `DRY_RUN`, `CLOCK_PORTAL`, `SCREENSHOT_DIR`, `SCREENSHOT_RETENTION_DAYS` — research.md §14
- [X] T002 [P] Razširi `apps/api/tests/unit/env.spec.ts` z novimi obveznimi/privzetimi vrednostmi iz T001 (manjkajoča obvezna ustavi zagon z imenom spremenljivke)
- [X] T003 [P] Dodaj `shm_size: 1gb`, `init: true` in `mem_limit: 1500m` na storitev `api` v `infra/docker-compose.yml` — research.md §2
- [X] T004 [P] Dodaj `fonts-liberation` in `ca-certificates` v `apt-get install` v `infra/api.Dockerfile` (Chromium in `PUPPETEER_*` sta že nameščena iz 001) — research.md §14
- [X] T005 [P] Dodaj obsege `state:read`, `action:write`, `schedule:read`, `schedule:write`, `calendar:read`, `calendar:write`, `history:read`, `webhooks:write` v `apps/api/src/platform/auth/scopes.ts` — research.md §7
- [X] T006 [P] Dodaj vnos `time-tracking` (`order: 5`, med `dashboard` in `settings`) v `apps/api/src/platform/tabs/registry.ts` — research.md §10
- [X] T007 [P] Razširi `packages/contracts/scripts/generate.ts`, da poleg 001-ove pogodbe generira tudi tipe iz `specs/002-time-tracking/contracts/openapi.yaml` v `packages/contracts/src/generated/time-tracking.d.ts`; dodaj preverjanje veljavnosti obeh pogodb v `.github/workflows/ci.yml` (vrata 3)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Domenska logika brez brskalnika (člen IX), `ClockPortal` z lažno in pravo
izvedbo, vsi novi modeli in razširitev obstoječega zdravstvenega/obvestilnega sloja iz 001.

**⚠️ CRITICAL**: Nobena zgodba se ne začne, dokler ta faza ni končana.

- [X] T008 [P] Implementiraj izpeljavo stanja ure iz razpoložljivih akcij v `apps/api/src/domain/clock-state.ts` (`Konec malice` preverjen pred `Konec dela`) — research.md §1
- [X] T009 [P] Implementiraj izračun dejanskega časa akcije (raztros omejen navzgor, DST-varno) v `apps/api/src/domain/scheduling.ts` — research.md §4, `docs/legacy-engine.md` §4.4
- [X] T010 [P] Implementiraj odločitev o statusu dneva po fiksni prednosti (`forceWorkday > odsotnost > praznik > dan tedna`) v `apps/api/src/domain/calendar.ts` — FR-014
- [X] T011 [P] Enotski test `apps/api/tests/unit/clock-state.spec.ts`: vse štiri preslikave, vključno z vrstnim redom `Konec malice`/`Konec dela` in praznim naborom → `UNKNOWN` (odvisno od T008)
- [X] T012 [P] Enotski test `apps/api/tests/unit/scheduling.spec.ts`: prehod na poletni čas (neobstoječa ura), prehod na zimski čas (podvojena ura, prva pojavitev), raztros nikoli ne prelije v naslednjo uro — regresija `docs/legacy-engine.md` §4.4 (odvisno od T009)
- [X] T013 [P] Enotski test `apps/api/tests/unit/calendar.spec.ts`: praznik na delovni dan, dopust čez mejo meseca, `forceWorkday` na praznik prevlada (odvisno od T010)
- [X] T014 [P] Definiraj vmesnik `ClockPortal` (`readState`, `performAction`) v `apps/api/src/modules/time-tracking/clock-portal/clock-portal.interface.ts` — research.md §1
- [X] T015 [P] Implementiraj `FakeClockPortal` s skriptiranimi zaporedji stanj v `apps/api/src/modules/time-tracking/clock-portal/fake-clock-portal.ts` (odvisno od T014) — uporabljajo ga vsi nadaljnji enotski/integracijski testi
- [X] T016 Implementiraj `PuppeteerClockPortal` v `apps/api/src/modules/time-tracking/clock-portal/puppeteer-clock-portal.ts`: nov `createBrowserContext()` na operacijo zaprt v `finally`, `overridePermissions(["geolocation"])`, mobilni `BROWSER_USER_AGENT`, odstranitev `addHomeScreenDiv`, selektor `a.clockin-button`, posnetek zaslona ob napaki v `SCREENSHOT_DIR` (odvisno od T014) — `docs/legacy-engine.md` §1, research.md §2
- [X] T017 Implementiraj izbiro `ClockPortal` po `CLOCK_PORTAL` (`puppeteer`/`fake`) v `apps/api/src/modules/time-tracking/clock-portal/index.ts` (odvisno od T015, T016)
- [X] T018 [P] Ustvari model `remoteSessions` v `apps/api/src/modules/time-tracking/models/remote-session.model.ts` — data-model.md
- [X] T019 [P] Ustvari model `trackingLocations` v `apps/api/src/modules/time-tracking/models/tracking-location.model.ts` (unikaten `name`) — data-model.md
- [X] T020 [P] Ustvari model `trackingProfiles` s podshemo `ActionPlan` v `apps/api/src/modules/time-tracking/models/tracking-profile.model.ts`; `mode` privzeto `AUTO` (FR-007) — data-model.md
- [X] T021 [P] Ustvari model `plannedActions` v `apps/api/src/modules/time-tracking/models/planned-action.model.ts` z unikatnim indeksom `(localDate, profileId, actionName)` — data-model.md, `docs/legacy-engine.md` §4.3
- [X] T022 [P] Ustvari model `actionAttempts` v `apps/api/src/modules/time-tracking/models/action-attempt.model.ts` (brez TTL) — data-model.md
- [X] T023 [P] Ustvari model `actionRecords` v `apps/api/src/modules/time-tracking/models/action-record.model.ts` (nespremenljiv, brez TTL) — data-model.md, FR-052
- [X] T024 [P] Ustvari model `holidays` v `apps/api/src/modules/time-tracking/models/holiday.model.ts` (`isHoliday`/`isWorkFree` ločeno) — data-model.md
- [X] T025 [P] Ustvari model `absencePeriods` v `apps/api/src/modules/time-tracking/models/absence-period.model.ts` (`endDate` vključen) — data-model.md
- [X] T026 [P] Ustvari model `calendarDays` v `apps/api/src/modules/time-tracking/models/calendar-day.model.ts` (unikaten `(localDate, profileId)`) — data-model.md
- [X] T027 [P] Ustvari model `calendarOverrides` v `apps/api/src/modules/time-tracking/models/calendar-override.model.ts` — data-model.md
- [X] T028 [P] Ustvari model `notificationRecords` v `apps/api/src/platform/notifications/notification-record.model.ts` z `dedupeKey` indeksom in TTL 90 dni — data-model.md, FR-072/FR-073
- [X] T029 [P] Razširi `apps/api/src/platform/notifications/channels.ts` s kanaloma `reminder` (visoka pomembnost) in `confirmation` (nizka) — research.md §6
- [X] T030 [P] Ustvari persistenten model `heartbeats` v `apps/api/src/platform/health/heartbeat.model.ts` (TTL 14 dni) — data-model.md
- [X] T031 Izvozi `pingOnce` iz `apps/api/src/platform/health/heartbeat.ts` za ponovno uporabo v tiku schedulerja, brez spremembe javnega vedenja `startHeartbeat`/`getHeartbeatStatus` — research.md §8 "Integracijska podrobnost"
- [X] T032 Razširi `GET /health` v `apps/api/src/platform/health/router.ts` s polji iz `HealthExtension` (`schedulerLastTickAgeSeconds`, `browser`, `remoteSessions`, `failedActionsLast24h`, `missedActionsLast24h`, `diskFreeBytes`, `screenshotBytes`), privzeto `unknown`/`0`, dokler jih US2/US8/US10 ne napolnijo z resničnimi vrednostmi
- [X] T033 Implementiraj skelet tika schedulerja na `SCHEDULER_TICK_SECONDS` v `apps/api/src/modules/time-tracking/scheduler.ts`: ob vsakem tiku pokliče `pingOnce` (T031) in zapiše `Heartbeat` (odvisno od T030, T031)
- [X] T034 Poveži usmerjevalnik `time-tracking` in `startScheduler(...)` v `apps/api/src/main.ts`; `startHeartbeat`-ov lasten 60-sekundni interval se ne zažene več ločeno, ko je scheduler aktiven (odvisno od T033)
- [X] T035 [P] Pripravi pomožnik za pogodbene teste 002 (nalaganje `contracts/openapi.yaml`) v `apps/api/tests/contract/time-tracking/_helpers.ts`, po vzoru 001

**Checkpoint**: Domenska logika je testirana brez brskalnika, `FakeClockPortal` deluje, vsi
modeli obstajajo, scheduler tika in poroča zdravje. Delo na zgodbah se lahko začne.

---

## Phase 3: User Story 1 - Ročni pritisk in preverjeno stanje iz aplikacije (Priority: P1) 🎯 MVP

**Goal**: Uporabnik iz zaslona "Danes" prebere trenutno stanje in ročno sproži
razpoložljivo akcijo; sistem jo izvede, preveri in zapiše v zgodovino.

**Independent Test**: Odpri zaslon "Danes" pri znanem stanju (`FakeClockPortal`), pritisni
razpoložljivo akcijo, preveri izid v nekaj sekundah in zapis z `source: manual`.

### Tests for User Story 1 ⚠️

> Napiši te teste prve in preveri, da padejo, preden začneš z izvedbo.

- [X] T036 [P] [US1] Pogodbeni test `GET /time-tracking/state` in `GET /time-tracking/available-actions` v `apps/api/tests/contract/time-tracking/state.spec.ts`
- [X] T037 [P] [US1] Pogodbeni test `POST /time-tracking/actions` v `apps/api/tests/contract/time-tracking/actions.spec.ts`
- [X] T038 [P] [US1] Enotski test `already_done`/`unexpected_state` predpreverjanja v `apps/api/tests/unit/action-executor.spec.ts` — FR-033, quickstart.md §4 primer 9
- [X] T039 [P] [US1] Integracijski test celotnega ročnega toka (branje → klik → verifikacija → zapis `source: manual`) z `FakeClockPortal` v `apps/api/tests/integration/manual-action.spec.ts`

### Implementation for User Story 1

- [X] T040 [US1] Implementiraj `ActionExecutor` (predpreverjanje, `performAction`, ponovno branje, verifikacija) v `apps/api/src/modules/time-tracking/services/action-executor.service.ts` (odvisno od T017, T021–T023)
- [X] T041 [US1] Implementiraj kratkoživ predpomnilnik branja stanja (`cacheSeconds`, privzeto 60, `refresh=true` obide) v `apps/api/src/modules/time-tracking/services/state-cache.service.ts`
- [X] T042 [US1] Implementiraj `GET /time-tracking/state` in `GET /time-tracking/available-actions` v `apps/api/src/modules/time-tracking/router.ts` (odvisno od T040, T041)
- [X] T043 [US1] Implementiraj `POST /time-tracking/actions` (vir `manual`/`api` iz vrste avtentikacije) prek `platform/idempotency` v `router.ts` (odvisno od T040)
- [X] T044 [US1] Ujemi ročno akcijo z današnjo načrtovano, če obstaja, in jo označi kot opravljeno (opozorilo zanjo se ustavi) — FR-042, US1 sprejemni scenarij 5 (odvisno od T043, T021)
- [X] T045 [US1] Implementiraj `POST /time-tracking/diagnostics/test-read` (`dry-run`, brez klika) v `router.ts` (odvisno od T040) — FR-035, FR-064
- [X] T046 [P] [US1] Ustvari zaslon "Danes" (seznam razpoložljivih akcij, gumbi za ročni pritisk, izbira lokacije) v `apps/web/src/app/features/time-tracking/today/today.page.ts`
- [X] T047 [P] [US1] Ustvari komponento za prikaz izida akcije v `apps/web/src/app/features/time-tracking/today/action-result.component.ts`

**Checkpoint**: US1 je v celoti delujoča in samostojno preverljiva — ročno pritiskanje z
verifikacijo nadomesti obisk strani delodajalca.

---

## Phase 4: User Story 2 - Samodejno beleženje ob delovnem dnevu (Priority: P2)

**Goal**: Profil v `AUTO` samodejno izvede in preveri akcije ob dogovorjenem času, brez
posega uporabnika, s potrditvenim obvestilom.

**Independent Test**: Ustvari profil v `AUTO` za tekoči dan z `FakeClockPortal`, počakaj do
tika ob načrtovanem času, preveri izvedbo, verifikacijo in obvestilo.

### Tests for User Story 2 ⚠️

- [X] T048 [P] [US2] Enotski test `ScheduleBuilder`: `upsert` na unikatni ključ je idempotenten, dejanski čas izračunan enkrat v `apps/api/tests/unit/schedule-builder.spec.ts` — FR-003
- [X] T049 [P] [US2] Enotski test: profil brez veljavnega delovnega dne ne ustvari akcij v `apps/api/tests/unit/schedule-builder-calendar.spec.ts` (odvisno od T010)
- [X] T050 [P] [US2] Integracijski test celotnega `AUTO` tika (načrt → zapadla akcija → izvedba → verifikacija → potrditveno obvestilo) v `apps/api/tests/integration/auto-tick.spec.ts`

### Implementation for User Story 2

- [X] T051 [US2] Implementiraj `ScheduleBuilder` (sestavi načrt danes/jutri prek `upsert`, uporabi `calendar.ts` in `scheduling.ts`) v `apps/api/src/modules/time-tracking/services/schedule-builder.service.ts` (odvisno od T009, T010, T020, T021, T024–T027)
- [X] T052 [US2] Poveži korak "poskrbi za načrt" v `scheduler.ts` (odvisno od T033, T051)
- [X] T053 [US2] Poveži korak "pobere zapadle akcije, obdela zaporedno" z atomarnim prehodom `due → running` kot zaklepom (FR-034) v `scheduler.ts` (odvisno od T033, T040)
- [X] T054 [US2] Implementiraj potrditveno obvestilo (privzeto samo prva in zadnja akcija dneva, nastavljivo) ob uspešni samodejni izvedbi (odvisno od T028, T029, T053)
- [X] T055 [US2] Implementiraj `POST /time-tracking/rebuild-plan` v `router.ts` (odvisno od T051)
- [X] T056 [P] [US2] Implementiraj `GET/POST /time-tracking/profiles` in `GET/PUT/DELETE /time-tracking/profiles/{id}` z zavrnitvijo prekrivanja `daysOfWeek` med aktivnimi profili (FR-006) v `router.ts`
- [X] T057 [P] [US2] Implementiraj `PUT /time-tracking/profiles/{id}/mode` v `router.ts`
- [X] T058 [P] [US2] Implementiraj `GET /time-tracking/profiles/{id}/preview` (brez zapisovanja) v `router.ts` (odvisno od T051)
- [X] T059 [P] [US2] Implementiraj `GET /time-tracking/planned-actions[/{id}]` in `PATCH /time-tracking/planned-actions/{id}` v `router.ts`
- [X] T060 [P] [US2] Implementiraj `GET/POST /time-tracking/locations` in `PUT /time-tracking/sessions/{id}` (maskiranje piškotka, FR-092) v `router.ts`
- [X] T061 [P] [US2] Ustvari zaslon "Urnik" (seznam profilov, urejanje časov/načina, gumb za predogled) v `apps/web/src/app/features/time-tracking/schedule/schedule.page.ts` in razdelek "Beleženje časa" (lokacije, seja) v obstoječem zaslonu Nastavitve

**Checkpoint**: US1 in US2 delujeta skupaj — samodejno beleženje je zdaj vrednost, ki jo
funkcionalnost obljublja.

---

## Phase 5: User Story 3 - Zaznava neuspešnega klika in ponovni poskus (Priority: P3)

**Goal**: Neuspel ali neverificiran klik se ponovi z naraščajočim zamikom; po izčrpanih
poskusih pride obvestilo in akcija ostane vidno `failed`.

**Independent Test**: `FakeClockPortal` skriptiran tako, da klik ne učinkuje; preveri
ponovitve z naraščajočim zamikom, posnetek zaslona in končno obvestilo.

### Tests for User Story 3 ⚠️

- [X] T062 [P] [US3] Enotski test naraščajočega zamika med poskusi v `apps/api/tests/unit/action-executor-retry.spec.ts` — quickstart.md §4 primer 5
- [X] T063 [P] [US3] Enotski test: izčrpani poskusi → `failed`, nikoli `succeeded` v `apps/api/tests/unit/action-executor-exhausted.spec.ts` — regresija `docs/legacy-engine.md` §4.5

### Implementation for User Story 3

- [X] T064 [US3] Razširi `ActionExecutor` z razporejanjem ponovnih poskusov (`nextAttemptAt`, `retryBackoffSeconds`) v `action-executor.service.ts` (odvisno od T040)
- [X] T065 [US3] Implementiraj shranjevanje posnetka zaslona ob neuspehu v `SCREENSHOT_DIR`, pot zapisana na `actionAttempts` (odvisno od T016, T022)
- [X] T066 [US3] Poveži tik, da pobere tudi akcije s `nextAttemptAt ≤ now` (odvisno od T053, T064)
- [X] T067 [US3] Implementiraj obvestilo o neuspehu po izčrpanih poskusih (FR-043/FR-044) (odvisno od T028, T029)
- [X] T068 [P] [US3] Prikaži stanje `failed` in razširljive poskuse na zaslonu "Danes" in v zgodovini (predogled komponente, polna zgodovina pride v US9)

**Checkpoint**: Samodejni način je odporen na spodrsljaje — tih neuspeh ni več mogoč.

---

## Phase 6: User Story 4 - Način samo opozarjanje (Priority: P4)

**Goal**: V `REMIND_ONLY` sistem nikoli ne klikne, ampak opozori po strpnem obdobju in
ponavlja do meje ali do ročne izvedbe/preskoka.

**Independent Test**: Profil v `REMIND_ONLY`, pusti čas preteči; preveri, da ni klika, da
pride opozorilo in da se ustavi ob zaznani ročni izvedbi.

### Tests for User Story 4 ⚠️

- [X] T069 [P] [US4] Enotski test: `REMIND_ONLY` nikoli ne pokliče `performAction` v `apps/api/tests/unit/reminder-service.spec.ts` — quickstart.md §4 primer 10
- [X] T070 [P] [US4] Integracijski test: ročna izvedba med opozarjanjem ustavi nadaljnja opozorila v `apps/api/tests/integration/reminder-external-stop.spec.ts`

### Implementation for User Story 4

- [X] T071 [US4] Implementiraj `ReminderService` (strpno obdobje, opozorilo, ponovitev/ustavitev, zaznava zunanje izvedbe) v `apps/api/src/modules/time-tracking/services/reminder-service.ts`
- [X] T072 [US4] Poveži tik: `mode: REMIND_ONLY` → `ReminderService.check()` namesto `ActionExecutor` (odvisno od T053, T071)
- [X] T073 [US4] Implementiraj opozorilni kanal z `dedupeKey` (FR-073/FR-074) (odvisno od T028, T029)
- [X] T074 [P] [US4] Dodaj ročno preskočitev (`PATCH /time-tracking/planned-actions/{id}`, `state: skipped`) v `router.ts`

**Checkpoint**: Varnejši alternativni način je na voljo, neodvisen od klikanja.

---

## Phase 7: User Story 5 - Koledar delovnih dni: prazniki in vikendi (Priority: P5)

**Goal**: Sistem pozna slovenske dela proste dni; na njih se ne ustvari nobena akcija, dan
pa je viden v koledarskem pregledu z razlogom.

**Independent Test**: Sestavi načrt za teden s praznikom na delovni dan profila; preveri
brez akcij in pravilen status/razlog v pregledu.

### Tests for User Story 5 ⚠️

- [X] T075 [P] [US5] Enotski test izračuna praznikov (fiksni + premikajoči po veliki noči) v `apps/api/tests/unit/holidays.spec.ts` — research.md §5
- [X] T076 [P] [US5] Pogodbeni test `GET/POST /time-tracking/holidays` in `GET /time-tracking/calendar` v `apps/api/tests/contract/time-tracking/calendar.spec.ts`

### Implementation for User Story 5

- [X] T077 [US5] Implementiraj izračun slovenskih praznikov (fiksni datumi + anonimni gregorijanski algoritem za veliko noč, `isHoliday`/`isWorkFree` ločeno za 17. 8. in 23. 11.) v `apps/api/src/modules/time-tracking/services/holiday-seed.service.ts` — research.md §5
- [X] T078 [US5] Implementiraj enkratno polnjenje praznikov ob prvem dostopu vsakega koledarskega leta (odvisno od T024, T077)
- [X] T079 [US5] Implementiraj `GET/POST /time-tracking/holidays` (ročni vnos prevlada) v `router.ts`
- [X] T080 [US5] Implementiraj `GET /time-tracking/calendar` v `router.ts` (odvisno od T010, T026)
- [X] T081 [P] [US5] Ustvari zaslon "Koledar" (mesečni pregled s statusi in razlogi, urejanje praznikov) v `apps/web/src/app/features/time-tracking/calendar/calendar.page.ts`

**Checkpoint**: Samodejni način miruje na dela prostih dnevih brez ročnega posega vsak teden.

---

## Phase 8: User Story 6 - Dopust in druge odsotnosti (Priority: P6)

**Goal**: Vnesena odsotnost izklopi urnik za celotno obdobje (vključno oba konca), urnik pa
se prvi delovni dan po njej sam nadaljuje.

**Independent Test**: Vnesi večdnevno odsotnost čez mejo meseca; preveri brez akcij v
celotnem obdobju in samodejno nadaljevanje po njem.

### Tests for User Story 6 ⚠️

- [X] T082 [P] [US6] Enotski test odsotnosti čez mejo meseca v `apps/api/tests/unit/calendar-absence.spec.ts` — quickstart.md §4 primer 4
- [X] T083 [P] [US6] Pogodbeni test `POST/GET/DELETE /time-tracking/absences` v `apps/api/tests/contract/time-tracking/absences.spec.ts`

### Implementation for User Story 6

- [X] T084 [US6] Implementiraj `GET/POST /time-tracking/absences` in `DELETE /time-tracking/absences/{id}` z zavrnitvijo prekrivanja s `forceWorkday` izjemo v `router.ts` (odvisno od T025, T027)
- [X] T085 [US6] Ob ustvarjanju/brisanju odsotnosti razveljavi prizadete `calendarDays` in prestavi prihodnje `plannedActions` v `cancelled` (odvisno od T026, T021)
- [X] T086 [P] [US6] Dodaj vnos odsotnosti v zaslon "Koledar" (odvisno od T081)

**Checkpoint**: Dopust je enkraten vnos vnaprej, ne ročno ugašanje vsak dan.

---

## Phase 9: User Story 7 - Izredni delovni dan (Priority: P7)

**Goal**: Posamičen sicer dela prost dan se lahko vsili kot delovni, brez spreminjanja
profila.

**Independent Test**: Vnesi `forceWorkday` za soboto; preveri enake akcije kot za običajen
delovni dan tega profila.

### Tests for User Story 7 ⚠️

- [X] T087 [P] [US7] Enotski test: `forceWorkday` prevlada nad statusom praznika v `apps/api/tests/unit/calendar-override.spec.ts` — quickstart.md §4 primer 6
- [X] T088 [P] [US7] Pogodbeni test `POST /time-tracking/overrides` z zavrnitvijo prekrivanja z odsotnostjo v `apps/api/tests/contract/time-tracking/overrides.spec.ts`

### Implementation for User Story 7

- [X] T089 [US7] Implementiraj `POST /time-tracking/overrides` z zavrnitvijo prekrivanja z obstoječo odsotnostjo v `router.ts` (odvisno od T025, T027)
- [X] T090 [P] [US7] Dodaj vnos izrednega delovnega dne v zaslon "Koledar" (odvisno od T081)

**Checkpoint**: Vseh sedem koledarskih/urniških zgodb (P1–P7) je zdaj samostojno delujočih.

---

## Phase 10: User Story 8 - Opozorilo na potekajočo sejo pri delodajalcu (Priority: P8)

**Goal**: Uporabnik izve za potekajočo sejo vsaj 7 dni prej; prazen nabor akcij se
diagnosticira kot potekla seja, ne kot generična napaka.

**Independent Test**: Nastavi sejo z rokom čez manj kot 7 dni; preveri opozorilo in pravilno
diagnozo ob praznem naboru akcij.

### Tests for User Story 8 ⚠️

- [X] T091 [P] [US8] Enotski test pragov opozorila (7/3/1 dan) v `apps/api/tests/unit/session-monitor.spec.ts` — FR-063
- [X] T092 [P] [US8] Enotski test razločevanja vzroka (`session_expired`/`page_unreachable`/`selector_not_found`) v `apps/api/tests/unit/diagnostics-reason.spec.ts` — FR-022

### Implementation for User Story 8

- [X] T093 [US8] Implementiraj `SessionMonitor` (dnevno preverjanje, opozorilo ob 7/3/1 dnevu) v `apps/api/src/modules/time-tracking/services/session-monitor.service.ts` (odvisno od T018, T028)
- [X] T094 [US8] Poveži razločevanje vzroka napake v `ClockPortal`/`ActionExecutor` obravnavi napak (odvisno od T016, T040)
- [X] T095 [US8] Dokončaj `PUT /time-tracking/sessions/{id}`: takojšnje preizkusno branje po shranjevanju nove vrednosti (odvisno od T060, T040)
- [X] T096 [US8] Poveži dnevno preverjanje seje v tik schedulerja (odvisno od T033, T093)
- [X] T097 [P] [US8] Prikaži stanje seje in dni do izteka na zaslonu "Diagnostika" v `apps/web/src/app/features/time-tracking/diagnostics/diagnostics.page.ts`

**Checkpoint**: Potek seje je diagnosticiran in sporočen, preden urnik tiho odpove.

---

## Phase 11: User Story 9 - Zgodovina beleženja (Priority: P9)

**Goal**: Vsaka akcija je vidna v filtrirljivi, nespremenljivi zgodovini, razširljivi do
posameznih poskusov.

**Independent Test**: Ustvari akcije z različnimi izidi/viri; preveri filtriranje in
razširitev do poskusov s posnetkom zaslona.

### Tests for User Story 9 ⚠️

- [X] T098 [P] [US9] Pogodbeni test `GET /time-tracking/history` in `/history/{id}/attempts` v `apps/api/tests/contract/time-tracking/history.spec.ts`
- [X] T099 [P] [US9] Integracijski test filtrov in straničenja v `apps/api/tests/integration/history-filters.spec.ts`

### Implementation for User Story 9

- [X] T100 [US9] Implementiraj `GET /time-tracking/history` (filtri: obdobje, profil, tip, izid; straničeno) v `router.ts` (odvisno od T023)
- [X] T101 [US9] Implementiraj `GET /time-tracking/history/{id}/attempts` v `router.ts` (odvisno od T022)
- [X] T102 [US9] Implementiraj prepis zaključenih `plannedActions` v `actionRecords` in čiščenje po `PLANNED_ACTION_RETENTION_DAYS` (odvisno od T021, T023)
- [X] T103 [P] [US9] Ustvari zaslon "Zgodovina" (filtri, razširljivi zapisi s posnetki) v `apps/web/src/app/features/time-tracking/history/history.page.ts`

**Checkpoint**: Uporabnik lahko ob nesoglasju z evidenco delodajalca preveri svojo stran zgodbe.

---

## Phase 12: User Story 10 - Dohitevanje po izpadu sistema (Priority: P10)

**Goal**: Restart kadarkoli dohiti zamujene akcije po pravilih namesto da jih tiho preskoči;
akcija sredi ponovnih poskusov ob polnoči se zapre kot `missed`.

**Independent Test**: Ustavi sistem čez načrtovani čas, znova zaženi; preveri obdelavo po
pravilih in obvestilo o zamudi zaradi izpada. Ločeno preveri polnočno prekinitev poskusov.

### Tests for User Story 10 ⚠️

- [X] T104 [P] [US10] Enotski test dohitevanja: znotraj `maxDelayMinutes` izvede, sicer `missed` v `apps/api/tests/unit/catchup.spec.ts` — quickstart.md §4 primer 11
- [X] T105 [P] [US10] Enotski test polnočnega zaprtja: prekine tekoč niz poskusov, brez klika po polnoči v `apps/api/tests/unit/midnight-close.spec.ts` — FR-045, quickstart.md §4 primer 12
- [X] T106 [P] [US10] Integracijski test restarta sredi dneva: že izvedene akcije nedotaknjene, čakajoče dohitene v `apps/api/tests/integration/restart-catchup.spec.ts`

### Implementation for User Story 10

- [X] T107 [US10] Implementiraj dohitevanje ob zagonu (poizvedba po zapadlih pred prvim tikom) (odvisno od T053)
- [X] T108 [US10] Implementiraj polnočno zaprtje na začetku vsakega tika (`localDate < today ∧ state ∉ terminal → missed`) (odvisno od T021, T033)
- [X] T109 [US10] Implementiraj ločeno besedilo obvestila za "zamujeno zaradi izpada" (odvisno od T028, T029)

**Checkpoint**: Tišina ob izpadu ne pomeni izgubljenega dneva, in ura po polnoči ne piše za
včeraj.

---

## Phase 13: User Story 11 - n8n avtomatizacija (Priority: P11)

**Goal**: Vse zmogljivosti so dosegljive prek REST API-ja z API ključem in izhodnimi
webhooki, brez uporabniškega vmesnika.

**Independent Test**: Prek API ključa preberi stanje, sproži akcijo z `Idempotency-Key`,
ponovi identično zahtevo, preveri eno samo izvedbo; konfiguriraj webhook in preveri
podpisan dogodek.

### Tests for User Story 11 ⚠️

- [X] T110 [P] [US11] Pogodbeni test dvojne oddaje z istim `Idempotency-Key` na `POST /time-tracking/actions` v `apps/api/tests/contract/time-tracking/idempotency.spec.ts` — quickstart.md §4 primer 15
- [X] T111 [P] [US11] Pogodbeni test dostopa po obsegih (`state:read`, `action:write`, `schedule:*`, `calendar:*`, `history:read`) v `apps/api/tests/contract/time-tracking/api-key-scopes.spec.ts`
- [X] T112 [P] [US11] Enotski test HMAC-SHA256 podpisa in časovnega žiga proti ponovnemu predvajanju v `apps/api/tests/unit/webhook-signing.spec.ts`

### Implementation for User Story 11

- [X] T113 [US11] Ustvari modela `webhookEndpoints` in `webhookDeliveries` v `apps/api/src/platform/webhooks/models.ts` (TTL 30 dni na dostavah) — data-model.md
- [X] T114 [US11] Implementiraj razpošiljevalnik webhookov (HMAC-SHA256 podpis v `X-CleverDash-Signature`, eksponentni zamik ob neuspehu) v `apps/api/src/platform/webhooks/dispatcher.service.ts` (odvisno od T113)
- [X] T115 [US11] Poveži sprožitev ob dogodkih `action.succeeded`/`action.failed`/`action.missed`/`session.expiring` (odvisno od T040, T064, T093, T114)
- [X] T116 [P] [US11] Implementiraj `GET/POST /time-tracking/webhooks` in `DELETE /time-tracking/webhooks/{id}` (skrivnost prikazana samo ob ustvarjanju) v `apps/api/src/platform/webhooks/router.ts` (odvisno od T113)
- [X] T117 [P] [US11] Dodaj razdelek za upravljanje webhookov v Nastavitve (odvisno od T116)

**Checkpoint**: Vseh 11 uporabniških zgodb je samostojno delujočih; n8n lahko upravlja
celotno funkcionalnost brez UI.

---

## Phase 14: Polish & Cross-Cutting Concerns

**Purpose**: Resnično preverjanje na živem sistemu, ne le trditve — enak standard kot
polish faza 001 (glej `docs/acceptance-001.md`).

- [X] T118 [P] Napiši E2E test ročnega toka Story 1 (Danes → pritisk → izid) v `apps/web/tests/e2e/time-tracking-manual.spec.ts`; izvedba je odvisna od namestitve brskalnika (glej opombo v `specs/001-app-shell-dashboard/tasks.md` T137 o Playwrightu)
- [X] T119 Zaženi vseh 15 enotskih testov iz [quickstart.md](./quickstart.md) §4 skupaj in potrdi 100 % prehod (vrata 2)
- [X] T120 Zaženi `@redocly/cli lint` nad `specs/002-time-tracking/contracts/openapi.yaml` in potrdi 0 napak (vrata 3)
- [X] T121 Izvedi `docker compose up --build` iz čiste kopije z `shm_size`/`init`/`mem_limit` popravki; potrdi, da `Target closed` napak ni več in da je `GET /health` `schedulerLastTickAgeSeconds` manjši od `SCHEDULER_TICK_SECONDS * 2` (vrata 4) — dokumentiraj v `docs/acceptance-002.md`
- [X] T122 Ustavi API vsebnik med delovanjem in potrdi, da zunanji dead man's switch (skupen s 001) zazna zamolk v pričakovanem oknu — člen VII, dokumentiraj v `docs/acceptance-002.md`
- [X] T123 Zaženi `gitleaks detect` nad git zgodovino in potrdi 0 zadetkov (vrata 5)
- [X] T124 Napiši enkraten migracijski skript po preslikavi iz [data-model.md](./data-model.md) (`schedulers` → `trackingProfiles`/`trackingLocations`/`remoteSessions`, pretvorba `daysOfWeek`) v `scripts/migrate-legacy-time-tracking.ts`; ne zažene se samodejno
- [X] T125 [P] Posodobi `README.md` razdelek "Naslednje funkcionalnosti" (002 dokončana, naslednja je 003 — Kamere)
- [X] T126 Zaženi vseh 11 preverjanj po uporabniških zgodbah iz [quickstart.md](./quickstart.md) §3 na živem `docker compose` sistemu in dokumentiraj rezultate v `docs/acceptance-002.md`

---

## Phase 15: Dopolnitev po pregledu vmesnika (27. 8. 2026)

**Purpose**: dve zahtevi iz pregleda delujočega sistema. Prva je vsebinska (FR-090: gumb za
začetek dela je lastnost lokacije, ne urnika — sicer bi delo od doma terjalo podvojen
profil), druga je ureditvena (FR-127 iz 005: sklop "Moduli" v Nastavitvah dobi zavihek na
modul, ker so trije razdelki 002 in en razdelek 003 stali drug pod drugim, ločeni le s
predpono v naslovu).

- [X] T127 [P] Razširi `apps/api/src/domain/clock-state.ts` z `START_ACTIONS`, `isStartAction` in `resolveActionForLocation`; `deriveClockState` uporabi isti seznam (dva seznama bi se razšla) + testi v `apps/api/tests/unit/clock-state.spec.ts`
- [X] T128 Dodaj `startAction` v `models/tracking-location.model.ts` (enum, privzeto `Prijava na delo`), v obe shemi in odziv v `modules/time-tracking/router.ts` ter v `TrackingLocationInput`/`TrackingLocationPatch` v [contracts/openapi.yaml](./contracts/openapi.yaml); poženi `npm run generate:contracts`
- [X] T129 Razreši ime akcije z lokacije v `services/schedule-builder.service.ts` in v predogledu profila (`GET /time-tracking/profiles/{id}/preview`); ob spremembi gumba preimenuj že načrtovano, še neizvedeno akcijo na mestu + testi v `apps/api/tests/unit/schedule-builder.spec.ts`
- [X] T130 [P] Pogodbeni test za `startAction` (privzetek, izbira, popravek, zavrnitev neobstoječega imena) v `apps/api/tests/contract/time-tracking/sessions.spec.ts`
- [X] T131 [P] Vmesnik: izbira "Gumb za začetek dela" v `apps/web/src/app/features/settings/time-tracking-locations.component.ts` (spustni seznam, ne prosto besedilo) in dopolnjeno pojasnilo `timeTracking.locations` v `apps/web/src/app/shared/help/help-topics.ts` (FR-125)
- [X] T132 [P] Nastavitve → Moduli: druga raven zavihkov, po enega na modul, v `apps/web/src/app/features/settings/settings.page.ts`; naslovi razdelkov brez predpone z imenom modula (FR-127 iz 005)
- [X] T133 Dodaj `sendGeolocation` (FR-094) v model, obe shemi in odziv (`router.ts`), v [contracts/openapi.yaml](./contracts/openapi.yaml) (`coordinateTemplate` ni več brezpogojno obvezen) ter regeneriraj `packages/contracts`
- [X] T134 `location-resolver.service.ts` razreši koordinati SAMO ob vklopljenem pošiljanju; `PuppeteerClockPortal.openPage` brez njiju dovoljenje za geolokacijo izrecno zavrne + testi v `apps/api/tests/unit/geolocation-optional.spec.ts`
- [X] T135 [P] Diagnostika: `enrichDiagnosticsWithSession` ob praznem naboru gumbov in izklopljenem pošiljanju doda namig na stikalo; `POST /diagnostics/test-read` vrne `geolocationSent`
- [X] T136 [P] Vmesnik: stikalo "Pošlji lokacijo strani" pri vsaki in pri novi lokaciji (`time-tracking-locations.component.ts`), koordinati skriti/neaktivni ob izklopu, dopolnjeno pojasnilo `timeTracking.locations` (FR-125)
- [X] T137 [P] Pogodbeni test za `sendGeolocation` (privzetek, lokacija brez koordinat, zavrnjen vklop brez koordinat) v `apps/api/tests/contract/time-tracking/sessions.spec.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: brez odvisnosti, lahko se začne takoj
- **Foundational (Phase 2)**: odvisna od Setup — BLOKIRA vse uporabniške zgodbe
- **User Stories (Phase 3–13)**: vse odvisne od Foundational; priporočen vrstni red je
  prioritetni (P1 → P11), ker vsaka naslednja zgodba dejansko gradi na prejšnji (US2 na
  US1-ovem `ActionExecutor`, US3 na US2-ovem tiku, US5–US7 na skupni `CalendarService` iz
  US2, US8/US10 na US1–US3, US11 na skoraj vsem)
- **Polish (Phase 14)**: odvisna od želenih uporabniških zgodb

### Opombe o vzporednosti med zgodbami

Za razliko od 001, kjer so bile zgodbe bolj neodvisne (dashboard, meni, obvestila), so
zgodbe 002 **zaporedno odvisne** po sami naravi domene: en `ActionExecutor` in en
`ScheduleBuilder` služita vsem načinom delovanja. Vzporedno delo več razvijalcev je
smiselno **znotraj** ene zgodbe (naloge z `[P]`), manj pa med zgodbami US2–US10.

### Within Each User Story

- Testi (kjer so vključeni) se napišejo in MORAJO pasti pred izvedbo
- Modeli pred storitvami, storitve pred endpointi, endpointi pred UI
- Zgodba je končana, preden se nadaljuje na naslednjo prioriteto

### Parallel Opportunities

- Vse naloge Setup z `[P]` tečejo vzporedno
- Domenske funkcije in modeli v Foundational (T008–T030, razen T031–T035) tečejo vzporedno
- Znotraj vsake zgodbe tečejo modeli/testi z `[P]` vzporedno

---

## Parallel Example: Foundational Phase

```bash
# Domenske funkcije (brez medsebojnih odvisnosti):
Task: "Implementiraj clock-state.ts"
Task: "Implementiraj scheduling.ts"
Task: "Implementiraj calendar.ts"

# Modeli (po definiciji ClockPortal, brez medsebojnih odvisnosti):
Task: "Ustvari model remoteSessions"
Task: "Ustvari model trackingLocations"
Task: "Ustvari model holidays"
Task: "Ustvari model absencePeriods"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Zaključi Phase 1: Setup
2. Zaključi Phase 2: Foundational (KRITIČNO — blokira vse zgodbe)
3. Zaključi Phase 3: User Story 1
4. **USTAVI IN PREVERI**: ročni pritisk deluje samostojno, z verifikacijo
5. To je MVP — nadomesti ročni obisk strani delodajalca z enim zanesljivim dotikom

### Incremental Delivery

1. Setup + Foundational → temelj pripravljen
2. US1 (ročni pritisk) → MVP
3. US2 (samodejno `AUTO`) → glavna vrednost funkcionalnosti
4. US3 (ponovni poskusi) → odpornost samodejnega načina
5. US4 (samo opozarjanje) → varnejša alternativa
6. US5–US7 (koledar: prazniki, dopust, izredni dan) → urnik deluje brez ročnega vzdrževanja
7. US8 (potek seje) → prepreči tiho odpoved
8. US9 (zgodovina) → preglednost
9. US10 (dohitevanje, polnočno zaprtje) → operativna odpornost
10. US11 (API/n8n) → razširljivost izven aplikacije

Vsaka zgodba doda vrednost, ne da bi pokvarila prejšnje.
