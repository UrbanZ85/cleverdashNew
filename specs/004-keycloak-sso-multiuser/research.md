# Research: Prijava prek Keycloaka in večuporabniška aplikacija

Vsak razdelek rešuje eno tehnično vprašanje, ki ga `spec.md` namenoma ne odloča. Vsi sklepi so
preverjeni proti dejanski kodi 001–003 (`apps/api/src/modules/auth/**`,
`apps/api/src/modules/settings/**`, `apps/api/src/modules/cameras/**`,
`apps/api/src/modules/time-tracking/models/**`), ne proti domnevam o njej.

## 1. Kako naj se SPA sploh "pogovarja" s Keycloakom — BFF, ne javni klient

**Vprašanje**: Angular SPA lahko OIDC izvede na dva bistveno različna načina: (a) kot **javni
klient** neposredno v brskalniku (Authorization Code + PKCE v celoti v JS, žetoni v
`sessionStorage`/pomnilniku SPA), ali (b) kot **zaupanja vreden odjemalec za zaledje**
(backend-for-frontend, BFF) — Express backend izvede izmenjavo kode za žetone, žetonov SPA
nikoli ne vidi, dobi samo `httpOnly` sejni piškotek.

**Odločitev**: (b), BFF. Backend postane "confidential client" pri Keycloaku (ima
`KEYCLOAK_CLIENT_SECRET`), izvede Authorization Code + PKCE izmenjavo na `/auth/callback` in
nastavi sejni piškotek — natanko ista oblika, kot danes dela `cd_refresh` (`httpOnly`,
`secure` v produkciji, `sameSite: strict`, omejen na `/api/v1/auth`).

