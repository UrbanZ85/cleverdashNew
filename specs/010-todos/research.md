# Raziskava: 010 — Opravila

Odločitve, ki jih načrt predpostavlja, in razlogi zanje. Vsak razdelek ima obliko
**Odločitev → Zakaj → Kaj je bilo zavrnjeno**. Kjer je razlog dejstvo o tej bazi kode ali
namestitvi, je navedena datoteka.

---

## §1 Opravila so vdelan podseznam, ne svoja zbirka

**Odločitev**: ena zbirka `todoLists`; opravila (`tasks`) in soudeleženci (`members`) sta
vdelana podseznama istega dokumenta.

**Zakaj** — po teži argumenta:

1. **Prerazvrstitve v ločeni zbirki ni mogoče izvesti atomarno.** `infra/docker-compose.yml`
   poganja `image: mongo:7` **brez `command:` in brez `--replSet`**, testi pa
   `MongoMemoryServer.create()` — oboje samostojno, torej **brez transakcij nad več
   dokumenti**. Ročna prerazvrstitev (FR-025) prepiše N položajev; v ločeni zbirki je to N
   pisanj, ki jih izpad ali vzporedna prerazvrstitev sredi operacije pusti s podvojenimi ali
   preskočenimi položaji — stanje, za katero ni pravilnega popravka. V enem dokumentu je ista
   operacija **eno** atomarno pisanje. To ni okus; to je edina atomarna prerazvrstitev, ki jo
   to okolje zmore.
2. **Branje ploščice je najbolj vroča pot v modulu.** FR-080 zahteva "nazadnje spremenjen
   seznam **z opravili**". Vdelano je to `findOne(vidno).sort({ updatedAt: -1 }).limit(1)` —
   en dokument, en indeks, ena povratna pot. V ločeni zbirki sta to dve poizvedbi ali
   `$lookup` ob **vsakem** izrisu nadzorne plošče.
3. **Velikost je znana in majhna.** Nakupovalni seznam ima 5–30 vnosov; trda meja je
   `MAX_TASKS_PER_LIST` (200) × naslov do 200 znakov ≈ 45 kB, kar je dva reda velikosti pod
   mejo dokumenta. Isti razlog je `Settings.tiles` naredil podseznam
   (`modules/settings/model.ts`); **nasprotni** razlog je zvočne posnetke pustil **zunaj**
   beležke (`modules/notes/models/note-audio.model.ts` — megabajti, brani ob vsakem izpisu
   seznama). Opravila so na strani `Settings.tiles`.
4. **Sočasnost je boljša, ne slabša** — glej §2.

**Zavrnjeno**: ločena zbirka `TodoTask` z `listId`. Edino, kar bi prinesla, je neomejeno
število opravil, česar nihče ne zahteva; edino, kar bi *navidez* prinesla — atomarnost na
opravilo — pa je prek `arrayFilters` na voljo že tako. Ob tem bi izgubila atomarno
prerazvrstitev (točka 1) in podvojila poizvedbo ploščice (točka 2).

---

## §2 Vsaka sprememba je en atomaren operator; beri-spremeni-zapiši je prepovedan

**Odločitev**: nobena pot v tem modulu ne prebere dokumenta, ga spremeni v pomnilniku in
shrani. Vsaka mutacija je eno `findOneAndUpdate` z operatorji.

| Dejanje | Operator |
|---|---|
| odkljukaj | `$set` nad `tasks.$[t].done`, `…doneAt`, `…doneBy` |
| uredi besedilo / rok | isti obrazec, druga polja |
| dodaj | `$push: { tasks: { $each } }` |
| izbriši | `$pull: { tasks: { _id } }` |
| počisti opravljena | `$pull: { tasks: { done: true } }` |
| preuredi | **en** `$set` z več `tasks.$[tN].position` |

