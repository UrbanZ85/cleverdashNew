# Data Model: Zavihek kamer

Vir: `nacrt/003-cameras/spec.md` (Ključne entitete) in `spec.md` (Key Entities), prilagojeno
tako, da izkoristi obstoječo infrastrukturo 001 (`platform/cache`, `domain/freshness.ts`) —
glej [research.md](./research.md) §2–3. MongoDB 7, Mongoose 8, `camelCase` polja, angleške
kolekcije. Vse nove kolekcije imajo `createdAt`/`updatedAt` (`timestamps: true`).

## Pregled

```
Ponovno uporabljeno iz 001, BREZ sprememb sheme:
  ExternalCache (platform/cache) — nosi tudi predpomnjene posnetke kamer (nov ključni
  prostor "camera:{id}:preview"), poleg že obstoječih "radar" in "weather:{location}"

Novo v 003:
  CameraGroup ──< Camera
  CameraEmbedAllowlist (samostojna, brez tuje ključa — glej research.md §6)

Izpeljano, NE shranjeno kot lastna kolekcija:
  "CameraHealth" iz spec.md Key Entities = pogled na ExternalCache zapis camere
  (resolveFreshness() + consecutiveFailures), enako kot za ARSO vreme/radar — glej §3 spodaj.

Nova skupna storitev (brez lastne kolekcije, samo funkcija):
  platform/crypto/secret-box.ts — AES-256-GCM za credentialsEncrypted (research.md §14)
```

Modul `cameras` je lastnik `cameras`, `cameraGroups`, `cameraEmbedAllowlist`. `ExternalCache`
ostaja v `platform/cache`, ker je splošni mehanizem, ki ga 003 samo dodatno uporabi (člen I —
moduli ne podvajajo skupnih storitev, enako utemeljeno kot pri `platform/webhooks` v 002).
`platform/crypto/` je iz istega razloga nov skupen mehanizem, ne del modula `cameras`.

## Načelo lastništva zapisov (podedovano iz 001)

Sistem je enouporabniški (FR-016 iz 001, potrjeno tudi v spec.md FR-038). Nobena kolekcija
spodaj ne nosi `userId`/`ownerId`.

---

## `cameras`

| polje | tip | opomba |
|---|---|---|
| `name` | string | ime kamere (FR-001); ni enolično (spec.md, Edge Cases) |
| `type` | enum: `snapshot`, `mjpeg`, `hls`, `iframe`, `snapshot+iframe` | FR-002 |
| `previewUrl` | string (URL) | naslov za predogled (mreža); pri `iframe` je to naslov vdelave |
| `fullUrl` | string (URL) \| null | naslov za polni prikaz, če se razlikuje od `previewUrl` (FR-003); `null` pomeni "enak kot previewUrl" |
| `refreshIntervalSeconds` | number | privzeto `CAMERA_DEFAULT_REFRESH_SECONDS`, samo za `snapshot`/`snapshot+iframe` — pri `iframe`/`mjpeg`/`hls` se ne uporablja (vir je zvezen) |
| `groupId` | ObjectId → `cameraGroups` \| null | FR-015; `null` = brez skupine |
| `timeOfDay` | enum: `morning`, `afternoon`, `always` | FR-004, privzeto `always` |
| `order` | number | ročni vrstni red znotraj skupine (FR-014, FR-035) |
| `active` | boolean | privzeto `true`; neaktivna kamera se ne prikaže v mreži, a ostane na zaslonu za urejanje (FR-030) |
| `credentialsEncrypted` | string \| null | AES-256-GCM prek `platform/crypto/secret-box.ts` (research.md §14), nikoli vrnjeno prek API-ja (FR-005) — API vrne samo `hasCredentials: boolean`; `null`, če vir ne zahteva poverilnic |
| `sourceTemplate` | enum: `manual`, `arso-webcam` | samo za sledljivost (FR-037); ne vpliva na obnašanje po shranitvi |

Indeksi: `{ groupId: 1, order: 1 }`, `{ active: 1 }`

**Validacija ob dodajanju/urejanju (FR-034)**, izvedena v domenski plasti
(`domain/camera-validation.ts`, testabilna brez baze — člen IX):

