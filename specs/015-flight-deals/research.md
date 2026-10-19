# Research: Iskalnik letalskih ponudb (015)

Odločitve, ki jih koda uveljavlja, in razlogi zanje. Vsaka točka je navedena na mestu, kjer jo
koda izvaja — kdor bo kodo spreminjal, mora najprej pobiti razlog tukaj. Vse zunanje trditve so
bile preverjene 17. 10. 2026; viri so na koncu vsakega razdelka.

## §1 — Lasten tik, ne scheduler modula 002 in ne živ cron časovnik

Modul potrebuje izvajanje po urniku, ki ga administrator nastavi v aplikaciji. Tri možnosti:

| možnost | zakaj ne / zakaj da |
|---|---|
| `registerTickStep` v `modules/time-tracking/scheduler.ts` | **Ne.** Scheduler je last modula 002; uvoz iz modula v modul je lint napaka (člen I). Teče tudi samo, kadar je `SCHEDULER_ENABLED`, kar je nastavitev beleženja časa, ne letov. Precedens: `file-sharing/services/cleanup.service.ts` si je iz istega razloga naredil svoj časovnik. |
| živ cron časovnik (`new Cron(expr, fn)`), ki ga ob spremembi nastavitev ustavimo in ustvarimo znova | **Ne.** Časovnik v pomnilniku je točno tisto, kar člen V.1 prepoveduje ("načrtovana akcija je zapis, ne časovnik"). Ob dveh izvodih bi oba sprožila ob isti sekundi; ob restartu tik pred terminom bi termin izpadel (V.2); sprememba nastavitev bi zahtevala signal med izvodi. |
| **tik na 60 s, ki vpraša bazo** | **Da.** Vsak tik prebere `FlightSchedulerSettings`, iz izraza izračuna zadnji zapadli termin (§12) in poskusi ustvariti `FlightSearchRun` z unikatnim `slotKey`. Sprememba urnika velja ob naslednjem tiku brez signala (FR-048). Zamujen termin se dohiti ob prvem tiku po zagonu (V.2). Dvojnik med izvodi pade na unikatnem indeksu (V.3). |

Tik je `setInterval(..).unref()` kot pri `cleanup.service.ts`, zažene se takoj ob zagonu in se v
testih ne zažene (`NODE_ENV === 'test'`); testi kličejo `runFlightTick(now)` neposredno s
podanim časom — zato ima funkcija parameter `now` in ne bere ure sama (člen IX).

Tik opravi, v tem vrstnem redu: (1) prekinjene zagone (`running` z `heartbeatAt` starejšim od
`FLIGHT_RUN_STALE_MINUTES`) označi `interrupted`; (2) ugotovi zapadli termin in ustvari zagon;
(3) prevzame en `queued` zagon in ga izvede; (4) obdela outbox dopisov (§9). Korak 3 je tudi
tisto, kar pokliče `POST /admin/runs` takoj po vstavljanju, da admin ne čaka minute.

## §2 — `slotKey` in dohitevanje

Termin se zapiše kot `schedule:<ISO termina v coni urnika>`, npr. `schedule:2026-10-17T06:00+02:00`.
Dva izvoda, ki ob istem tiku izračunata isti termin, poskusita vstaviti isti ključ; drugi dobi
`E11000` in ga obravnava kot "že prevzet" (isti vzorec kot `PlannedAction` upsert v 002 in
`UsageCounter` v 014).

**Dohitevanje je omejeno na EN termin.** Če je bila aplikacija izklopljena dva dni in je medtem
izpadlo štiri termine, se ob zagonu izvede samo ZADNJI zapadli. Razlog: zbirni dopis po enem
zagonu že vsebuje vse spremembe od zadnjega uspešnega preverjanja — štirje zaporedni zagoni bi
vire vprašali štirikrat za isti podatek in poslali štiri dopise z isto vsebino. To je razlika
od 002, kjer ima vsak zamujen termin svojo akcijo, ki jo je treba izvesti. Pravilo je zapisano
v `domain/schedule-slots.ts` (`latestDueSlot(expr, tz, now, lastSlotAt)`) in testirano.

`lastScheduledSlotAt` v nastavitvah pove, do kam so termini že pokriti; posodobi se ob uspešnem
vstavljanju zagona (ne ob koncu), da restart sredi zagona ne ustvari drugega zagona za isti
termin — ta zagon konča kot `interrupted` in njegov termin je pokrit, naslednji pa pride po
urniku.

## §3 — Viri podatkov: kaj je sploh dosegljivo (stanje 17. 10. 2026)

