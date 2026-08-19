# Funkcionalnost 003 — Zavihek kamer

**Odvisnost:** 001 (ogrodje, avtentikacija, predpomnilnik, proxy)

---

## Namen

Hitri pregled kamer in živih slik na enem zaslonu. Namen je pogledati enkrat in vedeti,
kakšno je stanje — na cesti, doma, na priljubljenih lokacijah — brez odpiranja več strani.

Zahteva je bila "pregled kamer". Kaj to konkretno pomeni, je razvidno iz starega
CleverDasha, kjer zaslon `camera.component.html` (v meniju "Quick check") že združuje
štiri različne vrste virov. Ta specifikacija to formalizira.

## Kaj je bilo najdeno v starem CleverDashu

`cleverdash/src/app/pages/camera/camera.component.html` prikazuje:

| Vir | Oblika | Opomba |
|---|---|---|
| `toWorkUrl` in `fromWorkUrl` | `<iframe>`, naslov je **na uporabnika** v `User` modelu | pot v službo in domov; verjetno vdelan zemljevid s prometom |
| `g0.ipcamlive.com/player/snapshot.php?alias=znpvkamera2` | JPEG posnetek, ki je hkrati povezava na predvajalnik `player.php?alias=…` | kamera Planina |
| `youtube.com/embed/YtJwF8YXqYM`, `…/dKP6BM3UI7A` | YouTube vdelava | žive kamere "Goli" in "Škitača" |
| `istrastream.com/cam/sveta_marina/cam_1.jpg?<številka>` | JPEG posnetek s poizvedbenim parametrom za obhod predpomnilnika | |
| ARSO radar `si0-rm-anim.gif` | animirani GIF | v novi aplikaciji sodi na dashboard (001) |

Dva vzorca sta vredna prenosa:

1. **Posnetek kot predogled, predvajalnik ob kliku.** Cenejše od stalnega predvajanja več
   tokov, in na telefonu bistveno prijaznejše do prenosa podatkov.
2. **Razvrščanje po času dneva.** Pred poldnem je prva "V službo", po poldnem "Domov"
   (`firstToWork` v `camera.component.ts`). Majhna stvar, ki pa pomeni, da je zaslon
   pravilen že ob odprtju.

## Kaj je bilo najdeno kot problem

- `bypassSecurityTrustHtml` z naslovom iz uporabnikovega zapisa sestavi HTML `<iframe>`
  kot niz. To je vbrizg HTML-ja iz podatkov in ga je treba nadomestiti s tipiziranim
  modelom in preverjenim naslovom.
- Vsi naslovi so trdo zapisani v predlogi. Dodajanje kamere pomeni spremembo kode.
- Trije viri so bili `http://`. Ker bo aplikacija na `https://app.si`, bi jih brskalnik
  zavrnil kot mešano vsebino.

**Preverjeno 19. 8. 2026:** vsi ti viri delujejo tudi prek `https://`
(`g0.ipcamlive.com/player/snapshot.php` → 200 `image/jpeg`,
`istrastream.com/cam/sveta_marina/cam_1.jpg` → 200 `image/jpeg`), predvajalnik
`ipcamlive.com/player/player.php` pa ne pošilja `X-Frame-Options` in se torej sme vdelati
v `<iframe>`.

---

## Uporabniške zgodbe

### Z1 — Odprem zavihek in vidim vse hkrati

**Kot** uporabnik **želim** mrežo predogledov, **da** z enim pogledom vem, kaj se dogaja.

- **Dano** je nastavljenih več kamer
- **Ko** odprem zavihek
- **Takrat** se prikaže mreža predogledov s časom zajema pri vsakem
- **In** predogledi se osvežujejo v nastavljenem intervalu, dokler je zaslon v ospredju.

### Z2 — Ena kamera na cel zaslon

**Kot** uporabnik **želim** tapkati na kamero in jo videti veliko, **da** pogledam
podrobnosti.

- **Dano** je prikazana mreža
- **Ko** izberem kamero
- **Takrat** se odpre na celotnem zaslonu, in če vir ponuja živi tok, se predvaja ta
  namesto posnetka
- **In** vrnitev v mrežo živi tok ustavi.

