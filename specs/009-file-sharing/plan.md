# Implementation Plan: Deljenje datotek

**Spec**: [spec.md](./spec.md) | **Pogodba**: [contracts/openapi.yaml](./contracts/openapi.yaml)
**Raziskava**: [research.md](./research.md) | **Podatkovni model**: [data-model.md](./data-model.md)
**Preverjanje**: [quickstart.md](./quickstart.md)
**Vhodno gradivo**: `nacrt/009-file-sharing/spec.md`
**Datum**: 2026-09-02

## Summary

Nov zavihek "Deljenje datotek": prijavljen uporabnik naloži datoteko do 500 MB in dobi
povezavo ter geslo, ki ju pošlje zunanjemu prejemniku. Prejemnik nima računa in ga ne bo
dobil — datoteko prevzame na javni strani `/d/{token}`, potem ko vpiše geslo. Brez enega od
obojega prenosa ni.

Modul se od vseh dosedanjih loči v dvojem, in oboje določa ta načrt:

1. **Vsebina je prevelika za dosedanje vzorce.** Zvok beležk (007) gre v Mongo kot `Buffer`
   prek `express.raw`; pri 500 MB je oboje napaka — dokument presega mejo Monga, `express.raw`
   pa bi telo zbral v pomnilnik vsebnika, ki ima `mem_limit: 1500m` in v njem že raste
   Chromium. Vsebina zato teče **neposredno na disk** (`req.pipe` → `createWriteStream`) na
   nov Docker nosilec, nazaj pa prek `res.download()`, ki sam obvlada `Range`
   (research.md §4, §5).
2. **Del vmesnika je javen.** To je prva neavtenticirana pot v tem zaledju in prvi zaslon SPA
   brez `authGuard`. Javnost ni nov vratar, ampak **odsotnost klica `requireScopes`** na
   poteh pod `/share/*`, zbranih v ločeni datoteki, ki to pove z imenom (research.md §2).
   Iz javnosti sledi tudi edina resnično nova sestavina: **dušenje poskusov gesla**, ki ga v
   tem projektu doslej ni bilo nikjer (research.md §9).

Vse ostalo je znan vzorec: modul z lastnim usmerjevalnikom in lastnimi zbirkami po razporeditvi
beležk (007), osebni zapisi s 404 namesto 403 (003, 007, 008), en vnos v `TAB_REGISTRY`, ena
pot v `app.routes.ts`, pogodba OpenAPI 3.1 pred zasloni.

## Technical Context

**Jezik / okolje**: TypeScript 5 (`strict: true`), Node.js 22 + Express 5 + Mongoose 8 na
strani API-ja; Ionic 8 + Angular 20 (standalone, signals) na strani odjemalca.

**Nove odvisnosti**: nobene. Pretakanje je `node:fs` in `node:stream`, geslo je `scrypt` iz
`node:crypto`, `Range` in `Content-Disposition` obvlada `res.download()` (Expressov `send`),
piškotek bere `cookie-parser`, ki je že vpet. Zavrnjeni so `multer`/`busboy` (telo je ena
datoteka, ne obrazec), `bcrypt`/`argon2` (domorodna gradnja za tisto, kar `scrypt` zna) in
knjižnica za dušenje (potrebujemo trajen števec, ne pomnilniškega).

**Shramba**: MongoDB — tri nove zbirke (`sharedFiles`, `fileShareGrants`,
`fileShareAttempts`); **vsebina datotek je zunaj baze**, na novem nosilcu `shared-files`
(`/app/data/files`). Nič se ne migrira.

**Testiranje**: Vitest proti v-pomnilniški MongoDB (obstoječa postavitev), pogodbeni testi
prek `supertest` (vključno z nalaganjem večjega telesa iz začasne datoteke), enotski testi
domenskih funkcij brez baze, omrežja in datotečnega sistema.

**Ciljna platforma**: isti Docker Compose kot 001–008, **z dvema spremembama `infra/`**: nov
nosilec za datoteke in ujemanje po vrsti vsebine pri `encode gzip` v Caddyju
(research.md §17).

**Vrsta projekta**: spletna aplikacija (API + SPA + Android prek Capacitorja).

**Zmogljivostni cilji**: 500 MB naloženo in preneseno celo (SC-001) pri porabi pomnilnika, ki
ne raste z velikostjo datoteke (SC-002). Preverjanje gesla ~100 ms (scrypt, research.md §7) je
namerno počasno.

**Omejitve**: `mem_limit: 1500m` na vsebniku `api`; javna pot brez avtentikacije; dušenje, ki
mora preživeti ponovni zagon.

