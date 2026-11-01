# Zbirateljski skener

Tip skenerja `collectibles` v jedru skenerjev (016): po urniku išče zbirateljske kartice (Pokémon) in retro
igre/konzole na eBayu, jih prepozna po različici, prikaže vrednost z označeno vrsto podatka in oceni, ali je
oglas morda podcenjen. Načrt in razlogi: [`specs/019-collectibles-scanner/`](../specs/019-collectibles-scanner/)
(zlasti `research.md`).

Skener je **dodatek** obstoječemu jedru: urnik, zagoni, zgodovina, dopisi in analiza z umetno inteligenco so
skupni z drugimi tipi ([`scanner-engine.md`](scanner-engine.md)); modul `apps/api/src/modules/collectibles-scanner/`
in `apps/web/src/app/features/collectibles-scanner/` je samostojen (brisanje: obe mapi, vrstici registracije
in vrstica usmerjevalnika v `main.ts`; test: `tests/integration/collectibles/removal.spec.ts`).

## Kaj sistem trdi in česa ne

Namen celotne funkcionalnosti: napačna številka je dražja od manjkajoče.

| stvar | pravilo |
|---|---|
| različica | PSA 9 ≠ PSA 10 ≠ neocenjena; prva izdaja ≠ shadowless ≠ unlimited; japonska ≠ angleška; reverse holo ≠ holo; loose ≠ CIB; PAL ≠ NTSC; original ≠ reprodukcija; okvarjeno ≠ delujoče. Vsaka različica ima svoj `variantKey`; različna ključa se **nikoli** ne primerjata |
| neznano | kar oglas ne pove (jezik, izdaja, površina, regija, popolnost, ocena), je **dvoumnost** in oglas nima vrednosti; nič se ne domneva |
| ročni pregled | kar ni zanesljivo prepoznano, je označeno in nima ocene priložnosti |
| kartica brez omembe ocenjevanja | obravnavana kot **neocenjena** (eBay oglas z ocenjeno kartico skoraj vedno navede PSA/BGS/CGC); to je zapisano v razlogu prepoznave |
| paketi, proxy, reprodukcije, zapečateni izdelki | imajo svojo vrsto, niso posamezna kartica/igra, nimajo vrednosti |
| vrste cen | `asking` (zahtevane cene primerljivih oglasov v tem zagonu), `estimate` (katalog), `guide` (cenik), `sold` (preverjene prodaje). Nikoli se ne mešajo in vsaka je ob prikazu označena |
| popust | lahko iz ocene ali cenika (označeno z osnovo), nikoli iz zahtevanih cen |
| dobiček | **samo iz preverjenih prodaj**; brez njih je neznan z razlogom `sold-prices` |
| poštnina | znana samo za fiksni strošek; "izračunana" ali manjkajoča je **neznana**, ne 0 |
| davki | prodajalec iz EU → 0; sicer neznani → dobička ni |
| valuta | oglas v drugi valuti, kot jo ima vir vrednosti, ni primerljiv (brez pretvorbe) |
| umik oglasa | "ni več na voljo", **ne** "prodano" |
| dražba | zadnja vidna ponudba, **ne** končna cena |
| pristnost | ni mogoče potrditi iz oglasa; analiza z UI je ne sme trditi iz slik |

## Posledica: dobiček je v produkciji praviloma neznan

Noben dovoljen vir ne daje **preverjenih prodaj**: TCGdex da Cardmarket ocene, PriceCharting cenik, eBay Browse
samo zahtevane cene. Zato kartice in retro igre v praksi dobijo **oceno in popust do ocene**, dobiček pa ostane
neznan, dokler se ne doda vir prodaj (npr. eBay Marketplace Insights po odobritvi ali PriceCharting, če se
dokaže, da vrača posamezne prodaje). Model, izračun, prag obvestila in testi so pripravljeni: nov vir z
`basis: 'sold'` vklopi dobiček brez spremembe kode. Testni vir (`COLLECTIBLES_FAKE_SOURCE_ENABLED`) daje izmišljene
prodaje, da razvoj in testi pokažejo izračun.

## Kategorije

| kategorija | filtri | prepoznava |
|---|---|---|
| `trading-cards` | set, številka, jezik, izdaja, površina, ocenjena/neocenjena, ocenjevalec, ocena, samo zapečateni | TCGdex (ime + številka + skupno število kartic → set); katalogne cene Cardmarket so ocena neocenjene kartice |
| `retro-gaming` | platforma, vrsta, model konzole, regija, izdaja, popolnost, delovanje | iz besedila (največ "srednje"); s ključem PriceCharting potrditev v katalogu |

Ocena kataloga za kartico se izda samo, ko je kartica neocenjena, jezik naveden in ujemajoč, ter kartica
**nima** več izdaj (katalog cen ne loči po prvi izdaji/shadowless/unlimited). Base Set Charizard zato nima ocene,
moderna kartica (npr. Obsidian Flames) jo ima.

**Japonske kartice**: katalog TCGdex ima za japonščino druge id-je in japonska imena; angleški naslov se z njim ne
ujema, zato gre taka kartica v ročni pregled (brez ugibanja).

### Dodajanje kategorije

Nova datoteka v `modules/collectibles-scanner/categories/` (izpolni `CategoryHandler`: shema filtrov, opis polj,
iskalni niz, prepoznava, vrednotenje, rezerva za tveganje), vnos v `COLLECTIBLE_CATEGORIES`
(`domain/types.ts`), `categories/registry.ts` in `config.ts` (diskriminatorska unija). Obrazec odjemalca se zgradi
iz opisa (`GET /collectibles-scanner/categories`), zato odjemalec ostane nespremenjen.

