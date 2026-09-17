# Implementation Plan: Recepti

**Branch**: `013-recipes` | **Spec**: [spec.md](spec.md)
**Input**: "Nov modul za recepte. URL, opis, deljenje med uporabniki, pripenjanje slik."

## Summary

Zavihek `recipes`: kuharica, v kateri je recept lahko povezava, prepis z lista ali oboje, s
slikami, deljena z drugimi uporabniki te namestitve ali z javno povezavo za nekoga brez računa.

Trije obstoječi vzorci se sestavijo v enega; nobeden ni nov:

| kaj | od kod | kaj se spremeni |
|---|---|---|
| deljenje (`ownerId` + `members`, razsodnik dostopa) | 010 Opravila | stopnji sta dve, ne tri; zaklepa ni |
| javna stran z žetonom | 009 Deljenje datotek | brez gesla; samo branje |
| binarna priloga kot `Buffer` v Mongu | 007 Beležke | + pomanjšava, + preverba podpisa |
| normalizacija naslova, `searchText`, branje tuje strani | 008 Shranjeni linki | naslov NEOBVEZEN; bere se `ld+json`, ne `<title>` |

Vsi štirje so **prepisani, ne uvoženi** (člen I; uveljavlja `cleverdash/module-boundary` v
`eslint.config.js`). Podvojitev je namerna: brisanje modula 010 ne sme pokvariti receptov.

## Technical Context

- **Jezik**: TypeScript, Node 22, Express 5, Mongoose 8 (zaledje); Angular 20 + Ionic 8 (odjemalec).
- **Baza**: MongoDB kot SAMOSTOJEN strežnik brez `--replSet` → transakcij čez več dokumentov NI.
  Iz tega sledi agregat (research.md §13) in pisanje izključno prek operatorjev.
- **Nove odvisnosti**: NOBENE. `sharp` je bil zavrnjen (research.md §5), `multer`/`busboy` prav
  tako — telo je surovo prek `express.raw`, kot pri zvoku beležk.
- **Nov nosilec v `infra/docker-compose.yml`**: NE. Slike so v bazi (research.md §4).
- **Nove spremenljivke okolja**: sedem, VSE s privzetkom → `docker compose up` iz čiste kopije
  deluje brez dopolnjevanja `.env` (kakovostna vrata, točka 4).

## Constitution Check

| člen | kako je izpolnjen |
|---|---|
| I — modul je samostojen | Ena mapa na vsaki strani + pet vpisov. Nobenega uvoza iz drugega modula; skupno je samo `platform/`, `domain/`, `core/`, `shared/`. |
| II — enoten izvor | `cors()` se ne namešča. Javni odgovor nosi `no-store`, slike `private` — pred nami je skupni Caddy. |
| III — API ključ je prvorazreden odjemalec | Vse poti nosijo obsege; lastnik se za klicatelja brez osebe razreši kot pri 009/010. |
| IV — poverilnice ne uhajajo | `reason` uvoza gre v dnevnik, ne v odgovor; varovalo naslove s poverilnicami zavrne pred klicem. |
| VI — tiha napaka je hrošč | `sourceStatus` je POLJE v odgovoru, ne vrstica v dnevniku. Zavrnitve povedo, kaj storiti. |
| VIII — brez odhodnih klicev brez povoda | Tuja stran se obišče ob nastanku in ob izrecnem kliku. Nikoli po urniku. |
| IX — domenska plast brez okvira | Sedem datotek v `domain/`, vse testabilne brez baze in brez strežnika. |
| X — angleški vmesnik, slovenska domena | `id: 'recipes'`, `route: '/recipes'`; naslov zavihka "Recepti". |
| XI — vmesnik ne ugiba | `capabilities` prihaja s strežnika; odjemalec kontrol ne izpeljuje iz vloge. |

### Kakovostna vrata

1. `npm run typecheck` čist za novo kodo. *(Opomba: v `tests/contract/timesheet/workbook.spec.ts`
   obstaja napaka `Buffer<ArrayBufferLike>`, ki je starejša od te funkcionalnosti in je ta veja ne
   povzroča ne popravlja.)*
2. `npx eslint` čist nad obema mapama modula.
3. Testi: 87 enotskih + 56 pogodbenih (zaledje) + 9 enotskih (odjemalec).
4. Zagon iz čiste kopije brez dopolnjevanja `.env`.

## Project Structure

### Dokumentacija

```
specs/013-recipes/
├── spec.md
├── plan.md            ← ta datoteka
├── research.md
├── data-model.md
├── tasks.md
└── contracts/openapi.yaml
```

### Nova koda (API)

