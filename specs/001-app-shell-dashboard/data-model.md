# 001 — Podatkovni model (Phase 1)

Bere se skupaj s [plan.md](./plan.md), [research.md](./research.md) in
[contracts/openapi.yaml](./contracts/openapi.yaml).

MongoDB 7 + Mongoose 8. Imena kolekcij in polj so angleška, `camelCase` (člen X). Vsi časi
so shranjeni kot UTC instant; prikaz in izračun koledarskih dni gresta prek
`Europe/Ljubljana` (člen V.4).

## Načelo lastništva zapisov

Sistem je enouporabniški (FR-016), zato **domenski zapisi ne nosijo lastnika**: `settings`,
`externalCache` in razporeditev ploščic obstajajo v enem izvodu.

Izjema so avtentikacijski zapisi — `sessionFamilies` in `refreshTokens` nosijo `userId`, ker
je račun njihov *predmet*, ne njihov lastnik. Seja brez navedbe računa, ki ga predstavlja,
ni seja. To razlikovanje je zapisano zato, da ga kdo pozneje ne "poenoti" v eno ali drugo
smer.

`devices` prav tako nosi `userId`, ker je naprava vezana na prijavo (FR-017: ena naprava =
ena družina sej).

---

## `users`

Edini uporabnik sistema (FR-016). Zapis nastane ob prvem zagonu iz `ADMIN_EMAIL` in
`ADMIN_INITIAL_PASSWORD` (FR-014).

| Polje | Tip | Pravila |
|---|---|---|
| `_id` | ObjectId | |
| `email` | string | obvezno, unikatno, oblika e-pošte, shranjeno v malih črkah |
| `passwordHash` | string | obvezno; Argon2id (`PASSWORD_HASH_ALGO`). Čistopis se nikoli ne shrani ne zabeleži (FR-010) |
| `scopes` | string[] | privzeto `["admin"]`; avtorizacija se preverja po obsegih, ne po veljavnosti žetona (FR-013) |
| `mustChangePassword` | boolean | `true` ob ustvarjanju iz okolja; dokler je `true`, vsak endpoint razen odjave in menjave gesla vrne `403` (FR-014) |
| `lastLoginAt` | Date \| null | |
| `createdAt`, `updatedAt` | Date | |

**Indeksi:** `email` unikatno.

**Pravila:** geslo ob menjavi najmanj 12 znakov. Ustvarjanje dodatnih uporabnikov ni
podprto — endpointa za to ni v pogodbi (Out of Scope v specifikaciji).

---

## `sessionFamilies`

Ena družina na napravo. Nosilec preklica po FR-012.

| Polje | Tip | Pravila |
|---|---|---|
| `_id` | ObjectId | ta vrednost je `familyId` |
| `userId` | ObjectId → `users` | obvezno |
| `deviceLabel` | string | človeku berljiva oznaka, npr. "Chrome, Windows" ali "Pixel 7" |
| `platform` | `"web" \| "android"` | |
| `state` | `"active" \| "revoked"` | |
| `revokedReason` | `"logout" \| "reuseDetected" \| "expired" \| null` | `reuseDetected` je zaznana zloraba (FR-012) |
| `createdAt`, `lastUsedAt` | Date | |

**Indeksi:** `userId`, `state`.

### Prehodi stanj

```
                    prijava
                       │
                       ▼
                   [active] ──────── odjava ────────► [revoked: logout]
                       │
                       ├── uporaba veljavnega žetona ──► [active]  (rotacija)
                       │
                       ├── uporaba porabljenega žetona ─► [revoked: reuseDetected]
                       │                                   in vsi žetoni družine
                       │                                   označeni kot revoked
                       │
                       └── iztek zadnjega žetona ──────► [revoked: expired]
```

Preklic družine **ne vpliva na druge družine** istega uporabnika (FR-017). To je namen
delitve na družine.

---

## `refreshTokens`

Veriga rotirajočih žetonov znotraj družine. Žeton je naključna vrednost, ne JWT
([research.md](./research.md) §7).

| Polje | Tip | Pravila |
|---|---|---|
| `_id` | ObjectId | |
| `familyId` | ObjectId → `sessionFamilies` | obvezno |
| `userId` | ObjectId → `users` | obvezno |
| `tokenHash` | string | obvezno, unikatno; shranjena je samo zgoščena vrednost |
| `state` | `"active" \| "used" \| "revoked"` | `used` nastane ob rotaciji |
| `replacedBy` | ObjectId \| null | kaže na naslednika v verigi |
| `issuedAt` | Date | |
| `expiresAt` | Date | `REFRESH_TOKEN_TTL`, privzeto 30 dni |
| `usedAt` | Date \| null | |

**Indeksi:** `tokenHash` unikatno; `familyId`; `expiresAt`.

**Pravila:**

