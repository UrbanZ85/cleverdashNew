# Feature Specification: Ogrodje aplikacije in dashboard

**Feature Branch**: `main` — veja ni ustvarjena, ker `before_specify` git hook ni registriran

**Feature Directory**: `specs/001-app-shell-dashboard`

**Created**: 2026-08-19

**Status**: Ready for planning — vsa odprta vprašanja razrešena

**Input**: User description: "Preberi nacrt/001-app-shell-dashboard/spec.md in ustvari specifikacijo."

**Vir**: `nacrt/001-app-shell-dashboard/spec.md`. Številčenje zahtev je namenoma
ohranjeno iz vhodnega dokumenta, da je sledljivost enosmerna in preverljiva.

Prva funkcionalnost. Vzpostavi temelj, na katerega se 002 (beleženje časa) in 003
(kamere) samo priklopita, brez sprememb ogrodja.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Prijava in trajna seja (Priority: P1)

Uporabnik se prijavi z e-pošto in geslom, nato ostane prijavljen. Ko dostopni token
poteče, se seja v ozadju obnovi in uporabnik tega ne opazi. Ko je obnovitev zavrnjena,
ga sistem odjavi in vrne na prijavo.

**Why this priority**: Brez tega ni dosegljiv noben drug zaslon. Je tudi edina zgodba,
ki jo 002 in 003 podedujeta v celoti — pomanjkljivost tukaj se podvoji v vsakem
naslednjem zavihku.

**Independent Test**: Prijava, umetno iztečen dostopni token, preverjena tiha obnova,
preklic obnovitvenega žetona, preverjena odjava — vse na webu in na Androidu. Dostavi
vrednost samo po sebi: zaščiten dostop do aplikacije.

**Acceptance Scenarios**:

1. **Given** veljavni poverilnici, **When** se uporabnik prijavi, **Then** je preusmerjen
   na dashboard in seja je vzpostavljena.
2. **Given** prijavljena seja, **When** dostopni token poteče, **Then** se obnovi v ozadju
   in uporabnik ne vidi prekinitve ne ponovne prijave.
3. **Given** obnovitveni žeton, ki je bil že enkrat porabljen, **When** ga nekdo ponovno
   uporabi, **Then** sistem prekliče celotno družino žetonov te seje in zahteva prijavo.
4. **Given** prijavljena seja na Androidu, **When** se aplikacija ubije in znova zažene,
   **Then** je uporabnik še vedno prijavljen.
5. **Given** začetni uporabnik iz okolja ob prvem zagonu, **When** se prvič prijavi,
   **Then** sistem zahteva zamenjavo gesla, preden dovoli karkoli drugega.

---

### User Story 2 - Hitri pregled vremena in radarja (Priority: P2)

Uporabnik odpre aplikacijo in v nekaj sekundah vidi, ali gre dež: trenutno temperaturo,
stanje neba, veter in animirano radarsko sliko, ki se premika in sama osvežuje.

**Why this priority**: To je razlog, da aplikacija sploh obstaja. P1 je pogoj, P2 je
vrednost.

**Independent Test**: Odpri dashboard s prijavljeno sejo in preveri, da sta obe ploščici
napolnjeni s svežimi podatki, da se radar premika in da se po petih minutah osveži.

**Acceptance Scenarios**:

1. **Given** prijavljen uporabnik, **When** odpre aplikacijo, **Then** vidi trenutno
   temperaturo, stanje neba, veter in vlažnost za nastavljeno lokacijo.
2. **Given** odprt dashboard, **When** mine pet minut, **Then** se radarska slika osveži
   brez posega uporabnika.
3. **Given** odprt dashboard, **When** uporabnik preklopi aplikacijo v ozadje, **Then** se
   samodejno osveževanje ustavi.
4. **Given** katerikoli prikazan podatek ARSO, **When** ga uporabnik pogleda, **Then** sta
   ob njem naveden vir in čas meritve.

---

### User Story 3 - Meni z zavihki (Priority: P3)

