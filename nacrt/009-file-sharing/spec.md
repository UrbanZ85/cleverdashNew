# 009 — vhodno gradivo

> `nacrt/` je VHODNO gradivo in ga generirani artefakti ne smejo prepisati (README,
> "Zakaj vhodno gradivo ni v specs/"). Spodaj je zahteva, kot je bila podana, in odločitve,
> ki so bile ob njej sprejete — brez naknadnega lepšanja.

## Zahteva (dobesedno)

> še en zaslon bi rabil in sicer tak da lahko sharam kakšne datoteke do velikosti 500mb.
> in sicer upload datoteke samo prijavljen uporabnik. download pa je lahko samo s pomočjo
> urlja * passworda. torej č enisi prijavljen ne moreš dobiti te datoteke ali če imaš
> password samo za ta file potem lahko zlodaš. drugače ne gre.

Dopolnilo med pregledom kode:

> tudi to je modul samo za uporabnika če si ga enabla

## Kaj zahteva pomeni, brana dobesedno

Trije stavki povedo troje, in vsak od njih je zahteva zase:

1. **Dva različna človeka.** Lastnik je prijavljen uporabnik CleverDasha. Prejemnik NI
   uporabnik CleverDasha, nima računa in ga ne bo dobil. Doslej so vsi zasloni predpostavljali
   prvega; ta funkcionalnost prvič uvede drugega.
2. **Dvoje vrat, ne eno.** "url **in** password" — sam naslov ne zadošča ("drugače ne gre"),
   samo geslo brez naslova pa nima kam. Povezava mora biti neuganljiva IN zaklenjena.
3. **Geslo velja za eno datoteko.** "password samo za ta file" — ni skupnega gesla za vse in
   ni gesla, ki bi po enkratni uporabi odprlo še kaj drugega.

Dopolnilo doda četrto: zavihek je **na uporabnika**, viden le tistemu, ki si ga vklopi — kar
je v tem projektu že rešeno (`Settings.tabs`, 004), ne nova naprava.

## Odločitve ob prevzemu

Zahteva je odprla štiri vprašanja, ki spremenijo, kaj sploh nastane. Postavljena so bila pred
pisanjem specifikacije; izbrano:

| Vprašanje | Izbrano | Zavrnjeno in zakaj |
|---|---|---|
| Proces | Vhodno gradivo → `/speckit-specify` → `/speckit-plan` → `/speckit-tasks`, koda šele potem | Enako kot 008; takojšnja koda bi odstopala od načina dela v tem repozitoriju |
| Kje živijo datoteke | **Datotečni sistem + nov Docker nosilec** | GridFS (datoteke bi bile v isti varnostni kopiji kot baza, a bi 500 MB teklo skozi Mongo v 255 kB kosih); MinIO/S3 (nova storitev, ki je projekt nima) |
| Geslo | **Sistem generira, eno geslo na datoteko** | Uporabnikovo geslo (šibka, ponovljena gesla na javnem endpointu); več povezav na datoteko z ločenimi gesli (več pojmov, kot jih zahteva zahteva) |
| Veljavnost | **Rok + ročni preklic**, privzetek nastavljiv ob nalaganju | Brez roka (pozabljene povezave ostanejo žive za vedno); omejitev števila prenosov (več polj v obrazcu, brez dokazane potrebe) |

Odločitev za datotečni sistem je zavestno sprejeta PROTI argumentu, ki ga zapiše
`modules/notes/models/note-audio.model.ts:7-12` — da datotečni sistem zahteva nov trajni
nosilec in se razide z varnostno kopijo baze. Argument s tem ne izgine: načrt MORA povedati,
kaj se zgodi, kadar se zapis in datoteka razideta (zapis brez datoteke, datoteka brez zapisa)
in kdo to opazi (člen VII).

## Kaj je pregled kode razkril pred pisanjem specifikacije

### 1. To je prvi zaslon v aplikaciji BREZ prijave

`apps/web/src/app/app.routes.ts` — vsaka pot ima `canActivate: [authGuard]`, brez izjeme. V
004 sta bili poti `/login` in `/change-password` odstranjeni (prijava je preusmeritev na
`/api/v1/auth/login`), torej v SPA danes ni nobenega zaslona, ki bi ga smel videti neprijavljen
človek. Stran za prevzem datoteke je prva.

