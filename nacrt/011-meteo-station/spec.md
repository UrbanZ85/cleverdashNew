# 011 — Meritve samodejnih postaj (ARSO in Neverin)

Kratek zapis odločitev. Nastal je SKUPAJ s kodo in ne pred njo (dogovor za to funkcionalnost);
zato ni razdelkov `plan.md`/`tasks.md` kot pri 001–010, pogodba pa je na istem mestu kot pri
ostalih: `specs/011-meteo-station/contracts/openapi.yaml`.

## Zahteva

> "Grafi temperature, padavine, veter, vlaga. Vse, kar se da. To naj bo svoj modul glede na
> vnešeno pod nastavitvami."

Izhodišče je bila stran ARSO z dvodnevno zgodovino postaje Vrhnika in prikaz, kakršen je na
Bergfexu (padavine po urah kot stolpci).

## Kaj je nastalo

> Spodaj je zapisana PRVA različica (samo ARSO, ena postaja). Kaj se je spremenilo z drugim
> ponudnikom in več izbranimi postajami, je v razdelku "Razširitev" na koncu.

Zavihek **"Meritve ARSO"** (`/meteo`, id `meteo`, obseg `meteo:read`), ki za ENO izbrano
samodejno postajo pokaže zadnjo meritev in grafe za vse, kar postaja meri: padavine po urah,
temperaturo, veter s sunki in smerjo, vlago, zračni tlak, sončno obsevanje (globalno in
difuzno) ter višino snežne odeje. Okno je 6, 24 ali 48 ur.

Poleg tega:

- **ploščica na nadzorni plošči** (`meteo`) — urne padavine zadnjih 24 ur in trenutno stanje;
  klik nanjo (ali na ikono v glavi) odpre POVEČAN prikaz z vsotami padavin po oknih
  (4/8/12/24/48 h) in 48-urnim grafom, iz njega pa vodi gumb na zavihek z vsemi grafi;
- **razdelek v nastavitvah** (Nastavitve → Moduli → Meritve ARSO) — izbira postaje s seznama
  vseh ~106 ARSO samodejnih postaj, z iskanjem, ki ne razlikuje šumnikov.

Ob tem je z nadzorne plošče **odstranjena ploščica "Vreme"** (trenutna meritev iz ARSO
vremenskega API-ja): ploščica `meteo` pokaže isto in več, in to z merilne postaje, ki je bližja
kot vremenska "lokacija". Endpoint `GET /dashboard/weather` OSTAJA — člen III pravi, da mora
biti dosegljivo s klicem, kar je bilo v vmesniku — in ga uporablja ploščica "Napoved".

## Odločitve in zakaj

### Vir je HTML tabela, ker XML za zgodovino ne obstaja

ARSO ponuja `observationAms_<oznaka>_latest.xml` za zadnjo meritev in
`observationAms_<oznaka>_history.html` za dva dneva. Enak naslov s `_history.xml` **vrne 404**
(preverjeno 9. 9. 2026). Zgodovino torej ni mogoče dobiti kot XML in razčlenjevanje HTML ni
izbira iz malomarnosti.

Tabela je pri tem strojno prijaznejša, kot je videti: vsak stolpec je zapisan dvakrat — skrita
celica (`style="display:none;" id="<ime>"`) s SUROVO vrednostjo in vidna z zaokroženo. Beremo
skrito (`6.156 km/h` namesto `7`), ker je graf iz zaokroženih vrednosti stopničast. Celice
iščemo po imenu razreda in ne po zaporedju: stolpci se med postajami razlikujejo (Bežigrad ima
tlak in sevanje, Vrhnika ne).

Ko se oblika strani spremeni, `GET /meteo/history` vrne **503 z razlago** in ne praznih serij
(člen VII).

### Oznaka postaje ni ime kraja

Naslov uporablja `domain_meteosiId` brez zaključnega podčrtaja: `VRHNIKA`, `NOVA-GOR_BILJE`
(postaja "Bilje Nova Gorica"), `BOHIN-CES` ("Bohinjska Češnjica"). `observationAms_BILJE_…` in
`observationAms_NOVA-GORICA-BILJE_…` vrneta 404. Zato se postaja **izbere s seznama**
(`GET /meteo/stations`, ki bere `observationAms_si_latest.xml`) in ne vpiše na pamet.

Oznaka je omejena z vzorcem (`domain/arso-station.ts`), ker se iz nje sestavi naslov, ki ga
strežnik obišče sam — brez tega je nastavitev pot do SSRF. Sestavljen naslov gre nato še skozi
`domain/outbound-url.ts`.

