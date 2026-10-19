# Feature Specification: Univerzalni modularni scanner engine (Skenerji)

**Feature Branch**: `016-scanner-engine`
**Created**: 2026-10-19
**Status**: Draft
**Input**: "Refactor Existing Flight Scanner into a Universal Modular Scanner Engine — obstoječi
iskalnik letalskih ponudb (015) se preoblikuje v generično, razširljivo jedro za 'skenerje', ki
po urniku preverjajo zunanje vire, shranjujejo rezultate, zaznavajo spremembe in obveščajo.
Leti ostanejo samostojen modul, ki se v jedro registrira kot en tip; jedro ne vsebuje nobene
logike letov in se ob novem tipu (avti, elektronika, slike, domene, poljubni API) ne spreminja."

## Zakaj

Modul Leti (015) je prvi del CleverDasha, ki po urniku vprašuje zunanje vire, si zapomni, kaj je
videl, zazna spremembe in ob njih pošlje dopis. Ta štiridelna zanka — urnik, zajem, primerjava,
obvestilo — ni lastnost letov. Enaka je za rabljen avto pod določeno ceno, za izdelek, ki pride na
zalogo, za sliko, ki se pojavi na tuji strani, za domeno, ki se sprosti. Danes bi vsak tak zavihek
zanko napisal znova: svoj tik, svoje zagone, svojo zaporo pred podvajanjem, svoj outbox dopisov,
svojo administracijo urnika. Štiri kopije iste stvari so štirikrat več mest, kjer se dvojni dopis
ali zamujen termin pokvarita vsak po svoje.

Ta funkcionalnost zanko izvleče na eno mesto, v skupno zmogljivost aplikacije, tako kot sta
skupni imenik uporabnikov in vstopna točka za agente. Kar je pri letih letalskega (letališča,
okna datumov, ujemanje ponudb, dopis s ceno vozovnice), ostane v modulu Leti; kar je skupnega
(kdaj se preverja, kdo preverjanje sproži in prekine, kako se zagon zabeleži, kako se dopis
sestavi enkrat in pošlje z zamikom ob napaki), gre v jedro in ga modul Leti samo uporablja.

Tri odločitve, sprejete z lastnikom namestitve 19. 10. 2026, določajo obseg:

1. **Leti ostanejo svoj modul z lastnimi podatki in lastnim vmesnikom.** Ne selijo se v
   generične tabele. Razlog: ponudba leta je namenoma skupna vsem iskanjem in uporabnikom (ista
   vozovnica se pri viru vpraša enkrat, ne glede na to, koliko ljudi jo spremlja), česar
   "rezultat pripada enemu skenerju" ne zna izraziti. Modul se v jedro registrira kot tip z
   enim zagonom za vsa iskanja po urniku, ki ga določi administrator — natanko tako, kot dela
   danes.
2. **Skupen je urnik, zagon in obveščanje.** Jedro ima en tik, en model zagona z zaporami, en
   outbox dopisov in eno administracijo, pod katero so vsi tipi skenerjev. Modul Leti svoj tik,
   svoje zagone, svoj outbox in svoj admin urnika preda jedru.
3. **Podatki, ki so v bazi danes, niso pomembni.** Nastali so 19. 10. 2026 ob preizkušanju.
   Zbirke zagonov, nastavitev urnika in dopisov modula Leti se zamenjajo z generičnimi brez
   selitve podatkov; iskanja, ponudbe, ujemanja in zgodovina cen ostanejo nedotaknjeni.

Kaj ta funkcionalnost namenoma **ni**: ne prinaša nobenega novega pravega tipa skenerja (avti,
elektronika, slike, domene, poljubni API ostanejo za prihodnje funkcionalnosti); ne spreminja
vedenja letov, ki ga uporabnik vidi (iskanja, ponudbe, dopisi, deljenje, pravice ostanejo
enaki); ne dovoli uporabniku, da bi v nastavitve skenerja vpisal kodo, ki bi se izvajala.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Leti tečejo po skupnem urniku in nič se ne spremeni (Priority: P1) 🎯 MVP

Kot uporabnik zavihka Leti hočem, da moja iskanja po prehodu na skupno jedro tečejo natanko
tako kot prej: ob terminu, ki ga je nastavil administrator, se vsa aktivna iskanja preverijo v
enem zagonu, ponudbe se primerjajo s prejšnjim stanjem, dopis pride samo ob novi ponudbi ali
spremembi cene in samo enkrat na prejemnika. Vse, kar vidim na straneh Leti, ostane na istih
mestih in z istimi podatki.

**Why this priority**: To je refaktoring produkcijske funkcionalnosti. Če leti po njem delajo
drugače, je vse ostalo brez vrednosti. Zgodba je hkrati dokaz, da jedro res zmore batch izvajanje
z vsemi obstoječimi zaporami.

**Independent Test**: Vsi obstoječi avtomatizirani testi modula Leti (pogodbeni, integracijski,
enotski) tečejo zeleno nad novim jedrom brez spremembe pričakovanj, razen tam, kjer se je
spremenilo ime administratorske poti. Scenarij s testnim virom (NOVO → POCENITEV → PODRAŽITEV →
NEDOSEGLJIVO) da iste dopise kot pred refaktoringom.

**Acceptance Scenarios**:

