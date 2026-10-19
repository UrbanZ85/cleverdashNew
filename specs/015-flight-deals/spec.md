# Feature Specification: Iskalnik letalskih ponudb (Leti)

**Feature Branch**: `015-flight-deals`
**Created**: 2026-10-17
**Status**: Draft
**Input**: "Flight Deal Finder — modul znotraj obstoječega CleverDasha za avtomatizirano iskanje
ugodnih letalskih povezav po uporabniških kriterijih: več odhodnih letališč, destinacije ali
'kamor koli', fleksibilni datumi in trajanja, periodično preverjanje, zgodovina cen, e-poštna
obvestila ob novih ponudbah in spremembah cen, deljenje obvestil z izbranimi uporabniki,
administratorsko upravljanje urnika."

## Zakaj

Kdor hoče z letališč v dosegu Ljubljane poceni kam odleteti, danes odpre pet spletnih strani,
na vsaki vpiše isto letališče, iste datume in isto število potnikov, nato pa to ponavlja vsak
dan, ker se cene nizkocenovnikov spreminjajo po urah. Ko cena pade, tega ne izve nihče, razen
če je ravno gledal. Ko pozneje opazi, da je bila vozovnica pred tednom za polovico cenejša, nima
podatka, ali je to res ali se mu samo zdi.

Ta funkcionalnost vprašanje obrne: uporabnik **enkrat** opiše, kaj išče — od kod, kam ali
"kamor koli", kdaj ali "kadar koli v naslednjih šestih mesecih", koliko nočitev, katere dni,
največ koliko evrov — in sistem po urniku, ki ga določi administrator, sam preverja, kaj je na
voljo. Vsako ponudbo si zapomni skupaj s ceno in časom preverjanja. Ob **novi** ponudbi, ki
ustreza, in ob **vsaki spremembi cene** pošlje en zbirni e-poštni dopis uporabniku in osebam, ki
jih je ta izbral. Če se ni spremenilo nič, ne pošlje ničesar.

Trije podatki ločijo to od zavihkov, ki so v aplikaciji že:

1. **Prvi modul, ki piše po urniku, nastavljenem v aplikaciji in ne v okolju namestitve**, in
   katerega urnik sme spremeniti izključno administrator. Uporabnik določa, KAJ se išče;
   administrator določa, KDAJ, ker so zunanji viri skupni vsem in jih ni mogoče obremenjevati po
   želji vsakega posameznika.
2. **Prvi modul, ki pošilja e-pošto.** Potisna obvestila v tej namestitvi ne delujejo
   (ugotovitev iz 010), ponudba pa je uporabna le, če človek zanjo izve, preden poteče. E-pošta
   je zato glavni in edini kanal, nastavitve zanjo pa so lastnost namestitve in nikoli del
   vmesnika.
3. **Vir podatkov ni ena stran, ampak nabor virov z različnim statusom.** Letalski prevozniki
   javnih vmesnikov nimajo in avtomatiziran dostop omejujejo. Kateri vir se uporablja, je zato
   zavestna odločitev lastnika namestitve, modul pa mora znati povedati, iz katerega vira je
   podatek, kako star je in kaj pomeni, če vir odpove — **odpoved vira ni izginotje ponudb**.

Kaj ta funkcionalnost namenoma **ni**: ni rezervacijski sistem (rezervacija se vedno konča pri
ponudniku, prek povezave), ni primerjalnik cen v živo ob kliku (vsak podatek je iz zadnjega
rednega preverjanja in to vedno piše zraven) in ni orodje, ki bi zaobšlo zaščite tujih strani
(člen XII): vir, ki avtomatizacijo namenoma preprečuje, se ne uporablja.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Opišem, kaj iščem, in vidim, kaj bo sistem iskal (Priority: P1) 🎯 MVP

Kot uporabnik hočem ustvariti iskanje: izberem eno ali več odhodnih letališč, destinacijo ali
"kamor koli", način datumov (točna datuma, obdobje ali "naslednjih N mesecev"), fleksibilnost,
najmanjše in največje število nočitev, dovoljene dneve in ure ter omejitve cene in potnikov.
Še preden shranim, hočem videti, v katerem dejanskem obdobju bo sistem iskal in približno koliko
kombinacij to pomeni.

**Why this priority**: Brez iskanja ni ničesar drugega. Hkrati je to edini del, ki je uporaben
tudi sam: shranjeno iskanje z jasno izpisanim obdobjem že odgovori na vprašanje "sem to prav
nastavil".

**Independent Test**: Ustvari iskanje LJU + TRS → "kamor koli", obdobje 22. 10.–1. 11. 2026,
fleksibilnost ±2 dni, 2–3 nočitve, odhod petek po 15:00, povratek nedelja. Pred shranjevanjem je
izpisano obdobje 20. 10.–3. 11. 2026 in ocena kombinacij; po shranjevanju je iskanje na seznamu
Moja iskanja z oznako "aktivno" in "še ni preverjeno".

**Acceptance Scenarios**:

1. **Given** prazen seznam iskanj, **When** ustvarim iskanje z dvema odhodnima letališčema,
   načinom "kamor koli", obdobjem in trajanjem, **Then** je shranjeno pod mojim imenom, aktivno,
   in na seznamu Moja iskanja piše, da še ni bilo preverjeno.
2. **Given** obrazec z obdobjem 22. 10.–1. 11. 2026 in fleksibilnostjo ±2 dni, **When** pogledam
   predogled, **Then** piše, da bo sistem iskal odhode od 20. 10. do 3. 11. 2026, in kako je
   obravnavan povratek (znotraj okna ali lahko zunaj).
3. **Given** obrazec z načinom "naslednjih 6 mesecev", **When** ga shranim, **Then** je obdobje
   zapisano kot "6 mesecev od dneva preverjanja" in NE kot dva fiksna datuma — ob vsakem
   preverjanju se izračuna znova.
4. **Given** obrazec, **When** vpišem največ 2 nočitvi in najmanj 3, **Then** shranjevanje ni
   mogoče in sporočilo pove, da mora biti največje trajanje vsaj enako najmanjšemu.
5. **Given** fleksibilnost "po meri", **When** vpišem −1 ali 2,5, **Then** je vnos zavrnjen;
   vpis 10 je sprejet in predogled pokaže za 10 dni razširjeno okno na obeh straneh.
