# Quickstart: LEGO skener (018)

Pogodba: [`contracts/openapi.yaml`](contracts/openapi.yaml); podatki: [`data-model.md`](data-model.md);
razlogi: [`research.md`](research.md).

## 1 — Testni vir (brez ključev)

```
LEGO_FAKE_SOURCE_ENABLED=true
```

Ponovno zaženi API. V Skenerji → Nov skener → **LEGO skener** se v obrazcu pokaže, da je vklopljen
testni vir. Ustvari iskanje "LEGO test" (najvišja cena 1000 €, tržnica EBAY_DE, prag obvestila
30 €) z urnikom "vsako uro" in pritisni **Zaženi zdaj** štirikrat.

| zagon | kaj se zgodi |
|---|---|
| 1 | NOVO (dopis za 75192 in za dražbo, ki se izteka čez 3 h): set 75192 (350 €), set 75192 rabljen z neznano kompletnostjo, paket, deli, prazna škatla, dražba, Technic. Ocena priložnosti samo pri zanesljivo prepoznanih in vrednotenih |
| 2 | dražba 75257 se dvigne s 60 na 70 €: en dopis (sprememba ponudbe, ne končna cena); ostalo nespremenjeno |
| 3 | pocenitev 75192 na 330 €: dopis s postavkami izračuna |
| 4 | Technic 42115 (nov) izgine ob uspešnem odgovoru vira: "ni več na voljo" (ne "prodano"), brez dopisa |

Preveri: paket, deli in prazna škatla nimajo dobička; rabljen oglas ima oznako "kompletnost ni
preverjena"; izračun v podrobnostih ima vse postavke in oznako "ocena".

## 2 — Pravi viri

V `.env` (negitan):

```
REBRICKABLE_API_KEY=
BRICKLINK_CONSUMER_KEY=
BRICKLINK_CONSUMER_SECRET=
BRICKLINK_TOKEN=
BRICKLINK_TOKEN_SECRET=
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
EBAY_MARKETPLACES=EBAY_DE,EBAY_IT
```

- BrickLink: v BrickLink računu registriraj **IP naslov strežnika** (Account → API); brez tega
  vir javi `unreachable` z navodilom.
- eBay: produkcijski ključ aplikacije (developer.ebay.com), Browse API.
- Pot `GET /api/v1/lego-scanner/sources` pove, kateri viri so vklopljeni (da/ne).

**Prvi pravi klic potrdi mock odgovore** (research §3, §4): če oblika odgovora odstopa, se popravijo
razčlenitev in mock v isti nalogi; razčlenitev je tolerantna (manjkajoče polje = izpuščen atribut).

## 3 — Testi

```bash
cd apps/api && npx vitest run tests/unit/lego tests/integration/lego tests/contract/lego
cd apps/web && npx vitest run tests/unit/lego-model.spec.ts
npx --yes @redocly/cli lint specs/018-lego-scanner/contracts/openapi.yaml
```
