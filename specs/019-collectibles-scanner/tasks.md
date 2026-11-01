---

description: "Task list for feature implementation"
---

# Tasks: Zbirateljski skener (019)

**Vhod**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/openapi.yaml](contracts/openapi.yaml), [quickstart.md](quickstart.md)

Testi so obvezni (kakovostna vrata ustave, FR-032); vsi so z mock `fetch` in fiksnimi podatki, brez omrežja.
Poti: zaledje `apps/api/src/modules/collectibles-scanner/`, skupno `apps/api/src/platform/`, testi
`apps/api/tests/{unit,integration,contract}/collectibles/`; odjemalec `apps/web/src/app/features/collectibles-scanner/`,
testi `apps/web/tests/unit/`. Vsak koren pomeni `D:\programiranje\privat\cleverdash\`.

**Pravilo regresije**: po vsaki nalogi v Phase 2 morajo LEGO testi (`tests/{unit,integration,contract}/lego*`) in
`tests/unit/scanner-core-boundary.spec.ts` ostati zeleni **brez sprememb testov**.

## Phase 1: Setup

- [X] T001 Okolje v `apps/api/src/platform/config/env.ts`: `PRICECHARTING_API_KEY`, `PRICECHARTING_URL`, `TCGDEX_URL`, `COLLECTIBLES_FAKE_SOURCE_ENABLED` (v produkciji zavrni v `superRefine`), `COLLECTIBLES_{EBAY,TCGDEX,PRICECHARTING}_DAILY_LIMIT`, `COLLECTIBLES_{CATALOG_CACHE_DAYS,PRICE_CACHE_HOURS,LISTING_CACHE_SECONDS,EBAY_MAX_PAGES,MAX_CATALOG_LOOKUPS_PER_RUN,MAX_VALUATIONS_PER_RUN,TIMEOUT_MS}`, `COLLECTIBLES_{SELLING_FEE,CONSERVATIVE_DISCOUNT,BUYER_FEE}_PCT`, rezerve `COLLECTIBLES_RISK_RESERVE_PCT_{CARDS,RETRO}`, `COLLECTIBLES_RISK_UNVERIFIED_GRADE_PCT`, `COLLECTIBLES_RISK_REPRO_SUSPECT_PCT` (privzetki po research §10, §13); test v `apps/api/tests/unit/env.spec.ts`
- [X] T002 [P] `.env.example` (samo prazni ključi in privzetki) in `docs/env-reference.md` (razdelek 019); prazna vrstica `PRICECHARTING_API_KEY=` v lokalni `.env` (negitan)
- [X] T003 [P] Ikona (npr. `albums-outline`) v `apps/web/src/app/core/icons/register-icons.ts` in `apps/web/tests/unit/icons.spec.ts`
- [X] T004 [P] Cilj `specs/019-collectibles-scanner/contracts/openapi.yaml → scanners-collectibles.d.ts` v `packages/contracts/scripts/generate.ts` in vrstica redocly lint v `.github/workflows/ci.yml`

## Phase 2: Foundational — izvleka skupne kode (BLOKIRA vse zgodbe)

**Cilj**: skupno kodo iz `lego-scanner` prestaviti v `platform/`, LEGO ostane z enakim obnašanjem.

- [X] T005 Preberi `apps/api/tests/integration/lego/sources.spec.ts` in `apps/api/tests/unit/no-owner-fields.spec.ts`; zapiši v komentar na vrhu T006, ali testi odvisijo od imena zbirke `legosourceusages` ali poti `sources/{http,usage}`; odločitev (ponovni izvoz ali preimenovanje) po research §1
- [X] T006 Izvleci `sources/http.ts`, `sources/usage.ts`, `util/pacer.ts` in `models/lego-source-usage.model.ts` v `apps/api/src/platform/external-sources/{http,usage,pacer}.ts` in `models/external-source-usage.model.ts` (zbirka `ExternalSourceUsage`, ključ `(source, day)`; viri `ebay|rebrickable|bricklink|tcgdex|pricecharting`); parametriziraj `timeoutMs`, predpono dnevnika in `usageSource`; v `lego-scanner/sources/` pusti ponovni izvoz, če T005 to zahteva
- [X] T007 Izvleci generični eBay odjemalec v `apps/api/src/platform/ebay/` (`token.ts`, `search-url.ts`, `parse-items.ts`, `search.ts`): `marketplace: string`, `categoryId?: string`, `aspectFilter?`; `resetEbayTokenForTests`; `lego-scanner/sources/ebay.ts` postane ovoj s `LEGO_CATEGORY='19006'` in `LEGO_MARKETPLACES`
- [X] T008 [P] Izvleci aritmetiko v `apps/api/src/platform/scanner/domain/opportunity-math.ts` (`computeOpportunity`, `EU_COUNTRIES`, `round2`, `scoreFor`, tip `OpportunityParams`); `lego-scanner/domain/opportunity.ts` ostane ovoj z enakim izhodom; brez besed "lego"/"collectibles" v jedru (`scanner-core-boundary`)
- [X] T009 [P] Izvleci `planEvent` v `apps/api/src/platform/scanner/domain/alert-plan.ts` (splošna zastavica-stanja, tipi brez imen tipov); `lego-scanner/events.ts` ostane ovoj
- [X] T010 [P] Testi izvlečenih enot: `apps/api/tests/unit/platform/{opportunity-math,alert-plan}.spec.ts`, `apps/api/tests/unit/platform/ebay.spec.ts` (URL iskanja s/brez kategorije, razčlenitev, poštnina samo FIXED), `apps/api/tests/integration/platform/external-usage.spec.ts` (atomarnost, nov dan, prehod na zimski čas 2026-10-25)
- [X] T011 Regresija: zaženi vse LEGO teste in `scanner-core-boundary`; popravi izvleko, dokler niso zeleni brez sprememb testov

**Checkpoint**: skupna koda v `platform/`, LEGO nespremenjen — zgodbe se lahko začnejo.

## Phase 3: US1 — Iskanje po mojih kriterijih (P1) 🎯 MVP

**Cilj**: tip `collectibles` je registriran, iskanja se ustvarijo in zaženejo z eBay oglasi (testni vir ali pravi).
**Neodvisni test**: testni vir; dve iskanji različnih kategorij imata ločene rezultate, zgodovino in urnik.

- [X] T012 [US1] Tipi v `modules/collectibles-scanner/domain/types.ts`: `CollectibleAttributes`, `RawListing`, `Identification`, `Valuation` (asking/estimate/sold), `Opportunity`, `CollectiblesAlerts` po data-model.md
- [X] T013 [US1] Register kategorij `categories/registry.ts` (vmesnik `CollectibleCategory`: `id`, `label`, `configSchema`, `fields[]` za opis, `buildListingQuery`, `identify`, `valuate`, `riskReservePct`) in prazna ogrodja `categories/trading-cards.ts`, `categories/retro-gaming.ts` s Zod shemama filtrov (`cards`, `retro`)
- [X] T014 [US1] `config.ts`: `z.discriminatedUnion('category', …)` nad registrom + skupni filtri (FR-004), normalizacija, `validateCollectiblesConfig` (vsaj ena beseda/filter kategorije/najvišja cena; min ≤ max; tržnice ⊂ `EBAY_MARKETPLACES`; neznana kategorija → razlog), `describeCollectiblesConfig`
- [X] T015 [P] [US1] `sources/types.ts` (`ListingSource`, `CatalogSource`, `PriceSource` z `basis`, `ResolvedSources`) in `sources/index.ts` (`resolveSources(env)`, `createRuntime`, razlogi po vlogi)
- [X] T016 [US1] `sources/ebay.ts`: ovoj nad `platform/ebay` — `COLLECTIBLES_*` meje, tržnice DE/IT/FR/ES, privzeto brez `category_ids` do potrditve (research §7), `excludedKeywords` kot filter po razčlenitvi
- [X] T017 [P] [US1] `sources/fake.ts`: deterministična zgodba štirih zagonov za kartice in retro (quickstart §1), samo ob `COLLECTIBLES_FAKE_SOURCE_ENABLED`
- [X] T018 [US1] `execute.ts`: cevovod (oglasi → filtri brez kataloga → dedup po `marketplace:itemId` → shramba prek `results.reconcile`), kode napak `collectibles:{no-definition,invalid-config,no-listing-source,unreachable,daily-limit}`, `sourceSucceeded`, utrip in preklic
- [X] T019 [US1] `scanner-type.ts` + `index.ts` (`registerCollectiblesScannerType`) + `router.ts` (`GET /collectibles-scanner/sources`, `GET /collectibles-scanner/categories`, obseg `scanners:read`, brez ključev v odgovoru); ena vrstica v `apps/api/src/main.ts` za router in ena za registracijo; `allowedResultHosts` ebay.{de,it,fr,es,com}
- [X] T020 [P] [US1] Unit testi `tests/unit/collectibles/{config,registry}.spec.ts` (shema po kategoriji, neznana kategorija, mejni primeri filtrov, excluded keywords)
- [X] T021 [P] [US1] Contract test `tests/contract/collectibles/collectibles-scanner.spec.ts` (registracija tipa, `/sources` in `/categories` brez skrivnosti, 401/403, ustvarjanje prek `/scanners`, lastništvo)
- [X] T022 [US1] Integracijski test `tests/integration/collectibles/run.spec.ts` (dve iskanji, ločeni rezultati/zgodovina, izpad vira oglasov ne označi obstoječih kot nedosegljive, brez ključev → jasna napaka) ter `tests/integration/collectibles/ebay-source.spec.ts` (mock `fetch`, paginacija, žeton, kategorije, 429/5xx)
- [X] T023 [US1] `tests/integration/collectibles/removal.spec.ts`: brez registracije tip izgine, jedro teče naprej (po vzoru `echo-scanner/removal.spec.ts`)

**Checkpoint**: MVP — iskanje deluje in se shranjuje; ocen še ni.

## Phase 4: US2 — Zanesljiva prepoznava različice (P1)

**Cilj**: vsak oglas dobi `Identification` z `variantKey`, zaupanjem in razlogom; negotovo → ročni pregled.
**Neodvisni test**: tabela naslovov → pričakovana identiteta (FR-014).

- [X] T024 [P] [US2] `domain/card-parse.ts`: ime, številka (`4/102`, `004/102`, `#4`), jezik, izdaja, reverse/holo, ocenjevalec in ocena (`PSA 9`, `BGS 9.5`, `CGC 10`), zapečatenost, "proxy/custom/lot" (research §8)
- [X] T025 [P] [US2] `domain/retro-parse.ts`: platforma z vzdevki, regija, popolnost, delovanje, reprodukcija, lot, konzola/igra/dodatek (research §9)
- [X] T026 [P] [US2] `domain/variant-key.ts`: `cardVariantKey`, `retroVariantKey`; `null`, ko manjka razločevalnik; čista funkcija `sameVariant(a, b)`
- [X] T027 [US2] `sources/tcgdex.ts`: `CatalogSource` — iskanje po imenu v jeziku oglasa, filtriranje po `localId`/setu, razčlenitev (id, ime, set, številka, redkost, slika, `variants`, `pricing.cardmarket`), predpomnilnik 30 dni, dnevna meja, razmik 250 ms, `null` ≠ napaka; pred pisanjem preberi `tcgdex/cards-database` (sintaksa filtrov, licenca, meje) in zapiši v research §3
- [X] T028 [US2] `domain/card-identify.ts`: katalog + parse → `Identification` (visoko: ime+številka+set natanko ena kartica; srednje: ime+številka; nizko/ročni pregled sicer); PROXY/LOT/SEALED vrste; japonska prek `ja` kataloga ali besedila, nikoli enaka angleški
- [X] T029 [US2] `domain/retro-identify.ts`: iz besedila (največ srednje); z `PRICECHARTING_API_KEY` potrditev v katalogu (⚠ oblika odgovora — preveri pri prvem pravem klicu); REPRODUCTION/LOT/defekt → brez ocene
- [X] T030 [US2] Poveži prepoznavo v `execute.ts` in `categories/*` (omejitev `MAX_CATALOG_LOOKUPS_PER_RUN`, izpad kataloga ne podre zagona, filtri po katalogu: set/številka/jezik/izdaja/ocena)
- [X] T031 [P] [US2] Tabelarni testi `tests/unit/collectibles/{card-parse,retro-parse,variant-key,card-identify,retro-identify}.spec.ts` (≥ 40 naslovov): PSA 9 ≠ PSA 10 ≠ raw, 1st ≠ unlimited, ja ≠ en, reverse ≠ holo, loose ≠ CIB, PAL ≠ NTSC, repro, defekt, lot, dvoumne številke, manjkajoči podatki ostanejo neznani
- [X] T032 [P] [US2] `tests/integration/collectibles/tcgdex-source.spec.ts` (mock `fetch`: zadetek, več kandidatov, 404, 5xx, `pricing: null`, `tcgplayer: null`, meja)

