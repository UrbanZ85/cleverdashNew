---

description: "Task list template for feature implementation"
---

# Tasks: Prijava prek Keycloaka in večuporabniška aplikacija

**Input**: Design documents from `/specs/004-keycloak-sso-multiuser/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/openapi.yaml](./contracts/openapi.yaml), [quickstart.md](./quickstart.md)

**Tests**: Vključeni — konstitucijsko Kakovostno vrato 2 zahteva enotske teste domenske
logike, plan.md pa dodatno terja teste za novo mejo (živo preverjanje seje, izolacija med
uporabniki, FR-013/FR-014 selitev). Pogodbeni testi sledijo istemu vzorcu kot 001–003
(Supertest proti `openapi.yaml`, `mongodb-memory-server`), Keycloak sam je v testih ponarejen
(research.md §3), ne pravi.

**Organization**: Naloge so razvrščene po treh uporabniških zgodbah iz spec.md (P1 Prijava,
P1 Ločeni podatki, P2 Vloga → pravice). Prvi dve sta obe P1, ker sta neodvisno testabilni, a
gradita na isti Foundational fazi (obe potrebujeta delujočo Keycloak prijavo, preden je
sploh mogoče dokazati katerokoli od njiju) — glej plan.md Summary za razlago dveh ločenih
posegov.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se lahko izvede vzporedno (druge datoteke, brez odvisnosti od nedokončanih nalog)
- **[Story]**: US1 = Prijava prek Keycloaka, US2 = Ločeni podatki na uporabnika, US3 = Vloga → pravice
- Vsaka naloga navaja natančno pot datoteke

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: odvisnosti, shema okolja, testno okolje — brez avtentikacijske ali domenske logike.

- [X] T001 [P] Dodaj `openid-client` (v6) v `apps/api/package.json`; odstrani `argon2` (geslo se ne shranjuje več, FR-018) — plan.md Technical Context
- [X] T002 [P] V Zod shemo `apps/api/src/platform/config/env.ts` dodaj `KEYCLOAK_ISSUER_URL`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_ADMIN_ROLE` (privzeto `cleverdash-admin`), `KEYCLOAK_INTROSPECTION_CACHE_SECONDS` (privzeto `5`), `SESSION_COOKIE_SECRET`; odstrani `PASSWORD_HASH_ALGO`, `ADMIN_INITIAL_PASSWORD`, `ADMIN_EMAIL`, `JWT_REFRESH_SECRET` — research.md §12. Popravek med implementacijo: tudi `JWT_ACCESS_SECRET`/`ACCESS_TOKEN_TTL` odpadeta (dostopni žeton je Keycloakov lasten relay, ne lokalno podpisan — research.md §2)
- [X] T003 [P] Razširi `apps/api/tests/unit/env.spec.ts`: manjkajoč `KEYCLOAK_ISSUER_URL`/`KEYCLOAK_CLIENT_ID`/`KEYCLOAK_CLIENT_SECRET`/`SESSION_COOKIE_SECRET` ustavi zagon z imenom spremenljivke; odstranjene spremenljivke iz T002 nimajo več testnih primerov (odvisno od T002)
- [X] T004 [P] Posodobi `.env.example` — zamenjaj razdelek "Avtentikacija" s Keycloak spremenljivkami iz T002 (odvisno od T002)
- [X] T005 [P] Posodobi `docs/env-reference.md` — razdelek "Avtentikacija" prenovljen (odstrani vrstice za geslo/`JWT_REFRESH_SECRET`, dodaj Keycloak vrstice z enako obrazložitvijo kot ostale) (odvisno od T002)
- [X] T006 [P] Posodobi privzetke v `apps/api/tests/setup/test-env.ts`: odstrani `ADMIN_INITIAL_PASSWORD`/`JWT_REFRESH_SECRET`, dodaj testne vrednosti za `KEYCLOAK_ISSUER_URL` (kaže na ponarejen strežnik iz T024), `KEYCLOAK_CLIENT_ID`/`SECRET`, `SESSION_COOKIE_SECRET` (odvisno od T002)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: nov avtentikacijski substrat (Keycloak odjemalec, seje, preslikava vlog) in
ponarejen IdP za teste — brez tega noben od treh user storyjev ni niti testabilen.

