# CleverDash

Osebni dashboard z zavihki. Funkcionalnost **001 — ogrodje aplikacije in dashboard** je
implementirana: prijava, vreme + animirana radarska slika ARSO, meni z zavihki, nastavljive
ploščice, potisna obvestila. Podrobna specifikacija, načrt in naloge so v
[`specs/001-app-shell-dashboard/`](specs/001-app-shell-dashboard/).

Funkcionalnost **002 — Beleženje časa** je implementirana: prenova `belezenje_casa` z
ročnim in samodejnim beleženjem prihoda/odhoda, koledarjem (prazniki, dopusti, izredni
delovni dnevi), opozarjanjem, ponovnimi poskusi z eksponentnim zamikom, zgodovino in API-jem
za n8n (API ključi, webhooki). Podrobna specifikacija, načrt in naloge so v
[`specs/002-time-tracking/`](specs/002-time-tracking/), rezultati preverjanja v
[`docs/acceptance-002.md`](docs/acceptance-002.md).

Funkcionalnost **003 — Kamere** je implementirana: mreža živih predogledov (javni spletni
viri — ipcamlive, YouTube, istrastream, ARSO webcam), celozaslonski prikaz z živim tokom, in
zaslon za urejanje, ki omogoča dodajanje, urejanje in brisanje kamer — vključno s kamerami,
ki so vdelava tuje strani — brez posega v kodo. Podrobna specifikacija, načrt in naloge so v
[`specs/003-cameras/`](specs/003-cameras/), rezultati preverjanja v
[`docs/acceptance-003.md`](docs/acceptance-003.md).

Funkcionalnost **004 — Prijava prek Keycloaka in podatki po uporabniku** je implementirana:
prijava z e-pošto/geslom je v celoti nadomeščena s prijavo prek organizacijskega Keycloaka
(backend-for-frontend, OIDC + PKCE); postavitev nadzorne plošče, zavihki, tema, kamere in
zgodovina beleženja časa so zdaj zasebni vsakemu uporabniku, admin/navaden uporabnik pa
določajo Keycloakove vloge, ne ročno urejanje v CleverDashu. Podrobna specifikacija, načrt in
naloge so v [`specs/004-keycloak-sso-multiuser/`](specs/004-keycloak-sso-multiuser/).

Funkcionalnost **005 — Osebni profil, vtičniki in konfigurabilni meni** je implementirana:
vsak uporabnik si v profilu sam definira poljubno mnogo lastnih ploščic ("vtičnikov" —
povezava, vdelana stran, zunanja slika ali podatek iz JSON vira), prepiše naslove zunanjih
virov (`.env` ostane sistemski privzetek), ter vklopi, izklopi in prerazporedi zavihke v
meniju. Meni poleg tega pokaže, kateri vir se uporablja za beleženje časa in v kakšnem
stanju je seja. Ob tem so bile odpravljene tri napake ogrodja, zaradi katerih meni sploh ni
bil viden, ikone so bile prazne in temna tema ni delovala. Podrobnosti v
[`specs/005-profile-plugins/`](specs/005-profile-plugins/), rezultati preverjanja v
[`docs/acceptance-005.md`](docs/acceptance-005.md).

Funkcionalnost **006 — Evidenca delovnega časa** je implementirana: samostojen zavihek, ki iz
izbranega meseca, delovnega časa in označenih dni odsotnosti (dopust, bolniška, praznik)
sestavi mesečno evidenco v obliki `.xlsx` po predlogi delodajalca. Gre za prenos samostojne
aplikacije `Kaja_EDC` v modul CleverDasha; delovni čas in ime se shranita kot privzetek, da
je naslednji mesec vnos zgolj potrditev. Pogodba je v
[`specs/006-timesheet/contracts/openapi.yaml`](specs/006-timesheet/contracts/openapi.yaml).

