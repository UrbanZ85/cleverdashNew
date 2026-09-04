# Feature Specification: Zavihek kamer

**Feature Branch**: `main` — veja ni ustvarjena, ker `before_specify` git hook ni registriran

**Feature Directory**: `specs/003-cameras`

**Created**: 2026-08-21

**Status**: Ready for planning — vsa odprta vprašanja razrešena

**Input**: User description: "Preberi nacrt/003-cameras/spec.md in ustvari specifikacijo za
funkcionalnost 003 (kamere). Dodaj urejevalni zaslon za ta zavihek: dodajanje, urejanje in
brisanje kamer, vključno s kamerami, ki prikazujejo vdelano vsebino/podatke z drugih strani
(embed)."

**Vir**: `nacrt/003-cameras/spec.md`. Številčenje zahtev je namenoma ohranjeno iz vhodnega
dokumenta v enaki skupinski shemi (po deseticah, kot pri 001 in 002), z enim vrinjenim novim
blokom "Urejanje" (FR-030–FR-038) za zaslon za dodajanje/urejanje/brisanje kamer — vhodni
dokument ga je omenjal le kot posledico Z3/prvotnega FR-030, uporabnik pa je to zahteval kot
prvorazredno, samostojno zmogljivost. Prvotni API blok (FR-030–FR-032 vhodnega dokumenta) je
zato premaknjen na FR-040–FR-042, glej opombo v `checklists/requirements.md`.

**Odvisnost**: Funkcionalnost 001 (ogrodje, avtentikacija, predpomnilnik, proxy) je dokončana.
Ta funkcionalnost se nanjo priklopi kot nov zavihek, brez sprememb ogrodja (člen I ustave).

Hitri pregled kamer in živih slik na enem zaslonu, z zaslonom za urejanje, ki omogoča
dodajanje poljubnih novih kamer — vključno s kamerami, ki so v resnici vdelava tuje strani
(embed) — brez posega v kodo. Namen je pogledati enkrat in vedeti, kakšno je stanje, in
kadar se pojavi nov vir, ga dodati sam, ne prek razvijalca.

## Clarifications

### Session 2026-08-21

- Q: Katere kamere/viri naj bodo v obsegu funkcionalnosti 003? → A: Samo javni spletni viri
  (ipcamlive "znpvkamera2" Planina, YouTube "Goli", YouTube "Škitača", istrastream Sveta
  Marina) plus karkoli uporabnik pozneje sam doda prek zaslona za urejanje. Lastne kamere v
  domačem omrežju (RTSP/Reolink/Hikvision/Shelly) so izven obsega te funkcionalnosti — glej
  Out of Scope.
- Q: Kaj storimo s `toWorkUrl`/`fromWorkUrl` (vdelan zemljevid s prometom za pot v
  službo/domov iz starega CleverDasha)? → A: Niso kamere in se ne prenašajo v ta zavihek.
  Predlagano kot morebitni dve ločeni ploščici na dashboardu (001) — to pa ni del obsega te
  funkcionalnosti in ni zavezujoča odločitev za 001.
- Q: Ali naj ARSO spletne kamere (polje `webcam` v ARSO vremenskem API-ju) postanejo ponujen
  vir? → A: Da. Pri dodajanju kamere lahko uporabnik izbere ARSO webcam za svojo lokacijo
  namesto ročnega vnosa naslova (glej FR-037).
- Q: Ali je potrebno snemanje ali zgodovina posnetkov kamer? → A: Ne. Samo pogled v živo —
  glej Out of Scope.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Odprem zavihek in vidim vse hkrati (Priority: P1)

Uporabnik odpre zavihek kamer in v enem pogledu vidi mrežo predogledov vseh nastavljenih
kamer, s časom zajema pri vsaki.

**Why this priority**: To je jedrni namen zavihka — "pogledati enkrat in vedeti, kakšno je
stanje". Brez mreže predogledov zavihek ne obstaja; vse ostale zgodbe so nadgradnje ali
predpogoji zanjo (P3–P4 poskrbita, kako pridejo kamere v mrežo; P2 poskrbi za podrobnejši
pogled).

**Independent Test**: Nastavi neposredno v podatkih (brez UI-ja) več kamer različnih vrst
virov, odpri zavihek in preveri, da se prikaže mreža predogledov s časom zajema pri vsakem
in da se predogledi osvežujejo v nastavljenem intervalu, dokler je zaslon v ospredju.

