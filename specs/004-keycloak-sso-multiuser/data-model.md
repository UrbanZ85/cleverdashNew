# Data Model: Prijava prek Keycloaka in večuporabniška aplikacija

Vir: `spec.md` (Key Entities) + dejanski pregled obstoječih shem v
`apps/api/src/modules/auth/models/`, `apps/api/src/modules/settings/model.ts`,
`apps/api/src/modules/cameras/models/`, `apps/api/src/modules/time-tracking/models/` —
glej [research.md](./research.md) §5 za razvrstitev "osebno vs. skupno". MongoDB 7,
Mongoose 8, `camelCase` polja, angleške kolekcije.

## Pregled

```
NOVO:
  User (PRENOVLJEN — glej spodaj)
  KeycloakSession (nadomesti SessionFamily + RefreshToken)

ODSTRANJENO:
  LoginAttempt, session-family.model.ts, refresh-token.model.ts (staro), password polja na User

SPREMENJENO (dodan `userId: ObjectId → User, required, indexed`):
  Settings          (iz singleton `_id: 'singleton'` v eno-na-uporabnika)
  Camera, CameraGroup
  TrackingProfile, TrackingLocation
  PlannedAction, ActionRecord, ActionAttempt, CalendarDay, CalendarOverride,
  AbsencePeriod, RemoteSession

NESPREMENJENO (ostajajo skupni, brez `userId` — research.md §5):
  Holiday, CameraEmbedAllowlist, ExternalCache
```

## Načelo lastništva zapisov (spremenjeno iz 001/003)

001 in 003 sta izrecno določili: "sistem je enouporabniški, nobena kolekcija ne nosi
`userId`/`ownerId`". **Ta funkcionalnost to načelo obrne** za osebne podatke (spec.md
Clarifications, 24. 8. 2026), z eno izjemo — referenčni/varnostni podatki (`Holiday`,
`CameraEmbedAllowlist`), ki niso ničigar osebna preferenca, ostanejo skupni (research.md §5).

---

## `User` (prenovljen)

| polje | tip | opomba |
|---|---|---|
| `keycloakSubject` | string, required, unique, indexed | Keycloakov stabilen `sub` claim — PRIMARNI identifikator (FR-003), ne e-pošta |
| `email` | string | zadnja znana vrednost iz Keycloaka; NI unikatna (FR-003 — sprememba e-pošte v Keycloaku ne sme trčiti ob star zapis) |
| `displayName` | string | iz Keycloakovega `name`/`preferred_username` claima |
| `scopes` | string[], default `[]` | izpeljano iz Keycloak vlog/skupin ob vsaki prijavi/obnovitvi (research.md §6), NE ročno urejano |
| `lastLoginAt` | Date \| null | |
| `migratedLegacyDataAt` | Date \| null | nastavljeno, ko ta uporabnik prevzame podedovane enouporabniške podatke (FR-013/FR-014, research.md §7); `null` = še ni prevzel/ni admin |

Odstranjeno iz starega `User`: `email` kot unique+lowercase ključ, `passwordHash`,
`mustChangePassword` (FR-017).

Indeksi: `{ keycloakSubject: 1 }` unique.

---

## `KeycloakSession` (nadomesti `SessionFamily` + `RefreshToken`)

| polje | tip | opomba |
|---|---|---|
| `userId` | ObjectId → `User`, required | |
| `deviceLabel` | string, default `'Neznana naprava'` | nespremenjeno iz `SessionFamily` |
| `platform` | enum `web`\|`android` | nespremenjeno |
| `encryptedRefreshToken` | string | Keycloakov `refresh_token`, šifriran prek `platform/crypto/secret-box.ts` (ponovna uporaba iz 003 — glej research.md §2), NIKOLI v čistem besedilu na disku |
| `state` | enum `active`\|`revoked` | nespremenjeno |
| `lastUsedAt` | Date | nespremenjeno |

Indeksi: `{ userId: 1 }`, `{ state: 1 }` (podedovano iz `SessionFamily`).

