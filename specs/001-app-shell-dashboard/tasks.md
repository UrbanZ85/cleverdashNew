---

description: "Naloge za izvedbo funkcionalnosti 001 — ogrodje aplikacije in dashboard"
---

# Tasks: Ogrodje aplikacije in dashboard

**Input**: Design documents from `/specs/001-app-shell-dashboard/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/openapi.yaml](./contracts/openapi.yaml), [quickstart.md](./quickstart.md)

**Tests**: **Vključeni.** Niso izbira te naloge — kakovostna vrata 2 ustave zahtevajo enotske
teste domenske logike, [research.md](./research.md) §13 pa jih za 001 poimensko našteje.
Test, ki ustreza vnosu iz §13, ima to navedeno v opisu.

**Organization**: Naloge so razvrščene po uporabniških zgodbah iz [spec.md](./spec.md) (P1–P7),
da je vsaka zgodba samostojno izvedljiva in preverljiva.

**Ustava**: usklajeno z v1.1.0. Nesprejemanje glave `Idempotency-Key` na endpointih, ki
izdajajo ali zavrtijo žeton, je **uveljavljena izjema** po členu III, ne odstopanje — mora pa
biti zapisana v pogodbi (T021, T049, T137).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: lahko teče vzporedno (druge datoteke, brez odvisnosti)
- **[Story]**: kateri uporabniški zgodbi naloga pripada (US1–US7)
- Vsak opis vsebuje natančno pot do datoteke

## Path Conventions

Monorepo po [plan.md](./plan.md), razdelek Project Structure:

- **API**: `apps/api/src/` — `modules/`, `platform/`, `domain/`; testi v `apps/api/tests/`
- **Web**: `apps/web/src/app/` — `core/`, `features/`, `shared/`; testi v `apps/web/tests/`
- **Deljeni tipi**: `packages/contracts/`
- **Postavitev**: `infra/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Monorepo, orodja in varovalke. Trije linti v tej fazi niso kozmetika — z njimi
se členi I, IV in V.4 uveljavijo ob prevajanju, ne ob pregledu.

- [X] T001 Ustvari strukturo monorepa (`apps/api/`, `apps/web/`, `packages/contracts/`, `infra/`) po razdelku Project Structure v `specs/001-app-shell-dashboard/plan.md`
- [X] T002 Nastavi korenski `package.json` z npm workspaces in skripti `typecheck`, `lint`, `test`, `dev:api`, `dev:web`, `build:web`
- [X] T003 [P] Nastavi `tsconfig.base.json` s `strict: true` in ga razširi v `apps/api/tsconfig.json`, `apps/web/tsconfig.json`, `packages/contracts/tsconfig.json`
- [X] T004 [P] Nastavi ESLint in Prettier v `eslint.config.js`; `@typescript-eslint/no-explicit-any` kot **napaka** za `apps/api/src/modules/**` in `apps/api/src/platform/**` (vrata 1)
- [X] T005 [P] Dodaj lint pravilo v `eslint.config.js`, ki prepove uvoze med moduli (`modules/<a>` → `modules/<b>`, `features/<a>` → `features/<b>`); dovoljeni so `platform/`, `domain/`, `core/`, `shared/`, `packages/` — research.md §6, člen I
- [X] T006 [P] Dodaj lint pravilo v `eslint.config.js`, ki prepove `toISOString().split(` — člen V.4
- [X] T007 [P] Nastavi Vitest v `apps/api/vitest.config.ts` in `apps/web/vitest.config.ts`
- [X] T008 [P] Nastavi Playwright v `apps/web/playwright.config.ts` za en osnovni E2E tok
- [X] T009 [P] Ustvari `.env.example` s praznimi vrednostmi po `docs/env-reference.md` §5 — člen IV, FR-044
- [X] T010 [P] Nastavi detektor skrivnosti v `.gitleaks.toml` in ga vključi kot blokirajoč korak v `.github/workflows/ci.yml` (vrata 5)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Nosilna plast, ki jo potrebuje vsaka zgodba. Vsebuje tudi `platform/apikeys/` in
`platform/idempotency/`, ki jih 001 skoraj ne uporablja — utemeljitev je v tabeli Complexity
Tracking v plan.md: kasnejša vgradnja bi posegla v avtentikacijsko varovalko vsakega modula.

**⚠️ CRITICAL**: Nobena zgodba se ne začne, dokler ta faza ni končana.

