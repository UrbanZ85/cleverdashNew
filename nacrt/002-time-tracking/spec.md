# Funkcionalnost 002 — Beleženje časa

**Zavihek:** Beleženje časa
**Odvisnost:** 001 (ogrodje, avtentikacija, obvestila, Docker) mora biti dokončan
**Referenca:** `docs/legacy-engine.md` — obvezno branje pred načrtovanjem

---

## Namen

Uporabnik mora vsak delovni dan na spletni strani delodajalca pritisniti gumbe za
prijavo na delo, začetek in konec malice ter konec dela. To je opravilo, ki se ne sme
pozabiti, se pa zlahka pozabi.

CleverDash to opravilo prevzame ali pa nadzoruje. Zna:

- **pritisniti gumb sam** ob dogovorjenem času, in preveriti, da je pritisk res učinkoval;
- **samo opozoriti**, če gumba ob dogovorjenem času ni pritisnil nihče — takrat na telefon
  pride obvestilo.

Ključna razlika od predhodnika: akcija ni "opravljena", ker jo je sistem sprožil, ampak
šele ko je potrjeno, da se je stanje na oddaljeni strani res spremenilo.

## Kaj ni v obsegu

- Izračun ur, nadur, salda ali poročil o delovnem času. Ta funkcija je pri delodajalcu.
- Urejanje že vpisanih zapisov na strani delodajalca (sistem samo pritiska gumbe, ki so
  na voljo).
- Podpora za več uporabnikov v smislu organizacije. Sistem je enouporabniški z
  možnostjo več naprav. [NEEDS CLARIFICATION: ali bo kdaj več oseb s svojimi urniki?]

---

## Uporabniške zgodbe

### Z1 — Običajen delovni dan, avtomatski način

**Kot** uporabnik z aktivnim profilom "Agenda LJ" v avtomatskem načinu
**želim** da se moja prijava na delo, malica in konec dela zabeležijo brez mojega
posega
**da** mi tega ni treba držati v glavi.

- **Dano** je danes torek, profil velja za pon–čet, način je `AUTO`, ni praznik ali dopust
- **Ko** nastopi načrtovani čas prijave na delo
- **Takrat** sistem odpre stran delodajalca, pritisne gumb "Prijava na delo", ponovno
  naloži stran, potrdi da je stanje zdaj "na delu", zapiše uspeh v zgodovino in pošlje
  potrditveno obvestilo na telefon.

### Z2 — Klik ne učinkuje

**Kot** uporabnik **želim** da sistem sam opazi, da pritisk ni učinkoval, in poskusi
znova, **da** en spodrsljaj ne pomeni manjkajočega vpisa.

- **Dano** je, da je sistem pritisnil gumb
- **Ko** ponovno branje stanja pokaže, da se stanje ni spremenilo
- **Takrat** sistem poskus označi kot neuspel, shrani posnetek zaslona in poskusi znova
  po naraščajočem zamiku
- **In** ko so poskusi izčrpani, pošlje obvestilo z jasnim opisom, kaj ni šlo, ter pusti
  akcijo v stanju `failed`, da je vidna v UI.

### Z3 — Način samo opozarjanje

**Kot** uporabnik, ki hoče gumbe pritiskati sam, **želim** da me sistem opozori, če sem
pozabil, **da** obdržim nadzor, a ne tvegam pozabe.

- **Dano** je profil v načinu `REMIND_ONLY`
- **Ko** je načrtovani čas akcije prekoračen za nastavljeno strpno obdobje (privzeto 10 min)
- **In** branje stanja pokaže, da se pričakovana sprememba ni zgodila
- **Takrat** sistem **ne klikne ničesar** in pošlje obvestilo: "Nisi pritisnil gumba
  Malica (načrtovano 10:02)"
- **In** obvestilo se ponovi po nastavljenem intervalu, dokler akcija ni opravljena ali
  ročno preskočena, a največ nastavljeno število ponovitev.

### Z4 — Praznik in vikend

**Kot** uporabnik **želim** da se na dela proste dni nič ne zgodi, **da** mi ni treba
vsakič ročno ugašati urnika.

- **Dano** je, da je 15. avgust in pade na delovni dan v tednu
- **Ko** sistem sestavlja načrt za ta dan
- **Takrat** ne ustvari nobene akcije, dan označi kot `holiday` in razlog zapiše v log
- **In** v UI je dan viden kot dela prost, z imenom praznika.

### Z5 — Dopust

