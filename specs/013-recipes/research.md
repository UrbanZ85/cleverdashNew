# Research: Recepti (013)

Odločitve, ki jih koda uveljavlja, in razlogi zanje. Vsaka točka je navedena na mestu, kjer jo
koda izvaja — kdor bo kodo spreminjal, mora najprej pobiti razlog tukaj.

## §1 — Zakaj nov modul in ne razširitev modula 008 (Shranjeni linki)

Shranjena stran in recept sta si na prvi pogled ista stvar: naslov, ime, opis. Razlikujeta se v
dveh točkah, ki nista polji:

1. **Naslov je pri receptu neobvezen.** V modulu 008 je `url` edino obvezno polje in cel modul
   stoji na njem (normalizacija, favicon, dvojniki, ime iz gostitelja). Recept brez naslova je
   polnopravni recept (US2, FR-002) — obrnjena obveznost je obrnjen model.
2. **Recept se deli.** Modul 008 je zaseben po `userId` in je ta obljuba zapisana v vsaki
   poizvedbi. Deljenje bi terjalo zamenjavo `userId` z `ownerId` + `members` in razsodnika dostopa
   pri vsakem branju — torej prepis modula, ne dodatek.

Poleg tega je odstranitev modula v tej ustavi brisanje ene mape (člen I, SC-006). Zlepljena modula
te lastnosti nimata.

## §2 — Deljenje: prevzet vzorec iz modula 010 (Opravila)

`ownerId` + `members[{ userId, role, addedAt, seenAt }]`, dostop razsodi čista funkcija v
`domain/capabilities.ts`. Kar je v 010 delovalo, se tu ponovi **poimensko**, da je koda berljiva
vštric: `roleFor`, `denyReason`, `describeDeny`, `capabilitiesFor`.

Vzorec je **prepisan, ne uvožen** (člen I, uveljavlja ga pravilo `cleverdash/module-boundary` v
`eslint.config.js`). Podvojitev je namerna: brisanje modula 010 ne sme pokvariti receptov.

**Razlika do 010**: stopnje so DVE (`view`, `edit`) in ne tri. Vmesna stopnja `check` v 010 obstaja,
ker je odkljukanje opravila smiselno ločeno od urejanja besedila. Pri receptu take vmesne poteze ni
— "skuhano" je premalo, da bi zaslužilo svojo stopnjo, in je zato pravica urejanja (FR-034).

**Razlika do 010, druga**: zaklepa (`locked`) ni. Zaklep v 010 rešuje seznam, po katerem več ljudi
hkrati kljuka; recept je zapis, ki ga eden napiše in drugi berejo. Dodati ga bo mogoče pozneje brez
spremembe modela, ker gre `denyReason` že skozi eno samo funkcijo.

## §3 — Ocena je lastnikova, ne soudeleženčeva (FR-035)

Ocena bi lahko bila polje na članstvu (`members[].rating`) in bi bila potem "moja ocena tujega
recepta". To NI narejeno, in razlog ni prostor: ocena na članstvu odpre vprašanje povprečja, s tem
pa recenzijski sistem — imenik receptov, razvrščanje po tujih ocenah, obramba pred glasovanjem. Vse
to je funkcionalnost, ki je nihče ni naročil (Out of Scope).

Ocena je tu, kar je bila v uporabnikovi glavi: zaznamek samemu sebi, ali je bilo dobro. Zato živi na
receptu in jo spreminja samo lastnik.

## §4 — Slike v bazi kot `Buffer`, ne na disku

Primerjava dveh obstoječih odločitev v tem zaledju:

| | zvok beležk (007) | deljene datoteke (009) |
|---|---|---|
| kje | `Buffer` v Mongu, `select: false` | datotečni sistem, nosilec `shared-files` |
| zakaj | do 10 MB; nosilec in varnostna kopija bi se razšla | do 500 MB; `Buffer` bi vsebnik ubil |

Slike receptov so fotografije s telefona — enak red velikosti kot zvok, dva reda pod mejo dokumenta
(16 MB). Zato **vzorec 007**: `Buffer` v ločeni zbirki s `select: false`.

