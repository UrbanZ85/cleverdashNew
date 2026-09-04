# Feature Specification: Prijava prek Keycloaka in večuporabniška aplikacija

**Feature Branch**: `main` — veja ni ustvarjena, ker `before_specify` git hook ni registriran

**Feature Directory**: `specs/004-keycloak-sso-multiuser`

**Created**: 2026-08-24

**Status**: Ready for planning — vsa odprta vprašanja razrešena

**Input**: User description: "ok narediva prijavo da bo iz keycloaka. spremeni login. prav
tako naredi da je app glede na uporabnika kateri se prijavi notri. tukaj bo potrebna velika
sprememba"

**Odvisnost**: Funkcionalnosti 001–003 (ogrodje, avtentikacija z e-pošto/geslom, zavihki
nadzorne plošče, beleženja časa in kamer) so dokončane in trenutno enouporabniške
(singleton nastavitve, en bootstrap uporabnik). Ta funkcionalnost nadomesti obstoječi način
prijave in pretvori aplikacijo iz enouporabniške v pravo večuporabniško — to je največji
poseg v ogrodje doslej in bo predvidoma zahteval spremembe v vseh treh obstoječih zavihkih
ter v modulu za avtentikacijo.

## Clarifications

### Session 2026-08-24

- Q: Koliko naj bo ločeno med uporabniki, ko je aplikacija "glede na uporabnika, kateri se
  prijavi notri"? → A: Popolnoma ločeni podatki na uporabnika — sistem preide iz
  enouporabniškega (singleton) modela v pravi večuporabniški model. Vsak uporabnik ima svoje
  nastavitve, postavitev ploščic, vidnost/vrstni red zavihkov, kamere in beleženje časa.
- Q: Kdo se sme prijaviti prek Keycloaka in kako se določijo pravice (admin/scope)? → A:
  Katerikoli uporabnik iz nastavljenega Keycloak realma/klienta; ali je administrator ali
  navaden uporabnik, določajo Keycloakove vloge/skupine, preslikane v obstoječi model
  `scopes` (glej `apps/api/src/platform/auth/scopes.ts`).
- Q: Kaj se zgodi z obstoječo prijavo z e-pošto/geslom in obstoječimi podatki (bootstrap
  uporabnik, singleton nastavitve)? → A: Popolnoma zamenjaj — Keycloak postane edini način
  prijave, prijava z e-pošto/geslom se v celoti odstrani. Obstoječi skupni podatki se ob
  uvedbi pripišejo uporabniku, ki dobi vlogo administratorja, da se nič ne izgubi.
- Q: Kaj se zgodi z osebnimi podatki uporabnika (nastavitve, kamere, zgodovina beleženja
  časa), ko je ta uporabnik v Keycloaku popolnoma odstranjen ali onemogočen (ne le odvzeta
  vloga)? → A: Podatki ostanejo v CleverDashu nedotaknjeni; dostop je zavrnjen, ker
  uporabnik ne more več mimo prijave. Aktivno brisanje podatkov ni del te funkcionalnosti.
- Q: Ali mora CleverDash med izpadom Keycloaka še naprej delovati za že prijavljene
  uporabnike, ali se dostop takoj prekine? → A: Vsaka pomembnejša zahteva preverja stanje pri
  Keycloaku v živo; če je Keycloak nedosegljiv, se dostop prekine tudi že prijavljenim
  uporabnikom, ne samo novim prijavam. Takojšnja uveljavitev preklica dostopa ima prednost
  pred razpoložljivostjo med izpadom Keycloaka.
- Q: Ali funkcionalnost vključuje zaslon v CleverDashu za pregled/upravljanje seznama
  uporabnikov, ali je to v celoti prepuščeno Keycloakovi konzoli? → A: Brez novega zaslona v
  CleverDashu. Upravljanje uporabnikov, vlog in skupin ostane izključno v Keycloaku; glej
  Out of Scope.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Prijava prek Keycloaka namesto gesla v CleverDashu (Priority: P1)

