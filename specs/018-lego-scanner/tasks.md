---

description: "Task list for feature implementation"
---

# Tasks: LEGO skener (018)

**Vhod**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/openapi.yaml](contracts/openapi.yaml), [quickstart.md](quickstart.md)

Testi niso neobvezni (kakovostna vrata ustave, FR-027). Vsi testi za razčlenitev virov so z mock
odgovori brez omrežja. Poti: zaledje `apps/api/src/modules/lego-scanner/`, testi
`apps/api/tests/{unit,integration,contract}/lego*/`; odjemalec
`apps/web/src/app/features/lego-scanner/`, testi `apps/web/tests/unit/`.

## Phase 1: Setup

- [X] T001 Okolje v `apps/api/src/platform/config/env.ts`: `REBRICKABLE_API_KEY`, `BRICKLINK_CONSUMER_KEY/_SECRET/_TOKEN/_TOKEN_SECRET`, `EBAY_CLIENT_ID/_SECRET`, `EBAY_MARKETPLACES` (privzeto `EBAY_DE,EBAY_IT`), `REBRICKABLE_URL`, `BRICKLINK_URL`, `EBAY_API_URL`, `LEGO_*` po research §11; `LEGO_FAKE_SOURCE_ENABLED=true` v produkciji zavrni v `superRefine`; testi v `apps/api/tests/unit/env.spec.ts`
- [X] T002 [P] `.env.example`, `docs/env-reference.md` (razdelek 018), prazne vrstice ključev v lokalni `.env` (negitan)
- [X] T003 [P] Ikona `cube-outline` v `apps/web/src/app/core/icons/register-icons.ts` in `apps/web/tests/unit/icons.spec.ts`
- [X] T004 [P] Cilj `specs/018-lego-scanner/contracts/openapi.yaml → scanners-lego.d.ts` v `packages/contracts/scripts/generate.ts` in vrstica redocly v `.github/workflows/ci.yml`

## Phase 2: Foundational

- [X] T005 Čisti tipi v `modules/lego-scanner/domain/types.ts` (`LegoCondition`, `LegoAttributes`, `LegoResultData`, `Identification`, `Valuation`, `Opportunity`, `LegoMarketplace`) po data-model.md
- [X] T006 `config.ts`: Zod shema `LegoConfig`, normalizacija številke seta (uporablja domena T010), `validateConfig` (vsaj eno od številke/ključnih besed/teme/najvišje cene; min ≤ max; tržnice v `EBAY_MARKETPLACES`), mapiranje stanj na eBay `conditionIds`
- [X] T007 [P] `models/lego-source-usage.model.ts` + `sources/usage.ts` (atomarna dnevna rezervacija po viru, `Europe/Ljubljana`, TTL 400 dni)
- [X] T008 Vmesniki virov `sources/types.ts` (`CatalogSource`, `PriceSource`, `ListingSource`, `SourceOutcome`) in `sources/http.ts` (zahteva prek `platform/cache/getOrRefresh`, semafor, razmik, časovna omejitev, kode `unreachable/rateLimited/disabled`, `stale` kot opomba)
- [X] T009 [P] Test uporabe in http v `tests/unit/lego/usage.spec.ts` in `tests/integration/lego/usage.spec.ts` (atomarnost, nov dan, presežek)

## Phase 3: US2 — Zanesljiva identifikacija (P1) 🎯 temelj vsega

**Goal**: oglas → set z zaupanjem in vrsto; paketi, deli, prazne škatle niso kompletni seti.

- [X] T010 [US2] `domain/set-number.ts`: `extractSetNumbers`, `normalizeSetNumber` (`75192`, `75192-1`, `LEGO 75192` → `75192-1`; zavrne letnice, EAN, datume)
- [X] T011 [US2] `domain/classify.ts`: vrsta oglasa (`SET/BUNDLE/PARTS/MINIFIG/EMPTY_BOX/OTHER`) z večjezičnimi pravili de/it/en/sl, dokumentiran vrstni red
- [X] T012 [US2] `domain/condition.ts`: razvrstitev stanja iz eBay `conditionId` + besedila (`NEW_SEALED/…/UNKNOWN`, `completenessVerified`, `boxIncluded`, `instructionsIncluded`), brez domnev
- [X] T013 [US2] `domain/identify.ts`: prioriteta številka → katalog → ime → tema+naslov, zaupanje, razlog, `needsReview`
- [X] T014 [P] [US2] Tabelarni testi `tests/unit/lego/{set-number,classify,condition,identify}.spec.ts` (≥ 30 naslovov: podobna imena, paketi, deli, minifigure, prazne škatle, dvoumne številke)

