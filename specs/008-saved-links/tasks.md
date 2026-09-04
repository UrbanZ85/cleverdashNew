---

comment: "Task list template for feature implementation"
---

# Tasks: Shranjeni linki

**Input**: Design documents from `/specs/008-saved-links/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/openapi.yaml](./contracts/openapi.yaml), [quickstart.md](./quickstart.md)

**Tests**: Vključeni — konstitucijsko Kakovostno vrato 2 zahteva enotske teste domenske
logike, quickstart.md §4 pa jih našteva kot konkretne primere (nadomestilo za štiri
poimenske primere iz ustave, ki v 008 nimajo predmeta — glej plan.md, Constitution Check).
Pogodbeni testi sledijo istemu vzorcu kot 001/002/003 (Supertest proti `openapi.yaml`).

**Organization**: Naloge so razvrščene po uporabniških zgodbah iz spec.md (US1→P1 …
US6→P6), tako da je vsaka zgodba samostojno implementabilna in testabilna.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se lahko izvede vzporedno (druge datoteke, brez odvisnosti od nedokončanih nalog)
- **[Story]**: kateri uporabniški zgodbi naloga pripada (US1–US6)
- Vsaka naloga navaja natančno pot datoteke

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: okolje, registri, obsegi in orodja — brez domenske logike.

- [ ] T001 [P] Dodaj `SAVED_LINKS_METADATA_TIMEOUT_MS` (2500), `SAVED_LINKS_METADATA_MAX_BYTES` (131072) in `SAVED_LINKS_FAVICON_TTL_SECONDS` (604800) kot NEOBVEZNE vrednosti s privzetki v Zod shemo `apps/api/src/platform/config/env.ts` — research.md §14, vrata 4
- [ ] T002 [P] Dopolni `.env.example` s tremi spremenljivkami iz T001, označenimi kot neobvezne, z opisom, kaj pomenijo — člen IV
- [ ] T003 [P] Razširi `apps/api/tests/unit/env.spec.ts`: brez vpisa v `.env` veljajo privzetki iz T001; vpisana vrednost jih prepiše (odvisno od T001)
- [ ] T004 [P] Ustvari `apps/api/src/modules/saved-links/scopes.ts` s `SAVED_LINK_SCOPES` (`read: 'saved-links:read'`, `write: 'saved-links:write'`) — research.md §12
- [ ] T005 [P] Dodaj vnos `saved-links` (`title: 'Shranjeni linki'`, `icon: 'bookmarks-outline'`, `route: '/saved-links'`, `order: 8`, med `cameras` (7) in `settings` (10); `notes` (007) ima 3) v `apps/api/src/platform/tabs/registry.ts` — docs/adding-a-tab.md korak 2
- [ ] T006 [P] Dodaj `'saved-links:read'` in `'saved-links:write'` v `BASE_USER_SCOPES` v `apps/api/src/platform/keycloak/role-mapping.ts` (dobesedna niza, NE uvoz iz modula) — docs/adding-a-tab.md korak 5, člen I
- [ ] T007 [P] Razširi `packages/contracts/scripts/generate.ts` s ciljem `specs/008-saved-links/contracts/openapi.yaml` → `packages/contracts/src/generated/saved-links.d.ts` in preveri, da `npm run generate:contracts` teče čisto — Kakovostno vrato 3
- [ ] T008 [P] Pripravi pomožnik za pogodbene teste 008 (nalaganje `contracts/openapi.yaml`) v `apps/api/tests/contract/saved-links/_helpers.ts`, po vzoru `apps/api/tests/contract/cameras/_helpers.ts`
- [ ] T009 [P] Registriraj ikoni `bookmarks-outline` in `link-outline` v `apps/web/src/app/core/icons/register-icons.ts` in ju dodaj v seznam v `apps/web/tests/unit/icons.spec.ts` — docs/adding-a-tab.md korak 6

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: čiste domenske funkcije, modela in ogrodje usmerjevalnika, ki jih potrebuje
vsaka naslednja zgodba.

**⚠️ KRITIČNO**: nobena uporabniška zgodba se ne začne, dokler ta faza ni dokončana.

- [ ] T010 [P] Implementiraj `apps/api/src/modules/saved-links/domain/link-url.ts`: `normalizeLinkUrl(raw)` → `{ ok: true, url }` ali `{ ok: false, reason: 'invalid' | 'scheme' | 'too-long' }`; obrezani presledki, manjkajoča shema → `https://`, gostitelj v mali začetnici, pot nedotaknjena, meja 2048 znakov; `hostLabel(url)` za nadomestno ime — FR-002, FR-003, FR-007
- [ ] T011 [P] Enotski test `apps/api/tests/unit/link-url.spec.ts`: ` primer.si/a ` → `https://primer.si/a`; `javascript:`, `data:`, `file:` zavrnjeni z `scheme`; naslov nad 2048 znaki zavrnjen; `HTTP://PRIMER.SI/Pot` → `http://primer.si/Pot`; `hostLabel` vrne gostitelja brez `www.` — quickstart.md §4 (odvisno od T010)
- [ ] T012 [P] Implementiraj `apps/api/src/modules/saved-links/domain/search-text.ts`: `foldForSearch(s)` (male črke + `normalize('NFD')` + odstranitev diakritike), `buildSearchText({title,url,comment})` in `escapeRegExp(q)` — research.md §6, FR-030
- [ ] T013 [P] Enotski test `apps/api/tests/unit/search-text.spec.ts`: `foldForSearch('Beleženje časa')` vsebuje `belezenje casa`; `SLO` najde `slo`; `buildSearchText` zajame naslov IN komentar; `escapeRegExp('.')` ne pomeni "poljuben znak" — quickstart.md §4 (odvisno od T012)
- [ ] T014 [P] Implementiraj `apps/api/src/modules/saved-links/domain/link-metadata.ts`: iz danega NIZA HTML izlušči `<title>` in `href` iz `<link rel="icon">` / `rel="shortcut icon"`; brez omrežja, brez baze — člen IX
- [ ] T015 [P] Enotski test `apps/api/tests/unit/link-metadata.spec.ts`: naslov z entitetami (`&amp;`), naslov čez več vrstic, dokument brez `<title>` → `null`, relativni `href` favicona ostane relativen (razrešitev je naloga storitve) (odvisno od T014)
- [ ] T016 [P] Implementiraj `apps/api/src/modules/saved-links/domain/link-input.ts` po vzoru `apps/api/src/modules/notes/domain/note-input.ts`: `linkWriteSchema` in `linksQuerySchema` (Zod), `buildLinksFilter({userId, query, groupId})` (userId je VEDNO del filtra) in `deriveLinkTitle(title, url)` (nadomestek je gostitelj naslova) — research.md §15
- [ ] T017 [P] Enotski test `apps/api/tests/unit/link-input.spec.ts` po vzoru `apps/api/tests/unit/note-input.spec.ts`: filter brez `userId` ni sestavljiv; `groupId: 'none'` pomeni `null`; `deriveLinkTitle('', 'https://www.arso.gov.si/x')` vrne `arso.gov.si` (odvisno od T016)
- [ ] T018 [P] Ustvari model `savedLinks` v `apps/api/src/modules/saved-links/models/saved-link.model.ts` z indeksi `{userId,groupId,order}`, `{userId,createdAt:-1}`, `{userId,url}` (NE unikaten) — data-model.md
- [ ] T019 [P] Ustvari model `savedLinkGroups` v `apps/api/src/modules/saved-links/models/saved-link-group.model.ts` z indeksoma `{userId,order}` in unikatnim `{userId,name}` — data-model.md
- [ ] T020 Ustvari `apps/api/src/modules/saved-links/router.ts` z ogrodjem poti, `requireScopes(...)` na vsaki poti in pomožnikom `findLinkOr404(userId, id)` (tuj zapis → 404, ne 403) — data-model.md, vzorec `findCameraOr404` (odvisno od T004, T018, T019)
- [ ] T021 Vpni `apiV1Router.use(savedLinksRouter)` v `apps/api/src/main.ts` na označenem mestu — docs/adding-a-tab.md korak 3 (odvisno od T020)
- [ ] T022 [P] Ustvari `apps/web/src/app/core/saved-links/saved-link.model.ts` (tipi iz generirane pogodbe) in `saved-links.store.ts` (signali: seznam, mape, stanje nalaganja) (odvisno od T007)
- [ ] T023 [P] Dodaj pot `saved-links` z `loadComponent`, `authGuard` in `tabGuard` v `apps/web/src/app/app.routes.ts` — docs/adding-a-tab.md korak 4

