# Implementation Plan: Opravila

**Spec**: [spec.md](./spec.md) | **Pogodba**: [contracts/openapi.yaml](./contracts/openapi.yaml)
**Raziskava**: [research.md](./research.md) | **Podatkovni model**: [data-model.md](./data-model.md)
**Preverjanje**: [quickstart.md](./quickstart.md)
**Veja**: `010-todos` | **Datum**: 2026-09-03

## Summary

Seznami opravil z odkljukavanjem, deljeni med prijavljenimi uporabniki CleverDasha: nov modul
`todos`, nov zavihek in nova ploščica na nadzorni plošči.

V čem se ta modul loči od vseh prejšnjih:

1. **Prvi zapis, ki ga bere več kot en uporabnik.** Vseh devet obstoječih modulov je strogo
   osebnih: `userId` je prvi člen vsakega indeksa in tuj zapis vrne 404. Tu je lastništvo
   (`ownerId`) in vidnost (`members`) dvoje, kar pomeni novo obliko dostopa, ne novega zaslona.
2. **Prvi modul, kjer stanje spreminja nekdo drug, medtem ko ga gledaš.** Sočasnost zato ni
   robni primer, ampak zahteva (FR-027), in odloča obliko vsakega zapisa.
3. **Prvi modul z več kot dvema obsegoma.** `todos:share` je ločen od `todos:write`, ker je
   deljenje edina operacija, ki zadene človeka, ki ni klicatelj.
4. **Prvi modul, ki namesto potisnega obvestila zavestno izbere oznako v vmesniku** — ne iz
   lenobe, ampak ker sta bili med raziskavo najdeni dve merljivi napaki, zaradi katerih potisno
   obvestilo v tej namestitvi ne more delovati (U3 spodaj).
5. **Prvi modul, ki ga oblikuje odsotnost transakcij** (U1 spodaj): ta ena lastnost okolja
   odloči podatkovni model.

Tehnični pristop v eni povedi: **ena zbirka, opravila in člani vdelani, vsaka sprememba en
atomaren Mongo operator, katerega filter dostop ponovi.**

## Technical Context

**Jezik / okolje**: TypeScript 5 (`strict: true`), Node.js 22 — API; Angular 20 + Ionic 8
(standalone, signali) — web. Brez `any` v domenski plasti.

**Nove odvisnosti**: **nobene.** Zavrnjene in zakaj — glej [research.md](./research.md) §12:
`socket.io`/`ws` (sprotnost ni zahteva, člen II in I bi jo postavila v `platform/`),
`@angular/cdk` (vlečenje in spuščanje; hišni vzorec so puščici gor/dol),
knjižnica za nadzor dostopa (matrika 4 × 10 je čista funkcija, ki jo je ceneje napisati kot
razumeti tujo).

**Shramba**: MongoDB 7 prek Mongoose 8, **ena nova zbirka** `todoLists`. Brez migracij —
hišna strategija je shemin privzetek plus obrambno branje.

**Testiranje**: Vitest 3 + supertest + `mongodb-memory-server` (API), Vitest + jsdom nad
čistimi funkcijami (web). Brez `TestBed`, zato ima vsaka stran svoj `*.model.ts` brez uvozov
iz `@angular/*`.

**Ciljna platforma**: SPA na `https://app.si/`, API pod `/api/v1` istega izvora; Android prek
Capacitorja.

**Vrsta projekta**: monorepo z npm workspaces — `apps/api`, `apps/web`, `packages/contracts`.

**Zmogljivostni cilji**: odziv checkboxa pod 200 ms (optimistično, s povrnitvijo ob neuspehu —
SC-002); branje ploščice en dokument in ena povratna pot; seznam 30 opravil brez zaznavne
zakasnitve pri preurejanju.

**Omejitve**: **MongoDB teče kot samostojen strežnik, brez replika nabora — transakcij nad več
dokumenti ni** (U1). Vsi časi v `Europe/Ljubljana`; `toISOString().split('T')[0]` je ESLint
`error`. Modul ne sme uvažati iz nobenega drugega modula (`cleverdash/module-boundary`, prav
tako `error`).

