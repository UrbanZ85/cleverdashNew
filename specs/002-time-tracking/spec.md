# Feature Specification: Beleženje časa

**Feature Branch**: `main` — veja ni ustvarjena, ker `before_specify` git hook ni registriran

**Feature Directory**: `specs/002-time-tracking`

**Created**: 2026-08-20

**Status**: Ready for planning — vsa odprta vprašanja razrešena

**Input**: User description: "Preberi nacrt/002-time-tracking/spec.md in ustvari specifikacijo."

**Vir**: `nacrt/002-time-tracking/spec.md`. Številčenje zahtev je namenoma ohranjeno iz
vhodnega dokumenta v enaki skupinski shemi (po deseticah, kot pri 001), da je sledljivost
enosmerna in preverljiva.

**Odvisnost**: Funkcionalnost 001 (ogrodje, avtentikacija, obvestila, Docker) je dokončana.
Ta funkcionalnost se nanjo priklopi kot nov zavihek, brez sprememb ogrodja (člen I ustave).

Uporabnik mora vsak delovni dan na spletni strani delodajalca pritisniti gumbe za prijavo
na delo, začetek in konec malice ter konec dela. To je opravilo, ki se zlahka pozabi.
CleverDash ga lahko prevzame (samodejno pritisne in preveri, da je res učinkovalo) ali samo
nadzoruje (opozori, če ni bilo pritisnjeno). Ključna razlika od predhodnega sistema: akcija
ni "opravljena", ker jo je sistem sprožil, ampak šele ko je potrjeno, da se je stanje na
oddaljeni strani res spremenilo.

## Clarifications

### Session 2026-08-20

- Q: Kaj natančno naredi sistem za dneve profila, ki je nastavljen na način `OFF`? → A: Koledarski status (CalendarDay) se še vedno izračuna naprej za pregled in gladek preklop, a se za `OFF` profil ne ustvari nobena PlannedAction niti obvestilo (Option A, glej FR-008).
- Q: Če je akcija ob prehodu čez polnoč še vedno sredi ponovnih poskusov iz FR-031, kaj prevlada? → A: Polnočno zaprtje ima prednost — tekoči poskusi se takoj prekinejo in akcija postane `missed`, brez nadaljnjih poskusov po polnoči (Option A, glej FR-045).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ročni pritisk in preverjeno stanje iz aplikacije (Priority: P1)

Uporabnik odpre zaslon "Danes", vidi, katere akcije so trenutno na voljo pri delodajalcu, in
eno od njih pritisne neposredno iz aplikacije. Sistem akcijo izvede, preveri, da je res
učinkovala, in izid pokaže v nekaj sekundah.

**Why this priority**: To je jedrna zmogljivost, od katere so odvisne vse ostale zgodbe —
samodejno izvajanje (P2) je ista operacija, le sprožena po urniku namesto na dotik. Brez
zanesljivega branja stanja in preverjene izvedbe ena akcija ni mogoče zgraditi nič
drugega. Hkrati je samostojno uporabna: nadomesti obisk strani delodajalca z enim dotikom in
odpravi negotovost, ali je pritisk res učinkoval.

**Independent Test**: Odpri zaslon "Danes" pri znanem stanju pri delodajalcu, pritisni
razpoložljivo akcijo in preveri, da se izid (uspeh/neuspeh) prikaže v nekaj sekundah, da se
zapiše v zgodovino z virom `manual`, in da se stanje na zaslonu ujema s prejšnjim.

**Acceptance Scenarios**:

1. **Given** odprt zaslon "Danes" za izbrano lokacijo, **When** se zaslon naloži, **Then**
   uporabnik vidi seznam trenutno razpoložljivih akcij, izpeljanih iz žive strani
   delodajalca.
2. **Given** razpoložljiva akcija, **When** jo uporabnik pritisne, **Then** sistem akcijo
   izvede, ponovno prebere stanje, potrdi pričakovano spremembo in izid prikaže uporabniku.
3. **Given** izvedena ročna akcija, **When** se zapiše v zgodovino, **Then** ima vir
   `manual` in vsebuje prebrano stanje pred in po.
4. **Given** akcija, katere pričakovano stanje že velja (npr. uporabnik je gumb pritisnil na
   svojem telefonu mimo aplikacije), **When** jo uporabnik vseeno sproži, **Then** sistem
   tega ne obravnava kot napako, ampak kot `already_done`.
5. **Given** ročno izvedena akcija, **When** se ujema z akcijo, ki je za danes že
   načrtovana, **Then** se načrtovana akcija označi kot opravljena in zanjo pozneje ne pride
   opozorilo.

---

### User Story 2 - Samodejno beleženje ob delovnem dnevu (Priority: P2)

Uporabnik ima urniški profil v samodejnem načinu. Ob dogovorjenem času sistem sam izvede
prijavo na delo, začetek in konec malice ter konec dela — brez posega uporabnika — in ob
vsaki od njih potrdi uspeh z obvestilom na telefon.

**Why this priority**: To je razlog, da funkcionalnost obstaja. P1 je gradnik, P2 je
vrednost, zaradi katere uporabniku opravila ni več treba držati v glavi.

**Independent Test**: Nastavi profil z načinom `AUTO` za tekoči dan, počakaj do
načrtovanega časa in preveri, da se akcija izvede sama, da je verificirana proti
dejanskemu stanju in da pride potrditveno obvestilo.

**Acceptance Scenarios**:

1. **Given** profil v načinu `AUTO`, veljaven za današnji dan brez praznika ali odsotnosti,
   **When** nastopi načrtovani čas akcije, **Then** sistem akcijo izvede sam, jo preveri in
   zapiše uspeh v zgodovino z virom `schedule`.
2. **Given** izvedena samodejna akcija, **When** se preverjanje po izvedbi zaključi uspešno,
   **Then** uporabnik prejme potrditveno obvestilo na telefon.
