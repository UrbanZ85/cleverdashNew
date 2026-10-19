# Feature Specification: Analiza rezultatov z umetno inteligenco (AI procesor skenerjev)

**Feature Branch**: `016-scanner-engine` (nadaljevanje; naloga lastnika z dne 19. 10. 2026)
**Created**: 2026-10-19
**Status**: Draft
**Input**: "Add OpenAI AI Analysis Processor to Universal Scanner — generični, večkrat uporabljiv
procesor, ki rezultate skenerja (po obstoječih filtrih) analizira z OpenAI modelom SOL prek
strukturiranih izhodov; vklop je na ravni posameznega iskanja ('Enable AI Analysis', privzeto
izklopljen); analiza se shrani in prikaže v obstoječem vmesniku rezultatov; napaka UI nikoli ne
prekine skenerja; ključ API-ja nikoli v odjemalec ali git; brez izmišljenih cen, stroškov popravil
ali zajamčenih dobičkov; brez ločene aplikacije, urnika ali sistema obvestil."

## Zakaj

Skener (016) pove, KAJ se je pojavilo in KAJ se je spremenilo. Ne pove pa, ali je ponudba vredna
pozornosti: ali ima opis rabljenega avta skrite pasti, ali je let z neuradnega vira brez prtljage
res ugoden, ali je "nov" rezultat samo stara stvar z drugim naslovom. Oseba to danes ugotavlja
sama, za vsak rezultat posebej. Jezikovni model zna iz opisa in lastnosti izluščiti tveganja,
pomanjkljivosti in priložnosti, poenotiti lastnosti ("1.9 TDI", "1,9 tdi" → `motor: 1.9 TDI`) in
to povedati v dveh stavkih — kar je natanko tisto, kar oseba ob pregledu seznama rabi.

Analiza je **dodatek**, ne pogoj: skener brez nje deluje enako kot do zdaj, vklopi jo lastnik za
posamezno iskanje, strošek je omejen in viden, izid pa je vedno označen kot ocena modela, nikoli
kot dejstvo. Model ne sme izmišljati številk: cene, stroški in dobički ostanejo deterministični
izračuni aplikacije (člen XII, "pokvarjen sistem pove").

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Vklop analize pri enem iskanju (Priority: P1)

Lastnik iskanja (generičnega skenerja ali iskanja letov) v obrazcu vklopi "Analiza z umetno
inteligenco". Ob naslednjem zagonu dobi vsak nov ali spremenjen rezultat tega iskanja kratko
analizo: povzetek, stopnjo tveganja, razlago, tveganja, pomanjkljivosti, priložnosti in poenotene
lastnosti. Rezultati drugih iskanj (brez vklopa) analize ne dobijo.

**Why this priority**: brez tega ni funkcionalnosti; vse ostalo so omejitve in varovala.

**Independent Test**: testni tip `echo` z vklopljeno analizo in ponarejenim odjemalcem OpenAI:
po zagonu imajo rezultati `aiAnalysis`; isti tip brez vklopa je brez analize.

**Acceptance Scenarios**:

1. **Given** skener z `aiEnabled: true` in nastavljen ključ, **When** zagon prinese nove rezultate,
   **Then** ima vsak nov rezultat `aiAnalysis` z `model`, `analyzedAt`, `riskLevel`, `summary`.
2. **Given** skener z `aiEnabled: false` (privzeto), **When** zagon teče, **Then** se OpenAI ne
   kliče in rezultati nimajo analize.
3. **Given** iskanje letov z vklopljeno analizo, **When** zagon najde novo ujemanje, **Then** ima
   ponudba analizo, ki jo vidita stran s podrobnostmi ponudbe in tabela ponudb.
4. **Given** iskanje, ki je bilo vklopljeno, pa je lastnik analizo izklopil, **When** teče nov
   zagon, **Then** obstoječe analize OSTANEJO vidne, nove pa ne nastajajo.

### User Story 2 — Analiza nikoli ne prekine skenerja (Priority: P1)

Napaka pri klicu modela (omrežje, 429, neveljaven odgovor, zavrnitev, časovna omejitev,
izčrpana dnevna meja, manjkajoč ključ) ne spremeni izida zagona, ne izgubi rezultatov in ne
zadrži dopisov. Zagon samo zabeleži, koliko rezultatov je bilo analiziranih, koliko iz
predpomnilnika, koliko preskočenih in koliko neuspelih.

**Why this priority**: analiza je neobvezen dodatek; če bi lahko podrla zagon, bi bila nevarnejša
kot koristna.

**Independent Test**: ponarejen odjemalec, ki vrže izjemo ali vrne neveljaven JSON; zagon je
`succeeded`, rezultati shranjeni, dopisi sestavljeni, `counters.aiFailed > 0`.