**Obseg**: 7 uporabniških zgodb, ~30 novih datotek, 1 zbirka, **15 endpointov** (14 v modulu,
1 v `platform/`), 3 obsegi. Pogodba je preverjena: `openapi-typescript` jo razčleni in prevede
v 15 operacij.

## Constitution Check

Ocenjeno proti `.specify/memory/constitution.md` v1.1.0.

| Člen | Stanje | Kako ga ta načrt izpolni |
|---|---|---|
| **I. Zavihek je modul** | ✅ | Ves modul v `apps/api/src/modules/todos/` in `apps/web/src/app/features/todos/`. Nobenega uvoza iz drugega modula: potrebo po `User` pokriva **nova** skupna plast `platform/users/` (precedens: `platform/settings/consent.service.ts`, `platform/auth/automation-owner.ts`). `GET /users` je v `platform/`, **ne** v modulu, prav zato, da izbris mape `todos` ne pobere splošnega endpointa. Vpisi zunaj modula so našteti spodaj in nič drugega. Preverljivo s SC-009. |
| **II. Enotni izvor** | ✅ | Nič novega: modul se vpne v obstoječi `apiV1Router` pod `/api/v1`. Brez `cors()`, brez druge domene, brez novega vrat. |
| **III. API-first** | ✅ | Vsak endpoint obstaja pred svojim zaslonom; pogodba je [contracts/openapi.yaml](./contracts/openapi.yaml) in se vzdržuje v istem PR-ju. **Vse** mutacije sprejmejo `Idempotency-Key` in to navajajo v pogodbi — modul ne uporablja izjeme za izdajo žetonov, ker žetonov ne izdaja. Ločen obseg `todos:share` obstaja prav zato, da je obseg učinka avtomatizacije nastavljiv (FR-091). Posledica U2: `DELETE` vrača `200` s telesom, ker se `204` v hrambi idempotence **ne zabeleži** in bi ponovljen klic obljubo iz člena III prelomil. |
| **IV. Brez skrivnosti v kodi** | ✅ brez predmeta | Funkcionalnost ne uvaja nobene nove okoljske spremenljivke, nobenega ključa in nobene zunanje storitve. |
| **V. Determinističen in idempotenten razporejevalnik** | ✅ prilagojeno | Razporejevalnika ta modul nima. Velja pa **V.4**: rok je koledarski dan v `Europe/Ljubljana`, izračunan prek obstoječega `ljubljanaCalendarDay()`; `toISOString().split('T')[0]` je prepovedan z ESLint pravilom. Velja tudi **V.3** (podvojena izvedba mora biti nemogoča): zgornja meja opravil se uveljavi **v filtru zapisa**, ne po branju, in `Idempotency-Key` velja za vse mutacije. |
| **VI. Brez nepreverjenih samodejnih dejanj** | ✅ prilagojeno | Samodejnih dejanj na tujih sistemih ta modul nima. Duh člena je izpolnjen tam, kjer je predmet: **tiha napaka je prepovedana.** Zapis, ki se ne ujame z nobenim dokumentom, se **nikoli** ne pogoltne — ponovi se **diagnoza** (`explainNoMatch`) in vrne natančen 404/403/409. Generične masovne mutacije s poročanjem napak na element **namenoma ni**, ker je 200 s seznamom neuspehov natanko oblika tihe napake (research.md §9). |
| **VII. Sistem, ki se pokvari, mora znati povedati, da je pokvarjen** | ✅ | Tri stanja zavrnitve so **tri različna sporočila in trije statusi** (404 / 403 / 409, FR-050, FR-051, FR-063) — ne eno samo, ki bi zavajalo. Zaklep je v odgovoru API-ja in v vmesniku, ne le v dnevniku. Ploščica z nedosegljivim pripetim seznamom se izriše z razlago in ne podre nadzorne plošče (FR-085, SC-010). Deljenje in odvzem dostopa gresta v strukturiran dnevnik z ID korelacije (FR-052). |
| **VIII. Vljudnost do zunanjih virov** | ✅ brez predmeta | Modul ne kliče nobenega zunanjega vira. Duh člena je vseeno upoštevan pri ploščici: interval osveževanja pove **strežnik** (`nextPollSeconds`), osveževanje teče IZKLJUČNO v ospredju prek obstoječega `ForegroundRefreshService`, in odjemalec nima intervala kot konstante (FR-087). |
| **IX. Pogon je testabilen brez brskalnika** | ✅ | Vsa odločitvena logika je v `modules/todos/domain/` — matrika zmožnosti, razvrščanje, položaji, čiščenje vnosa, rok, filter vidnosti. Nobenega uvoza iz `express` ali `mongoose`; kjer je potreben ID, se **podaja**. `domain/` ne uvaža niti `platform/errors`: vrne **razlog** in slovensko besedilo, `ProblemError` iz tega naredi šele storitev (vzorec `transcription-gate.ts`). |
| **X. Slovenščina v domeni, angleščina v kodi** | ✅ | Identifikatorji, poti, `id`-ji in obsegi angleški (`todos`, `todos:share`, `members`, `dueDate`); naslov zavihka, vsa vidna besedila in vsa sporočila o napakah slovenska. Slovenska sklanjatev ("1 opravilo / 2 opravili / 3 opravila / 5 opravil") je ročna, kot v modulu beležk. |
| **XI. Mobilnik je odjemalec, ne načrtovalec** | ✅ | Ves izračun je na strežniku: razvrstitev opravil, stanje roka, zmožnosti vloge in interval osveževanja pridejo v odgovoru. Odjemalec ne odloča o ničemer in ne hrani stanja, ki bi ga moral uskladiti. |
| **XII. Meje** | ✅ | Deljenje je **povabilo, ne prevzem**: nihče ne dobi dostopa do tujih podatkov brez dejanja lastnika, in soudeleženec lahko seznam kadar koli sam zapusti (FR-047), tudi kadar je zaklenjen. Nič v tem modulu ne vpisuje ničesar v imenu druge osebe. Imenik uporabnikov razkrije najmanj, kar zadošča nalogi: e-pošta samo zamaskirana (FR-072). |