## Phase 5: US3 — Vrednost iz označenih podatkov (P1)

**Cilj**: `Valuation` z ločenimi `asking`/`estimate`/`sold`; brez osnove → `insufficient`.
**Neodvisni test**: fiksni odgovori virov → vsaka vrsta označena, nikoli mešana.

- [X] T033 [P] [US3] `domain/comparables.ts`: aktivne primerljive cene po `variantKey` iz istega zagona (≥ 3 oglasi, ista valuta, odstopanja izločena), samo `asking`
- [X] T034 [P] [US3] `domain/valuation.ts`: sestavi `Valuation` (`estimate` iz TCGdex Cardmarket `trend`/`avg30`/`low` z `updatedAt`; `guide` iz PriceCharting; `sold` iz `PriceSource.basis==='sold'`), `primary`, `confidence`, `comparable` (valuta + variantKey), `stale`, opomba; `asking` nikoli `primary`
- [X] T035 [US3] `sources/pricecharting.ts`: `PriceSource` (`basis: 'guide'`), vklop samo ob ključu, žeton `t=` samo v `buildRequest` (`sourceUrl` brez njega), privzeto brez ključa → razlog "premalo podatkov"; ⚠ oblika odgovora in pogoji uporabe se potrdijo pri prvem pravem klicu (research §4)
- [X] T036 [US3] Vrednotenje v `execute.ts`: ena poizvedba na `variantKey`, meja `MAX_VALUATIONS_PER_RUN`, izpad cenika ne podre zagona (`collectibles:<code>:<vir>`), valuta oglasa ≠ valuta vira → `comparable=false`
- [X] T037 [P] [US3] Testi `tests/unit/collectibles/{valuation,comparables}.spec.ts` (samo asking → insufficient; estimate → ocena brez sold; sold ima prednost; različni variantKey se ne mešajo; stara vrednost; valuta) in `tests/integration/collectibles/pricecharting-source.spec.ts` (žeton ni v `sourceUrl` ali dnevniku)

