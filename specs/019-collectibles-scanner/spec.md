# Feature Specification: Zbirateljski skener (Collectibles Scanner)

**Feature Branch**: `016-scanner-engine` (nadaljevanje; naloga lastnika z dne 21. 10. 2026)
**Created**: 2026-10-21
**Status**: Draft
**Input**: "Collectibles Scanner v obstoječem Universal Scanner — nov tip skenerja `collectibles`
za zbirateljske kartice (najprej Pokémon) in retro igre/konzole: najde potencialno podcenjene
predmete na tržnicah, spremlja cene, prepozna različico predmeta, oceni priložnost in obvesti.
Brez nove aplikacije, brez drugega urnika, brez dvojnika obstoječe infrastrukture, brez
prepisa LEGO skenerja."

## Zakaj

LEGO skener (018) je pokazal vzorec: urnik, zagoni, zgodovina cen, obvestila in neobvezna analiza
z umetno inteligenco so skupni; tip prispeva le vire, prepoznavo, vrednotenje in prikaz.
Zbirateljski predmeti so naslednji naravni primer, a **težji glede zaupanja v podatke**: LEGO set
ima eno številko, kartica ali igra pa obstaja v desetinah različic, katerih cene se razlikujejo za
red velikosti. PSA 10 ni PSA 9, ocenjena kartica ni neocenjena, prva izdaja ni neomejena, japonska
ni angleška, loose kartuša ni CIB, PAL ni NTSC, ponaredek ni original, pokvarjena konzola ni
delujoča. Nizka zahtevana cena sama po sebi ni priložnost.

Zato ta funkcionalnost več kot polovico besedila nameni temu, **kaj sme in kaj ne sme trditi**:
različice se nikoli ne zamenjujejo, manjkajoče ostane neznano, tri vrste cenovnih podatkov
(aktivne zahtevane cene, katalogne/vodnikove ocene, preverjene dejanske prodaje) se nikoli ne
mešajo, in dobiček se izračuna samo iz preverjenih prodaj.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Iskanje zbirateljskih predmetov po mojih kriterijih (Priority: P1)

Oseba v čarovniku Skenerji izbere tip "Zbirateljski predmeti", izbere kategorijo (kartice ali
retro igre), nastavi splošne filtre (ključne besede, izključene besede, tržnica, država
prodajalca, najnižja/najvišja cena, valuta, stanje, vrsta ponudbe) in filtre kategorije, urnik,
obvestila in izbirno analizo z umetno inteligenco ter shrani. Skener po urniku vpraša vire, najde
oglase in jih prikaže z ceno, poštnino, stanjem, tržnico in sliko. Oseba ima lahko več neodvisnih
iskanj (npr. "Charizard pod 100 €", "PSA 9/10 Pokémon", "Game Boy pod 80 €").

**Why this priority**: brez tega ni funkcionalnosti; vse ostalo gradi na najdenih oglasih.

**Independent Test**: testni vir z izmišljenimi oglasi: po zagonu ima skener rezultate z atributi
zbirateljskega predmeta; drugi skener z drugimi filtri ima druge rezultate; sprememba enega ne
vpliva na drugega.

**Acceptance Scenarios**:

1. **Given** iskanje kartic "Charizard pod 100 €", **When** zagon najde oglase za 80 €, 140 € in
   90 € (druga kartica), **Then** so med rezultati samo ustrezni oglasi do 100 €.
2. **Given** dve iskanji z različnima kategorijama, **When** teče zagon, **Then** vsako ima svoje
   rezultate, zgodovino, obvestila in svoj urnik.
3. **Given** namestitev brez ključev eBay, **When** oseba odpre čarovnik, **Then** je tip izbiren,
   obrazec pove, kaj manjka, in zagon to jasno sporoči.
4. **Given** iskanje z izključeno besedo "proxy", **Then** oglasi z "proxy" v naslovu niso med
   rezultati.
5. **Given** kategorija "retro igre", **Then** obrazec kaže filtre retro iger (platforma, regija,
   CIB/loose, delovanje), ne filtrov kartic.

### User Story 2 — Zanesljiva prepoznava različice (Priority: P1)

Vsak oglas se prepozna po pravilih svoje kategorije. Prepoznava nosi zaupanje (visoko/srednje/
nizko) in razlog v besedi. Kar ni zanesljivo prepoznano, je označeno za **ročni pregled** in
**nima ocene priložnosti**.

