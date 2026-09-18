# Implementation Plan: Administratorska analitika

**Branch**: `014-admin-analytics` | **Spec**: [spec.md](spec.md)
**Input**: "Pregled diska — koliko recepti, slike in datoteke zasedejo skupno in na osebo. Vidijo samo admini. Ter statistika vpisov, katere zaslone pregledujejo in kolikokrat se prijavijo."

## Summary

Zavihek `analytics`, viden izključno osebam z obsegom `admin`, z dvema pregledoma: **poraba
prostora** (skupno, po vrsti vsebine, po osebi, plus razhajanja med diskom in bazo) in
**uporaba** (prijave, zadnja aktivnost, lestvica zavihkov). Pod njim ena nova zbirka dnevnih
števcev.

Funkcionalnost je po zgradbi drugačna od vseh prejšnjih in ta razlika je edino, kar je pri njej
res treba razumeti:

| dosedanji modul | ta modul |
|---|---|
| lasti svoje zapise | **nima nobenega svojega zapisa** — bere tuje |
| filtrira po `req.auth.subjectId` | bere **čez vse uporabnike** |
| podatke bere prek svojih modelov | tujih modelov **ne sme uvoziti** (člen I) |
| zapis pripada lastniku podatkov | telemetrija pripada **fizični osebi** (`req.actor`) |

Iz tega sledita dve odločitvi, ki nosita ves načrt:

1. **Telemetrija živi v `platform/usage/`, ne v modulu** (research.md §1). Prijave lahko prešteje
   samo tisti, ki jih vidi — to je `modules/auth/router.ts`, in uvoz iz modula v modul je lint
   napaka. Precedens je `platform/users/` (010): izbira osebe ni pojem opravil, štetje zavihkov
   ni pojem analitike.
2. **Analitika bere tuje zbirke po imenu, ne prek modelov** (research.md §2), prek
   `mongoose.connection.db`. Zbirke, ki je ni, ni v odgovoru — brisanje modula 013 analitike ne
   podre (SC-007), kar je hkrati preverba člena I in zahteva FR-012.

## Technical Context

- **Jezik**: TypeScript, Node 22, Express 5, Mongoose 8 (zaledje); Angular 20 + Ionic 8 (odjemalec).
- **Nove odvisnosti**: NOBENE. `statfs` je v `node:fs`, `$binarySize` je Mongo operator,
  `chart.js` je bil zavrnjen (research.md §12).
- **Nov nosilec v `infra/docker-compose.yml`**: NE. Telemetrija je v bazi, merjena vsebina je že
  tam, kjer je bila.
- **Nove spremenljivke okolja**: štiri, VSE s privzetkom → `docker compose up` iz čiste kopije
  deluje brez dopolnjevanja `.env` (kakovostna vrata, točka 4).
- **Meja zmogljivosti**: 50 oseb, 50 000 zapisov vsebine → pregled pod 2 s (SC-002). Seštevanje je
  agregacija v Mongu (`$group`), ne branje v Node; disk se prehodi enkrat na `ANALYTICS_CACHE_SECONDS`.
- **Obseg telemetrije**: ena vrstica na (oseba, zavihek, dan). Pri 15 zavihkih in 400 dneh je to
  ~6 000 vrstic na osebo na leto (SC-010).

## Constitution Check

