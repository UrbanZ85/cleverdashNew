# Funkcionalnost 001 — Ogrodje aplikacije in dashboard

**Prva funkcionalnost. Vzpostavi temelj, na katerega se 002 in 003 samo priklopita.**

Tehnično podlago (stack, monorepo, usmerjanje, avtentikacija, registar zavihkov, Docker)
opisuje `nacrt/002-time-tracking/plan.md`, poglavje **A — Skupna arhitektura**. Ta
specifikacija pove, kaj mora ogrodje znati; poglavje A pove, kako.

---

## Namen

CleverDash je osebni dashboard. Na prvi strani hitri pregled vremena z animirano radarsko
sliko, in meni z zavihki, ki jih bo sčasoma več.

Ta funkcionalnost dostavi delujočo, prijavljeno, na VPS postavljeno aplikacijo z enim
uporabnim zavihkom. Zavihka za kamere in beleženje časa se dodata pozneje in ne
zahtevata sprememb ogrodja.

## Kaj ni v obsegu

- Kamere (003) in beleženje časa (002).
- Zapiski, povezave in zvočni zapiski. Ti obstajajo v starem CleverDashu in bodo prišli
  pozneje; registar zavihkov jih mora sprejeti brez sprememb.
- Vremenska napoved po dnevih z grafi. Zahteva je **hitri pregled**, ne vremenska
  aplikacija.

---

## Uporabniške zgodbe

### Z1 — Odprem aplikacijo in vidim, kaj se dogaja

**Kot** uporabnik **želim** ob odprtju takoj videti vreme in radarsko sliko, **da** v
nekaj sekundah vem, ali gre dež.

- **Dano** je, da sem prijavljen
- **Ko** odprem aplikacijo
- **Takrat** se prikaže trenutna temperatura, stanje neba, veter in **animirana radarska
  slika ARSO**, ki se premika
- **In** radarska slika se osvežuje samodejno, dokler je zaslon odprt
- **In** ob vsakem podatku je naveden vir in čas meritve, da ni dvoma o svežini.

### Z2 — Meni z zavihki

**Kot** uporabnik **želim** meni, po katerem se premikam med zavihki, **da** dashboard
lahko raste.

- **Dano** je, da so na voljo trije zavihki
- **Ko** odprem meni
- **Takrat** vidim vse omogočene zavihke, urejene po vrstnem redu
- **In** trenutni zavihek je vidno označen
- **In** na telefonu je premikanje mogoče brez odpiranja menija (spodnja vrstica zavihkov).

### Z3 — Nov zavihek brez posegov v obstoječe

**Kot** razvijalec **želim** dodati zavihek z eno mapo in enim vnosom v registru, **da**
dodajanje ne pomeni popravkov na več mestih.

- **Dano** je nov modul
- **Ko** dodam vnos v register zavihkov
- **Takrat** se pojavi v meniju in v usmerjanju, brez sprememb v drugih zavihkih
- **In** nobena obstoječa datoteka razen registra ni spremenjena.

> To zgodbo narekuje stari sistem: meni je bil prekopiran v `belezenje.page.html`,
> `urnik.component.html` in `history.page.html` — trije enaki bloki, ki jih je bilo treba
> ob vsaki spremembi popraviti trikrat.

### Z4 — Prijava in trajna seja

**Kot** uporabnik **želim** ostati prijavljen, **da** mi ni treba vpisovati gesla vsak dan.

- **Dano** je, da sem se prijavil
- **Ko** dostopni token poteče
- **Takrat** se v ozadju obnovi z refresh tokenom in ne opazim ničesar
- **In** ko je refresh token preklican ali potekel, me sistem odjavi in vrne na prijavo
- **In** na Androidu seja preživi ponovni zagon aplikacije.

### Z5 — Zunanji vir ne dela

**Kot** uporabnik **želim** uporabno aplikacijo tudi takrat, ko ARSO ni dosegljiv, **da**
mi tuja napaka ne pokvari celotnega zaslona.

- **Dano** je, da vremenski vir ne odgovori
- **Takrat** se prikaže zadnji znani podatek z jasno oznako, kdaj je bil pridobljen
- **In** ostali del dashboarda deluje normalno
- **In** napaka ne izprazni zaslona in ne izpiše tehnične napake.

### Z6 — Dashboard bo dobil nove ploščice

**Kot** uporabnik **želim** dashboard, sestavljen iz ploščic, **da** lahko pozneje dodam
druge stvari.

- **Dano** je, da dashboard prikazuje ploščice
- **Ko** se doda nova vrsta ploščice
- **Takrat** se pojavi v mreži, brez spremembe obstoječih
- **In** vrstni red in vidnost ploščic sta nastavljiva.

---

