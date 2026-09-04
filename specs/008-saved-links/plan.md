# Implementation Plan: Shranjeni linki

**Spec**: [spec.md](./spec.md) | **Pogodba**: [contracts/openapi.yaml](./contracts/openapi.yaml)
**Raziskava**: [research.md](./research.md) | **Podatkovni model**: [data-model.md](./data-model.md)
**Preverjanje**: [quickstart.md](./quickstart.md)
**Vhodno gradivo**: `nacrt/008-saved-links/spec.md`
**Datum**: 2026-08-28

## Summary

Nov zavihek "Shranjeni linki": osebna knjižnica shranjenih strani z mapami, iskanjem in
ročnim vrstnim redom. Zapis nastane iz prilepljenega naslova; ime strani in favicon prebere
STREŽNIK, znotraj proračuna 2,5 s in tako, da shranjevanje nikoli ni odvisno od uspeha tega
branja (research.md §2). Modul prispeva tudi ploščico na nadzorno ploščo prek obstoječega
registra vrst ploščic.

Zgradbeno je modul dvojček **beležk (007)**: enak zavihek, enaka razporeditev kode (domenska
plast v modulu), enako lastništvo zapisov, enaka oblika seznama z iskanjem, enak 404 namesto
403 za tuj zapis. Razlikuje se v tem, kaj zapis JE (stran namesto besedila) in kako je
razvrščen (mape namesto oznak in pripenjanja). Funkcionalnost je hkrati naslednica strani
"Useful links" iz starega CleverDasha (research.md §16) — od tam so trije podatki: ime strani,
naslov in komentar.

Tehnično je to najbolj običajen modul doslej: dve novi zbirki, en router, en zaslon, en vnos
v register zavihkov in en vnos v register ploščic. Vse tri stvari, ki bi lahko šle narobe —
odhodni klic z naslovom, ki ga vpiše uporabnik; predpomnjenje tuje slike; preslikava
vrstnega reda — so rešene z mehanizmi, ki v tem repozitoriju že obstajajo in so že
preizkušeni (`domain/outbound-url.ts`, `platform/cache/service.ts`,
`domain/camera-order.ts`).

## Technical Context

**Jezik / okolje**: TypeScript 5 (`strict: true`), Node.js 22 + Express 5 + Mongoose 8 na
strani API-ja; Ionic 8 + Angular 20 (standalone, signals) na strani odjemalca.

**Nove odvisnosti**: nobene. Razčlenitev `<title>` in `<link rel="icon">` gre z regularnim
izrazom nad prvimi 128 KB dokumenta — HTML razčlenjevalnik (`cheerio`, `parse5`) bi bil nova
odvisnost za dve polji v `<head>`, ki ju iščemo v vnaprej znani obliki.

**Shramba**: MongoDB — dve novi zbirki (`savedLinks`, `savedLinkGroups`). Nič se ne migrira.

**Testiranje**: Vitest proti v-pomnilniški MongoDB (obstoječa postavitev), pogodbeni testi
prek `supertest`, enotski testi domenskih funkcij brez baze in omrežja.

**Ciljna platforma**: isti Docker Compose kot 001–006; brez sprememb `infra/`.

**Vrsta projekta**: spletna aplikacija (API + SPA + Android prek Capacitorja).

**Zmogljivostni cilji**: iskanje po ~500 zapisih pod 1 s do prikaza (SC-003) — doseženo s
filtriranjem v pomnilniku na odjemalcu, ne s poizvedbo ob vsaki tipki. Branje strani: trd
proračun 2,5 s in 128 KB (research.md §14).

**Omejitve**: odjemalec ne sme klicati tujega gostitelja (člen VIII, SC-005); strežnik ne
sme obiskati naslova, ki ne prestane varovala (SC-008).

**Obseg**: ~2 zbirki, ~12 endpointov, 1 zavihek s 3 pogledi (seznam, urejevalnik zapisa,
urejanje map), 1 ploščica.

## Constitution Check

Ocenjeno proti `.specify/memory/constitution.md` **v1.1.0**.