1. `previewUrl` in `fullUrl` (če podan) sta veljaven URL.
2. Če je `type` `iframe` ali `snapshot+iframe`: gostitelj naslova, ki se vdela (`previewUrl`
   pri `iframe`, `fullUrl` pri `snapshot+iframe`, če je podan, sicer `previewUrl`), MORA biti
   na efektivnem seznamu dovoljenih (osnovni iz okolja + `cameraEmbedAllowlist`,
   research.md §6).
3. Shema naslova je `https`, RAZEN če je izpolnjen vsaj eden od pogojev za obvezen proxy
   (FR-020): `http`, zahtevane poverilnice (`credentialsEncrypted` ni `null`), ali naslov
   razrešen kot naslov v zasebnem/lokalnem IP razponu.
4. Neizpolnjen pogoj vrne razumljivo napako s katerim poljem in zakaj (uporabljeno v
   zaslonu za urejanje, FR-034) — nikoli generično "napačen vnos".

## `cameraGroups`

| polje | tip | opomba |
|---|---|---|
| `name` | string | npr. "Pot", "Morje", "Doma" (FR-015) |
| `order` | number | vrstni red skupin |
| `collapsed` | boolean | privzeto `false` |

Indeksi: `{ order: 1 }`

## `cameraEmbedAllowlist`

Razširitev osnovnega seznama iz `CAMERA_ALLOWED_EMBED_HOSTS` (research.md §6) — gostitelji,
ki jih je uporabnik izrecno odobril prek zaslona za urejanje.

| polje | tip | opomba |
|---|---|---|
| `host` | string | npr. `example.com`; unikatno |
| `addedReason` | string \| null | prosto besedilo, npr. ime kamere, ob dodajanju katere je bil gostitelj odobren |

Indeksi: `{ host: 1 }` unikatno

## Izpeljano: "zdravje" kamere (FR-011, Story 5)

Za `snapshot`/`snapshot+iframe` kamere se zdravje **ne** shranjuje na `Camera` dokumentu —
izpelje se iz `ExternalCache` zapisa s ključem `camera:{cameraId}:preview` prek že
obstoječega `resolveFreshness()` (`domain/freshness.ts`, glej research.md §3):

| `FreshnessState.kind` | + pogoj | UI stanje (FR-011) |
|---|---|---|
| `fresh` ali `refreshed` | — | "v redu" |
| `stale` | `consecutiveFailures < CAMERA_UNREACHABLE_THRESHOLD` | "staro" (zatemnjen zadnji posnetek + starost) |
| `stale` | `consecutiveFailures ≥ CAMERA_UNREACHABLE_THRESHOLD` | "nedosegljivo" (upočasnjeno osveževanje, FR-011) |
| `never-fetched` | — | "še ni podatka" (prvi zajem v teku) |

Za `iframe`, `mjpeg` in `hls` kamere (brez naslova, ki bi ga bilo mogoče predpomniti prek
`fetchCameraSnapshot()` — `mjpeg`/`hls` gresta prek `openCameraStream()`, pass-through brez
predpomnjenja, research.md §4) to izpeljano zdravje **ne obstaja** — omejitev, zapisana v
research.md §3 in v `quickstart.md`, ne prikrita. UI zanje pokaže samo klientsko,
best-effort oznako (`<iframe>`/`<video>` `onerror`), brez trditve o strežniško preverjenem
stanju.

## Nastavitve porabe podatkov na mobilnem omrežju (Story 7)

Ni nova kolekcija — eno polje v obstoječi enotni `Settings` dokumentu
(`modules/settings/model.ts`): `cameraDataSaverEnabled: boolean`, privzeto `true`, dodano v
`settingsUpdateSchema` (`modules/settings/router.ts`) enako kot obstoječa polja `weather`,
`theme`, `tiles`. Član I izrecno navaja "nastavitve" kot eno od skupnih storitev, prek katere
lahko moduli komunicirajo (poleg `auth` in `obvestil`) — `platform/tabs/resolver.ts` že uvaža
`getOrCreateSettings` neposredno iz `modules/settings/model.ts` po istem vzorcu. Modul
`cameras` (frontend) polje bere/piše prek že obstoječega `GET/PUT /settings`, brez novega
endpointa; noben backend modul kamer ne potrebuje branja tega polja, ker je Story 7 (mobilni
podatkovni prihranek) v celoti odjemalčeva odločitev — backend interval osveževanja pošlje
kot konfiguriran privzetek, odjemalec ga po potrebi lokalno podaljša.