**Kot** uporabnik, ki gre na dopust, **želim** vnesti obdobje odsotnosti, **da** urnik v
tem času miruje in mi za to ni treba ničesar ugašati.

- **Dano** je vnesen dopust od 1. do 15. julija
- **Ko** sistem sestavlja načrt za kateri koli dan v tem obdobju
- **Takrat** ne ustvari akcij in dan označi kot `vacation`
- **In** prvi delovni dan po dopustu urnik samodejno spet deluje, brez posega uporabnika.

### Z6 — Izredni delovni dan

**Kot** uporabnik, ki mora delati na sobotni delovni dan ali na praznik, **želim** ta
posamični dan vklopiti, **da** ne rabim spreminjati profila.

- **Dano** je vnesena izjema `forceWorkday` za določen datum in profil
- **Ko** sistem sestavlja načrt za ta dan
- **Takrat** ustvari akcije, kot bi bil običajen delovni dan tega profila.

### Z7 — Ročni pritisk iz aplikacije

**Kot** uporabnik **želim** iz telefona videti, katere akcije so trenutno na voljo, in
eno od njih pritisniti takoj, **da** lahko odstopim od urnika.

- **Dano** je odprt zaslon "Danes"
- **Ko** uporabnik izbere lokacijo in pritisne razpoložljivo akcijo
- **Takrat** sistem izvede akcijo, jo verificira in prikaže izid v nekaj sekundah
- **In** ročna akcija se zapiše v zgodovino kot `source: manual`
- **In** če se ta akcija ujema z danes načrtovano akcijo, se načrtovana označi kot
  opravljena, tako da opozorilo zanjo ne pride.

### Z8 — Potekla seja pri delodajalcu

**Kot** uporabnik **želim** izvedeti, da je seja potekla, **preden** začne urnik tiho
odpovedovati.

- **Dano** je, da se rok veljavnosti sejnega piškotka izteka v manj kot 7 dneh
- **Takrat** sistem pošlje opozorilo "seja e-računov se izteče v N dneh"
- **In** ko stran ne prikaže nobene razpoložljive akcije, sistem to diagnosticira kot
  potekla seja in ne kot "gumba ni na voljo"
- **In** uporabnik lahko novo vrednost piškotka vpiše v aplikaciji, brez ponovnega zagona
  sistema.

### Z9 — Sistem ne deluje

**Kot** uporabnik **želim** izvedeti, če se sistem ustavi, **da** tišine ne zamenjam za
uspeh.

- **Dano** je, da se strežnik, baza ali brskalnik ne odzivajo
- **Takrat** signal zunanji nadzorni storitvi utihne in ta pošlje alarm
- **In** ko se sistem povrne, dohiti zamujene akcije ter za vsako pošlje obvestilo, da je
  bila zamujena, namesto da bi jih tiho preskočil.

### Z10 — Zgodovina

**Kot** uporabnik **želim** videti, kaj se je zgodilo in kdaj, **da** lahko ob nesoglasju
z evidenco delodajalca preverim svojo stran zgodbe.

- **Dano** je odprt zaslon "Zgodovina" z izbranim obdobjem
- **Takrat** sistem prikaže vsako akcijo: načrtovani in dejanski čas, tip, profil, izid,
  število poskusov, vir (samodejno / ročno / API) in prebrano stanje pred in po
- **In** posamezen zapis je mogoče razširiti do posameznih poskusov, vključno s
  posnetkom zaslona ob napaki.

### Z11 — n8n avtomatizacija

**Kot** uporabnik, ki gradi avtomatizacije, **želim** vse to početi prek HTTP-ja, **da**
lahko CleverDash povežem z n8n.

- **Dano** je veljaven API ključ z ustreznim obsegom
- **Takrat** lahko n8n prebere stanje, sproži akcijo, prebere zgodovino, vnese dopust in
  vklopi ali izklopi profil
- **In** ponovljena zahteva z istim `Idempotency-Key` ne izvede akcije dvakrat
- **In** n8n lahko namesto poizvedovanja prejema izhodne webhooke ob dogodkih.

---

## Funkcionalne zahteve

### Urnik in profili

- **FR-001** Sistem omogoča več urniških profilov. Profil vsebuje ime, dneve tedna,
  načine ter čas za vsako akcijo v dnevu.
- **FR-002** Profil določa, katere akcije se v dnevu izvedejo in v kakšnem vrstnem redu.
  Nabor ni fiksen: dan je lahko sestavljen iz začetka in konca dela brez malice.
