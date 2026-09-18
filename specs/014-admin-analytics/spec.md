# Feature Specification: Administratorska analitika

**Feature Branch**: `014-admin-analytics`
**Created**: 2026-09-17
**Status**: Draft
**Input**: "Pregled diska — koliko recepti, slike in datoteke zasedejo skupno in na osebo. Vidijo samo admini. Ter statistika vpisov, katere zaslone pregledujejo in kolikokrat se prijavijo."

## Zakaj

CleverDash je do tu zrasel čez deset zavihkov, od katerih trije pišejo bajte: slike receptov,
zvočni posnetki beležk in deljene datoteke — zadnje do 500 MB na kos. Nihče danes ne more
odgovoriti na dve vprašanji, ki ju bo namestitev slej ko prej zastavila:

1. **Koliko prostora je porabljenega in kdo ga porablja?** Kvota na uporabnika v modulu 009
   obstaja, a odgovarja samo na "ali gre še ena datoteka noter" za enega človeka in samo za
   deljene datoteke. Slike receptov in posnetki beležk nimajo niti tega. Ko bo nosilec poln, bo
   to prvi znak, da je bilo vprašanje pravo — in takrat je odgovor potreben v minuti, ne v seji
   nad bazo.
2. **Ali se aplikacija sploh uporablja in kateri del?** Prijave se danes beležijo izključno v
   strukturiran dnevnik. Dnevnik je pravo mesto za posamezen dogodek, a ni mesto, s katerega se
   šteje: vrtljiv je, ni razvrščen po uporabniku in ga po namestitvi nihče ne bere. Vprašanje
   "kdo se je ta mesec sploh prijavil" in "ali kdo uporablja evidenco delovnega časa" je zato
   danes brez odgovora.

Ta funkcionalnost postavi oboje na en zaslon, ki ga vidi **samo administrator**, in pod njim
najmanjše možno zbiranje podatkov, ki na vprašanji odgovori.

Kaj ta funkcionalnost namenoma **ni**: ni nadzor nad zaposlenimi in ni sledenje poti osebe po
aplikaciji. Zato se ne beleži niti ena pot (URL), niti en IP naslov, niti en posamezen klik s
časovnim žigom — beležijo se **dnevni števci po zavihku**, iz katerih je mogoče prešteti
uporabo, ni pa mogoče rekonstruirati, kaj je kdo delal ob pol štirih popoldne (člen XII).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Vidim, koliko prostora je porabljenega in kdo ga porablja (Priority: P1) 🎯 MVP

Kot administrator hočem na enem zaslonu videti, koliko prostora zaseda namestitev, kako se to
razbije po vrsti vsebine in koliko od tega odpade na vsako osebo.

**Why this priority**: To je vprašanje, ki je funkcionalnost sprožilo, in edino, ki ima rok —
poln nosilec ustavi nalaganje datotek za vse. Samostojno uporabno tudi brez vsega ostalega.

**Independent Test**: Naloži datoteko, sliko k receptu in posnetek k beležki, odpri zavihek
Analitika — vse tri se pojavijo v svojih vrsticah, seštevek se ujema, oseba, ki jih je naložila,
je v tabeli po osebah.

**Acceptance Scenarios**:

1. **Given** namestitev s tremi uporabniki in vsebino v vseh treh virih, **When** odprem zavihek
   Analitika, **Then** vidim skupno porabo namestitve, razbitje po vrsti vsebine (slike receptov,
   posnetki beležk, deljene datoteke) in tabelo po osebah, v kateri je vsota vsake vrstice enaka
   vsoti njenih postavk.
2. **Given** tabela po osebah, **When** jo pogledam, **Then** je vsaka oseba navedena z imenom in
   zamaskirano e-pošto v isti obliki kot v izbirniku oseb.
3. **Given** uporabnik, ki nima naložene nobene vsebine, **When** pogledam tabelo, **Then** je v
   njej z ničlo in ne manjka — "kdo ničesar ne hrani" je enako veljavno vprašanje.
4. **Given** pregled, **When** ga pogledam, **Then** poleg bajtov vidim tudi ŠTEVILO zapisov
   (koliko receptov, koliko slik, koliko beležk, koliko posnetkov, koliko datotek), ker "ena
   datoteka po 400 MB" in "štiristo datotek po 1 MB" nista isti položaj.
