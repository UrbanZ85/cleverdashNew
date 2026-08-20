# 001 — Zagon in preverjanje (Phase 1)

Navodilo za zagon in **dokazovanje**, da funkcionalnost deluje. Ni navodilo za izvedbo —
koda in naloge so v `tasks.md` po `/speckit-tasks`.

Bere se skupaj s [plan.md](./plan.md) in [contracts/openapi.yaml](./contracts/openapi.yaml).
Spremenljivke okolja so v celoti popisane v `docs/env-reference.md`.

---

## 1. Predpogoji

| Kaj | Različica | Opomba |
|---|---|---|
| Node.js | 22 LTS | za razvoj; produkcija teče v vsebniku |
| Docker + Compose | v2 | edini način zagona produkcije |
| Domena | `app.si` z A zapisom na VPS | potrebna, ker Caddy pridobi potrdilo prek HTTP izziva |
| Ključ za obvestila | datoteka service accounta | **izven repozitorija**, glej §3 |
| Android SDK | samo za nativni build | web deluje brez njega |

---

## 2. Prvi zagon iz čiste kopije

To je hkrati dokaz kakovostnih vrat 4 in FR-040: iz sveže kopije do delujočega sistema samo
z izpolnjenim `.env`.

```bash
git clone <repo> cleverdash && cd cleverdash
cp .env.example .env
# izpolni .env — obvezne vrednosti so navedene v §3
docker compose -f infra/docker-compose.yml up -d
```

Pričakovano stanje po nekaj minutah:

- `https://app.si` odgovori s SPA in veljavnim potrdilom (Caddy ga pridobi sam),
- `https://app.si/api/v1/health` vrne `status: "ok"` in `timeZone: "Europe/Ljubljana"`,
- vsi vsebniki so `healthy` v `docker compose ps`,
- v dnevniku ni nobenega zapisa o manjkajoči spremenljivki okolja.

Če manjka obvezna spremenljivka, se zagon **ustavi z imenom te spremenljivke**. To je
namerno ([research.md](./research.md) §12): stari sistem je manjkajoč `SALT_ROUNDS` odkril
kot `NaN` globoko v izvajanju.

---

## 3. Kaj je treba izpolniti v `.env`

Obvezno, brez tega se sistem ne zažene:

```
MONGO_ROOT_USER       uporabnik, ki ga ob prvem zagonu ustvari vsebnik mongo
MONGO_ROOT_PASSWORD   geslo zanj — mora biti usklajeno z MONGO_URI spodaj
MONGO_URI             mongodb://<isti uporabnik>:<isto geslo>@mongo:27017/...
JWT_ACCESS_SECRET    nov, naključen, min. 32 bajtov
JWT_REFRESH_SECRET   ločena skrivnost od dostopne
ADMIN_EMAIL          za ustvarjanje začetnega računa
ADMIN_INITIAL_PASSWORD  sistem zahteva zamenjavo ob prvi prijavi
PUBLIC_BASE_URL      https://app.si
TZ                   Europe/Ljubljana
```

Priporočeno, ker brez tega dva mehanizma tiho ne delujeta:

```
GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/fcm_key    pot v vsebniku
FCM_KEY_FILE=D:/programiranje/kljuciInNastavitve/CleverDash/<datoteka>.json    pot na gostitelju
HEALTHCHECK_PING_URL   zunanji dead man's switch; brez tega alarm ne pride od zunaj
```

Ključ za obvestila se montira, ne kopira v repozitorij (člen IV):

```yaml
volumes:
  - ${FCM_KEY_FILE}:/run/secrets/fcm_key:ro
```

Pot v vsebniku je stalna, pot na gostitelju pride iz `.env`, ker se med razvojnim strojem in
VPS-om razlikuje. V `docker-compose.yml` ni nobene prave vrednosti.

**Preveri pred prvim commitom:** `git status` ne sme prikazati `.env`, in detektor skrivnosti
mora biti čist (vrata 5).

---

## 4. Preverjanje po funkcionalnih zahtevah

Vsaka vrstica je izvedljiva in ustreza merilu uspeha iz [spec.md](./spec.md).

