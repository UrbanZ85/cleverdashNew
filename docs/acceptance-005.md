# Sprejemno preverjanje — 005 (osebni profil, vtičniki, konfigurabilni meni)

Datum: 2026-08-26. Preverjeno proti razvojnemu okolju (`npm run dev:api` + `npm run dev:web`,
Keycloak in MongoDB v Dockerju) ter s celotnim samodejnim naborom testov.

## Štiri napake, ki jih je to delo razkrilo (in popravilo)

Pripomba je bila "zelo slab UI, ni menija". Pregled je pokazal, da za tem stojijo štiri
ločene napake, od katerih nobene ni bilo mogoče videti brez zagona aplikacije.

### 1. Menija ni bilo, ker `<ion-menu>` ni bil neposreden otrok `<ion-split-pane>`

`app.component.ts` je imel `<ion-split-pane><app-side-menu>…`, pri čemer je
`<app-side-menu>` znotraj sebe izrisal `<ion-menu>`. Ionic razred `split-pane-side` (in s
tem `height: 100%`) dodeli **neposrednim otrokom** — dobila ga je ovojna komponenta, ne
`ion-menu`. Izmerjeno v brskalniku: `app-side-menu` 270×900 px, `ion-menu` 270×**0** px.

Levi stolpec je bil torej rezerviran in prazen — natanko to, kar je na uporabnikovem
posnetku zaslona.

**Popravek**: `<ion-menu>` je zdaj v `app.component.ts` kot neposreden otrok, `<app-side-menu>`
pa prispeva samo njegovo vsebino. Po popravku: `ion-menu` 268×900 px, `ion-content` 835 px,
blok z uporabnikom na dnu.

### 2. Nobene ikone, ker `addIcons()` ni bil klican nikjer

Z `@ionic/angular/standalone` se ikone ne naložijo same. `grep` po celotnem `apps/web/src`
za `addIcons` ali `ionicons` ni vrnil ničesar. Vsak `<ion-icon>` — v meniju, v spodnji
vrstici zavihkov, na gumbih za urejanje in brisanje — je bil prazen prostor.

**Popravek**: `core/icons/register-icons.ts` z eksplicitno preslikavo (ne `import * as`,
ki bi v paket vgradil ~1300 SVG nizov). Ker imena ikon za meni prihajajo s **strežnika**
(`TAB_REGISTRY.icon`) in jih prevajalnik ne vidi, jih varuje `tests/unit/icons.spec.ts`.

### 3. Temna tema je bila mrtva koda

`theme.service.ts` je preklaplja razred `ion-palette-dark` na korenskem elementu, a
`@ionic/angular/css/palettes/dark.class.css` ni bil nikoli uvožen. Preklop ni imel nobenega
učinka.

**Popravek**: uvoz v `global.scss` + lastna temna paleta v `theme/variables.scss`.

### 4. Spodnja vrstica zavihkov se je izrisala na VRHU zaslona

`ion-router-outlet` je znotraj `.ion-page` absolutno pozicioniran (Ionicov `structure.css`),
zato ni v toku. `<app-bottom-tabs>` je bil posledično prvi element v toku in se je izrisal
na vrhu — **čez glavo strani**. Na ozkem zaslonu je bila glava (in z njo gumb za meni) povsem
prekrita.

**Popravek**: outlet dobi gostitelja s `position: relative; flex: 1 1 0`, vrstica zavihkov
ostane navaden element v toku pod njim — isti prijem kot Ionicov lastni `<ion-tabs>`.

Poleg tega: prag `ion-split-pane` je bil `lg` (992 px), spodnja vrstica pa se skrije pri
`md` (768 px). Med 768 in 992 px ni bilo **ne** vrstice **ne** razprtega menija, in ker gumba
za meni takrat še ni bilo, navigacije v tem razponu širin sploh ni bilo mogoče doseči. Oba
praga sta zdaj `md`.

## Nastavitve, ki so se shranjevale, a jih ni bral nihče

