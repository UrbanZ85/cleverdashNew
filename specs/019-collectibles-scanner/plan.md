# Implementation Plan: Zbirateljski skener (019)

**Branch**: `016-scanner-engine` (nadaljevanje) | **Date**: 2026-10-21 | **Spec**: [spec.md](spec.md)
**Input**: Naloga "Implement Collectibles Scanner in Existing Universal Scanner" (21. 10. 2026).

## Summary

Nov tip skenerja `collectibles` v obstoječem jedru (016): `single` + generična shramba, lasten modul
`modules/collectibles-scanner` (API) in `features/collectibles-scanner` (web), registracija z eno vrstico
na vsaki strani. Zgrajen po vzoru `lego` (018), z dvema razlikama:

1. **Predhodna izvleka skupne kode** (ker člen I prepoveduje uvoz med moduli): generični eBay odjemalec,
   predpomnjen prenos z dnevno mejo, aritmetika priložnosti in odločitev o dogodkih gredo v `platform/`;
   LEGO postane tanek ovoj z enakim izhodom, njegovi testi ostanejo nespremenjeni (vrata regresije).
2. **Register kategorij** (kartice, retro igre) s Zod shemo, filtri, prepoznavo in vrednotenjem na
   kategorijo; strežnik izpostavi opis kategorij, Angular iz njega zgradi obrazec.

Viri: eBay Browse (oglasi, obstoječi ključi), TCGdex (katalog kartic, brez ključa), PriceCharting
(izbirno, ključ). Čista domena pove, kaj sme in česa ne sme trditi (variantKey, zaupanje, `basis` cene).

**Ključna posledica (research §5)**: noben dovoljen vir v tem obsegu ne daje *preverjenih prodaj*, zato je v
produkciji dobiček praviloma neznan; prikazana sta ocena in popust do ocene, jasno označena. Model je
pripravljen, da vir prodaj vklopi dobiček brez spremembe kode.

## Technical Context

- **Jezik**: TypeScript (strict), Node 22, Express 5, Mongoose 8, Zod, luxon; Angular 20 + Ionic 8.
  **Nove odvisnosti**: NOBENE (`fetch`, `node:crypto`).
- **Shramba**: ena zbirka dnevne porabe virov, preimenovana in splošna (`ExternalSourceUsage`, ključ
  `(source, day)`); sicer `ScannerDefinition.config` in `ScannerResult.data`. Brez migracij (podatki
  pogrešljivi, glej spomin `db-data-disposable`).
- **Zunanji klici**: eBay (client credentials; ~5000/dan, skupna meja z LEGO), TCGdex (brez ključa, meje
  niso potrjene → konzervativen razmik), PriceCharting (ključ, plačljivo). Vsi prek `platform/cache` in
  dnevne meje.
- **Zmogljivost**: en zagon ≤ `COLLECTIBLES_EBAY_MAX_PAGES` strani × tržnice + ≤
  `MAX_CATALOG_LOOKUPS_PER_RUN` poizvedb kataloga + ≤ `MAX_VALUATIONS_PER_RUN` cenikov.
- **Test**: vitest; fiksni podatki in mock `fetch`; testni vir `COLLECTIBLES_FAKE_SOURCE_ENABLED`.
- **Obseg**: 4 izvlečene enote v `platform/`, 1 nov modul zaledja (~22 datotek), 1 modul odjemalca (~5),
  2 poti (`/collectibles-scanner/sources|categories`), ~14 novih testnih datotek, 0 novih zbirk.

## Constitution Check

| člen | izpolnitev |
|---|---|
| I | Modul uvaža samo iz `platform/`. Izvleka v `platform/` ne sme vsebovati imen tipov (`scanner-core-boundary`): funkcije so splošne. LEGO ovoj uvaža iz `platform/`, ne iz zbirateljskega modula. Brisanje tipa = mapi × 2 + 3 vrstice (main.ts API, main.ts web, router). Izvlečena skupna koda ostane (je splošna). |
| II | Poti pod `/api/v1`; brez lastnega zavihka (živi v Skenerjih). |
| III | [`contracts/openapi.yaml`](contracts/openapi.yaml): `GET /collectibles-scanner/sources`, `/categories`, sheme `CollectiblesConfig`, `CollectiblesResultData`; ustvarjanje prek obstoječih poti 016. |
| IV | `EBAY_*`, `OPENAI_*`, `PRICECHARTING_API_KEY` samo v okolju. PriceCharting žeton je v poizvedbi → `sourceUrl` v predpomnilniku in dnevniku je brez njega (research §4). `.env.example` samo prazni ključi. |
| V | Urnik in zagoni v jedru; dnevna meja v bazi; vsi časi v `Europe/Ljubljana` (`usageDay`); dražba "se izteka" po UTC instantu. |
| VI | Brez verificiranega izida ni trditve: neznano je `null`, umik ≠ prodano, zadnja ponudba ≠ končna cena, ocena ≠ prodaja. |
| VII | `runErrors` s kodami `collectibles:*`; `GET /collectibles-scanner/sources` pove, kaj manjka. |
| VIII | Predpomnilnik s TTL po viru, razmik, dnevne meje; samo uradni API-ji; nobenega scrapanja. |
| IX | `domain/*` čisto, brez mongoose/fetch; testirano s tabelami. |
| X | Besedila slovenska; identifikatorji angleški. |
| XII | Brez obhoda CAPTCHA/zaščit; AI ne trdi pristnosti iz slik. |