Uporabnik odpre CleverDash, ni prijavljen, in namesto obrazca za e-pošto/geslo je preusmerjen
na prijavno stran organizacije (Keycloak). Tam se prijavi s svojimi obstoječimi poverilnicami
in je preusmerjen nazaj v CleverDash, prijavljen.

**Why this priority**: Brez tega ni nič drugega uporabno — to je zamenjava vhodnih vrat v
aplikacijo in edini P1, ki mora delovati, preden lahko obstaja katerakoli druga zgodba.

**Independent Test**: Odpri CleverDash brez veljavne seje, preveri, da se pojavi preusmeritev
na Keycloakovo prijavo (ne stara stran z e-pošto/geslom), prijavi se z veljavnim Keycloak
računom in preveri, da je uporabnik nazaj v CleverDashu, prijavljen.

**Acceptance Scenarios**:

1. **Given** neprijavljen uporabnik odpre kateri koli URL v CleverDashu, **When** aplikacija
   ugotovi, da seje ni, **Then** je uporabnik preusmerjen na prijavo pri Keycloaku in po
   uspešni prijavi vrnjen na prvotno zahtevano stran v CleverDashu, prijavljen.
2. **Given** uporabnik z veljavnim Keycloak računom, ki pa nima nobene vloge/skupine, ki bi jo
   CleverDash prepoznal, **When** se poskusi prijaviti, **Then** je zavrnjen z jasnim
   sporočilom "nimate dostopa do te aplikacije", ne z generično napako prijave.
3. **Given** prijavljen uporabnik klikne "Odjava", **When** se odjava izvede, **Then** je
   uporabnikova seja v CleverDashu končana in tudi seja pri Keycloaku je končana (naslednji
   obisk CleverDasha znova zahteva prijavo, ne tihe ponovne prijave).
4. **Given** starejši zaznamek ali povezava na `/login` (staro prijavno stran z e-pošto in
   geslom), **When** jo uporabnik odpre, **Then** stran ne obstaja več oz. preusmeri v tok
   prijave prek Keycloaka.

---

### User Story 2 - Vsak uporabnik ima svojo, ločeno aplikacijo (Priority: P1)

Ko sta v CleverDashu prijavljena dva različna uporabnika (na dveh napravah ali v dveh
brskalnikih), vsak vidi svojo lastno postavitev nadzorne plošče, svoje zavihke, svoje kamere
in svojo zgodovino beleženja časa — spremembe enega uporabnika ne vplivajo na drugega.

**Why this priority**: To je bistvo zahteve "aplikacija glede na uporabnika" in glavni razlog
za to funkcionalnost; brez tega je Keycloak samo kozmetična zamenjava prijavnega obrazca nad
še vedno enim skupnim naborom podatkov.

**Independent Test**: Ustvari (ali uporabi) dva različna Keycloak uporabnika, prijavi se z
obema ločeno, spremeni nastavitve (temo, razporeditev ploščic, dodaj kamero) pri prvem in
preveri, da drugi uporabnik teh sprememb ne vidi in da ima lahko drugačne lastne nastavitve.

**Acceptance Scenarios**:

1. **Given** uporabnika A in B, oba prijavljena vsak v svoji seji, **When** uporabnik A
   spremeni razporeditev ploščic na nadzorni plošči ali vklopi/izklopi zavihek, **Then**
   uporabnik B ob osvežitvi vidi svojo, nespremenjeno postavitev.
2. **Given** uporabnik A doda kamero ali časovni vnos v beleženju časa, **When** se uporabnik
   B prijavi, **Then** B te kamere ali vnosa ne vidi med svojimi.
3. **Given** popolnoma nov uporabnik (še nikoli prijavljen v CleverDash), **When** se prvič
   prijavi prek Keycloaka, **Then** dobi delujočo aplikacijo s smiselnimi privzetimi
   nastavitvami, ne da bi kdorkoli moral vnaprej ročno ustvariti njegov račun v CleverDashu.
4. **Given** obstoječi podatki iz enouporabniške različice aplikacije (nastavitve, kamere,
   zgodovina beleženja časa), **When** se funkcionalnost uvede, **Then** so ti podatki po
   uvedbi vidni izključno uporabniku, ki mu je bila dodeljena vloga administratorja, ne
   katerikoli drugi osebi, ki se je pozneje prvič prijavila.