### Seznam postaj ni imenik, ampak posnetek cikla

Odkrito med implementacijo: `observationAms_si_latest.xml` je posnetek ZADNJEGA OBJAVNEGA
CIKLA. Ob 08:00 UTC je vseboval 106 postaj, ob 09:25 istega dne samo 19 — in med njimi niti
Vrhnike niti Bežigrada. Isto velja za `observationAms_si_latest.html` in
`observation_si_latest.xml`; imenika postaj ARSO ne objavlja (izpis mape vrne 403, XML
dokumentacija ga ne omenja).

Zato je v `modules/meteo/domain/station-catalog.ts` zapisan imenik 106 postaj (unija posnetkov,
zbranih 9. 9. 2026 — opazovani cikli so imeli 19, 69, 98, 99 in 106 postaj), ki ga živi vir samo
dopolni in osveži. Brez tega bi uporabnik, ki nastavitve odpre ob napačnem trenutku, svoje
postaje na seznamu NE NAŠEL — najbolj neprijetna vrsta napake, ker je videti, kot da postaja ne
obstaja.

Imenik se osveži ročno z `node apps/api/scripts/refresh-arso-stations.mjs [število_branj]`.
Skripta obstoječi imenik DOPOLNI in ga ne nadomesti: eno samo branje (cikel z 99 postajami) bi
sedem postaj pobrisalo — natanko napaka, ki jo imenik odpravlja. Zagon brez novih postaj pusti
datoteko nespremenjeno.

### Namig nad grafom pove dan in uro, os pa samo uro

Os pod grafom nosi "17", ker je zanjo prostora toliko — pri 48 stolpcih pa je tak namig enako
uporaben kot noben ("17 katerega dne?"). Zato je namig ločen vhod grafa (`pointTitles`): pri
stolpcih pove INTERVAL ure (`sre. 9. 9. 17:00–18:00`, ker je stolpec vsota cele ure in ne
trenutka), pri črtah pa točen čas meritve (`sre. 9. 9. 17:40`).

### Vsote padavin so neodvisne od izbranega okna grafa

"Koliko je padlo" je vprašanje glede na dogodek, ne glede na koledar ali na to, kaj je trenutno
na grafu: nevihta popoldne (4 h), cel dan dežja (12 h), vikend nalivov (48 h). Zato strežnik
vsote za 4/8/12/24/48 ur računa iz CELOTNE prebrane serije in jih vrne tudi pri `hours=6`.
Poleg vsote gre s tem `samples` — pri postaji, ki je pravkar začela oddajati, "48 h" ne pomeni
48 ur meritev.

### Zavihek z `requiredScopes` je razkril razkorak v razreševalcu menija

011 je prvi zavihek z `requiredScopes`. Administrator ima dobesedno obseg `['admin']` in ne
poimenovanih obsegov: `requireScopes()` to razume (admin pomeni vse), `platform/tabs/resolver.ts`
pa ne — zato so endpointi modula delovali, zavihka v meniju pa ni bilo, in ker `tabGuard` na
odjemalcu preverja razrešeni register, klik na ploščico ni naredil ničesar. Razreševalec zdaj
razume `admin` enako kot `requireScopes()` (`coversRequiredScopes`), kar velja za vse prihodnje
zavihke z obsegi.

### Ura je koledarska ura, meritev ob polni uri pa pripada uri, ki se je končala

Padavine so v viru vsota V INTERVALU, zato so smiselne samo po urah. Vedro je koledarska ura v
coni `Europe/Ljubljana` (člen V.4) in je ključeno po instantu začetka ure — ob prehodu na
zimski čas sta zato dve ločeni vedri z istim napisom "02" in ne eno z dvojno vsoto.

Meritev ob 15:00 pripada uri 14–15, ker vir interval označuje z njegovim KONCEM. Brez tega bi
dež pretekle ure pripadel uri, ki se je pravkar začela.

### Dve ločljivosti v istem odgovoru

`buckets` (urne vrednosti) in `measurements` (posamezne meritve, 10 ali 30 minut — odvisno od
postaje). Padavine po urah, temperatura in veter iz posameznih meritev: po urah povprečena
temperatura izgubi ravno tisto, kar je zanimivo (jutranji sunek, opoldanska konica).
`measurements` pride samo ob `?raw=true` — ploščici zadostujejo urne vrednosti in njen odgovor
je s tem približno desetkrat manjši.

### `null` ni `0`

