# Research: Deljenje datotek (009)

Faza 0. Vsaka točka je odločitev, ne razmislek — kaj je izbrano, zakaj, in kaj je bilo
zavrnjeno. Odprta vprašanja iz `nacrt/009-file-sharing/spec.md` so tu zaprta (§6, §8, §9, §11,
§12, §14, §15, §16, §18).

Skozi vse odločitve gresta dve rdeči niti, ki ju druge funkcionalnosti tega projekta nimata:
**vsebina je prevelika, da bi šla skozi pomnilnik ali skozi bazo**, in **del vmesnika je
javen**. Kjer se odločitev razlikuje od ustaljenega vzorca projekta, je razlog eden od teh
dveh.

---

## §1 Datotečni sistem, ne GridFS in ne S3 — in kaj to prinese s sabo

**Odločitev:** vsebina gre na datotečni sistem, na nov Docker nosilec `shared-files`,
montiran na `/app/data/files` (nastavljivo z `FILE_SHARE_DIR`). Odločitev je bila sprejeta ob
prevzemu zahteve in se tu ne odpira znova; zapisano je, kaj iz nje sledi.

**Zakaj:** `res.download()`/`createReadStream` nad navadno datoteko je najkrajša pot od diska
do odjemalca, s podporo za `Range` in brez posrednika. GridFS bi isto vsebino razrezal na
255 kB dokumente in jo ob vsakem prenosu sestavljal skozi bazo; S3/MinIO bi bila nova
storitev v `docker-compose.yml` in nova skrivnost v `.env`.

**Kaj to stane in kje je plačano:** `modules/notes/models/note-audio.model.ts:7-12` zapiše
ugovor — datotečni sistem se razide z varnostno kopijo baze. Ugovor drži in ta načrt ga ne
zanika, ampak ga naredi **vidnega**: razhajanje zapisa in vsebine je obravnavano v §14 kot
stanje, ki ga sistem zna zaznati in prijaviti, ne kot nemogoč primer.

**Zavrnjeno:** GridFS (pretakanje skozi bazo za datoteke, ki jih baza ne potrebuje);
MinIO/S3 (nova storitev in nove skrivnosti za en modul na osebnem strežniku).

## §2 Kje se javna pot vklopi v obstoječo verigo vratarjev

**Odločitev:** javne poti so navaden del usmerjevalnika modula, vpetega z
`apiV1Router.use(fileSharingRouter)` kot vsak drug modul. Javne so izključno zato, ker **ne
kličejo `requireScopes`**. Nobene nove `app.use` vrstice pred vratarji ni.

**Zakaj:** vratarja v `main.ts` zahteve brez poverilnic ne zavrneta — `apiKeyGuard` in
`accessTokenGuard` samo nastavita `req.auth`, kadar ustrezna glava obstaja
(`access-token.service.ts:59-63`). Zavrne šele `requireScopes`
(`platform/auth/scopes.ts:38-40`). Pot brez tega klica je torej javna, a še vedno teče skozi
korelacijo, obravnavo napak in vse ostalo, kar velja za `/api/v1`. Pot pred vratarji (vzorec
`/health`) bi to preskočila brez potrebe.

**Posledica, ki mora biti vidna v kodi:** javnost ne sme biti razvidna šele iz odsotnosti
enega klica. Zato so vse javne poti v **ločeni datoteki** `modules/file-sharing/public.router.ts`
z glavo, ki to pove, in pod skupno predpono `/share/*`. Lastnikovi endpointi so v `router.ts`
in vsak od njih `requireScopes` kliče. Pogodbeni test (`tests/contract/file-sharing.spec.ts`)
preveri oboje: da `/share/*` brez žetona deluje in da vsak `/files*` brez žetona vrne 401.

**Veljaven žeton na javni poti:** če lastnik odpre svojo povezavo prijavljen, bo interceptor
odjemalca `Authorization` glavo pripel. Javne poti `req.auth` **ignorirajo** — ne preverjajo
ga in se po njem ne obnašajo drugače (FR-024). Edina nevarnost bi bila neveljaven žeton
(potekla seja), ki ga `accessTokenGuard` zavrne s 401, preden pride do usmerjevalnika. Zato
javna stran odjemalca svojih zahtev pošilja **brez** `Authorization` glave; to je ena vrstica
v interceptorju (izvzeta predpona `/api/v1/share/`) in je pogojena s testom.

