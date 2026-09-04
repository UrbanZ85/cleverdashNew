# 002 — Zagon in preverjanje (Phase 1)

Navodilo za zagon in **dokazovanje**, da funkcionalnost deluje. Ni navodilo za izvedbo —
koda in naloge pridejo v `tasks.md` po `/speckit-tasks`.

Bere se skupaj s [plan.md](./plan.md), [research.md](./research.md) in
[contracts/openapi.yaml](./contracts/openapi.yaml). Predpostavlja dokončano in postavljeno
001 ([specs/001-app-shell-dashboard/quickstart.md](../001-app-shell-dashboard/quickstart.md))
— ta dokument ne ponavlja splošne postavitve (Caddy, TLS, Mongo), samo dodatke za 002.

---

## 1. Predpogoji dodatno k 001

| Kaj | Opomba |
|---|---|
| `docker-compose.yml` s `shm_size`, `init: true`, `mem_limit` na storitvi `api` | brez tega Chromium v vsebniku ni zanesljiv — glej [research.md](./research.md) §2, §14 |
| Sistemski Chromium v `infra/api.Dockerfile` | dodan `apt-get install chromium fonts-liberation` v runtime sliko |
| Veljavna seja pri delodajalcu | **ne** tista iz starega `.env` — potekla 24. 1. 2025 (`docs/legacy-engine.md` §4.10). Nova seja se vpiše v aplikaciji šele po prvem zagonu (§6 spodaj) |

---

## 2. Kar je treba dodatno izpolniti v `.env`

Vse spodnje spremenljivke so že v `.env.example` (001 jih je predvidel), a `platform/config/env.ts`
jih morda še ne validira — to je prva naloga Foundational faze ([research.md](./research.md) §14).

Obvezno za pravi (ne `fake`) `ClockPortal`:

```
PUPPETEER_SKIP_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
BROWSER_HEADLESS=true
BROWSER_TIMEOUT_MS=30000
BROWSER_PROTOCOL_TIMEOUT_MS=60000
```

Priporočeno za razvoj — **ne** klikaj po pravi evidenci delovnega časa iz razvojnega okolja:

```
DRY_RUN=true            # privzeto v vsakem okolju, ki ni produkcija
CLOCK_PORTAL=fake       # FakeClockPortal, skriptirana stanja — brez pravega naslova
SCHEDULER_TICK_SECONDS=30
SCHEDULE_TIMEZONE=Europe/Ljubljana
```

**Preveri pred prvim commitom:** enako kot 001 — `git status` brez `.env`, `gitleaks` čist.
Sejni piškotek delodajalca (ko bo vnesen prek UI) živi izključno v bazi (`remoteSessions`),
nikoli v `.env` (glej data-model.md, člen IV ustave).

---

## 3. Preverjanje po uporabniških zgodbah

Vsaka vrstica je izvedljiva in ustreza merilu uspeha iz [spec.md](./spec.md). Priporočen
vrstni red je isti kot prioriteta zgodb — P1 (ročni pritisk) je edini, ki se lahko preveri
brez čakanja na načrtovan čas.

### 3.1 Ročni pritisk in verifikacija (P1)

| Korak | Pričakovano | Pokriva |
|---|---|---|
| `POST /time-tracking/diagnostics/test-read` (`CLOCK_PORTAL=fake` ali pravi naslov v `dry-run`) | Vrne seznam razpoložljivih akcij, brez klika | FR-035, FR-064 |
| Odpri zaslon "Danes" | Vidne trenutno razpoložljive akcije | FR-020 |
| Pritisni razpoložljivo akcijo | Izid (uspeh/neuspeh) v nekaj sekundah; zgodovina dobi zapis z `source: manual` | FR-030, FR-050, SC-006 |
| Pritisni akcijo, katere pričakovano stanje že velja | `already_done`, brez klika | FR-033 |
| Ročno izvedi akcijo, ki je za danes tudi načrtovana | Načrtovana akcija se označi kot opravljena; opozorilo zanjo kasneje ne pride | FR-042 |

### 3.2 Samodejno beleženje (P2) in ponovni poskusi (P3)

