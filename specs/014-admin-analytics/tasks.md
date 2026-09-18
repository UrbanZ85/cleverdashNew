---

description: "Task list for feature implementation"
---

# Tasks: Administratorska analitika (014)

**Vhod**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/openapi.yaml](contracts/openapi.yaml)

Oznaka `[P]` pomeni, da naloga ne blokira naslednje in bi lahko tekla vzporedno (druga datoteka,
brez odvisnosti). Oznaka `[USn]` veže nalogo na uporabniško zgodbo iz specifikacije.

**Testi niso neobvezni.** Kakovostna vrata ustave (točka 2) zahtevajo enotske teste domenske
logike in veljavno pogodbo; obojega ta seznam ne obravnava kot dodatek.

## Path Conventions

- zaledje: `apps/api/src/`, testi `apps/api/tests/`
- odjemalec: `apps/web/src/app/`, testi `apps/web/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Namen**: vpisi, brez katerih se zavihek ne pojavi in nastavitve ne obstajajo.

- [X] T001 [P] Dodaj štiri spremenljivke s privzetki (`USAGE_RETENTION_DAYS`=400, `USAGE_VIEW_DEDUPE_SECONDS`=60, `ANALYTICS_CACHE_SECONDS`=300, `ANALYTICS_ORPHAN_GRACE_HOURS`=24) v `apps/api/src/platform/config/env.ts` in jih prepiši v `.env.example`
- [X] T002 [P] Registriraj ikono `stats-chart-outline` v `apps/web/src/app/core/icons/register-icons.ts` in jo dodaj v seznam v `apps/web/tests/unit/icons.spec.ts`
- [X] T003 Dodaj vnos zavihka v `apps/api/src/platform/tabs/registry.ts`: `id: 'analytics'`, `title: 'Analitika'`, `icon: 'stats-chart-outline'`, `route: '/analytics'`, `order: 11`, `requiredScopes: ['admin']`, `enabled: true`

**Checkpoint**: `GET /tabs` vrne zavihek adminu in ga ne vrne navadnemu uporabniku.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Namen**: dovolilnica in ogrodje, na katerih stojita oba pregleda.

**⚠️ Brez te faze ne sme začeti nobena zgodba.**

- [X] T004 Napiši `requireAdminUser()` v `apps/api/src/modules/analytics/admin-guard.ts`: zahteva `req.auth.subjectType === 'user'` **in** obseg `admin`, oboje ločeno preverjeno (research.md §10), z enim samim `403` za oba primera
- [X] T005 Ustvari ogrodje `apps/api/src/modules/analytics/router.ts` (`express.Router()`, `requireAdminUser()` na vseh poteh) in ga vpni z enim `apiV1Router.use(analyticsRouter)` v `apps/api/src/main.ts`
- [X] T006 [P] Napiši pomočnike za pogodbene teste v `apps/api/tests/contract/analytics/_helpers.ts`: prijava kot admin, kot navaden uporabnik in klic z API ključem
- [X] T007 Napiši pogodbeni test dovolilnice v `apps/api/tests/contract/analytics/access.spec.ts`: navaden uporabnik dobi `403`, API ključ dobi `403`, zavihka `analytics` ni v njegovem `GET /tabs` (FR-001 do FR-004, SC-004)
- [X] T008 Ustvari odjemalčevo ogrodje: `apps/web/src/app/features/analytics/analytics.api.ts` in `analytics.page.ts` z dvema segmentoma (Prostor | Uporaba), ter dodaj pot `analytics` z `authGuard` in `tabGuard` v `apps/web/src/app/app.routes.ts`

**Checkpoint**: zavihek se odpre, oba segmenta sta prazna, dostop je zaprt vsem razen adminu.

---

## Phase 3: User Story 1 — Poraba prostora (Priority: P1) 🎯 MVP

**Cilj**: administrator vidi skupno porabo, razbitje po viru in po osebi, števila zapisov in
zasedenost nosilca.

**Independent Test**: naloži datoteko, sliko k receptu in posnetek k beležki; vse tri se pojavijo
v svojih vrsticah, vsota vrstice po osebi je enaka vsoti njenih postavk.

### Testi za US1

- [X] T009 [P] [US1] `apps/api/tests/unit/analytics-sources.spec.ts` — vsako ime zbirke iz tabele virov obstaja med zbirkami zagnane aplikacije; tabela brez tega varovala je tih prepis (research.md §2)
- [X] T010 [P] [US1] `apps/api/tests/unit/analytics-storage-rollup.spec.ts` — oseba brez vsebine je v tabeli z ničlo (FR-008), zapis brez lastnika pristane v vrstici `userId: null` in ostane v skupni vsoti (FR-013), vsota vrstice = vsota postavk
- [X] T011 [P] [US1] `apps/api/tests/contract/analytics/storage.spec.ts` — oblika odgovora po pogodbi, `computedAt`/`cachedUntil`, `?fresh=true` da novejši `computedAt`
- [X] T012 [P] [US1] `apps/web/tests/unit/analytics-format.spec.ts` — oblikovanje bajtov (B/KB/MB/GB), delež vrstice, ničla ni prazen niz

### Izvedba US1

- [X] T013 [P] [US1] `apps/api/src/modules/analytics/domain/storage-sources.ts` — tabela virov (id, slovensko ime, zbirka, polje lastnika, izraz za bajte, ali se le šteje) in čista funkcija, ki tabelo preseje po seznamu obstoječih zbirk
- [X] T014 [P] [US1] `apps/api/src/modules/analytics/domain/storage-rollup.ts` — čisto zlaganje vsot po viru in po osebi, polnjenje z ničlami, vrstica za neznanega lastnika
- [X] T015 [US1] `apps/api/src/modules/analytics/services/storage-usage.service.ts` — agregacije prek `mongoose.connection.db` po imenu zbirke (**nobenega uvoza tujega modela**), `$binarySize: '$thumb'` za pomanjšave, `db.listCollections()` za izpuščanje odsotnih virov
- [X] T016 [P] [US1] `apps/api/src/modules/analytics/services/disk-scan.service.ts` — `statfs` nad `FILE_SHARE_DIR`; ob napaki `volume: null` in `volumeUnavailableReason`, nikoli tiha ničla (člen VII)
- [X] T017 [US1] `apps/api/src/modules/analytics/services/snapshot-cache.service.ts` — TTL v procesu (`ANALYTICS_CACHE_SECONDS`) z eno poizvedbo v teku; `fresh` zavrže vrednost
- [X] T018 [US1] Dodaj `GET /analytics/storage` (s parametrom `fresh`) v `apps/api/src/modules/analytics/router.ts`
- [X] T019 [P] [US1] `apps/web/src/app/features/analytics/analytics.model.ts` — tipi po pogodbi in čiste funkcije prikaza (bajti, deleži)
- [X] T020 [US1] `apps/web/src/app/features/analytics/storage-panel.component.ts` — tabela virov, tabela oseb z vodoravnimi stolpci iz CSS, **ločena** vrstica za zasedenost nosilca (FR-015)
- [X] T021 [US1] `apps/api/tests/integration/analytics-missing-module.spec.ts` — brez zbirke enega vira pregled odgovori, vir ima `present: false`, ostali so nedotaknjeni (SC-007)

**Checkpoint**: US1 deluje sama zase; zavihek je uporaben tudi brez telemetrije.

---

## Phase 4: User Story 2 — Prijave in zadnja aktivnost (Priority: P1)

**Cilj**: administrator vidi, kolikokrat se je kdo prijavil v obdobju in kdaj je bil nazadnje tu.

**Independent Test**: prijavi se z dvema računoma; obe osebi imata po eno prijavo in čas zadnje
aktivnosti, obdobje je preklopljivo.

### Testi za US2

- [X] T022 [P] [US2] `apps/api/tests/unit/usage-counter.spec.ts` — dan po `Europe/Ljubljana` (nikoli `toISOString()`), **prehod na poletni in zimski čas**: dan s 23 in dan s 25 urami dasta vsak natanko en ključ; `expiresAt` se izračuna iz dneva in je ob ponovnem povečanju ista vrednost (research.md §5, §11)
- [X] T023 [P] [US2] `apps/api/tests/unit/analytics-usage-window.spec.ts` — okno 90 dni **čez novo leto**: `fromDay` v prejšnjem letu, vsi dnevi zajeti, nobeden podvojen; `truncated` je `true`, kadar obdobje sega pred `dataSince` ali pred rok hrambe
- [X] T024 [P] [US2] `apps/api/tests/contract/analytics/usage.spec.ts` — prijave po osebi, `coverage.dataSince: null` na prazni zbirki, oseba brez prijav je v seznamu z ničlo (FR-039)

### Izvedba US2

- [X] T025 [P] [US2] `apps/api/src/platform/usage/domain/usage-day.ts` — `usageDay(date)` prek `ljubljanaCalendarDay()` in `expiryFor(day, retentionDays)`
- [X] T026 [US2] `apps/api/src/platform/usage/usage-counter.model.ts` — polja po data-model.md, unikaten indeks `(userId, day, kind, key)`, TTL na `expiresAt`, `key: '-'` za prijave
- [X] T027 [US2] `apps/api/src/platform/usage/recorder.service.ts` — en `findOneAndUpdate` z `upsert` in filtrom `lastAt: { $lt: cutoff }`; `E11000` se prestreže kot "že šteto" in **ni** napaka (research.md §4)
- [X] T028 [US2] Dodaj **eno vrstico** `await recordLogin(String(user._id))` ob `auditLogin(...)` v `apps/api/src/modules/auth/router.ts` (isti vzorec kot `migrateLegacyDataIfNeeded` dve vrstici više)
- [X] T029 [P] [US2] `apps/api/src/modules/analytics/domain/usage-window.ts` — 7/30/90 dni → `fromDay`/`toDay` in `coverage`
- [X] T030 [US2] `apps/api/src/modules/analytics/services/usage-stats.service.ts` — prijave po osebi v oknu, `lastLoginAt` iz zbirke uporabnikov (ne iz števcev), `activeUsers`/`inactiveUsers`
- [X] T031 [US2] Dodaj `GET /analytics/usage?days=` v `apps/api/src/modules/analytics/router.ts`
- [X] T032 [US2] `apps/web/src/app/features/analytics/usage-panel.component.ts` — izbirnik obdobja, tabela prijav, **vidno opozorilo o pokritosti**, kadar je `truncated` ali `dataSince` prazen (FR-038)

**Checkpoint**: prijave se štejejo in prikazujejo; ogledov še ni.

---

## Phase 5: User Story 3 — Ogledi zavihkov (Priority: P2)

**Cilj**: administrator vidi, kateri zavihki se odpirajo in kateri ne — skupno in po osebi.

**Independent Test**: klikni po petih zavihkih; vsak ima števec ogledov in čas zadnjega ogleda,
neuporabljeni so na lestvici z ničlo.

**Odvisnost**: potrebuje T026 in T027 iz US2 (zbirka in zapisovalnik). Če se ta zgodba gradi pred
US2, se ti dve nalogi preseli sem.

### Testi za US3

- [X] T033 [P] [US3] `apps/api/tests/unit/usage-tab-key.spec.ts` — oznaka zavihka se sprejme samo iz registra; poljuben niz zavrnjen (FR-031)
- [X] T034 [P] [US3] `apps/api/tests/contract/analytics/views.spec.ts` — prvi klic `counted: true`, štirje zaporedni `counted: false` (FR-027), neznana oznaka `400`, API ključ `403`, `Idempotency-Key` sprejet
- [X] T035 [P] [US3] `apps/api/tests/contract/analytics/acting-as.spec.ts` — admin s prevzemom imena: ogled se zapiše **adminu** in ne izbrani osebi (FR-026); najbolj tiha napaka te funkcionalnosti
- [X] T036 [P] [US3] `apps/web/tests/unit/analytics-tracker.spec.ts` — preslikava poti v oznako zavihka, neznana pot ne pošlje ničesar, napaka omrežja ne pride do uporabnika (FR-029)

### Izvedba US3

- [X] T037 [P] [US3] `apps/api/src/platform/usage/domain/tab-key.ts` — preverba oznake proti `TAB_REGISTRY`
- [X] T038 [US3] `apps/api/src/platform/usage/router.ts` — `POST /usage/views` z `requireScopes()` (brez poimenovanega obsega), zapis za `req.actor.subjectId` in **nikoli** za `req.auth`
- [X] T039 [US3] Vpni `apiV1Router.use(usageRouter)` v `apps/api/src/main.ts`
- [X] T040 [US3] `apps/api/src/modules/analytics/domain/usage-rollup.ts` — lestvica zavihkov za namestitev in razbitje po osebi, polnjenje z ničlami iz razrešenega registra (FR-035, FR-036, FR-039)
- [X] T041 [US3] Razširi `apps/api/src/modules/analytics/services/usage-stats.service.ts` z ogledi in jih vključi v odgovor `GET /analytics/usage`
- [X] T042 [US3] `apps/web/src/app/core/usage/usage-tracker.service.ts` — `NavigationEnd` → oznaka zavihka prek `TabRegistryService` → pošlji in pozabi; napaka se pogoltne
- [X] T043 [US3] Dodaj **eno vrstico** `inject(UsageTrackerService)` v `apps/web/src/app/app.component.ts` (isto mesto kot `ThemeService` in `DeepLinkHandler`)
- [X] T044 [US3] Razširi `apps/web/src/app/features/analytics/usage-panel.component.ts` z lestvico zavihkov in razbitjem po osebi

**Checkpoint**: US1, US2 in US3 delujejo neodvisno druga od druge.

---

## Phase 6: User Story 4 — Razhajanje med diskom in bazo (Priority: P2)

**Cilj**: administrator izve, da za zapisom ni vsebine ali da je na disku vsebina brez zapisa.

**Independent Test**: odstrani datoteko izpod nosilca mimo aplikacije; pregled to pove s številom
in prostorom prizadetih zapisov.

### Testi za US4

- [X] T045 [P] [US4] `apps/api/tests/unit/analytics-integrity.spec.ts` — iz dveh množic identifikatorjev nastanejo ugotovitve; sirota, mlajša od `ANALYTICS_ORPHAN_GRACE_HOURS`, se **ne** prijavi; brez razhajanj je `clean: true` in ne prazen seznam (FR-019)
- [X] T046 [P] [US4] `apps/api/tests/integration/analytics-integrity.spec.ts` — umetna sirota na disku in umetno izbrisana vsebina se pojavita v `findings` z ničemer pobrisanim (FR-020)

### Izvedba US4

- [X] T047 [P] [US4] `apps/api/src/modules/analytics/domain/integrity.ts` — čista razsodba nad množicama identifikatorjev in stanji zapisov; štiri vrste ugotovitev
- [X] T048 [US4] Razširi `apps/api/src/modules/analytics/services/disk-scan.service.ts` z rekurzivnim sprehodom po `blobs/`; primerja se `basename`, ne pot (research.md §8)
- [X] T049 [US4] Vključi `integrity` v posnetek v `apps/api/src/modules/analytics/services/snapshot-cache.service.ts` (isti izračun, isti predpomnilnik — disk se prehodi enkrat)
- [X] T050 [US4] Prikaži opozorila oz. izrecno "razhajanj ni" v `apps/web/src/app/features/analytics/storage-panel.component.ts`

**Checkpoint**: pregled zna povedati, da je pokvarjen (člen VII).

---

## Phase 7: User Story 5 — Iste številke brez vmesnika (Priority: P3)

**Cilj**: administrator dobi enake podatke s HTTP klicem.

**Independent Test**: primerjaj odgovor klica s tem, kar kaže zaslon — polja, ki bi bilo samo v
vmesniku, ni nobenega.

- [X] T051 [P] [US5] `apps/api/tests/contract/analytics/parity.spec.ts` — vsako polje, ki ga zaslon prikaže, je v odgovoru klica; `days` deluje enako kot izbirnik (SC-005)
- [X] T052 [US5] Preveri [contracts/openapi.yaml](contracts/openapi.yaml) proti dejanskim odgovorom in popravi razhajanja; pogodba se vzdržuje v isti spremembi kot koda (člen III)

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T053 [P] Dopolni [README.md](README.md) z razdelkom o funkcionalnosti 014 — kaj se beleži in kaj se **ne** beleži (člen XII)
- [X] T054 [P] Dopolni [docs/env-reference.md](docs/env-reference.md) s štirimi novimi spremenljivkami in njihovim učinkom
- [X] T055 Preveri mejo modula: `npx eslint apps/api/src/modules/analytics apps/web/src/app/features/analytics` mora biti čist — noben uvoz iz tujega modula (člen I)
- [X] T056 Izvedi vse preverbe iz [quickstart.md](quickstart.md), vključno z rokom hrambe prek TTL indeksa
- [X] T057 `npm run typecheck`, `npm run lint`, `npm test` — vsi čisti (kakovostna vrata 1 in 2)

---

## Dependencies & Execution Order

### Faze

- **Phase 1 (Setup)**: brez odvisnosti
- **Phase 2 (Foundational)**: po Phase 1 — **blokira vse zgodbe**
- **Phase 3–7 (zgodbe)**: po Phase 2
- **Phase 8 (Polish)**: po zgodbah, ki se dostavljajo

### Med zgodbami

- **US1 (P1)**: neodvisna. Je MVP.
- **US2 (P1)**: neodvisna od US1 — druga polovica zaslona, druga zbirka.
- **US3 (P2)**: potrebuje T026 in T027 iz US2. Edina prava odvisnost med zgodbami.
- **US4 (P2)**: nadgradnja US1 (isti posnetek, isti predpomnilnik). Brez US1 nima kam pisati.
- **US5 (P3)**: potrebuje vsaj eno od US1/US2, sicer ni česa primerjati.

### Znotraj zgodbe

Testi → čiste funkcije (`domain/`) → modeli → storitve → poti → odjemalec.

### Vzporedne priložnosti

- T001 in T002 hkrati.
- Vsi testi ene zgodbe (`[P]`) hkrati.
- Čiste funkcije `domain/` znotraj zgodbe hkrati — vsaka je svoja datoteka brez odvisnosti.
- US1 in US2 lahko gradita dva človeka hkrati; US3 počaka na T027, US4 na T017.

---

## Parallel Example: User Story 1

```bash
# Testi US1 hkrati:
T009  apps/api/tests/unit/analytics-sources.spec.ts
T010  apps/api/tests/unit/analytics-storage-rollup.spec.ts
T011  apps/api/tests/contract/analytics/storage.spec.ts
T012  apps/web/tests/unit/analytics-format.spec.ts