| vir | status | odločitev |
|---|---|---|
| Amadeus Self-Service | ukinjen 17. 7. 2026 (PhocusWire 9. 2. 2026) | odpade |
| Kiwi Tequila | od 30. 5. 2024 samo na povabilo | odpade |
| Skyscanner Travel API | samo partnerji z "veliko publiko" | odpade |
| Duffel | samopostrežen, easyJet DA, Ryanair/Wizz NE; 0,005 $ na iskanje brez koledarskega endpointa | **odloženo** (odločitev lastnika) |
| SerpApi Google Flights | 250 brezplačnih na mesec; scraping Googla | ne za ogrodje preverjanja; morda ročni "truth check" pozneje |
| **Travelpayouts / Aviasales Data API v3** | brezplačen žeton ob registraciji partnerja; dovoljen; vključuje nizkocenovnike; `prices_for_dates` z izpuščenim ciljem = "kamor koli"; podatki so **predpomnjeni iz tujih iskanj**, do 48 h stari | **primarni vir MVP** |
| Ryanair neuradni `farfnd/v4` | deluje brez prijave; `robots.txt` prepoveduje `/api`; pogoji dovoljujejo "zasebno, nekomercialno" rabo | **opt-in, privzeto izklopljen** (odločitev lastnika; precedens Neverin v 011) |
| Wizz Air neuradni | Kasada bot zaščita + AWS WAF | **`unsupported`** (člen XII) |
| easyJet neposredno | Akamai Bot Manager | **`unsupported`**; legalna pot je Duffel |

Posledica za specifikacijo, ki jo mora vmesnik pokazati: ponudba iz Travelpayouts je **cena, ki
jo je nekdo videl**, ne cena, ki jo zagotavlja prevoznik. Zato ima vsaka ponudba `dataAt`
(čas podatka pri viru) poleg `lastCheckedAt` in vir nosi `notice` "podatki so lahko do 48 ur
stari" (FR-019). Pokritost malih letališč ni znana → **spike pred fazo virov** (§4).

Viri: ryanair.com/ie/en/lp/legal/terms-of-use, ryanair.com/robots.txt, phocuswire.com (Amadeus),
media.kiwi.com (partnerstva), partners.skyscanner.net, duffel.com/airlines in /pricing,
support.travelpayouts.com/hc/en-us/articles/203956163, apify.com (Wizz: Kasada),
github.com/MikkoParkkola/trvl/issues/115 (Wizz WAF).

## §4 — Travelpayouts: preslikava na pojme modula

Primarni endpoint je `GET https://api.travelpayouts.com/aviasales/v3/prices_for_dates`
(zendesk članek 203956163, posodobljen 6. 9. 2026). Avtentikacija: glava `X-Access-Token`
(žeton gre v glavo, ne v URL, da ne pristane v dnevniku). Omejitev 600 zahtev na minuto, `429`
ob preseganju, glave `X-Rate-Limit-Remaining` in `X-Rate-Limit-Reset`.

| parameter | kako ga modul nastavi |
|---|---|
| `origin` | odhodno letališče iskanja (ena poizvedba na letališče) |
| `destination` | IATA letališča ali **izpuščen** pri načinu `any`; pri načinu `countries` je izpuščen in filtrira se lokalno po državi (vir filtra po državi nima) |
| `departure_at` | `YYYY-MM` — ena poizvedba na mesec okna odhodov |
| `return_at` | `YYYY-MM` meseca povratka ali izpuščen pri enosmernem. Vir vrne SAMO povratke v tem mesecu, zato `monthPairs` (date-window.ts) za vsak mesec odhoda naredi par z vsakim mesecem, ki ga pokriva [prvi odhod + min nočitev, zadnji odhod + max nočitev] ∩ povratno okno — pri 1–3 nočitvah sta to mesec odhoda in naslednji (vikend 30. 10. → 1. 11.). Napaka, najdena 19. 10. 2026 na produkciji: vsi pari so nosili mesec začetka povratnega okna, od novembra naprej je vir vračal prazno in iskanje je našlo samo prvi vikend. |
| `one_way` | `false` pri povratnem (sicer vrne eno vozovnico na datum) |
| `direct` | `true`, kadar `maxStops === 0` |
| `currency` | `price.currency` iskanja, male črke (`eur`) |
| `limit` | `1000` (največ), `page` 1 — če `data.length === 1000`, se izid označi `incomplete` |
| `sorting` | `price` |
| `market` | izpuščen; privzeto ga vir določi iz `origin` |

