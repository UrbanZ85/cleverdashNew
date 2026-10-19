# Research: Univerzalni modularni scanner engine (016)

Odločitve z razlogi in zavrnjenimi možnostmi. Vsaka se sklicuje na stanje kode modula 015 na dan
19. 10. 2026 (zadnji commit `b57211e`), ker je to koda, ki se refaktorira.

## §1 — Jedro v `platform/scanner/`, tipi se registrirajo iz `main.ts`

**Odločitev.** Vse skupno (register tipov, definicije, urnik, zagon, shramba rezultatov, outbox,
administracija) živi v `apps/api/src/platform/scanner/`. Modul Leti se registrira z eno vrstico
`registerScannerType(flightScannerType)` v `main.ts`, poleg `registerRecipesIngest()`. Jedro ne
uvaža iz `modules/` nikoli; lint pravilo `cleverdash/module-boundary` tega ne preverja za
`platform/`, zato ga preverja nov test `tests/unit/scanner-core-boundary.spec.ts` (pregled uvozov
in nizov `flight` v `platform/scanner/**`; SC-003).

**Razlog.** Člen I: moduli se ne kličejo med sabo; skupne zmogljivosti so v `platform/`. Vzorec
registra je v repozitoriju že trikrat (`platform/ingest/registry.ts`, `platform/tabs/extension.ts`,
`platform/health/extension.ts`) in deluje: register je `Map`, ponovna registracija zamenja vnos
(`createApp()` v testih teče večkrat), `resetScannerTypesForTests()` ga počisti.

**Zavrnjeno.** (a) Jedro kot modul `modules/scanners/` — modul Leti bi ga moral uvažati, kar je
lint napaka; (b) jedro v `modules/flight-deals/` z "generičnimi" imeni — ostane last modula in ga
nov tip ne more uporabiti brez prepovedanega uvoza.

## §2 — Dva načina izvajanja: `batch` (urnik tipa) in `single` (urnik definicije)

**Odločitev.** Tip deklarira `execution: 'batch' | 'single'`.

| | `batch` (leti) | `single` (echo, bodoči tipi) |
|---|---|---|
| obseg zagona | ves tip | ena definicija |
| urnik | `ScannerTypeSettings` (admin) | `ScannerDefinition.schedule` (lastnik) |
| `slotKey` | `schedule:type:<tip>:<termin v coni>` | `schedule:def:<id>:<termin v coni>` |
| ročni zagon | samo admin (`POST /scanners/admin/runs { type }`) | lastnik (`POST /scanners/{id}/run`) ali admin |
| kdo naloži definicije | tip sam v `execute()` | jedro poda eno definicijo v `ctx.definition` |
| sočasnost | en zagon na tip | en zagon na definicijo |

**Razlog.** Leti združujejo poizvedbe vseh uporabnikov v en načrt (`query-plan.ts`, SC-007 iz
015), štejejo dnevno mejo Ryanaira na zagon in sestavijo en dopis na prejemnika na zagon. "Zagon
na iskanje" bi vse troje razbil — to je sprememba vedenja, ki jo naročilo prepoveduje. Hkrati
bodoči tipi potrebujejo urnik na skener. Oba načina sta eno polje v tipu in ena veja v
`scheduler.service.ts` (`for type of batchTypes … ; for def of singleDefinitions …`), brez
`switch` po imenu tipa.

**Zavrnjeno.** Samo per-definition z "virtualno" definicijo za cel tip — v bazi bi obstajala
definicija brez lastnika, kar `no-owner-fields.spec.ts` prepoveduje in kar bi seznam skenerjev
moral skrivati.

## §3 — Definicije: generična zbirka za `single`, lastna za `batch` tipe

**Odločitev.** `ScannerDefinition` (`scannerdefinitions`) hrani definicije tipov, ki NIMAJO lastne
shrambe. Tip z lastno shrambo (leti: `FlightSearchRule`) ne piše vanjo; namesto tega izpolni
`definitions.listForUser(userId)` in `definitions.findForUser(userId, id)`, ki vrneta
`ScannerSummary` (ime, vklop, urnik "tipa", zadnje preverjanje, število rezultatov, povezave za
urejanje in rezultate). `GET /scanners` združi obe strani in razvrsti po `updatedAt`.

