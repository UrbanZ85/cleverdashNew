# Feature Specification: Shranjeni linki

**Vhodno gradivo**: `nacrt/008-saved-links/spec.md`
**Datum**: 2026-08-28
**Stanje**: Draft

## Zakaj

Zahteva je bila ena poved: *"dodati je potrebno še en modul in sicer shranjeni linki. to
bodo url stran shranjene. katere sem jih shranil"*, dopolnjena z: *"te linki so svoj modul
delujejo podobno kot beležke. samo da prikazujejo shranjene strani. npr ime strani url ter
komentar"*.

Zapis so torej **trije podatki**: ime strani, naslov (URL) in komentar. Isti trije, kot jih
je imela stran "Useful links" v starem CleverDashu (`linkName`, `linkUrl`,
`linkDescription`) — tam vsi trije obvezni, tu komentar in ime neobvezna, ker ime pove
stran sama.

Za tem stoji vsakdanji problem: stran, ki jo najdeš danes in jo boš potreboval čez tri
tedne, konča med zaznamki brskalnika, kjer je po nekaj mesecih ni več mogoče najti — ker so
zaznamki vezani na napravo in brskalnik, ker jih je preveč, in ker je zapis zgolj naslov
strani brez pojasnila, zakaj si jo shranil. CleverDash je že mesto, kjer uporabnik pogleda
enkrat in vidi vse svoje: kamere, čas, ploščice. Shranjene strani sodijo tja.

Modul se namenoma razlikuje od vtičnika vrste `link` iz 005. Ta je **ploščica** na nadzorni
plošči: nekaj ročno izbranih, vedno vidnih bližnjic. Ta modul je **knjižnica**: poljubno
mnogo zapisov, ki s časom raste, in ki jo je zato treba znati preiskati in urediti v mape.
Prvi odgovarja na "kam kliknem vsak dan", drugi na "kje je bila že tista stran".

Najbližji sorodnik je modul **beležk (007)**: oseben zapis, lasten zavihek, CRUD, iskanje. Ta
modul je zgrajen po istem vzorcu in se od njega razlikuje v dvojem — zapis je stran in ne
besedilo, razvrščen pa je v mape in ne z oznakami in pripenjanjem.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Shranim stran, ki jo bom potreboval pozneje (Priority: P1) 🎯 MVP

Prilepim naslov strani in ga shranim. Imena strani mi ni treba vpisovati — sistem ga prebere
sam; če ga ne more, ostane naslov strani in ga lahko popravim.

**Sprejemni scenariji**

1. **Ko** prilepim naslov in potrdim, **potem** je zapis takoj na seznamu.
2. **Ko** stran ima naslov (`<title>`), **potem** se ta pokaže namesto golega naslova
   strani, brez mojega posega.
3. **Ko** je stran nedosegljiva ali počasna, **potem** je zapis vseeno shranjen; ime ostane
   to, kar sem vpisal, ali gostitelj naslova.
4. **Ko** vpišem naslov brez sheme (`primer.si/stran`), **potem** ga sistem sprejme in
   dopolni v `https://`.
5. **Ko** vpišem nekaj, kar ni naslov strani (`javascript:…`, `data:…`), **potem** je
   zavrnjeno s sporočilom, kaj je narobe.

### User Story 2 - Najdem, kar sem shranil (Priority: P2)

V iskalno polje vpišem del imena, naslova ali komentarja in seznam se zoži.

**Sprejemni scenariji**

1. **Ko** vpišem del imena strani, **potem** seznam pokaže ujemajoče zapise iz vseh map.
2. **Ko** vpišem del naslova strani (npr. `arso`), **potem** se najdejo tudi zapisi, ki tega
   niza nimajo v imenu.
3. **Ko** iščem `cas`, **potem** se najde tudi zapis z imenom "Beleženje časa" — velike
   črke in šumniki ne smejo biti ovira.
4. **Ko** iskanje ničesar ne najde, **potem** to izrecno piše; seznam ni prazen brez
   pojasnila.