- **FR-003** Vsak čas v profilu ima lahko nastavljen raztros v sekundah. Dejanski čas se
  izračuna **ob sestavljanju dnevnega načrta** in shrani, da je vnaprej viden.
- **FR-004** Profil določa lokacijo: naslov strani, šablono koordinat in raztros v metrih.
- **FR-005** Profil ima način: `AUTO`, `REMIND_ONLY` ali `OFF`. Način je nastavljiv tudi
  na ravni posamezne akcije, kadar je to potrebno (npr. prijava samodejno, konec dela le
  opozorilo). [NEEDS CLARIFICATION: je način na ravni akcije res potreben, ali zadošča
  na ravni profila?]
- **FR-006** Dva profila ne moreta veljati za isti dan hkrati. Ob prekrivanju sistem
  zavrne shranjevanje z razumljivim sporočilom.

### Koledar delovnih dni

- **FR-010** Sistem pozna slovenske dela proste dni, vključno s premikajočimi se
  (velikonočni ponedeljek, binkoštna nedelja).
- **FR-011** Prazniki se ob prvi uporabi leta napolnijo samodejno, uporabnik pa jih lahko
  ročno popravi ali doda. Ročni vnos ima prednost pred samodejnim.
- **FR-012** Uporabnik lahko vnese obdobja odsotnosti z vrsto: `vacation`, `sick`,
  `other`. Obdobje ima začetni in končni datum, končni je vključen.
- **FR-013** Uporabnik lahko za posamezen datum vsili delovni dan (`forceWorkday`), tudi
  če je to vikend ali praznik.
- **FR-014** Odločitev "ali je ta dan za ta profil delovni" je določena po fiksni
  prednosti: `forceWorkday` > odsotnost > praznik > vikend/dan tedna profila.
- **FR-015** Uporabnik vidi koledarski pregled prihodnjih dni z označenim statusom vsakega
  dne in razlogom.

### Stanje in razpoložljive akcije

- **FR-020** Sistem zna prebrati trenutno stanje pri delodajalcu, ne da bi kar koli
  spremenil. Branje vrne seznam razpoložljivih akcij in iz njega izpeljano stanje.
- **FR-021** Imena akcij se berejo z žive strani in se ne trdo kodirajo. Sistem hrani
  zadnji uspešno prebrani nabor, da zna ob nedosegljivosti razlikovati med "ni akcij" in
  "ne morem prebrati".
- **FR-022** Če branje ne vrne nobene akcije, sistem to obravnava kot okvaro, ne kot
  veljavno stanje, in loči vzroke: potekla seja, nedosegljiva stran, spremenjena
  struktura strani.

### Izvedba in verifikacija

- **FR-030** V načinu `AUTO` sistem ob načrtovanem času izvede akcijo, nato **ponovno
  naloži stran** in preveri, da se je stanje spremenilo v pričakovano.
- **FR-031** Neuspela ali neverificirana akcija se ponovi z naraščajočim zamikom,
  privzeto trikrat. Vsi parametri so nastavljivi.
- **FR-032** Vsak poskus je zabeležen: čas začetka in konca, prebrano stanje pred in po,
  izid, sporočilo napake in posnetek zaslona ob neuspehu.
- **FR-033** Pred izvedbo sistem preveri, ali je akcija sploh na voljo. Če je stanje že
  takšno, kot bi bilo po akciji, se akcija označi kot `already_done` in ne kot napaka.
- **FR-034** Za en profil nikoli ne teče več kot ena akcija hkrati.
- **FR-035** Sistem ima način `dry-run`, ki vse izračuna, prebere in zabeleži, a ne
  klikne ničesar.

### Opozarjanje na zamujene akcije

- **FR-040** V načinu `REMIND_ONLY` sistem ob načrtovanem času plus strpnem obdobju
  preveri stanje. Če se pričakovana sprememba ni zgodila, pošlje obvestilo.
- **FR-041** Opozorilo se ponavlja v nastavljenem intervalu do nastavljenega števila
  ponovitev, dokler akcija ni izvedena ali ročno preskočena.
- **FR-042** Če uporabnik akcijo opravi sam (na telefonu, računalniku ali v aplikaciji),
  sistem to zazna pri naslednjem branju stanja in opozarjanje ustavi.