**Razlog.** Iskanja letov so 20+ polj z lastno Zod shemo, lastnimi indeksi (`recipients.userId`)
in sedmimi storitvami, ki `FlightSearchRuleModel` berejo. Selitev v `config: Mixed` bi te
storitve prisilila v cast na vsakem branju ali v diskriminator, ki je sprememba modela brez
dobička — podatki so pogrešljivi, a koda ni. Odločitev lastnika: leti ostanejo svoj modul.

**Posledica za vmesnik.** Čarovnik v koraku 1 pri tipu z `definitions.owned === true` preusmeri
na `createRoute` tipa (`/flight-deals/searches/new`); koraka 2 in 3 sta za take tipe strani tipa
(obrazec iskanja že vsebuje prejemnike, urnik je tipov). Odstop od dobesednega branja FR-041 je
zapisan v plan.md, Complexity Tracking.

## §4 — `ScannerRun` nadomesti `FlightSearchRun`

**Odločitev.** Model zagona se preseli v `platform/scanner/models/scanner-run.model.ts` z dvema
novima poljema: `scannerType` in `scope` (`{ kind: 'type' } | { kind: 'definition', definitionId,
ownerId }`). Števci postanejo `Map<string, number>` (tip prispeva svoja imena: leti
`rules, queries, providerRequests, offersSeen, newMatches, priceDrops, priceRises, unavailable`;
jedro doda `definitions, notificationsPending|Sent|Suppressed|Failed`). `providers[]` iz 015 gre
v `extras: Mixed` (tip ga napolni, admin ga prikaže prek dodatka tipa). `definitions[]` nosi izid
na definicijo (`{ definitionId, ownerId, outcome: 'ok'|'failed'|'skipped', message }`) — to je
izolacija napak iz FR-017.

Prehodi stanj, `slotKey`, prevzem `queued → running`, utrip, `interrupted`, `cancelRequested` in
dohitevanje enega termina se prenesejo iz `tick.ts` in `run-executor.service.ts` dobesedno.
Sočasnost: `executeQueued` izvede zagone zaporedno, dokler je kateri `queued` in število
`running` pod `SCANNER_MAX_CONCURRENT_RUNS` (privzeto 1 = današnje vedenje); zagon istega
obsega kot kateri koli `running` se preskoči.

**Razlog.** Nič od tega ni letalskega. Edina sprememba vedenja: en tik izvede VSE čakajoče zagone,
ne samo enega — z več `single` definicijami bi bil en zagon na minuto prepočasen. Pri letih je
čakajoč zagon kvečjemu en, zato razlike ni.

## §5 — Generična shramba rezultatov z zaznavo sprememb; tip lahko nadomesti

**Odločitev.** `ScannerResult` + `ScannerResultHistory` v jedru; storitev
`result-store.service.ts` ponudi `reconcileResults(definition, run, items, { sourceSucceeded })`
→ `ScannerEvent[]`. Identiteta: tip vrne `identity: string` (kanonični niz), jedro ga hashira
(`sha256`, 32 znakov) kot `identityKey` z unikatnim indeksom `{ definitionId, identityKey }`.
Sprememba: kadar ima rezultat `price`, se uporabi `classifyChange` (preseljen iz
`flight-deals/domain/price-change.ts` v `platform/scanner/domain/price-change.ts`, modul Leti ga
uvaža od tam — uvoz iz `platform/` je dovoljen); sicer hash polja `comparable` → `CHANGED`.
`UNAVAILABLE` samo pri `sourceSucceeded: true` za rezultate, ki jih ta zagon ni vrnil (isto
pravilo kot FR-028 v 015).

Tip z `results: 'custom'` (leti) te storitve ne kliče; izpolni `results.list(definitionId,
userId, query)`, `results.count(definitionIds)`, `results.get(definitionId, resultId, userId)`,
da `GET /scanners/{id}/results` in števec na seznamu delujeta enako.

**Razlog.** FR-022 do FR-027. Leti ostanejo pri treh zbirkah (ponudba skupna, ujemanje na par,
zgodovina na ponudbo), ker generični model "rezultat pripada enemu skenerju" ne zna izraziti
deljene ponudbe. Oba svetova se srečata pri istem bralnem vmesniku, ne pri isti zbirki.