**Vrata 2 (enotski testi domene)**: primeri, ki nimajo predmeta, so zapisani v research §14 z nadomestnimi.
**Ponovna presoja po Phase 1**: brez kršitev; edina strukturna sprememba obstoječe kode je izvleka (§Complexity).

## Project Structure

```
apps/api/src/platform/
├── ebay/                         NOVO: žeton, URL iskanja, razčlenitev, listanje (iz lego sources/ebay.ts)
├── external-sources/             NOVO: http.ts (fetchCachedJson), usage.ts, pacer.ts, model ExternalSourceUsage
└── scanner/domain/
    ├── opportunity-math.ts       NOVO: aritmetika priložnosti, EU_COUNTRIES, round2, scoreFor
    └── alert-plan.ts             NOVO: planEvent brez tipskih imen

apps/api/src/modules/lego-scanner/   SPREMENJENO: samo tanki ovoji (ebay.ts, http.ts, usage, opportunity.ts, events.ts)

apps/api/src/modules/collectibles-scanner/
├── index.ts                      registerCollectiblesScannerType() + router
├── scanner-type.ts               ScannerType<CollectiblesConfig>: ai, notifications, validateConfig
├── config.ts                     Zod: skupni filtri + discriminatedUnion po kategoriji
├── execute.ts                    cevovod zagona
├── events.ts  notifications.ts  router.ts
├── categories/
│   ├── registry.ts               register + opis za /categories
│   ├── trading-cards.ts          shema, filtri, eBay poizvedba, prepoznava, vrednotenje
│   └── retro-gaming.ts           enako
├── domain/
│   ├── types.ts                  CollectibleAttributes, Identification, Valuation (basis), Opportunity
│   ├── card-parse.ts  card-identify.ts  retro-parse.ts  retro-identify.ts
│   ├── variant-key.ts            ključ primerjave (nikoli mešanje različic)
│   ├── comparables.ts            aktivne primerljive cene (asking)
│   ├── valuation.ts              ločeni basis: asking | estimate | guide | sold
│   └── opportunity.ts            ovoj nad opportunity-math + tveganja kategorije
└── sources/
    ├── types.ts  index.ts  ebay.ts (ovoj nad platform/ebay)  tcgdex.ts  pricecharting.ts  fake.ts

apps/web/src/app/features/collectibles-scanner/
├── scanner-ui.ts  collectibles-config.component.ts  collectibles-results.component.ts  collectibles.model.ts
```

## Phasing (po nalogi)

1. **Izvleka (regresija)**: platform/ebay, external-sources, opportunity-math, alert-plan; LEGO testi zeleni.
2. **Registracija + konfiguracija**: tip, register kategorij, Zod, `/categories`, `/sources`, env.
3. **eBay oglasi**: ovoj, normalizacija, filtri, dedup.
4. **Katalog**: TCGdex; PriceCharting (izbirno).
5. **Prepoznava + vrednotenje**: card/retro, variantKey, basis.
6. **Priložnost + dogodki**: ovoj, tveganja, prag, obvestila.
7. **UI**: dinamičen obrazec, seznam, podrobnosti.
8. **Testi + dokumentacija**: `docs/collectibles-scanner.md`, `.env.example`, `docs/env-reference.md`.

## Complexity Tracking

| odločitev | razlog |
|---|---|
| izvleka iz `lego-scanner` v `platform/` | edina pot do ponovne uporabe, ki ne krši člena I; LEGO testi so vrata regresije |
| skupna dnevna meja eBay | meja je na ključ aplikacije; dve ločeni števili bi presegli dejansko |
| strežniški opis kategorij | en vir resnice za obliko obrazca; nova kategorija brez sprememb odjemalca |
| `basis` na vsaki ceni | brez njega bi se asking/estimate/sold zlahka pomešali (FR-017) |
| v v1 dobiček večinoma `null` | zahteva lastnika (odločitev 4) + ni vira prodaj (research §5) |