Odgovor: `{ success, data: [{ origin, destination, origin_airport, destination_airport, price,
airline, flight_number, departure_at, return_at, transfers, return_transfers, duration,
duration_to, duration_back, link, currency? }], error }`. `departure_at` je ISO z lokalnim
odmikom (`2023-07-28T07:00:00+02:00`) — razčleni se **z odmikom**, ne kot UTC; iz njega in
cone letališča iz nabora se preveri ura po lokalnem času (FR-011). Cena je skupna za ENEGA
odraslega: vir sestave potnikov ne pozna, zato se pri iskanju z več potniki cena pomnoži s
številom potnikov in pri ponudbi piše `priceIncludes: "cena na osebo pri viru, pomnožena s
številom potnikov; otroci šteti kot odrasli"` (FR-013, Assumptions). `flight_number` je ena
številka (prvi segment) — `flightNumbers` dobi eno vrednost ali nič. `transfers` → `stops`.

Povezava do rezervacije: `https://www.aviasales.com` + `link`. Partnerska oznaka `marker` v
odgovoru NI; dokumentirana pot je obrazec za globoke povezave (članek 360027634052), priložen
`&marker=` pa je praksa odprtokodnih odjemalcev in **ni potrjena** — spike jo preveri; če ne
deluje, ostane povezava brez oznake (lastniku modul ne obljublja provizije).

`grouped_prices` (`group_by=month`) je cenejši za pregled "kateri mesec je najcenejši", a vrne
ENO ponudbo na skupino in zato ne zadošča za pravila z dnevi v tednu; uporabi se samo, če spike
pokaže, da `prices_for_dates` s 1000 vrsticami ne pokrije meseca.

**Spike (prva naloga faze virov):** skripta `apps/api/scripts/spike-travelpayouts.mjs` za
sedem letališč iz naročila in naslednje štiri mesece prešteje vrnjene ponudbe na par
(letališče, mesec), delež z `transfers = 0`, najstarejši `departure_at` glede na `now` ter
preveri `marker`. Rezultat gre v `quickstart.md` §Spike in odloči, ali lastnik vklopi Ryanair.

Viri: support.travelpayouts.com/hc/en-us/articles/203956163 (prek `/api/v2/help_center/.../articles/203956163.json`),
4402565416594 (omejitve), travelpayouts.github.io/slate (statične datoteke).

## §5 — Ryanair: neuradni fare finder, kadar je vklopljen

Osnova `https://www.ryanair.com/api/farfnd/v4`. Dva klica, ki ju modul uporablja (oba brez
piškotkov in brez `client-version`; potrjeno z golim `curl`):

- `GET roundTripFares?departureAirportIataCode=LJU&outboundDepartureDateFrom=2026-10-20&outboundDepartureDateTo=2026-11-03&inboundDepartureDateFrom=…&inboundDepartureDateTo=…&durationFrom=3&durationTo=5&currency=EUR&adultPaxCount=2&limit=…[&arrivalAirportIataCode=…|&arrivalCountryCode=…][&priceValueTo=…]`
  → `{ fares: [{ outbound: { departureAirport{iataCode}, arrivalAirport{iataCode}, departureDate "2026-11-19T08:00:00" (lokalno, brez odmika), arrivalDate, price{value,currencyCode}, flightNumber "FR704", flightKey, previousPrice }, inbound: {…}, summary: { price, previousPrice, newRoute, tripDurationDays } }], nextPage, size }`
- `GET oneWayFares?…` z enakimi `outbound*` parametri za enosmerna iskanja.

Vir torej "kamor koli" (brez `arrivalAirportIataCode`) in "država" (`arrivalCountryCode`)
podpira neposredno in vrne **celotne kombinacije z datumi** — ena poizvedba na (letališče,
okno), ne na mesec. `departureDate` je lokalni čas BREZ odmika → trenutek se sestavi s cono
letališča iz nabora (`DateTime.fromISO(s, { zone: tz })`). Cena je za `adultPaxCount` odraslih
skupaj; otroci se ne pošljejo (vir ima `CHD` samo pri rezervacijskem endpointu, ki ga ne
uporabljamo) → `priceIncludes` to pove.

Varovala, ki jih nalaga FR-020 in člen XII:

- `FLIGHT_RYANAIR_ENABLED=false` privzeto; vklop je dejanje lastnika namestitve v okolju.
- Največ **dva zagona na dan**, v katerih je vir vprašan (`FlightProviderStatus.requestsToday`);
  tretji zagon istega dne vrne za ta vir izid `rateLimited` z razlago, ne klica.
- 500 ms premora med zaporednimi klici in največ **ena** hkratna zahteva na ta vir — enako kot
  `@2bad/ryanair` (`DELAY_MS = 500`).
