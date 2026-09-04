# Feature Specification: Opravila

**Vhodno gradivo**: pogovor z naročnikom (brez datoteke v `nacrt/`; odločitve so zapisane v razdelku Assumptions)
**Datum**: 2026-09-03
**Stanje**: Draft

## Zakaj

Zahteva je bila kratka: *"Še en novi modul bi naredil. Bo pa kot novi vidget na dashboardu.
ter tudi nova stran in sicer. To do list… Bo šlo pa tudi da lahko deliš z drugim uporabniki.
[…] in bodo checkboxi in ko pritisneš na checkbox se ti prečrta ta task. […] tam je pa več
teh todolistov. na vidgetu bo pa viden zadnji kateri je bil spremenjen, ter tudi opcija
[izbiranja] drugih, oz lahko zakleneš nekega […] na tisti strani kjer bo za urejanje."*,
dopolnjena z *"narediva plan. in bolj user friendly"* in — na vprašanje o krogu ljudi —
*"uporabniki so samo tisti kateri so v keycloaku"*.

Za tem stoji vsakdanja stvar: nakupovalni seznam in seznam opravil sta koristna šele, kadar
ju vidi več kot en človek. Kdor je v trgovini, mora videti, kaj je še treba kupiti, in kar
odkljuka, mora izginiti tudi drugemu — sicer se mleko kupi dvakrat. Tega en sam osebni
seznam ne zna.

Ta modul zato prvič uvede v CleverDash **zapis, ki ga vidi več kot en prijavljen uporabnik**.
Doslej je bil vsak domenski zapis strogo osebni: nosil je `userId`, ta je bil prvi člen vsakega
indeksa, in tuj zapis je vrnil 404. Modul 009 sicer "deli", a z **zunanjim človekom brez
računa** (naslov in geslo) in njegov spec deljenje med računi CleverDasha izrecno navaja kot
`Out of Scope` — to je torej druga funkcionalnost, ne nadaljevanje iste.

Osrednje tveganje te funkcionalnosti zato ni vmesnik, ampak **dostop**: tri stopnje pravic,
zaklep in vprašanje, kdaj je pravi odgovor 404 in kdaj 403. Drugo tveganje je **sočasnost**:
dva človeka, ki v isti sekundi odkljukata dve različni stvari na istem seznamu, morata oba
uspeti. Nobeno od obojega ni postranska podrobnost.

Najbližji sorodnik po razporeditvi kode je modul beležk (007): oseben zapis, lasten zavihek,
hitri vnos, tuj zapis vrne 404. Od njega se loči v dvojem: zapis ima soudeležence, in del
stanja spreminja nekdo drug, medtem ko ga gledaš.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Naredim seznam in ga odkljukavam (Priority: P1) 🎯 MVP

Odprem zavihek Opravila, naredim nov seznam ("Nakup"), in vanj nasujem stvari: napišem
besedilo, pritisnem Enter, polje ostane prazno in v fokusu, napišem naslednjo. Ko stvar
opravim, kliknem checkbox — prečrta se in pade pod črto med opravljena. Ko sem končal,
opravljena z enim gumbom počistim.

**Zakaj ta prednost**: to je funkcionalnost sama. Brez deljenja je še vedno uporaben osebni
seznam opravil; brez tega ni ničesar, kar bi se dalo deliti.

**Neodvisen test**: en prijavljen uporabnik, brez drugega uporabnika in brez nadzorne plošče —
naredi seznam, doda deset opravil, tri odkljuka, počisti opravljena.

**Sprejemni scenariji**

1. **Ko** v prazen zavihek prvič pridem, **potem** vidim pojasnilo, kaj zavihek je, in gumb za
   prvi seznam — ne prazne strani.
2. **Ko** v vnosno polje napišem besedilo in pritisnem Enter, **potem** se opravilo pojavi na
   koncu neodkljukanih, polje se izprazni in **ostane v fokusu**, da lahko takoj napišem
   naslednje.
3. **Ko** kliknem checkbox, **potem** se opravilo prečrta in se premakne pod neodkljukana,
   nazadnje odkljukano na vrhu te skupine.
4. **Ko** kliknem checkbox že odkljukanega opravila, **potem** se vrne med neodkljukana, na
   svoje prejšnje mesto v vrstnem redu.
5. **Ko** pritisnem "Počisti opravljene", **potem** me sistem vpraša za potrditev in po njej
   odstrani vsa odkljukana — neodkljukanih se ne dotakne.
6. **Ko** prilepim besedilo z več vrsticami, **potem** nastane po eno opravilo na vrstico, ne
   eno opravilo s prelomi.
7. **Ko** imam več seznamov, **potem** so v vodoravni vrstici na vrhu z napredkom (`3/7`) in
   klik na ime preklopi prikazana opravila brez odhoda s strani.
8. **Ko** poskusim shraniti opravilo s praznim besedilom, **potem** je zavrnjeno in nič ne
   nastane.

---

### User Story 2 - Seznam vidim na nadzorni plošči (Priority: P1)

