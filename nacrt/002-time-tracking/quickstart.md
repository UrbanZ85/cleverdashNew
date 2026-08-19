# Quickstart — razvoj in postavitev na VPS

---

## 1. Razvojno okolje

```bash
git clone <repo> cleverdash && cd cleverdash
cp .env.example .env          # izpolni; glej docs/env-reference.md
npm install                   # workspaces: apps/api, apps/web, packages/contracts

docker compose -f infra/docker-compose.dev.yml up -d mongo   # samo baza
npm run dev:api               # localhost:3000
npm run dev:web               # localhost:8100, /api proxy na :3000
```

`npm run dev:web` uporablja `proxy.conf.json`, da `/api` kaže na `localhost:3000`.
Frontend zato tudi v razvoju uporablja relativne poti in ne ve, kje teče — enako kot v
produkciji za `https://app.si`.

Za lokalni razvoj brez klikanja po pravi strani:

```bash
CLOCK_PORTAL=fake npm run dev:api    # FakeClockPortal, skriptirana stanja
DRY_RUN=true      npm run dev:api    # pravi Puppeteer, bere, a ne klikne
```

`DRY_RUN=true` naj bo privzeto v vsakem okolju, ki ni produkcija. Nenamerno klikanje po
pravi evidenci delovnega časa iz razvojnega okolja je težko popraviti.

## 2. Android build

```bash
npm run build:web
npx cap sync android
npx cap open android
```

Nativni build nima izvora, zato potrebuje absolutni naslov. Edino mesto v aplikaciji, ki
pozna gostitelja:

```ts
// apps/web/src/environments/environment.prod.ts
export const environment = {
  production: true,
  apiBase: '',                     // web: relativno, isti izvor
};

// capacitor.config.ts — nativni build
const config: CapacitorConfig = {
  appId: 'si.cleverdash.app',
  appName: 'CleverDash',
  webDir: 'dist/web',
  server: { androidScheme: 'https' },
  plugins: {
    PushNotifications: { presentationOptions: ['alert', 'badge', 'sound'] },
  },
};
```

Nativni odjemalec `apiBase` prebere iz nastavitev (privzeto `https://app.si`), da se ga
lahko med testiranjem preusmeri, brez novega builda.

Za obvestila je potrebno:

- `google-services.json` v `android/app/` — **ni v gitu**;
- `POST_NOTIFICATIONS` runtime dovoljenje za Android 13+, s pozivom ob prvem zagonu;
- kanali za obvestila, ustvarjeni ob zagonu (glej `research.md` §6).

## 3. Docker slika za API

Kritični deli. Podrobnosti in razloge glej v `research.md` §2.

```dockerfile
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package*.json apps/api/
COPY packages/contracts/package*.json packages/contracts/
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci
COPY . .
RUN npm run build -w apps/api

FROM node:22-bookworm-slim
# Sistemski Chromium — Puppeteer si svojega ne prenaša.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-liberation ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    TZ=Europe/Ljubljana \
    NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
```

Razlike od starega `Dockerfile`, ki so pomembne:

| Staro | Novo | Zakaj |
|---|---|---|
| `node:21-alpine` + Chromium iz pripetega Alpine repozitorija | `node:22-bookworm-slim` + `apt` Chromium | musl in Chromium nista uradno podprta; pripet repozitorij bo nekoč izginil |
| `npm install` in nato še `npm install puppeteer` | `npm ci`, Puppeteer kot navadna odvisnost | ponovljiv build |
| `COPY . .` pred buildom, brez večfazne gradnje | večfazna gradnja | izvorna koda in razvojne odvisnosti ne pridejo v končno sliko |
| brez `TZ` | `TZ=Europe/Ljubljana` | brez tega je vsebnik v UTC |
| brez `HEALTHCHECK` | je | Docker sam zna ponovno zagnati pokvarjen vsebnik |
| teče kot root | `USER node` | |

## 4. Compose za produkcijo

```yaml
services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    volumes:
      - mongo_data:/data/db
    environment:
      MONGO_INITDB_ROOT_USERNAME_FILE: /run/secrets/mongo_user
      MONGO_INITDB_ROOT_PASSWORD_FILE: /run/secrets/mongo_pass
    secrets: [mongo_user, mongo_pass]
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping')"]
      interval: 30s

  api:
    build: { context: ., dockerfile: apps/api/Dockerfile }
    restart: unless-stopped
    env_file: [.env]                 # nobene prave vrednosti v tej datoteki
    environment:
      TZ: Europe/Ljubljana
      GOOGLE_APPLICATION_CREDENTIALS: /run/secrets/fcm_key
    secrets: [fcm_key]
    volumes:
      - screenshots:/app/data/screenshots
    shm_size: 1gb                    # BREZ TEGA SE CHROMIUM SESUJE
    init: true                       # brez tega ostajajo zombi procesi
    mem_limit: 1500m
    depends_on:
      mongo: { condition: service_healthy }

  web:
    build: { context: ., dockerfile: apps/web/Dockerfile }
    restart: unless-stopped

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./infra/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [api, web]

secrets:
  fcm_key:   { file: ./secrets/fcm-service-account.json }
  mongo_user: { file: ./secrets/mongo_user }
  mongo_pass: { file: ./secrets/mongo_pass }

volumes:
  mongo_data: {}
  screenshots: {}
  caddy_data: {}
  caddy_config: {}
```

