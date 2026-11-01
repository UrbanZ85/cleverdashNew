# Research: Dražbeni skener (021)

**Datum raziskave**: 2026-10-21. Orodje za branje strani (WebFetch) vrača le povzetek, ne surovega HTML-ja,
zato je za vsak vir zapisano, kaj je **potrjeno** (z navedbo vira), kaj je **izpeljano** in kaj je
**nepreverjeno**. Nič ni izmišljeno; kar ni preverjeno, je označeno in ima v načrtu vrata preverjanja (T-gate).

## 1. Povzetek stanja virov

| vir | uradni naslov | izdajatelj | strojno berljiv dostop | prijava | stanje v v1 |
|---|---|---|---|---|---|
| SodneDrazbe.si | `sodnedrazbe.si` | Vrhovno sodišče RS (potrjeno, e-Justice) | RSS za shranjene iskalne parametre (potrjeno, e-Justice); **URL vira in oblika nista preverjena**; uradna obvestila **niso odprti podatki** | brez za branje (nepreverjeno za RSS) | **ročna nastavitev**: lastnik prilepi URL svojega RSS vira |
| FURS eDražbe | `furs.edrazbe.si` (**ne** `edrazbe.fu.gov.si`) | Finančna uprava RS | ni znanega vira; stran ni bila berljiva | objavo ureja le uredniki FURS prek SI-PASS; javni ogled nepreverjen | **nedostopen**; pokritost posredno prek GOV.SI (§4) |
| AJPES e-Objave | `ajpes.si` (e-Objave, e-INSOLV) | AJPES | brez dokumentiranega javnega API-ja; podrobnosti primera XML/PDF znotraj portala | **registracija z uporabniškim imenom in geslom** | **nedostopen** (zahteva prijavo; ne obidemo) |
| GOV.SI javne objave | `gov.si/zbirke/javne-objave/` | Vlada RS (portal GOV.SI) | HTML zbirka s filtri; `sitemap.xml` naveden v robots; RSS ni omenjen; API ni omenjen | brez | **delno**: pogojeno z vrati T-gov (pogoji ponovne uporabe niso potrjeni), privzeto izklopljeno |
| e-Justice | `e-justice.europa.eu` | Evropska komisija | enotnega API-ja ni | – | **samo referenca** (povezave, brez konektorja) |

## 2. SodneDrazbe.si

- **Potrjeno** (e-Justice, stran "Na katerih spletiščih se objavijo uradna obvestila?", SL): sodisce.si in
  sodnedrazbe.si omogočata spremljanje iskalnih parametrov prek RSS; "uradna obvestila na spletiščih sodisce.si
  in sodnedrazbe.si niso na voljo kot odprti podatki"; objava je brezplačna.
- **Potrjeno** (iskanje): portal upravlja in vzdržuje Vrhovno sodišče RS.
- **Potrjeno**: `robots.txt` = `User-agent: *` / `Disallow:` (nič prepovedanega).
- **Nepreverjeno**: točen URL RSS vira, polja v virih (cena, cenitev, varščina, rok prijave, dokumenti), paginacija,
  pogoji uporabe, omejitve hitrosti, svežina. `sitemap.xml` in glavna stran se prek orodja nista izpisali
  (verjetno odjemalsko upodobljena stran).
- **Odločitev**: konektor je **samo RSS** (`AUCTIONS_SODNEDRAZBE_FEEDS`, seznam URL-jev vira, ki jih lastnik ustvari
  v portalu). Brez nastavljenega vira je vir "ročna nastavitev". Polja, ki jih RSS ne vsebuje (cenitev, varščina,
  rok prijave …), ostanejo `null`; nič se ne izlušči iz ugibanja. Brez razčlenjevanja HTML strani portala.
- **Ker "niso odprti podatki"**: uporaba je osebna, nizka frekvenca, brez ponovne objave; v dokumentaciji opozorilo.
- **Vrata T-sodne**: ob prvi izvedbi lastnik prilepi pravi URL vira; test z dejanskim odgovorom (shranjen kot
  fixture, brez osebnih podatkov) potrdi shemo. Do takrat so v kodi le predpostavke, označene kot take, in test
  s sintetičnim RSS.