| Korak | Pričakovano | Pokriva |
|---|---|---|
| Ustvari profil v `AUTO` za tekoči dan, `FakeClockPortal` z uspešnim scenarijem | Ob načrtovanem času sistem sam izvede in verificira akcijo | FR-030, SC-001 |
| Preveri obvestila | Potrditev za prvo in zadnjo akcijo dneva (privzeti Assumptions) | FR-070 |
| `FakeClockPortal` skriptiran tako, da klik ne učinkuje | Poskus se označi neuspel, sledi ponovitev z naraščajočim zamikom, posnetek zaslona shranjen | FR-031, FR-032, SC-002 |
| Izčrpaj vse poskuse brez uspeha | Obvestilo o neuspehu; akcija ostane `failed`, vidna v zgodovini in na "Danes" | FR-043, FR-044 |
| Dva profila z akcijo ob istem trenutku | Obe se obdelata zaporedno, nikoli vzporedno za isti profil | FR-034 |

### 3.3 Samo opozarjanje (P4)

| Korak | Pričakovano | Pokriva |
|---|---|---|
| Profil v `REMIND_ONLY`, pusti načrtovani čas + strpno obdobje preteči | Nobenega klika; opozorilo z imenom akcije in načrtovanim časom | FR-040, SC-004 |
| Ne stori ničesar naprej | Opozorilo se ponovi na interval, največ do nastavljene meje | FR-041 |
| Med opozarjanjem ročno pritisni akcijo (mimo sistema, v `FakeClockPortal` spremeni stanje) | Opozarjanje se ustavi ob naslednjem branju | FR-042 |

### 3.4 Koledar — prazniki, vikendi, dopust, izredni delovni dan (P5–P7)

| Korak | Pričakovano | Pokriva |
|---|---|---|
| Sestavi načrt za praznik, ki pade na delovni dan profila | Brez akcij; `CalendarDay.status = holiday` z imenom praznika | FR-014, SC-005 |
| Sestavi načrt za soboto pri pon–pet profilu | Brez akcij | FR-014 |
| Odpri koledarski pregled | Vsak dan ima status in razlog | FR-015 |
| Prvi dostop v novem koledarskem letu | Prazniki za to leto že napolnjeni | FR-011 |
| Ročno popravi samodejno napolnjen praznik | Ročni vnos prevlada | FR-011 |
| Vnesi dopust čez mejo meseca (npr. 28.6.–3.7.) | Brez akcij v celotnem obdobju, brez vrzeli na meji meseca | FR-012, edge case |
| Prvi delovni dan po dopustu | Urnik deluje brez ročnega vklopa | FR-012 |
| Vnesi `forceWorkday` za soboto | Enake akcije kot običajen delovni dan profila | FR-013 |
| `forceWorkday` na datum z že vneseno odsotnostjo za isti profil | `422`, razumljivo sporočilo | edge case, Story 6/7 |
| Profil v `OFF` za delovni dan | `CalendarDay` se izračuna (viden v pregledu), **nobena** `PlannedAction` ne nastane | FR-008 |

### 3.5 Seja pri delodajalcu (P8)

| Korak | Pričakovano | Pokriva |
|---|---|---|
| Nastavi `expiresAt` sejo na manj kot 7 dni naprej | Opozorilo "seja se izteče v N dneh" | FR-063, SC-008 |
| `FakeClockPortal` vrne prazen nabor akcij | Diagnostika loči potekla seja / nedosegljiva stran / spremenjena struktura, ne generično "gumba ni" | FR-022 |
| `PUT /time-tracking/sessions/{id}` z novo vrednostjo | Sprejeto brez ponovnega zagona; takojšnje preizkusno branje potrdi delovanje | FR-091 |
| `GET` katerikoli endpoint, ki vrne `RemoteSession` | `cookieValueMasked`, nikoli cela vrednost | FR-092 |

### 3.6 Zgodovina (P9)

| Korak | Pričakovano | Pokriva |
|---|---|---|
| Ustvari akcije z različnimi izidi in viri | `GET /time-tracking/history` vrne vse s časi, izidom, virom, stanjem pred/po | FR-050 |
| Filtriraj po obdobju, profilu, tipu, izidu | Seznam se ustrezno zoži | FR-051 |
| Razširi zapis z neuspelim poskusom | `GET /time-tracking/history/{id}/attempts` vrne posnetek zaslona | FR-032 |
| Poskusi spremeniti obstoječi zgodovinski zapis | Ni endpointa za to — popravek je nov zapis z `note` | FR-052 |

