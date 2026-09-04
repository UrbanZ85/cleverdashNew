# Data Model: Shranjeni linki (008)

**Spec**: [spec.md](./spec.md) | **Raziskava**: [research.md](./research.md)

## Pregled

Dve novi zbirki, obe osebni (`userId` je del vsake poizvedbe, po vzorcu 004). Nič se ne
spremeni v obstoječih zbirkah — razen ene vrednosti v `Settings.tiles`, ki je `Mixed` in
sheme ne potrebuje.

| Zbirka | Kaj je | Nastane iz |
|---|---|---|
| `savedLinks` | posamezna shranjena stran | US1, US4 |
| `savedLinkGroups` | mapa, v katero uporabnik razvrsti zapise | US3 |

Predpomnjeni faviconi NISO nova zbirka: uporabijo obstoječo `platform/cache` (ista, kot jo
uporabljata ARSO radar in posnetek kamere), s ključem po gostitelju.

Zgradba modula je prevzeta od beležk (007): domenska plast je v `modules/saved-links/domain/`,
zapisi so osebni, tuj zapis vrne 404. Polja `title` / `url` / `comment` so naslednica polj
`linkName` / `linkUrl` / `linkDescription` iz stare strani "Useful links" (research.md §16).

## Načelo lastništva zapisov (podedovano iz 004)

`userId` je del VSAKE poizvedbe, ne le filtra ob branju seznama. Zapis drugega uporabnika
zato vrne **404, ne 403** — da obstoj tujega zapisa ni podatek, ki bi ga API razkril.

## `savedLinks`

| Polje | Tip | Obvezno | Opomba |
|---|---|---|---|
| `userId` | ObjectId → `User` | da | lastnik; del vsake poizvedbe |
| `url` | String (≤ 2048) | da | NORMALIZIRAN naslov (`domain/link-url.ts`), tak, kot ga odpre brskalnik |
| `title` | String (≤ 200) | da | ime, kot ga vidi uporabnik; nikoli prazno — nadomestek je gostitelj naslova |
| `titleSource` | `'manual' \| 'auto'` | da | `manual` prepreči, da bi samodejno branje prepisalo uporabnikov vnos (FR-014) |
| `comment` | String (≤ 1000) \| null | ne | zakaj sem to shranil |
| `icon` | String \| null | ne | ime Ionicons ikone; `null` pomeni "brez izbire" in prepusti mesto faviconu (research.md §9) |
| `faviconUrl` | String \| null | ne | RAZREŠENI naslov favicona; slike ni v zapisu (research.md §4) |
| `groupId` | ObjectId → `SavedLinkGroup` \| null | ne | `null` = nerazvrščeno, veljavno stanje |
| `order` | Number | da | vrstni red znotraj mape; nov zapis dobi najmanjšo vrednost (na vrh, FR-033) |
| `searchText` | String | da | izpeljano ob vsakem pisanju: zloženo `title + url + comment` (research.md §6) |
| `metadataStatus` | `'ok' \| 'skipped' \| 'failed'` | da | izid zadnjega branja strani; `skipped` = naslov ni prestal varovala |
| `metadataFetchedAt` | Date \| null | ne | kdaj je bilo nazadnje brano — podlaga za "osveži podatke strani" |
| `createdAt` / `updatedAt` | Date | da | `timestamps: true` |

**Indeksi**

- `{ userId: 1, groupId: 1, order: 1 }` — seznam v vrstnem redu, kot ga vidi uporabnik.
- `{ userId: 1, createdAt: -1 }` — ploščica na nadzorni plošči (6 nazadnje shranjenih).
- `{ userId: 1, url: 1 }` — **ni** unikaten: dvojnik je dovoljen in se samo javi
  (`duplicateOfId`, research.md §10).

Indeksa nad `searchText` NI: iskanje je nesidran regularni izraz, ki ga indeks tako ali tako
ne bi pospešil, zbirka pa je po predpostavki iz spec.md nekaj sto zapisov na uporabnika.

**Pravila veljavnosti** (uveljavljena z Zod v routerju, izračunana v domenski plasti)

1. `url` gre skozi `normalizeLinkUrl()`: obrezani presledki, manjkajoča shema dopolnjena v
   `https://`, gostitelj v mali začetnici. Shema, ki ni `http`/`https`, je zavrnjena (400).
2. `title` prazen ali izpuščen → nadomestek je gostitelj naslova, `titleSource: 'auto'`.
3. `icon` mora biti ime iz nabora, ki ga pozna odjemalec (isti vzorec kot 005 — nabor, ne
   prost niz).
4. `groupId`, ki ne obstaja ali pripada drugemu uporabniku → 404.

## `savedLinkGroups`

| Polje | Tip | Obvezno | Opomba |
|---|---|---|---|
| `userId` | ObjectId → `User` | da | lastnik |
| `name` | String (≤ 60) | da | slovensko ime, ki ga vpiše uporabnik |
| `order` | Number | da | vrstni red map |
| `collapsed` | Boolean | da | zloženo stanje preživi ponovni obisk (US3, scenarij 2) |
| `createdAt` / `updatedAt` | Date | da | |

**Indeksi**

- `{ userId: 1, order: 1 }`.
- `{ userId: 1, name: 1 }`, unikaten — dve mapi z istim imenom pri istem uporabniku sta
  napaka; pri različnih uporabnikih ne (vzorec 004).

**Brisanje mape** (FR-022, research.md §8): najprej `updateMany({ userId, groupId }, { $set:
{ groupId: null } })`, šele nato `deleteOne` mape. Odgovor vrne `movedLinks` — koliko
zapisov je postalo nerazvrščenih.

## Izpeljano: favicon

Ni polje v bazi in ni zbirka. `faviconUrl` v zapisu je samo NASLOV; bajti se prenesejo ob
zahtevi `GET /saved-links/{id}/favicon` prek `platform/cache/service.ts`:

- ključ: `favicon:<gostitelj>` — deljen med vsemi zapisi istega gostitelja in med
  uporabniki (favicon ni oseben podatek; naslov, s katerega izvira, pa se v ključu ne
  pojavi kot cel zapis);
- TTL: 7 dni;
- neuspeh: 404, odjemalec izriše ikono (research.md §9). To ni napaka, ki bi jo bilo treba
  javiti uporabniku.

## Izpeljano: `metadataStatus`

| Vrednost | Kdaj | Kaj vidi uporabnik |
|---|---|---|
| `ok` | stran je odgovorila, ime prebrano | ime strani |
| `skipped` | naslov ni prestal varovala odhodnih naslovov (zasebno omrežje, poverilnice v naslovu) | vpisano ime ali gostitelj, brez opozorila kot napake |
| `failed` | prekoračen proračun, napaka omrežja, odgovor ni HTML | vpisano ime ali gostitelj + možnost "osveži podatke strani" |

## Vnos v `Settings.tiles`

Ploščica 008 je navaden vnos v obstoječi razporeditvi:

```json
{ "type": "saved-links", "position": 3, "visible": true }
```

`config` ni potreben — ploščica kaže 6 nazadnje shranjenih zapisov (research.md §11).
`Settings.tiles` je `Mixed` in sheme ne spreminjamo.

## Migracije

Nobene. Obe zbirki sta novi, obstoječih dokumentov se 008 ne dotakne. Uporabnik brez
shranjenih zapisov dobi prazno stanje (FR-071), ne napake.
