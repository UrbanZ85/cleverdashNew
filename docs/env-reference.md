# Okoljske spremenljivke — kaj se prenese, kaj se preseli, kaj je novo

Izhodišče: `belezenje-casa-BE/.env`, `docker-compose.yml`, `docker-compose.dev.yml` in
`belezenje-casa/src/environments/environment.ts`.

Nič od tega ni izgubljeno. Del pa se **preseli iz okolja v bazo**, ker se med delovanjem
spreminja in ponovni zagon aplikacije ni sprejemljiva cena za zamenjavo piškotka.

---

## 1. Kar se preseli iz okolja v bazo

To je najpomembnejša sprememba glede na stari sistem.

| Stara spremenljivka | Kam gre | Zakaj |
|---|---|---|
| `eracuni_url` | `trackingLocations.url` | več lokacij ima lahko različne naslove; naslov je podatek profila, ne okolja |
| `cookie_property_name` | `remoteSessions.cookieName` | |
| `cookie_property_value` | `remoteSessions.cookieValue` | **glavni razlog za preselitev.** Seja poteče vsakih nekaj mesecev. V okolju bi zamenjava pomenila urejanje datoteke in ponovni zagon na VPS-u; v bazi je vnos v aplikaciji. |
| `cookie_property_domain` | `remoteSessions.cookieDomain` | |
| `cookie_property_expires` | `remoteSessions.expiresAt` | poleg tega se zdaj dejansko preverja in opozarja pred potekom |
| `latitudeAgendaLJ`, `longitudeAgendaLJ` | `trackingLocations.coordinateTemplate` (lokacija "Agenda LJ") | lokacij bo lahko več; v UI jih je mogoče izbrati na zemljevidu |
| `latitudeDoma`, `longitudeDoma` | `trackingLocations.coordinateTemplate` (lokacija "Doma") | |
| `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD` | odpravljeno (004) | prijava z e-pošto/geslom je nadomeščena s Keycloakom (specs/004-keycloak-sso-multiuser); administratorja določa Keycloakova vloga (`KEYCLOAK_ADMIN_ROLE`), ne več vrednost v `.env` |

Kje v aplikaciji se vsaka od teh vrednosti vpiše (od 26. 8. 2026 vse iz Nastavitev, brez
posega v bazo):

| Stara spremenljivka | Nastavitve → Moduli → Beleženje časa |
|---|---|
| `cookie_property_name` | Sejni piškotek → *Ime piškotka* |
| `cookie_property_value` | … → *Vrednost piškotka* (shranjena nikoli ni prikazana v celoti, FR-092) |
| `cookie_property_domain` | … → *Domena* |
| `cookie_property_expires` | … → *Velja do* (sprejet je tudi unix zapis iz starega `.env`) |
| `eracuni_url` | Lokacije → *Naslov strani* |
| `latitude*`, `longitude*` | Lokacije → *Zemljepisna širina/dolžina*, en par NA LOKACIJO; pošiljanje je mogoče izklopiti s stikalom *Pošlji lokacijo strani* (FR-094) |
| `schedulers.isWorkingFromHome` (stara baza, ne `.env`) | Lokacije → *Gumb za začetek dela* — `Delo od doma` na domači lokaciji (FR-090) |

Stari sistem je imel natanko dva para koordinat (`*AgendaLJ`, `*Doma`), ker sta bila
spremenljivki okolja. Lokacij je zdaj poljubno mnogo — služba, doma, terén — vsaka s svojim
parom. Te koordinate se uporabljajo **samo** pri beleženju časa; lokacija za vreme
(`Nastavitve → Viri podatkov`) je ločena nastavitev in se z njimi ne deli.

Stolpca "Size" iz brskalnikovega razhroščevalnika ni med nastavitvami, ker ga piškotek ne
nosi kot lastnost — je bajtna dolžina imena in vrednosti. Prikazan je kot izpeljan podatek
(`cookieSize`), da je vidno, ali je bila vrednost prilepljena cela.