Funkcionalnost **007 — Beležke** je implementirana: privzet zavihek za pisanje osebnih
beležk (naslov, vsebina, oznake, pripenjanje, iskanje po naslovu in vsebini) s polnimi CRUD
operacijami tudi prek API-ja (`notes:read`, `notes:write`). Beležko je mogoče **narekovati**
— prepoznava govora teče v brskalniku in besedilo piše naravnost v vsebino — ali **posneti**
kot zvok, ki se shrani k beležki in ga je mogoče predvajati nazaj. Prepis posnetka na
strežniku (Whisper ali združljiva storitev) je neobvezen in zaklenjen dvakrat: potrebna sta
ključ v okolju (`NOTES_TRANSCRIPTION_URL`, `NOTES_TRANSCRIPTION_API_KEY`) **in** izrecno
stikalo v profilu, ki je privzeto izklopljeno — sam ključ ne pomeni, da posnetki zapustijo
strežnik. Pogodba je v
[`specs/007-notes/contracts/openapi.yaml`](specs/007-notes/contracts/openapi.yaml).

Funkcionalnost **009 — Deljenje datotek** je implementirana: prijavljen uporabnik naloži
datoteko do **500 MB** in dobi povezavo ter geslo, ki ju pošlje prejemniku. Prejemnik **nima
računa in ga ne potrebuje** — datoteko prevzame na javni strani `/d/<žeton>`, potem ko vpiše
geslo. Brez enega od obojega prenosa ni; sama povezava ne odpre ničesar. Povezava ima rok
(1/7/30 dni ali brez) in jo je mogoče kadar koli takoj preklicati, novo geslo pa izda tudi
nov naslov, tako da stara povezava umre v celoti.

Trije podatki ločijo ta modul od ostalih. **Vsebina ni v bazi**, ampak na trajnem nosilcu
`shared-files` in teče na disk sproti — 500 MB nikoli ne gre skozi pomnilnik strežnika.
**Del vmesnika je javen** (prvi tak v aplikaciji), zato je pod njim dušenje ugibanja gesla po
povezavi in po izvornem naslovu, geslo pa je shranjeno kot nepovraten `scrypt` povzetek in
prikazano natanko enkrat. **Zavihek je privzeto izklopljen** — modul je stvar izbire in se
pojavi šele, ko si ga uporabnik vklopi v nastavitvah. Pogodba je v
[`specs/009-file-sharing/contracts/openapi.yaml`](specs/009-file-sharing/contracts/openapi.yaml),
uporaba iz n8n pa v [`docs/file-sharing-automation.md`](docs/file-sharing-automation.md).

Poleg naštetih funkcionalnosti je na nadzorni plošči vgrajena ploščica **Pot**: prikaže obe
smeri — pot v službo in pot domov — vsako z vdelanim zemljevidom, **časom poti in zamudo
zaradi prometa**; zgoraj je tista, ki ustreza času dneva (do 12:00 v službo, pozneje domov),
klik pa odpre zemljevid povečano. Uporabnik nastavi samo dva kraja (doma in služba, s
koordinatama ali naslovom); obe smeri, oba zemljevida in oba časa se izpeljejo iz njiju.

Čas poti je iz Google Routes API (`TRAFFIC_AWARE`), pridobljen izključno prek strežniškega
predpomnilnika ([`GET /dashboard/commute`](specs/001-app-shell-dashboard/contracts/openapi.yaml),
privzeto 300 s — člen VIII, vsaka osvežitev je plačljiva zahteva); ključ ostane na strežniku
(člen IV). Brez ključa ploščica deluje naprej: zemljevida sta tam, čas poti pa pove, zakaj ga
ni. Naslov vdelanega zemljevida sestavi strežnik
([`apps/api/src/domain/map-embed.ts`](apps/api/src/domain/map-embed.ts)) — navadne povezave do
poti Google v tujem okvirju ne dovoli. Kraja sta v nastavitvah (`Settings.commute`), ključi v
okolju ([`docs/env-reference.md`](docs/env-reference.md) §2), meja med smerema pa je 12:00 po
`Europe/Ljubljana` — enaka kot razvrstitev kamer po času dneva v 003.