- [X] T011 Ustvari Zod shemo okolja v `apps/api/src/platform/config/env.ts`; manjkajoča obvezna spremenljivka zaustavi zagon z imenom spremenljivke — research.md §12
- [X] T012 [P] Napiši enotski test za validacijo okolja v `apps/api/tests/unit/env.spec.ts` (manjkajoča obvezna vrednost zaustavi zagon z jasnim sporočilom) — research.md §13
- [X] T013 Vzpostavi povezavo na MongoDB in registracijo modelov v `apps/api/src/platform/db/mongoose.ts`
- [X] T014 [P] Nastavi Pino z JSON izpisom v stdout v `apps/api/src/platform/logging/logger.ts`
- [X] T015 [P] Dodaj middleware za ID korelacije v `apps/api/src/platform/logging/correlation.ts` — člen VII
- [X] T016 [P] Implementiraj obravnavo napak po RFC 9457 v `apps/api/src/platform/errors/problem.ts`; sporočila v slovenščini, brez tehničnih podrobnosti, z `correlationId`
- [X] T017 Sestavi Express 5 aplikacijo in usmerjanje pod `/api/v1` v `apps/api/src/main.ts` in `apps/api/src/platform/http/router.ts`; `cors()` se **ne** namesti — člen II
- [X] T018 [P] Nastavi generiranje tipov iz `specs/001-app-shell-dashboard/contracts/openapi.yaml` v `packages/contracts/src/generated/` prek skripte `packages/contracts/scripts/generate.ts`
- [X] T019 [P] Dodaj preverjanje validnosti pogodbe v `.github/workflows/ci.yml` kot blokirajoč korak (vrata 3)
- [X] T020 Ustvari model `idempotencyKeys` v `apps/api/src/platform/idempotency/model.ts` z unikatnim indeksom `(key, endpoint)` in TTL 24 h — data-model.md
- [X] T021 Implementiraj middleware za `Idempotency-Key` v `apps/api/src/platform/idempotency/middleware.ts`; isti ključ z drugačnim telesom vrne `422`; na `POST /auth/login` in `POST /auth/refresh` se **ne** namesti — uveljavljena izjema po členu III (ustava v1.1.0)
- [X] T022 [P] Ustvari model `apiKeys` v `apps/api/src/platform/apikeys/model.ts` (unikaten `keyHash`, `keyPrefix`, neprazni `scopes`) — data-model.md
- [X] T023 Implementiraj varovalko `X-API-Key` z obsegi v `apps/api/src/platform/apikeys/guard.ts` — člen III
- [X] T024 Implementiraj avtorizacijo po obsegih v `apps/api/src/platform/auth/scopes.ts`; veljaven žeton sam po sebi ne pomeni administratorskih pravic — FR-013
- [X] T025 [P] Pogodbeni test `/api-keys` (ustvarjanje, seznam, preklic; čistopis samo v odgovoru na ustvarjanje) v `apps/api/tests/contract/api-keys.spec.ts`
- [X] T026 Implementiraj usmerjevalnik `GET`/`POST`/`DELETE /api-keys` v `apps/api/src/platform/apikeys/router.ts`; ključ brez obsegov je zavrnjen, čistopis se pokaže samo enkrat, preklic je `revokedAt` in ne brisanje (odvisno od T022, T024) — člen III, data-model.md
- [X] T027 [P] Ustvari `infra/Caddyfile`: `handle /api/*` → `api:3000`, ostalo → SPA z `try_files {path} /index.html` — člen II, FR-041
- [X] T028 [P] Ustvari `infra/docker-compose.yml` (api, web, mongo, caddy) s `TZ=Europe/Ljubljana`, zdravstvenimi pregledi in politiko ponovnega zagona za vsak vsebnik — FR-042, FR-043
- [X] T029 [P] Ustvari `infra/docker-compose.dev.yml` samo z Mongom in `infra/mongo-init/` za uporabnika in geslo baze
- [X] T030 [P] Postavi ogrodje Ionic 8 + Angular 20 (standalone, signali) v `apps/web/src/app/` in `apps/web/src/main.ts`
- [X] T031 [P] Nastavi dev-server proxy v `apps/web/proxy.conf.json`, ki `/api` pošlje na `localhost:3000`, da je oblika enotnega izvora enaka v razvoju in produkciji
- [X] T032 [P] Ustvari odjemalca API-ja z **relativnimi** potmi v `apps/web/src/app/core/api/api-base.ts`; absolutnega naslova v `environment.ts` ni — FR-001
- [X] T033 [P] Postavi Capacitor 7 projekt za Android z nastavljivim `apiBase` (privzeto `https://app.si`) v `apps/web/capacitor.config.ts` — FR-001, FR-005
- [X] T034 Implementiraj `GET /api/v1/health` v `apps/api/src/platform/health/router.ts` (baza, konfiguracija, stanje srčnega utripa) — FR-043
- [X] T035 Implementiraj odhodni srčni utrip na `HEALTHCHECK_PING_URL` v `apps/api/src/platform/health/heartbeat.ts`; ob nenastavljeni spremenljivki se tiho preskoči — člen VII, research.md §5

**Checkpoint**: Ogrodje je pripravljeno — `docker compose up` postavi sistem, `/api/v1/health` odgovarja, delo na zgodbah se lahko začne.

---

## Phase 3: User Story 1 - Prijava in trajna seja (Priority: P1) 🎯 MVP

**Goal**: Uporabnik se prijavi in ostane prijavljen. Dostopni žeton se v ozadju obnavlja;
zaznana zloraba obnovitvenega žetona prekliče družino sej te naprave, ne pa drugih naprav.

**Independent Test**: Prijava, umetno iztečen dostopni žeton, tiha obnova, ponovna predložitev
porabljenega žetona, odjava — na webu in na Androidu. Dostavi zaščiten dostop do aplikacije
sama po sebi.

### Tests for User Story 1 ⚠️

> Napiši te teste prve in preveri, da padejo, preden začneš z izvedbo.