**Acceptance Scenarios**:

1. **Given** je nastavljenih več kamer, **When** uporabnik odpre zavihek, **Then** se
   prikaže mreža predogledov s časom zajema pri vsaki.
2. **Given** prikazana mreža, **When** je zaslon v ospredju, **Then** se predogledi
   osvežujejo v nastavljenem intervalu vsake kamere.
3. **Given** prikazana mreža, **When** uporabnik zaslon zapusti (druga aplikacija, zaklep
   zaslona), **Then** se osveževanje ustavi (glej Story 7).

---

### User Story 2 - Ena kamera na cel zaslon (Priority: P2)

Uporabnik tapne kamero v mreži in jo vidi v celozaslonskem prikazu; če vir ponuja živi tok,
se ta predvaja namesto samega posnetka.

**Why this priority**: Naravna nadgradnja P1 — mreža je pregled, celozaslonski prikaz je
podrobnost. Neodvisno testabilna nad že obstoječo mrežo iz P1.

**Independent Test**: V mreži iz P1 izberi kamero z živim tokom in preveri, da se odpre
celozaslonsko in da se predvaja živi tok namesto posnetka; vrni se v mrežo in preveri, da se
tok ustavi.

**Acceptance Scenarios**:

1. **Given** prikazana mreža, **When** uporabnik izbere kamero, **Then** se ta odpre na
   celotnem zaslonu.
2. **Given** izbrana kamera ponuja živi tok, **When** se odpre celozaslonsko, **Then** se
   predvaja živi tok namesto statičnega posnetka.
3. **Given** celozaslonski prikaz z živim tokom, **When** se uporabnik vrne v mrežo,
   **Then** se živi tok ustavi.

---

### User Story 3 - Dodam kamero brez posega v kodo (Priority: P3)

Uporabnik na zaslonu za urejanje kamer doda novo kamero — vnese ime, izbere vrsto vira in
vnese naslov (ali izbere ARSO webcam za svojo lokacijo) — in kamera se takoj pojavi v mreži,
brez novega builda ali posega razvijalca.

**Why this priority**: To je razlog, da zaslon za urejanje obstaja, in neposredni odziv na
uporabnikovo zahtevo po tem, da lahko sam dodaja kamere in vdelane vire z drugih strani.
Brez tega bi bila mreža iz P1 statična in bi vsaka nova kamera pomenila spremembo kode.

**Independent Test**: Odpri zaslon za urejanje kamer, dodaj novo kamero z vrsto vira
"vdelava tuje strani" (npr. YouTube naslov) in preveri, da se brez ponovnega nalaganja
aplikacije pojavi v mreži iz P1, s pravilno vrsto prikaza.

**Acceptance Scenarios**:

1. **Given** je odprt zaslon za urejanje kamer, **When** uporabnik vnese ime, vrsto vira in
   naslov ter shrani, **Then** se kamera takoj pojavi v mreži.
2. **Given** izbrana vrsta vira je "vdelava tuje strani" (iframe/embed — YouTube, ipcamlive
   predvajalnik, poljubna druga vdelana stran), **When** uporabnik vnese naslov vdelave,
   **Then** je to polnopravna možnost v obrazcu, ne skrita tehnična podrobnost, in shranjena
   kamera prikaže vdelano vsebino kot tipizirano komponento (glej FR-036, FR-022).
3. **Given** je izbrana vrsta vira "ARSO webcam", **When** uporabnik izbere svojo lokacijo,
   **Then** sistem sam izpolni naslov iz ARSO podatkov, brez ročnega vnosa (glej FR-037).
4. **Given** uporabnik vnese naslov z gostiteljem, ki ni na seznamu dovoljenih, ali
   neveljaven URL, **When** poskusi shraniti, **Then** sistem shranjevanje zavrne z
   razumljivim sporočilom in kamera se ne pojavi v mreži (glej FR-034).
5. **Given** so v mreži že prikazane kamere, **When** uporabnik spremeni njihov vrstni red
   na zaslonu za urejanje, **Then** se nov vrstni red takoj odrazi v mreži.

---

### User Story 4 - Urejam in brišem obstoječo kamero (Priority: P4)

