# Feature Specification: Recepti

**Feature Branch**: `013-recipes`
**Status**: Draft
**Input**: "Nov modul za recepte. URL, opis, deljenje med uporabniki, pripenjanje slik."

## Zakaj

Recept je danes v tej hiši na treh mestih hkrati: povezava v brskalniku, fotografija babičinega
lista v galeriji in stavek "pošlji mi še tisto za štruklje" v pogovoru. Nobeno od teh treh ne
preživi menjave telefona in nobeno ni na dosegu roke, ko človek stoji pred štedilnikom.

Modul 008 (Shranjeni linki) zna prvo tretjino — povezavo z opisom — in je za recept premalo iz
dveh razlogov. Prvi: recept je pogosto **brez povezave** (babičin list, lasten poskus), zato
naslov ne sme biti obvezen. Drugi in pomembnejši: recept se **deli**, shranjena stran pa ne.
Deljenje ni polje, ki bi ga bilo mogoče dograditi — je drug model dostopa (`ownerId` + `members`
namesto `userId`, glej modul 010) in zato drug modul.

Modul 009 (Deljenje datotek) zna poslati sliko recepta človeku brez računa, a kot datoteko brez
konteksta: prejemnik dobi `IMG_4821.jpg` in nič od tega, koliko časa se peče.

Ta modul postavi recept kot celoto: kar je na spletu, kar je bilo prepisano z lista, slike ob
tem, in oboje deljeno — s soudeležencem, ki ima račun, ali s povezavo za nekoga, ki ga nima.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Shranim recept s spleta (Priority: P1) 🎯 MVP

Najdem recept na spletu in ga hočem imeti pri sebi, preden stran izgine ali se prenovi.

**Why this priority**: Najkrajša pot do vrednosti in edina, ki jo mora modul znati, da je sploh
uporaben. Vse ostalo stoji na zapisu, ki nastane tukaj.

**Independent Test**: Prilepi naslov strani z receptom, shrani, osveži brskalnik — recept je v
seznamu z imenom, prebranim s strani.

**Acceptance Scenarios**:

1. **Given** prazen seznam, **When** prilepim naslov recepta in shranim, **Then** nastane zapis,
   katerega ime je prebrano s strani, in ne "brez naslova".
2. **Given** stran, ki ima recept označen po `schema.org/Recipe`, **When** sprožim uvoz, **Then**
   se sestavine in koraki predlagajo izpolnjeni, jaz pa jih smem popraviti ali zavreči, preden
   shranim.
3. **Given** stran, ki je nedosegljiva, **When** shranim, **Then** recept vseeno nastane — z
   imenom, ki sem ga vpisal, in z vidno oznako, da strani ni bilo mogoče prebrati.
4. **Given** naslov, ki ni `http` ali `https`, **When** shranim, **Then** zavrnitev pove, katera
   shema je bila zavrnjena.

### User Story 2 - Prepišem recept z lista (Priority: P1)

Babičin recept je na papirju. Nobene povezave ni in je ne bo.

**Why this priority**: Enakovreden prvemu scenariju, ne izjema. Če naslov ni obvezen, je ta modul
kuharica; če je, je samo drug seznam zaznamkov.

**Independent Test**: Naredi recept brez naslova — samo ime, sestavine in koraki. Shrani se in v
seznamu je videti enakovreden tistim s povezavo.

**Acceptance Scenarios**:

1. **Given** obrazec brez naslova, **When** vpišem ime in shranim, **Then** recept nastane.
2. **Given** recept brez naslova in brez sestavin, **When** shranim, **Then** recept nastane —
   ime je edino obvezno polje.
3. **Given** prilepim več vrstic v polje za sestavine, **Then** vsaka vrstica postane svoja
   sestavina, ne ena dolga.

### User Story 3 - Pripnem sliko (Priority: P1)

Kako naj bi bilo videti, in kako je bilo videti, ko sem to zadnjič delal.