**Acceptance Scenarios**:

1. **Given** odjemalec vrže napako, **When** zagon teče, **Then** je stanje zagona enako, kot bi
   bilo brez analize; `counters.aiFailed` šteje neuspehe; `runErrors` nosi kodo `ai:*`.
2. **Given** `OPENAI_API_KEY` ni nastavljen, **When** zagon teče z vklopljeno analizo, **Then** se
   nič ne kliče, vmesnik pa ob stikalu pove, da analiza v tej namestitvi ni na voljo.
3. **Given** model vrne odgovor, ki ne ustreza shemi (manjkajoče polje, nedovoljena vrednost),
   **Then** se analiza zavrže kot neuspela, ne shrani delno.

### User Story 3 — Stroški so omejeni in predvidljivi (Priority: P2)

Isti rezultat se ne analizira dvakrat, dokler se njegov vhod ne spremeni; isti vhod pri dveh
iskanjih dobi en klic; število klicev na zagon in na dan je omejeno; po izčrpani meji se
preostali rezultati preskočijo (ne spodletijo) in pridejo na vrsto ob naslednjem zagonu.

**Why this priority**: plačljiv vir; brez meje bi en nov skener z 200 rezultati stal več kot vsi
ostali skupaj.

**Independent Test**: dva skenerja z istim vhodom → en klic; drugi zagon brez sprememb → nič
klicev; meja 2 na zagon s 5 kandidati → 2 klica, 3 preskočeni.

**Acceptance Scenarios**:

1. **Given** rezultat z analizo in nespremenjenim vhodom, **When** teče nov zagon, **Then** klica ni.
2. **Given** dva skenerja z istim rezultatom (isti vhod), **Then** je klic en, druga analiza pride
   iz predpomnilnika (`cached: true`).
3. **Given** `SCANNER_AI_MAX_ITEMS_PER_RUN=2` in 5 kandidatov, **Then** 2 klica, 3 preskočeni
   (`counters.aiSkipped`), nobena napaka.
4. **Given** dnevna meja dosežena, **Then** kandidati se preskočijo z razlogom `daily-limit`.

### User Story 4 — Nov tip skenerja dobi analizo brez dela (Priority: P3)

Tip z generično shrambo rezultatov (`results: 'generic'`) dobi analizo samodejno: jedro iz
naslova, cene, vira in podatkov sestavi vhod. Tip lahko vhod obogati (opis, slike) z eno funkcijo.
Tip z lastno shrambo (leti) poda dva kavlja: kateri rezultati so kandidati in kam se analiza
shrani.

**Independent Test**: mock tip brez `ai` kavljev v integracijskem testu dobi analize; tip
`flights` jih dobi prek svojih kavljev.

### Edge Cases

- Model vrne `refusal` → neuspeh z razlogom `refusal`, brez shranjevanja.
- Odgovor `incomplete` (max_output_tokens) → neuspeh `incomplete`.
- Rezultat je medtem postal `unavailable` ali definicija izbrisana → analiza se ne shrani (ni
  napaka).
- Vhod je daljši od meje → se odreže na dokumentirano dolžino (podatki po kategoriji prvi), hash
  se računa nad odrezanim vhodom.
- Slike: samo `https` naslovi, največ 3, in samo kadar je `SCANNER_AI_IMAGES=true`; sicer se
  izpustijo in analiza je samo besedilna.
- Preklic zagona med analizo → analiza se ustavi, že shranjene ostanejo.

## Requirements *(mandatory)*

### Konfiguracija in varnost

- **FR-001**: Zaledje bere `OPENAI_API_KEY` (prazno = analiza ni na voljo), `OPENAI_MODEL`
  (privzeto `gpt-6.1-sol`), `OPENAI_BASE_URL`, `OPENAI_TIMEOUT_MS` ter meje `SCANNER_AI_*`.
  Ključ nikoli ne pride v odgovor API-ja, dnevnik, `extras` zagona ali odjemalca.
- **FR-002**: `GET /scanners/types` vrne `ai.available` (ali je ključ nastavljen), da obrazec
  pove, ali bo stikalo imelo učinek. `GET /flight-deals/searches` isto pove v `limits.aiAvailable`.
- **FR-003**: Vsebina, poslana modelu, je SAMO tisto, kar tip označi kot vhod (naslov, opis,
  lastnosti, cena, vir, do 3 slike). Osebni podatki uporabnikov (imena, e-naslovi, id-ji) se ne
  pošiljajo.

### Vklop

- **FR-004**: `ScannerDefinition.aiEnabled` in `FlightSearchRule.aiEnabled` sta `boolean`,
  privzeto `false`; vnos `POST/PATCH /scanners` in `POST/PATCH /flight-deals/searches` ju
  sprejme; odgovor ju vrne.
