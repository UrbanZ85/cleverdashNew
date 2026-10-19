# Data Model: Iskalnik letalskih ponudb (015)

Osem novih zbirk, vse v modulu `modules/flight-deals/models/`. Nobena ne živi v `platform/`:
za razliko od 014 tu ni podatka, ki bi moral preživeti odstranitev zavihka — če zavihka Leti ni,
ni ne iskanj ne ponudb ne urnika. Brisanje modula pobriše vse (člen I).

| zbirka | model | lastništvo | hramba |
|---|---|---|---|
| `flightsearchrules` | `FlightSearchRule` | **osebno** (`userId`) | trajno, do izbrisa |
| `flightoffers` | `FlightOffer` | **skupno** (brez lastnika) | TTL: dan po odhodu + 7 dni |
| `flightsearchmatches` | `FlightSearchMatch` | vez iskanje ↔ ponudba | TTL kot ponudba |
| `flightofferhistories` | `FlightOfferHistory` | vez na ponudbo | TTL `FLIGHT_HISTORY_RETENTION_DAYS` (180) |
| `flightsearchruns` | `FlightSearchRun` | namestitev | TTL `FLIGHT_RUN_RETENTION_DAYS` (90) |
| `flightnotifications` | `FlightNotification` | prejemnik | TTL `FLIGHT_RUN_RETENTION_DAYS` (90) |
| `flightschedulersettings` | `FlightSchedulerSettings` | namestitev, **en zapis** | trajno |
| `flightproviderstatuses` | `FlightProviderStatus` | namestitev, en zapis na vir | trajno |

Vsi TTL-ji so **indeksi na `expiresAt`**, ne pometači (precedens 014: `SCREENSHOT_RETENTION_DAYS`
je razglašen in ga ne bere nihče — tu se to ne sme ponoviti). `ExternalCache` iz `platform/cache`
se uporablja za odgovore virov in ni nova zbirka.

---

## Načelo lastništva zapisov (razširitev 004 in 010)

`userId` v tej bazi pomeni "zaseben zapis, `{ _id, userId }` je pogoj dostopa" (004). `ownerId` +
`members` pomeni "zapis, ki ga namenoma bere tudi kdo drug" (010). Ta modul potrebuje **obe** in
še tretjo obliko:

- **`FlightSearchRule` nosi `userId`**, čeprav ima `recipients`. Razlog: prejemnik iskanja
  **nikoli ne bere** (FR-041) — ne konfiguracije, ne stanja. Bere samo ponudbe, ki so mu
  dosegljive PREK iskanja. Vsak dostop do iskanja je zato še vedno `{ _id, userId }`, kar je točno
  obljuba, ki jo ime `userId` daje. `recipients` je seznam naslovov za obvestila, ne seznam
  soudeležencev z vlogo; polja `role` ni, ker je vloga ena sama.
- **`FlightOffer` nima lastnika.** Ista ponudba (isti let, ista cena pri istem viru) je ista za
  vsakogar — kot zapis v `ExternalCache`. Kdo jo vidi, odloči `FlightSearchMatch`.
- **`FlightSearchMatch` nosi `ruleOwnerId`** (denormaliziran `userId` iskanja), da poizvedba
  "ponudbe mojih iskanj" ne potrebuje pridružitve, in `ruleId`, prek katerega se razreši
  vidnost prejemnikov.

Test `tests/unit/no-owner-fields.spec.ts` dobi tri nove vrstice: `FlightSearchRule` nosi
`userId`; `FlightOffer` ga NE nosi (skupna referenčna tabela); `FlightSearchMatch` nosi
`ruleOwnerId` in ne `userId`.

---

## `FlightSearchRule` — iskanje