Postaja brez barometra ima stolpec `msl` prisoten in prazen v vseh 289 vrsticah. "Ni merilnika"
ni isto kot "ni dežja", zato je prazna celica `null` in ne 0, `available` pa pove, katerih
grafov odjemalec NE riše — prazna os brez črte je videti kot okvara.

### Modul ničesar ne shrani

Prvi modul brez lastne kolekcije. Meritve so ARSO-jeve (predpomnilnik `platform/cache`),
izbrana postaja pa je osebna NASTAVITEV (`Settings.meteo.station`) in ne zapis modula — moduli
se srečajo v skupnih storitvah, ne med sabo (člen I). Zato en sam obseg `meteo:read` in noben
mutacijski endpoint; postaja se spremeni s `PUT /settings`.

Skupna plast: `domain/arso-station.ts` (oznaka in naslovi — potrebujeta jo `meteo` IN
`settings`) ter `platform/settings/meteo.service.ts` (branje izbrane postaje), po istem vzorcu
kot `platform/settings/commute.service.ts`.

### Chart.js in ne lasten SVG

Grafov je sedem, vsak s svojo osjo in enoto, in vsi potrebujejo namige ob dotiku (na telefonu
je to edini način, da se odčita vrednost). Uvožene so samo uporabljene komponente knjižnice
(`Chart.register` v `meteo-chart.component.ts`), zato Chart.js pristane v lazy svežnju (~54 kB
prenosa) in ne v začetnem. Animacija je izklopljena: animiran graf bi ob vsakem koraku sprožil
Angularjevo zaznavo sprememb.

Barve so v komponenti in ne v CSS spremenljivkah, ker jih Chart.js riše na `<canvas>`, kamor
CSS ne seže; nabora sta dva (svetla/temna tema) in graf se ob preklopu tem nariše znova.

### Smer vetra

Besedilna oznaka je 8-točkovna (`S`, `SV`, `V`, …), enako kot ARSO-jev `dd_shortText` — s
šestnajstimi smermi bi za isto meritev ARSO pisal "Z", mi pa "ZJZ". Natančno smer pove puščica
pod grafom vetra, ki je zaokrožena na nič. Puščica je obrnjena za 180°, ker vir pove, IZ KATERE
smeri piha, puščica pa kaže, KAM.

V urnem vedru je smer vektorsko povprečje, uteženo s hitrostjo: aritmetično povprečje stopinj
je za smer napačno (350° in 10° dasta 180° namesto 0°).

## Razširitev: drugi ponudnik in več izbranih postaj

> "Rad bi dodal še tole postajo … https://www.neverin.hr/postaja/sveta-marina/ … in sicer naj
> bo tako, da lahko izberem več njih iz ARSO-ta ali iz neverin.hr. Ne samo ene, kot je sedaj."

Zavihek se odslej imenuje **"Meritve postaj"**, ker ni več samo ARSO.

### Postaja je zdaj sklic `<ponudnik>:<oznaka>`

`arso:VRHNIKA`, `neverin:sveta-marina`. Oznaki se sicer ne moreta pomešati (ARSO je VELIKO,
Neverin malo), a se na to ne zanašamo: razločevanje po obliki vrednosti je pravilo, ki drži,
dokler ga en nov ponudnik ne podre.

Golo oznako (`VRHNIKA`) razčlenjevalnik še vedno sprejme in jo bere kot ARSO. To ni prijaznost
do klicatelja, ampak **združljivost nazaj**: takšne vrednosti so v obstoječih nastavitvah v
bazi, v `ARSO_DEFAULT_STATION` in v avtomatizaciji, napisani pred to razširitvijo (člen III).
Selitev se zgodi ob branju in ne z enkratnim prepisom vseh dokumentov, ki mora uspeti.

### Ponudnik je vmesnik, ne veja `if`

`modules/meteo/providers/` — nov ponudnik je nova datoteka in ena vrstica v `index.ts`. Brez
tega bi bile veje štiri (zgodovina, seznam, navedba vira, naslov strani) na treh mestih, tretji
ponudnik pa bi pomenil dvanajst novih.

Ponudnik NIKOLI ne prenaša sam: vrne OPIS prenosa, prenese pa router prek
`platform/cache/service.ts`. Člen VIII zahteva, da gre vsak zunanji klic skozi skupni
predpomnilnik, in tega pravila ni mogoče uveljaviti, če vsak ponudnik kliče po svoje.

### Kar je bilo treba pri Neverinu IZMERITI

