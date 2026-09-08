# Deljenje datotek iz avtomatizacije (n8n)

Člen III ustave: kar se da narediti v vmesniku, se MORA dati narediti tudi s HTTP klicem.
Modul 009 zato nima nobene operacije, ki bi obstajala samo na zaslonu — vključno z nalaganjem.

Pogodba: [`specs/009-file-sharing/contracts/openapi.yaml`](../specs/009-file-sharing/contracts/openapi.yaml).

## Priprava

API ključ z obsegoma `file-sharing:read` in `file-sharing:write`:

```bash
curl -X POST https://app.si/api/v1/api-keys \
  -H "X-API-Key: $ADMIN_KEY" -H 'Content-Type: application/json' \
  -d '{"label":"n8n — deljenje datotek","scopes":["file-sharing:read","file-sharing:write"]}'
```

Ključ ni vezan na uporabnika (člen III), zato strežnik ugotovi, v čigavem imenu avtomatizacija
deluje (`platform/auth/automation-owner.ts`). Pri več uporabnikih brez podedovanih podatkov to
ni nedvoumno in klic vrne razumljivo napako namesto datoteke brez lastnika.

## Nalaganje je dvostopenjsko

**Zakaj ne v enem klicu:** kvota in meja velikosti se morata preveriti, PREDEN priteče 500 MB,
`Idempotency-Key` pa mora dobiti endpoint, ki obljubo o istem telesu lahko izpolni — pri
binarnem telesu je primerjava nemogoča (research.md §3).

```bash
# 1. Napovej datoteko. Tu se preverita meja in kvota; tu velja Idempotency-Key.
ID=$(curl -s -X POST https://app.si/api/v1/files \
  -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"fileName":"porocilo-2026-08.pdf","byteSize":'"$(stat -c%s porocilo.pdf)"',"expiresInDays":7}' \
  | jq -r .id)

# 2. Pošlji vsebino. Telo je SUROVA datoteka, ne multipart.
curl -X PUT "https://app.si/api/v1/files/$ID/content" \
  -H "X-API-Key: $KEY" -H 'Content-Type: application/octet-stream' \
  --data-binary @porocilo.pdf
```

Odgovor drugega klica je **edino mesto v celotni pogodbi**, kjer se pojavi geslo:

```json
{
  "file": { "id": "…", "displayName": "porocilo-2026-08.pdf", "state": "ready" },
  "shareUrl": "https://app.si/d/Xk2p9QmR7vLb3NcW8sTzYa",
  "password": "H7K2-9MTX-4RQP-VN63"
}
```

**Geslo shrani takoj.** Ni ga mogoče prebrati nikjer drugje — v bazi je samo `scrypt` povzetek.
Izgubljeno geslo se ne obnovi, ampak nadomesti (`POST /files/{id}/password`), kar izda tudi nov
naslov in staro povezavo v celoti razveljavi.

Prejemniku pošlji **oboje**. Sama povezava ne odpre ničesar.

## Kar velja enako kot v vmesniku

| | |
|---|---|
| `expiresInDays` | `1`, `7`, `30` ali `null` (brez roka). Izpuščeno polje pomeni privzetek namestitve — `null` je nekaj drugega kot "nisem izbral" |
| Meja velikosti | `FILE_SHARE_MAX_MB`; presežek je `413`, in sicer že pri prvem klicu |
| Kvota | `FILE_SHARE_QUOTA_MB`; presežek je `507` s podatkom, koliko prostora je še na voljo |
| Lastništvo | tuja datoteka vrne `404`, ne `403` |
| `Content-Length` | pri drugem klicu OBVEZEN; brez njega ni mogoče preveriti kvote pred prenosom |

**API ključ ne obide ničesar** (FR-063). Nobene od teh omejitev ni mogoče preskočiti z drugim
odjemalcem — to je preverjeno v `tests/contract/file-sharing/api-key.spec.ts`.

## Upravljanje

