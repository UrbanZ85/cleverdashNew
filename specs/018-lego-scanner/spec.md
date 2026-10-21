# Feature Specification: LEGO skener

**Feature Branch**: `016-scanner-engine` (nadaljevanje; naloga lastnika z dne 21. 10. 2026)
**Created**: 2026-10-21
**Status**: Draft
**Input**: "Implement LEGO Scanner in Existing Universal Scanner — nov tip skenerja `lego`, ki
samodejno najde podcenjene LEGO sete na tržnicah, spremlja cene, prepozna priložnosti za nakup in
obvesti; viri Rebrickable (katalog), BrickLink (cene), eBay Browse (oglasi); brez nove aplikacije,
brez drugega urnika, brez dvojnika obstoječe infrastrukture."

## Zakaj

Skenerji (016) znajo po urniku vprašati vir, shraniti rezultate, zaznati spremembe in obvestiti,
analiza z umetno inteligenco (017) pa jih lahko oceni. Obstaja en produkcijski tip, Leti. LEGO je
naslednji naravni primer: set ima enolično številko, trg ima dokumentirane cene, oglasi so na več
tržnicah, razlika med ceno oglasa in tržno vrednostjo pa je natanko tisto, kar oseba išče.

Težava ni v zajemu, ampak v **zaupanju v podatke**. Oglas "LEGO Star Wars 75192" je lahko pravi
set, prazna škatla, paket treh setov, rabljen set brez polovice kock ali ponaredek. Tržna vrednost
ni cena oglasa in ni cena, ki bi jo kdo dejansko plačal. Dobiček brez poštnine, provizij in rezerve
je laž. Zato ta funkcionalnost več kot polovice besedila nameni temu, **kaj sme in kaj ne sme
trditi**: nič se ne domneva, nič ne izmisli, kar ni iz podatkov vira, je označeno kot neznano ali
"premalo podatkov", izračun dobička je viden po postavkah in označen kot ocena.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Iskanje LEGO setov po mojih kriterijih (Priority: P1)

Oseba v čarovniku Skenerji izbere tip "LEGO", nastavi filtre (številka seta, ključne besede, tema,
letnik, cena, stanje, tržnica, država prodajalca, vrsta ponudbe, poštnina), urnik in obvestila ter
shrani. Skener po urniku vpraša vire, najde oglase, jih prepozna in prikaže v seznamu rezultatov
z ceno, poštnino, stanjem, tržnico in sliko. Oseba ima lahko več neodvisnih iskanj.

**Why this priority**: brez tega ni funkcionalnosti; vse ostalo gradi na najdenih in prepoznanih
oglasih.

**Independent Test**: testni vir z izmišljenimi oglasi: po zagonu ima skener rezultate z
LEGO atributi; drugi skener z drugimi filtri ima drugačne rezultate; spreminjanje enega ne vpliva
na drugega.

**Acceptance Scenarios**:

1. **Given** iskanje "set 75192 pod 500 €", **When** zagon najde tri oglase (420 €, 510 €, 380 € za
   drug set), **Then** je med rezultati samo oglas za 75192 do 500 €.
2. **Given** dve iskanji z različnima filtroma, **When** teče zagon, **Then** vsako ima svoje
   rezultate, zgodovino in obvestila.
3. **Given** oseba brez ključev vira, **When** odpre čarovnik, **Then** tip "LEGO" je izbran
   mogoč in obrazec pove, kateri viri v namestitvi niso na voljo; skener se shrani in zagon to
   jasno sporoči, ne molči.
4. **Given** iskanje z vrsto ponudbe "dražba", **Then** so rezultati samo dražbe.

### User Story 2 — Zanesljiva identifikacija seta (Priority: P1)

Vsak oglas se poveže s katalogom (številka, ime, tema, letnik, kosi, slika). Povezava nosi
zaupanje in razlog. Oglasi, ki jih ni mogoče zanesljivo prepoznati, so označeni za ročni pregled in
**nimajo ocene priložnosti**. Deli, minifigure, paketi in prazne škatle se ne štejejo za
kompletne sete.

