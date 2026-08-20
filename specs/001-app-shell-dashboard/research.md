# 001 — Raziskava in tehnične odločitve (Phase 0)

Bere se skupaj s [plan.md](./plan.md), [data-model.md](./data-model.md),
[contracts/openapi.yaml](./contracts/openapi.yaml) in [quickstart.md](./quickstart.md).

Podlaga: poglavje A iz `nacrt/002-time-tracking/plan.md`, `docs/env-reference.md`,
`docs/legacy-engine.md` in preverjanja zunanjih virov z 19. 8. 2026, zapisana v
`nacrt/001-app-shell-dashboard/spec.md`.

Vsi zapisi imajo enako obliko: **Odločitev**, **Zakaj**, **Zavrnjene možnosti**.

---

## §1 Razrešena odprta vprašanja iz vhodnih dokumentov

Vhodni dokumenti so nosili dva markerja. Oba sta imela v izvirniku napisan predlog in oba
sta tu sprejeta kot odločena.

### 1.1 Poti API-ja: slovenske ali angleške

**Odločitev:** angleške, kebab-case, verzionirane pod `/api/v1/`. Primer preslikave iz
starega sistema: `POST /api/pregled_zgodovine_urnikov` →
`GET /api/v1/time-tracking/history`.

**Zakaj:** člen X ustave loči domeno od kode — imena akcij beleženja časa (`Prijava na delo`,
`Malica`) so domenski podatki in ostanejo slovenska, ker morajo biti znakovno enaka besedilu
na e-računih. Poti pa niso domenski podatek, ampak vmesnik: berejo jih OpenAPI pogodba,
generirani odjemalci in n8n. Mešanje jezikov v poteh bi pomenilo, da generirani tipi nosijo
šumnike in podčrtaje.

**Zavrnjene možnosti:** slovenske poti kot v starem sistemu — zavrnjeno, ker `snake_case` s
šumniki v URL-ju sili v odstranjevanje sičnikov ali v odstotkovno kodiranje, oboje pa se
pozneje pojavi v imenih generiranih funkcij.

### 1.2 E-pošta poleg potisnih obvestil

**Odločitev:** celoten sklop SMTP ostane v okolju kot **neobvezen** in v 001 **ni v obsegu**.
Če `SMTP_HOST` ni nastavljen, se pošiljanje preskoči brez napake. Ko se e-pošta vklopi (v
002), služi samo napakam in opozorilom o poteku seje, nikoli vsakodnevnim potrditvam.

**Zakaj:** 001 nima dogodka, ki bi ga bilo vredno poslati po e-pošti — obvestila iz FR-030
do FR-034 so potisna in njihova vsebina pride z 002. Vgraditev pošiljalnika zdaj bi bila
koda brez uporabnika.

**Zavrnjene možnosti:** popolna odstranitev SMTP iz `.env.example` — zavrnjeno, ker
`docs/env-reference.md` §3 e-pošto predvideva kot rezervo, kadar telefon nima omrežja, in
ker je stari sistem to pot že imel. Ostane opisana, a neaktivna.

---

## §2 Radarska slika: proxy, ne neposredna povezava

**Odločitev:** odjemalec kliče `GET /api/v1/dashboard/radar` in dobi `image/gif` iz
strežniškega predpomnilnika. Strežnik hrani zadnjo uspešno pridobljeno sliko in jo streže
tudi takrat, ko izvor ne odgovori, z glavo, ki pove starost.

**Zakaj:** trije razlogi se seštejejo.

1. Stari CleverDash sliko nalaga prek `http://`. Na `https://app.si` bi bila taka zahteva
   zavrnjena kot mešana vsebina — slika bi preprosto izginila, brez sporočila o napaki.
2. Člen VIII ustave prepoveduje, da odjemalec poizveduje zunanji vir v zanki. Ob FR-022
   (osveževanje na 5 minut) bi vsaka odprta naprava sama tolkla po ARSO.
3. Brez proxyja ni kje hraniti zadnje znane slike, torej FR-026 ni izvedljiv.

Izvor pošilja `cache-control: no-cache, max-age=300`, kar je natanko TTL, ki ga predpisuje
`RADAR_CACHE_SECONDS=300`. Predpomnilnik je torej usklajen z izvorom, ne agresivnejši od
njega — to je zahteva člena VIII, ne optimizacija.

**Zavrnjene možnosti:**