### 4.1 Prijava in seja (P1)

| Korak | Pričakovano | Pokriva |
|---|---|---|
| Prijava z `ADMIN_EMAIL` in začetnim geslom | Odgovor nosi `mustChangePassword: true`; vsak drug endpoint vrne `403` | FR-014 |
| Zamenjava gesla | Uspeh; ostale seje preklicane | FR-014 |
| Počakaj iztek dostopnega žetona (15 min) ali ga umetno razveljavi | Odjemalec tiho obnovi sejo, uporabnik ne opazi | FR-011, SC-004 |
| Pošlji **isti** obnovitveni žeton drugič | `401`; celotna družina preklicana; ostale naprave nedotaknjene | FR-012, FR-017 |
| Prijava na drugi napravi, nato odjava na prvi | Druga naprava ostane prijavljena | FR-017 |
| 6 zaporednih napačnih gesel | `429`, sporočilo ne razkriva, ali račun obstaja | FR-015 |
| Na Androidu ubij in znova zaženi aplikacijo | Uporabnik je še prijavljen | FR-017 |

### 4.2 Dashboard (P2) in izpad vira (P4)

| Korak | Pričakovano | Pokriva |
|---|---|---|
| Odpri dashboard | Temperatura, stanje neba, veter, vlažnost, čas meritve; radar se premika | FR-021, FR-023, SC-001 |
| Poglej katerokoli ARSO ploščico | Vidna navedba "Vir: ARSO" s povezavo | FR-027, SC-009 |
| Počakaj 5 minut z odprtim zaslonom | Radar se osveži brez posega | FR-022, SC-002 |
| Preklopi aplikacijo v ozadje, počakaj, vrni v ospredje | Med ozadjem ni zahtev; ob vrnitvi takojšnja osvežitev | FR-022 |
| Odpri deset zavihkov brskalnika hkrati | Na ARSO gre največ ena zahteva na TTL, ne deset | člen VIII |
| Blokiraj izhodni promet do ARSO, osveži | Zadnji znani podatek z oznako starosti; brez praznega zaslona in brez tehnične napake | FR-026, SC-003 |
| Blokiraj ARSO **in** izprazni predpomnilnik | Sporočilo, da podatka še ni, in gumb za ponovni poskus | robni primer |
| Ponovno zaženi vsebnike z blokiranim ARSO | Zadnji znani podatek je še vedno tam | [research.md](./research.md) §4 |

Zadnja vrstica je najpomembnejša in najlažje spregledana: dokazuje, da predpomnilnik preživi
restart in da na `externalCache` ni TTL indeksa, ki bi iztečeni zapis izbrisal.

### 4.3 Meni in modularnost (P3, P5)

| Korak | Pričakovano | Pokriva |
|---|---|---|
| Odpri meni | Vsi vklopljeni zavihki po `order`; aktivni označen | FR-002 |
| Odpri na ozkem zaslonu | Spodnja vrstica zavihkov deluje brez odpiranja menija | FR-004 |
| Izklopi zavihek prek nastavitev | Izgine iz menija in iz usmerjanja **brez nove izdaje** | FR-003 |
| Bodi na zavihku, ki se medtem izklopi | Preusmeritev na dashboard, brez napake | robni primer |
| Dodaj navidezen četrti zavihek | Razlika: ena nova mapa in ena spremenjena datoteka (register) | SC-005, člen I |
| Odstrani ta zavihek | Preverjanje tipov, lint in testi ostanejo čisti | člen I |
| Poskusi uvoziti iz drugega modula | Lint napaka, ne opozorilo | [research.md](./research.md) §6 |

### 4.4 Ploščice (P6)

| Korak | Pričakovano | Pokriva |
|---|---|---|
| Prerazporedi ploščice, odjava, ponovna prijava | Razporeditev ohranjena | FR-028 |
| Skrij ploščico | Izgine, ostale zapolnijo prostor | FR-028 |
| Vstavi v nastavitve neznano vrsto ploščice | Preskočena in zabeležena; dashboard deluje | [data-model.md](./data-model.md) |

### 4.5 Obvestila (P7)

