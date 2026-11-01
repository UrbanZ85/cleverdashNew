# Research: Zbirateljski skener (019)

Datum: 2026-10-21. Vsaka odločitev: **Odločitev / Razlog / Alternative**. Kar je preverjeno z živim klicem,
je označeno ✔; kar je iz dokumentacije ali spomina in ga je treba potrditi pred uporabo, je označeno ⚠.

## 1. Ponovna uporaba eBay povezave

**Odločitev**: generični del eBay odjemalca (žeton client-credentials, gradnja URL-ja iskanja, razčlenitev
`itemSummaries`, listanje strani) se izvleče v `apps/api/src/platform/ebay/`. Z njim se izvlečejo tudi
`http.ts` (predpomnjen prenos), `usage.ts` (dnevna meja), `pacer.ts` in model dnevne porabe, ker eBay
dnevna meja velja za **en aplikacijski ključ** — oba skenerja jo delita. LEGO ostane tanek ovoj
(kategorija `19006`, tipi `LegoMarketplace`, `LEGO_*` okolje) in njegovi testi ostanejo nespremenjeni.

**Razlog**: konektor je zdaj v `modules/lego-scanner/`, člen I pa prepoveduje uvoz med moduli. Kopiranje
bi podvojilo žeton, razčlenitev in dnevno mejo — in ob 2 skenerjih bi se meja štela dvakrat narobe.

**Tveganje**: `tests/integration/lego/sources.spec.ts` in `tests/unit/no-owner-fields.spec.ts` omenjata
`LegoSourceUsage`/`sources/http|usage`. Če je ime zbirke ali pot uvoza v testih, ohranimo
`lego-scanner/sources/http.ts` in `models/lego-source-usage.model.ts` kot **ponovni izvoz** (alias) —
testi se ne spremenijo. Odločitev ob nalogi T001 (preberi teste, nato izvleči).

**Alternative**: (a) kopija v modulu — zavrnjeno (podvajanje); (b) uvoz iz `lego-scanner` — kršitev člena I.

## 2. Ponovna uporaba aritmetike priložnosti in odločitev o dogodkih

**Odločitev**: čisti jedri izvlečemo v `platform/scanner/domain/`:
- `opportunity-math.ts` — skupni strošek, konservativna vrednost, provizije, rezerva, dobiček, ROI,
  `EU_COUNTRIES`, `round2`, `scoreFor`; vhod so parametri (`sellingFeePct`, `riskReservePct`,
  `conservativeDiscountPct`, `buyerFeePct`) in "osnova vrednosti".
- `alert-plan.ts` — današnji `planEvent` brez LEGO tipov (zastavici `profitNotified`, `auctionEndingNotified`).

`lego-scanner/domain/opportunity.ts` in `events.ts` postaneta tanka ovoja z **enakim izhodom**.

**Razlog**: matematika je splošna, razlikujejo se samo parametri (FR-019). Test meje jedra
(`scanner-core-boundary`) zahteva, da jedro ne pozna imen tipov — funkcije so zato poimenovane splošno,
brez besed "lego"/"collectibles".

**Alternative**: kopija v zbirateljskem modulu — zavrnjeno; seznam EU držav in zaokroževanje bi se razšla.

## 3. Katalog Pokémon kartic: TCGdex

**Odločitev**: TCGdex REST (`https://api.tcgdex.net/v2/{lang}/…`), brez ključa, edini katalog.

✔ Preverjeno (21. 10. 2026, živ klic):
- `GET /v2/en/cards?name=Charizard` vrne JSON seznam `{id, localId, name, image?}`.
- `GET /v2/en/cards/base1-4` vrne: `id`, `localId`, `name`, `rarity`, `set{id,name,cardCount{official,total}}`,
  `variants{firstEdition,holo,normal,reverse,wPromo}`, `variants_detailed[]` (type/subtype/stamp/thirdParty,
  po različici tudi `pricing`), `updated`, `pricing.cardmarket{updated,unit,avg,low,trend,avg1,avg7,avg30,
  *-holo}`; `pricing.tcgplayer` je lahko `null`.
