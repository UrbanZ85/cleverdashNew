---

description: "Task list for feature implementation"
---

# Tasks: Dražbeni skener (021)

**Vhod**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/openapi.yaml](contracts/openapi.yaml), [quickstart.md](quickstart.md)

**Testi so obvezni** (kakovostna vrata ustave, FR-035) in **pišejo se prvi**: v vsaki fazi test-naloge pred implementacijo; test mora najprej
pasti (rdeč), šele nato se napiše koda. Vsi testi so deterministični: fiksni podatki, mock `fetch`, nadzorovana ura (`ctx.now`), brez omrežja.

Poti (koren `D:\programiranje\privat\cleverdash\`): zaledje `apps/api/src/modules/auction-scanner/`, skupno `apps/api/src/platform/`, testi
`apps/api/tests/{unit,integration,contract}/auctions/`, fixtures `apps/api/tests/fixtures/auctions/`; odjemalec
`apps/web/src/app/features/auction-scanner/`, testi `apps/web/tests/unit/auction-*.spec.ts`.

**Pravilo regresije (po vsaki fazi)**: LEGO, zbirateljski (019), echo, leti in `scanner-core-boundary.spec.ts`/`module-boundary.spec.ts` ostanejo zeleni
**brez sprememb testov**. Ukaz: `pnpm --filter api test -- lego collectibles scanner echo flight` in `pnpm typecheck && pnpm lint`.

**Prepovedano**: konektorji za FURS in AJPES (samo registrirana nedostopna vira); obhod prijave/zaščit; avtomatsko licitiranje; nova odvisnost brez T003.

## Phase 0: Vrata (pred kodo, ki jih pogojujejo)

- [ ] T001 **T-sync**: preveri, da je 019 zaključen in committan (`git status`, `git log -- apps/api/src/main.ts apps/web/src/main.ts apps/api/src/platform/config/env.ts packages/contracts/scripts/generate.ts apps/web/src/app/core/icons/register-icons.ts`); preveri, ali `specs/020` obstaja in katere skupne datoteke spreminja; rezultat zapiši v `specs/021-auction-scanner/research.md` §7 (dopolnilo z datumom). Brez zelene regresije LEGO/019 se faze 1+ ne začnejo
- [ ] T002 **T-furs**: ne piše se konektor; zapiši v `research.md` §3, ali je `furs.edrazbe.si` brez prijave berljiv in ali ponuja RSS/XML (ročni pregled lastnika); do potrditve ostane `unavailable` (naloga zaključena z zapisom, ne s kodo)
- [ ] T003 **T-xml**: preveri, ali je v `apps/api/package.json` že knjižnica za XML/RSS ali HTML (`pnpm why fast-xml-parser`, `htmlparser2`, `cheerio`); če ne, odločitev zapiši v `plan.md` (najmanjša možna odvisnost ali lasten majhen razčlenjevalnik za RSS 2.0); brez uvedbe odvisnosti brez zapisane odločitve
- [ ] T004 **T-sodne**: lastnik v portalu SodneDrazbe.si ustvari shranjeno iskanje, prilepi URL RSS vira in shrani dejanski odgovor (brez osebnih podatkov) kot `apps/api/tests/fixtures/auctions/sodnedrazbe-real.xml`; ob prvi izvedbi prepiši sintetični fixture (T033) z resničnimi polji. **Do tedaj** velja samo sintetični fixture in konektor je označen "oblika nepreverjena"
- [ ] T005 **T-gov**: preveri pogoje ponovne uporabe GOV.SI in dovoljenost samodejnega branja zbirke `zbirke/javne-objave`; zapiši v `research.md` §4; brez pozitivnega zapisa ostane `AUCTIONS_GOVSI_ENABLED` privzeto `false` in v UI "izklopljen"

## Phase 1: Setup

- [ ] T006 Okolje v `apps/api/src/platform/config/env.ts`: `AUCTIONS_FAKE_SOURCE_ENABLED` (v produkciji zavrni v `superRefine`), `AUCTIONS_SODNEDRAZBE_FEEDS` (seznam URL-jev, ločen z vejico, vsak `https`), `AUCTIONS_GOVSI_ENABLED` (privzeto `false`), `AUCTIONS_{SODNEDRAZBE,GOVSI}_DAILY_LIMIT`, `AUCTIONS_REQUEST_SPACING_MS` (≥ 2000), `AUCTIONS_CACHE_SECONDS`, `AUCTIONS_TIMEOUT_MS`, `AUCTIONS_USER_AGENT`; test **najprej** v `apps/api/tests/unit/env.spec.ts` (privzetki, zavrnitev fake v produkciji, zavrnitev ne-https URL-ja)
- [ ] T007 [P] `.env.example` (prazne vrednosti) in `docs/env-reference.md` (razdelek 021) — samo dejansko dodane spremenljivke (FR-012)
- [ ] T008 [P] Ikona (npr. `hammer-outline`) v `apps/web/src/app/core/icons/register-icons.ts` + vrstica v `apps/web/tests/unit/icons.spec.ts`
- [ ] T009 [P] Cilj `specs/021-auction-scanner/contracts/openapi.yaml → scanners-auctions.d.ts` v `packages/contracts/scripts/generate.ts` in vrstica `redocly lint` v `.github/workflows/ci.yml`; zaženi generator
- [ ] T010 [P] Mapa fixtures `apps/api/tests/fixtures/auctions/` z `README.md` (kaj je sintetično in kaj resnično; brez osebnih podatkov)

## Phase 2: Foundational (blokira vse zgodbe)

**Cilj**: tipi, register virov, testni vir in prazen tip — vse z rdečimi testi najprej.

- [ ] T011 [P] Test registra virov `apps/api/tests/unit/auctions/source-registry.spec.ts`: `sodnedrazbe` = `manual` brez URL-ja / `partial` z URL-jem; `govsi` izklopljen z razlogom; `furs`, `ajpes` = `unavailable` z razlogom in `selectable=false`; `e-justice` = `reference`; odgovor ne vsebuje vrednosti skrivnosti, samo imena spremenljivk; vsak vir ima `verifiedAt`
- [ ] T012 [P] Test konfiguracije `apps/api/tests/unit/auctions/config.spec.ts`: Zod sprejme/zavrne (država `slo`, negativna cena, vir `furs` → napaka z razlogom, `aiEnabled` privzeto `false`, predloge `auctions|eu-auctions|liquidations` dajo različne privzetke, nespremenjen zagon)
- [ ] T013 Tipi `apps/api/src/modules/auction-scanner/domain/types.ts` (`AuctionAttributes`, `AuctionEvaluation`, `CostBreakdown`, `RiskFlag`, `Lifecycle`, `AlertFlags` po `data-model.md`; manjkajoče = `null`)
- [ ] T014 Register virov `apps/api/src/modules/auction-scanner/sources/{types,registry,reference,index}.ts` (`AuctionSourceInfo`, statusi, razlogi slovensko; `reference.ts` samo informacijski vnosi, **brez fetch**) — naredi T011 zelen
- [ ] T015 Konfiguracija `apps/api/src/modules/auction-scanner/config.ts` (Zod `AuctionsConfig`, `ValuationAssumptions`, predloge, `validateConfig(config, env)`) — naredi T012 zelen
- [ ] T016 Testni vir `apps/api/src/modules/auction-scanner/sources/fake.ts` (deterministična zaporedja stanj: nova → znižanje → preložitev → preklic → izginotje; sklop; dvojnik iz drugega vira; datum brez pasu; varščina v %), vklopljen samo z `AUCTIONS_FAKE_SOURCE_ENABLED`
- [ ] T017 Prazen tip `scanner-type.ts` + `index.ts` (`registerAuctionScannerType`, `execution:'single'`, `results:'generic'`, `allowedResultHosts` = gostitelji virov, `isEnabled`) in registracija v `apps/api/src/main.ts` (uvoz, `router.use`, `register…Type()`) in `apps/web/src/main.ts` — samo dodane vrstice
- [ ] T018 [P] Test meje `apps/api/tests/unit/scanner-core-boundary.spec.ts` ostane nespremenjen in zelen; dodaj preverjanje, da modul ne uvaža iz `lego-scanner`/`collectibles-scanner` (obstoječi `module-boundary.spec.ts` ga pokriva — samo zaženi)

**Checkpoint**: tip je registriran, viri so pošteno označeni, testi T011/T012 zeleni.

## Phase 3: US3 — Normalizirani podatki dražbe (P1) 🎯 temelj

**Cilj**: surovi odgovor → `AuctionAttributes`; manjkajoče `null`; datumi pravilni; dedup med viri.
**Neodvisen test**: fiksni surovi zapisi → pričakovani normalizirani zapisi.

### Testi (prvi, morajo pasti)

- [ ] T019 [P] [US3] `apps/api/tests/unit/auctions/normalize-dates.spec.ts`: datum brez pasu → `Europe/Ljubljana`, `assumedTimezone=true`; poletni/zimski čas (2026-03-29, 2026-10-25, vključno z dvoumno uro); datum z odmikom se ohrani; neveljaven datum → `null`; rok prijave po začetku → `dateInconsistent=true`, vrednosti nespremenjeni
- [ ] T020 [P] [US3] `apps/api/tests/unit/auctions/normalize-fields.spec.ts`: manjkajoča cenitev = `null` (ne 0, ne ''); varščina v % ohrani odstotek in znesek izračuna **samo** ob znani osnovi; način (`ONLINE`/`IN_PERSON`/`WRITTEN_BID`/`UNKNOWN`); valuta; sklop več predmetov → `multiLot=true`; `documents` ohranijo izvirne URL-je; številke v slovenskem zapisu ("5.546,00 €") brez zamenjave decimalk
- [ ] T021 [P] [US3] `apps/api/tests/unit/auctions/dedup.spec.ts`: ista šifra zadeve iz dveh virov → en zapis z dvema `sources[]`; različni zadevi z istim naslovom → dva; brez šifre → stabilen hash; stabilen `identity` med zagoni; spremembe se beležijo enkrat

### Implementacija

- [ ] T022 [US3] `domain/normalize.ts` (luxon, `Europe/Ljubljana`; naloga T019+T020 zelena)
- [ ] T023 [US3] `domain/dedup.ts` (kanonični `identity`, združevanje `sources[]`; T021 zelena)

**Checkpoint**: normalizacija in dedup sta zeleni neodvisno od virov.

## Phase 4: US2 — Preverjeni viri in poštena obravnava nedostopnih (P1)

**Neodvisen test**: fixtures virov → normalizirani zapisi; nedostopni viri onemogočeni; izpad vira ne podre zagona.

### Testi

- [ ] T024 [P] [US2] `apps/api/tests/unit/auctions/relevance.spec.ts`: splošna insolvenčna objava brez prodaje → izločena; objava s prodajo premoženja → `INSOLVENCY` dražba; GOV.SI nepomembna objava (npr. razpis za subvencije) → izločena z razlogom; "Javne dražbe" vrsta → dražba; "Stvarno premoženje – namera o oddaji" → ne dražba brez znakov prodaje
- [ ] T025 [P] [US2] `apps/api/tests/unit/auctions/sodnedrazbe-rss.spec.ts` (fixture `sodnedrazbe-synthetic.xml`): razčlenitev elementov, manjkajoča polja `null`, neveljaven XML → napaka `auctions:source-parse`, prazen vir ≠ napaka, nikoli HTML razčlenjevanje; fixture je izrecno označen sintetičen (T004)
- [ ] T026 [P] [US2] `apps/api/tests/unit/auctions/govsi.spec.ts` (fixtures: seznam + objava, preklicana objava, objava z dokumentom PDF, objava brez cene): polja iz strani, cena iz naslova se **ne** izlušči, status "preklicano" → `cancelled`, struktura se spremeni → glasna napaka `auctions:govsi-parse`, izklopljen vir se sploh ne kliče
- [ ] T027 [P] [US2] `apps/api/tests/integration/auctions/sources.spec.ts` (mock `fetch`): predpomnilnik, razmik zahtevkov, dnevna meja (prekoračena → delni rezultat + napaka), `robots`-skladen User-Agent, vir `furs`/`ajpes` se nikoli ne kliče, izpad enega vira → ostali vrnejo rezultate in `runErrors` navede vir, obstoječi rezultati niso označeni kot izginuli ob izpadu

### Implementacija

- [ ] T028 [US2] `domain/relevance.ts` (T024 zelena)
- [ ] T029 [US2] `sources/sodnedrazbe-rss.ts` prek `platform/external-sources` (T025, T027 zelena); URL-ji iz `AUCTIONS_SODNEDRAZBE_FEEDS`; brez nastavljenega → status `manual`
- [ ] T030 [US2] `sources/govsi.ts` (T026, T027 zelena); privzeto izklopljen; razmik, predpomnilnik, meja
- [ ] T031 [US2] `GET /api/v1/auctions-scanner/sources` in `/presets` v `router.ts` + obsegi + `apps/api/tests/contract/auctions/sources-presets.spec.ts` (oblika po `openapi.yaml`, avtentikacija: brez žetona 401, API ključ z obsegom deluje, brez skrivnosti v odgovoru)
- [ ] T032 [US2] `validateConfig`: nedostopen/neznan vir ali država → razlog (FR-005, FR-008); test v `config.spec.ts`
- [ ] T033 [P] [US2] Fixtures `apps/api/tests/fixtures/auctions/{sodnedrazbe-synthetic.xml,govsi-list.html,govsi-notice-cancelled.html,govsi-notice-with-pdf.html}` (sintetični, brez osebnih podatkov)

## Phase 5: US4 — Ocena priložnosti z izrecnimi predpostavkami (P1)

**Neodvisen test**: čista funkcija s fiksnimi vhodi.

### Testi

- [ ] T034 [P] [US4] `apps/api/tests/unit/auctions/evaluator.spec.ts`: vsi vhodi znani → vse postavke, dobiček, ROI, `estimate=true`; opazna cena = `currentBid ?? startingPrice` z oznako osnove; **cenitev brez `appraisalToMarketPct` ni tržna vrednost** → `insufficientData`; brez tržne vrednosti → `insufficientData` z `missing`; neznana provizija kupca/davek/prevoz ≠ 0 → `netProfit=null`, v `unknownCosts`; provizija kupca v % in v znesku; davek za neEU prodajalca neznan; valuta različna od nastavitve → ni primerjave
- [ ] T035 [P] [US4] `apps/api/tests/unit/auctions/deposit.spec.ts`: `credited` in `refundable` ne povečata skupnega stroška (`depositCounted=0`) — **nikoli dvakrat**; `non-refundable` šteje natanko enkrat; `unknown` ni strošek in doda opozorilo "ravnanje z varščino neznano"; varščina v % z neznano osnovo → znesek `null`
- [ ] T036 [P] [US4] `apps/api/tests/unit/auctions/max-bid.spec.ts`: iz predpostavk (`minProfit`, rezerva, provizije prodaje, prevoz, drugi stroški, provizija kupca, davek) izračunana ponudba; kontrola: pri ponudbi = `maxBid` je čisti dobiček ≥ `minProfit` (in < pri +1 koraku); višja rezerva → nižja ponudba; brez tržne vrednosti → `null`; zaokrožitev navzdol na `minimumBidIncrement`; negativna → `null` z razlogom; vedno `estimate:true`
- [ ] T037 [P] [US4] `apps/api/tests/unit/auctions/filters.spec.ts`: vsak filter iz FR-004 posebej (cena, cenitev, varščina, način, obdobje, rok prijave, država, regija, kategorija, ključne/izključene besede, `onlineOnly`, `requireAppraisedValue`, `endingWithinHours`); `minProfit`/`minDiscountPct` izločita rezultate brez znanega dobička/popusta; primer iz US1 (3.000/8.000/2.000)

### Implementacija

- [ ] T038 [US4] `domain/evaluator.ts` (`AuctionOpportunityEvaluator`; T034+T035 zelena)
- [ ] T039 [US4] `domain/max-bid.ts` (T036 zelena)
- [ ] T040 [US4] `domain/filters.ts` (T037 zelena)

## Phase 6: US1 — Iskanje po mojih kriterijih (P1) 🎯 MVP

**Neodvisen test**: zagon s testnim virom → rezultati z dražbenimi atributi, dve iskanji neodvisni.

### Testi

- [ ] T041 [P] [US1] `apps/api/tests/integration/auctions/run.spec.ts`: ustvari iskanje prek API-ja (tip `auctions`), ročni zagon s fake virom → rezultati z `attributes/evaluation/risks/lifecycle`; drugo iskanje ima drugačne rezultate; sprememba enega ne vpliva na drugo; preset `liquidations` predizbere vire/vrste, brez novega tipa; nepremičnina brez cenitve → `null`, ne 0
- [ ] T042 [P] [US1] `apps/api/tests/integration/auctions/auth-ownership.spec.ts`: brez žetona 401; uporabnik B ne vidi, ne zažene, ne bere rezultatov iskanja uporabnika A (404/403 po konvenciji 016); API ključ brez obsega 403; rezultati ne vsebujejo polj lastnika
- [ ] T043 [P] [US1] `apps/api/tests/integration/auctions/scheduler.spec.ts`: iskanje ima neodvisen cron in vklop/izklop (obstoječe jedro), ročni zagon, zgodovina zagonov, ponovitev po napaki vira, preprečitev prekrivanja (drugi zagon med tekočim → preskočen); **ni** drugega urnika (preveri, da modul ne registrira lastnega časovnika)
- [ ] T044 [P] [US1] `apps/api/tests/integration/auctions/source-failures.spec.ts`: vir vrne 500/timeout/neveljaven odgovor → zagon `partial`/`failed` z jasno kodo, ostali viri delujejo, obstoječi rezultati ostanejo `available`; dnevna meja → delni rezultat in napaka; shranjena nastavitev z odstranjenim virom → zagon se ne začne, jasno sporočilo

### Implementacija

- [ ] T045 [US1] `execute.ts`: cevovod viri → `normalize` → `dedup` → `filters` → `evaluator` → `risk`/`lifecycle` (stubi iz kasnejših faz so že pripravljeni z rdečimi testi) → `ctx.results.reconcile`; števci (`seen`, `skippedIrrelevant`, `sourceErrors`); `runErrors` s kodami `auctions:*`
- [ ] T046 [US1] `scanner-type.ts`: `describeConfig`, `validateConfig`, `allowedResultHosts`; `ai.describe` stub; T041–T044 zelena

## Phase 7: US5 — Kazalniki tveganja (P2)

### Testi

- [ ] T047 [P] [US5] `apps/api/tests/unit/auctions/risk.spec.ts`: vsaka od 10 kod posebej (`condition-unknown`, `no-inspection`, `no-documents`, `ownership-unclear`, `buyer-fees`, `short-registration` s pragom, `high-deposit` s pragom, `in-person-only`, `valuation-uncertain`, `few-comparables`); neznano stanje ni "slabo stanje"; **nobeno besedilo ne vsebuje besed prevara/goljufija/fraud** (tabelarni test čez vse kode); `severity` je samo `info|warn`

### Implementacija

- [ ] T048 [US5] `domain/risk.ts` (T047 zelena); integracija v `execute.ts`

## Phase 8: US6 — Sledenje življenjskemu ciklu (P2)

### Testi

- [ ] T049 [P] [US6] `apps/api/tests/unit/auctions/lifecycle.spec.ts`: razlika stanj → `postponed` (nov kasnejši začetek/konec, z obema datumoma), `cancelled`, `registration-changed`, `end-changed`, `documents-changed` (nov dokument), `price-changed` (začetna cena, ponudba), `status-changed`; brez spremembe → ni dogodka; **izginotje ni "zaključeno/prodano"**
- [ ] T050 [P] [US6] `apps/api/tests/integration/auctions/lifecycle-run.spec.ts`: zaporedni zagoni fake vira (nova → znižanje → preložitev → preklic → izginotje); rezultat ostane z zgodovino; po izginotju `availability=unavailable` in v UI-modelu "ni več objavljeno"; ponovna pojavitev ni "nova"; zadnja vidna ponudba ni označena kot končna cena

### Implementacija

- [ ] T051 [US6] `domain/lifecycle.ts` + `lifecycle-events.ts` (zastavice `AlertFlags` v `data.alerts`, `comparable` vsebuje lifecycle polja, da jedro označi `CHANGED`); T049+T050 zelena

## Phase 9: US7 — Obvestila (P2)

### Testi

- [ ] T052 [P] [US7] `apps/api/tests/unit/auctions/alerts.spec.ts` (nadzorovana ura): rok prijave čez N ur → natanko enkrat; začetek/konec čez N ur → enkrat; znižanje; preložitev; preklic; dokumenti; ocena prvič nad pragom → enkrat, ob padcu pod prag in ponovnem preboju zastavica ponastavljena; ponovni zagon brez spremembe → 0 dogodkov; rok že minil ob prvem zagonu → brez "bližajoč se"
- [ ] T053 [P] [US7] `apps/api/tests/integration/auctions/notifications.spec.ts`: dopis lastniku s pravimi razlogi (`payload.reasons`), brez dvojnikov med zagoni in znotraj dopisa; upoštevane obstoječe nastavitve obvestil (izklopljena obvestila → 0); drug uporabnik ne dobi tujih; `verify` zavrže postavko, ki ne drži več (npr. preklicana dražba po preložitvi); besedilo slovensko, brez trditve o končni ceni

### Implementacija

- [ ] T054 [US7] `notifications.ts` (`verify` + `render`) in `alert-plan` uporaba iz `platform/scanner/domain/alert-plan.ts`; T052+T053 zelena

## Phase 10: US8 — Izbirna analiza z UI (P3)

### Testi

- [ ] T055 [P] [US8] `apps/api/tests/integration/auctions/ai.spec.ts` (mock ponudnika): `aiEnabled=false` → **0 klicev** v vseh zagonih; `true` → analizirani samo obetavni (po filtrih); vhod ne vsebuje polj oseb; izhod ima strukturo 017, brez številskih denarnih polj; predpomnilnik: isti vhod → brez drugega klica; povezave na izvirne dokumente ostanejo v `data.attributes.documents`; manjkajoč ključ → jasno sporočilo, zagon sicer uspe

### Implementacija

- [ ] T056 [US8] `ai.describe` v `scanner-type.ts` (opis, dokumenti, vir; brez cen kot "dejstev" modela); T055 zelena

## Phase 11: US9 — Rezultati in podrobnosti (P2)

### Testi (komponentni, fiksni rezultati)

- [ ] T057 [P] [US9] `apps/web/tests/unit/auction-model.spec.ts`: pretvorba `Result.data` → pogled; `null` → "neznano"/"premalo podatkov", nikoli "0 €"; oznaka "ocena" samo na ocenah, potrjeni zneski brez nje; `UNAVAILABLE` → "ni več objavljeno"; način, roki, varščina; neznana varščina ≠ 0
- [ ] T058 [P] [US9] `apps/web/tests/unit/auction-ui.spec.ts`: čarovnik prikaže obrazec (vir z oznako nedostopen/ročna nastavitev, nemogoče izbrati `selectable=false`, države, predloga, filtri, predpostavke, stikalo UI privzeto izklopljeno); kartica kaže vsa polja iz zgodbe 9; podrobnosti ločijo "Potrjeni podatki vira" in "Ocena"; tveganja prikazana kot opozorila; brez slike → brez zlomljene slike

### Implementacija

- [ ] T059 [P] [US9] `apps/web/src/app/features/auction-scanner/auction.model.ts`
- [ ] T060 [US9] `scanner-ui.ts` + `auction-config.component.ts` (naloži `/auctions-scanner/sources|presets`); registracija `registerAuctionScannerUi()` v `apps/web/src/main.ts`
- [ ] T061 [US9] `auction-results.component.ts` (kartice) in `auction-detail.component.ts` (časovnica, pogoji, dokumenti, zgodovina cen, razčlenitev stroškov, ocena, tveganja, analiza UI); T057+T058 zelena

## Phase 12: Polish & regresija

- [ ] T062 [P] `docs/auction-scanner.md`: tabela virov z dejanskim stanjem (podprt/delno/ročno/nedostopen) in razlogom, vrata T-*, omejitve ("niso odprti podatki"), predpostavke ocenjevanja, kaj ocena NI (FR-036)
- [ ] T063 Test odstranitve tipa `apps/api/tests/integration/auctions/removal.spec.ts` po vzoru `echo-scanner`/`flight-deals/tab-removal.spec.ts`: skript začasno odstrani mapo modula + registracijske vrstice (v začasni kopiji), `tsc --noEmit` in eslint čista, ostali tipi tečejo (FR-034)
- [ ] T064 Regresijski paket: zaženi celoten `pnpm --filter api test` in `pnpm --filter web test`; LEGO, zbirateljski, echo, leti **nespremenjeni in zeleni**; `pnpm typecheck && pnpm lint`
- [ ] T065 Preveri `quickstart.md` scenarije 1–5 ročno/skriptno s fake virom; zapiši rezultat
- [ ] T066 Preveri, da noben test ne kliče omrežja (`fetch` je v testih vedno mock) in da `AUCTIONS_FAKE_SOURCE_ENABLED` v produkcijski konfiguraciji zavrne zagon (T006)
- [ ] T067 Ponovno `git status` skupnih datotek (T-sync) pred commitom; rebase na 019/020, če sta vmes pristala; konflikt rešen samo z ohranitvijo obeh dodanih vrstic

## Dependencies & Execution Order

- **Phase 0** (vrata) pred kodo, ki jih pogojuje: T001 pred vsem; T003 pred T029/T030; T004 pred zaključkom T029 (do tedaj sintetični fixture); T005 pred vklopom T030 v produkciji.
- **Phase 1 → 2** blokira vse zgodbe. Znotraj faz: test-naloge so pred implementacijo (rdeč → zelen).
- **Vrstni red zgodb** (po odvisnostih, ne po številkah): **US3** (normalizacija) → **US2** (viri) ∥ **US4** (ocenjevalnik, filtri) → **US1** (cevovod, MVP) → **US5** ∥ **US6** → **US7** (potrebuje US6) → **US8** → **US9** (UI potrebuje obliko podatkov iz US1/US4/US5/US6).
- Polish na koncu; T063/T064 šele ko so vse zgodbe zelene.

## Parallel Examples

```
# Phase 3 testi hkrati:     T019, T020, T021
# Phase 4 testi hkrati:     T024, T025, T026, T027 (+ T033 fixtures)
# Phase 5 testi hkrati:     T034, T035, T036, T037
# Phase 6 testi hkrati:     T041, T042, T043, T044
# Faza 7 in 8 vzporedno (različne datoteke): T047∥T049∥T050
```

## Implementation Strategy

1. **MVP = Phase 0–6 (US3, US2, US4, US1)**: tip deluje s testnim virom, viri so pošteno označeni, vrednotenje in filtri
   preverjeni, dve neodvisni iskanji. **Ustavi in validiraj** (quickstart 1–3) pred nadaljevanjem.
2. Nato tveganja (US5) in življenjski cikel (US6), obvestila (US7), AI (US8), UI (US9).
3. Realni viri (SodneDrazbe RSS, GOV.SI) se vklopijo šele po vratih T-sodne/T-gov; do takrat so testirani s fixtures in v UI
   pošteno označeni. FURS in AJPES ostaneta registrirana nedostopna (T002 je zapis, ne koda).

## Notes

- Vsaka test-naloga se mora ob prvem zagonu **izvršiti in pasti** (ne pasti zaradi napake uvoza); zabeleži to v opisu commita.
- Commit po logični skupini (test + implementacija); skupne datoteke samo z dodanimi vrsticami.
- Nobenega klica omrežja v testih; ura vedno iz `ctx.now`/nadzorovane ure.
