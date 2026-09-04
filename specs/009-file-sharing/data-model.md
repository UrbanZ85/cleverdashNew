# Data Model: Deljenje datotek (009)

**Spec**: [spec.md](./spec.md) | **Raziskava**: [research.md](./research.md)

## Pregled

Tri nove zbirke in **en nov nosilec na disku**. To je prva funkcionalnost, pri kateri baza ni
edino mesto stanja — zapis in vsebina sta dve stvari, ki se lahko razideta, in model je
zgrajen tako, da je razhajanje vidno (research.md §14).

| Kje | Kaj je | Nastane iz |
|---|---|---|
| `sharedFiles` | zapis o naloženi datoteki: kdo, kaj, do kdaj, s kakšnim geslom | US1, US3, US4 |
| `fileShareGrants` | kratkotrajna dovolilnica po pravilno vpisanem geslu | US1, US2 |
| `fileShareAttempts` | števec zgrešenih poskusov gesla, po povezavi in po naslovu | US2 |
| `$FILE_SHARE_DIR` na disku | sama vsebina datotek | US1 |

Nič obstoječega se ne spremeni. `Settings` ostane, kakršen je: vklop zavihka gre prek
obstoječega polja `tabs` (`Record<tabId, {enabled?, order?}>`), ki je `Mixed` in sheme ne
potrebuje.

## Načelo lastništva zapisov (podedovano iz 004)

`userId` je del VSAKE lastnikove poizvedbe, ne le filtra ob branju seznama. Zapis drugega
uporabnika vrne **404, ne 403** — obstoj tuje datoteke ni podatek, ki bi ga API razkril.

Javne poti so izjema, ki potrjuje pravilo: tam lastništva sploh ni v poizvedbi, ker prosilec
ni nihče. Edini ključ je `token`, edino dovoljenje je geslo.

## `sharedFiles`

| Polje | Tip | Obvezno | Opomba |
|---|---|---|---|
| `userId` | ObjectId → `User` | da | lastnik; del vsake lastnikove poizvedbe |
| `displayName` | String (≤ 200) | da | očiščeno prikazno ime (`domain/file-name.ts`); NIKOLI pot |
| `mimeType` | String | da | kar je javil odjemalec; privzeto `application/octet-stream` |
| `byteSize` | Number | da | dejanska velikost na disku po dokončanem nalaganju; med nalaganjem napovedana |
| `storageId` | String (32 hex) | da | ime datoteke na disku; naključen, unikaten indeks |
| `state` | `'uploading' \| 'ready' \| 'revoked' \| 'broken'` | da | shranjeno stanje — glej prehode spodaj |
| `token` | String (22, base64url) \| null | ne | del javne povezave; `null`, dokler nalaganje ne uspe; unikaten indeks (redek) |
| `passwordHash` | String | ne | `scrypt$N$r$p$sol$povzetek` (research.md §7); `null`, dokler nalaganje ne uspe |
| `expiresAt` | Date \| null | ne | `null` pomeni **brez roka**, ne "poteklo" |
| `downloadCount` | Number | da | uspešni prevzemi; privzeto 0 |
| `lastDownloadedAt` | Date \| null | ne | za prikaz lastniku (FR-028) |
| `failedAttempts` | Number | da | zgrešeni poskusi od zadnje uspešne odklenitve (FR-033) |
| `lockedUntil` | Date \| null | ne | zaklep zaradi ugibanja; viden lastniku |
| `createdAt` / `updatedAt` | Date | da | `timestamps: true` |

**Česa v zapisu NI in nikoli ne bo:** čistopisa gesla, dovolilnice, vsebine datoteke, poti do
datoteke (pot se izpelje iz `storageId` in `FILE_SHARE_DIR`, da preselitev nosilca ne zahteva
migracije).

**Indeksi**

