# Administrator dela v imenu drugega uporabnika (012)

Administrator (Keycloakova vloga `KEYCLOAK_ADMIN_ROLE`, privzeto `cleverdash-admin`) lahko v
meniju spodaj, pod svojim imenom, izbere drugega uporabnika. Od tega trenutka **cela
aplikacija** kaže in shranjuje podatke izbranega uporabnika: nadzorno ploščo, ploščice,
nastavitve, zavihke, kamere, beležke, beleženje časa, evidenco delovnega časa, opravila,
shranjene linke, deljene datoteke.

Namen je podpora: skrbnik lahko drugemu uredi ploščice, popravi lokacijo beleženja ali
zabeleži manjkajoč prihod, ne da bi potreboval njegovo geslo.

## Kako deluje

Odjemalec na vsako zahtevo pripne glavo:

```
X-Acting-User: <User.id izbranega uporabnika>
```

Strežnik jo obravnava na **enem mestu** —
[`apps/api/src/platform/auth/acting-user.ts`](../apps/api/src/platform/auth/acting-user.ts),
vpetem v `main.ts` takoj za oba vratarja (API ključ, dostopni žeton) in pred vsemi moduli.
Middleware naredi dvoje:

| | pomen | vsebina |
| --- | --- | --- |
| `req.auth` | **v čigavem imenu** teče zahteva | zamenjan z izbranim uporabnikom |
| `req.actor` | **kdo jo je poslal** | vedno prijavljeni človek (ali API ključ) |

Obsegi (`scopes`) v `req.auth` ostanejo **administratorjevi**: dovolilnico nosi človek za
tipkovnico, ne podatki, ki jih gleda. Nasprotna izbira bi pomenila, da admin s prevzemom tujega
imena izgubi pravico, da ga sploh prevzame.

### Zakaj tako in ne z `?userId=` na vsaki poti

Po funkcionalnosti 004 je `userId` na poizvedbi **edina** podatkovna izolacija med uporabniki
(glej `platform/keycloak/role-mapping.ts` — poimenovani obsegi admina od navadnega uporabnika ne
ločijo). Takšnih mest je okrog devetdeset v desetih modulih. Neobvezen parameter na vsakem od
njih bi bil devetdeset priložnosti, da ga kdo pozabi preveriti, in vsaka pozabljena bi bila
luknja, skozi katero navaden uporabnik bere tuje podatke.

Ker zamenjava živi na enem mestu **pred** moduli, modulom ni treba vedeti, da prevzem imena
obstaja, in nov modul ga dobi zastonj — dokler filtrira po `req.auth.subjectId`, kar mu člen o
izolaciji tako ali tako nalaga.

## Kaj OSTANE administratorjevo

Tri stvari se namenoma ne preklopijo, ker govorijo o človeku za tipkovnico in ne o lastniku
podatkov:

- **`/auth/*`** — seje, odjava, `/auth/me`. Prevzem imena bi tu pomenil, da admin vidi in
  preklicuje **tuje** seje. Te poti berejo `req.actor`.
- **`/devices*`** — naprave za potisna obvestila. Registrirana tujemu računu bi tja pošiljala
  njegova obvestila, testno obvestilo pa bi šlo na tuje telefone.
- **`/api-keys*`** — ključi niso vezani na uporabnika in zahtevajo obseg `admin`, ki se ne
  spremeni.

## Dovolilnica in napake

| Situacija | Odgovor |
| --- | --- |
| klicatelj brez obsega `admin` | `403` |
| klicatelj se je predstavil z `X-API-Key` | `403` — veljaven ključ **sam po sebi ni admin** (člen III); avtomatizacija svojega lastnika določi drugače, glej `platform/auth/automation-owner.ts` |
| uporabnika s tem `id` ni (izbrisan, napačna vrednost) | `404` |
| admin izbere **sebe** | brez učinka, brez napake |

Obseg `admin` se izpelje pri **vsaki** zahtevi iz žive introspekcije žetona
(`modules/auth/services/access-token.service.ts`), ne iz shranjenega polja — odvzeta Keycloak
vloga prevzem imena ustavi v nekaj sekundah.

### Izjema: `/auth/*` na neveljavno glavo ne vrne napake

