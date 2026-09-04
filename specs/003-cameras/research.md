# Research: Zavihek kamer

Vsak razdelek rešuje eno tehnično vprašanje, ki ga `spec.md` ne odloča (namenoma — spec je
brez implementacijskih podrobnosti). Vsi sklepi so preverjeni proti dejanski kodi 001/002,
ne proti domnevam o njej.

## 1. Kaj sploh že obstaja in ga 003 ponovno uporabi

Pred vsako odločitvijo spodaj: pregled dejanske kode je pokazal, da je skoraj vsa potrebna
infrastruktura že zgrajena za 001 (ARSO) in delno za 002 in samo čaka na nov modul, ki jo
pokliče.

| Potreba 003 | Že obstaja kot |
|---|---|
| Predpomnjen, vljuden proxy do zunanjega vira, ki ob napaki vrne zadnji znani podatek | `platform/cache/service.ts` (`getOrRefresh`) + `ExternalCacheModel` — zgrajeno za ARSO radar/vreme (001), brez sprememb sheme uporabno za posnetke kamer |
| Izpeljava "v redu / staro / nedosegljivo" iz časa zadnjega uspeha | `domain/freshness.ts` (`resolveFreshness`, `ageSeconds`) — čista funkcija, že testirana |
| Ročno spremenljiv vrstni red seznama v uporabniškem vmesniku | `features/settings/tile-arrangement.component.ts` — vzorec ↑/↓ gumbov nad seznamom, ne povleci-in-spusti |
| Register zavihkov | `platform/tabs/registry.ts` — komentar že **eksplicitno predvideva** vnos `cameras` (003) |
| Obsegi po modulu, preverjanje pravic | `modules/time-tracking/scopes.ts` + `platform/auth/scopes.ts` (`requireScopes`) |
| `Idempotency-Key` na mutacijskih endpointih | `platform/idempotency/middleware.ts` — sprejme glavo na vsakem `POST/PUT/PATCH/DELETE`, brez sprememb za nov modul |
| Enotna, validirana shema okolja | `platform/config/env.ts` (Zod) — nov razdelek "Kamere" po vzorcu obstoječih |
| REST usmerjevalnik pod `/api/v1` | `platform/http/router.ts` (`apiV1Router`) |

Posledica za Complexity Tracking v `plan.md`: **noben** del tega ni treba na novo izumiti;
edino resnično novo je domenska logika kamer same (model, validacija naslovov, izpeljava
vrstnega reda) in dva manjša posega v obstoječo, skupno kodo (§2, §7 spodaj).

## 2. ARSO webcam — dejanska oblika podatka in kje naj živi koda

**Ugotovitev**: `nacrt/001-app-shell-dashboard/spec.md` pravilno navaja, da odgovor ARSO
vremenskega API-ja vsebuje polje `webcam`. Dejanska koda (`arso-weather.client.ts`,
`arso-weather-parse.spec.ts`) to polje **že vidi**, a ga namenoma prezre — shema uporablja
`.passthrough()` in test izrecno preverja, da se `webcam` ne podre razčlenjevanja, ne da bi
ga kdaj prebral. Oblika (iz testnega fixtura, preverjenega proti pravemu odgovoru
19. 8. 2026): `timeline[].webcam: { direction: string; image: string }[]`, torej je slika
vezana na en vnos časovnice observacije (praviloma trenutni odčitek), ne na lokacijo kot
celoto.

**Odločitev**: koda za pridobivanje in predpomnjenje ARSO vremena se **premakne** iz
`modules/dashboard/clients/` v nov skupen `platform/arso/` (client + Zod shema + mapper),
ker jo zdaj potrebujeta dva modula (`dashboard` in `cameras`), ne enega. `dashboard` uvozi
`platform/arso/weather.client.ts` namesto lastne kopije — brez podvojene logike ali klica
enega modula v drugega (člen I). Mapper se dopolni z `webcam: { direction, image }[]`
poleg že obstoječih polj; `dashboard/mappers/weather.mapper.ts` ostane nespremenjen, ker
`webcam` za ploščico vremena ni relevanten.

Nov endpoint `GET /api/v1/cameras/arso-webcams?location=...` (modul `cameras`) prebere isti
predpomnjen zapis (`platform/cache`, ključ `weather:{location}`, TTL že obstoječih 600 s iz
`WEATHER_CACHE_SECONDS`) in vrne samo seznam `webcam` slik za to lokacijo — brez dodatnega
klica ARSO (člen VIII, vljudnost do zunanjih virov: en vir, dve porabi istega
predpomnjenega zapisa).