---

### User Story 3 - Vloga iz Keycloaka odloča o pravicah v CleverDashu (Priority: P2)

Skrbnik v Keycloaku uporabniku dodeli ali odvzame vlogo/skupino, ki pomeni administratorska
upravičenja v CleverDashu (npr. upravljanje API ključev). Sprememba se v CleverDashu odrazi
brez posega razvijalca ali ročnega urejanja v CleverDashevi bazi.

**Why this priority**: Pomembno za dejansko rabo v organizaciji z več ljudmi, a aplikacija je
uporabna tudi brez tega vsakemu posamezniku (P1 zgodbi) — zato P2, ne P1.

**Independent Test**: Uporabniku v Keycloaku dodeli vlogo administratorja, preveri, da po
naslednji prijavi/osvežitvi seje vidi administratorske zmožnosti v CleverDashu; nato mu vlogo
odvzemi in preveri, da jih v razumnem času izgubi, brez ponovnega guljenja kode.

**Acceptance Scenarios**:

1. **Given** uporabnik brez posebnih vlog, **When** mu skrbnik v Keycloaku doda vlogo
   administratorja in se uporabnik znova prijavi (ali se seja osveži), **Then** CleverDash
   uporabniku pokaže administratorske zmožnosti, ki jih prej ni imel.
2. **Given** uporabnik z administratorsko vlogo v aktivni seji, **When** mu skrbnik to vlogo v
   Keycloaku odvzame, **Then** CleverDash to upošteva ob naslednji obnovitvi/preverjanju seje,
   brez potrebe po ročnem posegu v CleverDashevi bazi.

---

### Edge Cases

- Kaj se zgodi, če je Keycloak ob poskusu prijave nedosegljiv? Sistem MORA jasno sporočiti
  napako prijave, ne sme pa spustiti uporabnika mimo avtentikacije.
- Kaj se zgodi, če Keycloak postane nedosegljiv, medtem ko so uporabniki že prijavljeni in
  aktivno uporabljajo CleverDash? Ker sistem stanje seje preverja v živo (FR-007), tudi ti
  uporabniki v tem času izgubijo dostop — to je sprejet kompromis (takojšen preklic dostopa
  je pomembnejši od razpoložljivosti med izpadom Keycloaka), ne napaka.
- Kaj če ima uporabnik v Keycloaku veljavne poverilnice, a nobene vloge/skupine, ki bi jo
  CleverDash prepoznal? Zavrnjen dostop z jasnim sporočilom "ni dostopa", ločeno od napake
  napačnih poverilnic.
- Kaj če je uporabniku dostop v Keycloaku odvzet (onemogočen račun, izbrisana vloga) medtem,
  ko ima v CleverDashu še aktivno sejo? Dostop MORA biti prekinjen praktično takoj, ob
  njegovi naslednji zahtevi (živo preverjanje pri Keycloaku, glej FR-006), brez ročnega
  posega v CleverDashu.
- Kaj če se uporabniku v Keycloaku spremeni e-poštni naslov ali prikazno ime? CleverDash ga
  MORA še vedno prepoznati kot isto osebo (prek stabilnega identifikatorja ponudnika
  identitete), ne sme ustvariti podvojenega uporabnika ali izgubiti njegovih osebnih
  podatkov.
- Kaj se zgodi z API ključi za avtomatizacijo (n8n in podobno)? Ostanejo nespremenjeni — ta
  funkcionalnost spreminja samo prijavo za ljudi (člen III ustave: API ključ ni geslo
  uporabnika in ni predmet te spremembe).
- Isti uporabnik prijavljen sočasno v dveh brskalnikih/napravah — obe seji morata delovati
  neodvisno druga od druge, brez navzkrižnega prepisovanja podatkov.
- Uporabnik, ki je bil v enouporabniški različici edini (bootstrap uporabnik), a mu preslikava
  vlog v Keycloaku po pomoti ne dodeli administratorske vloge — podeduje prazne privzete
  nastavitve namesto svojih starih podatkov (glej FR-014; odgovornost za pravilno preslikavo
  vlog je zunaj te specifikacije, na strani tistega, ki nastavlja Keycloak).