**Zavrnjeno:** ločen Express `app.use('/share', …)` pred vratarji (podvojil bi obravnavo
napak in korelacijo); `requireScopes` z izmišljenim "javnim" obsegom (vratar, ki nikogar ne
ustavi, je slabši od odsotnosti vratarja, ker je videti kot zaščita).

## §3 Nalaganje je dvostopenjsko

**Odločitev:** `POST /files` ustvari zapis iz metapodatkov (ime, napovedana velikost, rok) in
vrne `id`; `PUT /files/{id}/content` prinese bajte. Šele odgovor na `PUT` vsebuje povezavo in
geslo.

**Zakaj tri stvari hkrati:**

1. **Kvota in meja velikosti se preverita, preden priteče prvi bajt.** Enostopenjsko
   nalaganje bi 500 MB sprejelo in šele nato ugotovilo, da kvota ne dopušča.
2. **`Idempotency-Key` dobi endpoint, ki ga zna izpolniti.** Glava se primerja prek
   `hashBody(req.body)`; pri binarnem telesu je `req.body` prazen in bi bila zgoščitev za
   vsako datoteko enaka (`platform/idempotency/middleware.ts:38-46`, ugotovitev iz 007). Prvi
   korak je JSON in obljubo izpolni; drugi je binaren in glave ne potrebuje.
3. **Delno naložena datoteka ima svoje stanje.** Zapis obstaja kot `uploading` in ni na
   seznamu; §15 pove, kdaj izgine.

**Zakaj geslo nastane šele ob koncu `PUT`:** shranjen je samo nepovraten povzetek (§7), zato
čistopisa ni mogoče prihraniti med obema klicema. Geslo za datoteko, ki še ni prispela, tudi
ni za nobeno rabo.

**Zavrnjeno:** `multipart/form-data` z `multer`/`busboy` — nova odvisnost za obrazec z enim
poljem; en sam `POST` z binarnim telesom — izgubi kvoto pred prenosom in idempotentnost.

## §4 Pretakanje: 500 MB ne sme skozi pomnilnik

**Odločitev:** `PUT /files/{id}/content` bere telo neposredno v datoteko
(`req.pipe(fs.createWriteStream(...))`), prenos nazaj gre prek `res.download()`. Nobenega
`express.raw`, nobenega `Buffer.concat`, nobenega branja celote.

**Zakaj:** vsebnik `api` ima `mem_limit: 1500m` in v njem raste Chromium (`shm_size: '1gb'`,
`infra/docker-compose.yml`). Obstoječi vzorec za binarno telo
(`modules/notes/router.ts:257-283`, `express.raw({ limit })`) je pravilen za 10 MB posnetek in
napačen za 500 MB datoteko: `express.raw` telo zbere v `Buffer`. Dve sočasni nalaganji bi
vsebnik ubili.

**Kako se meja uveljavi dvakrat (FR-003):**

- pred pisanjem iz `Content-Length` (če je odsoten ali večji od meje → `413`, brez odpiranja
  datoteke);
- med pisanjem s štetjem zapisanih bajtov — ob prekoračitvi se tok uniči, delna datoteka
  odstrani in vrne `413`. Napovedana velikost je odjemalčeva obljuba, ne dejstvo.

**Globalni `express.json()` ni ovira:** razčlenjevalnik se prižge samo pri
`application/json`, telo z `application/octet-stream` gre nedotaknjeno naprej.

**Prenos in `Range`:** `res.download(absolutnaPot, prikaznoIme)` uporabi `send`, ki sam
postavi `Content-Length`, `Accept-Ranges` in obravnava `Range` — s tem je FR-025
(nadaljevanje prekinjenega prenosa) izpolnjen brez lastne kode. Lastna implementacija
delnega odgovora je zavrnjena: `Range` ima robove (več razponov, `If-Range`), ki jih `send`
že pozna.

**Odjemalec:** Angularjev `HttpClient` z `reportProgress: true` in telesom tipa `File`. XHR
datoteko pretaka iz diska in ne naloži v pomnilnik brskalnika, `HttpEventType.UploadProgress`
pa je napredek iz FR-005. `fetch` je zavrnjen: napredek nalaganja zahteva
`ReadableStream` telo z ročnim rezanjem in `duplex: 'half'`, kar je več kode za isto.

## §5 Razporeditev na disku, začasne datoteke, atomarna objava

**Odločitev:**