1. **Given** namestitev z dvema uporabnikoma in tremi aktivnimi iskanji letov, **When** nastopi
   termin urnika tipa "leti", **Then** nastane natanko en zagon, ki obdela vsa tri iskanja, in
   vsak od uporabnikov prejme največ en dopis.
2. **Given** iskanje, ki mu je ponudba ustrezala v prejšnjem zagonu, **When** vir v tem zagonu
   vrne isto ponudbo z isto ceno, **Then** se dopis ne pošlje, stanje iskanja pa pove, kdaj je bilo
   nazadnje uspešno preverjeno.
3. **Given** uporabnik odpre katero koli obstoječo stran Leti (pregled, iskanja, urejevalnik,
   ponudba, deljene ponudbe), **When** stran naloži podatke, **Then** so podatki isti, kot so bili
   pred refaktoringom, in nobena povezava ne vodi v napako.
4. **Given** modul Leti je iz aplikacije odstranjen (mapa, vnos zavihka, vrstica za registracijo),
   **When** se aplikacija zažene, **Then** jedro skenerjev deluje naprej, tipa "leti" preprosto
   ni, preverjanja tipov, sloga in testi jedra pa so čisti.

---

### User Story 2 - Administrator upravlja urnike in zagone vseh skenerjev na enem mestu (Priority: P1)

Kot administrator hočem na eni strani videti vse tipe skenerjev z njihovimi urniki, vklopiti ali
izklopiti preverjanje posameznega tipa, spremeniti izraz urnika in časovni pas, videti zgodovino
zagonov vseh tipov s stanjem, sprožilcem, števci in napakami, sprožiti ročni zagon za izbran tip
ali posamezen skener, prekiniti tekoči zagon in pregledati outbox dopisov. Stara povezava do
administracije letov me pripelje na isto mesto.

**Why this priority**: Administracija je edini vmesnik do urnika; brez nje refaktoringa ni
mogoče upravljati. Ker se seli iz modula Leti v jedro, mora biti na voljo takoj, ko leti tečejo
po jedru.

**Independent Test**: Prijavljen administrator vidi stran administracije skenerjev s tipom "leti";
navaden uporabnik in API ključ dobita zavrnitev. Sprememba urnika velja ob naslednjem tiku brez
ponovnega zagona; ročni zagon med tekočim je zavrnjen z razlogom; preklic ustavi zagon med
koraki.

**Acceptance Scenarios**:

1. **Given** administrator odpre administracijo skenerjev, **When** spremeni urnik tipa "leti" na
   "vsak ponedeljek ob 8:00", **Then** je sprememba shranjena s tem, kdo in kdaj jo je naredil,
   naslednji termin je izpisan v časovnem pasu urnika in velja brez ponovnega zagona aplikacije.
2. **Given** en zagon tipa "leti" teče, **When** administrator sproži ročni zagon istega tipa,
   **Then** dobi zavrnitev z navedbo tekočega zagona; ročni zagon drugega tipa pa je sprejet.
3. **Given** zagon teče, **When** administrator zahteva preklic, **Then** se zagon konča kot
   preklican najkasneje ob naslednjem koraku in dopisov ne sestavi.
4. **Given** uporabnik brez vloge administratorja, **When** poskusi spremeniti urnik ali sprožiti
   zagon, **Then** je zavrnjen in zavrnitev ne pove, kako je zapora sestavljena.
5. **Given** stara povezava do administracije letov, **When** jo administrator odpre, **Then**
   pristane na administraciji skenerjev z izbranim tipom "leti".

---

### User Story 3 - Vidim vse svoje skenerje, tudi iskanja letov, na enem seznamu (Priority: P2)

Kot uporabnik hočem zavihek "Skenerji", na katerem so vsi moji skenerji ne glede na tip: ime,
tip, ali je vklopljen, kakšen urnik ima (lasten ali urnik tipa), kdaj je bil nazadnje izveden in s
kakšnim izidom, kdaj bo naslednjič, in koliko rezultatov trenutno ima. Moja iskanja letov so na
tem seznamu kot skenerji tipa "leti"; klik nanje me pripelje na obstoječe strani Leti.

**Why this priority**: To je prvi zaslon, ki pokaže, da je sistem generičen, in edino mesto, kjer
bodo bodoči tipi vidni. Ni pa pogoj za delovanje letov, zato P2.

**Independent Test**: Uporabnik s tremi iskanji letov in enim testnim skenerjem vidi štiri
vrstice z ustreznimi tipi; vrstice drugih uporabnikov niso vidne; klik na iskanje letov odpre
urejevalnik iskanja v zavihku Leti, klik na testni skener odpre generični prikaz rezultatov.

**Acceptance Scenarios**:

1. **Given** uporabnik ima dve iskanji letov, **When** odpre zavihek Skenerji, **Then** vidi dve
   vrstici tipa "leti" z urnikom "po urniku tipa", zadnjim preverjanjem in številom ponudb, ki
   se ujemata s tem, kar kaže zavihek Leti.
2. **Given** skener drugega uporabnika, **When** uporabnik odpre seznam ali poskusi skener odpreti
   po naslovu, **Then** ga na seznamu ni in odgovor je "ne obstaja", ne "ni tvoj".
