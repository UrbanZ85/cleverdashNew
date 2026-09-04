# Implementation Plan: Prijava prek Keycloaka in večuporabniška aplikacija

**Branch**: `004-keycloak-sso-multiuser` (imenik funkcionalnosti; git veja je še `main`) | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-keycloak-sso-multiuser/spec.md`

**Podlaga**: 001–003 so postavile ogrodje, avtentikacijo z e-pošto/geslom (JWT dostopni žeton +
naključni obnovitveni žeton v "družinah sej") in tri zavihke (dashboard, beleženje časa,
kamere) — vse eksplicitno enouporabniško: `Settings` je singleton dokument
(`apps/api/src/modules/settings/model.ts`), `User` nima nobenega lastniškega polja, ker JE
edini lastnik (`apps/api/src/modules/auth/models/user.model.ts`, komentar "Ne nosi lastnika —
je lastnik"), in nobena kolekcija v `cameras`/`time-tracking` ne nosi `userId`/`ownerId`
(preverjeno v kodi, ne domnevano). Ta funkcionalnost je prva, ki spremeni to temeljno
predpostavko — zato posega v štiri obstoječe module, v nasprotju z 002/003, ki sta bili čist
dodatek novega zavihka brez sprememb obstoječega.

## Summary

Ta funkcionalnost je dejansko **dva ločena, a soodvisna posega**:

1. **Zamenjava avtentikacijskega modula.** Prijava z e-pošto/geslom (argon2, `mustChangePassword`,
   `login-throttle`, `SessionFamily`/`RefreshToken` po vzorcu rotacije) se v celoti odstrani in
   nadomesti z OIDC prijavo pri zunanjem Keycloaku, izvedeno kot **backend-for-frontend**: SPA se
   nikoli ne pogovarja s Keycloakom neposredno (to bi zahtevalo javni klient in shranjevanje
   žetonov v brskalniku); namesto tega Express backend izvede Authorization Code + PKCE izmenjavo,
   nastavi `httpOnly` piškotek seje (isto oblika kot današnji `cd_refresh`, glej
   [research.md](./research.md) §2) in preveri veljavnost te seje pri vsaki pomembnejši zahtevi
   neposredno pri Keycloaku (FR-005–FR-007). To je edini del, kjer člen II (enotni izvor) zahteva
   pazljivost: `redirect_uri` MORA biti na `https://app.si/api/v1/auth/callback`, ne na Keycloaku.

2. **Pretvorba štirih modulov iz enouporabniških v večuporabniške.** Ključna ugotovitev pregleda
   kode: **vsak obstoječi endpoint v `settings`, `cameras` in `time-tracking` že teče za
   `requireScopes()`**, torej ima `req.auth.subjectId` na voljo pri vsakem klicu — samo ga še ne
   uporablja za filtriranje. Pretvorba singleton/skupne kolekcije v "eno na uporabnika" je zato v
   veliki večini primerov **sprememba poizvedbenega ključa v podatkovni plasti** (`{ _id:
   'singleton' }` → `{ userId: req.auth.subjectId }`), ne sprememba oblike zahteve/odgovora in NE
   sprememba frontenda za te tri module — glej [data-model.md](./data-model.md). Resnično nova
   koda je: `User`/sejni model za Keycloak (1), migracijski korak, ki obstoječe skupne podatke
   pripiše administratorju (FR-014), in `userId` polje samo, dodano na prizadete sheme.

Skupaj to naredi obseg spremembe velik (štiri moduli, ne eden), a **plitek** — nobena poslovna
logika znotraj `time-tracking`/`cameras` (razporejevalnik, izpeljava zdravja kamer, validacija
naslovov) se ne spremeni; spremeni se samo, kdo sme kaj videti.

## Technical Context

**Language/Version**: TypeScript 5.x `strict: true`, Node.js 22 LTS (API); Angular 20 + Ionic 8,
web in Android prek Capacitorja — nespremenjeno iz 001–003.

**Primary Dependencies**: Novo na backendu: `openid-client` (v6, ESM, referenčna OIDC odjemalska
knjižnica za Node — Authorization Code + PKCE, izmenjava kode, introspekcija, RP-Initiated
Logout; glej research.md §1). Odstranjeno: `argon2` (gesla se ne shranjujejo več, FR-018).
`jsonwebtoken` ostane — notranji sejni piškotek je še vedno podpisan JWT, glej research.md §2.
Na frontendu **brez novih odvisnosti** — prijava je preusmeritev brskalnika, ne knjižnica v SPA.