**Checkpoint**: ogrodje stoji — zavihek je viden v meniju, endpointi vračajo prazne sezname.

---

## Phase 3: User Story 1 - Shranim stran, ki jo bom potreboval pozneje (Priority: P1) 🎯 MVP

**Goal**: prilepljen naslov postane zapis na seznamu, z imenom, ki ga prebere strežnik, in
brez odvisnosti od dosegljivosti strani.

**Independent Test**: quickstart.md §3.1 — pet primerov (dosegljiva stran, naslov brez
sheme, `javascript:`, neobstoječa domena, `http://192.168.1.1`).

### Tests for User Story 1

- [ ] T024 [P] [US1] Pogodbeni test `apps/api/tests/contract/saved-links/create.spec.ts`: `201` z obliko iz `CreatedSavedLink`; `javascript:alert(1)` → `400` s problem+json; `duplicateOfId` je `null` pri prvem zapisu in ID prvega pri drugem enakem naslovu — FR-005
- [ ] T025 [P] [US1] Integracijski test `apps/api/tests/integration/saved-links-metadata.spec.ts`: nedosegljiva domena → zapis obstane z `metadataStatus: 'failed'`; `http://192.168.1.1` → `metadataStatus: 'skipped'` in NOBENEGA odhodnega klica (podtaknjen `fetch` ne sme biti klican) — FR-004, SC-002, SC-008