Uporabnik se premika med zavihki prek menija, na telefonu pa prek spodnje vrstice, brez
odpiranja menija. Trenutni zavihek je vidno označen.

**Why this priority**: Z enim zavihkom je meni skoraj neviden, a je nosilna konstrukcija
za 002 in 003. Zgraditi ga je treba zdaj, ker ga pozneje ni mogoče vriniti brez posegov.

**Independent Test**: Preveri, da so vsi omogočeni zavihki v meniju, v pravem vrstnem
redu, da je aktivni označen in da spodnja vrstica na ozkem zaslonu vodi na iste poti.

**Acceptance Scenarios**:

1. **Given** register z več omogočenimi zavihki, **When** uporabnik odpre meni, **Then**
   vidi vse omogočene zavihke, urejene po določenem vrstnem redu.
2. **Given** odprt zavihek, **When** uporabnik pogleda meni, **Then** je trenutni zavihek
   vidno označen.
3. **Given** ozek zaslon, **When** uporabnik želi zamenjati zavihek, **Then** to stori iz
   spodnje vrstice, brez odpiranja menija.
4. **Given** zavihek, ki je v registru izklopljen, **When** se meni sestavi, **Then** ga
   ni ne v meniju ne med dosegljivimi potmi.

---

### User Story 4 - Uporabna aplikacija ob izpadu zunanjega vira (Priority: P4)

Ko ARSO ne odgovori, uporabnik vidi zadnji znani podatek z jasno oznako, kdaj je bil
pridobljen. Preostali dashboard deluje normalno.

**Why this priority**: Tuja napaka ne sme pokvariti zaslona. Ločena od P2, ker je
samostojno testabilna in ker je prav ta pot tista, ki v praksi odpove.

**Independent Test**: Blokiraj dostop do zunanjega vira in preveri, da je zaslon še vedno
poln, da je starost podatka vidna in da ni tehničnega sporočila o napaki.

**Acceptance Scenarios**:

1. **Given** vremenski vir ne odgovori, **When** uporabnik odpre dashboard, **Then** vidi
   zadnji znani podatek z vidno oznako starosti.
2. **Given** vir ne odgovori, **When** se zaslon izriše, **Then** ostale ploščice delujejo
   normalno.
3. **Given** napaka zunanjega vira, **When** se prikaže uporabniku, **Then** ni tehničnega
   sporočila, statusne kode ne praznega zaslona.
4. **Given** zadnji znani podatek ne obstaja (prvi zagon ob izpadu), **When** se ploščica
   izriše, **Then** pove, da podatka še ni, in ponudi ponovni poskus.

---

### User Story 5 - Nov zavihek brez posegov v obstoječe (Priority: P5)

Razvijalec doda zavihek z eno novo mapo in enim vnosom v registru. Zavihek se pojavi v
meniju in v usmerjanju, brez sprememb kjerkoli drugje.

**Why this priority**: To je člen I ustave, izražen kot preverljiva zgodba. Nima
neposredne uporabniške vrednosti, ima pa največjo vrednost za vse, kar pride za tem.

**Independent Test**: Dodaj navidezen četrti zavihek, poglej razliko v repozitoriju — poleg
nove mape sme biti spremenjena natanko ena datoteka. Nato zavihek odstrani in preveri, da
preverjanje tipov, lint in testi ostanejo čisti.

**Acceptance Scenarios**:

1. **Given** nov modul zavihka, **When** se doda vnos v register, **Then** se zavihek
   pojavi v meniju in v usmerjanju.
2. **Given** dodan nov zavihek, **When** se pregleda razlika, **Then** razen registra ni
   spremenjena nobena obstoječa datoteka.
3. **Given** dodan zavihek, **When** se njegova mapa in vnos v registru izbrišeta, **Then**
   preverjanje tipov, lint in testi ostanejo čisti.
4. **Given** dva zavihka, **When** se pregleda njuna koda, **Then** se ne kličeta
   neposredno, ampak samo prek skupnih storitev.