- **`Settings.weather`** — zaslon jo je pisal, `modules/dashboard/router.ts` pa je vseeno
  bral `env.ARSO_DEFAULT_LOCATION` (v kodi je stal `TODO(US3/US6, T081+)`). Sprememba
  lokacije torej ni spremenila prikazanega vremena. Zdaj jo razreši
  `platform/sources/resolution.service.ts`.
- **`Settings.tabs`** — `resolveTabs` jih je spoštoval in `PUT /settings` jih je validiral,
  a ni bilo **nobenega** zaslona, ki bi jih znal zapisati. Vklop/izklop zavihkov je bil
  izključno API funkcija. Zdaj obstaja zaslon Nastavitve → Meni.
- **`GET /dashboard/forecast`** — obstajal je od 001 in ga ni uporabljala nobena ploščica.
  Zdaj ga izrisuje ploščica "Napoved", ki ne doda nobenega novega klica proti ARSO (isti
  predpomnjeni zapis kot trenutno vreme).

## Samodejno preverjanje

| Vrata | Ukaz | Izid |
|---|---|---|
| 1 | `npm run typecheck` | čisto |
| 1 | `npx eslint .` | čisto, brez `any` v domenski plasti |
| 2 | `npm test` | **538 testov, vsi zeleni** (459 API + 79 web); pred 005 jih je bilo 378 |
| 3 | `npm run generate:contracts` | vse štiri pogodbe (001, 002, 003, 005) se razrešijo in generirajo brez napak |
| — | `npm run build:web` | uspešno; začetni paket 1,11 MB surovo / 225 kB prenos |

### Dopolnitve po prvem pregledu

Trije popravki iz uporabe, ne iz načrta — podrobneje v
[`specs/005-profile-plugins/plan.md`](../specs/005-profile-plugins/plan.md), razdelek
"Dopolnitve po prvem pregledu":

1. **Širina ploščice** za vtičnike, v slikovnih točkah (200–1600 px, privzeto 320 px); na
   ožjem zaslonu se ploščica zoži na razpoložljivo širino.
2. **Povečan prikaz v modalnem oknu** (~96 vw/vh) za `iframe`, `image` in `json`. Pri
   vdelani strani klik v pregledu prestreže prosojna plast — brez nje bi pristal v tuji
   strani in ploščice ne bi bilo mogoče odpreti.
3. **Pojasnila ob nastavitvah** — 20 vnosov v `shared/help/help-topics.ts`, vsak s tremi
   deli (kaj je, kako se nastavi, kaj velja ob prazni vrednosti).

**Napaka, ki jo je to razkrilo:** `as const` na katalogu pojasnil je zožil vsak vnos na
njegovo natančno obliko, zato vnos brez `ifEmpty` te lastnosti v tipu ni imel in se predloga
ni prevedla — `ng build` je padel in komponente `app-help` v DOM sploh ni bilo. Ključno
spoznanje za ta repozitorij: **`tsc --noEmit` NE preverja Angularjevih predlog**, to počne
šele `ng build`. Preverjanje samo s `typecheck` je zato lažno zeleno.

### Novi testi (90)

- `apps/api/tests/unit/outbound-url.spec.ts` — 28 primerov (SSRF varovalo: sheme, zanka,
  zasebni razponi, link-local, IPv6 ULA, meja 172.16/12 v obe smeri, poverilnice, dolžina).
- `apps/api/tests/unit/json-path.spec.ts` — 15 primerov (branje polj, indeksi seznamov,
  razlika med "polja ni" in "polje je prazno", zavrnitev poti v prototip).
- `apps/api/tests/contract/dashboard/plugins.spec.ts` — 18 primerov (CRUD, varovalo SSRF,
  pravila za vrsto `json`, spodnja meja intervala).
- `apps/api/tests/contract/dashboard/plugins-isolation.spec.ts` — 3 primeri (tuj zapis vrne
  404, ne 403; isto ime pri dveh uporabnikih je dovoljeno).
- `apps/api/tests/contract/tab-detail.spec.ts` — 9 primerov (podnaslov in stanje seje;
  **sejni piškotek ne uide v meni**, FR-092).