3. **Given** profil z več akcijami v dnevu (prijava, malica, konec malice, konec dela),
   **When** sistem sestavi dnevni načrt, **Then** je vsak dejanski čas izračunan enkrat, ob
   sestavljanju, in od takrat naprej nespremenjen ter viden vnaprej.
4. **Given** dva različna profila, **When** oba istočasno dosežeta načrtovani čas, **Then**
   se za en profil nikoli ne izvajata dve akciji hkrati.

---

### User Story 3 - Zaznava neuspešnega klika in ponovni poskus (Priority: P3)

Ko sistem pritisne gumb, a ponovno branje stanja pokaže, da se ni nič spremenilo, poskus
označi kot neuspel in poskusi znova z naraščajočim zamikom. Ko so poskusi izčrpani, pošlje
razumljivo obvestilo in pusti akcijo vidno označeno kot neuspelo.

**Why this priority**: Ločeno od P2, ker je to prav tista pot, ki v praksi odpove
(počasna stran, spremenjena stran, izgubljena seja) — brez nje bi samodejni način tiho
"uspel", dejansko pa se ne bi zgodilo nič.

**Independent Test**: Simuliraj stanje, kjer klik ne povzroči spremembe, in preveri, da
sistem naredi nastavljeno število poskusov z naraščajočim zamikom, da vsak poskus vsebuje
posnetek zaslona, in da po izčrpanih poskusih pride jasno obvestilo o neuspehu.

**Acceptance Scenarios**:

1. **Given** sistem je pritisnil gumb, **When** ponovno branje stanja pokaže nespremenjeno
   stanje, **Then** se poskus označi kot neuspel, shrani se posnetek zaslona in sledi nov
   poskus po naraščajočem zamiku.
2. **Given** vsi nastavljeni poskusi so izčrpani brez uspeha, **When** se zadnji poskus
   zaključi, **Then** sistem pošlje obvestilo z jasnim opisom, kaj ni uspelo, in akcijo pusti
   v stanju `failed`.
3. **Given** akcija v stanju `failed`, **When** uporabnik odpre zgodovino ali zaslon
   "Danes", **Then** je stanje `failed` jasno vidno in razširljivo do posameznih poskusov.

---

### User Story 4 - Način samo opozarjanje (Priority: P4)

Uporabnik, ki hoče gumbe pritiskati sam, nastavi profil v način, kjer sistem ne klika
ničesar, ampak samo opozori, če pričakovana akcija ob dogovorjenem času (plus strpno
obdobje) ni bila zaznana.

**Why this priority**: Varnejša alternativa popolni avtomatizaciji — uporabnik obdrži
nadzor nad pritiskom gumbov, a ne tvega, da ga pozabi. Neodvisna od P2/P3, ker sistem tu
nikoli ne pritisne ničesar.

**Independent Test**: Nastavi profil v način opozarjanja, pusti načrtovani čas preteči brez
ročnega pritiska in preveri, da sistem ne klikne ničesar, da pride opozorilo po strpnem
obdobju in da se opozorilo ponavlja do nastavljene meje ali do ročne izvedbe/preskoka.

**Acceptance Scenarios**:

1. **Given** profil v načinu opozarjanja, **When** je načrtovani čas akcije prekoračen za
   nastavljeno strpno obdobje in branje stanja pokaže, da sprememba ni nastopila, **Then**
   sistem ne klikne ničesar in pošlje opozorilo z imenom akcije in načrtovanim časom.
2. **Given** poslano opozorilo, **When** uporabnik akcijo še vedno ne opravi, **Then** se
   opozorilo ponovi po nastavljenem intervalu, največ do nastavljenega števila ponovitev.
3. **Given** poslano opozorilo, **When** uporabnik akcijo opravi sam (na svojem telefonu, na
   računalniku ali v aplikaciji), **Then** sistem to zazna ob naslednjem branju stanja in
   nadaljnja opozarjanja za to akcijo ustavi.
4. **Given** poslano opozorilo, **When** uporabnik akcijo ročno prekliče kot nepotrebno,
   **Then** se opozarjanje zanjo ustavi, ne da bi bila akcija zabeležena kot izvedena.

---

### User Story 5 - Koledar delovnih dni: prazniki in vikendi (Priority: P5)

Sistem pozna slovenske dela proste dni in dneve v tednu, za katere profil velja, zato na
dela prostih dnevih ne naredi ničesar in tega ni treba ročno ugašati.

**Why this priority**: Brez tega bi samodejni način poskušal delati tudi ob praznikih in
vikendih — napaka, ki bi jo uporabnik moral ročno preprečevati vsak teden.

**Independent Test**: Nastavi profil, ki dela pon–pet, preveri koledarski pregled za teden,
ki vsebuje praznik na delovni dan, in potrdi, da za ta dan ni ustvarjena nobena akcija ter
da je dan v pregledu označen kot dela prost z razlogom.

**Acceptance Scenarios**:

1. **Given** datum, ki pade na dela prost praznik na sicer delovni dan profila, **When**
   sistem sestavlja dnevni načrt, **Then** ne ustvari nobene akcije in dan označi z
   razlogom (ime praznika).
2. **Given** datum, ki pade na dan v tednu, za katerega profil ne velja (npr. sobota za
   pon–pet profil), **When** sistem sestavlja dnevni načrt, **Then** ne ustvari nobene
   akcije.
3. **Given** koledarski pregled prihodnjih dni, **When** ga uporabnik odpre, **Then** je za
   vsak dan viden status (delovni dan, vikend, praznik, odsotnost, izredni delovni dan) in
   razlog.
4. **Given** začetek novega koledarskega leta, **When** uporabnik prvič odpre pregled v tem
   letu, **Then** so slovenski prazniki za to leto že napolnjeni, brez ročnega vnosa.
5. **Given** samodejno napolnjen praznik, **When** ga uporabnik ročno popravi, **Then** ima
   ročni vnos prednost pred samodejnim izračunom.

---

### User Story 6 - Dopust in druge odsotnosti (Priority: P6)

