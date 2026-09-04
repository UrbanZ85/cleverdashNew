# Sprejemno preverjanje — 002 (T121, T122, T126)

Izvedeno 21. 8. 2026 na razvojnem stroju (Docker Desktop, Windows), na živem
`docker compose -f infra/docker-compose.yml` sistemu, zgrajenem iz čiste kopije
(`--no-cache`). To NI VPS produkcijsko okolje — glej opombo o TLS v
[`docs/acceptance-001.md`](acceptance-001.md), ki velja enako tukaj.

Metodologija sledi `acceptance-001.md`: lokalen, nikoli commitan `.env` z generiranimi
skrivnostmi, resnični Docker build/up/stop cikli, po testu `docker compose down -v` in
izbris `.env` ter vseh začasnih datotek. En odklon od 001: `docker compose` je bilo treba
klicati z `--env-file ./.env` (Compose v2 na tem stroju privzeto vzame projektni imenik iz
mape PRVE `-f` datoteke, torej `infra/`, ne trenutnega imenika — brez tega `.env` v korenu
repozitorija ni bil najden).

## Dve resnični napaki, ki jih je ta test razkril (in popravil)

Enako kot pri 001, test ni bil formalnost:

1. **Chromium v vsebniku se ni zagnal kot `root` brez `--no-sandbox`.**
   `api.Dockerfile` ni imel `USER` direktive, zato je proces tekel kot root — Chromium to
   izrecno zavrne (`"Running as root without --no-sandbox is not supported"`). Popravljeno:
   `api.Dockerfile` zdaj ustvari nepriviligiranega uporabnika `cleverdash` (UID 1001) in
   preklopi nanj (`USER cleverdash`), vključno s pravilnikom lastništva `/app/data/screenshots`
   pred montiranjem imenovanega volumna, da vanj lahko piše.
2. **Tudi kot nepriviligiran uporabnik privzeti profil seccomp/AppArmor v vsebniku ne
   dovoli uporabniških imenskih prostorov, ki jih Chromiumov LASTNI peskovnik potrebuje**
   (`"No usable sandbox!"`). To je znana, dobro dokumentirana omejitev headless Chromiuma v
   vsebnikih (glej uradni `pptr.dev/troubleshooting`) — Dockerjeva lastna izolacija
   (vsebnik + nepriviligiran uporabnik iz točke 1) je tu dejanska varnostna meja, ne ta
   drugi, notranji peskovnik. Popravljeno: privzeta vrednost `BROWSER_NO_SANDBOX` je
   spremenjena iz `false` v `true` v `.env.example` in `docs/env-reference.md` — brez tega
   popravka Puppeteer v produkcijski Docker postavitvi NIKOLI ne bi deloval, ne glede na
   pravilnost `shm_size`/`init`/`mem_limit`.

Brez teh dveh popravkov bi vsak prvi resničen zagon 002 na VPS-u odpovedal takoj ob prvem
poskusu branja stanja — nobeden od 236 avtomatiziranih testov (ki uporabljajo
`FakeClockPortal`) tega ni in ni mogel razkriti, ker nikoli ne zaženejo pravega Chromiuma.

## T121 — `docker compose up --build`, brez `Target closed`, zdrav `/health`

| Korak | Izid |
|---|---|
| `docker compose build --no-cache` (api + web) | Uspešno, brez napak |
| `docker compose up -d` | `mongo` zdrav → `api` zdrav → `web` enkraten tek (izhodna koda 0) → `caddy` zdrav |
| `GET /api/v1/health` prek Caddyja | `{"status":"ok",...}`, `schedulerLastTickAgeSeconds: 9` (< `SCHEDULER_TICK_SECONDS * 2 = 60`) |
| Resničen zagon Chromiuma v vsebniku (`POST /time-tracking/diagnostics/test-read` proti `https://example.com`, po popravkih zgoraj) | `{"ok":false,"diagnostics":{"reason":"selector_not_found",...}}` — **NE napaka, NE zrušitev**. Stran ne vsebuje `a.clockin-button`, kar je pričakovano za `example.com`; pomembno je, da je Chromium zagnal, navigiral in prebral DOM brez `Target closed` ali katerekoli druge okvare |
| `docker exec api ps aux` po branju | PID 1 je `/sbin/docker-init` (`init: true` deluje — brez zombi procesov); dolgoživeč Chromium proces z `--no-sandbox`, brez podvojenih/osirotelih procesov |
| `GET /health` po branju | `"browser": "ok"`, `remoteSessions` prikaže testno sejo |

**Izid: PREHOD**, po odpravi obeh napak zgoraj.

## T122 — člen VII: alarm mora priti od zunaj

Enaka metodologija kot `acceptance-001.md` T132: majhen HTTP strežnik na gostitelju kot
namestek za Healthchecks.io, dosegljiv iz vsebnika prek `host.docker.internal:9999`
(`HEALTHCHECK_PING_URL`).

1. Pred ustavitvijo: srčni utrip je prispel redno na ~30 s intervalu (`SCHEDULER_TICK_SECONDS=30`
   v tem testu) — 18 zadetkov zabeleženih do trenutka ustavitve.
2. `docker stop infra-api-1` ob 11:31:08.
3. `GET /api/v1/health` prek Caddyja takoj vrne `502 Bad Gateway` — Caddy ostane pokonci in
   odgovarja (enako opažanje kot v 001), notranji `/health` pa je nedosegljiv.