- [X] T036 [P] [US1] Pogodbeni testi poti `/auth/*` proti pogodbi v `apps/api/tests/contract/auth.spec.ts`
- [X] T037 [P] [US1] Enotski test rotacije obnovitvenega žetona v `apps/api/tests/unit/token-rotation.spec.ts` — research.md §13
- [X] T038 [P] [US1] Enotski test zaznane ponovne uporabe: porabljen žeton prekliče **celotno družino** v `apps/api/tests/unit/token-reuse.spec.ts` — FR-012, research.md §13
- [X] T039 [P] [US1] Integracijski test dveh naprav: odjava na eni ne odjavi druge, v `apps/api/tests/integration/multi-device.spec.ts` — FR-017
- [X] T040 [P] [US1] Integracijski test omejevanja hitrosti prijave v `apps/api/tests/integration/login-rate-limit.spec.ts` — FR-015

### Implementation for User Story 1

- [X] T041 [P] [US1] Ustvari model `users` v `apps/api/src/modules/auth/models/user.model.ts` (unikaten `email`, `passwordHash`, `scopes`, `mustChangePassword`) — data-model.md
- [X] T042 [P] [US1] Ustvari model `sessionFamilies` v `apps/api/src/modules/auth/models/session-family.model.ts` s stanji `active`/`revoked` in `revokedReason`
- [X] T043 [P] [US1] Ustvari model `refreshTokens` v `apps/api/src/modules/auth/models/refresh-token.model.ts`; unikaten `tokenHash` in **delni unikatni indeks** `(familyId, state)` za `state: "active"`
- [X] T044 [P] [US1] Ustvari model `loginAttempts` v `apps/api/src/modules/auth/models/login-attempt.model.ts` s TTL indeksom 30 dni in zgoščenim naslovom odjemalca
- [X] T045 [US1] Implementiraj zgoščevanje gesel z Argon2id v `apps/api/src/modules/auth/services/password.service.ts`; čistopis se nikoli ne zabeleži — FR-010
- [X] T046 [US1] Implementiraj izdajo in preverjanje dostopnega žetona (15 min) v `apps/api/src/modules/auth/services/access-token.service.ts` (odvisno od T041) — FR-011
- [X] T047 [US1] Implementiraj obnovitvene žetone kot naključne vrednosti z rotacijo in zaznavo ponovne uporabe, veljavnost 30 dni (`REFRESH_TOKEN_TTL`), v `apps/api/src/modules/auth/services/refresh-token.service.ts` (odvisno od T042, T043) — FR-011, FR-012, SC-004, research.md §7
- [X] T048 [US1] Implementiraj omejevanje hitrosti prijave v `apps/api/src/modules/auth/services/login-throttle.service.ts`; po 5 neuspehih v 15 min `429` s sporočilom, ki ne razkriva obstoja računa (odvisno od T044) — FR-015
- [X] T049 [US1] Implementiraj `POST /auth/login` in `POST /auth/refresh` v `apps/api/src/modules/auth/router.ts`; brez middlewara za idempotentnost, izjema pa je izrecno zapisana v pogodbi — člen III (v1.1.0)
- [X] T050 [US1] Implementiraj `POST /auth/logout`, `POST /auth/password`, `GET /auth/me` v `apps/api/src/modules/auth/router.ts`
- [X] T051 [US1] Implementiraj `GET /auth/sessions` in `DELETE /auth/sessions/{familyId}` v `apps/api/src/modules/auth/router.ts` — FR-017
- [X] T052 [US1] Implementiraj ustvarjanje začetnega računa iz `ADMIN_EMAIL` in `ADMIN_INITIAL_PASSWORD` ob prvem zagonu v `apps/api/src/modules/auth/services/bootstrap-user.service.ts`; nastane natanko en uporabnik — FR-014, FR-016
- [X] T053 [US1] Uveljavi varovalko `mustChangePassword`: dokler je resničen, vsi endpointi razen odjave in menjave gesla vrnejo `403`, v `apps/api/src/modules/auth/guards/must-change-password.guard.ts` — FR-014
- [X] T054 [P] [US1] Implementiraj hrambo žetonov na odjemalcu v `apps/web/src/app/core/auth/token.store.ts`: `httpOnly` piškotek v brskalniku, varna shramba naprave na Androidu — research.md §7
- [X] T055 [US1] Implementiraj `AuthService` s tiho obnovo v `apps/web/src/app/core/auth/auth.service.ts` (odvisno od T054) — FR-011
- [X] T056 [US1] Implementiraj HTTP interceptor v `apps/web/src/app/core/auth/auth.interceptor.ts`: pripne žeton, ob `401` enkrat obnovi in ponovi zahtevo, ob neuspehu odjavi
- [X] T057 [P] [US1] Ustvari zaslon za prijavo v `apps/web/src/app/features/auth/login.page.ts`
- [X] T058 [P] [US1] Ustvari zaslon za obvezno menjavo gesla v `apps/web/src/app/features/auth/change-password.page.ts`
- [X] T059 [US1] Dodaj strukturirano beleženje prijav, odjav in preklicev družin v `apps/api/src/modules/auth/auth.audit.ts` — FR-015

**Checkpoint**: US1 je v celoti delujoča in samostojno preverljiva. Aplikacija je zaščitena; to je MVP.

---

## Phase 4: User Story 2 - Hitri pregled vremena in radarja (Priority: P2)

**Goal**: Uporabnik ob odprtju v nekaj sekundah vidi temperaturo, stanje neba, veter, vlažnost
in animirano radarsko sliko, ki se premika in sama osvežuje. Ob vsakem podatku sta vir in čas
meritve.

