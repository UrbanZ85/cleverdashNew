import { readUserSummaries, type UserSummary } from '../../../platform/users/directory.service.js';
import { capabilitiesFor, roleFor, type TodoCapability, type TodoRole } from '../domain/capabilities.js';
import { dueState, nextDueDate, type DueState } from '../domain/due-date.js';
import { orderTasks } from '../domain/task-order.js';
import type { TodoListSnapshot } from './list-access.service.js';

// Preslikava zapisa v odgovor API-ja.
//
// Vse, kar je tu izračunano, je NAMENOMA izpeljano in ne shranjeno (data-model.md):
//  - `taskCount` / `openCount`: dva števca, ki bi ju bilo treba vzdrževati ob vsakem zapisu,
//    sta dve priložnosti, da se razideta z resnico. Pri največ 200 elementih je štetje zastonj.
//  - vrstni red za prikaz: odvisen je od `done`, ki se spremeni brez `$push`.
//  - `dueState`: odvisen od TEGA TRENUTKA. Shranjen bi bil naslednji dan napačen — natanko
//    razred hrošča, ki ga naslavlja člen V.4.
//  - `capabilities`: odvisne od tega, KDO bere; niso lastnost zapisa.
//
// Imena soudeležencev se preberejo ob izpisu (platform/users/directory.service.ts) in se v
// seznamu ne hranijo: kopija imena bi ob preimenovanju v Keycloaku zamrznila staro.

export interface TodoTaskResponse {
  id: string;
  title: string;
  done: boolean;
  dueDate: string | null;
  dueState: DueState | null;
  doneAt: string | null;
  doneBy: UserSummary | null;
  createdAt: string;
}

export interface TodoMemberResponse {
  user: UserSummary;
  role: string;
  addedAt: string;
}

export interface TodoListResponse {
  id: string;
  title: string;
  locked: boolean;
  owner: UserSummary;
  role: TodoRole;
  capabilities: Record<TodoCapability, boolean>;
  members: TodoMemberResponse[];
  tasks?: TodoTaskResponse[];
  taskCount: number;
  openCount: number;
  nextDueDate: string | null;
  lastModifiedBy: UserSummary | null;
  isNew: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Nadomestek, kadar uporabnika ni več v bazi. Odgovor mora ostati izrisljiv: seznam, ki se ne
 * izriše, ker je nekdo izbrisal račun, je slabši od seznama z neznanim avtorjem. */
function unknownUser(id: string): UserSummary {
  return { id, displayName: 'Neznan uporabnik', initials: '?', emailHint: '' };
}

/** Vsi identifikatorji oseb, ki jih odgovor omenja — za ENO poizvedbo v imenik namesto N+1. */
export function collectUserIds(lists: readonly TodoListSnapshot[]): string[] {
  const ids = new Set<string>();
  for (const list of lists) {
    ids.add(String(list.ownerId));
    if (list.lastModifiedBy) ids.add(String(list.lastModifiedBy));
    for (const member of list.members) ids.add(String(member.userId));
    for (const task of list.tasks) if (task.doneBy) ids.add(String(task.doneBy));
  }
  return [...ids];
}

/** Prebere imena za vse osebe, ki jih ti seznami omenjajo. */
export function readUsersFor(lists: readonly TodoListSnapshot[]): Promise<Map<string, UserSummary>> {
  return readUserSummaries(collectUserIds(lists));
}

function taskToResponse(
  task: TodoListSnapshot['tasks'][number],
  users: Map<string, UserSummary>,
  now: Date,
): TodoTaskResponse {
  const doneById = task.doneBy ? String(task.doneBy) : null;
  return {
    id: String(task._id),
    title: task.title,
    done: task.done,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    dueState: dueState(task.dueDate, now),
    doneAt: task.doneAt ? task.doneAt.toISOString() : null,
    doneBy: doneById ? (users.get(doneById) ?? unknownUser(doneById)) : null,
    createdAt: task.createdAt.toISOString(),
  };
}

/**
 * Zapis seznama v odgovor za DOLOČENEGA bralca.
 *
 * `viewerId` ni okrasje: `role`, `capabilities` in `isNew` so odvisni od tega, kdo bere. Isti
 * zapis da dvema uporabnikoma dva različna odgovora, in prav to je bistvo tega modula.
 *
 * `includeTasks: false` izpusti `tasks` v izpisu seznamov (FR-005) — vrstica čipov potrebuje
 * samo napredek, ne pa vseh opravil vseh seznamov.
 */
export function toListResponse(params: {
  list: TodoListSnapshot;
  viewerId: string;
  users: Map<string, UserSummary>;
  includeTasks: boolean;
  now: Date;
}): TodoListResponse {
  const { list, viewerId, users, now } = params;

  const role = roleFor(list, viewerId) ?? 'view';
  const ownerId = String(list.ownerId);
  const member = list.members.find((m) => String(m.userId) === viewerId);
  const lastModifiedById = list.lastModifiedBy ? String(list.lastModifiedBy) : null;

  const openCount = list.tasks.filter((t) => !t.done).length;
  const earliest = nextDueDate(list.tasks);

  return {
    id: String(list._id),
    title: list.title,
    locked: list.locked,
    owner: users.get(ownerId) ?? unknownUser(ownerId),
    role,
    capabilities: capabilitiesFor(role, list.locked),
    members: list.members.map((m) => {
      const id = String(m.userId);
      return {
        // Pri ŽE DODANIH soudeležencih e-pošte ni (FR-074): ime in začetnice zadoščata, in
        // seznam članov je vsakomur, ki seznam vidi, širši nabor kot izbirnik.
        user: { ...(users.get(id) ?? unknownUser(id)), emailHint: '' },
        role: m.role,
        addedAt: m.addedAt.toISOString(),
      };
    }),
    ...(params.includeTasks
      ? { tasks: orderTasks(list.tasks).map((t) => taskToResponse(t, users, now)) }
      : {}),
    taskCount: list.tasks.length,
    openCount,
    nextDueDate: earliest ? earliest.toISOString() : null,
    lastModifiedBy: lastModifiedById
      ? (users.get(lastModifiedById) ?? unknownUser(lastModifiedById))
      : null,
    // Za lastnika je seznam vedno "star" — svojega seznama si ni delil sam s sabo.
    isNew: member !== undefined && member.seenAt === null,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
  };
}