3. **Given** skener, katerega tip v tej namestitvi ni več registriran ali je izklopljen, **When**
   uporabnik odpre seznam, **Then** je skener prikazan z oznako "tip ni na voljo", ni ga mogoče
   zagnati, mogoče pa ga je izbrisati.
4. **Given** uporabnik na seznamu izklopi skener, **When** nastopi njegov termin, **Then** se zagon
   zanj ne ustvari; pri tipu z batch izvajanjem se izklopljen skener v zagonu tipa preskoči.

---

### User Story 4 - Ustvarim skener novega tipa v treh korakih (Priority: P2)

Kot uporabnik hočem nov skener ustvariti tako, da najprej izberem tip (med tipi, ki so v tej
namestitvi implementirani in vklopljeni), nato izpolnim obrazec, ki pripada temu tipu, in na
koncu nastavim urnik (prednastavitev ali lasten izraz s časovnim pasom, kadar tip to dovoljuje) in
obvestila. Pri tipu "leti" je obrazec v drugem koraku isti obrazec iskanja kot v zavihku Leti, z
istimi preverjanji.

**Why this priority**: Brez ustvarjanja seznam iz zgodbe 3 ne more rasti; hkrati je to edini del
vmesnika, kjer tip prispeva svoj obrazec, in zato dokaz, da je vmesnik razširljiv.

**Independent Test**: Uporabnik ustvari testni skener v treh korakih in ga vidi na seznamu z
lastnim urnikom; pri poskusu s tipom "leti" se v drugem koraku pokaže obrazec iskanja in shranjeno
iskanje je vidno tudi v zavihku Leti.

**Acceptance Scenarios**:

1. **Given** namestitev s tipoma "leti" in "testni", **When** uporabnik začne ustvarjati skener,
   **Then** sta na izbiro samo ta dva tipa; tipi, ki niso implementirani, se ne ponujajo.
2. **Given** uporabnik izbere tip "testni" in pusti obvezno polje prazno, **When** gre na naslednji
   korak, **Then** vidi eno slovensko sporočilo o napaki iz preverjanja tega tipa in ne more
   naprej.
3. **Given** uporabnik v tretjem koraku vpiše neveljaven izraz urnika ali neznan časovni pas,
   **When** shrani, **Then** je zavrnjen z razlago, kaj je narobe, in nič se ne shrani.
4. **Given** tip z batch izvajanjem (leti), **When** uporabnik pride na tretji korak, **Then** je
   urnik prikazan kot "po urniku tipa, ki ga določa administrator" in ga ne more spremeniti,
   obvestila pa nastavi, kot jih nastavi danes pri iskanju.

---

### User Story 5 - Skener po lastnem urniku zbere rezultate, zazna spremembe in me obvesti (Priority: P2)

Kot uporabnik s skenerjem, ki ima lasten urnik, hočem, da se ob terminu izvede samo moj skener, da
se rezultati shranijo z oznako, kdaj sem jih prvič in nazadnje videl, da se ob naslednjem zagonu
ista stvar ne pojavi kot nova, da je sprememba (npr. cene, kjer cena obstaja) zaznana in
zabeležena v zgodovini, in da ob novem rezultatu ali spremembi dobim en dopis z naslovom in
opisom, kot ju določi tip skenerja. Rezultate vidim na generični strani, na kateri tip lahko
prikaže svoj posebni pogled.

**Why this priority**: To je zanka, zaradi katere jedro sploh obstaja. Preverjena je s testnim
tipom, ki vrača deterministične rezultate, preden pride prvi pravi tip.

**Independent Test**: Testni skener z urnikom "vsako uro" v treh zaporednih zagonih da: prvi
zagon N novih rezultatov in en dopis; drugi zagon iste rezultate brez dopisa; tretji zagon eno
spremembo in en dopis z eno postavko. Napaka v enem skenerju ne prepreči zagona drugega.

**Acceptance Scenarios**:

1. **Given** dva skenerja istega tipa z lastnima urnikoma, **When** nastopita oba termina v istem
   tiku, **Then** nastaneta dva ločena zagona in napaka prvega ne vpliva na drugega.
2. **Given** skener je v prejšnjem zagonu shranil rezultat, **When** vir v tem zagonu vrne isti
   rezultat (ista identiteta), **Then** se rezultat ne podvoji, posodobi se čas zadnjega ogleda in
   dopisa ni.
3. **Given** rezultat s ceno, **When** vir vrne isto identiteto z drugo ceno, **Then** je sprememba
   zabeležena v zgodovini s prejšnjo in novo vrednostjo in prejemnik dobi en dopis z eno postavko.
4. **Given** rezultat brez cene (npr. ujemanje slike), **When** se shrani, **Then** je shranjen in
   prikazan brez cene in brez napake; zaznava sprememb teče nad tistim, kar tip označi kot
   primerljivo.
5. **Given** aplikacija se med zagonom ponovno zažene, **When** teče naslednji tik, **Then** je
   prekinjen zagon označen kot prekinjen, isti termin se ne izvede drugič, naslednji termin pa po
   urniku.
6. **Given** dva izvoda aplikacije z istim urnikom, **When** nastopi termin, **Then** zagon ustvari
   natanko eden od njiju.

---

### User Story 6 - Razvijalec doda nov tip skenerja brez spremembe jedra (Priority: P3)

