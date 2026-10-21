# Implementation Plan: LEGO skener (018)

**Branch**: `016-scanner-engine` (nadaljevanje) | **Date**: 2026-10-21 | **Spec**: [spec.md](spec.md)
**Input**: Naloga "Implement LEGO Scanner in Existing Universal Scanner" (21. 10. 2026).

## Summary

Nov tip skenerja `lego` v obstoječem jedru (016): `single` + generična shramba, lasten modul
`modules/lego-scanner` (API) in `features/lego-scanner` (web), registracija z eno vrstico na
vsaki strani. Zajem iz treh uradnih virov (Rebrickable katalog, BrickLink cenik, eBay Browse
oglasi) po vzorcu Leti (opis zahteve, čista razčlenitev, skupni predpomnilnik, semafor, dnevna
meja). Čista domena pove, kaj sme in česa ne sme trditi: identifikacija z zaupanjem, razvrstitev
stanja brez domnev o kompletnosti, vrednotenje samo iz prodaj, izračun priložnosti po vidnih
postavkah. Urnik, zagoni, zgodovina, dopisi in AI analiza so iz jedra (016, 017) brez sprememb.

| kaj je tu prvič | kako je rešeno |
|---|---|
| prvi produkcijski `single` tip | jedro že podpira (echo kot predloga); `isEnabled: () => true`, viri javijo, kaj manjka (research §1) |
| obvestila s pragom dobička, dražbe | tip sam sestavi dogodke pred `reconcile`, stanje zastavic je v `data.alerts` (research §7) |
| zunanji viri s podpisom (OAuth 1.0) in žetoni | `sources/` s skupnim `http.ts`; žetoni samo v pomnilniku in glavah (research §4, §5) |
| dnevne meje po viru | `LegoSourceUsage`, atomarna rezervacija (research §8) |

## Technical Context

- **Jezik**: TypeScript, Node 22, Express 5, Mongoose 8, Zod, luxon; Angular 20 + Ionic 8
  (vse že v repozitoriju). **Nove odvisnosti**: NOBENE (`fetch`, `node:crypto`).
- **Nove spremenljivke okolja**: research §11 (vse s privzetkom; ključi prazni = vir izklopljen;
  `LEGO_FAKE_SOURCE_ENABLED` v produkciji zavrnjen).
- **Shramba**: ena zbirka `legosourceusages`; `ScannerDefinition.config` in `ScannerResult.data`
  za vse ostalo (data-model.md).
- **Zunanji klici**: Rebrickable (~1/s), BrickLink (OAuth 1.0, registriran IP, ~5000/dan), eBay
  (client credentials, ~5000/dan). Vse prek `platform/cache` in z dnevno mejo.
- **Zmogljivost**: en zagon = ≤ 2 strani oglasov na tržnico + ≤ `LEGO_MAX_VALUATIONS_PER_RUN`
  setov × ≤ 3 klici cenika + ≤ `LEGO_MAX_NAME_LOOKUPS_PER_RUN` iskanj po imenu; vse počasne podatke
  (katalog 30 dni, cenik 24 ur) predpomnilnik pokrije.
- **Omejitve**: brez transakcij; idempotentnost prek `(definitionId, identityKey)` iz jedra.
- **Obseg**: 1 nov modul zaledja (~14 datotek), 1 modul odjemalca (~5), 1 nova pot, 1 zbirka,
  ~12 novih testnih datotek.

## Constitution Check

| člen | izpolnitev |
|---|---|
| I | Modul ne uvaža drugih modulov; jedro je nespremenjeno (test meje `scanner-core-boundary` ostane zelen); modul uvaža samo iz `platform/`. Registracija = ena vrstica v `main.ts` + ena v `apps/web/src/main.ts`. Brisanje modula: mapa × 2 + 2 vrstici + 1 router. |
| II | Ista pot pod `/api/v1`; tip ne dobi lastnega zavihka — živi v Skenerjih. |
| III | Pogodba [`contracts/openapi.yaml`](contracts/openapi.yaml): `GET /lego-scanner/sources`, sheme `LegoConfig`, `LegoResultData`; ustvarjanje/branje prek obstoječih poti 016. |
| IV | Ključi samo v okolju; podpis BrickLink in žeton eBay nikoli v odgovoru, dnevniku, `ExternalCache`, `extras`. URL v predpomnilniku je brez parametrov podpisa (podpis je v glavi). |
| V | Urnik in zagoni v jedru; dnevna meja v bazi (ne v pomnilniku); žeton eBay v pomnilniku je predpomnilnik, ne urnik. |
| VI | Brez verificiranega izida ni trditve: neznana poštnina/kompletnost/vrednost je `null` ali "neznano", umik ni "prodano", zadnja ponudba ni končna cena. |
| VII | `runErrors` s kodami `lego:*` (`no-listing-source`, `source-disabled:<vir>`, `daily-limit:<vir>`, `unreachable:<vir>`); `GET /lego-scanner/sources`. |
| VIII | Predpomnilnik s TTL po viru, semafor in razmik (Rebrickable 1,1 s), dnevne meje, brez scrapanja. |
| IX | `domain/*` čisto, brez mongoose in fetch; testirano z tabelami. |
| X | Besedila slovenska; identifikatorji angleški. |
| XII | Samo uradni API-ji z ključem; nobenega obhoda zaščit; brez avtentikacije izdelka iz slik. |

## Project Structure

```
apps/api/src/modules/lego-scanner/
├── index.ts                  registerLegoScannerType() + router (ena vrstica v main.ts)
├── scanner-type.ts           ScannerType<LegoConfig>: ai, notifications, validateConfig
├── config.ts                 Zod shema LegoConfig, normalizacija, mapiranje na eBay filtre
├── execute.ts                cevovod zagona (viri → identifikacija → vrednotenje → priložnost → dogodki → reconcile)
├── events.ts                 odločitve o dogodkih (prag, podcenjenost, dražba) — čiste funkcije
├── notifications.ts          verify + render dopisa
├── router.ts                 GET /lego-scanner/sources
├── models/lego-source-usage.model.ts
├── domain/set-number.ts  classify.ts  condition.ts  identify.ts  valuation.ts  opportunity.ts  types.ts
└── sources/types.ts  http.ts  usage.ts  rebrickable.ts  bricklink.ts  ebay.ts  fake.ts  index.ts

apps/web/src/app/features/lego-scanner/
├── scanner-ui.ts             registerLegoScannerUi()
├── lego-config.component.ts  obrazec (ScannerConfigForm)
├── lego-results.component.ts lasten prikaz (ScannerResultsView) + podrobnosti
└── lego.model.ts             čiste funkcije prikaza (oznake, barve, formatiranje)
```

## Complexity Tracking

| odločitev | razlog |
|---|---|
| dogodke sestavi tip, ne `reconcile` | jedro zazna spremembo samo po ceni; prag dobička in dražbe potrebujeta stanje, ki ga jedro ne pozna (research §7) |
| iskanje "upokojen" ni implementirano | noben dovoljen vir tega ne pove zanesljivo; filter, ki bi molče domneval, bi kršil FR-013 |
| eBay konektor v tem modulu | v repozitoriju ga ni; ime okolja `EBAY_*` je splošno, da ga lahko bodoči tip prevzame |