- **FR-005**: Obrazec skenerja (3. korak čarovnika) in obrazec iskanja letov imata stikalo
  "Analiza z umetno inteligenco", privzeto izklopljeno, s pojasnilom, kadar analiza v namestitvi
  ni na voljo.

### Izvajanje

- **FR-006**: Analiza teče v jedru skenerjev kot korak zagona PO izvajanju tipa (in po obstoječih
  filtrih tipa) in PRED zaključkom zagona; dopisi se sestavijo neodvisno od nje.
- **FR-007**: Kandidati so rezultati skenerjev z vklopljeno analizo, ki so (a) v tem zagonu novi
  ali spremenjeni, ali (b) še brez analize. Nedosegljivi niso kandidati.
- **FR-008**: Rezultat z obstoječo analizo in enakim `inputHash` se ne analizira znova.
- **FR-009**: Odgovor je strukturiran izhod (JSON schema, `strict`) z obliko `AiAnalysis` v1:
  `summary`, `riskLevel` (`low|medium|high|unknown`), `explanation`, `risks[]`, `defects[]`,
  `opportunities[]`, `attributes{}` (poenotene lastnosti), `confidence` (`low|medium|high`).
  Shema NIMA številskih polj za cene, stroške ali dobičke; navodilo modelu to izrecno prepove.
- **FR-010**: Shranjena analiza nosi `version`, `model`, `analyzedAt`, `inputHash`, `cached`.
- **FR-011**: Napaka analize enega rezultata ne vpliva na druge rezultate in ne na izid zagona;
  zagon šteje `aiAnalyzed`, `aiCached`, `aiSkipped`, `aiFailed`.
- **FR-012**: Največ `SCANNER_AI_MAX_ITEMS_PER_RUN` klicev na zagon in
  `SCANNER_AI_DAILY_REQUEST_LIMIT` na koledarski dan (Europe/Ljubljana) na namestitev;
  presežek se preskoči.
- **FR-013**: Predpomnilnik analiz po `inputHash` (model + različica sheme + vhod) s TTL
  `SCANNER_AI_CACHE_DAYS`; zadetek ne kliče modela.
- **FR-014**: Klic ima časovno omejitev; `429`/`5xx` se enkrat ponovi po kratkem premoru.
- **FR-015**: Izklop analize NE briše obstoječih analiz.

### Prikaz

- **FR-016**: `Result.aiAnalysis` (016) in `Offer.aiAnalysis` (015) sta v odgovorih; `null` brez
  analize.
- **FR-017**: Privzeti seznam rezultatov in podrobnosti rezultata, tabela ponudb letov, kartica
  in podrobnosti ponudbe pokažejo analizo SAMO, kadar obstaja: značka tveganja v seznamu,
  celotna analiza v podrobnostih, z oznako modela in časa.

### Tipi

- **FR-018**: `ScannerType.ai` je neobvezen: `describe(result)` (generična shramba, obogatitev
  vhoda), `candidates(ctx)` + `store(ref, analysis)` (lastna shramba). Jedro ima privzeto
  izvedbo za generično shrambo.
- **FR-019**: Jedro ne pozna nobenega tipa po imenu (meja iz 016 ostane).

## Out of Scope

- Analiza v dopisih (e-pošta ostane nespremenjena).
- Pogovor z modelom, ročno sproženje analize za en rezultat.
- Uporaba modela za filtriranje/razvrščanje rezultatov.
- Drugi ponudniki modelov (naslov je nastavljiv, protokol je OpenAI Responses).

## Success Criteria *(mandatory)*

- **SC-001**: Vsi obstoječi testi 015 in 016 ostanejo zeleni brez sprememb pričakovanj.
- **SC-002**: Z izklopljeno analizo (privzeto) zagon ne pošlje nobene zahteve na OpenAI.
- **SC-003**: Ponarejen odjemalec, ki vedno spodleti, ne spremeni stanja zagona ali števila
  rezultatov in dopisov.
- **SC-004**: Drugi zagon brez sprememb vhoda ne naredi nobenega klica.
- **SC-005**: Jedro `platform/scanner/` ne uvaža iz `modules/` (test meje ostane zelen).
- **SC-006**: Ključ se ne pojavi v nobenem odgovoru API-ja ali v generiranih tipih odjemalca.

## Assumptions

- Model `gpt-6.1-sol` (OpenAI, Responses API, Structured Outputs, vhod slik) je na voljo; ime je
  nastavljivo.
- Analiza je v slovenščini; identifikatorji angleško.
- Ena namestitev = en ključ; strošek deli lastnik namestitve, meje so globalne.
