# Implementation Plan: Osebni profil, vtičniki in konfigurabilni meni

**Spec**: [spec.md](./spec.md) | **Pogodba**: [contracts/openapi.yaml](./contracts/openapi.yaml)
**Vhodno gradivo**: `nacrt/005-profile-plugins/spec.md`
**Datum**: 2026-08-26

## Summary

005 zapre tri različne vrzeli, ki so se navzven kazale kot ena pripomba ("slab UI"):

1. **Popravki ogrodja** (niso oblikovna izbira, so napake): registracija ikon, `<ion-menu>`
   kot neposreden otrok `<ion-split-pane>`, uvoz temne palete, gumb za meni v glavi, gumb
   za odjavo, spodnja vrstica zavihkov na dnu namesto na vrhu.
2. **Nastavitve, ki se berejo**: `Settings.weather` zdaj dejansko določa prikazano vreme;
   `Settings.tabs` je dobil zaslon, ki ga zna zapisati.
3. **Nove zmožnosti**: uporabniško definirane ploščice, osebni naslovi virov, vidnost vira
   za beleženje časa v meniju.

## Technical Context

Brez novih odvisnosti razen `ionicons` (že prisoten tranzitivno, zdaj naveden izrecno, ker
ga uvažamo neposredno). Brez sprememb `infra/`. Ena nova zbirka (`dashboardPlugins`), dve
novi polji v `Settings` (`sources`), ena nova pot (`GET /tabs/all`), en nov register
razširitev (`platform/tabs/extension.ts`).

`provideAnimations()` NI dodan: Ionic 8 svoje prehode izvaja v Stencilu, `@angular/animations`
ni med odvisnostmi in ga zaradi tega klica ne bi bilo smiselno dodajati.

## Constitution Check

Ocenjeno proti `.specify/memory/constitution.md` **v1.1.0**.

| Člen | Stanje | Kako ga ta načrt izpolni |
|---|---|---|
| I. Zavihek je modul | ✅ | Vtičniki so ploščice na obstoječi nadzorni plošči, ne nov zavihek — koda je v `modules/dashboard/`. Nobenega novega uvoza med moduli: razreševanje virov je v `platform/sources/`, ne v `modules/dashboard/` (nastavitve so drug modul), dodatek zavihka pa gre prek registra `platform/tabs/extension.ts`, tako da `platform/tabs` modula beleženja časa ne pozna po imenu. Oboje je uveljavljeno s pravilom `cleverdash/module-boundary`. |
| II. Enotni izvor | ✅ | Nove poti pod `/api/v1/dashboard/plugins*` in `/api/v1/tabs/all`, isti Express app in isti Caddy. Brez `cors()`. |
| III. API-first | ✅ | Pogodba OpenAPI 3.1 je nastala pred zaslonom in se generira v tipe (`npm run generate:contracts`). Mutacijski endpointi sprejmejo `Idempotency-Key` prek obstoječega `platform/idempotency/middleware.ts`. Novih obsegov ni: vtičniki so osebni, klicatelj z API ključem dobi 400. |
| IV. Nobene skrivnosti | ✅ | Nič novega v `.env` — nasprotno, 005 naslove IZ `.env` prestavi v bazo kot osebno nastavitev, `.env` pa pusti kot privzetek. Vtičnik ne hrani poverilnic: naslov s poverilnicami je izrecno zavrnjen (`domain/outbound-url.ts`). |
| V. Determinističen scheduler | brez predmeta | 005 ne uvaja nobenega časovno vodenega tika. Osveževanje vtičnikov je isti mehanizem kot za vreme in radar: TTL predpomnilnika + osveževanje v ospredju na strani odjemalca. |
| VI. Nobene neverificirane akcije | brez predmeta | Vtičniki samo BEREJO (GET). Ni akcije, ki bi jo bilo treba potrditi. |
| VII. Sistem pove, da je pokvarjen | ✅ poostreno | Meni zdaj pokaže stanje seje pri delodajalcu (`ok`/`warning`/`danger`) — prej je bilo to vidno samo v diagnostiki. Ploščica vtičnika ob izpadu vira pokaže zadnji znani podatek z oznako starosti; manjkajoče polje v JSON odgovoru se izrecno loči od praznega. |
| VIII. Vljudnost do zunanjih virov | ✅ | Vira vrst `image` in `json` prenese STREŽNIK prek `platform/cache/service.ts` — odjemalec zunanjega vira ne kliče nikoli. Najkrajši TTL je 30 s (uveljavljeno v shemi in v Zod validaciji). Ključ predpomnilnika vsebuje razrešeni naslov, ker osebni prepisi sicer zastrupijo skupni predpomnilnik. |
| IX. Testabilno brez brskalnika | ✅ | Vsa logika, ki se lahko zmoti, je v čistih funkcijah: `domain/outbound-url.ts` (SSRF), `domain/json-path.ts` (branje polj), `settings.model.ts` na odjemalcu (zlivanje nastavitev), `plugin.model.ts` (validacija osnutka). Vse testirano brez baze, omrežja in TestBed-a. |
| X. Slovenščina v domeni, angleščina v kodi | ✅ | Imena vtičnikov vpiše uporabnik. Vrste (`link`/`iframe`/`image`/`json`) so angleški identifikatorji z ločeno preslikavo v slovenske naslove. Popravljena je tudi stara kršitev: zaslon za razporejanje ploščic je izpisoval surovi `weather`/`radar`. |
| XI. Mobilna naprava je odjemalec | ✅ | Nič se ne planira na napravi. |
| XII. Meje | brez predmeta | Ni avtomatizacije na tuji strani. Nasprotno — `domain/outbound-url.ts` je nova omejitev tega, kam strežnik sme seči. |

