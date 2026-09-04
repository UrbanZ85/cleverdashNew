# Data Model: Beleženje časa

Vir: `nacrt/002-time-tracking/data-model.md`, prilagojen na dejansko stanje 001 (polja
preverjena proti `apps/api/src/platform/{notifications,apikeys,idempotency}/*.model.ts`) in
na razrešitve iz [spec.md](./spec.md) Clarifications (FR-008 `OFF`, FR-045 polnočno
zaprtje). MongoDB 7, Mongoose 8, `camelCase` polja, angleške kolekcije. Časovni instanti so
`Date` (UTC); koledarski dnevi so nizi `YYYY-MM-DD` v `Europe/Ljubljana` (research.md §4).
Vse nove kolekcije imajo `createdAt`/`updatedAt` (`timestamps: true`), razen kjer je
navedeno drugače (sledi vzorcu obstoječih 001 modelov).

## Pregled

```
Ponovno uporabljeno iz 001, BREZ sprememb sheme:
  User, Device (platform/notifications), ApiKey (platform/apikeys),
  IdempotencyKey (platform/idempotency)

Novo v 002:
  RemoteSession ──< TrackingLocation ──< TrackingProfile ──< PlannedAction ──< ActionAttempt
                                                                   │
                                                                   └─> ActionRecord (zaključeno)

  Holiday        ─┐
  AbsencePeriod  ─┼─> CalendarDay (izpeljano, predpomnjeno)
  TrackingProfile ┘
  CalendarOverride (najvišja prednost, FR-014)

  Heartbeat (razširitev platform/health, glej research.md §8 "Integracijska podrobnost")
  NotificationRecord (novo v platform/notifications — FR-072/FR-073, glej research.md §6)
  WebhookEndpoint, WebhookDelivery (novo v platform/webhooks — FR-083)
```

Modul `time-tracking` je lastnik: `remoteSessions`, `trackingLocations`,
`trackingProfiles`, `plannedActions`, `actionAttempts`, `actionRecords`, `holidays`,
`absencePeriods`, `calendarDays`, `calendarOverrides`. `NotificationRecord`,
`WebhookEndpoint`, `WebhookDelivery` in razširjen `Heartbeat` živijo v `platform/`, ker so
splošni mehanizmi, ki jih bo verjetno uporabila tudi 003 (člen I: moduli ne podvajajo
skupnih storitev).

## Načelo lastništva zapisov (podedovano iz 001)

Sistem je enouporabniški (FR-016 iz 001). Nobena od novih kolekcij spodaj ne nosi polja
`userId` ali `ownerId` — so domenski podatki ene osebe, ne podatki, ki bi jih bilo treba
ločevati med uporabniki. To vključno z `TrackingProfile`: več profilov je os znotraj ene
osebe (različni urniki), ne mehanizem za več oseb (spec.md, Assumptions).

---

## `remoteSessions`

Seja pri delodajalcu. Ločena od lokacije, ker se en piškotek lahko uporabi za več lokacij
in ker se menja pogosto, neodvisno od vsega ostalega (FR-091).

| polje | tip | opomba |
|---|---|---|
| `name` | string | npr. "e-računi Agenda" |
| `cookieName` | string | `ItcClientID` |
| `cookieValue` | string | **občutljivo**; middleware odgovorov ga MORA odstraniti iz vsakega JSON izhoda razen ob internem branju (FR-092) |
| `cookieDomain` | string | `e-racuni.com` |
| `expiresAt` | Date \| null | rok veljavnosti, če je znan — informativen, glej opombo spodaj |
| `status` | enum: `active`, `expiring`, `expired`, `unknown` | |
| `lastVerifiedAt` | Date \| null | zadnje uspešno branje stanja s to sejo |
| `lastVerifyError` | string \| null | |

Indeksi: `{ status: 1, expiresAt: 1 }`

> `expiresAt` je informativen; merodajno je `lastVerifiedAt` skupaj z izidom zadnjega
> branja. Stari sistem je hranil pretekel datum in ga nikoli ni preverjal
> (`docs/legacy-engine.md` §4.10) — nov sistem status aktivno preračuna (Story 8, FR-063).

