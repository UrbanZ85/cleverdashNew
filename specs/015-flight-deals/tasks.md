---

description: "Task list for feature implementation"
---

# Tasks: Iskalnik letalskih ponudb — Leti (015)

**Vhod**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/openapi.yaml](contracts/openapi.yaml),
[quickstart.md](quickstart.md)

Oznaka `[P]` pomeni, da naloga ne blokira naslednje in bi lahko tekla vzporedno (druga datoteka,
brez odvisnosti). Oznaka `[USn]` veže nalogo na uporabniško zgodbo iz specifikacije.

**Testi niso neobvezni.** Kakovostna vrata ustave (točka 2) in SC-012 zahtevajo avtomatiziran
test za vsak scenarij iz naročila; seznam jih ne obravnava kot dodatek.

## Path Conventions

- zaledje: `apps/api/src/`, testi `apps/api/tests/`
- odjemalec: `apps/web/src/app/`, testi `apps/web/tests/`
- modul: `apps/api/src/modules/flight-deals/` in `apps/web/src/app/features/flight-deals/`

---

## Phase 1: Setup (Shared Infrastructure)

**Namen**: odvisnosti, okolje, nabor letališč in vpisi, brez katerih se zavihek ne pojavi.

- [X] T001 Dodaj odvisnosti v `apps/api/package.json`: `nodemailer` (^10.1), `croner` (^10.0); `geo-tz` (^8.1) kot devDependency; `npm install` v korenu
- [X] T002 [P] Dodaj spremenljivke iz research.md §15 (`FLIGHT_*`, `SMTP_SECURE`) s privzetki v `apps/api/src/platform/config/env.ts`; `FLIGHT_FAKE_PROVIDER_ENABLED=true` pri `NODE_ENV=production` mora `loadEnv` zavrniti (`superRefine`); prepiši jih v `.env.example` pod `# ─── Leti (015) ───`
- [X] T003 [P] Enotski test okolja v `apps/api/tests/unit/env.spec.ts`: privzetki `FLIGHT_SCHEDULER_TICK_SECONDS=60`, `FLIGHT_RYANAIR_ENABLED=false`, `SMTP_SECURE=false`; `FLIGHT_FAKE_PROVIDER_ENABLED=true` + `NODE_ENV=production` vrže napako z imenom spremenljivke
- [X] T004 [P] Napiši `apps/api/scripts/build-airports.mjs`: prenese OurAirports `airports.csv` in `countries.csv`, filtrira `type ∈ {large_airport, medium_airport}` ∧ `scheduled_service=yes` ∧ `iata_code≠''`, doda `tz` z `geo-tz`, zapiše `apps/api/src/modules/flight-deals/assets/airports.json` (oblika iz data-model.md); zaženi ga in commitaj JSON
- [X] T005 [P] Registriraj ikone `airplane-outline`, `trending-down-outline`, `trending-up-outline`, `mail-outline`, `globe-outline` v `apps/web/src/app/core/icons/register-icons.ts` in jih dodaj v `apps/web/tests/unit/icons.spec.ts` (seznam `FLIGHT_DEALS_ICONS` + `TAB_REGISTRY_ICONS`)
- [X] T006 [P] Dodaj obsege `flight-deals:read`, `flight-deals:write`, `flight-deals:share` v `BASE_USER_SCOPES` v `apps/api/src/platform/keycloak/role-mapping.ts` s komentarjem po vzorcu 013
- [X] T007 Dodaj vnos zavihka v `apps/api/src/platform/tabs/registry.ts`: `id: 'flight-deals'`, `title: 'Leti'`, `icon: 'airplane-outline'`, `route: '/flight-deals'`, `order: 12`, `requiredScopes: ['flight-deals:read']`, `enabled: true`
- [X] T008 [P] Dodaj cilj `specs/015-flight-deals/contracts/openapi.yaml → src/generated/flight-deals.d.ts` v `packages/contracts/scripts/generate.ts` in vrstico `npx --yes @redocly/cli lint specs/015-flight-deals/contracts/openapi.yaml` v `.github/workflows/ci.yml`

**Checkpoint**: `npm run typecheck` čist; `GET /tabs` vrne zavihek Leti navadnemu uporabniku.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Namen**: obsegi, varuh, modeli, nabor letališč v kodi, ogrodje usmerjevalnikov in strani.

**⚠️ Brez te faze ne sme začeti nobena zgodba.**

- [X] T009 [P] `apps/api/src/modules/flight-deals/scopes.ts`: `FLIGHT_DEALS_SCOPES = { read, write, share }`
- [X] T010 [P] `apps/api/src/modules/flight-deals/admin-guard.ts`: `requireFlightAdmin()` — `subjectType === 'user'` ∧ `scopes` vsebuje `admin`, en `403`; komentar, zakaj je kopija vzorca 014 (research.md §14)
- [X] T011 [P] `apps/api/src/modules/flight-deals/domain/airports.ts`: naloži `assets/airports.json` (enkrat, `readFileSync` + `import.meta.url`), `findAirport(iata)`, `searchAirports(q, limit)` z zlaganjem šumnikov (kopija logike `fold-text` za strežnik), `airportsNear(lat, lon, radiusKm)` s haversine, `listCountries()` z `Intl.DisplayNames('sl')`
- [X] T012 [P] Enotski test `apps/api/tests/unit/flight-deals/airports.spec.ts`: "trst"/"TRS"/"ronchi" najdejo TRS; radij 150 km od LJU vsebuje ZAG, TRS, VCE, TSF, GRZ, KLU z razdaljo; nabor ima `tz` za vsak zapis; LJU ima `Europe/Ljubljana`
- [X] T013 Modeli po data-model.md v `apps/api/src/modules/flight-deals/models/`: `flight-search-rule.model.ts`, `flight-offer.model.ts`, `flight-search-match.model.ts`, `flight-offer-history.model.ts`, `flight-search-run.model.ts`, `flight-notification.model.ts`, `flight-scheduler-settings.model.ts`, `flight-provider-status.model.ts` — z vsemi indeksi (unikatni, TTL) in komentarji, zakaj kateri
- [X] T014 [P] Dopolni `apps/api/tests/unit/no-owner-fields.spec.ts`: `FlightSearchRule` nosi `userId`; `FlightOffer` ga NE nosi; `FlightSearchMatch` nosi `ruleOwnerId` in ne `userId`
- [X] T015 [P] Integracijski test indeksov `apps/api/tests/integration/flight-deals/indexes.spec.ts` (vzorec `todos-indexes.spec.ts`): unikatni `identityKey`, `(ruleId, offerId)`, `slotKey`, `(recipientUserId, runId)`; TTL indeksi na `expiresAt` obstajajo
- [X] T016 Ogrodje usmerjevalnikov `apps/api/src/modules/flight-deals/router.ts` (`requireScopes(read)` na `/flight-deals/*`) in `admin.router.ts` (`requireFlightAdmin()` na `/flight-deals/admin/*`); vpni oba v `apps/api/src/main.ts` z dvema vrsticama po vzorcu 014 (komentar "015")
- [X] T017 [P] `apps/api/src/modules/flight-deals/flight-deals.audit.ts`: tanki ovoji `logger.info` za `flight.search.created|updated|deleted|shared|unshared`, `flight.run.started|finished|interrupted|cancelled`, `flight.notification.sent|failed|suppressed` — samo identifikatorji, nikoli e-naslovi
- [X] T018 [P] Pomočniki za pogodbene teste `apps/api/tests/contract/flight-deals/_helpers.ts`: `loginAs(app, 'a'|'b')` (vloga `cleverdash-user`), `loginAsAdmin`, `apiKeyFor(scopes)`, `seedRule(userId, overrides)`, `seedOffer(overrides)`, `seedMatch(rule, offer, changeType)`, `AUTH(token)`
- [X] T019 [P] Pogodbeni test dostopa `apps/api/tests/contract/flight-deals/access.spec.ts`: brez obsega `403`; navaden uporabnik na `/flight-deals/admin/scheduler` `403`; API ključ z vsemi obsegi na `/admin/*` `403` (FR-045); zavihek je v `GET /tabs` navadnega uporabnika
- [X] T020 Odjemalčevo ogrodje: `apps/web/src/app/features/flight-deals/flight-deals.model.ts` (tipi iz pogodbe), `flight-deals.api.ts` (HttpClient → Promise, `apiUrl`), prazne strani `flight-deals.page.ts`, `searches.page.ts`, `search-editor.page.ts`, `offer-detail.page.ts`, `shared-offers.page.ts`, `admin.page.ts` z `app-page-header`; poti v `apps/web/src/app/app.routes.ts`: `flight-deals` (`authGuard`, `tabGuard`), `flight-deals/searches`, `flight-deals/searches/:searchId`, `flight-deals/offers/:offerId`, `flight-deals/shared`, `flight-deals/admin` (samo `authGuard`); statične pred parametričnimi
- [X] T021 [P] Test poti `apps/web/tests/unit/flight-deals-routes.spec.ts` (regex nad `app.routes.ts`, vzorec `recipes-public-route.spec.ts`): koren ima `tabGuard`, podpoti ga nimajo, `searches/preview` ni pot odjemalca, `flight-deals/searches` je pred `flight-deals/searches/:searchId`