**Why this priority**: napačna identifikacija pomeni napačno vrednost in napačen dobiček — to je
najdražja napaka celotne funkcionalnosti.

**Independent Test**: tabela naslovov oglasov → pričakovana identiteta/oznaka; vključno s
podobnimi imeni, paketi in deli.

**Acceptance Scenarios**:

1. **Given** naslov "LEGO 75192 Millennium Falcon NEU OVP", **Then** set 75192, zaupanje visoko.
2. **Given** naslov "LEGO Star Wars Falcon Teile Konvolut", **Then** označeno kot deli/paket,
   brez identitete seta.
3. **Given** naslov "LEGO 10179 und 75192 zusammen", **Then** označeno kot paket več setov,
   brez ocene priložnosti.
4. **Given** naslov "nur leere Box 75192", **Then** označeno kot prazna škatla, ne set.
5. **Given** naslov "LEGO Star Wars Falcon" brez številke in z več možnimi seti, **Then** ročni
   pregled, brez ocene priložnosti.

### User Story 3 — Ocena tržne vrednosti iz podatkov (Priority: P1)

Za prepoznani set in stanje (novo/rabljeno) skener prikaže tržno vrednost iz prodaj zadnjih
šestih mesecev (povprečje, število prodaj; mediano samo kadar vir da dovolj podatkov). Aktivne
ponudbe so prikazane ločeno in nikoli niso prodajne cene. Kadar podatkov ni ali jih je premalo,
piše "premalo podatkov".

**Why this priority**: brez vrednosti ni primerjave in ni priložnosti.

**Independent Test**: odgovori cenika z/brez prodaj, z enim samim vzorcem, z drugo valuto.

**Acceptance Scenarios**:

1. **Given** cenik z 12 prodajami novega seta, **Then** vrednost novega z zaupanjem "visoko", z
   navedbo števila prodaj in obdobja.
2. **Given** samo aktivne ponudbe brez prodaj, **Then** "premalo podatkov"; aktivne so ločeno
   prikazane.
3. **Given** rabljen oglas z neznano kompletnostjo, **Then** ni vrednosti kot za kompleten set;
   oznaka "kompletnost ni preverjena".
4. **Given** cenik v valuti, ki ni valuta oglasa, **Then** primerjava ni mogoča (brez pretvorbe).

### User Story 4 — Ocena priložnosti z vidnim izračunom (Priority: P1)

Za oglase z zanesljivo identiteto, znano vrednostjo in znano ceno se izračuna: skupni strošek
(cena + poštnina + davki + provizije kupca), konservativna prodajna vrednost, provizije prodaje,
rezerva za tveganje, potencialni dobiček in ROI. Vsaka postavka je prikazana, izračun je označen
kot **ocena**. Kjer vhoda ni, ni dobička.

**Why this priority**: to je odločitev, ki jo oseba sprejema.

**Independent Test**: deterministične tabele vhodov → izhodov, vključno z manjkajočo poštnino.

**Acceptance Scenarios**:

1. **Given** oglas 400 € + poštnina 20 €, vrednost 550 €, provizije 10 %, rezerva 25 €,
   **Then** skupni strošek 420 €, provizije 55 €, dobiček 50 €, ROI približno 11,9 %.
2. **Given** oglas brez znane poštnine, **Then** dobiček ni izračunan ("poštnina ni znana"),
   ne domneva se 0.
3. **Given** oglas z neznano kompletnostjo ali ročnim pregledom, **Then** brez ocene priložnosti.
4. **Given** iskanje z "najmanjši ocenjeni dobiček 30 €", **Then** so rezultati pod pragom skriti
   iz seznama priložnosti, a ne izbrisani iz zgodovine.

### User Story 5 — Spremembe in obvestila (Priority: P2)

Skener zazna nov oglas, pocenitev, podražitev, spremembo ponudbe na dražbi, spremembo stanja,
umik in ponovno pojavitev; obvesti po e-pošti o novih ustreznih oglasih, pocenitvah, dobičku nad
pragom in dražbah pred iztekom. Umik oglasa NI označen kot prodaja; zadnja vidna ponudba na
dražbi NI končna cena.