| člen | kako je izpolnjen |
|---|---|
| I — modul je samostojen | Modul ne uvozi **nobenega** tujega modela; bere prek `connection.db` po imenu zbirke (research.md §2). Telemetrija je v `platform/`, ker ni pojem analitike (§1). Brisanje modula 013 ali 009 pusti analitiko delujočo — to je test, ne trditev. |
| II — enoten izvor | Nič novega: iste poti pod `/api/v1`, brez `cors()`. |
| III — API-first | Vse tri poti so v pogodbi, vključno s tem, kaj vrnejo ob zavrnitvi. `POST /usage/views` sprejme `Idempotency-Key` in ni izvzet (research.md §14). Osveževanje ostane GET, ker ne spremeni stanja (§6). |
| IV — skrivnosti | Nobene nove skrivnosti. E-pošta gre skozi `maskEmail` — analitika cele namestitve ni razlog za razkritje naslovov (FR-009). |
| V — determinizem in idempotentnost | Dan je `ljubljanaCalendarDay()`, nikoli `toISOString()`. Dvojno štetje preprečuje unikaten indeks, ne branje (§4). Rok hrambe je TTL indeks in ne pometač, ki bi ga bilo mogoče pozabiti zagnati (§5). |
| VI — nobene neverificirane akcije | Analitika **ne ukrepa**: sirote našteje in ne pobriše (FR-020). Pometanje ostane delo modula 009. |
| VII — pokvarjen sistem pove, da je pokvarjen | `integrity.clean` je izrecna trditev, ne prazen seznam. `volume: null` nosi razlog namesto tihe ničle. `sources[].present` loči "ni vsebine" od "ni modula". |
| VIII — vljudnost do zunanjih virov | Ni odhodnih klicev. Člen se tu dotakne lastne baze: agregacija čez vse zapise je draga in gre skozi predpomnilnik z eno poizvedbo v teku (§6). |
| IX — domena testabilna brez brskalnika | Okna, polnjenje z ničlami, ugotovitve o celovitosti, tabela virov in izračun roka hrambe so čiste funkcije v `domain/`, brez baze in brez strežnika. |
| X — slovenščina v domeni, angleščina v kodi | `id: 'analytics'`, `route: '/analytics'`; naslov zavihka "Analitika", imena virov slovenska. |
| XI — mobilna naprava je odjemalec | Ogled sporoči odjemalec, a ga **šteje strežnik** — okno, preverba oznake zavihka in pripis osebi so vsi na strežniku. |
| XII — meje | Beleži se najmanj, kar odgovori na vprašanje: ne IP, ne pot, ne posamezen klik, ne trajanje. Iz zbirke poti osebe po aplikaciji ni mogoče sestaviti (data-model.md). |

### Kakovostna vrata

1. `npm run typecheck` in `npm run lint` čista za novo kodo.
2. **Domenska logika ima enotske teste.** Od štirih primerov, ki jih člen imenuje, ima v tej
   funkcionalnosti predmet **en sam**; ostali trije so izrecno navedeni skupaj z zamenjavami, ker
   molk ne šteje kot izpolnjeno:

   | imenovan primer | ima predmet? | kaj ga tu nadomešča |
   |---|---|---|
   | prehod na poletni/zimski čas | **DA** | dan s 23 in dan s 25 urami dasta vsak natanko en ključ `day`; števec se ob prehodu ne podvoji in ne izgubi |
   | praznik na delovni dan | ne — analitika koledarja ne pozna | meja dneva ob polnoči po Ljubljani: ogled ob 23:59 in ob 00:01 gresta v različna dneva, ne v isti |
   | dopust čez mejo meseca | ne — obdobij, daljših od dneva, modul ne modelira | okno 90 dni čez novo leto: `fromDay` v prejšnjem letu, vsi dnevi zajeti, nobeden podvojen |
   | neuspel klic, ki se uspešno ponovi | ne — odhodnih klicev ni | tri lastne odpovedi: `statfs` pade → `volume: null` z razlogom; `E11000` ob hkratnem ogledu → "že šteto", ne napaka; zbirke vira ni → vir izpuščen, pregled odgovori |

3. OpenAPI pogodba: [`contracts/openapi.yaml`](contracts/openapi.yaml), validna (preverjeno s
   parserjem).
4. Zagon iz čiste kopije brez dopolnjevanja `.env` — vse štiri spremenljivke imajo privzetek.
5. Noben nov niz, ki je videti kot skrivnost.

## Project Structure

### Dokumentacija

```
specs/014-admin-analytics/
├── spec.md
├── plan.md            ← ta datoteka
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
├── tasks.md           ← /speckit-tasks
└── contracts/openapi.yaml
```

### Nova koda (API) — skupna zmogljivost

```
apps/api/src/platform/usage/
├── usage-counter.model.ts      dnevni števec; unikaten indeks + TTL
├── recorder.service.ts         en atomaren upsert; E11000 = "že šteto"
├── domain/
│   ├── usage-day.ts            dan po Ljubljani, izračun expiresAt
│   └── tab-key.ts              oznaka zavihka je iz registra, ne prost niz
└── router.ts                   POST /usage/views — req.actor, ne req.auth
```

### Nova koda (API) — modul

