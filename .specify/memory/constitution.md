<!--
Sync Impact Report
==================
Version change: (uninitialized template) → 1.0.0
Bump rationale: MAJOR — initial ratification of the project constitution; all
principles newly defined from nacrt/constitution.md.

Modified principles: none (no prior named principles existed; the file held only
[PRINCIPLE_N_NAME] placeholders).

Added sections:
- Core Principles — 12 principles:
  I. Zavihek je modul
  II. Enotni izvor (single origin), backend pod /api
  III. API-first — UI ni privilegiran odjemalec
  IV. Nobene skrivnosti v kodi ali gitu
  V. Scheduler je determinističen in idempotenten
  VI. Nobene neverificirane avtomatizirane akcije
  VII. Sistem, ki se pokvari, mora znati povedati, da je pokvarjen
  VIII. Vljudnost do zunanjih virov
  IX. Engine je testabilen brez brskalnika
  X. Slovenščina v domeni, angleščina v kodi
  XI. Mobilna naprava je odjemalec, ne planer
  XII. Meje
- Tehnološke omejitve (template slot [SECTION_2_NAME])
- Kakovostna vrata (template slot [SECTION_3_NAME])
- Governance

Removed sections: none.

Template deviations:
- The resolved constitution-template ships 5 principle slots; this project defines
  12. Slot count is a scaffold default, not a constraint — the source draft
  (nacrt/constitution.md) is the authoritative principle set.
- Document body is Slovenian, per Principle X (domain and human-facing text in
  Slovenian). Structural headings and code identifiers stay as-is.

Follow-up TODOs: none. No placeholder tokens remain.
-->

# CleverDash Constitution

Nepogojna pravila. Veljajo za vsako funkcionalnost, vsak PR in vsako generirano kodo.

## Core Principles

### I. Zavihek je modul

Vsak zavihek MORA biti samostojen modul: lasten routing, lasten API namespace, lastne
kolekcije. Moduli se NE SMEJO klicati med sabo neposredno — komunikacija poteka izključno
prek skupnih storitev (auth, obvestila, nastavitve). Odstranitev zavihka MORA biti brisanje
ene mape in enega vnosa v registru zavihkov, brez popravkov drugod.

**Zakaj:** dashboard bo dobival nove zavihke v nedoločenem tempu. Sklopljenost med zavihki
je edina stvar, ki to sčasoma naredi nemogoče.

**Preverljivo:** brisanje mape modula in njegovega vnosa v registru pusti `typecheck`, `lint`
in teste čiste.

### II. Enotni izvor (single origin), backend pod `/api`

Aplikacija in API MORATA biti na istem izvoru:

- SPA: `https://app.si/`
- API: `https://app.si/api/v1/...`

Reverse proxy usmerja `/api/*` na Node backend, vse ostalo na statični build s SPA fallbackom
na `index.html`. Ločene API poddomene NE SME biti. `cors({ origin: "*", credentials: true })`
je prepovedan v vseh oblikah.

**Zakaj:** brez CORS-a, brez `origin: "*"`, piškotki in `Authorization` glava delujejo brez
posebnih pravil, ena TLS domena. Stara aplikacija je uporabljala ločeno `bcapi.zuusi.com` in
`cors({ origin: "*", credentials: true })` — kombinacija, ki je hkrati nevarna in po
specifikaciji neveljavna.

### III. API-first — UI ni privilegiran odjemalec

Vsaka funkcija MORA obstajati najprej kot REST endpoint, šele nato kot zaslon. Kar se da
narediti v UI, se MORA dati narediti tudi s HTTP klicem. n8n je prvorazredni odjemalec, ne
naknadna misel.

Zato velja:

- Pogodba JE OpenAPI 3.1 in se vzdržuje skupaj s kodo v istem PR-ju.
- Avtentikacija za avtomatizacijo JE API ključ z omejenim obsegom (`X-API-Key`); uporabnikovo
  geslo ali dolgoživ JWT za ta namen NISTA dovoljena.
- Mutacijski endpointi MORAJO sprejemati `Idempotency-Key`.

### IV. Nobene skrivnosti v kodi ali gitu

Skrivnosti pridejo izključno iz okolja ali iz datotek, montiranih ob zagonu. V repozitoriju je
samo `.env.example` s praznimi vrednostmi.

Prepovedano brez izjem:

- ključi ponudnikov v `.ts`/`.js` datotekah,
- prave vrednosti v `docker-compose.yml`,
- commitan `.env`,
- skrivnosti v `environment.prod.ts` frontenda — vse, kar je v buildu, je javno.