6. **Given** iskalnik letališč, **When** vpišem "trst", "TRS" ali "Ronchi", **Then** v vseh treh
   primerih najdem letališče Trst; **When** vpišem "150 km od Ljubljane", **Then** dobim seznam
   letališč v tem radiju z razdaljo, med njimi Zagreb, Trst, Benetke, Treviso, Gradec in Celovec.
7. **Given** moje iskanje, **When** ga uredim, deaktiviram ali izbrišem, **Then** se sprememba
   pokaže takoj; deaktivirano iskanje ostane na seznamu z oznako "neaktivno" in se ne preverja.
8. **Given** iskanje druge osebe, **When** poskusim do njega dostopati prek neposrednega klica,
   **Then** dobim odgovor, kot da ne obstaja, in iz odgovora ni razvidno, da obstaja.

---

### User Story 2 - Sistem po urniku preveri ponudbe in jih vidim na enem mestu (Priority: P1)

Kot uporabnik hočem, da sistem po urniku, ki ga nastavi administrator, za vsako moje aktivno
iskanje preveri razpoložljive lete pri podprtih virih in mi na glavni strani modula pokaže
najdene ponudbe, najcenejše med njimi, in kdaj je bil zadnji uspešen pregled.

**Why this priority**: To je jedro vrednosti — brez preverjanja je iskanje samo zapis. Ločeno od
US3 (zgodovina) in US4 (e-pošta) je še vedno uporabno: uporabnik odpre zavihek in vidi aktualno
stanje.

**Independent Test**: Z vsaj enim aktivnim iskanjem in testnim virom sproži preverjanje (admin,
ročno). Glavna stran pokaže ponudbe, razvrščene po ceni, pri vsaki vir, ceno, letališči, datume
in čas preverjanja; iskanje ima status "preverjeno ob …".

**Acceptance Scenarios**:

1. **Given** dve aktivni iskanji in vir, ki vrne ponudbe, **When** se izvede preverjanje,
   **Then** glavna stran pokaže ponudbe obeh iskanj, pri vsaki piše, kateremu iskanju ustreza, iz
   katerega vira je, ceno in čas preverjanja, in ob vsakem iskanju čas zadnjega uspešnega pregleda.
2. **Given** ponudbe, **When** izberem razvrščanje po ceni, datumu odhoda ali po tem, kdaj se je
   pojavila, in filter po iskanju, **Then** se seznam ustrezno preuredi; dolg seznam je omejen z
   navedbo, koliko jih je še.
3. **Given** iskanje "petek po 15:00 → nedelja po 16:00", **When** vir vrne let v petek ob 14:30
   po lokalnem času odhodnega letališča, **Then** ta let NI med ponudbami tega iskanja, let ob
   15:10 pa je.
4. **Given** iskanje z najvišjo ceno 120 € na osebo in dvema potnikoma, **When** vir vrne skupno
   ceno 250 €, **Then** ponudba NE ustreza (125 € na osebo); pri 230 € ustreza.
5. **Given** vir, ki ob preverjanju ni dosegljiv, **When** se preverjanje konča, **Then** so
   ponudbe tega vira iz prejšnjega preverjanja še vedno vidne, označene s starostjo podatka, pri
   iskanju pa piše, da zadnje preverjanje za ta vir ni uspelo.
6. **Given** vir, ki za zahtevano kombinacijo ne vrne nobenega leta, **When** se preverjanje
   konča, **Then** je stanje "ni ustreznih letov" in se jasno loči od "vir ni dosegljiv", "vir ne
   podpira tega iskanja", "vir omejuje zahteve" in "podatki so nepopolni".
7. **Given** dva uporabnika z iskanjem za isto povezavo in isti mesec, **When** se izvede
   preverjanje, **Then** se vir za to kombinacijo vpraša enkrat, vsak od njiju pa vidi samo
   ponudbe, ki ustrezajo NJEGOVIM pravilom.
8. **Given** iskanje "naslednjih 6 mesecev", **When** se preverjanje izvede 1. 11. in nato
   1. 12., **Then** drugo preverjanje pokriva en mesec več kot prvo.

---

### User Story 3 - Vidim, kako se je cena spreminjala (Priority: P2)

Kot uporabnik hočem pri vsaki ponudbi videti, ali je nova, ali se je pocenila ali podražila, za
koliko in za kolikšen delež, ter celotno zgodovino cen od prvega preverjanja.

**Why this priority**: Spreminjanje cen je razlog za obstoj modula, a brez US2 ni kaj primerjati.
Zgodovina je tudi tisto, kar loči "zdi se mi, da je bilo ceneje" od podatka.

**Independent Test**: Testni vir vrne za isto ponudbo zaporedoma 120 €, 89 €, 110 €. Po treh
preverjanjih podrobnosti ponudbe kažejo tri točke, zadnja sprememba je označena kot podražitev
s prečrtano 89 € in novo 110 € v opozorilni barvi, razlika +21 € (+23,6 %).

**Acceptance Scenarios**:

1. **Given** ponudba, ki se je pojavila prvič, **When** jo pogledam, **Then** nosi oznako NOVO in
   aktualno ceno, brez prejšnje cene in brez primerjave.
2. **Given** ponudba, ki je bila 120 € in je zdaj 89 €, **When** jo pogledam, **Then** je stara
   cena prečrtana, nova 89 € je v barvi za ugodno spremembo, razlika piše −31 € (−25,8 %).
3. **Given** ponudba, ki je bila 89 € in je zdaj 110 €, **When** jo pogledam, **Then** je stara
   cena prečrtana, nova v opozorilni barvi, razlika +21 € (+23,6 %).
4. **Given** ponudba z nespremenjeno ceno, **When** se izvede preverjanje, **Then** nima nove
   oznake spremembe, čas zadnjega preverjanja pa se posodobi.
5. **Given** ponudba, ki je vir ob USPEŠNEM preverjanju ne vrne več, **When** pogledam seznam,
   **Then** je označena kot "ni več na voljo"; **Given** vir, ki je ob preverjanju odpovedal,
   **Then** nobena njegova ponudba te oznake NE dobi.