**Zakaj to zadošča brez žetona različice**: posodobitev enega dokumenta je v MongoDB atomarna,
dve hkratni posodobitvi istega dokumenta se serializirata, `$set` nad `tasks.$[t].done` pa
zapiše natanko ta element polja. Dva uporabnika, ki hkrati odkljukata **različni** opravili,
zato oba uspeta (FR-027, SC-003). Izgubljen popravek pride iz `save()` nad zastarelo kopijo ali
iz `$set: { tasks: celoNovoPolje }` — obojega v tem modulu ni.

**Uveljavljeno s tipom, ne z dogovorom**: `resolveListAccess` vrne `lean()`, ne hidriranega
dokumenta, zato `.save()` na objektu, ki ga usmerjevalnik drži, **ne obstaja**. Česar ni na
voljo, ni mogoče uporabiti po nesreči, in noben pregled kode tega ne uveljavlja tako
zanesljivo.

**Zavrnjeno**: optimistična sočasnost prek `__v` (`versionKey`). Dvoje. (a) Z njo bi `save()`
*izgledal* varen — deloval bi v razvoju in izgubljal popravke v produkciji; **odsotnost `__v`
je uveljavljanje pravila, ne bližnjica mimo njega**. (b) Tudi ko "deluje", dva **nekonfliktna**
popravka (dva človeka, dve različni opravili) spremeni v `VersionError`, torej 409, ki si ga
uporabnik ni zaslužil. Optimistična sočasnost je pravo orodje, kadar se popravki res
spopadajo; tu se večinoma ne, in kjer se (isto opravilo, isto polje, isti trenutek), je
zadnji zapis nad logično vrednostjo pravilen in pričakovan izid za skupen seznam.

---

## §3 `arrayFilters`, nikoli pozicijski `$`

**Odločitev**: elementi polja se naslavljajo izključno prek `arrayFilters` (`$[t]`).

**Zakaj** — trije razlogi, vsak zadosten:

1. Pozicijski `$` se razreši samo iz pogoja nad poljem **v poizvedbi** in **ne deluje znotraj
   `$or`**. Naš filter `$or` vsebovati **mora**, ker je to pogoj dostopa (§5). `$` je torej v
   tem modulu neuporaben, ne le manj lep.
2. `$` posodobi samo **prvi** zadetek. Prerazvrstitev mora posodobiti vse. En način
   naslavljanja za vsa pisanja pomeni eno stvar, ki jo je treba narediti prav, namesto dveh.
3. Naslavljanje po `_id` je neodvisno od **indeksa** v polju. `tasks.3.done` je napačno v
   trenutku, ko kdo pred tem elementom kaj doda ali odstrani — kar se pri deljenem seznamu
   zgodi redno.

**Podrobnost, ki jo je lahko spregledati**: identifikatorji v `arrayFilters` morajo biti
črkovno-številski in **vsak mora biti uporabljen v `$set`**, sicer MongoDB zavrne celo
operacijo. Pri prerazvrstitvi se zato ustvarita `$set` in `arrayFilters` v isti zanki.

---

## §4 `position` je namig za razvrščanje, ne enolični ključ

**Odločitev**: redke vrednosti s korakom `POSITION_STEP = 1000`; enoličnosti **ne** uveljavlja
noben indeks; izenačene razsodi `_id`.

**Zakaj**: prav odsotnost enoličnosti naredi sočasnost varno brez zaklepov (FR-026). Dve
hkratni dodajanji lahko izračunata isti položaj; če bi bil to enolični ključ, bi eno padlo z
napako, ki je uporabnik ni zakrivil. Ker ni, oba obstaneta, vrstni red pa razsodi `_id`
(ObjectId narašča) — zato **prikazani vrstni red med dvema izrisoma ne plapola**, kar je
lastnost, ki jo je treba testirati posebej.

Redke vrednosti (korak 1000) pomenijo, da vrivanje med dve sosednji nikoli ne zahteva
prepisa vseh ostalih. Podvojeni položaji se normalizirajo ob prvi prerazvrstitvi.