### Kakovostna vrata

| Vrata | Kako se izpolnijo v 005 |
|---|---|
| 1. Čist `typecheck` in `lint`, brez `any` v domenski plasti | Enako pravilo kot 001–004, razširjeno na novo kodo. `npx eslint .` je čist. |
| 2. Enotski testi domenske logike | **Vsi štirje poimenski primeri (prehod na poletni/zimski čas, praznik na delovni dan, dopust prek meje meseca, neuspel klik z uspehom ob ponovitvi) so v 005 BREZ PREDMETA** — funkcionalnost ne uvaja ne koledarja, ne schedulerja, ne klikanja na tuji strani (glej člena V in VI zgoraj). To je tu izrecno zapisano, ker ustava pravi, da "molk ne šteje". **Nadomeščajo jih** primeri, specifični za to domeno: zavrnitev `http`/`file`/`javascript` sheme (5×), zavrnitev zanke, zasebnih razponov, link-local in IPv6 ULA (12×), meja razpona 172.16/12 v obe smeri (2×), zavrnitev poverilnic v naslovu (1×), branje vgnezdenega polja in indeksa seznama (2×), razlika med "polja ni" in "polje je prazno" (1×), zavrnitev poti v prototip (3×), enota se ne pripne pomišljaju (1×), izolacija vtičnikov med uporabniki (3×), nemožnost izklopa zavihka `settings` (1×), vnos razporeditve vrste `plugin` brez veljavnega `pluginId` (1×), sejni piškotek ne uide v meni (1×). Skupaj 90 novih testov (43 enotskih v `domain/`, 30 pogodbenih, 17 na odjemalcu). |
| 3. Posodobljena in validna OpenAPI pogodba | [contracts/openapi.yaml](./contracts/openapi.yaml); `npm run generate:contracts` jo prebere in iz nje ustvari `packages/contracts/src/generated/profile-plugins.d.ts` brez napak — kar je hkrati preverba, da je dokument razrešljiv. |
| 4. `docker compose up` iz čiste kopije | **Brez sprememb** `infra/`. Nobene nove sistemske odvisnosti in nobene nove obvezne spremenljivke okolja — `ARSO_*` ostanejo z istimi privzetki, samo njihov pomen je zdaj "privzetek, ki ga oseba lahko prepiše". |
| 5. Nobenega niza, ki je videti kot skrivnost | 005 ne uvaja nobene nove skrivnosti. |

**Izid vrat: prehod, brez odstopanj.**

## Project Structure

### Nova koda (API)

```
apps/api/src/
  domain/
    outbound-url.ts              SSRF varovalo (čista funkcija)
    json-path.ts                 branje polj po pikčasti poti (čista funkcija)
  modules/dashboard/
    models/dashboard-plugin.model.ts
    plugins.router.ts            CRUD + /data
  modules/settings/services/
    tab-overrides.service.ts     varovalo pred izklopom zavihka settings
    source-overrides.service.ts  validacija osebnih naslovov
  modules/time-tracking/
    tab-detail.ts                prispevek zavihka v meni
  platform/sources/
    resolution.service.ts        Settings.sources ?? env
  platform/tabs/
    extension.ts                 register dodatkov zavihkov
```

### Nova koda (web)