**Checkpoint**: zavihek se odpre na prazno stran; vsi `/flight-deals/*` zahtevajo obseg; admin poti zavračajo neadmina in API ključ.

---

## Phase 3: User Story 1 — Opišem, kaj iščem, in vidim, kaj bo sistem iskal (Priority: P1) 🎯 MVP

**Cilj**: CRUD iskanj z validacijo, predogled obdobja in kombinacij, iskalnik letališč (q in radij),
izolacija po uporabniku.

**Independent Test**: quickstart.md §3 — iskanje LJU+TRS → kamor koli, 22. 10.–1. 11. 2026, ±2, 3–5
nočitev, petek po 15:00 / nedelja; predogled 20. 10.–3. 11.; shranjeno z "še ni preverjeno";
negativni primeri zavrnjeni z razlago.

### Testi za US1

- [X] T022 [P] [US1] `apps/api/tests/unit/flight-deals/date-window.spec.ts`: fiksni datumi (okno = en dan); ±0/±1/±2/±3 in po meri 10 (okno ±N); obdobje 22. 10.–1. 11. 2026 ±2 → 20. 10.–3. 11.; `returnWithinWindow` true/false; rolling 6 mesecev od 31. 8. konča zadnji dan februarja; rolling čez novo leto; okno v preteklost se odreže na danes z opozorilom; trajanje, ki ne gre v okno → 0 kombinacij z opozorilom; vikend (odhod pet, povratek ned, 2–3 nočitve) da pravilno število parov; obdobje čez 25. 10. 2026 da poizvedbi za oktober in november
- [X] T023 [P] [US1] `apps/api/tests/unit/flight-deals/rule-validation.spec.ts`: `maxNights < minNights` → sporočilo o trajanju; `to < from`; `flexDays` −1 in 2,5 zavrnjena; neznano letališče; `countries` brez vrednosti; `fixed` z `returnDate: null` zahteva `minNights/maxNights: null`; `childrenAges` > 8 zavrnjen
- [X] T024 [P] [US1] `apps/api/tests/contract/flight-deals/searches-crud.spec.ts`: `POST` 201 z `preview`; `GET` seznam samo lastnikov; `PATCH` delni; `PATCH active:false`; `DELETE` 200 `{deleted:true}` in briše ujemanja; `Idempotency-Key` ponovitev vrne isti odgovor; presežena `FLIGHT_MAX_RULES_PER_USER` → 400
- [X] T025 [P] [US1] `apps/api/tests/contract/flight-deals/isolation.spec.ts`: uporabnik B na iskanju uporabnika A dobi `404` za GET/PATCH/DELETE/recipients/offers (FR-014, SC-005); admin z `X-Acting-User` vidi iskanja prevzete osebe
- [X] T026 [P] [US1] `apps/api/tests/contract/flight-deals/preview.spec.ts`: `POST /searches/preview` ne shrani ničesar, vrne okni, `dateCombinations`, `queries`, `warnings`; neveljaven vnos 400
- [X] T027 [P] [US1] `apps/api/tests/contract/flight-deals/reference.spec.ts`: `GET /airports?q=trst`, `?near=LJU&radiusKm=150`, `?near=home` brez nastavljenega doma → 400, z domom → razdalje; `GET /countries` razvrščeno po `sl`; dostopno z `requireScopes()` brez modularnega obsega
- [X] T028 [P] [US1] `apps/web/tests/unit/flight-deals-model.spec.ts`: `windowText` ("20. 10. – 3. 11. 2026"), `weekdayLabels` ([1,5] → "pon, pet"; [] → "kateri koli dan"), `flexPresetFor(10)` → 'custom', `toSearchInput(form)` pretvori `FormFieldValue` številke in prazne nize v `null`

### Izvedba US1

