# Implementation Plan: Analiza rezultatov z umetno inteligenco (017)

**Branch**: `016-scanner-engine` (nadaljevanje) | **Date**: 2026-10-19 | **Spec**: [spec.md](spec.md)

## Summary

Jedro skenerjev dobi neobvezen korak zagona: po izvajanju tipa se novi/spremenjeni rezultati
skenerjev z vklopljeno analizo pošljejo OpenAI modelu (Responses API, strukturiran izhod), izid
se shrani na rezultat in pokaže v obstoječem vmesniku. Vklop je na ravni skenerja/iskanja,
privzeto izklopljen; klici so omejeni na zagon in na dan ter predpomnjeni; napaka ne vpliva na
zagon. Tip z generično shrambo ne piše nič; leti podajo dva kavlja.

## Technical Context

- **Nove odvisnosti**: NOBENE (`fetch`, Zod, Mongoose).
- **Okolje**: research.md §12; vse s privzetkom, ključ prazen = izklop.
- **Shramba**: `scanneraicaches`, `scanneraiusages`; polja `aiEnabled`/`aiAnalysis` (data-model.md).
- **Zunanji klic**: `POST /v1/responses`, `text.format` json_schema strict; en poskus + ena
  ponovitev; časovna omejitev.

## Constitution Check

| člen | izpolnitev |
|---|---|
| I | Vse v `platform/scanner/` (ai-client, ai-analysis, ai-candidates, domena `ai-analysis.ts`); leti prispevajo `modules/flight-deals/scanner/ai.ts`; jedro brez uvozov iz `modules/` (test meje). |
| III | Pogodbi 015/016 razširjeni (`aiEnabled`, `aiAnalysis`, `ai.available`, `limits.aiAvailable`), redocly veljavni. |
| IV | Ključ samo v `env`; nikoli v odgovorih, dnevniku ali `extras`; vhod modelu brez osebnih podatkov. |
| V | Dnevna meja v bazi (atomaren `findOneAndUpdate`), ne v pomnilniku; analiza teče v istem zagonu z utripom in preklicem. |
| VI/VII | Vsak neuspeh je števec + `runErrors` s kodo; `ai.available` v API-ju in v obrazcu. |
| VIII | Predpomnilnik po vhodu, meja na zagon/dan, brez slik privzeto, časovna omejitev. |
| IX | `domain/ai-analysis.ts` čist (shema, hash, navodilo, razčlenitev) — enotsko testiran; storitve nad v-pomnilniško bazo s ponarejenim odjemalcem. |
| X | Besedila slovenska; identifikatorji angleški; analiza v slovenščini. |
| XII | Model ne sme izmišljati cen/stroškov/dobičkov (navodilo + shema brez denarnih polj). |

## Project Structure

```
apps/api/src/platform/scanner/
├── types.ts                         + AiAnalysis, AiAnalysisInput, AiCandidate, AiAnalysisHooks, ScannerType.ai
├── domain/ai-analysis.ts            shema (Zod + JSON schema), hash, navodilo, parseAiOutput, truncateInput
├── models/scanner-ai-cache.model.ts
├── models/scanner-ai-usage.model.ts
├── models/scanner-result.model.ts   + aiAnalysis
├── models/scanner-definition.model.ts + aiEnabled
├── services/ai-client.service.ts    fetch na Responses API; setAiClientForTests
├── services/ai-usage.service.ts     dnevna rezervacija
├── services/ai-candidates.service.ts privzeti kavlji za generično shrambo
├── services/ai-analysis.service.ts  runAiAnalysis (orkestracija, števci, izolacija)
├── services/run-executor.service.ts + korak analize
├── services/result-store.service.ts + aiAnalysis v ResultView
├── router.ts                        + aiEnabled, ai.available
└── domain/definition-input.ts       + aiEnabled
apps/api/src/modules/flight-deals/
├── models/flight-search-rule.model.ts + aiEnabled; models/flight-offer.model.ts + aiAnalysis
├── domain/rule-input.ts             + aiEnabled; services/rule-access/rule-response/offer-query + polja
├── scanner/ai.ts                    kavlja candidates/store; scanner/type.ts registrira `ai`
└── router.ts                        limits.aiAvailable
apps/web/src/app/
├── core/scanners/scanners.model.ts  + AiAnalysis, aiEnabled, riskLabel/riskColor
├── shared/ai-analysis/ai-analysis-card.component.ts   skupni prikaz
├── features/scanners/{scanner-wizard,scanner-results,result-list}  stikalo + prikaz
└── features/flight-deals/{model,search-editor,offer-table,offer-card,offer-detail}  stikalo + prikaz
```

## Complexity Tracking

| odločitev | razlog |
|---|---|
| analiza na `FlightOffer` (skupna), ne na ujemanju | en klic za vse uporabnike iste ponudbe; analiza je objektivna |
| dva predpomnilnika (`inputHash` na zapisu + zbirka) | prvi je brez poizvedbe, drugi deli delo med skenerji |
