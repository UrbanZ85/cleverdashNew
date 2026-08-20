# Sprejemno preverjanje — 001 (T129, T130, T132)

Izvedeno 20. 8. 2026 na razvojnem stroju (Docker Desktop, Windows), po
`quickstart.md` §2 in §4. To NI VPS produkcijsko okolje — glej opombo o TLS spodaj.

## T130 — čas od svežega checkouta do delujočega sistema (SC-007, vrata 4)

Zahteva: pod 15 minut, brez ročnih korakov razen izpolnjenega `.env`.

| Korak | Izmerjen čas |
|---|---|
| `docker compose build --no-cache` (api + web, brez predpomnilnika — realna simulacija prvega builda) | 113 s |
| `docker compose up -d` (mongo zdrav → api zdrav → web enkraten tek → caddy) | 13 s |
| **Skupaj** | **~2 min 6 s** |

**Izid: PREHOD**, z veliko rezervo do 15-minutne meje. Edini ročni korak je bil izpolnitev
`.env` (generirani JWT skrivnosti, geslo Monga, testna vrednost `HEALTHCHECK_PING_URL`) —
`docker compose` je naredil vse ostalo sam, vključno z `npm ci` in gradnjo znotraj
vsebnikov (host ni potreboval nameščenega Node.js ali `node_modules`).

## Dve resnični napaki, ki jih je ta test razkril (in popravil)

Test ni bil formalnost — ujel je dva prava hrošča, ki ju noben prejšnji `npm run build`
na golem stroju ni mogel pokazati:

1. **`api.Dockerfile` je kopiral `specs/`, ki ga `.dockerignore` izključuje iz gradbenega
   konteksta.** Gradnja `api` slike je odpovedala takoj na prvem poskusu. Vrstica je bila
   odvečna — `apps/api` ne uvaža ničesar iz `specs/`, generirani `packages/contracts` je že
   commitan. Odstranjena.
2. **Angular 20-ov builder (`@angular/build:application`) postavi statične datoteke v
   podmapo `www/browser/`, ne neposredno v `www/`.** `web.Dockerfile` je kopiral napačno
   raven, zato je Caddy iskal `index.html`, ki ga na pričakovanem mestu ni bilo — `/` je bil
   prazen, vsaka druga pot 404. Noben dosedanji `npm run build` tega ni pokazal, ker sem
   preverjal samo "gradnja je uspela", ne dejanske postrežbe datotek prek statičnega
   strežnika. Popravljeno: `web.Dockerfile` zdaj kopira `www/browser`, ne `www`.

Po obeh popravkih: `GET /` → 200 s pravim HTML (`<title>CleverDash</title>`), `GET
/dashboard` → 200 prek SPA fallbacka (`try_files … /index.html`).

## T129 — preverjanje po quickstart.md §2 in §4

| Preverjanje | Izid | Opomba |
|---|---|---|
| `docker compose ps` — vsi vsebniki `healthy` | ✅ | `web` je enkraten tek (`restart: "no"`), izhodna koda 0 — pravilno |
| `GET /api/v1/health` prek Caddy | ✅ | `{"status":"ok","timeZone":"Europe/Ljubljana",...}` |
| `TZ` v vsebniku | ✅ | `date` v `api` vsebniku vrne `CEST` (Europe/Ljubljana, poletni čas) |
| SPA na korenu | ✅ | Po popravku `web.Dockerfile` — glej zgoraj |
| SPA fallback (`/dashboard`) | ✅ | 200, ne 404 |
| Ločena poddomena za API | ✅ (odsotna) | `/api/*` in SPA na istem izvoru, kot zahteva člen II |
| CORS glave | ✅ (odsotne) | `curl` z `Origin: http://evil.example.com` ne vrne `Access-Control-*` glav |
| Absolutni naslovi v zgrajenem JS | ✅, z eno namerno izjemo | Edini zadetek za `app.si` je `DEFAULT_ANDROID_API_BASE` v minificiranem `api-base.ts` — dokumentirana izjema za nativni Android (FR-001), neuporabljena na webu. Ničesar iz `bcapi.zuusi` (stari nevarni vzorec). |
| `OPTIONS` na API poti | ✅ | `200 OK`, `Allow: GET, HEAD` — privzeto Express obnašanje, ne CORS predhodna zahteva |

**Ni preverjeno v tem okolju — TLS (FR-041).** Samodejna pridobitev potrdila zahteva
javno razrešljivo domeno, ki kaže na ta stroj; razvojni stroj nima take domene.
`PUBLIC_BASE_URL` je bil za ta test začasno `http://localhost`, `CADDY_HTTP_PORT=8080`
(vrata 80 na gostitelju so že zasedena z drugim procesom) — oboje samo v lokalnem `.env`,
nikoli v repozitoriju. Pravo preverjanje TLS zahteva postavitev na VPS z resnično domeno
`app.si`, kar je zunaj dosega tega razvojnega okolja.

## T132 — člen VII: alarm mora priti od zunaj

Postavljen je bil pravi (majhen) HTTP strežnik na gostitelju kot namestek za
Healthchecks.io, dosegljiv iz vsebnika prek `host.docker.internal:9999`.

1. Po zagonu je `api` vsebnik dejansko poslal srčni utrip — zabeleženih 6 zadetkov v
   približno 60-sekundnih presledkih (`SCHEDULER`... pravzaprav `heartbeat.ts` interval,
   60000 ms), kar se ujema s kodo.
2. `docker stop infra-api-1` — vsebnik ustavljen.
3. `GET /api/v1/health` prek Caddy takoj vrne `502 Bad Gateway` — Caddy sam ostane pokonci
   in odgovarja, kar dokazuje točno to, kar člen VII pravi: sistem, ki je delno pokvarjen,
   lahko še vedno "nekaj" odgovori navzven, notranji `/health` pa je nedosegljiv in ne more
   sam sporočiti nikomur, da je pokvarjen.
4. Počakano je bilo 75+ sekund (več kot en pričakovan interval) — **noben nov zadetek ni
   prispel** na zunanji nadzorni strežnik.

**Izid: PREHOD.** Zunanji dead man's switch bi v tem trenutku pravilno sprožil alarm zaradi
odsotnosti pinga — natanko mehanizem, ki ga člen VII zahteva, in natanko razlog, zakaj
notranji `/api/v1/health` sam po sebi ne zadošča.

## Čiščenje po testu

`docker compose down -v` (vsi vsebniki, volumni in omrežje odstranjeni), lokalni `.env`
izbrisan (nikoli ni bil sledena datoteka), lažni nadzorni strežnik ustavljen. Delovna
kopija repozitorija po testu ne vsebuje nobenega testnega artefakta — samo popravka v
`infra/api.Dockerfile`, `infra/web.Dockerfile` in `infra/docker-compose.yml`
(`CADDY_HTTP_PORT`/`CADDY_HTTPS_PORT` za lokalno testiranje, privzetka 80/443 nedotaknjena).