**Why this priority**: Slika je bila v zahtevi izrecno navedena in je pri receptu edini podatek,
ki ga besedilo ne nadomesti.

**Independent Test**: Pripni dve sliki, eno določi za naslovno, osveži — naslovna je v seznamu.

**Acceptance Scenarios**:

1. **Given** recept, **When** naložim sliko JPEG/PNG/WebP, **Then** je pripeta in vidna.
2. **Given** recept z več slikami, **When** eno določim za naslovno, **Then** je ta v seznamu.
3. **Given** slika, večja od dovoljene, **When** jo poskusim naložiti, **Then** zavrnitev pove
   največjo dovoljeno velikost, druge slike pa ostanejo nedotaknjene.
4. **Given** datoteka, ki ni slika (npr. PDF ali izvršljiva), **When** jo poskusim naložiti,
   **Then** je zavrnjena po DEJANSKI vrsti vsebine, ne po končnici imena.
5. **Given** recept z naslovno sliko, **When** naslovno sliko izbrišem, **Then** recept ostane in
   naslovna postane katera od preostalih ali nobena.
6. **Given** fotografija s telefona (4–6 MB), **When** jo naložim, **Then** se shrani pomanjšana in
   stisnjena — reda 150–350 kB — in na zaslonu ni videti razlike.
7. **Given** fotografija, posneta pokončno, **When** jo naložim, **Then** ni obrnjena.
8. **Given** sličica v receptu, **When** kliknem nanjo, **Then** se pokaže čez cel zaslon; pri več
   slikah se je mogoče premikati naprej in nazaj.

### User Story 4 - Delim recept s sodelavcem (Priority: P2)

Sodelavka hoče recept, ki sem ga sinoči shranil. Ima račun v CleverDashu.

**Why this priority**: Drugi razlog za obstoj tega modula. Brez tega je to zasebna kuharica.

**Independent Test**: Deli recept z drugim uporabnikom kot bralcem — pri njem se pojavi, označen
kot nov, in ga ne more spremeniti.

**Acceptance Scenarios**:

1. **Given** recept in izbran uporabnik, **When** ga dodam kot bralca, **Then** recept vidi, a ga
   ne more urejati in tega vmesnik pri njem niti ne ponudi.
2. **Given** soudeleženec s pravico urejanja, **When** popravi sestavino, **Then** je sprememba
   vidna obema in zapisano je, kdo je zadnji spremenil.
3. **Given** deljen recept, **When** deljenje prekličem, **Then** ga soudeleženec takoj ne vidi več.
4. **Given** deljen recept, **When** ga soudeleženec zapusti, **Then** izgine njemu, meni pa ostane.
5. **Given** deljen recept, **When** ga lastnik izbriše, **Then** izgine vsem — kopij ni.
6. **Given** sem soudeleženec in ne lastnik, **When** poskusim recept izbrisati, **Then** zavrnitev
   pove, da to sme samo lastnik.

### User Story 5 - Pošljem recept nekomu brez računa (Priority: P2)

Sosed nima in ne bo imel računa, recept pa hoče.

**Why this priority**: Brez tega bi bilo deljenje omejeno na peščico ljudi v tej namestitvi, kar
pri receptih ni realna omejitev.

**Independent Test**: Izdaj javno povezavo, odpri jo v zasebnem oknu brez prijave — recept je viden.

**Acceptance Scenarios**:

1. **Given** recept, **When** izdam javno povezavo, **Then** jo dobim in odpre se brez prijave.
2. **Given** javna povezava, **When** jo odpre kdor koli, **Then** vidi ime, sestavine, korake in
   slike — ne pa mojega imena, e-pošte, drugih receptov ne česar koli o soudeležencih.
3. **Given** javna povezava, **When** jo prekličem, **Then** od tega trenutka ne odpre ničesar.
4. **Given** preklicana povezava, **When** izdam novo, **Then** ima nova drug žeton in stara ostane
   mrtva.