## Phase 6: US4 — Priložnost z vidnim izračunom (P2)

**Cilj**: `Opportunity` po postavkah; dobiček samo ob `sold`; popust do ocene označen z osnovo.

- [X] T038 [US4] `domain/opportunity.ts`: ovoj nad `computeOpportunity` z `riskReservePct` iz kategorije (+ nepreverjena ocena, sum reprodukcije, ocena brez certifikata); dobiček/ROI/score `null`, razen ob `valuation.sold` + znana poštnina/davki/identifikacija/stanje; `missing[]` z razlogi (`sold-prices`, `shipping`, `taxes`, `identification`, `variant`); `discountBasis`
- [X] T039 [US4] Filtri po vrednosti v `execute.ts`: `minDiscountPct` na osnovi ≠ asking, `minProfit` samo znan dobiček; števci `valued`, `withProfit`
- [X] T040 [P] [US4] Testi `tests/unit/collectibles/opportunity.spec.ts`: vsi vhodi znani + sold → vse postavke; samo estimate → dobiček `null` z `sold-prices`; poštnina neznana ≠ 0; prodajalec izven EU → davki neznani; višja rezerva pri neocenjeni drag kartici; PROXY/REPRODUCTION → brez ocene; `score` samo ob dobičku

## Phase 7: US5 — Spremembe in obvestila (P2)