```text
$FILE_SHARE_DIR/
  tmp/<storageId>.part      med nalaganjem
  blobs/<xx>/<storageId>    po uspešnem nalaganju  (xx = prva dva znaka storageId)
```

`storageId` je 32 šestnajstiških znakov iz `randomBytes(16)`. Ob uspešnem koncu se datoteka
**preimenuje** iz `tmp/` v `blobs/` — `fs.rename` je znotraj istega nosilca atomaren, zato
datoteka v `blobs/` po definiciji pomeni dokončano nalaganje. Delna datoteka v `blobs/` ne
more nastati.

**Zakaj `xx` predal:** nekaj tisoč vnosov v eni mapi upočasni vsako operacijo nad njo; dva
znaka dasta 256 predalov in to zadošča za red velikosti iz predpostavk specifikacije.

**Zakaj `storageId` in ne uporabnikovo ime datoteke:** ime datoteke je uporabnikov vnos in
nikoli ne sme postati pot (FR-007). `storageId` je naključen, ne pove ničesar o vsebini in ni
uganljiv, tudi če bi kdo dobil dostop do imenika.

**Pogoj, ki mora biti zapisan v `tasks.md`:** `tmp/` in `blobs/` MORATA biti na istem
nosilcu, sicer `rename` ni atomaren, ampak kopiranje. Oba sta pod `FILE_SHARE_DIR`, kar to
zagotavlja, dokler nihče ne prekrije le enega od njiju.

## §6 Oblika povezave in žeton (odprto vprašanje 2)

**Odločitev:** javna povezava je `{PUBLIC_BASE_URL}/d/{token}`, kjer je `token`
`randomBytes(16)` v `base64url` (22 znakov, 128 bitov). Zbirka ima nad njim unikaten indeks;
ob (praktično nemogočem) trku se generiranje ponovi.

**Zakaj `/d/` in ne `/file-sharing/…`:** povezava gre tujim ljudem in v tuje pogovore. Kratka
je berljiva in se ne lomi v e-pošti. Predvsem pa **ni videti kot zavihek**: `tabGuard`
preverja točno ujemanje poti z registrom (`app.routes.ts`, komentar pri `notes/:noteId`), in
pot, ki ni v registru, se ne more pomotoma znajti v meniju.

**Zakaj ne Mongo `_id`:** `ObjectId` nosi časovni žig in števec — dva zaporedno naložena
zapisa se razlikujeta v nekaj bitih. Povezava mora biti neuganljiva tudi za nekoga, ki že ima
eno (FR-014).

**API pot je ločena od poti strani:** stran je `/d/{token}` (SPA), pogodba pa
`/api/v1/share/{token}*`. Ločitev je namerna — predpona `/share/` je v zaledju **oznaka za
javno** (§2) in mora biti prepoznavna v vsaki zahtevi, tudi v dnevniku Caddyja.

## §7 Geslo: generiranje, oblika, hramba

**Odločitev:**

- **Generiranje:** 16 znakov iz 32-znakovne abecede brez dvoumnih znakov
  (`0/O`, `1/l/I` izpuščeni) → 80 bitov. Vir je `crypto.randomInt`/`randomBytes` z zavrnitvijo
  ostanka, da porazdelitev ostane enakomerna. Prikaz je razdeljen v štiri četvorke
  (`H7K2-9MTX-4RQP-VN63`) — geslo je pogosto treba prebrati po telefonu.
- **Hramba:** `scrypt` iz `node:crypto`, `N=32768, r=8, p=1`, 16-bajtna sol, 64-bajtni izhod,
  zapisano kot `scrypt$32768$8$1$<sol base64>$<povzetek base64>`. Parametri so DEL zapisa, da
  jih je pozneje mogoče dvigniti brez migracije.
- **Primerjava:** `crypto.timingSafeEqual` nad dvema 64-bajtnima izhodoma. Ker sta oba enake
  dolžine, je pogoj funkcije vedno izpolnjen (nad surovima geslama ne bi bil).

**Zakaj scrypt in ne `secret-box.ts`:** `platform/crypto/secret-box.ts` je AES-256-GCM in
obstaja za poverilnice kamer, ki jih mora strežnik **prebrati nazaj**. Geslo za prenos se ne
bere nazaj. Šifrirano geslo bi pomenilo, da ga ključ iz `.env` razkrije — natanko tisto, kar
FR-012 prepoveduje.