**Izid: prehod. Nobene kršitve, ki bi zahtevala utemeljitev.** Trije členi so brez predmeta
(IV, V razen V.3/V.4, VIII) in to je zapisano izrecno, ne z molkom.

### Kakovostna vrata

| Vrata | Kako se izpolnijo v 010 |
|---|---|
| **1.** `typecheck` in `lint` čista, `strict: true`, brez `any` v domenski plasti | Nič v `modules/todos/domain/` in `platform/users/user-directory.ts` ne uporablja `any`; kjer Mongoose vrne nedoločen tip, se uporabi izrecen vmesnik posnetka (`TodoListSnapshot`), ne `any`. `lint` vključuje `cleverdash/module-boundary`, ki uvoz med moduli zavrne kot napako. |
| **2.** Enotski testi domenske logike, s štirimi obveznimi primeri | Izpolnjeno; ker trije od štirih v tej funkcionalnosti predmeta nimajo, so nadomestni primeri **poimensko** navedeni spodaj. |
| **3.** Pogodba OpenAPI posodobljena in veljavna | [contracts/openapi.yaml](./contracts/openapi.yaml) nastane v tem PR-ju in pokriva vseh 14 endpointov, vključno z `Idempotency-Key` na vsaki mutaciji. Dodan je vnos v `packages/contracts/scripts/generate.ts`. |
| **4.** `docker compose up` iz čistega odjema da delujoč sistem samo z izpolnjenim `.env` | Brez sprememb: modul ne uvaja nobene nove okoljske spremenljivke, nobene nove storitve in nobenega novega nosilca. Nova zbirka nastane sama ob prvem zapisu, indeksi ob zagonu. |
| **5.** Nič novega, kar bi bilo videti kot skrivnost, ni v gitu | Brez predmeta: funkcionalnost ne uvaja ključev. Imenik uporabnikov namenoma **ne** vrne celih e-poštnih naslovov (FR-072). |