---

### User Story 6 - Dashboard, ki sprejme nove ploščice (Priority: P6)

Dashboard je mreža ploščic. Nova vrsta ploščice se doda brez spreminjanja obstoječih.
Vrstni red in vidnost ploščic sta nastavljiva in se ohranita med sejami.

**Why this priority**: Ista logika kot P5, na ravni dashboarda namesto zavihkov. Nižja
prioriteta, ker je začetni nabor ploščic majhen.

**Independent Test**: Dodaj navidezno ploščico, preveri, da se pojavi v mreži brez
sprememb obstoječih; prerazporedi ploščice, odjavi se in znova prijavi, ter preveri, da
je razporeditev ostala.

**Acceptance Scenarios**:

1. **Given** nova vrsta ploščice, **When** se registrira, **Then** se pojavi v mreži brez
   spremembe obstoječih ploščic.
2. **Given** uporabnik prerazporedi ploščice, **When** se znova prijavi, **Then** je
   razporeditev ohranjena.
3. **Given** uporabnik skrije ploščico, **When** se dashboard izriše, **Then** te ploščice
   ni, ostale pa zapolnijo prostor.

---

### User Story 7 - Naprava je pripravljena na obvestila (Priority: P7)

Naprava se registrira za potisna obvestila. Obvestilo, poslano s strežnika, prispe in ob
tapkanju odpre zaslon, na katerega se nanaša.

**Why this priority**: V tej funkcionalnosti nima vsebine — obvestila, ki nekaj povedo,
pridejo z 002. Zgraditi pa jo je treba tukaj, ker je del ogrodja in ker je dovoljenje na
Androidu 13+ enkratna odločitev uporabnika ob prvem zagonu.

**Independent Test**: Registriraj napravo, pošlji testno obvestilo s strežnika, preveri
prihod, tapkanje in odprti zaslon. Nato zavrni žeton na strežniku in preveri, da se
odstrani.

**Acceptance Scenarios**:

1. **Given** prvi zagon na Androidu 13+, **When** aplikacija zaprosi za dovoljenje za
   obvestila, **Then** je ob prošnji razlaga, zakaj je potrebno.
2. **Given** registrirana naprava, **When** strežnik pošlje obvestilo, **Then** to prispe
   na napravo.
3. **Given** prejeto obvestilo, **When** ga uporabnik tapne, **Then** se odpre zaslon, na
   katerega se obvestilo nanaša.
4. **Given** žeton, ki ga ponudnik zavrne kot neveljavnega, **When** pošiljanje spodleti,
   **Then** se žeton samodejno odstrani.
5. **Given** uporabnik zavrne dovoljenje za obvestila, **When** uporablja aplikacijo,
   **Then** vse ostalo deluje normalno.

---

### Edge Cases

- Zunanji vir odgovori uspešno, a s spremenjeno strukturo podatkov — prikaže se zadnji
  znani podatek, ne pa prazna ali napačno razčlenjena ploščica.
- Zunanji vir odgovori počasi (nad nekaj sekundami) — zaslon se izriše z zadnjim znanim
  podatkom in se dopolni, ko odgovor pride.
- Radarska slika bi bila naložena po nešifrirani poti — na šifrirani strani je taka vsebina
  zavrnjena, zato mora pot do slike voditi prek strežnika.
- Uporabnik je na zavihku, ki se medtem v registru izklopi — preusmeri se na dashboard,
  brez napake.
- Naprava je brez omrežja ob zagonu — aplikacija se odpre in pokaže, kaj ve.
- Obnovitveni žeton je preklican, medtem ko je aplikacija v ozadju — ob vrnitvi v ospredje
  se pokaže prijava, brez izgube nedokončanega vnosa.
- Ura naprave je zamaknjena glede na strežnik — prikazana starost podatka se računa po
  strežniškem času, ne po napravinem.
- Prehod na poletni oz. zimski čas — prikazani časi meritev ostanejo pravilni.
- Več hkratnih sej iste osebe na več napravah — odjava na eni ne odjavi ostalih, razen ob
  zaznani zlorabi žetona.
