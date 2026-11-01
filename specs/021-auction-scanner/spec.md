# Feature Specification: Dražbeni skener (Auction Scanner)

**Feature Branch**: `016-scanner-engine` (nadaljevanje; brez nove veje, kot 018 in 019)
**Created**: 2026-10-21
**Status**: Draft
**Input**: "Razširi Universal Scanner z odkrivanjem, spremljanjem in vrednotenjem dražb: en tip
skenerja `auctions` (nastavljive kategorije in države; EU dražbe in poslovne likvidacije sta
načina/konfiguraciji, ne ločena tipa), slovenski viri (SodneDrazbe.si, FURS eDražbe, AJPES,
GOV.SI javne objave), e-Justice kot referenčni vir, skupni ocenjevalnik priložnosti dražb.
Brez nove aplikacije, brez drugega urnika, brez dvojnika obstoječe infrastrukture, brez
avtomatskega licitiranja ali nakupa."

**Opomba o številčenju**: vzporedno nastaja `specs/020`; ta specifikacija je namenoma 021 in se
je ne dotika. Pred izvedbo je treba preveriti, da 020 ne spreminja skupnih točk (register tipov,
skupni viri, izhodni nabiralnik) na nezdružljiv način.

## Stanje repozitorija ob pisanju

- Dražbenega skenerja še ni. Beseda "auction" se pojavlja le kot vrsta ponudbe pri eBay (LEGO,
  zbirateljski predmeti) in ni povezana s tem modulom.
- Tipa `eu-auctions` in `business-liquidations` nista registrirana in tudi ne bosta: sta
  konfiguraciji istega tipa.
- Vzorec tipa skenerja: 018 (LEGO) in 019 (zbirateljski predmeti) — skupno jedro za urnik,
  zagone, zgodovino cen, obvestila in analizo z UI; tip prispeva vire, normalizacijo, vrednotenje
  in prikaz.

## Zakaj

Dražbe so drugačne od oglasov: začetna cena ni nakupna cena, trenutna ponudba ni končna cena,
cenitev ni tržna vrednost, varščina je pogoj sodelovanja in ne nujno strošek, roki prijave so
pogosto krajši od roka dražbe, sodelovanje je lahko samo osebno, stanje predmeta pogosto ni
znano, uradni viri pa so raznoliki in včasih nimajo strojno berljivega dostopa.

Zato ta funkcionalnost več pozornosti nameni temu, **kaj sme in kaj ne sme trditi**: manjkajoči
podatki ostanejo neznani, potrjeni podatki vira so vedno ločeni od ocen, dobiček se ne izračuna
brez zadostnih podatkov, najvišja ponudba je izrecno ocena, viri brez dovoljenega dostopa so
označeni kot nedostopni, nobena objava ni samodejno razglašena za prevaro.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Iskanje dražb po mojih kriterijih (Priority: P1)

Oseba v čarovniku Skenerji izbere tip "Dražbe", izbere vire, države in kategorije predmetov,
nastavi filtre (vir, država, regija, kategorija, ključne besede, izključene besede, najnižja/
najvišja začetna cena, najnižja cenitev, največja varščina, način dražbe, obdobje dražbe, rok
prijave, najmanjši ocenjeni popust, najmanjši možni dobiček, samo spletne dražbe, samo z
objavljeno cenitvijo, kmalu se iztečejo), urnik, obvestila in stikalo analize z UI ter shrani.
Skener po urniku vpraša vire in prikaže najdene dražbe. Oseba ima lahko več neodvisnih iskanj
(npr. "vozila FURS do 5.000 €", "nepremičnine SI", "likvidacije opreme").

**Why this priority**: brez tega ni funkcionalnosti.

**Independent Test**: testni vir z izmišljenimi dražbami: po zagonu ima iskanje rezultate z
dražbenimi atributi; drugo iskanje z drugimi filtri ima druge rezultate; sprememba enega ne vpliva
na drugo.

**Acceptance Scenarios**:

1. **Given** iskanje z največjo začetno ceno 5.000 € in kategorijo vozila, **When** zagon najde
   dražbe za 3.000 € (vozilo), 8.000 € (vozilo) in 2.000 € (oprema), **Then** je med rezultati
   samo prva.