**Izid vrat: prehod, brez odstopanj.**

### Kakovostna vrata, točka 2 — izrecno

Ustava zahteva enotske teste za prehod na poletni/zimski čas, praznik na delovni dan, dopust
čez mejo meseca in neuspel klic, ki se uspešno ponovi. **Molk ne šteje za izpolnjeno**, zato:

- **Prehod na poletni/zimski čas — PREDMET OBSTAJA**, prvič po 001, prek neobveznega roka
  (`domain/due-date.ts`). Obvezni testi: `parseDueDate('2026-03-29')` (dan, dolg 23 ur) in
  `parseDueDate('2026-10-25')` (25 ur) morata vrniti instant, katerega ljubljanski koledarski
  dan je **ta** dan — fiksen odmik `+01:00`/`+02:00` na enem od njiju pade.

  Primeri za `dueState` so izbrani tako, da **naivni izračun pade**; primer, pri katerem bi
  tudi naivni izračun odgovoril pravilno, ne dokazuje ničesar. Ključ je okno med 22:00 (poleti)
  oz. 23:00 (pozimi) UTC in polnočjo UTC, ko se ljubljanski in UTC koledarski dan razlikujeta:
  rok 29. 3. 2026, ovrednoten ob `2026-03-28T23:30:00Z` (= 00:30 CET **29.** marca, v UTC pa še
  28.), mora dati `today` — naivni izračun po UTC bi dal `tomorrow`; rok 25. 10. 2026 ob
  `2026-10-24T23:30:00Z` (= 01:30 CEST 25. oktobra) prav tako `today`, ne `tomorrow`.
- **Praznik na delovni dan — BREZ PREDMETA**: modul ne pozna koledarja, praznikov ne delovnih
  dni; opravilo z rokom 25. decembra ima rok 25. decembra. Nadomeščata ga zgornja testa meje
  koledarskega dneva, ki preverjata **isto plast** (izračun ljubljanskega dneva iz instanta) na
  primeru, ki v tej funkcionalnosti obstaja.
- **Dopust čez mejo meseca — BREZ PREDMETA**: ni obdobij ne razponov; opravilo ima en rok, ne
  začetka in konca. Sam vidik meje meseca predmet ima in je pokrit v obeh smereh: `dueState` za
  rok 1. 3. 2026 sredi dne 28. 2. mora dati `tomorrow`, ob `2026-02-28T23:30:00Z` (ko je v
  Ljubljani že 1. marec, v UTC pa še 28. februar) pa `today`. Isti par velja za mejo leta
  (31. 12. → 1. 1.).
- **Neuspel klic, ki se uspešno ponovi — BREZ PREDMETA**: modul nima zunanjega sistema, ne
  Puppeteerja, ne dejanja na tuji strani. Nadomeščajo ga trije poimensko navedeni primeri:
  (a) zapis, katerega atomarni filter se ne ujame z nobenim dokumentom, ponovi **diagnozo** in
  vrne natančen 404/403/409 — nikoli 500 in nikoli samodejno ponovljenega zapisa;
  (b) ponovljen `Idempotency-Key` na `POST …/tasks` vrne izvirno opravilo brez dvojnika;
  (c) `DELETE` z istim ključem, ponovljen po časovni omejitvi, vrne izvirni `200`, ne 404 —
  kar drži izključno zaradi odločitve iz U2.

## Project Structure

### Dokumentacija

```text
specs/010-todos/
├── spec.md                    # zahteve (že napisan)
├── plan.md                    # ta datoteka
├── research.md                # odločitve in zavrnjene možnosti
├── data-model.md              # ena zbirka, indeksi, prehodi stanj
├── quickstart.md              # kako preveriti, da deluje
├── checklists/requirements.md # kakovost speca (že napisan, 16/16)
└── contracts/openapi.yaml     # pogodba
```

### Nova koda (API)