# Čiste funkcije US1 hkrati:
T013  modules/analytics/domain/storage-sources.ts
T014  modules/analytics/domain/storage-rollup.ts
```

---

## Implementation Strategy

### MVP (samo US1)

1. Phase 1 → Phase 2 → Phase 3.
2. **Ustavi se in preveri**: zavihek pokaže porabo, navaden uporabnik ga ne vidi.
3. To je uporaben izdelek: odgovarja na vprašanje, ki je funkcionalnost sprožilo.

### Postopna dostava

1. Setup + Foundational → ogrodje stoji.
2. US1 → poraba prostora → **MVP**.
3. US2 → prijave → zaslon je poln.
4. US3 → ogledi zavihkov.
5. US4 → celovitost shrambe.
6. US5 → potrditev, da je vse tudi na API-ju.

### Kaj bo najlažje narediti narobe

Tri mesta, ki jih je vredno prebrati dvakrat, preden se napiše koda:

- **T038** — `req.actor`, ne `req.auth`. Za vse ostale module velja obratno
  (`docs/adding-a-tab.md`, korak 7), zato je to natanko tisto, kar se napiše po navadi in je tu
  narobe. Test T035 je edina mreža pod tem.
- **T015** — noben `import` iz `modules/recipes`, `modules/notes` ali `modules/file-sharing`.
  Lint to zavrne, a šele ko je koda že napisana.
- **T027** — `E11000` ni napaka. Če se prepusti obravnavi napak, bo vsak drugi ogled v
  dnevniku videti kot okvara.

---

## Kaj se je med izvedbo razlikovalo od tega seznama

Vse naloge so opravljene. Sedem jih je pristalo v drugi datoteki ali drugem vrstnem redu, kot je
bilo načrtovano — zapisano tukaj, da je seznam še vedno uporaben kot zemljevid kode.

| naloga | načrtovano | dejansko | zakaj |
|---|---|---|---|
| T010 | `analytics-storage-rollup.spec.ts` | `tests/unit/analytics-rollup.spec.ts` | obe zlaganji (poraba in uporaba) lovita ISTI dve napaki (izpuščene vrstice brez lastnika, izpuščene prazne vrstice); ločeni datoteki bi ta par razdružili |
| T012, T036 | dve datoteki | `apps/web/tests/unit/analytics-model.spec.ts` | obe sta čisti funkciji vmesnika in v tem projektu spletni testi ne uporabljajo `TestBed` |
| T021, T046 | dve datoteki | `tests/integration/analytics-resilience.spec.ts` | oba primera sta "kaj se zgodi, ko okolje ni takšno, kot pričakujemo" |
| T033 | `usage-tab-key.spec.ts` | del `tests/unit/usage-counter.spec.ts` | oboje je domena `platform/usage/`, skupaj 13 testov |
| T016, T048 | dve nalogi | `disk-scan.service.ts` napisan enkrat | `statfs` in sprehod po `blobs/` sta isti nosilec in ista datoteka; pisati jo dvakrat bi pomenilo drugič prepisati prvo |
| T047 | faza US4 | napisano pred US4 | `snapshot-cache.service.ts` iz US1 celovitost že vključuje; vrstni red faz bi zahteval, da se posnetek napiše dvakrat |
| T051 | razčlenitev pogodbe | prepisan seznam polj v `parity.spec.ts` | `js-yaml` ni odvisnost `apps/api`, ampak posredna odvisnost drugod; test, ki jo uvozi, se podre ob tuji spremembi. Prepis je isti vzorec kot `icons.spec.ts` |

**Kaj NI pokrito s testom in je vredno vedeti:** da `UsageTrackerService` napako omrežja pogoltne
(FR-029), je zagotovljeno z zgradbo kode (`subscribe({ error: … })` in `try/catch`), ne s testom —
spletni testi v tem projektu nikjer ne uporabljajo `TestBed` in ta funkcionalnost ni pravo mesto, da
se ta vzorec uvede. Preslikava naslova v oznako zavihka, ki je edini del te poti z odločitvijo, JE
pokrita (`tabIdForUrl`, 9 testov).