| polje | tip | opomba |
|---|---|---|
| `userId` | `ObjectId` → `User`, required | lastnik; vsak dostop `{ _id, userId }` |
| `name` | `String`, 1–80 | obvezno (FR-002) |
| `active` | `Boolean`, default `true` | neaktivno iskanje se ne preverja (FR-001) |
| `departureAirports` | `[String]`, 1–10 | IATA kode, velike črke; preverjene proti vgrajenemu naboru |
| `destination.mode` | `'any' \| 'countries' \| 'airports'` | FR-002 |
| `destination.countries` | `[String]` | ISO 3166-1 alpha-2; samo pri `countries` |
| `destination.airports` | `[String]` | IATA; samo pri `airports` |
| `excluded.countries` | `[String]` | izključitve veljajo pri vseh načinih |
| `excluded.airports` | `[String]` | |
| `dates.mode` | `'fixed' \| 'range' \| 'rolling'` | FR-005 |
| `dates.departDate` | `String` `yyyy-LL-dd` | pri `fixed` |
| `dates.returnDate` | `String \| null` | pri `fixed`; `null` = enosmerno |
| `dates.from`, `dates.to` | `String` `yyyy-LL-dd` | pri `range`; `from <= to` |
| `dates.months` | `Number` 1–12 | pri `rolling` |
| `flexDays` | `Number`, int ≥ 0, ≤ 60 | FR-006; pri `rolling` nima pomena in je 0 |
| `returnWithinWindow` | `Boolean`, default `true` | FR-008 |
| `minNights`, `maxNights` | `Number`, int ≥ 0; `max >= min` | FR-009; pri enosmernem iskanju oba `null` |
| `outbound.weekdays` | `[Number]` ISO 1–7 | prazno = kateri koli dan (isti dogovor kot `TrackingProfile.daysOfWeek`) |
| `outbound.earliest`, `outbound.latest` | `String` `HH:mm` ali `null` | lokalni čas odhodnega letališča |
| `inbound.weekdays`, `inbound.earliest`, `inbound.latest` | kot zgoraj | lokalni čas ciljnega letališča (odhod povratka) |
| `minStayHours` | `Number \| null` | razlika dveh trenutkov (edge case v spec.md) |
| `passengers.adults` | `Number` 1–9 | |
| `passengers.childrenAges` | `[Number]` 0–17, ≤ 8 | |
| `price.maxPerPerson`, `price.maxTotal` | `Number \| null` | v `price.currency` |
| `price.currency` | `String`, ISO 4217, default `'EUR'` | |
| `airlines` | `[String]` | IATA kode prevoznikov; prazno = vsi |
| `maxStops` | `Number` 0–3, default `0` | `0` = samo direktni (FR-012) |
| `baggage` | `'any' \| 'cabin' \| 'checked'`, default `'any'` | upošteva se le, če vir podatek da |
| `recipients` | `[{ userId, notify: Boolean, addedAt }]`, `_id: false`, ≤ `FLIGHT_MAX_RECIPIENTS` | FR-040; imena se ne shranjujejo (010) |
| `lastCheck` | `{ runId, at, outcomes: [{ providerId, outcome, message?, queries, offers }], analysis: { returned, matched, rejected: [{ reason, label, count }] } | null }` ali `null` | stanje zadnjega preverjanja po virih (FR-017); `analysis` (od 19. 10. 2026) pove, koliko ponudb so viri vrnili in zakaj so bile zavrnjene |
| `lastSuccessfulCheckAt` | `Date \| null` | FR-032 |
| `createdAt`, `updatedAt` | `Date` | `timestamps: true` |

`versionKey: false`. Zod shema v `domain/rule-input.ts` preverja obliko; pomen (`max >= min`,
`from <= to`, `fixed` brez `returnDate` ⇒ `minNights/maxNights` `null`, letališče obstaja v
naboru) preverjajo čiste funkcije v `domain/rule-validation.ts` in vračajo `badRequest` s
slovenskim stavkom.

### Indeksi

```
{ userId: 1, updatedAt: -1 }        — Moja iskanja
{ 'recipients.userId': 1 }           — Deljene ponudbe: katera iskanja me obveščajo
{ active: 1 }                        — zagon: aktivna iskanja
```

---

## `FlightOffer` — ponudba (skupna)

| polje | tip | opomba |
|---|---|---|
| `identityKey` | `String`, **unique** | sha256 nad kanoničnim nizom identitete (spodaj), 32 hex znakov |
| `providerId` | `String` | `'travelpayouts' \| 'ryanair' \| 'wizzair' \| 'fake'` |
| `airline` | `String` | IATA koda prevoznika (`FR`, `W6`, `U2`); `'??'` če neznana |
| `airlineName` | `String \| null` | za prikaz |
| `origin`, `destination` | `String` | IATA |
| `outbound.departureAt` | `Date` | UTC instant |
| `outbound.arrivalAt` | `Date \| null` | |
| `outbound.flightNumbers` | `[String]` | prazno, če vir ne da |
| `outbound.stops` | `Number` | |
| `inbound` | isti podobjekt ali `null` | `null` = enosmerno |
| `nights` | `Number \| null` | koledarske noči na destinaciji po lokalnem času ciljnega letališča |
| `price.amount` | `Number` > 0 | skupna cena za `passengers` |
| `price.currency` | `String` | |
| `price.includes` | `String \| null` | kaj vir pravi, da je vključeno (FR-013), npr. "osnovna vozovnica brez prtljage" |
| `passengers.adults`, `passengers.children` | `Number` | sestava, za katero velja cena |
| `fare.type`, `fare.baggage` | `String \| null` | kadar vir da |
| `bookingUrl` | `String \| null` | samo, če gostitelj pripada viru (`domain/booking-url.ts`) |
| `dataAt` | `Date` | čas, ki ga vir navede za podatek (Travelpayouts: čas najdbe); sicer = `lastCheckedAt` |
| `firstSeenAt`, `lastSeenAt`, `lastCheckedAt` | `Date` | |
| `availability` | `'available' \| 'unavailable'` | FR-028: `unavailable` samo ob uspešnem odgovoru brez ponudbe |
| `previousPrice` | `{ amount, currency, at } \| null` | zadnja DRUGAČNA cena — za prikaz brez branja zgodovine |
| `lastChangeType` | `'NEW' \| 'PRICE_DOWN' \| 'PRICE_UP' \| 'UNCHANGED' \| 'UNAVAILABLE'` | na ravni ponudbe; "NEW za iskanje" je v `FlightSearchMatch` |
| `expiresAt` | `Date` | `max(outbound.departureAt, inbound.departureAt)` + 7 dni → TTL |