5. **Given** nosilec, na katerem so deljene datoteke, **When** odprem pregled, **Then** vidim
   tudi njegovo skupno in prosto kapaciteto — poraba brez tega ne pove, kdaj bo konec.
6. **Given** oseba brez obsega `admin`, **When** poskusi odpreti zaslon ali poklicati pregled,
   **Then** zavihka v meniju sploh nima in klic je zavrnjen.

---

### User Story 2 - Vidim, kdo se prijavlja in kdaj je bil nazadnje tu (Priority: P1)

Kot administrator hočem vedeti, kdo aplikacijo sploh uporablja: kolikokrat se je kdo prijavil v
izbranem obdobju in kdaj je bil nazadnje aktiven.

**Why this priority**: Enakovredno prvemu scenariju. Brez tega ni mogoče ločiti uporabnika, ki
aplikacije ni odprl pol leta, od tistega, ki je v njej vsak dan — kar je predpogoj za vsako
odločitev o računih in o tem, kateri moduli se splačajo.

**Independent Test**: Prijavi se dvakrat z dvema računoma, odpri pregled — obe osebi imata po dve
prijavi in čas zadnje aktivnosti.

**Acceptance Scenarios**:

1. **Given** uporabnik, ki se je v obdobju prijavil trikrat, **When** pogledam statistiko,
   **Then** pri njem piše tri prijave.
2. **Given** izbirnik obdobja (7, 30, 90 dni), **When** ga preklopim, **Then** se števila
   preračunajo za izbrano obdobje, prikazan pa je tudi datum, od katerega podatki obstajajo.
3. **Given** uporabnik, ki se v obdobju ni prijavil niti enkrat, **When** pogledam statistiko,
   **Then** je v seznamu z ničlo in s časom zadnje prijave, ki je zunaj obdobja.
4. **Given** namestitev, v kateri je funkcionalnost šele začela zbirati podatke, **When**
   pogledam obdobje, ki sega pred ta datum, **Then** je izrecno napisano, da podatkov pred tem
   datumom ni — prazno obdobje ne sme biti videti kot "nihče se ni prijavljal".
5. **Given** pregled, **When** ga pogledam, **Then** vidim tudi, koliko oseb je bilo v obdobju
   aktivnih in koliko jih ima račun, a se niso prijavile.

---

### User Story 3 - Vidim, kateri zavihki se uporabljajo (Priority: P2)

Kot administrator hočem vedeti, kateri zavihki se odpirajo in kateri ne — skupno za namestitev in
po osebi.

**Why this priority**: Odgovori na "ali se ta modul splača vzdrževati", kar je pri tolikšnem
številu modulov prava odločitev. Ni pa nujno za to, da namestitev deluje, zato za P1.

**Independent Test**: Klikni po petih zavihkih, odpri Analitiko — vsak od njih ima števec ogledov
in čas zadnjega ogleda.

**Acceptance Scenarios**:

1. **Given** uporabnik, ki je v enem dnevu petkrat odprl Beležke, **When** pogledam statistiko,
   **Then** je pri Beležkah pet ogledov za ta dan.
2. **Given** statistika ogledov, **When** jo pogledam, **Then** je lestvica zavihkov po uporabi
   vidna za celotno namestitev IN razbita po osebi.
3. **Given** zavihek, ki ga v obdobju ni odprl nihče, **When** pogledam lestvico, **Then** je na
   njej z ničlo in ne manjka — neuporabljen zavihek je ravno tisti podatek, ki se išče.
4. **Given** administrator, ki dela v imenu druge osebe (prevzem imena, 012), **When** brska po
   zavihkih, **Then** se ogledi štejejo ADMINU, ne osebi, katere ime je prevzel — sicer bi
   pregledovanje tujih podatkov napihnilo prav tiste številke, ki jih administrator bere.
5. **Given** uporabnik, ki osveži isti zavihek petkrat zapored v nekaj sekundah, **When**
   pogledam števec, **Then** se to ne šteje kot pet ogledov.
6. **Given** navaden uporabnik, **When** poskusi zabeležiti ogled v imenu druge osebe, **Then**
   tega ne more — ogled se vedno pripiše klicatelju.

---

### User Story 4 - Izvem, da se disk in baza razhajata (Priority: P2)

Kot administrator hočem vedeti, ali za kakšnim zapisom v bazi ni vsebine na disku ali obratno.