2. **Given** dve iskanji z različnimi državami in viri, **Then** vsako ima svoje rezultate,
   zgodovino, obvestila in svoj urnik.
3. **Given** filter "samo z objavljeno cenitvijo", **Then** dražbe brez cenitve niso med rezultati.
4. **Given** izključena beseda "poškodovan", **Then** dražbe s to besedo v naslovu ali opisu niso
   rezultat.
5. **Given** način "poslovne likvidacije", **Then** so privzeto izbrani viri in vrste, ki
   ustrezajo stečajem in prodaji poslovnega premoženja, brez dvojnika tipa skenerja.

### User Story 2 — Preverjeni viri in poštena obravnava nedostopnih (Priority: P1)

Vsak vir se pred uporabo preveri: uradni naslov in izdajatelj, razpoložljiv uradni strojno berljiv
dostop (API, RSS, XML, odprti podatki), zahteve po prijavi, omejitve uporabe, omejitve hitrosti,
paginacija, svežina podatkov, razpoložljiva polja in dovoljenost samodejnega pridobivanja. Viri,
ki jih ni mogoče zanesljivo in dovoljeno povezati, so v sistemu **označeni kot nedostopni ali kot
da zahtevajo ročno nastavitev**, z razlogom, in ne vplivajo na ostale.

Obseg virov: SodneDrazbe.si (sodne dražbe), FURS eDražbe (davčne dražbe; veljavni uradni naslov
se preveri), AJPES (objave insolvenčnih postopkov — splošna objava ni dražba), GOV.SI javne
objave (prodaje državnega premoženja, javna zbiranja ponudb; nepomembne objave se filtrirajo),
European e-Justice Portal (samo odkrivanje in referenca nacionalnih sistemov; enotnega
evropskega API-ja se ne predpostavlja).

**Why this priority**: napačno ali nedovoljeno pridobivanje podatkov je večje tveganje kot
manjkajoč vir.

**Independent Test**: tabela virov z ugotovitvami preverjanja; vsak vir ima stanje (podprt /
delno / nedostopen / ročna nastavitev) in razlog; testni odgovori virov → pravilna normalizacija.

**Acceptance Scenarios**:

1. **Given** vir brez uradnega strojno berljivega ali dovoljenega dostopa, **Then** je viden kot
   nedostopen z razlogom, ni ga mogoče izbrati za zagon, in noben zagon ne poskuša obiti zaščit.
2. **Given** objava AJPES, ki je splošno obvestilo o postopku brez prodaje, **Then** ni prikazana
   kot dražba; objava s prodajo premoženja je prikazana kot dražba vrste insolvenca.
3. **Given** objava GOV.SI, ki ni prodaja ali poziv k ponudbam, **Then** je izločena.
4. **Given** vir, ki ne odgovori ali vrne napako, **Then** zagon pove, kateri vir je odpovedal,
   ostali viri vrnejo rezultate, obstoječi rezultati ne postanejo "izginili".
5. **Given** e-Justice, **Then** je prikazan samo kot referenca, ne kot vir dražb.
6. **Given** vir, ki zahteva prijavo ali ključ, **Then** je brez ključa v okolju strežnika označen
   "ročna nastavitev" in ne vrže napake pri zagonu drugih virov.

### User Story 3 — Normalizirani podatki dražbe (Priority: P1)

Vsaka dražba se prevede v skupni model: vrsta (sodna, davčna, insolvenčna, javna, zasebna),
kategorija predmeta, država, lokacija, način (spletna, osebna, pisna ponudba, neznano), začetna
cena, trenutna ponudba, cenitev, valuta, varščina (znesek ali odstotek), rok prijave, začetek,
konec, minimalni korak ponudbe, provizija kupca, dodatni stroški, davčne informacije, ogled
(možen, datum), stanje predmeta, pogoji sodelovanja in dokumenti (naslov, povezava). **Manjkajoče
ostane neznano**; datumi, cene in pogoji se nikoli ne domnevajo. Datumi se obravnavajo v pravilnem
časovnem pasu vira.

