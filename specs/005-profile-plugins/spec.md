# Feature Specification: Osebni profil, vtičniki in konfigurabilni meni

**Vhodno gradivo**: `nacrt/005-profile-plugins/spec.md`
**Datum**: 2026-08-26
**Stanje**: implementirano

## Zakaj

Uporabniška pripomba po prvem resnem pogledu na delujočo aplikacijo je bila kratka in
utemeljena: *"zelo slab UI. Ni menija, dashboard je slab, manjkajo podatki."*

Pregled je pokazal, da so za to trije različni vzroki, ne eden:

1. **Ogrodje je bilo pokvarjeno na treh mestih hkrati.** Ikone niso bile registrirane
   (`addIcons()` ni bil klican nikjer), zaradi česar je bila vsaka postavka menija brez
   ikone; `<ion-menu>` je bil zavit v ovojno komponento in zato visok 0 px, torej menija
   sploh ni bilo videti; temna paleta Ionica ni bila uvožena, zato preklop teme ni imel
   učinka. Nič od tega ni bila oblikovna izbira — bile so napake.
2. **Nastavitve, ki so se shranjevale, a jih ni bral nihče.** `Settings.weather` je zaslon
   pisal, strežnik pa je vseeno uporabljal `ARSO_DEFAULT_LOCATION` iz `.env`.
   `Settings.tabs` je strežnik razreševal, a ga ni znal zapisati noben zaslon.
3. **Manjkajoče funkcionalnosti**: uporabnik ni mogel dodati svoje ploščice, ni mogel
   spremeniti naslovov virov brez dostopa do strežnika, in ni videl, kateri vir se sploh
   uporablja za beleženje časa.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Vidim, kje sem in kam lahko grem (Priority: P1) 🎯 MVP

Po prijavi vidim meni z ikonami, označeno trenutno stranjo, svojim imenom in gumbom za
odjavo. Na ozkem zaslonu je meni dosegljiv z gumbom v glavi, ne le s potegom prsta.

**Sprejemni scenariji**

1. **Ko** se prijavim na širokem zaslonu, **potem** je meni razprt ob levem robu, postavke
   imajo ikone, trenutna stran je barvno označena.
2. **Ko** okno zožim pod 768 px, **potem** se meni skrije, pojavi se gumb v glavi in spodnja
   vrstica zavihkov; med 768 in 992 px navigacija ni nedosegljiva.
3. **Ko** kliknem odjavo, **potem** me sistem odjavi tudi pri Keycloaku.

### User Story 2 - Dodam si svojo ploščico (Priority: P2)

V profilu dodam poljubno mnogo lastnih ploščic ("vtičnikov") ene od štirih vrst: povezava,
vdelana stran, zunanja slika, podatek iz JSON vira.

**Sprejemni scenariji**

1. **Ko** dodam vtičnik vrste "povezava", **potem** se takoj pojavi na nadzorni plošči kot
   kartica z gumbom.
2. **Ko** dodam vtičnik vrste "podatek iz JSON" in vpišem pot `observation.t`, **potem**
   ploščica izpiše vrednost tega polja; če poti v odgovoru ni, to izrecno pove (in ne
   pokaže prazne vrednosti).
3. **Ko** vpišem naslov, ki ni `https` ali kaže v lokalno omrežje, **potem** je zavrnjen s
   sporočilom, kaj je narobe.
4. **Ko** vtičnik izbrišem, **potem** izgine z nadzorne plošče, druge ploščice pa ostanejo.

### User Story 3 - Naslovi virov so moji, ne sistemski (Priority: P3)

V profilu prepišem naslov vremenskega vira, radarske slike ali osnovni naslov spletnih
kamer. Prazno polje pomeni, da velja sistemski privzetek.

**Sprejemni scenariji**

1. **Ko** vpišem svoj vremenski naslov, **potem** se moje vreme bere od tam, vreme drugih
   uporabnikov pa se ne spremeni.
2. **Ko** polje izpraznim, **potem** spet velja privzetek iz `.env`.
3. **Ko** spremenim lokacijo za vreme, **potem** se prikazano vreme dejansko spremeni.

### User Story 4 - Meni je moj (Priority: P4)

V profilu izklopim zavihke, ki jih ne uporabljam, in preuredim vrstni red preostalih.

**Sprejemni scenariji**

1. **Ko** izklopim zavihek "Kamere", **potem** izgine iz menija in njegova pot ni več
   dosegljiva.
2. **Ko** poskusim izklopiti "Nastavitve", **potem** je to zavrnjeno — brez njih se ne bi
   mogel vrniti.
