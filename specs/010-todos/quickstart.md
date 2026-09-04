# Preverjanje: 010 — Opravila

Kako se prepričaš, da funkcionalnost res deluje. Ni vadnica za pisanje kode — je seznam
poskusov, ki morajo uspeti, preden je 010 končana.

---

## Predpogoji

```bash
npm install
docker compose -f infra/docker-compose.dev.yml up -d    # samo MongoDB
npm run dev:api                                          # http://localhost:3000
npm run dev:web                                          # http://localhost:4200, /api gre na :3000
```

Za ročne poskuse z **dvema** uporabnikoma potrebuješ dva računa v Keycloaku (oba z vlogo
`cleverdash-user`) in dva ločena brskalniška profila — ne dveh zavihkov istega profila, ker si
delita sejo.

---

## 1. Samodejno — mora biti zeleno

```bash
npm run typecheck        # strict, brez any v domenski plasti
npm run lint             # vključno s cleverdash/module-boundary
npm test                 # apps/api: Vitest + mongodb-memory-server
npm run build:web        # mora se ustaviti pri 0 napakah
npm run generate:contracts   # pogodba se mora prevesti v tipe
```

Prvi `npm test` prenese ~600 MB binarne datoteke MongoDB in nato uporablja predpomnilnik.

**Pogodbo je mogoče preveriti tudi samostojno**, brez celotnega paketa:

```bash
node --input-type=module -e "
import openapiTS, { astToString } from 'openapi-typescript';
const ast = await openapiTS(new URL('file://' + process.cwd() + '/specs/010-todos/contracts/openapi.yaml'));
console.log('OK,', astToString(ast).length, 'znakov');
"
```

---

## 2. Test, ki je za to funkcionalnost najpomembnejši

Sočasnost ni robni primer, ampak zahteva (FR-027, SC-003). Ta test **mora** obstajati in mora
biti zelen:

```
apps/api/tests/contract/todos/concurrency.spec.ts
```

Kaj mora preveriti:

1. **Dva hkratna `PATCH` na različni opravili istega seznama** — obe spremembi obstaneta.
   Zaženeta se s `Promise.all`, ne zaporedno; zaporedno bi test uspel tudi pri napačni izvedbi.
2. **Hkraten preklop in prerazvrstitev** — obe obstaneta.
3. **Hkratno dodajanje dveh opravil** — nastaneta obe, tudi če dobita isti `position`
   (`position` je namig, ne enolični ključ), in prikazani vrstni red je med dvema branjema
   **stabilen**.

Če ta datoteka ne obstaja ali je preskočena, 010 **ni** končana, ne glede na to, kako izgleda
vmesnik.

---

## 3. Ročno: osebni seznam (US1)

1. Odpri `http://localhost:4200/todos`. Prazen zavihek mora imeti **pojasnilo in gumb**, ne
   prazne strani.
2. Naredi seznam "Nakup".
3. V vnosno polje napiši `Mleko`, Enter, `Kruh`, Enter, `Kava`, Enter — **brez enega samega
   klika z miško vmes**. Vsa tri opravila morajo biti tam, polje pa prazno in v fokusu (SC-001).
4. Prilepi v polje besedilo iz treh vrstic. Nastati morajo **tri** opravila, ne eno s prelomi.
5. Klikni checkbox pri `Mleko`. Prečrta se, zbledi in **pade pod črto**. Odziv mora biti
   viden takoj, ne po odgovoru strežnika (SC-002).
6. Osveži stran. Vrstni red in stanja se ne smejo spremeniti.
7. Klikni checkbox pri prečrtanem `Mleko`. Vrne se **nad črto, na svoje prejšnje mesto**.
8. Odkljukaj dve stvari in pritisni "Počisti opravljene" → potrditev → odstranjeni sta samo ti
   dve.
9. Poskusi shraniti prazno opravilo (samo presledki). Zavrnjeno, nič ne nastane.

---

## 4. Ročno: ploščica (US2)

1. V Nastavitve → Nadzorna plošča vklopi ploščico "Opravila".
2. Ploščica mora kazati **nazadnje spremenjen** seznam, njegov napredek in do šest
   neodkljukanih opravil.
