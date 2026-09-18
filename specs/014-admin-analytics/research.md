# Research: Administratorska analitika (014)

Odločitve, ki jih koda uveljavlja, in razlogi zanje. Vsaka točka je navedena na mestu, kjer jo
koda izvaja — kdor bo kodo spreminjal, mora najprej pobiti razlog tukaj.

## §1 — Telemetrija je v `platform/`, analitika je modul

Telemetrija (`platform/usage/`) in njen prikaz (`modules/analytics/`) sta **dve različni stvari** in
to ni deljenje zaradi lepote:

- **Prijavo lahko prešteje samo tisti, ki jo vidi.** Uspešna prijava se zgodi v
  `modules/auth/router.ts`; da bi jo štel modul analitike, bi ga moral modul avtentikacije
  uvoziti — kar `cleverdash/module-boundary` v `eslint.config.js` zavrne kot napako (člen I).
- **Ogled zavihka ni pojem analitike, ampak pojem zavihkov.** Isti razlog, zaradi katerega je
  imenik oseb v `platform/users/` in ne v modulu opravil (010, člen I): izbira osebe ni pojem
  opravil, štetje zavihkov ni pojem analitike.
- **Brisanje modula analitike ne sme odnesti zbirke.** Če bi zbirka živela v modulu, bi
  odstranitev zavihka pobrisala tudi merilnik — in z njim edini zapis o tem, kdo je aplikacijo
  uporabljal.

Precedens za klic iz modula v platformo ob prijavi že obstaja in stoji v isti funkciji:
`migrateLegacyDataIfNeeded` (`platform/migration/`) se kliče v `/auth/callback` takoj po
`findOrCreateUser`. `recordLogin` gre na isto mesto, ob `auditLogin` — ena vrstica.

**Posledica, ki jo je treba sprejeti:** po brisanju modula analitike bi `platform/usage/` še
naprej zbiral števce, ki jih nihče ne bere. To je manjše zlo od nasprotnega (modul, ki ob odhodu
odnese zgodovino prijav cele namestitve), in je popravljivo z brisanjem ene mape v `platform/`.

## §2 — Analitika NE uvozi nobenega modela tujega modula

Modul analitike mora sešteti bajte v zbirkah, ki so last treh drugih modulov. `import
{ RecipeImageModel } from '../recipes/models/...'` je lint napaka (člen I) — in tudi če ne bi
bila, bi pomenila, da brisanje receptov podre analitiko.

**Odločitev:** analitika bere prek surove povezave, `mongoose.connection.db.collection(<ime>)`, in
seznam zbirk dobi iz `db.listCollections()`. Vir, katerega zbirke v namestitvi ni, se **izpusti**
(FR-012, SC-007) — ne vrne ničle, ampak ga v odgovoru sploh ni, seznam merjenih virov pa je del
odgovora.

Imena zbirk so v eni tabeli, `domain/storage-sources.ts`:

| vir | zbirka | lastnik | bajti |
|---|---|---|---|
| `recipe-images` | `recipeimages` | `ownerId` | `byteSize` + `$binarySize: '$thumb'` |
| `note-audio` | `noteaudios` | `userId` | `byteSize` |
| `shared-files` | `sharedfiles` | `userId` | `byteSize` |

Štetje zapisov brez bajtov (`recipes`, `notes`) je v isti tabeli, z označbo `countOnly`.

**Cena te odločitve:** imena zbirk so prepisana in jih TypeScript ne varuje. Zato sta obe
varovali v testu: enotski test trdi, da vsako ime iz tabele obstaja v shemi zagnane aplikacije, in
integracijski test trdi, da izbris zbirke pusti analitiko delujočo. Prepis brez varovala bi bil
tiha napaka (člen VII); prepis z varovalom je isto, kar 013 počne s `capabilities.ts`.

## §3 — Pomanjšave slik: `$binarySize`, ne novo polje