### Opravila (010)

Seznami opravil z odkljukavanjem, **deljeni med prijavljenimi uporabniki**. Zavihek ima
vodoravno vrstico seznamov in pod njo opravila izbranega; vnos je eno polje, kjer Enter doda
in fokus ostane, da je mogoče nasuti deset stvari brez enega samega klika. Odkljukano se
prečrta in pade pod črto, gumb počisti opravljena. Ploščica na nadzorni plošči kaže nazadnje
spremenjen seznam (ali pripetega) in njeni checkboxi delujejo — mleka ni treba odkljukati na
drugem zaslonu.

To je **prvi zapis v CleverDashu, ki ga vidi več kot en uporabnik**. Lastnik seznam deli z
osebami, ki so se že vsaj enkrat prijavile, in vsaki določi eno od treh stopenj: *ogled*,
*odkljukavanje* ali *urejanje*. Brisanje seznama, preimenovanje, zaklep in deljenje ostanejo
lastnikova. Zaklenjen seznam soudeleženci vidijo, a ne morejo spremeniti ničesar — niti
odkljukati.

Dve odločitvi, ki ju je vredno poznati, preden se kdo loti sprememb:

- **Vse je v enem dokumentu.** Opravila in soudeleženci so vdelani v zapis seznama, ker ta
  namestitev poganja samostojen MongoDB brez replika nabora — transakcij nad več dokumenti ni
  in prerazvrstitve v ločeni zbirki ne bi bilo mogoče izvesti atomarno
  ([`research.md` §1](specs/010-todos/research.md)).
- **Nobene poti ni, ki bi dokument prebrala, spremenila in shranila.** Vsaka sprememba je en
  atomaren Mongo operator z `arrayFilters`, katerega filter ponovi tudi pogoj dostopa. Zato
  dva človeka, ki hkrati odkljukata dve različni stvari, oba uspeta — kar je pokrito s testom
  ([`tests/integration/todos-concurrency.spec.ts`](apps/api/tests/integration/todos-concurrency.spec.ts)).

Zavrnitve so **tri različne in vsaka ima svoj status**: tujec dobi 404 (obstoja tujega zapisa
ne razkrijemo), soudeleženec s premajhno stopnjo 403 (seznam vidi, pravice nima), zaklenjen
seznam pa 409 — ker zaklep ni lastnost osebe, ampak stanje, ki ga lastnik odklene z enim
klikom, in vmesnik se mora na to odzvati drugače.

Deljenje **ne pošlje potisnega obvestila**: v tej namestitvi ta pot ne deluje (privzeti nabor
kanalov je samo `system`, odjemalec ob registraciji nabora ne pošlje, na spletu pa se naprava
sploh ne registrira). Namesto tega dobi novo deljen seznam oznako na čipu in značko ob zavihku
v meniju, dokler ga prejemnik prvič ne odpre. Podrobno v
[`plan.md` → Complexity Tracking](specs/010-todos/plan.md).

Izbirnik oseb je nov skupni `GET /users` v `platform/users/` (ne v modulu — izbira osebe ni
pojem opravil). E-pošta se v njem prikaže **zamaskirana** (`j…k@agenda.si`): soimenjaka loči
enako dobro kot cela, ne izroči pa vsakemu prijavljenemu uporabniku seznama naslovov cele
namestitve.

---

**Stack:** Ionic 8 + Angular 20 (web in Android prek Capacitorja), Node.js 22 + Express 5 +
Mongoose 8, MongoDB 7, Puppeteer (headless Chromium za 002), Docker Compose + Caddy
(samodejni TLS).

**Naslovi:** aplikacija na `https://app.si`, API na `https://app.si/api/v1/...` — isti
izvor, brez CORS-a (člen II ustave). Caddy usmeri `/api/*` na backend, vse ostalo na SPA.

---

## Hiter zagon (Docker)