- [X] T029 [P] [US1] `apps/api/src/modules/flight-deals/domain/rule-input.ts`: Zod sheme `searchCreateSchema`, `searchPatchSchema` (vse neobvezno + `refine` vsaj eno polje), `searchQuerySchema`, `offersQuerySchema`, `airportsQuerySchema`; booleani kot `z.enum(['true','false'])`; konstante `MAX_*` iz env se podajo kot parameter
- [X] T030 [P] [US1] `apps/api/src/modules/flight-deals/domain/rule-validation.ts`: čiste funkcije pomena (`validateRule(input, airports) → string | null` s slovenskim stavkom), normalizacija IATA na velike črke, razvrščanje dni
- [X] T031 [P] [US1] `apps/api/src/modules/flight-deals/domain/date-window.ts`: `computeWindows(rule, now, originTz)`, `listDateCombinations(windows, rule)`, `monthsCovered(window)`, `buildPreview(rule, now, airports) → SearchPreview` (Luxon, brez `toISOString().split`)
- [X] T032 [US1] `apps/api/src/modules/flight-deals/services/rule-access.service.ts`: `requireOwnRule(userId, id)` (neveljaven ObjectId → 404; `findOne({_id, userId})` → 404), `visibleRuleIdsFor(userId)` (own + `recipients.userId`), `assertRoomForRule(userId, max)`
- [X] T033 [US1] `apps/api/src/modules/flight-deals/services/rule-response.service.ts`: `toSearchResponse(rule, now, airports, userSummaries)` z `preview`, `recipients` z imeni (`readUserSummaries`), `offerCount` (countDocuments `active` matches), `lastCheck`
- [X] T034 [US1] Poti v `router.ts`: `GET/POST /flight-deals/searches`, `POST /flight-deals/searches/preview` (PRED `/:searchId`), `GET/PATCH/DELETE /flight-deals/searches/:searchId`; lastnik = `req.auth.subjectId` ali `resolveAutomationOwnerUserId()` za API ključ (vzorec `actorUserId` iz 013); audit dogodki; `DELETE` briše tudi `FlightSearchMatch` iskanja
- [X] T035 [US1] Referenčne poti v `router.ts`: `GET /flight-deals/airports` (q | near=IATA|home prek `resolveCommutePlaces(userId)` iz `platform/settings/commute.service.ts`), `GET /flight-deals/countries`; `requireScopes()` brez modularnega obsega
- [X] T036 [US1] `apps/web/src/app/features/flight-deals/airport-picker.component.ts`: `ion-searchbar` → `api.airports({q})`, čipi izbranih z `close-circle`, način "v radiju N km od …" (izbira izhodišča: letališče iz nabora ali "Doma"), meja 10, vzorec `meteo-section`
- [X] T037 [US1] `apps/web/src/app/features/flight-deals/search-editor.page.ts`: template-driven obrazec nad navadnim objektom (`emptySearchForm()`), razdelki Odhod / Cilj (`ion-segment` any|countries|airports, `ion-select multiple` za države) / Datumi (`ion-segment` fixed|range|rolling, `ion-input type="date"`, `type="number"` za mesece) / Fleksibilnost (pilule ±0..±3, Po meri → `type="number"`) / Trajanje / Dnevi in ure (pilule ISO 1–7, `type="time"`, vzorec `profile-form`) / Potniki / Cena / Napredno (prevozniki, prestopi, prtljaga, valuta); živ predogled prek `api.preview()` z debounce 400 ms; `:searchId='new'`; eno sporočilo napake; `confirmDelete` prek `AlertController`
- [X] T038 [US1] `apps/web/src/app/features/flight-deals/searches.page.ts`: seznam iskanj (`ion-list`), stanje (aktivno / neaktivno / še ni preverjeno / preverjeno ob … / vir ni dosegljiv), gumb Novo, klik odpre urejevalnik; `ionViewWillEnter` reload
- [X] T039 [US1] Pomoč: vnosi `flightDeals.search`, `flightDeals.flex`, `flightDeals.destination` v `apps/web/src/app/shared/help/help-topics.ts` (test `help-topics.spec.ts` že varuje obliko)

**Checkpoint**: quickstart.md §3 prestane; `npm test --workspace apps/api -- flight-deals` zelen za US1.

---

## Phase 4: User Story 2 — Sistem po urniku preveri ponudbe in jih vidim (Priority: P1)

**Cilj**: adapterji virov, deduplicirane poizvedbe prek predpomnilnika, zagon, ki ponudbe shrani in
poveže z iskanji, pregled ponudb in nadzorna plošča modula. Ročni zagon admina je tu minimalen
(`POST /admin/runs`), celoten urnik pride v US6.

**Independent Test**: quickstart.md §4 — z aktivnim iskanjem in testnim virom ročni zagon napolni
glavno stran s ponudbami, pri vsaki vir, cena, čas podatka; iskanje ima čas zadnjega uspešnega
pregleda in izide po virih; let v petek ob 14:30 ni med ponudbami, ob 15:10 je.

### Testi za US2

- [X] T040 [P] [US2] `apps/api/tests/unit/flight-deals/rule-matcher.spec.ts`: ura odhoda po lokalnem času LJU (14:30 ne, 15:10 da); povratek po coni cilja; dnevi v tednu ISO (nedelja = 7; sobota 00:10 lokalno ni petek); nočitve po koledarskih dneh čez 25. 10. 2026 ostanejo 3; `minStayHours` kot razlika instantov; cena na osebo 250/2 > 120 ne, 230/2 da; `maxStops`; prevozniki; izključene države/letališča; druga valuta ne ustreza cenovni meji
- [X] T041 [P] [US2] `apps/api/tests/unit/flight-deals/query-plan.spec.ts`: dve iskanji z isto kombinacijo dasta en `queryKey` (SC-007); 5 letališč × any × 6 mesecev = 30 poizvedb pri Travelpayouts, 5 pri Ryanairu; meja `FLIGHT_MAX_QUERIES_PER_RULE` da `truncated`; neaktivno iskanje ni v planu
- [X] T042 [P] [US2] `apps/api/tests/unit/flight-deals/normalization.spec.ts`: Travelpayouts odgovor (primer iz research.md §4) → normalizirana ponudba z UTC instantom iz `+02:00`, `stops` iz `transfers`, cena × potniki z `priceIncludes`; Ryanair `roundTripFares` primer → ponudba z instantom iz lokalnega časa in cone letališča; cena brez valute / negativna / 0 / brez `departure_at` → zavržena in šteta kot `incomplete`; 1000 vrstic → `incomplete`
- [X] T043 [P] [US2] `apps/api/tests/unit/flight-deals/identity.spec.ts`: ista vozovnica po dveh poteh → en ključ; druga sestava potnikov ali valuta → drug ključ; cena in čas pristanka ne vplivata; `providerId` vpliva
- [X] T044 [P] [US2] `apps/api/tests/unit/flight-deals/booking-url.spec.ts`: povezava na gostitelja vira ostane, tuj gostitelj → `null`, `javascript:` → `null`
- [X] T045 [P] [US2] `apps/api/tests/integration/flight-deals/cache-dedupe.spec.ts` (fetch stub po vzorcu `meteo.spec.ts`): dve iskanji dveh uporabnikov za isto kombinacijo → en klic `fetch`; drugi zagon v TTL → nič klicev; vsak dobi samo ponudbe po svojih pravilih (FR-024)
- [X] T046 [P] [US2] `apps/api/tests/integration/flight-deals/provider-outage.spec.ts`: vir 503 → izid `unreachable`, obstoječe ponudbe ostanejo `available`, `lastCheck` iskanja to pove, zagon `partial`; 503 nato 200 (retry) → `ok`, ponudbe primerjane enkrat; 429 → `rateLimited` brez ponovitve; uspešen odgovor brez prej vrnjene ponudbe → `unavailable` (FR-028)
- [X] T047 [P] [US2] `apps/api/tests/contract/flight-deals/offers.spec.ts`: `GET /offers?scope=own|shared|all`, `sort`, `changed=true`, `includeUnavailable`, `limit` + `total`; `GET /offers/:id` 404 za ponudbo brez vidnega ujemanja; `GET /searches/:id/offers`; `GET /overview` oblika; `GET /providers` brez `lastError`
- [X] T048 [P] [US2] `apps/api/tests/contract/flight-deals/run-manual.spec.ts`: `POST /admin/runs` 202, nato ponovni klic 409 med tekom; zagon s `FakeProvider` konča `succeeded` s števci; `FLIGHT_FAKE_PROVIDER_ENABLED` prisoten samo v test env

