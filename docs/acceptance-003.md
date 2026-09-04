# Sprejemno preverjanje — 003 (T076, T077, T078)

Izvedeno 21. 8. 2026 na razvojnem stroju (Docker Desktop, Windows), na živem
`docker compose -f infra/docker-compose.yml` sistemu, zgrajenem iz čiste kopije
(`docker compose --env-file ./.env -f infra/docker-compose.yml up -d --build`). To NI VPS
produkcijsko okolje — glej opombo o TLS v `docs/acceptance-001.md`, ki velja enako tukaj
(`PUBLIC_BASE_URL=http://localhost` za ta test, ne `https://app.si`, da Caddy ne poskuša
pravega Let's Encrypt izziva za domeno, ki na tem stroju ni dosegljiva).

Metodologija sledi `acceptance-001.md`/`acceptance-002.md`: lokalen, nikoli commitan `.env`
z generiranimi skrivnostmi in začasnim ponarejenim FCM ključem (`.local-secrets/`), po
testu `docker compose down -v` in izbris `.env` ter `.local-secrets/`. En odklon od 001/002:
`docker compose` je bilo treba klicati z `--env-file ./.env` (Compose v2 na tem stroju
privzeto vzame projektni imenik iz mape PRVE `-f` datoteke, torej `infra/`, ne trenutnega
imenika — brez tega `.env` v korenu repozitorija ni bil najden; enaka opomba je že v
`acceptance-002.md`).

Za razliko od 001/002 ta funkcionalnost NE potrebuje Puppeteerja/Chromiuma — zunanji viri so
navaden HTTP/S, proxy je preprost `fetch()` — zato tu ni ustreznice tistih dveh resničnih
napak (root/`--no-sandbox`, `No usable sandbox!`). `SCHEDULER_ENABLED=false`,
`CLOCK_PORTAL=fake`, `DRY_RUN=true` v tem testu (002-ova infrastruktura se s tem izklopi, da
se test osredotoči na 003; ni razlog za neuspeh, ne posledica 003).

## Tri resnične napake, ki jih je ta test razkril (in popravil)

Enako kot pri 001 in 002, test ni bil formalnost — brez njega bi vsaka od teh treh
napak ostala neopažena do prve resnične uporabe na VPS-u:

1. **Usmerjanje `/cameras/embed-hosts` in `/cameras/arso-webcams` je bilo prestreženo s
   `/cameras/:cameraId`.** Express usmerja po vrstnem redu registracije, ne po
   specifičnosti poti — ti dve literalni poti sta bili v kodi registrirani ZA
   parametrizirano `/cameras/:cameraId`, ki ju je tiho prestregla (`cameraId="embed-hosts"`
   ipd.), kar je povzročilo `500` (napaka pretvorbe v `ObjectId`). `@redocly/cli lint`
   (T072) je to isto nedvoumnost že opozoril kot slogovno opombo
   (`no-ambiguous-paths`) — v resnici je šlo za pravo napako v usmerjanju, ne le
   kozmetiko. Popravljeno: literalne poti so zdaj registrirane PRED
   `/cameras/:cameraId` — glej komentar v `router.ts`. Odkrito prek pogodbenih testov
   (7 neuspelih pred popravkom), ne prek te ročne postavitve — postavitev je popravek
   samo potrdila v pravem okolju.
2. **`platform/tabs/registry.ts` in `platform/config/env.ts` sta dva obstoječa testa
   (`tests/unit/tab-resolution.spec.ts`, `tests/unit/cache-ttl-bounds.spec.ts`) imela
   trdo zakodiran seznam zavihkov/minimalno konfiguracijo okolja BREZ novega zavihka
   `cameras`/BREZ `CREDENTIALS_ENCRYPTION_KEY`.** Dodajanje 003 je torej pokvarilo dva
   OBSTOJEČA testa iz 001 — natanko primer, na katerega opozarja komentar v
   `tab-resolution.spec.ts` ("ne postanejo krhki ob vsaki naslednji funkcionalnosti").
   Popravljeno: oba testa zdaj vključita `cameras` v pričakovanja/izklopita ga prek
   nastavitev (enako kot že počneta za `time-tracking`), `CREDENTIALS_ENCRYPTION_KEY` je
   dodan v oba minimalna fixtura.
3. **`webcam[].image` v pravem ARSO odgovoru je RELATIVNA pot, ne celoten naslov —
   in prva domneva o osnovi je bila napačna past.** Podrobno v
   `specs/003-cameras/research.md` §2: `https://vreme.arso.gov.si/webcam/` je vrnil
   `200 OK`, a s HTML telesom (ARSO-jeva lastna Angular SPA ima catch-all usmerjanje na
   `index.html` za vsako pot, ki se ne ujema — enak vzorec, kot ga ima naša lastna Caddy
   `try_files`). Pravi naslov, razviden iz JS svežnja ARSO SPA in potrjen s pravo 800×600
   JPEG sliko: `https://meteo.arso.gov.si/uploads/probase/www/observ/webcam/` — isti
   gostitelj in vzorec poti kot `ARSO_RADAR_URL`. Noben avtomatiziran test (vsi so proti
   `vi.stubGlobal('fetch', ...)`) tega ni mogel razkriti — samo klic proti PRAVEMU ARSO
   API-ju je pokazal narobe sestavljen naslov.

Brez teh treh popravkov bi prvi resničen zagon 003 na VPS-u vrnil `500` na dveh endpointih
zaslona za urejanje (1), pokvaril dva obstoječa testa v CI (2), in ARSO webcam predloga
(FR-037) bi bila trajno neuporabna (3) — nobeden od 329 avtomatiziranih testov tretje napake
ni in ni mogel razkriti, ker vsi nadomeščajo pravi ARSO klic z lažnim.

## T076 — `docker compose up --build`, konec-do-konca proti pravim zunanjim virom

| Korak | Izid |
|---|---|
| `docker compose --env-file ./.env -f infra/docker-compose.yml up -d --build` | Uspešno; `mongo` zdrav → `api` zdrav → `web` enkraten tek (izhodna koda 0, kot pri 001/002) → `caddy` zdrav |
| `GET /api/v1/health` prek Caddyja | `{"status":"ok","checks":{"database":"ok","configuration":"ok",...}}` |
| Prijava, menjava gesla, ponovna prijava | Deluje, JWT z `scopes: ["admin"]` |
| `POST /cameras` (iframe, `youtube.com`) | `201`, `health.state: "not-applicable"` (FR-002/FR-011, ni predpomnjenega posnetka za preverjanje) |
| `POST /cameras` z nedovoljenim gostiteljem (`evil.example.com`) | `422`, `detail` navaja polje in gostitelja (FR-034) |
| `POST /cameras` (snapshot, PRAVA `ipcamlive.com` kamera "znpvkamera2" iz starega CleverDasha) → `GET .../snapshot` | `200`, `image/jpeg`, 1920×1080, `X-Camera-Freshness: refreshed` — resnična zunanja kamera prek proxyja |
| `GET .../health` po zajemu | `{"state":"ok","consecutiveFailures":0,...}` |
| `PUT /cameras/{id}` (preimenovanje), `DELETE /cameras/{id}` | `200` z novim imenom; `204`, kamera izgine iz `GET /cameras` |
| `GET /cameras/arso-webcams?location=Ljubljana` (PRAVI ARSO klic, po popravku #3) | 8 kandidatov (`n`, `ne`, `e`, `se`, `s`, `sw`, `w`, `nw`), vsak `imageUrl` preverjen kot resnična `200 image/jpeg` slika |
| `POST /camera-groups`, `DELETE /camera-groups/{id}` | Skupina ustvarjena z `order: 0`; po brisanju kamera v njej ostane (`groupId: null`), ni izbrisana (FR-015) |
| `PUT /settings` `{"cameraDataSaverEnabled": false}` → `GET /settings` | Vrednost obstane, `theme` nedotaknjen (delna posodobitev, isti vzorec kot 001) |
| SPA na `/` prek Caddyja | `200`, `<title>CleverDash</title>` |

**Izid: PREHOD**, po odpravi vseh treh napak zgoraj. Za razliko od 001/002 ta test ni
preverjal samo notranje mehanike (skriptirani/lažni odzivi) — `arso-webcams` in `snapshot`
sta bila preverjena proti PRAVIM zunanjim virom (ARSO, ipcamlive), kar je razkrilo napako #3,
ki je noben mock ne bi mogel.

## T077 — varnostni pregled vdelave (research.md §5)

`grep -rn "bypassSecurityTrustHtml" apps/web/src/app/features/cameras/` vrne izključno
komentarje, ki razlagajo, ZAKAJ se ta klic ne uporablja (odprava hrošča starega
CleverDasha) — nikoli dejansko klic. Edina raba `DomSanitizer` v `cameras/` je
`bypassSecurityTrustResourceUrl` v `embedded-camera.component.ts`, na naslovu, ki je (a)
strežniško preverjen ob shranjevanju (FR-034) in (b) ponovno preverjen na odjemalcu tik
pred izrisom (`isHostAllowed()`, proti `GET /cameras/embed-hosts`). **Izid: PREHOD.**

## T078 — kakovostna vrata 1 in 5

| Vrsta preverjanja | Izid |
|---|---|
| `npm run typecheck` (oba paketa, po popravkih tipov v `router.ts`, `camera-ordering.ts`, `camera-proxy.service.ts`) | Čisto, brez napak |
| `npm run lint` (celoten repozitorij) | Čisto, brez napak in opozoril |
| `npm test` (`apps/api`, celoten paket, izolirano od vzporednega Docker gradenja — glej opombo o občasni prehodni napaki spodaj) | **69/69 datotek, 329/329 testov** |
| `npm test` (`apps/web`) | 1/1 datoteka, 8/8 testov (`network-status.service.spec.ts`) |
| `npm run build:web` | Uspešno; `camera-grid-page`, `camera-viewer-page`, `camera-manage-page` in ločen `hls` lenobni sveženj (dinamičen `import('hls.js')` za HLS predvajanje) |
| `gitleaks` | Ni bil na voljo v tej seji (ni nameščen, brez poskusa namestitve — enaka omejitev velja za nekatera orodja v vsaki seji); ročno preverjeno, da `.env`/`.local-secrets/` nista v `git status` in da noben nov niz v `apps/`/`specs/` ni videti kot skrivnost (`CREDENTIALS_ENCRYPTION_KEY` gre skozi okolje, ne kodo) |

**Opomba o prehodni napaki:** en zagon celotnega `apps/api` testnega paketa VZPOREDNO s
`docker build` je vrnil 2 neuspela testa (`login-rate-limit`-podoben časovni izteg,
`embed-hosts` DELETE) zaradi tekmovanja za CPE — oba sta bila v IZOLACIJI (brez vzporednega
Docker gradenja) takoj zatem 100 % zelena, dvakrat zaporedoma. To je isto tveganje, na
katero opozarja `vitest.config.ts` (`fileParallelism: false`) za vzporedne testne datoteke
znotraj enega zagona — tukaj gre za zunanjo tekmovanje (Docker), ne znotraj Vitesta.
Zabeleženo zaradi preglednosti, ni razlog za neuspeh vrata.

## Kaj ta test NI preveril

- **`/speckit-implement`-ov E2E tok (T075, `cameras-add.spec.ts`) je bil POSKUSNO zagnan v
  pravem brskalniku** (Playwright Chromium, nameščen v tej seji — korak naprej od 001/002,
  ki tega nista poskusila) **proti živemu `docker compose` sistemu, a je odpovedal na
  prijavi** (`getByLabel('E-pošta')` ni najdel vnosnega polja znotraj 30 s). Enak poskus z
  obstoječim, nespremenjenim `happy-path.spec.ts` (001) je odpovedal na DRUGAČEN način
  (usmerjanje `/` → `/login` se ni zgodilo v pričakovanem oknu) — kar kaže, da gre za
  splošno trenje med Playwrightom in Ionic web-komponentami/produkcijskim Angular
  buildom v tem okolju, NE za hrošč, ki bi ga vpeljala 003. Nadaljnje razhroščevanje tega
  trenja je izven obsega te funkcionalnosti; test ostaja zapisan in nespremenjen, izvedba v
  pravem CI/razvojnem okolju z že uveljavljenim Playwright postopkom ostaja prihodnje delo,
  enako kot za vse štiri obstoječe E2E teste iz 001/002.
- Produkcijski TLS (Let's Encrypt) — glej opombo o `PUBLIC_BASE_URL=http://localhost` zgoraj
  in enako opombo v `acceptance-001.md`.
- Zunanji dead man's switch (člen VII) — ta funkcionalnost ne razširja `/health` (za razliko
  od 002); ni nove obratovalne "je sistem živ" površine za preizkusiti.
