# 002 — Raziskava in tehnične odločitve

Vsaka odločitev navaja izbiro, razlog in zavrnjene alternative. Kar je bilo preverjeno
proti živim virom, je označeno z **[preverjeno]** in datumom preverjanja: 19. 8. 2026.

---

## 1. Stanje ure

To je jedro celotne funkcionalnosti. Stran delodajalca ne pove, ali si na delu — pove
samo, katere gumbe lahko pritisneš. Iz tega nabora se stanje izpelje.

### Stanja

```
OFF_DUTY   — nisi prijavljen na delo
ON_DUTY    — si na delu
ON_BREAK   — si na malici oz. odmoru
UNKNOWN    — branje ni uspelo ali nabor ni prepoznan
```

### Preslikava iz nabora razpoložljivih akcij

| Če je med razpoložljivimi | Stanje |
|---|---|
| `Prijava na delo`, `Prihod na delo`, `Delo od doma` ali `Delo na terenu` | `OFF_DUTY` |
| `Konec malice` | `ON_BREAK` |
| `Malica`, `Odmor med delom` ali `Konec dela` (in ni `Konec malice`) | `ON_DUTY` |
| prazen nabor | `UNKNOWN` — obravnavaj kot okvaro, ne kot stanje |

Vrstni red preverjanja je pomemben: `Konec malice` se preveri **pred** `Konec dela`, ker
sta med odmorom lahko na voljo oba.

### Pričakovano stanje po akciji

| Akcija | Dovoljeno stanje pred | Pričakovano stanje po |
|---|---|---|
| `Prijava na delo` / `Prihod na delo` | `OFF_DUTY` | `ON_DUTY` |
| `Delo od doma` | `OFF_DUTY` | `ON_DUTY` |
| `Delo na terenu` | `OFF_DUTY` | `ON_DUTY` |
| `Malica` | `ON_DUTY` | `ON_BREAK` |
| `Odmor med delom` | `ON_DUTY` | `ON_BREAK` |
| `Konec malice` | `ON_BREAK` | `ON_DUTY` |
| `Konec dela` | `ON_DUTY` | `OFF_DUTY` |

**Ta ena tabela poganja tri stvari hkrati:**

1. **verifikacijo** v načinu `AUTO` — po kliku preberi stanje in primerjaj s pričakovanim;
2. **zaznavo zamujene akcije** v načinu `REMIND_ONLY` — če stanje ni pričakovano, akcija
   se ni zgodila;
3. **preverjanje pred izvedbo** — če je stanje že pričakovano, je akcija `already_done`;
   če ni niti dovoljeno stanje pred, je nekaj narobe in klik bi bil škodljiv.

Točka 3 je pomembna varovalka: prepreči, da bi sistem po restartu pritisnil "Prijava na
delo", ko si že na delu.

