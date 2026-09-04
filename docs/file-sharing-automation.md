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
curl -X POST "https://app.si/api/v1/files/$ID/password" -H "X-API-Key: $KEY" -H "Idempotency-Key: $(uuidgen)"
curl -X DELETE "https://app.si/api/v1/files/$ID"        -H "X-API-Key: $KEY" -H "Idempotency-Key: $(uuidgen)"
```

`failedAttempts` in `lockedUntil` na seznamu povesta, ali kdo ugiba geslo — uporabno kot
sprožilec obvestila v n8n.

## Ena izjema, ki jo je treba poznati

`POST /share/{token}/unlock` (javna pot, ki jo uporablja prejemnik) glave `Idempotency-Key`
**ne sprejme**. Endpoint izdaja kratkotrajno dovolilnico za prenos, kar je primer iz izjeme
člena III: shranjen odgovor bi ponovil dovolilnico tudi po tem, ko je bila povezava preklicana.
Izjema je izrecno zapisana v pogodbi in pokrita s testom — tiho nesprejemanje glave bi bilo
kršitev člena, ne uveljavitev izjeme.
