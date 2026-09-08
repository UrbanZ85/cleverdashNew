# Naredi to pred vsem ostalim

V obstoječem projektu `belezenje_casa` so prave skrivnosti zapisane v izvorni kodi in v
datotekah, ki so del repozitorija. Če jih prekopiraš v CleverDash, prenašaš naprej
težavo, ki je danes že aktivna.

**Ta seznam ni del Spec Kit workflowa. Opravi ga ročno, zdaj.**

---

## 1. Zavrti Firebase service account (najbolj nujno)

`belezenje-casa-BE/src/services/messaging-service.ts` vsebuje celoten privatni ključ
service accounta, zapisan v izvorni kodi:

- projekt: `belezenje-casa`
- service account: `firebase-adminsdk-w6akp@belezenje-casa.iam.gserviceaccount.com`
- `private_key_id`: `b11a3b86962b9fc0b9bc50d69de16f406ca0191c`

Ta ključ dovoljuje pošiljanje obvestil vsem napravam projekta in dostop do Firebase
Admin API-ja.

Kaj narediti:

1. Google Cloud Console → IAM & Admin → Service Accounts → ta račun → Keys →
   **izbriši ključ** `b11a3b86…`.
2. Ustvari nov ključ in ga shrani kot datoteko, **izven repozitorija**.
3. V CleverDash ga podaj kot montirano datoteko in `GOOGLE_APPLICATION_CREDENTIALS`,
   nikoli kot literal v kodi.

## 2. Zavrti ostale skrivnosti iz `.env` in `docker-compose.yml`

Vse spodnje vrednosti so v datotekah znotraj projekta in jih je treba obravnavati kot
razkrite:

| kaj | kje | ukrep |
|---|---|---|
| `JWT_SECRET` | `.env`, `docker-compose.yml`, `docker-compose.dev.yml` | nov, naključen, min. 32 bajtov; vse obstoječe seje postanejo neveljavne (to je namen) |
| `EMAIL_PASSWORD` (SMTP `info@zuusi.com`) | `.env`, oba compose fila | zamenjaj geslo na poštnem strežniku |
| `ADMIN_PASSWORD` (`admin!`) | `.env`, oba compose fila | novo geslo; staro je slovarska beseda s klicajem |
| `cookie_property_value` (seja e-računov) | `.env`, oba compose fila, `belezenje.page.ts` | nova seja; ta piškotek je nosilec identitete pri delodajalcu |
| Google Maps API ključ | `belezenje-casa/src/environments/environment.ts` | omeji na domeno v Cloud Console; ključi v frontend buildu so vedno javni |
| Firebase web config + VAPID ključ | `firebase-messaging-sw.js`, `messaging.service.ts` | web config je po zasnovi javen — pusti, a preveri Firebase varnostna pravila |
| Firebase config starega CleverDasha | `cleverdash/src/environments/environment.ts` | isto: preveri pravila, ne ključ |

> Sejni piškotek e-računov je poseben primer: ni ga mogoče "zavrteti" v smislu preklica.
> Edina rešitev je pridobiti novo sejo in staro vrednost odstraniti iz vseh datotek.
> Zapisana vrednost `cookie_property_expires: 1737717074` je 24. 1. 2025, torej je ta
> seja tako ali tako že potekla.

## 3. Počisti zgodovino, če bo repozitorij kdaj deljen

`belezenje-casa` ima svoj `.git`. Če bo ta repozitorij kdaj postal javen ali deljen,
skrivnosti niso samo v delovni kopiji, ampak v vseh commitih.

- Če ostane zaseben in lokalen: točki 1 in 2 zadostujeta.
- Če bo deljen: `git filter-repo` ali nov repozitorij brez zgodovine. Rotacija (točki 1
  in 2) je vseeno obvezna — čiščenje zgodovine ne prekliče razkritega ključa.

## 4. Kako CleverDash to prepreči

Ustava, člen IV. Konkretno:

- V gitu je samo `.env.example` s praznimi vrednostmi.
- `.gitignore` vključuje `.env`, `.env.*` (razen `.env.example`), `*.pem`, `*-key.json`,
  `secrets/`.
- Compose datoteke berejo `env_file:` in ne vsebujejo nobene prave vrednosti.
- Firebase ključ je montirana datoteka (`docker secret` ali bind mount v
  `/run/secrets/`), naslovljena prek `GOOGLE_APPLICATION_CREDENTIALS`.