Na nadzorno ploščo dodam ploščico Opravila. Kaže mi seznam, ki je bil nazadnje spremenjen, in
checkboxi na njej delujejo — mleka mi ni treba odkljukati na drugi strani. Če hočem, da
ploščica vedno kaže isti seznam, ga v njeni glavi pripnem.

**Zakaj ta prednost**: zahteva ploščico imenuje v prvem stavku. Skupaj z US1 je to najmanjša
cela stvar, ki jo je vredno uporabljati.

**Neodvisen test**: en uporabnik z dvema seznamoma — ploščica sledi zadnji spremembi, po
pripenjanju pa ostane na pripetem, tudi ko se spremeni drug seznam.

**Sprejemni scenariji**

1. **Ko** imam vsaj en seznam in ploščico dodam, **potem** kaže nazadnje spremenjen seznam,
   njegov napredek in do šest neodkljukanih opravil.
2. **Ko** na ploščici kliknem checkbox, **potem** se opravilo odkljuka in to velja povsod —
   isto stanje vidim na zavihku brez osveževanja.
3. **Ko** v glavi ploščice izberem določen seznam, **potem** ploščica ostane na njem tudi
   potem, ko se spremeni kak drug seznam.
4. **Ko** je pripeti seznam izbrisan ali mi je bil odvzet, **potem** ploščica pade nazaj na
   nazadnje spremenjen seznam in to pokaže — **NE SME** prikazati napake in **NE SME** podreti
   nadzorne plošče.
5. **Ko** nimam še nobenega seznama, **potem** ploščica pokaže prazno stanje z gumbom, ki
   pelje na zavihek.
6. **Ko** kliknem naslov ploščice, **potem** me odpre zavihek s **tem** seznamom izbranim.

---

### User Story 3 - Delim seznam s sodelavcem (Priority: P2)

Nakupovalni seznam delim s partnerjem, delovni s sodelavcem. Pri vsakem izberem, koliko sme:
samo gledati, samo odkljukavati, ali tudi dodajati in brisati. Sodelavec seznam vidi med
svojimi in kar odkljuka, vidim jaz.

**Zakaj ta prednost**: to je razlog za funkcionalnost, a stoji na US1. Sam je popolnoma
neuporaben, z US1 pa je preverljiv v celoti.

**Neodvisen test**: dva prijavljena uporabnika, en seznam — vsaka od treh vlog sme točno svoje
in nič več, tretji uporabnik seznama ne najde.

**Sprejemni scenariji**

1. **Ko** kot lastnik odprem deljenje, **potem** izbiram iz seznama uporabnikov, ki so se v
   CleverDash že kdaj prijavili, in vsakemu določim eno od treh stopenj.
2. **Ko** seznam nekomu delim, **potem** se mu pojavi med njegovimi seznami in je do prvega
   odprtja označen kot nov.
3. **Ko** ima soudeleženec stopnjo "ogled", **potem** opravil ne more odkljukati, dodati,
   urediti ne izbrisati, in vmesnik teh gumbov ne ponuja.
4. **Ko** ima stopnjo "odkljukavanje", **potem** sme odkljukati in odkljukano vrniti, **ne
   sme** pa dodajati, urejati, brisati ne preurejati.
5. **Ko** ima stopnjo "urejanje", **potem** sme vse z opravili, **ne sme** pa izbrisati
   seznama, ga preimenovati, zakleniti ne spremeniti, komu je deljen.
6. **Ko** soudeležencu dostop odvzamem, **potem** seznam iz njegovega prikaza izgine in
   njegova naslednja zahteva zanj se obravnava, kot da seznam ne obstaja.
7. **Ko** soudeleženec seznam sam zapusti, **potem** to sme tudi takrat, kadar je seznam
   zaklenjen — zaklep omejuje spremembe **v** seznamu, ne pripadnosti tujim podatkom.
8. **Ko** uporabnik, ki ni ne lastnik ne soudeleženec, poskusi seznam odpreti, **potem** dobi
   odgovor, iz katerega ni razvidno, da seznam obstaja.
9. **Ko** dva soudeleženca v isti sekundi odkljukata **različni** opravili istega seznama,
   **potem** obe spremembi obstaneta — nobena se ne izgubi.

---

### User Story 4 - Zaklenem seznam (Priority: P2)

Seznam je dogovorjen in ne želim več sprememb. Zaklenem ga: soudeleženci ga še vidijo, a ne
morejo ničesar spremeniti, niti odkljukati. Jaz kot lastnik urejam dalje.

**Zakaj ta prednost**: zahteva zaklep imenuje izrecno. Stoji na US3 — brez soudeležencev
zaklep ne pomeni ničesar.

**Neodvisen test**: lastnik in soudeleženec s stopnjo "urejanje" — po zaklepu soudeležencu vse
mutacije spodletijo z jasnim sporočilom, lastniku vse uspejo.

**Sprejemni scenariji**

1. **Ko** kot lastnik seznam zaklenem, **potem** je zaklep viden na čipu seznama in v njegovi
   glavi, tudi soudeležencem.