| Korak | Pričakovano | Pokriva |
|---|---|---|
| Prvi zagon na Androidu 13+ | Razlaga pred sistemskim pozivom za dovoljenje | FR-031 |
| `POST /api/v1/notifications/test` | Obvestilo prispe v manj kot 10 s | FR-030, SC-006 |
| Tapni obvestilo | Odpre se zaslon iz `deepLink` | FR-033 |
| Pošlji na razveljavljen žeton | Zapis naprave se odstrani, ni ponavljanja | FR-034 |
| Zavrni dovoljenje za obvestila | Vse ostalo deluje normalno | robni primer |
| Preveri kanale v sistemskih nastavitvah | `system` in `reminders` sta ločena | FR-032 |

### 4.6 Obratovanje

| Korak | Pričakovano | Pokriva |
|---|---|---|
| `GET /api/v1/health` | `ok`, `timeZone: Europe/Ljubljana`, starosti virov | FR-042, FR-043 |
| `docker compose ps` | Vsi vsebniki `healthy` | FR-043 |
| Ustavi API vsebnik | Zunanji dead man's switch sproži alarm; **ne** notranji `/health` | člen VII |
| `date` v vsebniku | Čas v `Europe/Ljubljana`, ne UTC | FR-042 |
| Preveri potrdilo | Veljavno, samodejno pridobljeno | FR-041 |
| Odpri orodja brskalnika | Nobene zahteve na drugo domeno; nobene `OPTIONS` predhodne zahteve | člen II |

Vrstica o zaustavitvi API vsebnika je edini pravi test člena VII. Če alarm pride le iz
notranjega `/health`, mehanizem ne deluje — mrtev proces ne pošilja obvestil.

---

## 5. Razvojni način

```bash
npm install
docker compose -f infra/docker-compose.dev.yml up -d   # samo Mongo
npm run dev:api                                        # localhost:3000
npm run dev:web                                        # dev-server s proxyjem /api → :3000
```

Frontend uporablja iste relativne poti kot v produkciji; obliko enotnega izvora zagotovi
dev-server proxy. Koda torej ne ve, ali teče v razvoju ali v produkciji — to je namen člena II.

Ukaza, ki morata biti čista pred vsakim commitom (vrata 1):

```bash
npm run typecheck
npm run lint
npm run test
```

---

## 6. Android

```bash
npm run build:web
npx cap sync android
npx cap open android
```

Nativni build je **edino mesto v celotni aplikaciji, ki pozna absolutni naslov**: nastavljiv
`apiBase`, privzeto `https://app.si`. Vse drugo uporablja relativne poti.

Pred izdajo preveri, da se seja ohrani po ponovnem zagonu aplikacije (FR-017) in da
dovoljenje za obvestila spremlja razlaga (FR-031).

---

## 7. Če kaj ne dela

| Simptom | Verjeten vzrok |
|---|---|
| Radar se ne prikaže, konzola omenja mešano vsebino | Slika se nalaga neposredno z izvora namesto prek `/api/v1/dashboard/radar` ([research.md](./research.md) §2) |
| Vremenska ploščica je prazna, `/health` je `ok` | Struktura odgovora vira se je spremenila; Zod validacija je odpovedala. Zadnji znani podatek bi moral biti prikazan — če ni, je napaka v izpeljavi stanja predpomnilnika |
| Zadnji znani podatek izgine po restartu | Na `externalCache` je TTL indeks, ki ga ne sme biti ([data-model.md](./data-model.md)) |
| Prikazan koledarski dan je napačen zjutraj ali ponoči | Kje v kodi je `toISOString().split("T")[0]`; člen V.4 to prepove |
| `OPTIONS` zahteve v omrežnem zavihku | Nekaj kliče absolutni naslov; usmerjanje ali `apiBase` je narobe (člen II) |
| Obvestila ne pridejo, dnevnik omenja poverilnice | `FCM_KEY_FILE` ne kaže na obstoječo datoteko ali montiranje ni `:ro` na pravo pot |
| Zagon se ustavi ob zagonu z imenom spremenljivke | Deluje pravilno — izpolni to spremenljivko v `.env` |
