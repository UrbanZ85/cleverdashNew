---

description: "Task list template for feature implementation"
---

# Tasks: Zavihek kamer

**Input**: Design documents from `/specs/003-cameras/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/openapi.yaml](./contracts/openapi.yaml), [quickstart.md](./quickstart.md)

**Tests**: Vključeni — konstitucijsko Kakovostno vrato 2 zahteva enotske teste domenske
logike, quickstart.md §4 pa jih že našteva kot 10 konkretnih primerov (nadomestilo za štiri
poimenske primere iz ustave, ki v 003 nimajo predmeta — glej plan.md, Constitution Check).
Pogodbeni testi sledijo istemu vzorcu kot 001/002 (Supertest proti `openapi.yaml`).

**Organization**: Naloge so razvrščene po uporabniških zgodbah iz spec.md (Z1→P1 … Z7→P7,
glej `checklists/requirements.md`, Sledljivost), tako da je vsaka zgodba samostojno
implementabilna in testabilna.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se lahko izvede vzporedno (druge datoteke, brez odvisnosti od nedokončanih nalog)
- **[Story]**: kateri uporabniški zgodbi naloga pripada (US1–US7)
- Vsaka naloga navaja natančno pot datoteke

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: priprava okolja, register, obsegov in orodij — brez domenske logike.

- [X] T001 [P] Dodaj `CAMERA_ALLOWED_EMBED_HOSTS`, `CAMERA_UNREACHABLE_THRESHOLD`, `CAMERA_DEGRADED_REFRESH_MULTIPLIER`, `CAMERA_DEFAULT_REFRESH_SECONDS`, `CREDENTIALS_ENCRYPTION_KEY` v Zod shemo `apps/api/src/platform/config/env.ts` — research.md §13/§14
- [X] T002 [P] Razširi `apps/api/tests/unit/env.spec.ts` z novimi obveznimi/privzetimi vrednostmi iz T001 (manjkajoča obvezna ustavi zagon z imenom spremenljivke)
- [X] T003 [P] Ustvari `apps/api/src/modules/cameras/scopes.ts` z `CAMERA_SCOPES` (`read: 'cameras:read'`, `write: 'cameras:write'`) — research.md §10
- [X] T004 [P] Dodaj vnos `cameras` (`order: 7`, med `time-tracking` in `settings`) v `apps/api/src/platform/tabs/registry.ts` — research.md §12
- [X] T005 [P] Dodaj `hls.js` in `@capacitor/network` v `apps/web/package.json` — research.md §15
- [X] T006 [P] Razširi `packages/contracts/scripts/generate.ts`, da poleg 001/002 pogodb generira tudi tipe iz `specs/003-cameras/contracts/openapi.yaml` v `packages/contracts/src/generated/cameras.d.ts`; dodaj preverjanje veljavnosti v `.github/workflows/ci.yml` (Kakovostno vrato 3)
- [X] T007 [P] Pripravi pomožnik za pogodbene teste 003 (nalaganje `contracts/openapi.yaml`) v `apps/api/tests/contract/cameras/_helpers.ts`, po vzoru 001/002
- [X] T008 Premakni `apps/api/src/modules/dashboard/clients/arso-weather.client.ts` v `apps/api/src/platform/arso/weather.client.ts` (brez sprememb vedenja); posodobi uvoz v `apps/api/src/modules/dashboard/router.ts` in `apps/api/src/modules/dashboard/mappers/weather.mapper.ts` — research.md §2, plan.md Complexity Tracking

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: modeli, čista domenska logika in skupne storitve, ki jih potrebuje vsaka
naslednja uporabniška zgodba.

**⚠️ KRITIČNO**: nobena uporabniška zgodba se ne začne, dokler ta faza ni dokončana.

- [X] T009 [P] Razširi mapper v `apps/api/src/platform/arso/weather.client.ts`, da poleg obstoječih polj razčleni tudi `timeline[].webcam: { direction, image }[]` in ga izpostavi v `ArsoWeatherData` — research.md §2 (odvisno od T008)
- [X] T010 [P] Razširi `apps/api/tests/unit/arso-weather-parse.spec.ts`: `webcam` iz fixtura se pravilno prebere (obstoječi test samo preverja, da polje ne podre razčlenjevanja — ne, da se prebere) (odvisno od T009)
- [X] T011 [P] Implementiraj `apps/api/src/domain/camera-validation.ts`: veljaven URL, gostitelj na efektivnem seznamu dovoljenih (parameter, ne klic baze), `https` ali izpolnjen pogoj za obvezen proxy — research.md §6, FR-034
- [X] T012 [P] Enotski test `apps/api/tests/unit/camera-validation.spec.ts`: neveljaven URL, nedovoljen gostitelj, `http` brez pogoja za proxy zavrnjeni; `http` s poverilnicami sprejet — quickstart.md §4 primeri 4–6 (odvisno od T011)
- [X] T013 [P] Implementiraj `apps/api/src/domain/camera-ordering.ts` (`sortCamerasByTimeOfDay`) — research.md §8, FR-004
- [X] T014 [P] Enotski test `apps/api/tests/unit/camera-ordering.spec.ts`: dopoldanska pred popoldansko pred 12:00, obrnjeno po 12:00, `always` ostane na relativnem mestu — quickstart.md §4 primeri 1–3 (odvisno od T013)
- [X] T015 [P] Implementiraj `apps/api/src/platform/crypto/secret-box.ts` (AES-256-GCM `encrypt`/`decrypt`, ključ iz `CREDENTIALS_ENCRYPTION_KEY`) — research.md §14
- [X] T016 [P] Enotski test `apps/api/tests/unit/secret-box.spec.ts`: round-trip enak izvirniku, popačen zapis zavrne dešifriranje (GCM tag) (odvisno od T015)
- [X] T017 [P] Ustvari model `cameras` v `apps/api/src/modules/cameras/models/camera.model.ts` — data-model.md
- [X] T018 [P] Ustvari model `cameraGroups` v `apps/api/src/modules/cameras/models/camera-group.model.ts` — data-model.md
- [X] T019 [P] Ustvari model `cameraEmbedAllowlist` (unikaten `host`) v `apps/api/src/modules/cameras/models/camera-embed-allowlist.model.ts` — data-model.md
- [X] T020 [P] Razširi `apps/api/src/modules/settings/model.ts` s poljem `cameraDataSaverEnabled: boolean` (privzeto `true`) — data-model.md, "Nastavitve porabe podatkov"
- [X] T021 Razširi `settingsUpdateSchema` in `toResponse` v `apps/api/src/modules/settings/router.ts` s `cameraDataSaverEnabled` (odvisno od T020)
- [X] T022 Implementiraj `apps/api/src/modules/cameras/services/embed-allowlist.service.ts`: efektivni seznam = osnovni iz `CAMERA_ALLOWED_EMBED_HOSTS` ∪ `cameraEmbedAllowlist` (odvisno od T001, T019)
- [X] T023 [P] Enotski test `apps/api/tests/unit/embed-allowlist.spec.ts`: unija je pravilna; osnovnega gostitelja ni mogoče odstraniti prek storitve — quickstart.md §4 primer 10 (odvisno od T022)
- [X] T024 Implementiraj `apps/api/src/modules/cameras/services/camera-proxy.service.ts`: posnetek prek `platform/cache.getOrRefresh` (ključ `camera:{id}:preview`, TTL = `refreshIntervalSeconds`, dešifriranje poverilnic prek T015 samo v pomnilniku za sestavo zahteve) in preprost pass-through za `mjpeg`/`hls` — research.md §3/§4/§14 (odvisno od T015, T017)
- [X] T025 Implementiraj `apps/api/src/modules/cameras/services/camera-health.service.ts`: izpelji `CameraHealthState` iz `resolveFreshness()` (`platform/cache`) + `consecutiveFailures` proti `CAMERA_UNREACHABLE_THRESHOLD`; `not-applicable` za kamero brez `previewUrl` — research.md §3, data-model.md (odvisno od T017)
- [X] T026 [P] Enotski test `apps/api/tests/unit/camera-health.spec.ts`: `ok`/`stale`/`unreachable`/`unknown`/`not-applicable` preslikava — quickstart.md §4 primera 7–8 (odvisno od T025)
- [X] T027 [P] Enotski test `apps/api/tests/unit/camera-order.spec.ts`: seznam ID-jev znotraj skupine se preslika v `order: 0..n-1`, kamere zunaj skupine nespremenjene — quickstart.md §4 primer 9
- [X] T028 Ustvari skelet `camerasRouter`/`cameraGroupsRouter` v `apps/api/src/modules/cameras/router.ts` in ju poveži v `apps/api/src/main.ts` (odvisno od T003, T017–T019)

**Checkpoint**: temelji so pripravljeni — implementacija uporabniških zgodb se lahko začne.

---

## Phase 3: User Story 1 - Odprem zavihek in vidim vse hkrati (Priority: P1) 🎯 MVP

**Goal**: mreža predogledov vseh nastavljenih kamer, s časom zajema, ki se osvežuje, dokler
je zaslon v ospredju.

**Independent Test**: nastavi kamere neposredno v bazi (brez UI-ja), odpri zavihek in
preveri, da se prikaže mreža s časom zajema in da se osvežuje v ospredju, ustavi v ozadju.

### Tests for User Story 1

- [X] T029 [P] [US1] Pogodbeni test `GET /cameras` v `apps/api/tests/contract/cameras/list.spec.ts`
- [X] T030 [P] [US1] Pogodbeni test `GET /cameras/{id}/snapshot` v `apps/api/tests/contract/cameras/snapshot.spec.ts`
- [X] T031 [P] [US1] Integracijski test mreže (3+ kamer različnih vrst, `GET /cameras` vrne vse s `health`) v `apps/api/tests/integration/camera-grid.spec.ts`

### Implementation for User Story 1

- [X] T032 [US1] Implementiraj `GET /cameras` (parameter `includeInactive`, vgrajen `health` prek T025, razvrščeno prek T013) v `router.ts` (odvisno od T025, T013, T028)
- [X] T033 [US1] Implementiraj `GET /cameras/{cameraId}/health` v `router.ts` (odvisno od T025)
- [X] T034 [US1] Implementiraj `GET /cameras/{cameraId}/snapshot` (glave `X-Camera-Freshness`/`X-Camera-Age-Seconds`) v `router.ts` (odvisno od T024)
- [X] T035 [P] [US1] Ustvari `apps/web/src/app/features/cameras/grid/camera-grid.page.ts` (mreža, čas zajema)
- [X] T036 [P] [US1] Ustvari `apps/web/src/app/features/cameras/grid/camera-tile.component.ts` (posnetek z osveževanjem na `refreshIntervalSeconds`)
- [X] T037 [US1] Implementiraj ustavitev/nadaljevanje osveževanja glede na ospredje/ozadje (Page Visibility API) v `camera-grid.page.ts` (odvisno od T035)
- [X] T038 [US1] Registriraj pot `/cameras` v `apps/web/src/app/app.routes.ts` in navigacijski vnos iz registra zavihkov (T004)

**Checkpoint**: US1 je samostojno funkcionalen in testabilen.

---

## Phase 4: User Story 2 - Ena kamera na cel zaslon (Priority: P2)

**Goal**: tapkanje na kamero v mreži odpre celozaslonski prikaz; živi tok se predvaja
namesto posnetka in se ustavi ob vrnitvi.

**Independent Test**: v mreži iz US1 izberi kamero z živim tokom, preveri celozaslonski
prikaz in predvajanje, vrni se in preveri, da se tok ustavi.

### Tests for User Story 2

- [X] T039 [P] [US2] Pogodbeni test `GET /cameras/{id}/stream` v `apps/api/tests/contract/cameras/stream.spec.ts`

### Implementation for User Story 2

- [X] T040 [US2] Implementiraj `GET /cameras/{cameraId}/stream` (pass-through za `mjpeg`/`hls`) v `router.ts` (odvisno od T024)
- [X] T041 [P] [US2] Ustvari `apps/web/src/app/features/cameras/viewer/embedded-camera.component.ts`: `<iframe [src]>` prek `DomSanitizer.bypassSecurityTrustResourceUrl`, s ponovnim preverjanjem gostitelja na odjemalcu — research.md §5
- [X] T042 [P] [US2] Ustvari `apps/web/src/app/features/cameras/viewer/camera-viewer.page.ts` (celozaslonski prikaz; `hls.js` za `hls`, `<img>` za `mjpeg`/`snapshot`, T041 za `iframe`)
- [X] T043 [US2] Poveži tap na ploščici → navigacija v `camera-viewer.page.ts`, ustavitev toka ob vrnitvi v mrežo (odvisno od T035, T042)

**Checkpoint**: US1 in US2 delujeta skupaj.

---

## Phase 5: User Story 3 - Dodam kamero brez posega v kodo (Priority: P3)

**Goal**: zaslon za urejanje, na katerem uporabnik doda novo kamero (vključno z vdelavo tuje
strani ali ARSO webcamom) in spremeni vrstni red — brez novega builda.

**Independent Test**: odpri zaslon za urejanje, dodaj kamero vrste vdelave tuje strani,
preveri, da se takoj pojavi v mreži iz US1.

### Tests for User Story 3

- [X] T044 [P] [US3] Pogodbeni test `POST /cameras` (uspeh in `422` ob neveljavnem/nedovoljenem naslovu) v `apps/api/tests/contract/cameras/create.spec.ts`
- [X] T045 [P] [US3] Pogodbeni test `GET/POST /cameras/embed-hosts`, `DELETE /cameras/embed-hosts/{host}` v `apps/api/tests/contract/cameras/embed-hosts.spec.ts`
- [X] T046 [P] [US3] Pogodbeni test `GET /cameras/arso-webcams` (prazen seznam za lokacijo brez slike) v `apps/api/tests/contract/cameras/arso-webcams.spec.ts`
- [X] T047 [P] [US3] Pogodbeni test `PUT /cameras/order`, `POST /camera-groups`, `PUT /camera-groups/order` v `apps/api/tests/contract/cameras/groups.spec.ts`

### Implementation for User Story 3

- [X] T048 [US3] Implementiraj `POST /cameras` (validacija prek T011, šifriranje poverilnic prek T015, `Idempotency-Key`) v `router.ts` (odvisno od T011, T015, T028)
- [X] T049 [US3] Implementiraj `GET/POST /cameras/embed-hosts`, `DELETE /cameras/embed-hosts/{host}` v `router.ts` (odvisno od T022)
- [X] T050 [US3] Implementiraj `GET /cameras/arso-webcams?location=` (bere `platform/arso` predpomnjen zapis, brez novega ARSO klica) v `router.ts` (odvisno od T009)
- [X] T051 [US3] Implementiraj `PUT /cameras/order` v `router.ts` (odvisno od T027)
- [X] T052 [US3] Implementiraj `POST /camera-groups`, `PUT /camera-groups/order` v `router.ts` (odvisno od T018)
- [X] T053 [P] [US3] Ustvari `apps/web/src/app/features/cameras/manage/camera-manage.page.ts` (seznam obstoječih kamer, tudi neaktivnih)
- [X] T054 [P] [US3] Ustvari `apps/web/src/app/features/cameras/manage/camera-form.component.ts` (dodajanje: izbira vrste vira, vključno z izbiro ARSO webcama in tokom odobritve novega gostitelja iz T049)
- [X] T055 [US3] Implementiraj spremembo vrstnega reda z ↑/↓ gumboma (vzorec `tile-arrangement.component.ts`, research.md §7) v `camera-manage.page.ts` (odvisno od T053)

**Checkpoint**: US1–US3 delujejo skupaj — to je konec-do-konca demonstracija uporabnikove
izrecne zahteve (dodajanje kamer prek UI-ja, vključno z vdelanimi viri).

---

## Phase 6: User Story 4 - Urejam in brišem obstoječo kamero (Priority: P4)

**Goal**: na zaslonu za urejanje je obstoječo kamero mogoče spremeniti ali izbrisati, s
potrditvijo pred brisanjem.

**Independent Test**: uredi obstoječo kamero, preveri odraz v mreži; izbriši jo, preveri
potrditev in izginotje iz mreže.

### Tests for User Story 4

- [X] T056 [P] [US4] Pogodbeni test `GET/PUT/DELETE /cameras/{id}` v `apps/api/tests/contract/cameras/update-delete.spec.ts`
- [X] T057 [P] [US4] Pogodbeni test `PUT/DELETE /camera-groups/{id}` v `apps/api/tests/contract/cameras/groups-crud.spec.ts`

### Implementation for User Story 4

- [X] T058 [US4] Implementiraj `GET/PUT/DELETE /cameras/{cameraId}` (enaka validacija kot T048; napačen vnos ne spremeni obstoječih vrednosti) v `router.ts` (odvisno od T048)
- [X] T059 [US4] Implementiraj `PUT/DELETE /camera-groups/{groupId}` (brisanje skupine postavi `groupId: null` na njenih kamerah, ne izbriše kamer) v `router.ts` (odvisno od T052)
- [X] T060 [P] [US4] Razširi `camera-form.component.ts` za način urejanja (predpolnjen obrazec) (odvisno od T054)
- [X] T061 [P] [US4] Implementiraj potrditveni dialog pred brisanjem v `camera-manage.page.ts` (odvisno od T053)
- [X] T062 [US4] Implementiraj razumljivo zaprtje celozaslonskega prikaza, če je prikazana kamera izbrisana na drugi napravi/zavihku, v `camera-viewer.page.ts` (odvisno od T042)

**Checkpoint**: US1–US4 delujejo skupaj — poln CRUD nad kamerami.

---

## Phase 7: User Story 5 - Kamera ne dela (Priority: P5)

**Goal**: nedosegljiva kamera je vidno označena (zatemnjen zadnji posnetek, starost,
opozorilo), ostale kamere delujejo naprej, osveževanje se upočasni.

**Independent Test**: naredi vir ene kamere neodgovoren, preveri oznako v mreži in da so
ostale kamere nemoteno.

- [X] T063 [P] [US5] Integracijski test: kamera po `CAMERA_UNREACHABLE_THRESHOLD` zaporednih neuspehih preide v `unreachable`, ostale kamere nedotaknjene, v `apps/api/tests/integration/camera-health.spec.ts` (odvisno od T025)
- [X] T064 [US5] Implementiraj vizualno stanje "staro"/"nedosegljivo" (zatemnjen posnetek, starost, opozorilo) v `camera-tile.component.ts` (odvisno od T036)
- [X] T065 [US5] Implementiraj upočasnjen interval osveževanja na strani odjemalca za `unreachable` kamero (`CAMERA_DEGRADED_REFRESH_MULTIPLIER` iz odgovora zdravja) v `camera-grid.page.ts` (odvisno od T037)

---

## Phase 8: User Story 6 - Razvrstitev po času dneva (Priority: P6)

**Goal**: dopoldanske kamere so pred poldnem na vrhu, popoldanske po poldnevu, znotraj
ročnega vrstnega reda.

**Independent Test**: kamera z oznako dopoldne in kamera z oznako popoldne; preveri vrstni
red pred in po poldnevu.

- [X] T066 [P] [US6] Integracijski test: `GET /cameras` spoštuje časovno oznako pred/po poldnevu v `apps/api/tests/integration/camera-time-of-day.spec.ts` (odvisno od T013, T032)
- [X] T067 [US6] Preveri in po potrebi popravi uporabo `camera-ordering.ts` v odgovoru `GET /cameras` iz T032, da lokalna ura izhaja iz `Europe/Ljubljana` ob času zahteve, ne ob času zadnjega zajema (odvisno od T032)

---

## Phase 9: User Story 7 - Prenos podatkov na telefonu (Priority: P7)

**Goal**: na mobilnem omrežju se predogledi osvežujejo redkeje in živi tokovi se ne zaženejo
samodejno, z možnostjo izklopa.

**Independent Test**: simuliraj mobilno omrežje, preveri daljši interval in odsotnost
samodejnega zagona toka; izklopi nastavitev in preveri enako obnašanje kot na Wi-Fi.

- [X] T068 [P] [US7] Implementiraj `apps/web/src/app/core/network/network-status.service.ts` (`@capacitor/network` + `navigator.connection` kot spletni približek) — research.md §9
- [X] T069 [US7] Prilagodi interval osveževanja in onemogoči samodejni zagon živega toka na mobilnem omrežju v `camera-grid.page.ts`/`camera-viewer.page.ts` (odvisno od T068, T037, T042)
- [X] T070 [P] [US7] Dodaj stikalo "zmanjšaj porabo podatkov" (`cameraDataSaverEnabled`) v nastavitveni zaslon `apps/web/src/app/features/settings/` (odvisno od T021)
- [X] T071 [P] [US7] Enotski test odločitvene funkcije "interval osveževanja + samodejni zagon toka glede na `cameraDataSaverEnabled` × zaznano omrežje" v `apps/web/tests/unit/network-status.service.spec.ts` (vitest.config.ts omeji zbiranje testov na `tests/unit/**`, ne colocated) — analiza F5 (odvisno od T068)

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T072 [P] Poženi `npx @redocly/cli lint specs/003-cameras/contracts/openapi.yaml` in popravi morebitne najdbe — plan.md, Kakovostno vrato 3 (ni bilo pognano v `/speckit-plan`, ker orodje ni bilo nameščeno)
- [X] T073 [P] Poženi `npm run generate:contracts` in preveri, da `packages/contracts/src/generated/cameras.d.ts` ustreza pogodbi
- [X] T074 [P] Posodobi `README.md`/dokumentacijo z novim zavihkom kamer
- [X] T075 [P] [US3] Napiši E2E test dodajanja kamere (odpri zaslon za urejanje → dodaj kamero vrste `iframe` → preveri pojavitev v mreži brez ponovnega nalaganja aplikacije) v `apps/web/tests/e2e/cameras-add.spec.ts`, po vzoru edinega E2E toka v 001/002 (`apps/web/tests/e2e/time-tracking-manual.spec.ts`) — analiza F2, plan.md Technical Context "Testing" (odvisno od T054, T038)
- [X] T076 Izvedi celoten prehod skozi `quickstart.md` §3 (vse uporabniške zgodbe) na `docker compose up` sistemu iz čiste kopije (Kakovostno vrato 4 — brez sprememb infrastrukture, glej plan.md) in dokumentiraj rezultate v `docs/acceptance-003.md`, po vzoru `docs/acceptance-001.md`/`docs/acceptance-002.md`
- [X] T077 [P] Varnostni pregled: preveri, da noben del `features/cameras/` ne uporablja `bypassSecurityTrustHtml`, samo `bypassSecurityTrustResourceUrl` na strežniško preverjenih naslovih — research.md §5, dokumentiraj v `docs/acceptance-003.md`
- [X] T078 Poženi `npm run typecheck`, `npm run lint`, `npm run test` (Kakovostno vrato 1) in `gitleaks detect` nad git zgodovino (Kakovostno vrato 5) — vsi čisti, dokumentiraj v `docs/acceptance-003.md`

---

## Phase 11: Popravki po pregledu vmesnika (27. 8. 2026)

- [X] T079 [P] FR-011: ploščica kamere brez posnetka (`iframe`, `mjpeg`, `hls`) NE sme kazati značke "Še ni podatka" — dobi "Ni preverljivo" in nadomestno besedilo v okvirju, v `apps/web/src/app/features/cameras/grid/camera-tile.component.ts`. Stanje `unknown` je bilo začetna vrednost signala, ki je ostala, ker te vrste zdravja sploh ne poizvedujejo — videti je bilo kot okvara.
- [X] T080 [P] Prestavi `features/cameras/manage/camera-address.ts` v `core/embeds/embed-address.ts` (skupno z 005, člen I) in dodaj `EMBED_REFERRER_POLICY`/`EMBED_ALLOW`; `embedded-camera.component.ts` uporabi ista atributa kot ploščica vtičnika — FR-119 iz 005. Test se preseli v `apps/web/tests/unit/embed-address.spec.ts`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: brez odvisnosti — začne se takoj
- **Foundational (Phase 2)**: odvisna od Setup — BLOKIRA vse uporabniške zgodbe
- **User Stories (Phase 3+)**: vse odvisne od zaključka Foundational faze
  - US1–US7 lahko potekajo vzporedno (če je dovolj ljudi) ali zaporedno po prioriteti
  - US5–US7 gradijo na servisih/komponentah iz US1/US2/US3, zato jih smiselno sledijo tem
- **Polish (Phase 10)**: odvisna od zaključka želenih uporabniških zgodb

### User Story Dependencies

- **US1 (P1)**: po Foundational — brez odvisnosti od drugih zgodb
- **US2 (P2)**: po Foundational — uporablja `camera-grid.page.ts` iz US1 (T035) za navigacijo, sicer neodvisna
- **US3 (P3)**: po Foundational — neodvisna od US1/US2 (deluje samostojno, prikaz v mreži je iz US1)
- **US4 (P4)**: nadgrajuje US3 (isti obrazec, `camera-form.component.ts`) in US2 (`camera-viewer.page.ts` zaprtje ob brisanju)
- **US5 (P5)**: nadgrajuje `camera-tile.component.ts`/`camera-grid.page.ts` iz US1
- **US6 (P6)**: nadgrajuje `GET /cameras` iz US1
- **US7 (P7)**: nadgrajuje `camera-grid.page.ts`/`camera-viewer.page.ts` iz US1/US2 in nastavitve iz Foundational (T021)

### Parallel Opportunities

- Vse naloge Phase 1 z `[P]` lahko potekajo vzporedno
- Znotraj Phase 2: vsi modeli (T017–T019), vsa domenska logika (T011, T013, T015) in njihovi enotski testi lahko potekajo vzporedno med sabo (ne pa pred storitvami, ki jih uporabljajo — T022, T024, T025, T028)
- Po zaključku Foundational faze lahko US1–US3 potekajo vzporedno (US4–US7 čakajo na komponente, ki jih nadgrajujejo)
- Znotraj vsake zgodbe so testi z `[P]` vzporedni med sabo

---

## Parallel Example: User Story 1

```bash
# Testi za US1 vzporedno:
Task: "Pogodbeni test GET /cameras v apps/api/tests/contract/cameras/list.spec.ts"
Task: "Pogodbeni test GET /cameras/{id}/snapshot v apps/api/tests/contract/cameras/snapshot.spec.ts"
Task: "Integracijski test mreže v apps/api/tests/integration/camera-grid.spec.ts"

# Komponente za US1 vzporedno:
Task: "Ustvari camera-grid.page.ts"
Task: "Ustvari camera-tile.component.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 samostojno)

1. Zaključi Phase 1: Setup
2. Zaključi Phase 2: Foundational (KRITIČNO — blokira vse zgodbe)
3. Zaključi Phase 3: US1 (mreža predogledov nad ročno vstavljenimi kamerami)
4. **USTAVI IN PREVERI**: US1 samostojno, prek `quickstart.md` §3.1
5. Za resnično uporabno MVP (uporabnikova izrecna zahteva — dodajanje brez posega v kodo)
   nadaljuj do konca Phase 5 (US3): šele takrat lahko uporabnik sam napolni mrežo.

### Incremental Delivery

1. Setup + Foundational → temelj pripravljen
2. US1 → mreža nad ročno vstavljenimi podatki → preveri samostojno
3. US2 → celozaslonski prikaz → preveri samostojno
4. US3 → dodajanje prek UI-ja (**prva resnično uporabna izdaja brez razvijalca**) → preveri samostojno
5. US4 → urejanje/brisanje → preveri samostojno
6. US5–US7 → kakovost prikaza (napake, razvrstitev, mobilni prihranek) → vsaka preveri samostojno

### Parallel Team Strategy

Z več razvijalci: skupaj Setup + Foundational, nato US1 (backend GET-poti + mreža), US3
(backend mutacijske poti + obrazec) in US2 (viewer + embed varnost) lahko tečejo vzporedno,
ker si ne delijo datotek razen skupnega `router.ts` (uskladi zaporedje spajanja). US4–US7 se
navežejo šele, ko so njihove predhodnice (US1–US3) združene.

---

## Notes

- `[P]` naloge = različne datoteke, brez odvisnosti od nedokončanih nalog
- Oznaka `[Story]` naloge poveže z konkretno uporabniško zgodbo za sledljivost
- Vsaka zgodba naj bo samostojno dokončljiva in testabilna
- Preveri, da testi spodletijo pred implementacijo (kjer so testi vključeni)
- Commitaj po vsaki nalogi ali logični skupini
- Ustavi se na vsaki kontrolni točki (`Checkpoint`), da preveriš zgodbo samostojno
- Skladno s `plan.md`: brez sprememb `infra/docker-compose.yml`/`api.Dockerfile` — ta funkcionalnost ne potrebuje novih sistemskih odvisnosti