**Cilj**: dogodki (nov, pocenitev, podcenjeno, dražba, sprememba) brez dvojnikov.

- [X] T041 [US5] `events.ts`: ovoj nad `alert-plan` z zastavicami `profitNotified`, `discountNotified`, `auctionEndingNotified`; `notifyMinDiscountPct` obvešča z oznako "do ocene"
- [X] T042 [US5] `notifications.ts`: `verify` (rezultat še obstaja in ustreza) + `render` (zadeva prek `emailSubject`, postavke izračuna ali "dobiček neznan: ni preverjenih prodaj", oznaka vrste cene, slogi inline, brez e-naslovov); dogodki v `execute.ts` po `reconcile`
- [X] T043 [US5] Zaznava sprememb: `comparable` hash = `{ variantKey, condition, listingType, completeness, grade }`; umik = "ni več na voljo", dražba pokaže zadnjo ponudbo z `bidCount`, ne končne cene (označbe v `data.listing`)
- [X] T044 [P] [US5] Testi `tests/unit/collectibles/events.spec.ts` + `tests/integration/collectibles/notifications.spec.ts`: štirje zagoni testnega vira (quickstart §1), natanko en dopis na dogodek, ponovni zagon brez spremembe nič, dražba čez prehod na zimski čas (2026-10-25), umik ≠ prodano, lastništvo prejemnikov