2. **Ko** soudeleženec na zaklenjenem seznamu klikne checkbox, **potem** sprememba ne obvelja
   in dobi sporočilo, da je seznam zaklenil lastnik — **NE SME** se tiho vrniti v prejšnje
   stanje brez pojasnila.
3. **Ko** je seznam zaklenjen, **potem** lastnik še vedno sme dodajati, odkljukavati, urejati,
   brisati in preurejati.
4. **Ko** seznam odklenem, **potem** soudeleženci spet smejo natanko to, kar jim dovoljuje
   njihova stopnja — zaklep ničesar ne spremeni trajno.
5. **Ko** je seznam zaklenjen, **potem** ga lastnik še vedno sme izbrisati in spremeniti
   deljenje — zaklep je omejitev za soudeležence, ne za lastnika.

---

### User Story 5 - Opravilu dam rok (Priority: P3)

Nekatera opravila niso "kdaj že" — "pokliči serviserja" ima rok. Opravilu dodam datum in
zapadla opravila vidim takoj, tudi na zavihku v meniju.

**Zakaj ta prednost**: koristno, a večina opravil roka ne bo imela nikoli. Zato **ni** v
vnosnem polju in ne sme upočasniti hitrega vnosa.

**Neodvisen test**: en uporabnik, en seznam — opravilo z rokom v preteklosti je označeno kot
zapadlo, opravilo z rokom danes kot današnje, opravilo brez roka je nespremenjeno.

**Sprejemni scenariji**

1. **Ko** opravilo odprem, **potem** mu lahko dodam ali odvzamem rok; hitri vnos na vrhu roka
   ne zahteva in ne ponuja.
2. **Ko** ima opravilo rok v preteklosti, **potem** je označeno kot zapadlo in razlikovano od
   opravila z rokom danes.
3. **Ko** je rok danes, **potem** opravilo ni zapadlo do konca dneva, ne od polnoči naprej.
4. **Ko** je rok na dan prehoda na poletni ali zimski čas, **potem** je koledarski dan
   izračunan pravilno — opravilo se **NE SME** prikazati kot zapadlo dan prezgodaj ali
   prepozno.
5. **Ko** je opravilo z rokom odkljukano, **potem** se med zapadla ne šteje več.

---

### User Story 6 - Postavim opravila v svoj vrstni red (Priority: P3)

Vrstni red, v katerem sem opravila napisal, ni vrstni red, v katerem jih bom opravil. Premikam
jih gor in dol.

**Zakaj ta prednost**: pri nakupovalnem seznamu, urejenem po poti skozi trgovino, je to
razlika med uporabnim in ne. A seznam deluje tudi brez tega.

**Neodvisen test**: en uporabnik, en seznam s petimi opravili — vrstni red se po premikanju
ohrani tudi po osvežitvi strani.

**Sprejemni scenariji**

1. **Ko** opravilo premaknem gor ali dol, **potem** nov vrstni red obvelja takoj in preživi
   osvežitev.
2. **Ko** je opravilo prvo, **potem** premika navzgor ni mogoče izbrati.
3. **Ko** preurejam, **potem** se odkljukanih opravil to ne dotakne — ta so vedno pod črto.
4. **Ko** nekdo drug med mojim preurejanjem doda opravilo, **potem** se to ne izgubi in ne
   podvoji.

---

### User Story 7 - Opravilo dodam brez vmesnika (Priority: P4)

n8n ob prejeti e-pošti doda opravilo na moj seznam. Pojavi se enako, kot bi ga napisal sam.

**Zakaj ta prednost**: člen III zahteva, da vsaka funkcija obstaja kot endpoint, preden
obstaja kot zaslon; ta zgodba to naredi preverljivo. Zadnja po prednosti, ker je vse, kar
potrebuje, že narejeno za prejšnje zgodbe.

**Neodvisen test**: klic z API ključem z ustreznim obsegom doda opravilo; klic brez obsega je
zavrnjen; ponovljen klic z istim `Idempotency-Key` opravila ne podvoji.

**Sprejemni scenariji**

1. **Ko** pošljem klic z obsegom za pisanje, **potem** opravilo nastane in je vidno v vmesniku.
2. **Ko** isti klic ponovim z istim `Idempotency-Key`, **potem** dobim prvotni odgovor in
   opravilo **NE** nastane dvakrat.
3. **Ko** klic ponovim po časovni omejitvi in gre za brisanje, **potem** dobim prvotni uspešen
   odgovor, ne napake "ne obstaja".
4. **Ko** je API ključ brez obsega za deljenje, **potem** seznama ne more nikomur deliti,
   čeprav sme dodajati opravila.

---

### Edge Cases

- **Nečlan odpre povezavo do tujega seznama** → odgovor je enak, kot da seznam ne obstaja;
  obstoj tujega zapisa ni podatek, ki bi ga kdo smel prebrati.
- **Član s premajhno stopnjo poskusi dejanje** → izve, da pravice nima; skrivanje obstoja
  seznama, ki ga ima v svojem prikazu, bi popravljivo pomanjkanje pravice spremenilo v videz
  okvare.
