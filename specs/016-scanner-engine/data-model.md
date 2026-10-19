# Data Model: Univerzalni modularni scanner engine (016)

Šest zbirk jedra, vse v `apps/api/src/platform/scanner/models/`. Tri zbirke modula Leti se
izbrišejo (podatki pogrešljivi, research.md §9), pet jih ostane nedotaknjenih.

| zbirka | model | lastništvo | hramba |
|---|---|---|---|
| `scannerdefinitions` | `ScannerDefinition` | **osebno** (`userId`) | trajno, do izbrisa |
| `scannertypesettings` | `ScannerTypeSettings` | namestitev, en zapis na tip | trajno |
| `scannerruns` | `ScannerRun` | namestitev | TTL `SCANNER_RUN_RETENTION_DAYS` (90) |
| `scannerresults` | `ScannerResult` | **osebno prek definicije** (`definitionId` + denormaliziran `userId`) | TTL `expiresAt` (tip določi; privzeto zadnjič videno + 30 dni) |
| `scannerresulthistories` | `ScannerResultHistory` | vez na rezultat | TTL `SCANNER_HISTORY_RETENTION_DAYS` (180) |
| `scannernotifications` | `ScannerNotification` | prejemnik | TTL `SCANNER_RUN_RETENTION_DAYS` (90) |

| zbirka 015 | usoda |
|---|---|
| `flightsearchruns` | **drop** ob zagonu → `scannerruns` |
| `flightschedulersettings` | **drop** ob zagonu → `scannertypesettings` (`type: 'flights'`) |
| `flightnotifications` | **drop** ob zagonu → `scannernotifications` |
| `flightsearchrules`, `flightoffers`, `flightsearchmatches`, `flightofferhistories`, `flightproviderstatuses` | nedotaknjene |

Vsi TTL-ji so indeksi na `expiresAt`. `ExternalCache` ostane edina shramba surovih odgovorov virov.

---

## Načelo lastništva (razširitev 004, 010, 015)

- **`ScannerDefinition` nosi `userId`**: zaseben zapis, `{ _id, userId }` je pogoj vsakega
  dostopa. Prejemnikov tu ni (deljenje je lastnost tipa; leti ga imajo v svojem zapisu).
- **`ScannerResult` nosi `userId`** (denormaliziran lastnik definicije): zapis je zaseben, bere ga
  samo lastnik; ni skupna referenčna tabela kot `FlightOffer`.
- **`ScannerRun`, `ScannerTypeSettings`** sta brez lastnika (namestitev); `requestedBy` na zagonu
  je `req.actor` (človek za tipkovnico), pri zagonu `single` definicije pa `scope.ownerId` pove,
  čigava je.
- **`ScannerNotification` nosi `recipientUserId`**, kot `FlightNotification`.

`tests/unit/no-owner-fields.spec.ts` dobi: `ScannerDefinition` NOSI `userId`; `ScannerResult`
NOSI `userId`; `ScannerRun` NE nosi `userId`.

---

## `ScannerDefinition` — skener (samo tipi z generično shrambo definicij)

| polje | tip | opomba |
|---|---|---|
| `userId` | `ObjectId` → `User`, required | lastnik |
| `name` | `String`, 1–80 | |
| `type` | `String` | oznaka registriranega tipa; tip lahko manjka (FR-011) |
| `enabled` | `Boolean`, default `true` | |
| `schedule.mode` | `'own' \| 'type'` | pri `single` tipih vedno `own`; `type` rezervirano, če tip kdaj preklopi |
| `schedule.preset` | `SchedulePresetId` | `daily-06 \| daily-06-18 \| every-6h \| hourly \| monday-08 \| custom` |
| `schedule.cronExpression` | `String` | pet polj, preverjen (`validateCron`) |
| `schedule.timezone` | `String`, IANA, default `Europe/Ljubljana` | preverjen (`isValidTimezone`) |
| `schedule.lastScheduledSlotAt` | `Date \| null` | pokrito do; premakne se ob spremembi izraza ali cone |
| `notifications.enabled` | `Boolean`, default `true` | |
| `notifications.mode` | `'all-changes'` | edini način v tej funkcionalnosti; polje obstaja za prihodnje |
| `config` | `Mixed` | preverjen s `type.configSchema` ob pisanju; brez izvršljive vsebine (FR-005) |
| `status.lastRunId` | `ObjectId \| null` | |
| `status.lastRunAt` | `Date \| null` | |
| `status.lastOutcome` | `'ok' \| 'failed' \| 'skipped' \| null` | |
| `status.message` | `String \| null` | slovensko, brez skrivnosti |
| `status.lastSuccessAt` | `Date \| null` | |
| `createdAt`, `updatedAt` | `Date` | `timestamps: true` |

`versionKey: false`. Zod shema v `domain/definition-input.ts` preverja ovojnico (ime, tip, vklop,
urnik, obvestila); `config` preveri tip. Pomen (`cron` veljaven, cona veljavna, tip registriran in
vklopljen, meja na uporabnika) preverja `services/definition-access.service.ts`.