**Alternativa, zavrnjena**: podvojiti klic in razčlenjevanje znotraj `modules/cameras/` —
bi delovalo, a bi dvakrat klicalo isti ARSO endpoint (enkrat za vreme, enkrat za webcam),
kar je natanko nevljudnost do zunanjega vira, ki jo člen VIII prepoveduje.

Ker gre za spremembo **obstoječe, skupne** kode iz 001 (ne samo dodatek v novem modulu), je
to vnos v Complexity Tracking (`plan.md`).

**Popravek po pravem preverjanju 21. 8. 2026 (`docker compose up`, T076):** `webcam[].image`
je RELATIVNA pot (npr. `"LJUBL-ANA_BEZIGRAD_dir/siwc_20260821-1300_..._n.jpg"`), ne celoten
naslov — preverjeno z resničnim klicem `https://vreme.arso.gov.si/api/1.0/location/
?location=Ljubljana`.

Prva domneva o osnovi (`https://vreme.arso.gov.si/webcam/`) je bila NAPAČNA past: vrnila je
`200 OK`, a s telesom HTML (ARSO-jeva Angular SPA ima catch-all usmerjanje na `index.html`
za vsako neujemajočo pot — enak vzorec, kot ga ima naša lastna Caddy `try_files`, glej
`infra/Caddyfile`). `200` torej NI zadosten dokaz, da je vir prava slika — šele preverjen
`content-type` in dejanska velikost/format telesa sta dokaz. Prava osnova, razvidna iz JS
svežnja ARSO SPA (`/uploads/probase/www/observ/webcam/`) in potrjena s pravo 800×600 JPEG
sliko: `https://meteo.arso.gov.si/uploads/probase/www/observ/webcam/` — isti gostitelj in
vzorec poti kot `ARSO_RADAR_URL`, samo "webcam" namesto "radar". Dodan `ARSO_WEBCAM_BASE_URL`
v `platform/config/env.ts` (privzeto ta naslov); `GET /cameras/arso-webcams` zdaj vrne
`imageUrl` prek `new URL(image, ARSO_WEBCAM_BASE_URL)`, skladno z že obstoječo pogodbo
(`format: uri` v `contracts/openapi.yaml` je bil pravilen od začetka — koda ga ni
izpolnjevala).

## 3. Predpomnjenje in proxy za `snapshot` vrsto

**Odločitev**: `snapshot` posnetki gredo skozi **isti** `getOrRefresh` iz `platform/cache`,
ključ `camera:{cameraId}:preview`, `ttlSeconds = camera.refreshIntervalSeconds`, `fetcher`
je preprost `fetch()` na `camera.previewUrl` (enak vzorec kot `arso-radar.client.ts`, ki že
predpomni binarno vsebino — GIF — ne le JSON). To pomeni:

- FR-021 (ena kamera na več napravah ni več zahtev na vir) je izpolnjen **brezplačno**, brez
  nove kode — mehanizem že obstaja.
- FR-011 (stanje v redu/staro/nedosegljivo) se izpelje z `resolveFreshness()` — enako kot
  vremenska ploščica. `stale` + `consecutiveFailures` iz istega `ExternalCache` zapisa nad
  nastavljivim pragom (nov `CAMERA_UNREACHABLE_THRESHOLD`, privzeto 3) je "nedosegljivo"
  (FR-011, Story 5); `stale` pod tem pragom je "staro"; `fresh`/`refreshed` je "v redu".
- **Ločena kolekcija `CameraHealth` iz spec.md ni potrebna kot lastna shema** — je pogled na
  že obstoječi `ExternalCache` zapis za to kamero, izpeljan enako kot pri ARSO. To poenostavi
  `data-model.md` (glej tam).

**Omejitev, ki jo velja zapisati, ne prikriti**: za kamere vrste `iframe` (brez lastnega
`snapshot` naslova — npr. samostojna YouTube vdelava) backend nima česa predpomniti ali
poklicati za preverjanje dosegljivosti — X-Frame-Options in CORS večine ponudnikov strežniku
ne dovolita smiselnega branja vsebine vdelane strani. Za te kamere FR-011 (stanje v
redu/staro/nedosegljivo) **ni tehnično izvedljiv na strežniku**; edini signal je odjemalčev
`onerror`/`onload` na `<iframe>`, ki je od ponudnika do ponudnika nezanesljiv. Ta primer je
zapisan kot omejitev v `data-model.md` in `quickstart.md`, ne izpuščen.

## 4. Zvezni tokovi (`mjpeg`, `hls`) skozi proxy

