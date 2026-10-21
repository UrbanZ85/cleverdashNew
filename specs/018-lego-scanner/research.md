# Research: LEGO skener (018)

Odločitve z razlogi. Stanje kode: konec 017 (21. 10. 2026). Preverjanje zunanjih API-jev je
opisano pri vsakem viru; kjer uradne dokumentacije ni bilo mogoče prebrati strojno, je to
zapisano in oblika odgovora se potrdi z mock odgovori in ob prvem pravem klicu.

## §1 — Tip `lego`: `single` + `generic`, v `modules/lego-scanner`

**Odločitev.** Modul `apps/api/src/modules/lego-scanner/` registrira `ScannerType<LegoConfig>` z
`execution: 'single'`, `results: 'generic'`, `isEnabled: () => true`; en klic v `main.ts` in en v
`apps/web/src/main.ts`. Jedro se ne spremeni (test meje `scanner-core-boundary` ostane zelen).

**Razlog.** Vsako iskanje ima svoje filtre in svoj urnik — to je `single`; rezultat pripada enemu
iskanju (zaseben, lastnik) — to je generična shramba (016 research §5). `isEnabled` je vedno
`true`, ker mora tip biti izbiren tudi brez ključev: obrazec in zagon povesta, kaj manjka (FR-005
spec, US1.3); `loadEnv` tu nima kaj zavrniti, ker je edina nevarna nastavitev testni vir.

**Zavrnjeno.** (a) `batch` kot leti: viri niso skupni med uporabniki na način, ki bi ga združevanje
poizvedb poplačalo (iskanja so po setih in ključnih besedah); (b) lastna shramba: nobena lastnost
LEGO oglasov ni skupna več uporabnikom.

## §2 — Viri: opis zahteve + čista razčlenitev + skupni predpomnilnik

**Odločitev.** Isti dogovor kot `modules/flight-deals/providers` (015 research §8): vir NE
prenaša sam; `sources/http.ts` izvede zahtevo prek `platform/cache/getOrRefresh` z lastnim
TTL, semaforjem in razmikom; razčlenitev je čista funkcija nad telesom odgovora in se testira
brez omrežja. Vsak vir ima dnevno mejo zahtev (rezervacija v bazi, `LegoSourceUsage`).

| vir | vloga | predpomnilnik | privzeta dnevna meja |
|---|---|---|---|
| Rebrickable | katalog, teme | set 30 dni, teme 30 dni, iskanje po imenu 7 dni | 2000 |
| BrickLink | cenik (prodaje, aktivne ponudbe) | 24 ur | 1000 (uradno ~5000) |
| eBay Browse | aktivni oglasi | 15 minut | 4000 (uradno 5000) |

**Stare (`stale`) vsebine.** Katalog in cenik sta počasna podatka: `stale` odgovor se uporabi, a
vrednost dobi znižano zaupanje in opombo "podatek je star". Oglasi so hitri podatek: `stale`
pomeni neuspel prenos → vir za ta zagon ni uspel (`sourceSucceeded: false`, ničesar ne označimo kot
nedosegljivo), isto kot pri letih (015 FR-018).

## §3 — Rebrickable (katalog)

Preverjeno v uradni dokumentaciji (21. 10. 2026): ključ v glavi `Authorization: key <ključ>`;
seznami so paginirani (`page`, `page_size` do 1000); povprečno ~1 zahteva/s, ob prekoračitvi 429
(ignoriranje vodi v ban IP) → razmik 1100 ms, en vir naenkrat. Končne točke iz OpenAPI dokumenta
(`/api/v3/swagger/?format=openapi`): `GET /api/v3/lego/sets/` s `search`, `theme_id`, `min_year`,
`max_year`, `min_parts`, `max_parts`, `ordering`, `page`, `page_size`; `GET /api/v3/lego/sets/{set_num}/`;
`GET /api/v3/lego/themes/`. **Oblika odgovorov ni v OpenAPI dokumentu**; polja `set_num`, `name`,
`year`, `theme_id`, `num_parts`, `set_img_url`, `set_url` so iz javne dokumentacije in se potrdijo
ob prvem pravem klicu (razčlenitev je tolerantna: manjkajoče polje = izpuščen atribut).
Rebrickable NI vir cen in ne pove, ali je set upokojen → filter "upokojen" se v 018 ne
uveljavlja (FR-003 spec: samo kadar vir zanesljivo pove); polje `retired` ostane neizpolnjeno.