**Why this priority**: osnova za filtre, vrednotenje, spremembe in prikaz.

**Independent Test**: fiksni surovi odgovori vsakega vira → pričakovani normalizirani zapisi;
polja, ki jih vir ne vsebuje, so neznana (ne 0, ne prazen niz).

**Acceptance Scenarios**:

1. **Given** vir brez cenitve, **Then** je cenitev neznana, ne 0.
2. **Given** datum brez časovnega pasu, **Then** se razlaga po pasu vira in to je zabeleženo;
   poletni/zimski čas je pravilen.
3. **Given** varščina kot odstotek začetne cene, **Then** je odstotek ohranjen in znesek izračunan
   samo, kadar je osnova znana.
4. **Given** ista dražba iz dveh virov (npr. GOV.SI in sodni portal), **Then** je ena dražba z
   navedenima obema izvoroma, ne dvojnik.
5. **Given** dokumenti, **Then** je povezava na izvirni uradni dokument ohranjena.

### User Story 4 — Ocena priložnosti dražbe z izrecnimi predpostavkami (Priority: P1)

Skupni ocenjevalnik priložnosti (isti za vse načine dražb) iz znanih podatkov in predpostavk
lastnika iskanja izračuna, kjer je podatkov dovolj: opazno ceno, ocenjeni skupni nakupni strošek,
konservativno tržno vrednost, bruto maržo, čisti dobiček, ROI in **teoretično najvišjo priporočeno
ponudbo**. Predpostavke lastnika: želeni najmanjši dobiček, rezerva za tveganje, provizije prodaje,
poštnina/prevoz, drugi stroški. Pravila: začetna cena in trenutna ponudba nista končna cena;
cenitev ni samodejno preprodajna vrednost; varščina je običajno pogoj sodelovanja in se **ne šteje
dvakrat**; neznani davki in provizije so jasno označeni; kadar bistven podatek manjka, je rezultat
"premalo podatkov", ne izmišljen dobiček. Najvišja ponudba je označena kot ocena, ne zagotovilo.
Ocenjevalnik nikoli ne licitira ali kupuje.

**Why this priority**: vrednost za odločitev; a napačna številka je dražja od manjkajoče.

**Independent Test**: čista funkcija s fiksnimi vhodi: vsi vhodi znani → vse postavke; manjka
tržna vrednost ali bistven strošek → "premalo podatkov" z razlogom.

**Acceptance Scenarios**:

1. **Given** znana tržna ocena lastnika, provizija kupca, davek in predpostavke, **Then** so vse
   postavke vidne, dobiček, ROI in najvišja ponudba izračunani in označeni kot ocena.
2. **Given** varščina, ki se ob zmagi všteje v ceno ali se vrne, **Then** ni dvakrat zajeta v
   skupnem strošku.
3. **Given** varščina, ki ni vračljiva ali ni všteta, **Then** je kot strošek upoštevana samo,
   kadar vir to izrecno navede.
4. **Given** samo cenitev in nobene tržne ocene, **Then** je dobiček neznan ("premalo podatkov").
5. **Given** neznana provizija kupca ali davek, **Then** nista 0, dobiček je neznan, razlog naveden.
6. **Given** filter najmanjšega dobička, **Then** so dražbe brez znanega dobička izločene.
7. **Given** višja rezerva za tveganje, **Then** se najvišja ponudba ustrezno zniža.

### User Story 5 — Kazalniki tveganja (Priority: P2)

Za vsako dražbo se prikažejo kazalniki tveganja, kjer so podatki znani ali znano manjkajo:
neznano stanje, ni ogleda, manjka dokumentacija, nejasno lastništvo ali pravne omejitve, dodatne
provizije kupca, kratek rok prijave, visoka varščina, samo osebna udeležba, negotova tržna ocena,
malo primerljivih transakcij. Kazalnik je opozorilo, ne sodba: nobena dražba ni samodejno
razglašena za prevaro.

**Why this priority**: pomaga pri odločitvi, a stoji na normaliziranih podatkih.

**Independent Test**: fiksni vhodi → pričakovani nabor kazalnikov z razlago.