**Obseg**: 3 zbirke, 11 endpointov (8 lastnikovih, 3 javni), 1 zavihek z enim pogledom, 1
javna stran zunaj zavihkov, 1 pometač.

## Constitution Check

Ocenjeno proti `.specify/memory/constitution.md` **v1.1.0**.

| Člen | Stanje | Kako ga ta načrt izpolni |
|---|---|---|
| I. Zavihek je modul | ✅ z enim odstopanjem | Vsa koda API-ja je v `modules/file-sharing/` (vključno z domensko plastjo, vzorec 007), vsa koda odjemalca v `features/file-sharing/`. Nobenega uvoza iz drugega modula. Pometač je lasten in ne kliče schedulerja iz 002. **Odstopanje:** ena vrstica v `platform/idempotency/middleware.ts` (§10) — utemeljeno v Complexity Tracking. |
| II. Enotni izvor | ✅ | Nove poti pod `/api/v1/files*` in `/api/v1/share/*`, isti Express app, isti Caddy, brez `cors()`. Javna stran je pot iste SPA (`/d/:token`), ne ločena aplikacija ne poddomena. Piškotek dovolilnice deluje **prav zato**, ker sta stran in API na istem izvoru (research.md §8). |
| III. API-first | ✅ | Pogodba OpenAPI 3.1 nastane pred zasloni. Vsaka operacija vmesnika ima endpoint (SC-009), tudi nalaganje. Mutacije lastnika sprejmejo `Idempotency-Key`. **Izjema člena III je uveljavljena in zapisana**, ne tiha: javne poti glave ne sprejmejo, ker `POST /share/{token}/unlock` izdaja dovolilnico — pogodba to navaja pri vsaki javni poti (research.md §10). |
| IV. Nobene skrivnosti | ✅ | Nobene nove skrivnosti. Enajst novih spremenljivk okolja so poti in številčne meje s privzetki v kodi. Geslo za prenos je edina nova občutljiva vrednost in **ni skrivnost sistema, ampak podatek, ki ga ne hranimo**: v bazi je le `scrypt` povzetek, v dnevnik ne pride nikoli (FR-032), v odgovoru je natanko enkrat. |
| V. Determinističen scheduler | ✅ prilagojeno | 009 ne uvaja načrtovanih akcij, uvaja pa periodičen pometač. Ta izpolni V.2 in V.3 po analogiji: ob vsakem zagonu se vpraša "kaj bi moralo biti pobrisano in ni" (dohitevanje), je idempotenten (dvakrat pobrisano je enkrat pobrisano) in nima stanja v pomnilniku. Časov, vezanih na koledarski dan, modul nima; `expiresAt` je UTC instant. |
| VI. Nobene neverificirane akcije | ✅ | Modul ne izvaja akcij na tujih sistemih. Načelo se tu bere kot prepoved tihe napake: brisanje, ki ne uspe, in prenos vsebine, ki je ni ali je okrnjena, sta VIDNA (`state: 'broken'`, `503` z razlogom) — nikoli tih uspeh (research.md §14). |
| VII. Sistem pove, da je pokvarjen | ✅ | Tri stanja okvare so v odgovoru API-ja in v vmesniku, ne le v dnevniku: pokvarjen zapis, zaklenjena povezava (`lockedUntil`), spodletelo nalaganje. Neuspeli poskusi gesla gredo v strukturiran dnevnik z ID-jem korelacije, brez poskušenega gesla. |
| VIII. Vljudnost do zunanjih virov | brez predmeta | Modul ne kliče nobenega tujega sistema. Obrat je zanimivejši: tu smo MI zunanji vir tujemu odjemalcu, zato javna pot spoštuje `Range` in ne sili prejemnika v ponovni prenos od začetka. |
| IX. Testabilno brez brskalnika | ✅ | Vsa logika, ki se lahko zmoti, je v čistih funkcijah: `share-password.ts`, `share-lifecycle.ts`, `attempt-window.ts`, `file-name.ts`, `quota.ts`, `size-guard.ts`. Nobena ne potrebuje baze, omrežja, datotečnega sistema ne TestBeda (research.md §21). |
| X. Slovenščina v domeni, angleščina v kodi | ✅ | `id` zavihka, poti, polja in zbirke so angleški (`file-sharing`, `sharedFiles`, `expiresAt`, `state`); naslov zavihka ("Deljenje datotek"), besedilo javne strani in vsa sporočila so slovenska. Vrednosti `state` so angleški identifikatorji z ločeno preslikavo v slovenske značke. |
| XI. Mobilna naprava je odjemalec | ✅ | Nič se ne planira na napravi. Pometač, meje in dušenje so na strežniku; naprava samo nalaga in prikazuje. |
| XII. Meje | ✅ | Modul ne zaobide ničesar in ne skriva ničesar. Nasprotno — uvaja NOVO omejitev (dušenje) in namerno počasno preverjanje gesla. Vsebine naloženih datotek ne bere, ne indeksira in ne pošilja nikamor (FR-054). |