**⚠️ KRITIČNO**: nobena uporabniška zgodba se ne začne, dokler ta faza ni dokončana.

- [X] T007 Prenovi `apps/api/src/modules/auth/models/user.model.ts`: `keycloakSubject` (unique, indexed) nadomesti primarni identifikator, `email` postane NE-unikaten, dodaj `displayName`, `scopes: string[]`, `lastLoginAt`, `migratedLegacyDataAt`; odstrani `passwordHash`, `mustChangePassword` — data-model.md "User"
- [X] T008 [P] Ustvari `apps/api/src/modules/auth/models/keycloak-session.model.ts` (`userId`, `deviceLabel`, `platform`, `encryptedRefreshToken`, `state`, `lastUsedAt`, indeksi `{userId:1}`/`{state:1}`) — data-model.md "KeycloakSession"
- [X] T009 [P] Odstrani `apps/api/src/modules/auth/models/login-attempt.model.ts`, `session-family.model.ts`, `refresh-token.model.ts` — research.md §8 (odvisno od T008)
- [X] T010 [P] Odstrani `apps/api/src/modules/auth/services/password.service.ts`, `login-throttle.service.ts`, `refresh-token.service.ts` — research.md §8
- [X] T011 Ustvari `apps/api/src/platform/keycloak/client.ts` — OIDC "issuer discovery" in konfiguracija zaupanja vrednega (confidential) odjemalca prek `openid-client`, iz `KEYCLOAK_ISSUER_URL`/`KEYCLOAK_CLIENT_ID`/`KEYCLOAK_CLIENT_SECRET` (research.md §1) (odvisno od T001, T002)
- [X] T012 [P] Ustvari `apps/api/src/platform/keycloak/role-mapping.ts` — čista funkcija `mapRolesToAccess(roles, adminRole, userRole): { hasAccess: boolean; scopes: string[] }`, testabilna brez omrežja (člen IX, research.md §6). Popravek med implementacijo: dodan `KEYCLOAK_USER_ROLE`/`hasAccess`, brez tega ni bilo mogoče izraziti "brez katerekoli prepoznane vloge NI dostopa" (FR-007/FR-008)
- [X] T013 [P] Enotski test `apps/api/tests/unit/role-mapping.spec.ts`: admin vloga da `{hasAccess:true, scopes:['admin']}`; user vloga da `{hasAccess:true, scopes:[]}`; brez katerekoli prepoznane vloge `{hasAccess:false, scopes:[]}`; admin vloga med več vlogami da `['admin']`, ne dvojnika (odvisno od T012)
- [X] T014 Ustvari `apps/api/src/platform/keycloak/introspection-cache.ts` — LASTEN `Map`-predpomnilnik v pomnilniku procesa (NE `platform/cache`/`getOrRefresh` — tisti je fail-open/stale-serving, tu je zahtevan fail-closed, glej popravek v research.md §4), ključ = zgoščena vrednost dostopnega žetona, TTL = `KEYCLOAK_INTROSPECTION_CACHE_SECONDS`, napaka introspekcije se vedno vrže naprej (odvisno od T011)
- [X] T015 [P] Enotski test `apps/api/tests/unit/introspection-cache.spec.ts`: klic znotraj TTL NE pokliče znova funkcije za introspekcijo; klic po izteku TTL jo pokliče znova (odvisno od T014)
- [X] T016 Ustvari `apps/api/src/platform/keycloak/session.service.ts` — izda/preveri podpisan notranji sejni piškotek, ki referencira `KeycloakSession._id` (`SESSION_COOKIE_SECRET`), research.md §2 (odvisno od T008)
- [X] T017 Prenovi `apps/api/src/modules/auth/services/access-token.service.ts`: `verifyAccessToken` kliče `introspection-cache` (T014) namesto samo lokalne `jwt.verify`; `issueAccessToken` ostane oblikovno podoben, `scopes` pa se vedno znova izpelje prek `role-mapping` (T012), ne bere starih shranjenih `scopes` brez preverjanja (odvisno od T012, T014, T016)
- [X] T018 Odstrani `AuthContext.familyId` v `apps/api/src/platform/auth/scopes.ts` (popravek med implementacijo: Keycloakov relay dostopni žeton ne nosi našega `fam` claima — katera `KeycloakSession` pripada napravi, se odslej bere neposredno iz httpOnly sejnega piškotka v auth/router.ts, ne iz `req.auth`) in uskladi vsa mesta uporabe (odvisno od T008, T009)
- [X] T019 Ustvari `apps/api/src/modules/auth/services/user-provisioning.service.ts` — `findOrCreateUser(keycloakSubject, email, displayName, scopes)`: nov `keycloakSubject` ustvari uporabnika s privzetki (FR-009); obstoječ posodobi `email`/`displayName`/`scopes`/`lastLoginAt`, NIKOLI ne ustvari podvojenega uporabnika ob spremembi e-pošte (FR-003) (odvisno od T007)
- [X] T020 [P] Enotski test `apps/api/tests/unit/user-provisioning.spec.ts`: nov subjekt ustvari uporabnika; isti subjekt s spremenjeno e-pošto posodobi zapis, ne podvoji identitete (odvisno od T019)
- [X] T021 [P] Odstrani `apps/api/src/modules/auth/guards/must-change-password.guard.ts` (FR-017)
- [X] T022 Posodobi žično vezavo v `apps/api/src/main.ts`: odstrani uvoz/klic `ensureBootstrapUser` in `mustChangePasswordGuard`; namesti prenovljen `accessTokenGuard` (odvisno od T017, T019, T021)
- [X] T023 Posodobi `apps/api/tests/unit/device-cleanup.spec.ts`: `UserModel.create({ email, passwordHash: 'x' })` → nova oblika z `keycloakSubject` (odvisno od T007)
- [X] T024 Ustvari `apps/api/tests/setup/fake-keycloak.ts` — minimalen HTTP strežnik znotraj testnega procesa: `.well-known/openid-configuration`, `authorization`, `token`, `introspection`, `end_session`, s testno nastavljivimi vlogami na uporabnika (research.md §3)
- [X] T025 Ustvari `apps/api/tests/setup/login-as-test-user.ts` — požene pravi tok `/auth/login` → `/auth/callback` proti `fake-keycloak.ts` in vrne dostopni žeton + piškotek seje; nadomesti dosedanje razpršene `loginAndUnlock()` pomočnike po posameznih datotekah (odvisno od T024)
- [X] T026 [P] Zamenjaj lokalne prijavne pomočnike (e-pošta/geslo) z `login-as-test-user.ts` v `apps/api/tests/contract/settings.spec.ts`, `devices.spec.ts`, `dashboard.spec.ts`, `tabs.spec.ts`, `attribution.spec.ts` (odvisno od T025; `api-keys.spec.ts` se je izkazal za nepotrebnega — avtenticira izključno prek `X-API-Key`, ne uporabniške prijave). Popravek med implementacijo — obseg razširjen na skupen `tests/setup/keycloak-global.ts` (Vitest `setupFiles`, en ponarejen Keycloak na testno datoteko, privzeta vrednost v `test-env.ts`), ker so nekatere datoteke (`actions.spec.ts`, `idempotency.spec.ts`) `setTestEnv()` klicale večkrat sredi testa, kar bi prepisalo ročno nastavljen `KEYCLOAK_ISSUER_URL`. Dodatno odkrito in popravljeno izven prvotno navedenega seznama: `tests/integration/notification-latency.spec.ts`, `source-never-seen.spec.ts`, `source-outage.spec.ts`, `source-schema-drift.spec.ts`, `tab-isolation.spec.ts` (isti pomočnik + `realFetch`/127.0.0.1 prehod za datoteke, ki tudi ponarejajo `fetch` za ARSO), `camera-grid.spec.ts`, `camera-health.spec.ts` (isti prehod); `login-rate-limit.spec.ts` ODSTRANJEN (omejevanje hitrosti je zdaj Keycloakova odgovornost, spec.md Out of Scope); `multi-device.spec.ts` prenovljen — obdrži samo test neodvisnih naprav, odstranjen test CleverDashove lastne zaznave ponovne uporabe žetona (zdaj Keycloakova odgovornost); `auto-tick.spec.ts` popravljen — ni več zanašanja na `ensureBootstrapUser`
- [X] T027 [P] Isto za `apps/api/tests/contract/cameras/*.spec.ts` (odvisno od T025) — `_helpers.ts` centralno; `arso-webcams.spec.ts`, `snapshot.spec.ts`, `stream.spec.ts` dodatno popravljeni z `realFetch`/127.0.0.1 prehodom (mockajo `fetch`, ki bi sicer prestregel tudi klice h Keycloaku)
- [X] T028 [P] Isto za `apps/api/tests/contract/time-tracking/*.spec.ts` (odvisno od T025) — `_helpers.ts` centralno, poenostavljeno na en `loginAsTestUser` klic namesto prijava+menjava gesla+ponovna prijava

