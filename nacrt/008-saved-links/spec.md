# 008 — vhodno gradivo

> `nacrt/` je VHODNO gradivo in ga generirani artefakti ne smejo prepisati (README,
> "Zakaj vhodno gradivo ni v specs/"). Spodaj je zahteva, kot je bila podana, in odločitve,
> ki so bile ob njej sprejete — brez naknadnega lepšanja.

## Zahteva (dobesedno)

> dodati je potrebno še en modul in sicer shranjeni linki. to bodo url stran shranjene.
> katere sem jih shranil

Dopolnilo po prvem osnutku specifikacije:

> te linki so svoj modul delujejo podobno kot beležke. samo da prikazujejo shranjene strani.
> npr ime strani url ter komentar

## Odločitve ob prevzemu

Zahteva je ena poved, zato so bila pred pisanjem specifikacije postavljena tri vprašanja, po
dopolnilu pa še dve. Izbrano:

| Vprašanje | Izbrano |
|---|---|
| Proces | Najprej vhodno gradivo, nato `/speckit-specify` → `/speckit-plan` → `/speckit-tasks`; koda šele potem |
| Kaj zapis vsebuje | Ime strani, URL, komentar (+ neobvezna ikona) — natanko trije podatki iz dopolnila |
| Kako je urejeno | Mape/skupine (en link pripada eni skupini), **ne** proste oznake — potrjeno tudi po dopolnilu |
| Iskanje in vrstni red | Iskalno polje po imenu/URL-ju/komentarju + ročno prerazporejanje |
| Samodejni metapodatki | Strežnik ob dodajanju prebere `<title>` in favicon strani |
| Uvoz zaznamkov iz brskalnika | **Ni v obsegu** |
| Nadzorna plošča | Ploščica s shranjenimi linki prek obstoječega mehanizma `Settings.tiles` |
| Zgradba modula | Po vzoru modula beležk (007): modulska domenska plast, zavihek, osebni zapisi |

Odločitev za mape namesto oznak je bila zavestna izbira med dvema modeloma in je bila ob
dopolnilu ("delujejo podobno kot beležke") ponovno postavljena — beležke urejajo zapise z
oznakami in pripenjanjem. Izbrane so ostale mape: skupine so v tem projektu že implementirane
in preizkušene (`CameraGroup`, 003), oznake bi bile drug sistem razvrščanja ob njih. Ena raven
map je meja; če se izkaže za premalo, je to naslednja funkcionalnost, ne razširitev te.

## Kaj je bilo najdeno v starem CleverDashu

`cleverdash-old/src/app/pages/links/` — stran **"Useful links"**. To je neposredni prednik te
funkcionalnosti in pojasni, od kod trije podatki iz dopolnila:

| Polje v stari kodi | Kaj je bilo | Kaj postane v 008 |
|---|---|---|
| `linkName` | ime strani, **obvezno** | ime; obvezno le, dokler ga ne prebere strežnik |
| `linkUrl` | naslov, **obvezen**, brez normalizacije in brez preverjanja sheme | normaliziran naslov, `http`/`https` |
| `linkDescription` | komentar, **obvezen** | komentar, neobvezen |
| `userInserted`, `addedDate` | kdo je dodal (avatar) in kdaj — zbirka je bila SKUPNA | odpade: linki so osebni (004) |

Štiri stvari so bile v stari strani problem in jih 008 ne sme ponoviti:

1. **Vsi trije podatki obvezni.** Ime strani je bilo treba vsakič natipkati, tudi kadar ga
   stran pove sama. To je natanko tisto, kar odpravi samodejno branje `<title>`.
2. **Naslov shranjen surov**, brez normalizacije (`primer.si` brez sheme ni delal) in brez
   preverjanja, da je res `http`/`https`.
3. **`target="_blank"` brez `rel="noopener noreferrer"`** — tuja stran je dobila dostop do
   `window.opener` in celoten naslov izvorne strani.
4. **Prazno stanje je bil gol napis "No links added"** brez poti naprej.

Česa stara stran ni imela in je zdaj v obsegu: iskanja, map, vrstnega reda, faviconov.

## Kaj je pregled kode razkril pred pisanjem specifikacije

### 0. Modul beležk (007) je vzorec, ne tekmec

Med pisanjem te specifikacije je v repozitoriju nastal modul **beležk** (`specs/007-notes/`,
`modules/notes/`, `features/notes/`). Dvoje iz tega:

- **Številka.** Prvi osnutek te funkcionalnosti je bil oštevilčen kot 007 in je trčil ob
  beležke. Preštevilčen je v **008** — mape, sklici in ID-ji nalog so popravljeni.
- **Zgradba.** Beležke so najbližji obstoječi sorodnik ("delujejo podobno kot beležke"): oseben
  zapis, zavihek, CRUD, iskanje, 404 namesto 403 za tuj zapis. 008 prevzame njihovo razporeditev
  kode — čista domenska plast MODULA (`modules/notes/domain/note-input.ts` → `modules/saved-links/domain/`),
  ne v skupnem `apps/api/src/domain/`. Razlog je člen I: ob odstranitvi modula mora izginiti tudi
  njegova domenska koda.

Kar 008 od beležk NE prevzame, je taksonomija: beležke urejajo z oznakami in pripenjanjem,
linki z mapami (odločitev zgoraj).

### 1. To NI podvojitev vtičnika vrste `link` iz 005

`apps/api/src/modules/dashboard/models/dashboard-plugin.model.ts` že pozna
`kind: 'link'`. Razlika je v namenu in jo je treba v specifikaciji izrecno zapisati, sicer
bo videti kot dvojnik:

| | 005 — vtičnik `link` | 008 — shranjeni link |
|---|---|---|
| Kaj je | **ploščica** na nadzorni plošči | **zapis v knjižnici** |
| Koliko jih je | nekaj, ročno izbranih | poljubno mnogo, raste s časom |
| Kje živi | `Settings.tiles` + `DashboardPlugin` | lasten zavihek in lastna kolekcija |
| Kaj se z njim počne | klikne | išče, ureja v mape, prerazporeja |

Modula se ne smeta klicati (člen I). 008 svoje zapise hrani sam in jih ne piše v
`DashboardPlugin`.

### 2. Vzorci, ki jih 008 samo ponovi (ne izumlja)

Iz 003 (kamere) je prenosljivo skoraj vse, kar ta modul potrebuje:

- skupine kot ločena kolekcija z `order` in `collapsed` (`camera-group.model.ts`);
- `userId` v vsaki poizvedbi, tuj dokument vrne **404, ne 403** (`findCameraOr404`);
- prerazporejanje kot ločen endpoint z listo dodelitev (`domain/camera-order.ts`);
- per-modulski obsegi v `modules/<ime>/scopes.ts`, ne centralno (`cameras/scopes.ts`).

### 3. Samodejni naslov in favicon sta odhodni klic z naslovom, ki ga vpiše uporabnik

To je ista pot do SSRF, ki jo je 005 že moral rešiti. Obstaja `domain/outbound-url.ts`
(zavrne `javascript:`/`data:`, poverilnice v naslovu, zasebne in link-local gostitelje,
IPv4 in IPv6) in ga 008 MORA uporabiti — ne pisati svojega preverjanja.

Prav tako velja člen VIII: branje strani gre prek `platform/cache/service.ts`
(`getOrRefresh`), favicon se streže prek strežnika in ne neposredno iz brskalnika — sicer
vsak izris seznama pomeni po en klic na vsak tuj gostitelj s seznama.

Branje `<title>` je klic na stran, ki je uporabnik ni nujno pripravljen deliti in ki je
lahko počasna ali nedosegljiva. Zato: shranjevanje ne sme biti odvisno od uspeha tega
klica.

### 4. Ploščica na nadzorni plošči je en vnos v register, ne poseg v dashboard

`apps/web/src/app/shared/tiles/tile-registry.ts` je namenoma v `shared/`, ker sme uvažati
iz katerekoli funkcionalnosti (obratno ne velja). Ploščica 008 je torej: komponenta v
`features/saved-links/tiles/`, en vnos v `TILE_REGISTRY` in en slovenski naslov v
`TILE_TYPE_TITLES`. `dashboard.page.ts` se ne dotakne.

### 5. Zavihek je en vnos v `TAB_REGISTRY` — z eno pastjo

`docs/adding-a-tab.md`, koraka 5 in 6: brez vpisa obsegov v `BASE_USER_SCOPES`
(`platform/keycloak/role-mapping.ts`) zavihek dela samo administratorju, brez registracije
ikone (`core/icons/register-icons.ts` + `tests/unit/icons.spec.ts`) pa se ikona izriše kot
prazen prostor.

## Obseg

**V obsegu:**

- zavihek "Shranjeni linki" s seznamom shranjenih strani;
- dodajanje, urejanje, brisanje zapisa (naslov, URL, komentar, ikona, skupina);
- mape/skupine: ustvarjanje, preimenovanje, brisanje, zlaganje, vrstni red;
- iskanje po naslovu, URL-ju in komentarju ter ročno prerazporejanje znotraj skupine;
- samodejno branje `<title>` in favicona ob dodajanju, z možnostjo ročnega popravka;
- ploščica na nadzorni plošči (zadnji ali izbrani linki);
- OpenAPI pogodba in obsegi `links:read` / `links:write` (člen III — n8n mora znati
  shraniti link brez UI).

**Ni v obsegu:**

- uvoz zaznamkov iz brskalnika (izrecno izločeno ob prevzemu);
- proste oznake (izbrane so mape);
- deljenje linkov med uporabniki — linki so osebni, po vzorcu 004;
- shranjevanje vsebine strani (arhiv/offline kopija) ali branje strani po shranjevanju;
- preverjanje, ali je shranjena stran še dosegljiva (to je 003-jev vzorec `camera-health`,
  ki bi tu pomenil redno obstreljevanje tujih strani — če bo, naj bo svoja odločitev).

## Odprta vprašanja za `/speckit-plan`

1. **Nedosegljiva stran ob shranjevanju.** Predlog: zapis se shrani takoj, naslov ostane
   uporabnikov vnos (ali sam URL), branje `<title>` je poznejše in neblokirajoče.
2. **Kje živi favicon.** Predpomnjen prek `platform/cache` po gostitelju (ne po linku —
   več linkov istega gostitelja ima isti favicon), ali shranjen ob zapisu.
3. **Ikona zapisa proti faviconu.** `icon` je ime Ionicons ikone (isti vzorec kot 005),
   favicon je slika s tuje strani — v vmesniku sta to dve različni stvari; katera ima
   prednost pri izrisu.
4. **Kaj se zgodi z linki ob brisanju skupine** — preselijo se v "brez skupine" ali se
   brisanje zavrne, dokler skupina ni prazna.
5. **Enotski testi domenske plasti (kakovostna vrata, točka 2).** Ta funkcionalnost nima
   predmeta za prehod na poletni/zimski čas, praznik, dopust čez mejo meseca ne neuspel
   ponovljen klic; načrt MORA izrecno zapisati, kateri primeri jih nadomeščajo
   (normalizacija URL-ja, razvrščanje in prerazporejanje, ujemanje pri iskanju,
   zavrnitev odhodnega naslova).