## Viri in ključi

| vir | vloga | ključi | opombe |
|---|---|---|---|
| eBay Browse | oglasi (fiksna cena, dražbe), tržnice `EBAY_DE`, `EBAY_IT`, `EBAY_FR`, `EBAY_ES`, dostava v Slovenijo | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` (skupna z LEGO) | skupni odjemalec `platform/ebay/`; dnevni števec je **skupen** z LEGO (ena meja na ključ aplikacije) |
| TCGdex | katalog Pokémon kartic (ime, set, številka, redkost, različice, Cardmarket ocene) | brez ključa | ⚠ licenca in meje niso uradno potrjene; konzervativen razmik (250 ms) in dnevna meja |
| PriceCharting | cenik retro iger (loose/CIB/novo) | `PRICECHARTING_API_KEY` | **plačljiv**; izbiren; cene v **USD** brez pretvorbe → oglas v EUR ni primerljiv |

Pokémon TCG API je **zastarel** (nove registracije zaprte, ključi veljajo do 1. 3. 2027, napoteni na plačljivi
Scrydex) in ni vir. Cardmarket, Bolha in drugi viri brez preverjenega dovoljenega dostopa niso podprti; obhod
CAPTCHA ali zaščit pred roboti ni podprt.

`GET /collectibles-scanner/sources` pove, kateri viri so vklopljeni (da/ne in razlog; ključev nikoli ne vrne).
Brez vira oglasov se zagon konča z napako `collectibles:no-listing-source`. Vsaka zahteva gre prek skupnega
predpomnilnika (katalog 30 dni, cene 24 ur, oglasi 15 minut), ima dnevno mejo v bazi
(`COLLECTIBLES_*_DAILY_LIMIT`) in razmik. Izpad kataloga ali cenika zagona ne podre; izpad vira oglasov ga
konča kot neuspešen in obstoječih rezultatov **ne** označi kot nedosegljivih.

### Še ni potrjeno (potrdi pred prvim pravim zagonom)

- **eBay kategorije** za kartice in retro igre (ID-ji niso zakodirani; iskanje je brez `category_ids`, dokler jih
  ne potrdiš z eBay Taxonomy API ali živim testom) in ali `item_summary/search` vrne `conditionDescriptors`
  (ocenjevalec in ocena) — osnova je razčlenitev naslova.
- **TCGdex**: licenca podatkov, uradne meje hitrosti, pot slike (`/low.webp`), pomen polj `*-holo` pri
  Cardmarket cenah (privzeto se `trend-holo` uporabi samo za reverse holo).
- **PriceCharting**: oblika odgovora (`/api/products`, `/api/product`), valuta in pogoji uporabe podatkov;
  razčlenitev je tolerantna in jo je treba po prvem pravem klicu popraviti skupaj z mockom.

## Obvestila

Dogodke sestavi tip sam (`events.ts`), ker jedro zazna spremembo samo po ceni. Dopis nastane za: nov oglas,
pocenitev/podražitev, "podcenjeno" (dobiček ali popust do ocene prvič nad pragom), dražbo, ki se izteka
(`auctionEndingHours`), in spremembo stanja/različice. Velja **natanko en prag**: `notifyMinProfit` (samo
znan dobiček) ali `notifyMinDiscountPct` (označen "do ocene"); prag dobička ima prednost, validacija oba
prepove. Zastavice `profitNotified`, `discountNotified` in `auctionEndingNotified` v `data.alerts`
preprečijo dvojnike.

## Analiza z umetno inteligenco

Generični procesor (017, `aiEnabled` na iskanju, privzeto izklopljeno). Vhod je samo oglas, katalog in
izračunane oznake (brez oseb), slike samo ob `SCANNER_AI_IMAGES=true` in samo `ebayimg`. Navodilo prepoveduje
trditve o pristnosti iz slik in ocenjevanje cen, vrednosti, stroškov popravila ali dobičkov.

## Parametri izračuna (ocene lastnika namestitve)

`COLLECTIBLES_SELLING_FEE_PCT`, `_CONSERVATIVE_DISCOUNT_PCT`, `_BUYER_FEE_PCT`, rezerva za tveganje po
kategoriji (`_RISK_RESERVE_PCT_CARDS`, `_RETRO`) in dodatki (`_RISK_UNVERIFIED_GRADE_PCT` za ocenjene kartice,
`_RISK_REPRO_SUSPECT_PCT` za loose kartuše). Niso tržna dejstva; izračun ni nasvet za nakup. Podrobnosti:
[`env-reference.md`](env-reference.md).

## Testi

```bash
cd apps/api && npx vitest run tests/unit/collectibles tests/unit/platform tests/integration/collectibles tests/integration/platform tests/contract/collectibles
cd apps/web && npx vitest run tests/unit/collectibles-model.spec.ts tests/unit/collectibles-ui.spec.ts
npx --yes @redocly/cli lint specs/019-collectibles-scanner/contracts/openapi.yaml
```

Vsi testi so z mock odgovori in izmišljenimi podatki; testni vir (`COLLECTIBLES_FAKE_SOURCE_ENABLED`, v
produkciji zavrnjen) poganja deterministično zgodbo štirih zagonov (quickstart §1). Izvleka skupne kode iz LEGO
(eBay odjemalec, prenos z dnevno mejo, aritmetika priložnosti, odločanje o dogodkih) je pokrita z lastnimi
testi v `tests/unit/platform/` in `tests/integration/platform/`; LEGO testi so ostali nespremenjeni.