- **FR-043** Tudi v načinu `AUTO` uporabnik dobi obvestilo o končnem neuspehu akcije.
- **FR-044** Obvestilo vsebuje: kaj bi se moralo zgoditi, kdaj je bilo načrtovano, zakaj
  ni uspelo in gumb za neposreden prehod na ustrezen zaslon.

### Zgodovina

- **FR-050** Vsaka akcija je trajno zabeležena z: datumom, profilom, tipom, načrtovanim
  in dejanskim časom, izidom, virom (`schedule` / `manual` / `api`), številom poskusov ter
  stanjem pred in po.
- **FR-051** Zgodovina je filtrirljiva po obdobju, profilu, tipu akcije in izidu, ter
  strankirana.
- **FR-052** Zgodovina je nespremenljiva. Popravki se vnašajo kot nov zapis z opombo.
- **FR-053** Posnetki zaslona se hranijo omejeno obdobje (privzeto 30 dni) in se nato
  samodejno brišejo. Sam zapis ostane.

### Zdravje sistema

- **FR-060** Zdravstveni endpoint poroča: starost zadnjega tika scheduleria, povezavo z
  bazo, sposobnost zagona brskalnika, dosegljivost strani delodajalca, veljavnost seje in
  število neuspelih akcij v zadnjih 24 urah.
- **FR-061** Vsak tik javi življenjski znak zunanji nadzorni storitvi. Če javljanje
  utihne, alarm pride od zunaj.
- **FR-062** Sistem ob zagonu preveri, ali je zamudil akcije, in jih obdela: v `AUTO`
  izvede, če je še smiselno, sicer označi kot `missed` in o tem obvesti.
- **FR-063** Poteklost seje se preverja dnevno; opozorilo pride najmanj 7 dni prej,
  privzeto tudi še ob 3 dneh in 1 dnevu.
- **FR-064** Uporabnik ima zaslon za diagnostiko, ki iste podatke prikaže berljivo, in
  gumb za takojšnji preizkus branja stanja.

### Obvestila

- **FR-070** Obvestila se pošiljajo na registrirane naprave uporabnika.
- **FR-071** Neveljavni žetoni naprav se ob zavrnitvi samodejno odstranijo.
- **FR-072** Obvestila so razvrščena po vrsti (opozorilo na zamujeno, potrditev, napaka,
  zdravje) in uporabnik lahko vsako vrsto ugasne posamično.
- **FR-073** Vsako poslano obvestilo je zabeleženo z izidom dostave.
- **FR-074** Sistem ne pošlje dveh enakih obvestil za isto akcijo v istem intervalu.

### Dostop prek API-ja

- **FR-080** Vsaka funkcija iz te specifikacije je dosegljiva prek REST API-ja pod
  `/api/v1`, brez izjem.
- **FR-081** Avtomatizacije se avtenticirajo z API ključem z omejenim obsegom. Ključi se
  ustvarjajo in preklicujejo v aplikaciji; skrivnost se prikaže samo enkrat.
- **FR-082** Mutacijski endpointi sprejemajo `Idempotency-Key`; ponovljena zahteva z
  istim ključem vrne prvotni izid, ne izvede akcije drugič.
- **FR-083** Sistem lahko ob dogodkih pošilja izhodne webhooke (akcija uspela, neuspela,
  zamujena, seja poteka). Naslov in skrivnost za podpis sta nastavljiva.
- **FR-084** API ima omejevanje hitrosti; akcije, ki krmilijo brskalnik, so omejene
  strožje.

### Nastavitve

- **FR-090** Uporabnik lahko v aplikaciji ureja lokacije (ime, naslov, šablona koordinat,
  raztros) in jih izbira na zemljevidu.
- **FR-091** Uporabnik lahko v aplikaciji zamenja sejni piškotek, brez ponovnega zagona.
- **FR-092** Vrednost piškotka se v odgovorih API-ja nikoli ne vrne v celoti — samo
  maskirano in z rokom veljavnosti.

---

## Ključne entitete