Na strežniku je slika drugačna in ugodnejša, kot je videti iz `main.ts`: `apiKeyGuard` in
`accessTokenGuard` zahteve BREZ poverilnic ne zavrneta — samo nastavita `req.auth`, če
ustrezna glava obstaja. Zavrne šele `requireScopes` (`platform/auth/scopes.ts:38`). Javna pot
je torej pot, ki `requireScopes` NE pokliče — ne pa nov `app.use` pred vratarji, kakršnega ima
`/health`.

Dvoje, kar mora načrt zato izrecno rešiti:

- **Kaj naredi veljaven žeton na javni poti.** Če lastnik odpre svojo lastno povezavo,
  prijavljen v istem brskalniku, bo Angularjev interceptor žeton pripel. Prevzem NE sme biti
  odvisen od tega, ali je žeton tam (sicer "deluje meni, ne pa prejemniku"), niti se ne sme
  podreti, če je pripet.
- **Kje pot živi v SPA.** Predlog: `/d/:token` zunaj `authGuard` in zunaj `tabGuard` — kratka,
  ni videti kot zavihek in je ni v registru zavihkov.

### 2. 500 MB ne sme skozi pomnilnik — vsebnik ima 1500 MB

`infra/docker-compose.yml`: storitev `api` ima `mem_limit: 1500m`, ob njej pa v istem vsebniku
raste Chromium (`shm_size: '1gb'`, komentar "brez omejitve lahko izstrada Mongo na istem
VPS-u"). Dve sočasni 500 MB nalaganji, prebrani v pomnilnik, ta vsebnik ubijeta.

Obstoječi vzorec za binarno telo je `POST /notes/{id}/audio`
(`modules/notes/router.ts:257-283`): `express.raw({ limit })`. Ta vzorec se tu **NE sme
ponoviti** — `express.raw` telo pobere v `Buffer`. Za 10 MB posnetek je to prav, za 500 MB
datoteko je to napaka. Nalaganje mora teči neposredno v datoteko (`req.pipe` v
`fs.createWriteStream`), prenos nazaj pa s `fs.createReadStream`.

Iz tega sledi, da nova odvisnost za `multipart/form-data` (multer, busboy) NI potrebna in naj
se ne dodaja: telo je ena datoteka, ne obrazec. `express.json()` je registriran globalno, a se
binarnega telesa ne dotakne.

### 3. Nosilec: vzorec že obstaja, dosledno ga posnemi

`infra/docker-compose.yml` ima `screenshots:/app/data/screenshots`, `platform/config/env.ts:105`
pa `SCREENSHOT_DIR: z.string().default('/app/data/screenshots')`. Enak par (nosilec +
nastavljiva pot z istim privzetkom pod `/app/data/`) je pravi vzorec za `/app/data/files`.

Pozor na past, ki je v tem paru že vidna: `SCREENSHOT_RETENTION_DAYS` (env.ts:106) je
**deklariran in ga nihče ne bere** — čiščenja posnetkov ni. Skupnega pometača torej ni in 009
ga ne sme predpostavljati; potekle datoteke mora pobrisati modul sam, in to mora biti naloga v
`tasks.md`, ne opomba.

### 4. V tem API-ju ni nobenega dušenja zahtev

Iskanje po `apps/api/src` po `rateLimit|throttle` ne najde ničesar. `login-throttle.service.ts`
in `tests/integration/login-rate-limit.spec.ts` sta bila v 004 izbrisana — dušenje prijav je
prevzel Keycloak. Javen endpoint, ki preverja geslo, torej v tem projektu danes nima ničesar
pod sabo.

To je najresnejša posledica te zahteve: povezava + geslo brez dušenja je geslo, ki ga je mogoče
uganiti z avtomatom. Dušenje na povezavo IN na izvorni naslov je zato del te funkcionalnosti,
ne "kasnejša izboljšava". `app.set('trust proxy', 1)` v `main.ts:39` je za to že pripravljen
(pravi `req.ip` za Caddyjem).

### 5. Geslo je povzetek, ne šifra — `secret-box.ts` je za nekaj drugega

`platform/crypto/secret-box.ts` je AES-256-GCM in je nastal za poverilnice kamer (003), ki jih
mora strežnik znati **prebrati nazaj**. Geslo za prenos se ne bere nazaj, ampak preverja:
shranjen mora biti počasen povzetek (`scrypt` iz `node:crypto` — brez nove odvisnosti), s
primerjavo v konstantnem času.

Posledica izbire "sistem generira geslo": geslo je vidno **enkrat, ob nalaganju**. Kdor ga
izgubi, ga ne dobi nazaj — lahko pa zanj ustvari novega, kar staro povezavo takoj razveljavi.
To mora zaslon povedati vnaprej, ne potem, ko je okno že zaprto.

### 6. Zavihek na uporabnika je že rešen

Dopolnilo ("modul samo za uporabnika, če si ga enabla") ne zahteva nič novega:
`modules/settings/model.ts` ima `tabs: Record<tabId, {enabled?, order?}>`, resolver zavihkov
(`platform/tabs/resolver.ts`) prekrije privzetek iz registra z uporabnikovo nastavitvijo. 009
doda en vnos v `TAB_REGISTRY`; vprašanje za načrt je le, ali je privzeto `enabled: true` ali
`false`.

Predlog: **`enabled: false`**. Vsi obstoječi zavihki so privzeto vklopljeni, ker so del tega,
kar CleverDash je; deljenje datotek je po dopolnilu izrecno stvar izbire. Če register ali
resolver tega privzetka ne preneseta, je to ugotovitev za `/speckit-plan`, ne izgovor.

Ostane past iz `docs/adding-a-tab.md`, koraka 5 in 6: brez vpisa obsegov v `BASE_USER_SCOPES`
(`platform/keycloak/role-mapping.ts`) zavihek dela samo administratorju, brez registracije
ikone (`core/icons/register-icons.ts` + `tests/unit/icons.spec.ts`) pa se ikona izriše kot
prazen prostor.

### 7. Caddy: dvoje za preveritev, ne za domnevo

`infra/Caddyfile` ima `encode gzip` na celotnem mestu. Prenos 500 MB datoteke, ki je že
stisnjena (zip, mp4, jpg), naj skozi to ne gre po nepotrebnem, in stiskanje ne sme pokvariti
`Content-Length` ne nadaljevanja prenosa (`Range`). Prav tako je treba potrditi, da
`reverse_proxy` prepusti 500 MB telo brez privzete meje in brez časovne omejitve.
`PUBLIC_BASE_URL` (že v uporabi) je osnova, iz katere se sestavi povezava za deljenje.

### 8. V starem CleverDashu tega ni bilo

`cleverdash-old/` ima `AngularFireStorageModule` in ohlapen model `models/file-upload.ts`
(`key`, `name`, `url`, ob njem `File` z `newArray: any`), uporabljen okoli zvočnih zapiskov —
ne strani za deljenje. Neposrednega prednika ta funkcionalnost torej nima, kar pomeni tudi, da
ni starega vedenja, ki bi ga bilo treba ohraniti. Edino, kar je od tam vredno prenesti, je
opozorilo: Firebase Storage je datoteke stregel prek dolgega, a **golega** naslova brez gesla —
kdor je naslov dobil naprej, je dobil datoteko. Prav to zahteva izrecno izključuje.

## Obseg

**V obsegu:**

- zavihek "Deljenje datotek" s seznamom lastnih naloženih datotek (ime, velikost, datum,
  stanje povezave, rok, število prenosov);
- nalaganje datoteke do 500 MB s prikazom napredka, s pretakanjem na disk (ne v pomnilnik);
- ob nalaganju nastane povezava za deljenje in **enkrat prikazano** generirano geslo;
- rok veljavnosti, nastavljiv ob nalaganju, s privzetkom; takojšen ročni preklic; brisanje
  datoteke (zapis IN datoteka z diska);
- ponovna generacija gesla (stara povezava s tem preneha delovati);
- **javna stran za prevzem** zunaj prijave: naslov + geslo → prenos; brez enega od obojega
  prenosa ni;
- dušenje poskusov gesla na povezavo in na izvorni naslov, z zapisom v dnevnik;
- samodejno čiščenje poteklih datotek (zapis in disk), lastno temu modulu;
- kvota prostora na uporabnika in razumljiva zavrnitev ob preseženi kvoti;
- OpenAPI pogodba in obsega `files:read` / `files:write` (člen III — nalaganje mora biti
  mogoče brez UI).

**Ni v obsegu:**

- deljenje MED uporabniki CleverDasha (prejemnik je zunanji, brez računa — to je bistvo
  zahteve; interno deljenje bi bila druga funkcionalnost);
- mape, oznake, iskanje po vsebini datotek, predogled ali urejanje vsebine;
- nadaljevanje prekinjenega nalaganja (chunked/resumable) in nalaganje več datotek hkrati;
- protivirusno preverjanje naloženih datotek;
- šifriranje datotek na disku (poverilnice kamer so šifrirane, ker so skrivnost sistema;
  naložena datoteka je uporabnikova vsebina — če to postane zahteva, naj bo svoja odločitev);
- ploščica na nadzorni plošči;
- javna stran za NALAGANJE (prejemnik ne more poslati datoteke nazaj).

## Odprta vprašanja za `/speckit-plan`

1. **Kaj vidi prejemnik pred vpisom gesla.** Ime datoteke pomaga zaupati povezavi, hkrati pa
   je podatek, ki uide vsakomur, ki naslov dobi. Predlog: pred geslom samo velikost in datum
   poteka, ime šele po odklenitvi.
2. **Kako je videti povezava.** `/d/:token` z naključnim, neuganljivim žetonom (koliko bitov)
   ali `/d/:id` z ločenim žetonom v poizvedbi. Žeton NE sme biti Mongo `_id`.
3. **Ali se geslo pošlje ali dokaže.** Preprosto: `POST` z geslom → strežnik vrne kratkotrajno
   dovolilnico za prenos. Alternativa (geslo ob vsaki zahtevi) je enostavnejša, a konča v
   dnevnikih posrednikov, če pride v naslov.
4. **Meje dušenja.** Koliko zgrešenih poskusov na povezavo, v kakšnem oknu, in kaj sledi —
   zamik ali zaklep povezave, ki ga lastnik vidi in zna odkleniti.
5. **Razhajanje zapisa in datoteke** (posledica izbire datotečnega sistema): kdo ga opazi in
   kaj naredi — zapis brez datoteke na disku, datoteka na disku brez zapisa po neuspelem
   nalaganju ali po obnovitvi baze iz varnostne kopije.
6. **Prekinjeno nalaganje.** Nadaljevanje ni v obsegu, a delna datoteka na disku ostane —
   kdaj se pobriše in kako se loči od uspešno naložene.
7. **Privzeti rok in privzeto stanje zavihka.** Predlog: 7 dni (izbire 1/7/30/brez roka) in
   `enabled: false` (točka 6 zgoraj) — obe vrednosti naj načrt potrdi ali ovrže.
8. **Kvota in meja 500 MB kot nastavitvi okolja.** Predlog po vzoru `SCREENSHOT_DIR`:
   `FILE_SHARE_DIR`, `FILE_SHARE_MAX_MB` (privzeto 500), `FILE_SHARE_QUOTA_MB`,
   `FILE_SHARE_DEFAULT_EXPIRY_DAYS`. Kje je meja uveljavljena — `Content-Length` PRED začetkom
   pisanja in še enkrat med pisanjem (glava je obljuba, ne dejstvo).
9. **Enotski testi domenske plasti (kakovostna vrata, točka 2).** Ta funkcionalnost nima
   predmeta za prehod na poletni/zimski čas ne za neuspel ponovljen klic; načrt MORA izrecno
   zapisati, kaj jih nadomešča — preverjanje gesla v konstantnem času, izračun in iztek roka,
   števec dušenja na meji okna, razrez imena datoteke (`../`, dolžina, znaki, ki jih datotečni
   sistem ne prenese), izračun kvote.