Vir nima dokumentacije in njihova stran postaje je prazna lupina, ki podatke naloži z
JavaScriptom (vsa polja v HTML so `--`) — razčlenjevanje HTML tu ni mogoče niti v načelu.
Meritve so na `core.neverin.hr`. Troje je bilo treba ugotoviti s poskusi (9. 9. 2026), in vsako
od njih bi ob napačni domnevi povzročilo napako, ki je NI VIDETI:

1. **Veter je v m/s, ne v km/h.** V njihovem svežnju je tabela faktorjev
   `{"m/s":1,"km/h":3.6,"kt":1.94384}`, torej je shranjena enota m/s; potrjeno še s podatki —
   najmočnejši sunek med 873 postajami je bil 17,1 (= 62 km/h), kar je kot km/h nesmiselno
   nizko. Brez pretvorbe bi bile vrednosti 3,6-krat premajhne in veter bi bil samo videti šibek.
2. **`precip` je vsota V INTERVALU**, ne števec od začetka dneva. Preverjeno na postaji
   `meja-gaj` med nalivom: vsota celotne 24-urne serije (49,5 mm) se natanko ujema z njihovim
   `precip_acc_24h`. Pomen je torej isti kot pri ARSO `rr_val`.
3. **Tlak NI enotno reduciran na morsko gladino.** Cvrsnica (2228 m) pošilja 782 hPa, Begovo
   Razdolje (1078 m) pa 1017 hPa — referenčna višina je lastnost postaje, ki je vir ne pove.
   Zato se preslika v `pressureHpa` in nikoli v `pressureMslHpa`: trditi "reducirano na morsko
   gladino" za vrednost, za katero to ne velja, je slabše od tega, da trditve ni.

### Vir zahteva glavo `Origin` — in to je zavestna odločitev, ne podrobnost

Brez `Origin` oziroma `Referer` z njihovo domeno vir odgovori
`403 {"error":{"code":"ORIGIN_BLOCKED"}}`. Njihovi pogoji uporabe avtomatiziran dostop in
sistematično prevzemanje meteoroloških podatkov izrecno omejujejo. Lastnik namestitve je bil na
to opozorjen in se je odločil ponudnika vseeno uporabiti; posledica za kodo je, da izvor NI
zapisan v kodi, ampak je nastavljiv (`NEVERIN_WEB_URL`), in da je TTL dolg.

Vir namreč ne pošilja `ETag` niti `Last-Modified` — pogojna zahteva ne deluje in vsaka
osvežitev prenese celo telo. Privzeti `NEVERIN_CACHE_SECONDS=600` je zato desetkrat daljši od
njihovega `max-age=60`: en prenos na postajo na deset minut, ne glede na to, koliko ljudi
zavihek gleda. Člen VIII se tu bere kot "manj klicev", ne kot "kolikor jih izvor dovoli".

### Od obeh virov se vedno prenese celo dvodnevno okno

Neverin zna rezati na viru (`?hours=`), pa se to namenoma ne uporablja. Dva razloga, oba
nastopita tiho: vsote padavin za 24 in 48 ur se računajo iz CELOTNE serije tudi ob 6-urnem
grafu, zato bi krajši prenos vrnil premajhne vsote brez sledu o tem; in ključ predpomnilnika bi
moral vsebovati okno, kar pomeni tri prenose iste postaje za tri možna okna namesto enega.

### Izpad enega ponudnika ne izprazni seznama drugega

`GET /meteo/stations` bere oba seznama in ju zlije. Če eden odpove, je odgovor vseeno `200`,
prizadeti ponudnik pa ima `unavailable: true` — uporabnik, ki išče Vrhniko, je ne sme izgubiti
zato, ker je nedosegljiv hrvaški vir. Napaka mora biti vidna in ne tiha (člen VII).

Enolična je pri tem REFERENCA in ne oznaka: `ljubljana-bezigrad` obstaja pri obeh ponudnikih in
to sta dve različni meritvi, ne podvojitev. Zato je pri vsaki postaji izpisano, iz katerega
omrežja je.

### Vrstni red izbranih postaj je podatek, ne naključje

PRVA izbrana je tista, ki jo kaže ploščica na nadzorni plošči in ki se odpre ob vstopu na
zavihek. Zato je v nastavitvah izbira prikazana kot urejen seznam z izrecno oznako "privzeta"
in ne kot množica kljukic: brez vidnega vrstnega reda človek ne bi vedel, zakaj ploščica kaže
ravno to postajo. Nova postaja se doda na KONEC — privzeta se ne sme zamenjati mimogrede.