Odločilen ni prostor, ampak to, da se slika in recept ne smeta raziti. Na disku bi bila slika zunaj
varnostne kopije baze in bi lahko preživela svoj recept (ali obratno) — natanko to je bil razlog v
`note-audio.model.ts` in tu velja enako.

Ločena zbirka in ne polje v receptu: bajti se ne smejo brati ob izpisu seznama (FR-025). To je isti
razlog, ki je v modulu 010 opravila PUSTIL v dokumentu (majhna, brana vedno) in zvok iz beležke
VZEL ven (velik, bran redko). Slike so na strani zvoka.

## §5 — Pomanjšava se izračuna ob nalaganju, ne ob izpisu (FR-027)

Seznam stotih receptov s stotimi naslovnimi slikami po 3 MB je 300 MB na izris. Nesprejemljivo.

Pomanjšava se zato naredi ENKRAT, ob nalaganju, in shrani ob izvirniku (`thumb`, isti dokument).
Izračun ob izpisu bi pomenil dekodiranje slike ob vsakem izrisu seznama.

**Brez nove odvisnosti**: `sharp` bi bil običajen odgovor, a je izvorni gradnik (`node-gyp`,
prevajanje ob namestitvi, drugačen paket za `linux/arm64` in `linux/amd64`) — v tem vsebniku je to
strošek, ki ga ena pomanjšana slika ne opraviči. Uporabljen je **odjemalec**: brskalnik pomanjša
sliko v `<canvas>` in pošlje OBOJE, izvirnik in pomanjšavo, v dveh poljih.

Iz tega sledi varnostna zahteva, ki jo koda uveljavlja: pomanjšava, ki pride od odjemalca, je
**nepreverjen vnos**. Zato gre skozi ISTO preverbo podpisa in velikosti kot izvirnik
(`domain/image-type.ts`), in ima svojo, nižjo mejo. Odjemalec, ki pomanjšave ne pošlje, ni napaka —
takrat je `thumb: null` in seznam postreže izvirnik. Tiste poti nihče ne uporablja, a mora obstajati,
sicer bi bil `<canvas>` v brskalniku pogoj za shranjevanje slike.

## §6 — Vrsta slike se ugotovi iz VSEBINE, ne iz `Content-Type` (FR-021)

`Content-Type` pošlje odjemalec in je zato izjava, ne dejstvo. Končnica imena je še slabša.

Preveri se **podpis datoteke** (prvih nekaj bajtov): `FF D8 FF` za JPEG, `89 PNG` za PNG,
`RIFF....WEBP` za WebP. Kar ni nič od tega, se zavrne — tudi če je `Content-Type: image/jpeg`.

Razlog ni teoretičen: slika se postreže nazaj z `Content-Type`, ki je v zapisu. HTML, ki bi se
uspešno naložil kot "slika" in se potem postregel kot `text/html` z naše domene, je shranjen XSS.
Zato se postreže IZKLJUČNO vrsta, ugotovljena iz podpisa, in nikoli tista, ki jo je poslal
odjemalec — ter vedno z `X-Content-Type-Options: nosniff` in `Content-Disposition: inline` z varnim
imenom.

## §7 — Javna povezava: vzorec 009, brez gesla

Modul 009 ima žeton IN geslo, ker gre za datoteko, ki je lahko karkoli. Recept je recept: geslo bi
pomenilo drugi kanal za nekaj, kar je bilo poslano zato, da se prebere. Zato **samo žeton**, 16
naključnih bajtov v `base64url` (22 znakov), enako kot `generateShareToken` v 009 — in prav tako
prepisano, ne uvoženo (člen I).

Kar je iz 009 prevzeto v celoti:

- **Enak odgovor za neveljaven, preklican in neobstoječ žeton** (FR-046). Različna odgovora bi
  povedala, da je žeton nekoč obstajal.
