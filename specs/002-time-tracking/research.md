# Research: Beleženje časa

**Vhod**: `nacrt/002-time-tracking/research.md` (obsežna raziskava, datumi preverjanja
19. 8. 2026), `docs/legacy-engine.md` (napake starega sistema), `docs/env-reference.md`,
[spec.md](./spec.md), [plan.md](./plan.md) Technical Context.

Ta dokument razreši preostale `NEEDS CLARIFICATION` iz Technical Context in prevzame
odločitve iz `nacrt/002-time-tracking/research.md`, kjer jih dopolni s tem, kar 001 že
gradi (avtentikacija, obvestila, API ključi, idempotentnost, register zavihkov) in kar iz
tega sledi za 002: **ne graditi drugič, kar 001 že ima.**

---

## 1. Stanje ure — izpeljano iz razpoložljivih akcij

**Odločitev**: Stanje (`OFF_DUTY`, `ON_DUTY`, `ON_BREAK`, `UNKNOWN`) se vedno izpelje iz
trenutno prikazanega nabora gumbov na strani delodajalca, nikoli iz lastne zgodovine.

**Zakaj**: To je edini vpogled, ki ga podedovan sistem sploh ponuja (Podedovana omejitev
#3). Preslikava:

| Med razpoložljivimi | Stanje |
|---|---|
| `Prijava na delo`, `Prihod na delo`, `Delo od doma`, `Delo na terenu` | `OFF_DUTY` |
| `Konec malice` | `ON_BREAK` |
| `Malica`, `Odmor med delom`, `Konec dela` (brez `Konec malice`) | `ON_DUTY` |
| prazen nabor | `UNKNOWN` — okvara, ne stanje (FR-022) |

`Konec malice` se preveri **pred** `Konec dela`, ker sta med odmorom lahko na voljo oba.
Ista tabela poganja tri stvari: verifikacijo po izvedbi (FR-030), zaznavo zamujene akcije
v `REMIND_ONLY` (FR-040) in preverjanje pred izvedbo (FR-033, `already_done`).

Prva vrstica so **štiri različice istega dejanja**: vse štiri odprejo delovni dan in vodijo
v `ON_DUTY`, razlikujejo pa se po kraju. Ker je razlika krajevna in ne časovna, je izbira
med njimi lastnost lokacije (`trackingLocations.startAction`, FR-090), ne profila —
`resolveActionForLocation` jo vstavi ob sestavljanju načrta, tako da v načrtu in zgodovini
stoji ime gumba, ki je bil res pritisnjen. Isti izvedeni seznam (`START_ACTIONS`) je hkrati
nabor za `OFF_DUTY` in nabor dovoljenih vrednosti v nastavitvah — dva seznama bi se
razšla.

**Zavrnjeno**: ugibanje stanja iz lastne zgodovine — uporabnik lahko gumb pritisne mimo
sistema (Story 1, 4), zato je oddaljena stran edini zanesljiv vir. Razčlenjevanje besedila
strani za urami vpisov — prekrhko, nabor gumbov zadošča.

**Vmesnik brskalniške plasti** (edini stik z zunanjim svetom, člen IX):

```ts
interface ClockPortal {
  readState(loc: ResolvedLocation): Promise<StateReading>;
  performAction(loc: ResolvedLocation, action: ActionName): Promise<ActionOutcome>;
}
```

Vsa preostala logika (kdaj, kaj, ali je delovni dan, katero stanje pričakujemo) je čista
funkcija brez `ClockPortal`, testirana z `FakeClockPortal`. Brez te ločnice mejni primeri
(poletni čas, praznik, dopust) niso testabilni — glej Kakovostna vrata #2 ustave.

## 2. Puppeteer v Dockerju

**Odločitev**: `node:22-bookworm-slim` s sistemskim Chromiumom iz `apt`,
`PUPPETEER_SKIP_DOWNLOAD=true`, `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`. Nov
brskalniški kontekst (`createBrowserContext()`, preimenovano v Puppeteer v22) za vsako
operacijo, zaprt v `finally`; dolgo živeč brskalnik z kratkoživimi konteksti.

**Zakaj**: `node:21-alpine` (star sistem) uporablja musl, kjer Chromium ni uradno podprt,
in pripenja Alpine repozitorij, ki bo nekoč izginil (`docs/legacy-engine.md` §5). Uradna
slika `ghcr.io/puppeteer/puppeteer` prinese celotno okolje in oteži skupno sliko z API-jem.

**Obvezne nastavitve, ki jih star sistem nima** (vse iz `docs/legacy-engine.md` §4.6–4.7
in verificirane nujnosti za Chromium v Dockerju):

| Nastavitev | Zakaj | Kje |
|---|---|---|
| `shm_size: 1gb` | privzeti `/dev/shm` (64 MB) povzroči `Target closed` ob nalaganju strani — najpogostejši vzrok "gumb se ni pritisnil" | `infra/docker-compose.yml`, storitev `api` — **manjka danes**, glej §14 |
| `init: true` | Chromium pušča zombi procese | isto, **manjka danes** |
| `mem_limit` | Chromium raste; brez omejitve lahko izstrada Mongo na istem VPS-u | isto, **manjka danes** |
| eksplicitna `protocolTimeout`/`timeout` | `BROWSER_TIMEOUT_MS`/`BROWSER_PROTOCOL_TIMEOUT_MS` že v `.env.example` (001), obešen klic brez tega blokira tik za vedno | `platform/config/env.ts` — shema jih še ne validira, glej §14 |
| `TZ=Europe/Ljubljana` | brez tega vsebnik teče v UTC | `api.Dockerfile`, že v `infra/api.Dockerfile` iz 001, preveri se z novim `chromium` paketom |

**Higiena**: nov kontekst na operacijo, zaprt v `finally` ne glede na izid — stara koda
zapre brskalnik samo na uspešni poti (`docs/legacy-engine.md` §4.7), po nekaj dneh je
odprtih na desetine procesov. Ob `Target closed` ali `Protocol error` se brskalnik zavrže
in zažene znova.

`--no-sandbox` (`BROWSER_NO_SANDBOX`): privzeto `false`. Vklopi se samo, če peskovnik na
VPS-u dejansko ni izvedljiv, in mora biti zapisana, zavestna odločitev (že v
`docs/env-reference.md`), ne privzeta bližnjica.

## 3. Kdaj se kaj sproži — lenoben, dohitevajoč tik

**Odločitev**: ena zanka na `SCHEDULER_TICK_SECONDS` (privzeto 30 s), ki ob vsakem tiku:

1. poskrbi za načrt danes in jutri (`upsert` na unikatni ključ, če ne obstaja);
2. pobere zapadle akcije (`state ∈ {planned, due} ∧ scheduledAt ≤ now`);
3. jih obdela zaporedno, eno naenkrat na profil (FR-034).

To je isti vzorec, ki mora veljati za catch-up po izpadu (Story 10, FR-062): restart
kadarkoli ne izgubi ničesar, ker je poizvedba po zapadlih akcijah sama po sebi
dohitevajoča. Atomarni prehod `due → running` prek `findOneAndUpdate` s pogojem na
trenutno stanje je hkrati zaklep in zapis (poenostavi FR-034 na en pogojni zapis v bazi,
brez ločenega mehanizma zaklepanja).

**Zavrnjeno**: cron izraz plus okno ob polnoči (star sistem, `docs/legacy-engine.md` §4.2)
— desetsekundno okno je enojna točka odpovedi za cel dan. Čakalna vrsta (BullMQ, Agenda) —
doda Redis za opravilo z nekaj dogodki na dan; dodaj šele, če bo treba porazdeliti delo na
več instanc.

**Zamuda in polnočno zaprtje** (FR-045, iz clarify seje 2026-08-20): akcija, zamujena za
več kot `maxDelayMinutes` (privzeto 90), se v `AUTO` ne izvede več, ampak postane `missed`.
Ob prehodu koledarskega dne (polnoč po `Europe/Ljubljana`) se **vsaka** še odprta akcija
prejšnjega dne — vključno s tisto sredi niza ponovnih poskusov — takoj zapre kot `missed`;
tik nikoli ne pritisne gumba, ki bi se pri delodajalcu zapisal za pretekli koledarski dan.
Implementacijsko: korak 2 zgoraj poleg `scheduledAt ≤ now` išče tudi
`localDate < today ∧ state ∉ {succeeded, failed, already_done, missed, skipped, cancelled}`
in jih pred vsem ostalim zapre.

## 4. Časovni pas in koledarski dan

**Odločitev**: vsak trenutek je UTC `Date` (Mongoose privzeto). Koledarski dan je ločen niz
`YYYY-MM-DD`, izračunan v `Europe/Ljubljana`. Časi v profilih so lokalni brez datuma
(`"06:18:00"`), pretvorjeni v instant ob sestavljanju načrta (FR-003) — enkrat, shranjeno,
nikoli preračunano ob prikazu.

**Knjižnica**: Luxon (že odvisnost apps/api iz 001, `src/domain/timezone.ts`). `Temporal`
prek polyfilla ni bil sprejet v 001 zaradi zrelosti; 002 ne uvaja druge knjižnice za isto
nalogo — dosledno z 001-ovim `research.md` §12.

**Prehodi**: zadnjo nedeljo v marcu ura 02:00–03:00 lokalno ne obstaja — akcija v tem
oknu se premakne na prvi obstoječi trenutek za njim. Zadnjo nedeljo v oktobru se ura
02:00–03:00 ponovi — uporabi se prva pojavitev. Za urnik pon–pet to praktično ne nastopi,
ker prehod pade na nedeljo, a je Kakovostno vrato 2 ustave zahteva kot poimenski primer, ker
je to napaka, ki se pokaže enkrat na leto in takrat ni reproducirati.

**Zavrnjeno**: `moment-timezone` (vzdrževalni način, tudi po presoji 001).

## 5. Slovenski prazniki

**Odločitev**: izračun v kodi (anonimni gregorijanski algoritem za veliko noč) kot glavni
vir; ročni popravki uporabnika imajo prednost (FR-011). `isHoliday` in `isWorkFree` sta
ločeni polji — 17. avgust in 23. november sta državna praznika, ki **nista** dela prosta;
za urnik šteje samo `isWorkFree`.

**[preverjeno 19. 8. 2026]**: `https://date.nager.at/api/v3/PublicHolidays/2026/SI` vrne
HTTP 200 s pravilnimi slovenskimi imeni. Uporabno kot enkraten vir za polnjenje ob prvi
uporabi leta in kot primerjalni test; **ni** odvisnost med izvajanjem — odločitev "je danes
delovni dan" mora delovati brez omrežja, saj čaka zunanji vir na vsak zagon ni sprejemljivo
tveganje za nekaj datumov na leto, ki se ne spreminjajo.

## 6. Obvestila — ponovna uporaba mehanizma iz 001, ne nov kanal

**Odločitev**: 002 uvede tri nove vrste obvestil (`reminder`, `confirmation`, `failure`
poleg že obstoječega `health` iz 001 dead-man's-switch konteksta) prek **obstoječega**
`platform/notifications/` iz 001 (`fcm.service.ts`, `channels.ts`, `device.model.ts`,
`token-cleanup.service.ts`, endpoint `/devices`). 002 ne dodaja nove naprave, novega
žetona ali novega endpointa za registracijo — samo nove vrste obvestil in nov `dedupeKey`
vzorec za FR-073.

**Zakaj**: `docs/legacy-engine.md` §4.9 in `docs/SECURITY-FIRST.md` že razrešujeta
poverilnice (montirana datoteka, `GOOGLE_APPLICATION_CREDENTIALS`); 001 že rešuje Android
13+ dovoljenje, kanale in čiščenje zavrnjenih žetonov (US7). Podvajanje bi bilo naravnost v
nasprotju s členom I (moduli ne podvajajo skupnih storitev, uporabljajo jih prek
`platform/`).

**Kar 002 doda v `platform/notifications/channels.ts`**: kanala `reminder` (visoka
pomembnost, zvok) in `confirmation` (nizka), ker jih uporabnik lahko ugasne posamično
(FR-071) — kanal `health` že obstaja iz 001. `dedupeKey` v `notificationRecords` (že
kolekcija iz 001, glej data-model.md) uveljavlja FR-073: en `dedupeKey` na
(`plannedActionId`, tip, interval opozarjanja).

## 7. Idempotentnost — ponovna uporaba middleware iz 001

**Odločitev**: 002 uporablja **isti** `platform/idempotency/middleware.ts` iz 001, brez
sprememb. `POST /time-tracking/actions`, `POST /time-tracking/absences`,
`POST /time-tracking/overrides`, `POST /time-tracking/rebuild-plan` in
`PUT /time-tracking/sessions/{id}` ga uporabljajo kot vsak drug mutacijski endpoint.

**Avtentikacija za n8n**: **isti** `platform/apikeys/` mehanizem iz 001 (X-API-Key,
zgoščena vrednost prek Argon2id ali scrypt). 002 doda nove obsege v isto shemo obsegov
(`platform/auth/scopes.ts`): `state:read`, `action:write`, `schedule:read`,
`schedule:write`, `calendar:read`, `calendar:write`, `history:read`, `webhooks:write`,
`health:read` (že obstaja iz 001, ponovno uporabljen).

**Izhodni webhooki**: novi za 002 (`action.succeeded`, `action.failed`, `action.missed`,
`session.expiring`), podpisani HMAC-SHA256 v glavi `X-CleverDash-Signature`, s časovnim
žigom proti ponovnemu predvajanju in ponovnimi poskusi z eksponentnim zamikom. To je nova
zmogljivost, ki je 001 ni potreboval — živi v `platform/webhooks/`, ne v modulu
`time-tracking/`, ker gre za splošen mehanizem, ki ga bo verjetno uporabila tudi 003.

## 8. Nadzor delovanja — razširitev obstoječega dvoplastnega pristopa

**Odločitev**: `GET /api/v1/health` (že obstaja iz 001) se **razširi** z novimi polji:
starost zadnjega tika schedulerja, sposobnost zagona brskalnika (predpomnjeno, ne ob vsaki
zahtevi), dosegljivost strani delodajalca, veljavnost seje(-j) in
`failedActionsLast24h`/`missedActionsLast24h`. Obstoječi zunanji srčni utrip
(`HEALTHCHECK_PING_URL`, `platform/health/heartbeat.ts`) že teče iz 001 — 002 ga ne
podvaja, samo doda svoje korake (poskrbi za načrt, obdelaj zapadle) v isti tik, ki že
pošilja ping navzven.

**Zakaj razširitev, ne nov endpoint**: člen VII zahteva en zunanji signal o zdravju
celotnega sistema, ne enega na modul — ločen `/time-tracking/health` bi pomenil dva
neodvisna dead-man's-switcha, ki ju je treba ločeno nastaviti in ločeno spremljati, kar je
prav tista operativna površina, ki jo člen VII poskuša zmanjšati.

**Posebna pozornost — polnjenje diska**: posnetki zaslona ob napaki so bistveno večji od
JSON dnevnikov, ki jih je imel star sistem. Zdravstveni endpoint MORA poročati o prostoru
na disku (`diskFreeBytes`); čiščenje (§13 spodaj) mora biti samodejno, ne ročno opravilo.

**Integracijska podrobnost — kdo kliče zunanji ping**: `platform/health/heartbeat.ts`
(001) danes poganja **svoj lasten** `setInterval` na 60 s, neodvisno od kogar koli.
002 uvede pravi tik na `SCHEDULER_TICK_SECONDS` (30 s), ki dejansko dela (načrt, zapadle
akcije). Namesto dveh neodvisnih intervalov (kar bi pomenilo dva rahlo neusklajena vira
resnice o "sistem živi") `modules/time-tracking/scheduler.ts` po vsakem svojem tiku
**pokliče isto izvoženo funkcijo**, ki jo `startHeartbeat` uporablja za en ping
(preimenovano/izvoženo iz `heartbeat.ts` kot `pingOnce`), namesto da bi čakal na naslednji
60-sekundni odjav `setInterval`-a. `startHeartbeat` se ob prisotnosti schedulerja ne
zažene ločeno — to je majhna, dokumentirana sprememba klica v `main.ts`, ne sprememba
javnega vedenja modula (`getHeartbeatStatus()` ostane enak). Zapisan `Heartbeat` dokument
(nova kolekcija, §13) beleži poleg `externalPingOk` tudi, koliko načrtov/akcij je tik
obdelal — podatek, ki ga `platform/health` sam po sebi nima.

## 9. Preverjeni zunanji viri

| Vir | Rezultat |
|---|---|
| stran delodajalca (`nacrt/002-time-tracking/docs/legacy-engine.md` §1 oz. `docs/legacy-engine.md` §1) | naslov je občutljiv podatek in **ni bil klican** med to raziskavo — vsaka zahteva bi lahko vplivala na pravo evidenco delovnega časa (glej spec.md, Out of Scope) |
| `https://date.nager.at/api/v3/PublicHolidays/2026/SI` | **[preverjeno 19. 8. 2026]** HTTP 200, pravilni slovenski prazniki s krajevnimi imeni |

**Pred implementacijo je treba na živem naslovu preveriti** (prek `dry-run` branja stanja,
ki ne klika ničesar — quickstart.md §6, korak 3): ali selektor `a.clockin-button` še drži,
ali je element `addHomeScreenDiv` še prisoten, točna slovenska besedila gumbov, ali je
mobilni user-agent še pogoj za prikaz gumbov, in da je seja iz `.env` starega sistema
(skoraj zagotovo) potekla (`docs/legacy-engine.md` §4.10).

## 10. Modul `time-tracking` — mesto v obstoječi arhitekturi

**Odločitev**: `apps/api/src/modules/time-tracking/` in
`apps/web/src/app/features/time-tracking/`, po istem vzorcu kot `modules/dashboard/` in
`modules/settings/` iz 001 (člen I). Domenska logika (stanje ure, koledar, raztros,
prednost izjem) živi v `apps/api/src/domain/`, poleg že obstoječih `freshness.ts` in
`timezone.ts` iz 001 — brez odvisnosti na Express, Mongoose ali Puppeteer, kar je pogoj za
enotske teste mejnih primerov brez brskalnika (člen IX).

Kaj portal prejme, je odločitev razrešitve lokacije, ne portala: `ResolvedLocation` nosi
koordinati samo, kadar je pošiljanje lokacije za tisto lokacijo vklopljeno (FR-094). Brez
njiju portal dovoljenje za geolokacijo izrecno zavrne — stikalo tako ne obstaja nikjer v
brskalniški plasti, ta samo izvede, kar dobi (člen IX).

`ClockPortal` (§1) je edina infrastrukturna odvisnost domenske plasti, vbrizgana kot
vmesnik: `PuppeteerClockPortal` v produkciji, `FakeClockPortal` v testih in
`CLOCK_PORTAL=fake` razvoju.

**Register zavihkov** (`platform/tabs/registry.ts`, že obstaja): nov vnos `time-tracking`,
`order: 5` (med `dashboard: 0` in `settings: 10`) — dodajanje je natanko en vnos, brez
sprememb obstoječih dveh, kar dokazuje SC-005 iz 001 tudi za 002.

## 11. Zasloni

Enako členjeno kot v `nacrt/002-time-tracking/plan.md` §B.8: **Danes** (privzeti zaslon
modula, stanje + načrtovane akcije + ročni gumbi + izbira lokacije), **Urnik** (profili),
**Koledar** (mesečni pregled, dopust, izjeme, prazniki), **Zgodovina** (filtriran seznam,
razširljiv do poskusov), **Diagnostika** (zdravje modula, stanje seje, gumb za `dry-run`).
Nastavitve modula (lokacije, seja, obvestila specifična za 002) se pridružijo obstoječemu
zaslonu **Nastavitve** iz 001 kot nov razdelek, ne nov zavihek — potrošniku ni očitno, zakaj
bi imel dva ločena nastavitvena zaslona. Znotraj sklopa **Moduli** ima vsak modul svoj
zavihek (005, FR-127), torej so razdelki 002 zbrani pod zavihkom "Beleženje časa" in ne
pomešani med nastavitve drugih modulov.

## 12. Migracija iz starega sistema

Enkraten skript proti stari bazi (`d:\programiranje\privat\belezenje_casa`), izveden
**po** tem, ko nov sistem v `dry-run` vsaj en teden pravilno napoveduje iste akcije kot
star. Preslikava je v [data-model.md](./data-model.md) §Preslikava iz starega modela.
Kritično: `schedulers.daysToStart` uporablja `Date.getDay()` (0 = nedelja), novi
`daysOfWeek` uporablja ISO (1 = ponedeljek) — brez pretvorbe se urnik premakne za en dan
(`docs/legacy-engine.md` §Preslikava). Vrednost sejnega piškotka se **ne** prenese — vpiše
se nova, ker je stara že potekla 24. 1. 2025.

## 13. Čiščenje in TTL — razlikovanje od `externalCache` v 001

**Odločitev**: v nasprotju z `externalCache` iz 001 (namenoma **brez** TTL, ker mora
iztečen zapis preživeti za prikaz stanja "zadnje znano"), so tukaj TTL indeksi **pravilna**
izbira za `heartbeats` (14 dni), `notificationRecords` (90 dni), `idempotencyRecords`
(24 ur, enako kot 001) in `webhookDeliveries` (30 dni) — ti zapisi nimajo vrednosti kot
"zadnje znano stanje", so operativni dnevnik. `actionRecords` (trajna zgodovina, FR-052) in
`plannedActions` (dokler niso prepisani v `actionRecords`) **nimajo** TTL — to je evidenca,
ne predpomnilnik. Posnetki zaslona so izjema: **datoteke** se brišejo po
`SCREENSHOT_RETENTION_DAYS` (30 dni), zapis v `actionAttempts` ostane s praznim
`screenshotPath` (FR-053) — mongoose TTL na kolekcijo bi izbrisal cel zapis poskusa, ne
samo sliko, kar FR-053 izrecno prepoveduje.

## 14. Vrzeli v obstoječi 001 infrastrukturi, ki jih 002 mora zapolniti

To niso nove arhitekturne odločitve, ampak stvari, ki jih je 001 predvidel (`.env.example`
že ima razdelka "Brskalnik" in "Scheduler" z opombo "za 002"), a še ni zaključil:

1. **`apps/api/src/platform/config/env.ts`** (Zod shema) še NE validira
   `PUPPETEER_SKIP_DOWNLOAD`, `PUPPETEER_EXECUTABLE_PATH`, `BROWSER_HEADLESS`,
   `BROWSER_TIMEOUT_MS`, `BROWSER_PROTOCOL_TIMEOUT_MS`, `BROWSER_NO_SANDBOX`,
   `BROWSER_USER_AGENT`, `SCHEDULER_ENABLED`, `SCHEDULER_TICK_SECONDS`,
   `SCHEDULE_TIMEZONE`, `DRY_RUN`, `CLOCK_PORTAL`, `SCREENSHOT_DIR`,
   `SCREENSHOT_RETENTION_DAYS`, čeprav `.env.example` te spremenljivke že vsebuje. Dokler
   shema teh polj ne pozna, `loadEnv()` jih tiho ignorira namesto da bi zaustavila zagon ob
   napačni vrednosti — natanko napaka iz `docs/env-reference.md` §6 (`SALT_ROUNDS` → `NaN`),
   ki jo je 001 sicer namenoma odpravil za svoja lastna polja. Naloga za 002: razširiti
   shemo, ne pisati nove.
2. **`infra/docker-compose.yml`**, storitev `api`, nima `shm_size`, `init: true` ne
   `mem_limit` (glej §2 zgoraj) — brez tega Chromium v vsebniku ni zanesljiv. To je
   sprememba istega compose fila iz 001, ne nova storitev.
3. **`infra/api.Dockerfile`** — preverjeno proti dejanski datoteki (ne samo proti nacrt
   osnutku): `chromium` in `PUPPETEER_SKIP_DOWNLOAD`/`PUPPETEER_EXECUTABLE_PATH` sta že
   nameščena — 001 je to predvidel v komentarju "uporablja ga 002". Manjkata samo
   `fonts-liberation` (brez njega Chromium na straneh s posebnimi znaki namesto pravih
   pisav izriše prazne kvadratke — nepomembno za vizualni izgled, a lahko vpliva na
   `innerText` selektorje, če stran uporablja spletne pisave za gumbe) in
   `ca-certificates` (TLS do `https://e-racuni.com`). Manjši popravek ene vrstice, ne nova
   faza gradnje.

Vse tri točke gredo v `tasks.md` kot naloge znotraj Foundational faze te funkcionalnosti
(pred katero koli uporabniško zgodbo), ker brez njih noben od `FakeClockPortal`-neodvisnih
delov (Story 1–4) ne more teči proti pravemu brskalniku niti v razvoju.