3. **Ko** spremenim vrstni red, **potem** se meni prerazporedi brez ponovnega nalaganja.

### User Story 6 - Vsako nastavitev razumem brez ugibanja (Priority: P6)

Ob vsaki nastavitvi je znak "?", ki odpre pojasnilo: kaj nastavitev je, kako se nastavi in
kaj velja, če je ne nastavim.

**Sprejemni scenariji**

1. **Ko** kliknem "?" ob nastavitvi, **potem** se odpre okno s pojasnilom in koraki.
2. **Ko** ima nastavitev privzeto vrednost, **potem** pojasnilo pove, kaj velja, če polje
   pustim prazno.

### User Story 5 - Vidim, kateri vir se beleži (Priority: P5)

V meniju pod "Beleženje časa" vidim, katera lokacija in kateri portal sta v uporabi, in ali
je seja pri delodajalcu še veljavna.

**Sprejemni scenariji**

1. **Ko** imam nastavljeno lokacijo, **potem** meni pokaže njeno ime in gostitelja portala.
2. **Ko** se seji izteka, **potem** je ob postavki opozorilna značka.
3. **Ko** lokacije nimam, **potem** meni to pove, namesto da bi molčal.

### Edge Cases

- Vnos razporeditve kaže na izbrisan vtičnik → ploščica se preskoči, ostale delujejo.
- Vir vtičnika je nedosegljiv → prikaže se zadnji znani podatek z oznako starosti.
- Vir vrne nekaj, kar ni JSON → ploščica pove, da podatka ni; druge ploščice niso prizadete.
- Ime ikone, ki ni registrirano → ploščica se izriše brez ikone, ne prazna.
- Dva uporabnika z vtičnikom istega imena → dovoljeno (edinstvenost je v obsegu uporabnika).

## Requirements *(mandatory)*

### Functional Requirements

#### Ogrodje in videz

- **FR-101**: Vsaka ikona, ki jo uporabi register zavihkov, MORA biti registrirana pri
  zagonu; test to preverja, ker imena prihajajo s strežnika in jih prevajalnik ne vidi.
- **FR-102**: Temna tema MORA delovati, tako po sistemski nastavitvi kot po izrecni izbiri.
- **FR-103**: Meni MORA biti dosegljiv pri vsaki širini zaslona.
- **FR-104**: V vmesniku MORA obstajati odjava.
- **FR-105**: Nadzorna plošča MORA imeti prazno stanje in stanje nalaganja, nikoli prazen
  bel zaslon.

#### Vtičniki

- **FR-110**: Uporabnik lahko definira poljubno mnogo lastnih ploščic štirih vrst: `link`,
  `iframe`, `image`, `json`.
- **FR-111**: Vtičniki so OSEBNI; tuj zapis vrne 404.
- **FR-112**: Naslov vtičnika MORA biti `https`, brez poverilnic in ne sme kazati v
  lokalno/zasebno omrežje. Preverjeno ob shranjevanju IN ob vsakem prenosu.
- **FR-113**: Vira vrst `image` in `json` MORA prenesti strežnik prek predpomnilnika
  (člen VIII); odjemalec zunanjega vira ne kliče nikoli.
- **FR-114**: Najkrajši interval osveževanja je 30 s.
- **FR-115**: Razporeditev vtičnikov je v `Settings.tiles` — en sam vir resnice za vrstni
  red in vidnost, skupaj z vgrajenimi ploščicami.
- **FR-116**: Nov vtičnik se TAKOJ doda v razporeditev; uporabnik ga ne sme ustvariti in ne
  videti.
- **FR-117**: Širina ploščice vtičnika se nastavi v slikovnih točkah (200–1600 px, privzeto
  320 px), enako kot višina vdelane strani. Vrednost je zgornja meja: na ožjem zaslonu se
  ploščica zoži na razpoložljivo širino.
- **FR-118**: Klik na ploščico vtičnika (razen vrste `link`) jo odpre v skoraj celozaslonskem
  modalnem oknu. Pri vdelani strani klik ne sme pristati v tuji strani — pregled je pregled,
  modal je mesto za delo.

