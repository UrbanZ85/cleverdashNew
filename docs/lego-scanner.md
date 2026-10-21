# LEGO skener

Tip skenerja `lego` v jedru skenerjev (016): po urniku išče LEGO sete na eBayu, jih prepozna v
katalogu, primerja s prodajami na BrickLinku in oceni, ali je oglas podcenjen. Načrt in razlogi:
[`specs/018-lego-scanner/`](../specs/018-lego-scanner/) (zlasti `research.md`).

Skener je **dodatek** obstoječemu jedru: urnik, zagoni, zgodovina, dopisi in analiza z umetno
inteligenco so skupni z drugimi tipi ([`scanner-engine.md`](scanner-engine.md)); modul
`apps/api/src/modules/lego-scanner/` in `apps/web/src/app/features/lego-scanner/` je samostojen
(brisanje: obe mapi, dve vrstici registracije in vrstica usmerjevalnika v `main.ts`).

## Kaj sistem trdi in česa ne

To je namen celotne funkcionalnosti — napačna številka je dražja od manjkajoče.

| stvar | pravilo |
|---|---|
| set | identificiran je samo, kadar ga potrdi številka v katalogu (visoko) ali ime (srednje); sicer je oglas "ročni pregled" brez ocene priložnosti |
| paket, deli, minifigura, prazna škatla | imajo svojo vrsto, niso set, nimajo vrednosti in dobička |
| stanje | eBay "Novo" = zapečatano; rabljeno je `USED_COMPLETE` **samo**, kadar prodajalec izrecno navede kompletnost; sicer `UNKNOWN`, brez vrednosti in dobička |
| vrednost | iz **prodaj** zadnjih 6 mesecev (BrickLink), ločeno novo/rabljeno; aktivne ponudbe so ločeno polje in niso prodajne cene; mediana samo iz posameznih prodaj |
| poštnina | znana samo za fiksni strošek; "izračunana" ali manjkajoča je **neznana**, ne 0 |
| davki | prodajalec iz EU → 0; sicer neznani → dobička ni |
| valuta | cenik je v EUR; oglas v drugi valuti = primerjava ni mogoča (brez pretvorbe) |
| dobiček | skupni strošek, konservativna vrednost, provizije prodaje, rezerva — vsaka postavka vidna; parametri so **ocene** lastnika namestitve (`LEGO_*_PCT`) |
| umik oglasa | "ni več na voljo", **ne** "prodano" |
| dražba | zadnja vidna ponudba, **ne** končna cena |
| upokojen | ni filtra: noben dovoljen vir tega ne pove zanesljivo |

## Viri in ključi

Vsak vir je vklopljen samo, kadar so v `.env` vsi njegovi ključi (`GET /lego-scanner/sources` pove
da/ne in razlog; ključev nikoli ne vrne). Brez vira oglasov se zagon konča z napako
`lego:no-listing-source`; brez kataloga ali cenika oglasi ostanejo, a brez imena seta oziroma
vrednosti.

| vir | vloga | ključi | opombe |
|---|---|---|---|
| Rebrickable | katalog (številka, ime, tema, letnik, kosi, slika); NI vir cen | `REBRICKABLE_API_KEY` | brezplačen ključ v profilu; ~1 zahteva/s, 429 ob prekoračitvi (razmik 1,1 s) |
| BrickLink | cenik: prodaje (`sold`) in aktivne ponudbe (`stock`), novo/rabljeno, EUR | `BRICKLINK_CONSUMER_KEY`, `_CONSUMER_SECRET`, `_TOKEN`, `_TOKEN_SECRET` | OAuth 1.0; **v BrickLink računu je treba registrirati IP naslov strežnika**, sicer 403 |
| eBay Browse | oglasi (fiksna cena, dražbe), tržnici `EBAY_DE`, `EBAY_IT`, dostava v Slovenijo | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | aplikacijski žeton (client credentials) samo v pomnilniku |

Vsaka zahteva gre prek skupnega predpomnilnika (katalog 30 dni, cenik 24 ur, oglasi 15 minut), ima
dnevno mejo v bazi (`LEGO_*_DAILY_LIMIT`) in razmik. Izpad vira zagona ne podre (razen vira
oglasov); ob izpadu oglasov se obstoječi rezultati **ne** označijo kot nedosegljivi.
Podrobnosti okolja: [`env-reference.md`](env-reference.md).

**Potrditev po prvem pravem klicu.** Oblike odgovorov Rebrickable in BrickLink so iz javne
dokumentacije (BrickLink stran je JS in je nisem mogel prebrati strojno); razčlenitev je tolerantna
(manjkajoče polje = izpuščen atribut). Če prva prava zahteva odstopa od mock odgovorov v testih, se
popravita razčlenitev in mock v isti nalogi.

## Dodajanje vira

Nov vir oglasov (trgovina, Bolha prek dovoljenega API-ja) je nova datoteka v `sources/`, ki izpolni
`ListingSource` (opis zahteve, čista razčlenitev, prenos prek `sources/http.ts`), in ena vrstica v
`sources/index.ts`. Nedovoljeno scrapanje ni podprto.

## Obvestila

Dogodke sestavi tip sam (`events.ts`), ker jedro zazna spremembo samo po ceni. Dopis nastane za:
nov oglas, pocenitev/podražitev, "podcenjeno" (dobiček prvič nad pragom `notifyMinProfit`), dražbo,
ki se izteka (`auctionEndingHours`), in spremembo stanja. Brez praga se obvešča o vsakem novem
oglasu; s pragom samo o oglasih z znanim dobičkom nad njim. Zastavici `profitNotified` in
`auctionEndingNotified` v `data.alerts` preprečita dvojnike.

## Analiza z umetno inteligenco

Tip uporablja generični procesor (017, `aiEnabled` na iskanju). Vhod je samo oglas in katalog
(brez oseb), slike samo ob `SCANNER_AI_IMAGES=true` in samo `ebayimg`. Navodilo prepoveduje trditve
o pristnosti iz slik in ocenjevanje cen.

## Testi

```bash
cd apps/api && npx vitest run tests/unit/lego tests/integration/lego tests/contract/lego
cd apps/web && npx vitest run tests/unit/lego-model.spec.ts
```

Vsi testi so z mock odgovori; testni vir z izmišljenimi podatki (`LEGO_FAKE_SOURCE_ENABLED`, v
produkciji zavrnjen) poganja deterministično zgodbo štirih zagonov (quickstart §1).
