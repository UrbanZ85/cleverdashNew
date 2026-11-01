# Implementation Plan: Dražbeni skener (021)

**Branch**: `016-scanner-engine` (nadaljevanje) | **Date**: 2026-10-21 | **Spec**: [spec.md](spec.md)
**Input**: Naloga "Extend Universal Scanner with Auction Sources and Shared Auction Opportunity Evaluator" (21. 10. 2026).

## Summary

Nov tip skenerja `auctions` v obstoječem jedru (016): `single` + generična shramba, lasten modul
`modules/auction-scanner` (API) in `features/auction-scanner` (web), registracija z eno vrstico na vsaki strani.
EU dražbe in poslovne likvidacije so **predloge konfiguracije** istega tipa, ne novi tipi. Vzorec: 018/019.

Ključne ugotovitve raziskave ([research.md](research.md)):

1. **Viri so slabše dostopni, kot predpostavlja naloga.** Edini potrjen strojno berljiv kanal je RSS portala
   SodneDrazbe.si (shranjeno iskanje; URL in polja nepreverjena, vsebina "ni odprti podatki"). FURS portal je na
   `furs.edrazbe.si` (ne `edrazbe.fu.gov.si`, ki se ne razreši) in nima potrjenega vira; AJPES zahteva prijavo;
   GOV.SI je le HTML (robots dovoljuje, pogoji ponovne uporabe niso potrjeni); e-Justice je samo referenca.
2. **V1 zato dostavi**: popolno domeno (model, normalizacija, ocenjevalnik, tveganja, življenjski cikel, obvestila,
   UI, AI) preverjeno s testnim virom, konektor SodneDrazbe prek RSS (ročna nastavitev URL-ja), konektor GOV.SI
   (privzeto izklopljen do vrat T-gov) ter register virov, ki nedostopne vire pošteno označi.
3. **Skupne točke z 019/020** so samo vrstice, dodane na koncu (research §7); izvedba se začne po zaključku 019.

## Technical Context

- **Jezik**: TypeScript (strict), Node 22, Express 5, Mongoose 8, Zod, luxon; Angular 20 + Ionic 8.
  **Nove odvisnosti**: po možnosti NOBENE; razčlenjevanje RSS/HTML preveri vrata T-xml (obstoječa knjižnica, sicer ena
  majhna, odobrena v tasks).
- **Shramba**: `ScannerDefinition.config`, `ScannerResult.data`, `ExternalSourceUsage` (`auctions:<vir>`). Brez migracij.
- **Zunanji klici**: SodneDrazbe RSS (URL-ji lastnika), GOV.SI HTML (izklopljeno privzeto); oba prek
  `platform/external-sources` (predpomnilnik, razmik ≥ 2 s, dnevna meja), User-Agent z identifikacijo aplikacije.
- **Test**: vitest; fiksni RSS/HTML odgovori (fixtures), testni vir `AUCTIONS_FAKE_SOURCE_ENABLED`, ura nadzorovana.
- **Obseg**: 1 modul zaledja (~25 datotek), 1 modul odjemalca (~6), 2 poti (`/sources`, `/presets`), ~15 testnih
  datotek, 0 novih zbirk, 0 sprememb jedra.

## Constitution Check

| člen | izpolnitev |
|---|---|
| I | Modul uvaža samo iz `platform/`; brez uvoza iz lego/collectibles. Odstranitev = mapi × 2 + vrstice v `main.ts` ×2 (+ okolje, ikona, pogodba). |
| II | Poti pod `/api/v1`; brez lastnega zavihka (živi v Skenerjih). |
| III | [contracts/openapi.yaml](contracts/openapi.yaml): `/auctions-scanner/sources`, `/presets`, sheme; ostalo prek poti 016. |
| IV | Edine nove spremenljivke so URL-ji virov in stikala; skrivnosti jih ni; `.env.example` brez vrednosti. |
| V | Urnik v jedru; ura iz `ctx.now`; vsi časi UTC ISO, razlaga v `Europe/Ljubljana` s `assumedTimezone`. |
| VI | Brez avtomatskega licitiranja, prijave ali nakupa (FR-033). Brez verificiranega izida ni trditve: neznano = `null`, izginotje ≠ zaključeno, ponudba ≠ končna cena, ocena ≠ cenitev. |
| VII | `runErrors` s kodami `auctions:*` (`auctions:source-unavailable`, `auctions:govsi-parse`, …); `/sources` pove, kaj manjka. |
| VIII | Predpomnilnik, razmik, dnevne meje, robots upoštevan; **noben vir se ne obide** (FR-007). |
| IX | `domain/*` čisto (evaluator, normalizacija, risk, lifecycle), tabelarni testi. |
| X | Besedila slovenska; identifikatorji angleški. |
| XII | Brez obhoda CAPTCHA, prijave ali zaščit; AI ne trdi pravnih sklepov. |