- Neposredna povezava iz odjemalca prek `https://` — zavrnjeno zaradi točk 2 in 3. Deluje,
  a krši ustavo in onemogoči FR-026.
- Vgradnja slike v odgovor kot base64 — zavrnjeno, ker ~101 kB v JSON odgovoru naraste na
  ~135 kB in izgubi možnost pogojne zahteve.

**Izvedbena podrobnost:** ob osveževanju se pošlje pogojna zahteva (`If-Modified-Since` iz
shranjenega `last-modified`). Ob `304` se osveži samo `fetchedAt`, slika se ne prenese
znova. Naslov `si43-rm-anim.gif` vrne 404 in se ne uporablja; statična različica `si0-rm.gif`
(~15 kB) je zabeležena kot rezerva, če se animirana pokvari.

---

## §3 Vremenski podatki: JSON primarno, besedilni vir kot rezerva

**Odločitev:** primarni vir je `https://vreme.arso.gov.si/api/1.0/location/?location=<ime>`,
prek strežniškega predpomnilnika s TTL 600 s. Iz odgovora se preberejo samo polja, ki jih
zahteva FR-023, in sicer iz `observation.features[0].properties.days[].timeline[]`:
`t`, `rh`, `ff_val`, `ff_shortText`, `dd_shortText`, `clouds_shortText`,
`clouds_icon_wwsyn_icon`, `valid`. Kratka napoved (FR-024) uporablja `forecast3h` iz istega
odgovora, torej ne dodaja novega zunanjega vira.

**Zakaj:** odgovor je ~72 kB in vsebuje precej več, kot dashboard prikaže. Branje ozkega
nabora polj prek Zod sheme pomeni, da sprememba v neuporabljenem delu odgovora ne podre
ploščice. Zod validacija na robu je tudi mehanizem za robni primer "vir odgovori uspešno,
a s spremenjeno strukturo": validacija odpove, zapiše se napaka, prikaže se zadnji znani
podatek.

**Zavrnjene možnosti:**

- Neposredni klic iz brskalnika. Vir pošilja `access-control-allow-origin: *`, torej bi
  tehnično delovalo — a člen VIII to izrecno prepove, in brez strežniškega predpomnilnika
  ni zadnjega znanega podatka.
- Besedilni (XML) vir kot primarni — zavrnjeno, ker je razčlenjevanje slovenskega
  besedilnega opisa napovedi bistveno bolj krhko od JSON strukture. Ostane kot rezerva, če
  se JSON vmesnik spremeni. Naslov `fcast_si_latest.xml` vrne 404; delujoči so trije,
  navedeni v specifikaciji.

**Navedba vira** (FR-027) ni oblikovna podrobnost, ampak pogoj uporabe podatkov. Strežnik
zato v vsakem odgovoru vrne polje `attribution` z besedilom in povezavo, da navedba ne more
izpasti zaradi pozabljenega dela na odjemalcu. E2E test to preveri.

---

## §4 Kje živi predpomnilnik zunanjih virov

**Odločitev:** ena kolekcija v MongoDB (`externalCache`), z binarnim ali JSON telesom,
časom pridobitve, TTL-jem in izvornimi glavami (`etag`, `lastModified`). Velja za radar
(~101 kB) in za vreme (~72 kB).

**Zakaj:** FR-026 zahteva zadnji znani podatek — tudi po ponovnem zagonu. Predpomnilnik v
pomnilniku procesa tega ne izpolni; prvi restart pomeni prazen dashboard, kar je natanko
tisto, kar FR-026 prepoveduje. Mongo je že v postavitvi, oba zapisa sta daleč pod omejitvijo
velikosti dokumenta, in en mehanizem je lažje testirati kot dva.

**Zavrnjene možnosti:**

- Pomnilniški LRU — zavrnjeno zaradi restarta, glej zgoraj.
- Datoteke na disku za sliko in Mongo za JSON — zavrnjeno, ker sta to dve poti za isto
  odgovornost, dva načina odpovedi in dvakratna testna površina. Če se izkaže, da velikost
  slik postane težava, je prehod na GridFS lokalna sprememba znotraj `platform/cache/`.
- Redis — zavrnjeno, ker bi dodal vsebnik in odvisnost za predpomnilnik z dvema ključema.