**Independent Test**: Odpri dashboard s prijavljeno sejo; obe ploščici sta napolnjeni s svežimi
podatki, radar se premika in se po petih minutah osveži.

### Tests for User Story 2 ⚠️

- [X] T060 [P] [US2] Pogodbeni testi `/dashboard/weather`, `/dashboard/forecast`, `/dashboard/radar` v `apps/api/tests/contract/dashboard.spec.ts`
- [X] T061 [P] [US2] Enotski test razčlenjevanja odgovora ARSO z Zod v `apps/api/tests/unit/arso-weather-parse.spec.ts`
- [X] T062 [P] [US2] Enotski test čiste funkcije svežosti (štiri stanja predpomnilnika) v `apps/api/tests/unit/freshness.spec.ts` — člen IX, research.md §13
- [X] T063 [P] [US2] Enotski test prikaza časa meritve in starosti **čez prehod na poletni in zimski čas** v `apps/api/tests/unit/dst-display.spec.ts` — vrata 2, research.md §13
- [X] T064 [P] [US2] Test, da vsak odgovor s podatki ARSO nosi `attribution` v `apps/api/tests/contract/attribution.spec.ts` — FR-027, SC-009

### Implementation for User Story 2

- [X] T065 [P] [US2] Ustvari model `externalCache` v `apps/api/src/platform/cache/model.ts` z unikatnim `key`; **brez Mongo TTL indeksa** — data-model.md, research.md §4
- [X] T066 [US2] Implementiraj čisto funkcijo svežosti v `apps/api/src/domain/freshness.ts` (svež / osvežen / zastarel a prikazan / podatka še ni); brez omrežja in brez baze — člen IX
- [X] T067 [US2] Implementiraj predpomnilniško storitev s pogojnimi zahtevami (`If-Modified-Since`, `ETag`) v `apps/api/src/platform/cache/service.ts` (odvisno od T065, T066) — FR-025, research.md §2
- [X] T068 [P] [US2] Implementiraj odjemalca vremena ARSO z Zod shemo ozkega nabora polj v `apps/api/src/modules/dashboard/clients/arso-weather.client.ts` — research.md §3
- [X] T069 [P] [US2] Implementiraj odjemalca radarske slike v `apps/api/src/modules/dashboard/clients/arso-radar.client.ts`; uporabi `si0-rm-anim.gif`, nikoli `si43-rm-anim.gif` (404)
- [X] T070 [US2] Implementiraj preslikavo v `WeatherReading` in `ForecastResponse` z ovojnico `SourceMeta` v `apps/api/src/modules/dashboard/mappers/weather.mapper.ts`; `attribution` postavi strežnik, ne odjemalec — FR-027
- [X] T071 [US2] Implementiraj `GET /dashboard/weather` in `GET /dashboard/forecast` v `apps/api/src/modules/dashboard/router.ts`; napoved iz istega odgovora vira kot trenutno vreme — FR-023, FR-024
- [X] T072 [US2] Implementiraj `GET /dashboard/radar`, ki streže `image/gif` z glavami `X-Source-Fetched-At`, `X-Source-Stale`, `X-Source-Attribution` v `apps/api/src/modules/dashboard/router.ts` — FR-021, FR-025
- [X] T073 [US2] Dopolni `GET /api/v1/health` s poročanjem o starosti predpomnjenih virov (`checks.externalSources`) v `apps/api/src/platform/health/router.ts` (odvisno od T065) — člen VII
- [X] T074 [P] [US2] Ustvari začetni zaslon dashboarda z mrežo ploščic v `apps/web/src/app/features/dashboard/dashboard.page.ts`
- [X] T075 [P] [US2] Ustvari vremensko ploščico s temperaturo, stanjem neba, vetrom, vlažnostjo in časom meritve v `apps/web/src/app/features/dashboard/tiles/weather-tile.component.ts` — FR-023
- [X] T076 [P] [US2] Ustvari radarsko ploščico, ki sliko nalaga izključno prek `/api/v1/dashboard/radar` v `apps/web/src/app/features/dashboard/tiles/radar-tile.component.ts` — FR-021
- [X] T077 [P] [US2] Ustvari prikaz navedbe vira s povezavo na `https://meteo.arso.gov.si` v `apps/web/src/app/shared/attribution/attribution.component.ts` — FR-027
- [X] T078 [US2] Implementiraj osveževanje samo v ospredju (Page Visibility na webu, stanje aplikacije na Androidu) s takojšnjo osvežitvijo ob vrnitvi, v `apps/web/src/app/core/refresh/foreground-refresh.service.ts`; interval prevzemi iz `SourceMeta` v odgovoru, ne iz lastne konstante — FR-022, research.md §8

**Checkpoint**: US1 in US2 delujeta samostojno. Dashboard prikazuje vreme in premikajoč se radar z navedbo vira.

---

## Phase 5: User Story 3 - Meni z zavihki (Priority: P3)

**Goal**: Meni se sestavi iz deklarativnega registra; na ozkem zaslonu deluje spodnja vrstica
zavihkov; trenutni zavihek je označen; zavihek se izklopi brez nove izdaje.

**Independent Test**: Vsi vklopljeni zavihki so v meniju v pravem vrstnem redu, aktivni je
označen, spodnja vrstica vodi na iste poti, izklop zavihka v nastavitvah ga odstrani iz menija
in usmerjanja.

### Tests for User Story 3 ⚠️

