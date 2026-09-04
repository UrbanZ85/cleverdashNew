# 008 — Zagon in preverjanje (Phase 1)

**Spec**: [spec.md](./spec.md) | **Načrt**: [plan.md](./plan.md) | **Pogodba**:
[contracts/openapi.yaml](./contracts/openapi.yaml)

Ta dokument je navodilo za PREVERJANJE, da funkcionalnost dela — ne opis izvedbe. Kaj se
kodira, je v [tasks.md](./tasks.md).

## 1. Predpogoji

Nič dodatnega k 001. 008 ne prinese nobene nove sistemske odvisnosti, nobenega novega
zabojnika in nobene nove obvezne spremenljivke okolja.

## 2. `.env`

**Nič ni treba dodati.** Tri nove nastavitve imajo privzetke v kodi
(`platform/config/env.ts`) in v `.env.example` so dokumentirane kot neobvezne:

| Spremenljivka | Privzetek | Kaj je |
|---|---|---|
| `SAVED_LINKS_METADATA_TIMEOUT_MS` | `2500` | proračun za branje imena strani (research.md §2) |
| `SAVED_LINKS_METADATA_MAX_BYTES` | `131072` | koliko dokumenta se prebere (128 KB) |
| `SAVED_LINKS_FAVICON_TTL_SECONDS` | `604800` | 7 dni; predpomnilnik favicona po gostitelju |

Vrata 4 (`docker compose up` iz čiste kopije) s tem ostanejo izpolnjena.

## 3. Preverjanje po uporabniških zgodbah

Prijavi se in odpri zavihek **Shranjeni linki**.

### 3.1 Shranim stran (US1)

1. Prilepi `https://www.arso.gov.si/` in potrdi.
   → zapis se pojavi na seznamu z imenom, ki ga je prebral strežnik, ne z golim naslovom.
2. Vpiši `primer.si/stran` brez sheme.
   → shrani se kot `https://primer.si/stran`.
3. Vpiši `javascript:alert(1)`.
   → zavrnjeno s sporočilom, kaj je narobe; zapis ne nastane.
4. Vpiši `https://ta-domena-ne-obstaja-12345.si/`.
   → zapis VSEENO nastane; ime je gostitelj, značka pove, da podatkov s strani ni.
5. Vpiši `http://192.168.1.1`.
   → zapis nastane; strežnik strani NI obiskal (`metadataStatus: skipped`). Preveri v
   dnevniku strežnika, da odhodnega klica ni bilo.

### 3.2 Najdem, kar sem shranil (US2)

1. Vpiši `cas` v iskalno polje → najde zapis z imenom, ki vsebuje "časa" (FR-030).
2. Vpiši `arso` → najde zapis, kjer je niz samo v NASLOVU, ne v imenu.
3. Vpiši `...` → seznam je prazen s pojasnilom, ne prazen brez besedila; poizvedba se ni
   razumela kot regularni izraz.

### 3.3 Uredim v mape (US3)

1. Ustvari mapo "Delo", povleci vanjo dva zapisa → oba sta pod njo, ostali nedotaknjeni.
2. Zloži mapo, osveži stran → ostane zložena.
3. Povleci zapis više, osveži stran → vrstni red ostane.
4. **Izbriši mapo z zapisi** → zapisi so med nerazvrščenimi, nobeden ni izginil; sporočilo
   pove, koliko jih je bilo premaknjenih (FR-022).

### 3.4 Popravim in izbrišem (US4)

1. Popravi ime zapisa, nato izberi "osveži podatke strani" → tvoje ime OSTANE (FR-014).
2. Izberi "prevzemi ime s strani" → ime se prepiše s prebranim.
3. Izbriši zapis → izgine s seznama in s ploščice na nadzorni plošči.

### 3.5 Ploščica na nadzorni plošči (US5)

