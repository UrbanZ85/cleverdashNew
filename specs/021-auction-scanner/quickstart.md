# Quickstart: Dražbeni skener (021)

Vodič za preverjanje, ne za izvedbo. Predpogoj: 019 je zaključen in committan (glej research §7).

## Predpogoji

- `pnpm install`; MongoDB kot za ostale skenerje.
- Okolje strežnika: `AUCTIONS_FAKE_SOURCE_ENABLED=true` (testni vir). Pravi viri so izbirni:
  `AUCTIONS_SODNEDRAZBE_FEEDS` (URL-ji RSS, ki jih ustvari lastnik v portalu), `AUCTIONS_GOVSI_ENABLED=false`.
- Brez ključev in brez omrežja deluje samo testni vir; to je pričakovano.

## Scenarij 1 — viri in nedostopni

1. `GET /api/v1/auctions-scanner/sources` → `sodnedrazbe` = `manual` (brez URL-ja) ali `partial`; `govsi` izklopljen z razlogom;
   `furs`, `ajpes` = `unavailable` z razlogom; `e-justice` = `reference`. Brez skrivnosti v odgovoru.
2. Ustvari iskanje z virom `furs` → 422 z jasnim razlogom.

## Scenarij 2 — iskanje in filtri (testni vir)

1. V čarovniku Skenerji izberi "Dražbe", predloga "Dražbe", vir `fake`, največja začetna cena 5.000 €, kategorija vozila.
2. Ročni zagon → samo ustrezne dražbe; neznane vrednosti kažejo "neznano", ne 0 €.
3. Ustvari drugo iskanje (predloga "Poslovne likvidacije") → ločeni rezultati, urnik, zgodovina.

## Scenarij 3 — vrednotenje

1. Brez tržne ocene → "premalo podatkov", razlog prikazan.
2. Z `estimatedMarketValue`, provizijo kupca, davkom → postavke, dobiček, ROI, najvišja ponudba, označeno "ocena".
3. Varščina `refundable`/`credited` → ni v skupnem strošku; `non-refundable` → je (enkrat).

## Scenarij 4 — življenjski cikel in obvestila

Testni vir vrne zaporedje stanj: nova → znižanje → preložitev → preklic → izginotje. Pričakovano: po en dogodek in
natanko eno obvestilo na prejemnika za vsak prehod; ponovni zagon brez spremembe ne sproži nič; izginotje =
"ni več objavljeno".

## Scenarij 5 — AI

`aiEnabled=false` → 0 klicev ponudniku. `true` → analizirani samo obetavni rezultati; brez številskih vrednosti.

## Komande

```
pnpm --filter api test -- auctions
pnpm --filter web test -- auctions
pnpm typecheck && pnpm lint
```

Regresija: obstoječi testi LEGO in zbirateljskih skenerjev so nespremenjeni in zeleni. Po odstranitvi mape modula
na obeh straneh in registracijskih vrstic ostaneta `typecheck` in `lint` čista.

Pogodba: [contracts/openapi.yaml](contracts/openapi.yaml). Model: [data-model.md](data-model.md).