- **Zaklenjen seznam** → član izve, da je seznam zaklenjen, in to je **drugo** stanje od
  "nimaš pravice": prvo lastnik odklene z enim klikom, drugo ne mine samo.
- **Lastniku se med urejanjem odvzame članstvo** (ali seznam izbriše) → naslednja sprememba ne
  obvelja in uporabnik dobi natančen razlog, nikoli notranje napake.
- **Dva človeka odkljukata isto opravilo hkrati** → obvelja zadnji zapis; pri logični vrednosti
  je to pravilen in pričakovan izid za skupen seznam.
- **Dva človeka odkljukata različni opravili hkrati** → obe spremembi obstaneta. To je
  zahteva, ne slučaj.
- **Preurejanje sredi tujega dodajanja** → novo opravilo se ne izgubi in ne podvoji; vrstni red
  je namig, ne enolični ključ.
- **Prilepljeno besedilo z 200 vrsticami** → zavrnjeno s sporočilom o meji, ali pa sprejeto do
  meje; nikoli tiho obrezano.
- **Seznam doseže zgornjo mejo opravil** → uporabnik izve, kolikšna je meja in kaj lahko stori;
  to je stanje seznama, ne napaka zahteve.
- **Opravilo z rokom 29. 3. ali 25. 10.** (dneva, dolga 23 in 25 ur) → koledarski dan pravilen.
- **Uporabnik, ki je v Keycloaku, a se v CleverDash še ni prijavil** → v izbirniku ga ni;
  pojavi se takoj po svoji prvi prijavi.
- **Dva uporabnika z istim imenom** → v izbirniku ju je mogoče razločiti.
- **Lastnik se poskusi dodati med soudeležence** → zavrnjeno; lastništvo ni ena od stopenj.
- **Izbris seznama** → odstrani tudi vsa članstva; soudeležencem seznam izgine.
- **Izklop zavihka v nastavitvah** → je nastavitev prikaza, ne stikalo za podatke: seznami
  ostanejo in ostanejo deljeni.

## Requirements *(mandatory)*

### Functional Requirements

#### Seznami

- **FR-001**: Uporabnik lahko ustvari poljubno mnogo seznamov opravil, do nastavljive zgornje
  meje na uporabnika.
- **FR-002**: Vsak seznam ima ime in natanko enega lastnika. Lastnik je tisti, ki ga je
  ustvaril, in se **NE** prenaša.
- **FR-003**: Lastnik lahko seznam preimenuje in izbriše. Izbris odstrani opravila **IN** vsa
  članstva.
- **FR-004**: Seznam je viden IZKLJUČNO svojemu lastniku in svojim soudeležencem. Poizvedba
  seznama, ki ni ne moj ne deljen z mano, se obravnava tako, kot da seznam ne obstaja.
- **FR-005**: Seznami so uporabniku prikazani v enem prikazu skupaj — lastni in deljeni brez
  ločnice, ker je razlika v pravicah, ne v tem, kje seznam živi.
- **FR-006**: Pri vsakem seznamu sta vidna napredek (koliko opravljenih od koliko) in kdaj ter
  **kdo** ga je nazadnje spremenil.
- **FR-007**: Seznam, ki je bil pravkar deljen z mano, je do prvega odprtja označen kot nov.
- **FR-008**: Ime seznama je omejeno po dolžini; presežek je zavrnjen s sporočilom, nikoli tiho
  obrezan.

#### Opravila

- **FR-010**: Opravilo ima besedilo in stanje (opravljeno / neopravljeno). Vse ostalo je
  neobvezno.
- **FR-011**: Vnos opravila je ENO polje: besedilo, potrditev, in polje je pripravljeno za
  naslednje opravilo **brez ponovnega klika**. Rok in drugih polj vnosno polje NE ponuja.
- **FR-012**: Besedilo opravila se pred shranjevanjem očisti: obrežejo se robni presledki,
  zlijejo notranji **vključno s prelomi vrstic**, odstranijo krmilni znaki.
- **FR-013**: Prilepljeno večvrstično besedilo ustvari po ENO opravilo na vrstico, ne enega z
  prelomi.
- **FR-014**: Opravilo s praznim besedilom (tudi po čiščenju) je zavrnjeno in ne nastane.
- **FR-015**: Besedilo opravila je omejeno po dolžini; presežek je zavrnjen s sporočilom.
- **FR-016**: Število opravil na seznamu je omejeno. Ob doseženi meji uporabnik izve, kolikšna
  je in kaj lahko stori; meja se uveljavi tako, da je hkratno dodajanje ne more preseči.
- **FR-017**: Opravilo je mogoče urediti in izbrisati posamično.
- **FR-018**: Uporabnik lahko z enim dejanjem odstrani vsa odkljukana opravila seznama.
  Neodkljukanih se to dejanje **NE SME** dotakniti, in izbor se opravi ob zapisu, ne iz
  starejšega prikaza — kar je kdo medtem odkljukal, se odstrani z ostalimi.

#### Odkljukavanje in razvrstitev

- **FR-020**: Klik na checkbox preklopi stanje opravila. Odkljukano opravilo je prečrtano in
  vidno zbledelo.
