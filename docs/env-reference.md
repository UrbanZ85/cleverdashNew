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
| `ADMIN_EMAIL` | `users.email` po prvem zagonu | v okolju ostane samo za začetno ustvarjanje |

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
| `PORT` | `3000` | staro: `3002`, s preslikavo `5000:3002` v composeu |
| `TZ` | `Europe/Ljubljana` | **novo in obvezno**; brez tega je vsebnik v UTC |
| `PUBLIC_BASE_URL` | `https://app.si` | za povezave v obvestilih in webhookih |
| `LOG_LEVEL` | `info` | |

### Baza

| Spremenljivka | Opomba |
|---|---|
| `MONGO_URI` | staro ime `DB_CONNECTION`; primer `mongodb://user:pass@mongo:27017/cleverdash?authSource=admin` |

Stari sistem je tekel brez avtentikacije na Mongu (`mongodb://mongo_db:27017/belezenjeCasa`).
Nov naj ima uporabnika in geslo, tudi če je baza samo na internem omrežju Dockerja.

### Avtentikacija

| Spremenljivka | Privzeto | Opomba |
|---|---|---|
| `JWT_ACCESS_SECRET` | — | **zamenjaj**; staro `JWT_SECRET` je razkrito |
| `JWT_REFRESH_SECRET` | — | ločena skrivnost od dostopne |
| `ACCESS_TOKEN_TTL` | `15m` | |
| `REFRESH_TOKEN_TTL` | `30d` | |
| `PASSWORD_HASH_ALGO` | `argon2id` | |
| `SALT_ROUNDS` | `12` | samo če se uporabi bcrypt. V starem sistemu je bila ta vrednost v composeu, v `.env` pa ne — zato je `+process.env.SALT_ROUNDS!` v razvoju dal `NaN` |
| `ADMIN_EMAIL` | — | samo za prvi zagon |
| `ADMIN_INITIAL_PASSWORD` | — | sistem zahteva zamenjavo ob prvi prijavi |

### Brskalnik

Vse novo. Stari sistem je te vrednosti imel trdo zapisane v `working-hours.ts`.

| Spremenljivka | Privzeto | Opomba |
|---|---|---|
| `PUPPETEER_SKIP_DOWNLOAD` | `true` | uporablja se sistemski Chromium |
| `PUPPETEER_EXECUTABLE_PATH` | `/usr/bin/chromium` | |
| `BROWSER_HEADLESS` | `true` | |
| `BROWSER_TIMEOUT_MS` | `30000` | staro: `timeout: 0`, torej brez omejitve — obešen klic je ostal obešen |
| `BROWSER_PROTOCOL_TIMEOUT_MS` | `60000` | |
| `BROWSER_NO_SANDBOX` | `false` | vklopi samo, če peskovnik na VPS-u ni izvedljiv; zapiši razlog |
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
| `SCREENSHOT_RETENTION_DAYS` | `30` | novo; brez tega se disk počasi zapolni |
| `LOG_FILE_PATH` | — | v starem sistemu ga je `logging-service.ts` uporabljal, a ni bil nikjer definiran. Nov sistem privzeto piše JSON v stdout in te spremenljivke ne potrebuje |

### Zunanji viri (001)

| Spremenljivka | Privzeto |
|---|---|
| `ARSO_RADAR_URL` | `https://meteo.arso.gov.si/uploads/probase/www/observ/radar/si0-rm-anim.gif` |
| `ARSO_WEATHER_URL` | `https://vreme.arso.gov.si/api/1.0/location/` |
| `ARSO_DEFAULT_LOCATION` | `Ljubljana` |
| `RADAR_CACHE_SECONDS` | `300` |
| `WEATHER_CACHE_SECONDS` | `600` |

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
MONGO_URI=mongodb://cleverdash:CHANGEME@mongo:27017/cleverdash?authSource=admin

# ─── Avtentikacija ───
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=30d
PASSWORD_HASH_ALGO=argon2id
ADMIN_EMAIL=
ADMIN_INITIAL_PASSWORD=

# ─── Brskalnik ───
PUPPETEER_SKIP_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
BROWSER_HEADLESS=true
BROWSER_TIMEOUT_MS=30000
BROWSER_PROTOCOL_TIMEOUT_MS=60000
BROWSER_NO_SANDBOX=false

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

# ─── E-pošta (neobvezno) ───
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
NOTIFY_EMAIL_TO=
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
