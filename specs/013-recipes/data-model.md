# Data Model: Recepti (013)

Dve zbirki. Razlog za delitev je v `research.md` §4: bajti slik se ob izpisu seznama ne smejo brati.

## `recipes`

Agregat. Vsebina, oznake, soudeleženci in javna povezava so v enem dokumentu, ker ta namestitev
nima transakcij čez več dokumentov (`research.md` §13).

| polje | tip | opombe |
|---|---|---|
| `_id` | ObjectId | |
| `ownerId` | ObjectId → User | **`ownerId`, ne `userId`.** `userId` v tej bazi pomeni "zapis je zaseben in `{_id, userId}` je pogoj dostopa". Ta obljuba tu ne velja — soudeleženec bere zapis, ki ni njegov. Ponovna raba imena bi vsakega bodočega bralca zavedla v izolacijo, ki je ta model ne daje. Enak razlog kot `TodoList.ownerId` in enaka kategorija v `tests/unit/no-owner-fields.spec.ts`. |
| `title` | String, req., ≤200 | Edino obvezno polje (FR-001). |
| `url` | String\|null, ≤2048 | Normaliziran (`domain/recipe-url.ts`). `null` je veljavno stanje (FR-002). |
| `description` | String\|null, ≤5000 | |
| `ingredients` | [String] ≤100 × ≤200 | Besedilo, ne razčlenjene količine (FR-004, `research.md` §12). |
| `steps` | [String] ≤100 × ≤2000 | |
| `prepMinutes` | Number\|null | 1–10080 (teden). |
| `servings` | Number\|null | 1–100. |
| `tags` | [String] ≤20 | Prikazna oblika. Iskanje teče prek `searchText`. |
| `rating` | Number\|null | 1–5. Lastnikova (FR-035). |
| `lastCookedAt` | Date\|null | `null` = nikoli. Pri razvrstitvi gre PRED najstarejši datum (FR-053). |
| `cookCount` | Number, default 0 | |
| `coverImageId` | ObjectId\|null → RecipeImage | Ob brisanju naslovne se prenese (FR-024). |
| `members` | [RecipeMember] | Glej spodaj. |
| `publicShare` | PublicShare\|null | Glej spodaj. |
| `sourceStatus` | 'none'\|'ok'\|'skipped'\|'failed' | Izid branja strani. `none` = naslova ni. Izid je POLJE, ne dnevnik (člen VII). |
| `sourceFetchedAt` | Date\|null | |
| `searchText` | String | Izpeljano ob vsakem pisanju: ime + opis + sestavine + oznake, zloženo (`research.md` §10). |
| `lastModifiedBy` | ObjectId\|null → User | Kdo je nazadnje karkoli spremenil (FR-009). |
| `createdAt`, `updatedAt` | Date | `timestamps: true` |

`versionKey: false` — brez optimistične sočasnosti, namerno (`research.md` §14).

### Poddokument `RecipeMember`

| polje | tip | opombe |
|---|---|---|
| `userId` | ObjectId → User | |
| `role` | 'view' \| 'edit' | Dve stopnji, ne tri (`research.md` §2). |
| `addedAt` | Date | |
| `seenAt` | Date\|null | `null` = soudeleženec recepta še ni odprl, zato je zanj označen kot NOV (FR-038). |

`_id: false` — **članstvo JE `userId`.** Lasten `_id` bi isti stvari dal drugo identiteto in dopustil
dva vnosa za istega človeka z različnima vlogama; na tako stanje razsodnik dostopa nima enoličnega
odgovora. Enoličnosti NE uveljavlja indeks (enoličen indeks nad `members.userId` bi prepovedal
članstvo v dveh receptih), ampak pogoj `'members.userId': { $ne: ... }` v `$push`.

### Poddokument `PublicShare`

| polje | tip | opombe |
|---|---|---|
| `token` | String | 22 znakov `base64url` = 16 naključnih bajtov (`research.md` §7). |
| `createdAt` | Date | |
| `revokedAt` | Date\|null | `null` = veljavna. Preklic je nepovraten; nova izdaja je NOV `token` (FR-045). |

Zapis se ob preklicu OBDRŽI (`revokedAt` se postavi) in ne pobriše: brisanje bi izbrisalo tudi
dejstvo, da je povezava obstajala.

### Indeksi

```
{ ownerId: 1, updatedAt: -1 }        // seznam lastnih receptov, privzeta razvrstitev
{ 'members.userId': 1, updatedAt: -1 } // seznam deljenih receptov — brez tega bi bil COLLSCAN
{ 'publicShare.token': 1 }           // javna pot; redek (sparse) — večina receptov ga nima
{ ownerId: 1, tags: 1 }              // filter po oznaki
```

Indeksa nad `searchText` NI in ne bo (`research.md` §10).

`publicShare.token` **ni enoličen**: enoličen redek indeks nad poljem v poddokumentu se v Mongu ob
`null` vede drugače, kot bralec pričakuje, pri 128 bitih naključja pa trk ni nevarnost, pred katero
bi se bilo treba braniti z indeksom. Enoličnost je lastnost generatorja.

## `recipeimages`

| polje | tip | opombe |
|---|---|---|
| `_id` | ObjectId | |
| `recipeId` | ObjectId → Recipe | |
| `ownerId` | ObjectId → User | Lastnik RECEPTA ob nalaganju. Podvojeno namerno: omogoča počiščenje osirotelih slik brez branja receptov. |
| `uploadedBy` | ObjectId → User | Lahko je soudeleženec `edit`, ne le lastnik. |
| `mimeType` | String | IZKLJUČNO iz podpisa datoteke (FR-021, `research.md` §6). Nikoli tisto, kar je poslal odjemalec. |
| `byteSize` | Number | |
| `width`, `height` | Number\|null | Kar je izmeril odjemalec; `null`, kadar ni sporočil. Strežnik slike ne dekodira. |
| `data` | Buffer, `select: false` | Izvirnik. `select: false` pomeni, da noben izpis ne prenese bajtov (FR-025). |
| `thumb` | Buffer\|null, `select: false` | Pomanjšava za seznam (`research.md` §5). `null` = odjemalec je ni poslal; takrat se postreže izvirnik. |
| `thumbMimeType` | String\|null | |
| `caption` | String\|null, ≤200 | |
| `createdAt`, `updatedAt` | Date | |

### Indeksi

```
{ recipeId: 1, createdAt: 1 }  // slike enega recepta v vrstnem redu nalaganja
{ ownerId: 1 }                 // počiščenje in kvota
```

## Kaj v modelu NAMENOMA ni

- **Imena in e-pošte soudeležencev** (FR-039). Samo `userId`; imena bere
  `platform/users/directory.service.ts` ob izpisu, da preimenovanje v Keycloaku ne pusti zamrznjene
  kopije. Prevzeto iz 010.
- **Zgodovina sprememb.** Vidna sta zadnji avtor in čas. Cela sled bi bila svoja zbirka in svoja
  odločitev.
- **Ocene soudeležencev** (`research.md` §3).
- **Kopije deljenega recepta.** Deljen recept je EN zapis z več bralci. Izbris pri lastniku ga
  odnese vsem (US4 scenarij 5) — to je posledica deljenja, ne napaka.
- **Datotečni sistem.** Slike so v bazi (`research.md` §4); ta modul ne uvaja novega nosilca v
  `infra/docker-compose.yml`.