- **FR-021**: Odkljukana opravila so prikazana **pod** neodkljukanimi, ločena z vidno mejo.
- **FR-022**: Med odkljukanimi je nazadnje odkljukano na vrhu.
- **FR-023**: Odkljukanje je mogoče vrniti; opravilo se vrne med neodkljukana na svoje mesto v
  ročnem vrstnem redu.
- **FR-024**: Pri deljenem seznamu je vidno, **kdo** je opravilo odkljukal.
- **FR-025**: Neodkljukana opravila je mogoče ročno premikati gor in dol; vrstni red je osebi
  neodvisen od časa nastanka in preživi osvežitev.
- **FR-026**: Vrstni red je namig za razvrščanje in **NE** enolični ključ: dve hkratni
  spremembi, ki privedeta do enakega položaja, **NE SMETA** povzročiti napake, prikazani
  vrstni red pa mora ostati stabilen med izrisi.
- **FR-027**: Odkljukavanje in preurejanje **MORATA** biti izvedljiva tako, da hkratni
  spremembi dveh **različnih** opravil istega seznama obe obstaneta.

#### Rok

- **FR-030**: Opravilo ima lahko rok — koledarski dan, ne ura. Odsotnost roka pomeni **brez
  roka**, ne "danes".
- **FR-031**: Vsi časi se obravnavajo v coni `Europe/Ljubljana` (člen V.4). Koledarski dan se
  **NE SME** izpeljati iz zapisa UTC brez upoštevanja cone.
- **FR-032**: Opravilo z rokom danes ni zapadlo do konca tega dneva v ljubljanski coni.
- **FR-033**: Zapadla opravila so v prikazu razlikovana od današnjih in prihodnjih.
- **FR-034**: Odkljukano opravilo se med zapadla ne šteje.
- **FR-035**: Rok na dan prehoda na poletni ali zimski čas se **MORA** izračunati pravilno.

#### Deljenje in pravice

- **FR-040**: Lastnik lahko seznam deli z drugimi uporabniki CleverDasha. Krog je omejen na
  uporabnike, ki so se **že vsaj enkrat prijavili**.
- **FR-041**: Soudeleženec ima natanko eno od treh stopenj: **ogled**, **odkljukavanje**,
  **urejanje**.
- **FR-042**: **Ogled**: sme brati. Ne sme odkljukati, dodajati, urejati, brisati ne
  preurejati.
- **FR-043**: **Odkljukavanje**: sme brati in preklapljati stanje opravil. Ne sme dodajati,
  urejati, brisati ne preurejati.
- **FR-044**: **Urejanje**: sme vse z opravili — dodajati, urejati, brisati, preurejati,
  odkljukavati in čistiti opravljena.
- **FR-045**: IZKLJUČNO lastnik sme: izbrisati seznam, ga preimenovati, zakleniti ali odkleniti
  in spremeniti, komu je deljen. Nobena stopnja tega ne podeli.
- **FR-046**: Lastnik lahko stopnjo soudeleženca spremeni ali dostop odvzame. Odvzem učinkuje
  na naslednjo zahtevo.
- **FR-047**: Soudeleženec lahko seznam **sam zapusti**, tudi kadar je zaklenjen. Lastnik
  seznama ne more zapustiti — lahko ga samo izbriše.
- **FR-048**: Lastnika ni mogoče dodati med soudeležence, in isti uporabnik ne more nastopiti
  med soudeleženci dvakrat.
- **FR-049**: Število soudeležencev na seznamu je omejeno.
- **FR-050**: Poizvedba seznama, do katerega uporabnik ni ne lastnik ne soudeleženec, **NE SME**
  razkriti, da seznam obstaja.
- **FR-051**: Dejanje, ki ga soudeleženec sme videti a ne izvesti, mu **MORA** povedati, da
  pravice nima — prikrivanje obstoja seznama, ki ga ima v svojem prikazu, je zavajanje, ne
  varnost.
- **FR-052**: Deljenje in odvzem dostopa se zabeležita v strukturiran dnevnik (čas, seznam,
  kdo, komu, stopnja). Zapis **NE SME** vsebovati vsebine opravil.

#### Zaklep

- **FR-060**: Lastnik lahko seznam zaklene in odklene. Zaklep je lastnost **seznama**, ne
  uporabnika, in se nastavlja tam, kjer se seznam ureja — **NE** v splošnih nastavitvah.
- **FR-061**: Na zaklenjenem seznamu soudeleženec ne sme spremeniti **NIČESAR**, niti
  odkljukati, ne glede na svojo stopnjo.
- **FR-062**: Lastnik na zaklenjenem seznamu sme vse, kar sme sicer.
- **FR-063**: Zaklep je stanje in **MORA** biti od pomanjkanja pravice razločljiv: uporabnik
  mora izvedeti, da je seznam zaklenil lastnik, in vmesnik se mora na to odzvati drugače kot na
  trajno pomanjkanje pravice.
- **FR-064**: Odklep povrne natanko prejšnje pravice. Zaklep ne spremeni ničesar trajno.

