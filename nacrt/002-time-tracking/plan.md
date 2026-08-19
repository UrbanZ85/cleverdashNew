# 002 — Tehnični načrt

Bere se skupaj z `research.md`, `data-model.md`, `contracts/openapi.yaml`,
`quickstart.md` in `docs/legacy-engine.md`.

Poglavje **A** je skupna arhitektura in velja tudi za funkcionalnosti 001 in 003.
Poglavja **B** naprej so specifična za beleženje časa.

---

# A. Skupna arhitektura

## A.1 Stack

| Plast | Izbira | Opomba |
|---|---|---|
| Mobilno / web | Ionic 8 + Angular 20, standalone komponente, signali | stari projekt je Angular 17 z moduli; nov naj ne podeduje `NgModule` pristopa |
| Nativno | Capacitor 7, Android | iOS ni v obsegu, a naj ga struktura ne izključuje |
| Backend | Node.js 22 LTS, TypeScript 5.x `strict`, Express 5 | Express, ker je znan iz starega projekta; Fastify bi bil hitrejši, a to tu ni ozko grlo |
| Baza | MongoDB 7 + Mongoose 8 | stari projekt uporablja Mongo 4.4.6, kar je zunaj podpore |
| Brskalnik | Puppeteer (zadnja stabilna) + sistemski Chromium | glej `research.md` §2 |
| Obvestila | Firebase Cloud Messaging prek `firebase-admin` | poverilnice kot montirana datoteka |
| Časi | `Temporal` prek `temporal-polyfill` ali Luxon | glej `research.md` §4 |
| Validacija | Zod na robu, izpeljani TypeScript tipi | ena definicija za validacijo in tipe |
| Dnevniki | Pino, strukturirano JSON, z ID-jem korelacije | stari projekt uporablja Winston z rotacijo datotek; JSON v stdout je za Docker primernejši |
| Testi | Vitest za enote, Supertest za API, Playwright za en osnovni E2E tok | |
| Postavitev | Docker Compose na VPS, Caddy kot reverse proxy | Caddy zaradi samodejnega TLS |

## A.2 Monorepo

```
cleverdash/
├─ apps/
│  ├─ api/                    Node + Express + Mongoose
│  │  └─ src/
│  │     ├─ modules/          en imenik na zavihek
│  │     │  ├─ auth/
│  │     │  ├─ dashboard/     vreme, radar (001)
│  │     │  ├─ cameras/       (003)
│  │     │  └─ time-tracking/ (002)
│  │     ├─ platform/         skupno: obvestila, predpomnilnik, dnevniki,
│  │     │                    idempotentnost, zdravje, API ključi, webhooki
│  │     └─ main.ts
│  └─ web/                    Ionic + Angular
│     └─ src/app/
│        ├─ core/             auth, interceptorji, registar zavihkov
│        ├─ features/
│        │  ├─ dashboard/
│        │  ├─ cameras/
│        │  └─ time-tracking/
│        └─ shared/
├─ packages/
│  └─ contracts/              deljeni tipi in Zod sheme, generirani iz OpenAPI
├─ infra/
│  ├─ docker-compose.yml
│  ├─ docker-compose.dev.yml
│  ├─ Caddyfile
│  └─ mongo-init/
└─ specs/
```

Modul zavihka je v `apps/api/src/modules/<ime>` in `apps/web/src/app/features/<ime>`.
Moduli se ne uvažajo med sabo — samo iz `platform/` oz. `core/`. Ustava, člen I.

## A.3 Usmerjanje — enotni izvor

Vse na eni domeni. Caddy usmerja:

```
app.si {
    handle /api/* {
        reverse_proxy api:3000
    }
    handle {
        root * /srv/www
        try_files {path} /index.html      # SPA fallback
        file_server
    }
}
```

Posledice, ki jih je treba spoštovati v kodi:

- Frontend uporablja **relativne** naslove: `/api/v1/...`. V `environment.ts` ni gostitelja.
- CORS ni potreben in ni konfiguriran. Če se pojavi potreba po `cors()`, je to znak, da je
  nekaj narobe z usmerjanjem.
- V razvoju enako obliko doseže Angular dev-server proxy (`proxy.conf.json`), ki `/api`
  pošlje na `localhost:3000`. Frontend torej ne ve, ali teče v razvoju ali produkciji.
- **Android aplikacija je izjema.** Nativni build nima izvora, zato mora imeti nastavljivo
  osnovo (`https://app.si`) in ji `/api/v1/...` pripne. To je edino mesto v celotni
  aplikaciji, ki pozna absolutni naslov.

Primer preslikave: `https://app.si/api/pregled_zgodovine_urnikov` iz zahteve ustreza
`GET https://app.si/api/v1/time-tracking/history`. Poti so v angleščini, kebab-case in
verzionirane (`/api/v1`), ker jih bo brala tudi OpenAPI pogodba in generirani odjemalci.
[NEEDS CLARIFICATION: ali želiš slovenska imena poti, kot v primeru? Predlog: obdrži
angleške in verzionirane, ker so v pogodbi in generiranih tipih.]

## A.4 Avtentikacija

| Odjemalec | Način |
|---|---|
| Web in Android | kratkoživ dostopni JWT (15 min) + rotirajoč refresh token v bazi |
| n8n in avtomatizacije | `X-API-Key`, zgoščen v bazi, z obsegi |

Refresh tokeni se ob uporabi zavrtijo in ob zaznanem ponovnem uporabi celotne družine
prekličejo. Stari projekt ima za to model, a ga ne uporablja.

Avtorizacija je na podlagi obsegov, ne "če je token veljaven, je admin" — glej
`docs/legacy-engine.md` §4.11.

## A.5 Registar zavihkov

Meni se sestavi iz deklarativnega registra, ne iz trdo napisanega HTML-ja:

```ts
interface TabDefinition {
  id: string;
  title: string;          // slovensko
  icon: string;
  route: string;
  order: number;
  requiredScopes?: string[];
  enabled: boolean;       // iz nastavitev, da se zavihek ugasne brez builda
}
```

Dodajanje zavihka je dodajanje vnosa in mape. Stari projekt ima meni prekopiran v vsak
`*.page.html` (`belezenje`, `urnik`, `zgodovina` — trikrat isti blok), zato se sprememba
menija mora narediti na treh mestih.

Načrtovani zavihki: Dashboard, Kamere, Beleženje časa, Nastavitve.
Predvideni pozneje (v starem CleverDashu že obstajajo): Zapiski, Povezave, Zvočni zapiski.

---

# B. Beleženje časa — sestava

## B.1 Plasti

```
┌─────────────────────────────────────────────┐
│ HTTP           kontrolerji, Zod validacija, │
│                obsegi, idempotentnost       │
├─────────────────────────────────────────────┤
│ Aplikacija     ScheduleBuilder              │
│                ActionExecutor               │
│                ReminderService              │
│                CalendarService              │
├─────────────────────────────────────────────┤
│ Domena (čista) stanje ure, prehodi,         │
│                izračun delovnega dne,       │
│                raztros, prednost izjem      │
├─────────────────────────────────────────────┤
│ Infrastruktura ClockPortal (Puppeteer)      │
│                repozitoriji, FCM, webhooki  │
└─────────────────────────────────────────────┘
```

Domenska plast ne uvaža Mongoosa ali Puppeteerja. To je pogoj za člen IX ustave in edini
način, da so mejni primeri (poletni čas, praznik, dopust) sploh testabilni.

## B.2 `ClockPortal` — edini stik z zunanjim svetom

```ts
interface ClockPortal {
  readState(loc: ResolvedLocation): Promise<StateReading>;
  performAction(loc: ResolvedLocation, action: ActionName): Promise<ActionOutcome>;
}
```

