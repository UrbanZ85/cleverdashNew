# Feature Specification: Deljenje datotek

**Vhodno gradivo**: `nacrt/009-file-sharing/spec.md`
**Datum**: 2026-09-02
**Stanje**: Draft

## Zakaj

Zahteva je bila tri povedi: *"še en zaslon bi rabil in sicer tak da lahko sharam kakšne
datoteke do velikosti 500mb. in sicer upload datoteke samo prijavljen uporabnik. download pa
je lahko samo s pomočjo urlja * passworda. torej č enisi prijavljen ne moreš dobiti te
datoteke ali če imaš password samo za ta file potem lahko zlodaš. drugače ne gre."*,
dopolnjena z: *"tudi to je modul samo za uporabnika če si ga enabla"*.

Za tem stoji vsakdanji problem: datoteko, ki je prevelika za e-pošto, je treba nekomu poslati.
Običajni odgovori so tuje storitve za prenos in oblačni diski. Vsi imajo isti dve
pomanjkljivosti: osebna datoteka gre na tuj strežnik, in **povezava sama je ključ** — kdor jo
dobi naprej, dobi datoteko, ker za njo ni ničesar drugega.

CleverDash teče na uporabnikovem lastnem strežniku in ima svoj prostor na disku. Datoteka
torej lahko ostane doma, prejemnik pa je zunanji človek, ki računa nima in ga ne bo dobil.
Zahteva zato postavi dvoje vrat, ne enih: **naslov IN geslo**. "drugače ne gre" pomeni, da
nobeno od obojega samo zase ne zadošča.

Ta modul prvič uvede v CleverDash **drugega uporabnika** — takega, ki ni prijavljen in ne bo.
Doslej je vsak zaslon predpostavljal prijavljenega lastnika; stran za prevzem datoteke je prva
izjema in je zato osrednje tveganje te funkcionalnosti, ne postranska podrobnost.

Najbližja sorodnika sta modul beležk (007) po razporeditvi kode (oseben zapis, lasten zavihek,
tuj zapis vrne 404) in modul kamer (003) po ravnanju s poverilnicami. Od obeh se loči v
dvojem: vsebina je prevelika za bazo, in del vmesnika je javen.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pošljem veliko datoteko nekomu, ki nima računa (Priority: P1) 🎯 MVP

Prijavljen naložim datoteko (do 500 MB). Ob koncu dobim povezavo in geslo, ki ju pošljem
prejemniku. Ta odpre povezavo, vpiše geslo in datoteko prenese — brez računa, brez prijave,
brez nameščanja česar koli.

**Sprejemni scenariji**

1. **Ko** izberem datoteko in potrdim, **potem** vidim napredek nalaganja in po koncu povezavo
   ter geslo, oboje pripravljeno za kopiranje.
2. **Ko** geslo enkrat zaprem, **potem** me je sistem na to vnaprej opozoril in mi ponudi
   izdajo novega gesla — starega ne prikaže nikoli več.
3. **Ko** prejemnik odpre povezavo in vpiše pravilno geslo, **potem** se prenos začne in
   datoteka prispe cela, enaka naloženi.
4. **Ko** je datoteka velika 500 MB, **potem** se naloži in prenese do konca, brez napake in
   brez okrnjene vsebine.
5. **Ko** poskusim naložiti datoteko, večjo od dovoljene, **potem** je zavrnjena s sporočilom,
   kolikšna je meja — in za sabo ne pusti ničesar.

---

### User Story 2 - Brez gesla nihče ne dobi ničesar (Priority: P1)

Sam naslov povezave ne odklene datoteke. Napačno geslo je ne odklene. Geslo druge datoteke je
ne odklene. Ugibanje z avtomatom se ustavi.

**Sprejemni scenariji**

1. **Ko** kdor koli odpre povezavo brez gesla, **potem** vidi samo, da datoteka čaka, njeno
   velikost in do kdaj velja — imena datoteke NE vidi in prenosa ne more začeti.
2. **Ko** vpiše napačno geslo, **potem** prenosa ni in sporočilo ne pove, ali je bilo blizu.
3. **Ko** poskuša z geslom, ki odklepa DRUGO datoteko, **potem** je zavrnjen enako kot z
   napačnim geslom.
4. **Ko** zaporedoma vpiše več napačnih gesel, **potem** so nadaljnji poskusi za določen čas
   zavrnjeni, tudi če bi bilo geslo pravilno.
5. **Ko** je povezava neznana, potekla ali preklicana, **potem** je sporočilo v vseh treh
   primerih ENAKO — kdor ima naslov, ne izve, katera od možnosti drži.

---

### User Story 3 - Vidim in upravljam, kar sem delil (Priority: P2)

V zavihku vidim seznam svojih naloženih datotek: ime, velikost, kdaj sem jo naložil, do kdaj
velja, koliko prenosov je bilo. Povezavo lahko prekličem, datoteko izbrišem, geslo izdam na
novo.

**Sprejemni scenariji**

1. **Ko** odprem zavihek, **potem** vidim svoje datoteke s stanjem vsake (na voljo,
   preklicana, potekla) in številom prenosov.