### User Story 3 - Uredim jih v mape (Priority: P3)

Ustvarim mape ("Delo", "Recepti", "Za prebrati"), zapise premikam vanje in mape zlagam.

**Sprejemni scenariji**

1. **Ko** ustvarim mapo in vanjo premaknem zapis, **potem** je zapis pod to mapo, ostali
   ostanejo, kjer so.
2. **Ko** mapo zložim, **potem** ostane zložena tudi ob naslednjem obisku.
3. **Ko** izbrišem mapo, v kateri so zapisi, **potem** se zapisi PREMAKNEJO med
   nerazvrščene; noben zapis se ne izgubi.
4. **Ko** zapis povlečem više v isti mapi, **potem** ta vrstni red velja tudi ob naslednjem
   obisku in na drugi napravi.

### User Story 4 - Popravim ali izbrišem zapis (Priority: P4)

Ime, komentar, ikono, mapo in naslov strani lahko kadar koli spremenim; zapis lahko izbrišem.

**Sprejemni scenariji**

1. **Ko** popravim ime, **potem** samodejno prebrano ime tega ne prepiše nazaj.
2. **Ko** izberem "osveži podatke strani", **potem** se ime in favicon preberata znova.
3. **Ko** zapis izbrišem, **potem** izgine s seznama in z nadzorne plošče.

### User Story 5 - Vidim jih na nadzorni plošči (Priority: P5)

Na nadzorno ploščo dodam ploščico s shranjenimi linki — nazadnje shranjeni ali izbrana mapa.

**Sprejemni scenariji**

1. **Ko** dodam ploščico, **potem** kaže moje shranjene zapise in klik odpre stran.
2. **Ko** ploščica ne deluje, **potem** ostale ploščice delujejo naprej.

### User Story 6 - Shranim link brez vmesnika (Priority: P6)

Avtomatizacija (n8n) shrani naslov strani s HTTP klicem — enako kot bi ga jaz v vmesniku.

**Sprejemni scenariji**

1. **Ko** n8n pošlje naslov strani z veljavnim API ključem, **potem** se zapis pojavi na
   mojem seznamu.
2. **Ko** isti klic ponovi z istim `Idempotency-Key`, **potem** ne nastane drugi zapis.

### Edge Cases

- Stran brez `<title>` ali brez favicona → uporabi se ime, ki ga je vpisal uporabnik, sicer
  gostitelj; namesto favicona izbrana ikona.
- Naslov, ki kaže v zasebno omrežje (`http://192.168.1.1`) → zapis je DOVOLJEN (brskalnik ga
  odpre), samodejno branje imena in favicona pa se zanj NE izvede — strežnik takega naslova
  ne obišče.
- Isti naslov shranjen dvakrat → dovoljeno, vmesnik pove, da zapis že obstaja, in ponudi
  obstoječega.
- Naslov, daljši od 2048 znakov → zavrnjen.
- Stran, ki odgovarja počasi ali vrne ogromen dokument → branje se prekine po časovni in
  velikostni meji; to ni napaka uporabniku.
- Zapis ali mapa drugega uporabnika → 404 (ne 403; obstoj tujega zapisa ni podatek).
- Vnos razporeditve na nadzorni plošči kaže na izbrisano mapo → ploščica se izriše prazna s
  pojasnilom, ne pokvarjena.

## Requirements *(mandatory)*

### Functional Requirements

#### Zapis in shranjevanje

- **FR-001**: Shranjeni link MORA imeti naslov strani (URL), ime, neobvezen komentar, neobvezno
  ikono in neobvezno mapo.
- **FR-002**: Naslov strani se pred shranjevanjem normalizira po determinističnem pravilu
  (odstranjeni robni presledki, manjkajoča shema dopolnjena v `https://`); pravilo MORA biti
  čista funkcija in enotsko testirano.
- **FR-003**: Dovoljeni shemi sta `http` in `https`; vse drugo je zavrnjeno s sporočilom,
  kaj je narobe.