6. **Given** isti let z istimi časi, istim prevoznikom in isto sestavo potnikov, ki ga vir vrne
   po dveh različnih poteh, **When** se primerja, **Then** gre za ENO ponudbo z eno zgodovino, ne
   dve; drugačna sestava potnikov ali druga valuta pa je druga ponudba.
7. **Given** podrobnosti ponudbe, **When** jih odprem, **Then** vidim zgodovino cen po
   preverjanjih s časi, in povezavo do rezervacije pri viru, kadar jo vir da.

---

### User Story 4 - Izvem po e-pošti, kadar se kaj zgodi, in nikoli, kadar se ne (Priority: P2)

Kot uporabnik hočem po e-pošti dobiti en zbirni dopis, kadar se po preverjanju pojavi nova
ustrezna ponudba ali se cena katere od spremljanih spremeni, in nič, kadar se ni zgodilo nič ali
preverjanje ni uspelo.

**Why this priority**: To je razlog, da modula ni treba odpirati vsak dan. Pogojen je z US2 in
US3, zato P2.

**Independent Test**: Dve preverjanji zapored z istimi rezultati: po prvem pride en dopis z
vsemi ponudbami kot NOVO, po drugem ne pride nič. Tretje preverjanje z eno pocenitvijo: pride en
dopis z eno postavko, prečrtano staro in zeleno novo ceno.

**Acceptance Scenarios**:

1. **Given** prvo uspešno preverjanje iskanja z osmimi ustreznimi ponudbami, **When** se konča,
   **Then** prejmem EN dopis z osmimi postavkami, vsako označeno NOVO.
2. **Given** drugo preverjanje brez sprememb, **When** se konča, **Then** NE prejmem ničesar.
3. **Given** preverjanje, pri katerem je vir odpovedal, **When** se konča, **Then** NE prejmem
   dopisa o "izginulih" ponudbah in nobenega drugega.
4. **Given** pocenitev ene ponudbe in podražitev druge, **When** se preverjanje konča, **Then**
   prejmem en dopis z dvema postavkama; pri vsaki je naziv iskanja, letališči, prevoznik, datumi
   in ure, trajanje, potniki, nova cena, prečrtana stara, razlika v € in %, oznaka, povezava do
   rezervacije in do ponudbe v aplikaciji ter čas preverjanja.
5. **Given** dve moji iskanji, ki jima ustreza ista ponudba, **When** se pojavi, **Then** je v
   dopisu ENKRAT, z navedbo obeh iskanj.
6. **Given** ponudba, ki je bila nova ob preverjanju, a ob pripravi dopisa ne ustreza več
   pravilom iskanja (npr. cena je medtem presegla mejo), **When** se dopis sestavlja, **Then** je
   iz njega izpuščena.
7. **Given** poštni strežnik, ki ob pošiljanju odpove, **When** se pošiljanje ponovi, **Then**
   prejmem dopis natanko enkrat in nikoli dvakrat za isto preverjanje.
8. **Given** namestitev brez nastavljene e-pošte, **When** bi moral iti dopis, **Then** je
   zabeležen kot zadržan in administrator to vidi; nič ne odpove tiho.

---

### User Story 5 - Obvestila delim z izbranimi osebami (Priority: P2)

Kot lastnik iskanja hočem izbrati druge uporabnike te namestitve, ki bodo prejemali ista
obvestila kot jaz, in to kadar koli preklicati. Prejemnik vidi deljene ponudbe, ne pa mojega
iskanja, in ga ne more spreminjati.

**Why this priority**: Potovanja se načrtujejo v paru ali družini; brez tega bi vsak nastavil
svoje iskanje in vir bi bil vprašan dvakrat. Pogojeno z US4.

**Independent Test**: Lastnik doda prejemnika; po preverjanju s spremembo oba prejmeta dopis, in
prejemnik v zavihku Deljene ponudbe vidi ponudbo, ne pa konfiguracije iskanja. Lastnik ga
odstrani; ob naslednji spremembi dopis prejme samo lastnik, prejemnik pa ponudb tega iskanja ne
vidi več.

**Acceptance Scenarios**:

1. **Given** moje iskanje, **When** med osebami namestitve izberem prejemnika, **Then** je dodan,
   prikazan z imenom in zamaskirano e-pošto kot v drugih izbirnikih oseb, in ob naslednji
   spremembi prejme isti dopis kot jaz.
2. **Given** prejemnik, **When** odpre zavihek Deljene ponudbe, **Then** vidi ponudbe tega
   iskanja z nazivom iskanja in imenom lastnika, NE vidi pa konfiguracije (letališč, datumskih
   pravil, cen) in iskanja ne more urejati, deaktivirati ali deliti naprej.
3. **Given** prejemnik, **When** poskusi iskanje urediti prek neposrednega klica, **Then** je
   zavrnjen.
4. **Given** prejemnik, ki ga lastnik odstrani, **When** se izvede naslednje preverjanje,
   **Then** ne prejme dopisa in ponudb tega iskanja ne vidi več.
5. **Given** oseba, ki se v aplikacijo še nikoli ni prijavila, **When** jo poskusim dodati,
   **Then** ni na izbiro.
6. **Given** lastnik, **When** poskusi za prejemnika dodati samega sebe, **Then** je to zavrnjeno
   — lastnik prejema vedno.

---

### User Story 6 - Administrator določa urnik in vidi, kaj se je zgodilo (Priority: P2)

Kot administrator hočem na enem mestu vklopiti ali izklopiti preverjanje, izbrati preprost urnik
ali vpisati lastnega, sprožiti preverjanje takoj, ga prekiniti, in videti zgodovino izvajanj s
števci in napakami ter stanje vsakega vira.

**Why this priority**: Brez urnika se US2 izvaja samo ročno. Ločeno od uporabniških zgodb, ker
gre za drugo vlogo in druga pravila dostopa.

**Independent Test**: Admin nastavi "vsak dan ob 6:00 in 18:00"; nastavitev je sprejeta, piše,
kdaj bo naslednje preverjanje, in velja brez ponovnega zagona. Admin vpiše neveljaven izraz; je
zavrnjen z razlago. Navaden uporabnik admin strani v meniju nima in klic zavrnjen.

**Acceptance Scenarios**:

1. **Given** administrator, **When** izbere "vsak dan ob 6:00", "vsak dan ob 6:00 in 18:00",
   "vsakih 6 ur" ali "vsak ponedeljek ob 8:00", **Then** je urnik shranjen, prikazan je tudi kot
   izraz in piše čas naslednjega preverjanja v coni Europe/Ljubljana.
2. **Given** administrator, **When** vpiše izraz po meri, ki ni veljaven, **Then** shranjevanje
   ni mogoče in sporočilo pove, kaj je narobe.
3. **Given** spremenjen urnik, **When** mine čas po novem urniku, **Then** se preverjanje izvede
   brez ponovnega zagona aplikacije.
4. **Given** izklopljeno preverjanje, **When** mine čas po urniku, **Then** se ne izvede nič;
   ročni zagon je kljub temu mogoč.
5. **Given** preverjanje, ki teče, **When** administrator sproži še eno ali ga sproži urnik,
   **Then** drugo ne steče vzporedno; vidno je, da eno že teče.
6. **Given** zgodovina izvajanj, **When** jo pogledam, **Then** pri vsakem izvajanju vidim
   začetek, konec, stanje, število pregledanih iskanj, zahtev na vire, novih ponudb, sprememb
   cen, poslanih in zadržanih obvestil ter seznam napak z razlogom.
7. **Given** aplikacija, ki je bila ponovno zagnana med izvajanjem, **When** znova teče, **Then**
   je prekinjeno izvajanje označeno kot prekinjeno in zamujeni termin dohiten, brez podvojenih
   obvestil za že obdelane spremembe.
8. **Given** oseba brez vloge administratorja, **When** poskusi spremeniti urnik ali sprožiti
   preverjanje prek neposrednega klica, **Then** je zavrnjena; administratorskih možnosti v
   vmesniku nima.
9. **Given** stanje virov, **When** ga pogledam, **Then** pri vsakem viru piše, ali je vklopljen,
   ali je uraden ali neuraden, kdaj je nazadnje uspel, in zadnja napaka.

---

### User Story 7 - Vse, kar vidim, dobim tudi brez vmesnika (Priority: P3)

Kot uporabnik avtomatizacije hočem iskanja ustvarjati in brati, brati ponudbe in zgodovino cen
ter upravljati prejemnike s HTTP klici z API ključem z omejenim obsegom, enako kot pri drugih
modulih.

**Why this priority**: Člen III ustave. Ne spremeni vedenja za človeka, zato zadnja.

**Independent Test**: Z API ključem z obsegom za branje preberem svoja iskanja in ponudbe; z
obsegom za pisanje ustvarim iskanje; brez obsega za deljenje ne morem dodati prejemnika;
administratorskih klicev z API ključem ni mogoče izvesti.

**Acceptance Scenarios**:

1. **Given** API ključ z obsegom za branje, **When** preberem iskanja, ponudbe in zgodovino,
   **Then** dobim iste podatke kot v vmesniku.
2. **Given** API ključ brez obsega za deljenje, **When** poskusim dodati prejemnika, **Then** je
   zavrnjeno.
3. **Given** API ključ s katerimi koli obsegi, **When** poskusi spremeniti urnik, **Then** je
   zavrnjen — administratorska opravila so samo za prijavljenega človeka.

---

### Edge Cases

- **Prehod na zimski čas 25. 10. 2026** pade v primer obdobja 22. 10.–1. 11.: "odhod po 15:00" se
  presoja po lokalnem času letališča, dolžina potovanja v nočitvah pa po koledarskih dneh in ne po
  urah — 3 nočitve so 3 nočitve, tudi če ena noč traja 25 ur.
- **Letališči v različnih časovnih pasovih**: ura odhoda se presoja v coni odhodnega letališča,
  ura povratka v coni ciljnega; "minimalni čas na destinaciji" je razlika dveh trenutkov, ne dveh
  lokalnih ur.
- **Fleksibilno obdobje, pri katerem bi se okno razširilo v preteklost**: dnevi pred dnevom
  preverjanja se izpustijo in predogled to pove.
- **Rolling window čez prelom leta** ali čez mesec z manj dnevi (31. 8. + 6 mesecev): konec
  obdobja je zadnji dan ciljnega meseca.
- **Trajanje, ki ne gre v obdobje** (okno 5 dni, najmanj 7 nočitev): iskanje je veljavno, a
  predogled pove, da kombinacij ni, in preverjanje vrne "ni ustreznih letov", ne napake.
- **Zelo veliko kombinacij** (5 letališč × kamor koli × 6 mesecev × 2–21 nočitev): sistem najprej
  pridobi obstoječe povezave, kombinacije izračuna sam, vir vpraša samo za kombinacije, ki
  pravilom lahko ustrezajo, in število zahtev na eno iskanje omeji; če je meja dosežena, je to pri
  iskanju vidno kot opozorilo, ne tiho skrajšanje.
- **Vir vrne ceno brez valute, negativno ceno, ceno 0 ali let brez časa pristanka**: taka ponudba
  se zavrže kot nepopolna in se šteje v "nepopolni podatki", ne med ponudbe in ne med "ni letov".
- **Vir vrne ceno v drugi valuti, kot jo zahteva iskanje**: ponudba se ne pretvarja na slepo;
  prikazana je v svoji valuti in ne ustreza cenovni omejitvi iskanja v drugi valuti.
- **Ista ponudba za dva uporabnika, od katerih je eden šele danes ustvaril iskanje**: za prvega
  je UNCHANGED, za drugega NOVO — "novo" je lastnost para (iskanje, ponudba), ne ponudbe same.
- **Prejemnik, ki je obenem lastnik drugega iskanja z isto ponudbo**: en dopis, ponudba enkrat, z
  obema vlogama.
- **Isti uporabnik je prejemnik pri dveh iskanjih dveh različnih lastnikov**: en dopis na
  preverjanje, postavki ločeni po iskanju.
- **Lastnik izbriše iskanje, medtem ko preverjanje teče**: izvajanje se konča brez napake,
  rezultati izbrisanega iskanja se ne shranijo in dopis zanj ne gre.
- **Uporabnik je izbrisan ali nima e-naslova**: obvestilo je zabeleženo kot zadržano z razlogom.
- **Povezava do rezervacije kaže na drugo domeno kot vir**: se ne prikaže; prikaže se samo
  povezava, ki pripada viru ponudbe.