### Indeksi

```
{ userId: 1, updatedAt: -1 }          — Moji skenerji
{ type: 1, enabled: 1 }               — tik: zapadle definicije tipa
{ userId: 1, type: 1 }                — meja na uporabnika in tip
```

### `ScannerSummary` (odgovor, ne zbirka)

Skupna oblika vrstice seznama za obe strani (generične definicije in tiste, ki jih prispeva tip):

```
id, type, typeLabel, name, enabled,
schedule: { mode, cronExpression?, timezone?, nextRunAt? , label },
lastRun: { at, outcome, message } | null, lastSuccessAt,
resultCount, typeAvailable: boolean,
links: { edit: string, results: string },   — tip z lastnimi definicijami jih poda sam
createdAt, updatedAt
```

---

## `ScannerTypeSettings` — urnik tipa (`batch`)

| polje | tip | opomba |
|---|---|---|
| `type` | `String`, unique | |
| `enabled` | `Boolean`, default `true` | |
| `preset` | `SchedulePresetId` | |
| `cronExpression` | `String` | privzetek iz `type.defaultSchedule` (leti `0 6,18 * * *`) |
| `timezone` | `String`, default `Europe/Ljubljana` | |
| `lastScheduledSlotAt` | `Date \| null` | |
| `updatedBy` | `ObjectId \| null` | `req.actor` |
| `updatedAt` | `Date` | |

Nastane ob prvem branju (`getOrCreateTypeSettings(type)`, `upsert` + `$setOnInsert`). Zapis za
tip, ki ni več registriran, ostane in ga tik ignorira.

---

## `ScannerRun` — en zagon

| polje | tip | opomba |
|---|---|---|
| `scannerType` | `String` | |
| `scope.kind` | `'type' \| 'definition'` | |
| `scope.definitionId` | `ObjectId \| null` | pri `definition` |
| `scope.ownerId` | `ObjectId \| null` | pri `definition`; za pravico lastnika do ogleda zagona |
| `slotKey` | `String`, **unique** | `schedule:type:<tip>:<termin v coni>` / `schedule:def:<id>:<termin v coni>` / `manual:<runId>` |
| `trigger` | `'schedule' \| 'manual'` | |
| `requestedBy` | `ObjectId \| null` | `req.actor` |
| `status` | `queued \| running \| succeeded \| partial \| failed \| cancelled \| interrupted` | prehodi kot 015 |
| `scheduledFor` | `Date \| null` | |
| `createdAt`, `startedAt`, `finishedAt` | `Date` | |
| `heartbeatAt` | `Date` | |
| `cancelRequested` | `Boolean` | |
| `counters` | `Map<String, Number>` | jedro: `definitions, notificationsPending, notificationsSent, notificationsSuppressed, notificationsFailed`; tip doda svoje |
| `definitions` | `[{ definitionId, ownerId, outcome: 'ok' \| 'failed' \| 'skipped', message }]` | izid na definicijo (FR-017); pri `batch` eno na obdelano definicijo |
| `extras` | `Mixed \| null` | tip (leti: `providers[]` kot v 015) — prikaže dodatek tipa v adminu |
| `runErrors` | `[{ at, definitionId?, code, message }]`, ≤ 100 | brez skrivnosti |
| `expiresAt` | `Date` | `createdAt` + `SCANNER_RUN_RETENTION_DAYS` → TTL |

### Prehodi stanja

```
queued ──claim──▶ running ──▶ succeeded | partial | failed | cancelled
                    └──(heartbeatAt star)──▶ interrupted
```

`status` iz `ExecutionOutcome.status`, ki ga vrne tip; jedro ga nadomesti s `failed`, kadar
`execute()` vrže, in s `cancelled`, kadar je bil zahtevan preklic in ga tip potrdi.

### Indeksi

```
{ slotKey: 1 }                              unique
{ status: 1, heartbeatAt: 1 }
{ scannerType: 1, createdAt: -1 }           — admin po tipu, `latestFinishedRun(type)`
{ 'scope.definitionId': 1, createdAt: -1 }  — zagoni enega skenerja
{ createdAt: -1 }
{ expiresAt: 1 }                            TTL
```

---

## `ScannerResult` — rezultat (generična shramba)

