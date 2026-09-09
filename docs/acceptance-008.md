# Sprejemno preverjanje — 008 (shranjeni linki)

Datum: 2026-09-09. Preverjeno s celotnim samodejnim naborom testov in s pregledom kode proti
[`specs/008-saved-links/`](../specs/008-saved-links/) (spec, plan, research, data-model,
pogodba, quickstart). Zapisano po vzorcu [`acceptance-005.md`](acceptance-005.md): kaj je bilo
preverjeno, s katerim ukazom, in kaj je bilo pri tem najdeno.

## Kaj je bilo dodano

| Plast | Datoteke |
|---|---|
| Domenska plast (čista, brez baze in omrežja) | `modules/saved-links/domain/{link-url,search-text,link-metadata,link-input}.ts` |
| Modela | `modules/saved-links/models/{saved-link,saved-link-group}.model.ts` |
| Storitvi (odhodni klici) | `modules/saved-links/services/{link-metadata,favicon}.service.ts` |
| Usmerjevalnik | `modules/saved-links/router.ts` — 13 poti, vsaka z `requireScopes` |
| Obsegi | `modules/saved-links/scopes.ts` (`saved-links:read`, `saved-links:write`) |
| Odjemalec | `core/saved-links/{saved-link.model,saved-links.store}.ts`, `core/search/fold-text.ts`, `features/saved-links/` (stran, urejevalnik zapisa, urejevalnik map, ikona, ploščica) |

Zunaj modula se je spremenilo natanko to, kar [`adding-a-tab.md`](adding-a-tab.md) predvideva,
in nič drugega: `platform/tabs/registry.ts` (en vnos), `main.ts` (dva `use`), `role-mapping.ts`
(dva prepisana niza), `app.routes.ts` (ena pot), `core/icons/register-icons.ts` (dve ikoni),
`shared/tiles/{tile-registry,tile-types}.ts` (vnos ploščice), `packages/contracts/scripts/generate.ts`
(nov cilj), `platform/config/env.ts` in `.env.example` (tri neobvezne spremenljivke).

## Kakovostna vrata

```bash
npm run generate:contracts   # doda packages/contracts/src/generated/saved-links.d.ts
npm run typecheck
npm run lint
npm test
npm run build:web
```

| Vrata | Izid |
|---|---|
| 1. Čist `typecheck` in `lint`, brez `any` v domenski plasti | `lint` čist, brez `any` v domenski plasti (in brez `as never` v routerju). `typecheck` čist za vso kodo 008 — z ENO izjemo, ki 008 ne pripada: glej "Najdeno mimogrede" spodaj. |
| 2. Enotski testi domenske logike | 6 novih enotskih datotek na strežniku + 1 na odjemalcu; glej razdelek o nadomestnih primerih. Celoten nabor: **1517 testov na strežniku in 408 na odjemalcu, vsi zeleni**; od tega 81 novih za 008 (7 pogodbenih datotek, 2 integracijski, 6 enotskih na strežniku, 1 enotska na odjemalcu). |
| 3. Posodobljena in validna OpenAPI pogodba | `npm run generate:contracts` razreši `specs/008-saved-links/contracts/openapi.yaml` brez napak in generira `saved-links.d.ts`. Cilj je zdaj del generatorja, torej del gradnje. |
| 4. `docker compose up` iz čiste kopije | Brez sprememb `infra/`. Nobene nove sistemske odvisnosti, nobene nove OBVEZNE spremenljivke — tri nove imajo privzetke v kodi in so v `.env.example` označene kot neobvezne. Pokrito s testom (`tests/unit/env.spec.ts`, blok "008"). |
| 5. Nobenega niza, ki je videti kot skrivnost | 008 ne uvaja nobene skrivnosti. Nasprotno: naslov s poverilnicami se NE obišče in razlog v dnevniku je `credentials`, ne vsebina naslova (pokrito v `tests/unit/link-metadata-service.spec.ts`). |