- **Administrator dela v imenu drugega uporabnika (012)**: vidi in ureja NJEGOVA iskanja;
  administratorski del modula ostane njegov in ni odvisen od prevzetega imena.
- **Dva izvoda aplikacije hkrati**: termin preverjanja izvede natanko eden; drugi ga prepozna kot
  zasedenega.

## Requirements *(mandatory)*

### Functional Requirements

#### Iskanja

- **FR-001**: Uporabnik MORA imeti možnost ustvariti, urediti, deaktivirati, znova aktivirati in
  izbrisati poljubno število lastnih iskanj; vsako iskanje pripada natanko eni osebi.
- **FR-002**: Iskanje MORA imeti ime, eno ali več odhodnih letališč in cilj v enem od načinov:
  kamor koli, izbrane države, izbrana letališča ali mesta; vsak način dopušča seznam izključenih
  destinacij.
- **FR-003**: Letališča MORA biti mogoče iskati po imenu mesta, imenu letališča in tričrkovni
  oznaki, neobčutljivo na velike črke in šumnike; nabor letališč NE SME biti omejen na vnaprej
  naštet seznam in MORA pokrivati letališča z rednim potniškim prometom.
- **FR-004**: Letališča MORA biti mogoče poiskati tudi po oddaljenosti od izbranega letališča ali
  mesta (npr. 100, 150, 200 km), z izpisano razdaljo; kadar ima uporabnik v nastavitvah določen
  domači kraj, MORA biti ta na voljo kot izhodišče.
- **FR-005**: Iskanje MORA podpirati tri datumske načine: točna datuma odhoda in povratka;
  obdobje od–do, znotraj katerega sistem išče kombinacije glede na zahtevano trajanje; in
  tekoče okno "naslednjih N mesecev", ki se izračuna ob vsakem preverjanju glede na tisti dan.
- **FR-006**: Fleksibilnost MORA imeti hitre izbire ±0, ±1, ±2, ±3 dni in vnos po meri, ki
  sprejme samo nenegativno celo število dni; pomeni razširitev datumskega okna na obe strani.
- **FR-007**: Sistem MORA pred shranjevanjem in pri vsakem iskanju prikazati dejansko obdobje, v
  katerem bo iskal, in oceno števila kombinacij datumov.
- **FR-008**: Pri fleksibilnem obdobju MORA biti mogoče določiti, ali morata biti odhod in
  povratek oba znotraj razširjenega okna ali je povratek lahko zunaj njega.
- **FR-009**: Iskanje MORA imeti najmanjše in največje število nočitev kot poljubni nenegativni
  celi števili, pri čemer MORA biti največje vsaj enako najmanjšemu; vnaprej določenih omejenih
  izbir ni.
- **FR-010**: Iskanje MORA omogočati izbiro dovoljenih dni v tednu za odhod in za povratek
  (kateri koli ali izbrani), najzgodnejšo in najpoznejšo uro odhoda, najzgodnejšo in najpoznejšo
  uro povratka ter minimalni čas na destinaciji v urah.
- **FR-011**: Vse ure MORAJO biti presojane v lokalnem času zadevnega letališča; dolžine
  potovanja v nočitvah po koledarskih dneh; vsi prikazani časi v aplikaciji in dopisih MORAJO
  nositi oznako, v kateri coni so.
- **FR-012**: Iskanje MORA omogočati omejitev najvišje cene na osebo in najvišje skupne cene,
  število odraslih, število otrok z njihovimi starostmi, izbiro "samo direktni leti" ali
  dovoljeno število prestopov, seznam dovoljenih prevoznikov, zahteve glede prtljage, kadar jih
  vir podpira, in valuto s privzeto vrednostjo EUR.
- **FR-013**: Sistem MORA v vmesniku in dopisih jasno ločiti osnovno ceno vozovnice od dodatnih
  stroškov, ki jih vir ne vključuje, in NE SME prikazovati cene kot "končne", kadar vir tega ne
  zagotavlja.
- **FR-014**: Uporabnik MORA videti samo svoja iskanja; dostop do tujega iskanja, tudi prek
  neposrednega klica, MORA vrniti odgovor, kot da iskanje ne obstaja.
- **FR-015**: Sistem MORA omejiti število iskanj na osebo in število zahtev na vire na eno
  iskanje; meji MORATA biti uporabniku vidni, kadar ju doseže.

#### Preverjanje in viri

- **FR-016**: Sistem MORA podpirati več virov letalskih podatkov prek enotne razširljive
  arhitekture; vsak vir vrača ponudbe v enotni obliki, ki vsebuje vsaj: vir, prevoznika,
  odhodno in ciljno letališče, datum in uro odhoda ter pristanka, datum in uro povratka, številke
  letov (kadar so), število prestopov, ceno in valuto, število potnikov, podatke o prtljagi
  (kadar so), povezavo do rezervacije, čas preverjanja in stanje razpoložljivosti.
- **FR-017**: Vsak vir MORA ob preverjanju vrniti enega od ločenih izidov: ponudbe najdene; ni
  ustreznih letov; vir ne podpira tega iskanja; vir ni dosegljiv; vir omejuje zahteve; podatki
  nepopolni ali zastareli. Izidi MORAJO biti ločeno prikazani pri iskanju in v zgodovini izvajanj.
- **FR-018**: Neuspeh vira NE SME biti obravnavan kot izginotje njegovih ponudb; obstoječe
  ponudbe ostanejo z zadnjo znano ceno in starostjo podatka.
- **FR-019**: Ob uvedbi MORA biti na voljo vsaj en dovoljen vir z dejanskimi podatki za
  produkcijo (podatkovni vmesnik Travelpayouts/Aviasales), katerega podatki so lahko do 48 ur
  stari, kar MORA biti pri vsaki ponudbi razvidno iz časa podatka.
- **FR-020**: Vir, ki ga prevoznik ne ponuja javno in ga njegovi pogoji dovoljujejo le za zasebno
  rabo (neuradni Ryanairov iskalnik cen), MORA biti privzeto izklopljen, vklopi ga lahko samo
  lastnik namestitve v okolju, v vmesniku MORA biti označen kot neuraden in NE SME biti vprašan
  več kot dvakrat dnevno.