Uporabnik vnese obdobje odsotnosti (dopust, bolniška, drugo), za katero urnik v celoti
miruje, prvi delovni dan po odsotnosti pa urnik samodejno spet deluje.

**Why this priority**: Pogosta, večdnevna izjema od rednega urnika, ki mora biti vnesena
enkrat vnaprej, ne vsak dan posebej.

**Independent Test**: Vnesi obdobje odsotnosti, ki obsega več dni in prečka mejo meseca,
preveri, da sistem za noben dan v tem obdobju ne ustvari akcij, in da se urnik prvi delovni
dan po odsotnosti nadaljuje brez ročnega posega.

**Acceptance Scenarios**:

1. **Given** vnesena odsotnost z začetnim in končnim datumom (vključno), **When** sistem
   sestavlja načrt za katerikoli dan v tem obdobju, **Then** ne ustvari akcij in dan označi
   z vrsto odsotnosti.
2. **Given** obdobje odsotnosti, ki prečka mejo koledarskega meseca, **When** se načrt
   sestavlja za oba meseca, **Then** je odsotnost upoštevana dosledno v obeh, brez vrzeli na
   meji.
3. **Given** prvi delovni dan po koncu odsotnosti, **When** sistem sestavlja načrt zanj,
   **Then** urnik deluje enako kot pred odsotnostjo, brez ročnega vklopa.
4. **Given** vnesena odsotnost za prihodnji datum, **When** se ta datum kasneje prekriva z
   izredno vsiljenim delovnim dnem (Story 7) za isti profil, **Then** sistem prekrivanje
   zavrne z razumljivim sporočilom ob vnosu druge izjeme.

---

### User Story 7 - Izredni delovni dan (Priority: P7)

Uporabnik, ki mora izjemoma delati na sicer dela prost dan (vikend ali praznik), ta
posamični datum vklopi kot delovni dan, ne da bi moral spreminjati profil.

**Why this priority**: Redka, a realna izjema; brez nje bi uporabnik moral začasno
preurediti cel profil za en dan.

**Independent Test**: Vnesi izredni delovni dan za soboto, preveri, da sistem zanjo
ustvari enake akcije, kot bi jih za običajen delovni dan tega profila, in da po tem datumu
izjema ne vpliva na noben drug dan.

**Acceptance Scenarios**:

1. **Given** vnesena izjema za določen datum in profil, **When** sistem sestavlja načrt za
   ta dan, **Then** ustvari akcije, kot bi bil to običajen delovni dan tega profila.
2. **Given** izredni delovni dan, ki sovpada s praznikom, **When** se načrt sestavlja,
   **Then** izredna izjema prevlada nad statusom praznika.
3. **Given** izredni delovni dan, ki sovpada z obdobjem že vnesene odsotnosti za isti
   profil, **When** uporabnik izjemo vnaša, **Then** sistem to prekrivanje zavrne z
   razumljivim sporočilom.

---

### User Story 8 - Opozorilo na potekajočo sejo pri delodajalcu (Priority: P8)

Sistem uporabnika opozori, da bo seja pri delodajalcu kmalu potekla, in loči to stanje od
običajne nedosegljivosti strani, da urnik ne začne tiho odpovedovati brez pojasnila.

**Why this priority**: Seja je edina "identiteta" v podedovanem sistemu (glej Podedovane
omejitve); njena poteklost je najverjetnejši vzrok tihe odpovedi celotnega urnika, zato
mora biti diagnosticirana in razumljivo sporočena, preden se to zgodi.

**Independent Test**: Nastavi sejo z rokom veljavnosti čez manj kot 7 dni, preveri, da
pride opozorilo z navedbo preostalih dni, nato simuliraj sejo brez razpoložljivih akcij in
preveri, da sistem to diagnosticira kot potekel čas in ne kot splošno napako strani.

**Acceptance Scenarios**:

1. **Given** rok veljavnosti seje se izteče v manj kot 7 dneh, **When** sistem to zazna,
   **Then** pošlje opozorilo "seja se izteče v N dneh", ponovljeno vsaj še ob 3 dneh in
   1 dnevu pred iztekom.
2. **Given** stran delodajalca ne vrne nobene razpoložljive akcije, **When** sistem to
   stanje diagnosticira, **Then** loči, ali je vzrok potekla seja, nedosegljiva stran ali
   spremenjena struktura strani, in to jasno pove.
3. **Given** uporabnik prejme opozorilo o poteku seje, **When** v aplikaciji vnese novo
   vrednost sejnega piškotka, **Then** sistem to sprejme brez ponovnega zagona in urnik se
   nadaljuje.

---

### User Story 9 - Zgodovina beleženja (Priority: P9)

Uporabnik lahko pregleda vse pretekle akcije: kaj je bilo načrtovano, kaj se je dejansko
zgodilo, kdaj in po čigavi zaslugi (samodejno, ročno ali prek API-ja).

**Why this priority**: Potrebna šele, ko obstaja kaj za pregledovati (po P1–P8), a je
edini način, da uporabnik ob nesoglasju z evidenco delodajalca preveri svojo stran zgodbe.

**Independent Test**: Ustvari akcije z različnimi izidi in viri, odpri zgodovino s filtri
po obdobju, profilu, tipu in izidu, in preveri, da se seznam pravilno filtrira in da se
posamezen zapis razširi do podrobnosti posameznih poskusov, vključno s posnetkom zaslona ob
napaki.

**Acceptance Scenarios**:

1. **Given** pretekle akcije z različnimi izidi, **When** uporabnik odpre zgodovino,
   **Then** vidi za vsako: načrtovani in dejanski čas, tip, profil, izid, število poskusov,
   vir in prebrano stanje pred in po.
2. **Given** odprta zgodovina, **When** uporabnik nastavi filter po obdobju, profilu, tipu
   ali izidu, **Then** se seznam ustrezno zoži.
3. **Given** zapis z neuspelim poskusom, **When** ga uporabnik razširi, **Then** vidi
   podrobnosti vsakega poskusa, vključno s posnetkom zaslona ob napaki.