## `trackingLocations`

| polje | tip | opomba |
|---|---|---|
| `name` | string | "Agenda LJ", "Doma" — unikatno |
| `url` | string | naslov clock-in strani |
| `sessionId` | ObjectId → `remoteSessions` | |
| `startAction` | enum: `Prijava na delo`, `Prihod na delo`, `Delo od doma`, `Delo na terenu` | gumb, s katerim se na tej lokaciji ZAČNE delo (FR-090); privzeto `Prijava na delo` |
| `sendGeolocation` | boolean | ali se lega naprave sploh pošlje strani (FR-094); privzeto `true` |
| `coordinateTemplate.latitude` / `.longitude` | string | oblika `"46.0629_6"` — `_` je mesto naključne števke, glej `docs/legacy-engine.md` §3; obvezno le, kadar je `sendGeolocation` `true` |
| `jitterMeters` | number | privzeto 10 |
| `active` | boolean | |

Indeksi: `{ name: 1 }` unikatno

Razrešitev `coordinateTemplate` v konkretno število se zgodi v domenski plasti
(`apps/api/src/domain/`), ne v `ClockPortal` — portal prejme že razrešeno lokacijo
(`ResolvedLocation`), da ostane tanek vmesnik brez lastne logike (člen IX).

`startAction` je tu in ne v `trackingProfiles` zato, ker je izbira med štirimi gumbi za
začetek dela vezana na KRAJ, ne na urnik (FR-090): isti profil "6:00–14:00" velja iz
pisarne, od doma in s terena, spremeni se le gumb. V profilu bi ista razlika terjala tri
podvojene profile in s tem tri mesta, kjer se čas popravi.

`sendGeolocation` (FR-094) odloča v `location-resolver.service.ts`, ne v portalu: kadar je
`false`, `ResolvedLocation` polj `latitude`/`longitude` sploh **nima** in
`PuppeteerClockPortal` brskalniku dovoljenje za geolokacijo izrecno zavrne
(`overridePermissions(url, [])`). Prazen seznam je namenoma boljši od izpuščenega klica:
stran dobi `PERMISSION_DENIED` takoj, namesto da bi čakala na poziv, ki ga v brskalniku brez
človeka nikoli nihče ne potrdi. Vrednost `0, 0` bi bila napačna rešitev — to je veljavna
točka sredi Atlantika, ne "ne vem".

Razrešitev imena (`domain/clock-state.ts`, `resolveActionForLocation`) se zgodi ob
sestavljanju načrta, ne ob izvedbi: v `plannedActions.actionName` — in od tam v zgodovini,
obvestilih in webhookih — stoji tisto ime, ki bo res kliknjeno. Če se gumb lokacije
spremeni, ko je dan že načrtovan, se še neizvedena akcija **preimenuje na mestu** (čas
ostane); brez tega bi ostala načrtovana še stara različica in bi po izvedbi nove obvisela
kot zamujena.

## `trackingProfiles`

| polje | tip | opomba |
|---|---|---|
| `name` | string | "Pon–čet Agenda" |
| `daysOfWeek` | number[] | ISO: 1 = ponedeljek … 7 = nedelja — **ne** `Date.getDay()` (0 = nedelja), glej migracijsko opozorilo spodaj |
| `locationId` | ObjectId → `trackingLocations` | FR-004 |
| `mode` | enum: `AUTO`, `REMIND_ONLY`, `OFF` | **privzeto `AUTO`** ob ustvarjanju (FR-007). `OFF` ne ustvari `PlannedAction` za dneve tega profila, a `CalendarDay` se izračuna naprej (FR-008) |
| `actions` | `ActionPlan[]` | glej spodaj — seznam, ne fiksna polja (FR-002) |
| `graceMinutes` | number | privzeto 10 (FR-040) |
| `maxDelayMinutes` | number | privzeto 90; po tem `missed` namesto izvedbe (FR-062, Assumptions) |
| `maxAttempts` | number | privzeto 3 (FR-031) |
| `retryBackoffSeconds` | number[] | privzeto `[30, 120, 300]` |
| `maxReminders` | number | privzeto 3 (FR-041) |
| `reminderIntervalMinutes` | number | privzeto 10 |
| `active` | boolean | |

