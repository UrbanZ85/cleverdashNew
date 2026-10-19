# Implementation Plan: Iskalnik letalskih ponudb (Leti)

**Branch**: `015-flight-deals` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)
**Input**: Specifikacija "Flight Deal Finder" in odločitve lastnika z dne 17. 10. 2026
(research.md §3, §9, §10).

## Summary

Zavihek `flight-deals` ("Leti"): uporabnik opiše iskanje letov (letališča, cilj ali "kamor
koli", datumski način, fleksibilnost, nočitve, dnevi in ure, cena, potniki), sistem po urniku,
ki ga nastavi administrator, vpraša dovoljene vire, ponudbe primerja s prejšnjimi, zapiše
zgodovino cen in pošlje en zbirni e-poštni dopis na prejemnika, kadar se kaj spremeni.

Štiri stvari so v tej funkcionalnosti prve v aplikaciji in nosijo načrt:

| prvič v CleverDashu | kako je rešeno |
|---|---|
| urnik, nastavljiv v aplikaciji, samo za admina | lasten 60-s tik, nastavitve v bazi, `croner` samo za izračun terminov, unikaten `slotKey` (research §1, §2, §12) |
| pošiljanje e-pošte | nova skupna storitev `platform/email/` nad obstoječimi `SMTP_*`, outbox z atomarnim prevzemom (research §9) |
| zapis, ki ga vidi več ljudi, a ga ureja samo eden in drugi vidijo le izpeljanko | `FlightSearchRule` z `userId` + `recipients`; skupna `FlightOffer`; vez `FlightSearchMatch` (data-model.md) |
| zunanji vir z različnim pravnim statusom | adapterji z izidi `ok/noFlights/unsupported/unreachable/rateLimited/incomplete/disabled`; neuradni vir opt-in, zaščiteni viri `unsupported` (research §3–§6) |

## Technical Context

- **Jezik**: TypeScript, Node 22, Express 5, Mongoose 8 (zaledje); Angular 20 + Ionic 8
  (odjemalec); Luxon za čas; Chart.js že odvisnost.
- **Nove odvisnosti (zaledje)**: `nodemailer` 10.x (MIT-0, tipi vgrajeni), `croner` 10.x (MIT,
  brez odvisnosti). `geo-tz` 8.x samo kot `devDependency` za skripto gradnje nabora letališč —
  ne pride v sliko. Odjemalec: NOBENE.
- **Nove spremenljivke okolja**: 19 `FLIGHT_*` + `SMTP_SECURE`, vse s privzetkom razen žetona
  vira (research §15) → `docker compose up` iz čiste kopije deluje (vrata 4).
- **Nov nosilec**: NE. Nabor letališč je JSON v `assets/`, ki ga `copy-assets.mjs` že kopira.
- **Shramba**: 8 novih zbirk v modulu (data-model.md), TTL indeksi za vse časovno omejene;
  `ExternalCache` za odgovore virov.
- **Zmogljivost**: SC-007 — 50 iskanj / 20 kombinacij → ≤ 20 klicev na vir na zagon
  (deduplikacija `queryKey` + predpomnilnik). Zagon s 50 iskanji in dvema viroma pod 2 min pri
  vzporednosti 2 in timeoutu 15 s.
- **Omejitve**: samostojen Mongo brez transakcij → vsak zapis atomaren ali idempotenten
  (unikatni indeksi, `findOneAndUpdate` s pogojem v filtru). Ena API instanca v produkciji, a
  zaščita pred podvajanjem med izvodi je zahtevana (FR-050).
- **Obseg**: ~8 zbirk, ~20 poti, 6 strani odjemalca, 2 storitvi v `platform/`.

## Constitution Check

| člen | kako je izpolnjen |
|---|---|
| I — modul je samostojen | Vsa koda v `modules/flight-deals/` in `features/flight-deals/`; iz drugih modulov nič. Skupno gre v `platform/email/` (nova) in `platform/users/` (ena funkcija), kar je ista pot kot 010 in 014. Brisanje modula: mapa × 2, vnos v registru, vrstice v `main.ts`, pot v `app.routes.ts`, obsegi v `role-mapping.ts`, ikone — SC-011 je test. Lasten tik, ne scheduler 002 (research §1). |
| II — enoten izvor | Iste poti pod `/api/v1`, brez `cors()`. Povezave v dopisu kažejo na `PUBLIC_BASE_URL`. |
| III — API-first | Vse v pogodbi, vključno z `409` za sočasen zagon in `404` za tuje iskanje. Vse mutacije sprejmejo `Idempotency-Key`; `DELETE` vrne `200` s telesom. Administracija je edina brez API ključa — zapisano v pogodbi in v `admin-guard.ts`. |
| IV — skrivnosti | `FLIGHT_TRAVELPAYOUTS_TOKEN`, `SMTP_PASSWORD` samo v okolju; žeton gre v glavo, ne v URL (ne pristane v `ExternalCache.sourceUrl` ne v dnevniku). `.env.example` s praznimi vrednostmi. Celi e-naslovi ne zapustijo `platform/users/readUserEmails` → poštna seja. |
| V — determinizem in idempotentnost | V.1: zagon je zapis `FlightSearchRun`, urnik je zapis `FlightSchedulerSettings`; v pomnilniku je samo `setInterval`. V.2: tik vpraša "kateri termin je zapadel in nima zagona"; restart ne izgubi termina (dohitevanje zadnjega, research §2). V.3: unikatni `slotKey`; unikatni `(ruleId, offerId)`; unikatni `(recipientUserId, runId)`. V.4: cona letališča iz nabora, `Europe/Ljubljana` za urnik; lint prepoveduje `toISOString().split`. |
| VI — nobene neverificirane akcije | Edina "akcija" je dopis: outbox z `attemptCount`, `lastError`, `sentAt`, `messageId`; po izčrpanih poskusih `failed` z razlogom, vidno adminu. UNAVAILABLE samo iz potrjenega odgovora vira (FR-028). |
| VII — pokvarjen sistem pove | Vsak zagon ima `status`, `providers[]` z izidi in `errors[]`; iskanje nosi `lastCheck` po virih; `suppressed` dopisi so vidni z razlogom; `providerOfficial: false` in `notice` na viru. Dnevnik `flight.*` dogodki s `runId`. Omejitev: `/health` ne razširjamo (en sam slot, research §16) — zapisano. |
| VIII — vljudnost do virov | Vsak klic prek `platform/cache/getOrRefresh` (TTL 3600 s), deduplikacija poizvedb čez uporabnike, semafor vzporednosti, 500 ms premor pri Ryanairu, dnevna meja zagonov za neuradni vir, `429` se ne ponavlja. Pri ponudbi je naveden vir. Nobene kode za obhod zaščit (XII). |
| IX — testabilno brez brskalnika | Okna, ujemanje, identiteta, sprememba cene, termini, sestavljanje dopisa, izbira letališč po radiju so čiste funkcije v `domain/`; adapterji ločijo "sestavi zahtevo" od "razčleni odgovor" (vzorec `meteo/providers`). `FakeProvider` je testni vir, ne `DRY_RUN` — modul nima akcij, ki bi jih bilo treba suho zagnati. |
| X — slovenščina v domeni | `id: 'flight-deals'`, `route: '/flight-deals'`, polja angleška; naslov "Leti", vsa besedila vmesnika in dopisa slovenska, tikanje. |
| XI — mobilna naprava je odjemalec | Vse preverjanje in obveščanje na strežniku; odjemalec bere. |
| XII — meje | Wizz Air in easyJet `unsupported`; Ryanair opt-in z omejitvami; ničesar, kar bi obšlo CAPTCHA, prstne odtise ali omejitve. Hrani se najmanj: brez IP, brez celih naslovov v modulu. |

### Kakovostna vrata

1. `npm run typecheck` in `npm run lint` čista; brez `any` v `domain/`.
2. **Domenska logika ima enotske teste.** Od štirih imenovanih primerov imata predmet dva;
   ostala dva sta nadomeščena:

   | imenovan primer | ima predmet? | kaj ga tu pokriva |
   |---|---|---|
   | prehod na poletni/zimski čas | **DA** | okno 22. 10.–1. 11. 2026 čez 25. 10.: nočitve se štejejo po koledarskih dneh in ostanejo 3; "petek po 15:00" se presoja po lokalnem času LJU pred in po prehodu; termin urnika `0 6 * * *` 25. 10. je ob 6:00 lokalno in ne ob 5:00 |
   | praznik na delovni dan | ne — modul koledarja praznikov ne pozna | dnevi v tednu ISO 1–7: nedelja je 7 in ne 0; iskanje "samo petek" ne ujame sobote 00:10 po lokalnem času, ki je po UTC še petek |
   | dopust čez mejo meseca | ne — obdobij odsotnosti ni | rolling 6 mesecev od 31. 8. konča zadnji dan februarja; obdobje 22. 10.–1. 11. da poizvedbi za oktober IN november; okno, ki sega čez novo leto |
   | neuspel klic, ki se uspešno ponovi | **DA** | vir vrne 503, nato 200 → izid `ok`, ponudbe primerjane enkrat; pošta pade, nato uspe → en dopis, `attemptCount` 2; `429` se NE ponovi v istem zagonu |

3. OpenAPI pogodba: [`contracts/openapi.yaml`](contracts/openapi.yaml), validna
   (`@redocly/cli lint`: 0 napak, 6 opozoril iste vrste kot pri 014 — `info-license` in manjkajoč
   `4XX` pri GET-ih brez napak). Dodana v `packages/contracts/scripts/generate.ts` in v
   `.github/workflows/ci.yml` (vrata 3; 004–014 tam niso, 015 doda sebe).
4. Zagon iz čiste kopije brez dopolnjevanja `.env`: vse spremenljivke imajo privzetek; brez
   žetona vir vrne `disabled` in zagon konča `succeeded` z 0 poizvedbami.
5. Noben nov niz, ki je videti kot skrivnost; `.gitleaks.toml` ostane.

## Project Structure

### Dokumentacija

```
specs/015-flight-deals/
├── spec.md
├── plan.md            ← ta datoteka
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
├── tasks.md           ← /speckit-tasks
└── contracts/openapi.yaml
```

### Nova koda (API) — skupne zmogljivosti

```
apps/api/src/platform/email/
└── mailer.service.ts          isEmailConfigured(env), sendEmail({to,subject,html,text}) → {ok, messageId}|{ok:false, error, permanent}
                               nodemailer transport lazy; resetMailerForTests()
apps/api/src/platform/users/
└── directory.service.ts       + readUserEmails(ids) → Map<id,{email,displayName}>  (NI v nobenem routerju)
```

### Nova koda (API) — modul

```
apps/api/src/modules/flight-deals/
├── scopes.ts                   flight-deals:read | write | share
├── admin-guard.ts              requireFlightAdmin(): user + 'admin' (kopija vzorca 014, research §14)
├── router.ts                   /flight-deals/* (iskanja, ponudbe, referenčno)
├── admin.router.ts             /flight-deals/admin/*
├── flight-deals.audit.ts       flight.search.created|shared|unshared, flight.run.*, flight.notification.*
├── assets/
│   └── airports.json           OurAirports + tz (generiran, commitan)
├── domain/
│   ├── rule-input.ts           Zod sheme (create, patch, preview, query)
│   ├── rule-validation.ts      pomen: max>=min, from<=to, letališča obstajajo …
│   ├── airports.ts             nabor, iskanje po q (fold), haversine radij, država
│   ├── date-window.ts          okna odhodov/povratkov, rolling, kombinacije, ocena
│   ├── rule-matcher.ts         offerMatchesRule(offer, rule, now, airports)
│   ├── query-plan.ts           iskanja → množica queryKey; meja na iskanje
│   ├── identity.ts             kanonični niz → identityKey
│   ├── price-change.ts         changeType, absolute, percent
│   ├── booking-url.ts          samo gostitelj vira
│   ├── schedule-slots.ts       presets, validateCron, nextRun, latestDueSlot (croner, paused)
│   └── email-template.ts       renderDigest(items, ctx) → {subject, html, text}
├── models/
│   ├── flight-search-rule.model.ts
│   ├── flight-offer.model.ts
│   ├── flight-search-match.model.ts
│   ├── flight-offer-history.model.ts
│   ├── flight-search-run.model.ts
│   ├── flight-notification.model.ts
│   ├── flight-scheduler-settings.model.ts
│   └── flight-provider-status.model.ts
├── providers/
│   ├── types.ts                FlightProvider { id, label, official, isEnabled(env), buildQueries(plan), request(q) → SourceRequest, parse(body, q) → ProviderResult }
│   ├── index.ts                register: travelpayouts, ryanair, wizzair, easyjet, fake
│   ├── travelpayouts.provider.ts
│   ├── ryanair.provider.ts
│   ├── wizzair.provider.ts     unsupported
│   ├── easyjet.provider.ts     unsupported
│   └── fake.provider.ts        scenariji 120→89→110; zavrnjen v produkciji
├── services/
│   ├── rule-access.service.ts      requireOwnRule(userId, id) → 404; visibleRuleIdsFor(userId) (own + recipient)
│   ├── rule-response.service.ts    toSearchResponse (+ preview, recipients z imeni)
│   ├── offer-query.service.ts      seznam ponudb po scope/sort/limit + matches; podrobnosti + history
│   ├── concurrency.ts              semafor
│   ├── provider-runner.service.ts  queryKey → cache → parse → ProviderResult; status vira; dnevna meja
│   ├── reconcile.service.ts        normalizirane ponudbe → FlightOffer upsert, history, match, UNAVAILABLE
│   ├── run-executor.service.ts     en zagon: iskanja → plan → runner → reconcile → notifications; heartbeat; cancel
│   ├── notification-builder.service.ts  per prejemnik: items, re-verify, dedupe, pending
│   ├── notification-sender.service.ts   outbox: claim, render, sendEmail, backoff
│   ├── scheduler-settings.service.ts    getOrCreate, update, nextRun
│   └── tick.ts                     startFlightDealsScheduler(env, logger), runFlightTick(now), stopForTests
apps/api/scripts/
├── build-airports.mjs          OurAirports CSV + geo-tz → assets/airports.json
└── spike-travelpayouts.mjs     meritev pokritosti (quickstart §2)
```

### Nova koda (web)

```
apps/web/src/app/features/flight-deals/
├── flight-deals.model.ts         tipi iz pogodbe + čiste funkcije: formatPrice, changeLabel, windowText, weekdayLabels
├── flight-deals.api.ts           HttpClient → Promise; overview, searches CRUD, preview, recipients, offers, airports, countries, providers, admin/*
├── flight-deals.page.ts          nadzorna plošča modula: iskanja s stanjem, Nove, Spremembe, Najcenejše, zadnji zagon
├── searches.page.ts              Moja iskanja
├── search-editor.page.ts         ustvari/uredi (:searchId = 'new'), predogled, prejemniki
├── airport-picker.component.ts   iskalnik + radij + čipi
├── recipients-dialog.component.ts
├── offer-card.component.ts       cena, ~~stara~~, barva, oznaka, vir, čas podatka
├── offer-detail.page.ts          + price-chart
├── price-chart.component.ts      Chart.js ovoj (research §13)
├── shared-offers.page.ts         Deljene ponudbe
└── admin.page.ts                 urnik, Preveri zdaj, zgodovina zagonov, viri, outbox
```

### Dotiki obstoječih datotek (vsi iz `docs/adding-a-tab.md` ali tu utemeljeni)

| datoteka | sprememba |
|---|---|
| `apps/api/src/platform/tabs/registry.ts` | vnos `flight-deals`, order 12, `requiredScopes: ['flight-deals:read']` |
| `apps/api/src/main.ts` | `apiV1Router.use(flightDealsRouter); apiV1Router.use(flightDealsAdminRouter);` + `if (env.NODE_ENV !== 'test') startFlightDealsScheduler(env, logger);` |
| `apps/api/src/platform/keycloak/role-mapping.ts` | trije nizi v `BASE_USER_SCOPES` |
| `apps/api/src/platform/config/env.ts` | `FLIGHT_*`, `SMTP_SECURE`; zavrnitev `FLIGHT_FAKE_PROVIDER_ENABLED` v produkciji |
| `apps/api/src/platform/users/directory.service.ts` | `readUserEmails` |
| `apps/api/package.json` | `nodemailer`, `croner`; dev `geo-tz` |
| `apps/web/src/app/app.routes.ts` | 6 poti (`flight-deals` z `tabGuard`, podpoti samo `authGuard`) |
| `apps/web/src/app/core/icons/register-icons.ts` + `tests/unit/icons.spec.ts` | 5 ikon |
| `apps/web/src/app/shared/help/help-topics.ts` | `flightDeals.search`, `flightDeals.flex`, `flightDeals.sources`, `flightDeals.scheduler` |
| `apps/api/tests/unit/no-owner-fields.spec.ts` | tri vrstice (data-model.md) |
| `.env.example`, `docs/env-reference.md` | nov razdelek "Leti (015)"; §3 o e-pošti dobi odgovor |
| `packages/contracts/scripts/generate.ts` | cilj `015-flight-deals` → `flight-deals.d.ts` |
| `.github/workflows/ci.yml` | lint pogodbe 015 |
| `README.md` | razdelek "Leti (015)" |

### Testi

```
apps/api/tests/unit/flight-deals/        date-window, rule-matcher, identity, price-change, query-plan,
                                         schedule-slots, email-template, airports, booking-url, normalization
apps/api/tests/contract/flight-deals/    _helpers, searches-crud, preview, sharing, isolation, offers, admin, reference
apps/api/tests/integration/flight-deals/ run-concurrency, run-interrupted, provider-outage, dedupe,
                                         notification-outbox, cache-dedupe, tab-removal
apps/web/tests/unit/                     flight-deals-model.spec.ts, flight-deals-routes.spec.ts (regex nad app.routes)
```

Zunanji viri: `vi.stubGlobal('fetch', …)` po vzorcu `contract/meteo.spec.ts`; pošta:
`vi.mock('nodemailer', …)` po vzorcu `firebase-admin` v `restart-catchup.spec.ts`.

## Faze izvedbe (preslikava naročila §16 na naloge)

| faza iz naročila | kaj nastane | odvisno od |
|---|---|---|
| 2 — osnovni modul | scopes, registry, router (iskanja CRUD, preview, prejemniki, referenčno), modeli, nabor letališč, obrazec in strani odjemalca brez ponudb | — |
| 3 — viri | spike, `providers/*`, `provider-runner`, `query-plan`, `reconcile` (brez obvestil), `FakeProvider` | 2 |
| 4 — scheduler | `tick.ts`, `run-executor`, nastavitve urnika, admin API in stran | 3 |
| 5 — sledenje cen | `identity`, `price-change`, `FlightOfferHistory`, `offer-query`, podrobnosti + graf | 3 |
| 6 — obvestila | `platform/email`, `readUserEmails`, `notification-builder/sender`, predloga, outbox v adminu | 4, 5 |
| 7 — testi in skladnost | integracijski testi, odstranitev modula (SC-011), docs, README, CI | vse |

Reda 2 in 3 se v `tasks.md` prepleteta po uporabniških zgodbah (US1 → US2 → US3 → US4/5 → US6 →
US7), ker je vsaka zgodba samostojno preverljiva.

## Complexity Tracking

| odstop | zakaj | enostavnejša možnost zavrnjena, ker |
|---|---|---|
| Nova mapa `platform/email/` iz funkcionalnosti (ne ločen PR) | Modul brez pošte ne izpolni US4; storitev je generična in jo `docs/env-reference.md` §3 že pričakuje | Modularna `mailer.ts` bi bila ob naslednjem modulu, ki pošilja pošto, podvojena ali uvožena čez mejo modula (člen I) |
| Kopija `admin-guard.ts` v modulu | `modules/analytics/admin-guard.ts` ni uvozljiv (člen I) | Dvig v `platform/auth/` spreminja modul 014 — predlagan kot ločen refaktor |
| Dve novi odvisnosti zaledja | `nodemailer`: SMTP brez knjižnice je več sto vrstic in brez STARTTLS; `croner`: validacija in izračun cron izrazov | lasten cron parser bi bil domenska koda brez testnega korpusa; `setInterval` z "vsakih N ur" ne pokrije "vsak ponedeljek ob 8:00" (FR-046) |
| Neuradni vir (Ryanair) v kodi | odločitev lastnika; privzeto izklopljen; precedens Neverin (011) | izpustitev bi pomenila, da brez pokritosti Travelpayouts modul za LJU nima podatkov; opt-in pušča odločitev lastniku namestitve |
| Pošiljanje pošte v tiku, ne ob zagonu | outbox s ponovitvami (člen VI) | neposredno pošiljanje ob padcu procesa izgubi ali podvoji dopis |
