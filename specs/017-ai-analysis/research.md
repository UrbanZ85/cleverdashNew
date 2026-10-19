# Research: Analiza rezultatov z umetno inteligenco (017)

Odločitve z razlogi. Stanje kode: konec implementacije 016 (19. 10. 2026).

## §1 — OpenAI Responses API prek `fetch`, brez SDK

**Odločitev.** Odjemalec je ena datoteka (`platform/scanner/services/ai-client.service.ts`),
ki kliče `POST {OPENAI_BASE_URL}/responses` z `fetch`, glavo `Authorization: Bearer`, časovno
omejitvijo (`AbortController`) in eno ponovitvijo ob `429`/`5xx`.

**Razlog.** Nobene nove odvisnosti (isti dogovor kot `modules/notes/services/transcription.service.ts`,
ki govori OpenAI protokol prek `fetch`); odjemalec je zamenljiv v testih
(`setAiClientForTests`) brez `vi.mock` nad paketom; naslov je nastavljiv, zato namestitev ni
vezana na enega ponudnika, ki govori isti protokol.

**Zavrnjeno.** Paket `openai` — 1 odvisnost z lastnimi ponovitvami in tipi, ki bi jih morali
posnemati v testih; za en klic z eno shemo ni vreden.

## §2 — Model `gpt-6.1-sol`, nastavljiv

Uradna dokumentacija (preverjeno 19. 10. 2026): id `gpt-6.1-sol`, Responses API, podpira
`structured_outputs` in vhod slik, kontekst 1.050.000, največ 128.000 izhodnih žetonov. Ime je
v `OPENAI_MODEL`, ker bo zastarelo prej kot ta koda.

## §3 — Strukturiran izhod: `text.format = { type: 'json_schema', strict: true }`

Shema (`platform/scanner/domain/ai-analysis.ts`) ima vsa polja `required`,
`additionalProperties: false`, brez številskih polj za denar. Odgovor se bere iz
`output[].content[]` (`output_text`; `refusal` je neuspeh), `status: 'incomplete'` z
`max_output_tokens` je neuspeh. Besedilo se nato preveri še z Zod (`parseAiOutput`) — tudi
`strict` odgovor je zunanji vnos.

**Zavrnjeno.** `responses.parse` + `zodTextFormat` iz SDK (glej §1); prosto besedilo z lastnim
razčlenjevanjem (nepreverljivo).

## §4 — Kje teče: korak zagona v jedru, po izvajanju tipa, pred zaključkom

`run-executor.service.ts` po `type.execute` in po sestavljanju dopisov pokliče
`runAiAnalysis(...)` v lastnem `try/catch`; vrne števce, ki gredo v `counters` zagona. Dopisi se
sestavijo PRED analizo (vsebina dopisa od nje ni odvisna), outbox se obdela po zaključku zagona
kot doslej.

**Razlog.** "Po obstoječih filtrih" pomeni: nad tem, kar je tip že spravil v shrambo (ujemanja
letov, `reconcile` generične shrambe). Jedro nima lastnega urnika za analizo — teče v istem
zagonu, z utripom in preklicem istega zagona (brez ločenega schedulerja, kot zahteva naloga).

**Zavrnjeno.** Analiza znotraj `execute` tipa (vsak tip bi jo klical sam → ni "generično");
ločen tik za analizo (drugi scheduler, ki ga naloga prepoveduje).

## §5 — Vklop na definiciji: `aiEnabled`, privzeto `false`

`ScannerDefinition.aiEnabled` (jedro) in `FlightSearchRule.aiEnabled` (modul). Jedro za
generične definicije bere svoje polje; tip z lastnimi definicijami (leti) ga upošteva v svojem
kavlju `candidates`. Privzetek je izklop, ker je analiza plačljiva in ker naloga tako zahteva.

## §6 — Kje je analiza shranjena: na rezultatu

`ScannerResult.aiAnalysis` (generična shramba) in `FlightOffer.aiAnalysis` (leti). Ponudba leta
je skupna referenčna tabela; analiza ponudbe je objektivna (ista za vsakogar), zato je na ponudbi
in ne na ujemanju — dva uporabnika z istim ujemanjem si delita en klic. Izklop analize zapisa ne
briše (FR-015).

## §7 — Kandidati: spremenjeni v tem zagonu ali še brez analize