```
apps/web/src/
  theme/variables.scss           oblikovni žetoni
  assets/icon/favicon.png
  app/core/
    icons/register-icons.ts
    settings/{settings.model.ts,settings.store.ts}
    plugins/{plugin.model.ts,plugin.store.ts}
    user/current-user.service.ts
  app/shared/layout/
    page-header.component.ts
    tile-card.component.ts
  app/shared/help/
    help-topics.ts               katalog pojasnil (edini vir teh besedil)
    help-button.component.ts     znak "?" + pojavno okno
  app/features/dashboard/tiles/
    forecast-tile.component.ts
    plugin-tile.component.ts
  app/features/settings/
    plugins-section.component.ts
    sources-section.component.ts
    menu-section.component.ts
```

## Complexity Tracking

Dva elementa posegata v skupno infrastrukturo, ne le v nov modul, in sta zato zapisana tu:

1. **`platform/sources/resolution.service.ts`** — moralo bi biti v `modules/dashboard/`, kjer
   se uporablja, a bi to pomenilo uvoz iz `modules/settings/` (člen I, uveljavljeno z
   lintom). Poleg tega isti podatek potrebuje `modules/cameras` (osnovni naslov spletnih
   kamer). Skupna infrastruktura je pravo mesto — isti razlog, kot velja za
   `platform/tabs/resolver.ts`, ki že bere iste nastavitve.
2. **`platform/tabs/extension.ts`** — nov register razširitev. Alternativa (da bi
   `platform/tabs` bral `modules/time-tracking`) je izrecno prepovedana. Vzorec ni nov v tem
   repozitoriju: `platform/health/extension.ts` in `registerTickStep` delujeta enako.

## Dopolnitve po prvem pregledu

Trije popravki, ki so nastali iz uporabe, ne iz načrta:

1. **Širina ploščice (`widthPx`, 200–1600 px)** — vdelana stran je bila v ozki ploščici
   pretesna. Prva različica je širino izražala v STOLPCIH mreže (1–3), a s tem uporabnik ni
   mogel povedati "tole naj bo 480 px široko" — dejanska širina je bila odvisna od tega,
   koliko stolpcev je mreža tisti trenutek imela. Enota je zato ista kot pri višini:
   slikovna točka. Postavitev nadzorne plošče je posledično ovita vrstica (`flex-wrap`) in
   ne stolpčna mreža. Shranjena vrednost ostaja zgornja meja — na ožjem zaslonu se ploščica
   zoži na razpoložljivo širino.
2. **Povečan prikaz v modalnem oknu** (~96 vw/vh) za vrste `iframe`, `image` in `json`. Pri
   vdelani strani je čez okvir v pregledu prosojna plast, ki klik prestreže — brez nje bi
   klik pristal v tuji strani in ploščice ne bi bilo mogoče odpreti drugače kot z gumbom.
   `link` modala ne dobi: klik nanj odpre naslov, kar je njegov namen.
3. **Pojasnila ob nastavitvah** — znak "?" ob vsaki nastavitvi odpre okno s tremi deli: kaj
   nastavitev je, kako se nastavi, kaj velja, če je ne nastaviš. Besedila so v
   `shared/help/help-topics.ts`; komponenta sprejme samo ključ, ki tam obstaja (tip
   `HelpTopicId`), zato napačen ključ ne prevede.

## Odstopanja od prvotnega načrta

- **`provideAnimations()`** je bil v načrtu, a je bil ob izvedbi opuščen: `@angular/animations`
  ni nameščen, Ionic 8 pa svoje prehode izvaja sam. Dodati odvisnost zaradi klica brez
  učinka bi bila teža brez koristi.
- **`as const` na katalogu pojasnil** je najprej zožil vsak vnos na njegovo natančno
  obliko, zaradi česar vnos brez `ifEmpty` te lastnosti v tipu ni imel in se predloga ni
  prevedla. Napaka je bila vidna šele ob `ng build`: `tsc --noEmit` predlog NE preverja.
  Odpravljeno z izrecno tipizacijo (`helpTopic()` vrne `HelpTopic`).
- **Prepoved izklopa zavihka `dashboard`** je bila v načrtu, a se je izkazala za napačno:
  `tabGuard` za `/dashboard` naredi izrecno izjemo in ga vedno spusti skozi, zato izklop
  zavihek samo skrije iz menija in nikogar ne zaklene. Varovalo velja samo za `settings`.
  (Obstoječi pogodbeni test v `tests/contract/settings.spec.ts` se na to zanaša.)