```text
apps/api/src/modules/todos/
├── router.ts                       # 13 endpointov; statične poti PRED /:listId
├── scopes.ts                       # todos:read, todos:write, todos:share
├── todos.audit.ts                  # todos.list.shared / .unshared / .locked (vzorec auth.audit.ts)
├── tab-detail.ts                   # podnaslov in značka v meniju (nadomestilo za push)
├── domain/                         # ČISTO: brez express, brez mongoose, brez platform/errors
│   ├── capabilities.ts             #   matrika 4 vloge × 10 zmožnosti, denyReason + describeDeny
│   ├── task-order.ts               #   POSITION_STEP, orderTasks, nextPositions, normalizePositions
│   ├── todo-input.ts               #   meje, zod sheme, sanitizeTaskTitle, splitPastedTitles, makeTask
│   ├── due-date.ts                 #   parseDueDate, dueState, nextDueDate (prek domain/timezone.ts)
│   └── visibility.ts               #   buildVisibleListsFilter — $or je TU in nikjer drugje
├── models/todo-list.model.ts       # ENA zbirka: tasks in members vdelana
└── services/
    ├── list-access.service.ts      #   resolveListAccess + assertCan + explainNoMatch
    ├── task-write.service.ts       #   writeGuard + vsi atomarni operatorji
    └── sharing.service.ts          #   diff članov, dnevnik, oznaka "novo"

apps/api/src/platform/users/        # NOVA skupna plast (ne modul — glej člen I zgoraj)
├── user-directory.ts               #   ČISTO: maskEmail, initialsOf, compareSlovenian
├── directory.service.ts            #   bralnik nad UserModel (vzorec consent.service.ts)
└── router.ts                       #   GET /users, requireScopes()
```

### Nova koda (web)

```text
apps/web/src/app/features/todos/
├── todos.page.ts                   # vrstica čipov + hitri vnos + seznam opravil
├── todos.model.ts                  # tipi in čiste funkcije, BREZ uvozov iz @angular/*
├── todos.api.ts                    # HttpClient ovoj (vzorec notes.api.ts)
├── domain/task-order.ts            # moveByOne — samo odjemalec, pogodba je nastali vrstni red
├── share-dialog.component.ts       # ion-modal: izbirnik oseb, stopnje, stikalo za zaklep
└── todo-tile.component.ts          # ploščica; registrirana iz shared/tiles/tile-registry.ts

apps/web/src/app/core/users/users.api.ts   # imenik — v core/, ker ni last enega zavihka
```

### Vpisi zunaj modula (in nič drugega)

| Datoteka | Sprememba | Zakaj je dovoljena |
|---|---|---|
| `apps/api/src/platform/tabs/registry.ts` | en vnos `todos` (`order: 4`, `enabled: true`) | register, ne uvoz med moduli — člen I to izrecno dovoljuje |
| `apps/api/src/main.ts` | `use(todosRouter)`, `use(usersRouter)`, `registerTodosTabDetail()` | edino mesto, ki veže module z `/api/v1`; komentar v datoteki to pove |
| `apps/api/src/platform/keycloak/role-mapping.ts` | trije **prepisani** nizi v `BASE_USER_SCOPES` | brez tega zavihek dela samo administratorju (`docs/adding-a-tab.md`, korak 5). Nizi so prepisani, **ne** uvoženi — člen I |
| `apps/api/src/modules/settings/services/tile-layout.service.ts` | `'todos'` v `KNOWN_TILE_TYPES` | brez tega bi se razporeditev s to ploščico ob shranjevanju **tiho počistila** — natanko hrošč, ki ga opisuje komentar pri `'forecast'` |
| `apps/api/tests/unit/no-owner-fields.spec.ts` | tretja kategorija: `ownerId` brez `userId` | nova razmejitev mora biti **testirana**, ne spregledana |
| `apps/api/tests/unit/tab-resolution.spec.ts` | `todos` v pričakovane sezname in v tri zemljevide prekritij | **najdeno med izvedbo, v načrtu ga ni bilo**: test ima vsebino registra zapisano na trdo, zato ga nov zavihek nujno podre. Trditev "en vnos v register in nič drugega" torej velja za KODO, ne za teste — to je pošteno zapisati |
| `apps/web/.../shared/tiles/tile-types.ts` **(nova datoteka)** | imena vgrajenih vrst ploščic, ločena od registra | **najdeno med izvedbo**: ploščica mora svojo nastavitev prebrati sama, za kar potrebuje seznam vrst — uvoz registra pa bi ustvaril krožni uvoz (register uvaža komponente) in ob neugodnem vrstnem redu nalaganja `ReferenceError`. Glej research.md §15 |
| `apps/web/tests/unit/tile-registry.spec.ts` **(nova datoteka)** | primerja `tile-types.ts` in `TILE_REGISTRY` | cena zgornje ločitve je, da se vira lahko razideta; razhajanje ne bi bilo napaka ob prevajanju, ampak ploščica, ki tiho izgine |
| `apps/web/src/app/app.routes.ts` | pot `/todos` z `[authGuard, tabGuard]` | |
| `apps/web/src/app/shared/tiles/tile-registry.ts` | vnos `todo` + naslov "Opravila" | `shared/` sme uvažati iz `features/`; obratno ne |
| `apps/web/src/app/core/icons/register-icons.ts` **in** `apps/web/tests/unit/icons.spec.ts` | nove ikone | neregistrirana ikona se izriše kot prazen prostor; ta test je edina varovalka |
| `packages/contracts/scripts/generate.ts` | tarča `010-todos` | |

