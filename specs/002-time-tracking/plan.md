# Implementation Plan: Beleženje časa

**Branch**: `002-time-tracking` (imenik funkcionalnosti; git veja je še `main`) | **Date**: 2026-08-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-time-tracking/spec.md`

**Podlaga**: poglavje A ("Skupna arhitektura") iz `nacrt/002-time-tracking/plan.md` je že
uveljavljeno v [specs/001-app-shell-dashboard/plan.md](../001-app-shell-dashboard/plan.md)
in v dejansko postavljenem sistemu. Ta načrt ga ne ponavlja, ampak gradi na njem: modul
`time-tracking` je nov zavihek v obstoječem ogrodju (člen I), ne nova aplikacija. Poglavje
B ("Beleženje časa — sestava") iz istega vhodnega dokumenta je osnova za razdelke spodaj,
prilagojena dejanskemu stanju 001-ove kode (preverjeno branje, ne domneva).

## Summary

Dostavi zavihek, ki bere in po potrebi sam pritiska gumbe za evidenco delovnega časa pri
delodajalcu — vedno **preverjeno**, nikoli samo "sproženo". Jedro je `ClockPortal`, tanek
vmesnik z dvema operacijama (`readState`, `performAction`), za katerim stoji čista domenska
logika (stanje ure, koledar, raztros, prednost izjem), testabilna brez brskalnika (člen IX).
Nad njo: lenoben, dohitevajoč tik na 30 sekund namesto cron okna (odpravlja resen hrošč
starega sistema, `docs/legacy-engine.md` §4.2–4.3), `ActionExecutor` z verifikacijo po
vsakem kliku, `ReminderService` za način brez klikanja, in `CalendarService` s fiksno
prednostjo izjem (FR-014).

Tehnični pristop: nov modul `apps/api/src/modules/time-tracking/` in
`apps/web/src/app/features/time-tracking/`, po vzorcu iz 001. **Ne gradi na novo**, kar 001
že ima: avtentikacijo, obvestila (samo nove vrste in kanali), API ključe (samo novi
obsegi), idempotentnost, register zavihkov (en nov vnos), zunanji dead man's switch
(razširjen, ne podvojen). Nova skupna zmogljivost, ki je 001 ni potreboval: izhodni
webhooki (`platform/webhooks/`) in trajno beleženje obvestil (`platform/notifications/`,
nova kolekcija). Puppeteer + sistemski Chromium v Dockerju je edina nova infrastrukturna
odvisnost.

## Technical Context

**Language/Version**: TypeScript 5.x `strict: true`, Node.js 22 LTS — nespremenjeno iz 001.

**Primary Dependencies**: Puppeteer (najnovejša stabilna) + sistemski Chromium (novo za
002); Luxon (že odvisnost iz 001, `src/domain/timezone.ts` — ne uvaja se nova knjižnica za
čas); Zod, Mongoose 8, Express 5, Pino, `firebase-admin` (vse že iz 001, ponovno
uporabljeno brez sprememb).

**Storage**: MongoDB 7 (že iz 001). Nove kolekcije so naštete v [data-model.md](./data-model.md);
tri obstoječe (`devices`, `apiKeys`, `idempotencyKeys`) se ponovno uporabijo **brez**
spremembe sheme.

**Testing**: Vitest z `mongodb-memory-server` (že iz 001) za domensko logiko in kontrakt;
`FakeClockPortal` (nov, skriptirana zaporedja stanj) namesto pravega brskalnika za vse
enotske teste iz Kakovostnega vrata 2. Supertest za API pogodbo. En dodaten Playwright E2E
tok (Story 1: ročni pritisk in verifikacija na zaslonu "Danes"), enako omejen obseg kot
001-ov edini E2E tok.

**Target Platform**: enako kot 001 — Linux VPS v Dockerju, web kot nameščena PWA, Android
prek Capacitorja. Chromium teče **samo na strežniku** (znotraj API vsebnika); noben del
brskalniške avtomatizacije ne teče na napravi uporabnika (člen XI).

**Project Type**: enako kot 001 — monorepo z web/mobilnim odjemalcem in strežniškim
API-jem; ta funkcionalnost dodaja en modul, ne novo aplikacijo.

**Performance Goals**: Ročna izvedba akcije vrne potrjen izid v manj kot 10 s (SC-006).
Prvi ponovni poskus po neuspelem kliku v manj kot 2 min (SC-002). Zgodovinski pregled za
poljubni pretekli mesec v manj kot 3 s (SC-010). Tik traja bistveno manj kot svoj interval
(30 s), ker zaporedna obdelava akcij (FR-034) sicer zaostaja za samo seboj.

**Constraints**: En sam `ClockPortal` klic naenkrat na profil (FR-034 — brskalniška
avtomatizacija je edini vir tveganja za pravo evidenco). `shm_size`, `init: true` in
`mem_limit` na storitvi `api` (Chromium v Dockerju brez tega ni zanesljiv — research.md §2).
Vsi časi v `Europe/Ljubljana` (podedovano iz člena V in 001). `DRY_RUN=true` privzeto v
vsakem okolju razen produkcije (varovalka proti nenamernemu klikanju med razvojem). Sejni
piškotek delodajalca se nikoli ne vrne v celoti prek API-ja (FR-092).

**Scale/Scope**: še vedno enouporabniški sistem (podedovano iz 001, FR-016/FR-017) z
več urniškimi profili ene osebe. ~30 novih endpointov, 6 novih zaslonov
(Danes/Urnik/Koledar/Zgodovina/Diagnostika + razdelek v obstoječih Nastavitvah), ~14
kolekcij (10 novih + 4 ponovno uporabljene nespremenjene iz 001). Obremenitev ostaja
zanemarljiva; ozko grlo je brskalniška avtomatizacija (ena stran, eno okno na akcijo), ne
strežnik ali baza.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Ocenjeno proti `.specify/memory/constitution.md` **v1.1.0**, vseh 12 členov in 5
kakovostnih vrat. Za razliko od 001, kjer so bili členi V, VI, IX in XII "ni v obsegu", so
tukaj vsi neposredno naslovljeni — to je funkcionalnost, za katero so bili napisani.

| Člen | Stanje | Kako ga ta načrt izpolni |
|---|---|---|
| I. Zavihek je modul | ✅ | `modules/time-tracking/` + `features/time-tracking/`, en nov vnos v `platform/tabs/registry.ts` (`order: 5`). Domenska logika v `apps/api/src/domain/`, brez odvisnosti na Mongoose ali Puppeteer — glej [research.md](./research.md) §10. Skupne zmogljivosti (obvestila, webhooki, idempotentnost, API ključi) se uporabljajo prek `platform/`, ne podvajajo. |
| II. Enotni izvor | ✅ | Nove poti so pod `/api/v1/time-tracking/*`, isti Caddy in isti Express app kot 001. Brez novih `cors()` klicev, brez nove poddomene. |
| III. API-first | ✅ | Pogodba OpenAPI 3.1 v tej fazi ([contracts/openapi.yaml](./contracts/openapi.yaml)), validirana z 0 napak. Vsi mutacijski endpointi sprejemajo `Idempotency-Key` prek **istega** `platform/idempotency/middleware.ts` iz 001 — noben endpoint 002 ne izdaja ali vrti žetonov, zato izjema iz člena III (za `auth/login`, `auth/refresh`) tukaj sploh ni relevantna; nobena nova izjema se ne uvaja. `X-API-Key` z novimi obsegi, isti mehanizem kot 001. |
| IV. Nobene skrivnosti | ✅ | Sejni piškotek delodajalca je v bazi (`remoteSessions.cookieValue`), ne v okolju in ne v gitu — glavni razlog premika je prav to, da menjava ne zahteva ponovnega zagona (`docs/env-reference.md` §1). Firebase ključ ostaja montirana datoteka iz 001, brez sprememb. |
| V. Determinističen scheduler | ✅ | Baza (`plannedActions`) je edini vir resnice, ne časovnik v pomnilniku. Unikatni indeks `(localDate, profileId, actionName)` fizično onemogoči podvojen zagon (odpravlja `docs/legacy-engine.md` §4.3). Restart kadarkoli dohiti zapadle akcije (FR-062, Story 10) namesto da izgubi dan. Vsi časi `Europe/Ljubljana`, koledarski dan je ločen niz, nikoli `toISOString().split("T")[0]` (research.md §4). |
| VI. Nobene neverificirane akcije | ✅ | Vsak poskus zabeleži čas, izid, stanje pred/po, posnetek zaslona ob napaki (FR-032). Neuspeh se ponovi z zamikom; po izčrpanih poskusih uporabnik dobi obvestilo (FR-043) — nikoli tiha napaka (odpravlja `docs/legacy-engine.md` §4.5, kjer je funkcija vračala `true` ne glede na izid). |
| VII. Sistem pove, da je pokvarjen | ✅ razširjeno | `GET /health` iz 001 se razširi (ne podvoji) z `schedulerLastTickAgeSeconds`, stanjem brskalnika in seje(-j) — glej [contracts/openapi.yaml](./contracts/openapi.yaml) `HealthExtension`. Isti zunanji dead man's switch iz 001 zdaj prejme ping ob vsakem 30-sekundnem tiku namesto na svojem ločenem 60-sekundnem intervalu (research.md §8). Poteklost seje se aktivno spremlja in opozori vsaj 7 dni prej (FR-063) — odpravlja `docs/legacy-engine.md` §4.10, kjer je star sistem potekel piškotek hranil, a nikoli preveril. |
| VIII. Vljudnost do zunanjih virov | ✅ | Branje stanja je predpomnjeno (`cacheSeconds`, privzeto 60) — brskalniška avtomatizacija ni brezplačna kot ARSO klic, zato je predpomnjenje tu še pomembnejše. Slovenski prazniki se pridobijo enkrat na leto, ne kot odvisnost med izvajanjem (research.md §5). Avtomatizacija uporablja **obstoječo** sejo uporabnika in ne obide nobenega mehanizma delodajalca (glej člen XII spodaj). |
| IX. Engine testabilen brez brskalnika | ✅ | `ClockPortal` je edina infrastrukturna odvisnost domenske plasti; `FakeClockPortal` poganja vseh 15 enotskih primerov iz Kakovostnega vrata 2 (glej [quickstart.md](./quickstart.md) §4), brez omrežja in brez pravega Chromiuma. `dry-run` način je obvezen (FR-035). |
| X. Slovenščina v domeni, angleščina v kodi | ✅ | Imena akcij (`Prijava na delo`, `Malica` …) so slovenska domenska besedila, ki se NE prevajajo — brati jih je treba z žive strani, ne trdo kodirati (FR-021). Identifikatorji, polja API-ja, imena kolekcij in poti (`/time-tracking/...`) so angleški. |
| XI. Mobilna naprava je odjemalec | ✅ | Vse načrtovanje, izvajanje in Chromium tečejo na strežniku. Android/web samo prikazujeta stanje (zaslon "Danes") in prejemata obvestila. Nobena funkcija ni odvisna od prižgane, na omrežju dosegljive naprave — restart telefona sredi dneva ne vpliva na urnik. |
| XII. Meje | ✅ | Avtomatizacija uporablja izključno obstoječo sejo uporabnika (podedovan piškotek), pritiska iste gumbe, ki bi jih uporabnik pritisnil sam, ob dogovorjenem času — nič ne zaobide. Ni mehanizma za vpis časa, ki se ni zgodil (verifikacija po vsakem kliku to fizično prepreči — brez potrjene spremembe stanja zapis ni `succeeded`). Nič ne prikriva avtomatizacije pred delodajalcem: gre za isto stran, isto sejo, iste gumbe. Če delodajalec kdaj uvede CAPTCHA ali podoben mehanizem, `AUTO` ni dovoljeno obiti — ostane samo `REMIND_ONLY` (izrecno besedilo ustave, ne implementacijska izbira). |

### Kakovostna vrata

| Vrata | Kako se izpolnijo v 002 |
|---|---|
| 1. Čist `typecheck` in `lint`, brez `any` v domenski plasti | Enako pravilo kot 001, razširjeno na `modules/time-tracking/` in nov `domain/` kodo (koledar, stanje ure, raztros). |
| 2. Enotski testi domenske logike | **Vseh štirih poimenskih primerov je predmet v 002** (za razliko od 001, kjer trije niso imeli predmeta): prehod na poletni/zimski čas (§4 research.md), praznik na delovni dan (Story 5), dopust preko meje meseca (Story 6), neuspel klik s ponovitvijo (Story 3). Vseh 15 primerov iz [quickstart.md](./quickstart.md) §4 gre v `tasks.md` kot ločene naloge z `FakeClockPortal`. |
| 3. Posodobljena in validna OpenAPI pogodba | [contracts/openapi.yaml](./contracts/openapi.yaml) — validirano z `@redocly/cli lint`, 0 napak (26 nezavezujočih opozoril o manjkajočih 4xx odzivih na nekaterih `GET`/`POST 201` poteh in o namerno neuporabljeni `HealthExtension`, enak razred opozoril kot je bil sprejemljiv v 001). |
| 4. `docker compose up` iz čiste kopije | Zahteva tri spremembe obstoječega `infra/docker-compose.yml` in `infra/api.Dockerfile` (`shm_size`, `init`, `mem_limit`, sistemski Chromium) — glej Complexity Tracking spodaj, ker gre za spremembo skupne infrastrukture, ne izolirano v modul. |
| 5. Nobenega niza, ki je videti kot skrivnost | Enako kot 001 — nova skrivnost je samo `GOOGLE_APPLICATION_CREDENTIALS` pot, ki že obstaja; sejni piškotek delodajalca gre v bazo, ne v `.env` ali git (glej člen IV zgoraj). |

**Izid vrat (pred Phase 0): prehod, brez odstopanj**, s tremi elementi, ki gredo v
Complexity Tracking, ker posegajo v skupno infrastrukturo iz 001, ne samo v nov modul.

## Project Structure

### Documentation (this feature)

```text
specs/002-time-tracking/
├── plan.md              # This file (/speckit-plan command output)
├── spec.md              # Specifikacija funkcionalnosti
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── openapi.yaml     # Phase 1 output — dodatki k pogodbi 001
├── checklists/
│   └── requirements.md  # Iz /speckit-specify + /speckit-clarify
└── tasks.md             # Phase 2 output (/speckit-tasks — ne nastane tukaj)
```

### Source Code (repository root)

```text
cleverdash/
├─ apps/
│  ├─ api/
│  │  ├─ src/
│  │  │  ├─ modules/
│  │  │  │  ├─ auth/                (001, nespremenjeno)
│  │  │  │  ├─ dashboard/           (001, nespremenjeno)
│  │  │  │  ├─ settings/            (001, nespremenjeno)
│  │  │  │  └─ time-tracking/       NOVO — člen I
│  │  │  │     ├─ models/           trackingProfile, trackingLocation, remoteSession,
│  │  │  │     │                    plannedAction, actionAttempt, actionRecord,
│  │  │  │     │                    holiday, absencePeriod, calendarDay, calendarOverride
│  │  │  │     ├─ services/         scheduleBuilder, actionExecutor, reminderService,
│  │  │  │     │                    calendarService, sessionMonitor
│  │  │  │     ├─ clock-portal/     ClockPortal vmesnik, PuppeteerClockPortal, FakeClockPortal
│  │  │  │     ├─ scheduler.ts      tik na SCHEDULER_TICK_SECONDS (research.md §3, §8)
│  │  │  │     └─ router.ts
│  │  │  ├─ platform/               skupno, brez odvisnosti na module (001 + dodatki)
│  │  │  │  ├─ notifications/       (001) + `notification-record.model.ts` NOVO (FR-072)
│  │  │  │  ├─ webhooks/            NOVO — endpoint.model, delivery.model, dispatcher (FR-083)
│  │  │  │  ├─ health/              (001) — `router.ts` razširjen s poljih iz HealthExtension
│  │  │  │  ├─ apikeys/, idempotency/, auth/, config/, db/, logging/, errors/, tabs/, cache/, http/  (001, nespremenjeno v shemi; `config/env.ts` in `auth/scopes.ts` razširjena z novimi vrednostmi)
│  │  │  ├─ domain/
│  │  │  │  ├─ freshness.ts, timezone.ts   (001, nespremenjeno)
│  │  │  │  ├─ clock-state.ts       NOVO — izpeljava stanja iz razpoložljivih akcij (research.md §1)
│  │  │  │  ├─ calendar.ts          NOVO — prednost izjem (FR-014)
│  │  │  │  └─ scheduling.ts        NOVO — raztros, dejanski čas, DST robovi
│  │  │  └─ main.ts                 dodan `timeTrackingRouter.use(...)` in `startScheduler(...)`
│  │  └─ tests/
│  │     ├─ unit/                   + clock-state, calendar, scheduling (FakeClockPortal)
│  │     ├─ contract/               + Supertest proti openapi.yaml (002)
│  │     └─ integration/            + Mongo v vsebniku, scheduler tik end-to-end
│  └─ web/
│     ├─ src/app/
│     │  ├─ core/                   (001, nespremenjeno)
│     │  ├─ features/
│     │  │  ├─ dashboard/, settings/   (001) — settings dobi nov razdelek "Beleženje časa" (lokacije, seja)
│     │  │  └─ time-tracking/       NOVO
│     │  │     ├─ today/            zaslon "Danes"
│     │  │     ├─ schedule/         zaslon "Urnik"
│     │  │     ├─ calendar/         zaslon "Koledar"
│     │  │     ├─ history/          zaslon "Zgodovina"
│     │  │     └─ diagnostics/      zaslon "Diagnostika"
│     │  └─ shared/                 (001, nespremenjeno)
│     └─ android/                   (001, generiran — brez sprememb za 002)
├─ packages/
│  └─ contracts/                    tipi in Zod sheme — razširjeno z generatorjem iz 002 openapi.yaml
├─ infra/
│  ├─ docker-compose.yml            SPREMENJENO — `shm_size`, `init`, `mem_limit` na `api`
│  ├─ api.Dockerfile                SPREMENJENO — sistemski Chromium (apt), glej research.md §2
│  └─ Caddyfile, mongo-init/        (001, nespremenjeno)
└─ specs/
```

**Structure Decision**: Monorepo iz 001, prevzet brez sprememb strukture. `time-tracking`
je nov modul v obeh drevesih (`apps/api/src/modules/` in `apps/web/src/app/features/`),
enako kot `dashboard` in `settings` — člen I je s tem izpolnjen dosledno. Edine spremembe
**obstoječih** datotek so: `platform/tabs/registry.ts` (en nov vnos), `platform/config/env.ts`
(razširjena shema, glej research.md §14), `platform/auth/scopes.ts` (novi obsegi),
`main.ts` (ena vrstica za usmerjanje, ena za zagon schedulerja), `infra/docker-compose.yml`
in `infra/api.Dockerfile` (Chromium). Nič od tega ne posega v notranjost `modules/auth/`,
`modules/dashboard/` ali `modules/settings/`.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

Nobenega odstopanja od ustave ni. Spodnji vnosi niso kršitve — so posegi v **skupno**
infrastrukturo iz 001 (ne izolirani v nov modul), ki jih je treba eksplicitno utemeljiti po
enakem vzorcu, kot je 001 utemeljila svoja dva posega v `platform/`.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `infra/docker-compose.yml` se spremeni (ne samo doda nova storitev) | Chromium v Dockerju brez `shm_size: 1gb` in `init: true` na storitvi `api` ni zanesljiv — to je vzrok najpogostejše napake starega sistema ("gumb se včasih ne pritisne", `docs/legacy-engine.md` §Prenesi). `infra/api.Dockerfile` že namesti Chromium (001 je to predvidel); manjkata le `fonts-liberation` in `ca-certificates` (research.md §14) — eno-vrstični dodatek, ne nova faza gradnje. Gre za spremembo obstoječe storitve `api`, ne novo storitev, ker je Chromium del istega procesa kot Express (ista slika, isti vsebnik). | Ločena "brskalniška" mikrostoritev bi rešila izolacijo pomnilnika, a bi dodala HTTP klic v vsak `readState`/`performAction`, nov protokol napak in operativno površino za sistem z nekaj klici na dan. Cena zdaj (tri nastavitve v obstoječi composeu) je manjša od cene ločevanja procesov za to obremenitev. |
| `platform/config/env.ts` se razširi z ~13 novimi spremenljivkami | `.env.example` jih je 001 že predvidel ("za 002"), a Zod shema jih ne validira — brez tega bi manjkajoča ali napačna vrednost tiho pripeljala do `undefined` globoko v Puppeteer klicu, natanko napaka, ki jo je 001 samo zase že odpravila (`docs/env-reference.md` §6, `SALT_ROUNDS` → `NaN`). | Validacija znotraj `modules/time-tracking/` bi razdvojila eno logično shemo okolja na dve mesti in dopustila, da en modul zaobide preverjanje, ki ga drugi vsiljuje — natanko sklopljenost, ki jo enotna shema `loadEnv()` iz 001 preprečuje. |
| `platform/notifications/` dobi novo kolekcijo (`notificationRecords`) in `platform/` dobi nov razdelek `webhooks/` | FR-072/FR-073 (trajno beleženje dostave, brez podvojenih obvestil) in FR-083 (izhodni webhooki) sta splošni zmogljivosti, verjetni za ponovno uporabo v 003, ne last časovnega beleženja. Umestitev v `modules/time-tracking/` bi pomenila, da bi 003 podvojil isto logiko namesto je uvozil prek `platform/` — natanko to člen I prepoveduje. | Umestitev v modul bi bila hitrejša zdaj, a bi 003 prisilila v izbiro med podvajanjem kode in uvozom neposredno iz `modules/time-tracking/`, kar člen I izrecno prepoveduje ("moduli se ne smejo klicati med sabo neposredno"). |

## Constitution Re-Check (po Phase 1)

Ponovno ocenjeno po nastanku [research.md](./research.md), [data-model.md](./data-model.md),
[contracts/openapi.yaml](./contracts/openapi.yaml) in [quickstart.md](./quickstart.md).

**Izid: prehod, brez odstopanj.** Mehansko potrjeno: pogodba 002 dodaja 30 operacij pod
`/time-tracking/*`, mutacijski endpointi (`POST`/`PUT`/`PATCH`) sprejemajo
`Idempotency-Key` prek istega parametra kot 001 — noben endpoint 002 ne izdaja
žetonov, zato izjema iz člena III sploh ni relevantna in se ne razteza. Pogodba je
validirana z 0 napak (26 nezavezujočih opozoril o manjkajočih 4xx odzivih in o namerno
neuporabljeni `HealthExtension`).

Tri mesta, kjer je oblikovanje ustavno zahtevo **poostrilo**, ne le izpolnilo:

| Člen | Kaj je oblikovanje dodalo |
|---|---|
| V | Unikatni indeks `(localDate, profileId, actionName)` v [data-model.md](./data-model.md) ni samo dokumentiran kot pravilo — je edini mehanizem, ki fizično onemogoči podvojen zapis, ne glede na to, koliko instanc tika teče vzporedno (ne samo "en tik naenkrat" po dogovoru). |
| VII | `Heartbeat` postane persistentna kolekcija (TTL 14 dni), ne le modulska spremenljivka v pomnilniku (kot je bila v 001) — zdravstveni endpoint tako lahko poroča `schedulerLastTickAgeSeconds` tudi takoj po restartu API procesa, preden je nov tik sploh minil. |
| XII | Verifikacija po izvedbi (FR-030, `ActionResult.verified`) ni samo zapisano pravilo, ampak tip: `ActionResult.verified` je obvezno polje (`required`), ne opcijsko — pogodba fizično ne dovoli odgovora, ki bi trdil uspeh brez izrecne potrditve. |

Eno tveganje, ki ga oblikovanje ni odpravilo, ampak le zabeležilo (research.md §14): dokler
`platform/config/env.ts` ne validira novih spremenljivk okolja, njihova prisotnost v
`.env.example` ustvarja **lažen občutek varnosti** — videti je, kot da so pokrite, dejansko
pa napačna vrednost obtiho pade skozi. To je prva naloga Foundational faze v `tasks.md`,
namerno pred katero koli uporabniško zgodbo.