#### Imenik uporabnikov

- **FR-070**: Sistem ponuja seznam uporabnikov, primernih za deljenje. Vsebuje IZKLJUČNO tiste,
  ki so se že vsaj enkrat prijavili — ponuditi človeka, ki se ne more prijaviti, je obljuba, ki
  je ni mogoče izpolniti.
- **FR-071**: Vnos v imeniku vsebuje ime za prikaz in dovolj podatka, da je mogoče razločiti dva
  soimenjaka.
- **FR-072**: E-pošta se v imeniku prikaže IZKLJUČNO **zamaskirana**. Cel naslov se **NE SME**
  vrniti: razločevanje soimenjakov ne potrebuje celega naslova, izročitev celega bi pa vsakemu
  prijavljenemu uporabniku dala uporaben seznam naslovov cele namestitve.
- **FR-073**: Imenik **NE SME** vsebovati identifikatorja pri ponudniku identitete, obsegov
  pravic ne notranjih zastavic stanja.
- **FR-074**: Pri prikazu **že dodanih** soudeležencev e-pošte ni — ime in začetnice zadoščata.
- **FR-075**: Imenik je dosegljiv vsakemu prijavljenemu uporabniku in **NI** vezan na obsege
  tega modula: izbira osebe je splošna zmogljivost, ne pojem opravil.

#### Ploščica na nadzorni plošči

- **FR-080**: Ploščica privzeto prikazuje **nazadnje spremenjen** seznam, do katerega ima
  uporabnik dostop.
- **FR-081**: Uporabnik lahko v glavi ploščice pripne določen seznam; ploščica takrat prikazuje
  njega, dokler ga ne odpne.
- **FR-082**: Ploščica prikazuje ime seznama, napredek, kdo in kdaj ga je nazadnje spremenil, in
  omejeno število neodkljukanih opravil.
- **FR-083**: Checkboxi na ploščici **delujejo** — odkljukanje z nje je enakovredno
  odkljukanju na zavihku.
- **FR-084**: Klik na naslov ploščice odpre zavihek s **tem** seznamom izbranim.
- **FR-085**: Če pripeti seznam ne obstaja več ali je bil dostop odvzet, ploščica pade nazaj na
  nazadnje spremenjen seznam in to pokaže. Ploščica **NE SME** povzročiti napake ne podrti
  nadzorne plošče.
- **FR-086**: Ploščica ima prazno stanje z gumbom, ki pelje na zavihek.
- **FR-087**: Interval osveževanja ploščice pove **strežnik** v odgovoru; odjemalec ga **NE
  SME** imeti kot konstanto, in osveževanje teče IZKLJUČNO, ko je zaslon v ospredju (člen VIII).

#### API in obsegi

- **FR-090**: Vsaka funkcija iz vmesnika **MORA** biti dosegljiva tudi s HTTP klicem in obstajati
  kot endpoint, preden obstaja kot zaslon (člen III).
- **FR-091**: Modul ima ločene obsege za branje, pisanje in **deljenje**. Deljenje je ločen
  obseg, ker je edina operacija v modulu, ki zadene človeka, ki ni klicatelj — z enim samim
  obsegom za pisanje bi "avtomatizacija lahko doda opravilo" pomenilo tudi "avtomatizacija lahko
  seznam podari".
- **FR-092**: Osnovna uporabniška vloga **MORA** dobiti obsege tega modula; brez tega bi zavihek
  deloval samo administratorju.
- **FR-093**: Vsi mutacijski endpointi sprejmejo `Idempotency-Key` in to **MORA** biti zapisano v
  pogodbi. Nobene izjeme ta modul ne uporablja.
- **FR-094**: Ponovljen mutacijski klic z istim ključem vrne prvotni odgovor in stanja ne
  spremeni drugič — **tudi pri brisanju**.
- **FR-095**: Endpoint za preurejanje sprejme **cel** vrstni red, ne ukaza "premakni gor":
  ponovljen relativni premik bi opravilo premaknil dvakrat, česar obljuba iz FR-094 ne prenese.
- **FR-096**: API ključ ne obide nobene omejitve: obsegi, stopnje, zaklep, lastništvo in zgornje
  meje veljajo enako.
- **FR-097**: Mutacija vrne novo stanje seznama, da odjemalcu ni treba ugibati vrstnega reda po
  odkljukanju.

#### Zavihek

- **FR-100**: Zavihek se v meni doda z **enim** vnosom v register zavihkov; njegova ikona **MORA**
  biti registrirana na strani odjemalca.
- **FR-101**: Zavihek je privzeto vklopljen in ga je v nastavitvah mogoče izklopiti ali premakniti.
- **FR-102**: Izklop zavihka je nastavitev **prikaza**, ne stikalo za podatke: seznami ostanejo,
  ostanejo deljeni in ostanejo dosegljivi prek API-ja.
- **FR-103**: Zavihek v meniju prikazuje kratko stanje (koliko neodkljukanih) in opozorilo, kadar
  je kaj zapadlo ali kadar je bil z uporabnikom deljen nov seznam. To je **nadomestilo za
  potisno obvestilo** (glej Assumptions).