4. **Given** zapisan zgodovinski zapis, **When** bi ga karkoli poskusilo spremeniti,
   **Then** sistem tega ne dovoli — popravek se vnese kot nov zapis z opombo, izvirni pa
   ostane nespremenjen.

---

### User Story 10 - Dohitevanje po izpadu sistema (Priority: P10)

Ko se strežnik, baza ali brskalniška plast ne odzivajo, zunanja nadzorna storitev to zazna
in sproži alarm. Ko se sistem povrne, zamujene akcije obdela namesto da bi jih tiho
preskočil, in za vsako pošlje obvestilo, da je bila zamujena.

**Why this priority**: Nadgradnja člena VII ustave (dokazanega že v 001) s specifiko te
funkcionalnosti: tu "tišina" pomeni izgubljen delovni dan, ne le zastarel prikaz podatka.

**Independent Test**: Ustavi sistem prek načrtovanega časa akcije, ga znova zaženi in
preveri, da zamujeno akcijo obravnava po pravilih (izvede, če je še smiselno, sicer označi
`missed`) ter da za vsako zamujeno akcijo pride obvestilo, ki jasno pove, da je bila
zamujena.

**Acceptance Scenarios**:

1. **Given** sistem se ni odzival čez načrtovani čas ene ali več akcij, **When** se znova
   zažene, **Then** za vsako zamujeno akcijo v načinu `AUTO` presodi, ali jo je še smiselno
   izvesti, in jo izvede ali označi kot `missed`.
2. **Given** akcija je označena kot `missed` po vrnitvi sistema, **When** se to zgodi,
   **Then** uporabnik prejme obvestilo, ki jasno pove, da je bila akcija zamujena zaradi
   izpada, ne tiho preskočena.
3. **Given** sistem se ne odziva, **When** to traja dlje od pričakovanega intervala
   življenjskega znaka, **Then** zunanja nadzorna storitev sproži alarm neodvisno od
   notranjega stanja sistema.

---

### User Story 11 - Avtomatizacija prek API-ja (Priority: P11)

Uporabnik, ki gradi lastne avtomatizacije (npr. v n8n), prek REST API-ja z API ključem
prebere stanje, sproži akcijo, prebere zgodovino, vnese odsotnost ter vklopi ali izklopi
profil — brez uporabniškega vmesnika.

**Why this priority**: Razširja doseg funkcionalnosti izven aplikacije, a je nadgradnja nad
že delujočimi zmogljivostmi P1–P9, zato ima najnižjo prioriteto.

**Independent Test**: Z veljavnim API ključem ustreznega obsega prek HTTP-ja preberi
stanje, sproži akcijo z glavo `Idempotency-Key`, ponovi isto zahtevo z istim ključem in
preveri, da se akcija ni izvedla dvakrat, nato preberi zgodovino te akcije.

**Acceptance Scenarios**:

1. **Given** veljaven API ključ z ustreznim obsegom, **When** se prek API-ja sproži akcija,
   **Then** se izvede enako, kot bi se prek aplikacije, in se zabeleži z virom `api`.
2. **Given** zahteva za sprožitev akcije z glavo `Idempotency-Key`, **When** se ista zahteva
   z istim ključem ponovi, **Then** se akcija izvede kvečjemu enkrat in obe zahtevi vrneta
   isti izid.
3. **Given** veljaven API ključ, **When** se prek API-ja prebere stanje, zgodovina, vnese
   odsotnost ali preklopi profil, **Then** so vse te operacije dosegljive brez izjem prek
   `/api/v1`.
4. **Given** konfiguriran izhodni webhook, **When** se zgodi dogodek (akcija uspela,
   neuspela, zamujena, seja se izteka), **Then** sistem pošlje podpisano obvestilo na
   nastavljeni naslov, namesto da bi moral naročnik poizvedovati.

---

### Edge Cases

- Prehod na poletni oz. zimski čas: načrtovani čas pade v uro, ki lokalno ne obstaja
  (marec) ali se ponovi (oktober) — sistem mora akcijo nedvoumno umestiti na en sam trenutek
  brez podvajanja ali izpusta.
- Praznik pade na sicer delovni dan profila — glej Story 5.
- Dopust preko meje meseca — glej Story 6.
- Dve izjemi (odsotnost in izredni delovni dan) se prekrivata za isti profil in datum —
  zavrnjeno z razumljivim sporočilom (Story 6, 7).
- Restart sistema sredi dneva, ko so nekatere akcije dneva že izvedene, druge še ne — po
  ponovnem zagonu se obdelajo samo tiste, ki so zares zamujene ali še čakajo, že izvedene
  ostanejo nedotaknjene.
- Dva profila veljata za isti teden (a ne za isti dan) — dovoljeno; sistem zavrne samo
  prekrivanje za **isti dan** (FR-006).
- Akcija je ob prehodu čez polnoč še sredi niza ponovnih poskusov (FR-031) — polnočno
  zaprtje (FR-045) ima prednost: preostali poskusi se prekinejo, akcija postane `missed`,
  sistem po polnoči ne pritisne gumba za pretekli koledarski dan.
- Profil je nastavljen na način `OFF` — koledarski status dneva se izračuna naprej (FR-008),
  a se zanj ne ustvari nobena načrtovana akcija ne obvestilo.
- Stran delodajalca odgovori uspešno, a ne vrne nobene razpoložljive akcije — obravnavano
  kot okvara (potekla seja, nedosegljivost ali sprememba strani), ne kot veljavno stanje
  "nič ni na voljo".
- Uporabnik pritisne akcijo ročno v istem trenutku, ko jo poskuša sprožiti tudi urnik —
  sistem zagotavlja, da se za en profil nikoli ne izvajata dve akciji hkrati (FR-034).
- Posnetek zaslona ob napaki je star več kot nastavljeno obdobje hrambe — samodejno se
  izbriše, zapis zgodovine (brez slike) ostane.
- Uporabnik vnese sejni piškotek, ki je neveljaven takoj ob vnosu — sistem to sporoči
  takoj, ne šele ob naslednjem načrtovanem poskusu.