## Funkcionalne zahteve

### Ogrodje

- **FR-001** Aplikacija in API sta na istem izvoru. Frontend uporablja izključno relativne
  poti `/api/v1/...`. Edina izjema je nativni Android build, ki ima nastavljiv naslov
  strežnika.
- **FR-002** Meni se sestavi iz deklarativnega registra zavihkov. Zavihek ima ime, ikono,
  pot, vrstni red, zahtevane obsege in stikalo za vklop.
- **FR-003** Zavihek je mogoče ugasniti brez novega builda.
- **FR-004** Na telefonu je poleg menija na voljo spodnja vrstica zavihkov.
- **FR-005** Aplikacija deluje kot PWA in kot Android aplikacija iz iste kode.
- **FR-006** Aplikacija podpira svetlo in temno temo, privzeto po nastavitvi sistema.

### Avtentikacija

- **FR-010** Prijava z e-pošto in geslom. Gesla so shranjena z Argon2id ali bcrypt.
- **FR-011** Dostopni token velja kratko (15 min), refresh token je shranjen v bazi in se
  ob uporabi zavrti.
- **FR-012** Zaznana ponovna uporaba že porabljenega refresh tokena prekliče celotno
  družino tokenov.
- **FR-013** Avtorizacija je na podlagi obsegov. Veljaven token sam po sebi ne pomeni
  administratorskih pravic.
- **FR-014** Ob prvem zagonu se ustvari začetni uporabnik iz okoljskih spremenljivk.
  Sistem zahteva zamenjavo gesla pred prvo uporabo.
- **FR-015** Neuspeli poskusi prijave so omejeni po hitrosti in zabeleženi.

### Dashboard

- **FR-020** Dashboard je mreža ploščic. Vrsta ploščice je vtičnik; dodajanje nove ne
  zahteva sprememb obstoječih.
- **FR-021** Ploščica z **animirano radarsko sliko ARSO** je na prvi strani in prikazuje
  premikajočo se sliko.
- **FR-022** Radarska slika se osvežuje na 5 minut, dokler je zaslon v ospredju. Ko ni,
  se osveževanje ustavi.
- **FR-023** Ploščica z vremenom prikazuje trenutno temperaturo, stanje neba, veter,
  vlažnost in čas meritve za nastavljeno lokacijo.
- **FR-024** Ploščica s kratko napovedjo prikazuje naslednjih nekaj ur oz. dni.
  Podrobna napoved ni v obsegu.
- **FR-025** Zunanji podatki se pridobivajo **prek backenda**, ne neposredno iz brskalnika.
  Backend predpomni odgovore (radar 5 min, vreme 10 min).
- **FR-026** Ob nedosegljivosti vira se prikaže zadnji znani podatek z oznako starosti.
  Prazen zaslon ali tehnična napaka nista sprejemljiva.
- **FR-027** Pri vsakem prikazanem ARSO podatku je naveden vir.
- **FR-028** Vrstni red in vidnost ploščic sta nastavljiva in se ohranita med sejami.

### Obvestila (temelj za 002)

- **FR-030** Aplikacija registrira napravo za potisna obvestila in žeton pošlje strežniku.
- **FR-031** Na Androidu 13+ se za dovoljenje za obvestila vpraša ob prvem zagonu, z
  razlago, zakaj je potrebno.
- **FR-032** Kanali za obvestila so ločeni po vrsti, da jih je mogoče ugašati posamično.
- **FR-033** Tapkanje na obvestilo odpre zaslon, na katerega se obvestilo nanaša.
- **FR-034** Neveljavni žetoni se ob zavrnitvi samodejno odstranijo.

### Postavitev

- **FR-040** `docker compose up` iz čiste kopije pripelje do delujočega sistema, potreben
  je samo izpolnjen `.env`.
- **FR-041** TLS se pridobi in obnavlja samodejno.
- **FR-042** Vsi vsebniki tečejo v časovnem pasu `Europe/Ljubljana`.
- **FR-043** Vsak vsebnik ima zdravstveni pregled in politiko ponovnega zagona.
- **FR-044** V gitu ni nobene prave skrivnosti. Samo `.env.example`.

---

## Preverjeni zunanji viri

Vse preverjeno **19. 8. 2026**.

### Animirana radarska slika ARSO

```
https://meteo.arso.gov.si/uploads/probase/www/observ/radar/si0-rm-anim.gif
```

- HTTP 200, `image/gif`, ~101 kB, animirana
- `cache-control: no-cache, max-age=300` → osveževanje na 5 minut je usklajeno z izvorom
- `last-modified` je bil ob preverjanju svež (istega dne), torej je slika živa
- statična različica: `si0-rm.gif` (~15 kB)
- naslov `si43-rm-anim.gif` vrne **404** — ne uporabljaj

