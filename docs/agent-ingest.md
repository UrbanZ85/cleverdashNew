# Uvoz iz agenta (ChatGPT, n8n)

Ena vstopna točka, prek katere zunanji agent shrani vsebino v CleverDash: `POST /api/v1/ingest`.

Namen je en sam in ozek: uporabnik agentu pošlje naslov strani, agent jo prebere in vsebino
shrani — recept v kuharico, članek med povezave, povzetek med beležke. Vse, kar mora uporabnik
narediti, je izdati ključ in prilepiti navodilo, ki ga dobi ob tem.

## Navadni ChatGPT tega NE zmore — preberi to najprej

Pogovorni ChatGPT **ne zna poslati zahteve POST**. Njegovo brskanje strani samo BERE (GET); nima
orodja, ki bi poslalo telo in lastno glavo `X-API-Key`.

To se v praksi ne pokaže kot zavrnitev, ampak kot zavajajoča napaka. V prvem poskusu je ChatGPT
pravilno prebral recept iz PDF-ja, sestavil **pravilen** JSON in nato javil omrežno napako
(`Could not resolve host: cleverdash.zuusi.com`). Strežnik je bil ves čas zdrav —
`GET /api/v1/health` je vračal `200`, `POST /api/v1/ingest` pa `401` (pravilno: brez ključa).
Ime se je javno razreševalo brez težav. Poslati zahteve preprosto ni znal.

Zato sta dve poti:

| Orodje | Kaj rabiš |
| --- | --- |
| **ChatGPT** | **Custom GPT z Action** (spodaj). Drugače ne gre. |
| n8n, Shortcuts, `curl`, lasten skript | Navodilo iz *Kopiraj navodilo*. Ta orodja POST znajo. |

## Postavitev Custom GPT (enkratna)

1. **Nastavitve → Agent → Shema za Custom GPT (Action)** → *Kopiraj shemo*.
2. V ChatGPT: **Create a GPT → Configure → Create new action**.
3. V polje *Schema* prilepi shemo.
4. **Authentication → API Key**, *Auth Type*: `Custom`, *Custom Header Name*: `X-API-Key`,
   v polje za vrednost pa prilepi ključ.
5. V *Instructions* GPT-ja prilepi besedilo iz *Kopiraj navodilo* — tam so pravila (slovenščina,
   brez izmišljanja, kaj pomeni kateri odgovor).

Nato mu samo pošlješ naslov strani.

Shema je vezana na **cilje**, ne na ključ, zato se ob zamenjavi ključa ne spremeni — zamenjaš le
vrednost v zavihku Authentication.

## Izdaja ključa

1. **Nastavitve → Agent → Ključi za ChatGPT in n8n.**
2. Vpiši ime, izberi veljavnost in odkljukaj, kam sme ta ključ shranjevati.
3. **Izdaj ključ.**

Ključ je viden **samo ob izdaji**. Kdor ga izgubi, izda novega — obnoviti ga ni mogoče. Oblika
zahteve (brez ključa) se da prebrati kadar koli prek gumba *Navodilo*.

Ključ prekliči takoj, ko ga ne rabiš več (gumb *Prekliči*): preklic je nepovraten in agent, ki ga
uporablja, takoj neha delovati.

### Veljavnost

Privzeto **10 minut**, na voljo od 5 minut do brez roka. Kratko je namerno: ključ se prilepi v tuj
pogovorni vmesnik, kjer obvisi v zgodovini pogovora, ki je ne nadzoruje nihče.

**Pri Custom GPT to pomeni kompromis**, ki ga je vredno poznati: ključ je shranjen v nastavitvah
GPT-ja, zato desetminutni ključ pomeni vpis novega pred vsako uporabo. Za GPT, ki ga uporabljaš
redno, je smiselna daljša izbira; za enkratno shranjevanje recepta je 10 minut prav.

## Pogodba

### Zahteva

```
POST /api/v1/ingest
X-API-Key: cd_…
Content-Type: application/json

{
  "target": "recipes",
  "data": { "title": "Bučna juha", "url": "https://okusno.si/recept/bucna-juha" }
}
```

- `target` je neobvezen, kadar ima ključ **natanko en** cilj. Pri več ciljih je obvezen —
  privzetek bi pomenil, da zapis tiho pristane, kjer ga agent ni nameraval shraniti.
- `data` sme biti tudi **seznam** objektov (največ 25). Sveženj se obdela zaporedno, tako da se
  dvojnik prepozna tudi znotraj istega svežnja.
- Aktualen seznam ciljev z opisi polj vrne `GET /api/v1/ingest/targets`. Ta seznam ni nikjer
  prepisan — sestavi ga register.

### Druga oblika: ena pot na cilj

```
POST /api/v1/ingest/recipes
X-API-Key: cd_…

{ "title": "Bučna juha", "url": "https://…" }
```

Cilj je v naslovu, zato je telo **sam zapis**, brez ovojnice. To obliko uporablja Custom GPT
Action: model tam izbira med ORODJI in ne med vrednostmi polja, zato je ena pot na cilj edina
oblika, pri kateri ne zgreši. Ista koda, ista pravila, isti odgovori.