- Znotraj družine sme biti največ en žeton v stanju `active`. Uveljavljeno z delnim
  unikatnim indeksom na `(familyId, state)` za `state: "active"`.
- Predložen žeton v stanju `used` ali `revoked` → prekliči celotno družino in zavrni
  zahtevo (FR-012).
- Zapisi se **ne** brišejo s TTL indeksom, dokler družina ni preklicana; veriga je dokaz
  ob preiskovanju zlorabe. Čiščenje preklicanih družin, starejših od 90 dni, je ločeno
  vzdrževalno opravilo.

---

## `apiKeys`

Avtentikacija za avtomatizacijo (člen III). V 001 nastane kot del plasti `platform/`;
uporabnik je 002 in n8n.

| Polje | Tip | Pravila |
|---|---|---|
| `_id` | ObjectId | |
| `label` | string | obvezno, človeku berljivo |
| `keyHash` | string | obvezno, unikatno; čistopis se pokaže **samo enkrat**, ob ustvarjanju |
| `keyPrefix` | string | prvih 8 znakov, da je ključ prepoznaven v seznamu brez razkritja |
| `scopes` | string[] | obvezno, neprazno; ključ brez obsegov ne sme obstajati |
| `lastUsedAt` | Date \| null | |
| `expiresAt` | Date \| null | |
| `revokedAt` | Date \| null | |

**Indeksi:** `keyHash` unikatno; `keyPrefix`.

**Pravila:** ključ z praznim `scopes` je neveljaven zapis — obseg je bistvo omejenosti
ključa (člen III). Preklic je `revokedAt`, ne brisanje, da ostane sled v dnevniku.

---

## `devices`

Naprava, registrirana za potisna obvestila (FR-030, FR-034).

| Polje | Tip | Pravila |
|---|---|---|
| `_id` | ObjectId | |
| `userId` | ObjectId → `users` | obvezno |
| `pushToken` | string | obvezno, unikatno |
| `platform` | `"web" \| "android"` | |
| `channels` | string[] | privzeto `["system"]`; v 002 se doda `"reminders"` ([research.md](./research.md) §10) |
| `lastSeenAt` | Date | |
| `lastDeliveryAt` | Date \| null | |
| `failureCount` | number | privzeto 0 |

**Indeksi:** `pushToken` unikatno; `userId`.

**Pravila:** zavrnitev ponudnika z `UNREGISTERED` ali `INVALID_ARGUMENT` je signal za
**brisanje zapisa**, ne za ponovni poskus (FR-034). Prehodne napake povečajo `failureCount`
in se ponovijo.

---

## `settings`

Singleton: en dokument za celoten sistem (FR-016).

| Polje | Tip | Pravila |
|---|---|---|
| `_id` | fiksna vrednost `"singleton"` | preprečuje nastanek drugega dokumenta |
| `weather.locationName` | string | privzeto `Ljubljana` (`ARSO_DEFAULT_LOCATION`) |
| `weather.latitude` | number \| null | privzeto 46.0629; druga znana lokacija 45.9611 |
| `weather.longitude` | number \| null | privzeto 14.5602; druga znana lokacija 14.2978 |
| `theme` | `"system" \| "light" \| "dark"` | privzeto `system` (FR-006) |
| `tiles` | `TileLayoutEntry[]` | vrstni red in vidnost, ohranjeno med sejami (FR-028) |
| `tabs` | `Record<string, TabOverride>` | prekritja registra po `id` zavihka (FR-003) |
| `updatedAt` | Date | |

```ts
interface TileLayoutEntry {
  type: string;      // vrsta ploščice, npr. "weather" | "radar"
  position: number;  // vrstni red v mreži
  visible: boolean;
  config?: Record<string, unknown>;  // nastavitev, specifična za vrsto
}

interface TabOverride {
  enabled?: boolean;  // izklop zavihka brez nove izdaje (FR-003)
  order?: number;
}
```

**Pravila:** `position` je unikaten znotraj `tiles`. Neznana vrsta ploščice v `tiles` se ob
branju **preskoči in zabeleži**, ne povzroči napake — drugače bi odstranjena vrsta ploščice
podrla ves dashboard. Enako velja za `tabs`: prekritje za neobstoječ `id` se ignorira.

---

## `externalCache`

Predpomnilnik zunanjih virov ([research.md](./research.md) §2 in §4). Hrani tudi **zadnji
znani podatek** za FR-026.

