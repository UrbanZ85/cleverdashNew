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

Isti zavihek zna od dopolnitve **009b** tudi **obrnjeno smer — sprejem datotek**. Uporabnik
ustvari *povezavo za oddajo* in dobi naslov ter kodo; kdor ju prejme, na javni strani
`/u/<žeton>` odda datoteko, prav tako **brez računa**. Prejeta datoteka je od tega trenutka
navadna uporabnikova datoteka na istem seznamu — z oznako, da je prejeta, in z navedbo, kdo jo je
oddal — brez roka veljavnosti in **brez povezave za prevzem, dokler je uporabnik izrecno ne
izda**. Zaprtje ali izbris povezave prejetih datotek ne odnese.

Ta pot je edina v aplikaciji, po kateri nekdo brez računa **piše na disk**, zato ima pod sabo
štiri meje, ki se preverijo pri vsaki oddaji in vsako dvakrat (pred prenosom in med njim):
velikost ene datoteke, prostor te povezave (koliko datotek in koliko skupaj — izbere uporabnik ob
nastanku, navzgor pa ga omejuje nastavitev namestitve), kvota uporabnika ter stanje in rok
povezave. Napovedana velikost je zavezujoča: kdor napove megabajt in pošlje pol gigabajta, je
ustavljen med prenosom in za sabo ne pusti ničesar. Dovolilnica za oddajo **ni piškotek**, ampak
glava, ki jo mora odjemalec pripeti izrecno — tuja stran tako oddaje v imenu obiskovalca ne more
sprožiti. Vse to je zbrano v [`docs/SECURITY-FIRST.md`](docs/SECURITY-FIRST.md) §4c.

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

### Shranjeni linki (008)

Osebna knjižnica shranjenih strani — naslednica strani "Useful links" iz starega CleverDasha,
z istimi tremi podatki (ime, naslov, komentar), le da sta tu ime in komentar **neobvezna**.
Zapis nastane iz prilepljenega naslova in enega klika: shema ni potrebna (`primer.si/stran` se
shrani kot `https://primer.si/stran`), **ime strani pa prebere strežnik sam** iz `<title>`.
Zapise je mogoče razvrstiti v mape (ena raven, brez gnezdenja), jih znotraj mape prerazporediti
in po njih iskati po imenu, naslovu **in** komentarju — neobčutljivo na velike črke in šumnike,
zato `cas` najde "Beleženje časa". Ploščica na nadzorni plošči kaže šest nazadnje shranjenih.

