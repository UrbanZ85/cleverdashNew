# Jedro skenerjev (016)

Skupna zmogljivost v `apps/api/src/platform/scanner/`, ki po urniku izvaja **tipe skenerjev**,
hrani rezultate, zazna spremembe in pošilja dopise. Nasledila je tik, zagone, urnik in outbox
modula Leti (015); leti so od 016 en tip med drugimi. Kako dodati tip, je v
[`adding-a-scanner-type.md`](adding-a-scanner-type.md); specifikacija in načrt sta v
`specs/016-scanner-engine/`.

## Plasti

| plast iz naročila | kje | kdo |
|---|---|---|
| Scanner Definition | `models/scanner-definition.model.ts` (generične); tip z lastnimi definicijami prek `ScannerType.definitions` | jedro / tip |
| Scheduler / ročni zagon | `services/scheduler.service.ts`, `services/tick.ts`, `admin.router.ts`, `router.ts` | jedro |
| Execution Engine | `services/run-executor.service.ts` | jedro |
| Scanner Type Plugin | `ScannerType` v `types.ts`; register v `registry.ts` | tip |
| Data Source Adapters | v mapi tipa, prek `platform/cache` | tip |
| Normalized Results | `NormalizedResult` → `services/result-store.service.ts` | tip → jedro |
| Processing / Rules | koraki tipa pred `reconcile`; jedro: identiteta, dedup, spremembe, zgodovina, nedosegljivost | tip / jedro |
| Persistence / Change Detection | `models/scanner-result*.model.ts`, `domain/change-detection.ts`, `domain/price-change.ts` | jedro (ali lastna shramba tipa) |
| Notifications | `services/notification-builder.service.ts`, `services/notification-sender.service.ts`, `platform/email` | jedro; vsebina prek `notifications.verify/render` tipa |

Jedro NE uvaža iz `modules/` (test `tests/unit/scanner-core-boundary.spec.ts`) in besede
"flight" v njegovi kodi ni — razen imen treh zastarelih zbirk v `legacy-cleanup.service.ts`.

## Dva načina izvajanja

- **`batch`** (leti): en zagon za vse skenerje tipa po urniku TIPA (`ScannerTypeSettings`, admin).
  `slotKey = schedule:type:<tip>:<termin v coni>`.
- **`single`** (echo, bodoči tipi): zagon na skener po urniku SKENERJA (`ScannerDefinition.schedule`).
  `slotKey = schedule:def:<id>:<termin v coni>`.

Ročni zagon je `manual:<id zagona>`. Isti obseg nikoli ne teče dvakrat (unikatni `slotKey`,
preverba `queued|running` istega obsega → 409); zagoni različnih obsegov tečejo zaporedno, dokler
število tekočih (drugih izvodov) ne doseže `SCANNER_MAX_CONCURRENT_RUNS`.

## Cevovod tika (`services/tick.ts`)

```
vsakih SCANNER_TICK_SECONDS
 1. markInterruptedRuns     running brez utripa > SCANNER_RUN_STALE_MINUTES → interrupted
 2. scheduleDueRuns         urniki tipov (batch) + urniki skenerjev (single) → queued; definicije
                            neregistriranega ali izklopljenega tipa se preskočijo (dnevnik enkrat na proces)
 3. executeQueuedRuns       dokler je queued in running < SCANNER_MAX_CONCURRENT_RUNS:
      a. claim queued → running (findOneAndUpdate s stanjem v filtru)
      b. type.execute(ctx)   tip: adapterji → normalizacija → ctx.results.reconcile (generic) ali lastna shramba → events
      c. buildNotifications  events → ScannerNotification (1 na prejemnika na zagon, dedup po resultRef)
      d. finish              status, counters, definitions[], extras, runErrors; status skenerja pri single
 4. processNotificationOutbox  claim pending → type.verify → type.render → sendEmail → sent | pending(backoff) | failed | suppressed
```