2. **Ko** povezavo prekličem, **potem** naslednji poskus prevzema ne dobi vsebine — tudi če je
   prejemnik geslo že prej pravilno vpisal.
3. **Ko** izdam novo geslo, **potem** stara povezava v celoti preneha delovati in vmesnik mi
   pove, kaj moram prejemniku poslati znova.
4. **Ko** datoteko izbrišem, **potem** izgine s seznama in njena vsebina se sprosti z diska.
5. **Ko** so bili na moji povezavi neuspeli poskusi gesla, **potem** to vidim in lahko
   ukrepam.
6. **Ko** poskusim odpreti datoteko drugega uporabnika, **potem** dobim odgovor, kot da ne
   obstaja.

---

### User Story 4 - Povezava poteče sama (Priority: P3)

Ob nalaganju izberem, koliko časa povezava velja. Ko rok poteče, prenos ni več mogoč, datoteka
pa se po roku hrambe sama odstrani z diska.

**Sprejemni scenariji**

1. **Ko** naložim datoteko in roka ne spreminjam, **potem** velja privzeti rok in ta je jasno
   izpisan.
2. **Ko** rok poteče, **potem** prevzem ni več mogoč, jaz pa datoteko na svojem seznamu še
   vidim kot poteklo.
3. **Ko** izberem "brez roka", **potem** je to na seznamu izrecno označeno, da mi je jasno,
   katere povezave živijo naprej.
4. **Ko** je bil strežnik ugasnjen čez rok več datotek, **potem** se ob zagonu zaostanek
   pobriše — nič poteklega ne ostane na disku samo zato, ker je sistem takrat spal.

---

### User Story 5 - Zavihek si vklopim sam (Priority: P4)

Modul je stvar izbire. Dokler si zavihka ne vklopim, ga v meniju ni.

**Sprejemni scenariji**

1. **Ko** modula nisem vklopil, **potem** zavihka v meniju ni in njegov zaslon ni dosegljiv.
2. **Ko** ga v nastavitvah vklopim, **potem** se pojavi brez ponovne prijave.
3. **Ko** ga pozneje izklopim, **potem** izgine iz menija, že deljene povezave pa delujejo
   naprej — izklop zavihka ni preklic deljenja.

---

### User Story 6 - Naložim datoteko brez vmesnika (Priority: P5)

Avtomatizacija (n8n) naloži datoteko s HTTP klicem in dobi nazaj povezavo in geslo — enako,
kot bi jo naložil sam v vmesniku.

**Sprejemni scenariji**

1. **Ko** n8n z veljavnim API ključem naloži datoteko, **potem** se ta pojavi na mojem seznamu
   in odgovor vsebuje povezavo in geslo.
2. **Ko** poskusi naložiti datoteko, večjo od meje, ali čez kvoto, **potem** je zavrnjen enako
   kot vmesnik — API ključ ne obide nobene omejitve.
3. **Ko** isto zahtevo za preklic ali brisanje ponovi z istim `Idempotency-Key`, **potem** se
   ne zgodi dvakrat.

### Edge Cases

- **Nalaganje se prekine** (zaprt zavihek, izgubljeno omrežje, preklic) → zapis ni viden na
  seznamu, delna vsebina se odstrani, zasedeni prostor se sprosti.
- **Napovedana velikost laže** (glava pove 10 MB, dejansko priteče 900 MB) → nalaganje se
  prekine med prenosom, ne šele na koncu; vsebina se zavrže.
- **Prazna datoteka (0 bajtov)** → zavrnjena s pojasnilom.
- **Kvota je polna** → zavrnitev pove, koliko prostora je na voljo in kaj lahko sprostim.
- **Disk je poln** → nalaganje se prekine z razumljivim sporočilom; sistem to zabeleži kot
  napako namestitve, ne kot uporabnikovo napako.
- **Ime datoteke vsebuje `../`, ločila poti, nevidne znake ali je dolgo 300 znakov** → za
  prikaz se ohrani očiščeno, v hrambi se NE uporabi kot pot.
- **Dve datoteki z istim imenom** → dva neodvisna zapisa, vsak s svojo povezavo in geslom.
- **Prenos se prekine na sredini** → prejemnik ga lahko nadaljuje ali ponovi, dokler povezava
  velja.
- **Lastnik prekliče povezavo med prenosom** → prenos v teku se prekine, nove zahteve so
  zavrnjene.
- **Zapis obstaja, vsebine na disku ni** (ročni poseg, obnovitev baze iz varnostne kopije) →
  lastnik vidi zapis kot pokvarjen, prejemnik dobi napako; tiho vračanje prazne datoteke je
  prepovedano.
- **Vsebina na disku obstaja, zapisa zanjo ni** → osirotela vsebina se odstrani ali izrecno
  poroča; ne sme tiho zasedati prostora za vedno.
- **Lastnik odpre svojo povezavo, prijavljen v istem brskalniku** → prevzem se obnaša enako kot
  za zunanjega prejemnika; obstoj seje nanj ne vpliva v nobeno smer.
- **Datoteka drugega uporabnika prek API-ja** → 404, ne 403 (obstoj tuje datoteke ni podatek).

