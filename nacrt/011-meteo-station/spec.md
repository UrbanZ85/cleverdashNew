# 011 — Meritve ARSO postaje

Kratek zapis odločitev. Nastal je SKUPAJ s kodo in ne pred njo (dogovor za to funkcionalnost);
zato ni razdelkov `plan.md`/`tasks.md` kot pri 001–010, pogodba pa je na istem mestu kot pri
ostalih: `specs/011-meteo-station/contracts/openapi.yaml`.

## Zahteva

> "Grafi temperature, padavine, veter, vlaga. Vse, kar se da. To naj bo svoj modul glede na
> vnešeno pod nastavitvami."

Izhodišče je bila stran ARSO z dvodnevno zgodovino postaje Vrhnika in prikaz, kakršen je na
Bergfexu (padavine po urah kot stolpci).

## Kaj je nastalo

Zavihek **"Meritve ARSO"** (`/meteo`, id `meteo`, obseg `meteo:read`), ki za ENO izbrano
samodejno postajo pokaže zadnjo meritev in grafe za vse, kar postaja meri: padavine po urah,
temperaturo, veter s sunki in smerjo, vlago, zračni tlak, sončno obsevanje (globalno in
difuzno) ter višino snežne odeje. Okno je 6, 24 ali 48 ur.

Poleg tega:

- **ploščica na nadzorni plošči** (`meteo`) — urne padavine zadnjih 24 ur in trenutno stanje,
  klik odpre zavihek;
- **razdelek v nastavitvah** (Nastavitve → Moduli → Meritve ARSO) — izbira postaje s seznama
  vseh ~106 ARSO samodejnih postaj, z iskanjem, ki ne razlikuje šumnikov.

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

## Preverjanje

- `apps/api/tests/unit/arso-history-parse.spec.ts` — razčlenjevanje (surove vrednosti, prazne
  celice, prerazporejeni stolpci, spremenjena oblika vira);
- `apps/api/tests/unit/arso-hourly.spec.ts` — urna vedra, vsote padavin, prehod na zimski čas,
  krožno povprečje smeri, okno od zadnje meritve;
- `apps/api/tests/unit/arso-station.spec.ts` — oznaka postaje, naslovi, seznam postaj, zlitje
  imenika z živim posnetkom, preverjanje nastavitve;
- `apps/api/tests/contract/meteo.spec.ts` — pogodba obeh endpointov, navedba vira, postaja iz
  nastavitev, predpomnilnik (drugi klic vira ne prenese znova), 400 in 503;
- `apps/web/tests/unit/meteo-model.spec.ts` — smeri, oznake osi, vsote, zapis vrednosti, cona.

Razčlenjevalnik je bil poleg tega poganjan proti PRAVIMA prenesenima stranema (Vrhnika,
Ljubljana Bežigrad, 9. 9. 2026): 289 meritev, 49 urnih veder, pri Bežigradu tudi tlak in
sevanje, pri Vrhniki ne.

## Kar NI v obsegu

- Več postaj hkrati oziroma primerjava dveh postaj (izbrana je ena; `?station=` obstaja za
  klic, ne za vmesnik).
- Zgodovina, daljša od dveh dni — vir je ne hrani, mi pa meritev ne arhiviramo.
- Opozorila ob pragovih ("obvesti me, ko pade 20 mm"). Takrat bo modul dobil svojo kolekcijo in
  obseg `meteo:write`.