**Acceptance Scenarios**:

1. **Given** dražba brez podatka o stanju, **Then** je kazalnik "neznano stanje", ne "slabo stanje".
2. **Given** rok prijave čez manj kot nastavljen prag dni, **Then** je kazalnik kratkega roka.
3. **Given** katerikoli nabor kazalnikov, **Then** besedilo ne vsebuje trditve o prevari.

### User Story 6 — Sledenje življenjskemu ciklu dražbe (Priority: P2)

Skener uporablja obstoječo zgodovino in zaznavanje sprememb ter zazna: novo objavo, spremembo
začetne cene, spremembo trenutne ponudbe, preložitev, preklic, spremembo roka prijave, spremembo
konca, nove dokumente, spremembo statusa. Izginotje objave **ne pomeni uspešno zaključene
dražbe**; označeno je kot "ni več objavljeno".

**Why this priority**: iz pregledovanja naredi spremljanje.

**Independent Test**: zaporedni zagoni testnega vira s spremembami → pričakovani dogodki.

**Acceptance Scenarios**:

1. **Given** dražba, ki izgine iz vira, **Then** je "ni več objavljeno", ne "prodano/zaključeno".
2. **Given** spremenjen datum dražbe, **Then** je zabeležena preložitev s starim in novim datumom.
3. **Given** objava, ki jo vir označi kot preklicano, **Then** je status preklicano.
4. **Given** zadnja vidna ponudba, **Then** ni prikazana kot končna prodajna cena.

### User Story 7 — Obvestila (Priority: P2)

Obstoječi izhodni nabiralnik pošlje lastniku obvestilo za: novo ustrezno dražbo, bližajoč se rok
prijave, kmalu začetek dražbe, kmalu konec dražbe, znižanje cene, preložitev, preklic, pomembno
spremembo dokumentov in oceno priložnosti nad nastavljenim pragom. Brez dvojnih obvestil; upoštevajo
se lastništvo in obstoječe nastavitve obvestil.

**Why this priority**: iz spremljanja naredi opozarjanje.

**Independent Test**: zaporedni zagoni z uro, ki jo test nadzira.

**Acceptance Scenarios**:

1. **Given** rok prijave čez nastavljeno število ur, **Then** je obvestilo poslano natanko enkrat.
2. **Given** ponovni zagon brez spremembe, **Then** ni novih obvestil.
3. **Given** preklic, **Then** natanko eno obvestilo na prejemnika.
4. **Given** ocena priložnosti prvič nad pragom, **Then** obvestilo; ob ponovnih zagonih nad pragom
   ne.
5. **Given** drug uporabnik, **Then** ne dobi obvestil tujih iskanj.

### User Story 8 — Izbirna analiza z umetno inteligenco (Priority: P3)

Stikalo "analiza z UI" na vsakem iskanju, privzeto izklopljeno. Ob vklopu UI (obstoječi procesor)
povzame opise, izlušči podatke iz uradnih dokumentov, prepozna pogoje sodelovanja, izpostavi pravna
in finančna tveganja, razvrsti predmete in pojasni, zakaj dražba ustreza iskanju. UI ne izmišlja
cen, datumov, lastništva, pravnih sklepov ali zagotovljenih dobičkov; povezave na izvirne dokumente
ostanejo. Ob izklopu ni nobenega klica ponudniku.

**Why this priority**: dodatek; osnovna vrednost deluje brez njega.

**Independent Test**: dva iskanja, eno z vklopom; samo prvo sproži analizo; omejitve in
predpomnilnik iz 017 veljajo.

**Acceptance Scenarios**:

1. **Given** izklopljena analiza, **Then** je število klicev ponudniku 0.
2. **Given** vklopljena analiza in dokument vira, **Then** so izluščeni pogoji sodelovanja vidni
   z oznako "analiza UI" in povezavo na izvirnik.
3. **Given** analiza, **Then** ne vsebuje številčnih vrednosti, ki jih vir ne vsebuje, ne pravnih
   sklepov.

### User Story 9 — Rezultati in podrobnosti (Priority: P2)