**Podrobnost, ki jo je lahko spregledati:** `N=32768, r=8` porabi `128 · N · r` = 32 MiB, kar
je natanko privzeti `maxmem` Node.js in klic spodleti. Klicu je zato treba podati
`maxmem: 64 * 1024 * 1024`. Cena ~100 ms na preverjanje je hkrati prvo dušenje: brez vsakega
drugega mehanizma je to ~10 poskusov na sekundo na jedro.

**Zavrnjeno:** bcrypt in argon2 (nova domorodna odvisnost, ki jo je treba prevesti v sliki —
`scrypt` je v Node.js že in je za ta namen dovolj); SHA-256 brez raztezanja (80-bitno geslo bi
ob ukradeni bazi padlo).

## §8 Dovolilnica za prevzem: piškotek, ne parameter v naslovu (odprto vprašanje 3)

**Odločitev:** `POST /share/{token}/unlock` ob pravilnem geslu ustvari zapis v
`fileShareGrants` (naključnih 32 bajtov, `expiresAt` = zdaj + `FILE_SHARE_GRANT_MINUTES`,
privzeto 10) in ga postavi kot piškotek:

```text
Set-Cookie: cd_share=<grant>; Path=/api/v1/share/<token>; HttpOnly; SameSite=Lax;
            Secure; Max-Age=600
```

`GET /share/{token}/content` dovolilnico prebere iz piškotka (`cookie-parser` je že vpet v
`main.ts:43`).

**Zakaj piškotek:** prenos mora sprožiti **navigacija brskalnika** (`window.location.href =
…`), da 500 MB prevzame brskalnikov lastni prenašalnik — z napredkom, nadaljevanjem in
zapisom na disk. Prenos prek `fetch`/XHR bi datoteko sestavil v pomnilniku brskalnika in
naredil na odjemalcu isto napako, ki jo §4 odpravlja na strežniku. Navigacija ne more nositi
glave, zato ostaneta piškotek ali parameter v naslovu.

**Zakaj ne parameter v naslovu:** naslov konča v zgodovini brskalnika, v `Referer` in v
dnevnikih Caddyja. Dovolilnica v njem je kratkotrajen ključ, zapisan na tri mesta, ki jih ne
nadzorujemo.

**Zakaj je dovolilnica zapis v bazi in ne podpisan žeton:** FR-026 zahteva, da preklic
razveljavi tudi že izdano dovolilnico. Podpisanega žetona ni mogoče preklicati, ne da bi
poleg njega vodili seznam preklicanih — kar je isti zapis v bazi, le z več koraki. `Path`
piškotka je vezan na `token`, zato dovolilnica ene datoteke ni poslana pri zahtevi za drugo
(FR-016).

**`SameSite=Lax` zadošča**, ker gre za navigacijo prve stopnje na istem izvoru (člen II).
Brisanje ob poteku prepustimo TTL indeksu, veljavnost pa se **vedno preveri v poizvedbi** —
glej §13.

## §9 Dušenje: nova sestavina, v bazi in ne v pomnilniku (odprto vprašanje 4)

**Odločitev:** modul dobi lasten števec poskusov v zbirki `fileShareAttempts`, z dvema
vrstama ključa: `link:<fileId>` in `ip:<naslov>`. Privzete meje: **10 zgrešenih poskusov v
15 minutah**, nato **60 minut zavrnitve** (vse tri nastavljive). Uspešna odklenitev števec za
povezavo ponastavi. Zavrnitev je `429` prek obstoječega `tooManyRequests()`
(`platform/errors/problem.ts:41`).

**Zakaj sploh:** v tem zaledju danes ni nobenega dušenja — iskanje po `rateLimit|throttle` ne
najde ničesar, `login-throttle.service.ts` je bil v 004 izbrisan, ko je dušenje prijav prevzel
Keycloak. Javen endpoint, ki preverja geslo, je torej prva stvar v tem projektu, ki ga
potrebuje.

**Zakaj v bazi in ne v pomnilniku:** števec v pomnilniku se ob vsakem ponovnem zagonu
ponastavi, kar je za napadalca izhod (in ponovni zagon ni redek dogodek — vsaka posodobitev).
To je isti razlog, ki ga člen V navaja za scheduler: stanje je zapis, ne spremenljivka.

