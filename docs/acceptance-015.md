# Sprejemno preverjanje — 015 (Leti, iskalnik letalskih ponudb)

Datum: 2026-10-17. Preverjeno s celotnim samodejnim naborom testov in s pregledom kode proti
[`specs/015-flight-deals/`](../specs/015-flight-deals/) (spec, plan, research, data-model,
pogodba, quickstart). Zapisano po vzorcu [`acceptance-008.md`](acceptance-008.md).

## Kaj je bilo dodano

| Plast | Datoteke |
|---|---|
| Domenska plast (čista, brez baze in omrežja) | `modules/flight-deals/domain/{types,airports,rule-input,rule-validation,date-window,rule-matcher,identity,price-change,booking-url,query-plan,schedule-slots,email-template}.ts` |
| Modeli (8 zbirk) | `modules/flight-deals/models/flight-{search-rule,offer,search-match,offer-history,search-run,notification,scheduler-settings,provider-status}.model.ts` |
| Viri (adapterji) | `modules/flight-deals/providers/{types,index,travelpayouts,ryanair,unsupported,fake}.*.ts` |
| Storitve | `modules/flight-deals/services/{rule-access,rule-response,offer-query,concurrency,provider-runner,reconcile,run-executor,notification-builder,notification-sender,scheduler-settings,tick}.ts` |
| Usmerjevalnika | `modules/flight-deals/router.ts` (uporabniške in referenčne poti), `admin.router.ts` pod `requireFlightAdmin()` |
| Skupna zmogljivost | `platform/email/mailer.service.ts` (nodemailer), `platform/users/directory.service.ts` + `readUserEmails` |
| Sredstvo | `modules/flight-deals/assets/airports.json` (OurAirports + geo-tz, 3 244 letališč; `scripts/build-airports.mjs`) |
| Odjemalec | `features/flight-deals/` — model, api, nadzorna plošča, Moja iskanja, urejevalnik, izbirnik letališč, prejemniki, kartica ponudbe, podrobnosti z grafom, Deljene ponudbe, Administracija |

Zunaj modula se je spremenilo, kar [`adding-a-tab.md`](adding-a-tab.md) predvideva, in troje,
utemeljeno v [`plan.md`](../specs/015-flight-deals/plan.md) → Complexity Tracking:
`platform/tabs/registry.ts` (en vnos), `main.ts` (dva `use` in zagon tika), `role-mapping.ts`
(trije prepisani nizi), `app.routes.ts` (šest poti), `register-icons.ts` (pet ikon),
`help-topics.ts` (sedem pojasnil), `env.ts` + `.env.example` (19 `FLIGHT_*` + `SMTP_SECURE`),
`generate.ts` in `ci.yml` (nova pogodba), `package.json` (`nodemailer`, `croner`; dev `geo-tz`),
nova mapa `platform/email/`, ena funkcija v `platform/users/`.

## Kakovostna vrata

```bash
npm run generate:contracts
npx --yes @redocly/cli lint specs/015-flight-deals/contracts/openapi.yaml
npm run typecheck
npm run lint
npm test
npm run build:web
```

| Vrata | Izid |
|---|---|
| 1. `typecheck` in `lint` | Oba čista za vso kodo 015 (API tsc 15 min, brez napak v novih datotekah; web tsc in `ng build --configuration production` čista). `eslint .` brez najdb. Brez `any` v `domain/`. |
| 2. Enotski testi domenske logike | **Strežnik: 211 datotek, 2 135 testov; web: 32 datotek, 531 testov.** Od tega za 015: 11 enotskih datotek (120 testov), 7 pogodbenih (53), 7 integracijskih (41) na strežniku ter 2 na odjemalcu (24). Glej nadomestne primere spodaj. |
| 3. OpenAPI pogodba | `@redocly/cli lint`: 0 napak, 6 opozoril iste vrste kot pri 014 (`info-license`, GET brez 4XX). Generirana `packages/contracts/src/generated/flight-deals.d.ts`. Pogodba dodana v CI. |
| 4. `docker compose up` iz čiste kopije | Brez sprememb `infra/`. Vse nove spremenljivke imajo privzetek; brez žetona vira zagon konča `succeeded` z napako `no-providers` (test). Nabor letališč je commitan JSON — gradnja ne gre na omrežje. `FLIGHT_FAKE_PROVIDER_ENABLED=true` v produkciji `loadEnv` zavrne (test). |
| 5. Noben nov niz, ki je videti kot skrivnost | `.env.example` ima prazne vrednosti; test `cache-dedupe` preverja, da žeton ni v `ExternalCache.sourceUrl` niti v URL-jih klicev. |

## Nadomestni primeri za kakovostno vrato 2