**Utemeljitev**:
- Člen II (enotni izvor) in obstoječa arhitektura že imata Express kot edino mesto, ki sme
  postavljati piškotke — SPA sploh nima infrastrukture za varno hrambo žetonov (namerna
  odločitev iz 001: `research.md §7`, "dostopni žeton živi samo v pomnilniku, obnovitveni je
  httpOnly piškotek").
- Javni klient bi zahteval CSP izjeme in dostopni žeton bi živel v JS dosegljivem prostoru —
  natanko razred ranljivosti, ki ga je 001 eksplicitno rešila z `httpOnly` piškotkom.
- BFF ohrani obstoječi vzorec `AuthService`/`TokenStore`/`auth.interceptor.ts` skoraj
  nespremenjen po obliki: `login()` postane preusmeritev (`window.location.href =
  '/api/v1/auth/login'`) namesto POST-a z geslom; vse ostalo (tih `silentRefresh()` ob 401,
  `isAuthenticated()` prek prisotnosti dostopnega žetona v pomnilniku) ostane po vzorcu.

**Alternative, zavrnjene**: javni klient (SPA neposredno h Keycloaku) — zavrnjen zaradi
zgoraj; `keycloak-js` Angular adapter (uradna knjižnica za javne kliente) — ni relevanten, ker
ne rešuje BFF primera in bi uvedel odvisnost, ki je ne bi nikoli uporabili.

**Popravek med implementacijo — web IN Android delita isti httpOnly piškotek, brez posebne
Android poti.** Prvotna zamisel (spodaj v §2, prečrtano) je predvidevala, da Android zaradi
"brez piškotkov" potrebuje ločeno, v telesu odgovora vrnjeno neprozorno referenco na sejo
(`sessionReference`). Ta predpostavka je izhajala iz STARE prijave (001): tam je bil
`POST /auth/login` klasičen JSON POST iz izvorne (native) kode, kjer piškotek res ni imel
naravnega mesta. Zdaj je prijava za OBE platformi enak preusmeritveni tok (FR-002 ne loči
web/Android) — Capacitorjev Android WebView pa deli piškotke z lastnimi HTTP klici znotraj
iste aplikacije. Zato `GET /auth/callback` nastavi isti `httpOnly` piškotek za oba primera;
`POST /auth/refresh`/`POST /auth/logout` ju berejo enako, brez telesa zahteve. To poenostavi
`token.store.ts` na samo dostopni žeton v pomnilniku, brez `@capacitor/preferences` za sejo.

## 2. Notranji sejni model — kaj nadomesti `SessionFamily`/`RefreshToken`

**Odločitev**: nov `KeycloakSession` model, ki po obliki posnema `SessionFamily` (ena vrstica
na napravo/brskalnik: `userId`, `deviceLabel`, `platform`, `state`), a namesto lastnega
naključnega obnovitvenega žetona shrani **zgoščeno vrednost Keycloakovega refresh_token**
(šifrirano prek `platform/crypto/secret-box.ts`, že zgrajenega za 003 — ponovna uporaba, ne
nova koda). `POST /auth/refresh` ne generira več lastnega žetona: pokliče Keycloakov `token`
endpoint z `grant_type=refresh_token`, dobi nov `access_token`/`refresh_token` par in
prepiše shranjeno vrednost — rotacija se torej dogaja PRI KEYCLOAKU, CleverDash samo hrani
trenutno veljavno referenco.

Dostopni žeton, ki ga backend vrne SPA (v pomnilniku, kot doslej), je Keycloakov LASTEN
`access_token`, posredovan naprej (relay) — CleverDash zanj ne izdaja/podpisuje lastnega
JWT-ja (popravek med implementacijo: prvotna zamisel "notranji relay JWT, podpisan z
`JWT_ACCESS_SECRET`" je odveč, ker RFC 7662 introspekcija, §4, deluje neposredno nad
katerimkoli žetonom, ki ga odjemalec predloži — vmesno podpisovanje ne bi dodalo ničesar,
samo podvojilo stanje). `JWT_ACCESS_SECRET`/`ACCESS_TOKEN_TTL` iz prvotnega seznama env-ov
(§12) zato odpadeta; Keycloakov `expires_in` pove veljavnost. `jsonwebtoken` ostane v
odvisnostih izključno za notranji sejni piškotek (`SESSION_COOKIE_SECRET`, glej
`session.service.ts`), ne za dostopni žeton.

`LoginAttempt` (grid za throttling neuspelih gesel) odpade v celoti — Keycloak ima svoj
mehanizem (brute-force detection), CleverDash ga ne podvaja (spec.md Out of Scope,
"Omejevanje hitrosti... se seli h Keycloaku").

## 3. Testiranje brez pravega Keycloaka

**Odločitev**: lahek ponarejen OIDC strežnik znotraj testnega procesa (navaden `http.Server`
ali `express()` v testni pomožni datoteki), ki servira minimalen `.well-known/openid-configuration`,
`authorization`, `token`, `introspection` in `end_session` endpoint z vnaprej znanimi odgovori —
po istem načelu kot že obstoječi vzorec `mongodb-memory-server` (prava, a lahka instanca
namesto polnega mocka vsake klicne točke). `openid-client` sam podpira "discovery" prek URL-ja,
zato test samo nastavi `KEYCLOAK_ISSUER_URL` na `http://localhost:<test-port>`.

**Zakaj ne testcontainers + pravi Keycloak**: Keycloak je težka JVM aplikacija (10+ sekund
zagona) — v nasprotju z Mongo (sekunda ali dve prek `mongodb-memory-server`) bi to bistveno
upočasnilo `npm test`. Ker CleverDash implementira samo RP (relying party) stran standardnega
protokola, testiranje proti minimalnemu ponarejenemu IdP-ju preveri isto logiko (parsanje
odgovora, mapiranje vlog, ravnanje z napako/nedosegljivostjo) brez cene resničnega IdP-ja.
Kontraktni test proti pravemu Keycloaku ostane ročni korak v `quickstart.md`, ne del `npm test`.

## 4. Živo preverjanje seje (FR-006/FR-007) proti členu VIII — razrešitev napetosti

**Vprašanje**: uporabnik je izrecno izbral "vsaka pomembnejša zahteva preveri stanje pri
Keycloaku v živo" (spec.md Clarifications), kar pomeni takojšnjo uveljavitev preklica dostopa.
Člen VIII ustave zahteva, da vsak zunanji klic gre prek predpomnilnika z razumnim TTL in da
"frontend NE SME poizvedovati zunanjega vira v zanki" — dobeseden "brez predpomnjenja, na
vsak API klic nov klic h Keycloaku" bi to načelo kršil (in pri N sočasnih zahtevah iste seje,
npr. nalaganje nadzorne plošče z več vzporednimi klici, pomenilo N klicev h Keycloaku za en
uporabniški dogodek).

