# Data Model: Dražbeni skener (021)

Brez novih zbirk: konfiguracija v `ScannerDefinition.config`, rezultati v `ScannerResult.data` (generična shramba 016),
dnevna poraba virov v obstoječi `ExternalSourceUsage` (ključ `auctions:<vir>`). Podatki so pogrešljivi (brez migracij).

## AuctionsConfig (Zod, `config.ts`)

| polje | tip | opomba |
|---|---|---|
| `preset` | `auctions` \| `eu-auctions` \| `liquidations` | samo predizbira obrazca; zagon enak (FR-002) |
| `sources` | `AuctionSourceId[]` | `sodnedrazbe`, `govsi`, (`furs`, `ajpes` zavrnjena ob validaciji: nedostopna) |
| `countries` | ISO-3166 alpha-2[] | privzeto `['SI']`; neznana država → zagon se ustavi (FR-005) |
| `regions` | string[] | neobvezno |
| `categories` | `AssetCategory[]` | `real-estate`, `vehicles`, `equipment`, `other` (razširljivo) |
| `keywords` / `excludeKeywords` | string[] | omejitve dolžine/števila |
| `minStartingPrice` / `maxStartingPrice` | number | v `currency` |
| `minAppraisedValue` | number | |
| `maxDeposit` | number | |
| `methods` | `AuctionMethod[]` | |
| `auctionFrom` / `auctionTo` | ISO datum | obdobje začetka dražbe |
| `registrationBy` | ISO datum | rok prijave najpozneje |
| `onlineOnly` / `requireAppraisedValue` | boolean | |
| `endingWithinHours` | number | "kmalu se iztečejo" |
| `minDiscountPct` / `minProfit` | number | zahtevata znano oceno; brez nje izločeno |
| `currency` | string | privzeto `EUR`; druge valute brez pretvorbe |
| `assumptions` | `ValuationAssumptions` | spodaj |
| `alerts` | `{ registrationHours, startingHours, endingHours, scoreThreshold? }` | dedup po zastavicah |
| `aiEnabled` | boolean | privzeto `false` (017) |

### ValuationAssumptions (ocene lastnika, vedno `estimate`)

`estimatedMarketValue?` (znesek, uporabi se za vse najdbe iskanja), `appraisalToMarketPct?` (% cenitve, ki velja
za tržno vrednost; brez njega cenitev ni tržna vrednost), `conservativeDiscountPct`, `sellingFeePct`,
`riskReservePct`, `transport?`, `registrationCosts?`, `otherCosts?`, `minProfit`, `taxPctOverride?`.

## AuctionAttributes (`data.attributes`)

Skladno s specifikacijo; **vsa polja neobvezna in `null` = neznano**; `undefined`/prazen niz se ne uporablja.

```ts
type AuctionType = 'JUDICIAL' | 'TAX' | 'INSOLVENCY' | 'PUBLIC' | 'PRIVATE';
type AuctionMethod = 'ONLINE' | 'IN_PERSON' | 'WRITTEN_BID' | 'UNKNOWN';
type AuctionStatus = 'scheduled' | 'open' | 'postponed' | 'cancelled' | 'unknown'; // izvirni status vira
type DepositTreatment = 'credited' | 'refundable' | 'non-refundable' | 'unknown';

interface AuctionAttributes {
  auctionType: AuctionType | null;
  assetCategory: string | null;
  country: string | null;           // ISO-2
  location: string | null;
  auctionMethod: AuctionMethod;     // UNKNOWN namesto null
  startingPrice: number | null;
  currentBid: number | null;
  appraisedValue: number | null;
  currency: string | null;
  depositAmount: number | null;
  depositPercentage: number | null;
  depositTreatment: DepositTreatment;
  registrationDeadline: string | null;   // ISO UTC
  auctionStart: string | null;
  auctionEnd: string | null;
  minimumBidIncrement: number | null;
  buyerPremium: { kind: 'percent' | 'amount'; value: number } | null;
  additionalFees: number | null;
  taxInformation: string | null;
  inspectionAvailable: boolean | null;
  inspectionDate: string | null;
  assetCondition: string | null;
  participationRequirements: string | null;
  documents: { title: string; url: string }[];
  status: AuctionStatus;
  statusRaw: string | null;
  // normalizacija
  timeZone: { assumed: boolean; zone: string };
  dateInconsistent: boolean;
  multiLot: boolean;                // sklop več predmetov → brez ocene
  sources: { source: string; url: string; reference: string | null }[];   // dedup
}
```