- Uporabnik je v Keycloaku popolnoma izbrisan ali onemogočen (ne le odvzeta vloga) — njegovi
  osebni podatki v CleverDashu ostanejo shranjeni nedotaknjeni (glej FR-016); dostop mu je
  zavrnjen izključno zato, ker ne more več uspešno skozi prijavo pri Keycloaku.

## Requirements *(mandatory)*

### Functional Requirements

**Prijava in identiteta**

- **FR-001**: Sistem MORA omogočiti prijavo uporabnika izključno prek zunanjega ponudnika
  identitete organizacije (Keycloak); prijava z e-pošto in geslom, specifičnim za CleverDash,
  NE SME več obstajati.
- **FR-002**: Sistem MORA neprijavljenega uporabnika, ki poskuša odpreti katerikoli del
  aplikacije, preusmeriti na prijavo pri Keycloaku in ga po uspešni prijavi vrniti na
  prvotno zahtevano stran.
- **FR-003**: Sistem MORA prepoznati uporabnika prek stabilnega identifikatorja, ki ga
  dodeli Keycloak (ne prek e-pošte), tako da poznejša sprememba e-pošte ali prikaznega imena
  v Keycloaku ne ustvari podvojenega uporabnika v CleverDashu.
- **FR-004**: Sistem MORA ob odjavi iz CleverDasha končati tudi sejo pri Keycloaku (enotna
  odjava), tako da naslednji obisk aplikacije znova zahteva prijavo.
- **FR-005**: Sistem MORA pri pomembnejših zahtevah v živo preveriti, da je uporabnikova seja
  pri Keycloaku še vedno veljavna, in MORA zahtevati ponovno prijavo takoj, ko ta seja pri
  Keycloaku poteče ali je preklicana — brez zanašanja na lokalno geslo.
- **FR-006**: Če Keycloak uporabniku odvzame dostop (npr. odstranitev iz zahtevane
  vloge/skupine ali izbris/onemogočenje računa) med aktivno sejo v CleverDashu, sistem MORA
  to zaznati in zavrniti naslednjo zahtevo tega uporabnika praktično takoj (živo preverjanje
  pri Keycloaku, ne šele ob redni periodični obnovitvi) — brez potrebe po ročnem posegu v
  CleverDashu.
- **FR-007**: Če Keycloak med aktivno uporabo CleverDasha postane nedosegljiv, sistem MORA
  zavrniti dostop tudi uporabnikom, ki so bili tik pred tem prijavljeni in veljavni — takojšnja
  uveljavitev morebitnega preklica dostopa ima namenoma prednost pred nadaljnjo
  razpoložljivostjo CleverDasha med izpadom Keycloaka.
- **FR-008**: Sistem MORA zavrniti prijavo osebe, ki jo Keycloak sicer potrdi, a ne nosi
  nobene vloge/skupine, ki jo CleverDash prepozna, z jasnim sporočilom o odsotnosti dostopa
  (ločeno od sporočila o napačnih poverilnicah).

**Osebni podatki in personalizacija po uporabniku**

- **FR-009**: Ob prvi uspešni prijavi uporabnika sistem MORA samodejno ustvariti njegov
  osebni profil in privzete nastavitve — brez potrebe po vnaprejšnjem ročnem ustvarjanju
  računa v CleverDashu.
- **FR-010**: Postavitev nadzorne plošče, vidnost in vrstni red zavihkov, tema, lokacija za
  vreme, seznam kamer in zgodovina beleženja časa vsakega uporabnika MORAJO biti zasebni
  temu uporabniku in jih drug uporabnik NE SME videti ali urejati.
- **FR-011**: Sistem MORA vsakemu uporabniku omogočiti samostojno prilagajanje lastnih
  zavihkov, postavitve ploščic in drugih osebnih nastavitev — enako kot je bilo doslej
  mogoče za skupne nastavitve, a omejeno izključno nanj samega.