**Checkpoint**: Temelj postavljen — Keycloak odjemalec, seje, preslikava vlog, ponarejen IdP
za teste. Uporabniške zgodbe se lahko začnejo.

---

## Phase 3: User Story 1 - Prijava prek Keycloaka namesto gesla v CleverDashu (Priority: P1) 🎯 MVP

**Goal**: neprijavljen uporabnik je preusmerjen na Keycloak, se prijavi tam in pride nazaj v
CleverDash prijavljen; oseba brez prepoznane vloge je zavrnjena; odjava konča sejo tudi pri
Keycloaku (spec.md, User Story 1).

**Independent Test**: quickstart.md §3.

### Tests for User Story 1

- [X] T029 [P] [US1] Prenovi `apps/api/tests/contract/auth.spec.ts` proti `contracts/openapi.yaml`: `GET /auth/login` preusmeri na Keycloak; `GET /auth/callback` uspešno ustvari/najde uporabnika in nastavi piškotek; `GET /auth/callback` z osebo brez prepoznane vloge vrne `401` z ločenim sporočilom (FR-007); `POST /auth/refresh` zavrti sejo prek ponarejenega Keycloaka; `POST /auth/logout` vrne `endSessionUrl` in prekliče `KeycloakSession`; `GET /auth/me` vrne novo obliko `Account` (brez `mustChangePassword`) (odvisno od T024, T025)
- [X] T030 [P] [US1] Odstrani `apps/api/tests/unit/token-reuse.spec.ts` in `token-rotation.spec.ts` (testirata odstranjen `refresh-token.service.ts`) (odvisno od T009, T010)
- [X] T031 [P] [US1] Nov enotski test `apps/api/tests/unit/keycloak-session.spec.ts`: `session.service` izda veljaven piškotek, ga pravilno preveri, zavrne preklicano sejo (odvisno od T016)