Kartica dražbe prikaže: sliko (če obstaja), naslov, vir, kategorijo, državo in lokacijo, začetno
ceno, trenutno ponudbo, cenitev, varščino, način, rok prijave, konec, oceno priložnosti in povezavo
na izvirno objavo. Podrobnosti prikažejo: celoten opis, časovnico dražbe, pogoje sodelovanja,
dokumente, zgodovino cen, razčlenitev stroškov, oceno priložnosti, kazalnike tveganja in analizo UI.
**Potrjeni podatki vira so vizualno in besedilno ločeni od ocen.** Besedila so slovenska po
obstoječih konvencijah.

**Why this priority**: brez prikaza ostalo ni uporabno.

**Independent Test**: komponentni testi s fiksnimi rezultati: vsaka oznaka in manjkajoča vrednost se
prikažeta pravilno.

**Acceptance Scenarios**:

1. **Given** rezultat brez cenitve, **Then** je "neznano", ne 0 €.
2. **Given** ocena priložnosti, **Then** je označena "ocena", potrjeni zneski nimajo take oznake.
3. **Given** rezultat s premalo podatki, **Then** je to jasno in ocene ni.

### Edge Cases

- Vir brez ključa ali nedostopen: označen, zagon ostalih virov teče.
- Dražba brez cene (npr. samo poziv k ponudbam): začetna cena neznana, ocene priložnosti ni.
- Cene v drugi valuti kot nastavitve iskanja: brez samodejne pretvorbe; filtri po ceni ne
  vključujejo tuje valute brez izrecne nastavitve.
- Več predmetov v eni objavi (sklop): ena objava, brez ocene priložnosti za posamezen predmet.
- Ista dražba iz več virov: združena z navedbo vseh virov; spremembe se beležijo enkrat.
- Dražba z začetkom ali koncem v preteklosti: filtrirana glede na obdobje, ne izbrisana.
- Nelogični datumi (npr. rok prijave po začetku dražbe): ohranjeno kot v viru, označeno kot
  nedosledno, ni popravljeno.
- Dražba, ki se ponovno pojavi po umiku: ponovna pojavitev, ne nova.
- Prekoračena omejitev hitrosti vira: delni rezultati in jasna napaka.
- Shranjena nastavitev z odstranjenim virom ali državo: iskanje se ne zažene, lastnik dobi jasno
  sporočilo.
- Objava brez slike, opisa ali dokumentov: manjkajoče ostane neznano.

## Requirements *(mandatory)*

### Functional Requirements

**Registracija in nastavitve**

- **FR-001**: Sistem MUST ponuditi en tip skenerja "Dražbe" (`auctions`) v obstoječem jedru
  skenerjev, brez nove aplikacije, brez novega urnika in brez sprememb obnašanja drugih tipov.
- **FR-002**: EU dražbe in poslovne likvidacije MUST biti izvedene kot nastavitve istega tipa
  (izbira držav, virov, vrst dražbe in predizbor), ne kot ločena tipa; skupni model, vir-adapterji
  in ocenjevalnik so en sam.
- **FR-003**: Uporabnik MUST lahko ustvari več neodvisnih iskanj; vsako ima svoje filtre, vire,
  države, urnik, obvestila, predpostavke vrednotenja in stikalo analize z UI.
- **FR-004**: Filtri MUST vključevati: vir, državo, regijo, kategorijo predmeta, ključne besede,
  izključene besede, najnižjo/najvišjo začetno ceno, najnižjo cenitev, največjo varščino, način
  dražbe, obdobje dražbe, rok prijave, najmanjši ocenjeni popust, najmanjši možni dobiček, samo
  spletne dražbe, samo z objavljeno cenitvijo in kmalu se iztečejo; obstoječa infrastruktura
  dinamičnih filtrov se ponovno uporabi.
- **FR-005**: Shranjena nastavitev se MUST ob vsakem zagonu znova preveriti; neznan ali odstranjen
  vir, država ali kategorija MUST ustaviti zagon z jasnim razlogom.

**Viri**