## Requirements *(mandatory)*

### Functional Requirements

#### Nalaganje

- **FR-001**: Nalaganje je na voljo IZKLJUČNO prijavljenemu uporabniku z ustreznim obsegom;
  neprijavljena zahteva za nalaganje se zavrne.
- **FR-002**: Največja velikost ene datoteke je 500 MB in MORA biti nastavljiva ob namestitvi.
- **FR-003**: Meja se uveljavi DVAKRAT: iz napovedane velikosti, preden se začne pisati, in
  med samim prenosom. Napovedana velikost je odjemalčeva obljuba, ne dejstvo.
- **FR-004**: Vsebina datoteke se med nalaganjem NE SME v celoti zadrževati v pomnilniku
  strežnika; teče v hrambo sproti. Poraba pomnilnika ne sme rasti sorazmerno z velikostjo
  datoteke.
- **FR-005**: Uporabnik med nalaganjem vidi napredek in lahko nalaganje prekliče.
- **FR-006**: Prekinjeno, preklicano ali zavrnjeno nalaganje NE SME pustiti niti vidnega
  zapisa niti delne vsebine v hrambi.
- **FR-007**: Ime datoteke se ohrani za prikaz, a se NE SME uporabiti kot pot v hrambi.
  Čiščenje imena (ločila poti, `..`, nevidni in za hrambo nedopustni znaki, dolžina) je
  deterministična funkcija in MORA biti enotsko testirano.
- **FR-008**: Datoteka velikosti 0 bajtov se zavrne s pojasnilom.
- **FR-009**: Vsak uporabnik ima kvoto skupnega zasedenega prostora, nastavljivo ob
  namestitvi. Ob preseženi kvoti je nalaganje zavrnjeno s sporočilom, koliko prostora je na
  voljo.

#### Povezava in geslo

- **FR-010**: Ob uspešnem nalaganju nastaneta povezava za prevzem in geslo. Geslo generira
  SISTEM; uporabnik ga ne izbira in ne more nastaviti svojega.
- **FR-011**: Geslo je prikazano natanko enkrat, takoj po nalaganju, z vnaprejšnjim
  opozorilom, da ga pozneje ni več mogoče prebrati. Vmesnik omogoča kopiranje povezave in
  gesla.
- **FR-012**: Geslo se hrani izključno v obliki, iz katere izvirnega gesla ni mogoče
  izračunati; sistem ga zna preveriti, ne prebrati. Preverjanje MORA biti izvedeno tako, da
  čas odgovora ne izda, koliko znakov se ujema.
- **FR-013**: Geslo je naključno, iz kriptografsko varnega vira, in dovolj dolgo, da ugibanje
  ob dušenju iz FR-030 ni izvedljivo. Naključnost NE SME izhajati iz časa, imena datoteke ali
  identifikatorja zapisa.
- **FR-014**: Naslov povezave vsebuje naključen žeton, ki NI izpeljan iz identifikatorja
  zapisa, imena datoteke, lastnika ali zaporedne številke. Iz ene povezave ni mogoče izpeljati
  druge.
- **FR-015**: Lastnik lahko za datoteko izda novo geslo. S tem nastane tudi nov naslov
  povezave in stara povezava v celoti preneha delovati; vmesnik izrecno pove, da je treba
  prejemniku poslati oboje znova.
- **FR-016**: Eno geslo odklene NATANKO eno datoteko. Geslo, pridobljeno za eno datoteko, ne
  sme odkleniti nobene druge.

#### Prevzem (javna stran)

- **FR-020**: Stran za prevzem je dosegljiva BREZ prijave in brez računa in NE SME preusmerjati
  na prijavo.
- **FR-021**: Prevzem zahteva OBOJE — naslov povezave in geslo. Nobeno od obojega samo zase ne
  zadošča.
- **FR-022**: Pred vpisom pravilnega gesla stran NE SME razkriti imena datoteke. Pokaže samo,
  da datoteka čaka, njeno velikost in datum poteka.
- **FR-023**: Neznana, potekla, preklicana in izbrisana povezava dajo ENAKO sporočilo — kdor
  ima naslov, ne izve, katera od možnosti drži.
- **FR-024**: Prevzem je neodvisen od tega, ali ima brskalnik veljavno sejo CleverDasha: brez
  seje mora delovati, s sejo se ne sme obnašati drugače.
- **FR-025**: Prejemnik lahko prekinjen prenos nadaljuje ali ponovi, dokler povezava velja.
- **FR-026**: Odklenitev z geslom velja kratek čas in samo za to eno datoteko; po izteku je
  treba geslo vpisati znova. Preklic povezave razveljavi tudi že izdano odklenitev.
- **FR-027**: Lastnik lahko svojo datoteko prenese iz zavihka brez vpisovanja gesla.
- **FR-028**: Sistem šteje uspešne prevzeme; število in čas zadnjega sta vidna lastniku.

#### Zaščita pred ugibanjem

- **FR-030**: Poskusi vpisa gesla se dušijo — na povezavo IN na izvorni naslov. Po preseženi
  meji so nadaljnji poskusi za določen čas zavrnjeni, tudi če je geslo pravilno.