## Nadomestni primeri za kakovostno vrato 2

Štirje poimenski primeri iz ustave (prehod na poletni/zimski čas, praznik na delovni dan,
dopust prek meje meseca, neuspel klic z uspehom ob ponovitvi) so v 008 **brez predmeta** —
modul nima koledarja, schedulerja ne akcije na tuji strani. To je izrecno zapisano v
[`plan.md`](../specs/008-saved-links/plan.md) in [`research.md` §13](../specs/008-saved-links/research.md),
ker molk ne šteje za izpolnjeno. Nadomeščajo jih:

| Področje | Datoteka | Kaj dokazuje |
|---|---|---|
| Normalizacija naslova | `tests/unit/link-url.spec.ts` | ` primer.si/a ` → `https://primer.si/a`; `javascript:`/`data:`/`file:` zavrnjeni z razlogom `scheme`; naslov nad 2048 znaki zavrnjen; `HTTP://PRIMER.SI/Pot` → `http://primer.si/Pot` (gostitelj v male črke, **pot nedotaknjena**) |
| Zlaganje za iskanje | `tests/unit/search-text.spec.ts`, `apps/web/tests/unit/fold-text.spec.ts` | `cas` najde "časa"; ujemanje po imenu, naslovu IN komentarju; `.` in `...` sta dobesedna, ne regularni izraz. **Isti nabor primerov na obeh straneh** — to je edino, kar drži obe kopiji `fold` skupaj |
| Izluščenje iz HTML | `tests/unit/link-metadata.spec.ts` | entitete, naslov čez več vrstic, dokument brez `<title>` → `null` (in ne prazen niz), `rel="shortcut icon"`, relativni `href` ostane relativen |
| Vhodne sheme in filter | `tests/unit/link-input.spec.ts` | `userId` je vedno del filtra; `groupId: 'none'` → `null`; izpuščena mapa pomeni VSE mape; `deriveLinkTitle('', 'https://www.arso.gov.si/x')` → `arso.gov.si` |
| Odhodni naslov | `tests/unit/link-metadata-service.spec.ts` | zasebni naslov se NE obišče (podtaknjen `fetch` ni klican); preusmeritev na `http://10.0.0.1/` zavrnjena na **drugem** skoku in je `failed`, ne `skipped`; četrti skok zavrnjen; cikel ne zavrti storitve; `application/pdf` se ne razčlenjuje; telo nad mejo se odreže |
| Vrstni red | `tests/unit/link-order.spec.ts` | ID, ki ga v seznamu ni, se v izhodu ne pojavi — zato prerazporeditev ene mape ne premeša drugih |
| Izolacija med uporabniki | `tests/integration/saved-links-isolation.spec.ts` | tuj zapis vrne **404 na vseh petih poteh**, ki ga naslavljajo; tuja mapa 404; iskanje ne prečka meje; dva uporabnika smeta imeti mapo z istim imenom |
| Brisanje mape | `tests/contract/saved-links/groups.spec.ts` | `movedLinks: 3` in vsi trije zapisi obstajajo z `groupId: null`; zapisi DRUGIH map nedotaknjeni |

## Merila uspeha

