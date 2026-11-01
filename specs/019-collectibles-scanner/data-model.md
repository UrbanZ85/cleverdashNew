# Data Model: Zbirateljski skener (019)

Brez novih zbirk razen splošne dnevne porabe virov. Pravilo, kot pri LEGO: polje, ki ga vir ne da, je
`null` ali izpuščeno — nikoli domneva.

## 1. CollectiblesConfig (`ScannerDefinition.config`)

Skupna polja + diskriminator `category`.

| polje | tip | opomba |
|---|---|---|
| `category` | `'trading-cards' \| 'retro-gaming'` | register; neznana → zagon se ne začne (`collectibles:invalid-config`) |
| `keywords`, `excludedKeywords[]` | string | vsaj ena izmed besed / filter kategorije / najvišja cena |
| `marketplaces[]` | `EBAY_DE\|EBAY_IT\|EBAY_FR\|EBAY_ES` | presek z `EBAY_MARKETPLACES` |
| `sellerCountries[]` | ISO2 | |
| `minPrice`, `maxPrice`, `currency` | number, `EUR` privzeto | |
| `conditions[]` | `NEW \| LIKE_NEW \| USED \| FOR_PARTS \| UNKNOWN` | |
| `listingTypes[]` | `FIXED_PRICE \| AUCTION` | |
| `maxShipping` | number | neznana poštnina ne ustreza |
| `minDiscountPct` | 0–100 | proti `discountBasis` ≠ asking |
| `minProfit` | number | samo znan dobiček |
| `notifyMinProfit`, `notifyMinDiscountPct` | number | prag obvestila; drugi nosi oznako "do ocene" |
| `auctionEndingHours` | 1–72, privzeto 6 | |
| `cards` (ko `category=trading-cards`) | glej spodaj | |
| `retro` (ko `category=retro-gaming`) | glej spodaj | |

`aiEnabled`, `schedule`, `notifications`, `sources` so polja `ScannerDefinition` iz jedra (ne v `config`).

**cards**: `game` (`pokemon`), `setName`, `cardNumber`, `language` (`en|de|fr|it|es|ja`), `edition`
(`first|unlimited|shadowless|any`), `finish` (`holo|reverse|normal|any`), `gradeStatus` (`raw|graded|any`),
`gradingCompany` (`PSA|BGS|CGC|SGC|any`), `grade` (string, "9", "9.5"), `sealedOnly` (boolean).

**retro**: `platform` (register: nes, snes, n64, gb, gbc, gba, ds, md, ps1, ps2, …), `consoleModel`, `region`
(`PAL|NTSC-U|NTSC-J|any`), `edition`, `completeness` (`loose|boxed|cib|sealed|any`), `working`
(`working|untested|not-working|any`), `kind` (`game|console|accessory`).

## 2. CollectibleAttributes (`ScannerResult.data.collectible`)

Po vmesniku iz naloge; kar je kategorijsko, gre v tipizirano podstrukturo.

```
CollectibleAttributes {
  category, subcategory?, brand?, name?, model?, catalogId?, edition?, releaseYear?,
  condition?, conditionVerified?, language?, region?, gradingCompany?, grade?,
  originalPackaging?, completeness?, sellerCountry?, listingType?, auctionEnd?
  card?:  { game, setId?, setName?, cardNumber?, rarity?, finish?, graded: boolean|null, sealed: boolean|null }
  retro?: { platform?, region?, kind?, completeness?, working?: 'working'|'untested'|'not-working'|null,
            reproductionSuspected: boolean|null }
}
```

## 3. Identification

`{ kind, confidence: high|medium|low|none, reason (sl), needsReview, variantKey|null, catalog|null }`

- `kind`: karte `CARD | SEALED | LOT | PROXY | OTHER | UNIDENTIFIED`; retro `GAME | CONSOLE | ACCESSORY |
  LOT | REPRODUCTION | OTHER | UNIDENTIFIED`.
- `variantKey`: `category|catalogId|jezik|izdaja|finish|ocenjevalec+ocena|raw` (kartice) ali
  `platform|title|region|edition|completeness` (retro). `null` ⇒ ni primerjave, ni ocene priložnosti.
- `PROXY`, `REPRODUCTION`, `LOT`, `UNIDENTIFIED`, `needsReview` ⇒ `canValue = false`.

## 4. Valuation (ločene vrste cen, nikoli mešane)

```
Valuation {
  asking:   { median, min, count, currency } | null            // iz oglasov tega zagona; basis 'asking'
  estimate: { value, low?, trend?, source, updatedAt, currency, basis: 'estimate'|'guide' } | null
  sold:     { average, median, count, periodMonths, source, currency } | null   // basis 'sold'
  primary:  'sold' | 'guide' | 'estimate' | null                // kaj tvori osnovo popusta
  confidence: high|medium|low|insufficient
  comparable: boolean       // valuta in variantKey se ujemata
  stale: boolean
  note: string | null
}
```

Pravila: `asking` nikoli ni `primary`; `sold` ima prednost; `estimate`/`guide` sta ocena. `insufficient`, kadar
ni nobene osnove ali variantKey ni določen.

## 5. Opportunity

Kot LEGO (`price, shipping, taxes, buyerFees, acquisitionCost, conservativeValue, sellingFees, riskReserve,
profit, roi, discountPct, score, missing[]`) + `discountBasis: 'sold'|'guide'|'estimate'|null` +
`profitBasis: 'sold'|null` + `illustrative: true`. `profit`/`roi`/`score` so `null`, razen če
`valuation.sold` obstaja in so poznani poštnina, davki, identifikacija in stanje. `missing[]` vsebuje
razlog (`sold-prices`, `shipping`, `taxes`, `identification`, `condition`, `variant`).

## 6. Alerts (stanje obvestil, `data.alerts`)

`{ profitNotified, discountNotified, auctionEndingNotified }`; ponastavitev, ko pogoj preneha veljati.

## 7. ExternalSourceUsage (nova, splošna; zamenja `LegoSourceUsage`)

`{ source: 'ebay'|'rebrickable'|'bricklink'|'tcgdex'|'pricecharting', day: 'yyyy-LL-dd' (Europe/Ljubljana),
requests, expiresAt }`; unikaten indeks `(source, day)`, TTL na `expiresAt`. Skupna za vse tipe; eBay
števec je ENA vrednost za namestitev (ključ aplikacije).

## 8. Prehodi stanja rezultata

`NEW → (PRICE_DOWN | PRICE_UP | CHANGED)* → UNAVAILABLE → (REAPPEARED)`. `UNAVAILABLE` pomeni "ni več
na voljo" — ne "prodano"; pri dražbi je `price` zadnja vidna ponudba (`bidCount`), ne končna cena.