## Requirements *(mandatory)*

### Functional Requirements

#### Urnik in profili

- **FR-001**: Sistem MORA omogočati več urniških profilov. Profil vsebuje ime, dneve v
  tednu, za katere velja, način delovanja in seznam načrtovanih akcij s časi za vsak dan.
- **FR-002**: Nabor akcij v profilu NI fiksen — dan je lahko sestavljen iz poljubne
  podmnožice akcij (npr. samo začetek in konec dela, brez malice).
- **FR-003**: Vsak načrtovani čas v profilu ima lahko nastavljen raztros v sekundah.
  Dejanski čas MORA biti izračunan ob sestavljanju dnevnega načrta in od takrat naprej
  nespremenjen ter viden vnaprej.
- **FR-004**: Profil MORA določati lokacijo izvedbe (kje in za katero stran se akcija
  izvede) z nastavljivim geografskim raztrosom. Profil določa SAMO čase; kateri gumb za
  začetek dela se pritisne, pove lokacija (FR-090).
- **FR-005**: Profil ima način delovanja: samodejno (`AUTO`), samo opozarjanje
  (`REMIND_ONLY`) ali izklopljeno (`OFF`). Način je nastavljiv na ravni profila; na ravni
  posamezne akcije znotraj profila ni ločeno nastavljiv (glej Assumptions).
- **FR-006**: Dva profila NE SMETA veljati za isti dan hkrati. Ob poskusu shranjevanja
  prekrivajočega profila sistem to zavrne z razumljivim sporočilom.
- **FR-007**: Novoustvarjen profil ima privzeti način delovanja `AUTO` (odločeno
  20. 8. 2026, glej Assumptions).
- **FR-008**: Način `OFF` ne ustvari nobene načrtovane akcije ne obvestila za dneve tega
  profila. Koledarski status dneva (delovni dan, vikend, praznik, odsotnost ...) se kljub
  temu izračuna naprej po pravilih FR-014, da je viden v koledarskem pregledu (Story 5) in
  da preklop nazaj v `AUTO` ali `REMIND_ONLY` ne pusti vrzeli v podatkih.

#### Koledar delovnih dni

- **FR-010**: Sistem MORA poznati slovenske dela proste dni, vključno s premikajočimi se
  (velikonočna nedelja in ponedeljek, binkoštna nedelja).
- **FR-011**: Prazniki se ob prvi uporabi vsakega koledarskega leta napolnijo samodejno.
  Uporabnik jih lahko ročno popravi ali doda; ročni vnos ima prednost pred samodejnim.
- **FR-012**: Uporabnik lahko vnese obdobja odsotnosti z vrsto (dopust, bolniška, drugo).
  Obdobje ima začetni in končni datum, končni je vključen.
- **FR-013**: Uporabnik lahko za posamezen datum vsili delovni dan, tudi če je to sicer
  vikend ali praznik.
- **FR-014**: Odločitev, ali je dani datum za dani profil delovni dan, sledi fiksni
  prednosti: vsiljen delovni dan > odsotnost > praznik > dan v tednu, za katerega profil
  velja.
- **FR-015**: Uporabnik MORA videti koledarski pregled prihodnjih dni z označenim statusom
  in razlogom za vsak dan.

#### Stanje in razpoložljive akcije

- **FR-020**: Sistem MORA znati prebrati trenutno stanje pri delodajalcu, ne da bi ob tem
  karkoli spremenil. Branje vrne nabor trenutno razpoložljivih akcij in iz njega izpeljano
  stanje.
- **FR-021**: Imena razpoložljivih akcij se pridobivajo z žive strani in se NE trdo
  kodirajo v sistemu. Sistem hrani zadnji uspešno prebrani nabor, da lahko ob
  nedosegljivosti razlikuje med "ni razpoložljivih akcij" in "ne morem prebrati stanja".
- **FR-022**: Če branje ne vrne nobene razpoložljive akcije, sistem to obravnava kot okvaro,
  ne kot veljavno stanje, in loči med vzroki: potekla seja, nedosegljiva stran, spremenjena
  struktura strani (glej tudi FR-063 za sejo).

#### Izvedba in verifikacija

- **FR-030**: V načinu `AUTO` sistem ob načrtovanem času izvede akcijo, nato znova prebere
  stanje in preveri, da se je spremenilo v pričakovano.
- **FR-031**: Neuspela ali neverificirana akcija se ponovi z naraščajočim zamikom, privzeto
  trikrat. Število poskusov in začetni zamik sta nastavljiva.
- **FR-032**: Vsak poskus izvedbe je zabeležen: čas začetka in konca, prebrano stanje pred
  in po, izid, sporočilo napake (če obstaja) in posnetek zaslona ob neuspehu.
- **FR-033**: Pred izvedbo sistem preveri, ali je akcija sploh smiselna. Če pričakovano
  stanje že velja, se akcija označi kot `already_done`, ne kot napaka ali uspeh.
- **FR-034**: Za en profil nikoli ne teče več kot ena akcija hkrati.
- **FR-035**: Sistem MORA imeti način `dry-run`, ki vse izračuna, prebere in zabeleži, a ne
  izvede nobene akcije, ki bi spremenila stanje pri delodajalcu.

#### Opozarjanje na zamujene akcije

- **FR-040**: V načinu `REMIND_ONLY` sistem ob načrtovanem času plus nastavljenem strpnem
  obdobju (privzeto 10 minut) prebere stanje. Če se pričakovana sprememba ni zgodila, pošlje
  opozorilo.
- **FR-041**: Opozorilo se ponavlja v nastavljenem intervalu (privzeto 10 minut) do
  nastavljenega števila ponovitev (privzeto 3), dokler akcija ni izvedena ali ročno
  preskočena.
- **FR-042**: Če uporabnik akcijo opravi sam (na telefonu, računalniku ali v aplikaciji),
  sistem to zazna ob naslednjem branju stanja in nadaljnja opozarjanja zanjo ustavi.