## Valuation & Opportunity (`data.evaluation`)

```ts
interface AuctionEvaluation {
  estimate: true;                       // vedno
  observablePrice: number | null;       // currentBid ?? startingPrice; ni končna cena
  observablePriceBasis: 'current-bid' | 'starting-price' | null;
  acquisitionCost: CostBreakdown | null;
  conservativeMarketValue: number | null;
  marketValueBasis: 'owner-estimate' | 'appraisal-assumption' | null;
  grossMargin: number | null;
  netProfit: number | null;
  roi: number | null;
  discountPct: number | null;           // proti oceni tržne vrednosti, ne proti cenitvi
  maxBid: { amount: number; estimate: true } | null;
  unknownCosts: string[];               // npr. ['buyerPremium','taxes','depositTreatment']
  insufficientData: boolean;
  missing: string[];                    // razlogi za null
  score: number | null;                 // kot v 018/019 (popust/dobiček), brez nove lestvice
}
interface CostBreakdown {
  price: number; buyerPremium: number | null; taxes: number | null; additionalFees: number | null;
  transport: number | null; registrationCosts: number | null; otherCosts: number | null;
  depositCounted: number;               // 0 razen pri non-refundable
  total: number;
}
```

Pravila: (1) brez tržne vrednosti → `insufficientData`; (2) neznan `buyerPremium`/`taxes`/`transport` ≠ 0 → `netProfit`
`null`, v `unknownCosts`; (3) `depositCounted` > 0 samo pri `non-refundable`; (4) `observablePrice` nikoli ni "končna cena".

## Risk (`data.risks`)

`RiskFlag = { code, severity: 'info'|'warn', text }[]`. Kode: `condition-unknown`, `no-inspection`, `no-documents`,
`ownership-unclear`, `buyer-fees`, `short-registration`, `high-deposit`, `in-person-only`, `valuation-uncertain`,
`few-comparables`. Besedila so opozorila; nobena koda ne pomeni prevare.

## Lifecycle & alerts (`data.lifecycle`, `data.alerts`)

```ts
interface Lifecycle { startingPrice; currentBid; registrationDeadline; auctionStart; auctionEnd; status; documentCount; documentsHash }
interface AlertFlags { registrationNotified; startingNotified; endingNotified; scoreNotified; postponedFor: string|null; cancelledNotified: boolean; documentsHash: string|null }
```

Dogodek nastane iz razlike prejšnji/trenutni `Lifecycle`: `postponed` (auctionStart ali auctionEnd naprej), `cancelled`
(status → cancelled), `registration-changed`, `end-changed`, `documents-changed`, `price-changed`. Izginotje →
jedrov `UNAVAILABLE` ("ni več objavljeno"); nikoli "zaključeno/prodano".

## Source registry (`sources/registry.ts`)

```ts
interface AuctionSourceInfo {
  id: string; label: string; country: string;
  status: 'supported' | 'partial' | 'manual' | 'unavailable' | 'reference';
  reason: string | null;      // slovensko; pove, zakaj ni polno podprt
  officialUrl: string; docsUrl: string | null;
  requiresEnv: string[];      // imena spremenljivk (brez vrednosti)
  selectable: boolean;        // false za unavailable/reference
  verifiedAt: string;         // datum zadnjega preverjanja
}
```