`ActionPlan` (podshema, brez lastne kolekcije):

| polje | tip | opomba |
|---|---|---|
| `actionName` | string | točno besedilo gumba, npr. `Prijava na delo` (člen X — ne prevaja se) |
| `localTime` | string | `"06:18:00"`, lokalni čas brez datuma |
| `jitterSeconds` | number | privzeto 300; dejanski čas = `localTime + random(0..jitterSeconds)`, **omejen navzgor** (glej FR-003 in `docs/legacy-engine.md` §4.4 — star sistem prelije v naslednjo uro) |
| `order` | number | vrstni red v dnevu |
| `enabled` | boolean | privzeto `true` |

Indeksi: `{ active: 1 }`, `{ daysOfWeek: 1 }`

> **Migracijsko opozorilo**: star sistem uporablja `Date.getDay()` (0 = nedelja);
> `daysOfWeek: [1,2,3,4]` tam pomeni pon–čet. Brez eksplicitne pretvorbe ob migraciji se
> urnik premakne za en dan (`docs/legacy-engine.md`, razdelek Preslikava).

FR-005/FR-006 uveljavljena na ravni servisa, ne indeksa: dva **aktivna** profila ne smeta
imeti presečišča v `daysOfWeek` — preverjeno ob `create`/`update`, zavrnjeno z `422` in
razumljivim sporočilom, ker gre za poslovno pravilo prek več dokumentov, ki ga MongoDB
indeks sam ne izrazi.

## `plannedActions`

Tekoči načrt — majhna kolekcija, nekaj vnosov na dan na profil.

| polje | tip | opomba |
|---|---|---|
| `localDate` | string | `YYYY-MM-DD` v `Europe/Ljubljana` |
| `profileId` | ObjectId → `trackingProfiles` | |
| `locationId` | ObjectId → `trackingLocations` | posnetek ob sestavljanju — če se lokacija profila kasneje spremeni, ta akcija ostane vezana na prvotno |
| `actionName` | string | |
| `actionOrder` | number | |
| `scheduledAt` | Date | UTC instant, **z že vračunanim raztrosom** (FR-003) |
| `baseLocalTime` | string | za prikaz "načrtovano ob" |
| `mode` | enum: `AUTO`, `REMIND_ONLY`, `OFF` | način profila, veljaven ob sestavljanju — snapshot, ne živa referenca |
| `state` | enum | glej diagram spodaj |
| `attemptCount` | number | privzeto 0 |
| `nextAttemptAt` | Date \| null | |
| `reminderCount` | number | privzeto 0 |
| `lastReminderAt` | Date \| null | |
| `source` | enum: `schedule`, `manual`, `api` | FR-050 |
| `stateBefore` / `stateAfter` | enum `ClockState` \| null | |
| `completedAt` | Date \| null | |
| `failureReason` | string \| null | |
| `correlationId` | string | za povezovanje strukturiranih dnevnikov |

**Indeksi:**

```
{ localDate: 1, profileId: 1, actionName: 1 }   unikatno   ← FR-034, ščiti pred docs/legacy-engine.md §4.3
{ state: 1, scheduledAt: 1 }                                ← poizvedba po zapadlih (§3 research.md)
{ state: 1, nextAttemptAt: 1 }                              ← ponovni poskusi
{ localDate: -1 }
```

Prvi indeks ni samo optimizacija — je edini mehanizem, ki fizično onemogoči podvojen
zapis za (dan, profil, akcija), ne glede na to, koliko instanc tika teče vzporedno.
Sestavljanje načrta uporablja `updateOne(..., { upsert: true })` na tem ključu.

**Prehodi stanj** (FR-045 dodano glede na clarify sejo 2026-08-20):