Kot razvijalec hočem nov tip skenerja dodati tako, da napišem njegovo mapo (opis tipa, preverjanje
nastavitev, izvajanje z adapterji do virov, obrazec in prikaz rezultatov na odjemalcu) in ga
registriram z eno vrstico na zaledju in eno na odjemalcu. Jedra, tika, administracije in generičnih
zaslonov pri tem ne spreminjam. Navodilo, kako to narediti, je v dokumentaciji.

**Why this priority**: To je razlog za refaktoring, a ga dokazuje šele testni tip; produkcijski
tipi pridejo kasneje.

**Independent Test**: Testni tip "echo" obstaja kot ločena mapa in se registrira z eno vrstico;
izbris te mape in vrstice pusti jedro in lete nedotaknjene; dokumentacija pokrije dodajanje tipa,
adapterja do vira, koraka obdelave, obrazca, prikaza rezultatov in urnika.

**Acceptance Scenarios**:

1. **Given** jedro brez registriranih tipov, **When** se registrira tip "echo", **Then** se pojavi
   med tipi za ustvarjanje, njegov skener se izvede po urniku, shrani rezultate in sproži dopis —
   brez spremembe ene same datoteke jedra.
2. **Given** skener tipa, ki ni registriran, **When** nastopi njegov termin, **Then** se zagon ne
   ustvari, stanje skenerja pove "tip ni na voljo" in v dnevniku je to zabeleženo enkrat, ne ob
   vsakem tiku.
3. **Given** testni tip je vklopljen v produkcijskem okolju, **When** se aplikacija zažene,
   **Then** zagon zavrne z imenom nastavitve, ki je napačna — izmišljeni rezultati nikoli ne
   pridejo v dopis.

---

### Edge Cases

- **Batch tip brez aktivnih skenerjev**: zagon se ob terminu vseeno ustvari in konča kot uspešen z
  ničelnimi števci (današnje vedenje letov), da administrator vidi, da urnik živi.
- **Skener je izbrisan, medtem ko zagon teče**: zagon se konča brez napake, rezultati izbrisanega se
  ne shranijo in dopis zanj ne gre.
- **Lastnik med zagonom izklopi skener**: tekoči zagon konča, naslednji termin se ne ustvari.
- **Izraz urnika, ki se nikoli ne sproži** (npr. 30. februar): shranjevanje je dovoljeno, naslednji
  termin je prazen in to je vidno pri skenerju; zagon ne nastane.
- **Sprememba izraza urnika**: "pokrito do zdaj" se premakne na čas spremembe, da nov, pogostejši
  urnik ob naslednjem tiku ne dohiti termina iz starega dneva.
- **Aplikacija izklopljena čez več terminov**: dohiti se samo zadnji zapadli termin, ne vsi — en
  zagon že nosi vse spremembe od zadnjega uspešnega.
- **Časovni pas skenerja ≠ časovni pas tipa**: vsak zagon ima svoj termin v svojem pasu; ključ
  termina nosi pas, zato dva izvoda izračunata isti ključ.
- **Isti rezultat se pojavi pri dveh skenerjih istega uporabnika**: pri generični shrambi je
  rezultat last skenerja in nastane dvakrat; en dopis na prejemnika na zagon velja na zagon, zato
  sta to dve postavki v dveh dopisih, če sta zagona dva. Pri letih ostane skupna ponudba in en
  dopis.
- **Vir vrne rezultat brez identitete**: tip mora identiteto izpeljati sam; rezultat brez nje se
  zavrže kot nepopoln in se šteje, ne shrani.
- **Prejemnik brez e-naslova ali izbrisan uporabnik**: dopis je zadržan z razlogom, zagon to šteje.
- **Pošta ni nastavljena**: dopisi so zadržani z razlogom "pošta ni nastavljena", preverjanje teče
  naprej.
- **Padec procesa med pošiljanjem**: dopis, ki obtiči v "pošiljam", se po roku vrne v čakanje;
  tveganje dvojnega dopisa v tem ozkem oknu je sprejeto in zapisano (kot pri 015).
- **Uporabnik izgubi pravico do tipa** (obseg mu je odvzet): njegovi skenerji tega tipa se ne
  izvajajo in na seznamu so označeni, ne izbrisani.
- **Administrator dela v imenu drugega uporabnika (012)**: na seznamu vidi NJEGOVE skenerje;
  administracija urnikov in zagonov ostane njegova in ni odvisna od prevzetega imena.
- **Tip, ki ima lastno shrambo rezultatov (leti)**: generični prikaz rezultatov in število
  rezultatov prideta iz tipa prek istega bralnega vmesnika kot pri generični shrambi; uporabnik
  razlike ne vidi.

## Requirements *(mandatory)*

### Functional Requirements

#### Jedro in register tipov

- **FR-001**: Sistem MORA imeti eno skupno jedro skenerjev, ki ne vsebuje nobene logike
  posameznega tipa (letov, avtov, slik …) in se ob dodajanju novega tipa ne spreminja.
- **FR-002**: Tip skenerja se MORA registrirati prek enotnega registra z enim klicem ob zagonu
  aplikacije; odstranitev tipa je brisanje njegove mape in tega klica.