```bash
curl -s https://app.si/api/v1/files -H "X-API-Key: $KEY" | jq '.files[] | {displayName, state, downloadCount, failedAttempts}'

curl -X POST "https://app.si/api/v1/files/$ID/revoke"   -H "X-API-Key: $KEY" -H "Idempotency-Key: $(uuidgen)"
# Brez Idempotency-Key: ta pot izda geslo v čistopisu in je iz izjeme člena III (glej spodaj).
curl -X POST "https://app.si/api/v1/files/$ID/password" -H "X-API-Key: $KEY"
curl -X DELETE "https://app.si/api/v1/files/$ID"        -H "X-API-Key: $KEY" -H "Idempotency-Key: $(uuidgen)"
```

`failedAttempts` in `lockedUntil` na seznamu povesta, ali kdo ugiba geslo — uporabno kot
sprožilec obvestila v n8n.

## Izjeme pri `Idempotency-Key`, ki jih je treba poznati

`POST /share/{token}/unlock` (javna pot, ki jo uporablja prejemnik) glave `Idempotency-Key`
**ne sprejme**. Endpoint izdaja kratkotrajno dovolilnico za prenos, kar je primer iz izjeme
člena III: shranjen odgovor bi ponovil dovolilnico tudi po tem, ko je bila povezava preklicana.
Isto velja za vse javne poti pod `/drop/*` (009b).

**Poti, ki izdajo skrivnost, glave prav tako ne sprejmejo**: `POST /files/{id}/password`,
`POST /inboxes` in `POST /inboxes/{id}/code`. Njihovi odgovori so edina mesta v pogodbi, kjer sta
geslo oz. koda v čistopisu; shranjen odgovor pa je zapis v bazi, ki bi ju hranil 24 ur v berljivi
obliki. Za avtomatizacijo to pomeni dvoje:

- **ponovljen klic naredi nov predal oz. novo geslo** — ni ga varno ponavljati "na slepo" po
  časovni prekoračitvi. Če klic ne uspe, najprej preveri stanje (`GET /inboxes`, `GET /files`);
- odvečen predal je viden in ga je mogoče izbrisati, medtem ko shranjene kode ni mogoče
  preklicati za nazaj — zato je izbrana ta stran zamenjave.

Vse izjeme so izrecno zapisane v pogodbi in pokrite s testi — tiho nesprejemanje glave bi bilo
kršitev člena, ne uveljavitev izjeme.

**Ključ je vezan na klicatelja.** Ista vrednost `Idempotency-Key` od drugega uporabnika, drugega
API ključa ali brez poverilnic shranjenega odgovora ne dobi, ampak `422` — enako kot ista vrednost
z drugačnim telesom. Shranjen odgovor je odgovor ene zahteve enega klicatelja in ne javna
naslovnica.

## Obrnjena smer: sprejemni predal (009b)

Enak člen III velja tudi za predale: povezavo za oddajo je mogoče ustvariti s HTTP klicem, ne le
na zaslonu. Tipičen primer je n8n, ki ob prejetem e-sporočilu odpre predal za en sam dokument in
pošiljatelju odgovori s povezavo in kodo.

```bash
# Ustvari predal. `maxFiles` in `maxTotalMb` sta MEJI TEGA PREDALA (FR-087) — izpuščeni pomenita
# strop namestitve, večji od stropa pa sta 400 in ne tiho znižanje.
curl -s -X POST https://app.si/api/v1/inboxes \
  -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"label":"Skenirana pogodba","note":"Pošlji obe strani.","expiresInDays":7,"maxFiles":1,"maxTotalMb":50}'
```

Odgovor je — poleg odgovora ob izdaji nove kode — **edino mesto v pogodbi, kjer se pojavi koda**:

```json
{
  "inbox": { "id": "…", "label": "Skenirana pogodba", "maxFiles": 1, "openForUpload": true },
  "dropUrl": "https://app.si/u/Tm9wQ2s3RmZKa1pYcTRi",
  "code": "R4TX-8JQM-2WNP-K7VD"
}
```

**Kodo shrani takoj.** Ni je mogoče prebrati nikjer drugje — v bazi je samo `scrypt` povzetek.
Izgubljena koda se ne obnovi, ampak nadomesti (`POST /inboxes/{id}/code`), kar izda tudi nov
naslov in stari v celoti razveljavi.

Pošiljatelju pošlji **oboje**. Sama povezava ne odpre ničesar.