- **FR-104**: Zavihek **MORA** imeti prazno stanje s pojasnilom in gumbom za prvi seznam.
- **FR-105**: Odstranitev modula **MORA** biti izbris ene mape in enega vnosa v registru (člen I);
  modul **NE SME** neposredno uvažati iz nobenega drugega modula.

### Key Entities

- **Seznam opravil** — ime, lastnik, zaklenjenost, soudeleženci, opravila, čas in avtor zadnje
  spremembe. Prvi zapis v sistemu, pri katerem lastništvo in vidnost **nista** isto.
- **Opravilo** — besedilo, stanje, čas in avtor odkljukanja, neobvezen rok, ročni položaj.
  Živi znotraj seznama in zunaj njega ne obstaja.
- **Soudeleženec** — uporabnik, njegova stopnja, čas dodelitve in čas prvega ogleda. Soudeleženec
  **JE** uporabnik: dvojnika za isto osebo na istem seznamu ni.
- **Vnos v imeniku uporabnikov** — ime za prikaz, začetnice in zamaskirana e-pošta. Izpeljana
  predstavitev za izbiro osebe, ne zapis.

## Out of Scope

- **Potisna obvestila.** Obveščanje je znotraj aplikacije. Razlog je merljiv, ne okusen — glej
  Assumptions: v spletni aplikaciji se naprava za potisna obvestila nikoli ne registrira, in
  vsaka registrirana naprava ima vklopljen samo kanal za zdravje sistema, zato bi obvestilo na
  novem kanalu tiho končalo kot nedostavljeno. Popravek tega je tuja, obstoječa okvara in svoja
  naloga.
- **Sprotno osveževanje (WebSocket, SSE).** Sprememba drugega uporabnika se pokaže ob naslednji
  osvežitvi v ospredju. Sprotni prenos bi bila nova prečna zmogljivost brez precedensa v tej
  bazi kode.
- **Dodeljevanje opravil osebi, prioritete, opombe, podnaloge, ponavljajoča opravila,
  priponke, komentarji.** Odločitev je bila hitri vnos z enim poljem; vsako od teh polj ga
  podre.
- **Vlečenje in spuščanje** za preurejanje. Hišni vzorec so puščici gor/dol; nove prečne
  odvisnosti ta funkcionalnost ne uvaja.
- **Deljenje z ljudmi brez računa.** To je modul 009 in druga funkcionalnost.
- **Prenos lastništva** seznama.
- **Zgodovina sprememb** ("kdo je kdaj kaj spremenil"). Vidna sta zadnji avtor in avtor
  odkljukanja; celotna sled bi bila svoja zbirka in svoja odločitev.
- **Skupine uporabnikov.** Deljenje je z osebami.
- **Predloge seznamov** in podvajanje seznama.

## Success Criteria *(mandatory)*

- **SC-001**: Uporabnik doda deset opravil na nov seznam v manj kot 30 sekundah, brez enega
  samega klika z miško med vnosi (samo tipkanje in Enter).
- **SC-002**: Od klika na checkbox do vidne prečrtane vrstice mine manj kot 200 ms, ne glede na
  odzivnost strežnika — prikaz se ne sme čakati na omrežje, ob neuspehu pa se **MORA** vrniti v
  prejšnje stanje s pojasnilom.
- **SC-003**: Dva uporabnika, ki v istem trenutku odkljukata dve različni opravili istega
  seznama, oba uspeta — v 100 % primerov iz testnega nabora.
- **SC-004**: Uporabnik, ki ni ne lastnik ne soudeleženec, iz nobenega odgovora ne more
  ugotoviti, ali seznam obstaja — v 100 % primerov iz testnega nabora.
- **SC-005**: Vsaka od treh stopenj sme natanko svoja dejanja in nič več, preverjeno za vse
  kombinacije stopnja × dejanje × zaklenjenost, vključno z lastnikom nad zaklenjenim seznamom,
  ki **mora** smeti.
- **SC-006**: Soudeleženec, ki na zaklenjenem seznamu poskusi spremembo, v 100 % primerov dobi
  sporočilo, iz katerega je razvidno, da je seznam zaklenjen — in nikoli tihe vrnitve v prejšnje
  stanje.
- **SC-007**: Rok se pravilno ovrednoti na oba dneva prehoda na poletni oziroma zimski čas in na
  meji koledarskega dneva, meseca in leta — v 100 % primerov iz testnega nabora.
- **SC-008**: Ponovljen mutacijski klic z istim `Idempotency-Key` nikoli ne ustvari drugega
  zapisa in nikoli ne vrne napake namesto prvotnega uspeha — vključno z brisanjem.
- **SC-009**: Izbris mape modula in njegovega vnosa v registru pusti `typecheck`, `lint` in teste
  čiste (člen I, brez sprememb kjer koli drugje).
- **SC-010**: Ploščica z nedosegljivim pripetim seznamom se izriše in ne prepreči izrisa nobene
  druge ploščice na nadzorni plošči.