Trije vnosi, ki jih stari compose nima in so razlog za del težav:

1. **`shm_size: 1gb`** — privzetih 64 MB je premalo za Chromium. Najpogostejši vzrok
   napake `Target closed` in s tem odgovor na "včasih se ko se pritisne gumb nič ne
   zgodi".
2. **`init: true`** — Chromium pušča procese; brez tega se PID prostor zapolni.
3. **`mem_limit`** — brez omejitve lahko Chromium izstrada Mongo na majhnem VPS-u.

Stari compose ima tudi napako v zapisu omrežij (`- web` z napačnim zamikom) in
`volumes: - opt/apps_data:/…` z relativno potjo brez vodilne poševnice — kar ustvari
poimenovan volumen namesto bind mounta. Ne prekopiraj.

## 5. Caddyfile — enotni izvor

```
app.si {
    encode zstd gzip

    handle /api/* {
        reverse_proxy api:3000
    }

    handle {
        reverse_proxy web:80
    }

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```

To je celotna izvedba zahteve, da je aplikacija na `https://app.si` in backend na
`https://app.si/api/...`. Caddy sam pridobi in obnavlja TLS certifikat.

Frontend `Dockerfile` postreže statični build z nginxom s SPA fallbackom:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

## 6. Prvi zagon na VPS

```bash
git clone <repo> /opt/cleverdash && cd /opt/cleverdash

mkdir -p secrets && chmod 700 secrets
# fcm-service-account.json (NOV ključ — glej docs/SECURITY-FIRST.md), mongo_user, mongo_pass
cp .env.example .env && $EDITOR .env

docker compose -f infra/docker-compose.yml up -d --build
docker compose logs -f api
curl -s https://app.si/api/v1/health | jq
```

Nato po vrsti:

1. Prijavi se in zamenjaj začetno admin geslo.
2. V Nastavitvah vpiši **novo** vrednost sejnega piškotka e-računov.
3. Odpri Diagnostiko in poženi preizkusno branje. Mora vrniti seznam gumbov. Če ne, tega
   koraka ne preskoči — brez zanesljivega branja ničesar drugega ni smiselno vklapljati.
4. Ustvari lokaciji in profila (glej `docs/legacy-engine.md` §6 za obstoječe vrednosti).
5. Profila **pusti v načinu `REMIND_ONLY`** vsaj en teden. Primerjaj z resničnostjo.
6. Šele nato vklopi `AUTO`.

Korak 5 ni pretirana previdnost. Sistem pritiska gumbe v pravi evidenci delovnega časa,
napake pa se odkrijejo šele, ko so že vpisane.

## 7. Nadzor

```bash
# Healthchecks.io ali self-hosted Uptime Kuma s push monitorjem
HEALTHCHECK_PING_URL=https://hc-ping.com/<uuid>
```

Nastavi obdobje na 5 minut in strpnost na 10 minut. Ker tik teče vsakih 30 sekund, je
zamolk daljši od 10 minut zanesljiv znak težave.

To je edini del nadzora, ki deluje tudi takrat, ko sistem ne teče. Notranji `/health` ne
more poročati, da je mrtev — glej `research.md` §8.

Dodatno je vredno spremljati:

| Kaj | Kje |
|---|---|
| prostor na disku | `/api/v1/health` → `diskFreeBytes` |
| akcije, ki so odpovedale | `/api/v1/health` → `failedActionsLast24h` |
| potek seje | obvestilo 7, 3 in 1 dan prej |
| rast pomnilnika API vsebnika | `docker stats`; stalna rast pomeni, da konteksti niso zaprti |

## 8. Varnostne kopije

```bash
docker compose exec -T mongo mongodump --archive --gzip \
  > "backup-$(date +%F).gz"
```

Kolekcija `actionRecords` je edina, ki je nenadomestljiva — je evidenca. Vse ostalo se da
sestaviti znova. Posnetki zaslona v varnostno kopijo niso potrebni.
