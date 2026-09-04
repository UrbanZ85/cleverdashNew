# Research: Shranjeni linki (008)

Faza 0. Vsaka točka je odločitev, ne razmislek — kaj je izbrano, zakaj, in kaj je bilo
zavrnjeno. Odprta vprašanja iz `nacrt/008-saved-links/spec.md` so tu zaprta (§2, §4, §8, §9,
§13).

---

## §1 Lasten modul ali razširitev vtičnikov iz 005?

**Odločitev:** lasten modul `saved-links` z lastno kolekcijo, lastnim zavihkom in lastno
pogodbo.

**Zakaj:** vtičnik (`DashboardPlugin`) je opis PLOŠČICE — nosi `widthPx`, `heightPx`,
`refreshSeconds`, njegova razporeditev je v `Settings.tiles`, in ime mu mora biti edinstveno
na uporabnika. Vse to je za knjižnico shranjenih strani napačno: zapisov je poljubno mnogo,
nimajo mesta na nadzorni plošči, dve strani se lahko imenujeta enako, in nobene od naštetih
lastnosti ne potrebujejo. Vsiljevanje obojega v en model bi pomenilo shemo, kjer je polovica
polj vedno prazna, in `Settings.tiles`, ki bi rasel s številom shranjenih strani.

**Zavrnjeno:** `kind: 'bookmark'` kot peta vrsta vtičnika. Prihranil bi eno kolekcijo, stal
pa bi razporeditev, ki raste brez omejitve, in mešanje dveh življenjskih ciklov v enem
modelu.

## §2 Kdaj se prebere ime strani (odprto vprašanje 1)

**Odločitev:** SINHRONO ob shranjevanju, s trdim proračunom 2,5 s in vedno z nadomestkom.
Zaporedje je: normaliziraj naslov → shrani zapis → poskusi prebrati `<title>` znotraj
proračuna → če uspe in uporabnik imena ni vpisal, ga dopolni v istem odgovoru. Odgovor nosi
`metadataStatus`: `ok`, `skipped` (naslov ni prestal varovala) ali `failed` (napaka ali
prekoračen proračun).

**Zakaj:** FR-004 zahteva, da shranjevanje ni odvisno od dosegljivosti strani — to je tu
izpolnjeno, ker se zapis ustvari PRED branjem in se ob neuspehu ne razveljavi. Uporabnik
vidi končno ime takoj (SC-001 daje 10 s, proračun je 2,5 s), brez osveževanja seznama.

**Zavrnjeno:**

- **Branje v ozadju** (`void fetch(...)` po odgovoru). Zahteva stanje opravila ali
  poizvedovanje z odjemalca, uporabnik pa najprej vidi gol naslov, ki se čez sekundo sam
  spremeni. Za eno polje je to preveč mehanizma; in tiho spodletelo branje v ozadju je
  natanko tisto, kar člen VII imenuje hrošč.
- **Branje ob prvem izrisu seznama.** Deset novih zapisov bi pomenilo deset odhodnih klicev
  ob odprtju zavihka (člen VIII).

## §3 Preusmeritve pri branju naslova

**Odločitev:** največ 3 skoki, `redirect: 'manual'`, vsak cilj gre ZNOVA skozi varovalo iz
§5. Cikel ali četrti skok pomeni `failed`.

**Zakaj:** 005 uporablja `redirect: 'error'`, ker je tam naslov vira podatkov, ki se ne sme
tiho premakniti. Tu je drugače: shranjena stran je pogosto `http://` naslov, ki se preusmeri
na `https://`, ali skrajšan naslov. Zavrniti preusmeritve bi pomenilo, da samodejno branje
imena pri velikem delu resničnih naslovov ne bi nikoli delovalo. Ponovno preverjanje vsakega
skoka je pogoj — brez njega je preusmeritev pot mimo varovala naravnost v notranje omrežje.

## §4 Kje živi favicon (odprto vprašanje 2)

**Odločitev:** v zapisu se hrani samo RAZREŠENI NASLOV favicona (`faviconUrl`), slike ne.
Bajti gredo prek `GET /saved-links/{id}/favicon`, ki jih prenese strežnik prek
`platform/cache/service.ts` s ključem `favicon:<gostitelj>` in TTL 7 dni.

