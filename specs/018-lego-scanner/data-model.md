# Data Model: LEGO skener (018)

Ena nova zbirka (`legosourceusages`). Konfiguracija iskanja je `ScannerDefinition.config`
(`Mixed`, preverjen z Zod shemo tipa), rezultati so `ScannerResult` z LEGO podatki v `data`.
Brez migracij; nobena obstoječa shema se ne spremeni.

| zbirka | model | lastništvo | hramba |
|---|---|---|---|
| `legosourceusages` | `LegoSourceUsage` | namestitev | TTL 400 dni |
| `scannerdefinitions` (016) | `ScannerDefinition` (`type: 'lego'`) | osebno | do izbrisa |
| `scannerresults` (016) | `ScannerResult` (`scannerType: 'lego'`) | osebno prek definicije | TTL jedra |
| `externalcaches` (001) | `ExternalCache` (ključi `lego:*`) | namestitev | brez TTL (zadnji znani podatek) |

## `LegoSourceUsage`

| polje | tip | opis |
|---|---|---|
| `source` | `rebrickable \| bricklink \| ebay` | |
| `day` | `yyyy-LL-dd` (Europe/Ljubljana) | |
| `requests` | number | rezervirani klici (vključno z neuspelimi) |
| `expiresAt` | Date | TTL |

Unikaten indeks `{ source, day }`.

## `LegoConfig` (`ScannerDefinition.config`)

| polje | tip | privzeto | opis |
|---|---|---|---|
| `setNumber` | string? | — | normalizirano v `NNNNN-V` ob shranjevanju |
| `keywords` | string? ≤ 120 | — | |
| `theme`, `subtheme` | string? ≤ 60 | — | primerjava brez šumnikov in velikosti črk po katalogu |
| `minYear`, `maxYear` | int? 1949–2100 | — | |
| `minPrice`, `maxPrice` | number? ≥ 0 | — | v `currency` |
| `currency` | ISO 4217 | `EUR` | primerjava z vrednostjo samo pri `EUR` |
| `marketplaces` | `('EBAY_DE'\|'EBAY_IT')[]` 1–2 | `['EBAY_DE']` | morajo biti v `EBAY_MARKETPLACES` namestitve |
| `sellerCountries` | ISO2[] ≤ 10 | `[]` | `itemLocationCountry`; prazno = vse |
| `conditions` | `LegoCondition[]` | `[]` | prazno = vsa; filtrira se PO razvrstitvi |
| `listingTypes` | `('FIXED_PRICE'\|'AUCTION')[]` | oba | |
| `minDiscountPct` | number? 0–100 | — | filter: oglas z neznanim popustom je izključen |
| `minProfit` | number? | — | filter: oglas z neznanim dobičkom je izključen |
| `maxShipping` | number? ≥ 0 | — | filter: oglas z neznano poštnino je izključen |
| `notifyMinProfit` | number? | — | prag obvestila (ne filter); brez njega obvešča vsak nov/spremenjen |
| `auctionEndingHours` | int 1–72 | 6 | okno za "dražba se izteka" |

Pravilo: vsaj eno od `setNumber`, `keywords`, `theme`, `maxPrice` (da iskanje ni neomejeno).
Polja za "upokojen" ni (research §3).

## `LegoCondition`

`NEW_SEALED | NEW_OPEN_BOX | USED_COMPLETE | USED_INCOMPLETE | PARTS_ONLY | UNKNOWN`

## `ScannerResult.data` (oblika last tipa `lego`)

```ts
interface LegoResultData {
  lego: LegoAttributes;            // iz naloge; polja, ki jih vir ne da, so izpuščena
  listing: {
    marketplace: 'EBAY_DE' | 'EBAY_IT';
    itemId: string;
    listingType: 'FIXED_PRICE' | 'AUCTION';
    endsAt: string | null;         // dražba
    bidCount: number | null;
    shipping: Money | null;        // null = neznana (nikoli 0)
    shippingKnown: boolean;
    images: string[];              // samo https, eBay gostitelji
  };
  identification: {
    kind: 'SET' | 'BUNDLE' | 'PARTS' | 'MINIFIG' | 'EMPTY_BOX' | 'OTHER' | 'UNIDENTIFIED';
    confidence: 'high' | 'medium' | 'low' | 'none';
    reason: string;                // slovensko
    needsReview: boolean;
    catalog: { setNumber: string; name: string; theme: string | null; subtheme: string | null;
               year: number | null; pieces: number | null; imageUrl: string | null; url: string | null } | null;
  };
  valuation: {
    basis: 'sold';
    newOrUsed: 'N' | 'U' | null;
    currency: string | null;
    average: number | null; median: number | null;
    salesCount: number; periodMonths: 6;
    confidence: 'high' | 'medium' | 'low' | 'insufficient';
    stale: boolean;
    active: { average: number | null; min: number | null; count: number } | null;   // aktivne ponudbe (ločeno)
    comparable: boolean;           // false = druga valuta ali neprimerljivo stanje
    note: string | null;
  } | null;
  opportunity: {
    illustrative: true;            // oznaka "ocena"
    price: number; shipping: number | null; taxes: number | null; buyerFees: number;
    acquisitionCost: number | null;
    conservativeValue: number | null; sellingFees: number | null; riskReserve: number | null;
    profit: number | null; roi: number | null; discountPct: number | null;
    score: number | null;
    missing: string[];             // npr. ['shipping', 'valuation'] — kaj preprečuje izračun
  };
  alerts: { profitNotified: boolean; auctionEndingNotified: boolean };
}
```

`ScannerResult.title` = naslov oglasa; `price` = trenutna cena (pri dražbi zadnja vidna
ponudba, NE končna), `url` = povezava oglasa, `source` = `ebay:EBAY_DE` ali `fake`,
`externalId` = `itemId`, `identity` = `${marketplace}:${itemId}`, `comparable` = `{ condition,
listingType, setNumber }` (spremembe stanja).

## Dogodki obvestil (`ScannerEvent.payload`)

`{ resultId, title, url, imageUrl, price, shipping, marketplace, setNumber, setName,
condition, listingType, endsAt, valuation: { average, salesCount, confidence } | null,
profit, roi, reasons: ('new'|'price-down'|'price-up'|'undervalued'|'profit-threshold'|'auction-ending'|'changed')[] }`

## Pogodba

`specs/018-lego-scanner/contracts/openapi.yaml`: `GET /lego-scanner/sources` (dostopnost virov,
da/ne) in sheme `LegoConfig`, `LegoResultData`, `LegoAttributes`. Preostale poti so iz 016
(`/scanners*`); `config` in `data` sta tam `object` z opisom, da je pogodba 016 nespremenjena.