- [X] T079 [P] [US3] Pogodbeni test `GET /tabs` (samo vklopljeni, urejeni po `order`, filtrirani po obsegih) v `apps/api/tests/contract/tabs.spec.ts`
- [X] T080 [P] [US3] Enotski test razreševanja registra s prekritji iz nastavitev v `apps/api/tests/unit/tab-resolution.spec.ts` — research.md §9

### Implementation for User Story 3

- [X] T081 [P] [US3] Ustvari singleton model `settings` v `apps/api/src/modules/settings/model.ts` (`weather`, `theme`, `tiles`, `tabs`) s fiksnim `_id`; brez polja lastnika — data-model.md, FR-016
- [X] T082 [P] [US3] Ustvari deklarativni register zavihkov v `apps/api/src/platform/tabs/registry.ts` z obliko `TabDefinition` iz poglavja A.5; naslovi v slovenščini, `id` in `route` v angleščini — FR-002, člen X
- [X] T083 [US3] Implementiraj razreševanje registra s prekritji `enabled` in `order` iz nastavitev v `apps/api/src/platform/tabs/resolver.ts`; prekritje za neobstoječ `id` se ignorira (odvisno od T081, T082) — FR-003
- [X] T084 [US3] Implementiraj `GET /tabs` v `apps/api/src/platform/tabs/router.ts`
- [X] T085 [US3] Implementiraj sestavljanje usmerjanja iz razrešenega registra v `apps/web/src/app/core/tabs/tab-registry.service.ts`; pot izklopljenega zavihka se ne registrira — FR-003
- [X] T086 [P] [US3] Ustvari stranski meni z označenim aktivnim zavihkom v `apps/web/src/app/shared/navigation/side-menu.component.ts` — FR-002
- [X] T087 [P] [US3] Ustvari spodnjo vrstico zavihkov za ozke zaslone v `apps/web/src/app/shared/navigation/bottom-tabs.component.ts` — FR-004
- [X] T088 [US3] Implementiraj preusmeritev na dashboard, kadar se odprti zavihek izklopi, v `apps/web/src/app/core/tabs/tab-guard.ts` — robni primer iz spec.md

**Checkpoint**: US1–US3 delujejo samostojno. Meni raste iz registra, ne iz prekopiranega HTML-ja.

---

## Phase 6: User Story 4 - Uporabna aplikacija ob izpadu zunanjega vira (Priority: P4)

**Goal**: Ko ARSO ne odgovori, uporabnik vidi zadnji znani podatek z oznako starosti. Preostali
dashboard deluje normalno. Prazen zaslon in tehnično sporočilo o napaki nista sprejemljiva.

**Independent Test**: Blokiraj dostop do zunanjega vira — zaslon je še vedno poln, starost
podatka je vidna, tehnične napake ni. Nato ponovno zaženi vsebnike in preveri, da je zadnji
znani podatek še tam.

### Tests for User Story 4 ⚠️

- [X] T089 [P] [US4] Test: iztečen zapis se **prikaže** z oznako starosti in se **ne izbriše**, v `apps/api/tests/unit/cache-expiry.spec.ts` — research.md §13, past iz §4
- [X] T090 [P] [US4] Test mej starosti: radar največ 300 s, vreme največ 600 s, dokler je vir dosegljiv, v `apps/api/tests/unit/cache-ttl-bounds.spec.ts` — SC-002
- [X] T091 [P] [US4] Integracijski test: vir ne odgovori → zadnji znani podatek s `stale: true`, v `apps/api/tests/integration/source-outage.spec.ts` — FR-026, SC-003
- [X] T092 [P] [US4] Integracijski test: vira ni bilo nikoli → `503` s sporočilom in možnostjo ponovnega poskusa, v `apps/api/tests/integration/source-never-seen.spec.ts`
- [X] T093 [P] [US4] Test: uspešen odgovor s **spremenjeno strukturo** → validacija odpove, prikaže se zadnji znani podatek, v `apps/api/tests/integration/source-schema-drift.spec.ts` — research.md §13
- [X] T094 [P] [US4] Integracijski test: zadnji znani podatek preživi ponovni zagon procesa, v `apps/api/tests/integration/cache-survives-restart.spec.ts` — research.md §4

### Implementation for User Story 4

- [X] T095 [US4] Dopolni predpomnilniško storitev z beleženjem `lastAttemptAt`, `lastError` in `consecutiveFailures` ob neuspeli osvežitvi v `apps/api/src/platform/cache/service.ts` — člen VI, tiha napaka ni sprejemljiva
- [X] T096 [US4] Uveljavi vračanje `200` z `stale: true` namesto napake, kadar zadnji znani podatek obstaja, v `apps/api/src/modules/dashboard/router.ts` — FR-026
- [X] T097 [P] [US4] Implementiraj prikaz starosti podatka na ploščici v `apps/web/src/app/shared/staleness/staleness-badge.component.ts` — FR-026
- [X] T098 [P] [US4] Implementiraj stanje "podatka še ni" z gumbom za ponovni poskus v `apps/web/src/app/shared/staleness/no-data.component.ts` — robni primer iz spec.md
- [X] T099 [US4] Zagotovi, da izpad enega vira ne vpliva na druge ploščice (izolacija napake po ploščici) v `apps/web/src/app/features/dashboard/tile-host.component.ts` — FR-026