- **FR-043**: Tudi v načinu `AUTO` uporabnik dobi obvestilo ob končnem neuspehu akcije, po
  izčrpanju vseh poskusov.
- **FR-044**: Obvestilo o zamujeni ali neuspeli akciji MORA vsebovati: kaj bi se moralo
  zgoditi, kdaj je bilo načrtovano, zakaj (če je znano) ni uspelo, in način neposrednega
  prehoda na ustrezen zaslon.
- **FR-045**: Akcija, ki do polnoči ni bila niti izvedena niti opozorjena do konca
  (npr. "konec dela"), se ob prehodu na naslednji koledarski dan zapre s stanjem `missed` in
  ustreznim obvestilom. Polnočno zaprtje ima prednost pred FR-031: če je akcija ob prehodu
  čez polnoč še sredi niza ponovnih poskusov, se preostali poskusi takoj prekinejo in akcija
  postane `missed`, brez nadaljnjih poskusov po polnoči — sistem po polnoči NE SME pritisniti
  gumba, ki bi se na strani delodajalca zapisal za pretekli koledarski dan.

#### Zgodovina

- **FR-050**: Vsaka akcija je trajno zabeležena z: datumom, profilom, tipom, načrtovanim in
  dejanskim časom, izidom, virom (`schedule` / `manual` / `api`), številom poskusov ter
  stanjem pred in po.
- **FR-051**: Zgodovina je filtrirljiva po obdobju, profilu, tipu akcije in izidu, ter je
  straničena.
- **FR-052**: Zgodovina je nespremenljiva. Popravki se vnašajo kot nov zapis z opombo,
  izvirni zapis ostane nespremenjen.
- **FR-053**: Posnetki zaslona se hranijo omejeno obdobje (privzeto 30 dni) in se nato
  samodejno izbrišejo; sam zgodovinski zapis ostane.

#### Zdravje sistema

- **FR-060**: Zdravstveni pregled MORA poročati: starost zadnjega tika načrtovalnika,
  povezavo z bazo, sposobnost izvedbe akcij, dosegljivost strani delodajalca, veljavnost
  seje in število neuspelih akcij v zadnjih 24 urah.
- **FR-061**: Vsak tik načrtovalnika javi življenjski znak zunanji nadzorni storitvi. Če
  javljanje utihne, alarm pride od zunaj, neodvisno od notranjega stanja sistema.
- **FR-062**: Sistem ob vsakem zagonu preveri, ali je zamudil akcije med izpadom, in jih
  obdela: v `AUTO` izvede, če je še smiselno, sicer označi kot `missed` in o tem obvesti.
- **FR-063**: Poteklost seje pri delodajalcu se preverja dnevno; opozorilo pride najmanj 7
  dni pred iztekom, privzeto tudi še ob 3 dneh in 1 dnevu.
- **FR-064**: Uporabnik ima diagnostični zaslon, ki zdravstvene podatke prikaže berljivo, in
  gumb za takojšen preizkus branja stanja.

#### Obvestila

- **FR-070**: Obvestila te funkcionalnosti se pošiljajo na registrirane naprave uporabnika
  prek obstoječega mehanizma iz 001.
- **FR-071**: Obvestila so razvrščena po vrsti (opozorilo na zamujeno, potrditev, napaka,
  zdravje) in uporabnik lahko vsako vrsto ugasne posamično.
- **FR-072**: Vsako poslano obvestilo je zabeleženo z izidom dostave.
- **FR-073**: Sistem NE SME poslati dveh vsebinsko enakih obvestil za isto akcijo v istem
  intervalu opozarjanja.

#### Dostop prek API-ja

- **FR-080**: Vsaka zmogljivost iz te specifikacije je dosegljiva prek REST API-ja pod
  `/api/v1`, brez izjem.
- **FR-081**: Avtomatizacije se avtenticirajo z API ključem z omejenim obsegom pravic.
  Ključi se ustvarjajo in preklicujejo v aplikaciji; skrivnost se prikaže samo enkrat.
- **FR-082**: Mutacijski endpointi sprejemajo glavo `Idempotency-Key`; ponovljena zahteva z
  istim ključem vrne prvotni izid, ne izvede akcije drugič.
- **FR-083**: Sistem lahko ob dogodkih (akcija uspela, neuspela, zamujena, seja se izteka)
  pošilja izhodne webhooke na nastavljen naslov, podpisane s skrivnostjo.
- **FR-084**: API ima omejevanje hitrosti; endpointi, ki sprožijo izvedbo akcije, so omejeni
  strožje kot endpointi za branje.

#### Nastavitve

- **FR-090**: Uporabnik lahko v aplikaciji ureja lokacije izvedbe (ime, naslov strani,
  geografski raztros) in jih izbira na zemljevidu. Del lokacije je tudi **gumb, s katerim
  se na njej začne delo** — `Prijava na delo`, `Prihod na delo`, `Delo od doma` ali
  `Delo na terenu`. Vsi štirje vodijo v isto stanje (`ON_DUTY`) in se med sabo izključujejo;
  razlikuje jih kraj, ne urnik. Sistem ob sestavljanju dnevnega načrta ime akcije za začetek
  dela prevzame z lokacije, ostalih akcij (`Malica`, `Konec malice`, `Konec dela`) pa ne
  spreminja. Privzeta vrednost je `Prijava na delo`; ime, ki ga stran ne ponuja, je zavrnjeno.
  Posledica: isti profil dela iz pisarne, od doma in s terena — brez podvajanja urnika.
- **FR-091**: Uporabnik lahko v aplikaciji zamenja sejni piškotek delodajalca, brez
  ponovnega zagona sistema.
- **FR-092**: Vrednost sejnega piškotka se v odgovorih API-ja nikoli ne vrne v celoti — le
  maskirano, skupaj z rokom veljavnosti.
- **FR-093**: Vsi izvajalni deli sistema tečejo v časovnem pasu `Europe/Ljubljana` (podedovano
  iz člena V ustave in 001).
