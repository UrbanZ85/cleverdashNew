// Tipi in čiste funkcije zavihka Opravila.
//
// BREZ uvozov iz `@angular/*`: enotski testi v apps/web tečejo brez `TestBed` (vitest + jsdom
// nad čistimi funkcijami), zato mora biti vse, kar je vredno testirati, dosegljivo brez
// zagona Angularja. Isti dogovor kot `core/settings/settings.model.ts`.
//
// Oblike se ujemajo s specs/010-todos/contracts/openapi.yaml. Ročno prepisane in ne generirane:
// `packages/contracts` sicer generira tipe, a jih do zdaj ne uvaža noben odjemalec.

export type MemberRole = 'view' | 'check' | 'edit';
export type TodoRole = 'owner' | MemberRole;
export type DueState = 'overdue' | 'today' | 'tomorrow' | 'later';

export interface UserSummary {
  id: string;
  displayName: string;
  initials: string;
  emailHint?: string;
}

export interface TodoCapabilities {
  readList: boolean;
  toggleTask: boolean;
  writeTasks: boolean;
  reorderTasks: boolean;
  clearCompleted: boolean;
  renameList: boolean;
  deleteList: boolean;
  manageSharing: boolean;
  toggleLock: boolean;
  leaveList: boolean;
}

export interface TodoTask {
  id: string;
  title: string;
  done: boolean;
  dueDate: string | null;
  dueState: DueState | null;
  doneAt: string | null;
  doneBy: UserSummary | null;
  createdAt: string;
}

export interface TodoMember {
  user: UserSummary;
  role: MemberRole;
  addedAt: string;
}

export interface TodoList {
  id: string;
  title: string;
  locked: boolean;
  owner: UserSummary;
  role: TodoRole;
  capabilities: TodoCapabilities;
  members: TodoMember[];
  tasks?: TodoTask[];
  taskCount: number;
  openCount: number;
  nextDueDate: string | null;
  lastModifiedBy: UserSummary | null;
  isNew: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TodoLimits {
  maxListTitleLength: number;
  maxTaskTitleLength: number;
  maxTasksPerList: number;
  maxTasksPerRequest: number;
  maxListsPerUser: number;
  maxMembersPerList: number;
}

export interface TodoListsResponse {
  lists: TodoList[];
  limits: TodoLimits;
}

export interface TodoCurrentResponse {
  list: TodoList | null;
  fallback: boolean;
  nextPollSeconds: number;
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  view: 'Ogled',
  check: 'Odkljukavanje',
  edit: 'Urejanje',
};

export const ROLE_HINTS: Record<MemberRole, string> = {
  view: 'Vidi seznam, ne more spreminjati ničesar.',
  check: 'Lahko odkljuka opravila, ne more pa dodajati, urejati ali brisati.',
  edit: 'Lahko dodaja, ureja, briše in preureja opravila. Seznama ne more izbrisati ali deliti.',
};

/**
 * Slovenska sklanjatev za število opravil.
 *
 * Angularjevih cevi za to ni, i18n sistem v projektu ne obstaja (člen X: vidno besedilo je
 * slovensko, zapisano na mestu), zato ročno. Ostanek po modulu 100 in ne po 10: 111 je
 * "opravil", ne "opravilo".
 */
export function pluralTasks(count: number): string {
  const rest = Math.abs(count) % 100;
  if (rest === 1) return 'opravilo';
  if (rest === 2) return 'opravili';
  if (rest === 3 || rest === 4) return 'opravila';
  return 'opravil';
}

/** "3 nedokončana opravila" oziroma "vse opravljeno". */
export function progressLabel(list: Pick<TodoList, 'openCount' | 'taskCount'>): string {
  if (list.taskCount === 0) return 'Prazen seznam';
  if (list.openCount === 0) return 'Vse opravljeno';
  return `${list.openCount} ${pluralTasks(list.openCount)} še odprtih`;
}

/** Kratek napredek za čip: "3/7". */
export function progressBadge(list: Pick<TodoList, 'openCount' | 'taskCount'>): string {
  return `${list.taskCount - list.openCount}/${list.taskCount}`;
}

/** Kdo in kdaj je nazadnje spremenil — brez `DatePipe`, ker je čas vedno ljubljanski. */
export function lastChangeLabel(list: Pick<TodoList, 'lastModifiedBy' | 'updatedAt'>): string {
  const time = new Date(list.updatedAt).toLocaleTimeString('sl-SI', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Ljubljana',
  });
  return list.lastModifiedBy ? `${list.lastModifiedBy.displayName} · ${time}` : time;
}

/** Besedilo ob roku. `null`, kadar roka ni — klicatelj takrat ne izriše ničesar. */
export function dueLabel(task: Pick<TodoTask, 'dueDate' | 'dueState'>): string | null {
  if (!task.dueDate || !task.dueState) return null;
  if (task.dueState === 'today') return 'danes';
  if (task.dueState === 'tomorrow') return 'jutri';
  const date = new Date(task.dueDate).toLocaleDateString('sl-SI', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Ljubljana',
  });
  return task.dueState === 'overdue' ? `zamuja od ${date}` : date;
}

/** Barva za rok — `null` pomeni privzeto barvo besedila. */
export function dueColor(state: DueState | null): 'danger' | 'warning' | null {
  if (state === 'overdue') return 'danger';
  if (state === 'today') return 'warning';
  return null;
}