`GET /auth/me` je edina pot, po kateri odjemalec izve, ali je njegova shranjena izbira še
veljavna (polje `actingAs`). Če bi odvzeta admin vloga ali izbrisan izbrani uporabnik vrnila
`403`/`404` že v middlewaru, bi tudi `/auth/me` odgovoril z napako, odjemalec ne bi nikoli
izvedel, da mora izbiro pozabiti, in aplikacija bi ostala **mrtva do ročnega brisanja shrambe v
brskalniku**. Zato `/auth/me` v takem primeru vrne `200` z `actingAs: null`, web pa izbiro
počisti sam (`core/user/current-user.service.ts`).

## Idempotentnost

`Idempotency-Key` je vezan na **resničnega klicatelja** in na prevzeto ime hkrati
(`platform/idempotency/middleware.ts`). Brez drugega dela bi ista vrednost ključa pri delu v
imenu dveh uporabnikov drugemu vrnila shranjen odgovor prvega — tujo beležko kot njegovo. Z
imenom v ključu tak klic pade v isto vejo kot vsako drugo neujemanje klicatelja in vrne `422`,
kar je pravilno: gre res za napako klicatelja. Brez prevzema imena je vrednost ključa znakovno
enaka tisti pred 012, zato obstoječa avtomatizacija ni prizadeta.

## Sled v dnevniku

Vsak dnevniški zapis zahteve s prevzetim imenom nosi `actorUserId` in `actingAsUserId`. Vsaka
**mutacija** (vse razen `GET`/`HEAD`) dodatno zabeleži dogodek:

```json
{ "event": "auth.acting_as", "actorUserId": "…", "actingAsUserId": "…", "method": "PUT", "path": "/settings" }
```

Brez tega bi bil zapis o spremembi tujih podatkov videti kot uporabnikov lasten (člen VII).

## Vmesnik

- **Izbirnik** je na dnu stranskega menija, pod imenom prijavljenega
  (`shared/navigation/acting-user-switcher.component.ts`). Izriše se samo klicatelju z obsegom
  `admin`. Seznam pride iz obstoječega imenika `GET /users` (samo uporabniki, ki so se že vsaj
  enkrat prijavili; e-pošta je zamaskirana).
- **Opozorilni pas** nad vsebino je viden na vsakem zaslonu, dokler je ime prevzeto
  (`shared/navigation/acting-user-banner.component.ts`), in nosi izhod iz stanja. Na ozkem
  zaslonu je meni zaprt in vsak zaslon bi izgledal kot lasten — pas je edino, kar loči "gledam
  svoje podatke" od "pišem v tuje".
- **Preklop stran ponovno naloži** z `location.reload()` — torej z isto operacijo kot F5.
  Podatki uporabnika so razpršeni po kakih dvajsetih storitvah s signali, vsaka s svojim
  predpomnilnikom. Ročno praznjenje vseh bi bil seznam, ki ga je treba dopolniti ob vsaki novi
  storitvi; pozabljena bi pomenila, da admin gleda ime enega uporabnika in podatke drugega.
  Prijava ponovno nalaganje preživi (dostopni žeton se obnovi iz httpOnly sejnega piškotka).

  Prva izvedba je namesto tega uporabila `location.assign('/')` in to je bila napaka: izbira se
  je shranila, dokument pa se ni zamenjal, zato je zaslon do ročne osvežitve kazal prejšnjega
  uporabnika. Ostati na trenutni poti je varno tudi, če ima izbrani uporabnik ta zavihek
  izklopljen — `tabGuard` tak primer že pozna in preusmeri na nadzorno ploščo brez napake.
- Izbira se hrani v `localStorage` pod `cd.actingUserId`, da preživi osvežitev strani. Je
  **namig**, ne resnica — resnico pove `actingAs` iz `GET /auth/me`.

## Za avtomatizacijo (n8n)

Glava je za **prijavljenega človeka**. Avtomatizacija z `X-API-Key` z njo dobi `403`; v čigavem
imenu deluje ključ, določa `platform/auth/automation-owner.ts` (glej tudi
`docs/file-sharing-automation.md`).

## Pogodba

`X-Acting-User` je opisan enkrat, kot `components/parameters/ActingUser` v
[`specs/001-app-shell-dashboard/contracts/openapi.yaml`](../specs/001-app-shell-dashboard/contracts/openapi.yaml)
— po istem dogovoru kot `Idempotency-Key`, ki ga druge pogodbe prav tako le omenjajo. Edina
pot, ki jo je 012 spremenil, je `/auth/me` (polje `actingAs`), in ta je last 001; iz iste
utemeljitve kot pri 004 svoje vzporedne pogodbe ni.

Testi: [`apps/api/tests/contract/acting-user.spec.ts`](../apps/api/tests/contract/acting-user.spec.ts).
