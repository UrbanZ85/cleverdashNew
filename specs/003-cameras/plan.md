# Implementation Plan: Zavihek kamer

**Branch**: `003-cameras` (imenik funkcionalnosti; git veja je še `main`) | **Date**: 2026-08-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-cameras/spec.md`

**Podlaga**: skupna arhitektura iz [specs/001-app-shell-dashboard/plan.md](../001-app-shell-dashboard/plan.md)
je že postavljena in dejansko preverjena v kodi (ne domneva) — glej [research.md](./research.md)
§1 za natančen popis, kaj od te infrastrukture 003 ponovno uporabi brez sprememb. Ta načrt
gradi na njej enako, kot je 002 zgradila na 001: `cameras` je nov zavihek v obstoječem
ogrodju (člen I), ne nova aplikacija.

## Summary

Dostavi zavihek, ki prikaže mrežo živih predogledov kamer (javni spletni viri — ipcamlive,
YouTube, istrastream, ARSO webcam) in lasten zaslon za urejanje, prek katerega uporabnik
dodaja, ureja in briše kamere brez posega v kodo — vključno s kamerami, ki so v resnici
vdelava tuje strani (embed). Jedro dela je **skoraj v celoti ponovna uporaba** obstoječe
001 infrastrukture: `platform/cache` (predpomnjen, vljuden proxy do zunanjega vira,
`getOrRefresh`) in `domain/freshness.ts` (izpeljava "v redu/staro/nedosegljivo") že rešujeta
FR-011, FR-020, FR-021 brez nove kode — enako, kot že rešujeta te zahteve za ARSO
radar/vreme. Resnično nov del je: domenska logika kamer (validacija naslova, razvrstitev po
času dneva, izpeljava efektivnega seznama dovoljenih gostiteljev), varna komponenta za
vdelavo tuje strani (odprava hrošča `bypassSecurityTrustHtml` iz starega CleverDasha), in
majhna, a resnična nova infrastruktura: šifriranje poverilnic (`platform/crypto/`) ter
premik ARSO vremenskega odjemalca iz `modules/dashboard/` v skupen `platform/arso/`, ker ga
zdaj potrebujeta dva modula.

Tehnični pristop: nov modul `apps/api/src/modules/cameras/` in
`apps/web/src/app/features/cameras/`, po vzorcu iz 001/002. **Ne gradi na novo**, kar 001 že
ima: avtentikacijo, `platform/cache`, `platform/idempotency`, register zavihkov (en nov
vnos), API ključe (samo nov obseg). Za razliko od 002 (Puppeteer, Chromium v Dockerju,
scheduler) 003 **ne potrebuje nobene infrastrukturne spremembe** v
`infra/docker-compose.yml` ali `infra/api.Dockerfile` — vsi zunanji viri so navaden HTTP/S,
proxy je preprost `fetch()`, ne brskalnik.

## Technical Context

**Language/Version**: TypeScript 5.x `strict: true`, Node.js 22 LTS — nespremenjeno iz
001/002.

**Primary Dependencies**: Zod, Mongoose 8, Express 5, Pino (vse že iz 001, ponovno
uporabljeno brez sprememb). Novo na frontendu: `hls.js` (predvajanje `.m3u8` zunaj
Safarija/iOS — glej research.md §15) in `@capacitor/network` (zaznava mobilnega omrežja,
Story 7 — isti vzorec kot `@capacitor/push-notifications`). Brez novih odvisnosti na
backendu — proxy uporablja vgrajen `fetch()`, brez brskalnika ali Puppeteerja (v nasprotju z
002).

**Storage**: MongoDB 7 (že iz 001). Nove kolekcije: `cameras`, `cameraGroups`,
`cameraEmbedAllowlist` (glej [data-model.md](./data-model.md)). Ponovno uporabljeno **brez**
spremembe sheme: `ExternalCache` (nov ključni prostor `camera:{id}:preview`, poleg že
obstoječih `radar`/`weather:{location}`). En nov, opcijski del sheme na obstoječem `Settings`
singletonu: `cameraDataSaverEnabled`.

**Testing**: Vitest (že iz 001/002) za domensko logiko in kontrakt — brez potrebe po
`mongodb-memory-server` za večino testov, ker je domenska logika kamer čista (validacija
naslova, razvrstitev po času dneva, izpeljava zdravja) in ne dostopa do baze neposredno.
Supertest za API pogodbo. En Playwright E2E tok (Story 3: dodaj kamero prek UI-ja in preveri,
da se pojavi v mreži brez ponovnega nalaganja) — enako omejen obseg kot edini E2E tok v
001/002, izbran po enakem načelu kot v 002 (P1 ni nujno "prvi po prioriteti", ampak tisti, ki
najbolj neposredno dokaže obljubo iz uporabnikove zahteve, glej Summary).

**Target Platform**: enako kot 001/002 — Linux VPS v Dockerju, web kot nameščena PWA,
Android prek Capacitorja. Noben del te funkcionalnosti ne teče v brskalniku na strežniku
(člen XI je tu brezpredmeten v enakem pomenu kot v 002 — ni brskalniške avtomatizacije;
edina "naprava kot odjemalec" skrb je Story 7, mobilni podatkovni prihranek, ki je v celoti
odjemalčeva odločitev).

**Project Type**: enako kot 001/002 — monorepo z web/mobilnim odjemalcem in strežniškim
API-jem; ta funkcionalnost dodaja en modul, ne novo aplikacijo.

**Performance Goals**: mreža z vsemi aktivnimi kamerami v manj kot 2 s (SC-001). Dodajanje
kamere vidno v mreži v manj kot 2 min, brez builda (SC-002). Urejanje/brisanje odraženo v
manj kot 5 s (SC-003). Delež neopaženih nedosegljivih kamer je nič (SC-004).

**Constraints**: proxy ne posreduje poljubnega naslova — samo naslove nastavljenih kamer,
naslovljene po ID-ju (FR-023). Vsi viri `https`, razen obveznega proxyja za `http`/
poverilnice/lokalno omrežje (FR-020, FR-024). Vdelava tuje strani samo za gostitelje na
efektivnem seznamu dovoljenih (FR-022, research.md §6). Poverilnice šifrirane na disku,
nikoli vrnjene prek API-ja (FR-005, research.md §14). Brez brisanja `ExternalCache` po
izteku TTL (podedovano iz 001 — obratovalna zahteva, ne izbira te funkcionalnosti).

**Scale/Scope**: enouporabniški sistem (podedovano iz 001, FR-016/FR-017; potrjeno v spec.md
FR-038). ~15 novih endpointov (glej [contracts/openapi.yaml](./contracts/openapi.yaml)), en
nov zavihek z mrežo, celozaslonskim prikazom in zaslonom za urejanje, 3 nove kolekcije + 1
razširjeno polje na obstoječem `Settings`. Pričakovano nekaj deset kamer največ — obremenitev
je zanemarljiva, ozko grlo (če sploh) je hitrost zunanjih virov, ne strežnik ali baza.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Ocenjeno proti `.specify/memory/constitution.md` **v1.1.0**, vseh 12 členov in 5 kakovostnih
vrat. Za razliko od 002 (kjer so bili vsi členi neposredno naslovljeni), so tukaj členi V, VI,
IX, XI in XII (v svoji dobesedni obliki — scheduler, brskalniška avtomatizacija) **brez
predmeta**: 003 ne razporeja po koledarju in ne klika ničesar na tuji strani, samo bere
javne vire. To je izrecno zapisano, ne tiho izpuščeno (glej tudi Kakovostno vrato 2 spodaj).

| Člen | Stanje | Kako ga ta načrt izpolni |
|---|---|---|
| I. Zavihek je modul | ✅ | `modules/cameras/` + `features/cameras/`, en nov vnos v `platform/tabs/registry.ts` (`order: 7`, research.md §12). Domenska logika (validacija naslova, razvrstitev po času dneva, izpeljava zdravja) v `apps/api/src/domain/`, brez odvisnosti na Mongoose ali `fetch` — testabilna brez baze (research.md §8, quickstart.md §4). `platform/arso/` (premik iz `modules/dashboard/`) in `platform/crypto/` sta nova skupna mehanizma, ne last modula `cameras` — glej Complexity Tracking. |
| II. Enotni izvor | ✅ | Nove poti so pod `/api/v1/cameras/*` in `/api/v1/camera-groups/*`, isti Caddy in isti Express app kot 001/002. Brez novih `cors()` klicev, brez nove poddomene. |
| III. API-first | ✅ | Pogodba OpenAPI 3.1 v tej fazi ([contracts/openapi.yaml](./contracts/openapi.yaml)). Vsi mutacijski endpointi sprejemajo `Idempotency-Key` prek **istega** `platform/idempotency/middleware.ts` iz 001/002 — noben endpoint 003 ne izdaja ali vrti žetonov, izjema iz člena III zanj ni relevantna. `X-API-Key` z novimi obsegi `cameras:read`/`cameras:write` (research.md §10), isti mehanizem kot 001/002. |
| IV. Nobene skrivnosti | ✅ poostreno | Camera poverilnice so šifrirane na disku (`credentialsEncrypted`, AES-256-GCM prek `platform/crypto/secret-box.ts`, ključ iz okolja) — strožje od obstoječega 002 vzorca (`remoteSessions.cookieValue` je nešifriran, samo izpuščen iz API odgovorov), ker spec.md FR-005 to izrecno zahteva (research.md §14). `CREDENTIALS_ENCRYPTION_KEY` gre skozi `platform/config/env.ts` kot vsaka druga skrivnost, nikoli v kodo ali git. |
| V. Determinističen scheduler | brez predmeta | 003 ne uvaja nobenega časovno vodenega tika ali `plannedAction`-podobne entitete — osveževanje predogledov je odjemalčevo, ne strežniško razporejeno. Edina "časovna" logika (razvrstitev po času dneva, FR-004) je izpeljava ob branju, ne shranjeno stanje, in uporablja isto `Europe/Ljubljana` časovno cono (research.md §8, `domain/timezone.ts`, ponovna uporaba brez sprememb). |
| VI. Nobene neverificirane akcije | brez predmeta | 003 ne klikne ničesar na tuji strani — samo bere (GET) javne vire. Ni "akcije", ki bi jo bilo treba verificirati po izvedbi. |
| VII. Sistem pove, da je pokvarjen | ✅ | Vsaka kamera ima izpeljano zdravje (FR-011, `GET /cameras/{id}/health`) iz istega `resolveFreshness()` mehanizma, ki že poganja diagnostiko za ARSO — nedosegljiva kamera je vidna v UI-ju, ne tiho prazna ploščica (SC-004). 003 ne razširja `/health` iz 001 (v nasprotju s 002) — kamere niso del "je sistem živ", so zunanji viri, ki jih člen VIII že pokriva. |
| VIII. Vljudnost do zunanjih virov | ✅ | Vsak `snapshot` vir gre skozi `platform/cache` s TTL = `refreshIntervalSeconds` (privzeto `CAMERA_DEFAULT_REFRESH_SECONDS`) — ena kamera na več napravah ni več zahtev na vir (FR-021, research.md §3). ARSO webcam podatek se bere iz **istega** predpomnjenega zapisa, ki ga uporablja dashboard (001), brez dodatnega klica ARSO (research.md §2) — to je neposredna, dodatna izpolnitev tega člena, ne le podedovana. `Cache-Control` izvora se spoštuje (isti `getOrRefresh`, nespremenjen). ARSO podatki so prikazani z navedbo vira (že uveljavljeno v 001, ponovno uporabljeno za webcam predlogo). |
| IX. Engine testabilen brez brskalnika | ✅ (razširjen duh, ne dobesedno besedilo) | Člen dobesedno govori o 002-ovem `ClockPortal`u, a enako načelo velja tu: `domain/camera-validation.ts`, `domain/camera-ordering.ts` in izpeljava zdravja so čiste funkcije, testirane brez baze in brez omrežja (quickstart.md §4, 10 primerov). |
| X. Slovenščina v domeni, angleščina v kodi | ✅ | Imena kamer in skupin so prosto besedilo, ki ga vnese uporabnik (slovensko ali kakorkoli), ne trdo kodirano. Identifikatorji v kodi, polja API-ja in imena kolekcij (`cameras`, `cameraGroups`) so angleški. UI besedilo (mreža, obrazec za urejanje, opozorila o nedosegljivosti) je slovensko. |
| XI. Mobilna naprava je odjemalec | brez predmeta (dobesedno) | Ni planiranja na strežniku, ki bi ga naprava lahko motila. Story 7 (mobilni podatkovni prihranek) je edina napravno-specifična logika, in je **namenoma** odjemalčeva odločitev (interval osveževanja, samodejni zagon toka) — strežnik pošlje konfigurirane privzetke, odjemalec jih po potrebi lokalno podaljša (data-model.md, "Nastavitve porabe podatkov"). To ni kršitev člena — člen prepoveduje planiranje/izvajanje na napravi, ne odjemalčevo prilagajanje lastne porabe. |
| XII. Meje | brez predmeta | Ni avtomatizacije na tuji strani, ki bi lahko zaobšla CAPTCHA, MFA ali omejitve hitrosti — 003 samo bere javno dostopne vire. |

### Kakovostna vrata

| Vrata | Kako se izpolnijo v 003 |
|---|---|
| 1. Čist `typecheck` in `lint`, brez `any` v domenski plasti | Enako pravilo kot 001/002, razširjeno na `modules/cameras/`, `platform/arso/`, `platform/crypto/` in nov `domain/` kodo (validacija naslova, razvrstitev po času dneva). |
| 2. Enotski testi domenske logike | **Vsi štirje poimenski primeri (prehod na poletni/zimski čas, praznik na delovni dan, dopust preko meje meseca, neuspel klik s ponovitvijo) so brez predmeta v 003** — ni scheduler, ni klikanja (glej Constitution Check, členi V/VI zgoraj). To je izrecno zapisano tu, kot amandma h kakovostnemu vratu zahteva. **Nadomeščajo jih** primeri, specifični za domeno kamer: razvrstitev po času dneva pred/po poldnevu (2×), validacija naslova (neveljaven URL, nedovoljen gostitelj, http brez pogoja za proxy) (3×), prag "nedosegljivo" iz `consecutiveFailures` (1×), zdravje samostojnega `iframe` vrne `not-applicable`, ne napako (1×), preslikava vrstnega reda (1×), unija/omejitev efektivnega seznama dovoljenih gostiteljev (1×), skupaj 10 primerov — vsi našteti v [quickstart.md](./quickstart.md) §4 kot ločene naloge v `tasks.md`. |
| 3. Posodobljena in validna OpenAPI pogodba | [contracts/openapi.yaml](./contracts/openapi.yaml) — sintaktično preverjeno (`js-yaml`, vsi `$ref` se razrešijo, 12 poti, 9 shem). `@redocly/cli` v tem okolju ni nameščen (ni omrežnega dostopa za namestitev med to sejo) — prva naloga faze polirovanja v `tasks.md` MORA pognati `npx @redocly/cli lint` v CI/razvoju, preden se to vrato šteje za dokončno izpolnjeno. |
| 4. `docker compose up` iz čiste kopije | **Brez sprememb** `infra/docker-compose.yml` ali `infra/api.Dockerfile` — ni novih sistemskih odvisnosti (v nasprotju s 002 in njenim Chromiumom). Edina sprememba je `.env`/`.env.example` (5 novih spremenljivk, research.md §13/§14) in `platform/config/env.ts`. |
| 5. Nobenega niza, ki je videti kot skrivnost | Nova skrivnost je `CREDENTIALS_ENCRYPTION_KEY` — gre skozi `platform/config/env.ts`, ne v kodo ali git. Camera poverilnice v bazi so šifrirane (ne golo besedilo kot pri 002-ovem `cookieValue`) — glej člen IV zgoraj. |

**Izid vrat (pred Phase 0): prehod, brez odstopanj**, z dvema elementoma v Complexity
Tracking spodaj, ker posegata v skupno infrastrukturo (premik ARSO odjemalca, nov
`platform/crypto/`), ne samo v izoliran nov modul.

## Project Structure

### Documentation (this feature)

```text
specs/003-cameras/
├── plan.md              # This file (/speckit-plan command output)
├── spec.md              # Specifikacija funkcionalnosti
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── openapi.yaml     # Phase 1 output
├── checklists/
│   └── requirements.md  # Iz /speckit-specify
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
│  │  │  │  ├─ dashboard/           (001) — `clients/arso-weather.client.ts` PREMAKNJEN v `platform/arso/` (glej spodaj); `mappers/weather.mapper.ts` nespremenjen
│  │  │  │  ├─ settings/            (001) — `router.ts` razširjen z `cameraDataSaverEnabled` (eno polje)
│  │  │  │  ├─ time-tracking/       (002, nespremenjeno)
│  │  │  │  └─ cameras/             NOVO — člen I
│  │  │  │     ├─ models/           camera.model, camera-group.model, camera-embed-allowlist.model
│  │  │  │     ├─ services/         camera-proxy.service (snapshot + stream), embed-allowlist.service
│  │  │  │     ├─ scopes.ts         CAMERA_SCOPES (research.md §10)
│  │  │  │     └─ router.ts
│  │  │  ├─ platform/               skupno, brez odvisnosti na module (001/002 + dodatki)
│  │  │  │  ├─ cache/               (001, NESPREMENJENO) — `getOrRefresh` dobi nov ključni prostor `camera:*:preview`, brez spremembe kode
│  │  │  │  ├─ arso/                NOVO — `weather.client.ts` PREMAKNJEN iz `modules/dashboard/clients/` (research.md §2), dopolnjen z `webcam` poljem
│  │  │  │  ├─ crypto/              NOVO — `secret-box.ts`, AES-256-GCM (research.md §14)
│  │  │  │  ├─ auth/, idempotency/, config/, db/, logging/, errors/, tabs/, http/, apikeys/, notifications/, webhooks/, health/  (001/002, nespremenjeno v shemi; `config/env.ts` razširjen z novimi vrednostmi; `tabs/registry.ts` dobi nov vnos; `auth/scopes.ts` NESPREMENJEN — vsebuje samo generično `requireScopes()`, obsegi so per-modulski, glej `modules/cameras/scopes.ts` zgoraj in research.md §10)
│  │  │  ├─ domain/
│  │  │  │  ├─ freshness.ts, timezone.ts, calendar.ts, clock-state.ts, scheduling.ts, coordinates.ts  (001/002, nespremenjeno)
│  │  │  │  ├─ camera-validation.ts  NOVO — validacija naslova (FR-034, research.md §6)
│  │  │  │  └─ camera-ordering.ts    NOVO — razvrstitev po času dneva (FR-004, research.md §8)
│  │  │  └─ main.ts                 dodan `camerasRouter.use(...)`, `cameraGroupsRouter.use(...)`
│  │  └─ tests/
│  │     ├─ unit/                   + camera-validation, camera-ordering, health-derivation (10 primerov, quickstart.md §4)
│  │     ├─ contract/               + Supertest proti openapi.yaml (003)
│  │     └─ integration/             + Mongo v vsebniku (predpomnjenje, embed allowlist)
│  └─ web/
│     ├─ src/app/
│     │  ├─ core/                   (001/002, nespremenjeno)
│     │  ├─ features/
│     │  │  ├─ dashboard/, settings/, time-tracking/  (001/002) — settings dobi nov razdelek "Kamere" (`cameraDataSaverEnabled`)
│     │  │  └─ cameras/             NOVO
│     │  │     ├─ grid/             mreža predogledov (Story 1, 6, 7)
│     │  │     ├─ viewer/           celozaslonski prikaz (Story 2), `embedded-camera.component.ts` (research.md §5)
│     │  │     └─ manage/           zaslon za urejanje — dodajanje/urejanje/brisanje (Story 3, 4), vrstni red (↑/↓ vzorec, research.md §7)
│     │  └─ shared/                 (001/002, nespremenjeno)
│     └─ android/                   (001, generiran — brez sprememb za 003)
├─ packages/
│  └─ contracts/                    razširjeno z generatorjem iz 003 openapi.yaml (nov ciljni vnos v `scripts/generate.ts`)
├─ infra/                           BREZ SPREMEMB — glej Kakovostno vrato 4 zgoraj
└─ specs/
```

**Structure Decision**: Monorepo iz 001, prevzet brez sprememb strukture. `cameras` je nov
modul v obeh drevesih, enako kot `dashboard`, `settings` in `time-tracking` — člen I je s
tem izpolnjen dosledno. Edine spremembe **obstoječih** datotek zunaj `modules/cameras/`:
`platform/tabs/registry.ts` (en nov vnos), `platform/config/env.ts` (razširjena shema),
`modules/settings/router.ts` (eno novo polje), `modules/dashboard/clients/` (datoteka
premaknjena, ne prepisana — dashboard uvozi novo lokacijo), `main.ts` (dve novi vrstici za
usmerjanje). `platform/auth/scopes.ts` se NE spremeni — vsebuje samo generično
`requireScopes()`, brez centralnega seznama obsegov po modulih (isti vzorec, po katerem je
002 obsege postavila v `modules/time-tracking/scopes.ts`, ne v `platform/auth/`); novi
`cameras:read`/`cameras:write` gresta v `modules/cameras/scopes.ts` (glej zgoraj). Nič od
tega ne posega v notranjost `modules/auth/`, `modules/time-tracking/` ali v `infra/`.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

Nobenega odstopanja od ustave ni. Spodnja dva vnosa niso kršitve — so posegi v **skupno**
infrastrukturo iz 001 (ne izolirani v nov modul), ki jih je treba eksplicitno utemeljiti po
enakem vzorcu, kot sta 001 in 002 utemeljili svoje posege v `platform/`.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `modules/dashboard/clients/arso-weather.client.ts` se premakne v `platform/arso/`, `modules/dashboard/` se spremeni, da uvozi novo lokacijo | ARSO webcam podatek (FR-037) je vsebovan v isti odgovoru, ki ga dashboard (001) že bere za vreme. Dva neodvisna klica istemu ARSO endpointu (en za vreme v `dashboard`, en za webcam v `cameras`) bi bila nevljudnost do zunanjega vira, ki jo člen VIII prepoveduje. Premik v `platform/` je edini način, da oba modula uporabita isti predpomnjen zapis brez neposrednega klica enega modula v drugega (kar bi kršilo člen I). | Podvojena koda/klic znotraj `modules/cameras/` bi bila hitrejša zdaj (nič se ne premika), a bi trajno podvojila HTTP klic na ARSO za isto lokacijo in isti podatek — natanko to, čemur se člen VIII izogiba. Klic modula `cameras` neposredno v `modules/dashboard/clients/` (brez premika) bi bil neposredna kršitev člena I ("moduli se ne smejo klicati med sabo neposredno"). |
| Nov `platform/crypto/secret-box.ts` namesto ponovne uporabe 002-ovega vzorca ("izpusti iz JSON, ne šifriraj na disku") | spec.md FR-005 izrecno zahteva, da so poverilnice kamere "shranjene šifrirano" — strožje od tega, kar `remoteSessions.cookieValue` v 002 dejansko počne. `/speckit-plan` ne sme spec.md tiho omiliti na obstoječi, šibkejši vzorec. Ker bo verjetno uporaben tudi za prihodnje funkcionalnosti s poverilnicami (npr. morebitne lastne kamere v domačem omrežju), sodi v `platform/`, ne v `modules/cameras/`. | Šifriranje samo znotraj `modules/cameras/` bi delovalo za to funkcionalnost, a bi prihodnjo funkcionalnost s podobno potrebo prisililo v izbiro med podvajanjem te šifrirne logike ali uvozom neposredno iz `modules/cameras/` — slednje bi bilo kršitev člena I. |

## Constitution Re-Check (po Phase 1)

Ponovno ocenjeno po nastanku [research.md](./research.md), [data-model.md](./data-model.md),
[contracts/openapi.yaml](./contracts/openapi.yaml) in [quickstart.md](./quickstart.md).

**Izid: prehod, brez odstopanj.** Mehansko potrjeno: pogodba 003 dodaja 12 poti pod
`/cameras*` in `/camera-groups*`, sintaktično veljavna (`js-yaml`), vseh 11 `$ref` kazalcev
se razreši, 9 komponentnih shem. Mutacijski endpointi (`POST`/`PUT`/`DELETE`) sprejemajo
`Idempotency-Key` prek istega parametra kot 001/002 — noben endpoint 003 ne izdaja žetonov,
izjema iz člena III ni relevantna.

Tri mesta, kjer je oblikovanje ustavno zahtevo **poostrilo**, ne le izpolnilo:

| Člen | Kaj je oblikovanje dodalo |
|---|---|
| IV | Poverilnice kamere niso samo izpuščene iz API odgovora (kot `remoteSessions.cookieValue` v 002) — so dejansko šifrirane na disku (`platform/crypto/secret-box.ts`). Pogodba (`Camera` shema) fizično ne vsebuje polja za dešifrirano vrednost — `hasCredentials: boolean` je edini signal, tip onemogoča nenamerno vrnitev. |
| VIII | ARSO webcam predloga (FR-037) ni samo "predpomnjena" — je oblikovana tako, da **ne doda** nobenega novega zunanjega klica (bere isti `ExternalCache` zapis kot dashboard), kar je stroga izpolnitev "vljudnosti", ne le zadostna. |
| VII | Zdravje kamere (`CameraHealthState`) je v pogodbi eksplicitno peto stanje `not-applicable`, ne le `unknown` — tip fizično razlikuje "še ni podatka" od "strežniško ni preverljivo" (samostojen `iframe`), kar UI-ju prepreči, da bi ju pomotoma obravnaval enako. |

Eno tveganje, ki ga oblikovanje ni odpravilo, ampak le zabeležilo (research.md §4): pravi
multipleksni proxy za zvezne tokove (`mjpeg`/`hls`) ni implementiran — vsak odjemalec odpre
svojo odhodno povezavo. Sprejemljivo, ker nobena danes znana kamera te poti ne uporablja;
prva naloga, če se kdaj pojavi taka kamera, ne pa arhitekturna sprememba zdaj.

Drugo, nezavezujoče opozorilo: `@redocly/cli lint` ni bil pognan v tej seji (orodje ni
nameščeno, brez omrežnega dostopa za namestitev) — sintaktična veljavnost je preverjena
(`js-yaml` + razrešitev vseh `$ref`), a polna shema-validacija (manjkajoči odzivi, formati)
še ni. To je prva naloga faze polirovanja v `tasks.md`, ne razlog za zavrnitev tega vrata.