## Phase 4: US3 + US4 — Vrednotenje in priložnost (P1)

- [X] T015 [US3] `domain/valuation.ts`: iz odgovora cenika (sold/stock, N/U) → vrednost z zaupanjem; mediana samo iz posameznih prodaj; aktivne ponudbe ločeno; valuta/neprimerljivost; `stale`
- [X] T016 [US4] `domain/opportunity.ts`: skupni strošek, konservativna vrednost, provizije, rezerva, dobiček, ROI, popust, `score`, `missing[]`; davki po državi prodajalca
- [X] T017 [P] [US3] [US4] Testi `tests/unit/lego/{valuation,opportunity}.spec.ts` (primer iz naloge 400+20→550→dobiček 50, manjkajoča poštnina/vrednost/davki, druga valuta, ena prodaja, 0 prodaj, nepreverjena kompletnost)

## Phase 5: US1 — Iskanje po virih (P1) 🎯 MVP

**Goal**: ustvarjen skener po urniku prinese rezultate v generični shrambi.

- [X] T018 [US1] `sources/rebrickable.ts`: opis zahteve + čista razčlenitev (set, iskanje po imenu, teme → tema/podtema), razmik 1,1 s, dnevna meja; test `tests/unit/lego/rebrickable.spec.ts` z mock odgovori
- [X] T019 [US1] `sources/bricklink.ts`: OAuth 1.0 HMAC-SHA1 podpis z `node:crypto`, cenik `sold`/`stock` × `N`/`U` v EUR, razčlenitev (nizi → številke, `price_detail`), napake dostopa (IP) z navodilom; testi `bricklink.spec.ts` (podpis proti znanemu vektorju, razčlenitev)
- [X] T020 [US1] `sources/ebay.ts`: aplikacijski žeton (client credentials, v pomnilniku do izteka), iskanje `item_summary/search` s filtri (`price`, `conditionIds`, `buyingOptions`, `itemLocationCountry`, `deliveryCountry:SI`), strani, razčlenitev v `RawListing` (poštnina samo `FIXED`); test `ebay.spec.ts`
- [X] T021 [P] [US1] `sources/fake.ts`: deterministični testni vir (katalog, cenik, oglasi) po zagonih 1–4 (quickstart §1); `sources/index.ts` (`resolveSources(env)`: kateri viri so vklopljeni, razlogi)
- [X] T022 [US1] `execute.ts`: cevovod (oglasi → identifikacija → filtri tema/letnik/stanje/vrsta/poštnina → vrednotenje z mejo na zagon → priložnost → filtri popust/dobiček → `NormalizedResult[]` → `ctx.results.reconcile`); napake virov v `errors` s kodami `lego:*`; `sourceSucceeded` samo ob uspehu oglasnega vira
- [X] T023 [US1] `scanner-type.ts` + `index.ts`: `ScannerType<LegoConfig>` (`single`, `generic`, `allowedResultHosts` eBay), `describeConfig`, registracija; vrstica v `apps/api/src/main.ts`
- [X] T024 [US1] `router.ts`: `GET /lego-scanner/sources`; mount v `main.ts`; regeneracija `packages/contracts`
- [X] T025 [P] [US1] Integracijski test `tests/integration/lego/run.spec.ts` (testni vir: rezultati po filtrih, dve iskanji neodvisni, brez ključev → napaka brez rušenja, `data` po shemi) in pogodbeni `tests/contract/lego/{sources,crud,access}.spec.ts` (tuje iskanje 404, neveljaven config 400)