5. **Given** javna povezava, **When** jo odpre obiskovalec, **Then** ne more ničesar spremeniti —
   niti označiti kot skuhano, niti naložiti slike.

### User Story 6 - Najdem, kar iščem (Priority: P2)

Receptov je sto in hočem tistega z bučo.

**Acceptance Scenarios**:

1. **Given** več receptov, **When** vpišem del besede, **Then** se išče po imenu, opisu, sestavinah
   in oznakah hkrati.
2. **Given** iskanje "buca", **Then** najde tudi "buča" — šumniki in velike črke ne ločujejo.
3. **Given** oznaka, **When** jo izberem, **Then** seznam pokaže samo recepte s to oznako.

### User Story 7 - Kuham po njem (Priority: P3)

Stojim pred štedilnikom z umazanimi rokami in telefonom na pultu.

**Why this priority**: Recept, ki ga je treba med kuhanjem ščipati in prebujati, je recept, ki ga
človek naslednjič spet poišče na spletu.

**Acceptance Scenarios**:

1. **Given** recept, **When** vklopim način kuhanja, **Then** so sestavine in koraki v veliki
   pisavi, brez menija in brez ostalega vmesnika.
2. **Given** način kuhanja, **Then** zaslon ne ugasne, dokler je odprt, in se povrne ob izhodu.
3. **Given** korak v načinu kuhanja, **When** ga odkljukam, **Then** ostane odkljukan, dokler je
   način odprt — in se NE shrani v recept, ker to ni lastnost recepta, ampak enega kuhanja.

### User Story 8 - Vem, kaj že dolgo ni bilo na mizi (Priority: P3)

**Acceptance Scenarios**:

1. **Given** recept, **When** označim "skuhano danes", **Then** se zapiše datum in števec naraste.
2. **Given** ocena od 1 do 5, **When** jo nastavim, **Then** je moja in se ohrani.
3. **Given** seznam, **When** izberem razvrstitev po tem, kdaj je bilo nazadnje kuhano, **Then** so
   nikoli kuhani na vrhu, za njimi pa najdlje nekuhani.

### User Story 9 - Recept dodam brez vmesnika (Priority: P4)

n8n prestreže povezavo iz pogovora in jo shrani med recepte.

**Acceptance Scenarios**:

1. **Given** API ključ z `recipes:write`, **When** pošljem naslov, **Then** recept nastane pri
   razrešenem lastniku.
2. **Given** API ključ brez `recipes:share`, **When** poskusim recept deliti, **Then** zavrnjeno —
   pisanje in deljenje sta ločena obsega.

### User Story 10 - Razvrstim recepte po obroku (Priority: P2)

Receptov je petdeset in hočem videti samo juhe. Ali samo tisto, kar delam za zajtrk.

**Why this priority**: Oznake (US6) to načeloma zmorejo, a so prosto besedilo: isti pojem se
sčasoma zapiše kot "juha", "Juhe" in "juhice", filter pa razpade na različice istega. Razvrstitev,
ki je pri kuharici glavni način iskanja, potrebuje urejen besednjak in ne prostega vnosa.

**Independent Test**: Ustvari kategorije Juhe, Kosila, Zajtrki, Večerje; receptu dodeli dve; v
seznamu klikni čip in dobi samo recepte te kategorije.

**Acceptance Scenarios**:

1. **Given** prazen besednjak, **When** dodam "Juhe", **Then** je na voljo v izbirniku recepta in
   kot čip nad seznamom, tudi dokler ni v njej nobenega recepta.
2. **Given** recept, **When** mu dodelim "Juhe" IN "Kosila", **Then** se pojavi pod obema — bučna
   juha je oboje in izbirati med njima bi bilo napačno vprašanje.