- **Dušenje po izvornem naslovu** (FR-047).
- **Preklic je nepovraten in nov žeton je nov** (FR-044, FR-045): `revokedAt` se postavi, zapis se
  obdrži za sled, nova izdaja pa je NOV `token`, ne oživitev starega.
- **Oblika žetona se preveri PRED poizvedbo.** To je najdba varnostnega pregleda 009 (glej
  `isGrantShaped` v `file-sharing/domain/share-token.ts`): `cookie-parser` razčleni vrednost, ki se
  začne z `j:`, v OBJEKT, ta pa je v Mongoose pogoju operator. Tu žeton pride iz poti in ne iz
  piškotka, kar je varneje, a se preverba oblike vseeno opravi prva — vzorec mora biti enoten,
  sicer ga naslednji modul prepiše narobe.

## §8 — Javne poti so `/shared-recipes/:token`, javna stran je `/r/:token`

Poimenovanje sledi 009 (`/share/*` → `/d/:token`, `/drop/*` → `/u/:token`): kratka javna pot v
brskalniku, opisna pot v API-ju. `/r/` je tretja javna pot v aplikaciji in mora biti prav tako brez
`authGuard` in brez `tabGuard`, pred lovilcem `**`.

## §9 — Uvoz po `schema.org/Recipe`

Strani z recepti skoraj brez izjeme nosijo `<script type="application/ld+json">` z objektom
`@type: "Recipe"`. Iz njega pridejo ime, opis, slika, `recipeIngredient` in `recipeInstructions`.

Trije robovi, ki jih koda obravnava in so v praksi pravilo, ne izjema:

1. `@graph` — objekt Recipe je zavit v seznam vozlišč. Iskati je treba rekurzivno.
2. `recipeInstructions` je lahko seznam nizov, seznam `HowToStep` objektov ali en dolg niz z
   odstavki. Vse tri oblike se zvedejo na seznam nizov.
3. `@type` je lahko seznam (`["Recipe", "NewsArticle"]`).

Razčlenjevanje je **čista funkcija** (`domain/recipe-jsonld.ts`), zato testabilna brez omrežja —
enak razlog kot pri `domain/link-metadata.ts` v 008.

Uvoz **ne teče sam od sebe** (FR-013): tuja stran se obišče ob nastanku recepta in ob izrecnem
kliku, nikoli po urniku. Odhodni klic brez povoda prepoveduje člen VIII.

Kadar strani ni mogoče prebrati, uvoz vrne `skipped`/`failed` in recept vseeno nastane (FR-012).
Isto pravilo kot `POST /saved-links` v 008 — ta je bilo treba tam izrecno zapisati, ker je bila
prvotna izvedba narobe.

## §10 — Iskanje čez zloženo polje

Prevzeto iz 008 (`searchText`): ime + opis + sestavine + oznake se ob vsakem pisanju zložijo v eno
polje z odstranjenimi šumniki in malimi črkami, iskalni niz gre skozi isto pravilo. Samo tako `buca`
najde `buča` (FR-051).

Indeksa nad tem poljem NI in ne bo: nesidran regularni izraz indeksa ne izrabi, zbirka pa je po
predpostavki iz spec.md nekaj sto zapisov na uporabnika.

## §11 — Trije obsegi, `share` ločen (FR-060, FR-061)

Prevzeto iz 010 dobesedno, vključno z razlogom: člen III postavlja API ključ za prvorazrednega
odjemalca, zato mora biti obseg njegovega UČINKA nastavljiv. Z enim obsegom za pisanje bi "n8n sme
dodati recept" nujno pomenilo tudi "n8n sme recept podariti komur koli" — in, huje, "n8n sme izdati
javno povezavo". Izdaja javne povezave je zato pod `recipes:share`, ne pod `recipes:write`.

## §12 — Zakaj so sestavine polje nizov in ne poddokumenti

`{ kolicina, enota, zivilo }` bi omogočil preračun na porcije. Ni izbran, ker terja razčlenjevanje
vnosa ("ščepec", "2-3 žlice", "po okusu") — torej ugibanje, ki se moti pri natanko tistih vnosih, ki
jih človek vpiše na roko. Napačno razčlenjena sestavina je slabša od nerazčlenjene.