### Kakovostna vrata

| Vrata | Kako se izpolnijo v 009 |
|---|---|
| 1. Čist `typecheck` in `lint`, brez `any` v domenski plasti | Isto pravilo kot 001–008. Mejo med moduli uveljavlja `cleverdash/module-boundary` v `eslint.config.js`; nov modul je pod istim pravilom. Tokovi (`Readable`, `WriteStream`) so tipizirani iz `node:stream`/`node:fs`, brez `any` na prehodu. |
| 2. Enotski testi domenske logike | **Vsi štirje poimenski primeri (poletni/zimski čas, praznik na delovni dan, dopust prek meje meseca, neuspel klik z uspehom ob ponovitvi) so v 009 BREZ PREDMETA** — modul nima koledarja, schedulerja ne akcije na tuji strani. Ker "molk ne šteje", je nadomestni nabor naštet poimensko v [research.md §21](./research.md): preverjanje gesla brez izdaje predpone, izračun in iztek roka, prehodi stanj, števec dušenja na meji okna in ponastavitev ob uspehu, čiščenje imena datoteke, izračun kvote, meja velikosti za en bajt. Vsak od njih je naloga v `tasks.md`. |
| 3. Posodobljena in validna OpenAPI pogodba | [contracts/openapi.yaml](./contracts/openapi.yaml), pisana pred zasloni. Naloga v `tasks.md` doda cilj v `packages/contracts/scripts/generate.ts`, da je razrešljivost pogodbe del gradnje. |
| 4. `docker compose up` iz čiste kopije | **Dve spremembi `infra/`**, obe brez ročnega posega operaterja: nov nosilec `shared-files` (Docker ga ustvari sam ob prvem zagonu) in ujemanje pri `encode gzip`. Nobene nove OBVEZNE spremenljivke okolja — vseh enajst ima privzetke v kodi in so v `.env.example` označene kot neobvezne. |
| 5. Nobenega niza, ki je videti kot skrivnost | 009 ne uvaja nobene skrivnosti v git. Nasprotno: geslo, dovolilnica in vsebina piškotka so izrecno izvzeti iz dnevnika, kar je naloga s testom, ne opomba. |

**Izid vrat: prehod, z enim odstopanjem (`platform/idempotency`), utemeljenim spodaj.**

## Project Structure

### Dokumentacija

```text
specs/009-file-sharing/
├── plan.md              # ta datoteka
├── research.md          # Phase 0 — odločitve (§1–§23)
├── data-model.md        # Phase 1 — zbirke, indeksi, stanja, disk
├── quickstart.md        # Phase 1 — kako se preveri, da dela
├── contracts/openapi.yaml
├── checklists/requirements.md
└── tasks.md             # Phase 2 — /speckit-tasks, ne nastane tu
```

### Nova koda (API)

Razporeditev je prevzeta od modula beležk (007): domenska plast je V MODULU, ne v skupnem
`apps/api/src/domain/` — ob odstranitvi zavihka mora izginiti tudi njegova domenska koda
(člen I).

```text
apps/api/src/
  modules/file-sharing/
    domain/file-name.ts            čiščenje prikaznega imena (čista)
    domain/share-password.ts       generiranje, zapis in preverjanje gesla (čista)
    domain/share-lifecycle.ts      izračun roka, izpeljano stanje, dovoljeni prehodi (čista)
    domain/attempt-window.ts       števec poskusov v oknu in zaklep (čista)
    domain/quota.ts                vsota zasedenega proti meji (čista)
    domain/size-guard.ts           meja velikosti med pisanjem (čista)
    models/shared-file.model.ts
    models/file-share-grant.model.ts
    models/file-share-attempt.model.ts
    services/blob-storage.service.ts   pot, pisanje v tmp, atomarna objava, brisanje
    services/upload.service.ts         pretakanje telesa, dvojna meja, čiščenje ob prekinitvi
    services/throttle.service.ts       trajen števec poskusov (research.md §9)
    services/cleanup.service.ts        pometač: potekli, obtičali, siroti, pokvarjeni
    scopes.ts                          file-sharing:read / file-sharing:write
    router.ts                          lastnikovi endpointi — vsak z requireScopes
    public.router.ts                   JAVNE poti /share/* — brez requireScopes, z glavo,
                                       ki pove, zakaj
```

