# Dodajanje novega tipa skenerja

Člen I ustave velja tudi tu: tip skenerja je samostojna mapa, jedro (`apps/api/src/platform/scanner/`)
o njem ne ve ničesar, dokler ga `main.ts` ne registrira. Odstranitev tipa je brisanje mape na
obeh straneh in dveh vrstic. Delujoča predloga je testni tip **echo**
(`apps/api/src/modules/echo-scanner/`, `apps/web/src/app/features/echo-scanner/`); produkcijski
zgled z lastno shrambo in deljenjem so **leti** (`apps/api/src/modules/flight-deals/scanner/`).
Arhitektura jedra je v [`scanner-engine.md`](scanner-engine.md).

## 1. Odloči dvoje, preden napišeš prvo vrstico

| vprašanje | `batch` | `single` |
|---|---|---|
| Kdo določa urnik? | administrator, za cel tip (`ScannerTypeSettings`) | lastnik, za vsak skener (`ScannerDefinition.schedule`) |
| Koliko zagonov? | eden za VSE skenerje tipa (vir se vpraša enkrat za vse uporabnike) | eden na skener |
| Kdaj izbrati | vir je skupen in omejen, rezultati so deljeni (leti) | vsak skener je svoj svet (avti po lastnih kriterijih, slike, domene) |

| vprašanje | `generic` | `custom` |
|---|---|---|
| Kje so rezultati? | `scannerresults` + `scannerresulthistories` v jedru | lastne zbirke tipa |
| Kaj moraš napisati? | nič — `ctx.results.reconcile(items)` | `resultReader` (list, count, get) in lastno zaznavo sprememb |
| Kdaj izbrati | rezultat pripada enemu skenerju | rezultat je skupen več skenerjem/uporabnikom (ponudba leta) |

Večina novih tipov je `single` + `generic`. Ta dokument opisuje to pot; odstopanja za `batch`
in `custom` so označena.

## 2. Mapa modula na zaledju

```
apps/api/src/modules/<ime>/
├── scanner-type.ts     ScannerType<TConfig, TVerified> + registracija
├── index.ts            register<Ime>ScannerType()
├── scenario.ts ali adapters/…   zajem iz vira (glej §3)
└── notifications.ts    verify + render dopisa
```

Ime je angleško, kebab-case (`car-scanner`, `image-scanner`). Tip brez zavihka (kot echo) nima
`router.ts`; tip z lastnimi stranmi ga ima, kot vsak modul (glej `adding-a-tab.md`).

## 3. `ScannerType` — kaj mora tip povedati jedru

Vmesnik je v `apps/api/src/platform/scanner/types.ts`. Minimalen `single` + `generic` tip:

```ts
export const carScannerType: ScannerType<CarConfig, CarItem> = {
  type: 'cars',                 // oznaka: angleško, kebab-case
  label: 'Avti',                // slovensko ime za vmesnik
  icon: 'car-outline',          // registrirana ikona (apps/web/src/app/core/icons/register-icons.ts)
  description: 'Rabljeni avtomobili po tvojih kriterijih.',
  execution: 'single',
  results: 'generic',
  allowedResultHosts: ['mobile.de'],   // povezave rezultatov samo s teh gostiteljev; prazno = brez povezav
  isEnabled: (env) => Boolean(env.CARS_API_KEY),   // vklop je stvar namestitve (okolje), nikoli baze
  configSchema: carConfigSchema,       // Zod: OBLIKA nastavitev; sporočila slovenska
  validateConfig: (c) => (c.maxPrice < c.minPrice ? 'Najvišja cena mora biti vsaj enaka najnižji.' : null),
  describeConfig: (c) => `${c.make} do ${c.maxPrice} €`,
  execute: executeCars,
  notifications: { verify: verifyCarItems, render: renderCarDigest },
};
```

- **`configSchema`** preverja obliko ob vsakem pisanju (`POST`/`PATCH /scanners`); jedro vanj
  nikoli ne gleda. Dovoljen je samo JSON — nič izvršljivega (FR-005).
- **`scopes`** izpusti, kadar zadoščata skupna `scanners:read`/`scanners:write`. Tip s svojimi
  obsegi jih poda tu IN jih prepiše v `platform/keycloak/role-mapping.ts` (`BASE_USER_SCOPES`).