### 3.7 Dohitevanje po izpadu (P10) in polnočno zaprtje

| Korak | Pričakovano | Pokriva |
|---|---|---|
| Ustavi API vsebnik čez načrtovani čas akcije, znova zaženi | Zamujena akcija: izvedena, če znotraj `maxDelayMinutes`, sicer `missed` z obvestilom | FR-062, SC-007 |
| Pusti akcijo sredi ponovnih poskusov čez polnoč (simulirano s premaknjeno uro/`localDate`) | Preostali poskusi prekinjeni, akcija `missed`, brez klika po polnoči | FR-045 |
| Ustavi API vsebnik | Zunanji dead man's switch (skupen s 001) zazna zamolk | člen VII, dosledno s 001 quickstart §4.6 |

### 3.8 API in n8n (P11)

| Korak | Pričakovano | Pokriva |
|---|---|---|
| Ustvari API ključ z obsegom `action:write` | Prikazan enkrat; nadaljnji klici z `X-API-Key` delujejo | FR-081 |
| `POST /time-tracking/actions` z `Idempotency-Key`, ponovi identično | Ena dejanska izvedba, enak odgovor obakrat | FR-082, SC-009 |
| Prek API-ja preberi stanje, zgodovino, vnesi odsotnost, preklopi `mode` | Vse dosegljivo pod `/api/v1`, brez izjem | FR-080 |
| Konfiguriraj `WebhookEndpoint`, sproži dogodek | Podpisan POST na naslov, s ponovnim poskusom ob neuspehu | FR-083 |

---

## 4. Enotski testi domenske logike (Kakovostno vrato 2)

Brez teh naloga ni končana — vsi z `FakeClockPortal`, brez omrežja in brez pravega
brskalnika (člen IX):

1. prehod na poletni čas — akcija v uri, ki lokalno ne obstaja
2. prehod na zimski čas — akcija v podvojeni uri, uporabi se prva pojavitev
3. praznik, ki pade na delovni dan profila
4. dopust, ki se razteza čez mejo meseca (in leta)
5. neuspel klik, ki se ponovi in drugi poskus uspe
6. `forceWorkday` na praznik
7. dva profila, ki pokrivata različne dni istega tedna — regresija za `docs/legacy-engine.md` §4.3
8. raztros nikoli ne prestopi nastavljene meje in ne prelije v naslednjo uro — regresija za §4.4
9. stanje je že pravo → `already_done`, brez klika
10. `REMIND_ONLY`: uporabnik opravi akcijo sam med opozorili → opozarjanje se ustavi
11. restart sredi dneva → zapadle akcije se dohitijo, nič se ne izgubi
12. akcija sredi ponovnih poskusov ob prehodu čez polnoč → `missed`, brez poskusa po polnoči (FR-045)
13. profil v `OFF` → `CalendarDay` se izračuna, `PlannedAction` ne nastane (FR-008)
14. prazen nabor razpoložljivih akcij → diagnoza "potekla seja", ne "gumba ni"
15. dvakratni klic z istim `Idempotency-Key` → ena izvedba

---

## 5. Razvojni način

```bash
# iz 001, nespremenjeno
docker compose -f infra/docker-compose.dev.yml up -d   # samo Mongo
npm run dev:api
npm run dev:web
```

```bash
# 002 dodatno — brez klikanja po pravi strani
CLOCK_PORTAL=fake npm run dev:api    # FakeClockPortal, skriptirana stanja
DRY_RUN=true      npm run dev:api    # pravi Puppeteer, bere, a ne klikne
```

`DRY_RUN=true` naj bo privzeto v vsakem okolju, ki ni produkcija. Nenamerno klikanje po
pravi evidenci delovnega časa iz razvojnega okolja je težko popraviti (glej Out of Scope v
spec.md).

Enako kot 001, mora biti čisto pred vsakim commitom:

```bash
npm run typecheck
npm run lint
npm run test
```

---

## 6. Prvi zagon na VPS — dodatek k 001 §6

Po tem, ko je 001 postavljena (`docker compose up -d`, prijava, zamenjava gesla):