`timestamps: false` (časi so domenski in izrecni), `versionKey: false`.

### Identiteta (FR-026)

Kanonični niz, iz katerega je `identityKey`:

```
providerId | origin | destination
| outbound.departureAt (ISO UTC, minuta) | outbound.flightNumbers (sorted, joined) | outbound.stops
| inbound.departureAt ali '-' | inbound.flightNumbers ali '-' | inbound.stops ali '-'
| airline | passengers.adults | passengers.children | fare.type ?? '-' | fare.baggage ?? '-' | price.currency
```

Cena ni v nizu (FR-026). Čas pristanka ni v nizu, ker ga viri zaokrožujejo različno in bi ista
vozovnica dobila dve identiteti. `providerId` JE v nizu: ista vozovnica iz dveh virov sta dve
ponudbi, ker imata dve ceni in dve povezavi za rezervacijo — združevanje čez vire je izven obsega.

### Indeksi

```
{ identityKey: 1 }                                  unique
{ origin: 1, destination: 1, 'outbound.departureAt': 1 }   — "ali je vir to ponudbo še vrnil" (UNAVAILABLE)
{ expiresAt: 1 }                                    TTL
```

---

## `FlightSearchMatch` — iskanje ↔ ponudba

Razlog za obstoj: "NOVO" je lastnost para (edge case v spec.md), ne ponudbe; in vidnost
prejemnika gre prek iskanja.

| polje | tip | opomba |
|---|---|---|
| `ruleId` | `ObjectId` → `FlightSearchRule` | |
| `ruleOwnerId` | `ObjectId` → `User` | denormaliziran lastnik iskanja |
| `offerId` | `ObjectId` → `FlightOffer` | |
| `firstMatchedAt` | `Date` | kdaj je ponudba prvič ustrezala TEMU iskanju |
| `lastMatchedAt` | `Date` | zadnji zagon, v katerem je ustrezala |
| `lastChangeType` | kot pri ponudbi | kaj je ta zagon pomenil za TO iskanje (`NEW` ob `firstMatchedAt`) |
| `lastChangeAt` | `Date` | |
| `lastRunId` | `ObjectId` → `FlightSearchRun` | |
| `status` | `'active' \| 'unavailable' \| 'stale'` | `stale` = ponudba še obstaja, a pravilom ne ustreza več (npr. cena čez mejo) — se ne obvešča, se ne kaže med aktivnimi |
| `expiresAt` | `Date` | kopija iz ponudbe → TTL |

### Indeksi

```
{ ruleId: 1, offerId: 1 }            unique — idempotentnost zagona (člen V.3)
{ ruleOwnerId: 1, lastChangeAt: -1 } — nadzorna plošča lastnika
{ ruleId: 1, status: 1 }             — ponudbe enega iskanja; deljene ponudbe prek seznama ruleId
{ offerId: 1 }                       — podrobnosti ponudbe: komu vse ustreza
{ expiresAt: 1 }                     TTL
```

---

## `FlightOfferHistory` — zgodovina cen

Ena vrstica na ponudbo na zagon, v katerem je bila ponudba vrnjena ali zanesljivo ugotovljena
kot nedosegljiva. `UNCHANGED` vrstice se pišejo — graf potrebuje točke, ne samo prelome.

