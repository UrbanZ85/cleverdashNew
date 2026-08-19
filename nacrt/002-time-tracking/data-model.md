# 002 — Podatkovni model

MongoDB 7, Mongoose 8. Vsa polja `camelCase`, vse kolekcije v angleščini.
Časovni instanti so `Date` v UTC. Koledarski dnevi so nizi `YYYY-MM-DD`, izračunani v
`Europe/Ljubljana` — glej `research.md` §4.

Vse kolekcije imajo `createdAt` in `updatedAt` (`timestamps: true`).

---

## Pregled

```
User ──< Device
     ──< ApiKey
     ──< RefreshToken

RemoteSession ──< TrackingLocation ──< TrackingProfile ──< PlannedAction ──< ActionAttempt
                                                                │
                                                                └─> ActionRecord (zaključeno)

Holiday        ─┐
AbsencePeriod  ─┼─> CalendarDay (izpeljano, predpomnjeno)
TrackingProfile ┘

Heartbeat, NotificationRecord, IdempotencyRecord, WebhookEndpoint, WebhookDelivery
```

---

## `remoteSessions`

Seja pri delodajalcu. Ločena od lokacije, ker se en piškotek uporablja za več lokacij, in
ker se menja pogosto in neodvisno od vsega ostalega.

| polje | tip | opomba |
|---|---|---|
| `name` | string | npr. "e-računi Agenda" |
| `cookieName` | string | `ItcClientID` |
| `cookieValue` | string | **občutljivo**, nikoli v odgovorih API-ja v celoti |
| `cookieDomain` | string | `e-racuni.com` |
| `expiresAt` | Date? | rok veljavnosti, če je znan |
| `status` | enum | `active`, `expiring`, `expired`, `unknown` |
| `lastVerifiedAt` | Date? | zadnje uspešno branje stanja s to sejo |
| `lastVerifyError` | string? | |

Indeksi: `{ status: 1, expiresAt: 1 }`

Iz `.env` starega sistema: `cookie_property_name`, `cookie_property_value`,
`cookie_property_domain`, `cookie_property_expires`.

> `expiresAt` je informativen. Merodajno je `lastVerifiedAt` skupaj z izidom branja —
> seja lahko poteče pred navedenim rokom. Stari sistem je hranil `1737717074`
> (24. 1. 2025) in ga nikoli ni preverjal.

## `trackingLocations`

| polje | tip | opomba |
|---|---|---|
| `name` | string | "Agenda LJ", "Doma" |
| `url` | string | naslov clock-in strani |
| `sessionId` | ObjectId → `remoteSessions` | |
| `coordinateTemplate` | object | `{ latitude: "46.0629_6", longitude: "14.5602_9" }` |
| `jitterMeters` | number | privzeto 10 |
| `active` | boolean | |

Indeksi: `{ name: 1 }` unikatno

`coordinateTemplate` ohranja obliko s `_` iz starega sistema (glej
`docs/legacy-engine.md` §3), a je pomen zdaj eksplicitno dokumentiran v shemi in ne skrit v
imenu funkcije. Razrešitev v konkretno število se zgodi v domenski plasti, ne v portalu.

## `trackingProfiles`

| polje | tip | opomba |
|---|---|---|
| `name` | string | "Pon–čet Agenda" |
| `daysOfWeek` | number[] | 1 = ponedeljek … 7 = nedelja (ISO) |
| `locationId` | ObjectId → `trackingLocations` | |
| `mode` | enum | `AUTO`, `REMIND_ONLY`, `OFF` |
| `actions` | ActionPlan[] | glej spodaj |
| `graceMinutes` | number | privzeto 10 |
| `maxDelayMinutes` | number | privzeto 90; po tem `missed`, ne izvedi |
| `maxAttempts` | number | privzeto 3 |
| `retryBackoffSeconds` | number[] | privzeto `[30, 120, 300]` |
| `maxReminders` | number | privzeto 3 |
| `reminderIntervalMinutes` | number | privzeto 10 |
| `active` | boolean | |

`ActionPlan`:

| polje | tip | opomba |
|---|---|---|
| `actionName` | string | **točno besedilo gumba**, npr. `Prijava na delo` |
| `localTime` | string | `"06:18:00"`, lokalni čas brez datuma |
| `jitterSeconds` | number | privzeto 300; dejanski čas = `localTime + random(0..jitterSeconds)` |
| `order` | number | vrstni red v dnevu |
| `mode` | enum? | prevlada nad načinom profila, če je nastavljen |
| `enabled` | boolean | |

Indeksi: `{ active: 1 }`, `{ daysOfWeek: 1 }`

> `daysOfWeek` uporablja ISO številčenje (1 = ponedeljek). Stari sistem uporablja
> `Date.getDay()`, kjer je 0 = nedelja, in zapis `[1,2,3,4]` tam pomeni pon–čet.
> Migracija mora to pretvoriti, sicer se urnik premakne za en dan.

> `actions` je seznam in ne fiksna polja (`workdaystart`, `lunchStart`, `lunchEnd`,
> `workdayEnd` v starem modelu). Tako je mogoč dan brez malice ali z dvema odmoroma, brez
> spremembe sheme.

## `plannedActions`

Tekoči načrt. Majhna kolekcija — nekaj vnosov na dan.

| polje | tip | opomba |
|---|---|---|
| `localDate` | string | `YYYY-MM-DD` v `Europe/Ljubljana` |
| `profileId` | ObjectId → `trackingProfiles` | |
| `locationId` | ObjectId → `trackingLocations` | posnetek, ker se lokacija profila lahko spremeni |
| `actionName` | string | |
| `actionOrder` | number | |
| `scheduledAt` | Date | UTC instant, **z že vračunanim raztrosom** |
| `baseLocalTime` | string | `"06:18:00"`, za prikaz "načrtovano ob" |
| `mode` | enum | veljavni način ob sestavljanju |
| `state` | enum | glej diagram spodaj |
| `attemptCount` | number | |
| `nextAttemptAt` | Date? | |
| `reminderCount` | number | |
| `lastReminderAt` | Date? | |
| `source` | enum | `schedule`, `manual`, `api` |
| `stateBefore` | enum? | prebrano stanje ure pred |
| `stateAfter` | enum? | prebrano stanje ure po |
| `completedAt` | Date? | |
| `failureReason` | string? | |
| `correlationId` | string | za povezovanje dnevnikov |

**Indeksi:**

```
{ localDate: 1, profileId: 1, actionName: 1 }   unikatno   ← preprečuje podvajanje
{ state: 1, scheduledAt: 1 }                                ← poizvedba po zapadlih
{ state: 1, nextAttemptAt: 1 }                              ← ponovni poskusi
{ localDate: -1 }
```

Prvi indeks je neposredna zaščita pred napako iz `docs/legacy-engine.md` §4.3.
Sestavljanje načrta uporablja `updateOne(..., { upsert: true })` na tem ključu, zato je
ponovni zagon varen.

**Prehodi stanj:**

```
planned ──> due ──> running ──> succeeded
                            ├─> already_done
                            └─> failed          (poskusi izčrpani)
planned ──> missed          (zamuda > maxDelayMinutes, ali maxReminders dosežen)
planned ──> skipped         (uporabnik)
planned ──> cancelled       (dan je postal dela prost)
```

Prehod `due → running` je atomaren `findOneAndUpdate` s pogojem na trenutno stanje in služi
kot zaklep. Glej `plan.md` §B.3.

## `actionAttempts`

| polje | tip |
|---|---|
| `plannedActionId` | ObjectId → `plannedActions` |
| `attemptNumber` | number |
| `startedAt`, `finishedAt` | Date |
| `outcome` | enum: `verified`, `not_verified`, `action_unavailable`, `unexpected_state`, `browser_error`, `session_expired`, `timeout` |
| `availableActionsBefore` | string[] |
| `availableActionsAfter` | string[] |
| `clockStateBefore`, `clockStateAfter` | enum |
| `errorMessage` | string? |
| `screenshotPath` | string? |
| `durationMs` | number |

Indeksi: `{ plannedActionId: 1, attemptNumber: 1 }`, `{ startedAt: -1 }`

Kolekcija s TTL na `startedAt` **ni** primerna, ker želimo poskuse obdržati; brišejo se
samo posnetki zaslona (glej §Čiščenje).