Nobena od trenutno znanih kamer (ipcamlive, YouTube, istrastream — glej spec.md
Clarifications) ni `mjpeg` ali `hls` **skozi proxy**; vse so bodisi `iframe`, bodisi
`snapshot`+`iframe` na `https`. Tipa `mjpeg`/`hls` v modelu (FR-002) obstajata za prihodnje
kamere, ki jih uporabnik doda sam.

**Odločitev**: ko tak vir zahteva proxy (FR-020 — `http://`, poverilnice, ali lokalno
omrežje), backend prevzame vlogo preprostega **pass-through** proxyja: eno odhodno povezavo
na eno dohodno, brez predpomnjenja (zvezni tok ni nekaj, kar se "predpomni" v smiselnem
pomenu — vsak naslednji byte je nova informacija). Vsaka odjemalčeva zahteva odpre svojo
odhodno povezavo na vir.

**Zavestna poenostavitev, zapisana kot Assumption**: FR-021 (ena kamera na več napravah ni
več zahtev na vir) za `mjpeg`/`hls` **ni** izpolnjen na enak način kot za `snapshot` —
pravi multipleksni video strežnik (npr. deljena buffer/fan-out plast) je izven obsega te
funkcionalnosti, ker trenutno nobena kamera tega ne potrebuje. Če se kdaj pojavi taka
kamera, je to nadgradnja tega proxyja, ne sprememba modela podatkov.

## 5. Varna vdelava tuje strani (iframe) — odprava hrošča iz starega CleverDasha

Star `camera.component.html` je uporabljal `bypassSecurityTrustHtml` nad nizom, sestavljenim
iz uporabniškega polja (`toWorkUrl`) — vbrizg HTML-ja iz podatkov (glej `nacrt/003-cameras/
spec.md`, "Kaj je bilo najdeno kot problem").

**Odločitev**: nov `<app-embedded-camera [url]="camera.fullUrl">` komponenta sprejme **samo
en, že preverjen naslov** (ne HTML), veže ga na `<iframe [src]="trustedUrl">`, kjer je
`trustedUrl` produkt `DomSanitizer.bypassSecurityTrustResourceUrl(url)` — nikoli
`bypassSecurityTrustHtml`, in nikoli sestavljanje niza s predlogami/interpolacijo znotraj
HTML atributa. Ker gre za `ResourceUrl` (samo `src` navigacija), ne za poljuben HTML, je
razred tveganja bistveno ožji kot pri prvotnem hrošču.

Dvoplastno preverjanje gostitelja (obratovalna varovalka, ne nadomestek za strežniško
validacijo iz FR-034):

1. **Strežnik** ob shranjevanju (dodajanje/urejanje) zavrne naslov, čigar gostitelj ni na
   seznamu dovoljenih (§6) — v bazi zato ni nikoli neveljavnega naslova.
2. **Odjemalec** pred klicem `bypassSecurityTrustResourceUrl` še enkrat preveri gostitelj
   proti istemu seznamu (prejetem prek API-ja) — če se med shranjevanjem in prikazom seznam
   spremeni (gostitelj odstranjen), se vdelava ne izvede, prikaže se razumljivo sporočilo.

`<iframe>` dobi `sandbox="allow-scripts allow-same-origin allow-presentation"` (dovolj za
YouTube in ipcamlive predvajalnik, brez `allow-top-navigation`, `allow-popups` — vdelana
stran ne sme prevzeti nadzora nad zaslonom).

## 6. Seznam dovoljenih gostiteljev za vdelavo — kod ali podatek?

Neposredna napetost: FR-022 zahteva seznam dovoljenih gostiteljev (varnost), Story 3/FR-031
zahteva, da dodajanje kamere ne pomeni posega v kodo (uporabnost). Trdo kodiran seznam bi
rešil varnost, a bi pri vsakem novem legitimnem viru zahteval nov build — natanko to, česar
se Story 3 izogiba.

**Odločitev**: dvoplastni seznam.

1. **Osnovni seznam** prek okolja, `CAMERA_ALLOWED_EMBED_HOSTS` (vejica ločen niz v
   `platform/config/env.ts`), privzeto `youtube.com,ipcamlive.com,istrastream.com,
   arso.gov.si` — zajame vse danes znane vire brez ročnega vnosa.
2. **Razširitev prek podatkov**: nova kolekcija `CameraEmbedAllowlist` (glej
   `data-model.md`) hrani dodatne gostitelje, ki jih uporabnik odobri **prek zaslona za
   urejanje**, ko poskusi dodati kamero z gostiteljem zunaj osnovnega seznama — obrazec to
   jasno pove in ponudi "Dodaj `example.com` na seznam dovoljenih" kot ločen, izrecen korak
   (ne samodejno ob shranjevanju kamere), da dodajanje gostitelja ni skrit stranski učinek.