`GET /api/v1/ingest/openapi.json` vrne OpenAPI 3.1 shemo za te poti — samo za cilje, ki jih
klicatelj sme uporabiti. Shema je za avtentikacijo, ne javna, in ključa ne vsebuje.

### Odgovor

| Stanje | Status | Pomen |
| --- | --- | --- |
| `created` | `201` | Zapis je nastal. `url` kaže nanj. |
| `duplicate` | `200` | Zapis že obstaja; `id` in `url` kažeta na obstoječega. Nič ni nastalo. |
| — | `400` | Telo ne ustreza shemi cilja. `detail` pove, katero polje. |
| — | `403` | Cilj ne obstaja **ali** s tem ključem ni dovoljen (namenoma isti odgovor). |
| — | `401` | Ključ je neveljaven, preklican ali potekel. |

Polje `warnings` je v odgovoru vedno in je lahko prazno: vanj gre vse, kar je bilo porezano ali
izpuščeno (npr. mapa, ki ne obstaja). Člen VII — izid ni skrit v dnevnik.

## Zakaj tako

**Dva zapisa iste pogodbe.** `/ingest` z `target` v telesu je za `curl` in n8n, kjer se naslov
sestavi enkrat. `/ingest/<cilj>` je za Custom GPT Action, kjer model izbira med ORODJI in ne med
vrednostmi polja — ena pot z razvejano shemo (`oneOf` po `target`) je oblika, pri kateri redno
pošlje polja enega cilja pod imenom drugega. Obe vodita v isto kodo, zato to nista dve pogodbi.

**Dve zapori, ne ena.** Vsak cilj nosi obseg svojega modula (`recipes:write` …) in ta se preveri
kot pri vsaki drugi poti. Poleg tega ima ključ **svoj seznam ciljev**, ki je ožji: ključ za
recepte ne more pisati beležk, tudi kadar bi obsegi to dovolili. Ključ, ki ga človek prilepi v tuj
pogovorni vmesnik, je najbolj izpostavljena poverilnica v tej namestitvi.

**Agentski ključ ni administratorski.** `/ingest/keys` je ločen od `/api-keys`: tam administrator
izda ključ s poljubnim obsegom, tu si lastnik podatkov izda svojega, obsegov pa si ne izbere —
izpeljejo se iz izbranih ciljev. `admin` po tej poti v ključ ne more priti. Ključ tudi ne more
izdati drugega ključa (sicer bi eno uhajanje rodilo neomejeno nadaljnjih).

**Strežnik strani ne obišče.** Agent jo je pravkar prebral; drugo branje bi tujemu strežniku
prineslo dva obiska namesto enega (člen VIII). Zato je `sourceStatus`/`metadataStatus` uvoženega
zapisa `skipped` — to pomeni "strežnik strani ni obiskal", ne "ni uspelo".

**Dvojnik ne nastane.** V vmesniku je podvojen zapis odločitev človeka, ki jo vidi; agent je ne
vidi in bi ob vsaki ponovitvi dodal še eno vrstico. Recept in povezavo enolično določa naslov
strani — beležke ne določa nič, zato pri beležkah te preverbe **ni** (dve enaki beležki sta dve
beležki, tiho zavržena beležka pa izguba podatka).

**Navodilo sestavi strežnik.** Navodilo je opis pogodbe. Napisano na roko bi se od nje razšlo ob
prvi spremembi polja — in razšlo bi se tiho, ker živi v zgodovini pogovora z agentom, kjer ga
noben test ne vidi. Izpeljano je iz istega registra, ki mu strežnik streže, zato novo polje v
cilju pomeni novo vrstico v navodilu brez enega popravka drugje.

## Cilji

| `target` | Modul | Obseg | Dvojnik po |
| --- | --- | --- | --- |
| `recipes` | 013 Recepti | `recipes:write` | `url` |
| `saved-links` | 008 Shranjene povezave | `saved-links:write` | `url` |
| `notes` | 007 Beležke | `notes:write` | — |

Cilj prispeva **modul sam** (`modules/<modul>/ingest.ts` + ena vrstica v `main.ts`). V
`platform/ingest/` ni nobenega uvoza iz `modules/` in nobenega seznama ciljev — brisanje mape
modula ostane brisanje mape in ene vrstice (člen I). Kako dodati cilj: korak 8 v
[`docs/adding-a-tab.md`](adding-a-tab.md).

## Kje je kaj

| Datoteka | Kaj |
| --- | --- |
| `platform/ingest/registry.ts` | Register ciljev; ne pozna nobenega modula. |
| `platform/ingest/router.ts` | `POST /ingest`, `POST /ingest/<cilj>`, `GET /ingest/targets`. |
| `platform/ingest/openapi.ts` | Shema za Custom GPT Action. |
| `platform/ingest/keys.router.ts` | Izdaja in preklic agentskih ključev. |
| `platform/ingest/instructions.ts` | Besedilo, ki ga uporabnik prilepi agentu. |
| `platform/apikeys/model.ts` | `ownerId` in `targets` na ključu. |
| `modules/<modul>/ingest.ts` | Prispevek modula. |