| Člen | Stanje | Kako ga ta načrt izpolni |
|---|---|---|
| I. Zavihek je modul | ✅ poostreno | Vsa koda API-ja je v `modules/saved-links/`, vsa koda odjemalca v `features/saved-links/` — vključno z domensko plastjo modula (vzorec `modules/notes/domain/` iz 007), ker bi `link-*.ts` v skupnem `apps/api/src/domain/` ob odstranitvi zavihka ostal kot sirota. Nobenega uvoza iz drugega modula: skupno prihaja iz `domain/` in `platform/` (strežnik) oz. `core/` in `shared/` (odjemalec). Zunaj modula se spremenijo natanko štirje vpisi, ki jih `docs/adding-a-tab.md` predvideva: `TAB_REGISTRY`, `main.ts`, `app.routes.ts`, `BASE_USER_SCOPES` — plus dva registra (`shared/tiles/tile-registry.ts`, `core/icons/register-icons.ts`), ki sta za to narejena. Odstranitev modula je brisanje dveh map in teh vpisov. |
| II. Enotni izvor | ✅ | Nove poti pod `/api/v1/saved-links*` in `/api/v1/saved-link-groups*`, isti Express app, isti Caddy. Brez `cors()`. Favicon gre prek našega izvora, ne z odjemalca na tuj gostitelj. |
| III. API-first | ✅ | Pogodba OpenAPI 3.1 je nastala PRED zasloni in se generira v tipe (`npm run generate:contracts` dobi nov cilj `saved-links.d.ts`). Vsaka operacija vmesnika ima endpoint (SC-007). Mutacije sprejmejo `Idempotency-Key` prek obstoječega `platform/idempotency/middleware.ts`; izjema za izdajo žetonov se tu ne uporablja, ker modul žetonov ne izdaja. Nova obsega omogočata n8n dostop z `X-API-Key`. |
| IV. Nobene skrivnosti | ✅ | Nobene nove skrivnosti. Tri nove spremenljivke okolja so številčne meje s privzetki v kodi (`.env` ni treba dopolniti). Shranjen naslov s poverilnicami (`https://uporabnik:geslo@…`) se sme shraniti kot zapis, a ga strežnik NIKOLI ne obišče in poverilnic ne zapiše v dnevnik — varovalo `domain/outbound-url.ts` ga zavrne z razlogom `credentials`. |
| V. Determinističen scheduler | brez predmeta | 008 ne uvaja nobenega časovno vodenega tika. Metapodatki se berejo samo ob shranjevanju in na izrecno zahtevo; ponavljajočega preverjanja shranjenih strani ni (izrecno izven obsega, spec.md). |
| VI. Nobene neverificirane akcije | brez predmeta | Modul samo BERE tuje strani (GET) in ne izvede nobene akcije na tujem sistemu. |
| VII. Sistem pove, da je pokvarjen | ✅ | `metadataStatus` loči tri stanja — `ok`, `skipped` (naslova nismo obiskali) in `failed` (poskusili in ni šlo). Tiho spodletelo branje bi bilo natanko to, kar ta člen prepoveduje, zato izid ni skrit v dnevnik, ampak je polje v odgovoru in značka v vmesniku. Manjkajoč favicon je izrecno NE-napaka in se ne javlja kot okvara. |
| VIII. Vljudnost do zunanjih virov | ✅ | Favicon gre prek `platform/cache/service.ts` s ključem po GOSTITELJU (20 zapisov z `github.com` = 1 prenos), TTL 7 dni. Odjemalec tuje strani ne kliče nikoli. Branje strani se zgodi enkrat ob shranjevanju, nato le na zahtevo — nobenega poizvedovanja v zanki. Meji 2,5 s in 128 KB varujeta tudi tujo stran, ne le nas. |
| IX. Testabilno brez brskalnika | ✅ | Vsa logika, ki se lahko zmoti, je v čistih funkcijah: `domain/link-url.ts` (normalizacija, sheme, dolžina), `domain/search-text.ts` (zlaganje diakritike, ubežni znaki v poizvedbi), `domain/link-metadata.ts` (izluščenje `<title>` in `rel="icon"` iz danega niza), `domain/camera-order.ts` (vrstni red, ponovno uporabljena). Vse testirano brez baze, omrežja in TestBed-a. |
| X. Slovenščina v domeni, angleščina v kodi | ✅ | `id` zavihka, poti, polja in imena zbirk so angleški (`saved-links`, `savedLinks`, `titleSource`); naslov zavihka ("Shranjeni linki"), imena map in vsa besedila v vmesniku so slovenska. Vrednosti `metadataStatus` so angleški identifikatorji z ločeno preslikavo v slovenske značke. |
| XI. Mobilna naprava je odjemalec | ✅ | Nič se ne planira na napravi; branje metapodatkov je na strežniku, kar je hkrati pogoj za člen VIII. |
| XII. Meje | ✅ | Modul ne zaobide ničesar: bere samo javno dosegljivo stran z navadnim GET, brez piškotkov in brez avtentikacije. Varovalo odhodnih naslovov je nova OMEJITEV tega, kam strežnik sme seči, tudi ob preusmeritvah (research.md §3). |