### Z3 — Dodam kamero brez posega v kodo

**Kot** uporabnik **želim** kamero dodati v aplikaciji, **da** za novo kamero ni potreben
nov build.

- **Dano** je odprt zaslon za urejanje kamer
- **Ko** vnesem ime, vrsto in naslov
- **Takrat** se kamera pojavi v mreži
- **In** vrstni red kamer lahko spremenim s premikanjem.

### Z4 — Kamera ne dela

**Kot** uporabnik **želim** ločiti "ni dežja" od "kamera ne dela", **da** praznega
kvadrata ne razumem narobe.

- **Dano** je, da vir ne odgovori
- **Takrat** ploščica prikaže zadnjo uspešno sliko, zatemnjeno, z oznako starosti in
  jasnim opozorilom
- **In** ostale kamere delujejo normalno
- **In** po nastavljenem številu neuspehov se kamera označi kot nedosegljiva in se
  osveževanje upočasni.

### Z5 — Razvrstitev po času dneva

**Kot** uporabnik **želim** najprej videti tisto, kar je zdaj pomembno, **da** ne iščem.

- **Dano** je kamera z oznako "dopoldne" in druga z oznako "popoldne"
- **Ko** odprem zavihek pred poldnem
- **Takrat** je prva na vrsti dopoldanska
- **In** po poldnem je vrstni red obrnjen.

### Z6 — Prenos podatkov na telefonu

**Kot** uporabnik na mobilnem omrežju **želim** nadzor nad porabo, **da** mi zavihek ne
poje prenosa.

- **Dano** je, da sem na mobilnem omrežju
- **Takrat** se predogledi osvežujejo redkeje in živi tokovi se ne zaženejo samodejno
- **In** to vedenje je mogoče izklopiti.

---

## Funkcionalne zahteve

### Model kamere

- **FR-001** Kamere so podatek, ne koda. Vsaka ima ime, vrsto, naslov, interval
  osveževanja, skupino, vrstni red in stikalo.
- **FR-002** Podprte vrste virov:

  | vrsta | pomen |
  |---|---|
  | `snapshot` | statična slika, osvežena s parametrom za obhod predpomnilnika |
  | `mjpeg` | zveznі MJPEG tok |
  | `hls` | HLS tok (`.m3u8`) |
  | `iframe` | vdelana tuja stran (YouTube, ipcamlive predvajalnik, zemljevid s prometom) |
  | `snapshot+iframe` | posnetek kot predogled, vdelava ob kliku — vzorec iz ipcamlive |

- **FR-003** Kamera ima lahko ločen naslov za predogled in za polni prikaz.
- **FR-004** Kamera ima lahko časovno oznako (`morning`, `afternoon`, `always`), ki vpliva
  na vrstni red.
- **FR-005** Poverilnice, če jih vir zahteva, so shranjene šifrirano in se prek API-ja
  nikoli ne vrnejo.

### Prikaz

- **FR-010** Privzeti prikaz je mreža predogledov, odzivna na širino zaslona.
- **FR-011** Vsak predogled prikaže čas zajema in stanje (v redu, staro, nedosegljivo).
- **FR-012** Izbrana kamera se odpre na celotnem zaslonu; če ima živi tok, se ta predvaja.
- **FR-013** Osveževanje in tokovi se ustavijo, ko zaslon ni v ospredju.
- **FR-014** Vrstni red je nastavljiv ročno, znotraj tega pa velja časovna oznaka (FR-004).
- **FR-015** Kamere je mogoče združiti v skupine (npr. "Pot", "Morje", "Doma") in skupino
  zložiti.

### Dostop do virov

- **FR-020** Naslovi virov gredo skozi backend proxy, kadar je vir dosegljiv samo prek
  `http://`, zahteva poverilnice, ali je v lokalnem omrežju. Sicer se lahko naložijo
  neposredno.
- **FR-021** Proxy predpomni posnetke za interval kamere, da ena kamera na več napravah ne
  pomeni več zahtev na vir.
- **FR-022** Naslovi `iframe` virov so preverjeni proti seznamu dovoljenih gostiteljev.
  HTML se **nikoli** ne sestavlja iz niza — vdelava je tipizirana komponenta s preverjenim
  naslovom.