## `actionRecords`

Trajna zgodovina. Zaključena akcija se prepiše sem in iz `plannedActions` se lahko odstrani
po nastavljenem obdobju, da tekoči načrt ostane majhen — enak vzorec kot
`schedulerTimesHistory` v starem sistemu.

Vsebuje vsa polja `plannedActions` ob zaključku, plus:

| polje | tip |
|---|---|
| `finalOutcome` | enum: `succeeded`, `failed`, `missed`, `skipped`, `already_done`, `cancelled` |
| `attemptSummary` | `{ count, firstAt, lastAt }` |
| `profileName`, `locationName`, `actionName` | string — **denormalizirano**, da zgodovina ostane berljiva, ko se profil preimenuje ali izbriše |
| `note` | string? — za ročne popravke |

Indeksi: `{ localDate: -1 }`, `{ profileId: 1, localDate: -1 }`,
`{ finalOutcome: 1, localDate: -1 }`

Zapisi so nespremenljivi (FR-052). Popravek je nov zapis z `note`.

## `holidays`

| polje | tip | opomba |
|---|---|---|
| `date` | string | `YYYY-MM-DD` |
| `name` | string | slovensko ime |
| `isWorkFree` | boolean | |
| `isHoliday` | boolean | |
| `source` | enum | `computed`, `manual`, `imported` |

Indeksi: `{ date: 1 }` unikatno

Ločena polja `isHoliday` in `isWorkFree`, ker 17. avgust in 23. november sta praznika, ki
nista dela prosta — glej `research.md` §5. Za urnik šteje samo `isWorkFree`.
`source: manual` prevlada nad `computed`.

## `absencePeriods`

| polje | tip |
|---|---|
| `type` | enum: `vacation`, `sick`, `other` |
| `startDate`, `endDate` | string `YYYY-MM-DD`, oba **vključena** |
| `note` | string? |
| `profileIds` | ObjectId[]? — prazno pomeni vse profile |

Indeksi: `{ startDate: 1, endDate: 1 }`

Vključenost `endDate` je zapisana namenoma. Dopust "od 1. do 15." pomeni, da je 15. še
prost — to je najpogostejši vir napak za en dan pri tovrstnih modelih.

## `calendarDays`

Predpomnjena izpeljana odločitev. Ni vir resnice — ta so `holidays`, `absencePeriods` in
profil. Obstaja, da je odločitev vidna, revizijsko sledljiva in stabilna.

| polje | tip |
|---|---|
| `localDate` | string |
| `profileId` | ObjectId |
| `status` | enum: `workday`, `weekend`, `holiday`, `vacation`, `sick`, `other`, `forced` |
| `reason` | string — berljivo, npr. "Marijino vnebovzetje" |
| `resolvedAt` | Date |

Indeksi: `{ localDate: 1, profileId: 1 }` unikatno

Ob spremembi praznikov, odsotnosti ali profila se prizadeti vnosi razveljavijo in
prihodnje `plannedActions` na dela prostih dneh preidejo v `cancelled`.

## `calendarOverrides`

| polje | tip |
|---|---|
| `localDate` | string |
| `profileId` | ObjectId? — prazno pomeni vse |
| `kind` | enum: `forceWorkday`, `forceNonWorking` |
| `note` | string? |

Indeksi: `{ localDate: 1, profileId: 1 }` unikatno

Najvišja prednost v odločitvi (FR-014).

## `devices`

| polje | tip |
|---|---|
| `userId` | ObjectId |
| `fcmToken` | string |
| `platform` | enum: `android`, `web` |
| `description` | string? |
| `active` | boolean |
| `lastSeenAt` | Date |
| `failureCount` | number |

Indeksi: `{ fcmToken: 1 }` unikatno, `{ userId: 1, active: 1 }`

Ob `messaging/registration-token-not-registered` se zapis takoj deaktivira. Stari sistem
žetonov ne čisti (`deviceToken` je vgnezden seznam v `users`, brez čiščenja).

## `notificationRecords`