**Kaj se NE spremeni**: nič drugega. Posebej: `platform/notifications/*` se **ne dotakne**
(glej U3), `platform/errors/problem.ts` **ne dobi** nove tovarne `conflict()` (tovarna v skupni
plasti, ki jo uvede modul, je ravno smer, ki jo prepoveduje razdelek Governance — 409 se
sestavi kot `new ProblemError(409, …)`, enako kot v `notes/router.ts:311`), in nobena obstoječa
zbirka ne dobi novega polja.

**Structure Decision**: hišna razporeditev modula, kot pri 007 in 009 — `router.ts` +
`scopes.ts` + `domain/` + `models/` + `services/` na strani API-ja, `features/<ime>/` na strani
weba. Edina razširitev je nova mapa `platform/users/`, utemeljena v Constitution Check (člen I).

## Popravek, ki gre pred funkcionalnostjo

**Ločen commit, svoj test, pred prvo nalogo te funkcionalnosti**: v `KNOWN_TILE_TYPES`
(`apps/api/src/modules/settings/services/tile-layout.service.ts:14`) **manjka `'commute'`**.
Posledica je, da se shranjena razporeditev ploščic, ki vsebuje ploščico "Pot", ob
`PUT /settings` tiho počisti in uporabnikova nastavitev izgine — natanko hrošč, ki ga dve
vrstici višje opisuje komentar ob `'forecast'`.

To ni del te funkcionalnosti in ne rešuje njenega problema. Je pa **ista vrstica**, ki jo bomo
tako ali tako urejali, in obstoječa tiha izguba uporabnikove nastavitve. Pustiti jo v vrstici,
ki jo spreminjam, bi bilo slabše kot popraviti. Gre zato **ločeno in prej**, z lastnim testom,
da ni videti kot postranska škoda te funkcionalnosti.

## Complexity Tracking

Kršitev ustave ta načrt nima. Ta razdelek zato beleži **tri ugotovitve o okolju in obstoječi
kodi**, ki so oblikovale načrt in ki jih naslednji bralec mora poznati — ter dve **tuji,
obstoječi napaki**, ki nista v obsegu te funkcionalnosti, a ju ni pošteno zamolčati.