**Storage**: MongoDB 7 / Mongoose 8 (nespremenjeno). `User` shema prenovljena (glej
data-model.md: `keycloakSubject` namesto `passwordHash`). Nov `KeycloakSession` model
nadomesti `SessionFamily`+`RefreshToken`. `LoginAttempt` (grid za throttling gesla) odpade v
celoti — omejevanje neuspelih poskusov je zdaj Keycloakova odgovornost (spec.md Out of Scope).
Dodan `userId` (ObjectId → `User`, required, indeksiran) na: `Settings`, `Camera`,
`CameraGroup`, `TrackingProfile`, `TrackingLocation`, `PlannedAction`, `ActionRecord`,
`ActionAttempt`, `CalendarDay`, `CalendarOverride`, `AbsencePeriod`, `RemoteSession`. `Holiday`
in `CameraEmbedAllowlist` OSTANETA skupni, brez `userId` — glej research.md §5.

**Testing**: Vitest + Supertest (nespremenjeno). Pravi Keycloak v testih NE teče — lahek
ponarejen OIDC strežnik v testnem procesu (research.md §3), po istem načelu kot člen IX
("logika testabilna brez zunanjega sistema/brskalnika").

**Target Platform**: nespremenjeno — Linux VPS v Dockeru za API, Caddy za enotni izvor, web kot
nameščena PWA, Android prek Capacitorja. Organizacija **že ima** Keycloak (spec.md Assumptions)
— brez novega kontejnerja v `infra/docker-compose.yml`.

**Project Type**: obstoječ monorepo (`apps/api`, `apps/web`, `packages/contracts`); ta
funkcionalnost prenavlja modul `auth` in dotika štiri obstoječe module — brez nove aplikacije.

**Performance Goals**: SC-001 (prijava brez CleverDash-specifičnega gesla), SC-003 (dostop
onemogočen "praktično takoj" po odvzemu pravic pri Keycloaku — v praksi nekaj sekund, glej
research.md §4 o omejenem TTL predpomnjenju preverjanja seje).

**Constraints**: člen II (enotni izvor, brez `cors()`) → `redirect_uri` na isti domeni kot SPA;
klic do Keycloaka samega (token/introspection endpoint) gre iz **backenda**, ne iz brskalnika,
zato ne gre za CORS vprašanje. Člen III (izjema `Idempotency-Key` za izdajo/rotacijo žetonov,
zapisana v `specs/001-app-shell-dashboard/contracts/openapi.yaml`) se razširi na nov
`POST /auth/callback`/`POST /auth/refresh` (glej contracts/openapi.yaml). Člen IV (skrivnosti
samo iz okolja) → `KEYCLOAK_CLIENT_SECRET` itd. izključno v `.env`. Člen VIII (vljudnost do
zunanjih virov: vsak zunanji klic prek predpomnilnika z razumnim TTL) je **v napetosti** z
FR-006/FR-007 (živo preverjanje pri vsaki pomembnejši zahtevi) — razrešeno v research.md §4 s
kratkim (sekunde, ne minute) TTL predpomnjenjem rezultata preverjanja na dostopni žeton, ne z
opustitvijo predpomnjenja.

