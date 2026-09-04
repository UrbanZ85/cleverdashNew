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