**Pomembno:** TTL se ne uveljavlja s samodejnim brisanjem zapisa (Mongo TTL indeks), ampak
z branjem `expiresAt` ob dostopu. Zapis mora **preživeti** iztek, ker je iztečen zapis
natanko tisto, kar se prikaže ob izpadu vira. To je nasprotje običajne rabe TTL indeksa in
je pogosta past — zato zapisano tukaj in v [data-model.md](./data-model.md).

---

## §5 Zdravje in zunanji alarm, čeprav ni schedulerja

**Odločitev:** 001 dostavi tri ravni:

1. `GET /api/v1/health` — notranje stanje (baza dosegljiva, starost predpomnjenih virov,
   veljavnost konfiguracije).
2. Zdravstveni pregled in politika ponovnega zagona za vsak vsebnik (FR-043).
3. **Odhodni srčni utrip** na `HEALTHCHECK_PING_URL` v rednem intervalu.

**Zakaj:** člen VII pravi z besedami ustave, da notranji `/health` ne zadošča, ker mrtev
proces ne pošilja obvestil. 001 sicer nima tika schedulerja, ki bi utripal — a če se ta pot
prvič preizkusi šele v 002, se preizkuša takrat, ko se nanjo že zanašamo. Srčni utrip
strežnika je dovolj, da se veriga (proces → Healthchecks.io → obvestilo) dokaže na živem
sistemu, preden ima kaj izgubiti.

**Zavrnjene možnosti:** odlog na 002 — zavrnjeno, ker je poceni zdaj in ker je nedokazana
alarmna pot enakovredna neobstoječi. Če `HEALTHCHECK_PING_URL` ni nastavljen, se utrip tiho
preskoči; to je edina "tiha" pot v sistemu in je zavestna, ker gre za neobvezno zunanjo
storitev.

---

## §6 Kako se meja med moduli dejansko uveljavi

**Odločitev:** meja iz člena I se uveljavi s pravilom lintanja, ki prepove uvoze med
moduli, ne z dogovorom. Konkretno: `apps/api/src/modules/<a>` ne sme uvažati iz
`apps/api/src/modules/<b>`; dovoljeni so uvozi iz `platform/`, `domain/` in `packages/`.
Enako na strani odjemalca med `features/<a>` in `features/<b>`, kjer sta dovoljena `core/`
in `shared/`.

**Zakaj:** člen I zahteva, da je odstranitev zavihka brisanje ene mape in enega vnosa. To
je preverljivo samo, če je kršitev nemogoča ob prevajanju, ne le opažena ob pregledu. Stari
sistem je pokazal, kaj se zgodi brez tega: meni je bil prekopiran v tri strani in vsaka
sprememba je zahtevala tri popravke.

**Zavrnjene možnosti:**

- Samo dogovor v dokumentaciji — zavrnjeno, ker se prvi uvoz zgodi pod pritiskom in nihče
  ne pregleduje diffa z mislijo na člen I.
- Ločeni npm paketi na modul — zavrnjeno kot pretiravanje: prinese verzioniranje in
  build graf, ki ga trije zavihki ne potrebujejo.

**Preverjanje:** poleg lint pravila je v testih 001 en test, ki doda navidezen zavihek in
preveri, da je razlika omejena na eno datoteko in eno mapo (SC-005).

---

## §7 Avtentikacija: rotacija, zaznava ponovne uporabe, hramba na napravi

**Odločitev:**

- Dostopni JWT velja 15 minut, ni shranjen trajno, živi v pomnilniku odjemalca.
- Obnovitveni žeton je **naključna vrednost, ne JWT**, shranjena v bazi samo kot zgoščen
  zapis, vezana na **družino sej** (ena naprava = ena družina).
- Vsaka uporaba obnovitvenega žetona ga zavrti: stari se označi kot porabljen, izda se nov
  v isti družini.
- Uporaba že porabljenega žetona prekliče **celotno družino** (FR-012).
- Družine so ločene po napravi, zato odjava na eni napravi ne odjavi ostalih (FR-017).
- Hramba na odjemalcu: v brskalniku `httpOnly` piškotek, omejen na pot obnovitve; na
  Androidu varna shramba naprave prek Capacitorja, ker aplikacija po ponovnem zagonu
  potrebuje sejo (FR-017, člen XI).

**Zakaj:** obnovitveni žeton kot naključna vrednost namesto JWT-ja pomeni, da je preklic
takojšen in ne odvisen od izteka. Stari projekt je model za to imel, a ga ni uporabljal
(`docs/legacy-engine.md` §4.11), in avtorizacija je delovala po načelu "veljaven token torej
admin" — kar FR-013 izrecno prepove.