| polje | tip | opomba |
|---|---|---|
| `offerId` | `ObjectId` | |
| `runId` | `ObjectId` | |
| `checkedAt` | `Date` | |
| `price` | `{ amount, currency } \| null` | `null` pri `UNAVAILABLE` |
| `previousPrice` | `{ amount, currency } \| null` | |
| `changeType` | enum kot zgoraj | |
| `expiresAt` | `Date` | `checkedAt` + `FLIGHT_HISTORY_RETENTION_DAYS` → TTL |

Indeksa: `{ offerId: 1, checkedAt: 1 }`, `{ expiresAt: 1 }` TTL. Unikatnega `{ offerId, runId }`
ni treba: pisanje zgodovine se zgodi znotraj zagona, ki je sam unikaten (`slotKey`), ponovni
zagon istega termina pa ni mogoč.

---

## `FlightSearchRun` — eno preverjanje

| polje | tip | opomba |
|---|---|---|
| `slotKey` | `String`, **unique** | `schedule:<ISO termina v coni urnika>` ali `manual:<ObjectId zagona>` — zapora pred podvajanjem med izvodi (FR-050) |
| `trigger` | `'schedule' \| 'manual'` | |
| `requestedBy` | `ObjectId \| null` | admin pri ročnem zagonu (`req.actor`, ker gre za dejanje človeka, ne lastnika podatkov) |
| `status` | `'queued' \| 'running' \| 'succeeded' \| 'partial' \| 'failed' \| 'cancelled' \| 'interrupted'` | prehodi spodaj |
| `scheduledFor` | `Date \| null` | termin iz urnika |
| `startedAt`, `finishedAt` | `Date \| null` | |
| `heartbeatAt` | `Date` | zagon ga posodablja po vsakem iskanju; stari `running` → `interrupted` |
| `cancelRequested` | `Boolean` | admin; preveri se med iskanji (FR-046) |
| `counters` | `{ rules, queries, providerRequests, offersSeen, newMatches, priceDrops, priceRises, unavailable, notificationsPending, notificationsSent, notificationsSuppressed, notificationsFailed }` | FR-052 |
| `providers` | `[{ providerId, enabled, ok, noFlights, unsupported, unreachable, rateLimited, incomplete }]` | izidi po FR-017 |
| `errors` | `[{ at, providerId?, ruleId?, code, message }]`, ≤ 100 | brez skrivnosti in brez e-naslovov (FR-054) |
| `expiresAt` | `Date` | `startedAt ?? createdAt` + `FLIGHT_RUN_RETENTION_DAYS` → TTL |

### Prehodi stanja

```
queued ──claim──▶ running ──▶ succeeded   (vsi viri ok ali noFlights)
                    │     ├──▶ partial     (vsaj en vir unreachable/rateLimited/incomplete)
                    │     ├──▶ failed      (nobeno iskanje ni bilo obdelano)
                    │     └──▶ cancelled   (cancelRequested med iskanji)
                    └──(heartbeatAt star)──▶ interrupted   (ob naslednjem tiku, FR-051)
```

Prevzem (`claim`) je `findOneAndUpdate({ _id, status: 'queued' }, { status: 'running', startedAt })`
— isti vzorec kot `PlannedAction` v 002. Dva izvoda ne moreta oba dobiti dokumenta.

### Indeksi

```
{ slotKey: 1 }        unique
{ status: 1, heartbeatAt: 1 }   — reclaim prekinjenih in "ali kaj teče"
{ startedAt: -1 }     — zgodovina
{ expiresAt: 1 }      TTL
```

---

## `FlightNotification` — zbirni dopis (outbox)

| polje | tip | opomba |
|---|---|---|
| `recipientUserId` | `ObjectId` → `User` | |
| `runId` | `ObjectId` → `FlightSearchRun` | |
| `items` | `[{ ruleId, ruleName, ruleOwnerName?, offerId, changeType, price, previousPrice }]` | posnetek ob nastanku; `ruleName` se shrani, ker je iskanje lahko preimenovano pred ponovnim poskusom |
| `status` | `'pending' \| 'sending' \| 'sent' \| 'failed' \| 'suppressed'` | |
| `suppressedReason` | `'smtp-not-configured' \| 'no-email' \| 'user-missing' \| null` | FR-038 |
| `attemptCount` | `Number` | |
| `nextAttemptAt` | `Date \| null` | backoff `[60, 300, 900, 3600]` s, kot `platform/webhooks` |
| `sentAt` | `Date \| null` | |
| `messageId` | `String \| null` | iz poštnega strežnika |
| `lastError` | `String \| null` | brez naslovov |
| `expiresAt` | `Date` | TTL |

E-naslov prejemnika se v zapis **ne shrani**: prebere se ob pošiljanju iz `User` prek
`platform/users/readUserEmails` in gre samo v poštno sejo (FR-044).

### Indeksi