3. **Given** kategorija "Večerje", **When** v filter vpišem `vecerje`, **Then** se ujame — velike
   črke in šumniki ne ločujejo.
4. **Given** izbrana kategorija in izbrana oznaka, **Then** delujeta hkrati ("juhe, ki so vegi").
5. **Given** kategorija "Juhe" na treh receptih, **When** jo preimenujem v "Juhice", **Then** se
   ime popravi tudi na vseh treh in povedano mi je, koliko jih je bilo.
6. **Given** kategorija na treh receptih, **When** jo izbrišem, **Then** je NOBEN recept ne izgubi
   — izgubijo samo to kategorijo, in povedano mi je, koliko jih je bilo.
7. **Given** kategorije v besednjaku, **When** jih prerazporedim, **Then** je vrstni red čipov in
   izbirnika enak temu.
8. **Given** recept, ki mi ga je nekdo delil in nosi kategorijo, ki je v mojem besednjaku ni,
   **Then** jo vseeno vidim in je ob urejanju ne izgubim.

### Edge Cases

- Naslov, daljši od 2048 znakov → zavrnjen z razlogom, ne odrezan.
- Isti naslov dvakrat → dovoljeno; javi se kot dvojnik, ne prepreči.
- Recept brez imena, brez naslova in brez vsebine → zavrnjen: ime je obvezno.
- Soudeleženec, ki v Keycloaku izgine → recept ostane lastniku; vnos soudeleženca ne obvisi kot
  prazna vrstica, ampak izpade iz izpisa.
- Lastnik samega sebe doda med soudeležence → zavrnjeno, lastništvo ni stopnja soudeleženca.
- Javna povezava do izbrisanega recepta → 404, enak odgovor kot za neobstoječ žeton, da žeton ne
  pove, ali je kdaj obstajal.
- Slika, ki se nalaga k receptu, ki ga med tem lastnik izbriše → slika se ne osiroti.
- Preklicana javna povezava, odprta iz predpomnilnika → 404, ne stara vsebina.
- Uvoz s strani, ki v `schema.org/Recipe` navede 400 sestavin → odrežejo se na trdo mejo in to se
  pove, namesto da bi zapis zavrnili v celoti.
- Kategorija, ki je v receptu, a je v besednjaku klicatelja ni (dodal jo je soudeleženec ali je bila
  izbrisana) → je veljavna, se prikaže in se ob urejanju ne izgubi.
- Dve kategoriji, ki se razlikujeta samo v velikosti črk ali šumnikih → sta ista kategorija.
- Ime kategorije, od katerega po zlaganju ne ostane nič (sama ločila) → zavrnjeno, ker po njem ne
  bi bilo mogoče filtrirati.

## Requirements *(mandatory)*

### Functional Requirements

#### Recept

- **FR-001**: Sistem MORA hraniti recept z imenom (obvezno, do 200 znakov).
- **FR-002**: Naslov (URL) je NEOBVEZEN. Kadar je podan, se normalizira in dovoljena sta samo
  `http` in `https`.
- **FR-003**: Sistem MORA hraniti neobvezen opis (do 5000 znakov), seznam sestavin (do 100 vnosov
  po 200 znakov), seznam korakov (do 100 vnosov po 2000 znakov), čas priprave v minutah, število
  porcij in do 20 oznak.
- **FR-004**: Sestavine in koraki so BESEDILO, ne razčlenjene količine — "400 g buče" je en vnos.
- **FR-005**: Večvrstični vnos se razbije po vrsticah; prazne vrstice se zavržejo.
- **FR-006**: Oznake se hranijo zložene (male črke, brez šumnikov) in prikazujejo, kot so bile
  vpisane.
- **FR-007**: Sistem MORA hraniti oceno (1–5), pri čemer `null` pomeni "brez ocene".
- **FR-008**: Sistem MORA hraniti datum zadnjega kuhanja in števec; oboje se spreminja samo prek
  izrecnega dejanja "skuhano".