**Zavrnjene možnosti:**

- Obnovitveni žeton kot JWT — zavrnjeno, ker preklicanega JWT-ja ni mogoče preklicati brez
  seznama preklicanih, kar je isto delo kot zapis v bazi, le z več koraki.
- `localStorage` za obnovitveni žeton v brskalniku — zavrnjeno, ker je dosegljiv iz
  JavaScripta in s tem iz vsake vrinjene skripte.
- Ena družina na uporabnika namesto na napravo — zavrnjeno, ker bi zaznana zloraba na eni
  napravi odjavila vse naprave, in ker bi navadna odjava na telefonu odjavila brskalnik.

---

## §8 Osveževanje samo v ospredju

**Odločitev:** osveževanje radarja se ustavi, ko zaslon ni v ospredju. V brskalniku prek
Page Visibility, na Androidu prek dogodkov stanja aplikacije iz Capacitorja. Ob vrnitvi v
ospredje se najprej takoj enkrat osveži, nato nadaljuje v intervalu.

**Zakaj:** FR-022 to zahteva izrecno, člen VIII pa je razlog: naprava v žepu ne sme
generirati zahtev. Takojšnja osvežitev ob vrnitvi je potrebna, ker bi drugače uporabnik
najprej videl sliko, staro toliko, kolikor je bila aplikacija v ozadju.

**Zavrnjene možnosti:** stalni interval brez upoštevanja vidnosti — zavrnjeno kot kršitev
FR-022 in člena VIII.

**Opomba:** ker predpomnilnik živi na strežniku, osveževanje na odjemalcu pomeni ponovno
zahtevo na `/api/v1/dashboard/radar`, ne ponovni klic ARSO. Deset odprtih naprav torej ne
pomeni deset klicev na ARSO, ampak največ enega na 5 minut.

---

## §9 Register zavihkov: definicija v kodi, stikalo v bazi

**Odločitev:** oblika vnosa je iz poglavja A.5 (`id`, `title`, `icon`, `route`, `order`,
`requiredScopes`, `enabled`). Definicije zavihkov so v kodi (ena datoteka registra),
**stikalo `enabled` in `order` pa se prekrijeta iz baze**. Strežnik vrne razrešen seznam na
`GET /api/v1/tabs`, odjemalec iz njega sestavi meni in usmerjanje.

**Zakaj:** FR-003 zahteva izklop zavihka brez nove izdaje aplikacije, česar vrednost v kodi
ne omogoča. Hkrati mora dodajanje zavihka ostati "ena mapa in en vnos" (FR-002, člen I),
česar zapis izključno v bazi ne omogoča, ker bi zahteval še migracijo ali ročni vnos.
Kombinacija: koda pove, kaj obstaja, baza pove, kaj je vklopljeno.

**Zavrnjene možnosti:**

- Samo koda — zavrnjeno zaradi FR-003.
- Samo baza — zavrnjeno, ker bi nov zavihek zahteval poseg v podatke, ne v kodo, in ker bi
  napačen zapis lahko naredil aplikacijo brez menija.

**Robni primer iz specifikacije:** če se zavihek izklopi, medtem ko je uporabnik na njem,
strežnik ob naslednji zahtevi vrne razrešen seznam brez njega, odjemalec pa preusmeri na
dashboard. Pot izklopljenega zavihka ni registrirana v usmerjanju.

---

## §10 Obvestila: kanali in dovoljenje

**Odločitev:** `firebase-admin` na strežniku, poverilnice izključno kot montirana datoteka
prek `GOOGLE_APPLICATION_CREDENTIALS`. Kanali so ločeni po vrsti že v 001, čeprav 001 pošilja
samo testno obvestilo: `system` (zdravje, potek seje) in `reminders` (rezerviran za 002). Za
dovoljenje na Androidu 13+ se vpraša ob prvem zagonu, z razlago pred sistemskim pozivom.

**Zakaj:** FR-032 zahteva ločene kanale, da jih je mogoče ugašati posamično; kanala na
Androidu ni mogoče pozneje razdeliti brez novega imena kanala, torej je to odločitev, ki jo
je treba sprejeti zdaj. Razlaga pred sistemskim pozivom je potrebna, ker je zavrnitev na
Androidu 13+ praktično dokončna — uporabnik jo lahko prekliče le v sistemskih nastavitvah.