### Implementation for User Story 1

- [X] T032 [US1] Prenovi `apps/api/src/modules/auth/router.ts` po `contracts/openapi.yaml`: `GET /auth/login` (preusmeritev, PKCE, `state`), `GET /auth/callback` (izmenjava kode, `user-provisioning`, ustvari `KeycloakSession`, nastavi piškotek, preusmeri na `redirectTo`), `POST /auth/refresh`, `POST /auth/logout` (+ `endSessionUrl`), `GET /auth/me`; obdrži `GET /auth/sessions` in `DELETE /auth/sessions/:sessionId` nad `KeycloakSession` (odvisno od T011, T016, T017, T019)
- [X] T033 [P] [US1] V `specs/001-app-shell-dashboard/contracts/openapi.yaml` nadomesti `/auth/*` poti in sheme (`LoginRequest`, `PasswordChangeRequest` odstranjena; `SessionFamily` → `DeviceSession`) z vsebino iz `specs/004-keycloak-sso-multiuser/contracts/openapi.yaml` (research.md §9)
- [X] T034 [P] [US1] Poženi `npm run generate:contracts` (regenerira `packages/contracts/src/generated/api.d.ts`) (odvisno od T033)
- [X] T035 [US1] Prenovi `apps/web/src/app/core/auth/auth.service.ts`: `login(redirectTo?)` postane `window.location.href` preusmeritev na `/api/v1/auth/login`; odstrani `changePassword()`; `logout()` sledi vrnjenemu `endSessionUrl` (research.md §10) (odvisno od T034)
- [X] T036 [P] [US1] Poenostavi `apps/web/src/app/core/auth/token.store.ts`: samo dostopni žeton v pomnilniku, brez `@capacitor/preferences` (popravek med implementacijo — web IN Android zdaj delita isti httpOnly piškotek, glej research.md §1) (odvisno od T034)
- [X] T037 [US1] Odstrani `apps/web/src/app/features/auth/login.page.ts` in `change-password.page.ts` (FR-017)
- [X] T038 [US1] Odstrani poti `login` in `change-password` iz `apps/web/src/app/app.routes.ts` (odvisno od T037)
- [X] T039 [US1] Uskladi `apps/web/src/app/core/auth/auth.guard.ts`: ob neprijavljenem stanju preusmeri na backend `/api/v1/auth/login` (ne več na Angular pot `/login`) (odvisno od T035, T038)
- [X] T040 [US1] Preveri `apps/web/src/app/core/auth/auth.interceptor.ts`: seznam `AUTH_EXEMPT` ostaja pravilen (`/auth/login`, `/auth/refresh`); posodobi komentar, če se katera pot preimenuje (odvisno od T035)