- **FR-009**: Sistem MORA zabeležiti, kdo je recept nazadnje spremenil.

#### Uvoz s spletne strani

- **FR-010**: Ob podanem naslovu sme sistem stran prebrati in iz nje predlagati ime, opis, sliko,
  sestavine in korake.
- **FR-011**: Branje strani MORA iti skozi isto varovalo odhodnih naslovov kot obstoječi moduli;
  zavrnjen naslov pomeni `skipped`, ne napako.
- **FR-012**: Branje strani NE SME biti pogoj za nastanek recepta. Zapis nastane tudi, kadar branje
  spodleti, in se ob tem NE razveljavi.
- **FR-013**: Uvoz se NE sme sprožiti sam od sebe po nastanku recepta — samo ob nastanku in ob
  izrecnem ponovnem uvozu.
- **FR-014**: Uvoženo ime NE SME prepisati imena, ki ga je vpisal uporabnik.

#### Slike

- **FR-020**: K receptu je mogoče pripeti več slik; vsebina se hrani v bazi, ne na datotečnem
  sistemu.
- **FR-021**: Dovoljene vrste so JPEG, PNG in WebP, ugotovljene iz DEJANSKE vsebine (podpis
  datoteke), ne iz `Content-Type` ali končnice.
- **FR-022**: Velikost posamezne slike je omejena z nastavitvijo okolja; presežek vrne `413` z
  navedeno mejo.
- **FR-023**: Število slik na recept je omejeno; presežek vrne `409` z navedeno mejo.
- **FR-024**: Ena slika je lahko naslovna; ob brisanju naslovne se naslovna prenese na najstarejšo
  preostalo ali postane `null`.
- **FR-025**: Bajti slike se NE smejo prenašati ob izpisu seznama — samo prek namenske poti.
- **FR-026**: Brisanje recepta MORA izbrisati njegove slike.
- **FR-027**: Sistem MORA k vsaki sliki hraniti pomanjšavo za seznam, da izpis ne prenaša
  izvirnikov.
- **FR-028**: Vmesnik MORA sliko pred nalaganjem pomanjšati (daljša stranica največ 1600 px) in
  stisniti v WebP, kjer ga brskalnik zna zakodirati; sicer v JPEG. Kadar bi bil rezultat večji od
  izvirnika in pomanjšave ni bilo, se naloži izvirnik.
- **FR-029**: Zasuk iz EXIF MORA preživeti pretvorbo — fotografija s telefona se ne sme shraniti
  obrnjena.
- **FR-030a**: Klik na sliko jo MORA prikazati povečano čez cel zaslon; pri več slikah je mogoče
  med njimi premikati. Povečava prenese POLNO sliko, seznam pa pomanjšavo.

#### Deljenje med uporabniki

- **FR-030**: Lastnik sme recept deliti z drugimi uporabniki te namestitve v vlogi `view` (ogled)
  ali `edit` (urejanje).
- **FR-031**: Vlogo je mogoče spremeniti in odvzeti; odvzem je takojšen.
- **FR-032**: Soudeleženec sme recept zapustiti sam. Lastnik ga ne more zapustiti — lahko ga samo
  izbriše.
- **FR-033**: Soudeleženec `view` ne sme spremeniti ničesar, vključno z oznako "skuhano" in
  slikami.
- **FR-034**: Soudeleženec `edit` sme spreminjati vsebino, slike in oznako "skuhano"; NE sme
  upravljati deljenja, brisati recepta ne izdajati javnih povezav.
- **FR-035**: Ocena je LASTNIKOVA lastnost recepta, ne soudeleženčeva — soudeleženec je ne
  spreminja.
- **FR-036**: Deljenje z uporabnikom, ki se še nikoli ni prijavil, MORA biti zavrnjeno.
- **FR-037**: Lastnik samega sebe ne more dodati med soudeležence.
- **FR-038**: Dokler soudeleženec recepta ni odprl, je zanj označen kot nov.
- **FR-039**: Imena in e-pošte soudeležencev se NE shranjujejo v recept — berejo se ob izpisu iz
  imenika uporabnikov.

