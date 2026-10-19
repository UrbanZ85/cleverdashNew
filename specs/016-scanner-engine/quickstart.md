# Quickstart: Univerzalni modularni scanner engine (016)

Kako preveriti, da jedro deluje, da leti po njem tečejo kot prej in da se nov tip doda brez
sprememb jedra. Pogodba je v [`contracts/openapi.yaml`](contracts/openapi.yaml), zbirke v
[`data-model.md`](data-model.md), razlogi v [`research.md`](research.md).

## 1 — Zagon in kaj se zgodi s staro bazo

```bash
npm run dev:api
npm run dev:web
```

Ob prvem zagonu po refaktoringu dnevnik pokaže `scanner.legacy.dropped` z imeni zbirk
`flightsearchruns`, `flightschedulersettings`, `flightnotifications` in številom dokumentov — to
je pričakovano (research.md §9). Iskanja, ponudbe, ujemanja in zgodovina cen letov so še tu.

Stare spremenljivke `FLIGHT_SCHEDULER_TICK_SECONDS`, `FLIGHT_RUN_STALE_MINUTES`,
`FLIGHT_RUN_RETENTION_DAYS` še delujejo z opozorilom `env.deprecated`; nova imena so
`SCANNER_TICK_SECONDS`, `SCANNER_RUN_STALE_MINUTES`, `SCANNER_RUN_RETENTION_DAYS`.

V meniju sta zavihka **Leti** (nespremenjen) in **Skenerji** (nov, privzeto vklopljen). Če
Skenerjev ni: oseba jih je izklopila v Nastavitve → Meni, ali manjkata obsega `scanners:read`,
`scanners:write` v `BASE_USER_SCOPES`.

## 2 — Leti tečejo kot prej (US1)

1. Leti → iskanja, ponudbe, deljene ponudbe: vse strani so iste, podatki isti.
2. Gumb **Administracija** na strani Leti zdaj vodi na **Skenerji → Administracija** z izbranim
   tipom "Leti"; stara povezava `/flight-deals/admin` preusmeri tja.
3. Administracija → tip **Leti**: urnik je privzeto *Vsak dan ob 6:00 in 18:00*, Europe/Ljubljana
   (kot v 015). **Preveri zdaj** → zagon tipa `flights`, stanje `running` → `succeeded`.
4. S testnim virom (`FLIGHT_FAKE_PROVIDER_ENABLED=true`) trije ročni zagoni dajo isti scenarij
   kot v quickstartu 015 §5: NOVO 120 € → 89 € (−25,8 %) → 110 € (+23,6 %), četrti BGY izgine.
   Administracija → **Obvestila**: po prvem zagonu en `sent` (ali `suppressed:
   smtp-not-configured`) na prejemnika, po drugem brez novega zapisa, kadar ni sprememb.

Česar NE sme biti: dva zagona tipa `flights` hkrati (drugi klik → 409), dopis brez sprememb,
izgubljena ponudba ob `unreachable` viru.

## 3 — Testni tip "echo" (US4, US5, US6)

V `.env`: `SCANNER_ECHO_ENABLED=true` (pri `NODE_ENV=production` zagon zavrne z imenom
spremenljivke).

1. Skenerji → **Nov skener** → korak 1: na izbiro sta *Leti* in *Echo (testni)*. Izbira *Leti*
   preusmeri na obstoječi urejevalnik iskanja (`/flight-deals/searches/new`).
2. Izbira *Echo* → korak 2: polje "Število rezultatov" (1–20). Prazno → slovensko sporočilo,
   naprej ni mogoče.
3. Korak 3: urnik *Vsako uro* ali po meri (`*/2 * * * *` za hitro preverjanje), časovni pas,
   obvestila vklopljena. Neveljaven izraz (`0 25 * * *`) → zavrnjeno z razlago.
4. Shrani → na seznamu vrstica tipa Echo z lastnim urnikom in naslednjim terminom.
5. **Zaženi zdaj** (lastnik) ali počakaj termin. Scenarij po zagonih:
   - zagon 1: N rezultatov `NEW`, en dopis z N postavkami;
   - zagon 2: isti rezultati, `UNCHANGED`, brez dopisa;
   - zagon 3: rezultat 1 cena −10 → `PRICE_DOWN`, en dopis z eno postavko;
   - zagon 4: rezultat N `UNAVAILABLE`, brez dopisa.
6. Klik na vrstico → generični prikaz rezultatov (naslov, vir, cena, prvič/zadnjič videno,
   sprememba); klik na rezultat → zgodovina s točkami.
7. Drugi echo skener, ki ga nastaviš na 0 rezultatov (meja je 1, torej prek baze ali testa na
   `failed` scenarij): njegov zagon konča `failed`, prvi skener teče naprej in dobi svoj dopis.

Odstranitev tipa: izbriši `apps/api/src/modules/echo-scanner/`, vrstico
`registerEchoScannerType()` v `main.ts`, `apps/web/src/app/features/echo-scanner/` in vrstico
`registerEchoScannerUi()` v `apps/web/src/main.ts`. `npm run typecheck && npm run lint && npm test`
morajo ostati čisti; obstoječi echo skenerji na seznamu dobijo oznako "tip ni na voljo".