### Kakovostna vrata

| Vrata | Kako se izpolnijo v 008 |
|---|---|
| 1. Čist `typecheck` in `lint`, brez `any` v domenski plasti | Isto pravilo kot 001–006, razširjeno na novo kodo. Mejo med moduli uveljavlja `cleverdash/module-boundary` v `eslint.config.js` — nov modul je pod istim pravilom. |
| 2. Enotski testi domenske logike | **Vsi štirje poimenski primeri (prehod na poletni/zimski čas, praznik na delovni dan, dopust prek meje meseca, neuspel klic z uspehom ob ponovitvi) so v 008 BREZ PREDMETA** — modul nima koledarja, schedulerja ne akcije na tuji strani (glej člena V in VI zgoraj). To je tu izrecno zapisano, ker ustava pravi, da "molk ne šteje". **Nadomeščajo jih** primeri iz research.md §13: normalizacija naslova (manjkajoča shema, presledki, zavrnjene sheme `javascript`/`data`/`file`, meja 2048 znakov, mala začetnica gostitelja ob nedotaknjeni poti), zlaganje za iskanje (`cas` → `časa`, ujemanje po naslovu in komentarju, ubežni znaki), preslikava vrstnega reda in nedotaknjenost tuje mape, ravnanje z odhodnim naslovom (`http://192.168.1.1` je veljaven zapis, a se ne obišče; preusmeritev v zasebni naslov zavrnjena na drugem skoku), izolacija med uporabniki (404, ne 403) in preživetje zapisov ob brisanju mape. |
| 3. Posodobljena in validna OpenAPI pogodba | [contracts/openapi.yaml](./contracts/openapi.yaml). Že preverjeno: `openapi-typescript` jo razreši brez napak. Naloga v `tasks.md` doda cilj v `packages/contracts/scripts/generate.ts`, da je preverba del gradnje. |
| 4. `docker compose up` iz čiste kopije | **Brez sprememb `infra/`.** Nobene nove sistemske odvisnosti in nobene nove OBVEZNE spremenljivke okolja — tri nove imajo privzetke v kodi in so v `.env.example` označene kot neobvezne. |
| 5. Nobenega niza, ki je videti kot skrivnost | 008 ne uvaja nobene skrivnosti. Nasprotno: naslov s poverilnicami se ne obišče in se ne zapiše v dnevnik. |

**Izid vrat: prehod, brez odstopanj.**

## Project Structure

### Dokumentacija

```text
specs/008-saved-links/
├── plan.md              # ta datoteka
├── research.md          # Phase 0 — odločitve
├── data-model.md        # Phase 1 — zbirke, indeksi, izpeljano
├── quickstart.md        # Phase 1 — kako se preveri, da dela
├── contracts/openapi.yaml
├── checklists/requirements.md
└── tasks.md             # Phase 2 — /speckit-tasks, ne nastane tu
```

### Nova koda (API)

