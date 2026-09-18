# Quickstart: Recepti (013)

Kako modul preizkusiti in kje pogledati, kadar kaj ne dela.

## 1 — Zagon

Nobene priprave ni: vseh sedem spremenljivk okolja ima privzetek v
`apps/api/src/platform/config/env.ts`, novega nosilca v `infra/docker-compose.yml` pa modul ne
uvaja, ker so slike v bazi.

```bash
npm run dev:api     # vrata iz PORT
npm run dev:web     # Ionic dev strežnik
```

Zavihek **Recepti** se pojavi v meniju sam. Če ga ni, je razlog skoraj gotovo eden od dveh:

- uporabnik nima obsega `recipes:read` → preveri `BASE_USER_SCOPES` v
  `apps/api/src/platform/keycloak/role-mapping.ts` (korak 5 iz `docs/adding-a-tab.md`);
- zavihek je izklopljen v osebnih nastavitvah → `Nastavitve → Zavihki`.

## 2 — Recept s spleta (US1)

1. **Recepti → +**
2. V *Povezava* prilepi naslov strani z receptom, v *Ime* karkoli, **Shrani**.
3. Kadar stran nosi `schema.org/Recipe`, so sestavine, koraki, čas in porcije izpolnjeni.

Če ostanejo prazni, odgovor pove, zakaj — pod obrazcem se izpiše stanje vira:

| stanje | pomen | kaj storiti |
|---|---|---|
| (brez izpisa) | recept nima naslova, ali pa je bila stran prebrana | nič |
| `skipped` | naslova **nismo obiskali** — ni prestal varovala | naslov je `http://` ali kaže v zasebno omrežje; vpiši ročno |
| `failed` | poskusili smo in ni šlo | *Preberi s strani* poskusi znova |
| `ok`, a polja prazna | stran smo prebrali, recepta v njej ni bilo | stran nima `ld+json`; vpiši ročno |

> **Najpogostejši `skipped`**: varovalo odhodnih naslovov dovoli izključno `https`. To je namerno
> in se v tem modulu ne mehča — glej `apps/api/src/domain/outbound-url.ts`.

## 3 — Recept z lista (US2)

**Recepti → +**, vpiši samo *Ime*, **Shrani**. Naslov ni obvezen; to je glavna razlika do modula
008. Sestavine in korake je mogoče **prilepiti naenkrat** — vsaka vrstica postane svoj vnos,
vodilni `-`, `*` in `1.` pa se odstranijo.

## 4 — Slike (US3)

V pogledu recepta **Dodaj sliko** (mogoče je izbrati več naenkrat).

Kaj se zgodi v ozadju:

1. Brskalnik sliko izmeri in ji naredi pomanjšavo (`<canvas>`, daljša stranica 600 px).
2. Izvirnik gre v eni zahtevi, pomanjšava v drugi.
3. Strežnik **vrsto ugotovi iz vsebine**, ne iz imena — preimenovan `.pdf` v `.jpg` ne pomaga.
4. Prva slika postane naslovna sama od sebe.

Za preizkus zavrnitve: preimenuj katero koli besedilno datoteko v `.jpg` in jo poskusi naložiti —
odgovor je `400` s pojasnilom, da vrsto ugotavljamo iz same datoteke.

## 4b — Kategorije (US10)

1. V seznamu receptov je nad kartami vrstica čipov; skrajno desno je **Uredi**.
2. Dodaj `Juhe`, `Kosila`, `Zajtrki`, `Večerje`. Kategorija sme obstajati, preden je v njej kak
   recept.
3. V receptu (urejanje) je izbirnik **Kategorije** — izbereš jih lahko **več hkrati**.
4. V seznamu klikni čip → samo ti recepti. Ponoven klik na isti čip ga odznači.
5. Kategorija in oznaka delujeta **hkrati**: `?category=Juhe&tag=vegi`.

Dve stvari, ki presenetita, če se ju ne pričakuje — obe sta namerni:

| poteza | kaj se zgodi | zakaj |
|---|---|---|
| preimenovanje kategorije | popravi ime v besednjaku in v **lastnih** receptih; pove, koliko jih je bilo | v tujem deljenem receptu je ime last lastnika |
| izbris kategorije | **nobenega recepta ne izbriše** — samo odstrani kategorijo z njih | recept je delo uporabnika, kategorija je njegova razvrstitev |

Neznano ime kategorije se ob shranjevanju recepta **samodejno doda** v besednjak — tudi iz n8n:

```bash
curl -X POST "$BASE/api/v1/recipes" \
  -H "X-Api-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"title":"Ričet","categories":["Juhe","Kosila"]}'
```

## 5 — Deljenje z uporabnikom (US4)