- **FR-031**: Meje dušenja (število poskusov, dolžina okna, trajanje zavrnitve) so nastavljive
  ob namestitvi.
- **FR-032**: Vsak neuspel poskus se zabeleži v strukturiran dnevnik (čas, povezava, izvorni
  naslov, ID korelacije). Zapis NE SME vsebovati poskušenega gesla.
- **FR-033**: Lastnik vidi, da so bili na njegovi povezavi neuspeli poskusi, in koliko jih je
  bilo; če je povezava zaradi tega zaklenjena, to vidi in lahko ukrepa.

#### Veljavnost, preklic in čiščenje

- **FR-040**: Ob nalaganju uporabnik izbere rok veljavnosti; privzetek je nastavljiv ob
  namestitvi. "Brez roka" je dovoljena izbira in je na seznamu izrecno označena.
- **FR-041**: Lastnik lahko povezavo kadar koli takoj prekliče. Preklic učinkuje na naslednjo
  zahtevo in prekine prenos, ki že teče.
- **FR-042**: Potekla ali preklicana povezava ne omogoča prenosa; datoteka ostane lastniku,
  dokler je ne izbriše ali dokler ne poteče rok hrambe.
- **FR-043**: Sistem sam odstrani potekle datoteke (zapis IN vsebino) po nastavljivem roku
  hrambe. Čiščenje je last tega modula in ne sme biti odvisno od drugega modula (člen I).
- **FR-044**: Čiščenje je idempotentno in dohitevajoče: ob vsakem zagonu pobere vse, kar bi
  moralo biti odstranjeno in ni. Izpad sistema ne sme pomeniti, da poteklo ostane za vedno.
- **FR-045**: Brisanje datoteke odstrani zapis IN vsebino. Če vsebine ni mogoče odstraniti,
  zapis NE SME tiho izginiti — napaka mora biti vidna (člen VII).

#### Hramba in celovitost

- **FR-050**: Vsebina datotek se hrani zunaj baze, na trajnem nosilcu, ki preživi ponovni
  zagon in posodobitev. Namestitev iz čiste kopije z izpolnjenim `.env` MORA nosilec ustvariti
  sama (kakovostna vrata, točka 4).
- **FR-051**: Sistem MORA znati povedati, kadar se zapis in vsebina razideta: zapis brez
  vsebine je za lastnika viden kot pokvarjen, osirotela vsebina brez zapisa se odstrani ali
  izrecno poroča. Tiho neskladje je prepovedano.
- **FR-052**: Ob prevzemu se preveri, da je velikost vsebine enaka zapisani; neskladje je
  napaka, ne tih delni prenos.
- **FR-053**: Naložena datoteka je vidna izključno svojemu lastniku; poizvedba tuje datoteke
  vrne 404, ne 403.
- **FR-054**: Vsebina naložene datoteke se ne bere in ne obdeluje zaradi ničesar drugega kot
  hrambe in prenosa — sistem je ne pregleduje, ne indeksira in ne pošilja nikamor.

#### API in obsegi

- **FR-060**: Vsaka operacija iz vmesnika MORA biti dosegljiva tudi s HTTP klicem (člen III);
  pogodba je OpenAPI 3.1 in se vzdržuje v istem PR-ju kot koda.
- **FR-061**: Modul ima lastna obsega za branje in pisanje; osnovna uporabniška vloga ju MORA
  dobiti, sicer je zavihek dosegljiv samo administratorju.
- **FR-062**: Mutacijski endpointi lastnika sprejmejo `Idempotency-Key`. Javni endpoint za
  odklenitev z geslom te glave NE sprejme — izdaja kratkotrajno dovolilnico in sodi pod izjemo
  člena III; ta izjema MORA biti izrecno zapisana v OpenAPI pogodbi.
- **FR-063**: API ključ ne obide nobene omejitve: velikost, kvota, obsegi in lastništvo veljajo
  enako kot za vmesnik.

#### Zavihek

- **FR-070**: Zavihek se v meni doda z enim vnosom v register zavihkov; njegova ikona MORA biti
  registrirana, sicer se izriše prazen prostor.
- **FR-071**: Zavihek je viden samo uporabniku, ki ga ima vklopljenega. PRIVZETO je izklopljen
  in ga uporabnik vklopi v nastavitvah.
- **FR-072**: Izklop zavihka NE prekliče že deljenih povezav — je nastavitev prikaza, ne stikalo
  za deljenje.
- **FR-073**: Javna stran za prevzem NI zavihek: ni v registru zavihkov, ni v meniju in ni
  odvisna od tega, ali ima lastnik zavihek vklopljen.
- **FR-074**: Zavihek MORA imeti prazno stanje (»še nič ni naloženo« z gumbom za prvo
  nalaganje) in stanje nalaganja — nikoli prazen bel zaslon.

### Key Entities

- **Deljena datoteka** — lastnik, prikazno ime, velikost, vrsta vsebine, čas nalaganja, rok
  veljavnosti, stanje (v nalaganju / na voljo / preklicana / potekla / pokvarjena), žeton
  povezave, nepovratni zapis gesla, števec prenosov in čas zadnjega prenosa, kazalec na
  vsebino v hrambi.