### Implementation for User Story 1

- [ ] T026 [US1] Implementiraj `apps/api/src/modules/saved-links/services/link-metadata.service.ts`: preverjanje prek `domain/outbound-url.ts`, `AbortSignal.timeout` iz `SAVED_LINKS_METADATA_TIMEOUT_MS`, branje največ `SAVED_LINKS_METADATA_MAX_BYTES`, samo `text/html`, do 3 preusmeritve z NOVIM preverjanjem vsakega cilja; vrne `{ title, faviconUrl, status }` — research.md §2, §3, §5, §14
- [ ] T027 [P] [US1] Enotski test `apps/api/tests/unit/link-metadata-service.spec.ts` s podtaknjenim `fetch`: preusmeritev na `http://10.0.0.1/` zavrnjena na drugem skoku (`failed`); četrti skok zavrnjen; odgovor `application/pdf` se ne razčlenjuje; telo nad mejo se odreže (odvisno od T026)
- [ ] T028 [US1] Implementiraj `POST /saved-links` v `apps/api/src/modules/saved-links/router.ts`: normalizacija (T010), zapis PRED branjem metapodatkov, nadomestno ime = gostitelj, `titleSource`, `searchText` (T012), `order` na vrh mape, `duplicateOfId` — FR-001…FR-005, FR-033 (odvisno od T020, T026)
- [ ] T029 [US1] Implementiraj `GET /saved-links` (privzeto `sort=manual`, razvrstitev po `(groupId, order)`) v istem usmerjevalniku — FR-030 pride v US2 (odvisno od T020)
- [ ] T030 [US1] Ustvari `apps/web/src/app/features/saved-links/saved-links.page.ts`: seznam zapisov, stanje nalaganja in prazno stanje z gumbom za prvi vnos — FR-071 (odvisno od T022, T023, T029)
- [ ] T031 [US1] Ustvari `apps/web/src/app/features/saved-links/link-editor.component.ts`: polje za naslov (lepljenje), neobvezno ime/komentar/ikona/mapa, sporočila ob zavrnitvi naslova, opozorilo ob `duplicateOfId` z bližnjico do obstoječega zapisa — US1 scenarij 5, FR-005 (odvisno od T028, T030)
- [ ] T032 [US1] Prikaži značko stanja metapodatkov (`skipped` / `failed`) v seznamu s slovenskim besedilom in gumbom "osveži podatke strani" (dejanje pride v US4) — člen VII, člen X (odvisno od T030)