Rezultati z vklopljeno analizo, ki so `available` in (a) `lastSeenAt === now` zagona z
`lastChangeType ∈ {NEW, PRICE_DOWN, PRICE_UP, CHANGED}` ali (b) `aiAnalysis == null`. (b) je
zato, da vklop pri obstoječem skenerju analizira sedanje rezultate postopno (meja na zagon), ne
samo prihodnjih. Pri letih (a) pomeni ujemanje z `lastRunId == runId` in spremembo, (b)
ponudbo aktivnega ujemanja vklopljenega iskanja brez analize.

## §8 — Dvojni predpomnilnik in dnevni proračun

1. `inputHash` na shranjeni analizi: isti rezultat z istim vhodom se ne pošlje znova (brez
   poizvedbe).
2. Zbirka `scanneraicaches` (ključ = sha256(model, različica sheme, kanonični vhod), TTL
   `SCANNER_AI_CACHE_DAYS`): isti vhod pri drugem skenerju/uporabniku je zadetek
   (`cached: true`).
3. Zbirka `scanneraiusages` (en zapis na dan v coni Europe/Ljubljana): atomaren
   `findOneAndUpdate` z `requests < limit` v filtru rezervira klic; brez rezervacije je kandidat
   `skipped: daily-limit`. Člen V (brez števcev v pomnilniku, dva izvoda API-ja delita mejo).

`ExternalCache` ni uporabljen: nosi surove odgovore virov s svežino po URL-ju, analiza pa je
vsebina po vhodu.

## §9 — Slike neobvezne, privzeto izklopljene

`SCANNER_AI_IMAGES=false` privzeto: vhod slik je dražji in večina tipov (leti, echo) slik nima.
Ob vklopu gredo največ 3 `https` naslovi iz `input.images` kot `input_image` z `detail: 'low'`.
Jedro slik ne prenaša in ne hrani.

## §10 — Kavlji tipa: `ScannerType.ai`

```ts
ai?: {
  subject?: string;                                   // "letalska ponudba" — za navodilo modelu
  describe?(result: ResultView): AiAnalysisInput;     // generična shramba: obogatitev vhoda
  candidates?(ctx: AiCandidatesContext): Promise<AiCandidate[]>;   // lastna shramba
  store?(ref: string, analysis: AiAnalysis, ctx: AiCandidatesContext): Promise<void>;
}
```

Jedro ima privzeto izvedbo za `results: 'generic'` (`services/ai-candidates.service.ts`): bere
`scannerresults` in `scannerdefinitions.aiEnabled`, vhod sestavi iz naslova, vira, cene, URL-ja
in `data` (sploščeno v lastnosti). Tip z lastno shrambo mora podati `candidates` in `store`;
sicer analize nima (to pove dnevnik `scanner.ai.unsupported` enkrat na zagon).

## §11 — Navodilo modelu

Sistemsko navodilo (v kodi, slovensko): oceni rezultat kot previden kupec; povzetek v enem
stavku; tveganja/pomanjkljivosti/priložnosti kot kratke alineje; `attributes` poenoti ključe
(`snake_case`, angleško) in vrednosti; **NE izmišljaj cen, stroškov popravil, tržnih vrednosti
ali dobičkov** — če jih vhod ne vsebuje, jih ne navajaj; kadar je podatkov premalo, `riskLevel:
'unknown'` in `confidence: 'low'`. Uporabniški del je vhod kot JSON.

## §12 — Okolje

| spremenljivka | privzeto | vloga |
|---|---|---|
| `OPENAI_API_KEY` | *(prazno = ni na voljo)* | ključ; samo na strežniku |
| `OPENAI_MODEL` | `gpt-6.1-sol` | model |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | osnova (nastavljiva za združljive strežnike) |
| `OPENAI_TIMEOUT_MS` | `30000` | ena zahteva |
| `SCANNER_AI_MAX_ITEMS_PER_RUN` | `25` | klici na zagon |
| `SCANNER_AI_DAILY_REQUEST_LIMIT` | `300` | klici na dan na namestitev |
| `SCANNER_AI_CACHE_DAYS` | `30` | TTL predpomnilnika analiz |
| `SCANNER_AI_IMAGES` | `false` | pošiljanje slik |
| `SCANNER_AI_MAX_INPUT_CHARS` | `6000` | odrez vhoda |