**Checkpoint**: US1–US4 delujejo. Tuja napaka ne pokvari zaslona, niti po ponovnem zagonu.

---

## Phase 7: User Story 5 - Nov zavihek brez posegov v obstoječe (Priority: P5)

**Goal**: Razvijalec doda zavihek z eno novo mapo in enim vnosom v registru. Odstranitev je
brisanje te mape in tega vnosa.

**Independent Test**: Dodaj navidezen četrti zavihek in poglej razliko — poleg nove mape sme
biti spremenjena natanko ena datoteka. Nato ga odstrani in preveri, da preverjanje tipov, lint
in testi ostanejo čisti.

### Tests for User Story 5 ⚠️

- [X] T100 [P] [US5] Test, da dodan navidezen zavihek spremeni natanko eno obstoječo datoteko, v `apps/api/tests/integration/tab-isolation.spec.ts` — SC-005, člen I
- [X] T101 [P] [US5] Test, da lint pravilo iz T005 uvoz med moduli **zavrne kot napako**, v `apps/api/tests/unit/module-boundary.spec.ts` — research.md §6
- [X] T102 [P] [US5] Test, da domenski zapisi ne nosijo polja lastnika (`settings` in `externalCache` brez `userId`), v `apps/api/tests/unit/no-owner-fields.spec.ts` — FR-016

### Implementation for User Story 5

- [X] T103 [P] [US5] Ustvari predlogo modula zavihka (API in web) v `templates/tab-module/`
- [X] T104 [P] [US5] Dokumentiraj postopek dodajanja in odstranjevanja zavihka v `docs/adding-a-tab.md`
- [X] T105 [US5] Preveri člen I na obstoječih modulih v `apps/api/src/modules/` in `apps/web/src/app/features/`: `auth`, `dashboard`, `settings` ne uvažajo drug iz drugega; popravi morebitne kršitve

**Checkpoint**: Modularnost ni več obljuba v dokumentu, ampak pravilo, ki ga prevajalnik uveljavi.

---

## Phase 8: User Story 6 - Dashboard, ki sprejme nove ploščice (Priority: P6)

**Goal**: Mreža ploščic sprejme novo vrsto brez sprememb obstoječih. Vrstni red in vidnost sta
nastavljiva in se ohranita med sejami.

**Independent Test**: Dodaj navidezno ploščico — pojavi se brez sprememb obstoječih.
Prerazporedi ploščice, odjavi se in znova prijavi; razporeditev je ostala.

### Tests for User Story 6 ⚠️

- [X] T106 [P] [US6] Pogodbeni test `GET /settings` in `PUT /settings` v `apps/api/tests/contract/settings.spec.ts`
- [X] T107 [P] [US6] Test, da se **neznana vrsta ploščice** preskoči in zabeleži, dashboard pa deluje, v `apps/api/tests/unit/tile-layout.spec.ts` — data-model.md

### Implementation for User Story 6

- [X] T108 [US6] Implementiraj `GET /settings` in `PUT /settings` z delno posodobitvijo v `apps/api/src/modules/settings/router.ts` (odvisno od T081)
- [X] T109 [US6] Implementiraj validacijo razporeditve (unikaten `position`, preskok neznanih vrst) v `apps/api/src/modules/settings/services/tile-layout.service.ts` — FR-028
- [X] T110 [P] [US6] Implementiraj registar vrst ploščic kot vtičnikov v `apps/web/src/app/features/dashboard/tile-registry.ts`; dodajanje vrste ne spremeni obstoječih — FR-020
- [X] T111 [P] [US6] Implementiraj prerazporejanje in skrivanje ploščic v `apps/web/src/app/features/settings/tile-arrangement.component.ts` — FR-028
- [X] T112 [P] [US6] Implementiraj izbiro teme (sistem, svetla, temna) v `apps/web/src/app/core/theme/theme.service.ts` — FR-006
- [X] T113 [P] [US6] Implementiraj izbiro lokacije za vreme (privzeto Ljubljana) v `apps/web/src/app/features/settings/location.component.ts` — Assumptions v spec.md

**Checkpoint**: Dashboard je razširljiv in nastavljiv; razporeditev preživi sejo.

---

## Phase 9: User Story 7 - Naprava je pripravljena na obvestila (Priority: P7)

**Goal**: Naprava se registrira, obvestilo s strežnika prispe in ob tapkanju odpre pravi
zaslon. Zavrnjeni žetoni se samodejno odstranijo.

**Independent Test**: Registriraj napravo, pošlji testno obvestilo prek
`POST /notifications/test`, preveri prihod pod 10 s in odprti zaslon. Nato razveljavi žeton in
preveri, da se zapis odstrani.

### Tests for User Story 7 ⚠️

- [X] T114 [P] [US7] Pogodbeni testi `/devices` in `/notifications/test` v `apps/api/tests/contract/devices.spec.ts`
- [X] T115 [P] [US7] Enotski test: zavrnitev `UNREGISTERED`/`INVALID_ARGUMENT` **izbriše** zapis naprave, prehodna napaka pa poveča `failureCount`, v `apps/api/tests/unit/device-cleanup.spec.ts` — FR-034
- [X] T116 [P] [US7] Test zakasnitve dostave: obvestilo prispe pod 10 s v vseh poskusih, v `apps/api/tests/integration/notification-latency.spec.ts` — SC-006

### Implementation for User Story 7