Efektivni seznam ob vsakem preverjanju (FR-034, FR-036) je unija obeh. To izpolni FR-022 v
polnem obsegu, a hkrati resnično izpolni obljubo Story 3/FR-031 — noben nov vir ne zahteva
posega razvijalca, samo izrecno uporabnikovo potrditev.

## 7. Vrstni red kamer v uporabniškem vmesniku

**Odločitev**: enak vzorec kot `tile-arrangement.component.ts` — seznam z gumboma ↑/↓ na
zaslonu za urejanje, ne Angular CDK drag-and-drop. Razlog: v projektu drag-and-drop knjižnica
še ni odvisnost, ↑/↓ vzorec je dosleden z edinim obstoječim primerom "uporabnik spremeni
vrstni red seznama" (razporeditev ploščic dashboarda), in je za majhno število kamer (deset,
morda dvajset) enako uporaben. FR-035 govori o "premikanju", ne o specifičnem UI vzorcu —
spec.md to izrecno pušča `/speckit-plan`u (Assumptions).

## 8. Razvrstitev po času dneva

**Odločitev**: ponovna uporaba `domain/timezone.ts` (Europe/Ljubljana, že uveljavljeno v
001/002 — člen V.4, brez `toISOString().split("T")[0]`) za izračun lokalne ure ob odprtju
zavihka. Čista funkcija `sortCamerasByTimeOfDay(cameras, localHour)` v novem
`domain/camera-ordering.ts`: znotraj ročnega vrstnega reda (FR-014) kamere z ujemajočo
časovno oznako (`morning`/`afternoon` glede na `localHour < 12`) pridejo pred kamere z
neujemajočo, `always` ostane na svojem mestu relativno znotraj skupine. Testirano brez
brskalnika in brez baze (člen IX), enako kot `freshness.ts` in `calendar.ts` v 002.

## 9. Zaznava mobilnega omrežja (Story 7)

**Odločitev**: nov paket `@capacitor/network` (isti vzorec kot `@capacitor/push-
notifications`, `@capacitor/preferences`, ki že obstajajo) za Android; na spletu
`navigator.connection?.type` (Network Information API), kjer podprto, sicer privzeto
"ni mobilno" (brskalniki brez podpore ne smejo po nepotrebnem omejevati namizne uporabe).
Nastavitev "zmanjšaj porabo podatkov" je uporabniško izbirno stikalo v Nastavitvah
(`features/settings/`, nov razdelek "Kamere"), privzeto vklopljeno na zaznanem mobilnem
omrežju — usklajeno z Assumptions v spec.md.

## 10. Obsegi (scopes) in avtorizacija

**Odločitev**: nov `modules/cameras/scopes.ts`, enak vzorec kot `time-tracking/scopes.ts`:

```ts
export const CAMERA_SCOPES = {
  read: 'cameras:read',
  write: 'cameras:write',
} as const;
```

`GET` poti (mreža, posnetek, zdravje, seznam ARSO webcamov) zahtevajo `read`; `POST/PUT/
PATCH/DELETE` (dodajanje, urejanje, brisanje, vrstni red, dovoljeni gostitelji) zahtevajo
`write`. `admin` (bootstrap uporabnik) ima oba, kot povsod (`platform/auth/scopes.ts`).

## 11. `Idempotency-Key` na mutacijskih endpointih

Brez posebne obravnave — `platform/idempotency/middleware.ts` je že nameščen na
`apiV1Router` in deluje na poti/metodi, ne na modulu; noben nov endpoint ne potrebuje
sprememb tega mehanizma (člen III). Edina odločitev: telo zahteve za `POST /cameras` in
`PUT /cameras/{id}` mora biti determinističen JSON (brez časovnih žigov znotraj telesa), da
`requestHash` pravilno zazna pravo ponovitev — enako pravilo kot v 001/002.

## 12. Modul in register zavihkov

Nov vnos v `platform/tabs/registry.ts` (komentar tam že to predvideva):

```ts
{ id: 'cameras', title: 'Kamere', icon: 'videocam-outline', route: '/cameras', order: 7, enabled: true }
```

`order: 7` — med `time-tracking` (5) in `settings` (10), ker gre za vsakodnevni pregledni
zaslon podobne teže kot beleženje časa, ne nastavitveni zaslon.

