import { Schema, model, type InferSchemaType } from 'mongoose';
import { MEMBER_ROLES } from '../domain/capabilities.js';
import { MAX_LIST_TITLE_LENGTH, MAX_TASK_TITLE_LENGTH } from '../domain/todo-input.js';

// data-model.md (010). ENA zbirka: seznam je agregat — opravila IN soudeleženci so v njem.
//
// Zakaj opravila NISO svoja zbirka (glavna odločitev tega modela, research.md §1):
//
// 1. Ta namestitev ima MongoDB kot SAMOSTOJEN strežnik (infra/docker-compose.yml: `mongo:7`
//    brez `--replSet`; testi tečejo na `MongoMemoryServer.create()`, prav tako samostojnem).
//    Transakcij nad več dokumenti tam NI. Ročna prerazvrstitev prepiše položaje več opravil
//    hkrati — v ločeni zbirki je to N pisanj brez transakcije, torej stanje, ki ga izpad ali
//    vzporedna prerazvrstitev sredi operacije pusti s podvojenimi ali preskočenimi položaji,
//    in za tako stanje ni pravilnega popravka. V ENEM dokumentu je ista prerazvrstitev eno
//    atomarno pisanje (services/task-write.service.ts).
// 2. Ploščica na nadzorni plošči bere "nazadnje spremenjen seznam Z OPRAVILI". Tu je to
//    `findOne(vidno).sort({ updatedAt: -1 }).limit(1)` — en dokument, en indeks, ena povratna
//    pot. V ločeni zbirki sta to dve poizvedbi ali `$lookup` ob VSAKEM izrisu nadzorne plošče.
// 3. Velikost je znana in majhna: nakupovalni seznam ima 5-30 vnosov, trda meja je 200 opravil
//    po največ 200 znakov, kar je približno 45 kB — dva reda velikosti pod mejo dokumenta.
//    Isti razlog je `Settings.tiles` naredil podseznam (modules/settings/model.ts); NASPROTNI
//    razlog je zvočne posnetke pustil ZUNAJ beležke (modules/notes/models/note-audio.model.ts:
//    megabajti, brani ob vsakem izpisu seznama). Opravila so na strani `Settings.tiles`.
// 4. Hkratno odkljukavanje NI protiargument: preklop gre skozi `$set` z `arrayFilters` in se
//    na strežniku dotakne natanko enega elementa polja. Izgubljen popravek je posledica
//    brati-spremeniti-pisati (`doc.tasks[i].done = x; save()`), ki je v tem modulu nedosegljiv
//    (razsodnik dostopa vrača `lean`, ne hidriranega dokumenta), ne posledica podseznama.
//
// Česa v zapisu NI in nikoli ne bo: imen in e-pošt soudeležencev (samo `userId` — imena bere
// platform/users/directory.service.ts ob izpisu, da preimenovanje v Keycloaku ne pusti
// zamrznjene kopije) in zgodovine sprememb (vidna sta zadnji avtor in avtor odkljukanja;
// celotna sled bi bila svoja zbirka in svoja odločitev — research.md §12).

const todoTaskSchema = new Schema(
  {
    // `_id` je TU POTREBEN — in zato tu NI `{ _id: false }` kot pri `Settings.tiles`:
    // opravilo je naslovljivo iz URL-ja (`/todos/lists/:listId/tasks/:taskId`) in je tarča
    // `arrayFilters` pri vsakem pisanju.
    title: { type: String, required: true, maxlength: MAX_TASK_TITLE_LENGTH },
    done: { type: Boolean, required: true, default: false },
    /** Kdaj je bilo odkljukano. Odkljukana opravila se razvrstijo po TEM polju (nazadnje
     * odkljukano na vrhu prečrtane skupine), ne po `position`, ki po odkljukanju nima več
     * pomena. Ob vrnitvi med neodkljukana se vrne na `null`. */
    doneAt: { type: Date, default: null },
    /** Kdo je odkljukal — pri deljenem seznamu edini podatek, ki odgovori na vprašanje
     * "je Ana mleko že kupila?" (FR-024). Pri osebnem seznamu je vedno lastnik. */
    doneBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    /** Neobvezen rok. Shranjen kot UTC instant KONCA koledarskega dneva v coni
     * Europe/Ljubljana (domain/due-date.ts, člen V.4). `null` pomeni BREZ ROKA, ne "danes" —
     * enak dogovor kot `SharedFile.expiresAt`. */
    dueDate: { type: Date, default: null },
    /** Ročni vrstni red NEODKLJUKANIH opravil. Redke vrednosti s korakom `POSITION_STEP`
     * (domain/task-order.ts). NI enolični ključ in nima enoličnega indeksa: dve hkratni
     * dodajanji lahko izračunata isto vrednost, izenačene pa razsodi `_id` (FR-026). */
    position: { type: Number, required: true },
    createdAt: { type: Date, required: true },
  },
  {
    _id: true,
    // NAMENOMA brez `timestamps: true`: podpoljnih časovnih žigov Mongoose ob `$push` prek
    // `findOneAndUpdate` ne nastavi enako zanesljivo kot ob `save()`, vsa pisanja v tem modulu
    // pa gredo prek operatorjev. Žig, ki je enkrat nastavljen in drugič ne, je slabši od žiga,
    // ki ga vedno nastavi domenska plast (`makeTask()`). Iz istega razloga se NOBENO pisanje
    // ne zanaša na `default` iz te sheme.
  },
);

const todoMemberSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: MEMBER_ROLES, required: true },
    addedAt: { type: Date, required: true },
    /** `null` pomeni, da soudeleženec seznama še ni odprl — takrat je zanj označen kot NOV
     * (FR-007). To je nadomestilo za potisno obvestilo, ki v tej namestitvi ne deluje
     * (plan.md, Complexity Tracking U3). */
    seenAt: { type: Date, default: null },
  },
  {
    // Brez `_id`: članstvo JE `userId`. Lasten `_id` bi isti stvari dal drugo identiteto in
    // dopustil dva vnosa za istega človeka z različnima vlogama — stanje, na katero razsodnik
    // dostopa ne bi imel enoličnega odgovora. Enoličnosti NE uveljavlja indeks (enoličen
    // indeks nad `members.userId` bi prepovedal članstvo v DVEH seznamih), ampak pogoj
    // `'members.userId': { $ne: ... }` v `$push` (services/sharing.service.ts).
    _id: false,
  },
);

const todoListSchema = new Schema(
  {
    /** Lastnik. Polje se imenuje `ownerId` in NE `userId`: pri deljenem seznamu obstajata dve
     * vrsti pripadnosti in ju je treba ločiti že v imenu. `userId` v tej bazi pomeni "ta zapis
     * je zaseben in `{ _id, userId }` je pogoj dostopa" (glej note.model.ts) — obljuba, ki je
     * tu NAMENOMA neresnična: soudeleženec bere zapis, katerega `ownerId` ni njegov, dostop pa
     * odloči `resolveListAccess`. Ponovna uporaba imena bi vsakega bodočega bralca zavedla v
     * izolacijo, ki je ta model ne daje. tests/unit/no-owner-fields.spec.ts ima za to tretjo
     * kategorijo. */
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, maxlength: MAX_LIST_TITLE_LENGTH },
    /** Ključavnica lastnika: soudeleženec ne sme spremeniti NIČESAR, niti odkljukati. Lastnik
     * sme vse naprej (FR-062). Živi na zapisu SEZNAMA in ne v `Settings`, ker je lastnost
     * seznama in ne osebe — v nastavitvah bi bila ena zastavica za vse sezname hkrati, kar je
     * natanko nasprotno od tega, kar zaklep pomeni. */
    locked: { type: Boolean, required: true, default: false },
    members: { type: [todoMemberSchema], default: [] },
    /** Vrstni red ELEMENTOV V TEM POLJU NI POMENLJIV in se nanj ne sme nihče zanašati.
     * Prikazni vrstni red izračuna `orderTasks()` (domain/task-order.ts) ob branju, ker je
     * odvisen od `done`, ki se spremeni brez `$push`. `$push: { $sort: ... }` bi ustvaril
     * videz urejenega polja, ki ga prvo odkljukanje tiho razveljavi. */
    tasks: { type: [todoTaskSchema], default: [] },
    /** Kdo je nazadnje karkoli spremenil — za "spremenila Ana · 10:24" na ploščici in v glavi
     * seznama (FR-006). Nastavi ga VSAK zapis, v istem `$set` kot samo spremembo. */
    lastModifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    // `versionKey: false` ostane in optimistične sočasnosti NAMENOMA ni (research.md §2):
    // (a) z `__v` bi `save()` IZGLEDAL varen — deloval bi v razvoju in izgubljal popravke v
    // produkciji, medtem ko je odsotnost `__v` uveljavljanje pravila "nikoli
    // brati-spremeniti-pisati"; (b) tudi ko "deluje", dva NEKONFLIKTNA popravka (dva človeka,
    // dve različni opravili) spremeni v `VersionError`, torej v napako, ki si je uporabnik ni
    // zaslužil.
    versionKey: false,
  },
);

// Seznam "moji seznami" je `$or` nad lastništvom in članstvom (domain/visibility.ts). Mongo za
// `$or` izbira načrt PO VSAKI VEJI LOČENO, zato sta indeksa dva in ne en sestavljen. Vrstni red
// polj sledi TOČNO poizvedbi (`.sort({ updatedAt: -1 })`) — sicer bi Mongo sortiral v
// pomnilniku, ista opomba kot pri `noteSchema.index({ userId, pinned, updatedAt })`.
todoListSchema.index({ ownerId: 1, updatedAt: -1 });

// Večključni (multikey) indeks: vnos nastane za VSAKEGA soudeleženca. Brez njega je "seznami,
// deljeni z mano" pregled cele zbirke.
//
// Da ta indeks lahko postreže tudi razvrstitev, mora enakost na `members.userId` izbrati
// natanko EN indeksni vnos na dokument — kar drži samo, dokler isti uporabnik v `members` ne
// nastopi dvakrat. Podvojen vnos bi dokument v izpisu pokazal DVAKRAT in razvrstitev bi postala
// blokirna. To je drugi, neodvisni razlog, zaradi katerega pogoj `$ne` pri dodajanju
// soudeleženca ni kozmetika.
todoListSchema.index({ 'members.userId': 1, updatedAt: -1 });

export type TodoListDoc = InferSchemaType<typeof todoListSchema>;
export const TodoListModel = model('TodoList', todoListSchema);