**Checkpoint**: User Story 1 je samostojno delujoča in testabilna (quickstart.md §3).

---

## Phase 4: User Story 2 - Vsak uporabnik ima svojo, ločeno aplikacijo (Priority: P1)

**Goal**: nastavitve, ploščice, zavihki, kamere in beleženje časa vsakega uporabnika so
zasebni njemu; obstoječi enouporabniški podatki se ob uvedbi pripišejo administratorju
(spec.md, User Story 2).

**Independent Test**: quickstart.md §4 in §6.

### Tests for User Story 2

- [X] T041 [P] [US2] Prenovi `apps/api/tests/unit/no-owner-fields.spec.ts`: potrdi `userId` NA `Settings`, `Camera`, `CameraGroup`, `TrackingProfile`, `TrackingLocation`, `PlannedAction`, `ActionRecord`, `ActionAttempt`, `CalendarDay`, `CalendarOverride`, `AbsencePeriod`, `RemoteSession`; potrdi ODSOTNOST na `Holiday`, `CameraEmbedAllowlist`, `ExternalCache`, `User` (data-model.md) (odvisno od T046, T048, T050, T051)
- [X] T042 [P] [US2] Razširi `apps/api/tests/contract/settings.spec.ts`: dva različna prijavljena testna uporabnika dobita neodvisna dokumenta `Settings`, sprememba enega ni vidna drugemu (SC-002) (odvisno od T026, T047)
- [X] T043 [P] [US2] Razširi `apps/api/tests/contract/cameras/*.spec.ts`: seznama kamer dveh uporabnikov sta izolirana (SC-002) (odvisno od T027, T049)
- [X] T044 [P] [US2] Razširi `apps/api/tests/contract/time-tracking/*.spec.ts`: profil/zgodovina dveh uporabnikov sta izolirana (SC-002) (odvisno od T028, T052)
- [X] T045 [US2] Nov test `apps/api/tests/contract/legacy-migration.spec.ts`: obstoječi podatki brez `userId` (simulirani v testu) se ob prvi prijavi uporabnika z `admin` scope-om pripišejo njemu (FR-013); poznejši nov uporabnik jih NE podeduje (FR-014, quickstart.md §6) (odvisno od T053, T054)

### Implementation for User Story 2