| Merilo | Kako je preverjeno |
|---|---|
| **SC-001** shranjevanje z lepljenjem in enim klikom, brez vpisovanja imena | `tests/contract/saved-links/create.spec.ts` — `POST` samo z `url` vrne 201 z imenom, prebranim s strani. Proračun branja je 2,5 s, torej daleč pod 10 s. |
| **SC-002** nedosegljiva stran: zapis vseeno nastane | `tests/integration/saved-links-metadata.spec.ts` — 201, `metadataStatus: 'failed'`, ime = gostitelj, in zapis je res v bazi (preverjeno prek `GET`, ne le iz odgovora). |
| **SC-003** iskanje pri 500 zapisih pod 1 s | **Zgradbeno, ne izmerjeno na 500 zapisih:** iskanje na zaslonu je filtriranje že naloženega seznama v pomnilniku (`saved-links.page.ts`, `computed`), brez klica na strežnik ob tipki. Iskanje prek HTTP obstaja ločeno (`?q=`) in je pokrito s `tests/contract/saved-links/search.spec.ts`. Meritev z ~100 zapisi v brskalniku je ostala neopravljena — glej "Kaj ostaja neizmerjeno". |
| **SC-004** najdba v treh potezah | Zavihek → iskalno polje na vrhu seznama → klik na zapis odpre stran. |
| **SC-005** izris seznama ne sproži nobenega klica na tuj gostitelj | **Zgradbeno zagotovljeno in delno pokrito s testom.** Odgovor NE vsebuje naslova favicona, ampak samo `hasFavicon` (`toLinkResponse` v `router.ts`) — odjemalec torej tujega naslova niti ne pozna. Bajti gredo prek `GET /saved-links/{id}/favicon`, in `LinkIconComponent` jih prenese prek `HttpClient` + objectURL, ne prek `<img src>`. Omrežni dnevnik brskalnika ni bil pregledan — glej spodaj. |
| **SC-006** brisanje mape ne izgubi zapisa | `groups.spec.ts` (trije zapisi) in `saved-links-isolation.spec.ts` (meja med uporabniki). |
| **SC-007** vsaka operacija vmesnika izvedljiva tudi s HTTP klicem | `tests/contract/saved-links/api-key.spec.ts` — z `X-API-Key` gredo skozi: nova mapa, nov zapis v mapi, vrstni red, `PATCH`, `refresh-metadata`, brisanje mape (z `movedLinks`) in brisanje zapisa. Brez ustreznega obsega 403, z napačnim ključem 401. |
| **SC-008** zasebni naslov ni nikoli obiskan | `saved-links-metadata.spec.ts` in `link-metadata-service.spec.ts` — merilo je, da **podtaknjen `fetch` ni klican**, ne le da je `metadataStatus: 'skipped'`. Preverjanje samo prek stanja bi prestala tudi izvedba, ki naslov obišče in izid zavrže. |

## Kaj je bilo najdeno med izvedbo

### 1. `validateOutboundUrl` dovoli izključno `https` — vsak shranjen `http://` naslov je `skipped`

`research.md` §5 govori o zavrnitvi "sheme, ki ni http/https", varovalo iz 005 pa je strožje:
dovoli samo `https`. Ker plan izrecno zahteva, da se varovalo uporabi **nespremenjeno**, je
posledica ta, da se `http://` stranem ime nikoli ne prebere samodejno (`metadataStatus:
'skipped'`).

To je ostalo tako namerno — varovalo je edina stvar med uporabnikovim vnosom in odhodnim klicem
strežnika, in mehčanje njegovih meril ne sodi v ta modul. Zapis je vseeno veljaven, brskalnik
ga odpre, ime pa uporabnik po potrebi vpiše sam. Posledica je zapisana v komentarju
`link-metadata.service.ts`, da naslednji bralec ne bo iskal napake tam, kjer je odločitev.

### 2. `PATCH` bi z naivno izvedbo povozil prebrano ime z gostiteljem

Prva različica je ob vsakem `PATCH` brez `title` na zapisu s `titleSource: 'auto'` znova
izpeljala nadomestno ime — torej bi popravek **samega komentarja** zamenjal "Agencija za
okolje" z "arso.gov.si". Popravljeno tako, da se ime osveži samo, kadar je bilo res le
nadomestek (`title === hostLabel(url)`) **in** se je naslov spremenil; prebrano ali ročno
vpisano ime se ne dotakne.

### 3. Favicon ne more iti prek `<img src="/api/…">`

Naslov v atributu `src` ne gre skozi `core/auth/auth.interceptor.ts`, zato bi bil brez glave
`Authorization` in bi vrnil 401 — ista past, ki je pri beležkah (007) opisana za predvajanje
posnetkov. Zato `LinkIconComponent` sliko prenese prek `HttpClient` in iz Bloba naredi
objectURL, ki ga ob uničenju sprosti.