| Ugotovitev | Kaj pomeni | Kaj smo naredili |
|---|---|---|
| **U1. MongoDB teče samostojno** — `infra/docker-compose.yml` → `image: mongo:7` brez `command:` in brez `--replSet`; testi na `MongoMemoryServer.create()`, prav tako samostojno | **Transakcij nad več dokumenti na tej namestitvi ni.** Vsaka operacija, ki se dotakne več opravil hkrati (preurejanje, čiščenje opravljenih, izbris seznama s članstvi), bi bila v ločeni zbirki N pisanj brez transakcije — izpad ali vzporedna sprememba sredi tega pusti podvojene ali preskočene položaje, torej stanje brez pravilnega popravka | Opravila in člani so **vdelani v isti dokument**. Preurejanje je en `$set` z več `arrayFilters`: bodisi cel nov vrstni red bodisi nič. To ni okus, ampak edina atomarna prerazvrstitev, ki jo to okolje zmore (research.md §1) |
| **U2. `Idempotency-Key` se pri odgovoru 204 ne shrani** — `platform/idempotency/middleware.ts:83-93` ovije samo `res.json`, `res.status(204).end()` skozi to ne gre | Ponovljen `DELETE` z istim ključem se **izvede znova** in vrne 404. Avtomatizacija, ki brisanje ponovi po časovni omejitvi, zabeleži lažno napako — kar je natanko obljuba, ki jo člen III daje | Vsi `DELETE` v tem modulu vračajo **`200` s telesom** (`{ deleted: true }` / `{ removed: true }`), ne 204, in to je zapisano v pogodbi. Boljši dolgoročni popravek je naučiti middleware beležiti odgovore brez telesa — to je sprememba skupne plasti in **svoj PR** |
| **U3. Potisna obvestila v tej namestitvi ne delujejo, na webu pa ne obstajajo** — (a) `DEFAULT_CHANNELS` je samo `['system']`, `deviceSchema.channels` privzame isto, in `apps/web/…/push.service.ts:49` ob registraciji polja `channels` **ne pošlje**, zato ima vsaka naprava le kanal `system` in obvestilo na katerem koli drugem kanalu se ujame z nič napravami ter konča kot `deliveryStatus: 'suppressed'`; (b) `push.service.ts:21` se na webu takoj vrne (`if (!Capacitor.isNativePlatform()) return;`), zato se v spletni aplikaciji naprava **nikoli** ne registrira | Prvotna zahteva je bila potisno obvestilo "nekdo ti je delil seznam". Tako obvestilo bi bilo **tiho nedostavljeno** — člen VI to imenuje za najhujši razred hroščev | Zahteva je bila **spremenjena z naročnikom**, ne tiho opuščena: obveščanje je znotraj aplikacije (FR-007, FR-103), prek `members[].seenAt` in obstoječega `registerTabDetailProvider`. **`platform/notifications/*` se ne dotakne.** Obe napaki sta tuji in obstoječi; njun popravek je svoja naloga s svojim testom in **ni** v obsegu 010 |

Ena zavestna odločitev, ki je vredna zapisa, ker se bo komu zdela preveč:

| Odločitev | Zakaj je potrebna | Zavrnjena preprostejša možnost |
|---|---|---|
| Trije obsegi (`read`, `write`, **`share`**) namesto dveh | Deljenje je edina operacija v modulu, ki zadene človeka, ki ni klicatelj. Člen III postavlja API ključ za prvorazrednega odjemalca, kar pomeni, da mora biti njegov obseg **učinka** nastavljiv | Dva obsega, kot pri vseh drugih modulih. Zavrnjeno: z njima bi "n8n lahko doda mleko na seznam" nujno pomenilo tudi "n8n lahko seznam podari" |
| `writeGuard` ponovi pogoj dostopa v filtru **vsakega** zapisa, čeprav ga je razsodnik že preveril | Med branjem in zapisom lahko lastnik zaklene seznam ali odvzame članstvo. Filter je edino mesto, kjer sta preverba in zapis **ena** operacija | Zanesti se na razsodnika. Zavrnjeno: vsak zapis bi bil odločen na podatku, ki je v trenutku zapisa že star — in prav to okno je tisto, ki ga zaklep mora zapreti |
| `resolveListAccess` vrne `lean()`, ne hidriranega dokumenta | Hidriran dokument ponuja `.save()`, ta pa nad poljem `tasks` pomeni beri-spremeni-zapiši, kar pri dveh hkratnih odkljukanjih eno izgubi | Vrniti hidriran dokument in se dogovoriti, da ga nihče ne shrani. Zavrnjeno: dogovora ne uveljavlja noben pregled kode tako zanesljivo kot tip, ki metode nima |