**Why this priority**: Člen VII — sistem, ki se pokvari, mora znati povedati, da je pokvarjen.
Modul 009 okvarjeno stanje že pozna in ga zna zapisati, a ga danes nihče ne vidi, dokler nekdo
ne poskusi datoteke prenesti.

**Independent Test**: Odstrani datoteko izpod nosilca mimo aplikacije, odpri Analitiko — pregled
pove, da en zapis nima vsebine, in ga poimensko navede.

**Acceptance Scenarios**:

1. **Given** zapis datoteke, katerega vsebine na disku ni, **When** odprem pregled, **Then** je to
   navedeno kot opozorilo s številom prizadetih zapisov in njihovo zabeleženo velikostjo.
2. **Given** vsebina na disku, za katero v bazi ni zapisa (sirota), **When** odprem pregled,
   **Then** je navedena posebej, skupaj s prostorom, ki ga zaseda.
3. **Given** zapis, označen kot okvarjen, ali zapis, ki je obtičal v nalaganju, **When** odprem
   pregled, **Then** je preštet in prikazan.
4. **Given** namestitev brez razhajanj, **When** odprem pregled, **Then** je to izrecno napisano
   ("razhajanj ni") in ne kot prazen prostor, ki ga ni mogoče ločiti od nedelujoče preverbe.

---

### User Story 5 - Iste podatke dobim brez vmesnika (Priority: P3)

Kot administrator hočem enake številke dobiti s HTTP klicem, da si lahko naredim tedensko
poročilo ali opozorilo, ko poraba preseže mejo.

**Why this priority**: Člen III — kar se da v vmesniku, se mora dati tudi s klicem. Vrednost je
resnična (opozorilo pred polnim diskom), a stoji na tem, kar zgradijo prejšnji scenariji.

**Independent Test**: Pokliči pregled porabe s HTTP klicem in primerjaj s tem, kar kaže zaslon —
isti podatki, brez polja, ki bi bilo samo v vmesniku.

**Acceptance Scenarios**:

1. **Given** veljavna administratorjeva seja, **When** pokličem pregled porabe, **Then** dobim
   iste podatke, kot jih kaže zaslon, vključno s časom, ko je bil izračun narejen.
2. **Given** klic z izbranim obdobjem, **When** ga pošljem, **Then** je obdobje upoštevano enako
   kot v vmesniku.
3. **Given** API ključ, **When** ga uporabim za pregled, **Then** je zavrnjen — ključ obsega
   `admin` ne more imeti in analitika cele namestitve ni podatek avtomatizacije enega uporabnika.

---

### Edge Cases

- **Modula ni več.** Modul se odstrani z brisanjem mape in enega vnosa v registru (člen I). Kaj
  naredi analitika, ko vira, ki ga je štela, ni več? Vir se tiho izpusti, skupna vsota je manjša
  in pregled pove, kateri viri so bili merjeni — ne pade in ne pokaže ničle, kot da vsebine ni.
- **Zapis, katerega lastnika ni več.** Uporabniški zapis se v tej namestitvi ne briše, a če bi
  ostal zapis vsebine brez ujemajočega uporabnika, se njegovi bajti NE smejo izgubiti iz skupne
  vsote — pojavijo se v vrstici "neznan lastnik".
- **Dan po kateri coni.** Dnevni števci se razvrščajo po `Europe/Ljubljana` (člen V.4), ne po
  UTC. Ogled ob 23:30 CEST je isti dan kot ob 20:00, ne naslednji.
- **Ista oseba v dveh oknih.** Dva zavihka brskalnika štejeta oba; števec je seštevek ogledov,
  ne število sej.
- **Telemetrija pred uvedbo.** Podatkov za nazaj ni in jih ni mogoče izpeljati. Prikaz MORA
  navesti datum, od katerega meritve obstajajo.
- **Prva prijava po uvedbi.** Uporabnik, ki se je nazadnje prijavil pred uvedbo, ima nič prijav v
  obdobju, a ima čas zadnje prijave — ta se ohrani iz obstoječega zapisa o uporabniku.
- **Velika namestitev.** Seštevanje po vseh zapisih ob vsaki zahtevi je drago. Izračun se
  predpomni, prikaz pa navede uro zadnjega izračuna in ponuja izrecno osvežitev.
- **Poraba ni zasedenost nosilca.** Vsota velikosti vsebine in zasedenost datotečnega sistema
  nista isto število (indeksi, stiskanje, blokovna poravnava). Prikaz mora obe navesti ločeno in
  ju ne sme predstaviti kot eno.
