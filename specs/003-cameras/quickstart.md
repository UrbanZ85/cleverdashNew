# 003 — Zagon in preverjanje (Phase 1)

Navodilo za zagon in **dokazovanje**, da funkcionalnost deluje. Ni navodilo za izvedbo —
koda in naloge pridejo v `tasks.md` po `/speckit-tasks`.

Bere se skupaj s [plan.md](./plan.md), [research.md](./research.md) in
[contracts/openapi.yaml](./contracts/openapi.yaml). Predpostavlja dokončano in postavljeno
001 ([specs/001-app-shell-dashboard/quickstart.md](../001-app-shell-dashboard/quickstart.md))
— ta dokument ne ponavlja splošne postavitve (Caddy, TLS, Mongo, Docker Compose), ker 003 v
njej **ne spremeni ničesar** (glej `plan.md`, Project Structure — brez posegov v
`infra/docker-compose.yml`/`api.Dockerfile`, v nasprotju s 002).

---

## 1. Predpogoji dodatno k 001

Brez novih sistemskih odvisnosti (ni Puppeteerja, ni Chromiuma) — samo dva nova npm paketa
na frontendu (research.md §15): `hls.js`, `@capacitor/network`.

---

## 2. Kar je treba dodatno izpolniti v `.env`

```
CAMERA_ALLOWED_EMBED_HOSTS=youtube.com,ipcamlive.com,istrastream.com,arso.gov.si
CAMERA_UNREACHABLE_THRESHOLD=3
CAMERA_DEGRADED_REFRESH_MULTIPLIER=4
CAMERA_DEFAULT_REFRESH_SECONDS=30
CREDENTIALS_ENCRYPTION_KEY=<32 bajtov, base64 — npr. `openssl rand -base64 32`>
```

Vseh pet gre skozi `platform/config/env.ts` (Zod), enako kot vsak obstoječi razdelek —
manjkajoča vrednost NE sme tiho pripeljati do `undefined` (research.md §13, isto pravilo
kot 002 §14). `CREDENTIALS_ENCRYPTION_KEY` je obvezen tudi, če (še) nobena kamera ne
zahteva poverilnic (research.md §14).

**Preveri pred prvim commitom:** enako kot 001/002 — `git status` brez `.env`, `gitleaks`
čist. Poverilnice kamer (kadar jih vir zahteva) živijo šifrirane v `cameras.credentialsEncrypted`,
nikoli v `.env` ali gitu (glej data-model.md, člen IV ustave).

---

## 3. Preverjanje po uporabniških zgodbah

Vsaka vrstica je izvedljiva in ustreza merilu uspeha iz [spec.md](./spec.md). Priporočen
vrstni red je isti kot prioriteta zgodb.

### 3.1 Mreža predogledov (P1)

| Korak | Pričakovano | Pokriva |
|---|---|---|
| Vstavi 3+ kamer neposredno v `cameras` (brez UI-ja), različnih vrst | `GET /cameras` vrne vse | FR-001, FR-002 |
| Odpri zavihek kamer | Mreža predogledov, čas zajema pri vsaki | FR-010, FR-011, SC-001 |
| Pusti zavihek odprt čez interval osveževanja ene kamere | Predogled se osveži brez ponovnega naložitve strani | FR-013 |
| Preklopi zaslon v ozadje (druga aplikacija) | Osveževanje se ustavi | FR-013 |

### 3.2 Celozaslonski prikaz (P2)

| Korak | Pričakovano | Pokriva |
|---|---|---|
| V mreži izberi kamero z živim tokom (`iframe`/`snapshot+iframe`) | Odpre se celozaslonsko, živi tok se predvaja namesto posnetka | FR-012 |
| Vrni se v mrežo | Živi tok se ustavi | FR-012, FR-013 |

### 3.3 Dodajanje kamere (P3)

| Korak | Pričakovano | Pokriva |
|---|---|---|
| Na zaslonu za urejanje dodaj kamero vrste `iframe` z naslovom na `youtube.com` | `201`, kamera takoj v mreži | FR-031, SC-002 |
| Dodaj kamero z naslovom, čigar gostitelj ni na dovoljenem seznamu | `422` z razlogom, kamera se NE ustvari | FR-034 |
| `POST /cameras/embed-hosts` za ta gostitelj, nato ponovi dodajanje | `201`, kamera se ustvari | research.md §6 |
| `GET /cameras/arso-webcams?location=Ljubljana` (na dan, ko ARSO vrača `webcam`) | Seznam kandidatov; izbira enega samodejno izpolni `previewUrl`, `type: snapshot`, `sourceTemplate: arso-webcam` | FR-037 |
| `GET /cameras/arso-webcams?location=<lokacija brez webcama>` | Prazen seznam, ne napaka | Edge Cases |
| Spremeni vrstni red prek `PUT /cameras/order` | Mreža odraža nov vrstni red brez ponovnega nalaganja | FR-035, FR-014 |