### Izvedba US2

- [X] T049 [P] [US2] `apps/api/src/modules/flight-deals/domain/rule-matcher.ts`: `offerMatchesRule(offer, rule, now, airports) → { ok: true } | { ok: false, reason }`
- [X] T050 [P] [US2] `apps/api/src/modules/flight-deals/domain/identity.ts`: `canonicalIdentity(offer)`, `identityKey(offer)` (sha256 → 32 hex)
- [X] T051 [P] [US2] `apps/api/src/modules/flight-deals/domain/booking-url.ts`: `sanitizeBookingUrl(url, allowedHosts)`
- [X] T052 [P] [US2] `apps/api/src/modules/flight-deals/domain/query-plan.ts`: `buildQueryPlan(rules, providers, now, airports, limits) → { queries: Map<queryKey, Query>, perRule: Map<ruleId, { queryKeys, truncated }> }`
- [X] T053 [US2] `apps/api/src/modules/flight-deals/providers/types.ts`: `FlightProvider` vmesnik (`id`, `label`, `official`, `notice`, `dailyRunLimit`, `isEnabled(env)`, `supports(query)`, `request(query, env) → SourceRequest`, `parse(body, query, airports) → ProviderResult`), `ProviderResult = { outcome, offers: NormalizedOffer[], incompleteCount, message? }`, `NormalizedOffer`
- [X] T054 [US2] `apps/api/src/modules/flight-deals/providers/travelpayouts.provider.ts` po research.md §4: `prices_for_dates`, `X-Access-Token` v glavi, `destination` izpuščen pri any/countries, `one_way=false` pri povratnem, `direct`, `currency` male črke, `limit=1000`; razčlenitev z odmikom; cena × potniki; `priceIncludes`; `link` → `https://www.aviasales.com` + link (+ `&marker=` če nastavljen); `429` → `rateLimited`; `success:false` → `unreachable`
- [X] T055 [US2] `apps/api/src/modules/flight-deals/providers/ryanair.provider.ts` po research.md §5: `roundTripFares`/`oneWayFares` z `arrivalAirportIataCode`/`arrivalCountryCode`, `durationFrom/To`, `adultPaxCount`, `priceValueTo`; lokalni čas + cona letališča; `User-Agent: CleverDash/<ver> (+PUBLIC_BASE_URL)`; `official: false`, `notice`, `dailyRunLimit: 2`; `isEnabled` = `FLIGHT_RYANAIR_ENABLED`
- [X] T056 [P] [US2] `apps/api/src/modules/flight-deals/providers/wizzair.provider.ts` in `easyjet.provider.ts`: `supports → false`, `parse` nikoli; `notice` s sklicem na člen XII; `isEnabled → false`
- [X] T057 [P] [US2] `apps/api/src/modules/flight-deals/providers/fake.provider.ts`: scenarij `LJU→STN` 120 → 89 → 110 po zaporednih zagonih (števec v modulu, `resetFakeProviderForTests`), petkov let 14:30 in 15:10 za test ure, ponudba, ki v tretjem zagonu izgine (UNAVAILABLE); `isEnabled` = `FLIGHT_FAKE_PROVIDER_ENABLED`; `label: 'Testni vir (izmišljeni podatki)'`; ključ predpomnilnika nosi števec zagona
- [X] T058 [US2] `apps/api/src/modules/flight-deals/providers/index.ts`: `FLIGHT_PROVIDERS` seznam, `enabledProviders(env)`, `providerById`
- [X] T059 [P] [US2] `apps/api/src/modules/flight-deals/services/concurrency.ts`: `createSemaphore(n)`, `withDelay(ms)` za Ryanair
- [X] T060 [US2] `apps/api/src/modules/flight-deals/services/provider-runner.service.ts`: `runQueries(plan, env, logger, runCtx)` → za vsak `queryKey` prek `getOrRefresh` (`flight:<provider>:<hash>`, `FLIGHT_PROVIDER_CACHE_SECONDS`), semafor, `AbortSignal.timeout`, retry 5xx/omrežje (2 s, 8 s), `stale` → `unreachable`, `CacheMissError` → `unreachable`; posodablja `FlightProviderStatus` (uspeh, napaka, `requestsToday`); dnevna meja → `rateLimited` brez klica; šteje `providerRequests` (dejanske klice) in `queries`
- [X] T061 [US2] `apps/api/src/modules/flight-deals/services/reconcile.service.ts`: `reconcileRun(run, plan, results, rules, airports, now)` → upsert `FlightOffer` po `identityKey` (`lastQueryKey`, `expiresAt`), `FlightSearchMatch` upsert po `(ruleId, offerId)` (NEW ob prvem), `stale` za ujemanja, ki pravilom ne ustrezajo več, `unavailable` samo za ponudbe iz `ok` poizvedb, ki jih ni več; posodobi `rule.lastCheck` in `lastSuccessfulCheckAt`; vrne števce (cena/zgodovina pride v US3 — tu samo `price` posodobitev brez `changeType` logike ali z `UNCHANGED/NEW`)
- [X] T062 [US2] `apps/api/src/modules/flight-deals/services/run-executor.service.ts`: `executeRun(runId, env, logger, now)` — prevzem `queued → running`, naloži aktivna iskanja, plan, runner, reconcile; `heartbeatAt` po vsakem iskanju; `cancelRequested` med iskanji → `cancelled`; izbrisano iskanje preskoči; `errors[]` ≤ 100; konča `succeeded|partial|failed`; audit
- [X] T063 [US2] `apps/api/src/modules/flight-deals/services/offer-query.service.ts`: `listOffers(userId, query)` (own: `ruleOwnerId`; shared: `ruleId ∈ recipient rules`; `changed`, `sort`, `includeUnavailable`, `limit` + `total`), `getOfferDetail(userId, offerId)` (404 brez vidnega ujemanja), `toOfferResponse` z `matches[]` (owner samo pri deljenem), `pricePerPerson`, `change` (null brez zgodovine), letališči iz nabora
- [X] T064 [US2] Poti v `router.ts`: `GET /flight-deals/offers`, `GET /flight-deals/offers/:offerId`, `GET /flight-deals/searches/:searchId/offers`, `GET /flight-deals/overview`, `GET /flight-deals/providers`
- [X] T065 [US2] Minimalni admin v `admin.router.ts`: `POST /flight-deals/admin/runs` (ustvari `queued` z `slotKey: manual:<id>`, 409 če `queued|running` obstaja, `requestedBy = req.actor`, takoj `void executeRun`), `GET /flight-deals/admin/runs`, `GET /flight-deals/admin/runs/:runId`
- [X] T066 [US2] `apps/web/src/app/features/flight-deals/offer-card.component.ts`: letališči, prevoznik, datumi/ure v lokalnem času (`Intl.DateTimeFormat('sl-SI', { timeZone })`), nočitve, cena, `priceIncludes`, značka vira (`providerOfficial:false` → `ion-badge color="warning"` "neuradni vir"), čas podatka, povezava do rezervacije (`target=_blank rel=noopener`), oznaka ujemanja; mesto za `~~stara~~` in barvo iz US3
- [X] T067 [US2] `apps/web/src/app/features/flight-deals/flight-deals.page.ts`: `GET /overview` → razdelki "Moja iskanja" (stanje, zadnji pregled), "Nove ponudbe", "Spremembe cen", "Najcenejše"; filter po iskanju (čipi), `ion-select` razvrščanje; "… in še N"; zadnji zagon namestitve; gumb Novo iskanje; povezava Administracija samo pri `scopes.includes('admin')`; `ion-refresher`
- [X] T068 [US2] `apps/web/src/app/features/flight-deals/admin.page.ts` (del za US2): gumb **Preveri zdaj**, seznam zagonov s stanjem in števci, `409` prikaže "eno preverjanje že teče"; ostalo v US6