```
planned ──> due ──> running ──> succeeded
                            ├─> already_done
                            └─> failed          (poskusi izčrpani, FR-031)
planned/due/running ──> missed   (zamuda > maxDelayMinutes, ALI maxReminders dosežen,
                                   ALI prehod čez polnoč — glej spodaj)
planned ──> skipped            (uporabnik ročno preskoči)
planned ──> cancelled          (dan po sestavljanju načrta postal dela prost)
```

`running → missed` je edini prehod, ki prekine že tekoč niz poskusov — nastopi izključno
ob prehodu koledarskega dne (FR-045): tik pred vsakim drugim korakom najprej poišče
`localDate < today ∧ state ∉ {terminal}` in jih zapre, preden obdela kar koli za `today`.
Prehod `due → running` je atomaren `findOneAndUpdate` s pogojem na trenutno stanje in
služi hkrati kot zaklep (FR-034 — za en profil nikoli dve akciji hkrati).

## `actionAttempts`

| polje | tip |
|---|---|
| `plannedActionId` | ObjectId → `plannedActions` |
| `attemptNumber` | number |
| `startedAt`, `finishedAt` | Date |
| `outcome` | enum: `verified`, `not_verified`, `action_unavailable`, `unexpected_state`, `browser_error`, `session_expired`, `timeout` |
| `availableActionsBefore` / `availableActionsAfter` | string[] |
| `clockStateBefore` / `clockStateAfter` | enum `ClockState` |
| `errorMessage` | string \| null |
| `screenshotPath` | string \| null | prazno po samodejnem brisanju (FR-053) |
| `durationMs` | number |

Indeksi: `{ plannedActionId: 1, attemptNumber: 1 }`, `{ startedAt: -1 }`

**Brez TTL** — poskusi se obdržijo (FR-032); briše se samo datoteka posnetka zaslona
(§Čiščenje), zapis ostane.

## `actionRecords`

Trajna, nespremenljiva zgodovina (FR-052). Zaključena `plannedAction` se prepiše sem;
`plannedActions` se po `PLANNED_ACTION_RETENTION_DAYS` (privzeto 90) po prepisu odstrani,
da tekoči načrt ostane majhen.

Vsebuje vsa polja `plannedActions` ob zaključku, plus:

| polje | tip |
|---|---|
| `finalOutcome` | enum: `succeeded`, `failed`, `missed`, `skipped`, `already_done`, `cancelled` |
| `attemptSummary` | `{ count, firstAt, lastAt }` |
| `profileName`, `locationName` | string — **denormalizirano**, da zgodovina ostane berljiva, tudi če je profil pozneje preimenovan ali izbrisan |
| `note` | string \| null — popravek se doda sem, izvirni zapis se ne spreminja (FR-052) |

Indeksi: `{ localDate: -1 }`, `{ profileId: 1, localDate: -1 }`,
`{ finalOutcome: 1, localDate: -1 }`

**Nikoli samodejno brisano** — to je evidenca (FR-050), edina kolekcija te funkcionalnosti
brez politike čiščenja.

## `holidays`

| polje | tip | opomba |
|---|---|---|
| `date` | string | `YYYY-MM-DD` |
| `name` | string | slovensko ime |
| `isWorkFree` | boolean | **za urnik šteje samo to polje** — 17. avgust in 23. november sta `isHoliday: true, isWorkFree: false` (research.md §5) |
| `isHoliday` | boolean | |
| `source` | enum: `computed`, `manual`, `imported` | `manual` prevlada nad `computed` (FR-011) |

Indeksi: `{ date: 1 }` unikatno

## `absencePeriods`

| polje | tip | opomba |
|---|---|---|
| `type` | enum: `vacation`, `sick`, `other` | |
| `startDate`, `endDate` | string `YYYY-MM-DD` | oba **vključena** — "od 1. do 15." pomeni, da je 15. še prost dan (najpogostejši vir napak za en dan pri tovrstnih modelih) |
| `note` | string \| null | |
| `profileIds` | ObjectId[] \| null | prazno/`null` pomeni vse profile |

Indeksi: `{ startDate: 1, endDate: 1 }`