### 4. Stran, ki na `/favicon.ico` vrne svoj HTML

Pogosta oblika "catch-all 200" — brez preverbe bi se v predpomnilnik zapisal HTML z glavo
`image/*` in brskalnik bi izrisal pokvarjeno sliko. To je natanko ista past, ki je 003 stala
napačne domneve o naslovu ARSO webcam (`acceptance-003.md`). `favicon.service.ts` zato zavrne
odgovor, ki se ne začne z `image/`, in vrne 404.

### 5. Edinstvenost imena mape terja OBOJE: preverbo in indeks

Prva izvedba se je zanašala izključno na unikatni indeks `{userId, name}` in prevajala napako
`11000` v `400`. Utemeljitev je bila, da predhodno preverjanje ne prepreči sočasnosti — kar
drži, a je bila polovična.

**Test `groups.spec.ts` je v celotnem naboru padel, sam zase pa tekel zeleno.** Vzrok ni
test: Mongoose gradi indekse **asinhrono** (`autoIndex`), zato ob zapisu takoj po zagonu
procesa indeksa še ni in podvojeno ime se tiho shrani. V celotnem naboru je bilo zapisov v
prvih milisekundah dovolj, da se je to zgodilo; v enem samem testu ne.

Popravljeno tako, da sta zdaj oba mehanizma: `assertGroupNameFree()` da determinističen
odgovor, prevod napake `11000` pa zapre okno med preverbo in zapisom. Nobeno samo zase ne
zadošča, in to je zapisano v komentarju nad funkcijo, da naslednji bralec enega od njiju ne
odstrani kot podvojenega.

### 6. Ena moja pričakovana vrednost v testu je bila napačna, ne implementacija

Test zlaganja je pričakoval `Grüße` → `grusse`. `ß` **ni** diakritika in ga `normalize('NFD')`
ne razstavi; pravilen izid je `gruße`. Popravljen je bil test, z zapisano mejo tega pristopa:
nemški zapis bi za `ss` potreboval tabelo preslikav, ki je za slovenski vmesnik ne želimo
(`research.md` §6).

## Najdeno mimogrede (ne pripada 008)

`npm run typecheck` na `main` **že pred tem delom** pade na eni napaki, ki 008 ne pripada:

```
apps/api/tests/contract/timesheet/workbook.spec.ts(52,22): error TS2345:
Argument of type 'Buffer<ArrayBufferLike>' is not assignable to parameter of type 'Buffer'.
```

Preverjeno s `git stash -u` na čisti kopiji `main`: napaka je tam tudi brez sprememb 008. Gre
za znano razhajanje tipov `Buffer` med `@types/node` in knjižnico za `.xlsx` iz 006. Popravek
sodi v ločen PR, ker se dotika modula 006 in ne te funkcionalnosti; zapisano tu, da ni videti
kot posledica 008.

## Kaj ostaja neizmerjeno

Dve nalogi iz [`tasks.md`](../specs/008-saved-links/tasks.md) (T062) zahtevata **ročno
preverbo v brskalniku** in nista bili opravljeni:

1. **SC-003 s ~500 zapisi** — zakasnitev iskanja ob tipkanju. Zgradbeno je iskanje filtriranje
   v pomnilniku, torej brez omrežja, a številka ni izmerjena.
2. **SC-005 v omrežnem dnevniku** — da izris seznama s ~100 zapisi ne sproži nobene zahteve na
   tuj gostitelj. Zgradbeno je to zagotovljeno s tem, da odjemalec naslova favicona sploh ne
   dobi (glej tabelo meril zgoraj), a dnevnik ni bil pregledan.

Oboje terja zagnano aplikacijo z resničnimi podatki in brskalnik; do takrat naj v tem dokumentu
stoji kot **neizmerjeno**, ne kot izpolnjeno.