- Zaporedni neuspeli poskusi prijave — omejeni po hitrosti in zabeleženi.

## Requirements *(mandatory)*

### Functional Requirements

#### Ogrodje

- **FR-001**: Aplikacija in API MORATA biti na istem izvoru; frontend uporablja izključno
  relativne poti. Edina izjema je nativni Android build z nastavljivim naslovom strežnika.
- **FR-002**: Meni se MORA sestaviti iz deklarativnega registra zavihkov. Vnos zavihka
  vsebuje ime, ikono, pot, vrstni red, zahtevane obsege in stikalo za vklop.
- **FR-003**: Zavihek MORA biti mogoče izklopiti brez nove izdaje aplikacije.
- **FR-004**: Na ozkem zaslonu MORA biti poleg menija na voljo spodnja vrstica zavihkov.
- **FR-005**: Ista koda MORA delovati kot spletna aplikacija, ki se namesti na napravo, in
  kot nativna aplikacija za Android.
- **FR-006**: Aplikacija MORA podpirati svetlo in temno temo, privzeto po nastavitvi
  sistema.

#### Avtentikacija

- **FR-010**: Prijava poteka z e-pošto in geslom. Geslo se shrani izključno kot soljen
  zgoščen zapis s funkcijo, namenjeno geslom; čistopis se nikoli ne shrani ali zabeleži.
- **FR-011**: Dostopni token velja kratko (15 minut). Obnovitveni žeton je shranjen na
  strežniku in se ob vsaki uporabi zavrti.
- **FR-012**: Zaznana ponovna uporaba že porabljenega obnovitvenega žetona MORA preklicati
  celotno družino žetonov te seje.
- **FR-013**: Avtorizacija temelji na obsegih. Veljaven token sam po sebi NE pomeni
  administratorskih pravic.
- **FR-014**: Ob prvem zagonu se ustvari začetni uporabnik iz okolja. Sistem MORA zahtevati
  zamenjavo gesla pred prvo uporabo.
- **FR-015**: Neuspeli poskusi prijave so omejeni po hitrosti in zabeleženi.
- **FR-016**: Sistem služi eni osebi z več napravami. Zapisi NE nosijo oznake lastnika,
  upravljanja uporabnikov ni in nastavitve so globalne. Obsegi iz FR-013 ločujejo človeka
  od avtomatizacije, ne uporabnika od uporabnika.
- **FR-017**: Več hkratnih sej iste osebe na različnih napravah MORA biti podprtih. Vsaka
  naprava ima svojo družino sej; odjava na eni ne odjavi ostalih, razen ob zaznani zlorabi
  žetona (FR-012).

#### Dashboard

- **FR-020**: Dashboard je mreža ploščic. Vrsta ploščice je vtičnik; dodajanje nove NE SME
  zahtevati sprememb obstoječih.
- **FR-021**: Ploščica z animirano radarsko sliko padavin je na začetnem zaslonu in
  prikazuje premikajočo se sliko.
- **FR-022**: Radarska slika se osvežuje na 5 minut, dokler je zaslon v ospredju; ko ni,
  se osveževanje ustavi.
- **FR-023**: Vremenska ploščica prikazuje trenutno temperaturo, stanje neba, veter,
  vlažnost in čas meritve za nastavljeno lokacijo.
- **FR-024**: Ploščica s kratko napovedjo prikazuje naslednjih nekaj ur oziroma dni.
- **FR-025**: Zunanji podatki se pridobivajo prek strežnika, ne neposredno iz odjemalca.
  Strežnik predpomni odgovore: radar 5 minut, vreme 10 minut.
- **FR-026**: Ob nedosegljivosti vira se prikaže zadnji znani podatek z oznako starosti.
  Prazen zaslon ali tehnično sporočilo o napaki NISTA sprejemljiva.
- **FR-027**: Ob vsakem prikazanem podatku ARSO MORA biti viden vir s povezavo na
  `https://meteo.arso.gov.si`.