`public.router.ts` je ločen namenoma: javnost mora biti razvidna iz imena datoteke, ne iz
odsotnosti enega klica sredi 300 vrstic (research.md §2).

### Nova koda (web)

```text
apps/web/src/app/
  core/file-sharing/
    shared-file.model.ts
    file-sharing.store.ts        seznam, preklic, brisanje, novo geslo
    upload.store.ts              nalaganje z napredkom, preživi menjavo zavihka (§23)
  features/file-sharing/
    file-sharing.page.ts         zavihek: seznam + nalaganje
    share-created.component.ts   enkratni prikaz povezave in gesla, s kopiranjem
    download/file-download.page.ts   JAVNA stran /d/:token — brez authGuard in tabGuard
```

### Vpisi zunaj modula (in nič drugega)

| Datoteka | Sprememba | Zakaj je dovoljena |
|---|---|---|
| `apps/api/src/platform/tabs/registry.ts` | en vnos `file-sharing`, `enabled: false` | docs/adding-a-tab.md korak 2; privzeto izklopljen je podprt (research.md §18) |
| `apps/api/src/main.ts` | `apiV1Router.use(fileSharingRouter)`, `apiV1Router.use(fileSharingPublicRouter)`, `startFileShareCleanup(env, logger)` | koraka 3 in vzorec `startScheduler` |
| `apps/api/src/platform/keycloak/role-mapping.ts` | dva niza v `BASE_USER_SCOPES` | korak 5; niza sta prepisana, ne uvožena |
| `apps/api/src/platform/config/env.ts` | enajst spremenljivk s privzetki | vzorec `SCREENSHOT_DIR` (research.md §16) |
| `apps/api/src/platform/idempotency/middleware.ts` | `EXEMPT_PREFIXES = ['/share/']` | **odstopanje** — glej Complexity Tracking |
| `apps/web/src/app/app.routes.ts` | dve poti: `file-sharing` (z guardoma) in `d/:token` (brez) | korak 4; druga je prva pot SPA brez `authGuard` |
| `apps/web/src/app/core/auth/auth.interceptor.ts` | izvzeta predpona `/api/v1/share/` | da javna stran ne pošilja `Authorization` (research.md §2) |
| `docs/env-reference.md`, `docs/SECURITY-FIRST.md`, `docs/file-sharing-automation.md` | nove spremenljivke, razdelek o javni poti, primer za n8n | člen III in člen IV |
| `apps/web/src/app/core/icons/register-icons.ts` + `tests/unit/icons.spec.ts` | ikoni `cloud-upload-outline`, `lock-closed-outline` | korak 6 |
| `packages/contracts/scripts/generate.ts` | nov cilj `file-sharing.d.ts` | vrata 3 |
| `infra/docker-compose.yml` | nosilec `shared-files:/app/data/files` | vrata 4 — brez njega vsebina ne preživi posodobitve |
| `infra/Caddyfile` | ujemanje po vrsti vsebine pri `encode gzip` | research.md §17 |
| `.env.example` | enajst neobveznih spremenljivk z opisom | člen IV |

## Popravki med implementacijo

Štiri stvari so bile med pisanjem kode drugačne, kot jih je predvidel ta načrt. Zapisane so
tu, ker so vse štiri odkrili testi in ne premislek — in ker bi bil načrt brez njih od kode
narazen.

| Kaj | Zakaj drugače |
|---|---|
| **Koda odjemalca je vsa v `features/file-sharing/`**, ne razdeljena na `core/file-sharing/` + `features/file-sharing/`, kot je predvideval načrt | Člen I pravi, da je odstranitev zavihka brisanje ene mape. Model in odjemalec v `core/` bi ob brisanju modula ostala kot siroti. Modul beležk (007) ima iz istega razloga `notes.api.ts` in `notes.model.ts` v svoji mapi — načrt je tu odstopal od vzorca, ki ga sicer navaja. |
| **`resolveOwnerUserId(req)`** v `router.ts` (uporabi `platform/auth/automation-owner.ts`) | Načrt tega ni predvidel. API ključ ni vezan na uporabnika (člen III), zato bi `req.auth.subjectId` na zapis vpisal identifikator KLJUČA in datoteka ne bi pripadala nikomur. Isti pomočnik uporabljata `modules/timesheet` in `modules/time-tracking`. |
| **Kvota se preveri trikrat, ne dvakrat**: ob napovedi, takoj po zapisu (samo zapisi z `_id ≤ mojim`) in ob koncu nalaganja z dejansko velikostjo | `tests/integration/file-share-quota-concurrency.spec.ts` je pokazal, da dve VZPOREDNI napovedi obe preberata kvoto, preden katera piše — obe sta šli skozi in kvota je bila presežena. Razsodnik je `_id`: pri dveh hkratnih napovedih uspe natanko prva. Alternativi (transakcija ali števec na uporabniku) sta dražji od ene poizvedbe. |
| **Prevelika zahteva se med pisanjem POŽRE, ne prekine takoj** (do meje še ene velikosti datoteke) | Če strežnik neha brati in odgovori, Node ob nepobranem telesu poruši povezavo (RST) in odjemalec sporočila "datoteka je prevelika" sploh ne vidi — dobi omrežno napako. Isto počne `body-parser` (`dump`). Požiranje je omejeno, da vljudnost do zmotnega odjemalca ne postane brezplačen kanal za tistega, ki laže namerno. |

