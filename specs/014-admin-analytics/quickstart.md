# Quickstart: Administratorska analitika (014)

Kako pregled preizkusiti in kje pogledati, kadar kaj ne dela.

## 1 — Zagon

Nobene priprave ni: vse štiri nove spremenljivke okolja imajo privzetek v
`apps/api/src/platform/config/env.ts`, novega nosilca v `infra/docker-compose.yml` pa ta
funkcionalnost ne uvaja — telemetrija je v bazi, merjena vsebina pa je že tam, kjer je bila.

```bash
npm run dev:api     # vrata iz PORT
npm run dev:web     # Ionic dev strežnik
```

Zavihek **Analitika** se pojavi v meniju **samo, če ima prijavljena oseba vlogo
`cleverdash-admin`**. Če ga admin ne vidi, je razlog skoraj gotovo eden od treh:

- oseba v Keycloaku nima admin vloge → preveri `KEYCLOAK_ADMIN_ROLE`;
- zavihek je izklopljen v osebnih nastavitvah → `Nastavitve → Zavihki`;
- vnos v `TAB_REGISTRY` nima `requiredScopes: ['admin']` ali pa ga sploh ni.

Če ga vidi **kdorkoli drug**, je to napaka najvišje resnosti in ne kozmetična: pomeni, da
`requiredScopes` ni nastavljen ali da ga `resolveTabs` ne upošteva.

## 2 — Telemetrija se začne zbirati ob uvedbi

Pred prvim testom je vredno vedeti, kaj je pričakovano stanje: **podatkov za nazaj ni in jih ne
bo**. Pregled uporabe na sveži namestitvi pokaže `coverage.dataSince: null` in izpiše, da meritev
še ni. Prazne številke torej **ne** pomenijo, da beleženje ne dela — dokler ni v `coverage`
kakšen datum, ni ničesar za brati.

## 3 — Poraba prostora (US1)

1. Naloži datoteko v **Deljenje datotek**, sliko pripni k receptu, posnetek k beležki.
2. Odpri **Analitika → Prostor**.

Kaj mora biti videti:

| podatek | kje | kako preveriti |
|---|---|---|
| skupna poraba | zgoraj | enaka vsoti vrstic po virih |
| razbitje po viru | tabela virov | slike receptov, posnetki beležk, deljene datoteke |
| po osebi | tabela oseb | vsota vrstice = vsota njenih postavk |
| število zapisov | ob bajtih | "ena datoteka po 400 MB" in "400 datotek po 1 MB" nista isto |
| zasedenost nosilca | ločena vrstica | **NE sme biti sešteta** s porabo — druga številka |

```bash
# ista številka brez vmesnika (FR-042, SC-005)
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$BASE/api/v1/analytics/storage" | jq '{totalBytes, computedAt, sources: [.sources[].id]}'
```

**Če se pregled ne osveži**, je skoraj gotovo predpomnilnik: privzeto velja 300 s. `computedAt` v
odgovoru to pove, `?fresh=true` pa ga zaobide:

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$BASE/api/v1/analytics/storage?fresh=true" | jq .computedAt
```

**Če manjka cel vir**, poglej `sources[].present`. `false` pomeni, da zbirke v namestitvi ni —
kar je pravilno vedenje po odstranitvi modula in napaka, če je modul tam.

## 4 — Razhajanje med diskom in bazo (US4)

Umetno povzroči razhajanje in preveri, da ga pregled najde:

```bash
# 1. sirota: vsebina brez zapisa (starejša od 24 h, sicer je prezrta kot nalaganje v teku)
mkdir -p "$FILE_SHARE_DIR/blobs/ab"
head -c 1048576 /dev/urandom > "$FILE_SHARE_DIR/blobs/ab/abdeadbeefdeadbeefdeadbeefdeadbe"
touch -d '2 days ago' "$FILE_SHARE_DIR/blobs/ab/abdeadbeefdeadbeefdeadbeefdeadbe"

# 2. manjkajoča vsebina: zapis ostane, datoteka izgine
rm "$FILE_SHARE_DIR/blobs/xx/<storageId obstoječe datoteke>"
```

Po `?fresh=true` mora `integrity.findings` vsebovati `orphan-blob` (1 zapis, ~1 MB) in
`missing-content`. `integrity.clean` mora biti `false`.

Na čisti namestitvi mora `clean` biti `true` — to je **izrecna trditev**, ne prazen seznam.
Prazen seznam brez te zastavice se ne da ločiti od preverbe, ki ni tekla (člen VII).

> Analitika ob tem **ničesar ne pobriše** (FR-020). Siroto pospravi pometač modula 009.

## 5 — Prijave in ogledi (US2, US3)

1. Prijavi se z dvema računoma.
2. S katerim koli od njiju klikni po petih zavihkih.
3. **Analitika → Uporaba**, obdobje 7 dni.

Kaj mora biti videti:

- pri obeh osebah število prijav in čas zadnje aktivnosti;
- lestvica zavihkov, v kateri so **tudi zavihki z nič ogledi**;
- razbitje ogledov po osebi;
- koliko oseb je bilo v obdobju aktivnih in koliko ne.

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$BASE/api/v1/analytics/usage?days=7" | jq '{coverage, logins, tabs: [.tabs[] | {tabId, views}]}'
```