Prekrivanje z `CalendarOverride.kind: forceWorkday` za isti profil in datum se zavrne ob
vnosu druge izjeme (Story 6/7, edge case).

## `calendarDays`

Predpomnjena **izpeljana** odločitev — ni vir resnice (ta so `holidays`, `absencePeriods`,
`calendarOverrides` in profil sam), ampak jo naredi vidno, revizijsko sledljivo in stabilno
(FR-015). Ob spremembi katerega koli vira se prizadeti vnosi razveljavijo in prihodnje
`plannedActions` na na novo dela prostih dneh preidejo v `cancelled`.

| polje | tip |
|---|---|
| `localDate` | string |
| `profileId` | ObjectId → `trackingProfiles` |
| `status` | enum: `workday`, `weekend`, `holiday`, `vacation`, `sick`, `other`, `forced` |
| `reason` | string — berljivo, npr. "Marijino vnebovzetje" |
| `resolvedAt` | Date |

Indeksi: `{ localDate: 1, profileId: 1 }` unikatno

**Pomembno za FR-008**: `CalendarDay` se izračuna za profil **ne glede na njegov `mode`** —
tudi za `mode: OFF` profile, da je koledarski pregled smiseln in da preklop nazaj v `AUTO`
ali `REMIND_ONLY` ne pusti vrzeli. Ali se za ta dan ustvari `PlannedAction`, je ločena
odločitev (glej `ScheduleBuilder` v plan.md — presoja `mode` šele PO `CalendarDay`).

## `calendarOverrides`

| polje | tip |
|---|---|
| `localDate` | string |
| `profileId` | ObjectId \| null — `null` pomeni vse profile |
| `kind` | enum: `forceWorkday`, `forceNonWorking` |
| `note` | string \| null |

Indeksi: `{ localDate: 1, profileId: 1 }` unikatno

Najvišja prednost v odločitvi FR-014.

---

## Ponovno uporabljeno iz 001 — samo dodane vrednosti, BREZ spremembe sheme

### `devices` (`platform/notifications/device.model.ts`)

Nespremenjeno. 002 doda samo nove nize v `channels` (že `[String]`, brez sheme z enumom):
`reminder`, `confirmation` — poleg obstoječega `system` iz 001. Noben nov endpoint, nobeno
novo polje.

### `apiKeys` (`platform/apikeys/model.ts`)

Nespremenjeno. 002 doda nove vrednosti v `scopes` (že prosti `[String]`, brez sheme
enumeracije): `state:read`, `action:write`, `schedule:read`, `schedule:write`,
`calendar:read`, `calendar:write`, `history:read` — poleg obstoječih iz 001. Dovoljene
vrednosti obsegov so dokumentirane v OpenAPI pogodbi in v `platform/auth/scopes.ts`, ne v
shemi baze (namerno — nov obseg za 003 ne bo terjal migracije sheme).

### `idempotencyKeys` (`platform/idempotency/model.ts`)

Nespremenjeno, ponovno uporabljeno za vse mutacijske endpointe 002.

---

## Novo v `platform/` (skupno, ne last modula `time-tracking`)

### `notificationRecords`

001 obvestila pošilja, a jih ne beleži trajno (FR-072/FR-073 sta nova zahteva). Živi v
`platform/notifications/`, ne v `modules/time-tracking/`, ker gre za splošno zmogljivost
dnevniškega beleženja dostave, uporabno tudi za obvestila iz drugih modulov.

| polje | tip |
|---|---|
| `type` | enum: `reminder`, `confirmation`, `failure`, `health`, `session` |
| `title`, `body` | string |
| `deviceId` | ObjectId → `devices` \| null |
| `plannedActionId` | ObjectId → `plannedActions` \| null |
| `deliveryStatus` | enum: `sent`, `failed`, `suppressed` |
| `error` | string \| null |
| `dedupeKey` | string — uveljavlja FR-073 |

Indeksi: `{ dedupeKey: 1, createdAt: -1 }`, `{ createdAt: -1 }`, **TTL 90 dni** (operativni
dnevnik, ne evidenca — glej research.md §13).