**Checkpoint**: quickstart.md §4 prestane s `FakeProvider`; SC-007 dokazan v `cache-dedupe.spec.ts`.

---

## Phase 5: User Story 3 — Vidim, kako se je cena spreminjala (Priority: P2)

**Cilj**: zgodovina cen, vrste sprememb, prikaz prečrtane stare in barvne nove cene, graf.

**Independent Test**: quickstart.md §5 — trije zagoni s testnim virom dajo NOVO → −31 € (−25,8 %)
zeleno → +21 € (+23,6 %) rdeče; graf s tremi točkami; UNAVAILABLE samo ob potrjeni odsotnosti.

### Testi za US3

- [X] T069 [P] [US3] `apps/api/tests/unit/flight-deals/price-change.spec.ts`: 120 → 89 = PRICE_DOWN, −31, −25,8; 89 → 110 = PRICE_UP, +21, +23,6; enako = UNCHANGED; brez prejšnje = NEW brez `previousPrice`; druga valuta → ne primerja (NEW z opozorilom); zaokroževanje odstotka na eno decimalko
- [X] T070 [P] [US3] `apps/api/tests/integration/flight-deals/price-history.spec.ts`: trije zagoni s `FakeProvider` → tri vrstice `FlightOfferHistory` (NEW, PRICE_DOWN, PRICE_UP), `offer.previousPrice` je zadnja drugačna, `GET /offers/:id` vrne `history` naraščajoče in `change`; `UNCHANGED` zagon doda točko brez `change` oznake; zgodovina ima `expiresAt` = `checkedAt` + 180 dni
- [X] T071 [P] [US3] `apps/web/tests/unit/flight-deals-model.spec.ts` (dopolnitev): `formatPrice(89, 'EUR')` → "89 €" z decimalno vejico; `changeText({type:'PRICE_DOWN', absolute:-31, percent:-25.8})` → "−31 € (−25,8 %)"; `changeColor` → success/danger/null; `chartPoints(history)` preskoči `UNAVAILABLE` točke kot vrzeli

### Izvedba US3

- [X] T072 [P] [US3] `apps/api/src/modules/flight-deals/domain/price-change.ts`: `classifyChange(prev, next) → { type, absolute, percent } | { type: 'NEW' }`, `percentChange`
- [X] T073 [US3] Dopolni `reconcile.service.ts`: ob upsertu ponudbe izračunaj `changeType` iz `price-change.ts`, posodobi `previousPrice`, `lastChangeType`, zapiši `FlightOfferHistory` (tudi UNCHANGED in UNAVAILABLE z `price: null`), na ujemanju `lastChangeType/lastChangeAt` (NEW ima prednost pred PRICE_* za iskanje, ki ponudbo vidi prvič); števci `priceDrops/priceRises/unavailable`
- [X] T074 [US3] Dopolni `offer-query.service.ts`: `getOfferDetail` doda `history[]`; `sort=change` razvrsti po največji pocenitvi (`absolute` naraščajoče)
- [X] T075 [P] [US3] `apps/web/src/app/features/flight-deals/price-chart.component.ts`: Chart.js ovoj po research.md §13 (line, `animation:false`, `spanGaps:false`, paleta za temi iz `ThemeService`, oznake vnaprej oblikovani datumi), `ngOnDestroy` destroy
- [X] T076 [US3] `apps/web/src/app/features/flight-deals/offer-detail.page.ts`: `app-page-header` z `backRoute`, `offer-card` v polnem načinu, zgodovina kot graf + tabela (čas, cena, sprememba), ujemanja (katera iskanja, pri deljenih lastnik), povezava do rezervacije
- [X] T077 [US3] Dopolni `offer-card.component.ts`: `~~stara cena~~` (`<s>`), nova cena `ion-text color="success"` pri PRICE_DOWN / `"danger"` pri PRICE_UP, razlika "−31 € (−25,8 %)", značka NOVO (`ion-badge color="primary"`), brez primerjave kadar `change: null`, značka "ni več na voljo" (`medium`)

**Checkpoint**: quickstart.md §5 prestane; US1–US3 skupaj so uporaben modul brez e-pošte.

---

## Phase 6: User Story 4 — Izvem po e-pošti, kadar se kaj zgodi (Priority: P2)

**Cilj**: skupna poštna storitev, outbox, en zbirni dopis na prejemnika na zagon, nikoli brez
sprememb ali ob neuspehu, varno ponavljanje.

**Independent Test**: quickstart.md §6 — po prvem zagonu en dopis z NOVO postavkami; drugi zagon
brez sprememb nič; pocenitev → en dopis s prečrtano staro in zeleno novo; napačno SMTP geslo →
`pending` s poskusom, po popravku poslano enkrat; brez `SMTP_HOST` → `suppressed`.

### Testi za US4