Uporabnik na zaslonu za urejanje kamer spremeni podatke že dodane kamere (ime, naslov,
interval, skupino, časovno oznako, stanje aktivna/neaktivna) ali jo dokončno izbriše, s
potrditvijo.

**Why this priority**: Neposredna dopolnitev P3 — kamera, ki jo je mogoče samo dodati, ne pa
tudi popraviti ali odstraniti, uporabnika prej ali slej prisili nazaj na razvijalca (napačen
naslov, kamera je prenehala obstajati, preimenovanje skupine). Ločena prioriteta od P3, ker
je neodvisno testabilna nad že obstoječo kamero.

**Independent Test**: Uredi obstoječo kamero (npr. spremeni interval osveževanja in ime) in
preveri, da se sprememba odrazi v mreži brez ponovnega nalaganja aplikacije; nato jo izbriši
in preveri, da zahteva potrditev ter da po izbrisu izgine iz mreže.

**Acceptance Scenarios**:

1. **Given** obstoječa kamera, **When** uporabnik na zaslonu za urejanje spremeni katero od
   njenih polj in shrani, **Then** se sprememba takoj odrazi v mreži.
2. **Given** obstoječa kamera, **When** uporabnik izbere brisanje, **Then** sistem zahteva
   izrecno potrditev, ker je dejanje nepovratno.
3. **Given** potrjeno brisanje, **When** se izvede, **Then** kamera izgine iz mreže in iz
   zaslona za urejanje; morebiten shranjen zadnji posnetek se ne prikazuje več.
4. **Given** uporabnik med urejanjem vnese neveljaven ali nedovoljen naslov, **When** poskusi
   shraniti, **Then** velja enaka validacija kot pri dodajanju (FR-034) in prejšnje veljavne
   vrednosti kamere ostanejo nespremenjene, dokler ni vnesen veljaven naslov.
5. **Given** je kamera, ki je trenutno odprta celozaslonsko (Story 2), izbrisana na drugi
   napravi ali zavihku, **When** uporabnik poskusi nadaljevati ogled, **Then** se prikaz
   razumljivo zapre in vrne v mrežo, brez napake brez pojasnila.

---

### User Story 5 - Kamera ne dela (Priority: P5)

Uporabnik loči "ni dežja" od "kamera ne dela" — ko vir ne odgovori, ploščica prikaže zadnjo
uspešno sliko, zatemnjeno, z oznako starosti in opozorilom, ostale kamere pa delujejo
normalno.

**Why this priority**: Brez tega prazen ali obstal kvadrat zavaja enako kot bi zavajala
napačna informacija — vendar zavihek deluje že brez tega (P1–P4), le manj zanesljivo pri
napakah.

**Independent Test**: Simuliraj kamero, katere vir ne odgovori, in preveri, da ploščica
prikaže zadnjo uspešno sliko zatemnjeno z oznako starosti in opozorilom, da ostale kamere v
mreži delujejo normalno, in da se po nastavljenem številu neuspehov kamera označi kot
nedosegljiva z upočasnjenim osveževanjem.

**Acceptance Scenarios**:

1. **Given** vir kamere ne odgovori, **When** sistem to zazna, **Then** ploščica prikaže
   zadnjo uspešno sliko zatemnjeno, z oznako starosti slike in jasnim opozorilom.
2. **Given** ena kamera ne dela, **When** je mreža prikazana, **Then** ostale kamere
   delujejo in se osvežujejo normalno.
3. **Given** kamera ne odgovori nastavljeno število zaporednih poskusov, **When** se ta meja
   doseže, **Then** se kamera označi kot nedosegljiva in njeno osveževanje upočasni.

---

### User Story 6 - Razvrstitev po času dneva (Priority: P6)

Kamere, označene za dopoldan, so pred poldnem na vrhu mreže; po poldnem je vrstni red
obrnjen v prid kamer, označenih za popoldan.

**Why this priority**: Manjša izboljšava kakovosti prikaza nad že delujočo mrežo (P1) —
brez nje zavihek deluje, le da uporabnik občasno išče po mreži namesto da bi bilo
najpomembnejše na vrhu.

**Independent Test**: Nastavi eno kamero z oznako "dopoldne" in drugo z oznako "popoldne",
odpri zavihek pred poldnem in preveri vrstni red, nato ponovi po poldnem in preveri, da je
obrnjen.

**Acceptance Scenarios**:

1. **Given** kamera z oznako "dopoldne" in druga z oznako "popoldne", **When** uporabnik
   odpre zavihek pred poldnem, **Then** je dopoldanska kamera prva na vrsti (znotraj ročno
   nastavljenega vrstnega reda, glej FR-014).
2. **Given** enak nabor kamer, **When** uporabnik odpre zavihek po poldnem, **Then** je
   vrstni red obrnjen v prid popoldanske kamere.

---

### User Story 7 - Prenos podatkov na telefonu (Priority: P7)

Uporabnik na mobilnem omrežju vidi predoglede, ki se osvežujejo redkeje, žive tokovi pa se ne
zaženejo samodejno — z možnostjo, da to vedenje izklopi.

**Why this priority**: Optimizacija za mobilno rabo nad že delujočim zavihkom (P1–P2); brez
nje zavihek deluje enako na vseh omrežjih, le da porabi več prenosa podatkov.

**Independent Test**: Odpri zavihek na simuliranem mobilnem omrežju in preveri, da so
intervali osveževanja daljši in da se živi tok ne zažene samodejno ob odprtju kamere,
temveč šele na uporabnikovo potrditev; preveri tudi, da je to vedenje mogoče izklopiti v
nastavitvah.

**Acceptance Scenarios**:

1. **Given** uporabnik je na mobilnem omrežju, **When** odpre zavihek, **Then** se predogledi
   osvežujejo redkeje kot na Wi-Fi/žičnem omrežju.
2. **Given** uporabnik je na mobilnem omrežju in odpre kamero z živim tokom, **When** se
   celozaslonski prikaz odpre, **Then** se tok ne zažene samodejno, dokler ga uporabnik ne
   potrdi.
3. **Given** to vedenje je uporabniku odveč, **When** ga izklopi v nastavitvah, **Then**
   zavihek na mobilnem omrežju deluje enako kot na Wi-Fi/žičnem.

---

### Edge Cases

- Naslov vira uporablja `http://`, kamera pa je dodana v aplikaciji na `https://app.si/` —
  sistem naslov obvezno preusmeri prek backend proxyja (FR-020, FR-024), da brskalnik ne
  zavrne mešane vsebine.
- Uporabnik pri dodajanju ali urejanju vnese naslov gostitelja, ki ni na seznamu dovoljenih
  za vdelavo (iframe) — shranjevanje se zavrne z razlogom, kamera ostane v prejšnjem
  (veljavnem) stanju oz. se sploh ne ustvari (FR-022, FR-034).
- Uporabnik izbriše kamero, ki jo hkrati na drugi napravi nekdo gleda celozaslonsko — prikaz
  se razumljivo zapre, ne obstane v napaki (Story 4, scenarij 5).
- Uporabnik za lokacijo, kjer ARSO ne vrača slike `webcam`, poskusi dodati kamero vrste "ARSO
  webcam" — obrazec to razumljivo pove in ne ponudi neobstoječe možnosti kot izbirljive.
- Dve kameri z enakim imenom — dovoljeno (ime ni enolični identifikator), a uporabniku
  vmesnik svetuje razločevanje, ker enaka imena otežujejo izbiro pri urejanju.
- Vir kamere je dosegljiv, a vrne vsebino, ki ni slika/tok pričakovane vrste (npr. stran z
  napako 200 OK) — obravnavano enako kot nedosegljiv vir (Story 5), ne kot uspešen zajem.
- Prehod čez poldne med odprtim zavihkom (uporabnik pusti zaslon odprt čez poldne) — vrstni
  red se ob naslednjem odprtju zavihka ponovno izračuna; ni zahteve po samodejnem
  preurejanju medtem, ko je zaslon že odprt.

## Requirements *(mandatory)*

### Functional Requirements

#### Model kamere

- **FR-001**: Kamere so podatek, ne koda. Vsaka ima ime, vrsto, naslov, interval osveževanja,
  skupino, vrstni red in stikalo (aktivna/neaktivna).