- Glava `User-Agent` navaja aplikacijo in naslov (`CleverDash/… (+https://<PUBLIC_BASE_URL>)`),
  brez posnemanja brskalnika; brez piškotkov. Če vir začne vračati `403`/`429`/izziv, se izid
  označi `unreachable`/`rateLimited` in **ničesar ne poskušamo obiti** — to je točka iz člena XII,
  ki jo modul izpolni s tem, da nima nobene kode za to.
- V vmesniku je vir označen `official: false` z opozorilom; ponudba iz njega nosi isto oznako.

Povezava do rezervacije se sestavi po vzorcu, ki ga uporablja isti paket:
`https://www.ryanair.com/gb/en/trip/flights/select?adults=A&teens=0&children=C&infants=0&dateOut=YYYY-MM-DD&dateIn=YYYY-MM-DD&isConnectedFlight=false&discount=0&isReturn=true&promoCode=&originIata=LJU&destinationIata=STN`.

**Dopolnitev 19. 10. 2026** po pregledu `adambenhassen/ryanair-mcp` (Go, MIT; vsa koda pod `internal/`,
neuvozljiv; dnevni test v živo proti pravemu API-ju) in `gabros20/flight-deals-tracker` (Python CLI, brez
datoteke LICENSE — ideje da, koda ne). Nobenega ni mogoče uporabiti kot odvisnost; preneseno v adapter:

- `arrivalCountryCode` z malimi črkami (z velikimi vir tiho vrne nič);
- `outboundDepartureTimeFrom/To` in `inboundDepartureTimeFrom/To` (`00:00`/`23:59`) — vir ju zahteva;
- `priceValueTo` iz `rule.price.maxPerPerson` (cena na osebo pri viru); ključ poizvedbe jo nosi, zato se
  poizvedbe uporabnikov z različnimi mejami ne zlijejo — pri ≤ 2 zagonih dnevno sprejemljivo;
- brez `limit` (vir parametrov strani ne upošteva); `oneWayFares` z `nextPage != null` je `incomplete`,
  `roundTripFares` ima `nextPage` VEDNO 1 in se ignorira;
- `previousPrice` z noge se prenese kot `providerPreviousPrice` (podatek vira, prikazan ločeno) in NE vpliva
  na našo primerjavo — NOVO ostane brez prejšnje cene (FR-030);
- namizni `User-Agent` + `Accept-Language` namesto lastnega niza (vir "očitne ne-brskalniške odjemalce"
  zavrne s 403); brez piškotkov, brez `client-version`, 403 se ne ponavlja;
- rezervni gostitelj `services-api.ryanair.com` (`FLIGHT_RYANAIR_FALLBACK_URL`) za isto pot ob 403/5xx —
  en poskus, nato `unreachable`.
- Ob tem je bila najdena in popravljena NAPAKA: `new URL('/farfnd/…', 'https://www.ryanair.com/api/')` je
  zavrgel `/api`; test zdaj preverja cel URL.

Viri: tarball `@2bad/ryanair@8.1.0` (`build/endpoints.js`, `build/fares/types.d.ts`),
github.com/cohaolain/ryanair-py (`ryanair/ryanair.py`), žive probe 17. 10. 2026;
github.com/adambenhassen/ryanair-mcp (`internal/ryanair/{fares,quirks,network}.go`),
github.com/gabros20/flight-deals-tracker (`providers/ryanair.py`, `http.py`, `docs/RESEARCH.md`).

## §6 — Wizz Air in easyJet: adapterja, ki vrneta `unsupported`

Oba adapterja obstajata (`providers/wizzair.provider.ts`, `providers/easyjet.provider.ts`),
da `GET /flight-deals/providers` pove, da vira NISTA podprta in zakaj, namesto da bi ju v
seznamu ne bilo. Vračata `{ outcome: 'unsupported', message: 'Vir avtomatiziran dostop
preprečuje; glej člen XII.' }` brez omrežnega klica. Ko bo kdaj na voljo dovoljena pot (Duffel za
easyJet), se zamenja vsebina ene datoteke.

## §7 — Identiteta ponudbe in zaznavanje sprememb

`identityKey = sha256(kanonični niz)` iz `data-model.md`. Tri odločitve, ki jih je treba poznati:

1. **`providerId` je del identitete.** Ista vozovnica iz Travelpayouts in iz Ryanaira sta dve
   ponudbi: dve ceni (ena predpomnjena, ena živa), dve povezavi. Združevanje čez vire bi
   zahtevalo pravilo, katera cena je "prava", ki ga nihče ni naročil.
