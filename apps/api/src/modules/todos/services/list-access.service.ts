import { Types } from 'mongoose';
import { ProblemError, forbidden, notFound } from '../../../platform/errors/problem.js';
import { TodoListModel } from '../models/todo-list.model.js';
import { buildVisibleListsFilter } from '../domain/visibility.js';
import { MAX_TASKS_PER_LIST } from '../domain/todo-input.js';
import {
  denyReason,
  describeDeny,
  roleFor,
  type MemberRole,
  type TodoCapability,
  type TodoRole,
} from '../domain/capabilities.js';

// Edino mesto v modulu, ki odloči, ali kdo sme kaj. Vsak endpoint gre skozi tu; noben ne
// sestavlja svojega pogoja lastništva.
//
// Pri beležkah je isti pomočnik ena vrstica (`findOwnNote`), ker je pogoj `{ _id, userId }`.
// Tu pogoj ni ena vrstica — in prav zato MORA biti ena funkcija: vsaka kopija bi bila mesto,
// kjer se `members` pozabi, kjer se ključavnica ne upošteva ali kjer 403 pobegne tujcu.

/**
 * Bran posnetek opravila.
 *
 * NAMENOMA `lean`, ne hidriran poddokument: hidriran bi ponujal pot do `.save()` nad
 * nadrejenim dokumentom, kar nad poljem `tasks` pomeni brati-spremeniti-pisati — pri dveh
 * hkratnih odkljukanjih se ena sprememba izgubi (services/task-write.service.ts). Česar ni na
 * voljo, se ne da uporabiti po nesreči, in noben pregled kode tega ne uveljavlja tako
 * zanesljivo kot tip.
 */
export interface TodoTaskSnapshot {
  _id: Types.ObjectId;
  title: string;
  done: boolean;
  doneAt: Date | null;
  doneBy: Types.ObjectId | null;
  dueDate: Date | null;
  position: number;
  createdAt: Date;
}

export interface TodoMemberSnapshot {
  userId: Types.ObjectId;
  role: MemberRole;
  addedAt: Date;
  seenAt: Date | null;
}