3. Klikni checkbox **na ploščici**. Spremeni se; na zavihku mora biti isto stanje.
4. V glavi ploščice **pripni** drug seznam. Spremeni nekaj na prvem seznamu — ploščica mora
   ostati na pripetem.
5. **Izbriši pripeti seznam.** Ploščica mora pasti nazaj na nazadnje spremenjenega, to
   pokazati, in **ne sme** pokazati napake ne preprečiti izrisa drugih ploščic (SC-010).
6. Klikni naslov ploščice → zavihek se odpre s **tem** seznamom izbranim.

**Regresija, ki jo je treba preveriti posebej** (in je razlog za popravek pred
funkcionalnostjo): po shranjevanju razporeditve ploščic morata ostati **tudi** ploščica "Pot"
in ploščica "Opravila". Če katera izgine, manjka vnos v `KNOWN_TILE_TYPES`.

---

## 5. Ročno: deljenje in tri stopnje (US3)

Uporabnik **A** je lastnik, **B** soudeleženec, **C** nima nič.

| Korak | Pričakovano |
|---|---|
| A odpre deljenje | v izbirniku so uporabniki, ki so se **že prijavili**; ob imenu **zamaskirana** e-pošta, nikoli cela |
| A doda B kot `view` | B seznam vidi med svojimi, označenega kot **nov**; po prvem odprtju oznaka izgine |
| B poskusi odkljukati | ne gre; vmesnik checkboxa sploh ne ponuja |
| A spremeni B v `check` | B sme odkljukati; **ne** sme dodajati, urejati, brisati ne preurejati |
| A spremeni B v `edit` | B sme vse z opravili; **ne** sme izbrisati seznama, ga preimenovati, zakleniti ne deliti |
| B odkljuka `Kruh` | A po osvežitvi vidi odkljukano **in kdo je odkljukal** |
| A odvzame B dostop | seznam B-ju izgine; naslednja zahteva se obravnava, kot da ne obstaja |
| C odpre naslov seznama neposredno | odgovor, iz katerega **ni razvidno**, da seznam obstaja (SC-004) |
| B se sam odstrani s seznama | uspe |

---

## 6. Ročno: zaklep (US4)

1. A zaklene seznam. Ključavnica mora biti vidna na čipu in v glavi — **tudi B-ju**.
2. B (stopnja `edit`) klikne checkbox → sprememba ne obvelja in B dobi sporočilo, **da je
   seznam zaklenil lastnik**. Ne sme biti tihe vrnitve v prejšnje stanje (SC-006).
3. Razlika, ki jo je treba videti z očmi: pri **premajhni stopnji** vmesnik kontrolo **skrije**,
   pri **zaklepu** jo **pusti** in pokaže ključavnico. Če sta odziva enaka, statusa nista
   pravilno ločena (`403` proti `409`).
4. A na zaklenjenem seznamu doda opravilo → uspe.
5. A odklene → B spet sme natanko to, kar mu dovoljuje njegova stopnja.

---

## 7. Ročno: rok (US5) — in kaj preveriti brez čakanja na marec

V vmesniku:

1. Opravilu daj rok včeraj → označeno kot **zapadlo**.
2. Rok danes → označeno kot **današnje**, in **ne** kot zapadlo, tudi zvečer.
3. Odkljukaj opravilo z zapadlim rokom → med zapadla se ne šteje več, tudi na znački zavihka.

Prehoda na poletni/zimski čas se ne da počakati, zato je preverjen z enotskimi testi. Ti
**morajo** obstajati (kakovostna vrata, točka 2):

```bash
npm test -w apps/api -- due-date
```

Pokrivati morajo: `2026-03-29` (dan, dolg 23 ur), `2026-10-25` (25 ur), rok 29. 3. ovrednoten ob
`2026-03-28T22:30:00Z` → `later`, rok 25. 10. ob `2026-10-24T23:30:00Z` → `today`, in rok
1. 3. ob `2026-02-28T23:30:00Z` → `tomorrow`.

---

## 8. Ročno: API brez vmesnika (US7)

