import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { clearTestDb, startTestDb, stopTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { TodoListModel } from '../../src/modules/todos/models/todo-list.model.js';
import {
  appendTasks,
  clearCompleted,
  repositionTasks,
  setTaskFields,
} from '../../src/modules/todos/services/task-write.service.js';
import { makeTask } from '../../src/modules/todos/domain/todo-input.js';
import { orderTasks, toPositionAssignments } from '../../src/modules/todos/domain/task-order.js';
import type { TodoListSnapshot } from '../../src/modules/todos/services/list-access.service.js';

// FR-027, SC-003 — NAJPOMEMBNEJŠI TEST TE FUNKCIONALNOSTI.
//
// Dva človeka v trgovini odkljukata dve različni stvari v isti sekundi. Naivna izvedba
// (prebrati dokument, spremeniti polje v pomnilniku, shraniti) eno od sprememb izgubi in tega
// nihče ne opazi — ne uporabnik, ne dnevnik, ne noben drug test.
//
// Zahteve se zato sprožijo s `Promise.all` in NE zaporedno: zaporeden test bi uspel tudi pri
// napačni izvedbi in bi dajal lažno gotovost.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

const OWNER = '507f1f77bcf86cd799439011';
const now = new Date('2026-06-15T10:00:00Z');

async function seedWithTasks(titles: string[]) {
  const created = await TodoListModel.create({
    ownerId: OWNER,
    title: 'Nakup',
    locked: false,
    members: [],
    tasks: titles.map((title, i) => makeTask({ title, position: (i + 1) * 1000, dueDate: null, now })),
    lastModifiedBy: OWNER,
  });
  const doc = await TodoListModel.findById(created._id).lean();
  return {
    listId: String(created._id),
    taskIds: (doc?.tasks ?? []).map((t) => String(t._id)),
  };
}

describe('Sočasnost: dve spremembi istega seznama v istem trenutku (FR-027, SC-003)', () => {
  it('dva HKRATNA preklopa RAZLIČNIH opravil oba obstaneta', async () => {
    const { listId, taskIds } = await seedWithTasks(['Mleko', 'Kruh']);

    await Promise.all([
      setTaskFields({
        listId,
        userId: OWNER,
        taskId: taskIds[0] as string,
        capability: 'toggleTask',
        fields: { done: true },
        now,
      }),
      setTaskFields({
        listId,
        userId: OWNER,
        taskId: taskIds[1] as string,
        capability: 'toggleTask',
        fields: { done: true },
        now,
      }),
    ]);

    const after = await TodoListModel.findById(listId).lean();
    expect(after?.tasks.every((t) => t.done), 'obe opravili morata biti odkljukani').toBe(true);
    expect(after?.tasks.every((t) => t.doneAt !== null), 'obe morata imeti čas odkljukanja').toBe(true);
  });

  it('hkraten preklop in preimenovanje ISTEGA opravila obstaneta oba — različni polji', async () => {
    const { listId, taskIds } = await seedWithTasks(['Mleko']);
    const taskId = taskIds[0] as string;

    await Promise.all([
      setTaskFields({ listId, userId: OWNER, taskId, capability: 'toggleTask', fields: { done: true }, now }),
      setTaskFields({
        listId,
        userId: OWNER,
        taskId,
        capability: 'writeTasks',
        fields: { title: 'Polnomastno mleko' },
        now,
      }),
    ]);

    const after = await TodoListModel.findById(listId).lean();
    expect(after?.tasks[0]?.done).toBe(true);
    expect(after?.tasks[0]?.title).toBe('Polnomastno mleko');
  });

  it('hkraten preklop in prerazvrstitev obstaneta oba', async () => {
    const { listId, taskIds } = await seedWithTasks(['A', 'B', 'C']);
    const obrnjeno = [...taskIds].reverse();

    await Promise.all([
      setTaskFields({
        listId,
        userId: OWNER,
        taskId: taskIds[0] as string,
        capability: 'toggleTask',
        fields: { done: true },
        now,
      }),
      repositionTasks({ listId, userId: OWNER, assignments: toPositionAssignments(obrnjeno) }),
    ]);

    const after = await TodoListModel.findById(listId).lean();
    const byId = new Map((after?.tasks ?? []).map((t) => [String(t._id), t]));

    // Preklop je obstal.
    expect(byId.get(taskIds[0] as string)?.done).toBe(true);
    // Prerazvrstitev je obstala: C ima najnižji položaj, A najvišjega.
    const posC = byId.get(taskIds[2] as string)?.position ?? 0;
    const posA = byId.get(taskIds[0] as string)?.position ?? 0;
    expect(posC).toBeLessThan(posA);
  });

  it('dve HKRATNI dodajanji nista izgubljeni, tudi če izračunata ENAK položaj', async () => {
    const { listId } = await seedWithTasks(['Obstoječe']);

    // Oba klica izhajata iz istega posnetka, zato oba izračunata isti naslednji položaj.
    // Položaj je NAMIG in ne enolični ključ (FR-026), zato to ne sme biti napaka.
    await Promise.all([
      appendTasks({ listId, userId: OWNER, tasks: [makeTask({ title: 'Prvo', position: 2000, dueDate: null, now })] }),
      appendTasks({ listId, userId: OWNER, tasks: [makeTask({ title: 'Drugo', position: 2000, dueDate: null, now })] }),
    ]);

    const after = await TodoListModel.findById(listId).lean();
    expect(after?.tasks).toHaveLength(3);
    expect(after?.tasks.map((t) => t.title).sort()).toEqual(['Drugo', 'Obstoječe', 'Prvo']);
  });

  it('ob podvojenem položaju je PRIKAZNI vrstni red stabilen med branji', async () => {
    const { listId } = await seedWithTasks([]);
    await appendTasks({
      listId,
      userId: OWNER,
      tasks: [
        makeTask({ title: 'X', position: 1000, dueDate: null, now }),
        makeTask({ title: 'Y', position: 1000, dueDate: null, now }),
      ],
    });

    const beri = async () => {
      const doc = await TodoListModel.findById(listId).lean<TodoListSnapshot | null>();
      return orderTasks(doc?.tasks ?? []).map((t) => t.title);
    };

    const prvi = await beri();
    const drugi = await beri();

    expect(prvi).toEqual(drugi);
  });

  it('hkratno čiščenje opravljenih in preklop drugega opravila se ne pobijeta', async () => {
    const { listId, taskIds } = await seedWithTasks(['Opravljeno', 'Odprto']);
    await setTaskFields({
      listId,
      userId: OWNER,
      taskId: taskIds[0] as string,
      capability: 'toggleTask',
      fields: { done: true },
      now,
    });

    await Promise.all([
      clearCompleted({ listId, userId: OWNER }),
      setTaskFields({
        listId,
        userId: OWNER,
        taskId: taskIds[1] as string,
        capability: 'writeTasks',
        fields: { title: 'Preimenovano' },
        now,
      }),
    ]);

    const after = await TodoListModel.findById(listId).lean();
    // Odprto opravilo je preživelo čiščenje IN obdržalo novo ime — ne glede na vrstni red.
    expect(after?.tasks).toHaveLength(1);
    expect(after?.tasks[0]?.title).toBe('Preimenovano');
  });

  it('deset hkratnih preklopov desetih opravil: vsi obstanejo', async () => {
    const titles = Array.from({ length: 10 }, (_, i) => `Opravilo ${i}`);
    const { listId, taskIds } = await seedWithTasks(titles);

    await Promise.all(
      taskIds.map((taskId) =>
        setTaskFields({ listId, userId: OWNER, taskId, capability: 'toggleTask', fields: { done: true }, now }),
      ),
    );

    const after = await TodoListModel.findById(listId).lean();
    expect(after?.tasks.filter((t) => t.done)).toHaveLength(10);
  });
});