- **FR-006**: Pred izvedbo konektorja MUST biti za vsak vir dokumentirano preverjanje: uradni naslov
  in izdajatelj, strojno berljiv dostop, prijava/ključ, omejitve uporabe, omejitve hitrosti,
  paginacija, svežina, polja in dovoljenost samodejnega pridobivanja. Rezultat je v dokumentaciji
  omejitev virov.
- **FR-007**: Viri MUST biti uradni in strojno berljivi, kjer obstajajo (API, RSS, XML, odprti
  podatki). Sistem MUST NOT obiti zaščit pred roboti, prijave, CAPTCHA ali omejitev uporabe.
- **FR-008**: Vir, ki ga ni mogoče zanesljivo in dovoljeno povezati, MUST biti viden kot
  "nedostopen" ali "zahteva ročno nastavitev" z razlogom in se ne sme sprožiti pri zagonu.
- **FR-009**: Začetni obseg virov: SodneDrazbe.si, FURS eDražbe, AJPES, GOV.SI javne objave;
  European e-Justice Portal MUST biti samo referenca/odkrivanje nacionalnih sistemov. Dodatni
  evropski konektorji MUST biti dodani šele po prepoznavi uradnega nacionalnega vira.
- **FR-010**: Pri AJPES MUST biti ločene splošne insolvenčne objave od dejanskih dražb; pri GOV.SI
  se MUST filtrirati nepomembne objave. Nobena objava se ne šteje za dražbo brez znakov prodaje.
- **FR-011**: Vsak vir MUST iti prek skupnega predpomnilnika, dnevne meje in razmika zahtevkov;
  izpad enega vira ne sme podreti zagona ostalih.
- **FR-012**: Skrivnosti virov MUST ostati izključno v okolju strežnika; `.env.example` in
  `docs/env-reference.md` se posodobita samo za dejansko dodane spremenljivke.
- **FR-013**: Arhitektura MUST omogočati dodajanje vira brez sprememb ostale kode.

**Model in normalizacija**

- **FR-014**: Vsaka dražba MUST biti normalizirana v skupni model z atributi: vrsta (sodna, davčna,
  insolvenčna, javna, zasebna), kategorija predmeta, država, lokacija, način (spletna, osebna, pisna
  ponudba, neznano), začetna cena, trenutna ponudba, cenitev, valuta, varščina (znesek in/ali
  odstotek), rok prijave, začetek, konec, minimalni korak ponudbe, provizija kupca, dodatni
  stroški, davčne informacije, ogled (možen, datum), stanje predmeta, pogoji sodelovanja, dokumenti
  (naslov, povezava), izvor(i) in status.
- **FR-015**: Manjkajoča polja MUST ostati "neznano"; sistem MUST NOT domnevati datumov, cen,
  pogojev sodelovanja ali stanja.
- **FR-016**: Datumi in ure MUST biti razčlenjeni v pravilnem časovnem pasu vira in shranjeni
  nedvoumno; neskladni datumi se ohranijo in označijo.
- **FR-017**: Ista dražba iz več virov MUST biti združena (dedup) z ohranjenimi navedbami vseh
  virov in izvirnih povezav.

**Vrednotenje in tveganje**

- **FR-018**: Sistem MUST ponuditi skupni ocenjevalnik priložnosti dražb za vse načine skenerja
  (brez podvajanja logike po modulih).
- **FR-019**: Ocenjevalnik MUST sprejeti: začetno ceno, trenutno ponudbo, cenitev, ocenjeno tržno
  vrednost, varščino, provizijo kupca, davke, prevoz, stroške prijave, druge znane stroške, stanje,
  način in rok; in MUST vrniti (kjer je dovolj podatkov): opazno ceno, ocenjeni skupni nakupni
  strošek, konservativno tržno vrednost, bruto maržo, čisti dobiček, ROI in najvišjo priporočeno
  ponudbo.
- **FR-020**: Začetna cena in trenutna ponudba MUST NOT veljati za končno ceno; cenitev MUST NOT
  samodejno veljati za tržno preprodajno vrednost; ocenjena tržna vrednost je vnos lastnika iskanja
  ali izrecno označen vir, ne izmišljena vrednost.