### 3.4 Urejanje in brisanje (P4)

| Korak | Pričakovano | Pokriva |
|---|---|---|
| `PUT /cameras/{id}` spremeni ime in `refreshIntervalSeconds` | `200`, sprememba v mreži brez ponovnega nalaganja | FR-032, SC-003 |
| `PUT /cameras/{id}` z neveljavnim naslovom | `422`, prejšnje vrednosti nespremenjene | FR-034 |
| `DELETE /cameras/{id}` (odjemalec je predhodno pridobil potrditev uporabnika) | `204`, kamera izgine iz mreže in urejevalnega seznama | FR-033, SC-005 |
| Kamero, ki je odprta celozaslonsko na drugi napravi, izbriši | Prikaz na drugi napravi se razumljivo zapre ob naslednjem osveževanju | Edge Cases |

### 3.5 Napaka vira (P5)

| Korak | Pričakovano | Pokriva |
|---|---|---|
| Nastavi `previewUrl` na naslov, ki vrača `500`/timeout | Ploščica prikaže zadnji uspešni posnetek zatemnjen, z oznako starosti | FR-011, SC-004 |
| Pusti vir odpovedovati `CAMERA_UNREACHABLE_THRESHOLD`-krat zapored | `GET /cameras/{id}/health` vrne `state: unreachable`; osveževanje se upočasni za `CAMERA_DEGRADED_REFRESH_MULTIPLIER` | FR-011 |
| Kamera vrste `iframe` brez `previewUrl` | `GET /cameras/{id}/health` vrne `state: not-applicable` | research.md §3, omejitev |

### 3.6 Razvrstitev po času dneva (P6)

| Korak | Pričakovano | Pokriva |
|---|---|---|
| Kamera A: `timeOfDay: morning`, kamera B: `timeOfDay: afternoon`, odpri zavihek pred 12:00 (`Europe/Ljubljana`) | A pred B v mreži | FR-004, SC-006 |
| Isti nabor, odpri po 12:00 | B pred A | FR-004, SC-006 |

### 3.7 Mobilno omrežje (P7)

| Korak | Pričakovano | Pokriva |
|---|---|---|
| Simuliraj mobilno omrežje (`@capacitor/network`/Network Information API) | Predogledi se osvežujejo redkeje kot na Wi-Fi | FR-010, SC-007 |
| Odpri kamero z živim tokom na mobilnem omrežju | Tok se ne zažene samodejno; zažene se šele na potrditev | Story 7 |
| Izklopi "zmanjšaj porabo podatkov" v Nastavitvah (`cameraDataSaverEnabled: false`) | Zavihek se na mobilnem omrežju obnaša enako kot na Wi-Fi | Story 7, Assumptions |

---

## 4. Enotski testi domenske logike (Kakovostno vrato 2)

**Opomba k štirim poimenskim primerom iz ustave** (prehod na poletni/zimski čas, praznik na
delovni dan, dopust preko meje meseca, neuspel klik s ponovitvijo): **noben od teh štirih
nima predmeta v 003** — funkcionalnost ne razporeja po koledarskih dnevih (ni scheduler) in
ne klika ničesar na tuji strani (samo bere zunanje vire). To je izrecno zapisano tu, kot
zahteva amandma h Kakovostnemu vratu 2 (glej `plan.md`, Constitution Check). Nadomeščajo jih
spodnji primeri, specifični za domensko logiko kamer — vsi brez omrežja in brez baze (isti
duh kot člen IX, čeprav ta člen dobesedno govori o 002-ovem `ClockPortal`u):

1. `sortCamerasByTimeOfDay`: dopoldanska kamera pride pred popoldansko pred 12:00
2. `sortCamerasByTimeOfDay`: vrstni red se obrne po 12:00
3. `sortCamerasByTimeOfDay`: kamera z `always` ostane na svojem relativnem mestu v obeh primerih
4. validacija naslova: zavrne neveljaven URL (ni parsable kot URL)
5. validacija naslova: zavrne gostitelja, ki ni na efektivnem seznamu dovoljenih (unija
   osnovnega iz okolja + `cameraEmbedAllowlist`), za `iframe`/`snapshot+iframe`
6. validacija naslova: sprejme `http://` samo, če je izpolnjen vsaj eden pogoj za obvezen
   proxy (poverilnice ali lokalni naslov); sicer zavrne