- **FR-003**: Vsak tip MORA deklarirati: oznako, slovensko ime, ikono, način izvajanja (en zagon za
  vse skenerje tipa po urniku tipa, ali zagon na skener po lastnem urniku), pravila preverjanja
  svojih nastavitev, obsege pravic, ali uporablja generično ali lastno shrambo rezultatov, in kako
  se iz njegovih dogodkov sestavi dopis (preverba postavk pred pošiljanjem in izris).
- **FR-004**: Jedro NE SME vsebovati zahtev na zunanje vire; vsi zunanji klici so last tipa oz.
  njegovih adapterjev in MORAJO iti skozi skupni predpomnilnik in omejitve vljudnosti (člen VIII).
- **FR-005**: Nastavitve skenerja NE SMEJO omogočati izvajanja poljubne kode; dovoljene so samo
  vrednosti, ki jih tip preveri po svojih pravilih.

#### Skener (definicija)

- **FR-006**: Skener MORA imeti: enolični identifikator, ime (1–80 znakov), tip, lastnika, stanje
  vklopa, urnik (lasten izraz s časovnim pasom ali "po urniku tipa"), nastavitve obvestil
  (vklop, prejemniki, kjer jih tip dovoli), nastavitve tipa, čas nastanka in spremembe ter stanje
  zadnjega izvajanja (kdaj, izid, kratko sporočilo) in čas zadnjega uspešnega izvajanja.
- **FR-007**: Skener je oseben zapis: vsak dostop je pogojen z lastnikom; tuji skener vrne
  "ne obstaja", nikoli "ni tvoj".
- **FR-008**: Iskanja letov MORAJO biti na seznamu skenerjev vidna kot skenerji tipa "leti" s
  svojim imenom, vklopom, urnikom tipa, zadnjim preverjanjem in številom ponudb; tip jih prispeva
  prek registra, jedro zanje nima lastnega zapisa.
- **FR-009**: Uporabnik MORA imeti možnost skener ustvariti, urediti, vklopiti/izklopiti in
  izbrisati; izbris pobriše njegove rezultate v generični shrambi, pri tipu z lastno shrambo pa
  tip sam odloči, kaj ostane (pri letih ponudbe ostanejo, ujemanja gredo).
- **FR-010**: Pri tipu z izvajanjem po urniku tipa skener NE SME imeti lastnega urnika; vmesnik to
  pove in ne ponudi urejanja.
- **FR-011**: Skener tipa, ki v tej namestitvi ni registriran ali je izklopljen, MORA ostati
  viden z oznako, se NE SME izvajati in ga je mogoče izbrisati.
- **FR-012**: Število skenerjev na uporabnika in tip je omejeno z nastavitvijo namestitve; meja je
  vidna in prekoračitev zavrnjena z razlago.

#### Urnik in izvajanje

- **FR-013**: Urnik je zapis v bazi, ne časovnik v pomnilniku: vsak tik ugotovi, kateri termini
  (tipov in skenerjev) so zapadli in še niso pokriti, in za vsakega ustvari največ en zagon
  (člen V).
- **FR-014**: Urnik tipa (za tipe z batch izvajanjem) sme nastavljati izključno administrator:
  vklop, prednastavitev ali lasten izraz, časovni pas; izraz in pas se preverita pred
  shranjevanjem; sprememba velja brez ponovnega zagona in zabeleži, kdo in kdaj jo je naredil.
- **FR-015**: Urnik skenerja (za tipe z izvajanjem na skener) nastavlja lastnik: prednastavitev
  ali lasten izraz s časovnim pasom, z enakim preverjanjem; privzeti pas je `Europe/Ljubljana`.
- **FR-016**: Dve izvajanji istega obsega (isti tip pri batch, isti skener pri single) NE SMETA
  teči hkrati — ne v enem izvodu ne v dveh; zapora je unikaten ključ termina. Število hkratnih
  zagonov različnih obsegov omejuje nastavitev namestitve (privzeto eno).
- **FR-017**: Napaka enega zagona NE SME preprečiti drugih; napaka enega skenerja znotraj batch
  zagona NE SME preprečiti obdelave ostalih skenerjev v istem zagonu in je zabeležena pri tem
  skenerju.
- **FR-018**: Zagon, ki ga prekine ponovni zagon aplikacije, MORA biti ob naslednjem tiku označen
  kot prekinjen; njegov termin velja za pokrit; dohiti se samo zadnji zapadli termin.
- **FR-019**: Vsak zagon MORA biti zabeležen z obsegom (tip ali skener), sprožilcem (urnik ali
  ročno in kdo), terminom, začetkom, koncem, stanjem (čaka, teče, uspešno, delno, neuspešno,
  preklicano, prekinjeno), števci (obdelani skenerji, zahteve na vire, videni rezultati, novi,
  spremenjeni, izginuli, dopisi) in napakami brez skrivnosti in brez e-naslovov; hrani se
  omejeno število dni.
- **FR-020**: Administrator MORA imeti možnost sprožiti ročni zagon tipa ali posameznega skenerja
  in prekiniti tekoči zagon; lastnik MORA imeti možnost ročno sprožiti svoj skener pri tipu z
  izvajanjem na skener; pri tipu z batch izvajanjem je ročni zagon izključno administratorjev.