Kartice: katalogni zapis, ime, set, številka, jezik, izdaja, redkost, status ocenjevanja
(neocenjena / podjetje in ocena) in zapečatni izdelki. Retro igre: platforma, ime igre/konzole,
regija, izdaja, popolnost embalaže (loose / z navodili / CIB), stanje in delovanje.

**Why this priority**: napačna različica pomeni napačno vrednost — najdražja napaka funkcionalnosti.

**Independent Test**: tabela naslovov oglasov → pričakovana identiteta, zaupanje in oznaka;
vključno s podobnimi različicami.

**Acceptance Scenarios**:

1. **Given** "Charizard 4/102 Base Set 1st Edition PSA 9", **Then** različica: prva izdaja, ocenjena
   PSA 9; ne šteje za enako PSA 10 ali neocenjeni kartici.
2. **Given** dve kartici z enakim imenom in številko, ena japonska, ena angleška, **Then** nista
   enaki in se ne primerjata med sabo.
3. **Given** "Pikachu reverse holo" in "Pikachu holo", **Then** sta različni različici.
4. **Given** "Super Mario World SNES PAL" in "… NTSC", **Then** regiji se ne zamenjujeta.
5. **Given** "Zelda Ocarina of Time N64 cartridge only" in "… CIB", **Then** loose in CIB se ne
   primerjata med sabo.
6. **Given** naslov z "reproduction", "repro", "proxy" ali "custom", **Then** je označeno kot
   reprodukcija in nima ocene priložnosti kot original.
7. **Given** "Game Boy defekt / for parts", **Then** ni enak delujoči konzoli.
8. **Given** naslov brez zadostnih podatkov (npr. samo "Pokemon karta rare"), **Then** je
   označeno za ročni pregled, brez ocene priložnosti.

### User Story 3 — Ocena vrednosti iz označenih podatkov (Priority: P1)

Za prepoznano različico skener prikaže vrednost, pri čemer so tri vrste podatkov **vedno ločene
in označene**: (a) aktivne zahtevane cene (primerljivi oglasi), (b) katalogna/vodnikova ocena
(npr. tržne cene kataloga kartic ali cenika retro iger), (c) preverjene dejanske prodaje. Brez
preverjenih prodaj se ocena prikaže kot **ocena** in **dobiček se ne izračuna**. Kadar podatkov
ni ali jih je premalo, je rezultat "premalo podatkov".

**Why this priority**: vrednost je razlog za obstoj skenerja, a napačna številka je dražja od
manjkajoče.

**Independent Test**: fiksni odgovori virov: ob preverjenih prodajah je vrednost označena kot
preverjena; ob samo katalogni oceni je označena kot ocena brez dobička; ob ničemer "premalo
podatkov".

**Acceptance Scenarios**:

1. **Given** preverjene prodaje za različico, **Then** se prikažejo povprečje/mediana, število
   prodaj in zaupanje, označeno kot "preverjene prodaje".
2. **Given** samo katalogna ocena, **Then** se prikaže "ocena (katalog)", dobiček je neznan z
   razlogom.
3. **Given** samo aktivni primerljivi oglasi, **Then** so prikazani kot "zahtevane cene", nikoli
   kot prodajne.
4. **Given** retro igra in namestitev brez ključa za cenik retro iger, **Then** je vrednost
   "premalo podatkov" in zagon deluje normalno.
5. **Given** primerljivi podatki različnih različic (npr. PSA 9 in PSA 10), **Then** se ne
   mešajo v isto vrednost.

### User Story 4 — Ocena priložnosti z vidnim izračunom (Priority: P2)

Za rezultate z zadostnimi podatki se izračuna: cena, poštnina, davki, provizije kupca, skupni
nakupni strošek, konservativna preprodajna vrednost, provizije prodaje, rezerva za tveganje,
možni čisti dobiček in ROI — vsaka postavka vidna. Rezerva za tveganje je višja za kategorije s
tveganjem ponaredkov, reprodukcij, nepreverjene ocene ali manjkajoče opreme. Vedno je označeno
kot ocena, ne zagotovilo. Nizka cena sama ne pomeni priložnosti.

**Why this priority**: zaključek vrednosti, a se opira na US2 in US3.

**Independent Test**: čista funkcija s fiksnimi vhodi; manjkajoč vhod → dobiček neznan z razlogom.

**Acceptance Scenarios**:

1. **Given** vsi vhodi znani in preverjene prodaje, **Then** so vse postavke vidne in dobiček in
   ROI izračunana.
2. **Given** neznana poštnina, **Then** poštnina ni 0, dobiček je neznan, razlog je naveden.
3. **Given** prodajalec izven EU, **Then** davki niso 0 in dobiček je neznan.
4. **Given** neocenjena kartica z visoko ceno, **Then** je rezerva za tveganje višja kot pri
   nizko cenjenem retro predmetu ob enakih ostalih vhodih (po nastavljivih parametrih).
5. **Given** filter "najmanjši dobiček", **Then** so brez znanega dobička izločeni.

### User Story 5 — Sledenje spremembam in obvestila (Priority: P2)

Skener zazna nov oglas, znižanje/zvišanje cene, spremembo ponudbe na dražbi, umik oglasa, ponovno
pojavitev in pomembno spremembo atributa. Obvestilo dobi lastnik za: nov ustrezen predmet,
znižanje cene, na novo ugotovljen podcenjen predmet (dobiček prvič nad pragom), dražbo, ki se
kmalu izteče. Brez dvojnih obvestil.

**Why this priority**: iz pregledovanja naredi opozarjanje, a stoji na prejšnjih zgodbah.

**Independent Test**: štirje zaporedni zagoni testnega vira z novim oglasom, znižanjem cene,
dražbo pred iztekom in umikom.

**Acceptance Scenarios**:

1. **Given** prvi zagon, **Then** novi oglasi sprožijo obvestilo (ali samo tisti nad pragom
   dobička, če je prag nastavljen).
2. **Given** oglas pocenjen med zagonoma, **Then** je zabeležen in obvestilo poslano enkrat.
3. **Given** dražba, ki se izteče v nastavljenih urah, **Then** obvestilo poslano enkrat.
4. **Given** oglas, ki izgine, **Then** je označen "ni več na voljo", ne "prodano".
5. **Given** dražba z zadnjo vidno ponudbo, **Then** ta ni prikazana kot končna prodajna cena.

### User Story 6 — Izbirna analiza z umetno inteligenco (Priority: P3)

Na vsakem iskanju je stikalo "analiza z UI", privzeto izklopljeno. Ob vklopu se analizirajo samo
obetavni oglasi po osnovnem filtriranju: možne različice, podatki iz opisa, sumljivi opisi,
manjkajoči deli, razlaga priložnosti in tveganj; neobvezno tudi slike. UI nikoli ne trdi, da je
predmet pristen ali ponaredek na podlagi fotografij, in ne izmišlja vrednosti ali stroškov
popravila. Ob izklopu ni nobenega klica in ostalo deluje enako.

**Why this priority**: dodatek; osnovna vrednost deluje brez njega.

**Independent Test**: dva skenerja, en z vklopom; samo prvi sproži analizo; mejni primeri iz
obstoječe analize (omejitve, predpomnilnik) veljajo.

**Acceptance Scenarios**:

1. **Given** izklopljena analiza, **Then** zagon ne naredi nobenega klica ponudniku.
2. **Given** vklopljena analiza, **Then** so analizirani samo oglasi, ki so prestali osnovne
   filtre, in rezultat je viden na podrobnostih z označbo tveganja.
3. **Given** analiza, **Then** ne vsebuje trditve o pristnosti iz slik niti številčnih vrednosti.

### User Story 7 — Rezultati in podrobnosti (Priority: P2)

Seznam prikaže sliko, ime, kategorijo, izdajo/različico, stanje, tržnico, ceno, poštnino, ocenjeno
vrednost (z oznako vrste), možni dobiček, ocene priložnosti in kazalnik tveganja UI. Podrobnosti
prikažejo originalni oglas, katalogne podatke, zaupanje prepoznave, zgodovino cen, primerljive
oglase, razlago vrednosti, izračun priložnosti, analizo UI in povezavo na tržnico. Besedila so
slovenska po obstoječih konvencijah.

**Independent Test**: komponentni testi z fiksnimi rezultati: vsaka oznaka in manjkajoča vrednost
se prikažeta pravilno.

**Acceptance Scenarios**:

1. **Given** rezultat brez ocene vrednosti, **Then** seznam kaže "premalo podatkov", ne 0 €.
2. **Given** rezultat za ročni pregled, **Then** je to jasno označeno in ocene priložnosti ni.

### Edge Cases

