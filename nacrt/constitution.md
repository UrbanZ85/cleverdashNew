# CleverDash — Ustava

Nepogojna pravila. Veljajo za vsako funkcionalnost, vsak PR in vsako generirano kodo.
Kjer je načrt v nasprotju z ustavo, se popravi načrt, ne ustava.

---

## I. Zavihek je modul

Vsak zavihek je samostojen modul (lasten routing, lasten API namespace, lastne
kolekcije). Moduli se ne kličejo med sabo neposredno — samo prek skupnih storitev
(auth, obvestila, nastavitve). Odstranitev zavihka mora biti brisanje ene mape in
enega vnosa v registru zavihkov, brez popravkov drugod.

**Zakaj:** dashboard bo dobival nove zavihke v nedoločenem tempu. Sklopljenost med
zavihki je edina stvar, ki to sčasoma naredi nemogoče.

## II. Enotni izvor (single origin), backend pod `/api`

Aplikacija in API sta na istem izvoru:

- SPA: `https://app.si/`
- API: `https://app.si/api/v1/...`

Reverse proxy usmerja `/api/*` na Node backend, vse ostalo na statični build z
SPA fallbackom na `index.html`. Ločene API poddomene ni.

**Zakaj:** brez CORS-a, brez `origin: "*"`, piškotki in `Authorization` glava delujejo
brez posebnih pravil, ena TLS domena. Stara aplikacija je uporabljala ločeno
`bcapi.zuusi.com` in `cors({origin: "*", credentials: true})` — kombinacija, ki je
hkrati nevarna in po specifikaciji neveljavna.

## III. API-first — UI ni privilegiran odjemalec

Vsaka funkcija je najprej REST endpoint, šele nato zaslon. Če se kaj da narediti v
UI, se mora dati narediti tudi s HTTP klicem. n8n je prvorazredni odjemalec, ne
naknadna misel.

Zato velja:
- Pogodba je OpenAPI 3.1 in je vzdrževana skupaj s kodo.
- Avtentikacija za avtomatizacijo je **API ključ z omejenim obsegom** (`X-API-Key`),
  ne pa uporabnikovo geslo ali dolgoživ JWT.
- Mutacijski endpointi sprejemajo `Idempotency-Key`.

## IV. Nobene skrivnosti v kodi ali gitu

Skrivnosti pridejo izključno iz okolja ali datotek, montiranih ob zagonu.
V repozitoriju je samo `.env.example` s praznimi vrednostmi.

Prepovedano brez izjem:
- ključi ponudnikov v `.ts`/`.js` datotekah,
- prave vrednosti v `docker-compose.yml`,
- commitan `.env`,
- skrivnosti v `environment.prod.ts` frontenda (vse, kar je v buildu, je javno).

**Zakaj:** v stari kodi je privatni ključ Firebase service accounta zapisan
neposredno v `src/services/messaging-service.ts`, `docker-compose.yml` pa vsebuje
JWT secret, SMTP geslo, admin geslo in sejni piškotek e-računov.

## V. Scheduler je determinističen in idempotenten

1. **Baza je edini vir resnice.** Načrtovana akcija je zapis, ne časovnik v pomnilniku.
2. **Nič ni odvisno od delovanja v določeni sekundi.** Vsak tik se vpraša "kaj bi
   moralo biti do zdaj narejeno in ni?" in to dohiti. Restart kadar koli ne sme
   povzročiti izgubljenega dneva.
3. **Podvojen zagon je nemogoč.** Unikatni indeks na (datum, profil, tip akcije).
   Ponovljen klic z istim `Idempotency-Key` vrne prvotni rezultat.
4. **Vsi časi so v `Europe/Ljubljana`.** Nikoli `toISOString().split("T")[0]` za
   koledarski dan. Shranjuje se UTC instant + eksplicitna cona.

**Zakaj:** stara implementacija je dnevni načrt ustvarila samo v oknu 00:00:00–00:00:09
in izračunala "današnji" dan po UTC-ju, kar v poletnem času pomeni napačen dan.

## VI. Nobene neverificirane avtomatizirane akcije