- **FR-021**: Varščina MUST biti obravnavana kot pogoj sodelovanja; kot strošek se upošteva samo,
  kadar vir izrecno pove, da ni vračljiva ali ni všteta; vračljiva varščina se NE sme šteti dvakrat.
- **FR-022**: Neznani davki in provizije MUST biti jasno označeni in MUST NOT biti 0; ob manjkajočem
  bistvenem podatku MUST biti rezultat "premalo podatkov" z razlogom, ne izmišljen dobiček.
- **FR-023**: Najvišja ponudba MUST biti izračunana iz predpostavk lastnika (želeni najmanjši dobiček,
  rezerva za tveganje, provizije prodaje, prevoz, drugi stroški), vedno označena kot ocena, ne
  zagotovilo.
- **FR-024**: Sistem MUST prikazati kazalnike tveganja: neznano stanje, brez ogleda, manjkajoča
  dokumentacija, nejasno lastništvo/pravne omejitve, dodatne provizije kupca, kratek rok prijave,
  visoka varščina, samo osebna udeležba, negotova tržna ocena, malo primerljivih transakcij.
  Kazalniki MUST NOT razglasiti dražbe za prevaro.

**Spremembe, obvestila, urnik**

- **FR-025**: Zaznava sprememb MUST uporabljati obstoječo zgodovino in zaznati: novo objavo,
  spremembo začetne cene, spremembo ponudbe, preložitev, preklic, spremembo roka prijave, spremembo
  konca, nove dokumente in spremembo statusa. Izginotje objave MUST NOT pomeniti zaključene dražbe.
- **FR-026**: Obvestila MUST uporabljati obstoječi izhodni nabiralnik, pravila lastništva in
  nastavitve obvestil za: novo ustrezno dražbo, bližajoč se rok prijave, kmalu začetek, kmalu konec,
  znižanje cene, preložitev, preklic, pomembno spremembo dokumentov in oceno nad pragom; brez
  dvojnikov.
- **FR-027**: Urnik, vklop/izklop, ročni zagon, zgodovina zagonov, ponovitve, omejitev hitrosti
  virov in preprečitev prekrivanja MUST uporabljati obstoječi skupni urnik; drugega urnika ni.
- **FR-028**: Avtentikacija in dovoljenja MUST uporabljati obstoječe obsege in lastništvo; uporabnik
  vidi samo svoja iskanja in rezultate.

**Analiza z umetno inteligenco**

- **FR-029**: Analiza MUST uporabiti obstoječi generični procesor (017); stikalo je na vsakem
  iskanju, privzeto izklopljeno, ob izklopu brez klicev ponudniku.
- **FR-030**: Ob vklopu MUST analiza uporabiti veljaven strukturiran izhod in predpomnilnik; ne sme
  izmišljati cen, datumov, lastništva, pravnih sklepov ali zagotovljenih dobičkov; povezave na
  izvirne dokumente MUST ostati; vhod ne vsebuje podatkov o osebah.

**Odjemalec**

- **FR-031**: Čarovnik MUST dinamično prikazati obrazec tipa, vključno z izbiro virov (z jasno oznako
  nedostopnih), držav, načina (dražbe / EU / likvidacije), filtrov, predpostavk vrednotenja in
  obstoječih kontrol (ime, urnik, obvestila, stikalo UI).
- **FR-032**: Kartice in podrobnosti MUST prikazati polja iz zgodbe 9; potrjeni podatki so ločeni od
  ocen; besedila slovenska; manjkajoče kot "neznano" oziroma "premalo podatkov".

**Kakovost**

- **FR-033**: Sistem MUST NOT samodejno licitirati, kupovati ali se prijavljati na dražbe.
- **FR-034**: Odstranitev tipa MUST biti brisanje mape modula na obeh straneh in registracijskih
  vrstic; jedro in ostali tipi tečejo naprej; obstoječi testi (LEGO, zbirateljski, ostali) ostanejo
  nespremenjeni in zeleni.
