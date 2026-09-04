# Naredi to pred vsem ostalim

V obstoječem projektu `belezenje_casa` so prave skrivnosti zapisane v izvorni kodi in v
datotekah, ki so del repozitorija. Če jih prekopiraš v CleverDash, prenašaš naprej
težavo, ki je danes že aktivna.

**Ta seznam ni del Spec Kit workflowa. Opravi ga ročno, zdaj.**

---

## 1. Zavrti Firebase service account (najbolj nujno)

`belezenje-casa-BE/src/services/messaging-service.ts` vsebuje celoten privatni ključ
service accounta, zapisan v izvorni kodi:

- projekt: `belezenje-casa`
- service account: `firebase-adminsdk-w6akp@belezenje-casa.iam.gserviceaccount.com`
- `private_key_id`: `b11a3b86962b9fc0b9bc50d69de16f406ca0191c`

Ta ključ dovoljuje pošiljanje obvestil vsem napravam projekta in dostop do Firebase
Admin API-ja.

Kaj narediti:

1. Google Cloud Console → IAM & Admin → Service Accounts → ta račun → Keys →
   **izbriši ključ** `b11a3b86…`.
2. Ustvari nov ključ in ga shrani kot datoteko, **izven repozitorija**.
3. V CleverDash ga podaj kot montirano datoteko in `GOOGLE_APPLICATION_CREDENTIALS`,
   nikoli kot literal v kodi.

## 2. Zavrti ostale skrivnosti iz `.env` in `docker-compose.yml`

Vse spodnje vrednosti so v datotekah znotraj projekta in jih je treba obravnavati kot
razkrite:

| kaj | kje | ukrep |
|---|---|---|
| `JWT_SECRET` | `.env`, `docker-compose.yml`, `docker-compose.dev.yml` | nov, naključen, min. 32 bajtov; vse obstoječe seje postanejo neveljavne (to je namen) |
| `EMAIL_PASSWORD` (SMTP `info@zuusi.com`) | `.env`, oba compose fila | zamenjaj geslo na poštnem strežniku |
| `ADMIN_PASSWORD` (`admin!`) | `.env`, oba compose fila | novo geslo; staro je slovarska beseda s klicajem |
| `cookie_property_value` (seja e-računov) | `.env`, oba compose fila, `belezenje.page.ts` | nova seja; ta piškotek je nosilec identitete pri delodajalcu |
| Google Maps API ključ | `belezenje-casa/src/environments/environment.ts` | omeji na domeno v Cloud Console; ključi v frontend buildu so vedno javni |
| Firebase web config + VAPID ključ | `firebase-messaging-sw.js`, `messaging.service.ts` | web config je po zasnovi javen — pusti, a preveri Firebase varnostna pravila |
| Firebase config starega CleverDasha | `cleverdash/src/environments/environment.ts` | isto: preveri pravila, ne ključ |

> Sejni piškotek e-računov je poseben primer: ni ga mogoče "zavrteti" v smislu preklica.
> Edina rešitev je pridobiti novo sejo in staro vrednost odstraniti iz vseh datotek.
> Zapisana vrednost `cookie_property_expires: 1737717074` je 24. 1. 2025, torej je ta
> seja tako ali tako že potekla.

## 3. Počisti zgodovino, če bo repozitorij kdaj deljen

`belezenje-casa` ima svoj `.git`. Če bo ta repozitorij kdaj postal javen ali deljen,
skrivnosti niso samo v delovni kopiji, ampak v vseh commitih.

- Če ostane zaseben in lokalen: točki 1 in 2 zadostujeta.
- Če bo deljen: `git filter-repo` ali nov repozitorij brez zgodovine. Rotacija (točki 1
  in 2) je vseeno obvezna — čiščenje zgodovine ne prekliče razkritega ključa.

## 4. Kako CleverDash to prepreči

Ustava, člen IV. Konkretno:

- V gitu je samo `.env.example` s praznimi vrednostmi.
- `.gitignore` vključuje `.env`, `.env.*` (razen `.env.example`), `*.pem`, `*-key.json`,
  `secrets/`.