- Vir oglasov ne odgovori: zagon se konča kot neuspešen, obstoječi rezultati se ne označijo kot
  nedosegljivi.
- Katalog ali cenik izpade: zagon se ne ruši; rezultati so z manj podatki in to povedo.
- Oglas v drugi valuti kot cenik: primerjava ni mogoča, brez pretvorbe.
- Oglas z več predmeti ("lot", "bundle"): ni ene različice, brez ocene priložnosti.
- Isti predmet na več tržnicah ali dvojno objavljen: dedup po identiteti oglasa.
- Prekoračena dnevna meja zahtevkov virov: zagon dobi delne rezultate in napako, ne molči.
- Oglas brez slike ali opisa: manjkajoče ostane neznano.
- Kategorija, ki je odstranjena ali neznana v shranjeni nastavitvi: iskanje se ne zažene, lastnik
  dobi jasno sporočilo.

## Requirements *(mandatory)*

### Functional Requirements

**Registracija in nastavitve**

- **FR-001**: Sistem MUST ponuditi tip skenerja "Zbirateljski predmeti" (`collectibles`) v obstoječem
  jedru skenerjev, brez novega urnika, brez nove aplikacije in brez sprememb obnašanja drugih
  tipov.
- **FR-002**: Uporabnik MUST lahko ustvari več neodvisnih iskanj; vsako ima svoje filtre, vire,
  urnik, obvestila in stikalo analize UI.
- **FR-003**: Kategorije MUST biti razširljiv register; vsaka kategorija ima svojo shemo nastavitev
  in svoj obrazec. Začetni kategoriji: zbirateljske kartice (Pokémon) in retro igre. Dodajanje
  nove kategorije ne sme zahtevati sprememb jedra skenerjev.
- **FR-004**: Splošni filtri MUST vključevati: ime, kategorijo, ključne besede, izključene besede,
  tržnico, državo prodajalca, najnižjo/najvišjo ceno, valuto, stanje, vrsto ponudbe, najmanjši
  ocenjeni popust, najmanjši dobiček, urnik, obvestila in stikalo UI.
- **FR-005**: Filtri kartic MUST vključevati igro, set, številko kartice, jezik, izdajo, podjetje
  ocenjevanja, oceno in neocenjeno/ocenjeno. Filtri retro iger MUST vključevati platformo, model
  konzole, regijo, izdajo, CIB/loose in stanje delovanja.
- **FR-006**: Shranjena nastavitev se MUST ob vsakem zagonu znova preveriti; neveljavna ali neznana
  kategorija MUST ustaviti zagon z jasnim razlogom.

**Viri**

- **FR-007**: Oglasi MUST priti iz obstoječe eBay integracije (Browse), ki se izvleče v skupno
  mesto in jo uporabljata LEGO in zbirateljski skener; skupna koda MUST podpirati poljubno
  kategorijo tržnice. Obstoječi LEGO testi MUST ostati nespremenjeni in zeleni.
- **FR-008**: Katalog Pokémon kartic MUST biti TCGdex (brez ključa, večjezičen); katalogne cene so
  ocene, ne transakcijske cene. Pokémon TCG API je zastarel in ni vir.
- **FR-009**: Cenik retro iger (PriceCharting) MUST biti izbirni vir, vklopljen samo, ko je v okolju
  strežnika nastavljen njegov ključ; brez ključa retro rezultati nimajo vrednosti in so označeni
  "premalo podatkov". Nobenega vira ne sme biti treba obiti prek CAPTCHA, prijave ali zaščite pred
  roboti.
- **FR-010**: Vsak vir MUST iti prek skupnega predpomnilnika, dnevne meje in razmika zahtevkov;
  izpad vira (razen oglasov) ne sme podreti zagona.
- **FR-011**: Cardmarket, Bolha in drugi viri brez preverjenega dovoljenega dostopa NISO v obsegu;
  arhitektura MUST dopuščati dodajanje vira brez sprememb ostale kode.
- **FR-012**: Skrivnosti MUST ostati izključno v okolju strežnika; `.env.example` in
  `docs/env-reference.md` MUST biti posodobljena samo za dejansko dodane spremenljivke.

**Prepoznava**

- **FR-013**: Prepoznava MUST biti posebna za vsako kategorijo, deterministična, in vrniti vrsto,
  zaupanje (visoko/srednje/nizko) in razlog.
