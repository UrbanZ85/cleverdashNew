# Feature Specification: Beležke z narekovanjem in zvočnimi posnetki

**Vhod (dobesedna zahteva)**: *"dodaj še eno privzeto stran in sicer za pisanje beležk. crud
operacije. oz naj ne bo modul. bi se dalo dodati tudi audio posnetek da se govori?"* in
dopolnilo: *"za pošiljanje whisperju je potrebna nastavitev. tudi v UI kljub temu da imam v
env ključ."*
**Datum**: 2026-08-28
**Stanje**: implementirano

## Zakaj

Aplikacija je do zdaj znala prikazovati (nadzorna plošča, kamere) in beležiti (čas, evidenca),
ne pa hraniti besedila, ki ga uporabnik napiše sam. Beležke so najbolj vsakdanja od teh
funkcij in edina, ki nima nobene zunanje odvisnosti — dokler je besedilo tipkano.

Zanimivejši del zahteve je govor. Beležka, ki jo je mogoče narekovati, je uporabna v položajih,
kjer tipkanje ni mogoče (v avtu, na terenu). Tu pa se pojavi vprašanje, ki ni tehnično:
prepoznava govora pomeni, da nekdo posluša. Zato ima ta funkcionalnost dve ločeni poti in ne
ene "pametne".

## Odločitve

### Privzeta stran JE modul

Zahteva "naj ne bo modul" je bila razumljena kot "naj ne bo uporabniški **vtičnik** iz 005" —
torej ne nekaj, kar si mora uporabnik sam dodati v profilu, ampak vgrajen zavihek, ki je od
prvega zagona tam. Notranja zgradba pa ostane modul (`modules/notes/`, `features/notes/`, en
vnos v `TAB_REGISTRY`), ker člen I ustave zavihka brez modula ne dopušča: brez tega odstranitev
zavihka ne bi bila več brisanje ene mape.

### Dve ločeni poti za govor, ne ena

| | Narekovanje | Snemanje |
|---|---|---|
| Kaj nastane | besedilo v vsebini beležke | zvočna priloga beležke |
| Kje se zgodi | v brskalniku (Web Speech API) | v brskalniku (MediaRecorder) |
| Kam gre zvok | v Chromu k Googlu (vgrajeno v brskalnik) | na naš strežnik in nikamor drugam |
| Podpora | Chrome, Edge, Android | vsi razen zelo starih brskalnikov |

Prepis posnetka **na strežniku** (Whisper ali združljiva storitev) je tretja, neobvezna pot.
Obstaja zato, ker je narekovanje v brskalniku za slovenščino znosno, ne pa dobro — a se nikoli
ne zgodi sam od sebe.

### Dvojna ključavnica pred pošiljanjem posnetka ven

Iz dopolnila zahteve: ključ v `.env` je dovoljenje **namestitve**, stikalo v profilu pa
privolitev **osebe**, katere glas je na posnetku. Oba pogoja sta potrebna; nobeden ne zadošča.
Odločitev je čista funkcija (`modules/notes/domain/transcription-gate.ts`), da je preverljiva
brez omrežja, in vrne RAZLOG (`not-configured` / `not-enabled`), ne le zavrnitve — sicer
uporabnik ne bi vedel, ali manjka klik ali ključ.

## User Scenarios

### User Story 1 - Napišem in najdem beležko (P1) 🎯 MVP

1. **Ko** odprem zavihek "Beležke" in kliknem +, napišem besedilo in shranim, **potem** je
   beležka v seznamu na vrhu.
2. **Ko** naslova ne vpišem, **potem** se uporabi prva neprazna vrstica vsebine.
3. **Ko** v iskalno polje vpišem besedo iz vsebine (tudi z drugačno velikostjo črk),
   **potem** seznam pokaže samo ujemajoče se beležke.
4. **Ko** beležko pripnem, **potem** je nad vsemi nepripetimi, ne glede na datum.
5. **Ko** beležko izbrišem, **potem** izgine skupaj s svojimi posnetki.

### User Story 2 - Narekujem namesto tipkanja (P2)

1. **Ko** pritisnem "Narekuj" in govorim, **potem** se besedilo sproti piše v vsebino, z
   presledkom na stiku s prejšnjim odstavkom.
2. **Ko** brskalnik narekovanja ne podpira, **potem** gumba ni, na njegovem mestu pa je
   pojasnilo, kaj namesto tega.