- **FR-021**: Sistem NE SME uporabljati virov, ki avtomatiziran dostop preprečujejo z zaščitami
  pred roboti (Wizz Air, easyJet neposredno), in NE SME zaobiti CAPTCHA, prstnih odtisov
  brskalnika ali omejitev hitrosti; tak vir MORA vračati izid "vir ne podpira" (člen XII).
- **FR-022**: Testni vir z izmišljenimi podatki MORA biti na voljo samo za razvoj in
  avtomatizirane teste, MORA biti nezgrešljivo označen kot testni in NE SME biti vklopljen v
  produkcijski namestitvi.
- **FR-023**: Preverjanje MORA izračunati kombinacije datumov lokalno, odstraniti tiste, ki
  pravilom ne ustrezajo, in vire vprašati samo za preostale; podatke, ki se redko spreminjajo
  (seznam letališč, povezave, vozni redi), MORA predpomniti.
- **FR-024**: Isto kombinacijo (vir, odhodno letališče, cilj, obdobje) MORA sistem v enem
  preverjanju pri viru vprašati največ enkrat, ne glede na število uporabnikov, ki jo iščejo;
  vsaka ponudba pa MORA biti ovrednotena po pravilih vsakega iskanja posebej.
- **FR-025**: Sistem MORA omejiti število hkratnih zahtev na vire, spoštovati njihove omejitve
  hitrosti, vsako zahtevo časovno omejiti, začasne napake ponoviti z naraščajočim zamikom in
  neuspele zahteve zabeležiti.

#### Ponudbe in zgodovina cen

- **FR-026**: Vsaka ponudba MORA imeti stabilno identiteto, ki ne temelji na ceni, temveč na
  odhodnem in ciljnem letališču, datumih in urah odhoda ter povratka, prevozniku, številkah ali
  kombinaciji letov, vrsti vozovnice in prtljage (kadar sta znani), številu in sestavi potnikov
  ter valuti; pri povratnih letih se primerja celotna kombinacija.
- **FR-027**: Sistem MORA ob vsakem preverjanju za vsak par (iskanje, ponudba) določiti vrsto
  spremembe: NOVO (ponudba prvič ustreza iskanju), POCENITEV, PODRAŽITEV, NESPREMENJENO ali NI
  VEČ NA VOLJO.
- **FR-028**: NI VEČ NA VOLJO sme biti določeno le, kadar je vir za zadevno kombinacijo uspešno
  odgovoril in ponudbe ni vrnil; nikoli zaradi neuspešne zahteve ali nepopolnega odgovora.
- **FR-029**: Sistem MORA hraniti zgodovino cen vsake ponudbe s časom preverjanja; hramba MORA
  biti časovno omejena in rok MORA biti dejansko uveljavljen.
- **FR-030**: Pri pocenitvi MORA biti stara cena prečrtana, nova v barvi za ugodno spremembo, z
  absolutno in odstotno razliko; pri podražitvi enako z opozorilno barvo; pri NOVO MORA biti
  prikazana samo aktualna cena brez izmišljene prejšnje; brez zgodovinske cene primerjave NI.
- **FR-031**: Uporabnik MORA videti ponudbe svojih iskanj in ponudbe, ki so bile deljene z njim;
  nikoli ponudb tujih iskanj, ki z njim niso deljene.
- **FR-032**: Glavna stran modula MORA prikazati aktivna iskanja s stanjem in časom zadnjega
  uspešnega pregleda, zadnje najdene ponudbe, najcenejše ponudbe, nove ponudbe in spremembe cen,
  s filtriranjem po iskanju in razvrščanjem po ceni, datumu odhoda in času pojavitve; dolgi
  seznami so omejeni z navedbo preostanka, kot drugod v aplikaciji.

#### Obvestila

- **FR-033**: Sistem MORA poslati e-poštni dopis ob novi ustrezni ponudbi, pocenitvi in
  podražitvi; NE SME ga poslati, kadar ni novih ponudb ne sprememb, kadar so rezultati enaki
  prejšnjemu uspešnemu preverjanju ali kadar je preverjanje neuspelo.
- **FR-034**: Na prejemnika in preverjanje MORA iti največ en zbirni dopis; ista sprememba NE SME
  biti sporočena dvakrat; ponudba, ki ustreza več iskanjem istega prejemnika, je v dopisu enkrat
  z navedbo vseh iskanj.
- **FR-035**: Dopis MORA za vsako postavko vsebovati naziv iskanja, odhodno in ciljno letališče,
  prevoznika, datume in ure odhoda in povratka s cono, trajanje, število potnikov, aktualno ceno,
  prejšnjo ceno (kadar obstaja, prečrtano), absolutno in odstotno spremembo, oznako NOVO /
  POCENITEV / PODRAŽITEV, povezavo do rezervacije (kadar je), povezavo do ponudbe v aplikaciji
  in čas preverjanja; barve MORAJO delovati tudi v poštnih odjemalcih.
- **FR-036**: Pred vključitvijo v dopis MORA sistem znova preveriti, da ponudba še ustreza
  pravilom iskanja.
- **FR-037**: Neuspelo pošiljanje MORA biti ponovljeno z naraščajočim zamikom in omejenim številom
  poskusov; ponovitev NE SME povzročiti dvojnega dopisa; po izčrpanih poskusih je obvestilo
  označeno kot neuspelo z razlogom.
- **FR-038**: Nastavitve poštnega strežnika so lastnost namestitve in NE SMEJO biti vidne ali
  nastavljive v vmesniku; kadar niso nastavljene, se obvestila zabeležijo kot zadržana in
  administrator to vidi.
- **FR-039**: Produkcijska obvestila NE SMEJO vsebovati testnih ali izmišljenih ponudb.

#### Deljenje obvestil

- **FR-040**: Lastnik iskanja MORA imeti možnost izbrati med osebami namestitve, ki so se že
  prijavile, prejemnike obvestil, in jih kadar koli odstraniti; samega sebe ne more dodati.
- **FR-041**: Prejemnik MORA videti deljene ponudbe z nazivom iskanja in imenom lastnika; NE SME
  videti konfiguracije iskanja in NE SME iskanja urejati, deaktivirati, brisati ali deliti naprej.