`reconcile` v generični shrambi: upsert po identiteti (dedup znotraj zagona in med zagoni) →
zgodovina (tudi `UNCHANGED`) → `UNAVAILABLE` za rezultate, ki jih ta zagon ni vrnil, SAMO pri
`sourceSucceeded: true` → dogodki `NEW | PRICE_DOWN | PRICE_UP | CHANGED`. Sprememba se pri ceni
ugotovi prek `classifyChange`, brez cene prek hasha polja `comparable`.

Dohitevanje je omejeno na EN termin na obseg (`latestDueSlot`); sprememba izraza ali cone premakne
"pokrito do zdaj" (`lastScheduledSlotAt`) na trenutek spremembe.

## Zbirke

| zbirka | vsebina | TTL |
|---|---|---|
| `scannerdefinitions` | generične definicije (`userId`, `type`, `schedule`, `config`, `status`) | — |
| `scannertypesettings` | urnik tipa (batch), en zapis na tip | — |
| `scannerruns` | zagoni vseh tipov (`scope`, `slotKey` unikat, `counters` Map, `definitions[]`, `extras`) | `SCANNER_RUN_RETENTION_DAYS` |
| `scannerresults` | generični rezultati (`{definitionId, identityKey}` unikat, cena neobvezna) | `expiresAt` (tip ali 30 dni po zadnjem ogledu) |
| `scannerresulthistories` | opazovanja rezultatov | `SCANNER_HISTORY_RETENTION_DAYS` |
| `scannernotifications` | outbox dopisov (`{recipientUserId, runId}` unikat, `payload` postavke last tipa) | `SCANNER_RUN_RETENTION_DAYS` |

Vsi TTL-ji so indeksi na `expiresAt` (`tests/integration/scanner/indexes.spec.ts`).

**Zastarele zbirke 015.** Ob vsakem zagonu `legacy-cleanup.service.ts` preveri obstoj
`flightsearchruns`, `flightschedulersettings` in `flightnotifications` in jih **dropne** z
zapisom `scanner.legacy.dropped` (ime, število dokumentov). Odločitev lastnika 19. 10. 2026:
podatki so bili testni in se niso selili. Iskanja, ponudbe, ujemanja, zgodovina cen in stanje
virov letov ostanejo. Po prvem zagonu je klic prazen.

## Okolje

`SCANNER_TICK_SECONDS`, `SCANNER_RUN_STALE_MINUTES`, `SCANNER_RUN_RETENTION_DAYS`,
`SCANNER_HISTORY_RETENTION_DAYS`, `SCANNER_MAX_CONCURRENT_RUNS`, `SCANNER_MAX_DEFINITIONS_PER_USER`,
`SCANNER_ECHO_ENABLED` — glej `env-reference.md`. Tri stare `FLIGHT_*` so rezerva z opozorilom
`env.deprecated` ob zagonu.

## Pravice

Skupna obsega `scanners:read`/`scanners:write` (seznam, generične definicije, rezultati). Tip
lahko zahteva svoja (leti: `flight-deals:*`) — brez njih klicatelj tipa ne vidi med razpoložljivimi
in ne bere njegovih vrstic. Administracija (`/scanners/admin/*`) je samo prijavljen človek z
`admin` (`platform/auth/admin-guard.ts`); API ključ ne pride skozi. Prevzem imena (012) velja za
seznam in definicije, ne za administracijo.

## Kaj jedro ve o letih in česa ne

Ve: da obstaja tip `flights` (prek registra, ob zagonu), da je `batch`, da ima lastne definicije
in rezultate in da prispeva dodatek za administracijo. Ne ve: kaj je iskanje, ponudba, vir,
letališče, prejemnik. Vse to je v `modules/flight-deals/scanner/*`, ki jedro samo kliče.

## Omejitve

- `/health` se ne razširja: edina razširitev (`platform/health/extension.ts`) je rezervirana za
  scheduler 002 in njena oblika je del pogodbe 001. Stanje skenerjev je v administraciji
  (`GET /scanners/admin/types`, `/runs`) in v dnevniku (`scanner.*`).
- Potisna obvestila niso vključena; `ScannerNotification.channel` je rezerviran (`email`).
- Lasten urnik na iskanje letov ni mogoč (tip je `batch`); preklop bi bil sprememba tipa brez
  spremembe jedra.