- Compose datoteke berejo `env_file:` in ne vsebujejo nobene prave vrednosti.
- Firebase ključ je montirana datoteka (`docker secret` ali bind mount v
  `/run/secrets/`), naslovljena prek `GOOGLE_APPLICATION_CREDENTIALS`.
- Sejni piškotek e-računov je v bazi, ne v okolju, in se ureja prek UI oz. API-ja — ker
  se menja pogosto in restart aplikacije ni sprejemljiva cena za zamenjavo piškotka.
- V CI teče detektor skrivnosti (`gitleaks` ali `trufflehog`) kot blokirajoč korak.

## 4b. Javna pot (009 — deljenje datotek)

Do 009 je bil **vsak** zaslon in **vsak** endpoint za prijavljenega uporabnika. Modul za
deljenje datotek to prvič prebije, ker mora: prejemnik datoteke nima računa in ga ne bo dobil.
Kar iz tega sledi, je zbrano tu, da se ob naslednji javni poti ne izumlja znova.

**Javnost ni vratar, ampak njegova odsotnost.** `apiKeyGuard` in `accessTokenGuard` zahteve
brez poverilnic ne zavrneta — samo nastavita `req.auth`. Zavrne šele `requireScopes`. Javna pot
je torej pot, ki ga NE pokliče, in prav zato je nevarna: ne vidi se. Pravila:

- vse javne poti so v ENI datoteki, `modules/file-sharing/public.router.ts`, katere glava pove,
  zakaj obstaja. Nobene javne poti ne sme biti drugje;
- `tests/contract/file-sharing/auth-surface.spec.ts` bere seznam poti **iz pogodbe** in preveri,
  da je vsak `/files*` brez žetona 401 in vsak `/share/*` dosegljiv. Nova pot ne more tiho uiti;
- javna koda `req.auth` NE bere. Veljaven ali potekel žeton v brskalniku na prevzem ne sme
  vplivati v nobeno smer (FR-024);
- odjemalec na `/api/v1/share/*` ne pripenja glave `Authorization` (`auth.interceptor.ts`) —
  potekla seja ne sme podreti strani, ki s sejo nima zveze.

**Kar javna pot mora imeti pod sabo:**

| Zahteva | Kje je uveljavljena |
|---|---|
| Dušenje ugibanja — po povezavi IN po izvornem naslovu | `services/throttle.service.ts`; števec je v BAZI, ker se pomnilniški ob vsakem zagonu ponastavi |
| Geslo kot nepovraten povzetek, primerjava v konstantnem času | `domain/share-password.ts` (`scrypt` + `timingSafeEqual`) |
| Enak odgovor za neznano, poteklo, preklicano in izbrisano povezavo | `public.router.ts`, `unavailable()` |
| Nič občutljivega v dnevnik — poskušeno geslo NIKAMOR | `public.router.ts`; pokrito v `tests/integration/unlock-throttle.spec.ts` |
| `Idempotency-Key` se ne sprejme (endpoint izdaja dovolilnico) | `platform/idempotency/middleware.ts`, `EXEMPT_PREFIXES` |
| `Cache-Control: no-store` na vseh javnih odgovorih | `public.router.ts` |

**Kar javna pot NE sme razkriti:** ime datoteke pred vpisom gesla (pogosto pove vsebino).
Velikost in rok sta v redu — brez njiju prejemnik ne bi vedel, ali je povezava sploh živa.

## 5. Kontrolni seznam

- [ ] Firebase ključ `b11a3b86…` izbrisan v Cloud Console
- [ ] Nov Firebase ključ ustvarjen in shranjen izven repozitorija
- [ ] `JWT_SECRET` zamenjan
- [ ] SMTP geslo za `info@zuusi.com` zamenjano
- [ ] Admin geslo zamenjano
- [ ] Nova seja e-računov pridobljena, stara vrednost odstranjena iz vseh datotek
- [ ] Google Maps ključ omejen na domeno
- [ ] Odločeno, ali `belezenje_casa` repozitorij ostane zaseben
- [ ] `gitleaks` dodan v CleverDash CI