**Checkpoint**: zapis je mogoče shraniti in videti; shranjevanje preživi nedosegljivo stran.

---

## Phase 4: User Story 2 - Najdem, kar sem shranil (Priority: P2)

**Goal**: iskanje po imenu, naslovu in komentarju, neobčutljivo na velike črke in šumnike.

**Independent Test**: quickstart.md §3.2 — `cas` najde "časa", `arso` najde zapis, kjer je
niz samo v naslovu, `...` ne razpade v regularni izraz.

### Tests for User Story 2

- [ ] T033 [P] [US2] Pogodbeni test `apps/api/tests/contract/saved-links/search.spec.ts`: `?q=cas` najde zapis z imenom "Beleženje časa"; `?q=arso` najde zapis, kjer je niz le v `url`; `?q=.` ne vrne vsega; `?groupId=none` vrne le nerazvrščene — FR-030, FR-031

### Implementation for User Story 2

- [ ] T034 [US2] Dopolni `GET /saved-links` v `apps/api/src/modules/saved-links/router.ts` s parametri `q`, `groupId` (`none` = `null`), `limit` in `sort` (`manual` | `recent`); poizvedba je ubran regularni izraz nad `searchText` — research.md §6 (odvisno od T029, T012)
- [ ] T035 [P] [US2] Ustvari `apps/web/src/app/core/search/fold-text.ts` z ISTIM pravilom zlaganja kot `domain/search-text.ts` in enotski test `apps/web/tests/unit/fold-text.spec.ts` z istim naborom primerov — research.md §6, plan.md Complexity Tracking
- [ ] T036 [US2] Dodaj iskalno polje v `apps/web/src/app/features/saved-links/saved-links.page.ts`: filtriranje naloženega seznama v pomnilniku prek `foldForSearch`, izrecno besedilo ob praznem izidu — SC-003, US2 scenarij 4 (odvisno od T035, T030)

**Checkpoint**: iskanje deluje takoj ob tipkanju in tudi kot HTTP klic.

---

## Phase 5: User Story 3 - Uredim jih v mape (Priority: P3)

**Goal**: mape z vrstnim redom in zloženim stanjem; brisanje mape ne izgubi zapisov.

**Independent Test**: quickstart.md §3.3 — štirje koraki, vključno z brisanjem neprazne mape.

### Tests for User Story 3

- [ ] T037 [P] [US3] Pogodbeni test `apps/api/tests/contract/saved-links/groups.spec.ts`: ustvarjanje, preimenovanje, zlaganje; podvojeno ime → `400`; brisanje neprazne mape → `200` z `movedLinks` in zapisi ostanejo z `groupId: null` — FR-020…FR-022, SC-006
- [ ] T038 [P] [US3] Pogodbeni test `apps/api/tests/contract/saved-links/order.spec.ts`: `PUT /saved-links/order` postavi vrstni red; ID iz druge mape v telesu → `400`; zapisi zunaj seznama ostanejo nedotaknjeni — FR-032

### Implementation for User Story 3