- [X] T046 [P] [US2] Dodaj `userId` (ObjectId → User, required, unique) v `apps/api/src/modules/settings/model.ts`; `_id: 'singleton'` odstranjen; `getOrCreateSettings()` → `getOrCreateSettingsForUser(userId)` — data-model.md "Settings"
- [X] T047 [US2] Posodobi `apps/api/src/modules/settings/router.ts`: `getOrCreateSettingsForUser(req.auth.subjectId)` namesto singletona (odvisno od T046)
- [X] T048 [P] [US2] Dodaj `userId` (required, indexed) v `apps/api/src/modules/cameras/models/camera.model.ts` in `camera-group.model.ts`; razširi indekse na `{userId, groupId, order}`/`{userId, active}` — data-model.md "Camera/CameraGroup"
- [X] T049 [US2] Posodobi `apps/api/src/modules/cameras/router.ts`: vsaka poizvedba/ustvarjanje filtrira/nastavi `userId: req.auth.subjectId` (odvisno od T048)
- [X] T050 [P] [US2] Dodaj `userId` (required, indexed) v `apps/api/src/modules/time-tracking/models/tracking-profile.model.ts` in `tracking-location.model.ts` — data-model.md "TrackingProfile/TrackingLocation"
- [X] T051 [P] [US2] Dodaj `userId` (denormalizirano, required, indexed) v `apps/api/src/modules/time-tracking/models/planned-action.model.ts`, `action-record.model.ts`, `action-attempt.model.ts`, `calendar-day.model.ts`, `calendar-override.model.ts`, `absence-period.model.ts`, `remote-session.model.ts` — data-model.md, plan.md Complexity Tracking
- [X] T052 [US2] Posodobi vse poizvedbe v `apps/api/src/modules/time-tracking/router.ts` (in schedulerjeve brskalne poizvedbe, kjer je relevantno) na filtriranje po `userId` (odvisno od T050, T051)
- [X] T053 [US2] Ustvari `apps/api/src/modules/auth/services/migration.service.ts`: ob prijavi uporabnika z `admin` scope-om, ki še nima `migratedLegacyDataAt`, poišče dokumente brez `userId` (ali `Settings` z `_id:'singleton'`) in jim nastavi `userId` na njega; nastavi `User.migratedLegacyDataAt` (research.md §7, FR-013/FR-014) (odvisno od T046, T048, T050, T051)
- [X] T054 [US2] Pokliči `migration.service` iz `GET /auth/callback` v `apps/api/src/modules/auth/router.ts`, takoj po `user-provisioning` (odvisno od T032, T053)
- [X] T055 [P] [US2] Skript `apps/api/scripts/migrate-legacy-userless-docs.ts` (idempotenten, varen za ponovni zagon) kot ročna rezerva, če noben uporabnik nikoli ne dobi `admin` scope-a — omenjen v quickstart.md §6

**Checkpoint**: User Story 1 IN 2 obe delujeta neodvisno (quickstart.md §4, §6).

---

## Phase 5: User Story 3 - Vloga iz Keycloaka odloča o pravicah v CleverDashu (Priority: P2)

**Goal**: dodelitev/odvzem administratorske vloge v Keycloaku se odrazi v CleverDashu brez
posega razvijalca ali ročnega urejanja baze (spec.md, User Story 3).

**Independent Test**: quickstart.md §5.

### Tests for User Story 3

- [X] T056 [P] [US3] Nov test `apps/api/tests/contract/role-mapping.spec.ts`: ponarejen Keycloak najprej vrne uporabnika brez posebnih vlog, nato (druga introspekcija, isti dostopni žeton) z `KEYCLOAK_ADMIN_ROLE` — preveri, da `scopes` postane `['admin']` na naslednji zahtevi BREZ nove prijave (FR-011); obraten vrstni red (odvzem) preveri izgubo `admin` scope-a znotraj `KEYCLOAK_INTROSPECTION_CACHE_SECONDS` (FR-006, SC-003) (odvisno od T014, T017, T024)
- [X] T057 [P] [US3] Razširi `apps/api/tests/contract/api-keys.spec.ts`: endpoint, ki zahteva `admin` scope, ostaja pravilno zaščiten, ko `admin` prihaja iz preslikave Keycloak vloge, ne iz stare bootstrap logike (odvisno od T026)

### Implementation for User Story 3

- [X] T058 [US3] Preveri/popravi `apps/api/src/modules/auth/services/access-token.service.ts`, da `scopes` vedno izhajajo iz sveže `role-mapping` ob vsakem uspešnem preverjanju (introspekciji), ne iz `scopes` shranjenih na `User` dokumentu ob prijavi (odvisno od T012, T017, T056)
- [ ] T059 [US3] Ročno preveri quickstart.md §5 proti pravemu razvojnemu Keycloaku (odvzem/dodelitev vloge `bob`-u)

**Checkpoint**: vse tri uporabniške zgodbe so samostojno delujoče.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: dokončna skladnost s Kakovostnimi vrati ustave, čiščenje ostankov stare prijave.