- **FR-002**: Podprte vrste virov:

  | vrsta | pomen |
  |---|---|
  | `snapshot` | statična slika, osvežena s parametrom za obhod predpomnilnika |
  | `mjpeg` | zvezni MJPEG tok |
  | `hls` | HLS tok (`.m3u8`) |
  | `iframe` | vdelana tuja stran (YouTube, ipcamlive predvajalnik, zemljevid s prometom) |
  | `snapshot+iframe` | posnetek kot predogled, vdelava ob kliku — vzorec iz ipcamlive |

  ARSO webcam ni ločena vrsta vira — pri dodajanju je ponujena kot predloga, ki polje vrste
  samodejno nastavi na `snapshot` (glej FR-037).
- **FR-003**: Kamera ima lahko ločen naslov za predogled in za polni prikaz.
- **FR-004**: Kamera ima lahko časovno oznako (`morning`, `afternoon`, `always`), ki vpliva na
  vrstni red (glej FR-014, Story 6).
- **FR-005**: Poverilnice, če jih vir zahteva, so shranjene šifrirano in se prek API-ja nikoli
  ne vrnejo.

#### Prikaz

- **FR-010**: Privzeti prikaz je mreža predogledov, odzivna na širino zaslona.
- **FR-011**: Vsak predogled prikaže čas zajema in stanje. Poleg treh osrednjih stanj iz
  Story 5 (v redu, staro, nedosegljivo) obstajata še dve robni, prav tako uporabniško
  vidni stanji: "še ni podatka" (prvi zajem po dodajanju kamere še ni uspel) in "ni
  preverljivo" (vrste `iframe`, `mjpeg` in `hls`, FR-002 — brez posnetka, ki bi ga bilo
  mogoče predpomniti, zato strežnik nima česa preveriti). Slednje se NE prikaže kot napaka ali kot
  "nedosegljivo", ker gre za pričakovano lastnost te vrste vira, ne za okvaro.
- **FR-012**: Izbrana kamera se odpre na celotnem zaslonu; če ima živi tok, se ta predvaja.
- **FR-013**: Osveževanje in tokovi se ustavijo, ko zaslon ni v ospredju.
- **FR-014**: Vrstni red je nastavljiv ročno (FR-035), znotraj tega pa velja časovna oznaka
  (FR-004).
- **FR-015**: Kamere je mogoče združiti v skupine (npr. "Pot", "Morje", "Doma") in skupino
  zložiti.

#### Dostop do virov

- **FR-020**: Naslovi virov gredo skozi backend proxy, kadar je vir dosegljiv samo prek
  `http://`, zahteva poverilnice, ali je v lokalnem omrežju. Sicer se lahko naložijo
  neposredno.
- **FR-021**: Proxy predpomni posnetke za interval kamere, da ena kamera na več napravah ne
  pomeni več zahtev na vir.
- **FR-022**: Naslovi `iframe` virov so preverjeni proti seznamu dovoljenih gostiteljev. HTML
  se **nikoli** ne sestavlja iz niza — vdelava je tipizirana komponenta s preverjenim
  naslovom.
- **FR-023**: Proxy ne posreduje poljubnega naslova. Posreduje samo naslove nastavljenih
  kamer, naslovljene po ID-ju kamere, ne po naslovu v poizvedbi.
- **FR-024**: Vsi viri so v aplikaciji predstavljeni prek `https`. Vir, ki podpira samo
  `http`, gre obvezno prek proxyja.

#### Urejanje

- **FR-030**: Uporabnik ima v aplikaciji zaslon za urejanje kamer, dostopen iz zavihka
  kamer, ki prikaže seznam vseh nastavljenih kamer (tudi neaktivnih) z imenom, vrsto,
  skupino in stanjem.
- **FR-031**: Uporabnik lahko na tem zaslonu doda novo kamero: vnese ime, izbere vrsto vira,
  vnese naslov (ali naslova — predogled in poln prikaz, FR-003), interval, skupino, časovno
  oznako in začetno stanje aktivna/neaktivna — brez posega v kodo ali novega builda (Story
  3).
- **FR-032**: Uporabnik lahko uredi vsako od polj obstoječe kamere; sprememba se odrazi v
  mreži brez ponovnega nalaganja aplikacije (Story 4).
- **FR-033**: Uporabnik lahko izbriše kamero. Brisanje je nepovratno in zahteva izrecno
  potrditev (Story 4).