**Zakaj:** v stari kodi je privatni ključ Firebase service accounta zapisan neposredno v
`src/services/messaging-service.ts`, `docker-compose.yml` pa vsebuje JWT secret, SMTP geslo,
admin geslo in sejni piškotek e-računov.

### V. Scheduler je determinističen in idempotenten

1. **Baza je edini vir resnice.** Načrtovana akcija JE zapis, ne časovnik v pomnilniku.
2. **Nič ne sme biti odvisno od delovanja v določeni sekundi.** Vsak tik se vpraša "kaj bi
   moralo biti do zdaj narejeno in ni?" in to dohiti. Restart kadar koli NE SME povzročiti
   izgubljenega dneva.
3. **Podvojen zagon MORA biti nemogoč.** Unikatni indeks na (datum, profil, tip akcije).
   Ponovljen klic z istim `Idempotency-Key` vrne prvotni rezultat.
4. **Vsi časi so v `Europe/Ljubljana`.** `toISOString().split("T")[0]` za koledarski dan je
   prepovedan. Shranjuje se UTC instant + eksplicitna cona.

**Zakaj:** stara implementacija je dnevni načrt ustvarila samo v oknu 00:00:00–00:00:09 in
izračunala "današnji" dan po UTC-ju, kar v poletnem času pomeni napačen dan.

### VI. Nobene neverificirane avtomatizirane akcije

Klik ni dokončan, ko ga sprožimo, ampak ko potrdimo spremembo stanja na oddaljeni strani.
Vsak poskus MORA zabeležiti: čas, izid, prebrano stanje pred in po, posnetek zaslona ob
napaki, razlog. Neuspeh se ponovi z zamikom; po izčrpanih poskusih uporabnik MORA dobiti
obvestilo. Tiha napaka je hrošč najvišje resnosti.

### VII. Sistem, ki se pokvari, mora znati povedati, da je pokvarjen

Notranji `/api/v1/health` NE zadošča — mrtev proces ne pošilja obvestil. Zato je obvezno:

- vsak tik pošlje signal zunanji "dead man's switch" storitvi (Healthchecks.io ali
  self-hosted Uptime Kuma); če signal utihne, alarm pride od zunaj;
- veljavnost sejnega piškotka e-računov se aktivno spremlja in opozori **pred** potekom;
- vsak zagon in vsaka odločitev scheduleria je v strukturiranem logu z ID-jem korelacije.

### VIII. Vljudnost do zunanjih virov

ARSO, e-računi in kamere so tuji sistemi. Zato:

- vsak zunanji klic gre prek backend predpomnilnika z razumnim TTL (radar 5 min, vreme
  10 min); frontend NE SME poizvedovati zunanjega vira v zanki;
- `Cache-Control` izvora se spoštuje;
- ARSO podatki so vedno prikazani z navedbo vira;
- avtomatizacija e-računov uporablja **obstoječo sejo uporabnika** in NE SME obiti nobenega
  varnostnega mehanizma; njena naloga je pritisniti isti gumb, ki bi ga uporabnik pritisnil
  sam, ob dogovorjenem času.

### IX. Engine je testabilen brez brskalnika

Logika odločanja (kdaj, kaj, ali je delovni dan, katero stanje pričakujemo) MORA biti čista in
enotsko testirana brez Puppeteerja. Brskalniška plast je ozek vmesnik z dvema operacijama:
`readState()` in `performAction()`. `dry-run` način, ki vse izračuna in zabeleži, a ne klikne
ničesar, je obvezen.

### X. Slovenščina v domeni, angleščina v kodi

Imena akcij so domenski podatki v slovenščini (`Prijava na delo`, `Malica`, `Konec malice`,
`Konec dela`, `Delo od doma`, `Delo na terenu`) in se NE prevajajo — biti MORAJO znakovno
enaka besedilu na e-računih. Identifikatorji v kodi, polja API-ja in imena kolekcij so v
angleščini. Besedilo v UI in obvestilih je v slovenščini.

### XI. Mobilna naprava je odjemalec, ne planer

Vso načrtovanje in izvajanje se dogaja na strežniku. Android aplikacija samo prikazuje stanje
in prejema obvestila. Nobena funkcija NE SME biti odvisna od tega, da je telefon prižgan, na
omrežju ali da Android ni ubil procesa.

### XII. Meje