- **Vsebina v hrambi** — bajti datoteke zunaj baze, naslovljeni z identifikatorjem, ki ni
  uporabnikovo ime datoteke.
- **Dovolilnica za prevzem** — kratkotrajno dokazilo, da je bilo za TO datoteko vpisano pravilno
  geslo. Ni prenosljiva na drugo datoteko, poteče sama in jo preklic povezave razveljavi.
- **Števec poskusov** — neuspeli poskusi gesla na povezavo in na izvorni naslov v časovnem
  oknu; podlaga za dušenje in za to, kar o poskusih vidi lastnik.

## Out of Scope

- Deljenje med uporabniki CleverDasha — prejemnik je zunanji človek brez računa; interno
  deljenje bi bila druga funkcionalnost.
- Mape, oznake, iskanje po vsebini datotek, predogled in urejanje vsebine.
- Nadaljevanje prekinjenega NALAGANJA (chunked/resumable) in nalaganje več datotek hkrati.
- Protivirusno preverjanje naloženih datotek.
- Šifriranje vsebine na disku (poverilnice kamer so šifrirane, ker so skrivnost sistema;
  naložena datoteka je uporabnikova vsebina — če to postane zahteva, naj bo svoja odločitev).
- Ploščica na nadzorni plošči.
- Javna stran za NALAGANJE — prejemnik ne more poslati datoteke nazaj.
- Obveščanje lastnika ob vsakem prevzemu (števec zadošča).

## Success Criteria *(mandatory)*

- **SC-001**: Datoteka velikosti 500 MB se naloži in prevzame cela — kontrolna vsota prevzete
  datoteke je enaka naloženi, v 100 % primerov iz testnega nabora.
- **SC-002**: Med nalaganjem in prevzemom 500 MB datoteke poraba pomnilnika strežnika ne raste
  sorazmerno z velikostjo datoteke; dve sočasni nalaganji ne porušita storitve.
- **SC-003**: Brez pravilnega gesla datoteke ni mogoče dobiti v 100 % primerov iz testnega
  nabora: sam naslov, napačno geslo, geslo druge datoteke, potekla povezava, preklicana
  povezava.
- **SC-004**: Neprijavljen prejemnik prevzame datoteko v treh potezah — odpre povezavo, prilepi
  geslo, klikne prenos — brez računa in brez nameščanja česar koli.
- **SC-005**: Avtomatizirano ugibanje je ustavljeno: v testu, ki v eni uri pošlje 10 000
  napačnih gesel na eno povezavo, sistem obdela le toliko poskusov, kolikor jih dovoljuje
  nastavljena meja, ostale zavrne.
- **SC-006**: Po preklicu ni nobenega uspešnega prenosa — niti iz seje, ki je geslo pravilno
  vpisala pred preklicem.
- **SC-007**: Po zagonu, ki sledi izpadu čez rok več datotek, na disku ne ostane nobena
  datoteka, ki bi ji rok hrambe potekel.
- **SC-008**: Prekinjena in zavrnjena nalaganja ne pustijo ničesar: zasedeni prostor po
  testnem naboru prekinitev je enak kot pred njim.
- **SC-009**: Vsaka operacija vmesnika je izvedljiva tudi s HTTP klicem z API ključem — 100 %
  pokritost, preverjeno s pogodbenimi testi.
- **SC-010**: Uporabnik, ki zavihka nima vklopljenega, ga ne vidi in njegov zaslon zanj ni
  dosegljiv; vklop v nastavitvah ga prikaže brez ponovne prijave.
- **SC-011**: Zapis brez vsebine na disku je v 100 % primerov prikazan kot pokvarjen in nikoli
  kot uspešen prenos prazne datoteke.

## Assumptions

- Prejemnik je zunanji človek brez računa. Povezavo in geslo mu lastnik pošlje po svoji poti;
  sistem pošiljanja ne prevzame in ne pozna prejemnikovega naslova. Priporočilo, naj gresta
  povezava in geslo po ločenih kanalih, je stvar besedila v vmesniku, ne funkcije.
- Geslo je vidno enkrat. Izgubljeno geslo se NE obnovi — izda se novo, kar razveljavi tudi
  staro povezavo (FR-015).
- Pred vpisom gesla prejemnik vidi velikost in datum poteka, ne pa imena datoteke. Velikost je
  potrebna, da ve, na kaj se pripravlja; ime je podatek, ki bi ušel vsakomur z naslovom.
- Privzeti rok veljavnosti je 7 dni, z izbirami 1, 7 in 30 dni ter "brez roka"; privzetek in
  nabor izbir sta nastavljiva ob namestitvi.
