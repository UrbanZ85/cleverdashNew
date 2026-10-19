# Data Model: Analiza rezultatov z umetno inteligenco (017)

Dve novi zbirki jedra, dve razširitvi obstoječih zapisov jedra, dve razširitvi zapisov modula
Leti. Nobena migracija: nova polja so neobvezna, stari zapisi se berejo kot `aiEnabled: false`,
`aiAnalysis: null`.

| zbirka | model | lastništvo | hramba |
|---|---|---|---|
| `scanneraicaches` | `ScannerAiCache` | namestitev (vsebinski predpomnilnik) | TTL `SCANNER_AI_CACHE_DAYS` (30) |
| `scanneraiusages` | `ScannerAiUsage` | namestitev, en zapis na dan | TTL 400 dni (kot `USAGE_RETENTION_DAYS`) |

## `AiAnalysis` (vdelan podzapis, v1)

| polje | tip | opis |
|---|---|---|
| `version` | `1` | različica sheme; sprememba sheme = nova različica = nov `inputHash` |
| `model` | string | npr. `gpt-6.1-sol` |
| `analyzedAt` | Date | čas klica (ali zadetka predpomnilnika) |
| `inputHash` | string (32 hex) | sha256(model, version, kanonični vhod) |
| `cached` | boolean | `true`, kadar je prišla iz `scanneraicaches` |
| `summary` | string ≤ 400 | en stavek |
| `riskLevel` | `low \| medium \| high \| unknown` | |
| `explanation` | string ≤ 1200 | zakaj ta stopnja |
| `risks`, `defects`, `opportunities` | string[] ≤ 10 × ≤ 200 | alineje |
| `attributes` | Record<string, string> ≤ 30 | poenotene lastnosti (`snake_case` ključi) |
| `confidence` | `low \| medium \| high` | |

Brez številskih polj za denar (FR-009).

## Razširitve

- **`ScannerDefinition.aiEnabled`** `boolean`, privzeto `false`.
- **`ScannerResult.aiAnalysis`** `AiAnalysis | null`, privzeto `null`.
- **`FlightSearchRule.aiEnabled`** `boolean`, privzeto `false`.
- **`FlightOffer.aiAnalysis`** `AiAnalysis | null` — na ponudbi (skupni), ne na ujemanju
  (research.md §6).

## `ScannerAiCache`

| polje | tip | opis |
|---|---|---|
| `key` | string, unikat | = `inputHash` |
| `model` | string | |
| `analysis` | `AiAnalysis` brez `cached`/`analyzedAt` konteksta (shranjen izhod) | |
| `createdAt` | Date | |
| `expiresAt` | Date | TTL |

## `ScannerAiUsage`

| polje | tip | opis |
|---|---|---|
| `day` | `yyyy-LL-dd` (Europe/Ljubljana), unikat | |
| `requests` | number | rezervirani klici (vključno z neuspelimi — meja je za klice, ne uspehe) |
| `inputTokens`, `outputTokens` | number | iz `usage` odgovora, kadar je |
| `expiresAt` | Date | TTL |

Rezervacija: `findOneAndUpdate({ day, requests: { $lt: limit } }, { $inc: { requests: 1 } }, { upsert: false })`;
ob odsotnosti zapisa najprej `updateOne({ day }, { $setOnInsert }, { upsert: true })`.

## Števci zagona (`ScannerRun.counters`)

`aiAnalyzed`, `aiCached`, `aiSkipped`, `aiFailed` — jedro jih doda vedno, kadar je analiza
tekla (tudi 0), in jih izpusti, kadar ni na voljo (brez ključa) ali kadar tip ne podpira.
Napake posameznih rezultatov gredo v `runErrors` s kodami `ai:<razlog>` (največ `MAX_RUN_ERRORS`).

## Pogodbe

- 016 `Scanner`/`ScannerInput`/`ScannerPatch`: `aiEnabled`; `Result`: `aiAnalysis`;
  `GET /scanners/types`: `ai: { available }`.
- 015 `FlightSearchInput`: `aiEnabled`; `Offer`: `aiAnalysis`; `limits.aiAvailable`.