Prepovedano, tudi če bi bilo priročno:

- vpisovanje delovnega časa, ki se ni zgodil, ali vpisovanje za drugo osebo;
- prikrivanje avtomatizacije pred delodajalcem — sistem je uporabnikov osebni pomočnik za
  lastno evidenco in ne izdaja lažnih podatkov;
- zaobitje CAPTCHA, večfaktorske avtentikacije ali omejitev hitrosti na tujih sistemih.

Če e-računi kdaj uvedejo mehanizem, ki avtomatizacijo namenoma prepreči, se avtomatski način
izklopi in ostane samo način opozarjanja.

## Tehnološke omejitve

Te omejitve so del ustave, ker iz njih izhajajo načela II, V in IX; sprememba katere koli od
njih je amandma, ne implementacijska odločitev.

- **Stack:** Ionic + Angular (web in Android prek Capacitorja), Node.js + TypeScript, MongoDB,
  Puppeteer, Docker Compose na VPS.
- **TypeScript:** `strict: true` v vseh paketih; `any` v domenski plasti ni dovoljen.
- **Časovna cona:** `Europe/Ljubljana` je edina domenska cona (načelo V.4).
- **Pogodba:** OpenAPI 3.1 je edina normativna definicija API-ja.
- **Namestitev:** `docker compose up` iz čiste checkout kopije MORA pripeljati do delujočega
  sistema samo z izpolnjenim `.env`.
- **Sledljivost načrta:** `nacrt/` je vhodno gradivo (specifikacije, načrti, pogodbe), mapi
  `specs/` in `.specify/` si lasti Spec Kit. Vhodnih dokumentov v `nacrt/` se ne prepisuje z
  generiranimi artefakti.

## Kakovostna vrata

Nobena naloga ni končana, dokler ni izpolnjeno vse spodaj. Vrata so binarna: delno izpolnjeno
šteje kot neizpolnjeno.

1. `npm run typecheck` in `npm run lint` sta čista; TypeScript `strict: true`, brez `any` v
   domenski plasti.
2. Domenska logika ima enotske teste, vključno z: prehodom na poletni/zimski čas, praznikom,
   ki pade na delovni dan, dopustom preko meje meseca, in neuspelim klikom, ki se uspešno
   ponovi.
3. OpenAPI pogodba je posodobljena in validna.
4. `docker compose up` iz čiste checkout kopije pripelje do delujočega sistema samo z
   izpolnjenim `.env`.
5. Noben nov niz, ki je videti kot skrivnost, ni v gitu.

## Governance

Ta ustava je nad vsemi drugimi praksami, načrti in navadami. **Kjer je načrt v nasprotju z
ustavo, se popravi načrt, ne ustava.**

**Skladnost:** vsak PR in vsaka generirana sprememba se preverita proti Temeljnim načelom in
Kakovostnim vratom. Kršitev načela je blokada združitve, ne opomba za pozneje. Kompleksnost,
ki je videti kot kršitev načela I, II ali IX, MORA biti eksplicitno utemeljena v opisu PR-ja;
neutemeljena kompleksnost se odstrani.

**Amandmaji:** sprememba ustave je ločen PR, ki spremeni samo `.specify/memory/constitution.md`
in vsebuje: (a) besedilo pred in po, (b) razlog, (c) posledice za obstoječe funkcionalnosti in
migracijski korak, če je potreben. Ustave se ne spreminja v istem PR-ju kot funkcionalnost.

**Verzioniranje:** semantično, `MAJOR.MINOR.PATCH`.

- MAJOR — odstranitev ali nezdružljiva redefinicija načela ali pravila upravljanja;
- MINOR — novo načelo, nov razdelek ali vsebinsko razširjeno vodilo;
- PATCH — pojasnila, ubeseditev, tipkarski popravki brez pomenske spremembe.

**Pregled:** ob vsaki novi funkcionalnosti (`/speckit-specify` → `/speckit-plan`) se preveri,
ali načrt trči v katero načelo; trk se reši pred generiranjem nalog. Med izvedbo se Kakovostna
vrata preverijo pred zaključkom vsake naloge.

**Vodilo med razvojem:** `nacrt/` (specifikacije, načrti, pogodbe) in `docs/legacy-engine.md`
(napake, ki jih ne ponovimo) sta referenca; ustava je odločilna, kadar si nasprotujeta.

**Version**: 1.0.0 | **Ratified**: 2026-08-19 | **Last Amended**: 2026-08-19