Številka seta v katalogu je `75192-1` (številka + `-` + različica); normalizacija (§6) vedno
izdela to obliko.

## §4 — BrickLink (cenik)

OAuth 1.0 s podpisom HMAC-SHA1 (štiri vrednosti: consumer key/secret, token value/secret; podpis
sestavimo z `node:crypto`, brez odvisnosti). **Registracija IP naslova strežnika** v BrickLink
računu je pogoj; brez nje API vrne napako dostopa → izid `unreachable` z navodilom. Končna točka:
`GET https://api.bricklink.com/api/store/v1/items/SET/{set_num}/price` s parametri
`guide_type=sold|stock`, `new_or_used=N|U`, `currency_code=EUR`. Odgovor: `data.avg_price`,
`min_price`, `max_price`, `qty_avg_price`, `unit_quantity` (število prodaj/ponudb),
`total_quantity` (kosi), `price_detail[]` (posamezne vrstice; pri `sold` z datumom).
Številke prihajajo kot nizi. **Uradne strani (JS) nisem mogel prebrati strojno**, oblika je iz
poznavanja API-ja; v kodi je zato razčlenitev tolerantna in obvezna številska validacija
(`Number.isFinite`), prva prava zahteva pa bo potrdila ali popravila mock odgovore (T-naloga
"potrditev po prvi pravi zahtevi" ostane v quickstartu).

Prodaje (`sold`, zadnjih 6 mesecev) in aktivne ponudbe (`stock`) sta **ločena klica in ločeni
polji**; aktivne ponudbe nikoli ne vplivajo na tržno vrednost (FR-014). Mediana se računa samo iz
`price_detail` (tehtana s količino); če vira ne da, mediane ni. Dnevna meja 1000 zahtev (en set =
največ 3 zahteve: sold N, sold U, po potrebi stock).

## §5 — eBay Browse (oglasi)

`GET https://api.ebay.com/buy/browse/v1/item_summary/search`; aplikacijski žeton prek
**client credentials** (`POST /identity/v1/oauth2/token`, Basic client_id:secret,
`grant_type=client_credentials`, scope `https://api.ebay.com/oauth/api_scope`), shranjen samo
v pomnilniku do izteka (ni skrivnost v bazi, ni v `ExternalCache`). Glave: `Authorization:
Bearer`, `X-EBAY-C-MARKETPLACE-ID: EBAY_DE|EBAY_IT`. Filtri (uradna dokumentacija): `price:[a..b]`,
`priceCurrency`, `conditionIds:{1000|1500}`, `buyingOptions:{FIXED_PRICE|AUCTION}`,
`itemLocationCountry:XX`, `deliveryCountry:SI`; privzeto vrne samo FIXED_PRICE, zato so dražbe
vedno izrecno v `buyingOptions`. Stran do 200, `LEGO_EBAY_MAX_PAGES` (privzeto 2). Polja povzetka:
`itemId`, `title`, `price`, `condition`/`conditionId`, `buyingOptions`, `itemWebUrl`,
`image.imageUrl`, `itemLocation.country`, `shippingOptions[].shippingCost`, `itemEndDate`,
`currentBidPrice`, `bidCount`. Stari Finding/Shopping API sta od 5. 2. 2025 ugasnjena; Browse je
edina možnost. Obstoječega eBay konektorja ni v repozitoriju (preverjeno z iskanjem) → nov, v
tem modulu, z imenom okolja `EBAY_*` (ne `LEGO_*`), da ga bo bodoči tip lahko uporabil.

Poštnina: samo `FIXED` stroški iz `shippingOptions`; `CALCULATED` ali brez možnosti = **neznana**
(ne 0). `deliveryCountry:SI` je filter dostave v Slovenijo (FR-010); `sellerCountries` je filter
`itemLocationCountry`.

## §6 — Čista domena