- `{ userId: 1, createdAt: -1 }` — seznam lastnika, najnovejše zgoraj.
- `{ token: 1 }` — unikaten, redek (`sparse`): javna pot ima natanko eno poizvedbo in ta gre
  po njem.
- `{ storageId: 1 }` — unikaten; podlaga za iskanje sirot (research.md §14).
- `{ expiresAt: 1 }` — pometač išče potekle po njem. **Ni TTL indeks**: TTL bi zbrisal zapis
  in pustil vsebino na disku kot siroto, brisati pa je treba oboje in v pravem vrstnem redu
  (research.md §15).
- `{ state: 1, updatedAt: 1 }` — pometač išče obtičala nalaganja.

### Izpeljano, ne shranjeno

| Vrednost | Kako se izpelje | Zakaj ne v bazi |
|---|---|---|
| "poteklo" | `expiresAt !== null && expiresAt < now` | Shranjeno stanje bi se moralo vzdrževati z opravilom; med potekom in zapisom bi obstajalo okno, v katerem je povezava formalno veljavna. Čas je resnica, ki je ni treba osveževati. |
| `shareUrl` | `${PUBLIC_BASE_URL}/d/${token}` | Naslov namestitve je nastavitev okolja; shranjen bi se ob selitvi domene tiho pokvaril v vsakem starem zapisu. |
| zasedena kvota | vsota `byteSize` po `userId` (agregacija) | Števec bi se moral vzdrževati ob vsakem brisanju in prekinjenem nalaganju; vsota je resnica, ki se ne more razsinhronizirati. |

### Prehodi stanj

```text
        POST /files              PUT .../content (uspeh)
   ∅ ──────────────► uploading ───────────────────────► ready
                         │                                │
     prekinitev /        │                                ├── POST .../revoke ──► revoked
     obtičalo (pometač)  │                                │
                         ▼                                ├── vsebina manjka ───► broken
                         ∅                                │        (pometač / prevzem)
                                                          └── DELETE ───────────► ∅
```

Pravila, ki jih uveljavlja `domain/share-lifecycle.ts` (in ki so enotsko testirana):

- iz `uploading` se ne da preklicati — preklicati ni česa;
- iz `revoked` ni poti nazaj v `ready`; kdor si premisli, izda novo geslo (§12), kar naredi
  novo povezavo;
- `broken` je ugotovitev, ne ukaz: postavi ga sistem, ne uporabnik;
- **potekli ni stanje.** Potekla povezava je `ready` zapis, ki mu je `expiresAt` v preteklosti.

## `fileShareGrants`

Dovolilnica, izdana po pravilno vpisanem geslu (research.md §8).

| Polje | Tip | Opomba |
|---|---|---|
| `fileId` | ObjectId → `SharedFile` | za katero datoteko velja — in samo zanjo (FR-016) |
| `grant` | String (43, base64url) | 32 naključnih bajtov; vrednost piškotka `cd_share` |
| `expiresAt` | Date | zdaj + `FILE_SHARE_GRANT_MINUTES` (privzeto 10) |
| `createdAt` | Date | |

**Indeksi**

- `{ grant: 1 }` — unikaten; poizvedba ob vsakem prevzemu.
- `{ fileId: 1 }` — preklic izbriše vse dovolilnice datoteke z eno operacijo.
- `{ expiresAt: 1 }, expireAfterSeconds: 0` — TTL, **samo za pospravljanje**. Veljavnost se
  vedno preveri tudi v poizvedbi (`expiresAt: { $gt: now }`), ker TTL monitor teče na ~60 s in
  zamika ne obljublja (research.md §13).

**Zakaj zapis in ne podpisan žeton:** FR-026 zahteva, da preklic razveljavi tudi že izdano
dovolilnico. Podpisanega žetona ni mogoče preklicati brez seznama preklicanih — kar je isti
zapis, le z več koraki.

## `fileShareAttempts`

Trajen števec poskusov (research.md §9). Trajen zato, ker se pomnilniški ob vsakem ponovnem
zagonu ponastavi — in ponovni zagon ni redek dogodek.