Vrednosti, ki jih je treba prenesti (oblika s `_` je namerna — glej
`docs/legacy-engine.md` §3):

```
Agenda LJ:  latitude 46.0629_6   longitude 14.5602_9
Doma:       latitude 45.9611_0   longitude 14.2978_7
cookieName  ItcClientID
cookieDomain e-racuni.com
url         https://e-racuni.com/S6a/Clockin-<žeton>
```

> Vrednosti piškotka **ne prenašaj**. Tista v `.env` je potekla 24. 1. 2025 in je razkrita.
> Glej `docs/SECURITY-FIRST.md`.

> Naslova sta v starih datotekah dva različna: `Clockin-0BD5119EC3F00D00AFEED55901C42A1D`
> (`.env` in `docker-compose.yml`) in `Clockin-5CDC57BC6ACA0D008A4D4EC5051A2B32`
> (`docker-compose.dev.yml` in frontend). Pravega preveri v produkcijski bazi.

## 2. Kar ostane v okolju

### Osnovno

| Spremenljivka | Privzeto | Opomba |
|---|---|---|
| `NODE_ENV` | `production` | nadomešča `DEVELOPMENT`, ki je bil niz `"true"` / `"false"` in se je primerjal kot `process.env.DEVELOPMENT == "true"` |
| `PORT` | `3000` | staro: `3002`, s preslikavo `5000:3002` v composeu. V produkciji vrednost pripne `infra/docker-compose.yml` (`PORT: "3010"`, ker sta 3000 in 3002 na VPS-u zasedena) — vrednost iz datoteke z okoljem je tam brez učinka |
| `TZ` | `Europe/Ljubljana` | **novo in obvezno**; brez tega je vsebnik v UTC |
| `PUBLIC_BASE_URL` | `https://app.si` | za povezave v obvestilih in webhookih |
| `LOG_LEVEL` | `info` | |

### Baza

| Spremenljivka | Opomba |
|---|---|
| `MONGO_URI` | staro ime `DB_CONNECTION`; primer `mongodb://admin:pass@mongo:27017/cleverdash?authSource=admin` |
| `PLANEGO_NETWORK` | ime Dockerjevega omrežja, na katerem teče obstoječi Mongo; privzeto `planego-network` |

Stari sistem je tekel brez avtentikacije na Mongu (`mongodb://mongo_db:27017/belezenjeCasa`).
Nov naj ima uporabnika in geslo, tudi če je baza samo na internem omrežju Dockerja.

Produkcijski sklad **svojega Monga nima** — uporablja tistega, ki na VPS-u že teče (vsebnik
`mongo` iz sklada planego). Zato je api v `infra/docker-compose.yml` priključen na zunanje
omrežje `planego-network` (ime po potrebi povozi `PLANEGO_NETWORK`); brez tega se gostitelj
`mongo` iz `MONGO_URI` ne razreši. Baza je kljub skupnemu strežniku svoja (`/cleverdash`):
zbirke `users`, `settings`, `notes` ... se imensko prekrivajo s planegovimi in bi se v isti
bazi podatki obeh aplikacij pomešali. `MONGO_ROOT_USER`/`MONGO_ROOT_PASSWORD` s tem
odpadeta — uporabnika v bazi ne ustvarjamo več, `admin` z `authSource=admin` zadošča.

### Avtentikacija

004 (specs/004-keycloak-sso-multiuser) je prijavo z e-pošto/geslom v celoti nadomestila s
prijavo prek Keycloaka (backend-for-frontend, glej research.md §1–§2). `PASSWORD_HASH_ALGO`,
`SALT_ROUNDS`, `JWT_ACCESS_SECRET`, `ACCESS_TOKEN_TTL`, `JWT_REFRESH_SECRET`, `ADMIN_EMAIL`,
`ADMIN_INITIAL_PASSWORD` odpadejo v celoti — dostopni žeton, ki ga CleverDash vrne SPA, je
Keycloakov lasten (relay), ne lokalno podpisan. Spodnja tabela je trenutno veljavna.