- **FR-042**: Po odstranitvi prejemnik NE SME več prejemati obvestil tega iskanja in NE SME več
  videti njegovih ponudb.
- **FR-043**: Deljenje MORA biti ločena pravica od pisanja iskanj, ker odpre dostop drugi osebi.
- **FR-044**: Izbirnik oseb MORA uporabljati skupni imenik aplikacije z zamaskirano e-pošto;
  celi e-naslovi se uporabijo izključno za pošiljanje in NIKOLI ne zapustijo zaledja.

#### Administracija in urnik

- **FR-045**: Urnik preverjanja MORA biti nastavljiv izključno osebam z vlogo administratorja in
  samo kot prijavljenim ljudem; API ključ administratorskih opravil NE SME izvesti, ne glede na
  obsege.
- **FR-046**: Administrator MORA imeti možnost: vklopiti ali izklopiti preverjanje; nastaviti
  urnik kot izraz; izbrati časovni pas s privzeto vrednostjo Europe/Ljubljana; izbrati preprost
  urnik (vsak dan ob 6:00; vsak dan ob 6:00 in 18:00; vsakih 6 ur; vsak ponedeljek ob 8:00), ki
  se pretvori v izraz; sprožiti preverjanje ročno; prekiniti tekoče preverjanje.
- **FR-047**: Izraz urnika MORA biti preverjen pred shranjevanjem; neveljaven je zavrnjen z
  razlago; ob veljavnem je prikazan čas naslednjega preverjanja.
- **FR-048**: Sprememba urnika MORA začeti veljati brez ponovnega zagona aplikacije.
- **FR-049**: Privzeto stanje nove namestitve je: preverjanje vklopljeno, vsak dan ob 6:00 in
  18:00, Europe/Ljubljana.
- **FR-050**: Dve preverjanji NE SMETA teči hkrati — ne v istem izvodu aplikacije ne v dveh;
  termin, ki ga je prevzel en izvod, drugi prepozna kot zasedenega.
- **FR-051**: Preverjanje, ki ga je prekinil ponovni zagon, MORA biti ob naslednjem zagonu
  označeno kot prekinjeno; zamujen termin MORA biti dohiten; že zabeležene spremembe in že
  poslana obvestila NE SMEJO biti podvojeni.
- **FR-052**: Vsako preverjanje MORA biti zabeleženo z začetkom, koncem, stanjem, sprožilcem
  (urnik ali ročno in kdo), številom pregledanih iskanj, zahtev na vire, novih ponudb, sprememb
  cen, poslanih in zadržanih obvestil ter seznamom napak; zgodovina MORA biti časovno omejena.
- **FR-053**: Administrator MORA videti stanje vsakega vira: vklopljen ali ne, uraden ali
  neuraden, čas zadnjega uspeha, zadnja napaka.
- **FR-054**: Vsako izvajanje in vsaka odločitev preverjanja MORA biti v strukturiranem dnevniku
  brez gesel, žetonov ali celih e-naslovov (člen VII).

#### Splošno

- **FR-055**: Modul MORA biti zavihek "Leti" v obstoječem meniju, privzeto vklopljen, ki ga
  uporabnik lahko izklopi kot druge zavihke; administratorski del je podstran modula, ki jo vidi
  samo administrator.
- **FR-056**: Vsa besedila vmesnika in dopisov so v slovenščini, v istem tonu kot preostala
  aplikacija; vmesnik uporablja obstoječe gradnike, barve in postavitev.
- **FR-057**: Vsaka možnost vmesnika MORA biti dostopna tudi s HTTP klicem z API ključem z
  ustreznim obsegom (branje, pisanje, deljenje), razen administratorskih opravil; vse mutacije
  sprejemajo ključ idempotentnosti; pogodba je del izvedbe (člen III).
- **FR-058**: Sistem MORA hraniti samo podatke, potrebne za funkcionalnost; žetoni virov in
  nastavitve pošte so izključno v okolju namestitve (člen IV).

### Key Entities

- **Iskanje (FlightSearchRule)**: lastnikova opredelitev, kaj išče — ime, aktivnost, odhodna
  letališča, cilji in izključitve, datumski način z obdobjem ali tekočim oknom, fleksibilnost,
  pravilo o povratku, razpon nočitev, dnevi in ure, minimalni čas na destinaciji, potniki, cenovne
  omejitve, prevozniki, prestopi, prtljaga, valuta, prejemniki obvestil, časa nastanka in
  spremembe, čas zadnjega uspešnega pregleda in stanje zadnjega pregleda po virih.
- **Prejemnik (FlightSearchRecipient)**: oseba namestitve, ki ob iskanju prejema obvestila; vezan
  na iskanje in osebo, z zastavico, ali obvestila prejema.
- **Ponudba (FlightOffer)**: ena konkretna kombinacija letov pri enem viru s stabilno identiteto;
  prevoznik, letališči, časi odhoda, pristanka in povratka, številke letov, prestopi, aktualna
  cena in valuta, sestava potnikov in vrsta vozovnice, prtljaga, povezava do rezervacije, čas
  prvega in zadnjega preverjanja, stanje razpoložljivosti. Skupna vsem iskanjem, ki jim ustreza.
- **Ujemanje (FlightSearchMatch)**: povezava med iskanjem in ponudbo s časom prvega ujemanja;
  nosi, kaj je za to iskanje "novo", in določa, kdo ponudbo vidi.
- **Zgodovina cen (FlightOfferHistory)**: zaporedje preverjanj ponudbe — čas, cena, prejšnja
  cena, vrsta spremembe, izvajanje.
- **Izvajanje (FlightSearchRun)**: eno preverjanje — začetek, konec, stanje (čaka, teče,
  uspešno, delno, neuspešno, prekinjeno, preklicano), sprožilec, termin, števci, napake.
- **Obvestilo (FlightNotification)**: en zbirni dopis enemu prejemniku za eno izvajanje —
  postavke (iskanje, ponudba, sprememba), stanje (čaka, poslano, neuspelo, zadržano), poskusi,
  čas pošiljanja, razlog neuspeha.
- **Nastavitve urnika (FlightSchedulerSettings)**: ena na namestitev — vklop, izraz, časovni pas,
  kdo in kdaj je spremenil.