- Sejni piškotek e-računov je v bazi, ne v okolju, in se ureja prek UI oz. API-ja — ker
  se menja pogosto in restart aplikacije ni sprejemljiva cena za zamenjavo piškotka.
- V CI teče detektor skrivnosti (`gitleaks` ali `trufflehog`) kot blokirajoč korak.

## 4b. Javna pot (009 — deljenje datotek)

Do 009 je bil **vsak** zaslon in **vsak** endpoint za prijavljenega uporabnika. Modul za
deljenje datotek to prvič prebije, ker mora: prejemnik datoteke nima računa in ga ne bo dobil.
Kar iz tega sledi, je zbrano tu, da se ob naslednji javni poti ne izumlja znova.

**Javnost ni vratar, ampak njegova odsotnost.** `apiKeyGuard` in `accessTokenGuard` zahteve
brez poverilnic ne zavrneta — samo nastavita `req.auth`. Zavrne šele `requireScopes`. Javna pot
je torej pot, ki ga NE pokliče, in prav zato je nevarna: ne vidi se. Pravila:

- vse javne poti so v ENI datoteki, `modules/file-sharing/public.router.ts`, katere glava pove,
  zakaj obstaja. Nobene javne poti ne sme biti drugje;
- `tests/contract/file-sharing/auth-surface.spec.ts` bere seznam poti **iz pogodbe** in preveri,
  da je vsak `/files*` brez žetona 401 in vsak `/share/*` dosegljiv. Nova pot ne more tiho uiti;
- javna koda `req.auth` NE bere. Veljaven ali potekel žeton v brskalniku na prevzem ne sme
  vplivati v nobeno smer (FR-024);
- odjemalec na `/api/v1/share/*` ne pripenja glave `Authorization` (`auth.interceptor.ts`) —
  potekla seja ne sme podreti strani, ki s sejo nima zveze.

**Kar javna pot mora imeti pod sabo:**

| Zahteva | Kje je uveljavljena |
|---|---|
| Dušenje ugibanja — po povezavi IN po izvornem naslovu | `services/throttle.service.ts`; števec je v BAZI, ker se pomnilniški ob vsakem zagonu ponastavi |
| Geslo kot nepovraten povzetek, primerjava v konstantnem času | `domain/share-password.ts` (`scrypt` + `timingSafeEqual`) |
| Enak odgovor za neznano, poteklo, preklicano in izbrisano povezavo | `public.router.ts`, `unavailable()` |
| Nič občutljivega v dnevnik — poskušeno geslo NIKAMOR | `public.router.ts`; pokrito v `tests/integration/unlock-throttle.spec.ts` |
| `Idempotency-Key` se ne sprejme (endpoint izdaja dovolilnico) | `platform/idempotency/middleware.ts`, `EXEMPT_PREFIXES` |
| `Cache-Control: no-store` na vseh javnih odgovorih | `public.router.ts` |
| Dovolilnica iz piškotka je PREVERJENA PO OBLIKI, preden postane pogoj poizvedbe | `domain/share-token.ts` (`isGrantShaped`); glej najdbo 1 v §4d |

**Kar javna pot NE sme razkriti:** ime datoteke pred vpisom gesla (pogosto pove vsebino).
Velikost in rok sta v redu — brez njiju prejemnik ne bi vedel, ali je povezava sploh živa.

## 4c. Javna pot, ki PIŠE (009b — sprejemni predali)

Do 009b je vsaka javna pot samo BRALA. Najhujše, kar je znal narediti kdor koli z naslovom, je
bilo, da je prebral, kar mu je bilo namenjeno. Sprejemni predal to prebije v drugo smer: po
`/api/v1/drop/*` nekdo, ki ni prijavljen in nikoli ne bo, **zapiše datoteko na naš disk**.

Vse iz §4b velja naprej in nespremenjeno. Kar je spodaj, je tisto, česar branje ni potrebovalo.

**Kje je koda:** iste tri datoteke kot doslej — `modules/file-sharing/public.router.ts` (drugi
razdelek), `inboxes.router.ts` (lastnikova stran) in `services/inbox.service.ts`. Javnih poti
tudi zdaj NI nikjer drugje, in `tests/contract/file-sharing/auth-surface.spec.ts` bere seznam
poti iz pogodbe: predponi `/inboxes` (lastnik) in `/drop/` (javno) sta tam NAŠTETI IN ZAPRTI, zato
nova javna družina ne more uiti kot "pričakovana".