- **FR-035**: Testi MUST biti deterministični (fiksni podatki, mock odgovori virov) in pokrivati:
  normalizacijo virov, dedup med viri, datume in časovne pasove, varščino in vračljivo varščino,
  provizijo kupca, najvišjo ponudbo, manjkajočo cenitev/vrednost, spremembe statusa, obvestila o
  rokih, izpade virov, UI vklop/izklop, avtentikacijo in lastništvo, regresijo obstoječih skenerjev.
- **FR-036**: Omejitve virov MUST biti dokumentirane (kateri so podprti, delni, nedostopni ali
  zahtevajo ročno nastavitev in zakaj).

### Key Entities

- **Dražba (rezultat)**: normalizirana objava z vrsto, kategorijo, državo, lokacijo, načinom, cenami,
  roki, varščino, stroški, pogoji, dokumenti, izvori in statusom.
- **Vir dražb**: uradni vir s stanjem dostopnosti (podprt / delno / nedostopen / ročna nastavitev),
  razlogom in omejitvami.
- **Predpostavke vrednotenja**: ocene lastnika iskanja (tržna vrednost, najmanjši dobiček, rezerva,
  provizije prodaje, prevoz, drugi stroški).
- **Ocena priložnosti**: razčlenjen izračun z manjkajočimi vhodi in najvišjo ponudbo, vedno ocena.
- **Kazalnik tveganja**: opozorilo z razlago, ki ni sodba.
- **Sprememba dražbe**: dogodek življenjskega cikla (nova, cena, preložitev, preklic, rok, dokument,
  status).
- **Iskanje (definicija skenerja)**: shranjene nastavitve, urnik, obvestila, stikalo UI.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Oseba ustvari iskanje (vir, država, filtri, urnik) v manj kot 3 minutah in po prvem
  zagonu vidi rezultate.
- **SC-002**: 100 % virov v obsegu ima v dokumentaciji zabeleženo stanje in razlog; noben vir
  brez dovoljenega dostopa ni sprožen.
- **SC-003**: Noben rezultat brez zadostnih podatkov nima prikazanega dobička, ROI ali najvišje
  ponudbe; vsak tak ima prikazan razlog.
- **SC-004**: Vračljiva varščina je v 0 testnih primerih šteta dvakrat v skupnem strošku.
- **SC-005**: Noben prikazan znesek ni brez razlike med potrjenim podatkom vira in oceno.
- **SC-006**: Dogodek (nova dražba, rok, preložitev, preklic, znižanje) sproži natanko eno obvestilo
  na prejemnika; ponovni zagoni brez spremembe ne sprožijo nobenega.
- **SC-007**: Z izklopljeno analizo UI je število klicev ponudniku UI 0 v vseh zagonih.
- **SC-008**: Izginotje objave ni v nobenem primeru prikazano kot zaključena ali prodana dražba.
- **SC-009**: Vsi obstoječi testi in novi testi so zeleni; `typecheck` in `lint` sta čista tudi po
  odstranitvi tipa.
- **SC-010**: Izpad enega vira ne podre zagona; ostali viri vrnejo rezultate, napaka je jasno
  navedena.

## Assumptions

- Obstoječe jedro skenerjev (016), analiza UI (017), LEGO (018) in zbirateljski vzorec (019) so na
  voljo; vzporedno nastajajoči 020 ne spreminja skupnih točk nezdružljivo (preveri se pred izvedbo).
- Dostopnost, uradni naslovi in pogoji uporabe virov niso predpostavljeni; preverijo se ob
  načrtovanju in so rezultat raziskave (research). Kar ni mogoče preveriti, je označeno kot
  nedostopno.
- Tržno vrednost za izračun dobička vnese lastnik iskanja ali pride iz izrecno označenega vira;
  cenitev vira je samo opazovan podatek.
- Parametri provizij, rezerv in prevoza so ocene lastnika iskanja, ne tržna dejstva.
- Začetni obseg držav je Slovenija; dodatne evropske države šele po prepoznavi uradnega vira.
- Podatki v bazi so pogrešljivi (brez migracij), kot velja za obstoječe skenerje.
- Izven obsega: samodejno licitiranje, nakup, prijava na dražbe, zasebne dražbene hiše brez
  dovoljenega dostopa, obhod zaščit pred roboti, enotni evropski API.