- **Rok hrambe.** Ko telemetrija doseže rok hrambe, se izbriše. Obdobje, ki sega pred rok hrambe,
  se ne sme tiho izteči v ničle — prikaz pove, da starejših podatkov ni več.

## Requirements *(mandatory)*

### Functional Requirements

#### Dostop in vidnost

- **FR-001**: Zavihek "Analitika" MORA biti viden izključno osebam z obsegom `admin`; za vse
  ostale ga v meniju NI (ni izklopljen — ni ga).
- **FR-002**: Vsak pregled analitike MORA biti zavrnjen klicatelju brez obsega `admin`, tudi ob
  neposrednem klicu mimo vmesnika.
- **FR-003**: Analitike NE SME biti mogoče brati z API ključem — ne glede na to, kateri obsegi so
  ključu dodeljeni.
- **FR-004**: Prevzem imena druge osebe (012) NE SME odpreti analitike osebi, ki obsega `admin`
  nima, in NE SME spremeniti tega, kaj analitika pokaže.

#### Poraba prostora

- **FR-005**: Sistem MORA prikazati skupno porabo prostora namestitve kot vsoto vseh merjenih
  virov.
- **FR-006**: Sistem MORA porabo razbiti po vrsti vsebine; ob uvedbi so merjeni viri: slike
  receptov (vključno s pomanjšavami), zvočni posnetki beležk ter deljene in prejete datoteke.
- **FR-007**: Sistem MORA prikazati porabo po osebi, z razbitjem po istih vrstah vsebine.
- **FR-008**: Vsaka oseba z računom MORA biti v tabeli, tudi če je njena poraba nič.
- **FR-009**: Osebe MORAJO biti navedene z imenom in zamaskirano e-pošto, v isti obliki kot v
  skupnem imeniku oseb — analitika NE SME razkriti celih naslovov namestitve.
- **FR-010**: Sistem MORA poleg bajtov prikazati število zapisov po vrsti (recepti, slike
  receptov, beležke, posnetki, deljene datoteke, prejete datoteke).
- **FR-011**: Sistem MORA prikazati skupno in prosto kapaciteto nosilca, na katerem so deljene
  datoteke.
- **FR-012**: Sistem MORA izrecno navesti, kateri viri so bili v izmeri zajeti; vir, ki v
  namestitvi ne obstaja (odstranjen modul), se izpusti in analitika zaradi tega NE SME odpovedati.
- **FR-013**: Bajti zapisa, katerega lastnika ni mogoče razrešiti, MORAJO ostati v skupni vsoti in
  biti prikazani v vrstici "neznan lastnik".
- **FR-014**: Poraba MORA biti izmerjena iz zabeleženih velikosti zapisov; sistem za izmero NE SME
  brati vsebine datotek ali posnetkov.
- **FR-015**: Sistem MORA jasno ločiti izmerjeno porabo vsebine od zasedenosti nosilca in števil
  NE SME predstaviti kot enega podatka.

#### Celovitost shrambe

- **FR-016**: Sistem MORA prešteti in prikazati zapise, katerih vsebine na nosilcu ni.
- **FR-017**: Sistem MORA prešteti in prikazati vsebino na nosilcu, za katero v bazi ni zapisa,
  skupaj s prostorom, ki ga zaseda.
- **FR-018**: Sistem MORA prešteti zapise v okvarjenem stanju in zapise, ki so obtičali v
  nalaganju.
- **FR-019**: Kadar razhajanj ni, MORA biti to izrecno izpisano.
- **FR-020**: Preverba celovitosti NE SME ničesar popraviti, prestaviti ali izbrisati — samo
  ugotovi in pove.

#### Zbiranje telemetrije

- **FR-021**: Sistem MORA ob vsaki uspešni prijavi povečati dnevni števec prijav za tega
  uporabnika.
- **FR-022**: Sistem MORA ob ogledu zavihka povečati dnevni števec ogledov za par (oseba,
  zavihek) in zabeležiti čas zadnjega ogleda.
- **FR-023**: Telemetrija MORA biti zapisana izključno kot dnevni števec; posamezen ogled s
  časovnim žigom se NE SME hraniti.
- **FR-024**: Telemetrija NE SME vsebovati IP naslova, uporabniškega agenta, poti (URL), vsebine
  zaslona ali identifikatorjev, ki niso oseba, zavihek in dan.