### Kaj vidi in kaj lahko pošiljatelj

Javne poti pod `/drop/{token}` ne potrebujejo ne API ključa ne prijave — in tudi ne smejo:

```bash
# 1. Kaj je za tem naslovom. BREZ oznake predala (FR-084) — ta pride šele s kodo.
curl -s https://app.si/api/v1/drop/$TOKEN

# 2. Vpis kode. Odgovor vsebuje dovolilnico, ki NE gre v piškotek (FR-091).
TICKET=$(curl -s -X POST https://app.si/api/v1/drop/$TOKEN/unlock \
  -H 'Content-Type: application/json' -d '{"code":"R4TX-8JQM-2WNP-K7VD"}' | jq -r .ticket)

# 3. Napovej oddajo. Tu se preverijo VSE ŠTIRI meje (FR-088).
ID=$(curl -s -X POST https://app.si/api/v1/drop/$TOKEN/files \
  -H "X-Drop-Ticket: $TICKET" -H 'Content-Type: application/json' \
  -d '{"fileName":"pogodba.pdf","byteSize":'"$(stat -c%s pogodba.pdf)"',"senderName":"Janez Novak"}' \
  | jq -r .id)

# 4. Pošlji vsebino. Telo je SUROVA datoteka, in `Content-Length` MORA biti enak napovedani
#    velikosti (FR-089) — `--data-binary` to naredi sam.
curl -X PUT "https://app.si/api/v1/drop/$TOKEN/files/$ID/content" \
  -H "X-Drop-Ticket: $TICKET" -H 'Content-Type: application/octet-stream' \
  --data-binary @pogodba.pdf
```

Glava `Content-Type: application/octet-stream` pri četrtem klicu ni okrasek: brez nje `curl`
napove `application/x-www-form-urlencoded`, kar je zavrnjeno s `415`. Telo, ki je napovedano kot
obrazec ali JSON, bi bilo bodisi požrto od razčlenjevalnika (datoteka velikosti 0) bodisi
shranjeno skupaj z mejami obrazca — datoteka bi bila videti uspešno oddana in bi bila pokvarjena.

| | |
|---|---|
| `X-Drop-Ticket` | obvezen pri obeh korakih oddaje; velja `FILE_SHARE_INBOX_TICKET_MINUTES` in samo za TA predal |
| Velikost | trojna meja: `FILE_SHARE_MAX_MB`, prostor predala, kvota lastnika. Presežek je `413` oz. `507` |
| Napovedana velikost | zavezujoča — vsaka druga dolžina telesa je zavrnjena (FR-089) |
| `Idempotency-Key` | pod `/drop/*` se NE upošteva (FR-097) |
| Neveljaven, potekel, zaprt, izbrisan predal | isti `404` z istim besedilom (FR-085) |

### Upravljanje predalov

```bash
curl -s https://app.si/api/v1/inboxes -H "X-API-Key: $KEY" \
  | jq '.inboxes[] | {label, state, receivedFiles, remainingFiles, failedAttempts}'

curl -X POST "https://app.si/api/v1/inboxes/$ID/close" -H "X-API-Key: $KEY" -H "Idempotency-Key: $(uuidgen)"
curl -X POST "https://app.si/api/v1/inboxes/$ID/code"  -H "X-API-Key: $KEY" -H "Idempotency-Key: $(uuidgen)"
curl -X DELETE "https://app.si/api/v1/inboxes/$ID"     -H "X-API-Key: $KEY" -H "Idempotency-Key: $(uuidgen)"
```

`failedAttempts` in `lockedUntil` povesta, ali kdo ugiba kodo — uporabno kot sprožilec obvestila
v n8n, enako kot pri povezavah za prevzem.

**Brisanje predala NE izbriše prejetih datotek** (FR-094). Te so od trenutka prejema navadne
lastnikove datoteke pod `/files` z `origin: "inbox"`, brez roka veljavnosti in brez povezave za
prevzem — dokler je lastnik izrecno ne izda:

```bash
curl -s https://app.si/api/v1/files -H "X-API-Key: $KEY" \
  | jq '.files[] | select(.origin == "inbox") | {displayName, senderName, byteSize}'
```