- **FR-012**: Sistem MORA raven pravic uporabnika (npr. navaden uporabnik proti
  administratorju) izpeljati iz vlog/skupin, dodeljenih temu uporabniku v Keycloaku, in MORA
  to preslikavo ponovno preveriti ob vsaki prijavi oziroma obnovitvi seje, ne le enkrat ob
  ustvarjanju računa.
- **FR-013**: Sistem MORA uporabnikom z administratorsko vlogo ohraniti enake tehnične
  zmožnosti, kot jih je "admin" obseg omogočal doslej (npr. upravljanje API ključev za
  avtomatizacijo), ne da bi jim to samodejno odprlo vpogled v osebne podatke drugih
  uporabnikov, razen če to izrecno omogoči prihodnja funkcionalnost.

**Selitev obstoječih podatkov**

- **FR-014**: Sistem MORA ob uvedbi te funkcionalnosti ohraniti obstoječe skupne podatke
  (nastavitve, postavitev ploščic, seznam kamer, zgodovino beleženja časa) tako, da jih
  pripiše uporabniku, ki mu je dodeljena administratorska vloga, namesto da jih izgubi.
- **FR-015**: Sistem NE SME razkriti podatkov, podedovanih po FR-014, nobenemu drugemu
  uporabniku razen tistemu, ki mu so bili pripisani.

**Deprovisioniranje uporabnika**

- **FR-016**: Ko je uporabnik v Keycloaku popolnoma odstranjen, deaktiviran ali mu je odvzet
  ves dostop (ne le posamezna vloga), sistem MORA njegove osebne podatke (nastavitve,
  postavitev ploščic, kamere, zgodovino beleženja časa) obdržati nedotaknjene in jih NE SME
  samodejno izbrisati — dostop se zavrne izključno prek nezmožnosti uspešne prijave.
  Samodejno ali ročno brisanje podatkov nekdanjega uporabnika ni del te funkcionalnosti.

**Odstranitev stare prijave**

- **FR-017**: Sistem MORA odstraniti prijavni zaslon z e-pošto in geslom ter tok
  "obvezna sprememba gesla ob prvi prijavi" iz uporabniškega vmesnika in API-ja.
- **FR-018**: Sistem po tej spremembi NE SME shranjevati ali upravljati gesel uporabnikov za
  redno prijavo v CleverDash.
- **FR-019**: Prijava avtomatizacije prek API ključa z omejenim obsegom (obstoječi mehanizem
  za n8n in podobne odjemalce) MORA ostati nespremenjena in neodvisna od te spremembe (člen
  III ustave).

### Key Entities *(include if feature involves data)*

- **Uporabnik**: oseba, ki uporablja CleverDash. Ključni atributi: stabilen identifikator
  pri ponudniku identitete (Keycloak), prikazno ime, e-pošta, seznam dodeljenih vlog/obsegov,
  čas zadnje prijave. Nadomesti dosedanji koncept enega samega "bootstrap uporabnika".
- **Osebne nastavitve**: nastavitve teme, postavitve ploščic nadzorne plošče, vidnosti in
  vrstnega reda zavihkov ter lokacije za vreme — po ena množica na uporabnika namesto
  enega skupnega singleton dokumenta kot doslej.
- **Vloga / obseg**: preslikava med vlogo ali skupino pri ponudniku identitete in notranjimi
  dovoljenji (`scopes`) znotraj CleverDasha; določa, ali je uporabnik navaden uporabnik ali
  administrator.
- **Seja**: prijavljeno stanje uporabnika v CleverDashu, izpeljano iz seje pri ponudniku
  identitete, namesto dosedanje lokalne družine osvežilnih žetonov, vezane na geslo.
- **Osebni podatki modula**: podatki, ki jih hrani posamezen zavihek (kamere, vnosi
  beleženja časa ipd.) — po tej spremembi vsak tak nabor obstaja ločeno za vsakega
  uporabnika namesto enega skupnega za celotno aplikacijo.

## Out of Scope

- Zaslon ali orodje znotraj CleverDasha za pregled, iskanje ali upravljanje seznama
  uporabnikov aplikacije — to ostaja izključno v Keycloakovi administratorski konzoli
  (odločeno v Clarifications). CleverDash samo porabi vloge/skupine, ki jih dobi ob prijavi.