Implementacija `PuppeteerClockPortal` naredi natanko to, kar je opisano v
`docs/legacy-engine.md` §1, s popravki iz `research.md` §2. Za teste obstaja
`FakeClockPortal`, ki ga poganja skriptirano zaporedje stanj.

`ResolvedLocation` je lokacija z **že razrešenim** raztrosom koordinat — domena odloči o
številkah, portal jih samo uporabi.

## B.3 Tik scheduleria

Vsakih 30 sekund, zaporedno:

```
1. heartbeat začetek
2. za dneva [danes, jutri]:
     če načrt ne obstaja → CalendarService.resolve(dan) → ScheduleBuilder.build()
3. najdi zapadle akcije: state ∈ {planned, due} ∧ scheduledAt ≤ now
4. za vsako, urejeno po scheduledAt:
     atomarni prehod → running   (če ne uspe, jo obravnava drug tik: preskoči)
     če zamuda > maxDelay        → missed + obvestilo
     če profil OFF               → cancelled
     če način REMIND_ONLY        → ReminderService.check()
     če način AUTO               → ActionExecutor.execute()
5. preveri potek seje (enkrat dnevno)
6. heartbeat konec + zunanji ping
```

Koraka 2 in 4 sta neodvisna: če sestavljanje načrta odpove, se obstoječe akcije še vedno
izvedejo, in obratno.

## B.4 `ActionExecutor`

```
1. readState()
2. če stanje == pričakovano po akciji     → already_done, konec
3. če stanje ∉ dovoljena stanja pred     → failed z razlogom "nepričakovano stanje",
                                            brez klika
4. performAction()
5. reload + readState()
6. če stanje == pričakovano po            → succeeded
   sicer                                  → zabeleži poskus + posnetek zaslona,
                                            razporedi ponovni poskus
7. po izčrpanih poskusih                  → failed + obvestilo + webhook
```

Koraka 2 in 3 sta ključni novosti glede na stari sistem. Preprečita klik, ki bi vpisal
napačno stvar, in odpravita napačne alarme, ko je uporabnik akcijo že opravil sam.

## B.5 `ReminderService`

```
1. readState()
2. če stanje == pričakovano po akciji → succeeded, source: external, brez obvestila
3. sicer, če je poteklo strpno obdobje → obvestilo, števec + 1
4. ko je števec == maxReminders        → missed + webhook, nehaj opozarjati
```

Točka 2 je bistvena: če uporabnik gumb pritisne sam, se opozarjanje ustavi samo od sebe
in akcija se v zgodovini pravilno zapiše kot opravljena zunaj sistema.

## B.6 `CalendarService`

Odločitev za en dan in profil, po fiksni prednosti:

```
forceWorkday za ta dan?      → workday
znotraj obdobja odsotnosti?  → vacation / sick / other
dela prost praznik?          → holiday
dan tedna ni v profilu?      → non-working
                             → workday
```

Rezultat se predpomni v `CalendarDay`, da je odločitev revizijsko sledljiva in ne
izračunana vsakič drugače.

## B.7 Faze izvedbe

Vsaka faza je uporabna sama po sebi. Faza 1 ima že vrednost, tudi če se delo ustavi.

| Faza | Vsebina | Rezultat |
|---|---|---|
| **1** | domenska plast + `FakeClockPortal` + enotski testi | logika urnika, koledarja in stanj dokazano pravilna, brez brskalnika |
| **2** | Mongo modeli, indeksi, repozitoriji, migracija starih profilov | podatki na mestu |
| **3** | `PuppeteerClockPortal` + `readState` + `dry-run` endpoint | preverjeno na živem naslovu, brez klikanja |
| **4** | tik scheduleria, `ActionExecutor`, zgodovina | avtomatski način deluje |
| **5** | FCM obvestila, `ReminderService` | način opozarjanja deluje |
| **6** | REST pogodba, API ključi, idempotentnost, webhooki | n8n uporabno |
| **7** | zasloni: Danes, Urnik, Koledar, Zgodovina, Diagnostika | UI |
| **8** | zdravje, zunanji ping, čiščenje, opozorilo na potek seje | pripravljeno za produkcijo |

