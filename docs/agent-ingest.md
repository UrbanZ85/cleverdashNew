# Uvoz iz agenta (ChatGPT, n8n)

Ena vstopna točka, prek katere zunanji agent shrani vsebino v CleverDash: `POST /api/v1/ingest`.

Namen je en sam in ozek: uporabnik agentu pošlje naslov strani, agent jo prebere in vsebino
shrani — recept v kuharico, članek med povezave, povzetek med beležke. Vse, kar mora uporabnik
narediti, je izdati ključ in prilepiti navodilo, ki ga dobi ob tem.

## Za uporabnika

1. **Nastavitve → Agent → Ključi za ChatGPT in n8n.**
2. Vpiši ime ključa, izberi veljavnost in odkljukaj, kam sme ta ključ shranjevati.
3. **Izdaj ključ.** Pritisni *Kopiraj navodilo za ChatGPT*.
4. Navodilo prilepi v pogovor z ChatGPT. Nato mu pošlji naslov strani.

Ključ je viden **samo ob izdaji**. Kdor ga izgubi, izda novega — obnoviti ga ni mogoče. Oblika
zahteve (brez ključa) se da prebrati kadar koli prek gumba *Navodilo*.

Ključ prekliči takoj, ko ga ne rabiš več (gumb *Prekliči*): preklic je nepovraten in agent, ki ga
uporablja, takoj neha delovati.

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

**Ena pot namesto poti na cilj.** Naslov je edino, kar uporabnik prilepi v pogovor. Z eno potjo je
dodatni cilj sprememba ene besede v telesu, ki jo agent izbere sam, in ne nov naslov, ki ga mora
človek znova prilepiti.

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
| `platform/ingest/router.ts` | `POST /ingest`, `GET /ingest/targets`. |
| `platform/ingest/keys.router.ts` | Izdaja in preklic agentskih ključev. |
| `platform/ingest/instructions.ts` | Besedilo, ki ga uporabnik prilepi agentu. |
| `platform/apikeys/model.ts` | `ownerId` in `targets` na ključu. |
| `modules/<modul>/ingest.ts` | Prispevek modula. |