- **FR-028**: Vrstni red in vidnost ploščic sta nastavljiva in se ohranita med sejami.

#### Obvestila (temelj za 002)

- **FR-030**: Aplikacija registrira napravo za potisna obvestila in žeton pošlje strežniku.
- **FR-031**: Na Androidu 13+ se za dovoljenje za obvestila vpraša ob prvem zagonu, z
  razlago, zakaj je potrebno.
- **FR-032**: Kanali za obvestila so ločeni po vrsti, da jih je mogoče ugašati posamično.
- **FR-033**: Tapkanje na obvestilo odpre zaslon, na katerega se obvestilo nanaša.
- **FR-034**: Žetoni, ki jih ponudnik zavrne, se samodejno odstranijo.

#### Postavitev in obratovanje

- **FR-040**: Iz čiste kopije repozitorija MORA biti sistem zagonljiv brez ročnih korakov
  razen izpolnjenega opisa okolja.
- **FR-041**: Šifrirana povezava se pridobi in obnavlja samodejno.
- **FR-042**: Vsi izvajalni deli sistema tečejo v časovnem pasu `Europe/Ljubljana`.
- **FR-043**: Vsak del sistema ima zdravstveni pregled in politiko samodejnega ponovnega
  zagona.
- **FR-044**: V repozitoriju NE SME biti nobene prave skrivnosti; samo opis okolja s
  praznimi vrednostmi.

### Key Entities

- **Uporabnik**: edina oseba, ki se prijavi. Nosi e-pošto, zgoščeno geslo, obsege pravic,
  oznako "zahtevana zamenjava gesla" in čas zadnje prijave. Ker je uporabnik en, ostale
  entitete nanj ne kažejo.
- **Družina sej**: veriga obnovitvenih žetonov ene prijave na eni napravi. Nosi stanje
  (aktivna, zavrtena, preklicana) in omogoča preklic vseh naenkrat ob zaznani zlorabi.
- **Vnos v registru zavihkov**: ime, ikona, pot, vrstni red, zahtevani obsegi, stikalo za
  vklop. Edina točka, ki jo dodajanje zavihka spremeni.
- **Ploščica in razporeditev**: vrsta ploščice, njena nastavitev, položaj v mreži in
  vidnost. Razporeditev je trajna med sejami.
- **Predpomnjen zunanji odčitek**: zadnji uspešno pridobljen podatek vira, s časom
  pridobitve in oznako vira. Je tudi vsebina, ki se prikaže ob izpadu.
- **Naprava za obvestila**: žeton, vrsta naprave, kanali in čas zadnje uspešne dostave.
- **Nastavitve**: izbrana lokacija za vreme, tema, razporeditev ploščic.

## Out of Scope

- Zavihka kamere (003) in beleženje časa (002). Ogrodje ju MORA sprejeti brez sprememb.
- Zapiski, povezave in zvočni zapiski iz starega CleverDasha. Pridejo pozneje; register
  zavihkov jih mora sprejeti brez sprememb.
- Podrobna vremenska napoved po dnevih z grafi. Zahteva je hitri pregled, ne vremenska
  aplikacija.
- Samopostrežna registracija novih uporabnikov, pozabljeno geslo po e-pošti in prijava prek
  zunanjih ponudnikov identitete.
- Upravljanje uporabnikov, vabila in deljenje podatkov med osebami. Sistem je enouporabniški
  (FR-016); več oseb ni omejitev, ki bi jo bilo treba obiti, ampak zahteva, ki ne obstaja.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Od odprtja aplikacije do vidnega vremena in premikajoče se radarske slike
  mine manj kot 3 sekunde pri običajni povezavi.
- **SC-002**: Dokler je zaslon v ospredju, prikazana radarska slika ni nikoli starejša od
  5 minut, vremenski podatek pa ne od 10 minut.