### Preverba okna proti dvojnemu štetju (FR-027)

Petkrat zaporedoma osveži isti zavihek. Števec se sme premakniti **za ena**, ne za pet. Ista
preverba prek API-ja:

```bash
for i in 1 2 3 4 5; do
  curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d '{"tabId":"notes"}' "$BASE/api/v1/usage/views" | jq -c .
done
# pričakovano: prvi {"counted":true}, ostali {"counted":false}
```

`counted: false` **ni napaka** in odjemalec nanj ne sme reagirati.

### Preverba, da neznan zavihek ne pride v zbirko (FR-031)

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"tabId":"karkoli"}' "$BASE/api/v1/usage/views"
# pričakovano: 400
```

## 6 — Prevzem imena šteje adminu, ne izbrani osebi (FR-026)

Najbolj tiha napaka v tej funkcionalnosti in zato lastna preverba:

1. Kot admin v meniju prevzemi ime druge osebe.
2. Klikni po zavihkih.
3. Odpri **Analitika → Uporaba**.

Ogledi morajo pristati pri **adminu**, ne pri osebi, katere ime je prevzeto. Če je obratno, je
v `platform/usage/router.ts` uporabljen `req.auth` namesto `req.actor` — kar je za vse ostale
module pravilno in tu ni.

## 7 — Kdo česa ne sme (US1.6, US5.3)

```bash
# navaden uporabnik → 403, in zavihka sploh nima v /tabs
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $USER_TOKEN" \
  "$BASE/api/v1/analytics/storage"

# API ključ → 403, tudi če bi imel vse obsege
curl -s -o /dev/null -w '%{http_code}\n' -H "X-Api-Key: $KEY" \
  "$BASE/api/v1/analytics/storage"
```

Oba morata vrniti `403`. Pri prvem preveri tudi, da `GET /tabs` zavihka `analytics` sploh ne
vsebuje — zavrnjena pot, ki je v meniju, je slaba izkušnja, ne varnost.

## 8 — Rok hrambe

Telemetrija izgine sama, prek TTL indeksa na `expiresAt` (privzeto 400 dni). Preverba brez
čakanja leta:

```js
// v Mongo lupini: postaraj en števec in počakaj na TTL obhod (do 60 s)
db.usagecounters.updateOne({}, { $set: { expiresAt: new Date(Date.now() - 1000) } })
```

Če zapis ne izgine, indeksa ni — preveri `db.usagecounters.getIndexes()`. Rok hrambe, ki ga
nihče ne uveljavlja, je natanko napaka, ki jo v tem zaledju že imamo drugje
(`SCREENSHOT_RETENTION_DAYS` je razglašen in ga ne bere nihče).

## 9 — Testi

```bash
npm run typecheck
npm run lint
npm test
```

Kaj pokrivajo in kje so:

| plast | kje | kaj dokazuje |
|---|---|---|
| telemetrija | `apps/api/tests/unit/usage-counter.spec.ts` | dan po Ljubljani, **prehod na poletni in zimski čas**, `expiresAt` iz dneva, oznaka zavihka iz registra |
| obdobja | `apps/api/tests/unit/analytics-usage-window.spec.ts` | okno čez novo leto, `truncated` ob treh različnih vzrokih |
| zlaganje | `apps/api/tests/unit/analytics-rollup.spec.ts` | prazne vrstice, "neznan lastnik", lestvica z ničlami |
| celovitost | `apps/api/tests/unit/analytics-integrity.spec.ts` | štiri vrste razhajanj, obdobje milosti, `clean` kot izrecna trditev |
| meje modula | `apps/api/tests/unit/analytics-sources.spec.ts` | vsako prepisano ime zbirke je enako imenu zbirke svojega modela |
| pogodba | `apps/api/tests/contract/analytics/` | dovolilnica, oblika odgovorov, prevzem imena, skladnost s pogodbo |
| odpornost | `apps/api/tests/integration/analytics-resilience.spec.ts` | brez zbirke enega vira pregled še vedno odgovori; umetno razhajanje je najdeno |
| odjemalec | `apps/web/tests/unit/analytics-model.spec.ts` | oblikovanje bajtov, opozorilo o pokritosti, preslikava naslova v zavihek |