```bash
TOKEN=...   # dostopni žeton prijavljenega uporabnika
LIST=...    # id seznama iz GET /todos/lists

# doda opravilo
curl -s -X POST http://localhost:3000/api/v1/todos/lists/$LIST/tasks \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: poskus-1' \
  -d '{"titles":["Iz avtomatizacije"]}'

# ISTI klic še enkrat — NE SME nastati drugo opravilo, odgovor mora biti prvotni
curl -s -X POST http://localhost:3000/api/v1/todos/lists/$LIST/tasks \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: poskus-1' \
  -d '{"titles":["Iz avtomatizacije"]}'
```

Nato isto za brisanje — in to je test, ki bi pri `204` padel:

```bash
TASK=...
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE \
  http://localhost:3000/api/v1/todos/lists/$LIST/tasks/$TASK \
  -H "Authorization: Bearer $TOKEN" -H 'Idempotency-Key: brisanje-1'     # 200

curl -s -o /dev/null -w '%{http_code}\n' -X DELETE \
  http://localhost:3000/api/v1/todos/lists/$LIST/tasks/$TASK \
  -H "Authorization: Bearer $TOKEN" -H 'Idempotency-Key: brisanje-1'     # 200, NE 404
```

Drugi klic mora vrniti **`200`**. Če vrne `404`, endpoint vrača `204` in obljuba iz člena III
ne drži (glej `plan.md` → Complexity Tracking, U2).

Preveri še imenik — v odgovoru **ne sme** biti `keycloakSubject`, `scopes` ne celega naslova:

```bash
curl -s http://localhost:3000/api/v1/users -H "Authorization: Bearer $TOKEN"
```

---

## 9. Meja modula (člen I, SC-009)

Preizkus, ki ga ustava zahteva in ga je treba **res** narediti, ne samo verjeti:

```bash
git stash list                                    # da veš, kam se vračaš
rm -rf apps/api/src/modules/todos apps/web/src/app/features/todos
# odstrani en vnos iz platform/tabs/registry.ts, eno vrstico iz main.ts,
# eno vrstico iz app.routes.ts in en vnos iz shared/tiles/tile-registry.ts
npm run typecheck && npm run lint && npm test
git checkout -- . && git clean -fd apps/api/src/modules/todos apps/web/src/app/features/todos
```

Vse mora biti zeleno. Če ni, je nekje uvoz iz drugega modula ali sklic, ki v tabeli
»Vpisi zunaj modula« ni naveden.

---

## 10. Kaj mora obstajati, preden je 010 končana

- [ ] `npm run typecheck`, `lint`, `test`, `build:web`, `generate:contracts` — vse zeleno
- [ ] `tests/unit/` — po ena datoteka na vsako iz `modules/todos/domain/`, plus `platform/users/user-directory.ts`
- [ ] izčrpna matrika: 4 vloge × 10 zmožnosti × zaklenjeno/odklenjeno, **vključno z lastnikom nad zaklenjenim seznamom, ki mora smeti**
- [ ] `tests/contract/todos/crud.spec.ts`
- [ ] `tests/contract/todos/isolation.spec.ts` — nečlan dobi **404**
- [ ] `tests/contract/todos/sharing.spec.ts` — `view` na `PATCH { done }` dobi **403**, ne 404
- [ ] `tests/contract/todos/lock.spec.ts` — član **409**, lastnik 200
- [ ] `tests/contract/todos/concurrency.spec.ts` — razdelek 2 zgoraj
- [ ] `tests/contract/todos/idempotency.spec.ts` — dodajanje in **brisanje**
- [ ] `tests/contract/users.spec.ts` — projekcija brez `keycloakSubject`, `scopes` in celega naslova
- [ ] `no-owner-fields.spec.ts` razširjen s tretjo kategorijo
- [ ] `apps/web/tests/unit/` — `moveByOne`, razvrščanje za prikaz, in ikona v `icons.spec.ts`
- [ ] ročni preizkusi 3–8 opravljeni z **dvema** uporabnikoma
- [ ] preizkus meje modula (razdelek 9) opravljen