`recipe-image.model.ts` ima `byteSize` samo za izvirnik; pomanjšava (`thumb`) svoje velikosti
nima. FR-006 zahteva, da v izmeri ni izpuščena.

**Odločitev:** `$binarySize: '$thumb'` v agregaciji, brez dotika modela 013.

**Zavrnjeno — dodati `thumbByteSize` v `recipe-image.model.ts`:** popravek tujega modula zaradi
analitike je natanko tisto, kar člen I prepoveduje, in bi obenem pustil obstoječe slike brez
vrednosti (migracija za podatek, ki ga rabi pregled enkrat na uro). `$binarySize` bere velikost
BSON polja na strežniku in bajtov ne prenese — `select: false` na `thumb` zato ostane brez
pomena za to pot.

**Zavrnjeno — pomanjšave ne šteti:** pomanjšava je ob povprečni fotografiji nekaj odstotkov
izvirnika, a je vseeno prostor na disku; "skoraj vse" v pregledu porabe ni odgovor.

## §4 — Ogled se šteje z enim atomarnim zapisom, dvojnik pade na indeks

FR-027 zahteva, da osvežitev strani ni nov ogled. Zaporedje "preberi zadnji čas → odloči se →
zapiši" je dirka: dva zavihka brskalnika bi oba prebrala star čas in oba šteta.

**Odločitev:** `findOneAndUpdate` z `upsert: true`, filtrom `{ userId, day, kind, key, lastAt:
{ $lt: cutoff } }` in `$inc: { count: 1 }`. Če zapis obstaja in je `lastAt` mlajši od praga,
filter ne ujame ničesar, `upsert` poskusi vstaviti — in pade na unikatnem indeksu
`(userId, day, kind, key)` z `E11000`. To napako pot **prestreže in obravnava kot "že šteto"**,
ne kot napako.

Isti vzorec kot `uploadClaimedAt` v `shared-file.model.ts` (009): zapora je zapis, ne branje.

Prag je `USAGE_VIEW_DEDUPE_SECONDS` (privzeto 60). Posledica, ki je zavestna: zaporedje A → B → A
v pol minute šteje A enkrat, ne dvakrat. Števec dnevne uporabe s tem ne izgubi pomena, dnevnik
gibanja, iz katerega bi bilo mogoče to ločiti, pa je izrecno izven obsega (člen XII).

## §5 — TTL indeks je tu PRAVILEN

`platform/cache/model.ts` ima izrecno opozorilo, da na njem TTL indeksa ne sme biti: iztečen
zapis je tam natanko tisto, kar se prikaže, ko vir ne odgovori.

Pri telemetriji je obratno. Števec, starejši od roka hrambe, nima nobene uporabne vrednosti in
FR-030 zahteva, da izgine. TTL indeks na polju `expiresAt` to opravi brez pometača, brez
časovnika in brez enega zagona več.

`expiresAt` se izračuna iz **dneva števca**, ne iz časa zapisa: `day + USAGE_RETENTION_DAYS`.
Zato je vrednost ob vsakem povečanju ista in je `$set` idempotenten — števec, ki raste ves dan,
ne odriva svojega roka pred sabo.

Precedens za pravilno rabo TTL je `platform/idempotency/model.ts`; opozorilo, da ni vedno
pravilen, je `platform/cache/model.ts`. Ta funkcionalnost je na strani prvega.

## §6 — Predpomnilnik je v procesu, ne v zbirki `ExternalCache`

`platform/cache/` je predpomnilnik **zunanjih virov**: shema zahteva `sourceUrl`, `etag` in
`lastModified`, ker je zgrajena okoli člena VIII (vljudnost do tujih sistemov). Pregled porabe ni
zunanji vir — je poizvedba po lastni bazi, ki je draga.

**Odločitev:** predpomnilnik v procesu (`Map` s časom izteka) z **eno samo poizvedbo v teku**
(single-flight): trije hkratni obiski zaslona sprožijo en izračun in tri iste odgovore. TTL je
`ANALYTICS_CACHE_SECONDS` (privzeto 300).