## Phase 8: US6 — Izbirna analiza z UI (P3)

- [X] T045 [US6] `scanner-type.ts` → `ai`: `subject` (ne trdi pristnosti iz slik, ne ocenjuje cen/stroškov popravila), `describe` (atributi, identifikacija, vrsta in osnova cen, `missing`; slike samo `ebayimg`, https)
- [X] T046 [P] [US6] Testi `tests/integration/collectibles/ai.spec.ts`: izklop → 0 klicev ponudniku; vklop → samo oglasi po filtrih; vhod brez oseb; mejni primeri iz 017 (meje, predpomnilnik) veljajo za ta tip; analiza ne spremeni statusa zagona (uporabi `setAiClientForTests`)

## Phase 9: US7 — Obrazec, seznam, podrobnosti (P2)

**Cilj**: dinamičen obrazec iz `/categories`; seznam in podrobnosti po FR-030.

- [X] T047 [US7] `collectibles.model.ts`: čiste funkcije prikaza (oznake vrste cene `asking/estimate/guide/sold`, barve tveganja, oblika zneska, "neznano"/"premalo podatkov", oznaka ročnega pregleda)
- [X] T048 [US7] `collectibles-config.component.ts` (izpolni `ScannerConfigForm`): izbira kategorije, polja iz `GET /collectibles-scanner/categories` (dinamični `FieldDescriptor`), skupni filtri, razlog manjkajočih virov iz `/sources`; ponovna uporaba kontrol (ime, viri, urnik, obvestila, stikalo UI iz čarovnika)
- [X] T049 [US7] `collectibles-results.component.ts` (izpolni `ScannerResultsView`): seznam (slika, ime, kategorija, različica, stanje, tržnica, cena, poštnina, vrednost z oznako, dobiček, kazalnik tveganja UI) in podrobnosti (oglas, katalog, zaupanje, zgodovina cen, primerljivi, razlaga vrednosti, izračun, analiza UI, povezava); brez ocene → "premalo podatkov", ne 0 €
- [X] T050 [US7] `scanner-ui.ts` + ena vrstica `registerCollectiblesScannerUi()` v `apps/web/src/main.ts`; lazy `import()`
- [X] T051 [P] [US7] Testi `apps/web/tests/unit/collectibles-model.spec.ts` (vse oznake, manjkajoče vrednosti, ročni pregled), `apps/web/tests/unit/scanner-ui-registry.spec.ts` (dodan tip), `apps/web/tests/unit/collectibles-config.spec.ts` (obrazec iz opisa kategorije, validacija)