- **FR-094**: Za vsako lokacijo MORA biti mogoče izklopiti **pošiljanje lokacije** strani.
  Ko je izklopljeno, brskalnik strani lege naprave ne pove — dovoljenje za geolokacijo je
  izrecno zavrnjeno, koordinati se ne pošljeta. Vpisani koordinati OSTANETA shranjeni, ker
  je to stikalo in ne brisanje; lokacija, ustvarjena z izklopljenim pošiljanjem, koordinat
  ne potrebuje, vklop na taki lokaciji pa je zavrnjen, dokler koordinat ni. Privzeto je
  pošiljanje vklopljeno (dosedanje vedenje). Če stran gumbe pokaže šele, ko pozna lego, jih
  ob izklopu ne bo — diagnostika ob praznem naboru gumbov na to opozori, vzroka pa ne trdi.

### Key Entities *(include if feature involves data)*

- **Urniški profil**: skupina dni z enakim urnikom. Nosi ime, dneve v tednu, način
  delovanja, lokacijo in seznam načrtovanih akcij s časi in raztrosom. En profil je lahko
  aktiven ali neaktiven.
- **Lokacija izvedbe**: kje in na kateri strani se registracija zgodi. Nosi ime, naslov
  strani, gumb za začetek dela (FR-090), stikalo za pošiljanje lokacije (FR-094), predlogo
  koordinat (obvezno le, dokler se lokacija pošilja), geografski raztros in sklic na sejo.
- **Seja pri delodajalcu**: podedovana identiteta (sejni piškotek), z rokom veljavnosti in
  stanjem. Ni uporabniško geslo — glej Podedovane omejitve.
- **Koledarski dan**: odločitev sistema za en dan enega profila — status (delovni dan,
  vikend, praznik, dopust, bolniška, drugo, vsiljen delovni) in razlog.
- **Obdobje odsotnosti**: vrsta, začetni in končni datum (vključno), opomba.
- **Praznik**: dela prost ali samo praznovan dan — datum, ime, vir (samodejno/ročno), ali je
  dela prost.
- **Načrtovana akcija**: ena akcija enega dne enega profila — lokalni datum, tip akcije,
  načrtovani trenutek, trenutno stanje, število poskusov, način delovanja profila v tistem
  trenutku.
- **Poskus izvedbe**: en poskus ene načrtovane akcije — čas, izid, prebrano stanje pred in
  po, sporočilo napake, posnetek zaslona.
- **Zgodovinski zapis**: trajen, nespremenljiv zapis zaključene akcije — vse iz načrtovane
  akcije ob zaključku, plus vir (`schedule`/`manual`/`api`) in končni izid.
- **Zapis obvestila**: poslano obvestilo — vrsta, naslov, besedilo, naprava, izid dostave,
  sklic na akcijo, na katero se nanaša.
- **Življenjski znak (heartbeat)**: zapis enega tika načrtovalnika — čas, trajanje, kaj je
  bilo obdelano.
- **API ključ**: poverilnica za avtomatizacijo — ime, zgoščena vrednost, obseg pravic, čas
  zadnje uporabe, preklican ali ne (deljena entiteta z 001).

Stanja načrtovane akcije:

```
planned → due → running → succeeded
                        → failed        (poskusi izčrpani)
                        → already_done  (stanje je bilo že pravo)
         → missed        (čas prekoračen brez izvedbe, tudi ob prehodu čez polnoč)
         → skipped       (uporabnik ročno preskočil)
         → cancelled     (dan po sestavljanju načrta postal dela prost)
```

## Out of Scope

- Izračun ur, nadur, salda ali poročil o delovnem času — to ostaja pri delodajalcu.
- Urejanje že vpisanih zapisov na strani delodajalca — sistem samo pritiska gumbe, ki so že
  na voljo, ne posega v pretekle vnose.
- Upravljanje uporabnikov v smislu organizacije z več osebami — sistem je enouporabniški z
  možnostjo več naprav in več profilov iste osebe (glej Assumptions, podedovano iz 001).
- Samodejno odkrivanje spremenjene strukture strani delodajalca — sistem spremembo
  diagnosticira in o njej obvesti, ne poskuša je samodejno prilagoditi.
- Klicanje pravega naslova delodajalca med razvojem in testiranjem specifikacije — vsak
  klic bi lahko vplival na pravo evidenco delovnega časa (glej Podedovane omejitve).

## Podedovane omejitve

Te izhajajo iz obstoječega sistema delodajalca in niso predmet presoje v tej specifikaciji:

1. **Identiteta je sejni piškotek.** Ni uporabniškega imena in gesla ter ni API-ja
   delodajalca. Piškotek poteče in ga je treba občasno ročno zamenjati (glej Story 8).
2. **Stran delodajalca je treba obiskati z brskalnikom.** Zahteva geolokacijo in mobilni
   način prikaza; brez tega gumbov ne prikaže.
3. **Razpoložljive akcije so edini vpogled v stanje.** Ni endpointa, ki bi vrnil "trenutno
   sem na delu" — stanje se vedno izpeljuje iz trenutno prikazanega nabora gumbov.
4. **Imena akcij so slovenska besedila z gumbov** in morajo biti pri branju znakovno enaka
   živi strani.
5. **Časovni pas je `Europe/Ljubljana`**, s prehodi na poletni in zimski čas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: V samodejnem načinu je delež delovnih dni, za katere je vsaka načrtovana
  akcija izvedena in verificirana brez ročnega posega uporabnika, vsaj 95 % v obdobju
  enega meseca rednega delovanja.
- **SC-002**: Ko klik ne učinkuje, sistem to zazna in sproži prvi ponovni poskus v manj kot
  2 minutah od prvotnega poskusa.
- **SC-003**: Vsaka končno neuspela ali zamujena akcija povzroči natanko eno razumljivo
  obvestilo uporabniku; delež tihih (nesporočenih) neuspehov je nič.
- **SC-004**: V načinu samo opozarjanje je delež zamujenih akcij, za katere uporabnik
  prejme opozorilo v strpnem obdobju, 100 %.