## Phase 6: US5 — Spremembe in obvestila (P2)

- [X] T026 [US5] `events.ts`: čiste funkcije odločitev (prag, prehod nad prag, dražba se izteka, zastavice `data.alerts`) + sestavljanje dogodkov pred `reconcile` (obstoječi rezultati prek `ScannerResultModel`, `detectChange`)
- [X] T027 [US5] `notifications.ts`: `verify` (ponovna preverba rezultata) + `render` (zadeva, HTML, besedilo; postavke cene/poštnine/vrednosti/dobička, oznaka "ocena"); povezava na `/scanners/<id>`
- [X] T028 [P] [US5] Testi `tests/unit/lego/events.spec.ts` in `tests/integration/lego/changes.spec.ts` (4 zagoni testnega vira: NOVO, brez sprememb, pocenitev, umik ≠ prodano, dražba ni končna cena, brez dvojnih dopisov) in `notifications.spec.ts`

## Phase 7: US6 — AI analiza (P3)

- [X] T029 [US6] `ai: { subject, describe }` v `scanner-type.ts`: vhod iz naslova, stanja, kataloga, vrednosti; slike samo ebayimg; prepoved trditev o pristnosti in cenah
- [X] T030 [P] [US6] Test `tests/integration/lego/ai.spec.ts` (ponarejen odjemalec: vklop/izklop, vhod brez osebnih podatkov, analiza ob `aiEnabled`)

## Phase 8: Odjemalec

- [X] T031 [US1] `lego.model.ts` (čiste funkcije: oznake stanja/vrste/zaupanja, barve, formatiranje cene/dobička/ocene, opozorila "kompletnost ni preverjena", "premalo podatkov", "ocena") + `tests/unit/lego-model.spec.ts`
- [X] T032 [US1] `lego-config.component.ts` (`ScannerConfigForm`): vsi filtri, tržnice, stanja, vrsta ponudbe, pragovi; pokaže `GET /lego-scanner/sources` (kaj manjka); `scanner-ui.ts` + vrstica v `apps/web/src/main.ts`
- [X] T033 [US1] `lego-results.component.ts`: kartice (slika, številka, ime, tema, letnik, stanje, tržnica, cena, poštnina, vrednost, dobiček, ocena, AI značka), podrobnosti (oglas, katalog, BrickLink primerjava, izračun po postavkah, opozorila, AI kartica `app-ai-analysis-card`, povezava)
- [X] T034 [P] Tema pomoči `scanners.lego` v `apps/web/src/app/shared/help/help-topics.ts`

## Phase 9: Polish

- [X] T035 Dokumentacija: `docs/lego-scanner.md` (viri, ključi, registracija IP BrickLink, omejitve, kaj model/sistem ne trdi), `docs/adding-a-scanner-type.md` (opomba), `README.md` (018)
- [X] T036 Test meje `scanner-core-boundary` ostane zelen; `tests/unit/no-owner-fields.spec.ts` (`LegoSourceUsage` je namestitveni zapis)
- [X] T037 (ročni preizkus quickstart §1–§2 NI izveden, lastnika ni; API 247/249 datotek zelenih, 2 padata zaradi datuma — predogled iskanj letov ima trdo kodirano 20. 10. 2026, ne LEGO; web 38/597; build, lint, typecheck, 3 pogodbe) Kakovostna vrata: typecheck, lint, vsi testi API + web, build web, redocly vseh pogodb, `git status` brez `.env`; ročni preizkus (quickstart §1–§2) se zabeleži kot preskočen, če lastnika ni

## Odvisnosti

T001 → T006, T018–T020; T005 → vse domene; T010–T013 → T022; T015, T016 → T022; T008 → T018–T020; T022 → T023 → T025; T026 → T022 (integracija) in T027; odjemalec (T031–T033) neodvisen od zaledja razen oblike `data` (data-model.md).

## Strategija

MVP = Phase 1–5 (testni vir od konca do konca); nato dogodki (Phase 6), AI (Phase 7), odjemalec in polish. Vsaka faza se konča s tipchecom in testi te faze.