- [X] T078 [P] [US4] `apps/api/tests/unit/flight-deals/email-template.spec.ts`: `renderDigest` vsebuje naziv iskanja, letališči, prevoznika, datume/ure s cono, trajanje, potnike, ceno, `<s>` staro ceno, barvi `#1a7f4b`/`#c02626`, oznake NOVO/POCENITEV/PODRAŽITEV, povezavo do rezervacije in `PUBLIC_BASE_URL/flight-deals/offers/<id>`, čas preverjanja; `text` različica brez HTML; tikanje; brez e-naslova prejemnika v telesu
- [X] T079 [P] [US4] `apps/api/tests/unit/platform/mailer.spec.ts` (nodemailer mockan z `vi.mock`): `isEmailConfigured` brez `SMTP_HOST` false; `sendEmail` posreduje `host/port/secure/auth`; napaka transporta → `{ ok: false, permanent: false }`; `EAUTH` → `permanent: true`
- [X] T080 [P] [US4] `apps/api/tests/integration/flight-deals/notification-outbox.spec.ts`: prvi zagon → en `FlightNotification` na prejemnika, `sent`, `sendMail` klican enkrat z osmimi postavkami; drugi zagon brez sprememb → nič novih zapisov; zagon z `unreachable` virom → nič; `sendMail` zavrne → `pending`, `attemptCount 1`, `nextAttemptAt` +60 s; naslednji tik po času → `sent`, `sendMail` skupaj dvakrat, en dopis (SC-004); pet neuspehov → `failed`; brez `SMTP_HOST` → `suppressed: smtp-not-configured`; `sending` starejši od stale → nazaj v `pending`
- [X] T081 [P] [US4] `apps/api/tests/integration/flight-deals/dedupe.spec.ts`: dve iskanji istega uporabnika z isto ponudbo → v dopisu enkrat z obema nazivoma (FR-034); ponudba, ki ob sestavljanju ne ustreza več (cena čez mejo) → izpuščena (FR-036); iskanje izbrisano med zagonom → brez postavk, brez napake

### Izvedba US4

- [X] T082 [P] [US4] `apps/api/src/platform/email/mailer.service.ts`: `isEmailConfigured(env)`, `sendEmail(env, { to, subject, html, text }) → { ok: true, messageId } | { ok: false, error, permanent }`, lazy `createTransport({ host, port, secure: SMTP_SECURE, auth })`, `connectionTimeout 15 s`, `resetMailerForTests()`; komentar, zakaj `platform/` (research.md §9)
- [X] T083 [P] [US4] Dodaj `readUserEmails(userIds) → Map<string, { email, displayName }>` v `apps/api/src/platform/users/directory.service.ts` s komentarjem, da je edina pot do celega naslova in NI v nobenem usmerjevalniku
- [X] T084 [P] [US4] `apps/api/src/modules/flight-deals/domain/email-template.ts`: `renderDigest(items, ctx) → { subject, html, text }` z inline slogi; `formatMoneySl`, `formatLocalDateTime(instant, tz)`; čista funkcija
- [X] T085 [US4] `apps/api/src/modules/flight-deals/services/notification-builder.service.ts`: `buildNotificationsForRun(run, changes, rules, now)` — za vsak prejemnik (lastnik + `recipients.notify`) zberi postavke NEW/PRICE_DOWN/PRICE_UP, dedupe po `offerId` z združenimi iskanji, `insertOne` z unikatnim `(recipientUserId, runId)` (E11000 → preskoči), `status: pending`, `nextAttemptAt: now`; brez postavk → nič; posodobi `run.counters.notificationsPending`
- [X] T086 [US4] `apps/api/src/modules/flight-deals/services/notification-sender.service.ts`: `processNotificationOutbox(env, logger, now)` — vrni `sending` starejše od `FLIGHT_RUN_STALE_MINUTES` v `pending`; prevzemi `pending` z `nextAttemptAt <= now` (`findOneAndUpdate` → `sending`, `$inc attemptCount`); ponovno preveri postavke (iskanje obstaja, aktivno, prejemnik še na seznamu ali lastnik, `offerMatchesRule`); prazno → `suppressed: no-items`; brez pošte → `suppressed: smtp-not-configured`; brez naslova → `suppressed: no-email`; `sendEmail` → `sent` + `messageId` ali `pending` z backoff `[60,300,900,3600]` / `failed` po 5 ali `permanent`; posodobi `run.counters.notifications*`; audit
- [X] T087 [US4] Poveži v `run-executor.service.ts`: po `reconcile` pokliči `buildNotificationsForRun`; `cancelled` zagon obvestil NE sestavi; po koncu zagona takoj `processNotificationOutbox` (ne čaka tika)
- [X] T088 [US4] `GET /flight-deals/admin/notifications` v `admin.router.ts` (filter `status`, `runId`, `limit`; prejemnik z `readUserSummaries` → ime + `emailHint`) in `GET /flight-deals/admin/providers` z `email.configured`
- [X] T089 [US4] Dopolni `admin.page.ts`: razdelek Obvestila (seznam z stanjem, razlogom zadržanja, poskusi, zadnjo napako) in opozorilo "E-pošta ni nastavljena" pri `email.configured: false`

**Checkpoint**: quickstart.md §6 prestane; SC-003 in SC-004 dokazana v testih.

---

## Phase 7: User Story 5 — Obvestila delim z izbranimi osebami (Priority: P2)

**Cilj**: prejemniki pri iskanju, Deljene ponudbe, preklic.

**Independent Test**: quickstart.md §7 — lastnik doda prejemnika; oba prejmeta dopis; prejemnik vidi
ponudbo v Deljene ponudbe brez kriterijev; `PATCH` kot prejemnik → 404; po odstranitvi ne prejme
dopisa in ponudb ne vidi.

### Testi za US5

- [X] T090 [P] [US5] `apps/api/tests/contract/flight-deals/sharing.spec.ts`: `PUT /recipients/:userId` doda (idempotentno, `notify`), lastnik sam → 400, neprijavljena oseba → 400, meja → 400, brez `share` obsega → 403; `DELETE` idempotenten; prejemnik `GET /offers?scope=shared` vidi ponudbe z `owner` in brez konfiguracije, `GET /searches/:id` → 404, `PATCH` → 404; po `DELETE` prejemnik ne vidi več ničesar (FR-042)
- [X] T091 [P] [US5] Dopolni `notification-outbox.spec.ts`: prejemnik dobi lasten dopis; po odstranitvi med zagonom in pošiljanjem postavke izpadejo; oseba, ki je prejemnik pri dveh iskanjih dveh lastnikov → en dopis z ločenima postavkama

### Izvedba US5