## §6 — Generični outbox z dvema kavljema tipa (`verify`, `render`)

**Odločitev.** `ScannerNotification` nadomesti `FlightNotification`. Postavka je
`{ definitionId, definitionName, ownerName, resultRef, changeType, payload: Mixed }`. Jedro:

1. `notification-builder.service.ts`: iz `ScannerEvent[]` (vsak nosi `recipients: userId[]`, ki
   jih določi tip — pri letih lastnik + `recipients.notify`) sestavi en `pending` zapis na
   prejemnika na zagon; isti `resultRef` pri istem prejemniku se združi (imena definicij se
   zlijejo z ` · `, ostane močnejša vrsta spremembe `NEW > PRICE_DOWN > PRICE_UP > CHANGED`) —
   dobesedno današnji `notification-builder.service.ts`, brez letalskih polj.
2. `notification-sender.service.ts`: prevzem `pending → sending`, `reclaimStuckSending`,
   backoff `[60, 300, 900, 3600]`, `MAX_PER_TICK`, zadušitve `smtp-not-configured | no-email |
   user-missing | no-items | type-unavailable`. Pred izrisom pokliče
   `type.notifications.verify(items, recipientUserId, now)` → preverjene postavke v obliki, ki jo
   tip sam določi; nato `type.notifications.render(verified, ctx)` → `{ subject, html, text }`;
   pošlje `platform/email/sendEmail`.

Leti: `verify` je današnji `verifyItems` (iskanje aktivno, prejemnik še na seznamu, ponudba na
voljo in ustreza), `render` je `renderDigest`. Oba ostaneta v modulu.

**Razlog.** Vse, kar je v outboxu generično (prevzem, ponovitve, zadušitve, unikatni indeks), je
bilo že v 015 opisano kot vzorec `platform/webhooks`; letalsko je samo "kaj je postavka" in "kako
izgleda dopis". Kavlja sta natanko ta dva.

## §7 — Kaj iz modula Leti gre v jedro, kaj ostane, kaj se izbriše

| datoteka 015 | usoda |
|---|---|
| `services/tick.ts` | **preseli** v `platform/scanner/services/tick.ts` (posplošen po §4) |
| `services/run-executor.service.ts` | **razdeli**: prevzem/utrip/zaključek → jedro; telo (načrt → viri → reconcile) → `modules/flight-deals/scanner/execute.ts` kot `execute(ctx)` |
| `services/scheduler-settings.service.ts` | **preseli** → `type-settings.service.ts` (ključ `type` namesto `'default'`) |
| `services/notification-builder.service.ts` | **preseli** v jedro (brez letalskih polj) |
| `services/notification-sender.service.ts` | **razdeli**: outbox → jedro; `verifyItems` → modul (`scanner/notifications.ts`) |
| `domain/schedule-slots.ts` | **preseli** v `platform/scanner/domain/` |
| `domain/price-change.ts` | **preseli** v `platform/scanner/domain/`; modul uvaža od tam |
| `models/flight-search-run.model.ts`, `flight-notification.model.ts`, `flight-scheduler-settings.model.ts` | **izbriši**; zbirke se dropnejo (§9) |
| `admin.router.ts`, `admin-guard.ts` | **izbriši**; poti pod `/scanners/admin/*`; stanje virov in pošte postane `admin.extras()` tipa |
| `services/reconcile.service.ts` | ostane; `MatchEvent` dobi `recipients` in `payload`, da je neposredno `ScannerEvent` |
| `router.ts` | ostane; `GET /overview` bere zadnji zagon prek `platform/scanner` (`latestFinishedRun('flights')`) |
| `providers/*`, `domain/*` (ostalo), `offer-query`, `rule-*`, `models/*` (rule, offer, match, history, provider-status) | **nedotaknjeni** |
| nova `scanner/type.ts` | `flightScannerType`: `type: 'flights'`, `label: 'Leti'`, `execution: 'batch'`, `results: 'custom'`, `scopes: flight-deals:*`, `definitions`, `results`, `notifications`, `admin.extras`, `defaultSchedule: daily-06-18` |

