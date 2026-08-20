# CleverDash

Osebni dashboard z zavihki. Funkcionalnost **001 — ogrodje aplikacije in dashboard** je
implementirana: prijava, vreme + animirana radarska slika ARSO, meni z zavihki, nastavljive
ploščice, potisna obvestila. Podrobna specifikacija, načrt in naloge so v
[`specs/001-app-shell-dashboard/`](specs/001-app-shell-dashboard/).

**Stack:** Ionic 8 + Angular 20 (web in Android prek Capacitorja), Node.js 22 + Express 5 +
Mongoose 8, MongoDB 7, Docker Compose + Caddy (samodejni TLS).

**Naslovi:** aplikacija na `https://app.si`, API na `https://app.si/api/v1/...` — isti
izvor, brez CORS-a (člen II ustave). Caddy usmeri `/api/*` na backend, vse ostalo na SPA.

---

## Hiter zagon (Docker)

```bash
cp .env.example .env
# izpolni .env — obvezne vrednosti so v specs/001-app-shell-dashboard/quickstart.md §3
docker compose -f infra/docker-compose.yml up -d --build
```

Iz čiste kopije do delujočega sistema: pod 3 minute, samo Docker in izpolnjen `.env`
(FR-040, SC-007 — izmerjeno v [`docs/acceptance-001.md`](docs/acceptance-001.md)). Podroben
postopek, kontrolni seznam po funkcionalnih zahtevah in reševanje težav je v
[`specs/001-app-shell-dashboard/quickstart.md`](specs/001-app-shell-dashboard/quickstart.md).

## Razvojni način

```bash
npm install
docker compose -f infra/docker-compose.dev.yml up -d   # samo MongoDB
npm run dev:api     # http://localhost:3000
npm run dev:web     # dev-server s proxyjem /api → :3000 (enak izvor kot v produkciji)
```

Pred vsakim commitom:

```bash
npm run typecheck
npm run lint
npm test             # apps/api — Vitest proti v-pomnilniški MongoDB
npm run build:web    # preveri, da se Angular build ustavi na 0 napakah
```

`npm test` ob prvem zagonu prenese binarko MongoDB (~600 MB, enkratno, nato predpomnjeno).

## Struktura

```
apps/api/         Express + Mongoose; src/modules/<zavihek>, src/platform/ (skupno),
                   src/domain/ (čiste funkcije, člen IX)
apps/web/         Ionic + Angular; src/app/features/<zavihek>, core/, shared/
packages/contracts/  Tipi, generirani iz specs/001-app-shell-dashboard/contracts/openapi.yaml
infra/            docker-compose.yml, Caddyfile, oba Dockerfile-a
templates/tab-module/  Predloga za nov zavihek — glej docs/adding-a-tab.md
```

Dodajanje zavihka je dodajanje ene mape in enega vnosa v register (člen I) —
[`docs/adding-a-tab.md`](docs/adding-a-tab.md) opiše postopek, meja med moduli pa je
uveljavljena z lint pravilom (`eslint.config.js`), ne le z dogovorom.

## Skrivnosti

V repozitoriju je samo `.env.example` s praznimi vrednostmi (člen IV ustave). Datoteke s
ključi (npr. Firebase service account za potisna obvestila) živijo izven repozitorija in se
montirajo prek `FCM_KEY_FILE` v `.env` — glej komentarje v `.env.example` in
[`docs/SECURITY-FIRST.md`](docs/SECURITY-FIRST.md) za razkrite skrivnosti iz starega
sistema, ki jih je treba zavrteti.

---

## Naslednje funkcionalnosti (002, 003)

Specifikacije zanju še niso ustvarjene prek Spec Kita — vhodno gradivo čaka v `nacrt/`:

```
/speckit-specify   Preberi nacrt/002-time-tracking/spec.md in ustvari specifikacijo.
/speckit-clarify
/speckit-plan      Uporabi nacrt/002-time-tracking/{plan,research,data-model,quickstart}.md,
                   nacrt/002-time-tracking/contracts/openapi.yaml in docs/legacy-engine.md.
/speckit-analyze
/speckit-tasks
/speckit-implement

/speckit-specify   Preberi nacrt/003-cameras/spec.md in ustvari specifikacijo.
/speckit-clarify
/speckit-plan
/speckit-tasks
/speckit-implement
```

Znotraj 002 velja ena omejitev: **faza 3 pred fazo 4** (`nacrt/002-time-tracking/plan.md`
§B.7) — klikanje se ne vklopi, dokler branje stanja ni dokazano zanesljivo na živi strani.

### Zakaj vhodno gradivo ni v `specs/`

Mapi `specs/` in `.specify/` **si lasti Spec Kit**: `/speckit-specify` sam ustvari
`specs/NNN-ime/spec.md`, številko pa določi tako, da pregleda obstoječe mape v `specs/` in
prišteje eno. Če bi vhodno gradivo za 002 in 003 ležalo v `specs/002-…`, `specs/003-…`, bi
Spec Kit pri naslednjem `/speckit-specify` ustvaril `specs/004-…` in dobili bi dve
vzporedni številčenji. Zato je vhodno gradivo v `nacrt/`, ustava pa v
`.specify/memory/constitution.md` (zapisana prek `/speckit-constitution`, vir je bil
`nacrt/constitution.md`).

| Mapa | Kaj je |
|---|---|
| `nacrt/001-app-shell-dashboard/spec.md` | Vhodno gradivo za 001 — funkcionalnost je implementirana |
| `nacrt/002-time-tracking/` | Vhodno gradivo za 002 — **glavna funkcionalnost**, prenova `belezenje_casa` |
| `nacrt/003-cameras/spec.md` | Vhodno gradivo za 003 — zavihek kamer |
| `docs/legacy-engine.md` | Obratno inženirstvo starega engine-a beleženja časa + napake, ki jih 002 ne sme ponoviti |
| `docs/env-reference.md` | Vse okoljske spremenljivke: kaj ostane, kaj gre v bazo, kaj je novo |
| `docs/SECURITY-FIRST.md` | Razkrite skrivnosti iz starega sistema, ki jih je treba zavrteti |

## Sorodne mape

| Mapa | Kaj je |
|---|---|
| `privat\cleverdash` | **ta projekt** |
| `privat\cleverdash-old` | starejši CleverDash (Angular 13 + Firebase); vir za zaslon kamer (003) |
| `privat\cleverdash2` | starejši poskus iz novembra 2025 |
| `privat\belezenje_casa` | aplikacija, ki jo zavihek "Beleženje časa" (002) nadomešča |
