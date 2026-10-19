---

description: "Task list for feature implementation"
---

# Tasks: Analiza rezultatov z umetno inteligenco (017)

**Vhod**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md)

## Phase 1: Setup

- [X] T001 Okolje `OPENAI_*` in `SCANNER_AI_*` v `apps/api/src/platform/config/env.ts`; testi privzetkov v `apps/api/tests/unit/env.spec.ts`
- [X] T002 [P] `.env.example`, `docs/env-reference.md` (razdelek 017), vrstici `OPENAI_API_KEY=`/`OPENAI_MODEL=` v lokalni `.env`

## Phase 2: Foundational (jedro)

- [X] T003 Tipi `AiAnalysis`, `AiAnalysisInput`, `AiCandidate`, `AiCandidatesContext`, `AiAnalysisHooks`, `ScannerType.ai`, `ResultView.aiAnalysis` v `apps/api/src/platform/scanner/types.ts`
- [X] T004 Čista domena `apps/api/src/platform/scanner/domain/ai-analysis.ts`: Zod shema, JSON schema, `aiInputHash`, `truncateAiInput`, `buildInstructions`, `parseAiOutput`; enotski test `apps/api/tests/unit/scanner/ai-analysis.spec.ts`
- [X] T005 [P] Modela `scanner-ai-cache.model.ts`, `scanner-ai-usage.model.ts`; polja `aiEnabled` (definicija) in `aiAnalysis` (rezultat)
- [X] T006 Odjemalec `services/ai-client.service.ts` (fetch, timeout, ponovitev, refusal/incomplete, `setAiClientForTests`)
- [X] T007 `services/ai-usage.service.ts` (dnevna rezervacija) in `services/ai-candidates.service.ts` (privzeti kavlji za generično shrambo)
- [X] T008 `services/ai-analysis.service.ts` (`runAiAnalysis`) + korak v `run-executor.service.ts`; revizijski dogodki v `scanner.audit.ts`

## Phase 3: US1 + US2 + US3 (jedro + API)

- [X] T009 [US1] `aiEnabled` v `domain/definition-input.ts`, `router.ts` (create/patch/response), `ai.available` v `GET /scanners/types`; `aiAnalysis` v `result-store.service.ts` (`toResultView`)
- [X] T010 [US1] Pogodba `specs/016-scanner-engine/contracts/openapi.yaml` (+ `AiAnalysis`, `aiEnabled`, `ai`), regeneracija `packages/contracts`
- [X] T011 [US2] Integracijski test `apps/api/tests/integration/scanner/ai-analysis.spec.ts`: vklop/izklop, napaka odjemalca, neveljaven odgovor, predpomnilnik, meja na zagon, dnevna meja, nespremenjen vhod, ohranitev po izklopu
- [X] T012 [US1] Pogodbeni testi: `scanners-crud.spec.ts` (`aiEnabled`), `types.spec.ts` (`ai.available`)

## Phase 4: US1 (leti)

- [X] T013 [US1] `aiEnabled` v `flight-search-rule.model.ts`, `rule-input.ts`, `rule-access.service.ts` (`ruleToInput`/`inputToDocument`), `rule-response.service.ts`; `aiAnalysis` v `flight-offer.model.ts`, `offer-query.service.ts` (`toOfferResponse`), `scanner/results.ts`; `limits.aiAvailable` v `router.ts`
- [X] T014 [US1] Kavlja `apps/api/src/modules/flight-deals/scanner/ai.ts` (`candidates`, `store`, `subject`) in registracija v `scanner/type.ts`
- [X] T015 [US1] Pogodba `specs/015-flight-deals/contracts/openapi.yaml`; integracijski test `apps/api/tests/integration/flight-deals/ai-analysis.spec.ts`; `searches-crud.spec.ts` (`aiEnabled`)

## Phase 5: Odjemalec

- [X] T016 [US1] `core/scanners/scanners.model.ts` (`AiAnalysis`, `aiEnabled`, `riskLabel`, `riskColor`, `aiAnalysisMeta`), `scanners.api.ts` (`ai` v `types()`); test `apps/web/tests/unit/scanners-model.spec.ts`
- [X] T017 [US1] Skupna komponenta `apps/web/src/app/shared/ai-analysis/ai-analysis-card.component.ts`
- [X] T018 [US1] Čarovnik (3. korak stikalo + namig), `scanner-results.page.ts` (analiza v podrobnostih), `result-list.component.ts` (značka)
- [X] T019 [US1] Leti: `flight-deals.model.ts` (`aiEnabled` v obrazcu/vnosu, `Offer.aiAnalysis`, `Limits.aiAvailable`), `search-editor.page.ts` (stikalo), `offer-table.component.ts`, `offer-card.component.ts`, `offer-detail.page.ts`; test `flight-deals-model.spec.ts`
- [X] T020 [P] Tema pomoči `scanners.ai` v `help-topics.ts`

## Phase 6: Polish

- [X] T021 Dokumentacija: `docs/scanner-engine.md` (korak analize), `docs/adding-a-scanner-type.md` (`ai` kavlji), `README.md` (017)
- [X] T022 (typecheck zeleno razen predobstoječe napake `timesheet/workbook.spec.ts`; lint zeleno; API scanner+leti 41 datotek / 217 testov, web 37 / 583, web build zeleno; obe pogodbi veljavni; `.env` negitan) Kakovostna vrata: typecheck, lint, testi API + web, redocly obeh pogodb; `git status` brez `.env`