Modul se namenoma razlikuje od **vtičnika vrste `link`** iz 005: ta je ploščica z nekaj vedno
vidnimi bližnjicami ("kam kliknem vsak dan"), 008 pa knjižnica, ki s časom raste ("kje je bila
že tista stran").

Tri odločitve, ki jih je vredno poznati, preden se kdo loti sprememb:

- **Shranjevanje ni odvisno od dosegljivosti strani.** Zapis se ustvari **pred** branjem
  metapodatkov in se ob neuspehu ne razveljavi (FR-004). Izid branja ni skrit v dnevnik, ampak
  je polje `metadataStatus` v odgovoru in značka v vmesniku (člen VII): `ok`, `failed`
  (poskusili in ni šlo) ali `skipped` — naslova **nismo obiskali**.
- **Kaj strežnik obišče in kaj ne.** Shranjeni naslov odpre BRSKALNIK, zato je
  `http://192.168.1.1` (usmerjevalnik v domačem omrežju) povsem legitimen zapis. Strežnik ga
  obišče samo zato, da prebere ime strani, in to stori le, če naslov prestane isto varovalo kot
  vtičniki ([`domain/outbound-url.ts`](apps/api/src/domain/outbound-url.ts)) — tudi ob vsaki
  preusmeritvi znova. Naslov, ki ga ne prestane, dobi `skipped`.
- **Favicon gre prek našega strežnika, s ključem po GOSTITELJU.** Dvajset shranjenih strani z
  `github.com` je en prenos na teden, ne dvajset; brskalnik tujega gostitelja ne kliče nikoli
  (člen VIII, SC-005). Manjkajoč favicon **ni napaka** — izriše se ikona.

Ročni vnos ima vedno prednost pred samodejnim: ime, ki ga vpiše uporabnik, se označi kot
`manual` in ga osveževanje ne prepiše, dokler tega izrecno ne zahteva ("prevzemi ime s
strani"). Ponovnega branja po nastanku zapisa ni brez uporabnikovega povoda, in rednega
preverjanja, ali je shranjena stran še dosegljiva, modul namenoma ne počne. Pogodba je v
[`specs/008-saved-links/contracts/openapi.yaml`](specs/008-saved-links/contracts/openapi.yaml),
obsega sta `saved-links:read` in `saved-links:write`.

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

### Meritve postaj — ARSO in Neverin (011)

Dvodnevna zgodovina ENE izbrane samodejne postaje v grafih: padavine po urah (stolpci, kot na
Bergfexu), temperatura, veter s sunki in smerjo, vlaga, zračni tlak, sončno obsevanje in višina
snežne odeje. Okno je 6, 24 ali 48 ur, vsote padavin pa so za 4/8/12/24/48 ur in so neodvisne od
izbranega okna — "koliko je padlo" je vprašanje glede na dogodek, ne glede na graf.

**Omrežji sta dve in postaj je lahko izbranih več.** `arso` so državne postaje (~106, samo
Slovenija), `neverin` je omrežje [neverin.hr](https://www.neverin.hr) (~1335 zasebnih in javnih
postaj v Sloveniji, na Hrvaškem, v BiH, Srbiji in Črni gori) — od tam pridejo postaje, ki jih
ARSO nima, na primer Sveta Marina v Istri. Izbereš jih v Nastavitve → Moduli → Meritve postaj
(največ osem) in med njimi na zavihku preklapljaš s čipi; PRVA je tista, ki jo kaže ploščica na
nadzorni plošči. Postaja se povsod navaja kot sklic `<ponudnik>:<oznaka>` (`arso:VRHNIKA`,
`neverin:sveta-marina`); gola oznaka brez predpone se še vedno bere kot ARSO, ker so take
vrednosti v obstoječih nastavitvah in v avtomatizaciji (člen III).

Ploščica na nadzorni plošči kaže urne padavine zadnjih 24 ur; klik odpre povečan prikaz z
vsotami po oknih in 48-urnim grafom, iz njega pa gumb na zavihek. Ploščica **"Vreme" je s tem
odstranjena** — ista meritev pride z merilne postaje, ki je bližja kot vremenska "lokacija";
endpoint `GET /dashboard/weather` ostaja in ga uporablja "Napoved" (člen III).

Nekaj stvari, ki jih je vredno poznati, preden se kdo loti sprememb:

- **Vir je HTML in to ni izbira.** ARSO ponuja XML samo za ZADNJO meritev postaje; dvodnevna
  zgodovina obstaja izključno kot HTML tabela (`observationAms_<oznaka>_history.html`) — enak
  naslov s `_history.xml` vrne 404 (preverjeno 9. 9. 2026). Tabela ima vsak stolpec dvakrat:
  skrito celico s SUROVO vrednostjo in vidno z zaokroženo. Beremo skrito, ker je graf iz
  zaokroženih vrednosti stopničast. Celice iščemo po imenu razreda, ne po zaporedju — stolpci
  se med postajami razlikujejo (Bežigrad ima tlak in sevanje, Vrhnika ne).
- **Oznaka postaje ni ime kraja.** Naslov uporablja `domain_meteosiId` brez zaključnega
  podčrtaja: postaja "Bilje Nova Gorica" je `NOVA-GOR_BILJE`, "Bohinjska Češnjica" pa
  `BOHIN-CES`. Zato se postaja izbere s seznama (`GET /meteo/stations`) in ne vpiše. Oznaka je
  omejena z vzorcem ([`domain/arso-station.ts`](apps/api/src/domain/arso-station.ts)), ker se iz
  nje sestavi naslov, ki ga strežnik obišče sam. Seznam postaj je pri tem **zlitje zapisanega
  imenika in živega vira**: `observationAms_si_latest.xml` ni imenik, ampak posnetek zadnjega
  objavnega cikla (9. 9. 2026 ob 08:00 UTC 106 postaj, ob 09:25 le 19), zato bi brez imenika
  seznam bil odvisen od trenutka klica.
- **`null` ni `0`.** Postaja brez barometra ima stolpec prisoten in prazen; "ni merilnika" ni
  isto kot "ni dežja". Polje `available` v odgovoru pove, katerih grafov odjemalec NE riše —
  prazna os brez črte je videti kot okvara (člen VII).
- **Pri Neverinu je bilo troje treba IZMERITI**, ker vir dokumentacije nima, in vsako od njih bi
  ob napačni domnevi dalo napako, ki je ni videti (vse preverjeno 9. 9. 2026): veter je pri viru
  v **m/s** in se pretvori v km/h (brez tega bi bil 3,6-krat prešibek); `precip` je vsota **v
  intervalu** in ne števec od začetka dneva (vsota 24-urne serije se ujema z njihovim
  `precip_acc_24h`); tlak **ni enotno reduciran na morsko gladino** (postaja na 2228 m pošilja
  782 hPa, druga na 1078 m pa 1017 hPa), zato gre v `pressureHpa` in nikoli v `pressureMslHpa`.
  Podrobnosti so v [`domain/neverin-parse.ts`](apps/api/src/modules/meteo/domain/neverin-parse.ts).
- **Neverin zahteva glavo `Origin`** z njihovo domeno, sicer odgovori `403 ORIGIN_BLOCKED`, in
  njihovi pogoji uporabe avtomatiziran dostop omejujejo — uporaba tega vira je zavestna odločitev
  lastnika namestitve. Izvor je zato nastavljiv (`NEVERIN_WEB_URL`) in ne zapisan v kodi. Ker vir
  ne pošilja `ETag` niti `Last-Modified`, pogojna zahteva ne deluje in vsaka osvežitev prenese
  celo telo; privzeti `NEVERIN_CACHE_SECONDS=600` je zato desetkrat daljši od njihovega
  `max-age=60` — en prenos na postajo na deset minut, ne glede na število uporabnikov (člen VIII).
- **Nov ponudnik je nova datoteka.** [`modules/meteo/providers/`](apps/api/src/modules/meteo/providers/)
  je vmesnik in ne veja `if`; ponudnik vrne OPIS prenosa, prenese pa router prek skupnega
  predpomnilnika, da pravila iz člena VIII ni mogoče obiti. Izpad enega ponudnika pri
  `GET /meteo/stations` ne izprazni seznama drugega — odgovor je `200`, prizadeti ponudnik pa
  ima `unavailable: true` (člen VII: vidno, ne tiho).

Ura je koledarska ura V CONI POSTAJE (člen V.4; cono pove vir — pri ARSO vedno
`Europe/Ljubljana`, pri Neverinu pri vsaki postaji posebej) in meritev ob polni uri pripada uri,
ki se je pravkar KONČALA, ker vir interval označuje z njegovim koncem. Ob prehodu na zimski čas sta
zato dve ločeni vedri z napisom "02" in ne eno z dvojno vsoto padavin.

Modul je prvi brez lastne kolekcije: meritve so ponudnikove (predpomnilnik, privzeto 600 s),
izbrane postaje pa so osebna nastavitev (`Settings.meteo.stations`). Zato en sam obseg `meteo:read` in noben mutacijski endpoint. Pogodba
je v [`specs/011-meteo-station/contracts/openapi.yaml`](specs/011-meteo-station/contracts/openapi.yaml),
odločitve v [`nacrt/011-meteo-station/spec.md`](nacrt/011-meteo-station/spec.md).

### Administrator dela v imenu drugega uporabnika (012)

Administrator (Keycloakova vloga `cleverdash-admin`) na dnu menija, pod svojim imenom, izbere
drugega uporabnika — in **cela aplikacija** se preklopi nanj: nadzorna plošča, nastavitve,
zavihki, kamere, beležke, beleženje časa, evidenca, opravila, linki, datoteke. Vsaka sprememba
se shrani izbranemu uporabniku. Skrbnik tako lahko nekomu uredi ploščice ali zabeleži manjkajoč
prihod, ne da bi potreboval njegovo geslo.

Preklop je **ena glava** (`X-Acting-User`), ki jo strežnik obravnava na **enem mestu** pred
vsemi moduli ([`apps/api/src/platform/auth/acting-user.ts`](apps/api/src/platform/auth/acting-user.ts)):
`req.auth` (v čigavem imenu teče zahteva) se zamenja, `req.actor` (kdo jo je poslal) ostane.
Modulom ni bilo treba spremeniti ničesar in nov zavihek preklop dobi zastonj — dokler filtrira
po `req.auth.subjectId`, kar mu izolacija po 004 tako ali tako nalaga. Devetdeset neobveznih
parametrov `?userId=` bi bilo devetdeset priložnosti, da kdo pozabi preveriti dovolilnico.

Adminu ostanejo lastne samo **seje, naprave za obvestila in API ključi** — te pripadajo človeku
za tipkovnico, ne podatkom, ki jih gleda. Dokler je ime prevzeto, je nad vsebino nezaprtljiv
opozorilni pas z izhodom iz stanja, vsaka mutacija pa gre v dnevnik kot `auth.acting_as` z
obema identifikatorjema. Glava je izključno za prijavljenega človeka: `X-API-Key` z njo dobi
`403` (člen III — veljaven ključ sam po sebi ni admin). Podrobno v
[`docs/acting-as-another-user.md`](docs/acting-as-another-user.md); pogodba je
`components/parameters/ActingUser` v
[`specs/001-app-shell-dashboard/contracts/openapi.yaml`](specs/001-app-shell-dashboard/contracts/openapi.yaml).

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

Na šibkem gostitelju gradi sliki **eno za drugo**. `up --build` ju sicer gradi vzporedno in
dve hkratni Node gradnji sta na VPS-u z drugimi skladi zanesljiv `exit code: 137`:

```bash
./scripts/vps-compose.sh build api
./scripts/vps-compose.sh build web
./scripts/vps-compose.sh up -d
```

Iz čiste kopije do delujočega sistema: pod 3 minute, samo Docker in izpolnjena datoteka z
okoljem (FR-040, SC-007 — izmerjeno v [`docs/acceptance-001.md`](docs/acceptance-001.md)).
Podroben postopek, kontrolni seznam po funkcionalnih zahtevah in reševanje težav je v
[`specs/001-app-shell-dashboard/quickstart.md`](specs/001-app-shell-dashboard/quickstart.md).

### Skupni Mongo na produkcijskem VPS-u

Ta sklad **nima svojega Monga**. Na VPS-u eden že teče (vsebnik `mongo` iz sklada planego)
in CleverDash uporablja tistega: storitev `api` je priključena na njegovo omrežje
`planego-network`, brez katerega se gostitelj `mongo` iz `MONGO_URI` ne razreši. Če je
omrežje ustvaril compose sklada planego, ima predpono projekta (`planego_planego-network`,
preveri z `docker network ls`) — ime tedaj povozi `PLANEGO_NETWORK` v datoteki z okoljem.

Baza je kljub skupnemu strežniku **svoja**: `/cleverdash`, ne `/planego`. Zbirke `users`,
`settings`, `notes` ... se imensko prekrivajo s planegovimi in bi se v isti bazi podatki
obeh aplikacij pomešali. Uporabnik `admin` z `authSource=admin` do nove baze dostopa brez
dodatnega ustvarjanja uporabnika, zato `MONGO_ROOT_USER`/`MONGO_ROOT_PASSWORD` odpadeta.

### Pomnilnik na VPS-u (4 GB)

Gostitelj ima 4 GB in na njem tečejo še skupni Mongo, Keycloak, planego in Caddy, zato ima
storitev `api` `mem_limit: 1200m`, `shm_size: '512m'` in `NODE_OPTIONS=--max-old-space-size=512`
(utemeljitev je ob vsaki vrednosti v [`infra/docker-compose.yml`](infra/docker-compose.yml)).
Ustaljena poraba vsebnika je ~700-900 MB; meja je varovalka pred uhajanjem Chromiuma, ne
rezervacija. Izmeri jo z `docker stats --no-stream`.

Meje ne veljajo za **gradnjo** slik — `docker build` teče izven njih in je na tem gostitelju
največje tveganje za `exit code: 137`. Zato gradi sliki eno za drugo (zgoraj) in imej vklopljen
swap (`free -h`; 2 GB swap datoteka zadošča).

### Skupni Caddy na produkcijskem VPS-u

Ta sklad **nima svojega Caddyja**. Na VPS-u vrata 80/443 že drži skupni Caddy
(`/opt/caddy/Caddyfile`, vsebnik `caddy`), ki streže tudi `kc.planego.eu` in `planego-*`,
in ta prevzame tudi CleverDash: `/api/*` proxa na vsebnik `cleverdash-api-1`, SPA pa streže
iz datotek, ki jih tja odloži storitev `web`. API posluša na 3010, ne na 3000 — ta so na
VPS-u skupaj s 3002 že v rabi.

Blok, ki mora biti v njegovem Caddyfilu, je verzioniran v
[`infra/cleverdash.caddyfile`](infra/cleverdash.caddyfile) — z njim **zamenjaj** obstoječi
blok za `cleverdash.zuusi.com` (če ta proxa na `cleverdash-caddy-1:80`, je zastarel: takega
vsebnika ni, zato vrne 502) in osveži:

```bash
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

Dve stvari, ki ju je vredno razumeti, preden se to spreminja:

- **Zakaj build pristane v Caddyjevem nosilcu.** Skupni Caddy ima montirano samo
  `/opt/caddy/Caddyfile` (posamezno datoteko) ter nosilca `caddy_caddy_data` in
  `caddy_caddy_config`. Novega nosilca z datotekami SPA-ja mu ni mogoče dodati brez tega, da
  vsebnik postavimo na novo — s čimer bi za nekaj časa padla tudi `kc.planego.eu` in
  planego. Zato storitev `web` piše v `caddy_caddy_data`, ki ga Caddy že ima na `/data`, v
  podmapo `cleverdash-www/`. Certifikati živijo pod `/data/caddy/` in se jih to ne dotakne.
- **Zakaj v bloku ni `encode zstd gzip`,** kot ga imajo ostali bloki. Stiskanje je omejeno
  na stisljive vrste vsebine; blanketno stiskanje bi porabljalo procesor na že stisnjenih
  500 MB datotekah in izgubilo `Content-Length`, brez katerega prejemnik ne vidi napredka in
  ne more nadaljevati prekinjenega prenosa.

Med obiskovalcem in API-jem je tako natanko en proxy, kar se ujema z
`app.set('trust proxy', 1)` v [`apps/api/src/main.ts`](apps/api/src/main.ts) — od tega je
odvisno, da omejevanje ugibanja gesel pri deljenju datotek loči obiskovalce med sabo.

### Keycloak na produkcijskem VPS-u

Prijava gre prek Keycloaka, ki na VPS-u že teče za `kc.planego.eu` (004). CleverDash v njem
potrebuje **svoj realm** `cleverdash`, v njem zaupanja vrednega (confidential) odjemalca
`cleverdash-api` in vlogi `cleverdash-admin` / `cleverdash-user`. Lasten realm zato, ker so v
njem uporabniki in vloge te aplikacije — njihovo urejanje ne sme imeti nobenega učinka na
planego v istem Keycloaku.

Konfiguracija je verzionirana kot **idempotentna skripta**
[`scripts/keycloak-prod-setup.sh`](scripts/keycloak-prod-setup.sh), iz istega razloga kot
Caddyjev blok: `redirect_uri`, PKCE in imeni vlog so pogodba s kodo
([`modules/auth/router.ts`](apps/api/src/modules/auth/router.ts),
[`platform/keycloak/role-mapping.ts`](apps/api/src/platform/keycloak/role-mapping.ts)) in
naklikani v admin konzoli bi bili edini nezapisani del namestitve. Ponovni zagon popravi odmik
(npr. po zamenjavi domene), ne podvoji ničesar.

```bash
# geslo skrbnika Keycloaka in geslo prvega uporabnika; brez njiju skripta vpraša (vnos skrit)
KC_ADMIN_PASSWORD=... CLEVERDASH_USER_PASSWORD=... ./scripts/keycloak-prod-setup.sh
```

Skripta na koncu izpiše blok `KEYCLOAK_*` s skrivnostjo odjemalca za
`../envs/.env.cleverdashNew`. **Skrivnost ostane samo tam** (člen IV) — v repozitorij ne gre
niti kot primer. Prvi uporabnik dobi vlogo `cleverdash-admin`, ker ob prvi prijavi
administratorja steče prevzem obstoječih enouporabniških podatkov
([`legacy-userless-migration.service.ts`](apps/api/src/platform/migration/legacy-userless-migration.service.ts)).

Kar je vredno vedeti, preden se to spreminja:

- **Naslov mora biti dobesedno enak na obeh straneh.** Iz `PUBLIC_BASE_URL` api sestavi
  `redirect_uri` in `post_logout_redirect_uri`, Keycloak pa ju primerja z zapisanima brez
  vsakršne strpnosti (razlikuje tudi poševnico na koncu). Neujemanje se ne pokaže v
  CleverDashu, ampak kot Keycloakova stran »Invalid parameter: redirect_uri«, torej še
  preden uporabnik vidi aplikacijo. Zato je v odjemalcu točno ena pot in nikjer `*`.
- **Vlogi morata biti realm vlogi, ne vlogi odjemalca.** Api ju bere iz `realm_access.roles`;
  vloga odjemalca pristane v `resource_access`, kjer je koda ne vidi — oseba se uspešno
  prijavi pri Keycloaku in jo CleverDash vseeno zavrne z »nimaš dostopa«.
- **Seja živi 30 dni** (`ssoSessionIdleTimeout`/`ssoSessionMaxLifespan`), da jutranji obisk in
  zagon Android aplikacije nista vsakič nova prijava z geslom. Varnostno to ni popuščanje:
  vsaka zahteva gre skozi introspekcijo pri Keycloaku, ki je fail-CLOSED, zato odvzem vloge
  ali seje učinkuje v `KEYCLOAK_INTROSPECTION_CACHE_SECONDS` (5 s) — ne šele ob izteku seje.
  Krajše je ena vrstica, zapisana v komentarju skripte.

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
| `nacrt/008-saved-links/spec.md` | Vhodno gradivo za 008 — zavihek shranjenih linkov; funkcionalnost je implementirana |
| `nacrt/011-meteo-station/spec.md` | Odločitve za 011 — zavihek meritev ARSO postaje; nastalo skupaj s kodo, ne pred njo |
| `docs/legacy-engine.md` | Obratno inženirstvo starega engine-a beleženja časa + napake, ki jih 002 ne sme ponoviti |
| `docs/env-reference.md` | Vse okoljske spremenljivke: kaj ostane, kaj gre v bazo, kaj je novo |
| `docs/acting-as-another-user.md` | 012 — kako administrator dela v imenu drugega uporabnika in kaj ostane njegovo |
| `docs/SECURITY-FIRST.md` | Razkrite skrivnosti iz starega sistema, ki jih je treba zavrteti |

## Sorodne mape

| Mapa | Kaj je |
|---|---|
| `privat\cleverdash` | **ta projekt** |
| `privat\cleverdash-old` | starejši CleverDash (Angular 13 + Firebase); vir za zaslon kamer (003) |
| `privat\cleverdash2` | starejši poskus iz novembra 2025 |
| `privat\belezenje_casa` | aplikacija, ki jo zavihek "Beleženje časa" (002) nadomešča |