- Vzpostavitev, konfiguracija in vzdrževanje Keycloak realma, klienta, uporabnikov, skupin in
  vlog — to je delo tistega, ki upravlja Keycloak, ne del te funkcionalnosti (glej
  Assumptions).
- Samoregistracija novih uporabnikov v CleverDashu — nove uporabnike ustvarja Keycloak;
  CleverDash pokrije samo, kaj se zgodi, ko že obstoječ Keycloak uporabnik prvič pride noter
  (FR-009).
- Samodejno ali ročno brisanje osebnih podatkov uporabnika, ki je bil odstranjen ali
  onemogočen v Keycloaku (glej FR-016) — podatki ostanejo, brisanje bi bila ločena, prihodnja
  funkcionalnost.
- Nadaljnja razpoložljivost CleverDasha za že prijavljene uporabnike med izpadom Keycloaka —
  namerno žrtvovana v korist takojšnje uveljavitve preklica dostopa (glej FR-007).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uporabnik lahko od odprtja CleverDasha do prijavljenega stanja pride brez
  vnosa katerekoli CleverDashu specifične gesla — edino, kar vnese, so poverilnice pri
  ponudniku identitete organizacije.
- **SC-002**: Pri testu z vsaj dvema ločenima uporabniškima računoma se v 100 % primerov
  spremembe enega uporabnika (nastavitve, zavihki, kamere, beleženje časa) ne pojavijo pri
  drugem uporabniku — nič navzkrižnega uhajanja podatkov.
- **SC-003**: Uporabniku, ki mu je v ponudniku identitete odvzet dostop, je dostop do
  CleverDasha onemogočen praktično takoj — ob njegovi naslednji zahtevi v CleverDashu, ne
  šele ob naslednji periodični obnovitvi seje — brez ročnega posega v CleverDashu.
- **SC-004**: Nov uporabnik lahko začne uporabljati svoj, delujoč in personaliziran
  CleverDash takoj ob prvi prijavi, brez kakršnegakoli vnaprejšnjega ročnega ustvarjanja
  računa s strani administratorja.
- **SC-005**: Po uvedbi funkcionalnosti v sistemu ni shranjenega niti enega gesla, namenjenega
  redni prijavi v CleverDash.

## Assumptions

- Organizacija že ima delujoč Keycloak realm/klienta, do katerega se CleverDash povezuje;
  njegova vzpostavitev, vzdrževanje uporabnikov, skupin in vlog je izven obsega te
  funkcionalnosti — CleverDash se nanj samo priklopi, skladno s členom IV ustave (skrivnosti
  in konfiguracija povezave pridejo iz okolja, ne iz kode).
- En sam Keycloak realm/klient pokriva vse uporabnike CleverDasha; večnajemniška podpora med
  več organizacijami ni del te funkcionalnosti.
- Obstoječi model obsegov (`admin` = vsi obsegi, glej `apps/api/src/platform/auth/scopes.ts`)
  ostane konceptualno enak; spremeni se le način dodelitve — prek vloge/skupine v Keycloaku
  namesto prek edinega bootstrap uporabnika.
- Za pravilno pripisovanje obstoječih skupnih podatkov po FR-014 je odgovoren tisti, ki
  nastavi preslikavo vlog v Keycloaku ob uvedbi; napačna preslikava (npr. nihče ali napačna
  oseba dobi administratorsko vlogo) ni napaka te funkcionalnosti, ampak napaka konfiguracije
  ob uvedbi.
- Vsebina in videz same Keycloakove prijavne strani nista predmet te specifikacije — to je
  standardna izkušnja preusmeritve, ki jo upravlja ponudnik identitete.
- Registracija novih uporabnikov (kdo sploh dobi Keycloak račun) poteka pri ponudniku
  identitete, ne v CleverDashu — ta funkcionalnost pokriva samo, kaj se zgodi znotraj
  CleverDasha, ko že obstoječ Keycloak uporabnik pride prvič noter.