**Scale/Scope**: interno/osebno orodje (`package.json`: "osebni dashboard"), peščica
uporabnikov (gospodinjstvo, ne podjetje) — živo preverjanje pri Keycloaku je pri tem obsegu
poceni tudi brez agresivnega predpomnjenja.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Načelo | Ocena |
|---|---|
| I. Zavihek je modul | `auth` je skupna storitev (`platform`/`modules/auth`), ne zavihek — ostaja tako. Moduli `settings`/`cameras`/`time-tracking` se med sabo še vedno NE kličejo; vsak samo doda `userId` v svoje lastne poizvedbe. PASS. |
| II. Enotni izvor | `redirect_uri` na `https://app.si/api/v1/auth/callback`; brez `cors()`, brez ločene poddomene. Zunanji Keycloak je preusmeritev brskalnika (podobno kot že danes obstoječa preusmeritev na Keycloakovo prijavno stran), ne API klic z drugega izvora v SPA. PASS. |
| III. API-first, Idempotency-Key izjema | Nov tok je najprej REST poti, šele nato zaslon. Izjema za izdajo/rotacijo žetonov eksplicitno razširjena na `/auth/callback` v OpenAPI (glej contracts/), ne tiho. PASS. |
| IV. Brez skrivnosti v kodi/gitu | `KEYCLOAK_*` samo v `.env`/`docs/env-reference.md`, shema v `env.ts` (Zod), brez privzetkov za skrivnosti. PASS. |
| V. Scheduler determinističen | Nedotaknjeno — 004 ne spreminja `time-tracking` schedulerja, samo dodaja `userId` na njegove podatkovne modele. N/A. |
| VI. Neverificirane akcije | N/A — 004 ne uvaja avtomatiziranih klikov. |
| VII. Sistem pove, da je pokvarjen | Obstoječi `/health` ostane; glej research.md §9 — namerno NE dodajamo Keycloakove dosegljivosti v `/health`, ker bi to podvojilo to, kar FR-007 že počne na vsaki zahtevi (če je Keycloak spodaj, se to takoj pozna na dostopu, ne šele na health-checku). |
| VIII. Vljudnost do zunanjih virov | **Napetost**, razrešena v research.md §4 (kratek TTL na preverjanje seje namesto brez predpomnjenja). Dokumentirano v Complexity Tracking spodaj. PASS s pojasnilom. |
| IX. Engine testabilen brez brskalnika | Preslikava vlog → obsegi in odločitev "ali je seja še veljavna" sta čisti funkciji nad že pridobljenimi podatki (glej research.md §6) — testabilni brez pravega Keycloaka, po vzorcu `readState()`/`performAction()`. PASS. |
| X. Slovenščina v domeni, angleščina v kodi | `KeycloakSession`, `userId` itd. so angleški identifikatorji; sporočila uporabniku ("nimate dostopa do te aplikacije") so slovenska. PASS. |
| XI. Mobilna naprava ni planer | Nedotaknjeno — 004 ne dotika time-tracking scheduler poti. N/A. |
| XII. Meje | Nedotaknjeno. N/A. |

Gate: **PASS**, z eno dokumentirano napetostjo (VIII), razrešeno v research.md in navedeno v
Complexity Tracking.

**Ponovno preverjeno po Phase 1** (data-model.md, contracts/openapi.yaml, quickstart.md):
brez novih trkov. Odločitev iz research.md §9 (004 nadomesti `/auth/*` v 001-ovi pogodbi,
namesto da bi trajno vzdrževal dve vzporedni pogodbi za isto pot) je sama po sebi uveljavitev
Kakovostnih vrat #3 ("OpenAPI pogodba je posodobljena in validna") — dve resnici o isti poti
bi to vrata naredili nesmiselna. `userId` na ~10 kolekcijah (data-model.md) ne uvaja novega
trka — gre za podatek, ne za klic med moduli (člen I ostaje nedotaknjen, ker noben modul ne
bere tuje kolekcije neposredno).

## Project Structure

### Documentation (this feature)