Zgornja meja je osem. Preklopnik na zavihku je vrstica čipov; pri dvajsetih postane seznam, ki
ga je treba brati, in to je že nastavitveni zaslon. Meja je hkrati zgornja meja prenosov, ki
jih en uporabnik sproži.

### Ena postaja naenkrat, ne vse na istem grafu

Padavine so stolpci in "zdaj" je ena kartica. Dve postaji hkrati bi pomenili dva niza stolpcev,
ki se prekrivata, in dve kartici "zdaj", od katerih nobena ni odgovor na vprašanje "koliko je
zunaj". Primerjava je drugo vprašanje od "kakšno je vreme pri meni" in bi zahtevala svoj prikaz.

### `GET /meteo/selection` obstaja zaradi imen

Nastavitve hranijo samo sklice; preklopnik potrebuje IMENA. Brez te poti bi moral zavihek
prenesti seznam vseh ~1440 postaj, da izriše tri čipe. Bere samo sezname ponudnikov, ki v
izbiri nastopajo — kdor ima izbrane le ARSO postaje, zaradi preklopnika ne sproži prenosa pri
Neverinu.

### Navedba vira ni več konstanta

"Vir: ARSO" nad hrvaško postajo bi bila napačna navedba, kar je slabše od nobene. Navedba zato
pripada ponudniku. Pri Neverinu se ji doda še **upravljavec postaje** (`station.operator`):
Neverin je omrežje tujih postaj — meritve Svete Marine so IstraStreamove — in navedba samo
"Neverin" bi izpustila tistega, ki postajo v resnici drži (člen VIII).

### Cona je podatek postaje

`hourly.ts` je cono že sprejemal kot parameter, uporabljal pa se je privzetek. Zdaj jo pove
vir: ARSO vedno `Europe/Ljubljana`, Neverin pri vsaki postaji posebej. `Europe/Zagreb` je danes
isti odmik, a to je lastnost trenutka in ne pogodbe (člen V.4).

## Preverjanje

- `apps/api/tests/unit/arso-history-parse.spec.ts` — razčlenjevanje (surove vrednosti, prazne
  celice, prerazporejeni stolpci, spremenjena oblika vira);
- `apps/api/tests/unit/arso-hourly.spec.ts` — urna vedra, vsote padavin, prehod na zimski čas,
  krožno povprečje smeri, okno od zadnje meritve;
- `apps/api/tests/unit/arso-station.spec.ts` — oznaka postaje, naslovi, seznam postaj, zlitje
  imenika z živim posnetkom, preverjanje nastavitve (vključno z golo oznako in mejo osmih);
- `apps/api/tests/unit/meteo-station-ref.spec.ts` — sklic s ponudnikom, združljivost nazaj,
  poenotenje velikosti črk, odvrženje neveljavnih namesto zavrnitve celega seznama, SSRF;
- `apps/api/tests/unit/neverin-parse.spec.ts` — pretvorba vetra iz m/s, pomen padavin,
  referenca tlaka, cona in upravljavec, vrstica brez časa, pokvarjen odgovor;
- `apps/api/tests/contract/meteo.spec.ts` — pogodba vseh treh poti, navedba vira po ponudniku,
  postaje iz nastavitev, predpomnilnik (drugi klic vira ne prenese znova), glava `Origin`,
  izpad enega ponudnika, 400 in 503;
- `apps/web/tests/unit/meteo-model.spec.ts` — smeri, oznake osi, namigi (interval ure, točen
  čas), vsote, zapis vrednosti, cona;
- `apps/api/tests/unit/tab-resolution.spec.ts` — zavihek z obsegi: admin ga dobi, uporabnik brez
  obsega pa ne.

Razčlenjevalnika sta bila poleg tega poganjana proti PRAVIM prenesenim odgovorom (ARSO: Vrhnika
in Ljubljana Bežigrad, 289 meritev, 49 urnih veder; Neverin: Sveta Marina, 460 meritev v 48
urah, in `meja-gaj` med nalivom za pomen padavin — vse 9. 9. 2026).

## Kar NI v obsegu

- Primerjava dveh postaj na istem grafu (izbranih je lahko več, prikazana pa je ena naenkrat —
  glej odločitev zgoraj).
- Zgodovina, daljša od dveh dni — vira je ne hranita, mi pa meritev ne arhiviramo.
- Temperature morja pri Neverinu (`type=sea`) — to je njihov drug seznam in drug prikaz.
- Opozorila ob pragovih ("obvesti me, ko pade 20 mm"). Takrat bo modul dobil svojo kolekcijo in
  obseg `meteo:write`.