```bash
# Datoteka z okoljem NI v repozitoriju (člen IV): živi ob njem, kot sestra korena.
mkdir -p ../envs && cp .env.example ../envs/.env.cleverdashNew
# izpolni ../envs/.env.cleverdashNew — obvezne vrednosti so v
# specs/001-app-shell-dashboard/quickstart.md §3; prijava zahteva tudi obstoječ
# organizacijski Keycloak (KEYCLOAK_ISSUER_URL/CLIENT_ID/CLIENT_SECRET,
# SESSION_COOKIE_SECRET) — glej specs/004-keycloak-sso-multiuser/quickstart.md §3
./scripts/vps-compose.sh up -d --build
```

`vps-compose.sh` je tanka ovojnica okoli `docker compose`: isto datoteko z okoljem poda
compose-u na oba načina, ki ju potrebuje (`--env-file` za vrednosti v sami compose datoteki,
`env_file:` za procesa v vsebnikih), zato je ne kliči neposredno. Drugo pot do datoteke
nastaviš z `CLEVERDASH_ENV_FILE=/pot/do/.env`. Vsi nadaljnji ukazi gredo skozi isto
ovojnico — `./scripts/vps-compose.sh logs -f api`, `... down`.

Iz čiste kopije do delujočega sistema: pod 3 minute, samo Docker in izpolnjena datoteka z
okoljem (FR-040, SC-007 — izmerjeno v [`docs/acceptance-001.md`](docs/acceptance-001.md)).
Podroben postopek, kontrolni seznam po funkcionalnih zahtevah in reševanje težav je v
[`specs/001-app-shell-dashboard/quickstart.md`](specs/001-app-shell-dashboard/quickstart.md).

### Za skupnim Caddyjem (produkcijski VPS)

Na produkcijskem VPS-u vrata 80/443 že drži skupni Caddy (`/opt/caddy`), ki streže tudi
`kc.planego.eu` in `planego-*`. Ta sklad zato **ne objavlja vrat**, ampak se s storitvijo
`caddy` pridruži zunanjemu omrežju `web`, kjer ga skupni Caddy doseže po imenu vsebnika.
V njegov Caddyfile gre en sam blok:

```caddyfile
cleverdash.zuusi.com {
	encode zstd gzip
	reverse_proxy cleverdash-caddy-1:80
}
```

Nato `docker exec <ime-skupnega-caddyja> caddy reload --config /etc/caddy/Caddyfile`.
TLS naredi skupni Caddy; ta sklad posluša samo na `:80` znotraj omrežja, ker je
`CADDY_SITE_ADDRESS` prazen. Notranji Caddy pravi naslov obiskovalca prepusti naprej
nedotaknjen (`header_up X-Forwarded-For` v [`infra/Caddyfile`](infra/Caddyfile)) — brez
tega bi ga zavrgel in `trust proxy` v API-ju bi vsem pripisal isti IP.

Če postavljaš brez proxyja pred sabo, dodaj `-f infra/docker-compose.standalone.yml`
(vrne vrata 80/443) in nastavi `CADDY_SITE_ADDRESS` na isto vrednost kot `PUBLIC_BASE_URL`.

## Razvojni način

```bash
npm install
docker compose -f infra/docker-compose.dev.yml up -d   # samo MongoDB
npm run dev:api     # http://localhost:3000
npm run dev:web     # dev-server s proxyjem /api → :3000 (enak izvor kot v produkciji)
```

Pred vsakim commitom:

```bash
npm run typecheck
npm run lint
npm test             # apps/api — Vitest proti v-pomnilniški MongoDB
npm run build:web    # preveri, da se Angular build ustavi na 0 napakah
```

`npm test` ob prvem zagonu prenese binarko MongoDB (~600 MB, enkratno, nato predpomnjeno).

## Struktura