**Zavrnjene možnosti:** en kanal z filtriranjem v aplikaciji — zavrnjeno, ker uporabnik ne
more ugasniti podvrste obvestil, in ker je filtriranje v aplikaciji nemogoče, kadar je
aplikacija ubita.

**Čiščenje žetonov** (FR-034): zavrnitev ponudnika (`UNREGISTERED`, `INVALID_ARGUMENT`) se
obravnava kot signal za brisanje zapisa naprave, ne kot napaka za ponovni poskus.

---

## §11 Časi in časovni pas

**Odločitev:** za 001 zadošča ena knjižnica za čas na strežniku; izbrana je Luxon.
`TZ=Europe/Ljubljana` v vsakem vsebniku, `SCHEDULE_TIMEZONE` pa ostane ločena spremenljivka,
tudi če je 001 ne uporablja. Shranjuje se UTC instant, prikazuje se v coni.
`toISOString().split("T")[0]` je prepovedan (člen V.4) in preverjen z lint pravilom.

**Zakaj:** poglavje A.1 pušča izbiro med `Temporal` prek polifila in Luxonom. Za 001 je
edina časovna naloga prikaz časa meritve in izračun starosti podatka, kar zmoreta oba;
Luxon je zrelejši in ne prinese polifila v build odjemalca. Odločitev je namenoma zapisana
kot **odločitev za 001**, ne za projekt: 002 ima bistveno zahtevnejše delo s koledarjem in
prehodi časa, in sme to izbiro ponovno odpreti v svojem `research.md`.

Ločena `SCHEDULE_TIMEZONE` obstaja zato, da je domenska odločitev eksplicitna in ne odvisna
od tega, kako je nastavljen vsebnik — `docs/env-reference.md` to navaja kot namen.

**Zavrnjene možnosti:** zanašanje na privzeti pas procesa — zavrnjeno, ker je stari sistem
"današnji dan" računal po UTC in v poletnem času dobil napačen dan.

---

## §12 Validacija okolja ob zagonu

**Odločitev:** Zod shema vseh spremenljivk iz `docs/env-reference.md`, preverjena ob zagonu.
Manjkajoča obvezna vrednost zaustavi zagon z imenom spremenljivke in pojasnilom. Privzetki so
v shemi, ne razpršeni po kodi. `.env` uporablja izključno obliko `KLJUC=vrednost`.

**Zakaj:** `docs/env-reference.md` §6 dokumentira dva konkretna izpada starega sistema:
vrstice z dvopičjem (`EMAIL_INFO: ...`), ki jih dotenv ne prebere in so bile v razvoju
`undefined`, ter `SALT_ROUNDS`, ki je manjkal v `.env` in dal `NaN` globoko v izvajanju.
Oboje je razred napake, ki ga validacija ob zagonu odpravi v celoti.

**Zavrnjene možnosti:** branje `process.env` na mestu uporabe — zavrnjeno, ker je to
natanko vzorec, ki je proizvedel oba zgornja izpada.

---

## §13 Kaj mora biti testirano v 001

Vrata 2 ustave naštejejo štiri primere, od katerih ima 001 predmet samo pri prvem. Nabor za
001 je torej:

| Področje | Test | Zakaj ta |
|---|---|---|
| Čas | Prikaz časa meritve in starosti čez prehod na poletni in zimski čas | Edini od štirih primerov iz vrat 2, ki v 001 obstaja |
| Predpomnilnik | Iztečen zapis se **prikaže** z oznako starosti, ne izbriše | Past iz §4; napačna izvedba tiho podre FR-026 |
| Izpad vira | Vir ne odgovori → zadnji znani podatek; vira ni bilo nikoli → jasno sporočilo in ponovni poskus | FR-026 in robni primer iz specifikacije |
| Struktura vira | Uspešen odgovor s spremenjeno strukturo → validacija odpove, prikaže se zadnji znani | Robni primer, ki bi drugače dal napačno razčlenjeno ploščico |
| Žetoni | Rotacija, zaznana ponovna uporaba prekliče družino, odjava ne vpliva na drugo napravo | FR-011, FR-012, FR-017 |
| Meja modulov | Dodan navidezen zavihek spremeni natanko eno datoteko | SC-005, člen I |
| Navedba vira | Vsak odgovor z podatki ARSO nosi `attribution` | FR-027, SC-009 |
| Okolje | Manjkajoča obvezna spremenljivka zaustavi zagon z jasnim sporočilom | §12 |
