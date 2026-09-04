import { Types, type FilterQuery } from 'mongoose';
import { TodoListModel } from '../models/todo-list.model.js';
import { MAX_TASKS_PER_LIST, type NewTask } from '../domain/todo-input.js';
import { rolesWith, type MemberRole, type TodoCapability } from '../domain/capabilities.js';
import type { TodoListSnapshot } from './list-access.service.js';

// PRAVILO TEGA MODULA, uveljavljeno strukturno: nikjer ni brati-spremeniti-pisati.
//
// Vsaka mutacija je eno `findOneAndUpdate`, katerega FILTER dostop ponovi in katerega UPDATE
// uporablja operatorje, ki se dotaknejo natanko predvidenih elementov polja. Razsodnik dostopa
// vrača `lean`, zato `.save()` na objektu, ki ga usmerjevalnik drži, sploh ne obstaja.
//
// Zakaj to zadošča brez žetona različice: posodobitev enega dokumenta je v MongoDB atomarna,
// dve hkratni posodobitvi istega dokumenta se serializirata, `$set` nad `tasks.$[t].done` pa
// zapiše natanko ta element. Dva uporabnika, ki hkrati odkljukata RAZLIČNI opravili, zato oba
// uspeta (FR-027, SC-003). Izgubljen popravek pride iz `save()` nad zastarelo kopijo ali iz
// `$set: { tasks: celoNovoPolje }` — obojega tu ni.
//
// Vsa pisanja naslavljajo elemente prek `arrayFilters` (`$[t]`) in NIKOLI prek pozicijskega
// `$`. Trije razlogi, vsak zadosten (research.md §3):
//  1. `$` se ne razreši znotraj `$or`, naš filter pa `$or` MORA vsebovati, ker je to pogoj
//     dostopa — `$` je torej tu neuporaben, ne le manj lep.
//  2. `$` posodobi samo PRVI zadetek; prerazvrstitev mora posodobiti vse.
//  3. Naslavljanje po `_id` je neodvisno od INDEKSA v polju; `tasks.3.done` je napačno v
//     trenutku, ko kdo pred tem elementom kaj doda ali odstrani.

/**
 * Pogoj, ki dostop PONOVI v filtru zapisa.
 *
 * Razsodnik je prebral posnetek; med branjem in zapisom lahko lastnik seznam zaklene ali
 * odvzame članstvo. Filter je edino mesto, kjer sta preverba in zapis ENA operacija — brez
 * njega bi bilo vsako pisanje odločeno na podatku, ki je v trenutku zapisa že star. Razsodnik
 * daje ČLOVEKU berljiv razlog, filter daje PRAVILNOST; potrebna sta oba.
 *
 * Ključavnica je v ČLANSKI veji `$or`, ne kot `locked: false` na vrhu: lastnik sme pisati tudi
 * v zaklenjen seznam (FR-062).
 *
 * Stopnje pridejo iz `rolesWith()`, iz iste tabele kot `denyReason` — da razsodnik in filter
 * ne moreta razhajati.
 */
function writeGuard(listId: string, userId: string, capability: TodoCapability): FilterQuery<unknown> {
  const roles: MemberRole[] = rolesWith(capability);
  return {
    _id: listId,
    $or: [
      { ownerId: userId },
      { locked: false, members: { $elemMatch: { userId, role: { $in: roles } } } },
    ],
  };
}

/** Vsako pisanje zabeleži, kdo ga je naredil — to je vir podatka "spremenila Ana · 10:24"
 * (FR-006). `updatedAt` vzdržuje Mongoose sam tudi pri `findOneAndUpdate`; ročno ga NE
 * nastavljamo, ker je ploščica od tega odvisna. */
function withAuthor(userId: string, $set: Record<string, unknown>): Record<string, unknown> {
  return { ...$set, lastModifiedBy: new Types.ObjectId(userId) };
}

type Result = Promise<TodoListSnapshot | null>;

/**
 * Preklop, preimenovanje ali rok enega opravila — en atomaren zapis.
 *
 * `doneAt` in `doneBy` gresta v ISTI `$set` kot `done`: dve zaporedni pisanji bi lahko pustili
 * `done: true` brez časa odkljukanja, kar bi opravilo v prečrtani skupini razvrstilo poljubno.
 * Eno pisanje ne more pustiti polovice.
 */
export function setTaskFields(params: {
  listId: string;
  userId: string;
  taskId: string;
  capability: TodoCapability;
  fields: { done?: boolean; title?: string; dueDate?: Date | null };
  now: Date;
}): Result {
  const $set: Record<string, unknown> = {};

  if (params.fields.done !== undefined) {
    $set['tasks.$[t].done'] = params.fields.done;
    $set['tasks.$[t].doneAt'] = params.fields.done ? params.now : null;
    $set['tasks.$[t].doneBy'] = params.fields.done ? new Types.ObjectId(params.userId) : null;
  }
  if (params.fields.title !== undefined) $set['tasks.$[t].title'] = params.fields.title;
  if (params.fields.dueDate !== undefined) $set['tasks.$[t].dueDate'] = params.fields.dueDate;

  return TodoListModel.findOneAndUpdate(
    {
      ...writeGuard(params.listId, params.userId, params.capability),
      'tasks._id': new Types.ObjectId(params.taskId),
    },
    { $set: withAuthor(params.userId, $set) },
    {
      arrayFilters: [{ 't._id': new Types.ObjectId(params.taskId) }],
      new: true,
    },
  ).lean<TodoListSnapshot | null>();
}