- [ ] T039 [US3] Implementiraj `GET/POST /saved-link-groups` in `PATCH/DELETE /saved-link-groups/{groupId}` v `apps/api/src/modules/saved-links/router.ts`; brisanje najprej `updateMany({groupId: null})`, nato `deleteOne`, odgovor z `movedLinks` in `linkCount` v seznamu — research.md §8 (odvisno od T019, T020)
- [ ] T040 [US3] Implementiraj `PUT /saved-links/order` in `PUT /saved-link-groups/order` z uporabo `toOrderAssignments` iz `apps/api/src/domain/camera-order.ts` — research.md §7 (odvisno od T020)
- [ ] T041 [P] [US3] Enotski test `apps/api/tests/unit/link-order.spec.ts`: preslikava seznama ID-jev v pare `{id, order}`; ID, ki v seznamu ni, se v izhodu ne pojavi (odvisno od T040)
- [ ] T042 [US3] Ustvari `apps/web/src/app/features/saved-links/group-editor.component.ts`: dodajanje, preimenovanje in brisanje mape s potrditvijo, ki pove, koliko zapisov bo postalo nerazvrščenih (odvisno od T039)
- [ ] T043 [US3] Skupinski prikaz v `apps/web/src/app/features/saved-links/saved-links.page.ts`: zapisi pod mapami, zlaganje mape shranjeno prek `PATCH`, nerazvrščeni v svojem razdelku — FR-021, US3 scenarij 2 (odvisno od T039, T030)
- [ ] T044 [US3] Prerazporejanje z `ion-reorder-group` v isti strani, shranjeno prek `PUT /saved-links/order`; premik zapisa v drugo mapo prek urejevalnika — FR-032 (odvisno od T040, T043)

**Checkpoint**: mape delujejo, vrstni red preživi osvežitev, brisanje mape ne izgubi zapisov.

---

## Phase 6: User Story 4 - Popravim ali izbrišem zapis (Priority: P4)

**Goal**: urejanje vseh polj, brisanje, in ponovno branje strani na zahtevo — brez tega, da
bi samodejno branje prepisalo uporabnikov vnos.

**Independent Test**: quickstart.md §3.4 — tri poteze (popravek imena, osvežitev, brisanje).

### Tests for User Story 4

- [ ] T045 [P] [US4] Pogodbeni test `apps/api/tests/contract/saved-links/update.spec.ts`: `PATCH` z imenom postavi `titleSource: 'manual'`; `POST /refresh-metadata` brez `force` ročnega imena NE prepiše; s `force: true` ga prepiše; `DELETE` → `204`, nato `GET` → `404` — FR-014

### Implementation for User Story 4

- [ ] T046 [US4] Implementiraj `GET/PATCH/DELETE /saved-links/{linkId}` v `apps/api/src/modules/saved-links/router.ts`; sprememba `url` pomeni novo normalizacijo in nov `searchText`, metapodatkov pa NE prebere samodejno — pogodba, FR-014 (odvisno od T020)
- [ ] T047 [US4] Implementiraj `POST /saved-links/{linkId}/refresh-metadata` (z `force`) prek storitve iz T026 — FR-014 (odvisno od T026, T046)
- [ ] T048 [US4] Urejanje in brisanje v `apps/web/src/app/features/saved-links/link-editor.component.ts` + dejanji "osveži podatke strani" in "prevzemi ime s strani" (slednje pošlje `force: true`) — US4 scenariji 1–3 (odvisno od T046, T047, T032)

**Checkpoint**: zapis je mogoče popraviti, osvežiti in izbrisati; ročno ime je zaščiteno.

---

## Phase 7: User Story 5 - Vidim jih na nadzorni plošči (Priority: P5)

**Goal**: ploščica s 6 nazadnje shranjenimi in faviconi, ki jih streže naš strežnik.

**Independent Test**: quickstart.md §3.5 — vklop ploščice, klik, in omrežni dnevnik brez
klicev na tuje gostitelje.

### Tests for User Story 5

- [ ] T049 [P] [US5] Pogodbeni test `apps/api/tests/contract/saved-links/favicon.spec.ts`: `200` z `image/*` in `Cache-Control: private, max-age=604800`; zapis brez favicona → `404`; DVA zapisa istega gostitelja sprožita EN odhodni prenos (podtaknjen `fetch` klican enkrat) — FR-012, člen VIII