- Zavihek je privzeto IZKLOPLJEN — dopolnilo zahteve ("modul samo za uporabnika, če si ga
  enabla") ga postavlja kot stvar izbire, za razliko od obstoječih zavihkov.
- Zbirka je reda velikosti nekaj deset do nekaj sto datotek na uporabnika, ne deset tisoč.
- Vsebina se na disku hrani nešifrirana; nosilec je last iste namestitve in ista skrb kot baza.
- Avtentikacija, vloge in obsegi so rešeni v 004 in se ne spreminjajo.
- Zaledje trenutno nima nobenega mehanizma za dušenje zahtev (odstranjen v 004, ko ga je za
  prijave prevzel Keycloak). Dušenje iz FR-030 je zato NOVA sestavina te funkcionalnosti in ne
  uporaba obstoječe.
- Kakovostna vrata, točka 2: ta funkcionalnost nima predmeta za prehod na poletni/zimski čas,
  praznik na delovni dan, dopust čez mejo meseca ne neuspel klik, ki se uspešno ponovi.
  Nadomeščajo jih enotski testi: preverjanje gesla neodvisno od ujemajoče se predpone, izračun
  in iztek roka veljavnosti, števec dušenja na meji časovnega okna, čiščenje imena datoteke,
  izračun kvote in prehodi stanj ob preklicu, poteku in brisanju. To MORA biti izrecno
  zapisano tudi v načrtu.

---

# Dopolnitev 009b: Sprejem datotek (obrnjena smer)

**Datum**: 2026-09-08
**Stanje**: Vgrajeno

## Zakaj

Zahteva je bila ena poved: *"bi lahko naredil pri deljenju še obratno opcijo. da dam jaz url in
kodo in potem lahko nekdo uploda file"*, z izrecno zahtevo, naj bo narejeno tako, da *"ne more
kar nekdo najti kakšno varnostno luknjo in uploda kar hoče"*.

Prvotna 009 je javno stran za nalaganje imela med izrecno izključenimi stvarmi ("Javna stran za
NALAGANJE — prejemnik ne more poslati datoteke nazaj"). Ta dopolnitev to odločitev obrne, ker gre
za drugo polovico iste potrebe: če je datoteka prevelika za e-pošto, je prevelika v obe smeri.
Kdor mi mora poslati skenirano pogodbo, ima isti problem, kot sem ga imel jaz, ko sem mu jo
pošiljal — in ravno tako nima računa in ga ne bo dobil.

Vzorec je zato NAMENOMA enak: dvoje vrat, naslov IN koda, in nobeno od obojega samo zase ne
zadošča. Kar je drugače, je posledica ene same razlike: **te poti pišejo na disk v imenu nekoga,
ki ni prijavljen**. Do 009b je bilo najhujše, kar je znal narediti kdor koli z naslovom, to, da
je prebral, kar mu je bilo namenjeno.

## User Scenarios & Testing

### User Story 7 - Nekdo brez računa mi odda datoteko (Priority: P1)

Ustvarim povezavo za oddajo in dobim naslov ter kodo. Pošljem ju nekomu; ta odpre povezavo, vpiše
kodo, izbere datoteko in jo odda. Datoteka se pojavi na mojem seznamu.

**Sprejemni scenariji**

1. **Ko** ustvarim predal, **potem** dobim naslov in kodo, oboje pripravljeno za kopiranje, in
   kodo vidim natanko enkrat.
2. **Ko** pošiljatelj odpre povezavo in vpiše pravilno kodo, **potem** vidi, za kaj je predal, in
   lahko odda datoteko; napredek oddaje vidi in jo lahko prekliče.
3. **Ko** oddaja uspe, **potem** pošiljatelj dobi potrdilo, kaj je prispelo, jaz pa datoteko na
   svojem seznamu z oznako, da je prejeta, in z navedbo, kdo jo je oddal.
4. **Ko** je datoteka pri meni, **potem** je to navadna moja datoteka: prenesem jo, izbrišem, in
   če se odločim, jo delim naprej — a šele, ko to izrecno storim.
5. **Ko** predal zaprem ali izdam novo kodo, **potem** stara povezava takoj preneha delovati,
   tudi za tistega, ki je kodo že vpisal.
6. **Ko** predal izbrišem, **potem** prejete datoteke OSTANEJO.

---

### User Story 8 - Nekdo, ki povezavo najde, ne more ničesar (Priority: P1)

Sam naslov ne odpre predala. Napačna koda ga ne odpre. Koda drugega predala ga ne odpre. Ugibanje
z avtomatom se ustavi. In tudi tisti, ki kodo IMA, ne more oddati več, kot sem dovolil.

**Sprejemni scenariji**

1. **Ko** kdor koli odpre povezavo brez kode, **potem** vidi samo, da predal obstaja, dovoljeno
   velikost in do kdaj velja — za kaj je predal, NE vidi in oddati ne more ničesar.
2. **Ko** je predal neznan, potekel, zaprt ali izbrisan, **potem** je sporočilo v vseh štirih
   primerih ENAKO — in enako kot pri povezavi za prevzem.
3. **Ko** pošiljatelj s kodo poskusi oddati več datotek ali več bajtov, kot sem dovolil, **potem**
   je zavrnjen s pojasnilom, ki ne razkrije, koliko prostora imam jaz.
4. **Ko** napove velikost 1 MB in pošlje 400 MB, **potem** se oddaja prekine med prenosom in za
   sabo ne pusti ničesar.
5. **Ko** oddajo poskusi sprožiti tuja stran v imenu obiskovalca, **potem** ne uspe — dovolilnica
   ni piškotek in je brskalnik ne pripne sam.
6. **Ko** ima dovolilnico enega predala, **potem** z njo ne more pisati v drug predal niti v
   datoteko, ki sem jo naložil sam.
7. **Ko** oddaja uspe, **potem** pošiljatelj o predalu ne izve nič novega — niti kaj je v njem
   oddal kdo drug.

### Edge Cases

- **Oddaja se prekine** (zaprt zavihek, izgubljeno omrežje, preklic) → zapisa ni, delna vsebina
  se odstrani, rezerviran prostor se takoj sprosti.
- **Pošiljatelj napove datoteko in vsebine nikoli ne pošlje** → rezervacija ne sme predala tiho
  zapolniti: število hkratnih nedokončanih oddaj je omejeno, pometač pa viseče zapise pobere.
- **Prispelo je manj bajtov od napovedanih** → zavrnitev, ne tiho shranjena okrnjena datoteka.
- **Telo je napovedano kot obrazec ali JSON** → zavrnitev s pojasnilom; sicer bi se na disk
  zapisale meje obrazca ali pa bi bila datoteka prazna, ker bi telo požrl razčlenjevalnik.
- **Dva pošiljatelja oddajata hkrati** → meja predala ne sme biti presežena z nobenim vrstnim
  redom prihoda.
- **Lastnikova kvota se napolni med oddajo** → zavrnitev, ki pošiljatelju pove, naj obvesti
  prejemnika, in ne razkrije lastnikovih številk.
- **Lastnik zniža mejo predala pod že prejeto količino** → preostanek je 0, nikoli negativen.
- **Lastnik odpre svoj predal, prijavljen v istem brskalniku** → koda je še vedno potrebna;
  obstoj seje na oddajo ne vpliva v nobeno smer.
- **Ime oddane datoteke vsebuje `../` ali krmilne znake** → očiščeno za prikaz, nikoli pot.
- **Pošiljatelj se izmisli navedbo, kdo je** → to je NAVEDBA in vmesnik je ne predstavlja kot
  ugotovljeno istovetnost.

## Requirements

### Functional Requirements

#### Predal in koda

- **FR-080**: Sprejemni predal ustvari IZKLJUČNO prijavljen uporabnik (ali avtomatizacija) z
  obsegom za pisanje; neprijavljena zahteva za nastanek predala se zavrne.
- **FR-081**: Oddaja zahteva OBOJE — naslov predala IN kodo. Nobeno od obojega samo zase ne
  zadošča.
- **FR-082**: Kodo generira SISTEM, prikazana je natanko enkrat, hrani pa se izključno v obliki,
  iz katere je ni mogoče izračunati. Preverjanje ne sme izdati, koliko znakov se ujema.
- **FR-083**: Lastnik lahko izda novo kodo. S tem nastane tudi NOV naslov, stari v celoti preneha
  delovati in vse izdane dovolilnice se razveljavijo. Isto velja za zaprtje predala.
- **FR-084**: Pred vpisom kode stran NE SME razkriti oznake predala, navodila ne lastnika. Pokaže
  samo, da predal obstaja, dovoljeno velikost ene datoteke in rok. Dovoljena velikost je
  NASTAVITEV predala in ne njegov preostali prostor — preostanek bi bil števec dogajanja za
  vsakogar, ki ima naslov.
- **FR-085**: Neznan, potekel, zaprt in izbrisan predal dajo ENAKO sporočilo, in to isto kot
  neveljavna povezava za prevzem.
- **FR-086**: Predal je ENOSMEREN: po javnih poteh ni mogoče ničesar prebrati, našteti, prenesti
  ali izbrisati. Edini bralec prejetih datotek je lastnik.

#### Meje

- **FR-087**: Predal ima svoji meji, ki ju lastnik izbere ob nastanku: največje število datotek in
  največ skupaj. Obe sta navzgor omejeni z nastavitvijo namestitve, presežek pa je zavrnitev in ne
  tiho znižanje. Meji sta shranjeni na predalu, zato poznejša sprememba nastavitve namestitve
  starega predala ne razširi.
- **FR-088**: Vsaka oddaja se preveri proti ŠTIRIM mejam: velikost ene datoteke (nastavitev
  namestitve), prostor predala, kvota lastnika ter stanje in rok predala. Prve tri se uveljavijo
  DVAKRAT — pred prenosom iz napovedane velikosti in med prenosom iz dejanske.
- **FR-089**: Napovedana velikost je ZAVEZUJOČA: napovedana dolžina telesa mora biti enaka njej in
  prispeti mora natanko toliko. Manj ali več od napovedanega je zavrnitev, ne delna datoteka.
- **FR-090**: Poskusi vpisa kode se dušijo — na predal IN na izvorni naslov. Po preseženi meji so
  nadaljnji poskusi za določen čas zavrnjeni, tudi če je koda pravilna. Števec izvornega naslova je
  SKUPEN s dušenjem pri prevzemu: napadalec, ki ugiba po obeh javnih površinah z istega naslova, je
  en napadalec in mora zadeti isto mejo. Lastnik vidi, da nekdo ugiba, in koliko poskusov je bilo.
- **FR-091**: Oddaja se NE avtenticira z ambientno poverilnico. Dovolilnico, ki jo izda vpis kode,
  mora odjemalec pripeti IZRECNO (glava, ne piškotek) — tuja stran tako ne more sprožiti oddaje v
  imenu obiskovalca.
- **FR-096**: Nedokončana oddaja ne pusti ničesar: ne zapisa, ne delne vsebine, ne rezerviranega
  prostora. Število hkratnih nedokončanih oddaj na predal je omejeno, ker rezervacija prostor
  zaseda, še preden vsebina prispe.

#### Prejeta datoteka

- **FR-092**: Prejeta datoteka je od trenutka prejema LASTNIKOVA: šteje v njegovo kvoto, je na
  njegovem seznamu z oznako, da je prejeta, in z navedbo pošiljatelja, ter NIMA roka veljavnosti —
  sistem je ne izbriše sam.
- **FR-093**: Prejeta datoteka NI samodejno deljena naprej: nima naslova za prevzem ne gesla,
  dokler ju lastnik izrecno ne izda.
- **FR-094**: Zaprtje, potek ali izbris predala NE odnese prejetih datotek. Predal je pot, po
  kateri so prišle, in ne njihov imetnik.
- **FR-095**: Oddana vsebina se ne pregleduje, ne indeksira in ne izvaja; prenese jo lahko samo
  lastnik in vedno kot priloga.

#### Pogodba in javna površina

- **FR-097**: Javni endpointi predala NE sprejmejo `Idempotency-Key` — izdajajo dovolilnico
  (izjema člena III) in so hkrati javni, neomejeno pisanje v zbirko ključev z zahtevo brez
  poverilnic pa je pot do njenega polnjenja.
- **FR-098**: Vse javne poti obeh smeri ostanejo v ENI datoteki, in test, ki seznam poti bere iz
  POGODBE, preveri, da je vsaka lastnikova pot brez žetona 401 in vsaka javna dosegljiva. Nova
  javna družina poti se ne more pritihotapiti tako, da bi jo test razumel kot pričakovano.
- **FR-099**: Vsaka operacija predala je dosegljiva tudi s HTTP klicem z API ključem (člen III);
  ključ ne obide nobene meje.

### Key Entities

- **Sprejemni predal** — lastnik, oznaka, navodilo, žeton naslova, nepovraten zapis kode, stanje
  (odprt / zaprt), rok, meji (število datotek, skupni bajti), števec zgrešenih poskusov kode.
  Zapis brez vsebine: kar prispe po njem, je deljena datoteka z referenco na predal.
- **Dovolilnica za oddajo** — kratkotrajno dokazilo, da je bila za TA predal vpisana pravilna
  koda. Ni prenosljiva na drug predal, poteče sama, razveljavita jo zaprtje in nova koda, in NE
  potuje kot piškotek.

## Out of Scope (009b)

- Obveščanje lastnika ob vsaki prejeti datoteki (števec in seznam zadoščata; enaka odločitev kot
  pri prevzemih v 009).
- Nadaljevanje prekinjene ODDAJE (chunked/resumable) in oddaja več datotek hkrati.
- Protivirusno preverjanje oddanih datotek (velja FR-054/FR-095).
- Urejanje predala po nastanku (druga oznaka, drug rok, druge meje) — nadomešča ga nov predal;
  edini dovoljeni poseg v obstoječi predal sta zaprtje in nova koda.
- Omejevanje oddaje na določene vrste datotek.
- Sporočilo pošiljatelja lastniku, ki bi bilo daljše od navedbe, kdo je.

## Success Criteria (009b)

- **SC-020**: Brez pravilne kode ni mogoče oddati ničesar v 100 % primerov iz testnega nabora:
  sam naslov, napačna koda, koda drugega predala, potekel predal, zaprt predal, izbrisan predal.
- **SC-021**: Nekdo, ki kodo IMA, ne more preseči nobene od štirih mej — niti z lažjo o velikosti,
  niti z vzporednimi oddajami, niti z visečimi napovedmi brez vsebine.
- **SC-022**: Nobena zavrnitev oddaje ne pusti za sabo zapisa, delne vsebine ali rezerviranega
  prostora; zasedenost po testnem naboru zavrnitev je enaka kot pred njim.
- **SC-023**: Pred vpisom kode odgovor javne poti ne vsebuje oznake predala, navodila ne podatka o
  tem, koliko je predal že prejel — preverjeno s primerjavo odgovora pred oddajo in po njej.
- **SC-024**: Oddaja, ki jo poskusi sprožiti tuja stran, ne uspe brez izrecno pripete glave z
  dovolilnico.
- **SC-025**: Po izbrisu ali poteku predala je vsaka prejeta datoteka še vedno na lastnikovem
  seznamu in jo je mogoče prenesti.
- **SC-026**: Vsaka operacija predala je izvedljiva s HTTP klicem z API ključem — preverjeno s
  pogodbenimi testi.