| Spremenljivka | Privzeto | Opomba |
|---|---|---|
| `SESSION_COOKIE_SECRET` | — | podpiše sejni piškotek, ki referencira `KeycloakSession` — nadomešča prejšnji `JWT_REFRESH_SECRET` |
| `KEYCLOAK_ISSUER_URL` | — | npr. `https://sso.example.com/realms/cleverdash`; organizacijski Keycloak, ne del tega repozitorija |
| `KEYCLOAK_CLIENT_ID` | — | zaupanja vreden (confidential) klient, ne javni |
| `KEYCLOAK_CLIENT_SECRET` | — | |
| `KEYCLOAK_ADMIN_ROLE` | `cleverdash-admin` | Keycloak realm vloga/skupina, preslikana v `admin` scope (research.md §6) |
| `KEYCLOAK_USER_ROLE` | `cleverdash-user` | brez te ALI admin vloge/skupine je oseba zavrnjena — sam Keycloak račun ne zadošča (FR-007/FR-008) |
| `KEYCLOAK_INTROSPECTION_CACHE_SECONDS` | `5` | kratek TTL za živo preverjanje seje (FR-006/FR-007) — razrešitev napetosti s členom VIII, glej specs/004-keycloak-sso-multiuser/research.md §4 |

Prve štiri vrednosti za produkcijo ne izpolnjuj na roko: realm, odjemalca in vlogi na
Keycloaku za `kc.planego.eu` postavi `scripts/keycloak-prod-setup.sh` in jih na koncu izpiše
(skripta je idempotentna, ponovni zagon popravi odmik). Utemeljitev vsake nastavitve
odjemalca je v komentarjih te skripte, povzetek pa v README → »Keycloak na produkcijskem
VPS-u«. `PUBLIC_BASE_URL` mora biti pri tem **dobesedno** enak tistemu, s katerim je bil
odjemalec ustvarjen — iz njega api sestavi `redirect_uri`, ki ga Keycloak primerja brez
strpnosti (šteje tudi poševnica na koncu).

### Brskalnik

Vse novo. Stari sistem je te vrednosti imel trdo zapisane v `working-hours.ts`.

| Spremenljivka | Privzeto | Opomba |
|---|---|---|
| `PUPPETEER_SKIP_DOWNLOAD` | `true` | uporablja se sistemski Chromium |
| `PUPPETEER_EXECUTABLE_PATH` | `/usr/bin/chromium` | |
| `BROWSER_HEADLESS` | `true` | |
| `BROWSER_TIMEOUT_MS` | `30000` | staro: `timeout: 0`, torej brez omejitve — obešen klic je ostal obešen |
| `BROWSER_PROTOCOL_TIMEOUT_MS` | `60000` | |
| `BROWSER_NO_SANDBOX` | `true` | Chromiumov lastni peskovnik potrebuje uporabniške imenske prostore, ki jih privzeti profil seccomp/AppArmor v vsebniku blokira ("No usable sandbox!", preverjeno T121/`docs/acceptance-002.md`) — Dockerjeva izolacija + neprivilegiran uporabnik (`api.Dockerfile`) je dejanska varnostna meja, ne ta drugi peskovnik |
| `BROWSER_USER_AGENT` | mobilni Android niz | brez mobilnega UA stran ne pokaže gumbov |

### Scheduler

| Spremenljivka | Privzeto | Opomba |
|---|---|---|
| `SCHEDULER_ENABLED` | `true` | |
| `SCHEDULER_TICK_SECONDS` | `30` | staro: cron `*/60 * * * * *` |
| `DRY_RUN` | `false` v produkciji, `true` drugod | vse izračuna in zabeleži, a ne klikne |
| `CLOCK_PORTAL` | `puppeteer` | `fake` za teste |
| `SCHEDULE_TIMEZONE` | `Europe/Ljubljana` | ločeno od `TZ`, da je domenska odločitev eksplicitna |