- **FR-025**: Ogled MORA biti pripisan klicatelju; klicatelj ga NE SME zabeležiti za koga drugega.
- **FR-026**: Kadar administrator dela v imenu druge osebe, se ogled MORA šteti administratorju,
  ne osebi, katere ime je prevzel.
- **FR-027**: Zaporedni ogledi istega zavihka brez vmesne menjave zavihka se v kratkem oknu NE
  SMEJO šteti večkrat kot enkrat (osvežitev strani ni nov ogled).
- **FR-028**: Dan števca MORA biti koledarski dan v `Europe/Ljubljana`.
- **FR-029**: Beleženje ogleda NE SME upočasniti ali preprečiti prikaza zaslona; neuspeh
  beleženja uporabniku NE SME biti viden kot napaka.
- **FR-030**: Telemetrija se MORA samodejno brisati, ko doseže rok hrambe; rok MORA biti
  nastavljiv ob namestitvi in privzeto 400 dni.
- **FR-031**: Zavihek, ki v registru ne obstaja (več), se pri beleženju NE SME sprejeti kot
  poljuben niz — sprejeti se smejo samo znani zavihki.

#### Statistika uporabe

- **FR-032**: Sistem MORA prikazati število prijav po osebi za izbrano obdobje in skupno.
- **FR-033**: Sistem MORA prikazati čas zadnje prijave in čas zadnje aktivnosti po osebi.
- **FR-034**: Sistem MORA prikazati število oseb, aktivnih v obdobju, in število tistih, ki v
  obdobju niso bile.
- **FR-035**: Sistem MORA prikazati lestvico zavihkov po številu ogledov za celotno namestitev.
- **FR-036**: Sistem MORA prikazati razbitje ogledov po zavihku za posamezno osebo.
- **FR-037**: Obdobje MORA biti izbirno (7, 30 in 90 dni) in izbira MORA veljati enako v vmesniku
  in pri klicu.
- **FR-038**: Prikaz MORA navesti datum, od katerega meritve obstajajo, in kadar izbrano obdobje
  sega pred ta datum ali pred rok hrambe, MORA to izrecno povedati.
- **FR-039**: Zavihek ali oseba brez dogodkov v obdobju MORATA biti prikazana z ničlo, ne
  izpuščena.

#### Izračun in pogodba

- **FR-040**: Izračun porabe MORA biti predpomnjen; ponovljen prikaz v času veljavnosti NE SME
  sprožiti novega seštevanja po vseh zapisih.
- **FR-041**: Prikaz MORA navesti čas, ob katerem je bil izračun narejen, in ponuditi izrecno
  osvežitev.
- **FR-042**: Vsak podatek, ki ga kaže zaslon, MORA biti dosegljiv tudi s HTTP klicem in zapisan
  v objavljeni pogodbi, vzdrževani skupaj s spremembo (člen III).
- **FR-043**: Beleženje ogleda je mutacija in MORA sprejeti ključ idempotentnosti, enako kot vsaka
  druga mutacija v tej aplikaciji (člen III).
- **FR-044**: Analitika MORA brati podatke drugih modulov samo za branje in jih NE SME
  spreminjati; odstranitev kateregakoli modula NE SME zahtevati popravkov v drugih modulih.

### Key Entities

- **Dnevni števec uporabe**: ena vrstica na (oseba, dan, vrsta dogodka, ključ). Vrsta dogodka je
  prijava ali ogled zavihka; ključ je oznaka zavihka (pri prijavi ga ni). Nosi število dogodkov
  tistega dne in čas zadnjega dogodka. Edina nova hranjena telemetrija.
- **Vir porabe**: opis enega merjenega vira (oznaka, ime za prikaz, kako se izmerijo bajti, kako
  se določi lastnik). Analitika ima seznam virov; vir, ki ga v namestitvi ni, se izpusti.
- **Posnetek porabe**: izračunan, ne shranjen rezultat — skupna poraba, razbitje po virih,
  vrstice po osebah, števila zapisov, stanje nosilca in čas izračuna.
- **Ugotovitev o celovitosti**: vrsta razhajanja (manjkajoča vsebina, sirota, okvarjen zapis,
  obtičalo nalaganje), število prizadetih zapisov in prizadeti prostor.

## Out of Scope