Vrstni red ni pogajalski v enem pogledu: **faza 3 pred fazo 4**. Klikanje se ne vklopi,
dokler branje stanja ni dokazano zanesljivo na živi strani.

## B.8 Zasloni

| Zaslon | Vsebina |
|---|---|
| **Danes** | trenutno stanje, načrtovane akcije dneva z izidi, razpoložljive akcije kot gumbi za ročni pritisk, izbira lokacije, opozorilo če je dan dela prost |
| **Urnik** | seznam profilov, urejanje časov in načina, vklop/izklop, gumb za predogled "kaj bo jutri" |
| **Koledar** | mesečni pregled s statusi, vnos dopusta, vsiljen delovni dan, seznam praznikov z možnostjo popravka |
| **Zgodovina** | filtriran seznam, razširljiv do posameznih poskusov s posnetki zaslona |
| **Diagnostika** | zdravstveni podatki, stanje seje z rokom, gumb za takojšen `dry-run` preizkus, zadnji tiki |
| **Nastavitve** | lokacije, sejni piškotek, nastavitve obvestil, API ključi, webhooki |

Zaslon **Danes** je privzeti. Stari sistem ima na tem zaslonu tri stvari hkrati (izbira
lokacije, seznam načrtovanih, gumbi) in jih je smiselno ohraniti skupaj — to je edini
zaslon, ki ga uporabnik odpre med tednom.

## B.9 Migracija iz starega sistema

Enkraten skript, ki teče proti stari bazi:

| Iz | V |
|---|---|
| `schedulers` | `TrackingProfile` + `TrackingLocation` + `RemoteSession` |
| `schedulertimes` | zavrzi — tekoči načrt se sestavi znova |
| `schedulertimeshistories` | `ActionRecord` z `source: legacy` |
| `users` | `User`, gesla se **ne** prenašajo — nastavi se novo |
| `pauseUntil` | `AbsencePeriod` vrste `other`, če je datum v prihodnosti |

Šablone koordinat (`46.0629_6`) se prenesejo kot `coordinateTemplate` z izpeljanim
`jitterMeters`. Vrednost sejnega piškotka se **ne** prenese — vpiše se nova (glej
`docs/SECURITY-FIRST.md`).

Migracija je enosmerna in se izvede po tem, ko nov sistem v `dry-run` načinu vsaj en teden
pravilno napoveduje iste akcije kot stari.

## B.10 Kaj mora biti testirano

Naloga ni končana brez teh testov:

1. prehod na poletni čas — akcija v neobstoječi uri
2. prehod na zimski čas — akcija v podvojeni uri
3. praznik, ki pade na delovni dan profila
4. dopust, ki se razteza preko meje meseca in leta
5. `forceWorkday` na praznik
6. dva profila, ki pokrivata različne dneve istega tedna, oba ustvarita svoj načrt
   (regresija za `docs/legacy-engine.md` §4.3)
7. raztros nikoli ne prestopi nastavljene meje in ne prelije v naslednjo uro
   (regresija za §4.4)
8. klik, ki ne učinkuje, se ponovi in drugi poskus uspe
9. klik, ki nikoli ne učinkuje, konča kot `failed` z obvestilom, nikoli kot `succeeded`
   (regresija za §4.5)
10. stanje je že pravo → `already_done`, brez klika
11. `REMIND_ONLY`: uporabnik opravi akcijo sam med opozorili → opozarjanje se ustavi
12. restart sredi dneva → zapadle akcije se dohitijo, nič se ne izgubi
13. prazen nabor akcij → diagnoza "potekla seja", ne "gumba ni"
14. dvakratni klic z istim `Idempotency-Key` → ena izvedba