```
apps/api/         Express + Mongoose; src/modules/<zavihek>, src/platform/ (skupno),
                   src/domain/ (čiste funkcije, člen IX)
apps/web/         Ionic + Angular; src/app/features/<zavihek>, core/, shared/
packages/contracts/  Tipi, generirani iz specs/*/contracts/openapi.yaml (001, 002, 003, 005, 006;
                   004 svoje pogodbe nima — spremenil je poti /auth/*, ki so last 001)
infra/            docker-compose.yml, Caddyfile, oba Dockerfile-a
templates/tab-module/  Predloga za nov zavihek — glej docs/adding-a-tab.md
```

Dodajanje zavihka je dodajanje ene mape in enega vnosa v register (člen I) —
[`docs/adding-a-tab.md`](docs/adding-a-tab.md) opiše postopek, meja med moduli pa je
uveljavljena z lint pravilom (`eslint.config.js`), ne le z dogovorom.

## Skrivnosti

V repozitoriju je samo `.env.example` s praznimi vrednostmi (člen IV ustave). Datoteke s
ključi (npr. Firebase service account za potisna obvestila) živijo izven repozitorija in se
montirajo prek `FCM_KEY_FILE` v `.env` — glej komentarje v `.env.example` in
[`docs/SECURITY-FIRST.md`](docs/SECURITY-FIRST.md) za razkrite skrivnosti iz starega
sistema, ki jih je treba zavrteti.

---

## Naslednje funkcionalnosti

Trenutno ni naslednje funkcionalnosti v pripravi (zadnja je 005). Ko bo, bo njeno vhodno
gradivo čakalo v
`nacrt/NNN-ime/`, dokler ne bo prek `/speckit-specify` prestavljeno v `specs/NNN-ime/` (glej
spodaj, zakaj vhodno gradivo ne živi neposredno v `specs/`).

### Zakaj vhodno gradivo ni v `specs/`

Mapi `specs/` in `.specify/` **si lasti Spec Kit**: `/speckit-specify` sam ustvari
`specs/NNN-ime/spec.md`, številko pa določi tako, da pregleda obstoječe mape v `specs/` in
prišteje eno. Če bi vhodno gradivo za 002 in 003 ležalo v `specs/002-…`, `specs/003-…`, bi
Spec Kit pri naslednjem `/speckit-specify` ustvaril `specs/004-…` in dobili bi dve
vzporedni številčenji. Zato je vhodno gradivo v `nacrt/`, ustava pa v
`.specify/memory/constitution.md` (zapisana prek `/speckit-constitution`, vir je bil
`nacrt/constitution.md`).

| Mapa | Kaj je |
|---|---|
| `nacrt/001-app-shell-dashboard/spec.md` | Vhodno gradivo za 001 — funkcionalnost je implementirana |
| `nacrt/002-time-tracking/` | Vhodno gradivo za 002 — prenova `belezenje_casa`; funkcionalnost je implementirana |
| `nacrt/003-cameras/spec.md` | Vhodno gradivo za 003 — zavihek kamer; funkcionalnost je implementirana |
| `nacrt/005-profile-plugins/spec.md` | Vhodno gradivo za 005 — osebni profil in vtičniki; funkcionalnost je implementirana |
| `docs/legacy-engine.md` | Obratno inženirstvo starega engine-a beleženja časa + napake, ki jih 002 ne sme ponoviti |
| `docs/env-reference.md` | Vse okoljske spremenljivke: kaj ostane, kaj gre v bazo, kaj je novo |
| `docs/SECURITY-FIRST.md` | Razkrite skrivnosti iz starega sistema, ki jih je treba zavrteti |

## Sorodne mape

| Mapa | Kaj je |
|---|---|
| `privat\cleverdash` | **ta projekt** |
| `privat\cleverdash-old` | starejši CleverDash (Angular 13 + Firebase); vir za zaslon kamer (003) |
| `privat\cleverdash2` | starejši poskus iz novembra 2025 |
| `privat\belezenje_casa` | aplikacija, ki jo zavihek "Beleženje časa" (002) nadomešča |