```
apps/api/src/modules/analytics/
├── domain/
│   ├── storage-sources.ts      tabela virov: zbirka, lastnik, izraz za bajte
│   ├── usage-window.ts         7/30/90 dni → fromDay/toDay, coverage
│   ├── usage-rollup.ts         števci → lestvice, polnjenje z ničlami
│   ├── storage-rollup.ts       vsote po virih/osebah, vrstica "neznan lastnik"
│   └── integrity.ts            razhajanja iz dveh množic identifikatorjev
├── services/
│   ├── storage-usage.service.ts   agregacije prek connection.db
│   ├── disk-scan.service.ts       sprehod po blobs/ + statfs
│   ├── usage-stats.service.ts     branje števcev
│   └── snapshot-cache.service.ts  TTL v procesu, ena poizvedba v teku
└── router.ts                      GET /analytics/storage, /analytics/usage
```

### Nova koda (web)

```
apps/web/src/app/core/usage/
└── usage-tracker.service.ts    NavigationEnd → tabId → pošlji in pozabi

apps/web/src/app/features/analytics/
├── analytics.model.ts          tipi + čiste funkcije prikaza (bajti, deleži)
├── analytics.api.ts            odjemalec
├── analytics.page.ts           dva segmenta: Prostor | Uporaba
├── storage-panel.component.ts  tabele + vodoravni stolpci iz CSS
└── usage-panel.component.ts    izbirnik obdobja, lestvice, opozorilo o pokritosti
```

### Vpisi zunaj modula

1. `apps/api/src/platform/tabs/registry.ts` — en vnos (`requiredScopes: ['admin']`,
   `icon: 'stats-chart-outline'`, `order: 11`). Vrednosti 0–10 so zasedene; 11 postavi zavihek
   **za** Nastavitve, kar je pravo mesto za orodje, ki ga vidi en človek in ne vsak dan.
2. `apps/api/src/main.ts` — dva `apiV1Router.use(...)`: `usageRouter` (platform) in
   `analyticsRouter` (modul).
3. `apps/web/src/app/app.routes.ts` — ena pot (`authGuard`, `tabGuard`).
4. `apps/web/src/app/core/icons/register-icons.ts` + `tests/unit/icons.spec.ts` — ikone.
5. `apps/api/src/platform/config/env.ts` + `.env.example` — štiri spremenljivke s privzetki.
6. `apps/api/src/modules/auth/router.ts` — **ena vrstica** ob `auditLogin`.
7. `apps/web/src/app/app.component.ts` — **ena vrstica**: `inject(UsageTrackerService)`.

Točke 1–5 so koraki iz `docs/adding-a-tab.md`; peti korak tega vodiča (obsegi v
`BASE_USER_SCOPES`) **odpade**, ker modul nima poimenovanih obsegov — bere `admin`, piše pa pot
brez obsega (research.md §14). Točki 6 in 7 vodič ne našteva in sta utemeljeni spodaj.

## Complexity Tracking

| Odstopanje | Zakaj je potrebno | Zakaj enostavnejša pot ne gre |
|---|---|---|
| Nova mapa `platform/usage/` — zmogljivost izven modula | Prijavo lahko prešteje samo `modules/auth/router.ts`, ogled zavihka pa ni pojem analitike. Isti razlog in isti precedens kot `platform/users/` v 010. | Zbirka v modulu bi terjala uvoz iz modula v modul (lint napaka, člen I), ob brisanju zavihka pa bi odnesla zgodovino prijav cele namestitve. |
| Vrstica v `modules/auth/router.ts` | Brez nje prijav ni mogoče šteti; dnevnik za to ni zbirka (spec.md "Zakaj"). | Izpeljava iz `users.lastLoginAt` pozna samo **zadnjo** prijavo — na "kolikokrat" ne odgovori. Branje dnevnika bi bilo razčlenjevanje vrtljive datoteke. Precedens za klic platforme s tega mesta je `migrateLegacyDataIfNeeded`, dve vrstici više. |
| Vrstica v `apps/web/src/app/app.component.ts` | Menjava zavihka v enostranski aplikaciji ne pomeni zahteve na strežnik; nekdo mora poslušati `NavigationEnd`. | Sledilnik v mapi modula bi deloval šele, ko je odprt zavihek Analitika — torej bi meril samo administratorja na zaslonu z meritvami. Precedens: `ThemeService` in `DeepLinkHandler` sta vpeta prav tam. |
| Imena zbirk so prepisana in ne uvožena | Uvoz modela tujega modula je člen I; prepisano ime je edina pot, ki brisanje modula preživi (research.md §2). | Skupen register zbirk v `platform/` bi vsak modul silil, da se vanj vpiše — torej sklopljenost, ki jo člen I odpravlja, samo obrnjena. Varovalo je enotski test, ki vsako ime preveri proti zagnani aplikaciji. |