- **SC-005**: Na dela prost dan (praznik, vikend ali odsotnost) je delež ustvarjenih akcij
  nič, brez ročnega posega uporabnika.
- **SC-006**: Uporabnik lahko iz zaslona "Danes" ročno sproži razpoložljivo akcijo in vidi
  potrjen izid v manj kot 10 sekund.
- **SC-007**: Po izpadu sistema, ki traja čez načrtovani čas ene ali več akcij, je ob
  vrnitvi sistema delež zamujenih akcij, ki so tiho izginile brez obdelave ali obvestila,
  nič.
- **SC-008**: Uporabnik prejme opozorilo o poteku seje pri delodajalcu vsaj 7 dni pred
  dejanskim iztekom, v 100 % primerov, ko je rok veljavnosti sistemu znan.
- **SC-009**: Ponovljena zahteva prek API-ja z istim `Idempotency-Key` v 100 % primerov ne
  povzroči druge dejanske izvedbe akcije.
- **SC-010**: Zgodovinski pregled za poljubno pretekli mesec je na voljo v manj kot 3
  sekundah in vsak zapis je do ravni posameznega poskusa preverljiv brez dostopa do baze.

## Assumptions

Spodnje so privzete odločitve, sprejete tam, kjer vhodni dokument (`nacrt/002-time-tracking/spec.md`)
ni bil dokončen, ali kjer je uporabnik razrešil odprto vprašanje. Prve tri prevzemajo
predlog, ki ga je vhodni dokument že vseboval.

- **Privzeti način novoustvarjenega profila je `AUTO`** (odločitev uporabnika, 20. 8. 2026).
  Vhodni dokument je kot varnejšo možnost predlagal `REMIND_ONLY`, a je uporabnik zavestno
  izbral `AUTO`, da profil takoj deluje brez dodatnega koraka. Način je kadarkoli
  spremenljiv na ravni profila (FR-005); to ne spremeni obveznih varoval FR-030–FR-035
  (preverjanje pred izvedbo, verifikacija po izvedbi, `dry-run`), ki veljajo ne glede na
  privzeto vrednost.
- **Strpno obdobje pred opozorilom je privzeto 10 minut**, opozorilo se ponovi vsakih 10
  minut, največ trikrat. Vse tri vrednosti so nastavljive na ravni profila.
- **Potrditveno obvestilo ob uspešni samodejni akciji se privzeto pošlje samo za prvo in
  zadnjo akcijo dneva** (npr. prijava na delo in konec dela), ne za vsako akcijo posebej, da
  se prepreči preobilje obvestil. Nastavljivo po vrsti akcije.
- **Zamujena akcija (Story 10) se ob vrnitvi sistema izvede, če je zamuda znotraj
  nastavljene meje (privzeto 90 minut) od načrtovanega časa; sicer se označi `missed`.**
  Prijava na delo ob 14:00 zaradi izpada je slabša od nobene prijave.
- **Profil se ne preklopi samodejno v način opozarjanja po zaporednih neuspehih.** Tri
  zaporedne neuspešne izvedbe sprožijo posebno obvestilo ("preveri profil/sejo"), a način
  ostane, kot ga je nastavil uporabnik — samodejni preklop bi lahko prikril vzrok namesto da
  bi ga razkril.
- **E-pošta kot dodaten kanal obvestil ni del te funkcionalnosti.** Kanal so izključno
  potisna obvestila na registrirane naprave, ki jih je 001 že zgradila; e-pošta bi bila
  ločena, kasnejša razširitev.
- **Sistem ostaja enouporabniški z več napravami** (podedovano iz 001, FR-016/FR-017). Več
  urniških profilov je os znotraj ene osebe (npr. različni urniki za različne tedne), ne
  podpora za več oseb z ločenimi urniki. Prehod na več oseb bi bila migracija podatkov, ne
  vklop nastavitve.
- **Profil ni uporabnik** (že zapisano v 001): zahteva po unikatnosti velja na
  (datum, profil, tip akcije), ne na (datum, tip akcije) — več profilov lahko načeloma
  obstaja za prekrivajoča obdobja, dokler dejansko ne veljata za isti dan (FR-006).
- Privzeti geografski raztros in predloga koordinat za novo lokacijo se prevzameta iz
  obstoječih vrednosti podedovanega sistema, kjer so znane, sicer iz razumnih privzetih
  vrednosti (nekaj deset metrov).
- Posnetki zaslona ob napaki se hranijo v enakem skladišču kot ostali datotečni podatki
  aplikacije; rok hrambe (30 dni) je nastavljiv.

### Dependencies

- **Stran delodajalca** (`nacrt/002-time-tracking/docs/legacy-engine.md` oz.
  `docs/legacy-engine.md` po prevzemu) kot edini vir resnice o razpoložljivih akcijah.
  Naslov je občutljiv podatek in ni bil obiskan med pripravo te specifikacije, da se ne bi
  vplivalo na pravo evidenco (glej Out of Scope).
- **Zunanja storitev za slovenske praznike** za enkratno polnjenje in za primerjalno
  testiranje izračuna; med izvajanjem sistem od nje ni odvisen (odločitev iz raziskave 002).
- **Mehanizem potisnih obvestil iz 001** — ta funkcionalnost ne uvaja novega kanala.
- **Ustava projekta** (`.specify/memory/constitution.md`) — členi III (Idempotency-Key),
  V (determinističen, idempotenten načrtovalnik, `Europe/Ljubljana`), VI (brez
  nepreverjenih samodejnih dejanj), VII (zunanji signal o okvari), IX (jedro testabilno
  brez brskalnika), XI (naprava je odjemalec, ne načrtovalnik) in XII (meje avtomatizacije:
  brez lažnih zapisov, brez prikrivanja, brez obida CAPTCHA/MFA/omejitev hitrosti)
  neposredno omejujejo to funkcionalnost. Kjer si specifikacija in ustava nasprotujeta,
  velja ustava.