2. **Čas pristanka NI del identitete**, ker ga Travelpayouts sploh ne vrne (samo `duration`), Ryanair
   pa ga vrne; ista vozovnica bi dobila dve identiteti glede na vir podatka o pristanku.
3. **UNAVAILABLE samo iz uspešnega odgovora.** Ponudba se označi `unavailable` natanko tedaj,
   ko poizvedba, ki jo je ZADNJIČ vrnila (ista `queryKey`), v tem zagonu vrne `ok` in je med
   rezultati ni. Vsak drug izid (`unreachable`, `rateLimited`, `incomplete`, `disabled`) ponudbo
   pusti pri miru in posodobi samo `lastCheck` iskanja (FR-018, FR-028). Zato ponudba hrani
   `lastQueryKey`.

Sprememba cene se primerja na **enak znesek v isti valuti**; zaokroževanja ni, ker viri
vračajo cele vrednosti ali dve decimalki. Odstotek je `(nova − stara) / stara`, zaokrožen na eno
decimalko šele ob prikazu (`domain/price-change.ts`, čista funkcija, testirana s primeri iz
specifikacije: 120 → 89 = −25,8 %, 89 → 110 = +23,6 %).

## §8 — Ena poizvedba na kombinacijo, prek `platform/cache`

Vse poizvedbe vseh aktivnih iskanj se najprej zložijo v množico `queryKey`-jev
(`provider | origin | destination|'*' | fromMonth | toMonth | oneWay | direct | currency |
adults`) in šele nato izvedejo — FR-024, SC-007. Izvedba gre prek `getOrRefresh` iz
`platform/cache/service.ts` s ključem `flight:<provider>:<sha256(queryKey).slice(0,16)>` in
`ttlSeconds = FLIGHT_PROVIDER_CACHE_SECONDS` (3600). Posledice:

- dva zagona v isti uri (urnik + ročni) vir vprašata enkrat;
- `freshness.kind === 'stale'` pomeni, da je prenos spodletel in je vrnjena zadnja znana
  vsebina → izid poizvedbe je `unreachable`, ponudbe iz nje se ne primerjajo (sicer bi
  "nespremenjeno" sledilo iz starega podatka);
- `CacheMissError` → `unreachable` brez podatka.

Fetcher v adapterju ne pošilja pogojnih glav (viri `ETag` ne podpirajo), vrne vedno `200`.

Omejena vzporednost: preprost semafor v `services/concurrency.ts` (`FLIGHT_PROVIDER_CONCURRENCY`,
privzeto 2, Ryanair vedno 1) — brez nove odvisnosti. Timeout `FLIGHT_PROVIDER_TIMEOUT_MS`
(15 000) prek `AbortSignal.timeout`. Ponovitev ob `5xx`/omrežni napaki: dvakrat, z zamikom 2 s in
8 s; `429` se NE ponavlja v istem zagonu (izid `rateLimited`).

Meja poizvedb na iskanje `FLIGHT_MAX_QUERIES_PER_RULE` (120): 5 letališč × "kamor koli" × 6
mesecev (7 koledarskih, vsak s parom za mesec odhoda in naslednjega) je 70 poizvedb pri
Travelpayouts; ob preseganju se vzamejo prvi meseci in iskanje dobi opozorilo `truncated` (FR-015,
edge case "zelo veliko kombinacij"). Privzetek je bil 60, dvignjen 19. 10. 2026, ko so pari mesecev
število poizvedb približno podvojili (9 letališč × 6 mesecev = 99); vir dovoli 600 zahtev na minuto.

## §9 — E-pošta: skupna storitev, outbox, en dopis na prejemnika

**Kje:** `platform/email/mailer.service.ts`. Razlog za `platform/` in ne modul: pošiljanje
pošte ni pojem letov (isti test kot pri `platform/users/` v 010 in `platform/usage/` v 014) in
vsaj dve prihodnji funkcionalnosti sta jo že omenjali (`docs/env-reference.md` §3 ima odprto
vprašanje o e-pošti). Modul pozna samo `sendEmail(...)` in `isEmailConfigured()`.

**Knjižnica:** `nodemailer` 10.1.2 (MIT-0, Node ≥ 20, tipi vgrajeni — `@types/nodemailer` se ne
namesti). `createTransport({ host, port, secure, auth })`; pri `SMTP_PORT=587` in
`SMTP_SECURE=false` je STARTTLS samodejen. Nova spremenljivka `SMTP_SECURE` (privzeto `false`),
vse ostale SMTP spremenljivke že obstajajo in se **ponovno uporabijo**; `NOTIFY_EMAIL_TO` se tu
ne uporablja (naslovi so osebni).