- **FR-021**: Vsak tik in vsaka odločitev (termin, prevzem, prekinitev, preklic) MORA biti v
  strukturiranem dnevniku z identifikatorjem zagona (člen VII); tik pošlje zunanji srčni utrip po
  obstoječem mehanizmu, kadar je nastavljen.

#### Rezultati

- **FR-022**: Jedro MORA ponujati generično shrambo rezultatov za tipe, ki je ne nadomestijo s
  svojo: rezultat nosi skener, tip, vir, zunanji identifikator (kadar ga vir da), naslov, povezavo
  (kadar obstaja), ceno z valuto (NEOBVEZNO), podatke po kategoriji (kot jih opredeli tip), čas
  prvega in zadnjega ogleda, razpoložljivost in zadnjo vrsto spremembe.
- **FR-023**: Rezultat MORA imeti stabilno identiteto, ki jo določi tip; ista identiteta v
  naslednjem zagonu posodobi obstoječi rezultat, ne ustvari novega.
- **FR-024**: Jedro MORA zaznati vrste sprememb NOVO, SPREMENJENO (pri ceni: pocenitev,
  podražitev), NESPREMENJENO in NEDOSEGLJIVO; "nedosegljivo" samo, kadar je vir uspešno
  odgovoril in rezultata ni več, nikoli ob napaki vira.
- **FR-025**: Jedro MORA voditi zgodovino opazovanj rezultata (čas, vrednost, prejšnja vrednost,
  vrsta spremembe, zagon) z omejenim rokom hrambe, uveljavljenim brez ročnega posega.
- **FR-026**: Tip z lastno shrambo (leti) MORA izpolniti isti bralni vmesnik za generični prikaz:
  seznam rezultatov skenerja z razvrščanjem in omejitvijo, število rezultatov, en rezultat.
  Vmesnik ne sme siliti letov, avtov in slik v isto tabelo: tip lahko prispeva lasten prikaz.
- **FR-027**: Rezultati so vidni samo lastniku skenerja, pri letih pa še prejemnikom prek
  ujemanj, kot danes; rezultat brez vidne povezave do klicatelja "ne obstaja".

#### Obvestila

- **FR-028**: Jedro MORA sestaviti največ en zbirni dopis na prejemnika na zagon; ista sprememba
  NE SME biti sporočena dvakrat, tudi ob ponovitvi sestavljanja po prekinitvi.
- **FR-029**: Dopis se NE SME poslati, kadar v zagonu ni bilo nobene nove ali spremenjene stvari;
  dopis se pošlje ob NOVO in SPREMENJENO (način "vse spremembe", kot pri letih danes).
- **FR-030**: Pred pošiljanjem MORA jedro prek tipa znova preveriti vsako postavko (skener
  obstaja in je vklopljen, prejemnik je še lastnik ali prejemnik, rezultat še obstaja in ustreza);
  prazen dopis je zadržan z razlogom.
- **FR-031**: Neuspelo pošiljanje MORA biti ponovljeno z naraščajočim zamikom in omejenim
  številom poskusov; po izčrpanju je dopis označen kot neuspel z razlogom brez naslovov.
- **FR-032**: Naslov, uvod in prikaz posamezne postavke dopisa določi tip; jedro poskrbi za
  prevzem, pošiljanje po obstoječem poštnem mehanizmu, ponovitve in beleženje.
- **FR-033**: E-naslov prejemnika se v zapis dopisa NE shrani; prebere se ob pošiljanju iz
  imenika.
- **FR-034**: Potisna obvestila niso v obsegu te funkcionalnosti; jedro MORA biti zasnovano tako,
  da je drugi kanal mogoče dodati brez sprememb tipov.

#### Leti kot tip

- **FR-035**: Modul Leti se MORA registrirati kot tip "leti" z batch izvajanjem in lastno shrambo
  rezultatov; vsa obstoječa funkcionalnost (letališča, okna datumov, pravila, viri, združevanje
  poizvedb med uporabniki, dnevna meja neuradnega vira, identiteta ponudb, zgodovina cen,
  deljenje s prejemniki, dopis) ostane v modulu in nespremenjena.
- **FR-036**: Modul Leti NE SME več imeti lastnega tika, lastnega modela zagona, lastnih nastavitev
  urnika in lastnega outboxa dopisov; te zbirke se nadomestijo z generičnimi.
- **FR-037**: Obstoječe poti zavihka Leti (pregled, iskanja, urejevalnik, ponudba, deljene ponudbe)
  MORAJO ostati nespremenjene; administracija urnika, zagonov in outboxa se preseli v
  administracijo skenerjev, stara pot pa nanjo preusmeri; stanje virov letov ostane dosegljivo
  iz administracije skenerjev kot dodatek tipa.
- **FR-038**: Uporabniška pogodba modula Leti (iskanja, ponudbe, prejemniki, referenčni podatki)
  se NE spremeni; spremeni se samo administratorski del, ki dobi generično pogodbo.
- **FR-039**: Vsi obstoječi avtomatizirani testi modula Leti MORAJO teči nad novim jedrom brez
  spremembe pričakovanj, razen prilagoditve administratorskih poti.

#### Vmesnik