- **Vir (FlightProvider)**: opis vira — oznaka, ime, uraden ali neuraden, vklopljen, zadnji uspeh,
  zadnja napaka; ni uporabniški zapis, ampak lastnost namestitve.
- **Letališče**: oznaka, ime, mesto, država, koordinate, časovni pas; vgrajen nabor.

## Out of Scope

- Rezervacija ali nakup vozovnic znotraj aplikacije; rezervacija je vedno pri viru.
- Preverjanje cene "v živo" ob kliku uporabnika; vsak podatek je iz zadnjega rednega ali ročno
  sproženega preverjanja.
- Wizz Air in easyJet kot neposredna vira (zaščita pred roboti); easyJet prek plačljivega
  posrednika je odložen na poznejšo dopolnitev.
- Potisna ali druga obvestila poleg e-pošte.
- Pretvorba valut.
- Hoteli, najem avtomobilov, paketi.
- Javna stran za osebe brez računa.
- Geokodiranje poljubnega naslova za iskanje letališč po radiju; izhodišče je letališče, mesto
  iz nabora ali domači kraj iz nastavitev.
- Ploščica na nadzorni plošči (mogoča dopolnitev).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uporabnik brez navodil ustvari in shrani iskanje z dvema letališčema, obdobjem in
  trajanjem v manj kot 3 minutah; predogled obdobja se ujema z ročnim izračunom v 100 % primerov.
- **SC-002**: Pri iskanju "petek po 15:00 → nedelja" z obdobjem čez 25. 10. 2026 je vsak let, ki
  ga sistem uvrsti med ponudbe, v lokalnem času letališča res v petek po 15:00 — odstopanje 0.
- **SC-003**: Pri dveh zaporednih preverjanjih z istimi podatki vira je število poslanih dopisov
  po drugem natanko 0; pri eni spremembi cene natanko 1 na prejemnika.
- **SC-004**: Za isto spremembo iste ponudbe noben prejemnik ne prejme več kot enega dopisa, tudi
  ob napaki pošte in ponovitvi, tudi ob ponovnem zagonu med izvajanjem — v 100 % poskusov.
- **SC-005**: Oseba brez vloge administratorja v 100 % poskusov ne more spremeniti urnika ali
  sprožiti preverjanja; oseba brez pravice do iskanja v 100 % poskusov iz odgovora ne izve, da
  tuje iskanje obstaja.
- **SC-006**: Spremenjen urnik začne veljati brez ponovnega zagona in naslednje preverjanje se
  izvede v minuti po terminu.
- **SC-007**: Pri 50 iskanjih 10 uporabnikov, ki pokrivajo 20 različnih kombinacij letališč in
  mesecev, je število zahtev na vir v enem preverjanju največ 20 (ena na kombinacijo), ne 50.
- **SC-008**: Odpoved vira ob preverjanju ne odstrani niti ene obstoječe ponudbe in ne sproži
  niti enega dopisa; stanje je pri iskanju in v zgodovini izvajanj vidno kot neuspeh vira.
- **SC-009**: Vsak podatek, prikazan v vmesniku, je dosegljiv tudi s HTTP klicem; polj, ki so samo
  v vmesniku, ni.
- **SC-010**: Zgodovina cen, starejša od roka hrambe, se ne pojavi nikjer; rok je uveljavljen brez
  ročnega posega.
- **SC-011**: Odstranitev modula (mapa na obeh straneh, vnos v registru, vrstica za vpetje) pusti
  preostalo aplikacijo delujočo s čistimi preverjanji tipov, sloga in testov (člen I).
- **SC-012**: Vsi testni scenariji iz naročila (fiksni datumi, fleksibilnost 0–3 in po meri 10,
  trajanja, tekoče okno, vikend, časovni pasovi, NOVO/POCENITEV/PODRAŽITEV/NESPREMENJENO,
  neuspel vir, deduplikacija ponudb in obvestil, deljenje in preklic, tuja iskanja, admin-only
  urnik, sprememba urnika, sočasna izvajanja, ponovni zagon, več iskanj z isto ponudbo,
  neveljavne cene, neuspela pošta) imajo avtomatiziran test z mockanimi zunanjimi viri.

## Assumptions

- **Odločitve lastnika namestitve (17. 10. 2026)**, vgrajene v specifikacijo in zato brez oznak
  za razjasnitev: Travelpayouts/Aviasales kot edini produkcijski vir MVP-ja z brezplačnim žetonom
  lastnika; neuradni Ryanairov vir opt-in, privzeto izklopljen; easyJet prek posrednika odložen;
  e-pošta kot skupna storitev aplikacije; zavihek "Leti" privzeto vklopljen; administratorski del
  kot podstran modula; privzeti urnik 6:00 in 18:00; radij letališč od letališča, mesta ali
  domačega kraja.
- Pokritost vira Travelpayouts za manjša letališča (LJU, TRS, GRZ, KLU) ni znana in se preveri s
  kratko meritvijo pred izvedbo faze virov; če je slaba, modul deluje naprej in to pri iskanju
  izrecno piše, lastnik pa se odloči o vklopu dodatnih virov.
- Namestitev teče v enem izvodu; zaščita pred podvajanjem med izvodi je vseeno zahtevana (FR-050),
  ker je cena napake dvojni dopis vsem uporabnikom.
- Nabor letališč je vgrajen iz javno dostopnega, prosto licenciranega vira in se osvežuje ob
  izdajah aplikacije, ne v živo.
- Poštni strežnik je lastnikov; nastavitve zanj v okolju že obstajajo in se ponovno uporabijo;
  edina nova nastavitev je, ali se povezava šifrira od začetka.
- Dopisi se pošiljajo v slovenščini vsem prejemnikom; jezika po osebi ni.
- Otroci se pri virih, ki tega ne podpirajo, štejejo kot odrasli in to je pri ponudbi navedeno.
- Uporabniki, ki jim je mogoče deliti, so osebe, ki so se vsaj enkrat prijavile — ista
  omejitev kot pri opravilih (010) in receptih (013).
- Zgodovina cen se hrani 180 dni, zgodovina izvajanj 90 dni; vrednosti sta nastavljivi v
  namestitvi in sta izhodišče, ne zahteva.