**Prejemnikov naslov:** nova funkcija `readUserEmails(userIds)` v
`platform/users/directory.service.ts` vrne `Map<id, { email, displayName }>`. Je edina pot do
celega naslova in je **namenoma ni v nobenem usmerjevalniku**; komentar ob njej to pove.

**Outbox namesto neposrednega pošiljanja:** zagon ustvari `FlightNotification` (`pending`) in
NE pošlje sam. Pošilja tik (§1, korak 4) z atomarnim prevzemom `pending → sending`, backoff
`[60, 300, 900, 3600]` s in `MAX_ATTEMPTS = 5` — isti vzorec kot `platform/webhooks/dispatcher`.
Unikatni indeks `(recipientUserId, runId)` naredi ponovitev zagona ali dvojni klic sestavljanja
neškodljiv (FR-034, FR-037, SC-004).

**Pred pošiljanjem** se vsaka postavka znova preveri: iskanje še obstaja, je aktivno, prejemnik je
še na seznamu, ponudba še ustreza pravilom (FR-036, FR-042). Postavke, ki ne prestanejo, izpadejo;
prazen dopis se označi `suppressed` z razlogom `no-items` in se ne pošlje.

**HTML:** ena predloga v `services/email-template.ts` kot čista funkcija `renderDigest(items,
ctx) → { subject, html, text }`, z inline slogi (poštni odjemalci `<style>` pogosto odrežejo):
stara cena `<s>`, nova cena `color:#1a7f4b` pri pocenitvi in `#c02626` pri podražitvi — isti
heksi kot `--ion-color-success`/`--ion-color-danger` v `variables.scss` (svetla tema), ker
CSS spremenljivke v e-pošti ne delujejo. Besedilo slovensko, tikanje. Testirano brez omrežja.

## §10 — Nabor letališč: OurAirports + `geo-tz` ob gradnji, ne Travelpayouts

Travelpayouts `data/en/airports.json` ima `time_zone` že vključen in bi bil preprostejši, a je
(a) dosegljiv samo z omrežjem, (b) vezan na vir, ki ga lastnik lahko izklopi, in (c) ne
licenciran za vgradnjo. OurAirports (`airports.csv`, `countries.csv`) je **javna domena**
(Unlicense), posodobljen dnevno, nima pa cone. `geo-tz` 8.x (MIT) jo da iz koordinat.

Odločitev: `apps/api/scripts/build-airports.mjs` prenese CSV, filtrira
`type ∈ {large_airport, medium_airport}` ∧ `scheduled_service = yes` ∧ `iata_code ≠ ''`
(~3 400 vrstic), doda `tz` z `geo-tz` in zapiše `modules/flight-deals/assets/airports.json`.
JSON je **commitan**; `geo-tz` je `devDependency` in se ne prevede v sliko (ima ~50 MB podatkov).
`copy-assets.mjs` že kopira `assets/` v `dist/`. Osvežitev je ročna ob izdaji.

Imena so angleška; slovensko ime države da `Intl.DisplayNames('sl', { type: 'region' })` v
Node (ICU je vključen v uradni Node 22 build) — brez datoteke prevodov.

`countries.csv` glava: `id, code, name, continent, wikipedia_link, keywords`;
`airports.csv` glava (19 stolpcev): `id, ident, type, name, latitude_deg, longitude_deg,
elevation_ft, continent, iso_country, iso_region, municipality, scheduled_service, icao_code,
iata_code, gps_code, local_code, home_link, wikipedia_link, keywords`.

## §11 — Datumska aritmetika

Vse v Luxonu (že odvisnost), cona letališča iz nabora, nikoli `toISOString().split('T')` (lint
pravilo). Čiste funkcije v `domain/date-window.ts` in `domain/rule-matcher.ts`:

- **Okno odhodov** = `[from − flexDays, to + flexDays]`, odrezano na `>= danes` po coni odhodnega
  letališča (edge case "v preteklost"). Pri `fixed` je `from = to = departDate`.
- **Okno povratkov**: pri `returnWithinWindow` isto okno; sicer `[from − flex + minNights,
  to + flex + maxNights]`.
- **Rolling**: `from = danes`, `to = (danes + months).endOf('month')` — zato 31. 8. + 6 mesecev
  ni 31. 2., ampak zadnji dan februarja (edge case).
- **Nočitve** = razlika koledarskih dni med lokalnim datumom odhoda in lokalnim datumom
  povratka v coni **ciljnega** letališča, ne ur / 24 — zato prehod na zimski čas 25. 10. 2026 ne
  spremeni števila nočitev (quality gate: DST test z oknom 22. 10.–1. 11. 2026).