7. `resolveFreshness` + `consecutiveFailures` iz `ExternalCache`: prag `CAMERA_UNREACHABLE_
   THRESHOLD` pravilno loči "staro" od "nedosegljivo"
8. izpeljava zdravja: kamera brez `previewUrl` (samostojen `iframe`) vrne `not-applicable`,
   ne `unknown` in ne napako
9. `PUT /cameras/order`: podan seznam ID-jev znotraj skupine se preslika v `order: 0..n-1` v
   danem vrstnem redu, kamere zunaj seznama (druga skupina) se ne spremenijo
10. efektivni seznam dovoljenih gostiteljev: DB dodatek razširi osnovni seznam; brisanje DB
    vnosa ne vpliva na osnovni seznam (ni ga mogoče odstraniti prek API-ja, research.md §6)

---

## 5. Razvojni način

```bash
# iz 001, nespremenjeno
docker compose -f infra/docker-compose.dev.yml up -d   # samo Mongo
npm run dev:api
npm run dev:web
```

Brez posebnega razvojnega stikala za 003 — ni pravega zunanjega sistema, ki bi ga bilo
treba varovati z `DRY_RUN` (v nasprotju s 002); zunanji viri kamer so javni spletni viri, ki
jih je varno klicati tudi iz razvojnega okolja.

Enako kot 001/002, mora biti čisto pred vsakim commitom:

```bash
npm run typecheck
npm run lint
npm run test
```

---

## 6. Prvi zagon na VPS — dodatek k 001 §6

Po tem, ko sta 001 in (po potrebi) 002 postavljeni:

1. Odpri zaslon za urejanje kamer in dodaj vsaj eno kamero iz nabora, znanega iz starega
   CleverDasha (spec.md, Clarifications) — priporočeno najprej `snapshot+iframe` (ipcamlive
   Planina), ker preveri tako predpomnjen posnetek kot vdelavo predvajalnika.
2. Preveri `GET /cameras/{id}/snapshot` neposredno (`curl`), preden zanašaš se na UI —
   mora vrniti `200` in `image/jpeg`.
3. Dodaj preostale znane kamere (YouTube "Goli"/"Škitača", istrastream Sveta Marina).
4. Po potrebi preveri ARSO webcam predlogo za lastno lokacijo
   (`GET /cameras/arso-webcams?location=...`) — če je seznam prazen, ARSO za to lokacijo
   preprosto ne ponuja slike (ni napaka).

---

## 7. Nadzor — dodatek k 001 §7

Kamere ne potrebujejo lastnega vnosa v zunanji dead man's switch (001-ov `/health` ostaja
nespremenjen — 003 ga ne razširi, v nasprotju s 002). Spremljaj:

| Kaj | Kje |
|---|---|
| Nedosegljive kamere | `GET /cameras` → `health.state: unreachable` na posamezni kameri |
| Rast `ExternalCache` kolekcije | nova vrsta ključev `camera:*:preview` poleg že obstoječih `radar`/`weather:*` — brez TTL indeksa (namerno, glej `platform/cache/model.ts`), zato občasno preveri velikost kolekcije |

---

## 8. Če kaj ne dela

| Simptom | Verjeten vzrok |
|---|---|
| Nova kamera se v obrazcu zavrne, čeprav je naslov videti pravilen | Gostitelj ni na `CAMERA_ALLOWED_EMBED_HOSTS` niti v `cameraEmbedAllowlist` — glej research.md §6, `POST /cameras/embed-hosts` |
| `<iframe>` je prazen, brez napake v omrežju | Ponudnik pošilja `X-Frame-Options`/CSP `frame-ancestors`, ki prepoveduje vdelavo — preveri z `curl -I` na naslov; to backend ne more zaznati vnaprej (research.md §5) |
| Posnetek kamere je vedno "staro", nikoli "v redu" | `refreshIntervalSeconds` je krajši od dejanske hitrosti vira, ali vir dejansko ne odgovarja — preveri `GET /cameras/{id}/health` → `lastError` |
| ARSO webcam seznam je vedno prazen za znano lokacijo | Preveri neposredno `platform/arso/weather.client.ts` odgovor — morda je ARSO za ta dan/lokacijo dejansko brez slike (spremenljivo, ne hrošč) |
| `mjpeg`/`hls` kamera prek proxyja se ne predvaja na več napravah hkrati brez podvojene obremenitve vira | Pričakovano — `research.md` §4 to izrecno pusti kot poenostavitev, ni implementirano deljeno multipleksiranje |
| Sprememba vrstnega reda v UI-ju se ne odrazi v bazi | `PUT /cameras/order` mora dobiti **poln** seznam ID-jev znotraj ene skupine — delen seznam ne prepiše samo podanih |
