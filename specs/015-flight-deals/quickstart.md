# Quickstart: Iskalnik letalskih ponudb (015)

Kako modul preizkusiti in kje pogledati, kadar kaj ne dela. Pogodba je v
[`contracts/openapi.yaml`](contracts/openapi.yaml), zbirke v [`data-model.md`](data-model.md),
razlogi v [`research.md`](research.md).

## 1 — Zagon

Brez dopolnjevanja `.env` modul deluje, a **brez vira**: vsak zagon konča s "ni vklopljenih
virov" in brez ponudb. Za pravo preverjanje potrebuješ žeton Travelpayouts:

1. Registracija partnerja na travelpayouts.com (brezplačno) → v profilu je **API token**.
2. V `.env`:
   ```
   FLIGHT_TRAVELPAYOUTS_TOKEN=<žeton>
   FLIGHT_TRAVELPAYOUTS_MARKER=<marker, neobvezno>
   ```
3. Za e-pošto (že obstoječe spremenljivke + ena nova):
   ```
   SMTP_HOST=… SMTP_PORT=587 SMTP_SECURE=false SMTP_USER=… SMTP_PASSWORD=… SMTP_FROM=…
   ```

```bash
npm run dev:api
npm run dev:web
```

Zavihek **Leti** je privzeto vklopljen in se pojavi v meniju vsem prijavljenim. Če ga ni:
oseba ga je izklopila v Nastavitve → Meni, ali pa manjka obseg `flight-deals:read` v
`BASE_USER_SCOPES` (`platform/keycloak/role-mapping.ts`) — potem dela samo adminu.

Povezava **Administracija** na strani modula je vidna samo adminu; če jo vidi kdo drug, je to
napaka vmesnika, vendar NE varnostna: strežnik `GET /scanners/admin/*` zavrne s `403`. Od 016 je
administracija letov del administracije skenerjev (`/scanners/admin?type=flights`); stara pot
`/flight-deals/admin` tja preusmeri.

## 2 — Spike pokritosti (pred fazo virov)

```bash
FLIGHT_TRAVELPAYOUTS_TOKEN=… node apps/api/scripts/spike-travelpayouts.mjs LJU ZAG TRS VCE TSF GRZ KLU
```

Izpiše za vsak par (letališče, mesec) število ponudb, delež direktnih, starost najstarejšega
podatka in ali `link` z `&marker=` odpre iskanje z oznako. Rezultat se zapiše sem:

| letališče | ponudb/mesec (povprečje) | direktnih | najstarejši podatek | opomba |
|---|---|---|---|---|
| *(izpolni spike)* | | | | |

Če je pokritost LJU/TRS/GRZ/KLU pod ~20 ponudb na mesec, je to podatek za lastnika o vklopu
Ryanaira (`FLIGHT_RYANAIR_ENABLED=true`), ne razlog za spremembo načrta.

## 3 — Iskanje (US1)

1. Leti → **Novo iskanje**.
2. Odhod: vpiši `trst` → Trst (TRS); dodaj LJU. Preizkusi "v radiju 150 km od Ljubljane" —
   seznam mora vsebovati ZAG, TRS, VCE, TSF, GRZ, KLU z razdaljo.
3. Cilj: *Kamor koli*. Datumi: *Obdobje* 22. 10. 2026 – 1. 11. 2026, fleksibilnost ±2.
4. Nočitve 2–3. Odhod: petek, po 15:00. Povratek: nedelja.
5. **Predogled** mora pisati: odhodi 20. 10. – 3. 11. 2026, povratki po pravilu, 2 kombinaciji
   datumov (pet 23. 10. → ned 25. 10. in pet 30. 10. → ned 1. 11.), poizvedbe = 2 letališči × 3
   pari mesecev (okt→okt, okt→nov, nov→nov) = 6.
6. Shrani → na seznamu Moja iskanja z "še ni preverjeno".

Negativni primeri: največ 2 nočitvi + najmanj 3 → sporočilo o trajanju; fleksibilnost `-1` ali
`2,5` → zavrnjeno; `po meri` 10 → predogled razširi okno za 10 dni.