- `GET /v2/ja/cards/base1-4` → **404**: japonski katalog ima **druge id-je setov**. Potrjuje pravilo
  "japonska ≠ angleška": jezik je del ključa kataloga, ne ločljiva lastnost iste kartice.

⚠ Ni potrjeno (uradna stran ne navaja): licenca podatkov, omejitve hitrosti, sintaksa filtrov in
paginacije (`tcgdex.dev/rest/filter-sort-paginate` → 404 pri meni). Ob nalogi T0xx preberi repozitorij
`tcgdex/cards-database` in zapiši v ta razdelek; do takrat skener uporablja konzervativen razmik
(1 zahteva / 250 ms), dnevno mejo in predpomnilnik 30 dni za katalog.

**Cene TCGdex so ocene** (Cardmarket povprečje/trend, TCGplayer): `basis: 'estimate'`, nikoli prodaja
(FR-017). `pricing.updated` se prikaže kot starost podatka.

**Zavrnjeno**: Pokémon TCG API — `docs.pokemontcg.io` pravi: zastarel, nove registracije zaprte, ključi
delujejo do 1. 3. 2027, napoteni na Scrydex. Datuma konca iz drugega vira nisem mogel potrditi (Scrydex FAQ
ga ne navaja), a že zaprte registracije izključijo vir. Scrydex je plačljiv in ni potreben.

## 4. Cenik retro iger: PriceCharting (izbirno)

**Odločitev**: `PriceSource` za PriceCharting, vklopljen samo ob `PRICECHARTING_API_KEY`.
Znano iz dokumentacije (⚠ stran je vrnila 403 na `WebFetch`, vsebino sem dobil prek iskalnika): plačljiva
naročnina, 40-znakovni žeton v parametru `t`, osnova `https://www.pricecharting.com`, pot `/api/product`,
odgovor JSON, samo HTTPS. Pogoji ponovne uporabe podatkov in dostopnost zgodovine cen **niso preverjeni**.

⚠ Varnost (člen IV): žeton je v poizvedbi `t=…`, torej bi pristal v `ExternalCache.sourceUrl` in dnevniku.
Ker ga vir zahteva v URL-ju, mora skupni `fetchCachedJson` sprejeti `sourceUrl` BREZ žetona (kot pri
BrickLink) in ga dodati šele v `buildRequest`. To je pogoj pred prvim klicem.

**Klasifikacija podatka**: cene PriceCharting so **vodnik** (`basis: 'guide'`, ocena), ne seznam prodaj.
Brez potrditve, da vir vrača posamezne prodaje, se **ne** šteje za "preverjeno prodajo".

**Alternative**: ročni vnos cen / CSV — izven obsega; eBay Marketplace Insights (prodani oglasi) — dostop je
omejen in zahteva odobritev eBay; ni predpostavljen.

## 5. Posledica odločitve 4: preverjene prodaje v v1 nimajo vira

Spec (US3, FR-018) pravi: dobiček samo iz **preverjenih prodaj**. Dovoljeni viri v tem obsegu
(TCGdex, PriceCharting, aktivni eBay oglasi) ne dajejo preverjenih prodaj. Zato je v v1 **dobiček
praviloma neznan** za vse rezultate, razen če se kasneje doda vir prodaj (npr. eBay Marketplace Insights po
odobritvi, ali PriceCharting, če se dokaže, da vrača prodaje).

**Odločitev**: izvedemo celoten model (`basis: 'sold' | 'guide' | 'estimate' | 'asking'`, izračun dobička,
dogodki, prag) in ga pokrijemo s testi z umetnim virom `sold`, a v produkciji brez takšnega vira so
rezultati: ocena + popust do ocene + "dobiček neznan: ni preverjenih prodaj". Interface
`PriceSource.basis` omogoča, da nov vir prodaj vklopi dobiček brez sprememb kode.