- **FR-034**: Pred shranjevanjem dodane ali urejene kamere sistem preveri naslov: mora biti
  veljaven URL, gostitelj mora biti na seznamu dovoljenih za vdelavo, kadar gre za vrsto
  `iframe`/`snapshot+iframe` (FR-022), in shema mora biti `https` ali mora vir obvezno iti
  prek proxyja (FR-020, FR-024). Neveljaven vnos zaslon zavrne z razumljivim sporočilom, brez
  shranjevanja in brez spremembe že veljavnih podatkov kamere.
- **FR-035**: Vrstni red kamer je mogoče spremeniti s premikanjem na zaslonu za urejanje;
  sprememba se takoj odrazi v mreži (FR-014).
- **FR-036**: Za vrsto vira, ki je vdelava tuje strani (`iframe`, `snapshot+iframe` — npr.
  YouTube, ipcamlive predvajalnik, ARSO webcam, ali poljubna druga vdelana stran), je vnos
  vdelanega naslova prva-razredna, poimenovana možnost v obrazcu za dodajanje/urejanje, ne
  le tehnična podrobnost API-ja. HTML se pri tem nikoli ne sestavlja iz niza (FR-022).
- **FR-037**: Sistem ponudi ARSO spletne kamere kot izbirni vir pri dodajanju: uporabnik
  izbere lokacijo namesto ročnega vnosa naslova, sistem pa samodejno izpolni naslov iz
  podatka `webcam` v ARSO vremenskem odgovoru za to lokacijo (glej `nacrt/001-app-shell-
  dashboard/spec.md`) in nastavi vrsto vira na `snapshot`. Če za izbrano lokacijo ARSO ne
  vrača slike, obrazec to pove in možnosti ne ponudi kot izbirljive.
- **FR-038**: Zaslon za urejanje kamer je dosegljiv samo prijavljenemu uporabniku aplikacije
  — sistem je enouporabniški, brez ločenih vlog (podedovano iz 001).

#### API

- **FR-040**: Kamere so v celoti obvladljive prek `/api/v1/cameras`: seznam, dodajanje,
  urejanje, brisanje, spreminjanje vrstnega reda. Zaslon za urejanje (FR-030–FR-038) je
  odjemalec tega API-ja, ne ločena pot (člen III ustave — UI ni privilegiran odjemalec).
- **FR-041**: `GET /api/v1/cameras/{id}/snapshot` vrne trenutni posnetek prek proxyja.
- **FR-042**: `GET /api/v1/cameras/{id}/health` pove, ali je vir dosegljiv, in kdaj je bil
  nazadnje.

### Key Entities *(include if feature involves data)*

- **Camera**: ime, vrsta vira, naslov predogleda, naslov polnega prikaza, interval
  osveževanja, skupina, časovna oznaka (`morning`/`afternoon`/`always`), vrstni red, aktivna
  (da/ne), poverilnice (šifrirano, nikoli vrnjene prek API-ja), izvor predloge (ročno
  vneseno / ARSO webcam) — samo za sledljivost, ne vpliva na obnašanje.
- **CameraGroup**: ime, vrstni red, zloženo (da/ne).
- **CameraHealth**: zadnji uspeh, zadnja napaka, zaporedni neuspehi, stanje (v redu,
  staro, nedosegljivo).

## Out of Scope

- Snemanje ali zgodovina posnetkov kamer — funkcionalnost ponuja samo pogled v živo
  (odločeno 21. 8. 2026, glej Clarifications).
- Lastne kamere v domačem omrežju (RTSP, Reolink, Hikvision, Shelly ipd.) — potrebovale bi
  komponento znotraj domačega omrežja za pretvorbo v HLS/WebRTC, ker VPS ni v istem omrežju.
  Ločena prihodnja funkcionalnost, če se izkaže potrebna.
- `toWorkUrl`/`fromWorkUrl` (vdelan zemljevid s prometom za pot v službo/domov) — niso
  kamere; morebitna uvrstitev kot dve ploščici na dashboard (001) ni del te funkcionalnosti.
- Vloge in pravice za več uporabnikov pri urejanju kamer — sistem je enouporabniški
  (podedovano iz 001).
- Javna objava ali delitev kamer zunaj aplikacije — kamere so vidne samo prijavljenemu
  uporabniku aplikacije.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ob odprtju zavihka se mreža z vsemi aktivnimi kamerami in časom zajema pri
  vsaki prikaže v manj kot 2 sekundah na Wi-Fi/žičnem omrežju.