- [X] T117 [P] [US7] Ustvari model `devices` v `apps/api/src/platform/notifications/device.model.ts` z unikatnim `pushToken` — data-model.md
- [X] T118 [US7] Implementiraj pošiljanje prek `firebase-admin` s poverilnicami iz montirane datoteke v `apps/api/src/platform/notifications/fcm.service.ts`; ključa ni v kodi — člen IV
- [X] T119 [P] [US7] Definiraj ločena kanala `system` in `reminders` v `apps/api/src/platform/notifications/channels.ts` — FR-032, research.md §10
- [X] T120 [US7] Implementiraj čiščenje zavrnjenih žetonov v `apps/api/src/platform/notifications/token-cleanup.service.ts` (odvisno od T117) — FR-034
- [X] T121 [US7] Implementiraj `GET /devices`, `POST /devices`, `DELETE /devices/{deviceId}` v `apps/api/src/platform/notifications/router.ts`; ponovna registracija istega žetona posodobi zapis — FR-030
- [X] T122 [US7] Implementiraj `POST /notifications/test` v `apps/api/src/platform/notifications/router.ts` — FR-033
- [X] T123 [P] [US7] Implementiraj registracijo naprave in pošiljanje žetona strežniku v `apps/web/src/app/core/notifications/push.service.ts` — FR-030
- [X] T124 [US7] Implementiraj razlago **pred** sistemskim pozivom za dovoljenje na Androidu 13+ v `apps/web/src/app/core/notifications/permission-rationale.component.ts` — FR-031, research.md §10
- [X] T125 [US7] Implementiraj odpiranje zaslona iz `deepLink` ob tapkanju obvestila v `apps/web/src/app/core/notifications/deep-link.handler.ts` — FR-033
- [X] T126 [US7] Implementiraj ločene kanale na strani Androida v `apps/web/android/app/src/main/res/values/notification_channels.xml` — FR-032

**Checkpoint**: Vseh sedem zgodb deluje. Ogrodje je pripravljeno za 002.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T127 [P] Napiši osnovni E2E tok prijava → dashboard → viden premikajoč se radar v `apps/web/tests/e2e/happy-path.spec.ts`
- [X] T128 [P] Preveri SC-001 (prvi izris pod 3 s) z meritvijo v `apps/web/tests/e2e/performance.spec.ts`
- [X] T129 Izvedi celotno preverjanje iz `specs/001-app-shell-dashboard/quickstart.md` **§2 in §4** na živem sistemu in zabeleži izide v `docs/acceptance-001.md`
- [X] T130 Iz svežega klona izmeri pot do delujočega sistema samo z izpolnjenim `.env` in zabeleži trajanje v `docs/acceptance-001.md`; meja je 15 minut brez ročnih korakov — FR-040, SC-007, vrata 4
- [X] T131 Avtomatiziraj preverjanje člena II v `apps/web/tests/e2e/same-origin.spec.ts`: nobene zahteve na drugo domeno, nobene `OPTIONS` predhodne zahteve
- [X] T132 Preveri člen VII tako, da ustaviš API vsebnik in potrdiš, da alarm pride od **zunaj**, ne iz notranjega `/health` — `specs/001-app-shell-dashboard/quickstart.md` §4.6
- [X] T133 [P] Dopolni `.env.example`, če je izvedba prinesla nove spremenljivke, in uskladi z `docs/env-reference.md`
- [X] T134 [P] Zapiši `README.md` z zagonom, razvojnim načinom in kazalom na `specs/001-app-shell-dashboard/`
- [X] T135 Poženi detektor skrivnosti po `.gitleaks.toml` nad celotno zgodovino in potrdi, da ni nobenega zadetka (vrata 5, SC-008)
- [X] T136 Potrdi, da sta `npm run typecheck` in `npm run lint` čista in da v `apps/api/src/domain/` ter `apps/api/src/modules/` ni `any` (vrata 1)
- [X] T137 Potrdi, da je `specs/001-app-shell-dashboard/contracts/openapi.yaml` validen in usklajen z izvedenimi potmi, vključno z zapisano izjemo od `Idempotency-Key` na poteh za izdajo žetonov (vrata 3, člen III)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: brez odvisnosti, začne se takoj
- **Foundational (Phase 2)**: odvisna od Phase 1 — **blokira vse zgodbe**
- **US1 (Phase 3)**: odvisna od Phase 2
- **US2–US7 (Phase 4–9)**: odvisne od Phase 2 **in od US1**, glej spodaj
- **Polish (Phase 10)**: odvisna od vseh želenih zgodb

### User Story Dependencies

Tu je poštena opomba, ki odstopa od privzetka šablone: zgodbe **niso** popolnoma neodvisne.

- **US1 (P1)**: neodvisna. Začne se takoj po Phase 2.
- **US2, US3, US4, US6, US7**: vsaka potrebuje US1, ker so vsi njihovi endpointi za
  prijavljenega uporabnika. Brez avtentikacije jih ni mogoče niti poklicati. Po US1 so med
  sabo neodvisne in lahko tečejo vzporedno.
- **US4** potrebuje poleg US1 tudi **US2**, ker dopolnjuje pot, ki jo US2 vzpostavi
  (predpomnilnik in ploščice). Samostojno testabilna ostane: preverja se z blokiranim virom.
- **US6** potrebuje `settings` model iz **US3** (T081). Model je v US3, ker se tam prvič
  pojavi — pravilo "entiteta gre v najzgodnejšo zgodbo, ki jo potrebuje".