- **Ura odhoda** se primerja kot `HH:mm` v coni odhodnega letališča; **ura povratka** v coni
  ciljnega; `minStayHours` kot razlika instantov.
- **Dnevi v tednu** ISO 1–7 (`DateTime.weekday`), isti dogovor kot `TrackingProfile.daysOfWeek`.
- **Ocena kombinacij** (FR-007): število parov (d, r) z `r − d ∈ [minNights, maxNights]`, d v oknu
  odhodov, r v oknu povratkov, oba na dovoljen dan — izračunano, ne ocenjeno; pri "kamor koli"
  se ne množi s številom destinacij, ker ga ne poznamo, in predogled to pove.

## §12 — `croner` samo za parsanje in naslednji termin

`croner` 10.0.1 (MIT, brez odvisnosti, tipi vgrajeni). Uporaba:

- validacija: `new CronPattern(expr)` vrže `TypeError`/`RangeError` s sporočilom, ki se
  prevede v slovenski `badRequest` (FR-047); `new Cron(expr, { timezone })` z neveljavno cono
  vrže `RangeError`;
- izračun: `new Cron(expr, { timezone, paused: true }).nextRun(after)` — `paused: true` zagotavlja,
  da **ne nastane noben časovnik**; objekt se zavrže po klicu;
- `latestDueSlot(expr, tz, now, since)`: koraka z `nextRun` od `since ?? now − 1 dan` naprej,
  dokler je `<= now`, in vrne zadnjega (§2).

Vzorec je omejen na **pet polj** (`mode: '5-part'`), da admin ne vnese sekund in da je izraz
berljiv na vmesniku. Prednastavitve (FR-046):

| id | izraz | oznaka |
|---|---|---|
| `daily-06` | `0 6 * * *` | Vsak dan ob 6:00 |
| `daily-06-18` | `0 6,18 * * *` | Vsak dan ob 6:00 in 18:00 |
| `every-6h` | `0 */6 * * *` | Vsakih 6 ur |
| `monday-08` | `0 8 * * 1` | Vsak ponedeljek ob 8:00 |
| `custom` | poljuben | Po meri |

Živ `new Cron(expr, fn)` se **nikjer ne kliče**; test `tests/unit/flight-deals/schedule-slots.spec.ts`
to preverja posredno — modul po tiku nima odprtih ročajev (`unref` edinega `setInterval`).

## §13 — Odjemalec: kaj se ponovno uporabi in kaj je novo

- **Graf cen:** `features/meteo/charts/meteo-chart.component.ts` je v drugem modulu in ga ni
  dovoljeno uvoziti; premik v `shared/` bi bil sprememba obstoječega modula. Zato majhen
  modularni ovoj `features/flight-deals/price-chart.component.ts` nad Chart.js (že odvisnost), z
  istim prijemom (`effect()` + `chart.update('none')`, paleta za obe temi iz `ThemeService`). Ena
  linija, točke po `history[]`, brez časovne osi (oznake so vnaprej oblikovani datumi).
- **Izbirnik letališč:** vzorec `settings/meteo-section.component.ts` — iskalnik, seznam
  zadetkov, izbrano kot čipi; dodan izbirnik "v radiju N km od …".
- **Izbirnik prejemnikov:** vzorec `recipes/recipe-share-dialog.component.ts` nad `UsersApi`.
- **Dnevi in ure:** gumbi-pilule in `ion-input type="time"` iz `profile-form.component.ts`.
- **Obrazec:** template-driven nad navadnim objektom, validacija v `save()` z enim sporočilom,
  `:searchId = 'new'` za ustvarjanje (vzorec receptov).
- **Admin vidnost:** `currentUser.user()?.scopes.includes('admin')` za prikaz povezave; pravi
  varuh je strežnik.
- **Ikone:** nove `airplane-outline`, `trending-down-outline`, `trending-up-outline`,
  `mail-outline`, `globe-outline` v `register-icons.ts` in `icons.spec.ts`.

## §14 — Administratorski varuh v modulu

`modules/analytics/admin-guard.ts` ima točno to, kar potrebujemo, a je v drugem modulu. Modul
dobi lastno kopijo `admin-guard.ts` z istim pogojem (`subjectType === 'user'` ∧ `scopes` vsebuje
`admin`) in komentarjem, zakaj je kopija: dvig v `platform/auth/` bi bil pravilen, a je sprememba
obstoječega modula 014 — predlagana kot ločen refaktor, ne del te funkcionalnosti.

## §15 — Spremenljivke okolja