#### Javna povezava

- **FR-040**: Lastnik sme za recept izdati javno povezavo z neuganljivim žetonom (128 bitov
  naključja).
- **FR-041**: Javna stran MORA biti dosegljiva brez računa in brez prijave.
- **FR-042**: Javna stran sme razkriti IZKLJUČNO ime, opis, naslov, sestavine, korake, čas,
  porcije, oznake in slike. NE sme razkriti lastnika, soudeležencev, ocene, zgodovine kuhanja,
  identifikatorjev zapisa ne katerega koli drugega recepta.
- **FR-043**: Javna povezava je samo za BRANJE — nobene poti, ki bi karkoli spremenila.
- **FR-044**: Povezavo je mogoče kadar koli preklicati; preklic je takojšen in nepovraten.
- **FR-045**: Izdaja nove povezave po preklicu MORA dati nov žeton; stari ne sme oživeti.
- **FR-046**: Neveljaven, preklican in neobstoječ žeton MORAJO vrniti ENAK odgovor.
- **FR-047**: Javne poti MORAJO biti dušene po izvornem naslovu, da žetonov ni mogoče ugibati.
- **FR-048**: Izbris recepta MORA ubiti njegovo javno povezavo.

#### Kategorije

- **FR-080**: Uporabnik MORA imeti lasten, urejen besednjak kategorij ("Juhe", "Kosila",
  "Zajtrki", "Večerje"), ki ga sam ustvarja, preimenuje, prerazporeja in briše.
- **FR-081**: Recept sme nositi VEČ kategorij hkrati (do 8). Ujemanje je neobčutljivo na velike
  črke in šumnike; prikaže se oblika, kot je bila vpisana.
- **FR-082**: Kategorija in oznaka sta LOČENA filtra in ju je mogoče uporabiti hkrati.
- **FR-083**: Kategorija sme obstajati, preden je vanjo uvrščen prvi recept.
- **FR-084**: Ime, ki ga recept navede in ga v besednjaku ni, se SAMODEJNO doda v besednjak
  klicatelja — brez tega bi bila za eno dejanje potrebna dva klica.
- **FR-085**: Izbris kategorije jo odstrani z receptov in NE SME izbrisati nobenega recepta.
  Odgovor mora povedati, koliko receptov je bilo zadetih.
- **FR-086**: Preimenovanje popravi ime v receptih, katerih LASTNIK je klicatelj. V tuje deljene
  recepte ne seže; odgovor mora povedati obseg.
- **FR-087**: Besednjak je ZASEBEN — tujega uporabnik ne vidi in ga ne more spreminjati.
- **FR-088**: Kategorije so vidne tudi na javni strani: so lastnost jedi, ne podatek o lastniku.
  Sam besednjak javno NI dosegljiv.

#### Iskanje in razvrstitev

- **FR-050**: Iskanje MORA teči čez ime, opis, sestavine, oznake in kategorije hkrati — človek,
  ki vpiše "juhe", pričakuje juhe in ne nasveta, naj namesto tega uporabi čip.
- **FR-051**: Iskanje MORA biti neobčutljivo na velike črke in na šumnike (`buca` najde `buča`).
- **FR-052**: Seznam je mogoče omejiti na eno oznako in, neodvisno, na eno kategorijo.
- **FR-053**: Razvrstitve: nazadnje spremenjeni, po imenu, po oceni, po tem, kdaj je bilo nazadnje
  kuhano. Nikoli kuhani se pri zadnji uvrstijo PRED najdlje nekuhane.
- **FR-054**: Seznam MORA vsebovati lastne IN deljene recepte, z vidno razliko med njimi.

#### API in obsegi