| Zahteva | Kje je uveljavljena |
|---|---|
| Dovolilnica NI piškotek, ampak glava `X-Drop-Ticket`, ki jo odjemalec pripne izrecno | `public.router.ts` (`requireTicket`), `file-sharing.api.ts`. Piškotek bi brskalnik pripel sam tudi zahtevi s tuje strani — pri poti, ki piše na disk, je razlika med `SameSite` in odsotnostjo ambientne poverilnice bistvena (FR-091) |
| Dovolilnica velja za NATANKO en predal | `services/inbox.service.ts` (`ticketIsValid` z `inboxId` v pogoju) |
| Vsebina se sme pisati SAMO v zapis tega predala in samo v stanju `uploading` | `public.router.ts`; poizvedba je omejena na `inboxId` in `state`, sicer bi bilo mogoče pisati v zapis drugega predala ali prepisati že prispelo datoteko |
| Štiri meje pri vsaki oddaji, vsaka dvakrat (pred prenosom in med njim) | `domain/inbox-capacity.ts`, `services/quota.service.ts`, `domain/size-guard.ts`, `domain/inbox-lifecycle.ts` (FR-088) |
| Napovedana velikost je zavezujoča — `Content-Length` MORA biti enak njej in prispeti mora natanko toliko | `public.router.ts`; brez tega je "napovem 1 MB, pošljem 400 MB" edina meja kvota lastnika (FR-089) |
| Vrsta telesa se preverja (`415`) | `domain/body-type.ts`; `application/json` bi požrl globalni razčlenjevalnik (datoteka velikosti 0), obrazec bi na disk zapisal svoje meje — datoteka bi bila videti uspešno oddana in bi bila pokvarjena |
| Viseče napovedi brez vsebine ne smejo zapolniti predala | `services/inbox.service.ts` (`MAX_PENDING_UPLOADS`) in pometač obtičalih nalaganj (FR-096) |
| Vsaka zavrnitev za sabo ne pusti NIČESAR — ne zapisa, ne delne vsebine, ne rezervacije | `public.router.ts`, `services/upload.service.ts` |
| Dušenje ugibanja kode — po predalu IN po izvornem naslovu, s SKUPNIM števcem naslova za obe javni površini | `services/throttle.service.ts`; ločena števca naslova bi napadalcu mejo podvojila |
| Poskušena koda NIKAMOR — ne v bazo, ne v dnevnik | `public.router.ts`; pokrito v `tests/integration/inbox-limits.spec.ts` |
| Zaprtje predala in nova koda razveljavita ŽE IZDANE dovolilnice | `inboxes.router.ts`, `services/inbox.service.ts` (`revokeTickets`) |
| `Idempotency-Key` se ne sprejme | `platform/idempotency/middleware.ts`, `EXEMPT_PREFIXES` (`/drop/`) |

**Kar javna pot NE sme razkriti:** oznake predala in navodila pred vpisom kode (oznaka pogosto
pove vsebino, enako kot ime datoteke pri prevzemu) — in **preostalega prostora**, ki bi bil
števec dogajanja v predalu za vsakogar, ki ima naslov. Pred kodo se izda samo dovoljena velikost
ene datoteke (nastavitev, ne preostanek) in rok.

**Predal je enosmeren.** Po javnih poteh ni mogoče ničesar prebrati, našteti, prenesti ali
izbrisati; edini bralec prejetih datotek je lastnik prek `/files*`. Če bo kdaj kdo hotel dodati
"pošiljatelj naj vidi, kaj je oddal", je to nova odločitev z novim tveganjem in ne popravek.

## 4d. Kaj je našel varnostni pregled 009b (dve okvari, obe popravljeni)

Obe sta bili v kodi, ki je 009b ni dodala — najdeni sta bili, ker je pregled nove javne poti
zahteval, da se prebere tudi vse, na kar se ta opira. Zapisani sta tu, ker sta oba vzorca taka,
da se ponovita: prvi povsod, kjer kdo piškotek obravnava kot niz, drugi povsod, kjer kdo v
shranjen odgovor spravi skrivnost.

### Najdba 1 (HIGH): obhod gesla za prevzem prek piškotka, ki ni niz