| polje | tip | opomba |
|---|---|---|
| `definitionId` | `ObjectId` → `ScannerDefinition` | |
| `userId` | `ObjectId` → `User` | denormaliziran lastnik |
| `scannerType` | `String` | |
| `identityKey` | `String` | sha256 nad `identity`, 32 hex |
| `source` | `String` | oznaka adapterja/vira |
| `externalId` | `String \| null` | |
| `title` | `String` | |
| `url` | `String \| null` | samo, če tip gostitelja dovoli (vzorec `booking-url.ts`) |
| `price` | `{ amount, currency } \| null` | **neobvezno** |
| `data` | `Mixed` | podatki po kategoriji, oblika last tipa |
| `comparableHash` | `String \| null` | hash polja `comparable`; `CHANGED`, kadar se spremeni in cene ni |
| `dataAt` | `Date` | čas podatka pri viru |
| `firstSeenAt`, `lastSeenAt`, `lastCheckedAt` | `Date` | |
| `availability` | `'available' \| 'unavailable'` | |
| `previousPrice` | `{ amount, currency, at } \| null` | |
| `lastChangeType` | `NEW \| PRICE_DOWN \| PRICE_UP \| CHANGED \| UNCHANGED \| UNAVAILABLE` | |
| `expiresAt` | `Date` | tip lahko poda; sicer `lastSeenAt + 30 dni` |

### Indeksi

```
{ definitionId: 1, identityKey: 1 }   unique — idempotentnost
{ definitionId: 1, lastChangeType: 1, lastSeenAt: -1 }
{ userId: 1, lastSeenAt: -1 }
{ expiresAt: 1 }                      TTL
```

Izbris definicije pobriše njene rezultate in zgodovino (`deleteMany({ definitionId })`).

---

## `ScannerResultHistory` — opazovanje

| polje | tip | opomba |
|---|---|---|
| `resultId` | `ObjectId` | |
| `runId` | `ObjectId` | |
| `checkedAt` | `Date` | |
| `price` | `Money \| null` | `null` pri `UNAVAILABLE` in pri rezultatih brez cene |
| `previousPrice` | `Money \| null` | |
| `changeType` | enum kot zgoraj | |
| `expiresAt` | `Date` | `checkedAt + SCANNER_HISTORY_RETENTION_DAYS` |

Indeksa `{ resultId: 1, checkedAt: 1 }`, `{ expiresAt: 1 }` TTL. `UNCHANGED` vrstice se pišejo
(graf potrebuje točke), kot pri 015.

---

## `ScannerNotification` — zbirni dopis (outbox)

| polje | tip | opomba |
|---|---|---|
| `recipientUserId` | `ObjectId` → `User` | |
| `runId` | `ObjectId` → `ScannerRun` | |
| `scannerType` | `String` | za izbiro kavljev `verify`/`render` ob pošiljanju |
| `channel` | `'email'` | rezervirano za FR-034 |
| `items` | `[{ definitionId, definitionName, ownerName, resultRef, changeType, payload: Mixed }]` | posnetek; `payload` sestavi tip (leti: `{ offerId, price, previousPrice }`) |
| `status` | `pending \| sending \| sent \| failed \| suppressed` | |
| `suppressedReason` | `smtp-not-configured \| no-email \| user-missing \| no-items \| type-unavailable \| null` | |
| `attemptCount`, `nextAttemptAt`, `sendingSince`, `sentAt`, `messageId`, `lastError` | kot 015 | |
| `createdAt`, `expiresAt` | `Date` | |

### Indeksi

```
{ recipientUserId: 1, runId: 1 }   unique — en dopis na prejemnika na zagon
{ status: 1, nextAttemptAt: 1 }
{ runId: 1 }
{ scannerType: 1, createdAt: -1 }
{ expiresAt: 1 }                   TTL
```

---

## Dogodek (`ScannerEvent`) in izid izvajanja — vmesnik, ne zbirka

```ts
interface ScannerEvent {
  definitionId: string;
  definitionName: string;
  ownerId: string;
  /** Kdo dobi dopis: pri generičnih definicijah lastnik; leti dodajo prejemnike z `notify`. */
  recipients: string[];
  resultRef: string;                           // id rezultata (ScannerResult ali FlightOffer)
  changeType: 'NEW' | 'PRICE_DOWN' | 'PRICE_UP' | 'CHANGED';
  payload: unknown;                            // posnetek za postavko dopisa
}

interface ExecutionOutcome {
  status: 'succeeded' | 'partial' | 'failed' | 'cancelled';
  counters: Record<string, number>;
  definitions: Array<{ definitionId: string; ownerId: string; outcome: 'ok' | 'failed' | 'skipped'; message: string | null }>;
  events: ScannerEvent[];
  extras?: unknown;
  errors: Array<{ definitionId?: string; code: string; message: string }>;
}
```

---

## Spremembe v zbirkah modula Leti

- `FlightSearchRule.lastCheck.runId`: `ref` se spremeni iz `'FlightSearchRun'` v `'ScannerRun'`
  (samo oznaka; brez `populate`).
- `FlightSearchMatch.lastRunId`: enako.
- `FlightOfferHistory.runId`: enako.
- Nič drugega.

## Kaj se NE shranjuje

Celi e-naslovi zunaj `User`; žetoni virov; surovi odgovori virov zunaj `ExternalCache`; imena
oseb, razen posnetka `ownerName` v postavki dopisa (isti razlog kot `ruleOwnerName` v 015);
izvršljiva vsebina v `config` (Zod sheme tipov dovolijo samo primitivne vrednosti in sezname).