- **SC-011**: Ročni vrstni red preživi osvežitev strani in hkratno dodajanje opravila drugega
  uporabnika — brez izgubljenega ali podvojenega opravila.

## Assumptions

- **Krog uporabnikov.** Deljenje je mogoče IZKLJUČNO z uporabniki, ki že imajo račun pri
  ponudniku identitete **in so se v CleverDash že vsaj enkrat prijavili** (zapis o uporabniku
  nastane ob prvi prijavi). Vabil po e-pošti ljudem brez računa ta funkcionalnost ne pozna in
  branja seznama uporabnikov iz ponudnika identitete ne uvaja — to bi zahtevalo novo skrivnost
  v okolju in novo zunanjo odvisnost.
- **Zavestna odločitev o zasebnosti.** Vsak prijavljen uporabnik bo v izbirniku videl **imena
  vseh** ostalih uporabnikov namestitve. To je pogoj za izbirnik in je za majhno, zaupno
  namestitev sprejemljivo. E-pošta se prikaže samo zamaskirana (FR-072), tako da razločevanje
  soimenjakov ostane mogoče, izvoz naslovov pa ne.
- **Obveščanje je znotraj aplikacije, ker potisna obvestila v tej namestitvi ne delujejo.** Dve
  merljivi dejstvi: (1) odjemalec za splet registracijo naprave preskoči, zato v spletni
  aplikaciji naprave za potisna obvestila **ni**; (2) privzeti nabor kanalov je samo kanal za
  zdravje sistema in odjemalec ob registraciji nabora ne pošlje, zato bi obvestilo na novem
  kanalu ne našlo nobene naprave in bilo zabeleženo kot nedostavljeno. Zato je "nekdo ti je
  delil seznam" izvedeno kot oznaka v vmesniku (FR-007, FR-103). Obe napaki sta **tuji,
  obstoječi** in gresta v `plan.md` → Complexity Tracking, ne v obseg te funkcionalnosti.
- **Sprotnost.** Sprememba drugega uporabnika se pokaže ob naslednji osvežitvi v ospredju
  (interval pove strežnik, FR-087), ne v isti sekundi. Za nakupovalni seznam je to dovolj;
  zahteve po sprotnem prenosu ni.
- **Zgornje meje** (dolžina imena in besedila, število opravil na seznam, seznamov na
  uporabnika, soudeležencev na seznam, opravil na eno zahtevo) so postavljene na varne
  privzetke in so nastavljive; njihove točne vrednosti so podrobnost načrta, ne zahteve.
- **Ročni vrstni red velja samo za neodkljukana opravila.** Odkljukana so vedno pod črto in
  razvrščena po času odkljukanja; ročni položaj po odkljukanju nima pomena.
- **Kakovostna vrata, točka 2.** Prehod na poletni/zimski čas **IMA** v tej funkcionalnosti
  predmet — prvič po 001 — in sicer prek neobveznega roka opravila (FR-030 do FR-035); obvezni
  enotski testi so navedeni v načrtu. **Praznik na delovni dan predmeta NIMA**: modul ne pozna
  koledarja, praznikov ne delovnih dni — opravilo z rokom 25. decembra ima rok 25. decembra;
  nadomeščata ga testa meje koledarskega dneva na oba dneva prehoda časa, ki preverjata isto
  plast na primeru, ki tu obstaja. **Dopust čez mejo meseca predmeta NIMA**: ni obdobij ne
  razponov, opravilo ima en rok, ne začetka in konca; sam vidik meje meseca je pokrit s testom
  roka 1. marca, ovrednotenega 28. februarja pozno zvečer. **Neuspel klic, ki se uspešno
  ponovi, predmeta NIMA**: modul nima zunanjega sistema ne dejanja na tuji strani; nadomeščajo
  ga trije testi — (a) zapis, katerega pogoj se ne ujame z nobenim seznamom, ponovi
  **diagnozo** in vrne natančen razlog, nikoli notranje napake in nikoli samodejno ponovljenega
  zapisa; (b) ponovljen `Idempotency-Key` pri dodajanju ne ustvari dvojnika; (c) ponovljeno
  brisanje z istim ključem vrne prvotni uspeh. To **MORA** biti izrecno zapisano tudi v načrtu.
- **Baza teče kot samostojen strežnik**, brez replika nabora, zato transakcij nad več dokumenti
  ni. To je omejitev okolja, ki jo načrt **MORA** upoštevati pri vsaki operaciji, ki se dotakne
  več kot enega opravila hkrati (preurejanje, čiščenje opravljenih, izbris seznama s članstvi).
- **Ponovna uporaba obstoječega.** Funkcionalnost ne uvaja novih zunanjih odvisnosti. Uporabi
  obstoječe: register zavihkov in njegov mehanizem za kratko stanje v meniju, razporeditev
  ploščic v osebnih nastavitvah (vključno s prostorom za nastavitev ploščice, kjer živi
  pripetost), osveževanje v ospredju z intervalom s strežnika, izračun koledarskega dneva v
  ljubljanski coni, in obstoječi pomočnik za pretvorbo vrstnega reda identifikatorjev v
  položaje.