`cookie-parser` na VSAK piškotek uporabi `JSONCookies`: vrednost, ki se začne z `j:`, razčleni z
`JSON.parse`. `req.cookies.cd_share` zato ni bil nujno niz, čeprav je bil tako tipiziran
(`as Record<string, string>` je trditev prevajalnika, ne dejstvo o izvajanju).

Ta vrednost je šla naravnost v pogoj poizvedbe. `Cookie: cd_share=j:{"$ne":null}` se je tako
prevedel v *"katera koli živa dovolilnica za to datoteko"* — kdor je imel naslov povezave, je
vsebino dobil BREZ gesla in brez enega samega poskusa ugibanja, dokler je bila v obtoku ena
zakonita odklenitev (privzeto 10 minut po tem, ko je pravi prejemnik vpisal geslo).

- **Popravek:** `isGrantShaped` (`domain/share-token.ts`) preveri obliko PRED poizvedbo, enako kot
  `isTicketShaped` za oddajo. Test: `tests/contract/file-sharing/grant-cookie.spec.ts`.
- **Zakaj ne `mongoose.set('sanitizeFilter', true)`:** ta bi zahteval `mongoose.trusted()` pri
  vsakem legitimnem `$gt`/`$ne`/`$in` v vsem zaledju — desetine mest, kjer je pozabljen ovoj tiha
  okvara poizvedbe. Varovalka pri vhodu je ožja in preverljiva.
- **Pravilo za naprej:** vsaka vrednost iz piškotka, glave ali `req.body`, ki postane del pogoja
  poizvedbe, mora biti prej preverjena po OBLIKI. `typeof x === 'string'` ni podrobnost.

### Najdba 2 (MEDIUM): skrivnost v shranjenem odgovoru, ki ga je dobil kdor koli

`platform/idempotency/middleware.ts` hrani CEL odgovor mutacijske zahteve 24 ur. Trije endpointi
pa v odgovoru vračajo skrivnost v čistopisu (`POST /files/{id}/password` in v 009b
`POST /inboxes`, `POST /inboxes/{id}/code`) — geslo oz. koda sta bila torej berljiva v zbirki
`idempotencyKeys`, čeprav modul o sebi trdi, da hrani samo `scrypt` povzetek (FR-011, FR-082).

Poleg tega je bil zapis naslovljen samo z `{key, endpoint}`, ponovitev pa se zgodi v vmesniku
PRED `requireScopes`: kdor je izvedel vrednost ključa (dnevnik avtomatizacije, zgodovina ukazov),
je shranjeni odgovor tuje zahteve dobil tudi povsem brez poverilnic.

- **Popravek A:** izjema člena III ne velja samo za pot, ki izda ŽETON, ampak za vsako, ki izda
  SKRIVNOST — vse tri poti so izvzete (`EXEMPT_PATTERNS`, `EXEMPT_SECRET_PATHS`). Ponovljen klic
  zato naredi nov predal oz. novo geslo; to je namerna izbira, ker je odvečen predal viden in ga
  je mogoče izbrisati, shranjene kode pa ni mogoče preklicati za nazaj.
- **Popravek B:** zapis nosi `subject` (`<vrsta>:<id>` klicatelja) in ponovitev ga primerja.
  Neujemanje da `422` z ISTIM besedilom kot neujemanje telesa; zahteva brez poverilnic ne shrani
  in ne ponovi ničesar. Testa: `tests/contract/file-sharing/inboxes.spec.ts` (skrivnost ne
  obleži) in `api-key.spec.ts` (vezava na klicatelja).
- **Pravilo za naprej:** preden se nov endpoint navede kot "sprejme `Idempotency-Key`", se je
  treba vprašati, ali je v njegovem odgovoru kaj, česar ne bi zapisali v bazo.

## 5. Kontrolni seznam

- [ ] Firebase ključ `b11a3b86…` izbrisan v Cloud Console
- [ ] Nov Firebase ključ ustvarjen in shranjen izven repozitorija
- [ ] `JWT_SECRET` zamenjan
- [ ] SMTP geslo za `info@zuusi.com` zamenjano
- [ ] Admin geslo zamenjano
- [ ] Nova seja e-računov pridobljena, stara vrednost odstranjena iz vseh datotek
- [ ] Google Maps ključ omejen na domeno
- [ ] Odločeno, ali `belezenje_casa` repozitorij ostane zaseben
- [ ] `gitleaks` dodan v CleverDash CI