- **FR-023** Proxy ne posreduje poljubnega naslova. Posreduje samo naslove nastavljenih
  kamer, naslovljene po ID-ju kamere, ne po naslovu v poizvedbi.
- **FR-024** Vsi viri so v aplikaciji predstavljeni prek `https`. Vir, ki podpira samo
  `http`, gre obvezno prek proxyja.

### API

- **FR-030** Kamere so v celoti obvladljive prek `/api/v1/cameras`: seznam, dodajanje,
  urejanje, brisanje, spreminjanje vrstnega reda.
- **FR-031** `GET /api/v1/cameras/{id}/snapshot` vrne trenutni posnetek prek proxyja.
- **FR-032** `GET /api/v1/cameras/{id}/health` pove, ali je vir dosegljiv, in kdaj je bil
  nazadnje.

---

## Ključne entitete

| Entiteta | Bistvena polja |
|---|---|
| `Camera` | ime, vrsta, naslov predogleda, naslov polnega prikaza, interval, skupina, časovna oznaka, vrstni red, aktivna, poverilnice (šifrirano) |
| `CameraGroup` | ime, vrstni red, zloženo |
| `CameraHealth` | zadnji uspeh, zadnja napaka, zaporedni neuspehi, stanje |

---

## Odprta vprašanja

- [NEEDS CLARIFICATION: **katere kamere naj bodo v novi aplikaciji?** Znane iz starega
  CleverDasha: ipcamlive "znpvkamera2" (Planina), YouTube "Goli" in "Škitača",
  istrastream Sveta Marina, ter uporabniška `toWorkUrl` in `fromWorkUrl`. Ali gre za te,
  ali tudi za lastne kamere doma?]
- [NEEDS CLARIFICATION: ali obstajajo **lastne kamere v domačem omrežju** (RTSP, Reolink,
  Hikvision, Shelly …)? Če da, se obseg bistveno spremeni: RTSP se v brskalniku ne
  predvaja neposredno in bi potreboval pretvorbo v HLS ali WebRTC na strežniku, ta
  strežnik pa mora biti v istem omrežju kot kamere — kar VPS ni.]
- [NEEDS CLARIFICATION: kaj sta `toWorkUrl` in `fromWorkUrl` v starem modelu? Videti sta
  kot vdelan zemljevid s prometom za pot v službo in domov. Če je tako, ne gre za kameri in
  bi bili morda primernejši kot ploščici na dashboardu.]
- [NEEDS CLARIFICATION: ali naj bodo ARSO spletne kamere ponujene kot vir? Vremenski API
  ARSO v odgovoru za lokacijo vsebuje polje `webcam` s seznamom slik (glej
  `nacrt/001-app-shell-dashboard/spec.md`). To bi pomenilo kamere brez ročnega vnašanja
  naslovov.]
- [NEEDS CLARIFICATION: ali je potrebno snemanje ali zgodovina posnetkov, ali samo pogled
  v živo? Predlog: samo pogled v živo — snemanje je bistveno večji obseg.]

> Prvi dve vprašanji sta pomembni za `/speckit-plan`. Če gre samo za javne spletne vire, je ta
> funkcionalnost majhna. Če gre za lastne kamere v domačem omrežju, je potrebna dodatna
> komponenta znotraj domačega omrežja in to je samostojna funkcionalnost.

---

## Kontrolni seznam za sprejem

- [ ] Mreža prikaže vse aktivne kamere s časom zajema
- [ ] Dodajanje kamere ne zahteva novega builda
- [ ] Nedosegljiva kamera je vidno označena in ne izprazni zaslona
- [ ] Vir, dosegljiv samo prek `http`, se v aplikaciji prikaže brez opozorila o mešani
      vsebini
- [ ] `iframe` vdelava je tipizirana komponenta, nikjer ni `bypassSecurityTrustHtml` nad
      podatki
- [ ] Proxy ne sprejme poljubnega naslova, samo ID nastavljene kamere
- [ ] Osveževanje se ustavi, ko zaslon ni v ospredju
- [ ] Razvrstitev po času dneva deluje pred in po poldnem