**Zakaj v modulu in ne v `platform/`:** dušenje potrebuje ta modul; posplošitev na skupni
mehanizem brez drugega odjemalca bi bila ugibanje o prihodnji potrebi. Storitev je zato
napisana tako, da je odvisna le od svojega modela in ure — če jo bo potreboval še kdo, je
selitev v `platform/` premik datoteke, ne predelava.

**Dvojni ključ:** samo po povezavi bi napadalec z eno povezavo na naslov obšel mejo tako, da
bi napadal mnogo povezav hkrati; samo po naslovu bi ena zaklenjena pisarna z NAT-om zaklenila
vse za sabo. Meji tečeta vzporedno in prva, ki se izpolni, zavrne.

**Kaj vidi lastnik (FR-033):** `failedAttempts` in `lockedUntil` sta del odgovora
`GET /files/{id}` — ne le vrstica v dnevniku, ki je nihče ne bere.

## §10 `Idempotency-Key` na javni poti — izjema člena III

**Odločitev:** `platform/idempotency/middleware.ts` dobi poleg `EXEMPT_PATHS` še
`EXEMPT_PREFIXES = ['/share/']`. Javne poti glave ne upoštevajo; v pogodbi je to izrecno
zapisano pri vsaki od njih.

**Zakaj je to nujno in ne slog:** `POST /share/{token}/unlock` **izda dovolilnico**, kar je
natanko primer iz izjeme člena III. Brez izvzetja bi bil odgovor z dovolilnico shranjen pod
uporabnikovim ključem in ponovljen tudi po tem, ko je bila povezava preklicana — shranjen
odgovor bi preživel preklic. Člen III to opisuje z istimi besedami za prijavo.

Drugi razlog je javnost poti: `Idempotency-Key` je zapis v bazo, ki ga sproži zahteva brez
poverilnic. Neomejeno pisanje v `IdempotencyKey` z javne poti je pot do polnjenja zbirke.

Člen III hkrati zahteva, da izjema **ni tiha**. Zato je v `contracts/openapi.yaml` pri javnih
poteh izrecno navedeno, da glave ne sprejmejo, in isto piše v opisu modula.

**Lastnikovi endpointi izjeme ne uporabljajo:** `POST /files`, `POST /files/{id}/revoke`,
`DELETE /files/{id}` glavo sprejmejo prek obstoječega middlewara brez sprememb.
`PUT /files/{id}/content` je binaren in ga middleware sam preskoči (007), kar je v pogodbi
prav tako zapisano.

## §11 Kaj vidi prejemnik pred vpisom gesla (odprto vprašanje 1)

**Odločitev:** `GET /share/{token}` vrne `byteSize`, `expiresAt` in nič drugega. Imena
datoteke NE vrne; to pride šele v odgovoru na uspešno odklenitev.

**Zakaj:** velikost prejemnik potrebuje (ve, na kaj se pripravlja, in prepozna, da je povezava
prava). Ime datoteke pogosto pove vsebino — `pogodba-najem-2026.pdf` je podatek, ki bi ušel
vsakomur, ki naslov dobi naprej, in bi izničil polovico obljube "url IN geslo".

**Zavrnjeno:** pokazati ime (udobno, a razkrije, kar geslo ščiti); ne pokazati ničesar
(prejemnik ne bi vedel, ali je povezava sploh živa, in bi vpisoval geslo v prazno).

## §12 Novo geslo pomeni novo povezavo

**Odločitev:** `POST /files/{id}/password` ustvari **nov `token` in novo geslo** ter
razveljavi vse obstoječe dovolilnice za to datoteko. Stara povezava od tega trenutka odgovarja
enako kot neznana.

**Zakaj:** namen izdaje novega gesla je odvzeti dostop tistemu, ki ima staro. Če naslov ostane
isti, ostane polovica ključa v rokah prejšnjega prejemnika. Vmesnik zato izrecno pove, da je
treba poslati **oboje** znova — sicer bi uporabnik poslal le geslo in bi se čudil, zakaj
povezava ne dela.

**Zavrnjeno:** obdržati naslov in zamenjati samo geslo (prijaznejše za pošiljatelja, a je
ravno to napačna polovica).

## §13 Zapadlost se preverja v poizvedbi, TTL indeks je samo pospravljanje

**Odločitev:** `fileShareGrants` in `fileShareAttempts` imata TTL indeks, a nobena
avtorizacijska odločitev se nanj ne zanaša: vsaka poizvedba dovolilnice ima `expiresAt: { $gt:
now }` v pogoju, vsak izračun dušenja pa primerja čas sam.

