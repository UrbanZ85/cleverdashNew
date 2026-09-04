# Podatkovni model: 010 — Opravila

**Ena nova zbirka**: `todoLists`. Nobena obstoječa zbirka ne dobi novega polja.
Utemeljitev oblike je v [research.md](./research.md) §1–§4.

---

## Načelo lastništva zapisov — tretja kategorija

004 je uvedel dve kategoriji zapisov, ki ju preverja `apps/api/tests/unit/no-owner-fields.spec.ts`:

1. **osebni** — nosijo `userId`, ki je prvi člen vsakega indeksa (`Note`, `Camera`, `Settings` …)
2. **skupni referenčni / varnostni** — `userId` **ne** nosijo (`Holiday`, `ExternalCache` …)

`TodoList` ni ne eno ne drugo in uvaja **tretjo**:

3. **lasten, a namenoma deljen** — nosi `ownerId` in `members`, **ne** `userId`.

**Zakaj drugo ime in ne `userId`**: `userId` v tej bazi pomeni "ta zapis je zaseben in
`{ _id, userId }` je pogoj dostopa". Tu je ta obljuba **namenoma neresnična** — član bere
zapis, katerega `ownerId` ni njegov, dostop pa odloči `resolveListAccess`, ne enakost. Ponovna
uporaba imena bi vsakega bodočega bralca zavedla v izolacijo, ki je ta model ne daje.

Test se zato razširi, ne obide:

```ts
// 010: TRETJA kategorija, ki je 004 še ni imela — zapis, ki je oseben, a ga NAMENOMA bere
// tudi kdo drug. Dostop odloči `resolveListAccess`, ne `{ _id, userId }`.
const ownedAndShared = [['TodoList', TodoListModel]] as const;

it.each(ownedAndShared)('%s nosi ownerId in NE userId', (_name, model) => {
  expect(Object.keys(model.schema.paths)).toContain('ownerId');
  expect(Object.keys(model.schema.paths)).not.toContain('userId');
});
```

---

## `TodoList` (zbirka `todoLists`)

| Polje | Tip | Obvezno | Opis |
|---|---|---|---|
| `_id` | ObjectId | ✔ | |
| `ownerId` | ObjectId → `User` | ✔ | Lastnik. Se **ne** prenaša (FR-002). |
| `title` | String ≤ 100 | ✔ | Ime seznama. |
| `locked` | Boolean | ✔ (privzeto `false`) | Zaklep lastnika (FR-060). |
| `members` | `[TodoMember]` | ✔ (privzeto `[]`) | Soudeleženci, do `MAX_MEMBERS_PER_LIST`. |
| `tasks` | `[TodoTask]` | ✔ (privzeto `[]`) | Opravila, do `MAX_TASKS_PER_LIST`. |
| `lastModifiedBy` | ObjectId → `User` \| `null` | ✔ (privzeto `null`) | Kdo je zadnji karkoli spremenil (FR-006). Nastavi ga **vsak** zapis, v istem `$set`. |
| `createdAt`, `updatedAt` | Date | ✔ | `timestamps: true`. **`updatedAt` se nikoli ne nastavlja ročno** — Mongoose ga vzdržuje tudi pri `findOneAndUpdate`, in ploščica je od tega odvisna. |

`versionKey: false` — glej [research.md](./research.md) §2 za razlog, zakaj optimistične
sočasnosti namenoma **ni**.

### Vdelano: `TodoTask`

| Polje | Tip | Obvezno | Opis |
|---|---|---|---|
| `_id` | ObjectId | ✔ | **`_id: true` je nujen**, za razliko od `Settings.tiles`: opravilo je naslovljivo iz URL-ja in je tarča `arrayFilters` pri vsakem zapisu. |
| `title` | String ≤ 200 | ✔ | Že očiščeno (`sanitizeTaskTitle`). |
| `done` | Boolean | ✔ (privzeto `false`) | |
| `doneAt` | Date \| `null` | ✔ (privzeto `null`) | Razvrstitev odkljukanih (FR-022). Ob vrnitvi med neodkljukana spet `null`. |
| `doneBy` | ObjectId → `User` \| `null` | ✔ (privzeto `null`) | Kdo je odkljukal (FR-024). Ob vrnitvi spet `null`. |
| `dueDate` | Date \| `null` | ✔ (privzeto `null`) | UTC instant **konca** koledarskega dneva v `Europe/Ljubljana`. `null` = **brez roka**, ne "danes" (FR-030). |
| `position` | Number | ✔ | Ročni vrstni red neodkljukanih. Redke vrednosti, korak `POSITION_STEP`. **Ni enolični ključ** (FR-026). |
| `createdAt` | Date | ✔ | Nastavi ga domenska plast (`makeTask`), **ne** shemin privzetek. |