- **SC-003**: Ob popolni nedosegljivosti zunanjega vira je delež odprtij, ki pokažejo
  prazen zaslon ali tehnično napako, enak nič; v 100 % primerov je viden zadnji znani
  podatek z oznako starosti.
- **SC-004**: Uporabnik, ki aplikacijo uporablja vsaj enkrat tedensko, gesla ne vpisuje
  več kot enkrat na 30 dni.
- **SC-005**: Dodajanje novega zavihka spremeni natanko eno obstoječo datoteko (register);
  merljivo z razliko v repozitoriju.
- **SC-006**: Obvestilo, poslano s strežnika, prispe na napravo v manj kot 10 sekundah in
  ob tapkanju odpre pravi zaslon v 100 % poskusov.
- **SC-007**: Postavitev iz čiste kopije do delujočega sistema traja manj kot 15 minut in
  ne zahteva nobenega ročnega koraka razen izpolnitve opisa okolja.
- **SC-008**: Število pravih skrivnosti v repozitoriju je nič, preverjeno z avtomatskim
  pregledom pred vsako združitvijo sprememb.
- **SC-009**: Vsi prikazani podatki ARSO nosijo vidno navedbo vira; delež ploščic brez
  navedbe je nič.

## Assumptions

Vse spodnje so privzete odločitve, sprejete tam, kjer vhodni dokument ni bil dokončen.
Prve tri so predlogi iz `nacrt/001-app-shell-dashboard/spec.md`, ki jih ta specifikacija
sprejme kot odločene.

- **Privzeta lokacija za vreme je Ljubljana** (46.0629, 14.5602), z možnostjo izbire; druga
  znana lokacija iz starega sistema je 45.9611, 14.2978.
- **Dashboard je začetni zaslon nad zavihki**, dosegljiv prek logotipa; zavihki stojijo
  poleg njega, ne pod njim.
- **V tej fazi obstajata samo ploščici vreme in radar**, poleg njiju pa prazna mreža, ki
  sprejme nove ploščice brez sprememb.
- Kratka napoved (FR-024) uporablja isti vir in isti predpomnilnik kot trenutno vreme,
  zato ne dodaja novega zunanjega odvisnostnega vira.
- Uporabnik ima večino časa delujočo povezavo; delo brez povezave je omejeno na prikaz
  zadnjega znanega stanja, ne na polno uporabo.
- Navedba vira ARSO je pravna zahteva, ne vljudnost, in zato šteje kot funkcionalna
  zahteva (FR-027), ne kot oblikovna podrobnost.
- **Sistem je enouporabniški** (FR-016, odločeno 19. 8. 2026). Zapisi ne nosijo lastnika.
  Ta odločitev se prenese na 002 in 003, zato je zapisana tukaj, ne v vsaki funkcionalnosti
  posebej. Prehod na več oseb bi bil kasneje migracija podatkov, ne vklop zaslona — to je
  zavestno sprejeta cena.
- **Profil ni uporabnik.** Beleženje časa (002) ima več profilov za isto osebo. To je druga
  os kot uporabniki in enouporabniškost je ne odpravi; zahteva po unikatnosti na
  (datum, profil, tip akcije) iz člena V.3 ustave velja naprej.

### Dependencies

- **ARSO** kot zunanji vir vremena in radarske slike. Preverjeno 19. 8. 2026: JSON vir za
  vreme, animirana radarska slika (~101 kB, `max-age=300`) in besedilni rezervni viri
  odgovarjajo. Naslova `si43-rm-anim.gif` in `fcast_si_latest.xml` vračata 404 in se ne
  uporabljata. JSON je primarni vir, besedilni je rezerva.
- **Ponudnik potisnih obvestil** za dostavo obvestil na Android. Ključ dostopa je datoteka
  izven repozitorija, montirana ob zagonu (člen IV ustave).
- **Ustava projekta** (`.specify/memory/constitution.md`) — členi I, II, IV, VII in VIII
  neposredno omejujejo to funkcionalnost. Kjer si specifikacija in ustava nasprotujeta,
  velja ustava.