**Zakaj:** MongoDB TTL monitor teče na ~60 sekund in nič ne obljublja o zamiku. Dovolilnica,
ki je "potekla, a je še v bazi", bi bila brez pogoja v poizvedbi veljavna do minuto predolgo.
TTL indeks je tu higiena zbirke, ne varovalka.

## §14 Ko se zapis in vsebina razideta (odprto vprašanje 5)

**Odločitev:** tri stanja, vsako s svojim ravnanjem:

| Stanje | Kdaj nastane | Kaj naredi sistem |
|---|---|---|
| Zapis brez vsebine | ročni poseg, obnovitev baze iz kopije, izgubljen nosilec | Prevzem vrne `503` z jasnim razlogom; zapis dobi `state: 'broken'`; lastnik ga na seznamu vidi kot pokvarjenega in ga lahko izbriše. |
| Vsebina brez zapisa | prekinjeno nalaganje, obnovitev nosilca brez baze | Pometač (§15) jo odstrani, a šele ko je starejša od 24 ur — mlajša je lahko nalaganje, ki ravno teče. |
| Velikost se ne ujema | okrnjena datoteka, poln disk med pisanjem | Prevzem se zavrne kot okvara; datoteka se ne postreže delno. |

**Zakaj tako in ne tiho:** člen VII zahteva, da sistem zna povedati, da je pokvarjen. Prenos
prazne ali okrnjene datoteke, ki je videti uspešen, je natanko tiha napaka iz člena VI.
Preverjanje je poceni: `fs.stat` pred odgovorom je en klic.

## §15 Pometač modula: dohitevajoč, idempotenten, lasten (odprto vprašanje 6)

**Odločitev:** `startFileShareCleanup(env, logger)` se zažene iz `main.ts` (ena vrstica, ob
`startScheduler`), teče takoj ob zagonu in nato vsakih `FILE_SHARE_CLEANUP_INTERVAL_MINUTES`
(privzeto 60). Vsak zagon opravi štiri opravila:

1. **Potekle datoteke** — `expiresAt` starejši od `FILE_SHARE_RETENTION_DAYS` (privzeto 7) →
   izbriši vsebino in zapis.
2. **Obtičala nalaganja** — `state: 'uploading'`, starejša od `FILE_SHARE_UPLOAD_TIMEOUT_MINUTES`
   (privzeto 360) → izbriši `.part` in zapis.
3. **Osirotele vsebine** — datoteka v `blobs/` ali `tmp/` brez zapisa in starejša od 24 ur →
   izbriši.
4. **Zapisi brez vsebine** → označi `state: 'broken'` (§14).

**Zakaj lasten in ne obstoječi scheduler:** obstoječi je last modula za beleženje časa; klic
vanj bi bil uvoz med moduloma (člen I). Vzorec je isti, izvod je svoj — in ob odstranitvi
zavihka izgine z modulom vred.

**Zakaj dohitevajoč:** vsak zagon se vpraša "kaj bi moralo biti pobrisano in ni" in to stori.
Zaustavitev čez konec tedna zato ne pomeni, da poteklo ostane za vedno. To je člen V.2,
prenesen na čiščenje.

**Opozorilo iz obstoječe kode:** `SCREENSHOT_RETENTION_DAYS` (`platform/config/env.ts:106`)
je razglašen in ga nihče ne bere — čiščenja posnetkov ni. Ta funkcionalnost te napake ne sme
ponoviti: pometač je **naloga v `tasks.md` s testom**, ne opomba v `.env.example`.

## §16 Meje in kvota kot spremenljivke okolja (odprto vprašanje 8)

**Odločitev:** enajst novih spremenljivk, vse s privzetki v kodi (`.env` ni treba dopolniti):