> **Zakaj podshema nima `timestamps: true`**: Mongoose podpoljnih časovnih žigov ob `$push`
> prek `findOneAndUpdate` **ne** nastavi (nastavi jih šele `save()` nad nadrejenim dokumentom),
> vsa pisanja v tem modulu pa gredo prek operatorjev. Žig, ki je enkrat nastavljen in drugič
> ne, je slabši od žiga, ki ga vedno nastavi domenska plast. Iz istega razloga se **noben**
> zapis ne zanaša na `default` iz podsheme.

### Vdelano: `TodoMember`

| Polje | Tip | Obvezno | Opis |
|---|---|---|---|
| `userId` | ObjectId → `User` | ✔ | |
| `role` | `'view' \| 'check' \| 'edit'` | ✔ | FR-041 do FR-044. |
| `addedAt` | Date | ✔ | |
| `seenAt` | Date \| `null` | ✔ (privzeto `null`) | `null` = seznam je zanj **nov** (FR-007). Nadomestilo za potisno obvestilo. |

> **`_id: false`**: članstvo **JE** `userId`. Lasten `_id` bi isti stvari dal drugo identiteto
> in dopustil dva vnosa za istega človeka z različnima vlogama — stanje, na katero razsodnik
> dostopa ne bi imel enoličnega odgovora. Enoličnosti **ne** uveljavlja indeks (enoličen indeks
> nad `members.userId` bi prepovedal članstvo v **dveh** seznamih), ampak pogoj
> `'members.userId': { $ne: targetId }` v `$push`.

---

## Indeksi

```ts
todoListSchema.index({ ownerId: 1, updatedAt: -1 });
todoListSchema.index({ 'members.userId': 1, updatedAt: -1 });
```

**Dva in ne en sestavljen**: poizvedba "moji seznami" je `$or` nad lastništvom in članstvom,
MongoDB pa za `$or` izbira načrt **po vsaki veji ločeno**. Vrstni red polj sledi točno
poizvedbi (`.sort({ updatedAt: -1 })`); brez tega bi Mongo sortiral v pomnilniku — ista opomba
kot pri `noteSchema.index({ userId, pinned, updatedAt })`.

Drugi je **večključni** (multikey): vnos nastane za vsakega člana. Brez njega je "seznami,
deljeni z mano" pregled cele zbirke.

> Da ta indeks lahko postreže tudi razvrstitev, mora enakost na `members.userId` izbrati
> natanko **en** indeksni vnos na dokument — kar drži samo, dokler isti uporabnik v `members`
> ne nastopi dvakrat. Podvojen vnos bi dokument v seznamu pokazal **dvakrat** in razvrstitev bi
> postala blokirna. To je drugi, neodvisni razlog, zakaj pogoj `$ne` pri dodajanju člana ni
> kozmetika.

Ploščica (`GET /todos/current`) uporabi isti `$or`: vsaka veja je postrežena s svojim
indeksom, MongoDB združi dva že urejena tokova in `.limit(1)` se ustavi pri prvem — brez
blokirnega sortiranja, en dokument, ena povratna pot.

---

## Izpeljano, ne shranjeno