- **FR-014**: Različice MUST biti ločene: ocenjena ≠ neocenjena; različne ocene ≠ enake; prva
  izdaja ≠ neomejena; japonska ≠ angleška; reverse holo ≠ holo; loose ≠ CIB ≠ le kartuša/disk;
  PAL ≠ NTSC; original ≠ reprodukcija; pokvarjeno ≠ delujoče.
- **FR-015**: Negotova prepoznava MUST biti označena za ročni pregled in MUST NOT imeti ocene
  priložnosti. Reprodukcije, "lot"/paketi in deli niso enaki posamičnemu originalnemu predmetu.
- **FR-016**: Podatki, ki jih vir ne pove (stanje, jezik, ocena, popolnost), MUST ostati
  "neznano"; nič se ne domneva.

**Vrednotenje in priložnost**

- **FR-017**: Rezultat vrednotenja MUST ločeno nositi: aktivne zahtevane cene, katalogno/vodnikovo
  oceno in preverjene prodaje, vsako z oznako vrste, številom primerkov in zaupanjem. Vrste se
  MUST NOT mešati in cene se MUST NOT izmišljati.
- **FR-018**: Dobiček in ROI MUST biti izračunana samo iz preverjenih prodaj; brez njih sta neznana
  z razlogom, vrednost pa je označena kot ocena ali "premalo podatkov".
- **FR-019**: Izračun priložnosti MUST uporabiti skupno računsko jedro z LEGO, a s parametri
  zbirateljskega skenerja (provizije prodaje, konservativnost, rezerva za tveganje, provizija
  kupca), ki so ocene lastnika namestitve; LEGO obdrži svoje vrednosti. Vsaka postavka je vidna,
  rezultat označen kot ocena, ne zagotovilo.
- **FR-020**: Poštnina je znana samo za fiksni strošek, sicer neznana (ne 0); davki za prodajalca
  izven EU neznani; valuta oglasa, drugačna od cenika, onemogoči primerjavo.
- **FR-021**: Rezerva za tveganje MUST upoštevati tveganja ponaredkov, reprodukcij, napačne izdaje,
  manjkajoče opreme, poškodb, nepreverjene ocene in negotove pristnosti.
- **FR-022**: Model ocenjevanja ostane kot pri LEGO (popust, dobiček, ROI); nova številska ocena
  se ne uvaja.

**Spremembe, obvestila, urnik**

- **FR-023**: Zaznava sprememb MUST uporabljati obstoječo zgodovino cen in zaznati: nov oglas,
  znižanje, zvišanje, spremembo ponudbe na dražbi, umik, ponovno pojavitev in pomembno spremembo
  atributa. Umik ni "prodano"; zadnja vidna ponudba ni končna cena.
- **FR-024**: Obvestila MUST uporabljati obstoječi izhodni nabiralnik in pravila lastništva, za:
  nov predmet, znižanje cene, na novo podcenjen predmet, dražbo pred iztekom in pomembno
  spremembo; brez dvojnikov.
- **FR-025**: Urnik, ročni zagon, zgodovina zagonov, ponovitve, omejitev hitrosti in preprečitev
  prekrivanja MUST uporabljati obstoječi skupni urnik; drugega urnika ni.
- **FR-026**: Avtentikacija in dovoljenja MUST uporabljati obstoječe obsege in pravila lastništva;
  uporabnik vidi samo svoja iskanja in rezultate.

**Analiza z umetno inteligenco**

- **FR-027**: Analiza MUST uporabiti obstoječi generični procesor (017), je na vsakem iskanju
  izklopljena po privzetku, in ob izklopu ne sme narediti nobenega klica ponudniku.
- **FR-028**: Ob vklopu MUST analizirati samo obetavne oglase po osnovnem filtriranju, z
  veljavnim strukturiranim izhodom, predpomnilnikom in mejami porabe. Ne sme trditi pristnosti iz
  slik, izmišljati vrednosti ali stroškov popravila; vhod ne vsebuje podatkov o osebah.

**Odjemalec**

- **FR-029**: Čarovnik MUST dinamično prikazati obrazec izbrane kategorije in znova uporabiti
  obstoječe kontrole (ime, viri, urnik, obvestila, stikalo UI).
- **FR-030**: Seznam in podrobnosti MUST prikazati polja iz zgodb 7; besedila slovenska po
  obstoječih konvencijah; manjkajoče vrednosti kot "neznano" oziroma "premalo podatkov".