- **FR-040**: Zavihek "Skenerji" MORA biti v obstoječem meniju, privzeto vklopljen, dostopen vsem
  prijavljenim uporabnikom; seznam prikaže ime, tip, vklop, urnik, zadnje izvajanje z izidom,
  naslednje izvajanje in število rezultatov.
- **FR-041**: Ustvarjanje skenerja MORA potekati v treh korakih: izbira tipa (samo implementirani
  in vklopljeni), obrazec tipa, urnik in obvestila s skupnimi komponentami. Za lete je obrazec
  drugega koraka obstoječi obrazec iskanja z istimi preverjanji.
- **FR-042**: Prikaz rezultatov MORA biti generični kontejner, v katerega tip vstavi svoj prikaz;
  brez prispevka tipa se uporabi privzeti seznam (naslov, vir, cena, kadar obstaja, prvič in
  zadnjič videno, vrsta spremembe).
- **FR-043**: Odjemalec MORA imeti register tipov, v katerega se vsak modul registrira z eno
  vrstico (obrazec, prikaz rezultatov, opis); generični zasloni nobenega tipa ne poznajo po imenu.
- **FR-044**: Vsa besedila so v slovenščini, v tonu preostale aplikacije; identifikatorji in poti
  so angleški (člen X).

#### Administracija

- **FR-045**: Administracija skenerjev MORA biti dostopna izključno prijavljenemu administratorju
  (API ključ ne pride skozi) in MORA prikazati: urnike tipov z naslednjim terminom, zgodovino
  zagonov vseh tipov s podrobnostmi, tekoči zagon, outbox dopisov s stanjem in razlogi, ter
  dodatke posameznih tipov (pri letih stanje virov, dnevne meje, stanje pošte).

#### Testni tip

- **FR-046**: Obstajati MORA lahek testni tip "echo" z izvajanjem na skener in generično shrambo,
  ki vrača deterministične rezultate po scenariju (prvič N novih, drugič isto, tretjič ena
  sprememba, nato ena nedosegljiva), da dokaže registracijo, nastavitev, izvajanje po urniku,
  shranjevanje, zaznavo sprememb in dopis brez sprememb jedra.
- **FR-047**: Testni tip je privzeto izklopljen in v produkcijskem okolju MORA biti ob zagonu
  zavrnjen z imenom nastavitve, kot testni vir letov.

#### Splošno

- **FR-048**: Vsaka možnost vmesnika MORA biti dosegljiva tudi s HTTP klicem z API ključem z
  ustreznim obsegom (člen III); pogodba je OpenAPI in se vzdržuje s kodo.
- **FR-049**: Obsegi pravic so na tip (branje, pisanje; deljenje tam, kjer ga tip ima); skupni
  obsegi jedra pokrivajo seznam in administracijo.
- **FR-050**: Skrivnosti virov (žetoni) NIKOLI niso v odgovorih, v zapisu skenerja, v dnevniku ali v
  dopisu.
- **FR-051**: Odstranitev modula Leti ali testnega tipa (mapa, vnos v registru, vrstica
  registracije) pusti jedro in ostalo aplikacijo delujočo s čistimi preverjanji (člen I).
- **FR-052**: Dokumentacija MORA opisati: kako dodati tip skenerja, adapter do vira, korak
  obdelave, obrazec nastavitev, prikaz rezultatov in urnik; kako se zagoni registrirajo,
  posodabljajo in odstranjujejo; kaj se zgodi z obstoječimi podatki ob zamenjavi zbirk.

### Key Entities

- **Tip skenerja (ScannerType)**: vnos v registru — oznaka, ime, ikona, način izvajanja (batch ali
  na skener), pravila nastavitev, obsegi, shramba rezultatov (generična ali lastna), sestavljanje
  dopisa; lastnost kode, ne baze.
- **Skener (ScannerDefinition)**: lastnikova opredelitev enega preverjanja — ime, tip, vklop,
  urnik (lasten ali tipa), obvestila, nastavitve tipa, stanje zadnjega izvajanja; iskanje letov
  je skener tipa "leti", ki ga prispeva modul Leti iz svojega zapisa.
- **Urnik tipa (ScannerTypeSettings)**: en zapis na tip z batch izvajanjem — vklop, prednastavitev,
  izraz, časovni pas, pokrito do, kdo in kdaj spremenil.
- **Zagon (ScannerRun)**: eno izvajanje — obseg (tip ali skener), ključ termina, sprožilec, stanje,
  časi, utrip, zahteva po preklicu, števci, izidi po skenerjih, napake.
- **Rezultat (ScannerResult)**: en zapis v generični shrambi — skener, tip, vir, identiteta, zunanji
  identifikator, naslov, povezava, cena (neobvezna), podatki po kategoriji, prvič/zadnjič videno,
  razpoložljivost, zadnja sprememba.
- **Opazovanje (ScannerResultHistory)**: ena vrstica na rezultat na zagon — čas, vrednost,
  prejšnja vrednost, vrsta spremembe.
- **Dopis (ScannerNotification)**: en zbirni dopis enemu prejemniku za en zagon — tip, postavke
  (posnetek, kot ga sestavi tip), stanje, poskusi, čas pošiljanja, razlog zadržanja ali neuspeha.
- **Testni tip (echo)**: ločen tip z determinističnim scenarijem; samo za razvoj in teste.

## Out of Scope