| imenovan primer | pokrit s |
|---|---|
| prehod na poletni/zimski čas | `rule-matcher.spec.ts`: LJU → STN pet 23. 10. → ned 25. 10. 2026 (49 ur) ostane 2 nočitvi; `schedule-slots.spec.ts`: `0 6 * * *` 25. 10. je 05:00Z, 24. 10. 04:00Z; `slotKey` nosi `+02:00` oz. `+01:00` |
| praznik na delovni dan (nadomestek) | ISO dnevi: nedelja 00:10 po Londonu je nedelja; sobota 00:10 lokalno ni petek |
| dopust čez mejo meseca (nadomestek) | rolling 6 mesecev od 31. 8. konča 28. 2. 2027; obdobje 22. 10.–1. 11. da poizvedbi za oktober in november; okno čez novo leto |
| neuspel klic, ki se uspešno ponovi | `provider-runs.spec.ts`: 503 → 200 da `ok` in eno primerjavo; `notification-outbox.spec.ts`: pošta pade → `pending` +60 s → poslano natanko enkrat; 429 se ne ponovi |

## Merila uspeha

| SC | kako je dokazano |
|---|---|
| SC-002 (lokalni čas, DST) | `rule-matcher.spec.ts`, `price-history.spec.ts` (let ob 14:30 ni med ujemanji) |
| SC-003, SC-004 (dopisi) | `notification-outbox.spec.ts`: 1 → 0 → 1 dopis; enkrat tudi ob napaki pošte in obtičalem `sending` |
| SC-005 (pravice) | `access.spec.ts`, `isolation.spec.ts`, `admin.spec.ts`, `api-key-and-offers.spec.ts` |
| SC-006 (urnik brez restarta) | `run-lifecycle.spec.ts`: `*/2 * * * *` velja ob naslednjem tiku |
| SC-007 (ena poizvedba na kombinacijo) | `provider-runs.spec.ts`, `query-plan.spec.ts` |
| SC-008 (izpad vira) | `provider-runs.spec.ts`: 503 pusti ponudbe, zagon `failed`, nič dopisov |
| SC-010 (TTL) | `indexes.spec.ts` |
| SC-011 (odstranitev modula) | `tab-removal.spec.ts` |
| SC-012 (24 scenarijev iz naročila) | preslikava v `quickstart.md` §10; vsi imajo test |

## Kaj je bilo najdeno med izvedbo

- **Travelpayouts cena je na osebo**, vir sestave potnikov ne pozna. Cena se pomnoži s številom
  potnikov in to pri ponudbi piše (`priceIncludes`); otroci so šteti kot odrasli.
- **`departure_at` je lokalni čas z odmikom**, ne UTC, kot pravi splošna opomba vira. Razčlenitev
  z odmikom; test to varuje (15:10 +02:00 = 13:10Z).
- **Ryanairov `departureDate` je lokalni čas BREZ odmika** — trenutek se sestavi s cono letališča
  iz nabora. Zato nabor nosi `tz`, in zato `geo-tz` daje `Europe/Belgrade` za Ljubljano (tzdb
  povezava): skripta gradnje ima tabelo vzdevkov po državi, da je LJU `Europe/Ljubljana`.
- **Vir nima slovenskih imen**: "trst" ni našel Trsta. Nabor zato nosi `aliases` (OurAirports
  `keywords` + ročna tabela slovenskih eksonimov v `build-airports.mjs`).
- **`errors` je rezervirano ime poti v Mongoose** (opozorilo ob zagonu) — polje zagona je
  `runErrors`, v pogodbi ostaja `errors`.
- **Logični čas zagona proti uri**: outbox dobi poznejšega od `now` in `finishedAt`, sicer bi
  dopisi, sestavljeni z `nextAttemptAt: now` v prihodnosti (dohitevanje, testi), čakali na uro.
- Scenarij "vikend 3–5 nočitev, pet → ned" iz prvega osnutka quickstarta nima nobene kombinacije
  (pet → ned je 2 nočitvi); popravljeno na 2–3 v quickstartu in specifikaciji.

## Najdeno mimogrede (ne pripada 015)

- `tests/contract/saved-links/favicon.spec.ts` je v celotnem zagonu enkrat padel na 30 s
  časovni omejitvi (prvi test datoteke), samostojno pa prestane v 0,9 s — občutljiv na
  obremenitev stroja, ne na 015.
- `tests/unit/theme-tokens.spec.ts` (web) bere `process.cwd()/src` in pade, kadar se vitest požene
  iz korena monorepa namesto iz `apps/web`.
- `apps/api/tests/contract/timesheet/workbook.spec.ts` ima pri polnem `tsc` eno obstoječo napako
  tipov (`Buffer<ArrayBufferLike>`), ki je bila tam že pred 015.
- Celoten `npm run typecheck` za API traja ~15 min in ~3 GB; CI to že pozna (`build:image` uporablja
  `--noCheck`).

## Kaj ostaja neizmerjeno

