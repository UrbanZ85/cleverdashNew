# Quickstart: Analiza rezultatov z umetno inteligenco (017)

## 1 — Nastavitev

V `.env` (negitan):

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-6.1-sol
```

Brez ključa aplikacija deluje naprej; `GET /api/v1/scanners/types` vrne `ai.available: false`
in obrazci ob stikalu povedo, da analiza v tej namestitvi ni na voljo.

## 2 — Testni tip echo

```
SCANNER_ECHO_ENABLED=true
```

1. Skenerji → Nov skener → Echo → 3 rezultati → 3. korak: vklopi **Analiza z umetno
   inteligenco** → Shrani.
2. Zaženi zdaj. Zavihek Zagoni: `aiAnalyzed: 3` (ali `aiCached`, če je vhod že v predpomnilniku).
3. Zavihek Rezultati: vsak rezultat ima značko tveganja; klik odpre podrobnosti z analizo
   (povzetek, razlaga, alineje, lastnosti, model in čas).
4. Zaženi znova: `aiAnalyzed: 0` — vhod se ni spremenil. Tretji zagon (pocenitev enega
   rezultata): `aiAnalyzed: 1`.
5. Uredi skener → izklopi analizo → zagon: analize ostanejo, nove ne nastajajo.

## 3 — Leti

1. Leti → iskanje → vklopi **Analiza z umetno inteligenco** → Shrani.
2. Skenerji → Administracija → Leti → Preveri zdaj.
3. Leti → tabela ponudb: vrstice ujemanj tega iskanja imajo značko tveganja; razširjena vrstica in
   stran ponudbe kažeta celotno analizo.

## 4 — Meje in napake

- `SCANNER_AI_MAX_ITEMS_PER_RUN=2` + echo s 5 rezultati → zagon: `aiAnalyzed: 2, aiSkipped: 3`;
  naslednji zagon analizira preostale (kandidati brez analize).
- Napačen ključ → zagon je `succeeded`, `aiFailed: n`, `errors[].code = 'ai:http-401'`;
  rezultati in dopisi nedotaknjeni.

## 5 — Testi

```bash
cd apps/api && npx vitest run tests/unit/scanner/ai-analysis.spec.ts tests/integration/scanner/ai-analysis.spec.ts tests/integration/flight-deals/ai-analysis.spec.ts tests/contract/scanner/scanners-crud.spec.ts tests/contract/scanner/types.spec.ts tests/contract/flight-deals/searches-crud.spec.ts
cd apps/web && npx vitest run tests/unit/scanners-model.spec.ts tests/unit/flight-deals-model.spec.ts
npx --yes @redocly/cli lint specs/015-flight-deals/contracts/openapi.yaml specs/016-scanner-engine/contracts/openapi.yaml
```