**Why this priority**: osnovna vrednost skenerja je, da oseba ni dolžna pregledovati sama.

**Independent Test**: scenarij testnega vira čez več zagonov, kot pri `echo`.

**Acceptance Scenarios**:

1. **Given** oglas, ki izgine ob uspešnem odgovoru vira, **Then** označen "ni več na voljo",
   brez besede "prodano".
2. **Given** dražba z ponudbo 100 € ob prvem zagonu in 120 € ob drugem, **Then** sprememba brez
   "končna cena".
3. **Given** dobiček pod pragom, **Then** za nov oglas ni dopisa; ko pocenitev prinese dobiček
   nad prag, je dopis.
4. **Given** isti oglas pri dveh zagonih brez sprememb, **Then** en dopis, ne dva.

### User Story 6 — Neobvezna AI analiza (Priority: P3)

Pri iskanju z vklopljeno analizo (017) model ob oglasih z zanesljivo identiteto prebere opis:
poišče morebitno številko seta, manjkajoče dele, poškodovano škatlo, sumljive oglase;
razloži priložnost. Ne ocenjuje cen in ne trdi, da je izdelek pristen na podlagi slike.

**Independent Test**: ponarejen odjemalec kot pri 017; vklop/izklop; vhod brez osebnih podatkov.

### Edge Cases

- Vir ni vklopljen ali nima ključa: zagon pove, kateri vir manjka; ostali viri tečejo.
- eBay vrne oglas v drugi valuti, kot jo ima iskanje: oglas ostane, primerjava z vrednostjo ni
  mogoča.
- Isti oglas na dveh tržnicah ali v dveh iskanjih: en rezultat na iskanje (identiteta = tržnica +
  številka oglasa).
- Oglas brez slike, poštnine ali države prodajalca: prikazan z manjkajočimi polji, ne zavržen.
- Set je v katalogu, a nima cenika: vrednost "premalo podatkov", oglas ostane viden.
- Dnevna meja BrickLink dosežena: preostali seti dobijo vrednost ob naslednjem zagonu; zagon ni
  neuspešen.
- 429/5xx vira: poskus ob naslednjem zagonu, rezultati ostanejo.

## Requirements *(mandatory)*

### Tip in iskanja

- **FR-001**: Obstaja tip skenerja `lego` z imenom "LEGO skener", `single` izvajanje in generično
  shrambo rezultatov; registrira se z eno vrstico na vsaki strani, jedro se ne spremeni.
- **FR-002**: Uporabnik ustvari več neodvisnih iskanj; vsako ima lastne filtre, urnik, obvestila
  in vklop analize (017); lastništvo `{ _id, userId }`, tuje iskanje je 404.
- **FR-003**: Filtri: številka seta, ključne besede, tema, podtema, letnik, upokojen (samo kadar
  vir zanesljivo pove), najnižja/najvišja cena, valuta, tržnica, država prodajalca, stanje, vrsta
  ponudbe, najmanjši ocenjeni popust, najmanjši ocenjeni dobiček, največja poštnina. Vsaj en od
  številke seta, ključnih besed, teme ali cenovne meje je obvezen (brez tega iskanje ni omejeno).
- **FR-004**: Stanja: `NEW_SEALED`, `NEW_OPEN_BOX`, `USED_COMPLETE`, `USED_INCOMPLETE`,
  `PARTS_ONLY`, `UNKNOWN`. Kompletnost rabljenega se NE domneva: `USED_COMPLETE` samo, kadar to
  izrecno izhaja iz podatkov oglasa (vir pove ali naslov/opis nedvoumno navede); sicer `UNKNOWN`.

### Viri

- **FR-005**: Trije viri po vzorcu Leti (opis zahteve + čista razčlenitev; prenos prek skupnega
  predpomnilnika, semaforja in razmika): katalog (Rebrickable, ne vir cen), cene (BrickLink),
  oglasi (eBay Browse, tržnici DE in IT). Vsak je vklopljen samo, kadar so v okolju njegovi ključi.
- **FR-006**: Testni vir z izmišljenimi podatki (katalog, cene, oglasi) za deterministične teste;
  v produkciji ga zagon zavrne kot testni vir letov.