**Zakaj:** ključ po GOSTITELJU in ne po zapisu je bistvo — dvajset shranjenih strani z
`github.com` je en prenos, ne dvajset (člen VIII). TTL 7 dni, ker se favicon skoraj nikoli
ne spremeni. Naslov se razreši iz `<link rel="icon">` v dokumentu, sicer `/favicon.ico` na
istem gostitelju.

**Zavrnjeno:**

- **Bajti v dokumentu (base64).** Napihne zapis, podvoji isto sliko pri vsakem zapisu istega
  gostitelja in ne zna zastarati.
- **Odjemalec sam kliče `https://gostitelj/favicon.ico`.** Krši člen VIII in seznam
  uporabnikovih shranjenih strani razkrije vsakemu od teh gostiteljev ob vsakem izrisu.

## §5 Varovalo odhodnih naslovov — obstoječe, ne novo

**Odločitev:** uporabi se `domain/outbound-url.ts` iz 005 nespremenjen. Kar ne prestane
(poverilnice v naslovu, zasebni/link-local gostitelj, shema, ki ni http/https, predolg
naslov), se preprosto NE OBIŠČE — zapis pa vseeno obstane z `metadataStatus: 'skipped'`.

**Zakaj:** to je razlika, ki jo je vredno izreči na glas. Kamere (003) `http://` in zasebne
naslove DOVOLIJO, ker gre vir prek proxyja; vtičniki (005) jih ZAVRNEJO, ker jih strežnik
obišče in vrne naprej. Shranjeni link je tretji primer: naslov je samo shranjen in ga odpre
BRSKALNIK, zato je `http://192.168.1.1` (usmerjevalnik) povsem legitimen zapis — nedopustno
je le, da bi ga obiskal STREŽNIK. Zato varovalo tu ne odloča o veljavnosti zapisa, ampak
samo o tem, ali se metapodatki sploh berejo.

## §6 Iskanje s šumniki brez besedilnega indeksa

**Odločitev:** ob vsakem pisanju se izračuna polje `searchText` = zloženi (`fold`) niz
`ime + naslov + komentar`. Zlaganje je čista funkcija: `toLowerCase()` + `normalize('NFD')` +
odstranitev diakritičnih znakov. Poizvedba je `RegExp` z ubranim vzorcem nad `searchText`.

**Zakaj:** `č → c`, `š → s`, `ž → z` pridejo iz Unicode normalizacije same, brez tabele
preslikav. Ker je zbirka nekaj sto zapisov na uporabnika (Assumptions v spec.md), je pregled
po `userId` poceni; kar bi prinesel indeks, je pri tej velikosti nemerljivo.

**Zavrnjeno:** Mongo besedilni indeks (`$text`). Ne pozna iskanja po delu besede (`arso` ne
najde `arso.gov.si` kot podniz), krni besede po jeziku in slovenščine ne podpira.

**Odjemalec:** isti postopek zlaganja je še enkrat na spletni strani
(`core/search/fold-text.ts`), ker seznam že ima naložen, in filtriranje v pomnilniku je
takojšnje (SC-003) brez klica na strežnik ob vsaki tipki. Podvojitev je zavestna in majhna
(pet vrstic); oba izvoda imata isti nabor enotskih testov. Uvoz z ene strani na drugo ni
mogoč — `apps/api` in `apps/web` sta ločena paketa.

## §7 Vrstni red

**Odločitev:** ponovno se uporabi `domain/camera-order.ts#toOrderAssignments` — čista
funkcija, ki seznam ID-jev preslika v `{ id, order }`. `PUT /saved-links/order` posodobi
samo poslane ID-je, ostali ostanejo nedotaknjeni.

**Zakaj:** funkcija je splošna, `domain/` sme uporabiti vsak modul (člen I prepoveduje uvoz
med MODULI, ne iz domenske plasti). Ime datoteke je zgodovinsko — preimenovanje v
`domain/order-assignments.ts` bi se dotaknilo 003 in sodi v ločen čistilni PR, ne v to
funkcionalnost.

**Zavrnjeno:** trivialna podvojitev iste treh-vrstične funkcije pod novim imenom.

## §8 Brisanje mape (odprto vprašanje 4)