**Zavrnjeno**: zgoščeni celi indeksi (0, 1, 2 …) z enoličnim indeksom. Vsako vrivanje bi
prepisalo rep seznama, kar je pri deljenem seznamu več pisanj in več priložnosti za trk.

---

## §5 Dostop: en razsodnik, ena poizvedba, in isti pogoj še enkrat v filtru zapisa

**Odločitev**: `resolveListAccess(listId, userId)` prebere seznam z **eno** poizvedbo, katere
filter že vsebuje obe vrsti pripadnosti:

```ts
{ _id: listId, $or: [{ ownerId: userId }, { 'members.userId': userId }] }
```

**Zakaj tak filter in ne naknadna primerjava v kodi**: tuj seznam tako ne pride niti v
pomnilnik in 404 pade iz **odsotnosti zadetka**, ne iz primerjave, ki jo je mogoče pozabiti.
Naknadna primerjava je oblika, v kateri se 403 tujcu prikrade.

**In vseeno se pogoj ponovi v filtru vsakega zapisa** (`writeGuard`):

```ts
{ _id: listId, $or: [
  { ownerId: userId },
  { locked: false, members: { $elemMatch: { userId, role: { $in: roles } } } },
] }
```

**Zakaj oboje**: razsodnik je prebral **posnetek**; med branjem in zapisom lahko lastnik seznam
zaklene ali odvzame članstvo. Filter je edino mesto, kjer sta preverba in zapis **ena**
operacija. Razsodnik daje **človeku berljiv razlog**, filter daje **pravilnost**; potrebna sta
oba. Ključavnica je v **članski** veji `$or`, ne kot `locked: false` na vrhu — lastnik sme
pisati tudi v zaklenjen seznam (FR-062).

**`$or` živi v eni sami funkciji** (`domain/visibility.ts`). Kopija pogoja bi bila mesto, kjer
se članska veja pozabi in deljen seznam tiho izgine iz seznama.

---

## §6 Trije izidi zavrnitve so trije statusi

**Odločitev**:

| Primer | Status |
|---|---|
| neveljaven ID / ne obstaja / **nisi ne lastnik ne član** | **404** |
| **si član**, a vloga ne zadošča | **403** |
| seznam **zaklenjen**, član piše | **409** |
| seznam poln | **409** |

**Zakaj 404 tujcu**: hišno pravilo, nespremenjeno od 004 — obstoj tujega zapisa ni podatek, ki
bi ga kdo smel prebrati. Isti vzorec kot `findOwnNote` (`modules/notes/router.ts:85`) in
`findCameraOr404`.

**Zakaj 403 in ne 404 članu s premajhno vlogo**: hišno pravilo varuje obstoj **zapisa**, ne
obstoja **pravice**. Član seznam že vidi — je v njegovi vrstici čipov, ime mu je bilo
prikazano, ob deljenju je bil označen kot nov. 404 mu torej ničesar ne skrije; samo zlaže se
človeku, ki zapis gleda na zaslonu, in **popravljivo pomanjkanje pravice spremeni v videz
okvare**, kar je natanko to, čemur nasprotuje člen VII.

**Zakaj 409 in ne 403 za zaklep**: ključavnica ni lastnost **osebe**, ampak **stanje** zapisa,
ki ga lastnik odklene z enim klikom; isti član z isto vlogo bo čez trenutek uspel. Praktična
posledica je oprijemljiva: vmesnik se mora odzvati **drugače** — 403 pomeni "za tega uporabnika
gumb skrij", 409 pomeni "pokaži ključavnico in gumb pusti". Dva različna odziva potrebujeta
dva statusa. Polnost seznama je po isti logiki 409, ne 400: ista zahteva bo po čiščenju
opravljenih uspela.

**409 se sestavi kot `new ProblemError(409, …)`.** `platform/errors/problem.ts` ima tovarne za
400/401/403/404/429/503; 409, 413 in 422 se v tej bazi sestavljajo neposredno
(`notes/router.ts:311`, `notes/router.ts:272`, `idempotency/middleware.ts:71`). Nove tovarne
`conflict()` ta PR **ne dodaja**: tovarna napak v skupni plasti, ki jo uvede modul
funkcionalnosti, je ravno smer, ki jo prepoveduje razdelek Governance. Če je vredna, je vredna
svojega PR-ja.