- Pravi novi tipi skenerjev: avti, elektronika, slike, domene, poljubni API.
- Selitev ponudb, ujemanj in zgodovine cen letov v generično shrambo.
- Selitev obstoječih podatkov zagonov, urnika in dopisov letov (zbirke se zamenjajo brez
  prenosa; podatki so pogrešljivi po odločitvi lastnika 19. 10. 2026).
- Lasten urnik na posamezno iskanje letov (ostane urnik tipa; preklop je mogoč kasneje brez
  spremembe modela).
- Potisna obvestila in drugi kanali poleg e-pošte.
- Uporabniško definirani koraki obdelave ali pravila kot koda.
- Deljenje skenerjev drugih tipov s prejemniki (ostane last modula Leti za iskanja letov).
- Ploščica na nadzorni plošči.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100 % obstoječih avtomatiziranih testov modula Leti teče zeleno nad novim jedrom;
  spremenjena pričakovanja se nanašajo izključno na preseljene administratorske poti.
- **SC-002**: Scenarij testnega vira letov (NOVO → POCENITEV → PODRAŽITEV → NEDOSEGLJIVO) po
  refaktoringu ustvari enako število dopisov z enakimi postavkami kot pred njim — odstopanje 0.
- **SC-003**: Jedro (tik, model zagona, outbox, administracija, generični zasloni) ne vsebuje
  nobenega sklica na lete; preverjeno z avtomatiziranim pregledom uvozov in besedil.
- **SC-004**: Testni tip se doda s svojo mapo in natanko dvema vrsticama registracije (zaledje,
  odjemalec); odstranitev obeh pusti preverjanja tipov, sloga in testov čista.
- **SC-005**: Pri dveh skenerjih z lastnima urnikoma, od katerih eden vedno odpove, drugi v 100 %
  zagonov uspe in prejemnik dobi dopis samo zanj.
- **SC-006**: Za isto spremembo noben prejemnik ne prejme več kot enega dopisa — ob napaki pošte,
  ponovitvi in ponovnem zagonu med izvajanjem, v 100 % poskusov.
- **SC-007**: Spremenjen urnik (tipa ali skenerja) začne veljati brez ponovnega zagona in
  naslednje izvajanje se zgodi v minuti po terminu.
- **SC-008**: Uporabnik brez vloge administratorja v 100 % poskusov ne more spremeniti urnika tipa,
  sprožiti batch zagona ali videti tujega skenerja.
- **SC-009**: Seznam skenerjev se za uporabnika z 20 iskanji letov in 5 testnimi skenerji naloži v
  manj kot 2 sekundah in kaže iste številke ponudb kot zavihek Leti.
- **SC-010**: Uporabnik brez navodil ustvari testni skener v treh korakih v manj kot 2 minutah.
- **SC-011**: Vsi scenariji iz naročila (registracija tipa, preverjanje nastavitev, neodvisno
  izvajanje, izolacija napak, urnik in termini, shranjevanje, deduplikacija, zaznava sprememb,
  obvestila, nepodprt tip, ročni zagon, preklic, prekinitev, dva izvoda, pravice, pogrešljivi
  podatki) imajo avtomatiziran test z mockanimi zunanjimi viri.
- **SC-012**: Dokumentacija omogoča razvijalcu, ki jedra ne pozna, da doda nov tip po navodilu brez
  vprašanj; preverjeno s testnim tipom, zgrajenim po istem navodilu.

## Assumptions

- **Odločitve lastnika namestitve (19. 10. 2026)**, vgrajene v specifikacijo in zato brez oznak
  za razjasnitev: leti ostanejo svoj modul z lastnimi zbirkami in vmesnikom; skupen je urnik,
  zagon in obveščanje; podatki v bazi so pogrešljivi in se ne selijo; seznam skenerjev kaže tudi
  iskanja letov; zavihek "Skenerji" je privzeto vklopljen; administracija letov se preseli pod
  administracijo skenerjev s preusmeritvijo; testni tip "echo" je dokaz razširljivosti.
- Jedro živi v skupni plasti aplikacije (člen I: moduli se ne kličejo med sabo; skupne
  zmogljivosti so na enem mestu), tipi se registrirajo ob zagonu kot cilji uvoza in dodatki
  zavihkov.
- Urnik ostane zapis v bazi s tikom na minuto, kot pri 015 (člen V); živega cron časovnika ni.
- Namestitev teče v enem izvodu; zaščita pred podvajanjem med izvodi je vseeno zahtevana.
- E-pošta je edini kanal obvestil; poštni strežnik je lastnikov in nastavljen v okolju.
- Roki hrambe zagonov (90 dni), dopisov (90 dni) in opazovanj (180 dni) so izhodišče iz 015 in
  nastavljivi v namestitvi.
- Nastavitve okolja modula Leti za tik, rok prekinitve in roke hrambe postanejo skupne nastavitve
  jedra; stara imena ostanejo sprejeta z opozorilom, da obstoječe namestitve ne odpovejo.
- Uporabniki, ki jim je mogoče deliti (leti), so osebe, ki so se vsaj enkrat prijavile — kot
  pri 010, 013 in 015.
- Pri generični shrambi je rezultat last skenerja; deljenje rezultatov med skenerji je lastnost
  tipa (leti) in ne jedra.