Klik ni dokončan, ko ga sprožimo, ampak ko potrdimo spremembo stanja na oddaljeni
strani. Vsak poskus zabeleži: čas, izid, prebrano stanje pred in po, posnetek zaslona
ob napaki, razlog. Neuspeh se ponovi z zamikom; po izčrpanih poskusih uporabnik dobi
obvestilo. Tiha napaka je hrošč najvišje resnosti.

## VII. Sistem, ki se pokvari, mora znati povedati, da je pokvarjen

Notranji `/api/v1/health` ne zadošča — mrtev proces ne pošilja obvestil.
Zato obvezno:
- vsak tik pošlje signal zunanji "dead man's switch" storitvi (Healthchecks.io ali
  self-hosted Uptime Kuma); če signal utihne, alarm pride od zunaj;
- veljavnost sejnega piškotka e-računov se aktivno spremlja in opozori **pred** potekom;
- vsak zagon in vsaka odločitev scheduleria je v strukturiranem logu z ID-jem korelacije.

## VIII. Vljudnost do zunanjih virov

ARSO, e-računi in kamere so tuji sistemi. Zato:
- vsak zunanji klic gre prek backend predpomnilnika z razumnim TTL (radar 5 min,
  vreme 10 min); frontend nikoli ne poizveduje zunanjega vira v zanki;
- spoštujemo `Cache-Control` izvora;
- ARSO podatki so vedno prikazani z navedbo vira;
- avtomatizacija e-računov uporablja **obstoječo sejo uporabnika** in ne obide nobenega
  varnostnega mehanizma; njena naloga je pritisniti isti gumb, ki bi ga uporabnik
  pritisnil sam, ob dogovorjenem času.

## IX. Engine je testabilen brez brskalnika

Logika odločanja (kdaj, kaj, ali je delovni dan, katero stanje pričakujemo) je čista
in enotsko testirana brez Puppeteerja. Brskalniška plast je ozek vmesnik z dvema
operacijama: `readState()` in `performAction()`. Obvezen je `dry-run` način, ki vse
izračuna in zabeleži, a ne klikne ničesar.

## X. Slovenščina v domeni, angleščina v kodi

Imena akcij so domenski podatki v slovenščini (`Prijava na delo`, `Malica`,
`Konec malice`, `Konec dela`, `Delo od doma`, `Delo na terenu`) in se nikoli ne
prevajajo — biti morajo znakovno enaka besedilu na e-računih.
Identifikatorji v kodi, polja API-ja in imena kolekcij so v angleščini.
Besedilo v UI in obvestilih je v slovenščini.

## XI. Mobilna naprava je odjemalec, ne planer

Vso načrtovanje in izvajanje se dogaja na strežniku. Android aplikacija samo prikazuje
stanje in prejema obvestila. Nobena funkcija ne sme biti odvisna od tega, da je telefon
prižgan, na omrežju ali da Android ni ubil procesa.

## XII. Meje

Prepovedano, tudi če bi bilo priročno:
- vpisovanje delovnega časa, ki se ni zgodil, ali vpisovanje za drugo osebo;
- prikrivanje avtomatizacije pred delodajalcem — sistem je uporabnikov osebni
  pomočnik za lastno evidenco in ne izdaja lažnih podatkov;
- zaobitje CAPTCHA, večfaktorske avtentikacije ali omejitev hitrosti na tujih sistemih.

Če e-računi kdaj uvedejo mehanizem, ki avtomatizacijo namenoma prepreči, se avtomatski
način izklopi in ostane samo način opozarjanja.

---

## Kakovostna vrata (gates)

Nobena naloga ni končana, dokler:

1. `npm run typecheck` in `npm run lint` sta čista; TypeScript `strict: true`, brez
   `any` v domenski plasti;
2. domenska logika ima enotske teste, vključno z: prehodom na poletni/zimski čas,
   praznikom, ki pade na delovni dan, dopustom preko meje meseca, in
   neuspelim klikom, ki se uspešno ponovi;
3. OpenAPI pogodba je posodobljena in validna;
4. `docker compose up` iz čiste checkout kopije pripelje do delujočega sistema
   samo z izpolnjenim `.env`;
5. noben nov niz, ki je videti kot skrivnost, ni v gitu.