Razporeditev je prevzeta od modula beležk (007): domenska plast je V MODULU, ne v skupnem
`apps/api/src/domain/` — ob odstranitvi zavihka mora izginiti tudi njegova domenska koda
(člen I). Iz skupnega `domain/` se uporabi samo tisto, kar je že prej služilo več modulom.

```text
apps/api/src/
  modules/saved-links/
    domain/link-input.ts                 Zod shema, buildLinksFilter, escapeRegExp,
                                         deriveLinkTitle — vzorec modules/notes/domain/note-input.ts
    domain/link-url.ts                   normalizacija naslova + zavrnitev sheme (čista)
    domain/search-text.ts                zlaganje diakritike (čista)
    domain/link-metadata.ts              izluščenje <title> in rel="icon" iz niza (čista)
    models/saved-link.model.ts
    models/saved-link-group.model.ts
    services/link-metadata.service.ts    odhodni klic s proračunom in preusmeritvami
    services/favicon.service.ts          predpomnjenje po gostitelju
    scopes.ts                            saved-links:read / saved-links:write
    router.ts                            zapisi + mape + favicon
```

Iz skupne domenske plasti se UPORABITA, ne kopirata: `domain/outbound-url.ts` (varovalo, 005)
in `domain/camera-order.ts#toOrderAssignments` (vrstni red, 003).

### Nova koda (web)

```text
apps/web/src/app/
  core/
    saved-links/{saved-link.model.ts,saved-links.store.ts}
    search/fold-text.ts                  isto zlaganje kot na strežniku (research.md §6)
  features/saved-links/
    saved-links.page.ts                  seznam, iskanje, mape
    link-editor.component.ts             dodajanje in urejanje zapisa
    group-editor.component.ts            mape
    tiles/saved-links-tile.component.ts  ploščica na nadzorni plošči
```

### Vpisi zunaj modula (in nič drugega)

| Datoteka | Sprememba | Zakaj je dovoljena |
|---|---|---|
| `apps/api/src/platform/tabs/registry.ts` | en vnos `saved-links` | docs/adding-a-tab.md korak 2 |
| `apps/api/src/main.ts` | `apiV1Router.use(savedLinksRouter)` | korak 3 (v datoteki je označeno edino mesto) |
| `apps/api/src/platform/keycloak/role-mapping.ts` | dva niza v `BASE_USER_SCOPES` | korak 5; niza sta prepisana, ne uvožena |
| `apps/web/src/app/app.routes.ts` | ena pot | korak 4 |
| `apps/web/src/app/core/icons/register-icons.ts` + `tests/unit/icons.spec.ts` | ikoni `bookmarks-outline`, `link-outline` | korak 6 |
| `apps/web/src/app/shared/tiles/tile-registry.ts` | vnos v `TILE_REGISTRY` + naslov v `TILE_TYPE_TITLES` | register je namenoma v `shared/` in sme uvažati iz funkcionalnosti |
| `packages/contracts/scripts/generate.ts` | nov cilj | vrata 3 |
| `.env.example` | tri neobvezne spremenljivke z opisom | člen IV |

## Complexity Tracking

Brez odstopanj od ustave. Dve odločitvi sta videti kot bližnjica in sta zato zapisani
izrecno:

| Odločitev | Zakaj tako | Zavrnjena možnost |
|---|---|---|
| Zlaganje besedila (`fold`) obstaja v dveh izvodih — `apps/api/src/domain/search-text.ts` in `apps/web/src/app/core/search/fold-text.ts` | `apps/api` in `apps/web` sta ločena paketa; uvoz med njima ni mogoč. Funkcija je pet vrstic in ima na obeh straneh isti nabor enotskih testov. | Skupen paket `packages/` samo za pet vrstic — več infrastrukture kot koristi. |
| `domain/camera-order.ts#toOrderAssignments` se uporabi tudi za linke | Funkcija je splošna, `domain/` sme uporabiti vsak modul (člen I omejuje uvoze med MODULI). | Podvojitev iste tri-vrstične funkcije pod novim imenom; preimenovanje datoteke bi se dotaknilo 003 in sodi v ločen čistilni PR. |