**Popust do ocene**: izračuna se in je označen z osnovo (`discountBasis`). Filter `minDiscountPct` deluje
na vsaki osnovi, ki ni `asking`; `minProfit` in prag obvestila `notifyMinProfit` samo na znan dobiček.
Obvestilo "podcenjeno" brez dobička: samo če lastnik nastavi `notifyMinDiscountPct` (označeno "do ocene").
`score` (že obstaja v `Opportunity`, LEGO `scoreFor`) je `null`, kadar dobiček ni znan — nova ocena se
ne uvaja (FR-022).

⚠ To je najpomembnejši posledični zaključek načrta in je izrecno predstavljen lastniku.

## 6. Aktivne primerljive cene

Iz oglasov istega zagona (isti ključ različice, ≥ 3 oglasi, ista valuta, brez odstopanj) se izračuna
`asking` mediana. Prikazana je kot "zahtevane cene", **nikoli** ne vstopi v izračun vrednosti ali dobička.

## 7. eBay kategorije in atributi za kartice in retro igre ⚠

Spomin (ni preverjeno, ne zakodirati brez potrditve): *CCG Individual Cards* ≈ `183454`, *Video Games* ≈
`139973`, *Video Game Consoles* ≈ `139971`. Pot potrditve: eBay Taxonomy API (`get_default_category_tree_id`
→ `get_category_suggestions`) z obstoječim aplikacijskim žetonom, ali živ test iskanja.
Do potrditve je iskanje **brez** `category_ids` in z besedami kategorije v `q`; ID-ji so konstante v
registru kategorij, popravljive brez spremembe logike. Ocenjene kartice imajo pri eBay `conditionId`
"Graded" (2750) ⚠ in `conditionDescriptors` (ocenjevalec, ocena) ⚠ — ali jih vrne `item_summary/search`
ali samo `getItem`, je treba preveriti; osnova je razčlenitev naslova (PSA/BGS/CGC + ocena), opisnik je
dopolnilo. Brez podatka ostane ocena "neznana".

## 8. Prepoznava kartic (čista funkcija)

Razčlenitev naslova: ime, številka (`4/102`, `004/102`, `#4`), set (iz besedila), jezik (EN/DE/FR/IT/ES/JP in
besede "japanese"/"japanisch"/"jap."), izdaja (`1st edition`/`1. Edition`/`shadowless`), `reverse holo`/`holo`,
ocenjevalec in ocena (`PSA 9`, `BGS 9.5`, `CGC 10`), zapečatenost (`booster`, `ETB`, `sealed`/`OVP`).
Katalog: poizvedba po imenu v jeziku oglasa, filtriranje po `localId` in setu.
- **visoko**: ime + številka + set se ujemajo z natanko eno kartico;
- **srednje**: ime + številka se ujemata, set ni naveden ali je več setov z isto številko;
- **nizko/ročni pregled**: samo ime, ali več kandidatov brez razločevalnika.
Ključ primerjave (`variantKey`) = `catalogId | jezik | izdaja | holo/reverse | ocenjevalec+ocena | raw`.
Dve kartici z različnim `variantKey` se **nikoli** ne primerjata.

## 9. Prepoznava retro iger (čista funkcija)

Platforme in njihovi vzdevki (NES, SNES, N64, GB/GBC/GBA, Mega Drive/Genesis, PS1…); regija (PAL/NTSC/NTSC-J,
besede "EUR", "USA", "JAP"); popolnost (`loose`/`cart only`/`disc only`, `CIB`/`komplett`/`mit OVP und Anleitung`,
`sealed`); delovanje (`defekt`/`for parts`/`not working`/`getestet`); reprodukcija (`repro`, `reproduction`,
`custom`, `bootleg`, `fan made`). Ključ = `platform | title | region | edition | completeness`.
Z `PRICECHARTING_API_KEY` se ime potrdi v katalogu (`/api/products?q=`) ⚠ (oblika odgovora ni preverjena);
brez ključa je prepoznava samo iz besedila: največ **srednje**, ocena vrednosti ni.