**Odločitev:** brisanje mape njene zapise PREMAKNE med nerazvrščene (`groupId: null`), z eno
posodobitvijo pred brisanjem mape same. Odgovor pove, koliko zapisov je bilo premaknjenih.

**Zakaj:** zapis je delo uporabnika, mapa je zgolj njegova razvrstitev. Izguba zapisa ob
brisanju mape je nesorazmerna posledica in FR-022 jo prepoveduje.

**Zavrnjeno:** zavrnitev brisanja neprazne mape (sili v ročno praznjenje), kaskadno brisanje
(izgubi zapise).

## §9 Ikona ali favicon (odprto vprašanje 3)

**Odločitev:** vrstni red pri izrisu je: uporabnikova ikona, če jo je izbral → favicon, če
je na voljo → `link-outline`. `icon` je privzeto `null` in pomeni "brez izbire", ne
"privzeta ikona" — sicer favicona ne bi bilo nikoli videti.

**Zakaj:** izrecna izbira uporabnika je močnejša od samodejno pridobljenega. Kdor hoče
favicon nazaj, ikono odstrani.

## §10 Isti naslov shranjen dvakrat

**Odločitev:** dovoljeno. `POST /saved-links` v odgovoru vrne `duplicateOfId` — ID
obstoječega zapisa z istim normaliziranim naslovom, sicer `null`. Vmesnik ob tem pokaže
opozorilo z bližnjico do obstoječega.

**Zakaj:** ista stran je lahko namenoma v dveh mapah in z dvema komentarjema. Zavrnitev bi bila
strožja od namena uporabnika; molk pa bi tiho ustvaril dvojnik. Podatek v odgovoru dobi tudi
n8n (člen III), ne le zaslon.

## §11 Ploščica na nadzorni plošči

**Odločitev:** ploščica kaže 6 nazadnje shranjenih zapisov. Registrira se z enim vnosom v
`shared/tiles/tile-registry.ts` (`TILE_REGISTRY` + slovenski naslov v `TILE_TYPE_TITLES`).
Nastavljivost ploščice (izbrana mapa, število) NI v obsegu 008.

**Zakaj:** register je za to narejen in je namenoma v `shared/`, ker sme uvažati iz
katerekoli funkcionalnosti (obratno ne). Nastavljivost bi terjala nov razdelek v zaslonu
Nastavitve, torej datoteko v TUJI funkcionalnosti (`features/settings/`) — obstoječi vzorec
002/003 to sicer počne, a za 008 ni potreben in ga ne uvajamo brez potrebe.

## §12 Obsegi

**Odločitev:** `saved-links:read` in `saved-links:write` v `modules/saved-links/scopes.ts`,
oba dodana v `BASE_USER_SCOPES` (`platform/keycloak/role-mapping.ts`) kot dobesedna niza.

**Zakaj:** enak vzorec kot `cameras:*` in `timesheet:*`. Brez vpisa v `BASE_USER_SCOPES` je
zavihek dosegljiv samo administratorju (docs/adding-a-tab.md, korak 5). Niza sta prepisana
in ne uvožena, da odstranitev modula pusti neuporabljen niz namesto pokvarjenega uvoza.

## §13 Kaj nadomešča štiri poimenske primere iz kakovostnih vrat (točka 2)

**Odločitev:** v 008 so prehod na poletni/zimski čas, praznik na delovni dan, dopust prek
meje meseca in neuspel klic z uspehom ob ponovitvi BREZ PREDMETA — modul nima koledarja,
scheduleria ne akcije na tuji strani. Nadomeščajo jih:

| Področje | Primeri |
|---|---|
| Normalizacija naslova | manjkajoča shema → `https://`; robni presledki; `javascript:`, `data:`, `file:` zavrnjeni; naslov nad 2048 znaki zavrnjen; `HTTP://PRIMER.SI` → mala začetnica gostitelja, pot ostane občutljiva na velikost črk |
| Zlaganje za iskanje | `cas` najde `časa`; `SLO` najde `slo`; ujemanje po naslovu in po komentarju, ne le po imenu; ubežni znaki v poizvedbi (`.`, `*`) se ne razumejo kot regularni izraz |
| Vrstni red | preslikava seznama ID-jev v pare; ID iz druge mape ostane nedotaknjen |
| Odhodni naslov | `http://192.168.1.1` je veljaven ZAPIS, a se ne obišče; preusmeritev v zasebni naslov je zavrnjena na drugem skoku |
| Izolacija med uporabniki | tuj zapis vrne 404; tuja mapa vrne 404; iskanje ne prečka meje uporabnika |
| Brisanje mape | zapisi preživijo in postanejo nerazvrščeni |