Dvoje je bilo tudi popravljeno v samem modelu, oboje ob padlem testu:

- **`token` ima DELNI indeks, ne `sparse`.** `sparse` izpusti samo dokumente, kjer polja SPLOH
  NI — ne tistih z vrednostjo `null`. Dve hkratni nalaganji (oba zapisa `token: null`) sta zato
  padli z `E11000 dup key: { token: null }`.
- **Dušenje vrne SKUPNI izid obeh ključev**, ne le izida povezave. Prvotna izvedba je zaklep po
  IZVORNEM NASLOVU zabeležila, a ga ni sporočila — ugibanje po mnogo povezavah z istega naslova
  se ne bi ustavilo. Lastniku se še vedno pokaže samo zaklep POVEZAVE: naslov je zaklenjen
  napadalcu, ne datoteki.

## Complexity Tracking

Eno odstopanje od člena I in dve spremembi `infra/`, ki ju je treba zagovarjati.

| Odločitev | Zakaj je potrebna | Zavrnjena preprostejša možnost |
|---|---|---|
| Ena vrstica v `platform/idempotency/middleware.ts` (`EXEMPT_PREFIXES = ['/share/']`) | Člen III izvzema endpointe, ki izdajajo žetone, in zahteva, da je izjema izrecna. `POST /share/{token}/unlock` izdaja dovolilnico; shranjen odgovor bi preživel preklic povezave — ista okvara, ki jo člen opisuje za prijavo. Obstoječi `EXEMPT_PATHS` primerja `req.path` točno in poti s spremenljivim žetonom ne more zajeti. | Zanašanje na to, da middleware preskoči ne-JSON telo (deluje po naključju, ne po pravilu); prepustiti glavi, da učinkuje (ustvari luknjo po preklicu in dovoli neavtenticirano pisanje v `IdempotencyKey`). |
| Dušenje je storitev v modulu, ne v `platform/` | V zaledju danes ni nobenega dušenja (odstranjeno v 004). Posplošitev brez drugega odjemalca bi bila ugibanje; storitev je odvisna samo od svojega modela in ure, zato je poznejša selitev v `platform/` premik datoteke. | Skupni middleware za ves API — več površine, en sam uporabnik, in nobenega dokaza, kakšne meje bi drugi endpointi sploh potrebovali. |
| Nov nosilec `shared-files` v `infra/docker-compose.yml` | Brez trajnega nosilca bi naložene datoteke izginile ob vsaki posodobitvi slike — modul bi obljubljal, česar ne more držati (vrata 4). Vzorec je že v repozitoriju (`screenshots:/app/data/screenshots`). | Hramba v Mongu (GridFS) — zavrnjena ob prevzemu zahteve, glej research.md §1; hramba v `/tmp` — ne preživi ponovnega zagona vsebnika. |
| Ujemanje po vrsti vsebine pri `encode gzip` v `infra/Caddyfile` | Stiskanje 500 MB posnetka ali arhiva, ki je že stisnjen, porabi procesor brez učinka in po nepotrebnem posega v `Content-Length`, od katerega sta odvisna prikaz napredka in nadaljevanje prenosa. | Pustiti `encode gzip` pri miru (plačamo z zakasnitvijo pri vsakem prenosu); postaviti `Content-Encoding: identity` na naš odgovor (zlorabljena glava zato, da se izognemo pravilnemu popravku ene vrstice v Caddyju). |
| Javna stran je pot iste SPA in ne ločena stran | Člen II zahteva enotni izvor; piškotek dovolilnice (research.md §8) deluje samo pod njim. Ločena statična stran bi pomenila drug izvor ali podvojen build. | Ločen `app.use` pred vratarji v `main.ts` — podvoji obravnavo napak in korelacijo za tri poti. |