- `apps/api/tests/contract/settings.spec.ts` — 12 novih primerov (osebni viri, varovalo pred
  izklopom `settings`, razporeditev z vnosom vrste `plugin`).
- `apps/web/tests/unit/{icons,settings-store,plugin-model}.spec.ts` — 23 primerov.
- `apps/web/tests/unit/help-topics.spec.ts` — 46 primerov (vsak vnos ima naslov, opis in
  vsaj en korak; brez podvojenih korakov; naslovi so slovenski, ne identifikatorji).
- `apps/api/tests/contract/dashboard/plugins.spec.ts` — 9 dodatnih primerov za `widthPx`
  (vključno s preslikavo starih dokumentov, ki imajo še `columnSpan`).

### Kakovostno vrato 2 — štirje poimenski primeri

Ustava zahteva štiri poimenske primere (prehod na poletni/zimski čas, praznik na delovni
dan, dopust prek meje meseca, neuspel klik z uspehom ob ponovitvi) in pravi, da "molk ne
šteje". **V 005 so vsi štirje brez predmeta** — funkcionalnost ne uvaja ne koledarja, ne
schedulerja, ne klikanja na tuji strani. Nadomestni primeri so našteti v
[`specs/005-profile-plugins/plan.md`](../specs/005-profile-plugins/plan.md), razdelek
"Kakovostna vrata".

## Ročno preverjanje

Vizualno preverjeno pri širinah 414 px, 1440 px in v svetli ter temni temi, z brskalnikom
prek Playwrighta in prestreženimi API odgovori (razvojni Keycloak ni bil dostopen v tej
seji — glej "Kaj to preverjanje NI zajelo"):

- meni z ikonami, označeno trenutno stranjo, podnaslovom vira za beleženje časa in
  opozorilno značko stanja seje;
- blok z uporabnikom in gumbom za odjavo na dnu menija;
- nadzorna plošča s tremi vgrajenimi ploščicami in tremi vtičniki (`link`, `json`, `image`)
  v odzivni mreži;
- manjkajoče polje v JSON odgovoru je izrisano ločeno od praznega (poševno, opozorilno
  barvno) — uporabnik vidi, da je pot narobe vpisana;
- na ozkem zaslonu: glava z gumbom za meni, vrstica zavihkov na dnu, meni kot prekrivalo;
- Nastavitve v štirih sklopih; zaslon Meni ima zavihek "Nastavitve" zaklenjen z razlago;
- ničesar v konzoli brskalnika (0 napak v vseh posnetkih).

## Kaj to preverjanje NI zajelo

- **Prijava prek pravega Keycloaka.** Poverilnic razvojnega realma v tej seji ni bilo, zato
  je bil prijavljeni pogled preverjen s prestreženimi odgovori API-ja, ne s pravo sejo.
  Preusmeritev `GET /api/v1/auth/login` → Keycloak je bila preverjena in vrne pravilen
  `302` z `code_challenge`.
- **Vtičnik vrste `iframe` proti pravemu tujemu viru.** Izris in povečan prikaz sta
  preverjena proti prestreženi strani; dejansko vdelavo tuje strani (in njeno politiko
  `X-Frame-Options`) je treba preveriti ročno.
- **E2E paket.** Vseh pet specov v `apps/web/tests/e2e/` je še vedno zastarelih od 004 —
  vodijo obrazec `/login` z e-pošto in geslom, ki po 004 ne obstaja (`specs/004-…/tasks.md`
  T068). 005 tega ni popravil.
- **`docker compose up` iz čiste kopije** (vrato 4) — 005 ne spreminja `infra/`, zato se
  vedenje ne bi smelo spremeniti, a ni bilo ponovno izmerjeno.

## Znana, nepopravljena drobnarija

`global.scss` uporablja `@import`, ki je v Dart Sass označen kot zastarel. To je obstajalo
že prej (osem uvozov Ionica); 005 je dodal dva. Prehod na `@use` ni trivialen: naši žetoni
morajo biti emitirani **za** Ionicovimi paletami, sicer jih te prepišejo, `@use` pa svojo
vsebino emitira na vrh. Za svoj popravek.