**Odločitev**: preverjanje veljavnosti seje (Keycloakova `token introspection`, RFC 7662) se
predpomni **po dostopnem žetonu, s TTL v redu velikosti nekaj sekund** (privzeto 5 s,
`KEYCLOAK_INTROSPECTION_CACHE_SECONDS` v env).

**Popravek med implementacijo (glej `/speckit-implement`)**: prvotna zamisel (ponovna uporaba
`platform/cache` `getOrRefresh`/`ExternalCacheModel`, kot pri vremenu/radarju/kamerah) se je
izkazala za NAPAČNO ujemajočo se s FR-007. `getOrRefresh` je namenoma **odporen na napake**
(člen VIII, FR-026): ob neuspelem klicu vira vrne zadnji znani ("stale") podatek namesto
napake — pravilno vedenje za vreme, NAPAČNO za avtorizacijo, kjer nedosegljiv Keycloak MORA
zavrniti dostop (FR-007: "sistem MORA zavrniti dostop tudi uporabnikom, ki so bili tik pred
tem prijavljeni"), ne tiho postreči stare "še vedno veljavno" odločitve. Dejanska izvedba
(`platform/keycloak/introspection-cache.ts`) je zato **ločen, preprost `Map`-predpomnilnik v
pomnilniku procesa** (ključ = zgoščena vrednost dostopnega žetona, vrednost = rezultat
introspekcije + čas izteka): znotraj TTL vrne predpomnjen rezultat; po izteku TTL POKLIČE
Keycloak in `throw`-a naprej, če klic spodleti (fail-closed, brez padca nazaj na staro
vrednost). Ker teče CleverDash kot en sam Node proces na enem VPS-u (plan.md Scale/Scope), je
predpomnilnik po procesu, ne v bazi/`ExternalCacheModel`, dovolj — restart ali skaliranje bi
samo shladilo predpomnilnik (varno, ne pomeni napačne avtorizacije), ne bi je pokvarilo.

**Zakaj to izpolni FR-006/FR-007, ne krši jih**: "praktično takoj" v spec.md (SC-003) je bilo
namenoma ubesedeno kot nasprotje "šele ob naslednji periodični obnovitvi (minute)", ne kot
matematično ničelna zakasnitev. Zakasnitev v redu velikosti ene do petih sekund je za
človeka neopazna razlika od "takoj", spoštuje pa člen VIII dobesedno (obstaja TTL) in v duhu
(ne obremenjuje Keycloaka po nepotrebnem pri več vzporednih klicih iste seje).

**Alternative, zavrnjene**:
- *Brez predpomnjenja, klic pri vsaki zahtevi* — dobesedno najbližje uporabnikovi izjavi, a
  neposredna kršitev člena VIII in nepotrebna obremenitev pri vzporednih klicih. Zavrnjeno.
- *Samo lokalna verifikacija JWT podpisa in `exp`, brez introspekcije* — hitro, a odvzem
  vloge/onemogočenje računa v Keycloaku NE invalidira že izdanega `access_token` do njegovega
  izteka (tipično 1–5 min) — to je natanko vedenje, ki ga je uporabnik zavrnil (izbral je
  živo preverjanje namesto "seja ostane veljavna do izteka"). Zavrnjeno kot glavni mehanizem;
  ostaja kot hitra prva stopnja (oblika/podpis/`exp`), introspekcija pa je avtoriteta za
  "je uporabnik/vloga še aktivna".

## 5. Katere kolekcije postanejo osebne, katere ostanejo skupne

Spec.md (Clarifications, 24. 8. 2026) zahteva "popolnoma ločene podatke na uporabnika", a to
velja za **osebne podatke uporabnika**, ne nujno za vsako pomožno/referenčno tabelo. Pregled
dejanskih modelov (ne domnev) pokaže dva jasno različna razreda:

| Kolekcija | Razred | `userId`? |
|---|---|---|
| `Settings` | osebne nastavitve (tema, ploščice, zavihki, lokacija vremena) | DA |
| `Camera`, `CameraGroup` | uporabnikov seznam kamer | DA |
| `CameraEmbedAllowlist` | varnostna meja — kateri zunanji gostitelji SPLOH smejo biti vdelani (FR-022 iz 003) | NE — ostaja skupna. To je varnostna kontrola sistema, ne osebna preferenca; deljena varnostna meja je varnejša privzeta vrednost kot N kopij, ki bi jih bilo treba vsako posebej vzdrževati. |
| `TrackingProfile`, `TrackingLocation` | uporabnikov urnik/lokacija — komentar v kodi sam pravi "več profilov je os ZNOTRAJ ENE OSEBE" | DA |
| `PlannedAction`, `ActionRecord`, `ActionAttempt`, `CalendarDay`, `CalendarOverride`, `AbsencePeriod`, `RemoteSession` | visijo na `profileId`/`locationId` zgornjih dveh — dejanski osebni podatki (zgodovina, načrt) | DA (denormalizirano, glej plan.md Complexity Tracking) |
| `Holiday` | slovenski državni prazniki — enaki za vse, `date` je unikaten ključ (`holidaySchema.index({date:1}, {unique:true})`) | NE — ostaja skupna referenčna tabela. Če bi vsak uporabnik dobil svojo kopijo, bi se prazniki lahko razšli med uporabniki brez razloga; to ni "osebni podatek". |

**Odločitev**: `userId` se doda na vse v stolpcu "DA" zgoraj; `Holiday` in
`CameraEmbedAllowlist` ostaneta brez sprememb sheme. To je implementacijska odločitev, ki
konkretizira FR-009/FR-010 (spec.md govori o "osebnih podatkih", ne terja, da je dobesedno
vsaka vrstica v bazi podvojena na uporabnika) — zabeleženo tu, ne tiho.

## 6. Preslikava Keycloak vlog/skupin v obstoječe `scopes`

**Odločitev**: preslikava je **konfigurabilna, a preprosta funkcija** (`platform/keycloak/role-mapping.ts`),
testabilna brez mreže (člen IX): vzame seznam vlog/skupin iz Keycloakovega ID/access tokena
(`realm_access.roles` ali skupina iz `groups` claim-a, odvisno od nastavitve Keycloak klienta)
in jih preslika v CleverDashev obstoječi `scopes: string[]` na `User` dokumentu. En env var,
`KEYCLOAK_ADMIN_ROLE` (privzeto `cleverdash-admin`), določa, katera Keycloak vloga da
`admin` scope (edini poseben scope, glej `platform/auth/scopes.ts` — "admin = vsi obsegi").

**Popravek med implementacijo**: prvotna zamisel je razlikovala samo "admin / ni admin", kar
je manjkalo natanko tisto, kar FR-007/FR-008 zahtevata — zavrnitev osebe, ki jo Keycloak sicer
potrdi, a ne nosi NOBENE prepoznane vloge/skupine. Dodan je drugi env var, `KEYCLOAK_USER_ROLE`
(privzeto `cleverdash-user`), ki daje osnovni dostop brez posebnih scopeov. Funkcija
(`mapRolesToAccess`) zato vrne `{ hasAccess: boolean; scopes: string[] }`, ne samo `scopes[]`
— `hasAccess` je `true` pri admin ALI user vlogi, sicer `false`. Preslikava (obeh polj) se
izvede ob vsakem preverjanju dostopnega žetona (živo, glej §4), NE samo ob prvi prijavi — s
tem je izpolnjen FR-012, in tudi odvzem OBEH vlog med aktivno sejo takoj prekine dostop
(FR-006), ne samo izgubo admin pravic.

**Alternative, zavrnjene**: ročno urejanje `scopes` v CleverDashevi bazi prek administratorja
(zahtevalo bi UI, ki ga je spec.md eksplicitno izključil, Out of Scope) — zavrnjeno.

**Popravek med implementacijo (T042–T044, odkrito prek testov izolacije SC-002)**: zgornja
odločitev, da `KEYCLOAK_USER_ROLE` da "osnovni dostop BREZ posebnih scopeov", se je izkazala
za napačno v praksi — moduli `cameras` in `time-tracking` zahtevajo poimenovane scope-e
(`cameras:read` ipd.), zato bi navaden uporabnik (brez `admin`) lahko dostopal samo do
`dashboard`/`settings`/`tabs`/`notifications` (ti `requireScopes()` kličejo brez argumentov),
kamer in beleženja časa pa sploh NE — v neposrednem nasprotju s FR-010/FR-011 ("vsak
uporabnik" ima lastno, izolirano rabo kamer in beleženja časa). Podatkovna izolacija med
uporabniki je po 004 zagotovljena z `userId` na vsaki poizvedbi (T048–T052), ne s scope
sistemom, zato poimenovani "aplikacijski" scope-i ne služijo več ločevanju admin/navaden
uporabnik — edina prava razlika je `admin` scope sam (FR-013: upravljanje API ključev). Zato
`mapRolesToAccess` zdaj vrne poln seznam aplikacijskih scopeov (`BASE_USER_SCOPES` v
`role-mapping.ts`) za `KEYCLOAK_USER_ROLE`, ne prazen seznam — glej tests/unit/role-mapping.spec.ts.

## 7. Selitev obstoječih (enouporabniških) podatkov na administratorja — FR-014

**Odločitev**: `bootstrap-user.service.ts` (ki je doslej ustvarjal edinega uporabnika ob
praznem `User` gridu) se preimenuje v `migration.service.ts` in spremeni namen: teče ob
zagonu, **enkrat**, natanko takrat, ko `User` grid še nima nobenega dokumenta z `admin`
scope-om IN obstajajo podatki iz enouporabniške dobe (npr. `Settings` dokument z
`_id: 'singleton'`, kamere ali profili brez `userId`). Ko se PRVI uporabnik z Keycloak vlogo,
preslikano v `admin`, uspešno prijavi, migracija:

1. ustvari/najde njegov `User` dokument (po `keycloakSubject`);
2. vsem najdenim "osirotelim" dokumentom (brez `userId` ali s starim `_id: 'singleton'`)
   nastavi `userId` na njegov `_id` (glej data-model.md za natančen seznam kolekcij);
3. zabeleži migracijo (npr. `migrations` zbirka ali preprost zastavica na `User` dokumentu),
   da se korak 2 ne ponovi ob vsaki naslednji prijavi tega ali drugega admina.

To je skladno s FR-013/FR-014 in z edge case v spec.md (napačna preslikava vlog ni napaka te
funkcionalnosti — če noben uporabnik nikoli ne dobi `admin` scope-a, stari podatki ostanejo
neprevzeti, kar je pričakovano, ne tiho izgubljeno: `/health` ali zagonski log to zapiše).

## 8. Kaj se dejansko odstrani iz obstoječe kode

Za jasnost pri `/speckit-tasks` (seznam za "odstrani", ne "spremeni"):

- `apps/api/src/modules/auth/services/password.service.ts` (argon2 hash/verify)
- `apps/api/src/modules/auth/services/login-throttle.service.ts`
- `apps/api/src/modules/auth/models/login-attempt.model.ts`
- `apps/api/src/modules/auth/guards/must-change-password.guard.ts`
- `apps/api/src/modules/auth/models/session-family.model.ts` in `refresh-token.model.ts`
  (nadomeščena z `keycloak-session.model.ts`, §2)
- `apps/web/src/app/features/auth/login.page.ts` in `change-password.page.ts`
- Env: `PASSWORD_HASH_ALGO`, `ADMIN_INITIAL_PASSWORD`, `JWT_REFRESH_SECRET` (Keycloak upravlja
  obnovitev — glej §2); `ADMIN_EMAIL` se preimenuje v vlogo migracije (§7), ne v geslo.

## 9. Lastništvo OpenAPI pogodbe za `/auth/*`

**Ugotovitev**: v nasprotju z 002/003 (ki sta samo DODAJALI poti in eksplicitno navedli, da NE
podvajata 001-ovih `/auth/*` poti), 004 obstoječe `/auth/*` poti iz
`specs/001-app-shell-dashboard/contracts/openapi.yaml` **nadomesti**. Ker je 001-ova pogodba
normativna za te poti in jo `packages/contracts/scripts/generate.ts` generira ločeno v
`api.d.ts`, je edini način, da pogodba ostane "posodobljena in validna" (Kakovostna vrata #3),
**neposredno urediti 001-ovo datoteko**: odstraniti `LoginRequest`/`PasswordChangeRequest`
sheme in ustrezne poti, dodati nov `/auth/login` (GET, preusmeritev), `/auth/callback` (GET),
prenovljen `/auth/refresh`/`/auth/logout`/`/auth/me`. `specs/004-keycloak-sso-multiuser/contracts/openapi.yaml`
(ta funkcionalnost) dokumentira ta NOV `/auth/*` kontrakt v celoti (glej ta imenik) kot
referenco za `/speckit-tasks`, dejanska sprememba pa se pri implementaciji prenese v 001-ovo
datoteko, ne živi vzporedno v dveh datotekah trajno (izognemo se dvema viroma resnice za isto
pot). To je zabeleženo tudi na vrhu `contracts/openapi.yaml` te funkcionalnosti.

## 10. RP-Initiated Logout (FR-004, enotna odjava)

**Odločitev**: `POST /auth/logout` po izbrisu lokalne seje vrne Keycloakov
`end_session_endpoint` URL (iz OIDC discovery dokumenta, `openid-client` ga izpostavi) kot del
odgovora; SPA nato preusmeri brskalnik nanj (z `post_logout_redirect_uri` nazaj na CleverDash),
kar dejansko konča tudi sejo pri Keycloaku, ne samo lokalno. Brez tega bi FR-004 (enotna
odjava) ostal neizpolnjen — lokalna odjava sama Keycloakove seje ne prekine, brskalnik bi ob
naslednjem obisku dobil tiho ponovno prijavo prek še vedno veljavne Keycloak seje.

## 11. Samodejno ustvarjanje profila ob prvi prijavi (FR-009)

**Odločitev**: `POST /auth/callback` (interno, po uspešni izmenjavi kode) naredi
`findOrCreate` na `User` po `keycloakSubject`. Če je nov, se v ISTI transakciji/klicu ustvari
privzet `Settings` dokument zanj (`getOrCreateSettingsForUser(userId)`, glej data-model.md) —
enak vzorec kot današnji `getOrCreateSettings()`, samo parametriziran z `userId`. Brez tega bi
prvi klic `GET /settings` novega uporabnika padel na manjkajoč dokument namesto na smiselne
privzetke.

## 12. Novi env-i (za `docs/env-reference.md`/`.env.example`)

```
KEYCLOAK_ISSUER_URL=            # https://sso.example.com/realms/cleverdash
KEYCLOAK_CLIENT_ID=
KEYCLOAK_CLIENT_SECRET=
KEYCLOAK_ADMIN_ROLE=cleverdash-admin
KEYCLOAK_INTROSPECTION_CACHE_SECONDS=5
SESSION_COOKIE_SECRET=          # podpiše notranji sejni piškotek (nadomešča JWT_REFRESH_SECRET)
```

Odločeno med implementacijo (glej §2): `JWT_ACCESS_SECRET`/`ACCESS_TOKEN_TTL` NISTA potrebna —
dostopni žeton je Keycloakov lasten, posredovan naprej brez ponovnega podpisovanja.