## 4 — Preverjanje in ponudbe (US2)

1. Kot admin: Leti → Administracija (Skenerji → tip Leti) → **Preveri zdaj**. Zagon se pojavi kot `running`, nato
   `succeeded` ali `partial`.
2. Glavna stran modula pokaže ponudbe, pri vsaki vir, ceno, letališči, datume in **čas podatka**
   (pri Travelpayouts starejši od časa preverjanja — to je pričakovano, ne napaka).
3. Pri iskanju piše čas zadnjega uspešnega pregleda in izid po virih.

Kaj pomeni kateri izid pri iskanju:

| izid | pomen | kaj storiti |
|---|---|---|
| `ok` | vir je odgovoril, ponudbe primerjane | nič |
| `noFlights` | vir je odgovoril, ničesar ni ustrezalo | razširi pravila |
| `unsupported` | vir tega iskanja ne zna (Wizz/easyJet vedno) | nič |
| `unreachable` | omrežje/5xx; **ponudbe ostanejo** | poglej `GET /scanners/admin/types` → `flights.extras.providers` → zadnja napaka |
| `rateLimited` | 429 ali dnevna meja neuradnega vira | počakaj na naslednji zagon |
| `incomplete` | odgovor odrezan (1000 vrstic) ali nepopolne cene | zoži iskanje |
| `disabled` | vir ni vklopljen v okolju | nastavi žeton / zastavico |

## 5 — Spremembe cen (US3)

V razvoju brez čakanja na vir: `FLIGHT_FAKE_PROVIDER_ENABLED=true` (zavrnjeno pri
`NODE_ENV=production`). Testni vir ima scenarij "120 → 89 → 110" za LJU→STN; trije ročni zagoni
zapored dajo:

- po prvem: ponudba z oznako **NOVO**, brez prejšnje cene;
- po drugem: stara ~~120 €~~, nova **89 €** zeleno, −31 € (−25,8 %);
- po tretjem: stara ~~89 €~~, nova **110 €** rdeče, +21 € (+23,6 %);
- podrobnosti ponudbe: graf s tremi točkami.

Ker gre vse prek predpomnilnika (TTL 3600 s), testni vir **ignorira predpomnilnik** (ključ nosi
števec zagona) — to je lastnost testnega vira, ne produkcijskih.

## 6 — E-pošta (US4)

- Po prvem zagonu z novimi ponudbami: Administracija → **Obvestila** kaže zapis `sent` na
  prejemnika; dopis ima postavke z oznako NOVO.
- Drugi zagon brez sprememb: nobenega novega zapisa (ne `sent`, ne `suppressed`) — nič ni bilo
  za poslati.
- Brez `SMTP_HOST`: zapisi `suppressed` z razlogom `smtp-not-configured`; vmesnik admina to
  pokaže z opozorilom.
- Simulacija napake pošte: napačno `SMTP_PASSWORD` → zapis `pending` z `attemptCount` 1 in
  `nextAttemptAt` čez 60 s; po popravku gesla se pošlje ob naslednjem tiku, **enkrat**.

Dopis preveri v poštnem odjemalcu: stara cena prečrtana, nova obarvana, povezava "Odpri v
CleverDashu" vodi na `/flight-deals/offers/<id>`.

## 7 — Deljenje (US5)

1. Lastnik: iskanje → **Prejemniki** → dodaj osebo (seznam je iz skupnega imenika, zamaskirana
   e-pošta).
2. Zagon s spremembo: oba dobita dopis; prejemnik v **Deljene ponudbe** vidi ponudbo z nazivom
   iskanja in imenom lastnika, **ne** vidi kriterijev.
3. Prejemnik poskusi `PATCH /flight-deals/searches/<id>` → `404`.
4. Lastnik prejemnika odstrani → ob naslednji spremembi dopis samo lastniku; Deljene ponudbe pri
   prejemniku prazne.

## 8 — Urnik (US6)