3. **Ko** mikrofona ne dovolim, **potem** dobim razumljivo sporočilo in gumb ne obtiči v
   stanju "posluša".

### User Story 3 - Posnamem govor kot prilogo (P3)

1. **Ko** pritisnem "Posnemi", **potem** teče števec; ko ustavim, se posnetek shrani k beležki.
2. **Ko** snemam v novi, še neshranjeni beležki, **potem** se ta najprej shrani sama — posnetek
   se ne izgubi.
3. **Ko** pritisnem "Predvajaj", **potem** slišim posnetek nazaj.
4. **Ko** posnetek izbrišem, **potem** besedilo beležke ostane.

### User Story 4 - Prepis na strežniku, samo z mojo privolitvijo (P4)

1. **Ko** ključa v okolju ni, **potem** v urejevalniku ni ne stikala ne gumba za prepis, je pa
   pojasnilo, da storitev ni nastavljena.
2. **Ko** je ključ nastavljen, stikalo v profilu pa izklopljeno, **potem** prepis ni mogoč in
   sporočilo pove, kje ga vklopim; posnetek NE zapusti strežnika.
3. **Ko** je vklopljeno oboje, **potem** se posnetek prepiše in besedilo lahko z enim klikom
   vstavim v vsebino beležke.
4. **Ko** storitev vrne napako, **potem** posnetek vseeno ostane shranjen, ob njem pa piše,
   zakaj prepisa ni; poskus lahko ponovim.

### Edge Cases

- Posebni znaki v iskanju (`c++`, `(`, `.*`) → obravnavani kot besedilo, ne kot vzorec.
- Tuja beležka ali posnetek → `404`, nikoli `403`.
- Vrsta vsebine, ki ni zvok → `415`; prevelik posnetek → `413` z navedeno mejo.
- Ista oznaka z drugačno velikostjo črk → ena oznaka, ne dve.
- `Idempotency-Key` na nalaganju posnetka → varovalka se preskoči, ker binarnega telesa ne
  more primerjati (glej `platform/idempotency/middleware.ts`).

## Functional Requirements

- **FR-001**: Zavihek "Beležke" MORA biti privzeto vklopljen v registru zavihkov.
- **FR-002**: Beležka MORA imeti CRUD prek `/api/v1/notes*` z obsegoma `notes:read` /
  `notes:write` — vse, kar zna vmesnik, mora znati tudi HTTP klic (člen III).
- **FR-003**: Beležke so OSEBNE: vsaka poizvedba je omejena z `userId`.
- **FR-004**: Beležka brez naslova IN brez vsebine MORA biti zavrnjena.
- **FR-005**: Iskanje MORA zajeti naslov in vsebino, brez razlikovanja velikosti črk, in MORA
  biti varno pred vzorci v uporabnikovem vnosu.
- **FR-006**: Oznake se MORAJO normalizirati (male črke, brez podvojitev, največ 20).
- **FR-007**: Seznam MORA vrniti pripete pred nepripetimi, nato po času zadnje spremembe.
- **FR-008**: Narekovanje MORA delovati brez strežniške odvisnosti in MORA biti izpisano, kadar
  ga brskalnik ne podpira.
- **FR-009**: Posnetek se MORA shraniti k beležki, biti predvajljiv nazaj in izbrisljiv ločeno
  od besedila; bajti se NE smejo vračati v nobenem seznamu.
- **FR-010**: Prepis na strežniku se MORA zgoditi izključno ob ključu v okolju IN osebni
  privolitvi; ob manjkajočem pogoju MORA odgovor povedati, kateri manjka.
- **FR-011**: Spodletel prepis NE sme povzročiti izgube posnetka; stanje in razlog MORATA biti
  vidna (člen VI).
- **FR-012**: Zvok MORA biti postrežen z `Cache-Control: private` in samo avtenticiranemu
  lastniku.

## Kaj ni v obsegu

- Deljenje beležk med uporabniki, mape, opomniki, priponke, ki niso zvok.
- Oblikovano besedilo (markdown, bogato besedilo) — vsebina je navadno besedilo.
- Samodejno sprotno shranjevanje med tipkanjem (shranjevanje je izrecno; snemanje ga sproži).
- Iskanje po besedilu prepisa (prepis je viden ob posnetku, ni pa del iskalnega filtra).