To je zapisano tudi v `plan.md`, ker ustava izrecno pravi, da molk ne šteje za izpolnjeno.

## §14 Meje branja

**Odločitev:** proračun 2,5 s na celotno branje (vključno s preusmeritvami), največ 128 KB
prebranega telesa, `Accept: text/html`, brez piškotkov, `User-Agent: CleverDash/1.0`.
Odgovor, ki ni `text/html`, se ne razčlenjuje.

**Zakaj:** `<title>` je v glavi dokumenta — 128 KB je z veliko rezervo dovolj, hkrati pa
prepreči, da bi stran s stotimi megabajti zasedla strežnik. Meje so v `platform/config/env.ts`
kot privzetki brez obveznega vpisa v `.env` (vrata 4 ostanejo izpolnjena).

## §15 Razporeditev kode po vzoru modula beležk (007)

**Odločitev:** čiste domenske funkcije tega modula živijo v `modules/saved-links/domain/`, ne
v skupnem `apps/api/src/domain/`. Konkretno `link-input.ts` (Zod shema, `buildLinksFilter`,
`escapeRegExp`, `deriveLinkTitle`), `link-url.ts` (normalizacija) in `link-metadata.ts`
(izluščenje iz HTML). Iz skupnega `domain/` se uporabita samo stvari, ki sta že prej služili
več modulom: `outbound-url.ts` in `camera-order.ts`.

**Zakaj:** modul beležk je ta vzorec uvedel (`modules/notes/domain/note-input.ts`) in je
pravilnejši od tega, kar so delale 001–005. Člen I zahteva, da je odstranitev zavihka brisanje
ene mape — domenska koda, ki služi samo temu modulu, mora torej biti v njegovi mapi, sicer za
sabo pusti sirote v skupnem imeniku.

**Kar se prevzame poimensko** (ista imena, isti podpisi, da je koda berljiva vštric):
`buildNotesFilter` → `buildLinksFilter`, `deriveTitle` → `deriveLinkTitle` (nadomestek je
gostitelj naslova namesto prve vrstice vsebine), `escapeRegExp` dobesedno, `notesQuerySchema`
→ `linksQuerySchema` z `limit`/`offset`.

**Kar se namenoma razlikuje:** beležke iščejo z navadnim `$regex` brez zlaganja diakritike,
008 pa išče po zloženem `searchText` (§6) — `cas` mora najti `časa`. Če se to obnese, je
kandidat za poznejši prenos v beležke; obratnega prevzema (torej da bi 008 opustil zlaganje
zaradi skladnosti) ne delamo, ker bi poslabšal iskanje.

**Zavrnjeno:** kopiranje razporeditve iz 003 (vse čiste funkcije v skupni `apps/api/src/domain/`).
Deluje, a ob odstranitvi modula pusti `link-*.ts` datoteke, ki jih ne uporablja nihče.

## §16 Staro gradivo: stran "Useful links"

**Odločitev:** funkcionalnost je naslednica strani `cleverdash-old/src/app/pages/links/`, ne
nova zamisel. Prevzamejo se trije podatki (`linkName`, `linkUrl`, `linkDescription`), zavrže
pa se štiri njene lastnosti: obveznost vseh treh polj, surovo shranjen naslov brez
normalizacije, `target="_blank"` brez `rel="noopener noreferrer"`, in prazno stanje brez poti
naprej.

**Zakaj:** ista pot kot pri 003, kjer je bil vir zaslon `camera.component.html`. Stara stran
pove, kaj je uporabnik dejansko uporabljal; specifikacija pove, kaj od tega ostane.

**Posledica za podatkovni model:** `userInserted` in `addedDate` iz stare zbirke odpadeta —
tam je bila zbirka skupna (Firebase, avatar tistega, ki je link dodal), po 004 pa so zapisi
osebni in "kdo je dodal" ni več podatek, ampak lastništvo.