```text
specs/004-keycloak-sso-multiuser/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── openapi.yaml     # Phase 1 output — nadomesti /auth/* iz 001, glej research.md §9
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
apps/api/src/
├── platform/
│   ├── keycloak/                       # NOVO — OIDC odjemalec, introspekcija, mapiranje vlog
│   │   ├── client.ts                   # openid-client konfiguracija (issuer discovery)
│   │   ├── session.service.ts          # izda/preveri notranji sejni piškotek
│   │   ├── role-mapping.ts             # Keycloak vloge/skupine → CleverDash scopes (čisto, testabilno brez mreže)
│   │   └── introspection-cache.ts      # kratek TTL predpomnilnik za FR-006/FR-007 (research.md §4)
│   └── auth/
│       └── scopes.ts                   # OBSTOJEČ, nespremenjen — requireScopes() ostane
├── modules/
│   ├── auth/
│   │   ├── router.ts                   # PRENOVLJEN: /auth/login (redirect), /auth/callback, /auth/logout, /auth/me, /auth/refresh
│   │   │                                # ODSTRANJENO: /auth/password, /auth/sessions*
│   │   ├── models/
│   │   │   ├── user.model.ts           # PRENOVLJEN: keycloakSubject namesto passwordHash
│   │   │   └── keycloak-session.model.ts  # NOVO, nadomesti session-family + refresh-token modela
│   │   ├── services/
│   │   │   ├── password.service.ts     # ODSTRANJENO
│   │   │   ├── login-throttle.service.ts  # ODSTRANJENO
│   │   │   ├── bootstrap-user.service.ts  # PRENOVLJEN → migration.service.ts (glej research.md §7)
│   │   │   ├── access-token.service.ts # PRENOVLJEN: verifyAccessToken kliče introspection-cache
│   │   │   └── refresh-token.service.ts   # ODSTRANJENO (Keycloak upravlja refresh)
│   │   └── guards/
│   │       └── must-change-password.guard.ts  # ODSTRANJENO (FR-017)
│   ├── settings/model.ts               # `_id: 'singleton'` → `userId` (glej data-model.md)
│   ├── cameras/models/*.ts             # + userId na camera.model.ts, camera-group.model.ts
│   └── time-tracking/models/*.ts       # + userId na profil/lokacijo in vse, kar visi nanju
apps/web/src/app/
├── core/auth/
│   ├── auth.service.ts                 # PRENOVLJEN: login() postane window.location preusmeritev, brez gesla
│   ├── auth.guard.ts                   # nespremenjen po obliki (isAuthenticated()), spremenjen vir resnice
│   └── token.store.ts                  # poenostavljen — brez ročne obnovitve na Androidu (glej research.md §2)
└── features/auth/
    ├── login.page.ts                   # ODSTRANJENO (FR-017)
    └── change-password.page.ts         # ODSTRANJENO (FR-017)
```

**Structure Decision**: obstoječa monorepo struktura (`apps/api`, `apps/web`,
`packages/contracts`) se ohrani; `platform/keycloak/` je nov skupen mehanizem (kot
`platform/cache`, `platform/crypto` v 003), ker ga potrebuje samo `modules/auth`, a je po
členu I umeščen v `platform/`, ne v modul, saj gre za splošno infrastrukturo, ne domensko
logiko enega zavihka.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Živo preverjanje seje pri Keycloaku na vsako pomembnejšo zahtevo je v napetosti s členom VIII (predpomnilnik z razumnim TTL za zunanje klice) | FR-006/FR-007 in uporabnikova izrecna odločitev (spec.md Clarifications, 24. 8. 2026): takojšnja uveljavitev preklica dostopa ima prednost pred razpoložljivostjo/vljudnostjo do Keycloaka | Brez KAKRŠNEGA KOLI predpomnjenja bi vsak API klic pomenil sinhron zunanji klic — pri majhnem obsegu (peščica uporabnikov) sprejemljivo, a bi nepotrebno obremenjevalo Keycloak tudi pri desetih zaporednih klicih iste sekunde (npr. nalaganje nadzorne plošče). Rešitev: kratek TTL (nekaj sekund) predpomnilnik po dostopnem žetonu (research.md §4) — spoštuje črko člena VIII (obstaja TTL) in duh FR-006/FR-007 (zakasnitev preklica v redu velikosti sekund, ne minut/ur kot prej). |
| `userId` denormaliziran na ~10 kolekcij namesto samo na koreninski entiteti (`TrackingProfile`/`TrackingLocation`) z izpeljavo lastništva prek tuje ključa | FR-010, FR-015, SC-002 (0 % navzkrižnega uhajanja podatkov med uporabniki) — vsaka poizvedba, ki bi pozabila na `JOIN`/`$lookup` do starša, bi sicer tiho vrnila podatke vseh uporabnikov | Izpeljano lastništvo (samo `profileId`/`locationId`, brez lastnega `userId`) bi zahtevalo, da si VSAK prihodnji endpoint zapomni narediti dodatno poizvedbo/`$lookup` do starša, preden filtrira — ena pozabljena poizvedba je natanko razred hrošča, ki ga SC-002 meri na nič. Neposreden `userId` na vsaki kolekciji naredi pravilen filter najkrajšo, ne najdaljšo pot. |