export interface TodoListSnapshot {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  title: string;
  locked: boolean;
  members: TodoMemberSnapshot[];
  tasks: TodoTaskSnapshot[];
  lastModifiedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListAccess {
  list: TodoListSnapshot;
  role: TodoRole;
  locked: boolean;
}

/**
 * Neveljaven `ObjectId` bi v Mongoose vrgel `CastError`, ki se navzven pokaže kot 500 — za
 * uporabnika, ki je odprl staro povezavo, je to 404 (isti vzorec kot modules/notes in
 * modules/file-sharing).
 */
export function requireObjectId(value: string, what: string): string {
  if (!Types.ObjectId.isValid(value)) throw notFound(`${what} ne obstaja.`);
  return value;
}

/**
 * Seznam, do katerega ima ta uporabnik dostop, skupaj z njegovo vlogo — ali napaka.
 *
 * ENA poizvedba, in njen filter vsebuje OBE vrsti pripadnosti: tuj seznam zato ne pride niti v
 * pomnilnik in 404 pade iz odsotnosti zadetka, ne iz naknadne primerjave v kodi. Naknadna
 * primerjava je oblika, v kateri se 403 tujcu prikrade — to je razlog za obliko te poizvedbe,
 * ne hitrost.
 */
export async function resolveListAccess(listId: string, userId: string): Promise<ListAccess> {
  const list = await TodoListModel.findOne({
    _id: requireObjectId(listId, 'Seznam'),
    ...buildVisibleListsFilter(userId),
  }).lean<TodoListSnapshot | null>();

  // TUJ seznam (nisem niti lastnik niti soudeleženec) → 404, nikoli 403. Obstoj tujega zapisa
  // ni podatek, ki bi ga kdo smel prebrati (enak dogovor kot beležke in kamere po 004).
  if (!list) throw notFound('Seznam ne obstaja.');

  const role = roleFor(list, userId);
  // Nedosegljivo, dokler sta filter zgoraj in `roleFor` skladna. Če se kdaj razideta, je varen
  // odgovor ISTI 404 — nobena veja ne sme pasti v privzeto vlogo.
  if (!role) throw notFound('Seznam ne obstaja.');

  return { list, role, locked: list.locked };
}

/**
 * Ali ta dostop dovoli to dejanje — ali pa napaka s PRAVIM statusom.
 *
 * Trije izidi so trije različni odgovori in zato trije statusi:
 *
 * - **404 tujcu** (že v `resolveListAccess`): obstoja tujega zapisa ne razkrijemo.
 * - **403 soudeležencu z nezadostno vlogo**: hišno pravilo varuje obstoj ZAPISA, ne obstoja
 *   PRAVICE. Soudeleženec seznam vidi v svoji vrstici, ime mu je bilo prikazano — 404 mu torej
 *   ničesar ne skrije, samo zlaže se človeku, ki zapis gleda na zaslonu, in popravljivo
 *   pomanjkanje pravice spremeni v videz okvare (člen VII).
 * - **409 ob zaklenjenem seznamu**: ključavnica ni lastnost OSEBE, ampak STANJE zapisa, ki ga
 *   lastnik odklene z enim klikom; isti soudeleženec z isto vlogo bo čez trenutek uspel.
 *   Vmesnik se na 403 odzove tako, da kontrolo SKRIJE, na 409 pa tako, da pokaže ključavnico in
 *   kontrolo PUSTI. Dva različna odziva potrebujeta dva statusa.
 *
 * `platform/errors/problem.ts` ima tovarne za 400/401/403/404/429/503; 409 se — kot v
 * `modules/notes/router.ts` — sestavi neposredno. Nove tovarne v skupni plasti ta modul NE
 * dodaja: sprememba `platform/` v PR-ju funkcionalnosti je ravno smer, ki jo prepoveduje
 * razdelek Governance.
 */
export function assertCan(access: ListAccess, capability: TodoCapability): void {
  const reason = denyReason(access.role, access.locked, capability);
  if (!reason) return;
  const detail = describeDeny(reason, access.role, capability);
  if (reason === 'locked') throw new ProblemError(409, 'Seznam je zaklenjen', detail);
  throw forbidden(detail);
}

/**
 * Zgornja meja opravil — preverjena iz posnetka, SAMO za zgodnje in prijazno sporočilo.
 *
 * Pravo, atomarno uveljavljanje meje je v filtru zapisa (`appendTasks`): preverjanje iz
 * posnetka je dirka, ki jo dve hkratni dodajanji obe prestaneta. Ta funkcija torej ni
 * varovalka, ampak vljudnost; varovalka je filter.
 *
 * 409 in ne 400: polnost je STANJE seznama, ne napaka zahteve — ista zahteva bo po
 * `clear-completed` uspela.
 */
export function assertRoomForTasks(access: ListAccess, count: number): void {
  if (access.list.tasks.length + count <= MAX_TASKS_PER_LIST) return;
  throw new ProblemError(
    409,
    'Seznam je poln',
    `Seznam ima lahko največ ${MAX_TASKS_PER_LIST} opravil. Počisti opravljena ali naredi nov seznam.`,
  );
}

/**
 * Zapis se ni ujel z nobenim dokumentom. Ugotovi, zakaj — in nikoli ne ugibaj.
 *
 * `matchedCount === 0` ima štiri različne vzroke (seznam izbrisan, članstvo odvzeto, seznam
 * zaklenjen, seznam poln) in vsak zasluži svoje sporočilo; enotni 404 bi bil tiha napaka v
 * smislu člena VI.
 *
 * Ponovi se DIAGNOZA, nikoli PISANJE. Samodejno ponovljen zapis bi ob dvojnem kliku dodal
 * opravilo dvakrat — `Idempotency-Key` varuje pred ponovitvijo ODJEMALCA, ne pred strežnikovo
 * lastno.
 */
export async function explainNoMatch(
  listId: string,
  userId: string,
  capability: TodoCapability,
  taskId?: string,
): Promise<never> {
  const access = await resolveListAccess(listId, userId); // vrže 404, če ga ni več
  assertCan(access, capability); // vrže 403 ali 409

  // Opravilo, ki ga ni, je 404 — enako kot seznam, ki ga ni. Brez te veje bi bila vsaka
  // zahteva z izmišljenim `taskId` videti kot sočasna sprememba, kar je zavajajoče sporočilo
  // za nekaj, kar je preprosto napačen naslov. (Najdeno s testom, ne s premislekom.)
  if (taskId !== undefined && !access.list.tasks.some((t) => String(t._id) === taskId)) {
    throw notFound('Opravilo ne obstaja.');
  }

  // Razsodnik pravi, da bi dejanje moralo uspeti, opravilo pa obstaja — torej se je med
  // preverbo in zapisom res nekaj spremenilo. Šele tu je generični 409 pošten.
  throw new ProblemError(
    409,
    'Seznam se je medtem spremenil',
    'Nekdo je seznam spremenil, medtem ko si urejal. Osveži in poskusi znova.',
  );
}