Preračun je v Out of Scope. Kadar bo naročen, bo razčlenjevanje nov, neobvezen sloj NAD tem poljem —
niz ostane resnica, razčlenitev postane izpeljava. Obratna pot (iz poddokumentov nazaj v niz) je
izguba podatka.

## §13 — En dokument, brez transakcij

Ista omejitev kot v 010: MongoDB v tej namestitvi teče brez `--replSet`, transakcij čez več
dokumentov ni. Zato je recept agregat — vsebina, oznake, soudeleženci in javna povezava v enem
dokumentu, vsaka sprememba eno atomarno pisanje prek operatorjev (`$set`, `$push`, `$pull`), nikoli
brati-spremeniti-pisati.

Slike so izjema in so v svoji zbirki (§4). Iz tega sledi edino mesto, kjer je lahko zapis nedosleden:
recept, izbrisan med nalaganjem slike. Zato se ob dokončanju nalaganja PREVERI, da recept še obstaja,
in se slika ob odsotnosti pobriše — namesto da bi osirotela (FR-026, Edge Case).

## §14 — `versionKey: false` in nobene optimistične sočasnosti

Prevzeto iz 010 z istim razlogom: `__v` bi `save()` naredil videti varen — deloval bi v razvoju in
izgubljal popravke v produkciji. Odsotnost `__v` je uveljavljanje pravila "nikoli
brati-spremeniti-pisati", ne opustitev.

## §15 — Kategorije: recept hrani IMENA, ne identifikatorjev

Dodano po prvem preizkusu modula: oznake (`tags`) so prosto besedilo in za razvrstitev po obroku
("Juhe", "Kosila", "Zajtrki", "Večerje") ne zadoščajo — isti pojem se sčasoma zapiše v treh
različicah in filter razpade.

Kategorija je zato SVOJ pojem z urejenim besednjakom. Odločitev, ki jo je bilo treba sprejeti, je
bila, kako recept nanj kaže.

**Zavrnjeno: `categoryIds: [ObjectId]` s `ref: 'RecipeCategory'`.** Videti je pravilneje in bi dalo
preimenovanje zastonj. Ne gre, ker so recepti DELJENI: recept vidita dva uporabnika, vsak s svojim
besednjakom, in identifikator bi za soudeleženca kazal v zbirko, ki ni njegova. Rešitve tega so tri
in vse slabše od izbrane — skupen besednjak (vsak dodatek vidijo vsi), besednjak lastnika (urejanje
tujega recepta spreminja tuj seznam) ali razreševanje imen po lastniku ob vsakem izpisu (filter po
kategoriji čez lastne in deljene recepte postane nemogoč).

**Izbrano: `categories: [String]` + `categoryKeys: [String]`**, isti par kot pri oznakah. Filter
deluje enotno čez lastne in deljene recepte, izbris kategorije iz besednjaka pa ne pusti recepta
kazati v nič.

Kar ta izbira stane in je zapisano v pogodbi, ne skrito:

1. **Preimenovanje je poseg v več zapisov.** Popravi ime v besednjaku in v receptih, katerih
   LASTNIK je klicatelj; v tuje deljene ne seže. Odgovor vrne število, da je obseg viden (člen VII).
2. **Vira se lahko razideta.** Recept sme nositi kategorijo, ki je v besednjaku klicatelja ni.
   To je VELJAVNO stanje in ne napaka — nastane, kadar jo je dodal drug soudeleženec. Izbirnik v
   urejevalniku zato ponudi besednjak PLUS kategorije, ki jih recept že nosi, sicer bi prvo
   shranjevanje tiho odstranilo kategorijo, ki je nihče ni odstranil.

Besednjak je `userId` in ne `ownerId` (glej data-model.md): je zaseben in tu obljuba iz `note.model.ts`
drži v celoti. To je edina zbirka tega modula, pri kateri je tako.