### Obvestila

| Spremenljivka | Opomba |
|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | pot do montirane datoteke, npr. `/run/secrets/fcm_key`. **Nadomešča privatni ključ, ki je bil zapisan v `messaging-service.ts`** |
| `FCM_PROJECT_ID` | neobvezno, če je v datoteki |
| `NOTIFY_ON_SUCCESS` | ali naj pride obvestilo tudi ob uspešni akciji |

### Zdravje

| Spremenljivka | Opomba |
|---|---|
| `HEALTHCHECK_PING_URL` | **novo in pomembno.** Zunanji dead man's switch. Brez tega popolna odpoved sistema ostane neopažena — glej `research.md` §8 |
| `HEALTHCHECK_PING_TIMEOUT_MS` | privzeto `5000` |

### Datoteke

| Spremenljivka | Privzeto | Opomba |
|---|---|---|
| `SCREENSHOT_DIR` | `/app/data/screenshots` | novo |
| `SCREENSHOT_RETENTION_DAYS` | `30` | ⚠️ **razglašena, a je nihče ne bere** — glej opozorilo pod tabelo |
| `LOG_FILE_PATH` | — | v starem sistemu ga je `logging-service.ts` uporabljal, a ni bil nikjer definiran. Nov sistem privzeto piše JSON v stdout in te spremenljivke ne potrebuje |

> **⚠️ `SCREENSHOT_RETENTION_DAYS` ne dela ničesar.** Spremenljivka je v Zod shemi
> (`platform/config/env.ts`) in v tem dokumentu, čiščenja posnetkov zaslona pa ni nikjer —
> `grep` po `apps/api/src` najde samo njeno deklaracijo. Posnetki se torej kopičijo, dokler jih
> kdo ročno ne pobriše. To je odprt hrošč in ne opomba za pozneje.
>
> Zapisan je tu, ker je 009 (deljenje datotek) prav ta vzorec namenoma ponovil na pravi način:
> `FILE_SHARE_RETENTION_DAYS` **bere** `modules/file-sharing/services/cleanup.service.ts` in
> ima pod sabo teste (`tests/integration/file-share-cleanup.spec.ts`). Nastavitev brez kode, ki
> jo prebere, je obljuba, ki je nihče ne drži.

### Deljenje datotek (009)

Vsebina deljenih datotek **ni v bazi**, ampak na trajnem nosilcu `shared-files`
(`infra/docker-compose.yml`). Brez montiranega nosilca naložene datoteke izginejo ob prvi
posodobitvi slike. Vse spodnje spremenljivke so **neobvezne** — privzetki so v kodi.

| Spremenljivka | Privzeto | Opomba |
|---|---|---|
| `FILE_SHARE_DIR` | `/app/data/files` | koren hrambe; ujemati se mora z nosilcem iz `docker-compose.yml`. Pod njim nastaneta `tmp/` in `blobs/`, ki MORATA biti na istem nosilcu (objava datoteke je atomarno preimenovanje) |
| `FILE_SHARE_MAX_MB` | `500` | največja ena datoteka |
| `FILE_SHARE_QUOTA_MB` | `5000` | skupna kvota na uporabnika |
| `FILE_SHARE_DEFAULT_EXPIRY_DAYS` | `7` | privzeti rok povezave, kadar uporabnik ne izbere |
| `FILE_SHARE_RETENTION_DAYS` | `7` | koliko časa po POTEKU vsebina še obstaja, preden jo pometač odstrani |
| `FILE_SHARE_GRANT_MINUTES` | `10` | veljavnost odklenitve z geslom |
| `FILE_SHARE_ATTEMPT_LIMIT` | `10` | zgrešeni poskusi gesla do zaklepa (na povezavo IN na izvorni naslov) |
| `FILE_SHARE_ATTEMPT_WINDOW_MINUTES` | `15` | okno, v katerem se poskusi štejejo |
| `FILE_SHARE_LOCK_MINUTES` | `60` | trajanje zaklepa; med njim je zavrnjeno tudi pravilno geslo |
| `FILE_SHARE_CLEANUP_INTERVAL_MINUTES` | `60` | perioda pometača (teče tudi takoj ob zagonu) |
| `FILE_SHARE_UPLOAD_TIMEOUT_MINUTES` | `360` | kdaj velja nedokončano nalaganje za obtičalo |

