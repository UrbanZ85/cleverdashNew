# Obstoječi engine — princip delovanja in napake, ki jih ne ponovimo

Vir: `d:\programiranje\privat\belezenje_casa`

Ključne datoteke: `belezenje-casa-BE/src/repository/working-hours.ts` (Puppeteer),
`belezenje-casa-BE/src/services/scheduler.ts` (urnik), `belezenje-casa-BE/src/app.ts` (cron).

Ta dokument je **referenca za implementacijo**, ne zahteva. Prenesi princip, ne kode.

---

## 1. Kaj engine v resnici počne

Ciljna stran je javni "clock-in" naslov e-računov, ki ne zahteva prijave z geslom —
identiteto nosi **piškotek seje**, naslov sam pa vsebuje žeton:

```
https://e-racuni.com/S6a/Clockin-0BD5119EC3F00D00AFEED55901C42A1D
```

Postopek v Puppeteerju:

1. Zagon Chromiuma. V produkciji `headless: true` in `executablePath: /usr/bin/chromium`
   (sistemski Chromium iz Alpine paketa), v razvoju `headless: false` in lokalni Chrome.
2. Nov brskalniški kontekst — v stari kodi `createIncognitoBrowserContext()`,
   kar je **v Puppeteer v22+ preimenovano v `createBrowserContext()`**.
3. `context.overridePermissions(url, ["geolocation"])` — stran zahteva lokacijo.
4. `page.setGeolocation({ latitude, longitude })`.
5. `page.setUserAgent(...)` z mobilnim Android/Chrome nizom — stran se takrat obnaša
   kot mobilna in prikaže gumbe za registracijo.
6. `page.setCookie({ name, value, domain })` — nosilec identitete.
7. `page.goto(url)`.
8. Odstrani moteči poziv: `document.getElementById("addHomeScreenDiv").remove()`
   (poziv "Dodaj na začetni zaslon" prekriva gumbe).
9. Prebere razpoložljive gumbe: selektor **`a.clockin-button`**, besedilo iz `innerText`.
10. Za klik poišče med vsemi `a` elementi tistega, katerega `innerText` vsebuje iskano
    ime, in ga klikne.

## 2. Najpomembnejši vpogled: seznam gumbov razkriva stanje

Stran nikoli ne prikaže vseh gumbov hkrati — samo tiste, ki so v trenutnem stanju
smiselni. **Množica razpoložljivih gumbov je torej berljivo stanje ure.**

Stara koda to že intuitivno uporablja: po kliku preveri, ali se je pojavil *naslednji
pričakovani* gumb (`checkIfButtonExistsAndClikIt` → `checkIfButtonExists`):

| Kliknjeno | Pričakuje se pojav |
|---|---|
| Delo na terenu / Prijava na delo / Delo od doma | Malica |
| Malica | Konec malice |
| Konec malice | Konec dela |
| Konec dela | Prijava na delo |

Ta ideja je pravilna in je temelj nove implementacije — samo formalizirati jo je treba
v pravo stanje (glej `nacrt/002-time-tracking/research.md`, poglavje "Stanje ure").

Znana imena gumbov, kot se pojavljajo v kodi in komentarjih:

```
Prihod na delo | Prijava na delo | Delo od doma | Delo na terenu
Malica | Konec malice | Odmor med delom | Konec dela
```

> Opomba: v komentarjih se pojavljata tako "Prihod na delo" kot "Prijava na delo",
> logika pa uporablja "Prijava na delo". Prava imena je treba **prebrati z živega
> naslova** (endpoint `GET /api/v1/time-tracking/available-actions`) in jih ne trdo
> kodirati.

## 3. Trik z GPS raztrosom — ohrani ga

Koordinate niso zapisane kot števila, ampak z znakom `_` na mestu zadnje decimalke:

| lokacija | latitude | longitude |
|---|---|---|
| Agenda LJ | `46.0629_6` | `14.5602_9` |
| Doma | `45.9611_0` | `14.2978_7` |

`replaceDashWithNumber()` v `repository/common.ts` zamenja `_` z naključno števko 0–9,
torej `46.0629_6` postane `46.06293`. Rezultat: vsaka registracija ima nekoliko drugačno
lokacijo znotraj približno 10 m, kar je videti kot naravna GPS negotovost namesto kot na
milimeter enak zapis vsak dan.

**Ohrani princip.** Formaliziraj ga kot `coordinateTemplate` z eksplicitnim
`jitterMeters`, namesto skritega pomena podčrtaja.

Enak pristop je uporabljen za čase v `scheduler.ts`:

```
generateRandomMinuteInterval(m) = m + random(0..9)
generateRandomSecondInterval(s) = s + random(0..58)
```