| Spremenljivka | Privzetek | Kaj pomeni |
|---|---|---|
| `FILE_SHARE_DIR` | `/app/data/files` | koren hrambe; vzorec `SCREENSHOT_DIR` |
| `FILE_SHARE_MAX_MB` | `500` | največja ena datoteka (FR-002) |
| `FILE_SHARE_QUOTA_MB` | `5000` | skupna kvota na uporabnika (FR-009) |
| `FILE_SHARE_DEFAULT_EXPIRY_DAYS` | `7` | privzeti rok povezave (FR-040) |
| `FILE_SHARE_RETENTION_DAYS` | `7` | koliko po poteku vsebina še obstaja |
| `FILE_SHARE_GRANT_MINUTES` | `10` | veljavnost dovolilnice (§8) |
| `FILE_SHARE_ATTEMPT_LIMIT` | `10` | zgrešeni poskusi do zavrnitve (§9) |
| `FILE_SHARE_ATTEMPT_WINDOW_MINUTES` | `15` | okno, v katerem se štejejo |
| `FILE_SHARE_LOCK_MINUTES` | `60` | koliko traja zavrnitev |
| `FILE_SHARE_CLEANUP_INTERVAL_MINUTES` | `60` | perioda pometača (§15) |
| `FILE_SHARE_UPLOAD_TIMEOUT_MINUTES` | `360` | kdaj je nalaganje obtičalo |

**Kvota se preveri dvakrat**, iz istega razloga kot velikost (§4): iz napovedane velikosti ob
`POST /files` in med pisanjem. Vsota zasedenega se izračuna z agregacijo po `userId` nad
zapisi, ne s štetjem datotek na disku — disk je posledica, zapis je resnica.

## §17 Caddy: stiskanje in prehodnost 500 MB

**Odločitev:** `encode gzip` v `infra/Caddyfile` dobi ujemanje po vrsti vsebine:

```caddyfile
encode gzip {
    match {
        header Content-Type text/*
        header Content-Type application/json*
        header Content-Type application/javascript*
        header Content-Type image/svg+xml*
    }
}
```

**Zakaj:** brez ujemanja Caddy poskusi stisniti tudi 500 MB posnetek ali arhiv, ki je že
stisnjen — poraba procesorja brez učinka. Hkrati se s tem `Content-Length` na prenosu ohrani,
kar je pogoj, da prejemnik vidi napredek in da nadaljevanje prekinjenega prenosa deluje
(§4).

**Kaj je bilo preverjeno in ni treba spreminjati:** `reverse_proxy` v Caddyju nima privzete
meje velikosti telesa (`request_body max_size` je neobvezna direktiva in ni nastavljena) in
telo pretaka, ne pufra. `PUBLIC_BASE_URL` je že v uporabi in je osnova za sestavljanje javne
povezave.

## §18 Zavihek je privzeto izklopljen (odprto vprašanje 7)

**Odločitev:** vnos v `TAB_REGISTRY` z `enabled: false`.

**Zakaj deluje:** `resolveTabs` prekrije privzetek iz registra z osebno nastavitvijo
(`platform/tabs/resolver.ts`), `listAllTabsForUser` pa vrne **tudi izklopljene** zavihke, prav
zato, da jih zaslon za urejanje menija lahko pokaže in vklopi. Privzeto izklopljen zavihek je
torej podprt, ne da bi se karkoli spremenilo — 009 je le prvi, ki to izkoristi.

**Zakaj tako:** dopolnilo zahteve ("modul samo za uporabnika, če si ga enabla") postavlja ta
modul kot stvar izbire, za razliko od obstoječih, ki so del tega, kar CleverDash je.

**Posledica, ki je ne smemo spregledati:** izklop zavihka NE prekliče deljenih povezav
(FR-072). Javna pot `/d/{token}` ne gre skozi `tabGuard` in ne pogleda lastnikovih nastavitev
— nastavitev prikaza ne sme tiho postati stikalo, ki drugim ljudem pretrga prenos.

## §19 Obsegi

**Odločitev:** `file-sharing:read` in `file-sharing:write` v `modules/file-sharing/scopes.ts`,
oba dodana v `BASE_USER_SCOPES` (`platform/keycloak/role-mapping.ts`).

**Zakaj tako poimenovana:** obsegi se v tem projektu imenujejo po modulu (`cameras:*`,
`notes:*`, `timesheet:*`). Brez vpisa v `BASE_USER_SCOPES` bi zavihek delal samo
administratorju — `docs/adding-a-tab.md`, korak 5.

**Javne poti obsegov ne zahtevajo** in jih tudi ne smejo: prejemnik nima računa, torej nima
nobenega obsega.

## §20 Ime datoteke: čiščenje in `Content-Disposition`