4. Počakano je bilo 80 s (več kot dva pričakovana intervala) — **noben nov zadetek ni
   prispel** (šteto pred ustavitvijo: 18, po 80 s čakanja: še vedno 18).
5. `docker start infra-api-1` — vsebnik se je vrnil brez ročnega posega, srčni utrip se je
   nadaljeval v nekaj sekundah (naslednji zadetek #18 ob 11:33:00, brez manjkajočih tikov v
   razporejevalniku).

**Izid: PREHOD.** Enak mehanizem kot pri 001, dosleden razporejevalnik 002 ne dodaja
nobene nove poti, po kateri bi izpad ostal neopažen.

## T126 — preverjanje po uporabniških zgodbah (quickstart.md §3) na živem sistemu

Domenska logika vseh 11 uporabniških zgodb je že izčrpno in deterministično preverjena s
236 avtomatiziranimi testi (`FakeClockPortal`, v-pomnilniška MongoDB — glej T119). Tu
preverjeno je namenoma **dopolnilno**: tisto, kar avtomatizirani testi NE morejo pokazati,
ker ne tečejo v resničnem Dockerju z resnično MongoDB, resničnim Puppeteerjem in resnično
Caddyjevo preusmeritvijo. `FakeClockPortal.setAvailableActions(...)` je programsko
vmesniško stanje enega procesa brez HTTP poti za nastavitev od zunaj, zato scenariji, ki
zahtevajo skriptirano stanje urice (npr. "klik uspe" iz §3.1/§3.2), niso bili ponovno
preizkušeni tu — ostajajo v celoti pokriti z avtomatiziranimi testi.

| Preverjeno na živem sistemu | Izid | Pokriva |
|---|---|---|
| Prijava, zamenjava gesla ob prvem zagonu, ponovna prijava | ✅ | FR-014 (skupno z 001) |
| Praznik 2026 avtomatsko izračunan ob prvem dostopu (velika noč 5. 4. → velikonočni ponedeljek 6. 4., novo leto 1.–2. 1., Prešernov dan 8. 2., ...) proti resnični MongoDB | ✅ | FR-011, SC-005 |
| `Idempotency-Key`: dva identična `POST /time-tracking/actions` proti živemu sistemu → identičen odgovor, `idempotencykeys` vsebuje natanko 1 zapis | ✅ | FR-082, SC-009 |
| `PUT /time-tracking/sessions/{id}` z novo vrednostjo piškotka → `cookieValueMasked` v odgovoru, polna vrednost se NE pojavi niti v odgovoru niti v dnevnikih API-ja | ✅ | FR-092 |
| Ustvarjanje API ključa (`state:read`, `action:write`, `history:read`) in njegova uporaba za `GET /state`, `GET /history` | ✅ | FR-081, FR-080 |
| API ključ brez `schedule:write` poskuša ustvariti profil | ✅ `403` | FR-081 (omejitev obsega) |
| Diagnostika resnične Puppeteer poti (glej T121) — `selector_not_found`, ne generična napaka | ✅ | FR-022, FR-035 |

**Izid: PREHOD** za vse preverjeno; preostalih 11 vrstic tabel iz quickstart.md §3, ki
zahtevajo skriptirano `FakeClockPortal` stanje, ostaja pokritih izključno z
avtomatiziranimi testi (glej seznam testnih datotek v T119 spodaj) — to je namerna in
zadostna delitev odgovornosti, ne vrzel.

## T119 (dopolnilno) — 15 enotskih testov iz quickstart.md §4

Vseh 15 zahtevanih scenarijev ima ustrezajoč `it(...)` v naboru (preverjeno z ročnim
pregledom, ne le štetjem datotek):

`scheduling.spec.ts` (1, 2, 8), `dst-display.spec.ts`, `holidays.spec.ts` (3, 6),
`calendar.spec.ts` (3, 4, 6), `schedule-builder.spec.ts` (7 — dodan manjkajoč regresijski
test za `docs/legacy-engine.md` §4.3, glej spodaj; 13), `action-executor.spec.ts` (5, 9),
`action-executor-retry.spec.ts` (5), `midnight-close.spec.ts` (12), `reminder-service.spec.ts`
(10), `catchup.spec.ts` (11), `diagnostics-reason.spec.ts` (14), `idempotency.spec.ts` (15).

Med pregledom je bila odkrita vrzel: obstoječi test je dokazoval idempotentnost DRUGEGA
klica za ISTI profil, ne pa tega, da DRUG profil ni preskočen zaradi prvega (dejanski hrošč
iz `docs/legacy-engine.md` §4.3 — globalno, ne profilno preverjanje podvajanja). Dodan je
bil nov test v `schedule-builder.spec.ts`, ki dva različna profila razporedi za isti dan in
potrdi, da oba dobita svoje `PlannedAction` zapise. Celoten paket po dodatku: **51 datotek,
236 testov, vsi uspešni** (`npx vitest run`, ~232 s).

## Čiščenje po testu

`docker compose down -v` (vsi vsebniki, volumni in omrežje odstranjeni), lokalni `.env`
izbrisan (nikoli ni bil sledena datoteka), lažni nadzorni strežnik in vse začasne datoteke
(žeton, testna seja, piškotki, izpisi) izbrisane. Delovna kopija repozitorija po testu ne
vsebuje nobenega testnega artefakta — samo popravkov v `infra/api.Dockerfile`,
`.env.example`, `docs/env-reference.md` (glej "Dve resnični napaki" zgoraj) in dodanega
regresijskega testa v `apps/api/tests/unit/schedule-builder.spec.ts`.