Urnik se torej ne sproži vsak dan na isto sekundo. **Ohrani, a popravi hrošč
prelivanja — glej §4.4.**

---

## 4. Napake v obstoječi kodi — nova implementacija jih ne sme imeti

### 4.1 Časovni pas (resno)

`toISOString().split("T")[0]` vrne **UTC** datum. Urnik je v `Europe/Ljubljana`
(UTC+1 oz. UTC+2). Poleti akcija ob 00:30 lokalno pade na prejšnji UTC dan, zato
primerjava `scheduledDate: { $eq: today }` takrat ne najde ničesar.

→ Uporabi eksplicitno cono za koledarski dan in UTC instant za trenutek.

### 4.2 Dnevni načrt se ustvari samo v 10-sekundnem oknu

```ts
if (currentDateTime.getHours() == 0 && currentDateTime.getMinutes() >= 0
    && currentDateTime.getSeconds() < 10) { ... }
```

Cron teče vsakih 60 s, torej je uspeh odvisen od tega, ali tik pade v prvih 10 sekund
dneva. Restart containerja ob 00:00:11 pomeni **cel dan brez načrta in brez opozorila**.

→ Načrt se ustvari lenobno: vsak tik preveri, ali načrt za današnji dan obstaja, in ga
po potrebi ustvari. Nič ni vezano na določeno sekundo.

### 4.3 Globalno preverjanje podvajanja (resno)

```ts
const dateAlreadyInDB = await SchedulerTimes.findOne({ scheduledDate: today });
if (!dateAlreadyInDB) { /* ustvari vnose za TA profil */ }
```

Pogoj ne omenja profila. Ko prvi profil ustvari vnose za danes, so **vsi ostali profili
tisti dan preskočeni**. Z več profili (Agenda in doma) je to tiha izguba.

→ Unikatni indeks na `(localDate, profileId, actionType)` in `upsert` na ta ključ.

### 4.4 Raztros časa lahko prelije v naslednjo uro

`m + random(0..9)` pri `m = 55` da 64, in `setMinutes(64)` premakne uro naprej.
Enako `s + random(0..58)` pri `s = 30` da 88, kar doda minuto.
Pri `workdayEnd = "14:55:00"` se lahko "Konec dela" izvede po 15:04.

→ Raztros izvedi kot `base + random(0..jitterSeconds)` nad celotnim instantom, z
eksplicitno zgornjo mejo, in ga **shrani** v zapis. Tako je čas vnaprej znan in viden v
UI, ne pa naključno izračunan šele ob izvedbi.

### 4.5 `ClickOnButton` vrne `true`, tudi če gumba ni bilo

```ts
await this.checkIfButtonExistsAndClikIt(page, buttonName);
await browser.close();
return true;          // <- vedno, razen ob vrženi napaki
```

Manjkajoč gumb sicer pošlje obvestilo, a funkcija vrne uspeh; klicatelj nato zapiše
`task.executed = true`. Zabeležena zgodovina torej trdi, da je akcija uspela.

→ Izid mora biti eksplicitno stanje (`succeeded` / `failed` / `missed`), izpeljano iz
**ponovnega branja stanja**, in ne iz odsotnosti izjeme.

### 4.6 Verifikacija bere zastarel DOM

`checkIfButtonExists` po kliku išče gumbe na isti instanci strani, brez `page.reload()`
ali čakanja na navigacijo — zato pogosto vidi predklikni DOM.
Vrstica `await new Promise(r => setTimeout(r, 5000))` se izvede **šele potem, ko je gumb
že najden**, torej pri verifikaciji ne pomaga.

→ Po kliku počakaj na navigacijo oz. omrežno tišino, **ponovno naloži stran** in preberi
stanje. Verifikacija je samostojen `readState()` klic.

### 4.7 Neawaitani zapisi in `async` znotraj `forEach`

```ts
tasksToExecute.forEach(async (task) => { ... task.save(); ... });
todayWDayStartNewDate.save();   // brez await
```

`forEach` ne čaka na `async` povratne klice: napake postanejo neulovljene zavrnitve,
več klikov lahko teče vzporedno, proces se lahko konča pred zapisom.

→ Zaporedna obdelava (`for...of` z `await`), vsak zapis `await`, in en klik naenkrat na
profil (zaklep).

### 4.8 Trdo kodiran naslov prejemnika

`urban.zupancic@gmail.com` se pojavi na več kot šestih mestih v `scheduler.ts`,
`working-hours.ts` in `logging-service.ts`.

→ Prejemniki se razrešijo iz lastnika profila.

### 4.9 Skrivnosti v kodi in v gitu (kritično)