Web: `admin.page.ts` se izbriše, pot `flight-deals/admin` ostane kot preusmeritev na
`/scanners/admin?type=flights`; `flight-deals.api.ts` izgubi `admin/*` metode;
`flight-deals.model.ts` izgubi tipe `Run`, `SchedulerSettings`, `NotificationAdmin`,
`SchedulePresetId` (preselijo se v `core/scanners/scanners.model.ts`).

## §8 — Odjemalec: register v `core/scanners/`, registracija iz `main.ts`

**Odločitev.** `core/scanners/scanner-ui.registry.ts` hrani `Map<type, ScannerUiPlugin>`:

```ts
interface ScannerUiPlugin {
  type: string;
  /** Lazy, da tip ne pride v začetni paket. */
  configComponent?: () => Promise<Type<ScannerConfigForm>>;   // single tipi
  resultsComponent?: () => Promise<Type<ScannerResultsView>>; // neobvezno; sicer privzeti seznam
  adminExtrasComponent?: () => Promise<Type<unknown>>;        // leti: viri in pošta
  createRoute?: string;                                        // tipi z lastnimi definicijami
}
```

Vsak modul ima `features/<x>/scanner-ui.ts` z eno funkcijo `register<X>ScannerUi()`, ki jo
`apps/web/src/main.ts` pokliče pred `bootstrapApplication` — ena vrstica na modul, zrcalo
`main.ts` zaledja. Generične strani (`features/scanners/`) tip vstavijo z `NgComponentOutlet`
in o nobenem tipu ne vedo po imenu. Besedila (ime, ikona, opis, presets) pridejo s strežnika
(`GET /scanners/types`), ne iz registra odjemalca — register nosi samo komponente.

**Razlog.** Lint pravilo prepoveduje uvoz med `features/`; `core/` sme uvažati kdor koli, sam
pa ne pozna modulov. `NgComponentOutlet` z lazy `import()` ohrani ločene pakete.

**Zavrnjeno.** Register v `core/` z `import('../../features/flight-deals/…')` — `core` bi poznal
module po imenu in brisanje modula bi zlomilo `core`.

## §9 — Pogrešljivi podatki: drop starih zbirk, aliasi za okolje

**Odločitev.** Ob zagonu `platform/scanner/services/legacy-cleanup.service.ts` preveri obstoj
zbirk `flightsearchruns`, `flightschedulersettings`, `flightnotifications` in jih **dropne** z
zapisom v dnevnik (`scanner.legacy.dropped`, imena in števila dokumentov). Teče enkrat na zagon,
pred prvim tikom; če zbirk ni, ne naredi nič. Ponudbe, ujemanja, zgodovina cen, iskanja in
stanje virov ostanejo. `FlightSearchRule.lastCheck.runId` kaže na izbrisan zagon — polje ostane,
ker je samo oznaka "kateri zagon"; vmesnik ga ne razrešuje.

Okolje: `FLIGHT_SCHEDULER_TICK_SECONDS → SCANNER_TICK_SECONDS`, `FLIGHT_RUN_STALE_MINUTES →
SCANNER_RUN_STALE_MINUTES`, `FLIGHT_RUN_RETENTION_DAYS → SCANNER_RUN_RETENTION_DAYS`. `loadEnv`
sprejme staro ime kot rezervo z opozorilom `env.deprecated` (vzorec: ni ga še; prvi primer).
`FLIGHT_HISTORY_RETENTION_DAYS` ostane letalski (zgodovina cen je v modulu); jedro dobi svoj
`SCANNER_HISTORY_RETENTION_DAYS` za generično zgodovino. Novo: `SCANNER_MAX_CONCURRENT_RUNS=1`,
`SCANNER_MAX_DEFINITIONS_PER_USER=20`, `SCANNER_ECHO_ENABLED=false` (produkcija zavrne).

**Razlog.** Lastnik je 19. 10. 2026 odločil, da podatki niso pomembni; migracijska skripta bi
bila koda brez bralca. Drop je zapisan v dnevnik in v `docs/scanner-engine.md`, da nikogar ne
preseneti.

**Zavrnjeno.** `renameCollection` + backfill — dela, a vzdržuje podatke, ki jih nihče ne rabi,
in zahteva idempotentno skripto z rollbackom za nič.

## §10 — Testni tip `echo`