- **FR-004**: Shranjevanje NE SME biti odvisno od dosegljivosti strani. Neuspešno branje
  metapodatkov ne sme preprečiti nastanka zapisa niti ga izbrisati.
- **FR-005**: Podvojen naslov je dovoljen; vmesnik na to opozori in ponudi obstoječi zapis.
- **FR-006**: Zapisi in mape so OSEBNI; poizvedba tujega zapisa vrne 404.
- **FR-007**: Naslov strani je omejen na 2048 znakov, ime na 200, komentar na 1000.

#### Samodejni metapodatki

- **FR-010**: Sistem po shranjevanju sam prebere ime strani (`<title>`), kadar ga uporabnik
  ni vpisal.
- **FR-011**: Preden strežnik obišče naslov, ga MORA preveriti isti mehanizem kot pri
  vtičnikih (zavrnjene poverilnice v naslovu, zasebni in link-local gostitelji, sheme, ki
  niso http/https). Naslov, ki preverjanja ne prestane, se ne obišče — zapis vseeno ostane
  veljaven.
- **FR-012**: Favicon MORA streči strežnik prek predpomnilnika; odjemalec NE SME nikoli
  klicati tujega gostitelja neposredno (člen VIII). Predpomni se po GOSTITELJU, ne po
  zapisu — deset zapisov istega gostitelja je en prenos.
- **FR-013**: Branje strani ima časovno in velikostno mejo; prekoračitev pomeni "ni
  podatka", ne napake uporabniku.
- **FR-014**: Ročni vnos ima vedno prednost pred samodejno prebranim. Ponovno branje se
  zgodi samo na izrecno zahtevo uporabnika.

#### Mape

- **FR-020**: Uporabnik lahko ustvari, preimenuje, zloži in izbriše mapo ter ji določi
  vrstni red.
- **FR-021**: Zapis pripada največ eni mapi; "brez mape" je veljavno stanje in ni skrito.
- **FR-022**: Brisanje mape PREMAKNE njene zapise med nerazvrščene. Brisanje mape ne sme
  nikoli izbrisati zapisa.
- **FR-023**: Mape so ena raven — gnezdenja ni.

#### Iskanje in vrstni red

- **FR-030**: Iskanje MORA zajeti ime, naslov strani in komentar, neobčutljivo na velike črke in
  na diakritiko (`cas` najde "časa").
- **FR-031**: Iskanje deluje čez vse mape hkrati, ne le znotraj odprte.
- **FR-032**: Vrstni red znotraj mape je uporabnikov in se shrani; prerazporeditev je ena
  operacija s seznamom dodelitev, ne zaporedje posamičnih popravkov.
- **FR-033**: Privzeti vrstni red novega zapisa je na vrhu njegove mape (nazadnje shranjeno
  je najbolj verjetno iskano).

#### Odpiranje

- **FR-040**: Klik na zapis odpre stran v novem zavihku, brez posredovanja poti izvorne
  strani tuji strani.

#### Nadzorna plošča

- **FR-050**: Modul prispeva ploščico z zapisi (nazadnje shranjeni ali izbrana mapa) prek
  obstoječega mehanizma razporeditve ploščic; nadzorna plošča ne sme dobiti posebne kode za
  ta modul.
- **FR-051**: Izpad te ploščice ne sme vplivati na druge ploščice.

#### API in obsegi

- **FR-060**: Vsaka operacija, ki je na voljo v vmesniku, MORA biti dosegljiva tudi s HTTP
  klicem (člen III); pogodba je OpenAPI 3.1 in se vzdržuje v istem PR-ju kot koda.
- **FR-061**: Modul ima lastna obsega za branje in pisanje; osnovna uporabniška vloga ju
  MORA dobiti, sicer je zavihek dosegljiv samo administratorju.
- **FR-062**: Mutacijski endpointi sprejmejo `Idempotency-Key` (izjema iz člena III se tu ne
  uporablja — noben endpoint tega modula ne izdaja žetonov).