- **FR-007**: Vsak vir ima dnevno mejo zahtev na namestitev (rezervacija v bazi); katalog in cenik
  imata dolg TTL predpomnilnika (podatki se redko spreminjajo).
- **FR-008**: Skrivnosti vira ostanejo v okolju strežnika; nikoli v odgovoru, dnevniku, `extras`,
  predpomnilniku ali odjemalcu; podpis zahtev nikoli ne pristane v shranjenem URL-ju.
- **FR-009**: Brez nedovoljenega scrapanja: viri so samo uradni API-ji z ključem. Zasnova dovoli
  nov vir z eno datoteko in eno vrstico.
- **FR-010**: Eksistenčni oglasi na eBay se iščejo samo z dostavo v Slovenijo.

### Identifikacija in stanje

- **FR-011**: Številka seta se normalizira (npr. "75192", "75192-1", "LEGO 75192" → `75192-1`);
  prepoznava po prioriteti: številka → katalog → normalizirano ime → tema in naslov → (neobvezno,
  samo ob vklopljeni analizi) AI. Vsaka prepoznava nosi `confidence` (visoko/srednje/nizko) in
  razlog.
- **FR-012**: Oglas se označi `SET`, `BUNDLE`, `PARTS`, `MINIFIG`, `EMPTY_BOX`, `OTHER` ali
  `UNIDENTIFIED`; samo `SET` z zaupanjem vsaj srednje lahko dobi vrednost in oceno priložnosti.
  Ostali so na seznamu z oznako; nizko zaupanje ali dvoumna številka = ročni pregled.
- **FR-013**: Nobenega atributa se ne izmisli: manjkajoče polje je `null`/izpuščeno in v
  vmesniku označeno kot neznano.

### Vrednotenje in priložnost

- **FR-014**: Vrednost seta se računa ločeno za novo in rabljeno, iz prodaj (ne iz aktivnih
  ponudb); aktivne ponudbe so drugo, ločeno polje. Povprečje in število prodaj samo, kadar jih vir
  da; mediana samo, kadar so na voljo posamezne prodaje; sicer ni.
- **FR-015**: Zaupanje vrednosti (visoko/srednje/nizko/premalo podatkov) izhaja iz števila
  prodaj in starosti podatkov po dokumentiranih pragovih.
- **FR-016**: Primerjava le v isti valuti; drugače "primerjava ni mogoča" (brez pretvorbe).
- **FR-017**: Ocena priložnosti vsebuje postavke: cena, poštnina, davki, provizije kupca → skupni
  strošek; konservativna prodajna vrednost, provizije prodaje, rezerva za tveganje → dobiček in
  ROI. Parametri (provizije prodaje, rezerva, konservativnost) so nastavljivi v okolju z
  dokumentiranimi privzetki. Brez znane cene, poštnine, vrednosti ali zanesljive identitete
  dobička ni. Izračun je označen kot ocena.
- **FR-018**: Ocena priložnosti (število 0–100) je deterministična funkcija dobička, ROI in
  zaupanja; brez dobička je `null`.

### Spremembe in obvestila

- **FR-019**: Spremembe prek jedra: NOVO, POCENITEV, PODRAŽITEV, SPREMENJENO (stanje, ponudba na
  dražbi, vrsta), NEDOSEGLJIVO (umik; nikoli "prodano"), vrnitev.
- **FR-020**: Za dražbe se hrani zadnja vidna ponudba in čas izteka; ni končna cena. Dopis
  "dražba se izteka" največ enkrat na oglas.
- **FR-021**: Dopis (zbirni, en na prejemnika na zagon, prek jedra) za: nov ustrezen oglas,
  pocenitev, novo podcenjeno najdbo, dobiček nad pragom, dražbo pred iztekom. Prag obvestila je
  na iskanju; oglasi pod pragom se shranijo, ne obveščajo. Brez dvojnikov.

### Analiza z umetno inteligenco

- **FR-022**: Tip uporablja generični AI procesor (017); vhod nosi samo podatke oglasa in
  kataloga; navodilo dodatno prepove trditve o pristnosti iz slik in izmišljanje cen. AI
  identifikacija je samo dodatek, nikoli edina podlaga za oceno priložnosti.