## Phase 10: Polish & cross-cutting

- [X] T052 [P] `docs/collectibles-scanner.md`: podprte kategorije, kaj sistem trdi in česa ne (tabela kot pri LEGO), viri in ključi, omejitve (ni preverjenih prodaj → dobiček neznan), dodajanje kategorije in vira; povezava iz `docs/adding-a-scanner-type.md` in `docs/scanner-engine.md`
- [ ] T053 [P] Pred prvim pravim klicem potrdi in zapiši v `research.md`: eBay kategorije/`conditionDescriptors` (§7), TCGdex licenca in meje (§3), PriceCharting oblika in pogoji (§4); popravi razčlenitev in mock v isti nalogi **NI izvedeno**: potrebuje žive ključe/dostop; TCGdex filtri `name`+`localId` so potrjeni z živim klicem (research §3), eBay kategorije, licenca TCGdex, oblika PriceCharting ostajajo ⚠ v `docs/collectibles-scanner.md`.
- [X] T054 Preveri vsebino `scanner-core-boundary` (jedro ne vsebuje "lego"/"collectibles") in `tests/unit/no-owner-fields.spec.ts` za `ExternalSourceUsage`
- [X] T055 `npm run typecheck`, `npm run lint`, vsi testi API in web; `npx --yes @redocly/cli lint specs/019-collectibles-scanner/contracts/openapi.yaml`
- [X] T056 Preveri odstranljivost: začasno izbriši obe mapi in 3 vrstice registracije → `typecheck`, `lint` in testi čisti; vrni
- [ ] T057 Ročni quickstart (§1 testni vir; §2 pravi viri, ko so ključi na voljo) — rezultate zapiši; če ni izveden, to izrecno zapiši (kot pri 017) **NI izvedeno** (ni pravih ključev): deterministična zgodba testnega vira je pokrita z `tests/integration/collectibles/run.spec.ts`; ročni pregled v brskalniku in pravi viri niso preverjeni.

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** (blokira vse) → **Phase 3 (US1)** → **Phase 4 (US2)** → **Phase 5 (US3)** → **Phase 6 (US4)**;
  US5, US6 in US7 potrebujejo US1; US5 tudi US4; US7 tudi US3/US4 za polna polja.
- Znotraj faze: tipi → register/shema → viri → cevovod → testi. T006 pred T007/T010; T008 in T009 sta neodvisni.
- T005 pred T006 (odločitev o aliasu). T053 pred prvim pravim zagonom.

### Parallel Opportunities

- Phase 1: T002, T003, T004. Phase 2: T008 ∥ T009 (po T006–T007 neodvisno od eBay izvleke).
- US2: T024 ∥ T025 ∥ T026; testi T031 ∥ T032. US3: T033 ∥ T034. Web (Phase 9) ∥ zaledje po T019.

## Implementation Strategy

1. **MVP**: Phase 1 + 2 + US1 (iskanje shranjeno z oglasi, testni vir).
2. **+ US2**: prepoznava (brez nje ocene ne smejo obstajati).
3. **+ US3 + US4**: ocena in popust; dobiček ostane `null`, dokler ni vira prodaj.
4. **+ US5/US7**: obvestila in UI; **+ US6**: AI.
5. Po vsaki fazi: LEGO testi + `scanner-core-boundary` zeleni.