### Implementation for User Story 5

- [ ] T050 [US5] Implementiraj `apps/api/src/modules/saved-links/services/favicon.service.ts` prek `platform/cache/service.ts`, ključ `favicon:<gostitelj>`, TTL iz `SAVED_LINKS_FAVICON_TTL_SECONDS` — research.md §4 (odvisno od T001)
- [ ] T051 [US5] Implementiraj `GET /saved-links/{linkId}/favicon` (zapis mora biti uporabnikov; ob neuspehu `404`, ne `500`) v `apps/api/src/modules/saved-links/router.ts` — FR-012 (odvisno od T050, T020)
- [ ] T052 [P] [US5] Ustvari `apps/web/src/app/features/saved-links/tiles/saved-links-tile.component.ts`: 6 nazadnje shranjenih prek `GET /saved-links?sort=recent&limit=6`, klik odpre v novem zavihku z `rel="noopener noreferrer"` — FR-040, FR-050 (odvisno od T034)
- [ ] T053 [US5] Registriraj ploščico v `apps/web/src/app/shared/tiles/tile-registry.ts`: vnos `{ type: 'saved-links', component: SavedLinksTileComponent }` v `TILE_REGISTRY` in naslov `'Shranjeni linki'` v `TILE_TYPE_TITLES` — research.md §11 (odvisno od T052)
- [ ] T054 [P] [US5] Izris ikone po pravilu prednosti (uporabnikova ikona → favicon → `link-outline`) v seznamu in v ploščici — research.md §9 (odvisno od T051, T030)
- [ ] T055 [P] [US5] Enotski test `apps/web/tests/unit/tile-registry.spec.ts` (ali razširitev obstoječega): `getTileComponent('saved-links')` vrne komponento in `tileTypeTitle` slovenski naslov (odvisno od T053)

**Checkpoint**: ploščica je na voljo v razporeditvi; brskalnik ne kliče tujih gostiteljev.

---

## Phase 8: User Story 6 - Shranim link brez vmesnika (Priority: P6)

**Goal**: n8n zna z API ključem narediti vse, kar zna vmesnik.

**Independent Test**: quickstart.md §3.6 — `curl` z `X-API-Key` in ponovljen
`Idempotency-Key`.

### Tests for User Story 6

- [ ] T056 [P] [US6] Pogodbeni test `apps/api/tests/contract/saved-links/api-key.spec.ts`: klic z `X-API-Key` in obsegom uspe; brez obsega → `403`; ponovljen `POST` z istim `Idempotency-Key` vrne prvotni odgovor in NE ustvari drugega zapisa — člen III, FR-062

### Implementation for User Story 6

- [ ] T057 [US6] Preveri in po potrebi dopolni, da vse mutacijske poti modula tečejo skozi obstoječi `platform/idempotency/middleware.ts` in da so obsegi zahtevani na vsaki poti v `apps/api/src/modules/saved-links/router.ts` — FR-060, FR-061 (odvisno od T056)