| Entiteta | Kaj je | Bistvena polja |
|---|---|---|
| `TrackingProfile` | urniški profil za skupino dni | ime, dnevi tedna, način, lokacija, seznam načrtovanih akcij s časi in raztrosom, aktiven |
| `TrackingLocation` | kje se registracija zgodi | ime, naslov strani, šablona koordinat, raztros v metrih, sklic na sejo |
| `RemoteSession` | seja pri delodajalcu | ime in vrednost piškotka, domena, rok veljavnosti, stanje |
| `CalendarDay` | odločitev za en dan | datum, status (`workday`, `weekend`, `holiday`, `vacation`, `sick`, `other`, `forced`), razlog, vir |
| `AbsencePeriod` | odsotnost | vrsta, od, do, opomba |
| `Holiday` | dela prost dan | datum, ime, vir (samodejno / ročno), dela prost |
| `PlannedAction` | ena načrtovana akcija enega dne | lokalni datum, profil, tip akcije, načrtovani instant, stanje, poskusi, način |
| `ActionAttempt` | en poskus izvedbe | čas, izid, stanje pred in po, napaka, posnetek zaslona |
| `ActionRecord` | trajni zapis zgodovine | vse iz `PlannedAction` ob zaključku, plus vir in končni izid |
| `NotificationRecord` | poslano obvestilo | vrsta, naslov, besedilo, naprava, izid dostave, sklic na akcijo |
| `Heartbeat` | življenjski znak | čas tika, trajanje, kaj je bilo obdelano |
| `ApiKey` | ključ za avtomatizacijo | ime, zgoščena vrednost, obsegi, zadnja uporaba, preklican |

Stanja `PlannedAction`:

```
planned → due → running → succeeded
                        → failed        (poskusi izčrpani)
                        → already_done  (stanje je bilo že pravo)
         → missed        (čas prekoračen, ni bilo izvedeno)
         → skipped       (uporabnik preskočil)
         → cancelled     (dan postal dela prost po sestavljanju načrta)
```

---

## Podedovane omejitve

Te izhajajo iz obstoječega sistema in niso predmet presoje:

1. **Identiteta je sejni piškotek.** Ni uporabniškega imena in gesla, ni API-ja
   delodajalca. Piškotek poteče in ga je treba občasno zamenjati.
2. **Stran je treba obiskati z brskalnikom.** Zahteva geolokacijo in mobilni user-agent;
   brez tega gumbov ne prikaže.
3. **Razpoložljive akcije so edini vpogled v stanje.** Ni endpointa, ki bi vrnil "trenutno
   sem na delu". Stanje se izpeljuje iz nabora gumbov.
4. **Imena akcij so slovenska besedila z gumbov** in morajo biti znakovno enaka.
5. **Časovni pas je `Europe/Ljubljana`**, s prehodi na poletni in zimski čas.

---

## Odprta vprašanja

- [NEEDS CLARIFICATION: Ali naj bo privzeti način `AUTO` ali `REMIND_ONLY`? Predlog:
  `REMIND_ONLY` kot varnejša začetna nastavitev, `AUTO` se vklopi zavestno.]
- [NEEDS CLARIFICATION: Kakšno je strpno obdobje pred opozorilom in kolikokrat naj se
  opozorilo ponovi? Predlog: 10 minut, ponovitev vsakih 10 minut, največ trikrat.]
- [NEEDS CLARIFICATION: Ali naj sistem pošlje potrditveno obvestilo tudi ob **uspešni**
  samodejni akciji? Star sistem je pošiljal. Štiri obvestila na dan je lahko preveč.
  Predlog: privzeto samo prva in zadnja akcija dneva, nastavljivo.]
- [NEEDS CLARIFICATION: Ali ostane pošiljanje e-pošte, ali obvestila na telefon
  zadostujejo? Star sistem je pošiljal oboje.]
- [NEEDS CLARIFICATION: Kaj naj se zgodi, če uporabnik pozabi na "Konec dela" in dan
  preide v naslednji? Predlog: akcija se ob polnoči zapre kot `missed` z obvestilom, ker
  je zapis za nazaj pri delodajalcu tako ali tako ročno opravilo.]
- [NEEDS CLARIFICATION: Ali naj se profil ob več zaporednih dnevih napak samodejno
  preklopi v `REMIND_ONLY`? Predlog: da, po treh zaporednih dneh, z obvestilom.]

---

## Kontrolni seznam za sprejem

- [ ] Vse funkcionalne zahteve so preverljive brez poznavanja implementacije
- [ ] Vsaka uporabniška zgodba ima ustrezen avtomatiziran test
- [ ] Nobena zahteva ne predpisuje knjižnice ali sheme baze
- [ ] Vse oznake `[NEEDS CLARIFICATION]` so razrešene prek `/speckit-clarify`
- [ ] Pokriti so mejni primeri: prehod na poletni čas, praznik na delovni dan, dopust
      preko meje meseca, potekla seja, restart med dnevom, dva profila v istem tednu
- [ ] Podedovane omejitve so v načrtu naslovljene, ne obidene