**Odločitev.** `apps/api/src/modules/echo-scanner/` (modul brez zavihka, kot `modules/auth`) z
`scanner-type.ts`: `execution: 'single'`, `results: 'generic'`, `configSchema = { items: 1–20,
label }`, scenarij po zaporednem indeksu zagona definicije (iz `ScannerRun` števca, ne iz
pomnilnika): zagon 1 → N novih (cena `100 + i`), zagon 2 → isto, zagon 3 → rezultat 1 cena −10,
zagon 4+ → rezultat N izgine. `notifications.verify` vrne postavke, kot so; `render` sestavi
preprost dopis. Web: `features/echo-scanner/echo-config.component.ts` (eno številsko polje) in
`scanner-ui.ts`. `isEnabled(env) = env.SCANNER_ECHO_ENABLED`; `loadEnv` ga v produkciji zavrne
(ista `superRefine` veja kot `FLIGHT_FAKE_PROVIDER_ENABLED`).

**Razlog.** FR-046, FR-047, SC-004. Modul z dvema vrsticama registracije je hkrati predloga za
`docs/adding-a-scanner-type.md`.

## §11 — Administratorski varuh se dvigne v `platform/auth/`

**Odločitev.** `platform/auth/admin-guard.ts` z `requireAdminUser()` (pogoj in opomba iz
`modules/flight-deals/admin-guard.ts`). Jedro ga uporablja za `/scanners/admin/*`; kopija v
`modules/flight-deals/` se izbriše skupaj z `admin.router.ts`. `modules/analytics/admin-guard.ts`
se NE dotakne (014 ni v obsegu; research 015 §14 je dvig že predlagal kot ločen refaktor —
tu je dvignjen zato, ker ga jedro potrebuje, 014 pa ga lahko prevzame kdaj drugič).

## §12 — Vrstni red cevovoda (determinističen, dokumentiran)

```
tik (vsakih SCANNER_TICK_SECONDS)
 1. markInterruptedRuns            running brez utripa > SCANNER_RUN_STALE_MINUTES → interrupted
 2. scheduleDueRuns                batch tipi (urnik tipa) + single definicije (lasten urnik) → queued (slotKey)
 3. executeQueuedRuns              dokler obstaja queued in running < SCANNER_MAX_CONCURRENT_RUNS:
      a. claim queued → running
      b. type.execute(ctx)         tip: adapterji → normalizacija → (generic store | lastna shramba) → pravila → events
      c. jedro: buildNotifications(events) → pending (1 na prejemnika na zagon)
      d. finish: status, counters, definitions[], extras, runErrors
 4. processNotificationOutbox      claim → verify (tip) → render (tip) → sendEmail → sent | pending(backoff) | failed | suppressed
 5. pingOnce (srčni utrip)         kadar HEALTHCHECK_PING_URL obstaja in scheduler 002 ne teče
```

Korak 3b pri generični shrambi: `reconcileResults` naredi normalizacijo identitete, dedup, zaznavo
sprememb in zgodovino v tem vrstnem redu: upsert → history → unavailable → events. Pri letih
ostane vrstni red iz `reconcile.service.ts` (ponudbe → nedosegljivo → ujemanja).

## §13 — Zavrnjene možnosti, na kratko

| možnost | zakaj ne |
|---|---|
| Mongoose diskriminator nad `scannerdefinitions` za iskanja letov | sprememba modela letov brez dobička; podatki pogrešljivi, koda ni (§3) |
| ponudbe letov v `scannerresults` | ponudba je skupna, rezultat je last skenerja; dve zbirki za isto stvar (§5) |
| `switch (type)` v tiku | FR-001; register z dvema načinoma izvajanja ga ne potrebuje |
| živ cron (`new Cron(expr, fn)`) na definicijo | člen V.1; pri 100 definicijah 100 časovnikov in signal med izvodi |
| `platform/scanner` kot nov paket `packages/scanner` | jedro potrebuje Mongoose, `platform/cache`, `platform/email`, `platform/users` — to je `platform/`, ne knjižnica |
| potisna obvestila kot drugi kanal zdaj | FR-034: zasnova dopušča (`channel` na zapisu dopisa, privzeto `email`), izvedba ni v obsegu |
| obrazec iskanja letov kot komponenta v čarovniku | 527-vrstični urejevalnik s predogledom in prejemniki bi se razbil na dva dela brez koristi za lete; preusmeritev (§3) |