Zapis v bazo bi bil odveč: en proces, majhna namestitev, ponoven zagon pa naj izračun mirno
ponovi — podatek ni dragocen, ker je ves čas izpeljiv iz zbirk.

Osvežitev na zahtevo (FR-041) je `GET /analytics/storage?fresh=true`. **Ostaja GET in ni POST**:
ponoven izračun ne spremeni nobenega stanja, samo zavrže predpomnjeno vrednost. Mutacija bi
sprožila `Idempotency-Key` in shranjen odgovor — shranjen odgovor na zahtevo "daj mi svežega" je
nasprotje tega, kar zahteva pomeni.

## §7 — Zasedenost nosilca: `statfs`, ločeno od izmerjene porabe

`node:fs.statfs` (Node 18.15+, ta namestitev teče na 22) vrne velikost bloka, število blokov in
število prostih blokov za nosilec pod `FILE_SHARE_DIR`. Brez zunanje odvisnosti.

Ta številka je **drug podatek** od vsote `byteSize` in FR-015 zahteva, da se ne zlijeta: na
nosilcu so tudi Mongo, dnevniki in vse ostalo, vsota bajtov pa ne pozna ne indeksov ne stiskanja.
Odgovor ju zato nosi v dveh ločenih poljih in vmesnik ju pokaže kot dve vrstici, ne kot eno z
odstotkom.

Kadar `statfs` ne uspe (nosilec ni montiran, pravice), je polje `null` in razlog je naveden —
tiha ničla bi bila videti kot poln disk (člen VII).

## §8 — Sirote na disku: sprehod po `blobs/`, primerjava po imenu datoteke

Postavitev nosilca je `FILE_SHARE_DIR/blobs/<xx>/<storageId>` (`blob-storage.service.ts`, 009).
Analitika te storitve **ne uvozi** (člen I) in si postavitve **ne prepiše**: rekurzivno prehodi
`blobs/`, vzame `basename` vsake datoteke in to primerja z množico `storageId` iz zbirke.

S tem je edina predpostavka "ime datoteke je `storageId`", ne pa tudi število ravni ali dolžina
predala. Če bi 009 kdaj spremenil razbitje po predalih, ta koda še vedno dela; če bi spremenil
poimenovanje, pa **vse** naenkrat izpade kot sirota — kar je glasna in takoj vidna napaka, ne
tiha (člen VII).

Sirota, mlajša od 24 ur, se **ne prijavi**: lahko je nalaganje, ki ravno teče. Isto okno kot
`ORPHAN_GRACE_MS` v `cleanup.service.ts` — vrednost je prepisana, razlog pa je isti.

Analitika ob tem **ne pobriše ničesar** (FR-020). Pometanje je delo modula 009 in tam že je.

## §9 — Neznan lastnik in polnjenje z ničlami

Dve nasprotni napaki, ki ju je pri agregaciji lahko narediti:

1. **Izpustiti vrstice brez ujemajočega uporabnika.** Vsota po osebah bi bila manjša od skupne in
   razlike ne bi bilo mogoče pojasniti. Zato gre `$lookup` po uporabnikih, kar se ne ujame, pa
   pristane v eni vrstici `unknown` (FR-013).
2. **Izpustiti osebe brez vsebine in zavihke brez ogledov.** "Kdo ničesar ne hrani" in "katerega
   zavihka nihče ne odpre" sta natanko vprašanji, zaradi katerih zaslon obstaja. Polnjenje z
   ničlami je zato čista funkcija v `domain/` in ne stvar poizvedbe (FR-008, FR-039).

## §10 — Obseg `admin` in izrecna zapora za API ključ

`requireScopes(ADMIN_SCOPE)` bi zadoščal: `platform/apikeys/router.ts` obsega `admin` ne dovoli
dodeliti, torej ga ključ ne more imeti.