/**
 * Doda opravila na konec seznama.
 *
 * Zgornja meja je uveljavljena V FILTRU in ne po branju: preverjanje `list.tasks.length` iz
 * posnetka je dirka, ki jo dve hkratni dodajanji obe prestaneta. Pogoj `tasks.{MAX-1}: { $exists:
 * false }` se ovrednoti v istem trenutku kot zapis (research.md §8).
 *
 * Ker se "polno" tako pokaže kot neujemanje, ga od "izbrisano" loči šele `explainNoMatch` —
 * brez tega bi polnost postala napačen 404.
 */
export function appendTasks(params: {
  listId: string;
  userId: string;
  tasks: readonly NewTask[];
}): Result {
  return TodoListModel.findOneAndUpdate(
    {
      ...writeGuard(params.listId, params.userId, 'writeTasks'),
      [`tasks.${MAX_TASKS_PER_LIST - 1}`]: { $exists: false },
    },
    {
      // Vsa polja opravila sestavi `makeTask()` v domenski plasti; NIČ se ne zanaša na
      // `default` iz podsheme.
      $push: { tasks: { $each: params.tasks } },
      $set: withAuthor(params.userId, {}),
    },
    { new: true },
  ).lean<TodoListSnapshot | null>();
}

export function removeTask(params: { listId: string; userId: string; taskId: string }): Result {
  return TodoListModel.findOneAndUpdate(
    {
      ...writeGuard(params.listId, params.userId, 'writeTasks'),
      'tasks._id': new Types.ObjectId(params.taskId),
    },
    {
      $pull: { tasks: { _id: new Types.ObjectId(params.taskId) } },
      $set: withAuthor(params.userId, {}),
    },
    { new: true },
  ).lean<TodoListSnapshot | null>();
}

/**
 * Odstrani vsa odkljukana opravila.
 *
 * Pogoj `done: true` je NA STREŽNIKU. Seznam identifikatorjev, izračunan iz posnetka, bi
 * odstranil tudi to, kar je kdo medtem odkljukal ali — huje — kar je medtem kdo odkljukanju
 * vrnil; `$pull` s pogojem zajame stanje v trenutku zapisa, in opravilo je bodisi zajeto bodisi
 * ne, nikoli pol (FR-018).
 *
 * `new: false` (privzeto) NI lenoba: vrne PREDSLIKO natanko tistega dokumenta, nad katerim se
 * je posodobitev izvedla. Predslika minus odkljukana JE poslika tega pisanja — kar da hkrati
 * točen `removed` in točno novo stanje, brez druge poizvedbe. Štetje pred posodobitvijo bi
 * štelo drug dokument kot tisti, ki se je spremenil.
 */
export async function clearCompleted(params: {
  listId: string;
  userId: string;
}): Promise<{ removed: number; list: TodoListSnapshot } | null> {
  const before = await TodoListModel.findOneAndUpdate(
    writeGuard(params.listId, params.userId, 'clearCompleted'),
    {
      $pull: { tasks: { done: true } },
      $set: withAuthor(params.userId, {}),
    },
    { new: false },
  ).lean<TodoListSnapshot | null>();

  if (!before) return null;

  const remaining = before.tasks.filter((t) => !t.done);
  return {
    removed: before.tasks.length - remaining.length,
    list: {
      ...before,
      tasks: remaining,
      lastModifiedBy: new Types.ObjectId(params.userId),
    },
  };
}

/**
 * Postavi nov vrstni red — VSI položaji v ENEM `$set`.
 *
 * To je operacija, ki je ločena zbirka `TodoTask` na tej namestitvi ne bi mogla izvesti
 * atomarno: N pisanj brez transakcije (samostojen Mongo), izpad na sredini pa pusti podvojene
 * ali preskočene položaje. Tu je bodisi celoten nov vrstni red bodisi nič.
 *
 * Identifikatorji v `arrayFilters` morajo biti črkovno-številski IN vsak mora biti uporabljen v
 * `$set`, sicer Mongo zavrne celo operacijo — zato se oboje sestavi v isti zanki.
 */
export function repositionTasks(params: {
  listId: string;
  userId: string;
  assignments: readonly { id: string; position: number }[];
}): Result {
  const $set: Record<string, unknown> = {};
  const arrayFilters: Record<string, unknown>[] = [];

  params.assignments.forEach((assignment, i) => {
    const key = `t${i}`;
    $set[`tasks.$[${key}].position`] = assignment.position;
    arrayFilters.push({ [`${key}._id`]: new Types.ObjectId(assignment.id) });
  });

  if (arrayFilters.length === 0) return Promise.resolve(null);

  return TodoListModel.findOneAndUpdate(
    writeGuard(params.listId, params.userId, 'reorderTasks'),
    { $set: withAuthor(params.userId, $set) },
    { arrayFilters, new: true },
  ).lean<TodoListSnapshot | null>();
}