## 3. FURS eDražbe

- **Naslov**: uporabnikov `edrazbe.fu.gov.si` se **ne razreši** (`ENOTFOUND`). Uradni portal je `furs.edrazbe.si`
  (Pravilnik o objavah prodaj in izvajanju spletne javne dražbe FURS, Uradni list 2022; obvestila GOV.SI
  napotujejo nanj). To je **drugačna** stran od komercialne platforme `eDrazbe.si`.
- **Potrjeno** (Pravilnik): prodaje objavljajo uredniki FURS, ki dostopajo izključno prek SI-PASS; javna stran
  prikazuje prodaje in izvaja spletne javne dražbe.
- **Nepreverjeno**: `furs.edrazbe.si` se prek orodja ni dalo prebrati; robots.txt, ki je bil vrnjen, kaže
  `Disallow: /bidders/`, `/subscribers/` in sitemap `edrazbe.si` — ni potrjeno, da pripada isti namestitvi.
  Obstoj RSS/API ni potrjen.
- **Odločitev**: **brez konektorja v v1** (status `unavailable`, razlog "ni preverjenega strojno berljivega
  dostopa"). FURS dražbe so posredno vidne kot objave "Spletna javna dražba" na GOV.SI (§4) — to je pokritost
  prek vira GOV.SI, ne prek portala FURS. Razlog za pot z uporabnikovim URL-jem: v spec-u ni bil pravilen.
- **Vrata T-furs**: ko se potrdi javni strojno berljiv dostop (RSS/XML/odprti podatki) in pogoji, se doda
  konektor kot nov adapter brez sprememb drugje (FR-013).

## 4. GOV.SI javne objave

- **Potrjeno** (stran zbirke): zbirka objavlja javne pozive, razpise, **dražbe**, obvestila; privzeto samo odprte;
  filtri: status, naziv/šifra, institucija, vrsta, oznaka, datum, število na stran (20/50/100). Relevantne vrste:
  "Javne dražbe", "Stvarno premoženje", "Namere o oddaji stvarnega premoženja" ipd. RSS in API **nista omenjena**.
- **Potrjeno** (`robots.txt`): `Disallow: /admin`, `/resources`, `/pomoc`; `Sitemap: https://www.gov.si/sitemap.xml`.
  `/zbirke/` ni prepovedan.
- **Potrjeno** (vzorčna objava FURS): polja: naslov "Spletna javna dražba – <kategorija>", institucija, datum
  objave, rok, status ("Dražba je preklicana"), šifra zadeve, dokument PDF (oklic), ogled po dogovoru,
  povezava "Več informacij" na `furs.edrazbe.si`. **Izklicne cene in varščine stran ne vsebuje** (lahko je v PDF).
  Naslov nekaterih objav vsebuje ceno ("izklicna cena 5.546 evrov") — to je podatek iz naslova, ne iz polja.
- **Nepreverjeno**: pogoji ponovne uporabe, omejitve hitrosti, stabilnost HTML strukture, obstoj JSON/RSS
  za zbirko.
- **Odločitev**: konektor **delno**, privzeto **izklopljen** (`AUCTIONS_GOVSI_ENABLED=false`), vklopi ga lastnik
  po preveritvi pogojev. Razčlenjuje samo javne HTML strani objav (seznam s filtrom vrste "javne dražbe" + posamezna
  objava), z razmikom ≥ 2 s, predpomnilnikom, dnevno mejo in **brez obhoda česar koli**. Vrednosti, ki jih ni v
  polju (cena, varščina), ostanejo `null`; cena iz naslova se ne izlušči (izpuščeno: preprosteje in varneje).
- **Nepomembne objave**: filter po vrsti (dražba/prodaja premoženja/poziv k ponudbam) in po besedah v naslovu;
  neujemajoče izločene z razlogom v števcu `skippedIrrelevant`.
- **Vrata T-gov**: preveriti pogoje ponovne uporabe GOV.SI in da je ciljna zbirka dovoljena za samodejno branje;
  brez tega ostane vir izklopljen.

## 5. AJPES

- **Potrjeno** (iskanje): e-Objave in e-INSOLV sta brezplačna, a **zahtevata registracijo** (uporabniško ime in
  geslo); jezik slovenski; podatki od 1. 10. 2008; podrobnosti primera XML/PDF znotraj portala; Uredba o objavah
  v postopkih zaradi insolventnosti ureja objave. Na strani AJPES je naveden samo API za letna poročila (LP API),
  ne za insolvenco.
- **Nepreverjeno**: pogoji uporabe (stran "Pogoji uporabe" ni bila berljiva); ali obstaja odobrena spletna storitev.
- **Odločitev**: **nedostopen** (zahteva prijavo; obhod prijave je prepovedan, FR-007). Splošne insolvenčne
  objave niso dražbe; če bo kdaj konektor, **izloča** objave brez znakov prodaje (FR-010). Pravila razvrščanja
  ("ima znake prodaje" = vrsta objave "prodaja premoženja" ali ključne besede) so zapisana in testirana s
  sintetičnimi objavami, da je vedenje pripravljeno.
- **Poslovne likvidacije** v v1 pokrivajo: (a) GOV.SI vrste premoženja, (b) sodne dražbe prek RSS (stečajne
  prodaje so tam objavljene, kot sodne), (c) ročno vneseni RSS viri. Ni trditve o popolni pokritosti.

## 6. European e-Justice Portal

- **Potrjeno**: stran o objavah po državah poda, kje v Sloveniji so uradne objave (sodisce.si, sodnedrazbe.si);
  enotnega evropskega API-ja za dražbe **ni** nikjer potrjenega; stran o registrih insolvenc kaže na nacionalne
  vire.
- **Odločitev**: referenčna povezava v opisu vira in v dokumentaciji; **nobenega konektorja**. Dodatne države
  šele po prepoznavi uradnega nacionalnega vira (FR-009); register držav je podatkovna tabela, ne koda.

## 7. Usklajenost s skupnimi točkami (020 in 019)

- `specs/020` na disku **ne obstaja** (ob raziskavi); vzporedno delo je torej v drugi seji/veji ali še ni
  zapisano. **Nepreverjeno**, katere skupne točke spreminja.
- V delovnem drevesu je **nezaključena** izvedba 019: `platform/ebay`, `platform/external-sources`,
  `platform/scanner/domain/{opportunity-math,alert-plan}.ts`, spremembe `lego-scanner/*`, `env.ts`, `.env.example`,
  `docs/env-reference.md`, `register-icons.ts`, `packages/contracts/scripts/generate.ts`, `ci.yml`.
- **Skupne točke, kjer lahko pride do konflikta** (vsaka bo ena vrstica, dodana na koncu seznama):
  `apps/api/src/main.ts` (uvoz + `router.use` + `register…Type()`), `apps/web/src/main.ts` (`register…Ui()`),
  `platform/config/env.ts` + `tests/unit/env.spec.ts`, `.env.example`, `docs/env-reference.md`,
  `register-icons.ts` + `tests/unit/icons.spec.ts`, `generate.ts`, `ci.yml`.
- **Odločitve**: (1) izvedba 021 se začne **šele ko je 019 zaključen in committan** ali pa se `platform/external-sources`
  in `alert-plan` uporabita kot sta v drevesu; (2) nobena skupna datoteka se ne preoblikuje, samo dodamo vrstice;
  (3) pred zagonom izvedbe `git status` + `git log -- <skupne datoteke>` (vrata T-sync); (4) lastni `ExternalSourceUsage`
  ključ `auctions:<vir>` (brez spremembe sheme).

## 8. Tehnične odločitve

1. **En tip `auctions`**, `execution: 'single'`, `results: 'generic'`; načina "EU dražbe" in "likvidacije" sta
   **predloge konfiguracije** (`preset`), ki le predizberejo države/vrste/vire; zagon je isti. (FR-002)
2. **Ocenjevalnik** `AuctionOpportunityEvaluator` je čista funkcija v modulu (`domain/evaluator.ts`). Skupna
   `opportunity-math` (019) je prilagojena nakupu po fiksni ceni z oceno vrednosti; dražbena logika (varščina,
   najvišja ponudba, korak ponudbe, provizija kupca kot % ali znesek) se razlikuje, zato iz skupnega jedra
   uporabimo samo `EU_COUNTRIES`/zaokrožanje, ostalo je lastno. Razlog: raztezanje skupnega jedra bi spremenilo
   LEGO/zbirateljski izračun (regresijsko tveganje).
3. **Varščina**: `depositTreatment` ∈ {`credited` (všteta v ceno ob zmagi), `refundable`, `forfeited`/`non-refundable`,
   `unknown`}; privzeto `unknown` → ne šteje v strošek, dobiček ostane izračunljiv, a rezultat navede
   "ravnanje z varščino neznano" kot opozorilo, ne kot strošek. Strošek je samo pri izrecno nevračljivi.
4. **Najvišja ponudba** (`maxBid`): rešitev linearne enačbe iz predpostavk: `V·(1−sell%) − fixedCosts − reserve −
   minProfit = bid·(1+buyerPremium%+tax%)` → `bid = …`; vrne `null` brez tržne vrednosti; zaokroži navzdol na
   korak ponudbe, če je znan; vedno `estimate: true`.
5. **Življenjski cikel**: jedro generične shrambe zazna samo ceno in hash `comparable`. Dogodke (preložitev, preklic,
   rok prijave, konec, dokumenti, status) tip razbere sam iz primerjave `data.lifecycle` prejšnjega zapisa
   (bere ga pred `reconcile`, kot LEGO/019) in jih zapiše v `data.alerts` kot zastavice za dedup. `comparable`
   vsebuje lifecycle-polja, da jedro označi `CHANGED`. Izginotje = jedrov `UNAVAILABLE`, v UI "ni več objavljeno".
6. **Časovni pas**: vir brez pasu → `Europe/Ljubljana` (luxon, že v projektu); shranjen ISO UTC + izvirni niz +
   zastavica `assumedTimezone`. Nelogičen datum se ohrani, označi `dateInconsistent`.
7. **Dedup med viri**: kanonični `identity` = `auction:<country>:<normalizedReference>` kadar je šifra zadeve
   znana (npr. "4939-440/2024"), sicer hash(naslov normaliziran + začetek + lokacija); pri trku se doda
   `sources[]`, ne nov zapis. (Rezultat jedra ima en `source`; ostali so v `data.sources`.)
8. **UI analiza (017)**: `ai.describe` doda opis in dokumentne povezave; pogoji sodelovanja iz dokumentov so le
   v besedilnih poljih analize (izhod 017 nima številskih polj za denar — FR-030 že izpolnjen v jedru).
9. **Obvestila**: obstoječi `planEvent` pokriva new/price-down/undervalued/auction-ending/changed; novi razlogi
   (`deadline-soon`, `starting-soon`, `postponed`, `cancelled`, `documents`) so v modulskem `lifecycle-events.ts`,
   ki sestavi vrstni red in dedup; mapiranje na `NotifiableChangeType` = `CHANGED`/`NEW`/`PRICE_DOWN`, razlog je
   v `payload.reasons`. Jedra ne spreminjamo.
10. **Brez novih odvisnosti**: RSS razčlenjevanje z majhnim lastnim razčlenjevalnikom XML? Preveri, ali projekt
    že ima XML knjižnico (T-xml); sicer ena sama majhna odvisnost, odobrena v tasks.

## 9. Pokritost testnih primerov (vrata 2 ustave)

Vsi primeri iz FR-035 imajo subjekt (čista domena, fiksni podatki). Primeri brez subjekta: ni (ni denarnih
transakcij; avtentikacija/lastništvo pokrita prek jedra + integracijski test tipa).

## 10. Odprta tveganja

- Oblika RSS iz SodneDrazbe.si ni potrjena → T-sodne; do takrat vir v UI "ročna nastavitev".
- GOV.SI HTML se lahko spremeni → razčlenjevalnik odpove glasno (`auctions:govsi-parse`), ne tiho.
- Ni vira tržnih vrednosti → ocena priložnosti večinoma "premalo podatkov", razen ko lastnik vnese tržno
  vrednost (v konfiguraciji: privzeta ocena po kategoriji ali odstotek cenitve **izrecno nastavljen** kot
  `appraisalToMarketPct`, označen kot predpostavka lastnika).