**Zavrnjeno:** ugibanje stanja iz lastne zgodovine ("včeraj sem kliknil prijavo, torej sem
na delu"). Uporabnik klika gumbe tudi mimo sistema, zato je edini zanesljiv vir oddaljena
stran.

**Zavrnjeno:** razčlenjevanje besedila strani za urami vpisov. Prekrhko in ni potrebno —
nabor gumbov zadošča.

### Vmesnik brskalniške plasti

Samo dve operaciji, obe brez stranskih učinkov nad domenskim stanjem:

```
readState(location)          → { availableActions[], state, readAt, diagnostics }
performAction(location, action) → { clicked, stateBefore, stateAfter, verified, screenshot? }
```

Vse ostalo (kdaj, kaj, ali je delovni dan) je čista logika brez brskalnika in je enotsko
testirana z lažnim `readState`. Ustava, člen IX.

---

## 2. Puppeteer v Dockerju

### Osnovna slika

**Izbrano:** `node:22-bookworm-slim` s sistemskim Chromiumom iz `apt`, in
`PUPPETEER_SKIP_DOWNLOAD=true` + `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`.

**Zavrnjeno:** `node:21-alpine` s Chromiumom iz Alpine repozitorija — kar uporablja stari
projekt. Deluje, a ima dve težavi: Alpine uporablja musl, kjer Chromium ni uradno podprt in
se občasno sesuje brez uporabne napake, in stari `Dockerfile` pripenja
`--repository=http://dl-cdn.alpinelinux.org/alpine/v3.19/main`, kar je trdo vezanje na
verzijo, ki bo nekoč izginila.

**Zavrnjeno:** uradna slika `ghcr.io/puppeteer/puppeteer` — dobra, a prinese celotno
Puppeteer okolje in oteži postavitev v skupno sliko z API-jem.

### Obvezne nastavitve, ki jih stari projekt nima

| Nastavitev | Zakaj |
|---|---|
| `shm_size: 1gb` v compose (ali `--disable-dev-shm-usage`) | privzeti `/dev/shm` v Dockerju je 64 MB; Chromium se ob nalaganju strani sesuje z `Target closed`. Najpogostejši vzrok "včasih se nič ne zgodi". |
| `TZ=Europe/Ljubljana` | brez tega je vsebnik v UTC |
| `init: true` ali `--init` | Chromium pusti zombi procese; brez `init` se PID 1 zapolni |
| eksplicitna `protocolTimeout` in `timeout` | stari projekt uporablja `timeout: 0`, kar pomeni brez omejitve — obešen klic ostane obešen za vedno in blokira tik |
| omejitev pomnilnika vsebnika | Chromium raste; brez omejitve lahko na VPS-u zmanjka pomnilnika za Mongo |

Glede `--no-sandbox`: stari projekt ga uporablja. Boljša rešitev je pustiti peskovnik
vklopljen in vsebniku dodati `SYS_ADMIN` ali uporabiti Chromiumov seccomp profil. Če to
na VPS-u ni izvedljivo, je `--no-sandbox` sprejemljiv, ker obiskujemo eno samo znano
domeno, a mora biti to zavestna in zapisana odločitev.

### Higiena brskalnika

- **Nov brskalniški kontekst za vsako operacijo**, zaprt v `finally`. Stari projekt zapre
  brskalnik samo na uspešni poti — ob vrženi napaki proces Chromiuma ostane in po nekaj
  dneh jih je na desetine.
- `createBrowserContext()`, ne `createIncognitoBrowserContext()` (preimenovano v v22).
- Brskalnik naj bo dolgo živeč z kratkoživimi konteksti, ne nov zagon ob vsaki akciji —
  zagon je najdražji del in največkrat odpove.
- Ob `Target closed` ali `Protocol error` se brskalnik zavrže in zažene znova.

---

## 3. Kdaj se kaj sproži

**Izbrano:** ena `setInterval` zanka na 30 sekund, ki ob vsakem tiku naredi tri korake:

1. **Poskrbi za načrt.** Za današnji in jutrišnji dan preveri, ali načrt obstaja; če ne,
   ga sestavi (`upsert` na unikatni ključ).
2. **Poberi zapadle akcije.** Poizvedba `state in (planned, due) and scheduledAt <= now`.
3. **Obdelaj jih zaporedno**, eno naenkrat na profil.

To je lenoben, dohitevajoč pristop. Restart kadar koli ne izgubi ničesar, ker načrt živi v
bazi in poizvedba po zapadlih akcijah sama po sebi dohiti zamudo.

**Zavrnjeno:** cron izraz plus okno ob polnoči, kot v starem projektu. Glej
`docs/legacy-engine.md` §4.2 — desetsekundno okno je enojna točka odpovedi za cel dan.

**Zavrnjeno:** čakalna vrsta (BullMQ, Agenda). Doda Redis in operativno površino za
opravilo, ki ima nekaj dogodkov na dan. Dodaj šele, če bo kdaj treba porazdeliti delo.

**Zaklep:** ker bo tekel en sam primerek, zadošča atomarni prehod stanja v Mongu
(`findOneAndUpdate` iz `due` v `running` s pogojem na trenutno stanje). To hkrati služi kot
zaklep in kot zapis. Če bo kdaj več primerkov, isti mehanizem še vedno drži.

**Zamuda:** akcija, ki je zapadla za več kot nastavljeno mejo (privzeto 90 minut), se v
`AUTO` ne izvede več, ampak označi kot `missed` z obvestilom. Prijava na delo ob 14:00,
ker se je vsebnik zbudil, je slabša od nobene prijave.

---

## 4. Časovni pas in koledarski dan

**Izbrano:** vsak trenutek se hrani kot UTC instant. Koledarski dan se hrani **ločeno** kot
niz `YYYY-MM-DD`, izračunan v `Europe/Ljubljana`. Časi v profilih so lokalni časi brez
datuma (`"06:18:00"`), ki se pretvorijo v instant ob sestavljanju načrta.

**Knjižnica:** `Temporal` prek `temporal-polyfill`, ali `Luxon`, če je `Temporal` še
pretvegan. Oba pravilno delata z conami; `date-fns` in domači `Date` ne, brez dodatka.

**Zavrnjeno:** `moment-timezone` — v starem projektu je odvisnost, a je knjižnica v
vzdrževalnem načinu.

**Prehodi na poletni in zimski čas:**

- Zadnjo nedeljo v marcu ura 02:00–03:00 lokalno ne obstaja. Akcija, načrtovana v tem
  presledku, se premakne na prvi obstoječi trenutek za njim.
- Zadnjo nedeljo v oktobru se ura 02:00–03:00 ponovi. Uporabi se **prva** pojavitev.
- Za urnik pon–pet to praktično ni pomembno, ker prehod pade na nedeljo. Vseeno mora biti
  pokrito s testom, ker je to natanko tista vrsta napake, ki se pokaže enkrat na leto in je
  takrat ni mogoče reproducirati.

---

## 5. Slovenski prazniki

**Izbrano:** izračun v kodi kot glavni vir, z ročnimi popravki uporabnika, ki imajo prednost.

Fiksni dela prosti dnevi:

| datum | ime |
|---|---|
| 1. 1. | novo leto |
| 2. 1. | novo leto |
| 8. 2. | Prešernov dan |
| 27. 4. | dan upora proti okupatorju |
| 1. 5. | praznik dela |
| 2. 5. | praznik dela |
| 25. 6. | dan državnosti |
| 15. 8. | Marijino vnebovzetje |
| 31. 10. | dan reformacije |
| 1. 11. | dan spomina na mrtve |
| 25. 12. | božič |
| 26. 12. | dan samostojnosti in enotnosti |

Premikajoči se: velikonočna nedelja in velikonočni ponedeljek (velika noč + 1) ter
binkoštna nedelja (velika noč + 49). Velika noč po anonimnem gregorijanskem algoritmu.

Praznika **17. avgust** (združitev prekmurskih Slovencev) in **23. november** (Rudolfa
Maistra) sta državna praznika, a **nista dela prosta** — model mora ločevati polji
`isHoliday` in `isWorkFree`. Za urnik šteje samo `isWorkFree`.

**Preverjeno [19. 8. 2026]:** `https://date.nager.at/api/v3/PublicHolidays/2026/SI` vrne
HTTP 200 in pravilne slovenske praznike s krajevnimi imeni (`novo leto`, `Prešernov dan`,
`velikonočna nedelja in ponedeljek` …). Uporabno kot **enkratni vir za polnjenje in za
test, ki primerja izračun z zunanjim virom**. Ni pa primeren kot odvisnost med izvajanjem —
zunanja storitev, ki bi ob nedosegljivosti pomenila napačno odločitev o delovnem dnevu.

**Zavrnjeno:** samo zunanji API. Odločitev "ali je danes delovni dan" mora delovati brez
omrežja.

---

## 6. Obvestila na Android

**Izbrano:** Firebase Cloud Messaging prek `firebase-admin` na strežniku in
`@capacitor/push-notifications` v aplikaciji.

Podedovano iz starega projekta, in pravilno: načrtovanje je na strežniku, telefon je samo
prejemnik. Nobenega Android background opravila ni treba, kar odpravi celotno kategorijo
težav z Dozeom in optimizacijo baterije.

Kar mora nova izvedba narediti drugače:

| Točka | Zahteva |
|---|---|
| Poverilnice | montirana datoteka prek `GOOGLE_APPLICATION_CREDENTIALS`, nikoli v kodi (glej `docs/SECURITY-FIRST.md`) |
| Android 13+ | `POST_NOTIFICATIONS` je runtime dovoljenje; brez poziva obvestila tiho ne pridejo |
| Kanali | ločeni kanali za opozorila (visoka pomembnost, zvok), potrditve (nizka) in zdravje; brez tega Android združi vse v en kanal in uporabnik lahko ugasne samo vse hkrati |
| Neveljavni žetoni | ob `messaging/registration-token-not-registered` žeton takoj odstrani; stari projekt jih ne čisti, zato seznam raste in vsako obvestilo pomeni več neuspelih pošiljanj |
| Poglobljene povezave | `data` nosi tip in ID akcije, tapkanje odpre pravi zaslon |
| Zbiranje | `collapseKey` na akcijo, da ponovljeno opozorilo za isto akcijo nadomesti prejšnje in ne kopiči vrstic |

**Preveri pred implementacijo:** ali je za Capacitor 7 primernejši `@capacitor/push-notifications`
ali `@capacitor-firebase/messaging`. Stari projekt ima vključena oba, kar je verjetno
razlog za del zmede v `messaging.service.ts` (ta hkrati uporablja web `getToken` in
Capacitor `PushNotifications.register`, ter ima `saveTokenToFirebase`, ki žetona nikamor ne
shrani).

---

## 7. Idempotentnost in n8n

**Izbrano:** glava `Idempotency-Key` na vseh mutacijskih endpointih. Ključ, metoda, pot,
zgoščena vrednost telesa in odgovor se shranijo za 24 ur. Ponovljena zahteva z istim
ključem vrne shranjeni odgovor.

**Zakaj:** n8n ponavlja zahteve ob časovnih iztekih. Klik na "Prijava na delo" se ne sme
zgoditi dvakrat, ker je sicer prvi ponovni poskus zaradi počasnega brskalnika videti kot
uspeh, dejansko pa je vpis podvojen.

Poleg tega je vsaka akcija zaščitena še na domenski ravni: preverjanje pred izvedbo
(`already_done`) je druga obramba, ki deluje tudi brez pravilne rabe glave.

**Avtentikacija za n8n:** API ključ v glavi `X-API-Key`, shranjen kot zgoščena vrednost
(Argon2id ali scrypt). Obsegi: `state:read`, `action:write`, `schedule:read`,
`schedule:write`, `calendar:write`, `history:read`, `health:read`. n8n za tipično uporabo
potrebuje `state:read`, `action:write` in `history:read`.

**Zavrnjeno:** prijava z uporabnikovim geslom iz n8n. Star pristop bi zahteval hranjenje
gesla v n8n poverilnicah in bi dal polne pravice.

**Izhodni webhooki:** dogodki `action.succeeded`, `action.failed`, `action.missed`,
`session.expiring`, `scheduler.stalled`. Podpisani s HMAC-SHA256 v glavi
`X-CleverDash-Signature`, s časovnim žigom proti ponovnemu predvajanju. Dostava s
ponovnimi poskusi in eksponentnim zamikom.

---

## 8. Nadzor delovanja

Notranji `/api/v1/health` ne zadošča — mrtev proces ne poroča, da je mrtev.

**Izbrano:** dvoplastno.

1. **Notranje:** vsak tik zapiše `Heartbeat`. Endpoint poroča starost zadnjega tika,
   stanje baze, sposobnost zagona brskalnika (predpomnjeno, ne ob vsaki zahtevi),
   dosegljivost strani, veljavnost seje in število napak v 24 urah.
2. **Zunanje:** vsak tik pošlje ping na `HEALTHCHECK_PING_URL` (Healthchecks.io ali
   self-hosted Uptime Kuma s push monitorjem). Če ping ne pride v pričakovanem obdobju,
   alarm pošlje zunanja storitev.

**Zakaj zunanja storitev:** zahteva "preveri, ali aplikacija dela" je logično nerešljiva od
znotraj. To je edini del sistema, ki mora biti zunaj njega.

**Posebna pozornost — polnjenje diska:** stari projekt piše dnevne rotirane dnevnike
(`winston-daily-rotate-file`, 30 dni) in v produkciji še ni določen `LOG_FILE_PATH`. Novi
sistem hrani posnetke zaslona, kar je bistveno večje. Zdravstveni endpoint mora poročati o
prostoru na disku, čiščenje pa mora biti samodejno.

---

## 9. Preverjeni zunanji viri

| Vir | Rezultat |
|---|---|
| `https://e-racuni.com/S6a/Clockin-...` | naslov iz `.env`; **ni bil klican med to raziskavo**, ker bi vsaka zahteva lahko vplivala na pravo evidenco delovnega časa |
| `https://date.nager.at/api/v3/PublicHolidays/2026/SI` | **[preverjeno]** HTTP 200, pravilni slovenski prazniki s krajevnimi imeni |

Naslov e-računov namenoma ni bil obiskan. Med raziskavo je bilo treba ugotoviti, kako
engine deluje, in to je razvidno iz kode. Klicanje živega naslova bi lahko spremenilo
pravo evidenco, kar ni sprejemljiv stranski učinek raziskave.

**Pred implementacijo je treba na živem naslovu preveriti:**

- ali selektor `a.clockin-button` še drži,
- ali je element `addHomeScreenDiv` še prisoten,
- točna slovenska besedila gumbov,
- ali je mobilni user-agent še pogoj za prikaz gumbov,
- ali seja iz `.env` še velja (skoraj zagotovo ne — glej `docs/legacy-engine.md` §4.10).

To se opravi z endpointom za branje stanja v `dry-run` načinu, ki ne klika ničesar.