Kljub temu je pogoj `req.auth.subjectType !== 'user'` zapisan **posebej** (FR-003) — enako, kot to
počne `acting-user.ts` z istim razlogom, tam zapisanim: na to se namenoma ne zanašamo. Zapora, ki
stoji na tem, da nekdo drugje ni pozabil, ni zapora.

Zavihek je viden samo adminu prek `requiredScopes: ['admin']` v registru; `resolveTabs` to že zna
(`coversRequiredScopes`), odkar je 011 uvedel prvi zavihek z obsegi.

## §11 — Dan je koledarski dan v Ljubljani, obdobja so dnevi

`ljubljanaCalendarDay()` iz `domain/timezone.ts` je edini način, kako nastane ključ `day`
(člen V.4). `toISOString().split('T')[0]` je v tem projektu prepovedan in ima za sabo zgodovino
(`docs/legacy-engine.md` §4).

Obdobje je **število dni nazaj od danes**, ne zadnjih N×24 ur: 7 dni pomeni sedem koledarskih
dni, kar je tisto, kar človek pri "zadnji teden" misli, in edino, kar dnevni števci znajo.

Prehod na poletni/zimski čas: dan s 25 urami ima en ključ, dan s 23 urami prav tako. Ker je
enota dan in ne ura, prehod na števce ne vpliva — kar mora biti zapisano kot **enotski test**,
ne kot trditev (kakovostna vrata, točka 2).

## §12 — Brez grafov iz `chart.js`

`chart.js` je v `apps/web/package.json` in ga uporablja modul 011. Uvoz njegove ovojnice bi bil
uvoz med moduloma (člen I), lasten izvod pa strošek, ki ga ta zaslon ne opraviči: pregled porabe
je **lestvica**, ne časovna vrsta, in lestvica je najbolj berljiva kot tabela z vodoravnim
stolpcem iz CSS-a.

Časovne vrste (poraba skozi mesece) bi graf potrebovale — in so izrecno izven obsega, ker bi
zahtevale dnevne posnetke porabe, ki jih ta funkcionalnost ne uvaja.

## §13 — Kaj se NE meri

Namenoma ni v izmeri:

- **`db.stats()` / `collStats`**, torej dejanska zasedenost Monga z indeksi in stiskanjem. Ta
  številka na vprašanje "kdo koliko hrani" ne odgovori (indeksi nimajo lastnika) in se z vsoto
  logičnih velikosti ne sešteva.
- **Velikost besedilnih zapisov** (recepti, beležke, opravila, shranjeni linki). Reda so nekaj
  kilobajtov; v pregledu, katerega enota je gigabajt, bi bile natančen šum. Njihovo **število** je
  prikazano, ker to na vprašanje "koliko je tega" odgovarja.
- **Trajanje seje in zadrževanje na zaslonu.** Člen XII; dnevni števec tega niti ne omogoča.

## §14 — `POST /usage/views` in `Idempotency-Key`

Beleženje ogleda je mutacija, zato glavo sprejme (člen III, FR-043) — nobena izjema iz člena III
se je ne dotika: ne izda žetona in ne izda skrivnosti.

Glava je pri tej poti **koristna**, ne le obvezna: odjemalec pošlje ogled kot "pošlji in pozabi",
in ponovitev ob prekinjeni povezavi bi sicer štela dvakrat. Ker pa je nad tem še okno iz §4, sta
zaščiti dve in nobena ni odveč — glava pokrije ponovitev iste zahteve, okno pokrije dva različna
odjemalca iste osebe.

Pot ne zahteva nobenega poimenovanega obsega, samo prijavljenega uporabnika (`requireScopes()`
brez argumentov, kot `/devices`). Razlog: vsak uporabnik mora znati zabeležiti **svojo** uporabo.
Zato tudi v `BASE_USER_SCOPES` ni česa dodajati — `platform/keycloak/role-mapping.ts` ostane
nedotaknjen, kar je pri zavihku z lastnimi obsegi sicer peti korak iz `docs/adding-a-tab.md`.