```
apps/api/src/modules/recipes/
├── scopes.ts                          recipes:read | write | share
├── domain/
│   ├── capabilities.ts                CEL model pravic — ena funkcija, ena tabela
│   ├── recipe-input.ts                zod sheme, splitLines, normalizeTags, filter
│   ├── recipe-url.ts                  normalizacija; naslov je NEOBVEZEN
│   ├── search-text.ts                 zlaganje šumnikov, searchText, foldTag
│   ├── image-type.ts                  podpis datoteke, varno ime, meje
│   ├── recipe-jsonld.ts               schema.org/Recipe iz HTML
│   └── share-token.ts                 128-bitni žeton, oblika, javni naslov
├── models/
│   ├── recipe.model.ts                agregat
│   └── recipe-image.model.ts          Buffer + select:false
├── services/
│   ├── recipe-access.service.ts       EDINA vrata do recepta
│   ├── recipe-import.service.ts       odhodni klic z varovalom
│   └── public-throttle.service.ts     dušenje javne poti
├── router.ts                          prijavljene poti
└── public.router.ts                   /shared-recipes/* — brez requireScopes
```

### Nova koda (web)

```
apps/web/src/app/features/recipes/
├── recipes.model.ts                   tipi + čiste funkcije za prikaz
├── recipes.api.ts                     odjemalec
├── recipes.page.ts                    seznam (mreža kartic)
├── recipe-editor.page.ts              ogled / urejanje / KUHANJE
├── recipe-share-dialog.component.ts   soudeleženci + javna povezava
├── image-resize.ts                    pomanjšava v <canvas>
└── public/recipe-public.page.ts       /r/:token — brez authGuard
```

### Vpisi zunaj modula (in nič drugega)

1. `apps/api/src/platform/tabs/registry.ts` — en vnos (`order: 1`, edina prosta vrednost).
2. `apps/api/src/main.ts` — dva `apiV1Router.use(...)` (prijavljeni + javni).
3. `apps/api/src/platform/keycloak/role-mapping.ts` — trije nizi v `BASE_USER_SCOPES`.
4. `apps/web/src/app/app.routes.ts` — tri poti (seznam, urejevalnik, javna).
5. `apps/web/src/app/core/icons/register-icons.ts` + `tests/unit/icons.spec.ts` — pet ikon.
6. `apps/api/src/platform/config/env.ts` + `.env.example` — sedem spremenljivk s privzetki.

Točke 1–5 so natanko koraki iz `docs/adding-a-tab.md`. Šesta je dodatek, ki ga ta vodič ne
našteva, ker ga modul z nastavitvami potrebuje, modul brez njih pa ne.

## Complexity Tracking

| odstopanje | zakaj je vseeno izbrano |
|---|---|
| **Podvojena logika iz 008, 009, 010** (normalizacija naslova, žeton, razsodnik dostopa) | Člen I prepoveduje uvoz med moduli. Posplošitev v `platform/` je bila zavrnjena: vsaka od treh se v tem modulu POMENSKO razlikuje (naslov je neobvezen, žeton je brez gesla, stopnji sta dve), zato bi skupna različica potrebovala zastavice — in zastavica v skupni varnostni kodi je slabša od dveh jasnih kopij. |
| **Pomanjšava nastane na ODJEMALCU** | `sharp` je izvorni gradnik z ločenim paketom za arm64 in amd64. Cena se plača ob vsaki namestitvi, korist je ena pomanjšana slika. Posledica (pomanjšava je nepreverjen vnos) je pokrita: gre skozi isto preverbo podpisa kot izvirnik. |
| **Dušenje javne poti je v POMNILNIKU**, ne v bazi kot pri 009 | Tam se ugiba geslo in števec mora preživeti zagon. Tu se ugiba 128-bitni žeton, česar dušenje ne prepreči in ne poskuša — brani pred pregledovanjem. Pisanje v bazo ob vsakem obisku javne strani bi bilo dražje od tega, kar brani. |
| **Dve polji za oznake** (`tags` + `tagKeys`) | Z enim bi bilo treba izbrati med lepim izpisom (`Sladice`) in delujočim filtrom (`sladice`). |

## Kaj je ostalo zunaj in zakaj

- **Ploščica na nadzorni plošči.** Terja vpis v register ploščic zunaj modula, česar
  `docs/adding-a-tab.md` ne dovoljuje brez svoje odločitve. Podatki zanjo (`sort=cooked`,
  `limit`) v API-ju že obstajajo, tako da je to pozneje dodatek in ne predelava.
- **Preračun količin na porcije in nakupovalni seznam.** Terja razčlenjene sestavine
  (research.md §12). Kadar bo naročeno, bo razčlenitev sloj NAD nizom — niz ostane resnica.
- **Zaklep recepta** (kot `locked` v 010). Vse odločitve gredo že zdaj skozi eno funkcijo, zato
  je dodatek ene vrstice v tabeli in ne predelava.