---

## §7 Protokol ob neujemanju: ponovi diagnozo, nikoli zapisa

**Odločitev**: kadar se atomarni zapis ne ujame z nobenim dokumentom, se **ne ugiba**.
Razsodnik se izvede še enkrat in vrne natančen razlog; šele če druga razrešitev pravi, da bi
dejanje **moralo** uspeti, gre navzven generični 409 ("nekdo je seznam spremenil med tem, ko si
urejal").

**Zakaj**: `matchedCount === 0` ima štiri različne vzroke (seznam izbrisan, članstvo odvzeto,
seznam zaklenjen, seznam poln) in vsak zasluži svoje sporočilo. Vračati enotni 404 bi bila
tiha napaka v smislu člena VI.

**Ponovi se diagnoza, nikoli zapis.** Samodejno ponovljen zapis bi ob dvojnem kliku dodal
opravilo dvakrat; `Idempotency-Key` varuje pred ponovitvijo **odjemalca**, ne pred strežnikovo
lastno.

---

## §8 Zgornja meja opravil se uveljavi v filtru, ne po branju

**Odločitev**: filter dodajanja nosi `` `tasks.${MAX_TASKS_PER_LIST - 1}`: { $exists: false } ``.

**Zakaj**: preverjanje `list.tasks.length` iz posnetka je klasična dirka — dve hkratni
dodajanji jo obe prestaneta in meja se preseže. Pogoj v filtru je uveljavljen v istem
trenutku kot zapis. Ker se "polno" tako pokaže kot neujemanje, je razločevanje od "izbrisano"
naloga protokola iz §7 — brez njega bi polnost postala napačen 404.

---

## §9 Checkbox je en `PATCH`; generične masovne mutacije ni

**Odločitev**: preklop stanja je `PATCH /todos/lists/{listId}/tasks/{taskId}`. Masovna sta
samo `PUT …/order` in `POST …/tasks/clear-completed`.

**Zakaj en `PATCH`**: najmanjša atomarna enota, ki se preslika 1:1 na eno posodobitev z
`arrayFilters`. Masovno telo, ki opisuje množico enega, je šum. In `Idempotency-Key` nad
masovnim telesom pomeni "ponovi celo množico", kar je za checkbox, ki ga uporabnik namerno
tapne dvakrat, napačno.

**Zakaj ne generične masovne mutacije**: potrebovala bi poročanje napak **na element**, torej
odgovor 200 s seznamom neuspehov — natanko oblika tihe napake, ki jo člen VI imenuje za
najhujši razred hroščev. **En status na eno namero.**

Ločevanje `check` od `edit` je čista funkcija `requiredCapabilityFor(fields)`: `done` zahteva
`toggleTask`, `title` in `dueDate` zahtevata `writeTasks`. To je edini razlog, da vloga `check`
sploh obstaja, zato živi na enem mestu in ne v usmerjevalniku.

---

## §10 Preurejanje pošlje cel vrstni red

**Odločitev**: `PUT /todos/lists/{listId}/order` s `{ taskIds: [...] }`.

**Zakaj**: to je argument o idempotenci, ne o estetiki. Ponovljen `move-up` premakne opravilo
**dvakrat**; ponovljen `PUT /order` je no-op. Člen III zahteva `Idempotency-Key` na vseh
mutacijah, endpoint, katerega ponovitev spremeni stanje, pa te obljube ne more držati.

**Precedens** je `PUT /cameras/order` + `toOrderAssignments` (`apps/api/src/domain/camera-order.ts`).

**Ponovna uporaba te funkcije je bila predvidena, a ob izvedbi zavrnjena** — zapisano tu, ker
je bila v prvi različici tega dokumenta zahtevana. Razlog: `toOrderAssignments` vrne **zgoščene
indekse** (`{ id, order: 0, 1, 2 }`), ta modul pa potrebuje **redke položaje** s korakom
`POSITION_STEP` (§4). Ovijanje tuje funkcije, ki bi ji bilo treba izhod takoj preslikati, je
daljše in manj berljivo od dveh vrstic na mestu — in vezalo bi opravila na pomočnika,
poimenovanega po kamerah (`cameraIds`). Ista zamisel, druga oblika: modul ima svoj
`toPositionAssignments` v `domain/task-order.ts`, z opombo, zakaj je tam.

`moveByOne` (puščici gor/dol) je **pripomoček vmesnika** in gre na stran odjemalca
(`apps/web/.../features/todos/domain/task-order.ts`). Podvojen na obeh straneh bi bil dve mesti,
kjer se da zmotiti, API pa operacije, ki bi ga potrebovala, nima.

---

## §11 Imenik uporabnikov: v `platform/`, z zamaskirano e-pošto

**Odločitev**: `GET /users` živi v `platform/users/router.ts`, ne v modulu. Projekcija je
`{ id, displayName, initials, emailHint }`, kjer je `emailHint` **vedno zamaskiran**
(`u…c@agenda.si`).

**Zakaj v `platform/`**: člen I postavlja preizkus — odstranitev zavihka mora biti izbris ene
mape in enega vnosa v registru. Če bi izbirnik živel na `GET /todos/users`, bi ga drugi modul,
ki potrebuje izbiro osebe, moral podvojiti ali uvoziti iz `modules/todos` (kar je ESLint
`error`), izbris mape `todos` pa bi pobral splošen endpoint. Poleg tega imenik uporabnikov ni
pojem opravil in `GET /todos/users` je laž v naslovu. Precedens: `platform/tabs/router.ts`,
`platform/notifications/router.ts`, `platform/apikeys/router.ts` — vsi so vpeti z eno vrstico v
`main.ts`, katere komentar pravi, da člen I dovoljuje ravno to, ker gre za register, ne za
medsebojni uvoz modulov.

**Da `platform/` sme brati `UserModel`**, dokazujeta `platform/settings/consent.service.ts`
(bere `Settings` za modul beležk) in `platform/auth/automation-owner.ts` (bere `User`). Pravilo
`cleverdash/module-boundary` se sproži samo, kadar je **uvažajoča** datoteka znotraj
`modules/<x>/` — datoteke v `platform/` niso.

**Obseg je `requireScopes()`** (katerikoli prijavljen), ne `todos:*` — to bi imenik povleklo
nazaj v to, da je pojem opravil.

**Zakaj zamaskirana e-pošta**: navedena potreba je razločevanje dveh soimenjakov. Zamaskirana
oblika to potrebo pokrije v celoti — domena in oblika sta tisto, kar loči
"Janez Novak (j…z@agenda.si)" od "Janez Novak (j…k@gmail.com)". Cel naslov bi isto potrebo
pokril in **povrhu** vsakemu prijavljenemu uporabniku izročil uporaben seznam naslovov cele
namestitve. Osebni podatek, razkrit čez svoj namen, je razkritje brez namena.

**Vedno zamaskirana, ne pogojno** (npr. samo pri soimenjakih): pogojna prisotnost bi
avtomatizaciji dala polje, ki je včasih prazno iz razlogov, ki jih ne more predvideti, in bi
razkrila **dejstvo**, da soimenjak obstaja.

**Filter nosi `lastLoginAt: { $ne: null }`**, čeprav zapis o uporabniku nastane šele ob prvi
prijavi (`modules/auth/services/user-provisioning.service.ts`): zapis lahko nastane tudi
drugod (`platform/migration/legacy-userless-migration.service.ts`), izbirnik, ki ponudi
človeka, ki se ne more prijaviti, pa je obljuba, ki je ni mogoče izpolniti.

**Zavrnjeno**: branje seznama iz Keycloak Admin API (service account z `view-users`). Prineslo
bi tudi tiste, ki se še niso prijavili — cena pa je nova skrivnost v `.env`, nov odjemalec v
`platform/keycloak/` in še ena zunanja odvisnost, ki se lahko pokvari. Uporabnik se v izbirniku
pojavi takoj po svoji prvi prijavi, kar je za to namestitev dovolj.

---

## §12 Kar smo zavrnili

| Možnost | Zakaj zavrnjena |
|---|---|
| **WebSocket / SSE za sprotno osveževanje** | V tej bazi kode ni nobene sprotne infrastrukture (nič `ws`, `socket.io`, `EventSource`). Bila bi nova prečna zmogljivost, ki bi po členih I in II morala v `platform/` in na isti izvor pod `/api` — velik strošek za zahtevo, ki je ni. Hišni odgovor je `ForegroundRefreshService` z intervalom, ki ga pove strežnik (člen VIII), in prav ta se uporabi |
| **Ločena zbirka `TodoTask`** | §1: izgubi atomarno prerazvrstitev (ni transakcij) in podvoji poizvedbo ploščice |
| **Optimistična sočasnost prek `__v`** | §2: iz dveh nekonfliktnih popravkov naredi napako, in `save()` naredi videti varen |
| **Keycloak Admin API za imenik** | §11: nova skrivnost in nova zunanja odvisnost za obrobno korist |
| **Potisno obvestilo ob deljenju** | Merljivo ne bi delovalo: privzeti nabor kanalov je samo `system` in odjemalec ob registraciji nabora ne pošlje, zato bi obvestilo na novem kanalu ne našlo naprave; povrh se na webu naprava sploh ne registrira. Nadomešča ga oznaka v vmesniku (FR-007, FR-103). Podrobno v `plan.md` → Complexity Tracking, U3 |
| **Vlečenje in spuščanje** | Hišni vzorec za vrstni red so puščici gor/dol (`tile-arrangement.component.ts`, `menu-section.component.ts`); `@angular/cdk` v projektu ni. Ionic sicer ima `IonReorderGroup` — če se pozneje pokaže za vredno, je zamenljivo brez spremembe API-ja, ker je pogodba **nastali vrstni red**, ne gib |
| **Nova tovarna `conflict()` v `platform/errors/problem.ts`** | §6: sprememba skupne plasti v PR-ju funkcionalnosti |
| **Zgodovina sprememb (kdo je kdaj kaj)** | Bila bi nova zbirka in svoja odločitev. Hišni slog je, da gre dejstvo, ki ga mora uporabnik videti, **v odgovor API-ja, ne v dnevnik, ki ga nihče ne bere** — zato sta `lastModifiedBy` in `doneBy` polji zapisa, celotna sled pa ne |
| **Pripetost ploščice kot nova zbirka ali endpoint** | `Settings.tiles[].config` obstaja natanko za to; `config.pluginId` je ista oblika. Strežnik o pripetosti ne izve ničesar in nič novega ni treba hraniti |

---

## §13 Ponovna uporaba obstoječega

Kar **ne** pišemo na novo:

| Potreba | Kaj se uporabi |
|---|---|
| koledarski dan v ljubljanski coni | `ljubljanaCalendarDay()` — `apps/api/src/domain/timezone.ts:15` |
| vrstni red identifikatorjev → položaji | **ni ponovno uporabljeno** — glej §10 za razlog; modul ima svoj `toPositionAssignments` |
| 404 ob neveljavnem `ObjectId` | vzorec `requireObjectId` — `modules/notes/router.ts:80` |
| razlog + slovensko besedilo, ločeno od `ProblemError` | vzorec `transcriptionBlockReason` / `describeTranscriptionBlock` — `modules/notes/domain/transcription-gate.ts` |
| bralnik iz `platform/` v tuj model | vzorec `readServerTranscriptionConsent` — `platform/settings/consent.service.ts` |
| kratko stanje in značka v meniju | `registerTabDetailProvider()` — `platform/tabs/extension.ts` |
| osveževanje v ospredju z intervalom s strežnika | `ForegroundRefreshService.register()` — `apps/web/.../core/refresh/foreground-refresh.service.ts` |
| optimistična sprememba s povrnitvijo | vzorec `SettingsStore.patch()` — `apps/web/.../core/settings/settings.store.ts:77` |
| ovoj za klice API | vzorec `NotesApi` — `apps/web/.../features/notes/notes.api.ts` |
| potrditev pred brisanjem | `AlertController`, vzorec `notes.page.ts:234` |
| glava strani, prazna stanja, ploščica | `app-page-header`, `.cd-skeleton`, `app-tile-card` — `apps/web/.../shared/` |
| razporeditev in vidnost ploščic | `Settings.tiles` + `withMissingBuiltIns()` — obstoječe, brez sprememb |

---

## §15 Ploščica bere svojo nastavitev sama — in zakaj je za to nastala nova datoteka

**Najdeno med izvedbo, ne pri načrtovanju.**

**Odločitev**: ploščica prebere pripeti seznam iz `Settings.tiles[].config.listId` **sama**, in
imena vgrajenih vrst ploščic so v novi datoteki `shared/tiles/tile-types.ts`, ločeni od
registra.

**Zakaj ploščica sama in ne prek vhoda**: `dashboard.page.ts` vgrajenim ploščicam vhodov ne
podaja — samo vtičniki dobijo `inputs: { pluginId }`. Da bi ploščica dobila `config` kot vhod,
bi bilo treba spremeniti `resolveTiles()` in s tem pogodbo vseh ploščic; nadzorna plošča pa
namenoma ne pozna imen posameznih vrst (FR-020). Ploščica svojo vrsto pozna, nadzorna plošča ne
rabi vedeti, da ta ploščica sploh kaj hrani — zato ta smer.

**Zakaj nova datoteka za imena vrst**: ploščica za pripenjanje potrebuje seznam vgrajenih vrst
(da `mergeMissingTypes` ohrani obstoječi vrstni red, kadar razporeditev še ni bila shranjena).
Ta seznam je bil v `tile-registry.ts` — a `tile-registry.ts` **uvaža komponente ploščic**, zato
bi uvoz v obratno smer ustvaril krog:

```
tile-registry.ts  ──uvaža komponento──►  todo-tile.component.ts
       ▲                                          │
       └──────────── uvaža withMissingBuiltIns ◄──┘
```

Krog se v ESM ne pokaže vedno: če je prvi naložen register, vse deluje. Če pa je prvi naložena
ploščica, register začne vrednotiti `TILE_REGISTRY` in prebere razred komponente, ki je še v
časovni mrtvi coni — **`ReferenceError` ob nalaganju**. Kateri modul bo prvi, določi razrez
svežnjev, ne koda. Gradnja tega ne ujame.

Zato `shared/tiles/tile-types.ts`: ne uvaža ničesar, zato jo sme uvoziti kdorkoli. Register jo
uporabi za `withMissingBuiltIns`, ploščica za pripenjanje. Cena je dva vira istega podatka, kar
pokrije `apps/web/tests/unit/tile-registry.spec.ts` — razhajanje ne bi bilo napaka ob
prevajanju, ampak ploščica, ki tiho izgine iz razporeditve.

**Zavrnjeno**: pripenjanje v `localStorage`. Preprosto in brez kroga, a nastavitev ne bi
potovala med napravami — pripeti seznam bi bil na telefonu drug kot na namizju, kar je pri
nastavitvi, ki je videti kot del nadzorne plošče, presenečenje.

---

## §14 Odprta vprašanja

Nobenega. Vseh osem produktnih vprašanj (stopnje pravic, pomen zaklepa, polja opravila, vir
uporabnikov, e-pošta, obveščanje, postavitev strani, vedenje ploščice) je bilo razrešenih z
naročnikom pred pisanjem speca in je zapisanih v `spec.md` → Assumptions.