- **`defaultSchedule`** velja samo za `batch` (privzeto `daily-06-18`).
- **`definitions`** poda samo tip, ki definicije hrani SAM (leti): `listForUser`, `findForUser`,
  `countAll` — jedro potem zanj ne piše v `scannerdefinitions`; `createRoute` pove čarovniku, kam
  naj preusmeri.
- **`admin.extras(env)`** je neobvezen dodatek za administracijo (leti: stanje virov) — brez
  skrivnosti.

## 4. `execute` — zajem, normalizacija, shramba

```ts
export async function executeCars(ctx: ExecutionContext<CarConfig>): Promise<ExecutionOutcome> {
  const { definition, results } = ctx;            // pri single sta vedno prisotna
  if (!definition || !results) return failed('no-definition');

  const raw = await fetchFromSource(definition.config, ctx.env);   // adapter, glej §5
  await ctx.heartbeat();                                           // med dolgim delom, da zagon ni "interrupted"
  if (await ctx.shouldCancel()) return cancelled();

  const items: NormalizedResult[] = raw.map((r) => ({
    identity: `${r.source}:${r.id}`,     // stabilna identiteta — jedro jo hashira v identityKey
    source: r.source,
    externalId: r.id,
    title: r.title,
    url: r.url,                           // obdrži se samo, če je gostitelj v allowedResultHosts
    price: r.price ? { amount: r.price, currency: 'EUR' } : null,   // cena NI obvezna
    data: r,                              // podatki po kategoriji — oblika last tipa
    comparable: { mileage: r.mileage },   // kaj šteje za spremembo, kadar cene ni
  }));

  const { events, counters } = await results.reconcile(items, { sourceSucceeded: raw.ok });
  return {
    status: raw.ok ? 'succeeded' : 'partial',
    counters,                              // jedro doda definitions in notifications*
    definitions: [{ definitionId: definition.id, ownerId: definition.userId, outcome: 'ok', message: null }],
    events,                                // iz njih jedro sestavi dopise
    errors: [],
  };
}
```

Vrstni red v jedru je determinističen in dokumentiran (`scanner-engine.md` §Cevovod): upsert po
identiteti → zgodovina → `UNAVAILABLE` (samo pri `sourceSucceeded: true`) → dogodki. Tip torej
**ne** piše v `scannerresults` sam in ne odloča, kaj je novo — to je `reconcile`.

Pri **`batch`** tipu `ctx.definition` ni; tip naloži svoje definicije sam, obdela VSE v enem
zagonu in za vsako vrne vrstico v `definitions[]` (`ok` / `failed` z razlogom) — napaka enega
skenerja ne sme podreti ostalih (FR-017). Pri **`custom`** shrambi tip v `execute` piše v lastne
zbirke in vrne `events` z `resultRef` = id lastnega zapisa. Glej
`modules/flight-deals/scanner/execute.ts`.

Deterministični scenariji (testi) dobijo `ctx.previousRunCount` — koliko zagonov tega obsega se je
že končalo; echo z njim ve, v katerem "koraku" je. Testi lahko podajo `ctx.typeOptions` (npr.
ničelne zamike ponovitev); produkcijski tik poda `undefined`.

## 5. Adapter do vira

Jedro NE kliče virov (FR-004). Adapter je last tipa in gre skozi `platform/cache/getOrRefresh`
(člen VIII: TTL, zadnja znana vsebina ob napaki) ter lasten semafor/premor, kadar vir to zahteva.
Vzorec, ki ga je vredno kopirati: `modules/flight-deals/providers/types.ts` (vir vrne OPIS
zahteve, prenese pa runner; razčlenitev je čista funkcija) in
`modules/flight-deals/services/provider-runner.service.ts` (ponovitve ob 5xx, `429` brez
ponovitve, dnevna meja zagonov).

Žeton vira je v GLAVI zahteve, nikoli v URL-ju (pristane v `ExternalCache.sourceUrl` in v
dnevniku). Vklop vira je spremenljivka okolja s privzetkom (`docs/env-reference.md`), ne polje v
nastavitvah skenerja.

## 6. Korak obdelave (procesor)