## 10. Rezerva za tveganje po kategoriji

Parametri so ocene lastnika (env), ne dejstva. Rezerva = osnova kategorije + dodatki:
`COLLECTIBLES_RISK_RESERVE_PCT_CARDS`, `…_RETRO`, + `COLLECTIBLES_RISK_UNVERIFIED_GRADE_PCT` (ocena brez
potrjenega certifikata), + `COLLECTIBLES_RISK_REPRO_SUSPECT_PCT` (opis je dvoumen). Reprodukcija
**ni** rezerva, ampak izločitev: ni ocene priložnosti.

## 11. Pogodba za obrazec: kategorije s strežnika

**Odločitev**: strežnik izpostavi `GET /collectibles-scanner/categories` (polja, enumi, slovenske oznake) in
`GET /collectibles-scanner/sources`. Angular obrazec se zgradi iz opisa. Dodajanje kategorije = vnos v
strežniški register (+ Zod shema), brez spremembe odjemalca (FR-003).
**Alternative**: ločen obrazec na kategorijo v Angularju — zavrnjeno (dvojno vzdrževanje oblik).

## 12. Generalizacija tržnic in valut

`LEGO_MARKETPLACES` je zakodiran na DE/IT. Skupno jedro sprejme `marketplace: string`; zbirateljski
skener dovoli presek `EBAY_MARKETPLACES` z `['EBAY_DE','EBAY_IT','EBAY_FR','EBAY_ES']`. Tržnice izven EU
(GB, US) niso v obsegu: davki bi bili neznani, valute drugačne.

## 13. Okolje

Nove spremenljivke (vse s privzetkom; ključi prazni = vir izklopljen): `PRICECHARTING_API_KEY`,
`PRICECHARTING_URL`, `TCGDEX_URL`, `COLLECTIBLES_FAKE_SOURCE_ENABLED` (v produkciji zavrnjen),
`COLLECTIBLES_{EBAY,TCGDEX,PRICECHARTING}_DAILY_LIMIT`, `COLLECTIBLES_{CATALOG_CACHE_DAYS,PRICE_CACHE_HOURS,
LISTING_CACHE_SECONDS}`, `COLLECTIBLES_EBAY_MAX_PAGES`, `COLLECTIBLES_MAX_CATALOG_LOOKUPS_PER_RUN`,
`COLLECTIBLES_MAX_VALUATIONS_PER_RUN`, `COLLECTIBLES_TIMEOUT_MS`, `COLLECTIBLES_SELLING_FEE_PCT`,
`COLLECTIBLES_CONSERVATIVE_DISCOUNT_PCT`, `COLLECTIBLES_BUYER_FEE_PCT`, rezerve (§10). `EBAY_*` in
`OPENAI_*` se ponovno uporabijo.

## 14. Kakovostna vrata, ki v tej funkcionalnosti nimajo predmeta (ustava, vrata 2)

| primer iz ustave | stanje | nadomestni primeri |
|---|---|---|
| prehod poletni/zimski čas | **ima predmet**: dnevna meja virov in "dražba se izteka" | test `usageDay` ob prehodu 2026-10-25 in dražba, ki poteče čez prehod |
| praznik na delovni dan | nima predmeta (ni delovnega koledarja) | — |
| dopust čez mejo meseca | nima predmeta | — |
| neuspel klik, ki se uspešno ponovi | nima klika; ekvivalent: **neuspela zahteva vira, ki uspe ob naslednjem zagonu** | izpad oglasov (rezultati ostanejo), 429, dnevna meja, star predpomnilnik |