## 4 — Urnik in zagoni (US2, FR-013 do FR-021)

1. Administracija → *Leti* → urnik `*/2 * * * *`: zagon nastane v minuti po terminu brez
   restarta; vrni na privzeto.
2. Restart (`Ctrl+C`, `npm run dev:api`) med zagonom: zagon postane `interrupted` po
   `SCANNER_RUN_STALE_MINUTES`, termin se ne ponovi, naslednji pride po urniku.
3. Dva echo skenerja z urnikom na isto minuto: dva zagona, zaporedno (privzeto
   `SCANNER_MAX_CONCURRENT_RUNS=1`), vsak s svojim `slotKey`.
4. Navaden uporabnik: `PUT /scanners/admin/types/flights/schedule` → 403;
   `POST /scanners/admin/runs` → 403; `POST /scanners/{id}/run` na tujem skenerju → 404; na
   svojem iskanju letov → 403 (batch tip).

## 5 — Avtomatizacija (člen III)

```bash
curl -H "X-Api-Key: $KEY" http://localhost:3000/api/v1/scanners/types
curl -H "X-Api-Key: $KEY" http://localhost:3000/api/v1/scanners
curl -H "X-Api-Key: $KEY" -H "Content-Type: application/json" -H "Idempotency-Key: $(uuidgen)" \
  -d '{"name":"Echo","type":"echo","schedule":{"preset":"hourly"},"config":{"items":3}}' \
  http://localhost:3000/api/v1/scanners
curl -H "X-Api-Key: $KEY" http://localhost:3000/api/v1/scanners/admin/types   # → 403
```

Ključ potrebuje `scanners:read`, `scanners:write`; za vrstice tipa leti še `flight-deals:read`.

## 6 — Testi

```bash
npm test --workspace apps/api -- scanner        # jedro: unit + contract + integration
npm test --workspace apps/api -- flight-deals   # regresija letov (nespremenjena pričakovanja, nove admin poti)
npm test --workspace apps/api -- echo           # testni tip
npm test --workspace apps/web -- scanners
npm run typecheck && npm run lint
npx --yes @redocly/cli lint specs/016-scanner-engine/contracts/openapi.yaml
```

Scenariji iz naročila → testi:

| scenarij | test |
|---|---|
| registracija tipa, nepodprt tip, meja jedra brez letov | `tests/unit/scanner/registry.spec.ts`, `tests/unit/scanner-core-boundary.spec.ts` |
| preverjanje nastavitev, cron, cona | `tests/unit/scanner/definition-input.spec.ts`, `schedule-slots.spec.ts` (preseljen) |
| termini, sočasnost, prekinitev, dohitevanje, dva izvoda | `tests/integration/scanner/run-lifecycle.spec.ts` |
| izolacija napak (zagon in definicija) | `tests/integration/scanner/error-isolation.spec.ts` |
| shranjevanje, dedup, spremembe, nedosegljivo, brez cene | `tests/unit/scanner/result-store.spec.ts`, `tests/integration/scanner/echo-scenario.spec.ts` |
| obvestila: en dopis, ponovitev, zadušitve, `type-unavailable` | `tests/integration/scanner/notification-outbox.spec.ts` |
| pravice, tuji skenerji, admin-only, API ključ | `tests/contract/scanner/access.spec.ts`, `admin.spec.ts`, `scanners-crud.spec.ts` |
| leti nespremenjeni (SC-001, SC-002) | obstoječi `tests/*/flight-deals/*` + `tests/integration/flight-deals/digest-regression.spec.ts` |
| drop starih zbirk | `tests/integration/scanner/legacy-cleanup.spec.ts` |
| zavihek in odstranitev | `tests/integration/scanner/tab.spec.ts`, `tests/integration/echo-scanner/removal.spec.ts` |

## 7 — Kadar kaj ne dela

| simptom | kje pogledati |
|---|---|
| zagon se ne začne ob terminu | `GET /scanners/admin/types` → `schedule.enabled`, `nextRunAt`; dnevnik `scanner.tick` |
| skener na seznamu z oznako "tip ni na voljo" | tip ni registriran (`main.ts`) ali `isEnabled(env)` vrača `false` (npr. `SCANNER_ECHO_ENABLED`) |
| zagon obstane `running` | po `SCANNER_RUN_STALE_MINUTES` → `interrupted`; dnevnik `scanner.run.interrupted` |
| dopis ni prišel | `/scanners/admin/notifications`: `suppressed` z razlogom ali `pending` z `lastError` |
| dvojni dopis | unikatni indeks `(recipientUserId, runId)`; če se zgodi, priloži `runId` — hrošč najvišje resnosti |
| leti brez administracije | `/flight-deals/admin` je preusmeritev; pravi naslov je `/scanners/admin?type=flights` |
| stari `FLIGHT_*` v `.env` | delujejo z opozorilom; preimenuj v `SCANNER_*` |