- [X] T060 [P] Posodobi `README.md`/`docs/env-reference.md` uvodne omembe prijave (Keycloak namesto e-pošte/gesla), odstrani navodila za ponastavitev gesla
- [X] T061 [P] Preglej repozitorij (`grep -r "passwordHash\|argon2\|mustChangePassword"`) in odstrani preostale sledi stare prijave zunaj že naštetih datotek
- [X] T062 Poženi `npm run typecheck` in `npm run lint` čez ves monorepo (Kakovostno vrato 1)
- [X] T063 Poženi `npm test` v vseh delovnih prostorih, potrdi zeleno (Kakovostno vrato 2)
- [X] T064 Preveri veljavnost `specs/001-app-shell-dashboard/contracts/openapi.yaml` (`npm run generate:contracts` brez napak) (Kakovostno vrato 3)
- [ ] T065 `docker compose up` iz čiste checkout kopije z izpolnjenim `.env` (vključno z novimi `KEYCLOAK_*`/`SESSION_COOKIE_SECRET`) pripelje do delujočega sistema (Kakovostno vrato 4)
- [ ] T066 `git status`/gitleaks čist — brez `KEYCLOAK_CLIENT_SECRET`/`SESSION_COOKIE_SECRET` v gitu (Kakovostno vrato 5)
- [ ] T067 Ročno izvedi celoten quickstart.md (§3–§7) proti pravemu razvojnemu Keycloaku
- [ ] T068 Prenovi `login()` pomočnike v `apps/web/tests/e2e/cameras-add.spec.ts`, `time-tracking-manual.spec.ts`, `performance.spec.ts`, `same-origin.spec.ts` na dejansko Keycloakovo prijavno stran (selektorji odvisni od Keycloakove teme, glej `004 TODO` opombe v teh datotekah) — ostanejo zapisani, a neizvedeni do `npx playwright install` + pravega razvojnega Keycloaka, enako kot doslej

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: brez odvisnosti — lahko se začne takoj
- **Foundational (Phase 2)**: odvisna od Setup — BLOKIRA vse tri uporabniške zgodbe
- **User Story 1 (Phase 3)**: odvisna od Foundational; ni odvisna od US2/US3
- **User Story 2 (Phase 4)**: odvisna od Foundational IN od delujočega `GET /auth/callback` iz US1 (T032) za T054 — v praksi si sledita zaporedno, četudi konceptualno neodvisni (glej plan.md Summary)
- **User Story 3 (Phase 5)**: odvisna od Foundational (role-mapping, introspection-cache so tam) — lahko teče vzporedno z US2, ne potrebuje njenih `userId` sprememb
- **Polish (Phase 6)**: odvisna od vseh želenih uporabniških zgodb

### Parallel Opportunities

- Vse naloge Setup, označene [P], se lahko izvedejo vzporedno
- V Foundational: modeli/storitve (T008–T020) se v veliki meri lahko delajo vzporedno po skupinah, ki si ne delijo datotek (glej oznake [P]); T026–T028 (zamenjava testnih pomočnikov po datotekah) so vzporedne po naravi
- US2 in US3 lahko tečeta vzporedno (različne datoteke, različne skrbi) — obe potrebujeta samo Foundational, ne druga drugo
- Znotraj US2: T046/T048/T050/T051 (dodajanje `userId` na različne modele) so vzporedne

## Parallel Example: Foundational

```bash
Task: "Ustvari apps/api/src/modules/auth/models/keycloak-session.model.ts"
Task: "Odstrani apps/api/src/modules/auth/services/password.service.ts, login-throttle.service.ts, refresh-token.service.ts"
Task: "Ustvari apps/api/src/platform/keycloak/role-mapping.ts"
```

## Implementation Strategy

### MVP First (User Story 1 samostojno)

1. Setup + Foundational
2. User Story 1 — prijava prek Keycloaka deluje od začetka do konca
3. **USTAVI IN PREVERI**: quickstart.md §3
4. To je MVP samo v smislu "prijava dela" — resnična obljuba uporabnika ("aplikacija glede
   na uporabnika") je šele z US2 zaključena; glej spec.md, obe zgodbi sta P1.

### Incremental Delivery

1. Setup + Foundational → temelj pripravljen
2. US1 → preveri neodvisno (prijava/odjava/zavrnitev brez vloge)
3. US2 → preveri neodvisno (izolacija podatkov + selitev starih podatkov)
4. US3 → preveri neodvisno (živa sprememba vloge)
5. Polish → vsa Kakovostna vrata zelena

### Parallel Team Strategy

Po zaključeni Foundational fazi:
- Razvijalec A: US1 (auth router, frontend prijava)
- Razvijalec B: US2 (modeli + poizvedbe štirih modulov)
- Razvijalec C: US3 (testi žive spremembe vloge)

US2 in US3 se lahko delata resnično vzporedno; US1 mora biti dovolj napredovan (vsaj T032),
preden T054 (klic migracije iz callbacka) dobi smisel.