| Vrednost | Kako nastane | Zakaj ni shranjena |
|---|---|---|
| `taskCount`, `openCount` | preštej `tasks` ob branju | Dva števca, ki ju je treba vzdrževati ob vsakem zapisu, sta dve priložnosti, da se razideta z resnico. Pri ≤ 200 elementih je štetje brezplačno |
| vrstni red za prikaz | `orderTasks()` ob branju | Odvisen je od `done`, ki se spremeni brez `$push`. `$push: { $sort: … }` bi ustvaril **videz** urejenega polja, ki ga prvo odkljukanje tiho razveljavi |
| `dueState` (`overdue`/`today`/`tomorrow`/`later`) | `dueState(dueDate, now)` | Odvisen od **zdaj**. Shranjen bi bil napačen naslednji dan — in prav to je razred hrošča, ki ga člen V.4 naslavlja |
| `nextDueDate` seznama | `nextDueDate(tasks)` | Izpeljanka iz opravil |
| `capabilities` uporabnika | `capabilitiesFor(role, locked)` | Odvisne od tega, **kdo** bere; niso lastnost zapisa |
| `isNew` | `member.seenAt === null` | Že zapisano kot `seenAt` |
| ime in začetnice člana | `platform/users/directory.service.ts` ob izpisu | Kopija imena v zapisu bi ob preimenovanju v Keycloaku zamrznila staro |

---

## Prehodi stanj

**Opravilo**

```
                   PATCH { done: true }
   ┌─────────────┐ ──────────────────────► ┌──────────────┐
   │ neodkljukano│                          │  odkljukano  │
   │  done=false │ ◄────────────────────── │  done=true   │
   │ doneAt=null │  PATCH { done: false }   │ doneAt=<čas> │
   │ doneBy=null │                          │ doneBy=<kdo> │
   └─────────────┘                          └──────────────┘
          │                                        │
          │ DELETE …/tasks/{id}                    │ DELETE …/tasks/{id}
          │                                        │ POST …/tasks/clear-completed
          ▼                                        ▼
      (odstranjeno)                           (odstranjeno)
```

`doneAt` in `doneBy` se nastavita in počistita **v istem `$set`** kot `done`. Dve zaporedni
pisanji bi lahko pustili `done: true` brez `doneAt`, kar bi opravilo v prečrtani skupini
razvrstilo poljubno; eno pisanje ne more pustiti polovice.

**Seznam**

```
   ┌───────────┐  PATCH { locked: true }   ┌────────────┐
   │ odklenjen │ ────────────────────────► │  zaklenjen │
   │           │ ◄──────────────────────── │            │
   └───────────┘  PATCH { locked: false }  └────────────┘
        │  (samo lastnik, oba prehoda)            │
        └────────────────┬───────────────────────┘
                         │ DELETE …/lists/{id}   (samo lastnik, tudi zaklenjen)
                         ▼
                    (izbrisano — z opravili IN članstvi)
```

Zaklep **ne** spremeni ničesar trajno: odklep povrne natanko prejšnje pravice (FR-064).
Lastnik sme na zaklenjenem seznamu vse, kar sme sicer (FR-062).

**Članstvo**

```
   (ni član) ──PUT …/members/{userId}──► [seenAt=null: "novo"] ──POST …/seen──► [seenAt=<čas>]
       ▲                                            │                                 │
       └──────DELETE …/members/{userId}─────────────┴─────────────────────────────────┘
              (lastnik ali soudeleženec sam — tudi kadar je seznam zaklenjen)
```

---

## Meje

| Konstanta | Vrednost | Kje se uveljavi |
|---|---|---|
| `MAX_LIST_TITLE_LENGTH` | 100 | zod + `maxlength` v shemi |
| `MAX_TASK_TITLE_LENGTH` | 200 | zod + `maxlength` + `sanitizeTaskTitle` |
| `MAX_TASKS_PER_LIST` | 200 | **v filtru zapisa** (research.md §8), ne po branju |
| `MAX_TASKS_PER_REQUEST` | 50 | zod |
| `MAX_LISTS_PER_USER` | 50 | preštej pred ustvarjanjem |
| `MAX_MEMBERS_PER_LIST` | 25 | v filtru zapisa, isti obrazec kot opravila |
| `POSITION_STEP` | 1000 | `domain/task-order.ts` |

---

## Migracije

**Nobene.** Zbirka je nova; nastane ob prvem zapisu, indeksi ob zagonu. Hišna strategija za
kasnejša polja ostane ista kot povsod: shemin privzetek plus obrambno branje (`?? fallback`),
nikoli ločen migracijski korak.