- **US5** je edina, ki ne potrebuje US1: preverja mejo modulov in jo je mogoče izvesti takoj
  po Phase 2.

### Naloge, ki prečkajo fazo

- **T073** (poročanje `/health` o starosti virov) je v US2, ne v Phase 2, ker potrebuje
  kolekcijo `externalCache` iz T065. Osnovni `/health` iz T034 tega ne vključuje. Brez te
  delitve bi bila T034 v svoji fazi nedokončljiva.
- **T026** (usmerjevalnik `/api-keys`) je v Phase 2, ker gre za plast `platform/`, dosegljiv
  pa je šele po US1, ko obstaja prijava. Pogodbeni test T025 to upošteva.
- **T021** (idempotentnost) se namesti na vse mutacije razen dveh poti za izdajo žetonov iz
  T049. Naloga in izjema morata biti izvedeni skladno, sicer je kršen člen III.

### Within Each User Story

- Testi se napišejo prvi in morajo pasti pred izvedbo
- Modeli pred storitvami, storitve pred endpointi, endpointi pred zasloni
- Zgodba se zaključi, preden se začne naslednja po prioriteti

### Parallel Opportunities

- Phase 1: T003–T010 vzporedno (osem različnih datotek)
- Phase 2: T012, T014, T015, T016, T018, T019, T022, T025, T027, T028, T029, T030, T031, T032, T033 vzporedno
- Vsi testi znotraj zgodbe, označeni s [P], tečejo vzporedno
- Modeli znotraj zgodbe, označeni s [P], tečejo vzporedno (T041–T044 v US1)
- Po US1 lahko US2, US3, US7 tečejo vzporedno pri več razvijalcih
- US5 lahko teče vzporedno z US1 od trenutka, ko je Phase 2 končana

---

## Parallel Example: User Story 1

```bash
# Vsi testi US1 hkrati:
Task: "T036 Pogodbeni testi /auth/* v apps/api/tests/contract/auth.spec.ts"
Task: "T037 Enotski test rotacije v apps/api/tests/unit/token-rotation.spec.ts"
Task: "T038 Enotski test ponovne uporabe v apps/api/tests/unit/token-reuse.spec.ts"
Task: "T039 Integracijski test dveh naprav v apps/api/tests/integration/multi-device.spec.ts"
Task: "T040 Integracijski test omejevanja hitrosti v apps/api/tests/integration/login-rate-limit.spec.ts"

# Vsi modeli US1 hkrati:
Task: "T041 Model users v apps/api/src/modules/auth/models/user.model.ts"
Task: "T042 Model sessionFamilies v apps/api/src/modules/auth/models/session-family.model.ts"
Task: "T043 Model refreshTokens v apps/api/src/modules/auth/models/refresh-token.model.ts"
Task: "T044 Model loginAttempts v apps/api/src/modules/auth/models/login-attempt.model.ts"
```

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1: Setup
2. Phase 2: Foundational — blokira vse, ne preskakuj
3. Phase 3: US1
4. **USTAVI SE IN PREVERI**: prijava, tiha obnova, zaznana zloraba žetona, dve napravi
5. Postavi na VPS, če je pripravljeno

Po tem koraku obstaja zaščitena, postavljena aplikacija s samodejnim TLS. Sama po sebi še ni
uporabna, je pa vse, na kar se ostalo priklopi.

### Incremental Delivery

1. Setup + Foundational → ogrodje stoji, `/health` odgovarja
2. US1 → prijava deluje → **MVP**
3. US2 → dashboard z vremenom in radarjem → prva prava uporabna vrednost
4. US3 → meni, pripravljen na 002 in 003
5. US4 → sistem prenese izpad ARSO
6. US5 → modularnost je uveljavljena s pravilom
7. US6 → ploščice so nastavljive
8. US7 → obvestila pripravljena za 002
9. Phase 10 → preverjanje ustavnih vrat na živem sistemu

### Kje se ustaviti, če je časa manj

US1 + US2 + US3 dostavijo natanko to, kar specifikacija imenuje namen funkcionalnosti:
"delujočo, prijavljeno, na VPS postavljeno aplikacijo z enim uporabnim zavihkom". US4 je
prva, ki bi jo bilo drago izpustiti — brez nje ARSO izpad pomeni prazen zaslon. US5 do US7
je mogoče prestaviti, a US7 blokira 002, ker obvestila potrebuje beleženje časa.

---

## Notes

- [P] pomeni druge datoteke in nobene odvisnosti na nedokončano nalogo
- Oznaka [Story] veže nalogo na zgodbo iz spec.md za sledljivost
- Testi morajo pasti, preden se piše izvedba
- Commitaj po vsaki nalogi ali smiselni skupini
- Ob vsakem checkpointu je mogoče ustaviti in preveriti zgodbo samostojno
- **Tri naloge, ki jih je najlažje narediti narobe:** T065 (na `externalCache` ne sme biti TTL
  indeksa, drugače FR-026 tiho odpove v produkciji), T021 skupaj s T049 (izjema od
  `Idempotency-Key` velja izključno za izdajo in rotacijo žetonov in mora biti zapisana v
  pogodbi) in T043 (delni unikatni indeks `(familyId, state)`, brez katerega je lahko v
  družini več aktivnih žetonov hkrati)