| polje | tip |
|---|---|
| `type` | enum: `reminder`, `confirmation`, `failure`, `health`, `session` |
| `title`, `body` | string |
| `deviceId` | ObjectId? |
| `plannedActionId` | ObjectId? |
| `deliveryStatus` | enum: `sent`, `failed`, `suppressed` |
| `error` | string? |
| `dedupeKey` | string |

Indeksi: `{ dedupeKey: 1, createdAt: -1 }`, `{ createdAt: -1 }`, TTL 90 dni

`dedupeKey` uveljavlja FR-074 (brez dveh enakih obvestil za isto akcijo v istem intervalu).

## `heartbeats`

| polje | tip |
|---|---|
| `tickAt` | Date |
| `durationMs` | number |
| `plansBuilt`, `actionsProcessed`, `errors` | number |
| `externalPingOk` | boolean |

Indeksi: `{ tickAt: -1 }`, TTL 14 dni

## `idempotencyRecords`

| polje | tip |
|---|---|
| `key` | string |
| `method`, `path` | string |
| `requestHash` | string |
| `responseStatus` | number |
| `responseBody` | Mixed |
| `state` | enum: `in_progress`, `completed` |

Indeksi: `{ key: 1, method: 1, path: 1 }` unikatno, TTL 24 ur na `createdAt`

`state: in_progress` se vstavi **pred** izvedbo, da dve vzporedni zahtevi z istim ključem
ne izvedeta akcije dvakrat. Druga dobi 409, dokler prva ne konča.

## `apiKeys`

| polje | tip |
|---|---|
| `name` | string |
| `keyHash` | string — Argon2id ali scrypt |
| `keyPrefix` | string — prvih 8 znakov, za prikaz |
| `scopes` | string[] |
| `lastUsedAt` | Date? |
| `expiresAt` | Date? |
| `revokedAt` | Date? |

Indeksi: `{ keyPrefix: 1 }`, `{ revokedAt: 1 }`

Skrivnost se prikaže samo ob ustvarjanju in se nikoli ne shrani v čitljivi obliki.

## `webhookEndpoints` in `webhookDeliveries`

`webhookEndpoints`: `url`, `events[]`, `secret` (občutljivo), `active`.

`webhookDeliveries`: `endpointId`, `event`, `payload`, `attemptCount`, `responseStatus`,
`deliveredAt`, `nextAttemptAt`. TTL 30 dni.

---

## Čiščenje

| Kaj | Politika |
|---|---|
| posnetki zaslona | brisanje datotek po 30 dneh, zapis `actionAttempts` ostane, `screenshotPath` se izprazni |
| `plannedActions` | po prepisu v `actionRecords` in 90 dneh |
| `heartbeats` | TTL 14 dni |
| `notificationRecords` | TTL 90 dni |
| `idempotencyRecords` | TTL 24 ur |
| `webhookDeliveries` | TTL 30 dni |
| `actionRecords` | **nikoli samodejno** — to je evidenca |

Zdravstveni endpoint poroča o prostoru na disku. Polnjenje diska s posnetki zaslona je
najbolj verjeten način, da se ta sistem po nekaj mesecih sam ustavi.

---

## Preslikava iz starega modela

| staro | novo |
|---|---|
| `schedulers.daysToStart` (0 = ned) | `trackingProfiles.daysOfWeek` (ISO, 1 = pon) — **pretvori** |
| `schedulers.isWorkingFromHome` | izpade; ime akcije (`Delo od doma`) to že pove |
| `schedulers.workdaystart` … `workdayEnd` | `trackingProfiles.actions[]` |
| `schedulers.pauseUntil` | `absencePeriods` vrste `other` |
| `schedulers.siteProperties.url` in `.coordinates` | `trackingLocations` |
| `schedulers.siteProperties.cookie` | `remoteSessions` (vrednost se **ne** prenese) |
| `schedulerTimes` | `plannedActions` (staro se zavrže, načrt se sestavi znova) |
| `schedulerTimesHistory` | `actionRecords` z `source: legacy` |
| `users.deviceToken[]` | `devices` |
| `schedulerTimes.executed: boolean` | `plannedActions.state` — dvojiška zastavica je bila premalo, ker ni ločila "izvedeno" od "preverjeno uspešno" |