> Stari CleverDash to sliko že uporablja, a prek **`http://`**. Ker bo aplikacija na
> `https://app.si`, bi brskalnik tako sliko zavrnil kot mešano vsebino. Uporabi `https://`
> ali, bolje, backend proxy.

### Vremenski podatki ARSO

```
https://vreme.arso.gov.si/api/1.0/location/?location=Ljubljana
```

- HTTP 200, `application/json`, ~72 kB
- `access-control-allow-origin: *` — deluje tudi neposredno iz brskalnika, a naj se vseeno
  uporabi prek backend predpomnilnika (FR-025), da se ARSO ne obremenjuje z vsakim
  odprtjem zaslona
- struktura: `observation`, `forecast1h`, `forecast3h`, `forecast6h`, `forecast24h`
- vsak del: `features[0].properties.days[].timeline[]`
- uporabna polja v `timeline`: `t` (temperatura °C), `rh` (vlažnost %), `ff_val` in
  `ff_shortText` (veter), `dd_shortText` (smer), `msl` (pritisk), `clouds_shortText`
  (stanje neba, slovensko), `clouds_icon_wwsyn_icon` (ime ikone, npr. `clear_day`),
  `valid` (čas meritve v ISO), `sunrise` in `sunset`
- `observation` vsebuje tudi polje `webcam` s seznamom slik za lokacijo — možen vir za
  zavihek kamer (003)

Primer prebranega odčitka za Ljubljano: `t: "19"`, `rh: "83"`, `clouds_shortText: "jasno"`,
`ff_shortText: "šibek S"`, `valid: "2026-08-19T05:00:00+00:00"`.

### Rezervni viri ARSO (XML)

```
https://meteo.arso.gov.si/uploads/probase/www/observ/surface/text/sl/observation_si_latest.xml
https://meteo.arso.gov.si/uploads/probase/www/fproduct/text/sl/fcast_si_text.xml
https://meteo.arso.gov.si/uploads/probase/www/fproduct/text/sl/fcast_SLOVENIA_MIDDLE_latest.xml
```

Vsi HTTP 200, `application/xml`, prvi z `access-control-allow-origin: *`.
Naslov `fcast_si_latest.xml` vrne **404** — ne uporabljaj.

JSON API je primarni vir; XML je rezerva, če se JSON API spremeni.

### Navedba vira

ARSO podatki se uporabljajo z navedbo vira. Na vsaki ploščici z njihovimi podatki mora
biti vidno "Vir: ARSO" s povezavo na `https://meteo.arso.gov.si`. To je zahteva, ne
vljudnost.

---

## Odprta vprašanja

- [NEEDS CLARIFICATION: katera lokacija je privzeta za vreme? Iz starega sistema sta znani
  Ljubljana (46.0629, 14.5602) in domača lokacija (45.9611, 14.2978). Predlog: Ljubljana
  privzeto, z možnostjo izbire.]
- [NEEDS CLARIFICATION: "ostale stvari, ki jih dodam kasneje" — kaj naj bo na dashboardu
  poleg vremena in radarja? V starem CleverDashu so obstajali zapiski, povezave in zvočni
  zapiski. Predlog: v tej fazi samo vreme in radar, plus prazna mreža, ki sprejme nove
  ploščice.]
- [NEEDS CLARIFICATION: naj bo dashboard sam zavihek, ali začetni zaslon nad zavihki?
  Predlog: začetni zaslon, dosegljiv z logotipom, zavihki pa poleg njega.]
- [NEEDS CLARIFICATION: ali bo aplikacija imela več uporabnikov, ali samo enega z več
  napravami? Vpliva na to, kako globoko gre ločevanje podatkov po uporabniku.]

---

## Kontrolni seznam za sprejem

- [ ] Aplikacija je dosegljiva na `https://app.si` s samodejnim TLS
- [ ] API je pod `https://app.si/api/v1`, brez konfiguriranega CORS-a
- [ ] Prijava, obnova tokena in odjava delujejo na webu in na Androidu
- [ ] Animirana radarska slika se prikaže in premika, ter se osvežuje na 5 minut
- [ ] Vremenska ploščica prikazuje trenutne podatke s časom meritve in navedbo vira
- [ ] Ob izklopljenem omrežju do ARSO se prikaže zadnji znani podatek z oznako starosti
- [ ] Dodajanje četrtega zavihka zahteva samo nov vnos v registru in novo mapo
- [ ] Obvestilo, poslano s strežnika, prispe na Android napravo in odpre pravi zaslon
- [ ] V repozitoriju ni nobene prave skrivnosti
- [ ] `docker compose up` iz čiste kopije deluje samo z izpolnjenim `.env`