- **Pokritost Travelpayouts za LJU/TRS/GRZ/KLU** (quickstart §2): skripta
  `apps/api/scripts/spike-travelpayouts.mjs` je napisana, meritev pa zahteva lastnikov žeton, ki ga
  v tej seji ni. Isto velja za vprašanje, ali `&marker=` na povezavi deluje.
- **Ročni prehod quickstarta §3–§9 v brskalniku** in pregled na telefonu (575.98 px): postavitve
  uporabljajo odzivno mrežo in `--cd-*` tokene, `ng build` in `theme-tokens.spec.ts` sta čista, a
  zaslonov v tej seji ni nihče pogledal.
- **Pravi SMTP in pravi vir**: oba sta v testih mockana; prvi zagon na produkciji naj gre skozi
  Administracija → Preveri zdaj ob odprtem razdelku Obvestila.

## Dopolnitev 19. 10. 2026 — pregled `ryanair-mcp` in `flight-deals-tracker`

Lastnik je prosil za oceno dveh odprtokodnih projektov. Nobeden ni uporaben kot odvisnost (Go MCP
strežnik z neuvozljivo kodo; Python CLI brez licence). Iz njiju je bilo v Ryanairov adapter prenesenih
sedem podrobnosti (research.md §5, "Dopolnitev") in ob tem odkrita ter popravljena napaka v
sestavljanju URL-ja (`/api` predpona je izpadla). Novo: `FLIGHT_RYANAIR_FALLBACK_URL`,
`providerPreviousPrice` na ponudbi (pogodba, model, kartica), test
`tests/integration/flight-deals/ryanair-fallback.spec.ts` in štirje enotski testi v
`normalization.spec.ts`. Ponovno preverjeno: enotski in integracijski testi modula, lint, pogodba, tsc.

## Dopolnitev 19. 10. 2026 — povratek v naslednjem mesecu (napaka s produkcije)

Prvi produkcijski zagon iskanja "samo vikendi, 5 mesecev vnaprej, 1–3 nočitve" je našel samo
vikend 23.–25. 10. Vzrok: Travelpayouts vrne samo povratke v mesecu `return_at`, modul pa je vsem
mesečnim poizvedbam dal mesec ZAČETKA povratnega okna (oktober), zato so poizvedbe za november do
marec vračale prazno. Popravek: `monthPairs` v `domain/date-window.ts` za vsak mesec odhoda
sestavi par z vsakim mesecem, ki ga pokriva [prvi odhod + min nočitev, zadnji odhod + max nočitev]
∩ povratno okno — vikend 30. 10. → 1. 11. je zdaj par (2026-10, 2026-11). Predogled šteje enako.
Ker se število poizvedb pri kratkih potovanjih podvoji, je privzetek `FLIGHT_MAX_QUERIES_PER_RULE`
dvignjen s 60 na 120 (`env.ts`, `.env.example`, `docs/env-reference.md`, research.md §4).
Novi testi: `date-window.spec.ts` (trije za `monthPairs`), `normalization.spec.ts` (pari v URL-ju
za 5 mesecev), `query-plan.spec.ts` (70 poizvedb, unikatni ključi); pogodbeni testi predogleda
pričakujejo 6 namesto 4. Modul: 24 datotek, 207 testov; lint in tsc modula čista.

## Dopolnitev 19. 10. 2026 — glavna stran kot tabela ponudb

Lastniku razdelki s karticami (Nove ponudbe / Spremembe cen / Najugodnejše) niso ustrezali za hiter
pregled. Glavna stran zdaj kaže ENO tabelo vseh ponudb (strežnik vrne do 200, z nedosegljivimi vred)
z iskalnikom (letališče, mesto, država, prevoznik, ime iskanja — brez šumnikov), čipi vrste (Vse /
Novo / Pocenitve / Podražitve s števci, Samo direktni), čipi iskanj in razvrščanjem po stolpcih
(relacija, odhod, povratek, cena, na osebo, iskanje, čas podatka). Klik na vrstico odpre
podrobnosti pod njo (oba leta, cena, vir, iskanja, gumba Zgodovina cene in Rezervacija pri viru).
Pretečene ponudbe (vir jih ne ponuja več ali je odhod mimo) so privzeto skrite; potrditveno polje
"Pokaži tudi pretečene" jih pokaže zasenčene — strežnik jih hrani teden po odhodu (data-model.md),
dlje nazaj pogled ne seže. Na telefonu ostanejo stolpci stanje, relacija, odhod (s povratkom) in
cena (z zneskom na osebo). Čiste funkcije so v `flight-deals.model.ts` (razdelek "tabela ponudb"),
pokrite s `tests/unit/flight-deals-offer-table.spec.ts`; kartica ponudbe (podrobnosti, deljene)
uporablja isto `offerStatus` in zato zdaj pozna tudi značko "Pretečeno". Preverjeno: vitest, tsc,
eslint, `ng build --configuration production`; zaslon v brskalniku v tej seji ni bil pogledan.