1. V Nastavitve → razporeditev ploščic vklopi "Shranjeni linki".
2. Nadzorna plošča pokaže 6 nazadnje shranjenih; klik odpre stran v novem zavihku.
3. **SC-005:** odpri omrežni dnevnik brskalnika in osveži seznam s ~100 zapisi → nobene
   zahteve na tuj gostitelj; faviconi gredo prek `/api/v1/saved-links/{id}/favicon`.

### 3.6 Brez vmesnika (US6)

```bash
curl -X POST https://app.si/api/v1/saved-links \
  -H "X-API-Key: $KEY" \
  -H "Idempotency-Key: 7c1f-test" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.arso.gov.si/","description":"vreme"}'
```

→ `201` z zapisom. Isti klic ponovi z istim `Idempotency-Key` → isti odgovor, drugi zapis ne
nastane (člen III).

### 3.7 Izolacija med uporabniki

Prijavi se kot drug uporabnik → seznam je prazen. Poskusi
`GET /saved-links/<tuj-id>` → `404` (ne `403`).

## 4. Enotski testi domenske logike (Kakovostno vrato 2)

Štirje poimenski primeri iz ustave (poletni/zimski čas, praznik, dopust prek meje meseca,
neuspel klic z uspehom ob ponovitvi) so v 008 **brez predmeta** — modul nima koledarja,
scheduleria ne akcije na tuji strani. Nadomeščajo jih (research.md §13):

```bash
npm test -- domain/link-url.spec.ts        # normalizacija in zavrnitev sheme
npm test -- domain/search-text.spec.ts     # zlaganje šumnikov, ubežni znaki
npm test -- domain/link-order.spec.ts      # preslikava vrstnega reda
npm test -- tests/contract/saved-links.spec.ts
npm test -- tests/integration/saved-links-isolation.spec.ts
```

Ključni primeri, ki morajo biti zeleni:

| Primer | Pričakovano |
|---|---|
| `normalizeLinkUrl(' primer.si/a ')` | `https://primer.si/a` |
| `normalizeLinkUrl('javascript:alert(1)')` | zavrnjeno, razlog `scheme` |
| `normalizeLinkUrl('HTTP://PRIMER.SI/Pot')` | `http://primer.si/Pot` — gostitelj v mali začetnici, pot nedotaknjena |
| `foldForSearch('Beleženje časa')` | vsebuje `belezenje casa` |
| `matchesQuery(link, '.')` | pika je dobesedna, ne "poljuben znak" |
| preusmeritev na `http://10.0.0.1/` | zavrnjena na drugem skoku, `metadataStatus: failed` |
| brisanje mape s tremi zapisi | `movedLinks: 3`, vsi trije še obstajajo |

## 5. Razvojni način

```bash
npm install
docker compose -f infra/docker-compose.dev.yml up -d   # samo MongoDB
npm run generate:contracts                             # doda saved-links.d.ts
npm run dev:api
npm run dev:web
```

Pred commitom (nespremenjeno iz 001):

```bash
npm run typecheck && npm run lint && npm test && npm run build:web
```

## 6. Če kaj ne dela

| Simptom | Vzrok | Rešitev |
|---|---|---|
| Zavihka ni v meniju | vnos v `TAB_REGISTRY` manjka ali obsega nista v `BASE_USER_SCOPES` | docs/adding-a-tab.md, koraka 2 in 5 |
| Zavihek je viden samo adminu | manjkata `saved-links:read`/`saved-links:write` v `BASE_USER_SCOPES` | dodaj niza (prepisana, ne uvožena) |
| Ikona zavihka je prazen prostor | ikona ni registrirana | `core/icons/register-icons.ts` + `tests/unit/icons.spec.ts` |
| Ime strani se nikoli ne prebere | naslov ne prestane varovala (`metadataStatus: skipped`) | to je pravilno vedenje za zasebne naslove (research.md §5) |
| Faviconov ni | stran ga nima ali prenos je spodletel | ni napaka; odjemalec izriše ikono |
| Ploščice ni med ponujenimi | manjka vnos v `shared/tiles/tile-registry.ts` | dodaj `{ type: 'saved-links', component: … }` in slovenski naslov |