**Odločitev:** `domain/file-name.ts` je čista funkcija: obreže presledke, odstrani ločila poti
(`/`, `\`), zaporedja `..`, krmilne in nevidne znake, skrajša na 200 znakov ob ohranitvi
končnice in vrne `datoteka` za vnos, od katerega ne ostane nič. Rezultat je **prikazno ime**
in nikoli pot — pot je `storageId` (§5).

Pri prevzemu `res.download(pot, prikaznoIme)` sestavi `Content-Disposition` z obema oblikama
(`filename` in `filename*=UTF-8''…`), tako da šumniki preživijo v vseh brskalnikih.

**Zakaj tudi ob `storageId` še čistiti:** ime konča v glavi odgovora. Znak za novo vrstico v
imenu datoteke je vbrizg v glave odgovora, tudi kadar ime nikoli ni pot.

## §21 Kaj nadomešča štiri poimenske primere iz kakovostnih vrat (točka 2)

Vsi štirje primeri iz ustave (prehod na poletni/zimski čas, praznik na delovni dan, dopust
prek meje meseca, neuspel klik z uspehom ob ponovitvi) so v 009 **brez predmeta**: modul nima
koledarja, schedulerja ne akcije na tuji strani. Ustava pravi, da molk ne šteje, zato je tu
izrecno zapisano, kaj jih nadomešča:

| Nadomestni primer | Kje | Kaj dokazuje |
|---|---|---|
| Preverjanje gesla ne izda ujemajoče se predpone | `domain/share-password.ts` | pravilno in napačno geslo z enako dolžino uporabita isto pot; primerjava gre prek `timingSafeEqual` |
| Oblika in razčlenitev zapisa gesla | `domain/share-password.ts` | zapis nosi parametre; povzetek z drugimi parametri se še vedno preveri |
| Izračun in iztek roka veljavnosti | `domain/share-lifecycle.ts` | `expiresAt` iz izbire (1/7/30/brez); "brez roka" ni `0` ne `null`, ki bi pomenil poteklo |
| Prehodi stanj | `domain/share-lifecycle.ts` | `uploading → ready → revoked`, `ready → broken`; potekli se IZPELJE iz časa in ni shranjeno stanje |
| Števec dušenja na meji okna | `domain/attempt-window.ts` | deseti poskus v oknu še gre, enajsti ne; poskus tik po izteku okna začne novo okno |
| Ponastavitev števca ob uspehu | `domain/attempt-window.ts` | pravilno geslo pobriše števec povezave, ne pa števca naslova |
| Čiščenje imena datoteke | `domain/file-name.ts` | `../../etc/passwd`, ime z novo vrstico, 300 znakov, prazno ime, samo končnica |
| Izračun kvote | `domain/quota.ts` | vsota zasedenega + napovedana velikost proti meji; robna enakost je še dovoljena |
| Meja velikosti med pisanjem | `domain/size-guard.ts` | števec bajtov prekorači mejo za en bajt → zavrnitev |

Vsi so čiste funkcije brez baze, omrežja in datotečnega sistema (člen IX).

## §22 Kaj se zgodi s prenosom v teku ob preklicu

**Odločitev:** preklic postavi `state: 'revoked'` in izbriše dovolilnice. Nove zahteve so
zavrnjene takoj. Prenos, ki že teče, se **prekine** — zapis se preveri ob začetku odgovora,
tok pa se zapre, ko storitev ob preklicu zapre odprte odgovore za to datoteko.

**Zakaj ne pustimo, da se dokonča:** FR-041 pravi "takoj". Uporabnik, ki prekliče povezavo,
to naredi zato, ker si je premislil ali ker mu je ušla — dokončan prenos bi obljubo izničil.
Prejemnik dobi nepopolno datoteko; to je iskani izid, ne napaka.

**Zavrnjeno:** čakanje na konec tekočih prenosov (preklic 500 MB prenosa bi lahko trajal
minute).

## §23 Kaj odjemalec pokaže, medtem ko se nalaga

**Odločitev:** nalaganje teče v storitvi (`core/file-sharing/upload.store.ts`), ne v
komponenti strani, in preživi odhod na drug zavihek. Napredek je iz
`HttpEventType.UploadProgress`; preklic je `unsubscribe`, ki XHR prekine, čemur na strežniku
sledi dogodek `aborted` in odstranitev `.part` datoteke (§15, opravilo 2 je le mreža pod
tem).

**Zakaj:** 500 MB se na domači povezavi nalaga minute. Nalaganje, ki se prekine, ker je
uporabnik pogledal koledar, bi bilo neuporabno.