- **FR-060**: Modul nosi TRI obsege: `recipes:read`, `recipes:write` in `recipes:share`.
- **FR-061**: `recipes:share` NE sme biti del `recipes:write` — deljenje je edina operacija, ki
  odpre dostop tujemu človeku.
- **FR-062**: Klicatelj z API ključem (brez osebe) MORA lastnika razrešiti enako kot moduli 009/010.
- **FR-063**: Tuj recept MORA vrniti `404`, ne `403` — obstoj tujega zapisa ni podatek.
- **FR-064**: Odgovor MORA vsebovati zmožnosti klicatelja, da vmesnik kontrol ne ugiba.

#### Zavihek

- **FR-070**: Modul je zavihek `recipes` in je privzeto VKLOPLJEN.
- **FR-071**: Javna stran NE SME biti zavihek in ne sme biti odvisna od tega, ali ima lastnik
  zavihek vklopljen.
- **FR-072**: Odstranitev modula MORA biti brisanje ene mape na vsaki strani in petih vpisov.

### Key Entities

- **Recipe** — agregat: vsebina, oznake, soudeleženci in javna povezava v enem dokumentu.
  Lastnina je `ownerId`, NE `userId` (zapis ni zaseben).
- **RecipeImage** — ločena zbirka, ker so bajti veliki in se ob izpisu seznama ne smejo brati.
- **RecipeMember** — `{ userId, role, addedAt, seenAt }`, poddokument brez lastnega `_id`.
- **RecipeCategory** — vnos v ZASEBNEM besednjaku enega uporabnika. Recept nanj kaže z IMENOM,
  ne z identifikatorjem.
- **PublicShare** — `{ token, createdAt, revokedAt }`, poddokument.

## Out of Scope

- Preračun količin na število porcij in nakupovalni seznam. Sestavine so besedilo (FR-004);
  preračun terja razčlenjene količine in enote, kar je svoja funkcionalnost.
- Ploščica na nadzorni plošči. Terja vpis v register ploščic zunaj modula, česar
  `docs/adding-a-tab.md` ne dovoljuje brez svoje odločitve.
- Javno OBJAVLJANJE (imenik receptov vseh uporabnikov). Deljenje je namerno dejanje, ne stanje.
- Komentarji in ocene soudeležencev. Ocena je lastnikova (FR-035).
- Video priloge in uvoz iz PDF.
- Prevajanje receptov in pretvorba enot.

## Success Criteria *(mandatory)*

- **SC-001**: Recept s spleta je shranjen v dveh potezah: prilepi naslov, shrani.
- **SC-002**: Recept brez naslova je shranjen z enim obveznim poljem.
- **SC-003**: Deljen recept je pri prejemniku viden brez njegovega posega.
- **SC-004**: Preklicana javna povezava od tega trenutka ne odpre ničesar.
- **SC-005**: Izpis seznama stotih receptov ne prenese nobenega izvirnika slike.
- **SC-006**: Brisanje mape modula in petih vpisov pusti `typecheck`, `lint` in teste čiste.
- **SC-007**: Soudeleženec `view` v vmesniku nima nobene kontrole, ki bi ob kliku vrnila 403.
- **SC-008**: Izbris kategorije s tremi recepti pusti vse tri recepte.
- **SC-009**: Fotografija s telefona zasede po nalaganju manj kot desetino izvirne velikosti.

## Assumptions

- Receptov je na uporabnika nekaj sto, ne deset tisoč — iskanje z nesidranim regularnim izrazom
  zadošča in poseben indeks nad iskalnim poljem ni potreben.
- Slike so fotografije s telefona, reda velikosti nekaj MB — `Buffer` v Mongu je pravi nosilec
  (isti razlog kot zvok pri beležkah in nasproten kot pri deljenju datotek).
- Uporabnikov te namestitve je peščica — imenik za izbiro soudeleženca se prenese naenkrat.