```
{ recipientUserId: 1, runId: 1 }   unique — en dopis na prejemnika na zagon (FR-034), tudi ob ponovitvi
{ status: 1, nextAttemptAt: 1 }    — outbox
{ recipientUserId: 1, createdAt: -1 } — "moja obvestila" (prihodnje; ni v pogodbi 015)
{ expiresAt: 1 }                   TTL
```

Prevzem za pošiljanje: `findOneAndUpdate({ _id, status: 'pending', nextAttemptAt: { $lte: now } },
{ status: 'sending', $inc: { attemptCount: 1 } })`. Pošiljanje, ki se konča z napako, vrne
`pending` z novim `nextAttemptAt`, ali `failed` po izčrpanih poskusih. Zapis v `sending`, ki
ostane tak dlje od `FLIGHT_RUN_STALE_MINUTES` (proces je padel med pošiljanjem), se vrne v
`pending` — tveganje dvojnega dopisa je v tem oknu sprejeto in zapisano, ker ga brez potrditve
strežnika ni mogoče izključiti; okno je ozko (ena poštna seja).

---

## `FlightSchedulerSettings` — en zapis

| polje | tip | opomba |
|---|---|---|
| `key` | `String`, unique, vedno `'default'` | singleton brez posebne logike |
| `enabled` | `Boolean`, default `true` | FR-049 |
| `preset` | `'daily-06' \| 'daily-06-18' \| 'every-6h' \| 'monday-08' \| 'custom'` | FR-046 |
| `cronExpression` | `String` | pet polj; default `0 6,18 * * *`; preverjen pred shranjevanjem (FR-047) |
| `timezone` | `String`, IANA, default `Europe/Ljubljana` | |
| `lastScheduledSlotAt` | `Date \| null` | zadnji termin, za katerega je zagon ŽE nastal; iz njega tik ugotovi zamujeni termin (FR-051) |
| `updatedBy` | `ObjectId \| null` | `req.actor` |
| `updatedAt` | `Date` | |

Zapis nastane ob prvem branju (`getOrCreateSchedulerSettings`), kot `Settings` v 001.

---

## `FlightProviderStatus` — en zapis na vir

| polje | tip | opomba |
|---|---|---|
| `providerId` | `String`, unique | |
| `lastSuccessAt` | `Date \| null` | |
| `lastErrorAt`, `lastError`, `lastOutcome` | | zadnja napaka brez skrivnosti |
| `requestsToday` | `{ day: 'yyyy-LL-dd', count }` | za omejitev "največ dvakrat dnevno" pri neuradnem viru (FR-020) — šteje ZAGONE, v katerih je bil vir vprašan, ne posameznih zahtev |

Ali je vir vklopljen, uraden in kako se imenuje, NI v bazi — to je lastnost kode in okolja
(`providers/index.ts` + `FLIGHT_*_ENABLED`).

---

## Vgrajen nabor letališč (ni zbirka)

`modules/flight-deals/assets/airports.json`, generiran s skripto `apps/api/scripts/build-airports.mjs`
iz OurAirports (`airports.csv`, `countries.csv`; javna domena) in `geo-tz` (časovni pas iz
koordinat). Filter: `type ∈ {large_airport, medium_airport}`, `scheduled_service = yes`,
`iata_code` prisoten. Vrstica:

```json
{ "iata": "LJU", "name": "Ljubljana Jože Pučnik Airport", "city": "Ljubljana", "country": "SI",
  "countryName": "Slovenia", "lat": 46.2237, "lon": 14.4576, "tz": "Europe/Ljubljana" }
```

Imena so angleška (vir jih nima v slovenščini); `countryName` se v vmesniku prikaže prek
`Intl.DisplayNames('sl', { type: 'region' })`, zato slovenskih imen držav ni treba hraniti.
Skripta se poganja ročno ob osvežitvi in JSON je commitan — gradnja ne sme biti odvisna od
omrežja (kakovostna vrata, točka 4). `copy-assets.mjs` mapo `assets/` že kopira v `dist/`.

Iskanje po radiju: haversine v `domain/airports.ts`, čista funkcija nad naborom.

---

## Kaj se NE shranjuje

Celi e-naslovi zunaj `User`; žetoni virov; surovi odgovori virov zunaj `ExternalCache`
(ta pa ima svoj dogovor o hrambi); imena oseb (razrešijo se ob branju prek
`readUserSummaries`, izjema je posnetek `ruleOwnerName` v `FlightNotification.items`, ker dopis
mora biti sestavljiv tudi po ponovnem poskusu). Naslov IP, uporabniški agent in podobno se ne
beležijo nikjer.
