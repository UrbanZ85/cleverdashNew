# Data Model: Administratorska analitika (014)

## Ena nova zbirka, in ta ni v modulu

| zbirka | kje živi | zakaj tam |
|---|---|---|
| `usagecounters` | `platform/usage/usage-counter.model.ts` | telemetrija ni pojem analitike (research.md §1) |

Modul `analytics` **nima nobene svoje zbirke**. Bere `usagecounters`, `users` in zbirke treh
tujih modulov — vse samo za branje, brez uvoza njihovih modelov (research.md §2).

---

## `UsageCounter` — dnevni števec uporabe

Edina nova hranjena telemetrija v aplikaciji.

| polje | tip | opomba |
|---|---|---|
| `userId` | `ObjectId` → `User` | **fizična oseba za tipkovnico** (`req.actor`), ne lastnik podatkov |
| `day` | `String` | `yyyy-LL-dd` v `Europe/Ljubljana` (člen V.4, research.md §11) |
| `kind` | `'login' \| 'tab-view'` | `enum`, ne prost niz |
| `key` | `String` | oznaka zavihka; pri `login` konstanta `'-'` |
| `count` | `Number` | število dogodkov tistega dne |
| `lastAt` | `Date` | UTC instant zadnjega dogodka — nosi okno iz research.md §4 |
| `expiresAt` | `Date` | `day` + `USAGE_RETENTION_DAYS`; TTL indeks |

`timestamps: false`, `versionKey: false`. `createdAt` bi bil tretji čas ob `day` in `lastAt`, ki ne
odgovarja na nobeno vprašanje.

### Zakaj `key: '-'` in ne `null`

Unikatni indeks čez `(userId, day, kind, key)` je edino, kar loči dvojnik od povečanja
(research.md §4). Mongo `null` v unikatnem indeksu obravnava kot vrednost, `sparse`/delni indeks
pa bi vrstice prijav iz indeksa izpustil in dvojnike spustil skozi. Konstanta je nerodnejša za
oko in pravilna za indeks; `partialFilterExpression` bi bila druga pot, a bi terjala dva indeksa
za eno zbirko.

### Indeksi

```
{ userId: 1, day: 1, kind: 1, key: 1 }   unique   — zapora pred dvojnim štetjem
{ day: 1, kind: 1 }                                — lestvica cele namestitve v obdobju
{ kind: 1, key: 1, day: 1 }                        — lestvica po zavihku
{ expiresAt: 1 }                         TTL       — rok hrambe (research.md §5)
```

TTL je tu **pravilen**, za razliko od `platform/cache/model.ts`, kjer je izrecno prepovedan: star
predpomnjen podatek je tam zadnje znano stanje, star števec pa ni nič.

### Kaj v tej zbirki NE bo nikoli

IP naslov, uporabniški agent, pot (URL), identifikator seje, identifikator naprave, časovni žig
posameznega ogleda, trajanje. FR-024 in člen XII; iz te zbirke poti osebe po aplikaciji ni mogoče
sestaviti, ker so ogledi istega dne en sam zapis brez vrstnega reda.

---

## Brane zbirke (tuje, samo za branje)

Tabela virov je koda — `modules/analytics/domain/storage-sources.ts` — in ne vzdrževan seznam
drugje. Zbirka, ki je v namestitvi ni, se izpusti (FR-012).

| id vira | zbirka | lastnik | bajti | šteje |
|---|---|---|---|---|
| `recipe-images` | `recipeimages` | `ownerId` | `byteSize` + `$binarySize: '$thumb'` | slike |
| `note-audio` | `noteaudios` | `userId` | `byteSize` | posnetki |
| `shared-files` | `sharedfiles` | `userId` | `byteSize` | datoteke (prejete posebej: `inboxId ≠ null`) |
| `recipes` | `recipes` | `ownerId` | — | recepti |
| `notes` | `notes` | `userId` | — | beležke |

Imena zbirk so **prepisana** in jih prevajalnik ne varuje. Varovalo je enotski test, ki vsako ime
iz te tabele preveri proti zbirkam zagnane aplikacije (research.md §2).

---

## Izračunani zapisi (niso shranjeni)

### `StorageSnapshot`

```
computedAt        Date
cachedUntil       Date
sources[]         { id, label, present, totalBytes, recordCount }
totalBytes        number        vsota po virih
byUser[]          { userId|null, displayName, maskedEmail, totalBytes, perSource{}, counts{} }
volume            { path, totalBytes, freeBytes } | null   (+ `unavailableReason`)
integrity         IntegrityReport
```

`byUser` vsebuje **vsako osebo z računom**, tudi z ničlo (FR-008), in največ eno vrstico
`userId: null` za zapise brez ujemajočega lastnika (FR-013). `maskedEmail` gre skozi isto
funkcijo kot imenik oseb — `platform/users/user-directory.ts#maskEmail` (FR-009); analitika je
`platform/`, zato jo sme uvoziti.

### `IntegrityReport`

```
checkedAt         Date
findings[]        { kind, recordCount, bytes }
clean             boolean
```

`kind` ∈ `missing-content` (zapis brez vsebine), `orphan-blob` (vsebina brez zapisa, starejša od
24 h), `broken-record` (zapis označen kot okvarjen), `stalled-upload` (nalaganje obtičalo).
`clean: true` je **izrecna trditev** in ne prazen seznam (FR-019) — prazno polje se ne da ločiti
od preverbe, ki ni tekla.

### `UsageSnapshot`

```
window            { days, fromDay, toDay }
coverage          { dataSince: string|null, retentionDays, truncated: boolean }
logins            { total, activeUsers, inactiveUsers }
byUser[]          { userId, displayName, maskedEmail, logins, lastLoginAt, lastActiveAt, tabs{} }
tabs[]            { tabId, title, views, users }
```

`coverage.dataSince` je najstarejši `day` v zbirki; `truncated` pove, da izbrano obdobje sega
pred ta dan ali pred rok hrambe (FR-038). Brez tega polja je prazno obdobje neločljivo od
"nihče se ni prijavljal".

`lastLoginAt` pride iz `users.lastLoginAt` in ne iz števcev — obstaja že od 004 in pokriva osebe,
ki se po uvedbi te funkcionalnosti še niso prijavile.

`tabs[]` je polnjen z ničlami iz razrešenega registra zavihkov, ne iz najdenih vrstic (FR-039).

---

## Nove spremenljivke okolja

Vse s privzetkom → `docker compose up` iz čiste kopije deluje brez dopolnjevanja `.env`
(kakovostna vrata, točka 4).

| spremenljivka | privzeto | pomen |
|---|---|---|
| `USAGE_RETENTION_DAYS` | `400` | rok hrambe telemetrije (13 mesecev = primerjava z lanskim mesecem) |
| `USAGE_VIEW_DEDUPE_SECONDS` | `60` | okno, v katerem ponoven ogled istega zavihka ne šteje |
| `ANALYTICS_CACHE_SECONDS` | `300` | veljavnost predpomnjenega pregleda porabe |
| `ANALYTICS_ORPHAN_GRACE_HOURS` | `24` | starost, pod katero sirota ni prijavljena |

`USAGE_RETENTION_DAYS` se **bere** — kar je opomba nase, ne fraza: `SCREENSHOT_RETENTION_DAYS` v
tem istem `env.ts` je razglašen in ga ne bere nihče (opozorilo v `cleanup.service.ts`). Tu rok
uveljavlja TTL indeks, kar pomeni, da se prazen tek ne more zgoditi tiho — indeks je bodisi
ustvarjen bodisi ga ni.