| Polje | Tip | Pravila |
|---|---|---|
| `_id` | ObjectId | |
| `key` | string | obvezno, unikatno; npr. `radar:si0-rm-anim`, `weather:Ljubljana` |
| `sourceUrl` | string | naslov izvora, iz katerega je zapis pridobljen |
| `contentType` | string | npr. `image/gif`, `application/json` |
| `payload` | Buffer \| Mixed | telo odgovora; binarno za sliko, dokument za JSON |
| `fetchedAt` | Date | čas uspešne pridobitve |
| `expiresAt` | Date | `fetchedAt` + TTL (`RADAR_CACHE_SECONDS` oz. `WEATHER_CACHE_SECONDS`) |
| `etag` | string \| null | za pogojno zahtevo |
| `lastModified` | string \| null | za pogojno zahtevo |
| `lastAttemptAt` | Date | čas zadnjega poskusa, uspešnega ali ne |
| `lastError` | string \| null | vzrok zadnje neuspele pridobitve |
| `consecutiveFailures` | number | privzeto 0 |

**Indeksi:** `key` unikatno.

**Pravilo, ki ga je najlažje zlomiti:** na tej kolekciji **ne sme biti Mongo TTL indeksa**
in iztečen zapis se **ne briše**. Iztek pomeni samo "čas je za osvežitev"; iztečen zapis je
natanko tisto, kar se prikaže, ko vir ne odgovori (FR-026). TTL indeks bi FR-026 tiho
onemogočil, in sicer šele takrat, ko bi vir prvič odpovedal — torej v produkciji, ne v
testu. Zato ima test za to svoj vnos v [research.md](./research.md) §13.

**Izpeljano stanje, ki ga vidi odjemalec:**

| Stanje zapisa | Kaj vidi uporabnik |
|---|---|
| `expiresAt` v prihodnosti | svež podatek, brez opozorila |
| `expiresAt` v preteklosti, osvežitev uspela | svež podatek |
| `expiresAt` v preteklosti, osvežitev spodletela | zadnji znani podatek z oznako starosti (`fetchedAt`) |
| zapisa ni | sporočilo, da podatka še ni, in možnost ponovnega poskusa |

Odločitev, kateri od teh štirih primerov velja, je **čista funkcija** v
`apps/api/src/domain/` — brez omrežja in brez baze, zato enotsko testirana (člen IX).

---

## `loginAttempts`

Omejevanje hitrosti in sled poskusov prijave (FR-015).

| Polje | Tip | Pravila |
|---|---|---|
| `_id` | ObjectId | |
| `email` | string | poskušan naslov, v malih črkah |
| `ipHash` | string | zgoščen naslov odjemalca; čistopis IP se ne shrani |
| `success` | boolean | |
| `attemptedAt` | Date | |

**Indeksi:** `(email, attemptedAt)`; TTL indeks na `attemptedAt` s hrambo 30 dni.

Tu je TTL indeks **pravilen** — nasprotno od `externalCache` — ker star poskus prijave nima
uporabne vrednosti, predpomnjen podatek pa jo ima.

**Pravila:** po 5 neuspelih poskusih za isti `email` v 15 minutah se prijava zavrne z `429`
in enotnim sporočilom, ki ne razkriva, ali račun obstaja.

---

## `idempotencyKeys`

Podpora glavi `Idempotency-Key` (člen III).

| Polje | Tip | Pravila |
|---|---|---|
| `_id` | ObjectId | |
| `key` | string | obvezno; vrednost glave |
| `endpoint` | string | metoda in pot, da isti ključ na drugi poti ne trči |
| `requestHash` | string | zgoščeno telo zahteve |
| `statusCode` | number | shranjen odgovor |
| `responseBody` | Mixed | shranjen odgovor |
| `createdAt` | Date | |

**Indeksi:** `(key, endpoint)` unikatno; TTL indeks na `createdAt` s hrambo 24 ur.

**Pravila:** isti `key` z **drugačnim** `requestHash` je napaka `422` — ključ je obljuba, da
gre za isto zahtevo. Poti `POST /auth/login` in `POST /auth/refresh` te glave ne sprejmeta;
utemeljitev je v tabeli Complexity Tracking v [plan.md](./plan.md).

---

## Povzetek indeksov

| Kolekcija | Indeks | Vrsta |
|---|---|---|
| `users` | `email` | unikaten |
| `sessionFamilies` | `userId`, `state` | navaden |
| `refreshTokens` | `tokenHash` | unikaten |
| `refreshTokens` | `(familyId, state)` kjer `state="active"` | delni unikaten |
| `refreshTokens` | `familyId`, `expiresAt` | navaden |
| `apiKeys` | `keyHash` | unikaten |
| `apiKeys` | `keyPrefix` | navaden |
| `devices` | `pushToken` | unikaten |
| `devices` | `userId` | navaden |
| `externalCache` | `key` | unikaten (**brez TTL**) |
| `loginAttempts` | `(email, attemptedAt)` | navaden |
| `loginAttempts` | `attemptedAt` | TTL 30 dni |
| `idempotencyKeys` | `(key, endpoint)` | unikaten |
| `idempotencyKeys` | `createdAt` | TTL 24 ur |