## 13. Novi razdelek okolja (`platform/config/env.ts`)

```ts
CAMERA_ALLOWED_EMBED_HOSTS: z.string().default('youtube.com,ipcamlive.com,istrastream.com,arso.gov.si'),
CAMERA_UNREACHABLE_THRESHOLD: z.coerce.number().int().positive().default(3),
CAMERA_DEGRADED_REFRESH_MULTIPLIER: z.coerce.number().positive().default(4),
CAMERA_DEFAULT_REFRESH_SECONDS: z.coerce.number().int().positive().default(30),
CREDENTIALS_ENCRYPTION_KEY: z.string().length(44, 'CREDENTIALS_ENCRYPTION_KEY mora biti 32 bajtov v base64 (44 znakov)'),
```

`CREDENTIALS_ENCRYPTION_KEY` je obvezen (brez privzetka) samo, če vsaj ena kamera dejansko
zahteva poverilnice — validacija na ravni sheme okolja tega ne loči (statična, ne pogojna),
zato je obvezen vedno, enako kot `JWT_ACCESS_SECRET`. Prazna namestitev brez kamer s
poverilnicami ga vseeno mora imeti nastavljenega — majhna cena za to, da manjkajoč ključ ne
pripelje tiho do nešifriranega zapisa (glej §14 spodaj).

Isti vzorec kot obstoječi razdelki — brez privzetkov "na mestu uporabe", vse gre skozi
`loadEnv()` (research.md §12 v 002, ponovno uveljavljeno tu).

## 14. Šifriranje poverilnic kamere (FR-005) — nova infrastruktura, ne obstoječi vzorec

**Ugotovitev**: FR-005 (spec.md) zahteva, da so poverilnice kamere "shranjene šifrirano".
To je **strožje** od obstoječega vzorca v 002: `remoteSessions.cookieValue` je v bazi
shranjen v čistem besedilu, "zaščiten" samo tako, da ga middleware odgovorov odstrani iz
JSON izhoda (`FR-092`, `remote-session.model.ts`) — ne gre za šifriranje na disku. Za
kamere ni mogoče prevzeti tega vzorca nespremenjenega, ker spec.md izrecno zahteva
šifriranje, ne le izpustitev iz odgovora.

**Odločitev**: nov skupen `platform/crypto/secret-box.ts` — AES-256-GCM (Node vgrajen
`crypto`, brez nove odvisnosti), ključ iz `CREDENTIALS_ENCRYPTION_KEY` (32 bajtov, base64,
`platform/config/env.ts`). `encrypt(plaintext): string` vrne `iv:tag:ciphertext` (vse
base64, ločeno z `:`); `decrypt(sealed): string` je inverz. Modul `cameras` ga uporabi za
`credentialsEncrypted`; dešifrirana vrednost obstaja samo kratko, v pomnilniku, med sestavo
zahteve proti viru (Basic Auth glava ali poizvedbeni parameter, odvisno od vira) in se
NIKOLI ne zapiše v dnevnik (Pino) niti ne vrne prek API-ja (`hasCredentials: boolean` je
edini signal, glej `contracts/openapi.yaml`).

Ker je `platform/crypto/` splošen mehanizem (ne last kamer), je to vnos v Complexity
Tracking (`plan.md`) po istem vzorcu, kot je 002 utemeljila `platform/webhooks/` — verjetno
uporaben tudi za prihodnje funkcionalnosti, ki bodo hranile poverilnice (npr. lastne kamere v
domačem omrežju, če bodo kdaj v obsegu).

**Alternativa, zavrnjena**: privzeti vzorec 002 (izpustitev iz JSON, brez šifriranja na
disku). Bi bilo manj kode, a bi neposredno kršilo besedo specifikacije ("shranjena
šifrirano", FR-005) brez utemeljenega razloga za odstop — člen ustave o skrivnostih (IV) tega
ne prepoveduje neposredno (govori o skrivnostih v kodi/gitu, ne o šifriranju v bazi), a
spec.md zahteva več, in `/speckit-plan` ne sme spec.md tiho omiliti.

## 15. Nove odvisnosti (frontend)

- **`hls.js`** — noben brskalnik razen Safarija/iOS ne predvaja `.m3u8` neposredno v
  `<video>`; potreben za tip `hls`, čeprav ga nobena danes znana kamera ne uporablja (model
  ga podpira za prihodnje kamere, glej FR-002).
- **`@capacitor/network`** — glej §9.

Nobena nova odvisnost na backendu (`fetch()` je vgrajen v Node 22, brez novega HTTP
odjemalca).