**Vrata 2**: vsi testni primeri iz FR-035 imajo subjekt (research §9). **Vrata T-sync/T-sodne/T-gov/T-furs/T-xml**:
glej research; vsako je naloga v `tasks.md` pred kodo, ki jo pogojuje.
**Ponovna presoja po Phase 1**: brez kršitev.

## Project Structure

```
apps/api/src/modules/auction-scanner/
├── index.ts                  registerAuctionScannerType() + router
├── scanner-type.ts           ScannerType<AuctionsConfig>: single, generic, ai.describe, notifications
├── config.ts                 Zod (AuctionsConfig, presets, validateConfig: nedostopen vir → napaka)
├── execute.ts                cevovod: viri → normalizacija → dedup → filtri → evaluator → tveganja → lifecycle → reconcile
├── lifecycle-events.ts       razlike Lifecycle + zastavice; uporablja platform/scanner/domain/alert-plan.ts
├── notifications.ts  router.ts
├── domain/
│   ├── types.ts              AuctionAttributes, AuctionEvaluation, RiskFlag, Lifecycle
│   ├── normalize.ts          datumi (luxon), valuta, varščina, način, sklopi
│   ├── dedup.ts              identity + združevanje virov
│   ├── filters.ts            vsi filtri iz FR-004
│   ├── evaluator.ts          AuctionOpportunityEvaluator (čist)
│   ├── max-bid.ts            najvišja ponudba
│   ├── risk.ts               kazalniki tveganja
│   ├── relevance.ts          razvrščanje objav: dražba / splošna objava (AJPES, GOV.SI)
│   └── lifecycle.ts          razlika stanj
└── sources/
    ├── types.ts  registry.ts (AuctionSourceInfo, statusi)  index.ts
    ├── sodnedrazbe-rss.ts    RSS adapter (URL-ji lastnika)
    ├── govsi.ts              HTML adapter (izklopljen privzeto)
    ├── reference.ts          e-Justice, furs, ajpes: samo informacijski vnosi, brez fetch
    └── fake.ts               testni vir (zaporedja stanj)

apps/web/src/app/features/auction-scanner/
├── scanner-ui.ts  auction-config.component.ts  auction-results.component.ts  auction-detail.component.ts  auction.model.ts

docs/auction-scanner.md       viri, omejitve, vrata preverjanja, predpostavke ocenjevanja (FR-036)
```

Skupne datoteke (samo dodane vrstice): `apps/api/src/main.ts`, `apps/web/src/main.ts`, `platform/config/env.ts` (+ test),
`.env.example`, `docs/env-reference.md`, `register-icons.ts` (+ test), `packages/contracts/scripts/generate.ts`.

## Phasing (po nalogi)

0. **Vrata**: T-sync (019 zaključen; `git status` na skupnih datotekah), T-xml, T-sodne (pravi RSS fixture), T-gov (pogoji).
1. **Inšpekcija**: opravljena (research §7), ponovi ob začetku izvedbe.
2. **Preverjanje virov**: opravljeno (research §1–6); ostala vrata zgoraj.
3. **Model + adapterji**: `domain/types`, `normalize`, `sources/*`, register virov.
4. **Slovenski viri**: SodneDrazbe RSS, GOV.SI (izklopljen), nedostopni z razlogom.
5. **Ocenjevalnik**: `evaluator`, `max-bid`, `risk`.
6. **EU + likvidacije**: predloge, država/vir tabela, `relevance`.
7. **UI, obvestila, AI**: obrazec, kartice, podrobnosti, `lifecycle-events`, `ai.describe`.
8. **Testi + dokumentacija**: FR-035, `docs/auction-scanner.md`, `.env.example`, `docs/env-reference.md`.

## Complexity Tracking

| odločitev | razlog |
|---|---|
| lasten evaluator namesto razširitve `opportunity-math` | dražbena aritmetika (varščina, najvišja ponudba) se razlikuje; razširitev bi tvegala regresijo LEGO/zbirateljskega izračuna |
| konektor GOV.SI izklopljen privzeto | pogoji ponovne uporabe niso potrjeni; vklop je izrecna odločitev lastnika |
| SodneDrazbe samo prek RSS lastnika | edina potrjena strojno berljiva pot; brez razčlenjevanja HTML portala |
| FURS/AJPES kot registrirana nedostopna vira | pošteno stanje (FR-008) namesto lažnega konektorja; dodajanje je en adapter |
| lifecycle dogodki v modulu | jedro zazna samo ceno/hash; jedra ne spreminjamo (FR-034) |