### Vmesnik

- **FR-023**: Obrazec v 2. koraku čarovnika s filtri; skupne komponente (ime, urnik, obvestila,
  analiza) iz čarovnika.
- **FR-024**: Seznam rezultatov: slika, številka seta, ime, tema, letnik, stanje, tržnica, cena,
  poštnina, ocenjena vrednost, potencialni dobiček, ocena priložnosti, značka AI tveganja.
- **FR-025**: Podrobnosti: izvirni oglas (povezava), katalog, zgodovina cen, BrickLink
  primerjava (novo/rabljeno, število prodaj, obdobje), izračun po postavkah, analiza AI, opozorila
  (kompletnost ni preverjena, ročni pregled, premalo podatkov).
- **FR-026**: Besedila slovenska, identifikatorji angleški; slike in povezave samo `https` in
  samo z dovoljenih gostiteljev (eBay, Rebrickable).

### Testiranje

- **FR-027**: Testi z mock odgovori (brez omrežja) za: razčlenitev vsakega vira, normalizacijo
  številke, identifikacijo, pakete/dele/prazne škatle, stanje, vrednotenje novo/rabljeno,
  manjkajoče podatke, valute, izračun dobička, zgodovino/dedup, urnik, obvestila, AI vklop/izklop,
  lastništvo; obstoječi testi ostanejo zeleni.

## Out of Scope

- Pretvorba valut prek zunanjega tečaja (cenik v EUR; drugačna valuta = primerjava ni mogoča).
- Bolha, trgovine, primerjalniki cen (zasnova jih dopušča, vir ni implementiran).
- Samodejni nakup ali licitiranje.
- Avtentikacija izdelka (ponaredki) iz slik.
- Ločen urnik, obvestila ali aplikacija; spremembe obstoječih tipov in jedra.

## Success Criteria *(mandatory)*

- **SC-001**: Oseba z ustvarjenim iskanjem po urniku dobi seznam prepoznanih setov z ceno,
  vrednostjo in dobičkom brez ročnega iskanja po tržnicah.
- **SC-002**: Pri testnem naboru oglasov (vsaj 30 naslovov, vključno s paketi, deli in
  praznimi škatlami) noben paket, del ali prazna škatla ni ocenjen kot kompleten set.
- **SC-003**: Nobena številka (vrednost, dobiček, ROI) ni prikazana brez podatkov, iz katerih
  izhaja; pri manjkajoči poštnini ali vrednosti je prikazano "neznano" / "premalo podatkov".
- **SC-004**: Drugi zagon brez sprememb ne ustvari novih dopisov ali podvojenih rezultatov.
- **SC-005**: Brez ključev v okolju vse ostalo (Leti, echo, drugi skenerji) deluje enako kot
  prej; LEGO viri to jasno povedo.
- **SC-006**: Nobena skrivnost vira ne nastopa v odgovorih API-ja, predpomnilniku ali
  generiranih tipih odjemalca.
- **SC-007**: Jedro `platform/scanner/` ostane brez uvozov iz `modules/` (test meje zelen).

## Assumptions

- Rebrickable (brezplačen ključ), BrickLink (OAuth 1.0 s štirimi vrednostmi in registriranim IP
  strežnika) in eBay Browse (aplikacijski žeton prek client credentials) so dosegljivi z
  ključi lastnika namestitve; natančne oblike odgovorov se potrdijo z mock odgovori po
  dokumentaciji in ob prvem pravem klicu.
- BrickLink cenik vrne agregate in (kjer je dovoljeno) posamezne prodaje; mediana se računa samo
  iz posameznih prodaj.
- Privzete provizije prodaje, rezerva za tveganje in konservativnost so nastavljivi in
  dokumentirani; niso tržna dejstva.
- Davki: pri uvozu iz EU se DDV ne prišteva (cena oglasa že vsebuje DDV prodajalca); pri
  prodajalcih izven EU se DDV prišteje samo, kadar vir izrecno pove, sicer je "davki niso znani".
- Valuta iskanja je privzeto EUR.