1. V Nastavitvah → Moduli → **Beleženje časa** najprej dodaj **sejo** (ime piškotka, **nova**
   vrednost, domena, rok veljavnosti — vse štiri, kot jih pokaže razhroščevalnik; stara
   vrednost iz `.env` starega sistema je potekla in ne sme biti uporabljena), nato
   **lokacije** — po eno za vsak kraj, s katerega se beleži (služba, doma, terén), vsako s
   svojim naslovom strani, svojim parom koordinat in svojim **gumbom za začetek dela**
   (`Prijava na delo` za pisarno, `Delo od doma`, `Delo na terenu` — FR-090). Urnik ostane
   isti; gumb izbere lokacija. Če za kak kraj lege ne želiš pošiljati, izklopi **"Pošlji
   lokacijo strani"** (FR-094) — koordinat tam ni treba vpisati; preveri pa s preizkusnim
   branjem (korak 2), ali stran gumbe pokaže tudi brez lokacije.
2. Odpri Diagnostiko in poženi preizkusno branje
   (`POST /time-tracking/diagnostics/test-read`). Mora vrniti seznam gumbov. **Če ne, tega
   koraka ne preskoči** — brez zanesljivega branja ni smiselno vklapljati ničesar drugega.
3. Ustvari profile (`docs/legacy-engine.md` §6 za obstoječe vrednosti; pretvori
   `daysOfWeek` iz `Date.getDay()` v ISO — glej data-model.md, migracijsko opozorilo).
4. Profile pusti v `REMIND_ONLY` vsaj en teden, primerjaj z resničnostjo — **kljub temu, da
   je privzeti način novega profila `AUTO`** (FR-007, odločitev 20. 8. 2026). Ta korak je
   zavestna previdnost ob prvem vklopu, ne odstopanje od privzete vrednosti.
5. Šele nato vklopi `AUTO` (če ni bil že).

Korak 4 ni pretirana previdnost — sistem pritiska gumbe v pravi evidenci delovnega časa,
napake se odkrijejo šele, ko so že vpisane.

---

## 7. Nadzor — dodatek k 001 §7

`HEALTHCHECK_PING_URL` iz 001 se po uvedbi schedulerja pošilja **ob vsakem tiku** (30 s),
ne več na svojem ločenem 60-sekundnem intervalu (research.md §8, "Integracijska
podrobnost"). Nastavi obdobje pri zunanji storitvi na nekaj minut in strpnost na 10 minut.

Dodatno spremljaj:

| Kaj | Kje |
|---|---|
| prostor na disku (posnetki zaslona rastejo hitreje kot JSON dnevniki) | `GET /health` → `diskFreeBytes` |
| akcije, ki so odpovedale ali zamudile | `GET /health` → `failedActionsLast24h` / `missedActionsLast24h` |
| potek seje(-j) | obvestilo 7, 3 in 1 dan prej (FR-063) |
| rast pomnilnika API vsebnika | `docker stats` — stalna rast pomeni, da brskalniški konteksti niso zaprti (research.md §2) |

---

## 8. Če kaj ne dela

| Simptom | Verjeten vzrok |
|---|---|
| Klik "deluje", a naslednji dan ni zapisa pri delodajalcu | Preveri `verified` v odgovoru — `true` samo, če je ponovno branje potrdilo spremembo; sam klik brez verifikacije ni uspeh (`docs/legacy-engine.md` §4.5) |
| Akcija se izvede, a ob nepravem času | `daysOfWeek` ni pretvorjen iz starega `Date.getDay()` v ISO (data-model.md, migracijsko opozorilo) |
| "Target closed" v dnevniku Puppeteerja | `shm_size: 1gb` manjka na storitvi `api` (research.md §2, §14) |
| Zombi Chromium procesi, pomnilnik raste | `init: true` manjka, ali kontekst ni zaprt v `finally` |
| Isto obvestilo o zamudi pride vsak dan brez razloga | Diagnostika ne loči poteklo sejo od nedosegljive strani — preveri `Diagnostics.reason` (FR-022) |
| `SCHEDULER_TICK_SECONDS` ipd. v `.env`, a ni učinka | `platform/config/env.ts` jih (še) ne validira — glej research.md §14, prva naloga Foundational faze |
| Dvojni zapis pri delodajalcu | Manjka unikatni indeks `(localDate, profileId, actionName)`, ali se sestavljanje načrta ne izvaja z `upsert` |
| Akcija po polnoči vseeno poskuša klikniti za včeraj | FR-045 ni implementiran — tik ne preverja `localDate < today` pred obravnavo zapadlih |