### Zunanji viri (001, dopolnjeno v 005)

**Od 005 so ti naslovi PRIVZETKI, ne edina konfiguracija.** Vsak uporabnik jih lahko prepiše
v svojem profilu (Nastavitve → Viri podatkov); strežnik razreši `Settings.sources.* ?? env.*`
(glej `apps/api/src/platform/sources/resolution.service.ts`). Vrednost v `.env` skrbi za to,
da namestitev deluje takoj po `docker compose up`, brez vsakega klika po prvi prijavi.

`ARSO_DEFAULT_LOCATION` je enako privzetek: če ima uporabnik nastavljeno svojo lokacijo
(`Settings.weather.locationName`), velja ta. Do 005 je bila osebna nastavitev shranjena, a
je ni bral nihče.

| Spremenljivka | Privzeto |
|---|---|
| `ARSO_RADAR_URL` | `https://meteo.arso.gov.si/uploads/probase/www/observ/radar/si0-rm-anim.gif` |
| `ARSO_WEATHER_URL` | `https://vreme.arso.gov.si/api/1.0/location/` |
| `ARSO_WEBCAM_BASE_URL` | `https://meteo.arso.gov.si/uploads/probase/www/observ/webcam/` |
| `ARSO_DEFAULT_LOCATION` | `Ljubljana` |
| `RADAR_CACHE_SECONDS` | `300` |
| `WEATHER_CACHE_SECONDS` | `600` |

Osebni prepis naslova mora prestati isto preverjanje kot naslov vtičnika
(`apps/api/src/domain/outbound-url.ts`): samo `https`, brez poverilnic v naslovu, brez
zasebnih ali lokalnih naslovov — strežnik te naslove obišče sam.

### Pot v službo in domov (ploščica „Pot“)

Neobvezno. Brez ključa ploščica deluje naprej — pokaže zemljevida in pove, da časa poti ni
(člen VII: nikoli tiho prazno polje). **Kraja (doma, služba) v okolju NISO**: sta osebna
nastavitev v profilu (Nastavitve → Nadzorna plošča → Pot v službo in domov), ker naslov doma
ni konfiguracija namestitve.

| Spremenljivka | Privzeto | Vloga |
|---|---|---|
| `GOOGLE_MAPS_SERVER_KEY` | prazno | Routes API (čas poti, promet). **Ostane na strežniku.** |
| `GOOGLE_MAPS_EMBED_KEY` | prazno | Maps Embed API za `<iframe>`. **Vidi ga vsak obiskovalec.** |
| `GOOGLE_ROUTES_URL` | `https://routes.googleapis.com/directions/v2:computeRoutes` | Naslov vira |
| `COMMUTE_CACHE_SECONDS` | `300` | TTL predpomnilnika; ena plačljiva zahteva na smer na osvežitev |
| `COMMUTE_ROUTES_TIMEOUT_MS` | `8000` | Zgornja meja trajanja klica (člen VIII) |

**Zakaj dva ključa.** Strežniški ključ nikoli ne sme priti v brskalnik (člen IV), naslov
vdelanega zemljevida pa ključ nujno nosi v sebi — to je oblika, ki jo zahteva Maps Embed API.
Zato sta ločena in različno omejena:

- `GOOGLE_MAPS_SERVER_KEY` → omejitev po naslovu IP strežnika, dovoljen samo **Routes API**;
- `GOOGLE_MAPS_EMBED_KEY` → omejitev po napotitelju (HTTP referrer) na `PUBLIC_BASE_URL`,
  dovoljen samo **Maps Embed API**.

Če `GOOGLE_MAPS_EMBED_KEY` ni nastavljen, strežnik sestavi zemljevid v klasični obliki
(`maps.google.com/maps?...&output=embed`), ki ključa ne potrebuje. Ta oblika ni dokumentirana
in je zato privzetek iz nuje, ne izbira: kadar je ključ za vdelavo na voljo, se uporabi
uradna pot `/maps/embed/v1/directions` (glej `apps/api/src/domain/map-embed.ts`).

**Strošek.** Vsaka osvežitev je ena zahteva na smer, torej dve na osvežitev ploščice. Pri
`COMMUTE_CACHE_SECONDS=300` in nadzorni plošči, odprti ves delovni dan, je to okoli 200
zahtev na dan; osveževanje teče samo, dokler je zaslon v ospredju (FR-022). Višja vrednost
pomeni manj stroškov in manj sveže podatke o prometu.

## 3. E-pošta — ali je še potrebna

Stari sistem pošilja e-pošto ob ustvarjanju urnika in ob napakah, poleg potisnih obvestil.

| Spremenljivka | Stara vrednost | Usoda |
|---|---|---|
| `EMAIL_SERVER_HOST` | `cwp01.dc01.reavisys.si` | → `SMTP_HOST` |
| `EMAIL_USERNAME` | `info@zuusi.com` | → `SMTP_USER` |
| `EMAIL_PASSWORD` | razkrito | → `SMTP_PASSWORD`, **zamenjaj geslo** |
| `EMAIL_SENDER` | `info@zuusi.com` | → `SMTP_FROM` |
| `EMAIL_INFO` | `belezenje_casa@zuusi.com` | → `NOTIFY_EMAIL_TO` |
| `EMAIL_TEMPLATES_PATH` | absolutna pot v `D:\…` in `/usr/src/app/src/` | odpade; predloge so del builda |
| `COMPANY_NAME` | `Zuusi technology - beleženj časa` | → `APP_NAME`, privzeto `CleverDash` |

Celoten sklop je **neobvezen**. Če `SMTP_HOST` ni nastavljen, pošiljanje e-pošte se
preskoči brez napake.

[NEEDS CLARIFICATION: ali e-pošta še ostane, ali potisna obvestila zadostujejo? Potisna so
hitrejša in bolj zanesljiva; e-pošta je uporabna kot rezerva, kadar telefon nima omrežja.
Predlog: obdrži samo za napake in opozorila o poteku seje, ne za vsakodnevne potrditve.]

## 4. Frontend

| Staro | Novo |
|---|---|
| `apiUrl: 'http://localhost:3003'` oz. `'https://bcapi.zuusi.com'` | **odpade.** Frontend uporablja relativno `/api/v1`. V razvoju to uredi dev-server proxy |
| `googleMapsAPIKey` | ostane, a **omejen na domeno** v Cloud Console. Ključi v frontend buildu so vedno javni |
| Firebase web config in VAPID ključ | ostane; web config je po zasnovi javen |

Edina izjema pri relativnih poteh je nativni Android build, ki ima nastavljiv
`apiBase` (privzeto `https://app.si`) — glej `nacrt/002-time-tracking/quickstart.md` §2.

## 5. `.env.example`

V gitu je samo ta datoteka, s praznimi vrednostmi:

```env
# ─── Osnovno ───
NODE_ENV=production
PORT=3000
TZ=Europe/Ljubljana
PUBLIC_BASE_URL=https://app.si
APP_NAME=CleverDash
LOG_LEVEL=info

# ─── Baza ───
MONGO_URI=mongodb://admin:CHANGEME@mongo:27017/cleverdash?authSource=admin
PLANEGO_NETWORK=planego-network

# ─── Avtentikacija (004: Keycloak) ───
SESSION_COOKIE_SECRET=
KEYCLOAK_ISSUER_URL=
KEYCLOAK_CLIENT_ID=
KEYCLOAK_CLIENT_SECRET=
KEYCLOAK_ADMIN_ROLE=cleverdash-admin
KEYCLOAK_USER_ROLE=cleverdash-user
KEYCLOAK_INTROSPECTION_CACHE_SECONDS=5

# ─── Brskalnik ───
PUPPETEER_SKIP_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
BROWSER_HEADLESS=true
BROWSER_TIMEOUT_MS=30000
BROWSER_PROTOCOL_TIMEOUT_MS=60000
BROWSER_NO_SANDBOX=true

# ─── Scheduler ───
SCHEDULER_ENABLED=true
SCHEDULER_TICK_SECONDS=30
SCHEDULE_TIMEZONE=Europe/Ljubljana
DRY_RUN=false
CLOCK_PORTAL=puppeteer

# ─── Obvestila ───
GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/fcm_key
NOTIFY_ON_SUCCESS=false

# ─── Zdravje ───
HEALTHCHECK_PING_URL=
HEALTHCHECK_PING_TIMEOUT_MS=5000

# ─── Datoteke ───
SCREENSHOT_DIR=/app/data/screenshots
SCREENSHOT_RETENTION_DAYS=30

# ─── ARSO ───
ARSO_RADAR_URL=https://meteo.arso.gov.si/uploads/probase/www/observ/radar/si0-rm-anim.gif
ARSO_WEATHER_URL=https://vreme.arso.gov.si/api/1.0/location/
ARSO_DEFAULT_LOCATION=Ljubljana
RADAR_CACHE_SECONDS=300
WEATHER_CACHE_SECONDS=600

# ─── Pot v službo in domov (neobvezno; dva LOČENA ključa, glej §2) ───
GOOGLE_MAPS_SERVER_KEY=
GOOGLE_MAPS_EMBED_KEY=
COMMUTE_CACHE_SECONDS=300

# ─── E-pošta (neobvezno) ───
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
NOTIFY_EMAIL_TO=

# ─── Deljenje datotek (009; vse neobvezno, privzetki so v kodi) ───
FILE_SHARE_DIR=/app/data/files
FILE_SHARE_MAX_MB=500
FILE_SHARE_QUOTA_MB=5000
FILE_SHARE_DEFAULT_EXPIRY_DAYS=7
FILE_SHARE_RETENTION_DAYS=7
FILE_SHARE_GRANT_MINUTES=10
FILE_SHARE_ATTEMPT_LIMIT=10
FILE_SHARE_ATTEMPT_WINDOW_MINUTES=15
FILE_SHARE_LOCK_MINUTES=60
FILE_SHARE_CLEANUP_INTERVAL_MINUTES=60
FILE_SHARE_UPLOAD_TIMEOUT_MINUTES=360
```

## 6. Sintaksa — past iz starega `.env`

Stara datoteka meša dve obliki:

```env
JWT_SECRET = sdfFDfdghg780!!...        # deluje
EMAIL_INFO: belezenje_casa@zuusi.com   # NE deluje — dotenv tega ne prebere
```

Vrstice z dvopičjem so bile v razvoju `undefined`, delovale pa so v Dockerju, ker je
`docker-compose.yml` iste vrednosti podal v YAML obliki `KLJUC: vrednost`. To je pojasnilo
za nekatere razlike med razvojem in produkcijo v starem sistemu.

`.env` uporablja **izključno** `KLJUC=vrednost`, brez presledkov okoli enačaja.
Validacija naj bo z Zod shemo ob zagonu: manjkajoča obvezna spremenljivka mora zaustaviti
zagon z jasnim sporočilom, ne pa pripeljati do `undefined` globoko v izvajanju.
