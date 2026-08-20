# Implementation Plan: Ogrodje aplikacije in dashboard

**Branch**: `001-app-shell-dashboard` (imenik funkcionalnosti; git veja je še `main`) | **Date**: 2026-08-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-app-shell-dashboard/spec.md`

**Podlaga**: poglavje A ("Skupna arhitektura") iz `nacrt/002-time-tracking/plan.md` in
`docs/env-reference.md`. Poglavje A je namenoma skupno za 001, 002 in 003 — ta načrt ga
uveljavi, ne izumi na novo.

## Summary

Dostavi delujočo, prijavljeno, na VPS postavljeno aplikacijo z enim uporabnim zavihkom:
dashboard z vremenom in animirano radarsko sliko. Pod tem nastane celotna nosilna
konstrukcija — monorepo, enotni izvor za web in API, avtentikacija z rotirajočimi žetoni,
deklarativni register zavihkov, plast `platform/` s predpomnilnikom, obvestili, dnevniki in
idempotentnostjo, ter Docker Compose postavitev s samodejnim TLS.

Tehnični pristop: monorepo `apps/api` + `apps/web` + `packages/contracts`, Caddy kot edini
vstop na `app.si`, ki `/api/*` pošlje na Node in vse ostalo na SPA build. Zunanji podatki
gredo izključno prek strežniškega predpomnilnika, kar hkrati izpolni člen VIII ustave in
zahtevo FR-026 (zadnji znani podatek ob izpadu vira). Obvestila in API ključi nastanejo
zdaj, ker jih 002 podeduje in ker bi njihovo kasnejše dodajanje poseglo v vsak modul.

## Technical Context

**Language/Version**: TypeScript 5.x s `strict: true` na obeh straneh; Node.js 22 LTS na
strežniku

**Primary Dependencies**: Express 5, Mongoose 8, Zod (validacija na robu, izpeljani tipi),
Pino (strukturiran JSON dnevnik z ID-jem korelacije), `firebase-admin` (potisna obvestila),
Ionic 8 + Angular 20 (standalone komponente, signali — brez `NgModule`), Capacitor 7

**Storage**: MongoDB 7. Poleg domenskih zapisov hrani tudi predpomnjene odgovore zunanjih
virov, da zadnji znani podatek preživi ponovni zagon.

**Testing**: Vitest za enote, Supertest za API pogodbo, Playwright za en osnovni E2E tok
(prijava → dashboard → viden radar)

**Target Platform**: Linux VPS v Dockerju (strežnik), sodobni brskalniki kot namestljiva
spletna aplikacija, Android prek Capacitorja. iOS ni v obsegu, struktura ga ne izključuje.

**Project Type**: Monorepo z web/mobilnim odjemalcem in strežniškim API-jem

**Performance Goals**: Prvi izris vremena in radarja pod 3 s (SC-001). Predpomnjen odgovor
strežnika pod 50 ms, ker ne gre po omrežju do vira. Radar največ 5 min star, vreme največ
10 min (SC-002).

**Constraints**: Enotni izvor brez CORS (člen II). Vsi izvajalni deli v `Europe/Ljubljana`
(`TZ` in ločeno `SCHEDULE_TIMEZONE`). Nobene skrivnosti v repozitoriju (člen IV). Zunanji
vir se ne kliče iz odjemalca (člen VIII). Osveževanje se ustavi, ko zaslon ni v ospredju
(FR-022).

**Scale/Scope**: Enouporabniški sistem (FR-016) z več napravami, ~10 zaslonov, 4 načrtovani
zavihki, ~20 endpointov v pogodbi 001. Obremenitev je zanemarljiva; ozko grlo so zunanji
viri, ne strežnik.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Ocenjeno proti `.specify/memory/constitution.md` **v1.1.0**, vseh 12 členov in 5 kakovostnih
vrat.

| Člen | Stanje | Kako ga ta načrt izpolni |
|---|---|---|
| I. Zavihek je modul | ✅ | Modul je `apps/api/src/modules/<ime>` + `apps/web/src/app/features/<ime>`. Moduli uvažajo samo iz `platform/` oz. `core/`. Dashboard je modul kot vsak drug, čeprav je začetni zaslon. Meja se uveljavi z lint pravilom, ne z dogovorom — glej [research.md](./research.md) §6. |
| II. Enotni izvor | ✅ | Caddy na `app.si`: `/api/*` → `api:3000`, ostalo → SPA z `try_files`. `cors()` ni namenščen. V razvoju isto obliko doseže dev-server proxy. Edina izjema je nativni Android z nastavljivim `apiBase`. |
| III. API-first | ✅ | Pogodba OpenAPI 3.1 nastane v tej fazi ([contracts/openapi.yaml](./contracts/openapi.yaml)) in je vir za generirane tipe v `packages/contracts`. `X-API-Key` z obsegi je del plasti `platform/`, endpointi `/api-keys` prav tako. `Idempotency-Key` ni sprejet na `auth/login` in `auth/refresh` — to je **uveljavljena izjema po členu III** (ustava v1.1.0), ne odstopanje, in je izrecno zapisana v pogodbi pri obeh poteh, kot člen zahteva. |
| IV. Nobene skrivnosti | ✅ | V gitu samo `.env.example` s praznimi vrednostmi. Ključ za obvestila je montirana datoteka prek `GOOGLE_APPLICATION_CREDENTIALS`; pot na gostitelju pride iz `.env`, ne iz composea. Zod validacija okolja ob zagonu zaustavi zagon ob manjkajoči obvezni vrednosti. |
| V. Determinističen scheduler | ➖ ni v obsegu, delno | 001 nima načrtovanih akcij. Velja pa točka V.4: prikazani časi meritev se računajo v `Europe/Ljubljana`, nikoli prek `toISOString().split("T")[0]`. Osveževanje predpomnilnika je pull ob zahtevi z TTL, ne časovnik v pomnilniku. |
| VI. Nobene neverificirane akcije | ➖ ni v obsegu | 001 ne izvaja nobene akcije na tujem sistemu. Ohrani pa se pravilo, da tiha napaka ni sprejemljiva: neuspeh pridobivanja vira se zabeleži in prikaže kot starost podatka (FR-026). |
| VII. Sistem pove, da je pokvarjen | ✅ nadgrajeno | Poleg `/api/v1/health` in zdravstvenih pregledov vsebnikov 001 **postavi tudi zunanji dead man's switch** (`HEALTHCHECK_PING_URL`) s srčnim utripom, čeprav scheduleria še ni. Namen je dokazati zunanjo alarmno pot, preden se 002 nanjo zanese. Utemeljitev v [research.md](./research.md) §5. |
| VIII. Vljudnost do zunanjih virov | ✅ | Vsak klic ARSO gre prek strežniškega predpomnilnika (radar 300 s, vreme 600 s), kar je usklajeno z `max-age=300` izvora. Odjemalec ne kliče ARSO nikoli. Navedba vira je funkcionalna zahteva FR-027, preverjena v E2E testu. |
| IX. Engine testabilen brez brskalnika | ➖ ni v obsegu | 001 ne uporablja Puppeteerja. Ohrani se vzorec: logika odločanja (ali je podatek zastarel, kaj prikazati ob izpadu) je čista funkcija, testirana brez omrežja in brez brskalnika. |
| X. Slovenščina v domeni, angleščina v kodi | ✅ | Naslovi zavihkov, besedila UI in obvestil so slovenski. Identifikatorji, polja API-ja, imena kolekcij in **poti** so angleški in verzionirani (`/api/v1/...`) — s tem je razrešeno odprto vprašanje iz poglavja A.3. |
| XI. Mobilna naprava je odjemalec | ✅ | Predpomnilnik, pridobivanje virov in odločitev o zastaranosti so na strežniku. Android prikazuje in prejema. Nobena funkcija 001 ne zahteva prižganega telefona. |
| XII. Meje | ➖ ni v obsegu | 001 ne posega v noben tuj sistem razen branja javnih podatkov ARSO z navedbo vira. |

### Kakovostna vrata

| Vrata | Kako se izpolnijo v 001 |
|---|---|
| 1. Čist `typecheck` in `lint`, brez `any` v domenski plasti | `strict: true` v vseh paketih; `@typescript-eslint/no-explicit-any` kot napaka v `apps/api/src/modules/**` in `platform/**`. |
| 2. Enotski testi domenske logike | Vrata v v1.1.0 zahtevajo štiri poimenske primere tam, kjer jih funkcionalnost vsebuje, odsotnost pa mora biti izrecno zapisana skupaj z nadomestili. **V 001 obstaja samo prvi** — prehod na poletni/zimski čas pri prikazu časa meritve. Praznik na delovni dan, dopust preko meje meseca in neuspel klik s ponovitvijo v 001 nimajo predmeta, ker ni schedulerja niti klikanja; pridejo z 002. **Nadomestila v 001:** zastaranje predpomnilnika, izpad vira, spremenjena struktura odgovora vira, zaznana ponovna uporaba obnovitvenega žetona, meje starosti predpomnilnika in odsotnost polja lastnika. |
| 3. Posodobljena in validna OpenAPI pogodba | [contracts/openapi.yaml](./contracts/openapi.yaml) nastane v tej fazi in je vhod za generiranje tipov; validnost je korak v CI. |
| 4. `docker compose up` iz čiste kopije | `infra/docker-compose.yml` + `.env` → delujoč sistem. Postopek in preverjanje v [quickstart.md](./quickstart.md). |
| 5. Nobenega niza, ki je videti kot skrivnost | Detektor skrivnosti kot blokirajoč korak; `.gitignore` že pokriva `.env`, ključe in keystore. |

**Izid vrat: prehod, brez odstopanj.** Vrata 2 so izpolnjena po pogojih iz ustave v1.1.0:
edini primer s predmetom v 001 ima test, odsotni trije so izrecno navedeni skupaj z
nadomestili, ki jih pokrijejo.

## Project Structure

### Documentation (this feature)

```text
specs/001-app-shell-dashboard/
├── plan.md              # This file (/speckit-plan command output)
├── spec.md              # Specifikacija funkcionalnosti
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── openapi.yaml     # Phase 1 output — pogodba 001
├── checklists/
│   └── requirements.md  # Iz /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks — ne nastane tukaj)
```

### Source Code (repository root)

```text
cleverdash/
├─ apps/
│  ├─ api/                          Node 22 + Express 5 + Mongoose 8
│  │  ├─ src/
│  │  │  ├─ modules/                en imenik na zavihek (člen I)
│  │  │  │  ├─ auth/                prijava, žetoni, geslo, obsegi
│  │  │  │  ├─ dashboard/           vreme, radar, napoved, ploščice (001)
│  │  │  │  └─ settings/            lokacija, tema, razporeditev, stikala zavihkov
│  │  │  ├─ platform/               skupno, brez odvisnosti na module
│  │  │  │  ├─ cache/               predpomnilnik zunanjih virov
│  │  │  │  ├─ notifications/       FCM, kanali, čiščenje žetonov
│  │  │  │  ├─ logging/             Pino, ID korelacije
│  │  │  │  ├─ idempotency/         Idempotency-Key middleware
│  │  │  │  ├─ apikeys/             X-API-Key z obsegi
│  │  │  │  ├─ health/              /health + zunanji srčni utrip
│  │  │  │  └─ config/              Zod shema okolja, zaustavitev ob manjku
│  │  │  ├─ domain/                 čiste funkcije: zastaranost, izbira prikaza
│  │  │  └─ main.ts
│  │  └─ tests/
│  │     ├─ unit/                   domain/ brez omrežja
│  │     ├─ contract/               Supertest proti openapi.yaml
│  │     └─ integration/            Mongo v vsebniku
│  └─ web/                          Ionic 8 + Angular 20
│     ├─ src/app/
│     │  ├─ core/                   auth, interceptorji, registar zavihkov
│     │  ├─ features/
│     │  │  ├─ dashboard/           ploščice vreme + radar
│     │  │  └─ settings/
│     │  └─ shared/
│     ├─ tests/
│     └─ android/                   Capacitor projekt (generiran)
├─ packages/
│  └─ contracts/                    tipi in Zod sheme, generirani iz openapi.yaml
├─ infra/
│  ├─ docker-compose.yml
│  ├─ docker-compose.dev.yml
│  ├─ Caddyfile
│  └─ mongo-init/
├─ .env.example
└─ specs/
```

**Structure Decision**: Monorepo iz poglavja A.2, prevzet brez sprememb. Modul zavihka
obstaja v dveh vzporednih drevesih (`apps/api/src/modules/<ime>` in
`apps/web/src/app/features/<ime>`), kar je cena tega, da sta strežnik in odjemalec ločeni
izvajalni okolji; člen I je s tem izpolnjen v obeh.

Dva dodatka glede na poglavje A.2, oba potrebna zaradi člena IX in vrat 1:

- `apps/api/src/domain/` — čiste funkcije brez odvisnosti na Express, Mongo ali omrežje.
  V 001 je tu logika zastaranosti predpomnilnika in izbire prikaza ob izpadu vira. V 002 se
  tu naseli logika odločanja schedulerja. Brez te ločnice bi bila "testabilna brez
  brskalnika" zgolj želja.
- `apps/api/src/platform/config/` — Zod shema okolja. Poglavje A.1 omenja Zod na robu;
  `docs/env-reference.md` §6 pa pokaže, zakaj mora biti okolje validirano ob zagonu:
  v starem sistemu je `SALT_ROUNDS` manjkal v `.env` in dal `NaN` globoko v izvajanju.

## Complexity Tracking

Odstopanje pri členu III, ki je bilo v prvi različici tega načrta zavedeno tukaj, **ni več
odstopanje**: ustava v1.1.0 je dobila izrecno izjemo za endpointe, ki izdajajo ali zavrtijo
žeton, skupaj s pogojem, da je izjema zapisana v pogodbi. Vrstica je zato odstranjena in
zahteva je zdaj izpolnjena v tabeli Constitution Check. Amandma je bil sprejet 19. 8. 2026 na
podlagi ugotovitve D1 iz `/speckit-analyze`.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Plast `platform/apikeys/` in `platform/idempotency/` nastane v 001, čeprav ju 001 skoraj ne potrebuje | Oboje je pogoj člena III in ju uporablja 002. Vgraditev pozneje bi posegla v avtentikacijsko varovalko vsakega že obstoječega modula — torej natanko v tisto sklopljenost, ki jo člen I prepoveduje. | Odlog na 002 bi pomenil, da 001 dostavi ogrodje, ki ogrodje ni. Cena zdaj je ena kolekcija in en middleware; cena pozneje je poseg v vse module. |
| Zunanji dead man's switch (`HEALTHCHECK_PING_URL`) se postavi v 001, čeprav ni schedulerja, ki bi tikal | Člen VII zahteva, da alarm pride od zunaj. Če se ta pot prvič preizkusi šele v 002, se preizkuša takrat, ko se že zanašamo nanjo. Srčni utrip strežnika je dovolj, da se pot dokaže. | Sam `/api/v1/health` ne zadošča po členu VII, ker mrtev proces ne pošilja obvestil — to je izrecno besedilo ustave, ne moja razlaga. |

## Constitution Re-Check (po Phase 1)

Ponovno ocenjeno po nastanku [research.md](./research.md), [data-model.md](./data-model.md),
[contracts/openapi.yaml](./contracts/openapi.yaml) in [quickstart.md](./quickstart.md).

**Izid: prehod, brez odstopanj.** Mehansko potrjeno: v pogodbi je 21 operacij (10 branj,
11 mutacij), in edini dve brez glave `Idempotency-Key` sta `POST /auth/login` in
`POST /auth/refresh` — natanko tisti dve, ki jih člen III v v1.1.0 izvzema. Izjema je pri obeh
poteh zapisana v pogodbi, kar je drugi pogoj člena.

Tri mesta, kjer je oblikovanje ustavno zahtevo **poostrilo**, ne le izpolnilo:

| Člen | Kaj je oblikovanje dodalo |
|---|---|
| VII | `GET /health` poroča tudi o stanju odhodnega srčnega utripa (`checks.heartbeat`), torej je vidno, ali zunanja alarmna pot sploh obstaja. Brez tega bi bil nenastavljen `HEALTHCHECK_PING_URL` neopazna luknja. |
| VIII | Navedba vira je polje `SourceMeta.attribution` v vsakem odgovoru s podatki ARSO, ne opravilo odjemalca. Za binarni radar je v glavi `X-Source-Attribution`. Navedba tako ne more izpasti zaradi pozabljenega dela na zaslonu (FR-027, SC-009). |
| IV | `.env` nosi ločeni `FCM_KEY_FILE` (pot na gostitelju) in `GOOGLE_APPLICATION_CREDENTIALS` (pot v vsebniku), zato `docker-compose.yml` ostane brez vsake prave vrednosti tudi pri montiranju ključa. |

Eno tveganje, ki ga oblikovanje ni odpravilo, ampak le zabeležilo: kolekcija `externalCache`
**ne sme imeti Mongo TTL indeksa**, ker je iztečen zapis natanko tisto, kar se prikaže ob
izpadu vira (FR-026). Napačna izvedba tega ne pokaže v testu s delujočim virom — pokaže se
šele v produkciji ob prvem izpadu. Zato ima svoj vnos v [research.md](./research.md) §13,
svoje opozorilo v [data-model.md](./data-model.md) in svojo vrstico v preverjanju
[quickstart.md](./quickstart.md) §4.2.