### `heartbeats` (razširitev `platform/health/`)

Novo persistentno beleženje enega tika (001 je imel samo modulsko spremenljivko v
pomnilniku, brez zgodovine). Glej research.md §8, "Integracijska podrobnost".

| polje | tip |
|---|---|
| `tickAt` | Date |
| `durationMs` | number |
| `plansBuilt`, `actionsProcessed`, `errors` | number |
| `externalPingOk` | boolean |

Indeksi: `{ tickAt: -1 }`, **TTL 14 dni**.

### `webhookEndpoints` in `webhookDeliveries` (novo v `platform/webhooks/`)

FR-083. Splošen izhodni mehanizem, ne last enega modula.

`webhookEndpoints`: `url` (string), `events` (string[]), `secret` (string, občutljivo, ni
v odgovorih API-ja), `active` (boolean).

`webhookDeliveries`: `endpointId` (ObjectId), `event` (string), `payload` (Mixed),
`attemptCount` (number), `responseStatus` (number \| null), `deliveredAt` (Date \| null),
`nextAttemptAt` (Date \| null). **TTL 30 dni**.

---

## Čiščenje — pregled politik

| Kolekcija | Politika | Zakaj |
|---|---|---|
| posnetki zaslona (datoteke) | brisanje po `SCREENSHOT_RETENTION_DAYS` (30), `screenshotPath` v `actionAttempts` se izprazni, zapis ostane | FR-053 — zapis, ne slika, je zahtevana evidenca |
| `plannedActions` | odstranitev po prepisu v `actionRecords` + `PLANNED_ACTION_RETENTION_DAYS` (90) | tekoč načrt ostane majhen |
| `heartbeats` | TTL 14 dni | operativni dnevnik |
| `notificationRecords` | TTL 90 dni | operativni dnevnik |
| `idempotencyKeys` | TTL 24 h (že v 001, nespremenjeno) | star zapis nima vrednosti |
| `webhookDeliveries` | TTL 30 dni | operativni dnevnik |
| `actionRecords` | **nikoli samodejno** | to je evidenca (FR-052) |
| `actionAttempts` | **nikoli samodejno** (samo slika se briše) | FR-032 zahteva obdržane poskuse |

Zdravstveni endpoint (razširjen `GET /api/v1/health`) MORA poročati o prostoru na disku —
polnjenje s posnetki zaslona je najverjetnejši način, da se sistem po nekaj mesecih sam
ustavi (research.md §8).

## Preslikava iz starega modela

| staro (`d:\programiranje\privat\belezenje_casa`) | novo |
|---|---|
| `schedulers.daysToStart` (0 = ned, `Date.getDay()`) | `trackingProfiles.daysOfWeek` (ISO, 1 = pon) — **pretvori**, sicer zamik za en dan |
| `schedulers.isWorkingFromHome` | `trackingLocations.startAction` — `Delo od doma` na domači lokaciji (FR-090); v profilu tega polja ni |
| `schedulers.workdaystart` … `workdayEnd` | `trackingProfiles.actions[]` |
| `schedulers.pauseUntil` | `absencePeriods` vrste `other` |
| `schedulers.siteProperties.url` in `.coordinates` | `trackingLocations` |
| `schedulers.siteProperties.cookie` | `remoteSessions` (**vrednost se ne prenese** — potekla 24. 1. 2025) |
| `schedulerTimes` | `plannedActions` (zavrže se, načrt se sestavi znova) |
| `schedulerTimesHistory` | `actionRecords`, `source: legacy` doda se v `attemptSummary`/opombo |
| `users.deviceToken[]` | že preslikano v 001 → `devices.pushToken` |
| `schedulerTimes.executed: boolean` | `plannedActions.state` — dvojiška zastavica ni ločila "izvedeno" od "preverjeno uspešno" (`docs/legacy-engine.md` §4.5) |

Migracija je enosmeren, enkraten skript, izveden šele ko nov sistem v `dry-run` vsaj en
teden pravilno napoveduje iste akcije kot star (quickstart.md §6).