#### Zavihek

- **FR-070**: Zavihek se v meni doda z enim vnosom v register zavihkov; njegova ikona MORA
  biti registrirana, sicer se izriše prazen prostor.
- **FR-071**: Zavihek MORA imeti prazno stanje (»še nič ni shranjeno« z gumbom za prvi
  vnos) in stanje nalaganja — nikoli prazen bel zaslon.

### Key Entities

- **SavedLink** — osebni zapis: naslov strani, ime, komentar, ikona, mapa, vrstni red, čas
  nastanka. Nosi tudi, ali je bilo ime prebrano samodejno ali vpisano ročno (FR-014).
- **LinkGroup** — osebna mapa: ime, vrstni red, zloženo stanje.
- **Predpomnjeni favicon** — slika, vezana na GOSTITELJA in ne na zapis, s časom osvežitve.

## Out of Scope

- Uvoz zaznamkov iz brskalnika (izrecno izločeno ob prevzemu).
- Proste oznake (izbrane so mape; oznake bi bile nov vzorec ob obstoječem).
- Deljenje zapisov med uporabniki — zapisi so osebni, po vzorcu 004.
- Shranjevanje vsebine strani (arhiv, offline kopija, branje brez omrežja).
- Redno preverjanje, ali je shranjena stran še dosegljiva — to bi pomenilo ponavljajoče
  klicanje tujih strani in je svoja odločitev, ne pritiklina te.
- Gnezdene mape.

## Success Criteria *(mandatory)*

- **SC-001**: Uporabnik shrani stran z lepljenjem naslova in enim potrditvenim klikom, v
  manj kot 10 sekundah, brez ročnega vpisovanja imena strani.
- **SC-002**: Ko je stran nedosegljiva, zapis vseeno nastane — v 100 % primerov iz testnega
  nabora.
- **SC-003**: Pri 500 shranjenih zapisih se seznam ob tipkanju v iskalno polje zoži brez
  opazne zakasnitve (pod 1 sekundo do prikaza rezultata).
- **SC-004**: Uporabnik najde shranjeno stran v treh potezah: odpri zavihek, vpiši del
  imena, klikni.
- **SC-005**: Izris seznama s 100 zapisi ne sproži nobenega klica odjemalca na tuj gostitelj
  (preverjeno v omrežnem dnevniku brskalnika).
- **SC-006**: Brisanje mape z zapisi ne izgubi nobenega zapisa.
- **SC-007**: Vsaka operacija vmesnika je izvedljiva tudi s HTTP klicem z API ključem —
  100 % pokritost, preverjeno s pogodbenimi testi.
- **SC-008**: Naslov, ki kaže v zasebno omrežje, ni nikoli obiskan s strani strežnika — v
  100 % primerov iz testnega nabora.

## Assumptions

- Zbirka je reda velikosti nekaj sto zapisov na uporabnika, ne deset tisoč; iskanje zato ne
  potrebuje posebne besedilne infrastrukture.
- Zapisi so osebni; deljenje ni predvideno (isti vzorec kot kamere in vtičniki).
- Ikone se izbirajo iz obstoječega nabora, ne vpisujejo kot prost niz (isti vzorec kot 005).
- Uporabnik je prijavljen; avtentikacija in vloge so rešene v 004 in se ne spreminjajo.
- Favicon tuje strani je javno dosegljiv brez avtentikacije; kadar ni, se uporabi ikona.
- Kakovostna vrata, točka 2: ta funkcionalnost nima predmeta za prehod na poletni/zimski
  čas, praznik na delovni dan, dopust čez mejo meseca ne neuspel klic, ki se uspešno ponovi.
  Nadomeščajo jih enotski testi normalizacije naslova, ujemanja pri iskanju (velike črke in
  diakritika), prerazporejanja in zavrnitve odhodnega naslova. To MORA biti izrecno zapisano
  tudi v načrtu.