| Polje | Tip | Opomba |
|---|---|---|
| `key` | String | `link:<fileId>` ali `ip:<naslov>` |
| `windowStartedAt` | Date | začetek trenutnega okna |
| `count` | Number | zgrešeni poskusi v tem oknu |
| `lockedUntil` | Date \| null | dokler je v prihodnosti, so vsi poskusi zavrnjeni |
| `expiresAt` | Date | zdaj + okno + zaklep; podlaga za TTL |

**Indeksi**

- `{ key: 1 }` — unikaten; branje in `$inc` v enem `findOneAndUpdate`.
- `{ expiresAt: 1 }, expireAfterSeconds: 0` — TTL pospravlja; odločitve se nanj ne zanašajo.

**Dva ključa hkrati:** samo po povezavi bi napadalec z eno povezavo na naslov mejo obšel;
samo po naslovu bi ena pisarna za NAT-om zaklenila vse za sabo. Meji tečeta vzporedno in prva
izpolnjena zavrne.

**Kaj v zapisu ni:** poskušeno geslo. Nikjer — ne v bazi, ne v dnevniku (FR-032).

## Disk: `$FILE_SHARE_DIR`

```text
$FILE_SHARE_DIR/                       privzeto /app/data/files, nosilec `shared-files`
  tmp/<storageId>.part                 nalaganje, ki teče
  blobs/<xx>/<storageId>               dokončano nalaganje (xx = prva dva znaka storageId)
```

| Pravilo | Zakaj |
|---|---|
| Datoteka pride v `blobs/` samo s `fs.rename` iz `tmp/` | `rename` je znotraj nosilca atomaren; datoteka v `blobs/` zato po definiciji pomeni dokončano nalaganje. Delna datoteka tam ne more nastati. |
| `tmp/` in `blobs/` sta na ISTEM nosilcu | Sicer `rename` ni preimenovanje, ampak kopiranje 500 MB — in ni več atomarno. |
| Ime na disku je `storageId`, nikoli `displayName` | Ime datoteke je uporabnikov vnos; vnos, ki postane pot, je pot v `../../`. |
| 256 predalov `<xx>` | Nekaj tisoč vnosov v eni mapi upočasni vsako operacijo nad njo. |
| Vsebina se ne šifrira | Izven obsega (spec.md); nosilec je pod isto skrbjo kot baza. |

**Vrstni red pri brisanju:** najprej vsebina, nato zapis. Obratno bi ob napaki pustilo siroto,
ki je nihče ne najde. Če brisanje vsebine spodleti, zapis OSTANE in dobi `state: 'broken'` —
tiho izginotje je prepovedano (člen VII).

## Kaj se zgodi ob ponovnem zagonu

| Stanje ob padcu | Kaj najde pometač | Kaj naredi |
|---|---|---|
| Nalaganje je teklo | zapis `uploading`, `.part` v `tmp/` | po `FILE_SHARE_UPLOAD_TIMEOUT_MINUTES` izbriše oboje |
| Nalaganje je bilo tik pred `rename` | zapis `uploading`, `.part` v `tmp/` | isto — nedokončano je nedokončano |
| `rename` je uspel, zapis se ni posodobil | zapis `uploading`, datoteka v `blobs/` | zapis se pobriše, datoteka postane sirota in pade pod pravilo 24 ur |
| Baza obnovljena iz starejše kopije | datoteke v `blobs/` brez zapisa | sirote, starejše od 24 ur, se pobrišejo |
| Nosilec izgubljen | zapisi `ready`, vsebine ni | vsak dobi `state: 'broken'`; lastnik jih vidi kot pokvarjene |

24-urna doba za sirote ni previdnost brez razloga: mlajša datoteka v `tmp/` je lahko nalaganje,
ki ravno teče, in pometač, ki bi jo pobrisal, bi prekinil delo uporabnika.