**Kakovost**

- **FR-031**: Odstranitev tipa MUST biti brisanje mape modula na obeh straneh in dveh vrstic
  registracije; jedro in ostali tipi tečejo naprej.
- **FR-032**: Testi MUST biti deterministični (fiksni podatki, mock odgovori virov) in pokrivati
  registracijo, konfiguracijo kategorij, ponovno uporabo eBay povezave, prepoznavo kartic in
  retro iger, ločevanje ocenjenih/neocenjenih in loose/CIB, regije, zgodovino cen, dedup,
  vrednotenje, priložnost, manjkajoče podatke, UI vklop/izklop, urnik, obvestila, dovoljenja,
  izpade virov in odstranitev tipa.

### Key Entities

- **Zbirateljski predmet (rezultat)**: oglas na tržnici s kategorijo, imenom, različico (izdaja,
  jezik, regija, ocena, popolnost), stanjem, vrsto ponudbe, državo prodajalca in morebitnim koncem
  dražbe; nosi prepoznavo, vrednotenje in priložnost.
- **Kategorija**: registrirana vrsta zbirateljskih predmetov z lastno shemo nastavitev, filtri in
  pravili prepoznave in vrednotenja.
- **Prepoznava**: vrsta, katalogni zapis (če obstaja), zaupanje, razlog, ali je potreben ročni
  pregled.
- **Vrednotenje**: tri ločeni nizi cenovnih podatkov (zahtevane cene, katalogna ocena, preverjene
  prodaje) z oznako vrste, številom primerkov in zaupanjem.
- **Priložnost**: razčlenjen izračun (cena, poštnina, davki, provizije, rezerva, dobiček, ROI) z
  manjkajočimi vhodi.
- **Iskanje (definicija skenerja)**: shranjene nastavitve, urnik, obvestila in stikalo UI.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Oseba ustvari iskanje (kategorija, filtri, urnik) v manj kot 3 minutah in po prvem
  zagonu vidi rezultate.
- **SC-002**: V testni zbirki naslovov 100 % parov, ki so po pravilih FR-014 različni (ocena,
  izdaja, jezik, regija, popolnost, original/reprodukcija), ni označenih kot enakih.
- **SC-003**: Noben rezultat brez zanesljive prepoznave ali brez preverjenih prodaj nima
  prikazanega dobička; vsak tak ima prikazan razlog.
- **SC-004**: Noben prikazan znesek vrednosti ni brez oznake vrste (zahtevana cena / ocena /
  preverjena prodaja).
- **SC-005**: Dogodek (nov oglas, znižanje, dražba) sproži natanko eno obvestilo na prejemnika;
  ponovni zagoni brez spremembe ne sprožijo nobenega.
- **SC-006**: Z izklopljeno analizo UI je število klicev ponudniku UI enako 0 v vseh zagonih.
- **SC-007**: Vsi obstoječi testi (vključno z LEGO) in novi testi so zeleni; `typecheck` in `lint`
  sta čista tudi po odstranitvi tipa.
- **SC-008**: Izpad enega vira (razen oglasov) ne podre zagona; izpad vira oglasov ne označi
  obstoječih rezultatov kot nedosegljive.

## Assumptions

- Obstoječe jedro skenerjev (016), analiza UI (017) in LEGO vzorec (018) so na voljo in stabilni.
- eBay ključi (`EBAY_CLIENT_ID/SECRET`) in OpenAI ključ so v okolju strežnika; zbirateljski skener
  jih ponovno uporabi.
- Kategorijske ID-je in aspekte eBay za kartice in retro igre je treba ob izvedbi preveriti pri
  živem API-ju; v spec niso predpostavljeni.
- TCGdex je dostopen brez ključa; licenca in omejitve hitrosti se preverijo ob načrtovanju.
- PriceCharting je plačljiv; brez naročnine retro vrednotenje ne deluje in je to sprejemljivo.
- Brez preverjenih prodaj za kartice ni izračuna dobička; samo katalogna ocena ni dovolj.
- Parametri provizij in rezerv so ocene lastnika namestitve, ne tržna dejstva.
- Izven obsega: ure, kovanci, bankovci, figure, stripi, vinili, kamere (le pripravljenost
  registra kategorij), Cardmarket, Bolha, obhod zaščit pred roboti.
- Podatki v bazi so pogrešljivi (brez migracij), kot velja za obstoječe skenerje.