- **FR-119**: Vdelana stran MORA delovati tudi takrat, ko tuji predvajalnik preverja izvor
  zahteve. Okvir zato pošlje `strict-origin-when-cross-origin` (tuja stran izve samo naš
  izvor, nikoli poti) in dovoli `autoplay`, `fullscreen`, `encrypted-media` ter
  `picture-in-picture`. `no-referrer` je bil zavrnjen z merjenjem, ne z mnenjem: YouTube ob
  njem vrne "Napaka 153" in ploščica ostane črna. Isti nabor atributov velja za vdelavo pri
  kamerah (003) — ista vdelava ne sme delovati v enem zaslonu in v drugem ne.
  V polje naslova je poleg tega mogoče prilepiti CEL `<iframe …>` (kot ga ponudi YouTube pod
  "Deli → Vdelaj") ali YouTube naslov za gledanje: aplikacija iz prvega vzame `src`, drugo
  pretvori v naslov za vdelavo, in oboje IZPIŠE pod poljem, da je popravek viden in
  razveljavljiv. Logika je skupna s 003 (`core/embeds/embed-address.ts`), ker modul ne sme
  uvažati iz modula (člen I).

#### Viri podatkov

- **FR-120**: `Settings.sources` prepiše sistemski privzetek iz `.env`; prazna vrednost
  pomeni privzetek.
- **FR-121**: Ključ predpomnilnika MORA vsebovati razrešeni naslov, da osebni vir ne
  zastrupi skupnega predpomnilnika.
- **FR-122**: Dashboard MORA brati lokacijo iz `Settings.weather` (odpravlja
  `TODO(US3/US6, T081+)`).

#### Pojasnila v nastavitvah

- **FR-125**: Vsaka nastavitev MORA imeti dosegljivo pojasnilo, ki pove KAJ nastavitev je,
  KAKO se nastavi in KAJ VELJA, če je ne nastaviš.
- **FR-126**: Besedila pojasnil živijo na ENEM mestu, ne razsuta po predlogah, in ključ, ki
  ga predloga uporabi, mora obstajati (uveljavljeno s tipom).

#### Ureditev nastavitev

- **FR-127**: Zaslon Nastavitve je razdeljen na sklope; sklop **Moduli** ima drugo raven
  zavihkov, po enega na modul, ki prispeva nastavitve. Razdelki enega modula NE SMEJO biti
  pomešani med razdelke drugega, naslov razdelka pa ne nosi imena modula kot predpone — to
  pove zavihek. Modul, ki nastavitev ne prispeva, zavihka nima (prazen zavihek je slabši od
  nobenega). Razlog je isti kot pri členu I ustave: modul prispeva svoj kos, gostitelj ga ne
  pozna — ko modulov ni več eden, mora to biti vidno tudi v vmesniku, ne le v drevesu
  datotek.

#### Meni

- **FR-130**: Zavihke je mogoče vklopiti/izklopiti in prerazporediti iz vmesnika.
- **FR-131**: Zavihka `settings` NI mogoče izklopiti; uveljavljeno na strežniku.
- **FR-132**: Modul lahko svojemu zavihku prispeva podnaslov in stanje vira, ne da bi
  `platform/tabs` poznal modul (člen I).
- **FR-133**: Podnaslov NE SME nikoli vsebovati vrednosti sejnega piškotka (FR-092 iz 002).

### Key Entities

- **DashboardPlugin** — per-user definicija ploščice: `name`, `icon`, `kind`, `url` in
  polja, odvisna od vrste. Razporeditve NE vsebuje.
- **Settings.sources** — trije neobvezni naslovi virov.
- **TabDetail** — podnaslov in stanje, ki ju zavihku prispeva modul.

## Out of Scope

- Prehod z Ionica na drug CSS.
- i18n (slovenščina ostane trdo zapisana, člen X to dovoljuje).
- Dinamično generiranje Angular poti iz registra zavihkov (odprto od 001).
- Globalne admin nastavitve nad `.env` (izbrana je dvonivojska varianta `.env` → oseba).
- Deljenje vtičnikov med uporabniki.

## Success Criteria *(mandatory)*

- **SC-101**: Po prijavi je meni viden z ikonami in označeno trenutno stranjo, pri širinah
  od 360 px do 2560 px.
- **SC-102**: Uporabnik doda vtičnik vsake od štirih vrst in ga vidi na nadzorni plošči,
  brez posega v kodo.
- **SC-103**: Naslov, ki kaže v zasebno omrežje, je zavrnjen v 100 % primerov iz testnega
  nabora.
- **SC-104**: Sprememba osebnega vira ne spremeni podatkov drugega uporabnika.
- **SC-105**: Izklopljen zavihek izgine iz menija in njegova pot ni dosegljiva; `settings`
  se ne da izklopiti.
- **SC-106**: V meniju je razvidno, katera lokacija se beleži in v kakšnem stanju je seja.

## Assumptions

- Vtičnik je oseben; deljenje ni predvideno.
- Ikone se izbirajo iz nabora, ne vpisujejo kot prost niz.
- `.env` ostane sistemski privzetek — namestitev mora delovati takoj po `docker compose up`.