Jedro ima vgrajene korake: normalizacija identitete, dedup, zaznava sprememb (cena prek
`platform/scanner/domain/price-change.ts`, sicer hash `comparable`), zgodovina, nedosegljivost.
Dodaten korak (ocena, filtriranje, obogatitev) je **funkcija v tipu**, ki teče PRED
`reconcile` nad `NormalizedResult[]` — čista, testabilna brez baze (člen IX). Tip ne sme
uporabniku dovoliti kode (FR-005): korak se nastavi z vrednostmi iz `config`, ki jih preveri
`configSchema`.

## 7. Dopis — `notifications.verify` in `render`

Jedro sestavi en zbirni dopis na prejemnika na zagon iz `events` (dedup po `resultRef`, močnejša
vrsta spremembe) in ga pošlje prek skupnega outboxa s ponovitvami. Tip prispeva dvoje:

- `verify(items, recipientUserId, now)` — pred pošiljanjem ZNOVA preveri vsako postavko in vrne
  samo tiste, ki še držijo, v obliki za `render`. Pri generični shrambi je lahko identiteta
  (`echo-scanner/notifications.ts`); pri lastni shrambi preveri, da rezultat še obstaja in
  ustreza (`flight-deals/scanner/notifications.ts`).
- `render(items, ctx)` → `{ subject, html, text }`. Zadeva prek `emailSubject(appName, 'Skenerji', …)`
  ali z lastnim modulom v oklepaju. Slogi inline (poštni odjemalci), brez e-naslovov drugih
  prejemnikov v telesu.

`event.recipients` določi TIP: pri generičnih definicijah lastnik (to `reconcile` naredi sam);
tip z deljenjem doda prejemnike (leti: `recipients.notify`).

## 8. Registracija na zaledju

```ts
// apps/api/src/modules/<ime>/index.ts
export function registerCarScannerType(): void {
  registerScannerType(carScannerType);
}
```

in ENA vrstica v `apps/api/src/main.ts` poleg `registerFlightScannerType()` in
`registerEchoScannerType()`. Ponovna registracija istega tipa vnos zamenja (testi).

Testni tip, ki v produkciji ne sme obstajati, dodaj v `superRefine` v `platform/config/env.ts`
(kot `SCANNER_ECHO_ENABLED`).

## 9. Odjemalec

```
apps/web/src/app/features/<ime>/
├── <ime>-config.component.ts   obrazec nastavitev (2. korak čarovnika) — izpolni ScannerConfigForm
├── <ime>-results.component.ts  (neobvezno) lasten prikaz rezultatov — izpolni ScannerResultsView
└── scanner-ui.ts               register<Ime>ScannerUi()
```

```ts
// scanner-ui.ts
export function registerCarScannerUi(): void {
  registerScannerUi({
    type: 'cars',
    configComponent: () => import('./car-config.component.js').then((m) => m.CarConfigComponent),
    resultsComponent: () => import('./car-results.component.js').then((m) => m.CarResultsComponent),
  });
}
```

in ENA vrstica v `apps/web/src/main.ts`. Pogodbi sta v `core/scanners/scanner-config-form.ts`
(`initial`, `config`, `validate()`) in `core/scanners/scanner-results-view.ts` (`scannerId`,
`results`). Komponente se nalagajo lazy (`import()`), zato tip ne pride v začetni paket. Brez
`resultsComponent` se uporabi privzeti seznam (`features/scanners/result-list.component.ts`);
brez `configComponent` čarovnik pove, da tip nima obrazca.

Ikone registriraj v `core/icons/register-icons.ts` in jih dodaj v `tests/unit/icons.spec.ts`;
ime tipa pride s strežnika, zato prevajalnik ikone ne preveri.

Tip z lastnimi definicijami (leti) poda namesto obrazca `createRoute` (čarovnik preusmeri) in
po želji `adminExtrasComponent` (dodatek v administraciji z vhodom `extras`).

## 10. Urnik

Prednastavitve so skupne (`platform/scanner/domain/schedule-slots.ts`: vsako uro, vsak dan ob
6:00, ob 6:00 in 18:00, vsakih 6 ur, vsak ponedeljek ob 8:00, po meri) in jih ni treba podvajati.
`single` tip ne nastavlja nič — urnik je na skenerju. `batch` tip poda `defaultSchedule`; urnik
spreminja administrator pod *Skenerji → Administracija*. Sprememba velja ob naslednjem tiku brez
restarta; dohiti se samo zadnji zamujeni termin.