**Checkpoint**: vsaka operacija vmesnika je izvedljiva tudi s HTTP klicem (SC-007).

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T058 [P] Integracijski test `apps/api/tests/integration/saved-links-isolation.spec.ts`: tuj zapis → `404`, tuja mapa → `404`, iskanje ne prečka meje uporabnika, dva uporabnika smeta imeti mapo z istim imenom — FR-006, vzorec 004
- [ ] T059 [P] Razširi `apps/api/tests/integration/tab-isolation.spec.ts`: `saved-links` se po enem vnosu v register pojavi v `GET /tabs`, v meniju in v spodnji vrstici — SC-005 iz 001, člen I
- [ ] T060 [P] Dodaj odsek o funkcionalnosti 008 v `README.md` (kaj je, kje so specifikacije) po vzorcu odsekov 001–006
- [ ] T061 [P] Dopolni vrstico za `nacrt/008-saved-links/spec.md` v tabeli vhodnega gradiva v `README.md`
- [ ] T062 Preveri SC-003 in SC-005 po quickstart.md §3.2 in §3.5 s ~100 zapisi (omrežni dnevnik brez tujih gostiteljev, iskanje pod 1 s)
- [ ] T063 Poženi `npm run typecheck`, `npm run lint`, `npm test` in `npm run build:web` — vsi štirje morajo biti čisti (Kakovostna vrata 1 in 2)
- [ ] T064 Zapiši izid preverjanja v `docs/acceptance-008.md` po vzorcu `docs/acceptance-005.md` (kaj je bilo preverjeno, s katerim ukazom, kaj je bilo najdeno)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: brez odvisnosti; vseh devet nalog je vzporednih
- **Foundational (Phase 2)**: potrebuje Phase 1 — BLOKIRA vse uporabniške zgodbe
- **US1 (Phase 3)**: potrebuje Phase 2. MVP.
- **US2 (Phase 4)**: potrebuje Phase 2 in `GET /saved-links` iz T029
- **US3 (Phase 5)**: potrebuje Phase 2; neodvisna od US2
- **US4 (Phase 6)**: potrebuje T026 (storitev metapodatkov) iz US1
- **US5 (Phase 7)**: potrebuje T034 (`sort=recent`) iz US2 za ploščico; favicon del je neodvisen
- **US6 (Phase 8)**: potrebuje vsaj eno mutacijsko pot, torej US1
- **Polish (Phase 9)**: potrebuje vse zgodbe, ki jih nameravamo izdati

### Within Each User Story

- Testi so napisani PRED implementacijo in morajo najprej pasti
- Domenske funkcije → modeli → storitve → endpointi → zasloni
- Zgodba je končana, preden se začne naslednja prioriteta

### Parallel Opportunities

- Phase 1: T001–T009 vse vzporedno (različne datoteke)
- Phase 2: T010–T019 vzporedno; T020–T021 zaporedno (ista datoteka oz. odvisnost)
- Znotraj zgodb: pogodbeni testi so vzporedni med sabo; zaslon je vedno za endpointom
- US3 in US4 lahko tečeta vzporedno z US2, če je ekipa večja od enega

---

## Parallel Example: Foundational (Phase 2)

```bash
# Čiste domenske funkcije in njihovi testi — nobena ne bere baze:
Task: "Implementiraj apps/api/src/modules/saved-links/domain/link-url.ts"
Task: "Implementiraj apps/api/src/modules/saved-links/domain/search-text.ts"
Task: "Implementiraj apps/api/src/modules/saved-links/domain/link-metadata.ts"

# Modela hkrati (različni datoteki):
Task: "Ustvari model savedLinks v apps/api/src/modules/saved-links/models/saved-link.model.ts"
Task: "Ustvari model savedLinkGroups v apps/api/src/modules/saved-links/models/saved-link-group.model.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 (Setup) → 2. Phase 2 (Foundational) → 3. Phase 3 (US1)
4. **USTAVI SE IN PREVERI**: quickstart.md §3.1, vseh pet primerov
5. Na tej točki je modul že uporaben: stran je mogoče shraniti in videti

### Incremental Delivery

1. Setup + Foundational → ogrodje stoji, zavihek je viden
2. US1 → shranjevanje deluje (MVP)
3. US2 → iskanje; od tu naprej je knjižnica uporabna tudi pri sto zapisih
4. US3 → mape in vrstni red
5. US4 → urejanje in brisanje
6. US5 → ploščica na nadzorni plošči
7. US6 → dostop za n8n (endpointi obstajajo že prej; ta faza to samo dokaže s testi)

### Notes

- `[P]` = druge datoteke, brez odvisnosti od nedokončanih nalog
- Vsaka zgodba je samostojno preverljiva po ustreznem odstavku quickstart.md §3
- Commit po vsaki nalogi ali smiselni skupini
- Kakovostna vrata se preverijo PRED zaključkom vsake naloge, ne šele v Phase 9