- [X] T092 [US5] Poti `PUT/DELETE /flight-deals/searches/:searchId/recipients/:userId` v `router.ts` (`requireScopes(share)`), atomarni `findOneAndUpdate` po vzorcu `todos/services/sharing.service.ts` (posodobi ali `$push` z varovalom `recipients.userId $ne` in `recipients.<MAX-1> $exists:false`), `isShareableUser`, audit `shared|unshared`
- [X] T093 [US5] `apps/web/src/app/features/flight-deals/recipients-dialog.component.ts`: `ion-modal` po vzorcu `recipe-share-dialog`, seznam prejemnikov (ime, začetnice, `notify` toggle, odstrani), dodajanje prek `UsersApi.list({ query })`, takojšnji API klici, `changed` output
- [X] T094 [US5] V `search-editor.page.ts` vrstica "Prejemniki obvestil: Nihče / 2 osebi" z gumbom, ki odpre dialog (samo pri shranjenem iskanju — pri `new` besedilo "Najprej shrani iskanje")
- [X] T095 [US5] `apps/web/src/app/features/flight-deals/shared-offers.page.ts`: `GET /offers?scope=shared` razvrščeno po iskanju → skupine z nazivom iskanja in imenom lastnika, `offer-card` brez kriterijev; prazno stanje "Nihče še ne deli ponudb s tabo."
- [X] T096 [US5] Pomoč `flightDeals.sharing` v `help-topics.ts`

**Checkpoint**: quickstart.md §7 prestane.

---

## Phase 8: User Story 6 — Administrator določa urnik in vidi, kaj se je zgodilo (Priority: P2)

**Cilj**: tik, termini, nastavitve urnika, prekinitev, dohitevanje, stanje virov.

**Independent Test**: quickstart.md §8 — preset da izraz in naslednji termin; neveljaven izraz
zavrnjen; `*/2 * * * *` sproži zagon brez restarta; sočasen ročni zagon 409; restart med zagonom →
`interrupted`, termin dohiten, brez dvojnih dopisov.

### Testi za US6

- [X] T097 [P] [US6] `apps/api/tests/unit/flight-deals/schedule-slots.spec.ts`: `validateCron('0 25 * * *')` → napaka s sporočilom; 6 polj zavrnjeno (`5-part`); `nextRun('0 6 * * *', 'Europe/Ljubljana', 2026-10-24T20:00Z)` = 25. 10. 2026 06:00 lokalno (05:00Z po prehodu); `latestDueSlot` vrne zadnji zapadli, ne vseh; nič, če `lastSlotAt` že pokriva; preseti → izrazi; `slotKey` format
- [X] T098 [P] [US6] `apps/api/tests/integration/flight-deals/run-concurrency.spec.ts`: dva sočasna `runFlightTick(now)` ustvarita EN zagon (E11000); `queued` prevzame samo eden; ročni zagon med `running` → 409; `cancelRequested` ustavi po tekočem iskanju → `cancelled`, brez obvestil
- [X] T099 [P] [US6] `apps/api/tests/integration/flight-deals/run-interrupted.spec.ts`: zagon `running` s starim `heartbeatAt` → ob tiku `interrupted`; termin, ki ga pokriva, se ne ponovi; naslednji termin se izvede; obvestila prekinjenega zagona niso poslana dvakrat (zapisi, ki so že `sent`, ostanejo); `pending` zapisi se pošljejo naprej
- [X] T100 [P] [US6] `apps/api/tests/contract/flight-deals/admin.spec.ts`: `GET/PUT /admin/scheduler` (preset → izraz, `custom` zahteva izraz, neveljaven → 400, `nextRunAt`/`nextRunLocal`, `updatedBy`); izklopljen → `nextRunAt: null`, tik ne ustvari zagona, ročni zagon deluje; `POST /runs/:id/cancel` idempotenten, končan → 409; `GET /admin/providers` z `lastError`, `requestsToday`, `dailyLimit`; `X-Acting-User` ne spremeni admin odgovorov; API ključ → 403
- [X] T101 [P] [US6] Dopolni `provider-outage.spec.ts`: Ryanair z `dailyRunLimit: 2` v tretjem zagonu istega dne vrne `rateLimited` brez `fetch` klica

### Izvedba US6

- [X] T102 [P] [US6] `apps/api/src/modules/flight-deals/domain/schedule-slots.ts`: `SCHEDULE_PRESETS`, `validateCron(expr) → string | null` (`CronPattern`, `mode: '5-part'`, slovensko sporočilo), `nextRun(expr, tz, after)` (`new Cron(expr, { timezone, paused: true })`), `latestDueSlot(expr, tz, now, lastSlotAt)`, `slotKeyFor(slot, tz)`
- [X] T103 [US6] `apps/api/src/modules/flight-deals/services/scheduler-settings.service.ts`: `getOrCreateSchedulerSettings()` (privzeto `0 6,18 * * *`, `Europe/Ljubljana`, `enabled: true`), `updateSchedulerSettings(input, actorId)`, `toSchedulerResponse` z `nextRunAt`, `nextRunLocal`, `presets`, `updatedBy` (summary)
- [X] T104 [US6] `apps/api/src/modules/flight-deals/services/tick.ts`: `runFlightTick(env, logger, now = new Date())` — (1) `running` s starim `heartbeatAt` → `interrupted` + audit; (2) nastavitve → `latestDueSlot` → `insertOne` zagona s `slotKey` (E11000 → preskoči) + `lastScheduledSlotAt`; (3) `executeRun` za en `queued`; (4) `processNotificationOutbox`; `tickInFlight` varovalka; `startFlightDealsScheduler(env, logger)` (`setInterval(FLIGHT_SCHEDULER_TICK_SECONDS).unref()`, takoj prvi tik), `stopFlightDealsSchedulerForTests()`; vpni v `main.ts` pod `if (env.NODE_ENV !== 'test')`
- [X] T105 [US6] Admin poti v `admin.router.ts`: `GET/PUT /flight-deals/admin/scheduler`, `POST /flight-deals/admin/runs/:runId/cancel`, `GET /flight-deals/admin/providers` (status + `official`, `enabled`, `requestsToday`, `dailyLimit`, `email.configured`)
- [X] T106 [US6] Dopolni `admin.page.ts`: razdelek Urnik (`ion-toggle` vklop, `ion-select` preset, `ion-input` izraz pri custom, cona, naslednji termin v Europe/Ljubljana, Shrani), Zagoni (seznam, podrobnosti z napakami, Prekini pri tekočem), Viri (ime, uraden/neuraden značka, vklopljen, zadnji uspeh, zadnja napaka, zagoni danes / meja); osveževanje na 15 s med `running` prek `ForegroundRefreshService`
- [X] T107 [US6] Pomoč `flightDeals.scheduler`, `flightDeals.sources` v `help-topics.ts`

**Checkpoint**: quickstart.md §8 prestane; SC-006 (sprememba brez restarta) dokazana v `admin.spec.ts` + `run-concurrency.spec.ts`.

---

## Phase 9: User Story 7 — Vse dobim tudi brez vmesnika (Priority: P3)

**Cilj**: API ključ z obsegi modula, pogodba usklajena z izvedbo.