1. Administracija → Urnik: izberi *Vsak dan ob 6:00 in 18:00* → izpiše izraz `0 6,18 * * *` in
   naslednji termin v Europe/Ljubljana.
2. Vpiši po meri `0 25 * * *` → zavrnjeno z razlago.
3. Nastavi `*/2 * * * *` (vsaki dve minuti) in počakaj: zagon nastane v minuti po terminu brez
   restarta. Nato vrni na privzeto.
4. Med zagonom klikni **Preveri zdaj** → `409`, vmesnik pokaže, da eno že teče.
5. Restart med zagonom (`Ctrl+C` in znova `npm run dev:api`): v zgodovini je zagon
   `interrupted`, naslednji termin je obdelan, obvestil za prekinjeni zagon ni.

## 9 — Avtomatizacija (US7)

```bash
curl -H "X-Api-Key: $KEY" http://localhost:3000/api/v1/flight-deals/searches
curl -H "X-Api-Key: $KEY" -H "Content-Type: application/json" -H "Idempotency-Key: $(uuidgen)" \
  -d @search.json http://localhost:3000/api/v1/flight-deals/searches
curl -H "X-Api-Key: $KEY" http://localhost:3000/api/v1/scanners/admin/types/flights/schedule   # → 403
```

Ključ potrebuje obsege `flight-deals:read`, `flight-deals:write`; za prejemnike `flight-deals:share`.

## 10 — Testi

```bash
npm test --workspace apps/api -- flight-deals     # unit + contract + integration modula
npm test --workspace apps/web -- flight-deals
npm run typecheck && npm run lint
npx --yes @redocly/cli lint specs/015-flight-deals/contracts/openapi.yaml
```

Scenariji iz naročila → testi (vrata 2):

| scenarij | test |
|---|---|
| fiksni datumi; fleksibilnost 0–3 in 10; trajanja; rolling; vikend | `tests/unit/flight-deals/date-window.spec.ts`, `rule-matcher.spec.ts` |
| časovni pasovi, prehod na zimski čas 25. 10. 2026 | `rule-matcher.spec.ts` (LJU→STN čez 25. 10.; nočitve ostanejo 3) |
| NEW / DOWN / UP / UNCHANGED / neveljavne cene | `price-change.spec.ts`, `normalization.spec.ts` |
| neuspel API klic, UNAVAILABLE samo ob uspehu | `tests/integration/flight-deals/provider-outage.spec.ts` |
| deduplikacija ponudb (več iskanj, isti let) in obvestil | `integration/flight-deals/dedupe.spec.ts` |
| deljenje, preklic, tuja iskanja (404) | `tests/contract/flight-deals/sharing.spec.ts`, `isolation.spec.ts` |
| admin-only urnik, sprememba crona, API ključ → 403 | `contract/scanner/flights-admin.spec.ts` (016) |
| sočasni zagoni (slotKey), restart med zagonom | `integration/flight-deals/run-concurrency.spec.ts`, `run-interrupted.spec.ts` |
| neuspelo pošiljanje in varno ponavljanje | `integration/flight-deals/notification-outbox.spec.ts` (nodemailer mockan) |

## 11 — Kadar kaj ne dela

| simptom | kje pogledati |
|---|---|
| zagon se ne začne ob terminu | `GET /scanners/admin/types/flights/schedule` → `enabled`, `nextRunAt`; dnevnik `scanner.tick` |
| zagon obstane `running` | po `FLIGHT_RUN_STALE_MINUTES` postane `interrupted`; dnevnik `flight.run.interrupted` |
| ponudbe izginile | ne smejo: preveri izid vira — `unreachable` jih pusti; `unavailable` se zgodi samo pri `ok` |
| dopis ni prišel | `/scanners/admin/notifications?type=flights`: `suppressed` (razlog) ali `pending` z `lastError`; SMTP geslo/host |
| dvojni dopis | ne sme se zgoditi (unikatni indeks); če se, je to hrošč najvišje resnosti — priloži `runId` |
| letališča ni v iskalniku | nabor ima samo letališča z rednim prometom (OurAirports `scheduled_service=yes`) |