- **Pravila in samodejno ukrepanje.** Analitika ne briše, ne arhivira in ne omejuje ničesar;
  kvote so stvar modulov, ki vsebino hranijo.
- **Odpravljanje razhajanj.** Pregled pove, da sirota obstaja; njenega brisanja ne ponudi.
- **Zgodovinski trendi in grafi skozi čas.** Ob uvedbi so to števila za izbrano obdobje, ne
  časovne vrste porabe — za te bi bili potrebni dnevni posnetki porabe, ki jih ta funkcionalnost
  ne uvaja.
- **Telemetrija za nazaj.** Meritve se začnejo ob uvedbi.
- **Izvoz v datoteko.** Podatki so dosegljivi prek klica; izvoza v preglednico ta funkcionalnost
  ne dodaja.
- **Merjenje trajanja seje ali zadrževanja na zaslonu.** Dnevni števec tega ne omogoča in tako
  je mišljeno (člen XII).
- **Osebni pogled na lastno porabo za navadnega uporabnika.** Zaslon je administratorjev; osebni
  pregled porabe je svoja odločitev in svoja funkcionalnost.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Administrator na enem zaslonu, brez izvoza in brez dostopa do baze, odgovori na
  "koliko je porabljenega" in "kdo največ porablja" v manj kot 30 sekundah od prijave.
- **SC-002**: Pri 50 osebah in 50 000 zapisih vsebine se pregled prikaže v manj kot 2 sekundi.
- **SC-003**: Ponovljen prikaz v času veljavnosti predpomnilnika ne sproži novega seštevanja, kar
  je preverljivo iz navedenega časa izračuna.
- **SC-004**: Oseba brez vloge administratorja zavihka v meniju nima in ob neposrednem klicu ne
  dobi nobenega podatka analitike — v 100 % poskusov.
- **SC-005**: Vsaka številka z zaslona je pridobljiva tudi s HTTP klicem; polj, ki so samo v
  vmesniku, ni nič.
- **SC-006**: Po enem dnevu uporabe se prikazano število prijav in ogledov natanko ujema z
  dogodki, preštetimi iz dnevnika — odstopanje 0.
- **SC-007**: Brisanje mape kateregakoli modula in njegovega vnosa v registru pusti analitiko
  delujočo; iz pregleda izgine samo vir tistega modula.
- **SC-008**: Telemetrija, starejša od roka hrambe, je iz zbirke odstranjena in se v pregledu ne
  pojavi.
- **SC-009**: Umetno povzročeno razhajanje med diskom in bazo je v pregledu vidno kot opozorilo s
  številom in prostorom prizadetih zapisov, brez ročnega poseganja.
- **SC-010**: Zapis telemetrije za enega uporabnika v enem letu ne preseže nekaj tisoč vrstic
  (ena na zavihek na dan), kar je preverljivo iz števila zavihkov in dni.

## Assumptions

- **Namestitev je majhna** (desetine oseb, ne tisoči). Zato je seštevanje ob zahtevi s
  predpomnilnikom dovolj in predizračunanih dnevnih posnetkov ni treba uvajati.
- **Velikost vsebine je zapisana ob zapisu.** Vsi trije viri imajo zabeleženo velikost v bajtih,
  zato izmera ne zahteva branja vsebine.
- **Poraba je vsota logičnih velikosti vsebine**, ne zasedenost nosilca ali baze. Odgovarja na
  "kdo koliko hrani", ne "koliko je zasedenega na disku"; zasedenost nosilca se prikaže posebej.
- **Čas zadnje prijave že obstaja** v zapisu o uporabniku in se uporabi za osebe, ki se po uvedbi
  še niso prijavile.
- **Ogled zavihka sporoči odjemalec**, ker menjava zavihka v enostranski aplikaciji ne pomeni
  zahteve na strežnik. Zato se ogled vedno pripiše klicatelju in se sprejme samo znana oznaka
  zavihka — natančnost telemetrije je "kar je odjemalec povedal o sebi", kar za to vprašanje
  zadošča, za obračun pa se ne uporablja.
- **Zavihkov je nekaj deset, ne tisoči**, zato je ena vrstica na (oseba, zavihek, dan) obvladljiva
  količina.
- **Rok hrambe 400 dni** je izbran tako, da omogoča primerjavo z istim mesecem lani, in je
  nastavljiv ob namestitvi.
- **Obseg `admin` je edina dovolilnica**; posebne vloge "analitik" ta namestitev ne pozna.