`services/messaging-service.ts` vsebuje **celoten privatni ključ** Firebase service
accounta, zapisan neposredno v klic `admin.initializeApp({...})`.
`docker-compose.yml` in `.env` vsebujeta JWT secret, SMTP geslo (`EMAIL_PASSWORD`),
admin geslo in sejni piškotek e-računov.

→ Glej `docs/SECURITY-FIRST.md`. Vse to je treba zavrteti, ne prekopirati.

### 4.10 Sejni piškotek tiho poteče

`cookie_property_expires: 1737717074` je **24. januar 2025** — davno potekel.
Vrednost se ob `setCookie` sploh ne pošilja kot `expires`; zapisana je le v bazi in ni
nikoli preverjena. Ko seja poteče, stran ne prikaže gumbov, sistem to obravnava kot
"gumba ni" in dan za dnem pošilja isto obvestilo, brez navedbe pravega vzroka.

→ Poteklost piškotka je prvorazredno stanje: opozorilo N dni prej, jasna diagnoza
("seja e-računov je potekla, vpiši nov piškotek") in ločen zdravstveni indikator.

### 4.11 `verifyAdmin` ne preverja vloge

```ts
/* if (decodedToken && ...role === Roles.Admin) next(); */
if (decodedToken) next();
```

Preverjanje vloge je zakomentirano — vsak veljaven token je administrator.

→ Prava avtorizacija na podlagi vlog in obsegov.

### 4.12 CORS

`cors({ credentials: true, origin: "*" })` je po specifikaciji neveljavna kombinacija in
je hkrati nepotrebna. Nova arhitektura je enotni izvor (`/api` na isti domeni), zato
CORS ni potreben.

### 4.13 Manjše, a moteče

- `SALT_ROUNDS` se v `app.ts` bere kot `+process.env.SALT_ROUNDS!`, a v `.env` manjka →
  `NaN` → `bcrypt.genSalt(NaN)`. V `docker-compose.yml` je nastavljen, v dev okolju ni.
- `LOG_FILE_PATH` uporablja `logging-service.ts`, a v `.env` ni definiran.
- `.env` meša dve sintaksi: `KLJUC = vrednost` za nekatere vnose in `KLJUC: vrednost` za
  druge (`EMAIL_INFO:`, `EMAIL_SERVER_HOST:`, `EMAIL_PASSWORD:` …). Vrstic z dvopičjem
  `dotenv` **ne prebere** — te vrednosti so v razvoju `undefined`.
- Refresh tokeni: model `user-refresh-tokens.ts` obstaja, a se ne uporablja; prijava
  vrača `refreshToken: ""`.
- `IScheduler.pauseUntil` je edini obstoječi mehanizem za dopust: `string`, primerjan z
  `new Date(element.pauseUntil.toString().split("T")[0])`. Nadomesti ga pravi koledar
  odsotnosti.
- `SchedulerTimes.taskId` je deklariran, a se nikoli ne nastavi, zato zgodovina ne ve, iz
  katerega profila zapis izhaja.

---

## 5. Kaj je vredno prenesti

- Princip branja stanja iz množice razpoložljivih gumbov (§2).
- GPS raztros s šablono koordinat (§3).
- Časovni raztros urnika (§3), s popravljenim prelivanjem.
- Mobilni user-agent, `overridePermissions` za geolokacijo in odstranitev
  `addHomeScreenDiv` — brez teh treh stran ne pokaže gumbov.
- Profili, vezani na dneve tedna (`daysToStart: [1,2,3,4]` = pon–čet v Agendi, `[5]` =
  petek od doma), z ločenimi koordinatami na lokacijo.
- Zgodovina v ločeni kolekciji, da tekoči načrt ostane majhen.
- Docker: Chromium se namesti v sliko in se uporabi prek `executablePath`; Puppeteer si
  svojega ne prenaša.

## 6. Vhodni podatki za migracijo

Obstoječi profili iz `mongo-insert-schedule.txt`:

| dnevi | od doma | začetek | malica | konec malice | konec |
|---|---|---|---|---|---|
| 1,2,3,4 (pon–čet) | ne | 06:18 | 10:02 | 10:31 | 14:20 |
| 5 (pet) | da | 06:28 | 10:42 | 11:08 | 14:30 |

> Pozor: v komentarju v `db-models/scheduler.ts` so drugačni časi (07:18 …) kot v
> `mongo-insert-schedule.txt`. Pravo stanje preberi iz produkcijske baze
> (`db.schedulers.find()`), preden karkoli migriraš.

Frontend (`belezenje.page.ts`) je privzeto izbral lokacijo "Doma", če je bil petek,
sicer "Agenda" — enaka logika kot razdelitev profilov po dnevih.