## 11. Obsegi in zavihek

Tip brez lastnih obsegov uporablja `scanners:read`/`scanners:write`. Tip z lastnimi obsegi jih
poda v `scopes` in prepiše v `BASE_USER_SCOPES`. Tip z lastnim zavihkom gre po
`adding-a-tab.md` (vnos v `TAB_REGISTRY`, `router.ts`, pot v `app.routes.ts`).

## 12. Testi, ki jih tip MORA imeti

| kaj | kje | zgled |
|---|---|---|
| čiste funkcije: scenarij/normalizacija, `configSchema`, `validateConfig`, `describeConfig` | `tests/unit/<ime>/` | `tests/unit/echo-scanner/scenario.spec.ts` |
| od konca do konca: ustvari prek API-ja, tiki ob terminih, rezultati, zgodovina, dopisi | `tests/integration/<ime>/` | `tests/integration/scanner/echo-scenario.spec.ts` |
| odstranitev: brez registracije tip izgine, jedro teče naprej | `tests/integration/<ime>/removal.spec.ts` | `tests/integration/echo-scanner/removal.spec.ts` |
| adapter z mockanim `fetch` | `tests/integration/<ime>/` | `tests/integration/flight-deals/provider-runs.spec.ts` |

Jedro ima svoje teste (`tests/*/scanner/`) z MOCK tipi — spremembe jedra zaradi novega tipa
niso pričakovane; če so potrebne, je to znak, da tip poskuša nekaj, česar vmesnik ne predvideva,
in sodi v razpravo o jedru, ne v tip.

## 13. Odstranitev

Izbriši mapo modula na obeh straneh, vrstico `register<Ime>ScannerType()` v `main.ts` in vrstico
`register<Ime>ScannerUi()` v `apps/web/src/main.ts`. Obstoječi skenerji tipa ostanejo v bazi z
oznako "tip ni na voljo", se ne izvajajo in jih lastnik lahko izbriše. `npm run typecheck`,
`npm run lint` in testi morajo po tem ostati čisti.

## Zgled z zunanjimi viri: LEGO (018)

Tip `lego` (`modules/lego-scanner/`) je prvi produkcijski `single` + `generic` tip z več zunanjimi viri:
viri po vzorcu Leti (`sources/`: opis zahteve, čista razčlenitev, skupni predpomnilnik, dnevna meja),
čista domena (`domain/`), lastni dogodki obvestil (`events.ts`) in lasten prikaz rezultatov na odjemalcu.
Glej [`lego-scanner.md`](lego-scanner.md).

## Analiza z umetno inteligenco (017) — kaj mora tip povedati

Nič, kadar ima tip **generično shrambo**: jedro iz naslova, vira, cene, povezave in `data`
(sploščeno v lastnosti; `data.description` kot opis, `data.images` kot slike) sestavi vhod in
analizo shrani na `ScannerResult.aiAnalysis`. Tip lahko vhod obogati:

```ts
ai: {
  subject: 'rabljen avtomobil',                       // za navodilo modelu
  describe: (result) => ({                            // neobvezno: lasten vhod iz ResultView
    title: result.title,
    description: (result.data as CarData).description,
    price: result.price,
    attributes: { year: (result.data as CarData).year, mileage_km: (result.data as CarData).km },
    images: (result.data as CarData).photos,          // samo https; gredo naprej ob SCANNER_AI_IMAGES=true
  }),
},
```

Tip z **lastno shrambo** (leti) poda `candidates(ctx)` (kateri rezultati so kandidati: novi ali
spremenjeni v tem zagonu ali brez analize, z `previousInputHash` obstoječe analize) in
`store(ref, analysis)` (kam se shrani; `false`, kadar rezultata ni več). Zgled:
`apps/api/src/modules/flight-deals/scanner/ai.ts`. V vhod NIKOLI ne dajaj imen, e-naslovov ali
identifikatorjev oseb (FR-003); jedro vse ostalo (hash, predpomnilnik, meje, napake) uredi samo.