Potrebna sta dva računa, ki sta se **oba že vsaj enkrat prijavila** (sicer ju imenik ne ponudi).

> **Kje je deljenje**: v **shranjenem** receptu (pogled, ne urejanje) — vrstica **Deljenje** pod
> gumbi, ki pove tudi stanje. Pri *ustvarjanju* recepta je ni: dokler recept nima ID-ja, ni s čim
> deliti. Vidna je samo lastniku.

1. Kot A: recept → **Deljenje** → izberi B → B dobi *Samo ogled*.
2. Kot B: v seznamu je recept z oznako **Novo** in značko *Deljeno*; ko ga odpre, oznaka izgine.
3. Kot B poskusi urejati → gumba ni. (Vmesnik kontrol, ki jih zmožnosti ne dovolijo, ne izriše.)
4. Kot A dvigni B na *Urejanje* → B lahko popravi sestavino in označi "skuhano", **ocene pa ne**.

Preizkus prek API-ja, kadar vmesnik ni v igri:

```bash
curl -X PUT "$BASE/api/v1/recipes/$ID/members/$USER_B" \
  -H "Authorization: Bearer $TOKEN_A" -H 'Content-Type: application/json' \
  -d '{"role":"edit"}'
```

## 6 — Javna povezava (US5)

1. Recept → **Deljenje** → *Ustvari javno povezavo*.
2. Povezavo odpri v **zasebnem oknu** (brez prijave) — recept je viden.
3. *Prekliči povezavo* → isti naslov od tega trenutka vrne "Ta povezava ne obstaja ali ni več
   veljavna."
4. Izdaj novo → dobiš **drug** naslov; stari ostane mrtev.

Kaj je vredno preveriti, kadar se modul spreminja:

```bash
# Odgovor NE sme vsebovati lastnika, soudeležencev, ocene ne zgodovine kuhanja.
curl -s "$BASE/api/v1/shared-recipes/$TOKEN" | grep -E 'ownerId|members|rating|cookCount' && echo PUŠČA
```

Neveljaven, preklican in neobstoječ žeton morajo vrniti **enak** odgovor — različni bi povedali,
da je žeton nekoč obstajal.

## 7 — Kuhanje (US7) in "že dolgo ne" (US8)

- Recept → **Kuhaj po tem receptu**: velika pisava, brez menija, zaslon ne ugasne. Odkljukani
  koraki so stanje tistega kuhanja in se **ne** shranijo.
- **Danes sem to skuhal** zapiše datum in poveča števec. Urejanje recepta ju ne spremeni.
- V seznamu izberi razvrstitev **Že dolgo ne** — na vrhu so recepti, ki še nikoli niso bili
  skuhani.

## 8 — Iz n8n (US9)

```bash
curl -X POST "$BASE/api/v1/recipes" \
  -H "X-Api-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"title":"Iz pogovora","url":"https://primer.si/recept"}'
```

Ključ potrebuje `recipes:write`. Za deljenje in javno povezavo je potreben **ločen** obseg
`recipes:share` — prav zato, da "n8n sme shraniti recept" ne pomeni tudi "n8n sme recept
razobesiti na internet".

## 9 — Testi

```bash
cd apps/api
npx vitest run tests/unit/recipes-capabilities.spec.ts \
               tests/unit/recipes-domain.spec.ts \
               tests/unit/recipes-jsonld.spec.ts     # 87, brez baze
npx vitest run tests/contract/recipes/               # 75, z v-pomnilniškim Mongom

cd ../web
npx vitest run tests/unit/recipes-model.spec.ts tests/unit/recipes-public-route.spec.ts
```

> Teste odjemalca poganjaj **iz `apps/web`**, ne iz korena z `--root`: `recipes-public-route.spec.ts`
> bere izvorne datoteke relativno na delovni imenik in bi sicer javil `ENOENT`.

## 10 — Odstranitev modula

Po `docs/adding-a-tab.md`, obratno:

1. `rm -rf apps/api/src/modules/recipes apps/web/src/app/features/recipes`
2. `rm -rf apps/api/tests/contract/recipes apps/api/tests/unit/recipes-*.spec.ts`
3. `rm apps/web/tests/unit/recipes-*.spec.ts`
4. odstrani vnos iz `TAB_REGISTRY`, **tri** vrstice v `main.ts` (recepti, kategorije, javne poti),
   tri poti v `app.routes.ts`, tri nize v `BASE_USER_SCOPES`, `/api/v1/shared-recipes/` iz
   `AUTH_EXEMPT`, ikone in njihov blok v `icons.spec.ts`, sedem spremenljivk v `env.ts` in
   `.env.example`.

Po tem morajo `npm run typecheck`, `npm run lint` in testi ostati čisti (SC-006).
