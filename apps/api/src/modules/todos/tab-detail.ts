import { registerTabDetailProvider, type TabDetail } from '../../platform/tabs/extension.js';
import { TodoListModel } from './models/todo-list.model.js';
import { buildVisibleListsFilter } from './domain/visibility.js';
import { dueState } from './domain/due-date.js';
import { pluralOpenTasks } from './domain/labels.js';
import type { TodoListSnapshot } from './services/list-access.service.js';

// Kratko stanje in značka ob zavihku v meniju (FR-103).
//
// To je NADOMESTILO ZA POTISNO OBVESTILO. Prvotna zahteva je bila push ob deljenju; med
// raziskavo se je pokazalo, da v tej namestitvi ne more delovati (privzeti nabor kanalov je
// samo `system`, odjemalec ob registraciji nabora ne pošlje, in v spletni aplikaciji se
// naprava sploh ne registrira — plan.md, Complexity Tracking U3). Oznaka v meniju deluje na
// spletu in na Androidu enako in se ne dotakne notifications platforme.
//
// Vzorec je `modules/time-tracking/tab-detail.ts`: modul se REGISTRIRA pri platformi, platforma
// pa modula ne pozna (člen I). Napaka v ponudniku je v `collectTabDetails` namenoma pogoltnjena
// — meni je pomembnejši od svojega okrasa.

async function buildTodosTabDetail(userId: string): Promise<TabDetail | null> {
  const lists = await TodoListModel.find(buildVisibleListsFilter(userId))
    .select('tasks members')
    .lean<Pick<TodoListSnapshot, 'tasks' | 'members'>[]>();

  if (lists.length === 0) return null;

  const now = new Date();
  let open = 0;
  let overdue = 0;
  let fresh = 0;

  for (const list of lists) {
    for (const task of list.tasks) {
      if (task.done) continue;
      open += 1;
      if (dueState(task.dueDate, now) === 'overdue') overdue += 1;
    }
    // Seznam, ki je bil deljen z mano in ga še nisem odprl. Lastnika to ne zadeva — med
    // `members` ga ni.
    if (list.members.some((m) => String(m.userId) === userId && m.seenAt === null)) fresh += 1;
  }

  if (open === 0 && fresh === 0) return null;

  // Novo deljeni seznam je pomembnejši od zapadlega roka: zapadel rok uporabnik že pozna,
  // za nov seznam pa sploh še ne ve, da obstaja — in prav to je vloga tega obvestila.
  if (fresh > 0) {
    return {
      subtitle: pluralOpenTasks(open),
      status: 'warning',
      statusLabel: fresh === 1 ? 'nov seznam' : `${fresh} novi seznami`,
    };
  }

  if (overdue > 0) {
    return {
      subtitle: pluralOpenTasks(open),
      status: 'danger',
      statusLabel: `${overdue} zapadlo`,
    };
  }

  return { subtitle: pluralOpenTasks(open), status: 'ok' };
}

export function registerTodosTabDetail(): void {
  registerTabDetailProvider('todos', buildTodosTabDetail);
}