Vse s privzetkom razen žetona; `docker compose up` iz čiste kopije deluje brez dopolnjevanja
(kakovostna vrata, točka 4). Brez žetona Travelpayouts vir vrača `disabled`, modul deluje,
zagon pove "ni vklopljenih virov".

| spremenljivka | privzeto | vloga |
|---|---|---|
| `FLIGHT_SCHEDULER_TICK_SECONDS` | `60` | tik §1 |
| `FLIGHT_RUN_STALE_MINUTES` | `30` | `running` brez utripa → `interrupted` |
| `FLIGHT_RUN_RETENTION_DAYS` | `90` | TTL zagonov in dopisov |
| `FLIGHT_HISTORY_RETENTION_DAYS` | `180` | TTL zgodovine cen |
| `FLIGHT_PROVIDER_TIMEOUT_MS` | `15000` | |
| `FLIGHT_PROVIDER_CONCURRENCY` | `2` | semafor §8 |
| `FLIGHT_PROVIDER_CACHE_SECONDS` | `3600` | TTL predpomnilnika poizvedb |
| `FLIGHT_MAX_RULES_PER_USER` | `20` | FR-015 |
| `FLIGHT_MAX_QUERIES_PER_RULE` | `120` | FR-015 |
| `FLIGHT_MAX_RECIPIENTS` | `10` | |
| `FLIGHT_MAX_FLEX_DAYS` | `60` | |
| `FLIGHT_TRAVELPAYOUTS_TOKEN` | *(prazno = vir izklopljen)* | skrivnost |
| `FLIGHT_TRAVELPAYOUTS_MARKER` | *(prazno)* | partnerska oznaka, neobvezno |
| `FLIGHT_TRAVELPAYOUTS_URL` | `https://api.travelpayouts.com` | |
| `FLIGHT_RYANAIR_ENABLED` | `false` | FR-020 |
| `FLIGHT_RYANAIR_URL` | `https://www.ryanair.com/api` | |
| `FLIGHT_RYANAIR_DAILY_RUN_LIMIT` | `2` | FR-020 |
| `FLIGHT_FAKE_PROVIDER_ENABLED` | `false` | FR-022; `loadEnv` ZAVRNE `true` pri `NODE_ENV=production` |
| `SMTP_SECURE` | `false` | §9; edina nova SMTP spremenljivka |

## §16 — Česa modul namenoma ne dela

- **Ne registrira `registerHealthExtension`**: platforma ima eno samo mesto, ki ga zaseda 002.
  Stanje schedulerja letov je v `GET /flight-deals/admin/runs` (`active`) in v zgodovini zagonov.
  Dvig na seznam ponudnikov zdravja je refaktor platforme, izven obsega.
- **Ne pošilja potisnih obvestil**: `notify()` ni per-user in kanal v tej namestitvi ne deluje
  (010).
- **Ne pretvarja valut** in ne združuje ponudb čez vire (§7).
- **Ne izvaja vseh zamujenih terminov** (§2).
- **Ne ponuja ploščice** na nadzorni plošči (Out of Scope); `KNOWN_TILE_TYPES` v
  `tile-layout.service.ts` se zato ne dotakne.

## §17 — Zavrnjene možnosti, na kratko

| možnost | zakaj ne |
|---|---|
| ločena zbirka `FlightChangeEvent` | kar potrebujeta nadzorna plošča in dopis, je v `FlightSearchMatch.lastChange*` in v `FlightNotification.items`; tretja kopija istega dejstva |
| `FlightSearchRecipient` kot ločena zbirka | vdelan seznam kot `TodoList.members` (010); recipientov je ≤ 10 in se berejo vedno skupaj z iskanjem |
| `ownerId` + `members` na iskanju | prejemnik iskanja ne bere (FR-041); ime `userId` obljublja točno to izolacijo (data-model.md) |
| pošiljanje pošte neposredno iz zagona | padec procesa med pošiljanjem bi izgubil ali podvojil dopise; outbox je preverjen vzorec iz `platform/webhooks` |
| `node-cron` / `cron` | `node-cron` nima parse-only validacije v 4.x; `cron` 4.x išče vzdrževalce; `croner` je brez odvisnosti in vrže napako ob neveljavnem vzorcu |
| `p-limit` za vzporednost | 15 vrstic lastne kode proti novi odvisnosti |
| `@2bad/ryanair` kot odvisnost | vleče `got`, `hpagent`, `zod` peer; potrebujemo dva GET klica, ki ju naredi `fetch` prek `platform/cache` (sicer bi obšli člen VIII) |
| Travelpayouts `airports.json` kot nabor | §10 |