- **Številka seta** (`domain/set-number.ts`): iz niza izlušči kandidate z regexom `\b\d{4,6}(-\d)?\b`
  (ne datumov, ne letnikov 19xx/20xx brez konteksta LEGO, ne EAN dolžine ≥ 8), normalizira v
  `NNNNN-V`. Več različnih kandidatov = dvoumno (→ paket ali ročni pregled).
- **Vrsta oglasa** (`domain/classify.ts`): večjezična pravila (de/it/en/sl) za `PARTS`, `MINIFIG`,
  `BUNDLE`, `EMPTY_BOX`, `INCOMPLETE`, `COMPLETE`, `SEALED`, `OPEN_BOX`; vrstni red pravil je
  dokumentiran in testiran (prazna škatla in deli prej kot set).
- **Identifikacija** (`domain/identify.ts`): številka v naslovu → katalog (visoko; brez kataloga
  srednje, "številka ni potrjena v katalogu") → normaliziran naslov = ime seta v katalogu
  (srednje) → tema+naslov (nizko, ročni pregled) → AI (samo dodatek, nikoli edina podlaga).
  Več kandidatov = ročni pregled.
- **Stanje** (`domain/condition.ts`): eBay `conditionId` 1000 = `NEW_SEALED` (eBay definira
  "nov, neodprt, v originalni embalaži"), 1500 = `NEW_OPEN_BOX`, 7000 = `PARTS_ONLY`, rabljeno
  (2750–6000) = `USED_COMPLETE` samo če besedilo nedvoumno pravi "komplett/complete/completo" in ni
  nikjer "fehlt/missing/mancano/unvollständig", `USED_INCOMPLETE` če pravi nasprotno, sicer
  `UNKNOWN` (FR-004). `completenessVerified` je `true` samo ob izrecni navedbi.
- **Vrednotenje** (`domain/valuation.ts`): vhod = odgovor cenika po stanju (novo/rabljeno);
  izhod = `{ basis: 'sold', average, median?, salesCount, periodMonths: 6, currency, activeListings?:
  {…} , confidence, stale }`. Zaupanje: ≥ 10 prodaj visoko, 3–9 srednje, 1–2 nizko, 0
  `insufficient`; `stale` zniža za eno stopnjo. Rabljen oglas z `UNKNOWN`/`USED_INCOMPLETE` stanjem
  se vrednoti **kot rabljen**, nikoli kot nov, a brez ocene priložnosti (kompletnost ni
  preverjena) — FR-017.
- **Priložnost** (`domain/opportunity.ts`): `acquisitionCost = cena + poštnina + davki +
  provizija kupca`; `conservativeValue = vrednost × (1 − LEGO_CONSERVATIVE_DISCOUNT_PCT)`;
  `sellingFees = conservativeValue × LEGO_SELLING_FEE_PCT`; `riskReserve = acquisitionCost ×
  LEGO_RISK_RESERVE_PCT`; `profit = conservativeValue − sellingFees − riskReserve −
  acquisitionCost`; `roi = profit / acquisitionCost`. Vsaka vhodna vrednost je lahko `null`;
  kadar manjka cena, poštnina, vrednost, zaupanje vrednosti je `insufficient`, identiteta je
  ročni pregled ali stanje ni primerljivo, je `profit = null` z razlogom. `score` (0–100) =
  ustrezno omejena kombinacija ROI (70 %) in zaupanja (30 %); brez dobička `null`.
- **Davki**: prodajalec iz EU → 0 (cena vsebuje DDV prodajalca); prodajalec izven EU ali neznana
  država → `taxes = null` → dobiček ni izračunan ("davki niso znani"). Uporabnik v Sloveniji
  nakupuje v EU, zato je privzeti primer izračunljiv.

## §7 — Obvestila, ponovitve in pragovi (jedro ima samo NEW/PRICE_*/CHANGED)

Generična shramba zazna spremembo samo po ceni (ob ceni se `comparable` ne upošteva). Zato tip
sam odloči, kateri **dogodki** gredo v dopis, in jih sestavi **pred** `reconcile` (obstoječe
rezultate prebere iz `ScannerResultModel`, spremembo ugotovi z `detectChange`, v `data.alerts`
nosi zastavici `profitNotified` in `auctionEndingNotified`, ki sta del `data` torej
preživita med zagoni). Dogodek nastane, kadar:

1. nov oglas ali pocenitev/podražitev in (ni praga ali dobiček ≥ prag),
2. dobiček je ta zagon prvič nad pragom in `profitNotified` še ni (podcenjena najdba),
3. dražba se izteka v `auctionEndingHours` in `auctionEndingNotified` še ni.

Zastavica `profitNotified` se ponastavi, ko dobiček pade pod prag, da je ponovni prehod nov
dogodek. Vsi dogodki nosijo en dogodek na rezultat z `reasons[]`; dopis (jedro) združi po
`resultRef`.

## §8 — Dnevna meja vira: `LegoSourceUsage`

Isti vzorec kot `scanner-ai-usage` (017): en zapis na (vir, dan Europe/Ljubljana),
atomaren `findOneAndUpdate` z `requests < limit`; presežek = preskok brez napake in sporočilo
"dnevna meja vira dosežena". Posamezen klic šteje, ne zagon (za razliko od neuradnega vira
letov): viri so uradni z dokumentiranimi mejami.

## §9 — UI: lasten prikaz rezultatov in obrazec prek registra

`registerLegoScannerUi()` registrira `configComponent` (2. korak čarovnika, izpolni
`ScannerConfigForm`) in `resultsComponent` (kontejner da `results` s `data` iz API-ja; komponenta
izriše kartice in ob kliku razširi podrobnosti, ker `data` že nosi vse — zgodovina cen pride iz
splošnega `GET /scanners/{id}/results/{resultId}`). Dostopnost virov (`GET /lego-scanner/sources`,
da/ne, brez skrivnosti) pove obrazec ob stikalih virov in zagon pove v `runErrors`.

## §10 — AI (017)

Tip poda `ai: { subject, describe }`: vhod iz naslova, stanja, ocene vrednosti in kataloga;
slike samo `https` s `ebayimg` (ob `SCANNER_AI_IMAGES`). Subject vsebuje prepoved: ne trdi
pristnosti iz slik, ne ocenjuj cen. Kandidati so vsi shranjeni rezultati (že filtrirani po
iskanju); privzeti kavlji jedra shranijo analizo na `ScannerResult.aiAnalysis`.

## §11 — Okolje

| spremenljivka | privzeto | vloga |
|---|---|---|
| `REBRICKABLE_API_KEY` | prazno | ključ kataloga (izklop, če prazno) |
| `BRICKLINK_CONSUMER_KEY`, `_CONSUMER_SECRET`, `_TOKEN`, `_TOKEN_SECRET` | prazno | vsi štirje, sicer vir izklopljen |
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | prazno | aplikacijski ključ eBay |
| `EBAY_MARKETPLACES` | `EBAY_DE,EBAY_IT` | dovoljene tržnice namestitve |
| `REBRICKABLE_URL`, `BRICKLINK_URL`, `EBAY_API_URL` | uradne osnove | za teste/združljive strežnike |
| `LEGO_FAKE_SOURCE_ENABLED` | `false` | testni vir; produkcija zavrne |
| `LEGO_REBRICKABLE_DAILY_LIMIT` / `LEGO_BRICKLINK_DAILY_LIMIT` / `LEGO_EBAY_DAILY_LIMIT` | 2000 / 1000 / 4000 | dnevne meje zahtev |
| `LEGO_CATALOG_CACHE_DAYS` / `LEGO_PRICE_CACHE_HOURS` / `LEGO_LISTING_CACHE_SECONDS` | 30 / 24 / 900 | TTL predpomnilnika |
| `LEGO_EBAY_MAX_PAGES` / `LEGO_MAX_VALUATIONS_PER_RUN` / `LEGO_MAX_NAME_LOOKUPS_PER_RUN` | 2 / 30 / 20 | meje na zagon |
| `LEGO_SELLING_FEE_PCT` / `LEGO_RISK_RESERVE_PCT` / `LEGO_CONSERVATIVE_DISCOUNT_PCT` / `LEGO_BUYER_FEE_PCT` | 12 / 5 / 10 / 0 | parametri izračuna priložnosti (ocene, ne dejstva) |
| `LEGO_TIMEOUT_MS` | 15000 | ena zahteva |
