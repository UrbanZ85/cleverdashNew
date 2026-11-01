# Quickstart: Zbirateljski skener (019)

Pogodba: [`contracts/openapi.yaml`](contracts/openapi.yaml); podatki: [`data-model.md`](data-model.md);
razlogi: [`research.md`](research.md).

## 0 — Regresija izvleke (pred vsem ostalim)

```bash
cd apps/api && npx vitest run tests/unit/lego tests/integration/lego tests/contract/lego tests/unit/scanner-core-boundary.spec.ts
```

Vsi LEGO testi morajo biti zeleni **brez sprememb testov**. Šele nato se gradi zbirateljski tip.

## 1 — Testni vir (brez ključev)

```
COLLECTIBLES_FAKE_SOURCE_ENABLED=true
```

Ponovno zaženi API. Skenerji → Nov skener → **Zbirateljski predmeti**. Ustvari dve iskanji:
"Charizard test" (kategorija kartice) in "Game Boy test" (retro igre), urnik "vsako uro", in pritisni
**Zaženi zdaj** štirikrat na vsakem.

| zagon | kartice | retro |
|---|---|---|
| 1 | NOVO: Charizard 4/102 raw (visoka prepoznava); isti kot PSA 9 (druga različica); japonska različica; reverse holo; "proxy" (brez ocene); dražba, ki se izteka | NOVO: Game Boy loose; Game Boy CIB; PAL in NTSC igra; "repro" (brez ocene); "defekt" |
| 2 | dražba se dvigne: dopis, ne končna cena | enako |
| 3 | pocenitev raw Charizarda: dopis; PSA 9 ostane ločen | pocenitev CIB |
| 4 | en oglas izgine: "ni več na voljo" (ne "prodano"), brez dopisa | enako |

Preveri:
- PSA 9 in raw nista primerjana (različen `variantKey`), japonska ni primerjana z angleško;
- retro rezultati brez ključa PriceCharting kažejo "premalo podatkov", ne 0 €;
- kartice imajo "ocena (katalog)" in popust do ocene, **dobiček je neznan** z razlogom "ni preverjenih prodaj";
- zagon z umetnim virom `sold` (samo v testih) kaže dobiček z vsemi postavkami in oznako "ocena";
- stikalo UI izklopljeno → 0 klicev ponudniku.

## 2 — Pravi viri

V `.env` (negitan):

```
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
EBAY_MARKETPLACES=EBAY_DE,EBAY_IT
PRICECHARTING_API_KEY=      # izbirno, plačljivo; brez njega retro brez vrednosti
```

- TCGdex ne potrebuje ključa.
- `GET /api/v1/collectibles-scanner/sources` pove, kaj je vklopljeno (da/ne, brez ključev).
- **Pred prvim pravim klicem** potrdi (research §3, §4, §7): eBay kategorije kartic/iger, meje in licenco
  TCGdex, obliko odgovora PriceCharting; popravi razčlenitev in mock v isti nalogi.

## 3 — Testi

```bash
cd apps/api && npx vitest run tests/unit/collectibles tests/integration/collectibles tests/contract/collectibles
cd apps/web && npx vitest run tests/unit/collectibles-model.spec.ts
npx --yes @redocly/cli lint specs/019-collectibles-scanner/contracts/openapi.yaml
npm run typecheck && npm run lint
```