- **SC-002**: Uporabnik lahko doda novo kamero (vključno z vdelavo tuje strani) prek zaslona
  za urejanje in jo vidi v mreži v manj kot 2 minutah, brez posega razvijalca ali novega
  builda.
- **SC-003**: Urejanje ali brisanje obstoječe kamere se odrazi v mreži v manj kot 5 sekundah,
  brez ponovnega nalaganja aplikacije.
- **SC-004**: Delež nedosegljivih kamer, ki ostanejo neopažene (prazna ploščica brez oznake
  starosti/opozorila), je nič.
- **SC-005**: Vsak poskus brisanja kamere zahteva izrecno potrditev; delež nenamernih
  izbrisov v uporabniškem testiranju je nič.
- **SC-006**: Vrstni red kamer, označenih za dopoldan/popoldan, je pravilen (dopoldanska
  prva pred poldnem, popoldanska prva po poldnem) v 100 % preverjenih odprtij zavihka.
- **SC-007**: Na mobilnem omrežju je število zahtev na vir v primerjavi z Wi-Fi/žičnim
  omrežjem manjše (daljši interval osveževanja, brez samodejnega zagona živih tokov), in to
  vedenje je mogoče izklopiti v enem koraku v nastavitvah.

## Assumptions

Spodnje so privzete odločitve, sprejete tam, kjer vhodni dokument
(`nacrt/003-cameras/spec.md`) ni bil dokončen, ali kjer je uporabnik razrešil odprto
vprašanje (glej Clarifications in `checklists/requirements.md`).

- **Obseg virov v prvi verziji so izključno javni spletni viri** (ipcamlive, YouTube,
  istrastream) plus karkoli uporabnik doda prek zaslona za urejanje. Lastne kamere v
  domačem omrežju so izrecno izven obsega (odločitev uporabnika, 21. 8. 2026).
- **Privzeto število zaporednih neuspehov, preden se kamera označi kot nedosegljiva, in
  privzeti interval osveževanja po tej meji** se določita v `/speckit-plan` glede na
  tehnične omejitve proxyja in predpomnilnika (člen VIII ustave — vljudnost do zunanjih
  virov); vhodni dokument ni predlagal konkretnih vrednosti.
- **Potrditev brisanja** je enakovredna standardnemu potrditvenemu dialogu (ni zahtevano
  vnašanje imena kamere) — dovolj varovalo za nepovraten, a enostavno razveljaven poseg
  (kamero je mogoče znova dodati).
- **Vrstni red kamer se ročno spremeni s premikanjem (drag-and-drop) ali enakovrednim
  mehanizmom** (npr. gor/dol gumbi) — konkretna izbira UI vzorca je stvar `/speckit-plan`,
  ne te specifikacije.
- **ARSO webcam predloga se ob dodajanju povpraša enkrat**, ne vzdržuje žive povezave s
  spremembami ARSO ponudbe kamer za lokacijo; če ARSO pozneje dodeli ali umakne sliko za
  isto lokacijo, to ne spremeni že dodane kamere samodejno.
- **Mobilni način (Story 7) privzeto vklopljen glede na zaznano vrsto omrežja**, z ročnim
  izklopom v nastavitvah (isti vzorec kot pri drugih funkcionalnostih, ki ločujejo Wi-Fi od
  mobilnega omrežja).

### Dependencies

- **Funkcionalnost 001** — enotni izvor in backend proxy pod `/api` (člen II ustave), ARSO
  vremenski API s poljem `webcam` (FR-037), obstoječi mehanizem prijave (FR-038).
- **Zunanji viri** (ipcamlive, YouTube, istrastream, ARSO) so tuji sistemi (člen VIII
  ustave): vsak klic gre prek backend predpomnilnika z razumnim TTL, `Cache-Control` izvora
  se spoštuje, ARSO podatki so prikazani z navedbo vira.
- **Ustava projekta** (`.specify/memory/constitution.md`) — členi II (enotni izvor, proxy
  pod `/api`), III (API-first, `Idempotency-Key` na mutacijskih endpointih zaslona za
  urejanje), IV (nobene skrivnosti v kodi — šifrirane poverilnice kamer, FR-005) in VIII
  (vljudnost do zunanjih virov, kamere so med izrecno navedenimi) neposredno omejujejo to
  funkcionalnost. Kjer si specifikacija in ustava nasprotujeta, velja ustava.