**Opomba o rotaciji**: za razliko od starega `RefreshToken` modela (lasten naključni žeton,
zaznava ponovne uporabe prek `used`/`replacedBy` verige) rotacijo zdaj izvaja Keycloak sam;
`KeycloakSession` hrani samo TRENUTNO veljavno šifrirano vrednost, ne verige. Zaznava zlorabe
(ponovna uporaba starega refresh_tokena) je Keycloakova odgovornost, enako kot je zdaj njegova
odgovornost throttling neuspelih prijav (research.md §2).

---

## `Settings` (spremenjen iz singleton)

Shema polj (`weather`, `theme`, `tiles`, `tabs`, `cameraDataSaverEnabled`, `updatedAt`) se **ne
spremeni** — samo ključ dokumenta:

| polje | tip | opomba |
|---|---|---|
| `userId` | ObjectId → `User`, required, unique | NADOMESTI `_id: 'singleton'` — eno-na-eno z uporabnikom |
| … | … | nespremenjeno iz obstoječe sheme |

`getOrCreateSettings()` postane `getOrCreateSettingsForUser(userId)`: `findOne({ userId }) ??
create({ userId, ...privzetki })`. Klicna mesta (`settings/router.ts`) dobijo `userId` iz
`req.auth.subjectId`, ki je na voljo že danes prek `requireScopes()` — **brez spremembe
zahteve/odgovora API-ja**, glej plan.md Summary.

Indeksi: `{ userId: 1 }` unique (nadomesti prejšnji fiksni `_id`).

---

## `Camera` / `CameraGroup`

Nespremenjeno razen dodanega `userId: ObjectId → User, required, indexed`. Obstoječi indeksi
(`{ groupId: 1, order: 1 }`, `{ active: 1 }`) se razširijo na `{ userId: 1, groupId: 1, order:
1 }` in `{ userId: 1, active: 1 }`, da poizvedba po uporabniku ostane en indeksni dostop, ne
poln pregled zbirke.

`CameraEmbedAllowlist` — **brez** `userId` (research.md §5: varnostna meja, ne osebna
preferenca).

---

## `TrackingProfile` / `TrackingLocation`

Dodan `userId: ObjectId → User, required, indexed`. Obstoječi komentar v kodi ("več profilov
je os ZNOTRAJ ene osebe") ostane resničen — `userId` samo pove, KATERA oseba; število
profilov na osebo se ne omejuje.

## `PlannedAction`, `ActionRecord`, `ActionAttempt`, `CalendarDay`, `CalendarOverride`, `AbsencePeriod`, `RemoteSession`

Vse dodajo `userId: ObjectId → User, required, indexed`, DENORMALIZIRANO glede na
`profileId`/`locationId` (plan.md Complexity Tracking utemeljuje zakaj: neposreden filter je
varnejši od izpeljanega). Obstoječi unikatni indeksi, ki vključujejo `profileId`/`localDate`
ipd. (npr. `calendarDaySchema.index({ localDate: 1, profileId: 1 }, { unique: true })`),
**ostanejo nespremenjeni** — `profileId` je že posredno enoličen na uporabnika (profil sam
ima `userId`), dodaten `userId` na otroški kolekciji je za HITER filter/varnostno mrežo, ne
nov del unikatnega ključa.

## `Holiday`

Brez sprememb sheme — ostaja skupna referenčna tabela (research.md §5). `date` ostane
globalno unikaten.

---

## Migracija obstoječih podatkov (FR-013/FR-014, research.md §7)

Ni nova kolekcija, ampak enkraten korak ob zagonu (`migration.service.ts`, glej plan.md
Project Structure): najde dokumente brez `userId` (ali `Settings` z `_id: 'singleton'`),
in jih ob prvi prijavi uporabnika z `admin` scope-om priredi njemu. Označi se z
`User.migratedLegacyDataAt`, da se ne ponovi.

## Validacijska pravila, ki se NE spreminjajo

Vsa domenska validacija, ki že obstaja (`domain/camera-validation.ts`,
`domain/scheduling.ts`, itd.), ostane nespremenjena — ta funkcionalnost ne dotika poslovne
logike posameznih modulov, samo lastništvo zapisov (plan.md Summary).