**Independent Test**: quickstart.md §9 — ključ z `read` bere, z `write` ustvari, brez `share` ne doda
prejemnika, admin poti 403.

- [X] T108 [P] [US7] `apps/api/tests/contract/flight-deals/api-key.spec.ts`: ključ z `flight-deals:read` bere iskanja/ponudbe lastnika avtomatizacije; `write` ustvari; brez `share` → 403 na recipients; `admin/*` → 403 ne glede na obsege; `Idempotency-Key` ponovitev
- [X] T109 [US7] Pogodbeni test oblike `apps/api/tests/contract/flight-deals/contract-shape.spec.ts`: odgovori `GET /overview`, `GET /searches/:id`, `GET /offers/:id`, `GET /admin/scheduler`, `GET /admin/runs/:id` imajo VSA `required` polja iz `contracts/openapi.yaml` (preberi YAML z `js-yaml`, preveri ključe) — pogodba in koda se ne smeta raziti (vrata 3)
- [X] T110 [US7] `npm run generate:contracts` in commit `packages/contracts/src/generated/flight-deals.d.ts`

**Checkpoint**: vseh sedem zgodb deluje; pogodba validna in generirana.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T111 [P] Integracijski test odstranitve modula `apps/api/tests/integration/flight-deals/tab-removal.spec.ts` (vzorec `tab-isolation.spec.ts`): brez vnosa v `TAB_REGISTRY` zavihka ni v `GET /tabs` in nobena druga pot se ne spremeni (SC-011)
- [ ] T112 [P] *(skripta napisana; MERITEV čaka na lastnikov žeton Travelpayouts)* `apps/api/scripts/spike-travelpayouts.mjs` (quickstart.md §2) in vpis izmerjenih vrednosti v tabelo v `quickstart.md` §2; na podlagi meritve zapiši v `research.md` §4 opombo o pokritosti in o `marker`
- [X] T113 [P] `docs/env-reference.md`: razdelek "Leti (015)" s tabelo spremenljivk (research.md §15); §3 "E-pošta — ali je še potrebna" dobi odgovor (015 jo uporablja prek `platform/email/`, `NOTIFY_EMAIL_TO` ostane za prihodnje); `.env.example` usklajen
- [X] T114 [P] `README.md`: razdelek "Leti (015)" po vzorcu ostalih (kaj je, odločitve, ki jih je vredno poznati: viri in njihov status, en dopis na zagon, urnik samo admin, pogodba in obsegi)
- [X] T115 [P] `docs/adding-a-tab.md`: opomba h koraku 7 o tretji obliki lastništva (`userId` + `recipients`, ki ne berejo) s sklicem na `specs/015-flight-deals/data-model.md`
- [X] T116 Preglej dnevnike in odgovore za uhajanje: grep po modulu za `email` v `logger.*` in v `errors[]`; `FLIGHT_TRAVELPAYOUTS_TOKEN` ne sme biti v `ExternalCache.sourceUrl` (test v `cache-dedupe.spec.ts`: `sourceUrl` ne vsebuje žetona)
- [ ] T117 *(ročni pregled na napravi še ni opravljen; postavitve uporabljajo odzivno mrežo in `--cd-*` tokene, `theme-tokens.spec.ts` zelen)* Mobilni pregled strani (575.98 px): obrazec, kartice ponudb, admin tabela kot kartice; `--cd-*` tokeni, brez `--ion-color-step-*` (test `theme-tokens.spec.ts`)
- [ ] T118 Celoten `npm run typecheck && npm run lint && npm test` ter `npx --yes @redocly/cli lint specs/015-flight-deals/contracts/openapi.yaml`; ročni prehod `quickstart.md` §3–§9 in zapis izidov v `docs/acceptance-015.md`

---

## Dependencies & Execution Order

### Faze

- **Setup (1)** → **Foundational (2)** → zgodbe → **Polish (10)**.
- **US1 (3)** je samostojna po fazi 2.
- **US2 (4)** potrebuje US1 (iskanja, okna) — jedro modula.
- **US3 (5)** potrebuje US2 (ponudbe).
- **US4 (6)** potrebuje US3 (vrste sprememb) in US2 (zagon).
- **US5 (7)** potrebuje US4 (dopis prejemniku) in US2 (vidnost ponudb).
- **US6 (8)** potrebuje US2 (zagon); neodvisna od US3–US5, lahko teče vzporedno z njimi.
- **US7 (9)** potrebuje vse poti.

### Vzporedne priložnosti

- Faza 1: T002–T006, T008 vzporedno; T007 za T006.
- Faza 2: T009–T012, T014, T015, T017–T019, T021 vzporedno; T013 pred T015; T016 pred T019/T020.
- V vsaki zgodbi: vsi testi `[P]` skupaj; domenske datoteke `[P]` skupaj; storitve nato zaporedno.
- US6 (T097–T107) lahko teče vzporedno z US3–US5 po koncu US2.

### Parallel Example: US2

```
Testi:   T040 rule-matcher | T041 query-plan | T042 normalization | T043 identity | T044 booking-url
Domena:  T049 rule-matcher | T050 identity | T051 booking-url | T052 query-plan
Viri:    T053 types → T054 travelpayouts | T055 ryanair | T056 wizz/easyjet | T057 fake → T058 index
Storitve (zaporedno): T059 → T060 → T061 → T062 → T063 → T064/T065
Odjemalec: T066 → T067 | T068
```

## Implementation Strategy

### MVP (US1 + US2)

1. Faze 1–2.
2. US1: iskanje z validacijo in predogledom — uporabno samo zase (SC-001).
3. US2: zagon s testnim virom in Travelpayouts, ponudbe na glavni strani.
4. **Ustavi in preveri** quickstart §3–§4; spike pokritosti (T112) se naredi TU, ker odloči o
   nadaljnjih virih.

### Postopna dostava

5. US3 (zgodovina cen) → quickstart §5.
6. US4 (e-pošta) → §6; od tu modul dela "sam od sebe", a samo za lastnika.
7. US5 (deljenje) → §7.
8. US6 (urnik) → §8; do tu zagone sproža admin ročno — dovolj za preverjanje, ne za produkcijo.
9. US7 + Polish.

## Notes

- Vsak test zunanjega vira uporablja `vi.stubGlobal('fetch', …)` s prepustom na `127.0.0.1`
  (vzorec `contract/meteo.spec.ts`); pošta `vi.mock('nodemailer')`.
- `FakeProvider` je vklopljen SAMO v testnem okolju (`setTestEnv` doda `FLIGHT_FAKE_PROVIDER_ENABLED=true`
  kjer je potreben) in v razvoju ročno; `loadEnv` ga v produkciji zavrne.
- Vsaka naloga z usmerjevalnikom konča z `next(err)` v `catch` (Express 5) in Zod `parse` (ne `safeParse`).
- Imena polj in poti so angleška, vsa besedila slovenska s tikanjem (člen X).
