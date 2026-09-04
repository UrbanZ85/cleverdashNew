import { Router, type Request } from 'express';
import { resolveAutomationOwnerUserId } from '../../platform/auth/automation-owner.js';
import { isShareableUser } from '../../platform/users/directory.service.js';
import { requireScopes } from '../../platform/auth/scopes.js';
import { ProblemError, badRequest, forbidden, notFound } from '../../platform/errors/problem.js';
import { TODO_SCOPES } from './scopes.js';
import { TodoListModel } from './models/todo-list.model.js';
import { buildVisibleListsFilter } from './domain/visibility.js';
import { requiredCapabilityFor } from './domain/capabilities.js';
import { parseDueDate } from './domain/due-date.js';
import { nextPositions, toPositionAssignments } from './domain/task-order.js';
import {
  MAX_LISTS_PER_USER,
  TODO_LIMITS,
  listCreateSchema,
  listPatchSchema,
  MAX_MEMBERS_PER_LIST,
  makeTask,
  memberPutSchema,
  orderSchema,
  sanitizeListTitle,
  sanitizeTaskTitle,
  taskCreateSchema,
  taskPatchSchema,
} from './domain/todo-input.js';
import {
  assertCan,
  assertRoomForTasks,
  explainNoMatch,
  requireObjectId,
  resolveListAccess,
  type TodoListSnapshot,
} from './services/list-access.service.js';
import {
  appendTasks,
  clearCompleted,
  removeTask,
  repositionTasks,
  setTaskFields,
} from './services/task-write.service.js';
import { readUsersFor, toListResponse } from './services/list-response.service.js';
import { addOrUpdateMember, markSeen, removeMember } from './services/sharing.service.js';
import { auditListLockChanged } from './todos.audit.js';

export const todosRouter = Router();

// VRSTNI RED POTI JE POMEMBEN. Express ujame prvo ujemajočo se pot, `/todos/lists/:listId` pa
// se ujame tudi z `/todos/lists/karkoli`. Statične poti z enakim številom segmentov morajo biti
// zato deklarirane PRED parametričnimi — `/todos/lists/:listId/tasks/clear-completed` pred
// `/todos/lists/:listId/tasks/:taskId` (ista opomba kot modules/notes/router.ts).

/**
 * V čigavem imenu teče ta zahteva.
 *
 * Klicatelj z API ključem nima osebnega `subjectId` (API ključi niso vezani na uporabnika —
 * člen III), zato se lastnik razreši enako kot pri 009.
 */
async function actorUserId(req: Request): Promise<string> {
  if (req.auth?.subjectType === 'user') return req.auth.subjectId;
  const ownerId = await resolveAutomationOwnerUserId();
  if (!ownerId) {
    throw notFound(
      'Avtomatizacija ne more ugotoviti, na katerega uporabnika se nanaša — ni podedovanih podatkov niti natanko enega uporabnika.',
    );
  }
  return ownerId;
}

/**
 * Obseg za deljenje, preverjen ZNOTRAJ poti.
 *
 * `requireScopes()` sprejme en nabor za celo pot, `DELETE …/members/:userId` pa ima dva
 * zakonita klicatelja z RAZLIČNIMA obsegoma: lastnik odvzame komur koli (`todos:share`),
 * soudeleženec odstrani sebe (`todos:write`, FR-047). Vrata na poti so zato `write`, strožji
 * obseg pa se zahteva samo v veji, ki ga res potrebuje.
 */
function requireShareScope(req: Request): void {
  const scopes = req.auth?.scopes ?? [];
  if (scopes.includes('admin') || scopes.includes(TODO_SCOPES.share)) return;
  throw forbidden(`Manjkajo obsegi: ${TODO_SCOPES.share}.`);
}

/** Odgovor za en seznam, z imeni oseb, ki jih omenja. */
async function respondWithList(
  list: TodoListSnapshot,
  viewerId: string,
  includeTasks = true,
): Promise<ReturnType<typeof toListResponse>> {
  const users = await readUsersFor([list]);
  return toListResponse({ list, viewerId, users, includeTasks, now: new Date() });
}

// ---------------------------------------------------------------------------------------
// Seznami
// ---------------------------------------------------------------------------------------

todosRouter.get('/todos/lists', requireScopes(TODO_SCOPES.read), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const includeTasks = req.query.includeTasks === 'true';

    const lists = await TodoListModel.find(buildVisibleListsFilter(userId))
      .sort({ updatedAt: -1 })
      .lean<TodoListSnapshot[]>();

    const users = await readUsersFor(lists);
    const now = new Date();

    res.json({
      lists: lists.map((list) => toListResponse({ list, viewerId: userId, users, includeTasks, now })),
      limits: TODO_LIMITS,
    });
  } catch (err) {
    next(err);
  }
});

todosRouter.post('/todos/lists', requireScopes(TODO_SCOPES.write), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const body = listCreateSchema.parse(req.body);

    const title = sanitizeListTitle(body.title);
    if (!title) throw badRequest('Ime seznama ne sme biti prazno.');

    // Meja seznamov na uporabnika je preverjena iz štetja in ne v filtru: za razliko od meje
    // opravil tu ni enega dokumenta, v katerega bi se pogoj dalo vgraditi. Dirka je teoretično
    // mogoča (dva hkratna klica ob natanko doseženi meji), posledica pa je en seznam čez mejo —
    // kar ni varnostna ne podatkovna napaka, samo številka.
    const owned = await TodoListModel.countDocuments({ ownerId: userId });
    if (owned >= MAX_LISTS_PER_USER) {
      throw new ProblemError(
        409,
        'Preveč seznamov',
        `Imaš lahko največ ${MAX_LISTS_PER_USER} seznamov. Izbriši katerega, preden narediš novega.`,
      );
    }

    const created = await TodoListModel.create({
      ownerId: userId,
      title,
      locked: false,
      members: [],
      tasks: [],
      lastModifiedBy: userId,
    });

    const list = created.toObject() as unknown as TodoListSnapshot;
    res.status(201).json(await respondWithList(list, userId));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------------------
// Ploščica na nadzorni plošči — deklarirano PRED `/todos/lists/:listId`
// ---------------------------------------------------------------------------------------

todosRouter.get('/todos/current', requireScopes(TODO_SCOPES.read), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const pinnedId = typeof req.query.listId === 'string' ? req.query.listId : undefined;
    const filter = buildVisibleListsFilter(userId);

    // Pripeti seznam, če ga uporabnik ima IN je še dosegljiv.
    const pinned =
      pinnedId && (await isValidId(pinnedId))
        ? await TodoListModel.findOne({ _id: pinnedId, ...filter }).lean<TodoListSnapshot | null>()
        : null;

    // Sicer nazadnje spremenjen. Vsaka veja `$or` ima svoj indeks z `updatedAt: -1` na koncu,
    // zato Mongo združi dva že urejena tokova in `.limit(1)` se ustavi pri prvem — brez
    // blokirnega sortiranja.
    const list =
      pinned ??
      (await TodoListModel.findOne(filter).sort({ updatedAt: -1 }).lean<TodoListSnapshot | null>());

    if (!list) {
      res.json({ list: null, fallback: false, nextPollSeconds: 60 });
      return;
    }

    // Deljen seznam se osvežuje pogosteje: pri njem se stanje lahko spremeni, ne da bi uporabnik
    // karkoli storil. Interval pove STREŽNIK, nikoli konstanta v odjemalcu (FR-087, člen VIII).
    const nextPollSeconds = list.members.length > 0 ? 30 : 60;

    res.json({
      list: await respondWithList(list, userId),
      // `fallback: true` pomeni, da pripetega seznama ni več ali je bil dostop odvzet. To NI
      // napaka: ploščica ne sme podreti nadzorne plošče (FR-085, SC-010).
      fallback: Boolean(pinnedId) && pinned === null,
      nextPollSeconds,
    });
  } catch (err) {
    next(err);
  }
});

async function isValidId(value: string): Promise<boolean> {
  try {
    requireObjectId(value, 'Seznam');
    return true;
  } catch {
    // Neveljaven pripeti ID je ostanek stare nastavitve ploščice, ne napaka zahteve — ploščica
    // pade nazaj na nazadnje spremenjen seznam (FR-085).
    return false;
  }
}

// ---------------------------------------------------------------------------------------
// Opravila — statična pot PRED `/tasks/:taskId`
// ---------------------------------------------------------------------------------------

todosRouter.post(
  '/todos/lists/:listId/tasks/clear-completed',
  requireScopes(TODO_SCOPES.write),
  async (req, res, next) => {
    try {
      const userId = await actorUserId(req);
      const listId = req.params.listId as string;

      const access = await resolveListAccess(listId, userId);
      assertCan(access, 'clearCompleted');

      const result = await clearCompleted({ listId, userId });
      if (!result) return await explainNoMatch(listId, userId, 'clearCompleted');

      res.json({
        removed: result.removed,
        list: await respondWithList(result.list, userId),
      });
    } catch (err) {
      next(err);
    }
  },
);

todosRouter.post('/todos/lists/:listId/tasks', requireScopes(TODO_SCOPES.write), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const listId = req.params.listId as string;
    const body = taskCreateSchema.parse(req.body);

    const access = await resolveListAccess(listId, userId);
    assertCan(access, 'writeTasks');

    const titles = body.titles.map(sanitizeTaskTitle).filter((t) => t.length > 0);
    // Vnos, od katerega po čiščenju ne ostane nič, je ZAVRNJEN in ne tiho preskočen (FR-014):
    // tiho preskočena vrstica je opravilo, za katero uporabnik misli, da ga je dodal.
    if (titles.length !== body.titles.length) {
      throw badRequest('Opravilo brez besedila ni mogoče. Preveri vnos.');
    }

    assertRoomForTasks(access, titles.length);

    const now = new Date();
    const dueDate = parseDueDate(body.dueDate ?? null);
    const positions = nextPositions(access.list.tasks, titles.length);
    const tasks = titles.map((title, i) =>
      makeTask({ title, position: positions[i] as number, dueDate, now }),
    );

    const updated = await appendTasks({ listId, userId, tasks });
    if (!updated) return await explainNoMatch(listId, userId, 'writeTasks');

    res.status(201).json(await respondWithList(updated, userId));
  } catch (err) {
    next(err);
  }
});

todosRouter.put('/todos/lists/:listId/order', requireScopes(TODO_SCOPES.write), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const listId = req.params.listId as string;
    const body = orderSchema.parse(req.body);

    const access = await resolveListAccess(listId, userId);
    assertCan(access, 'reorderTasks');

    // Sprejme CEL vrstni red, ne relativnega premika: ponovljen "premakni gor" bi opravilo
    // premaknil dvakrat, ponovljen PUT /order pa je no-op — kar je pogoj, da endpoint drzi
    // obljubo Idempotency-Key (clen III, research.md §10).
    //
    // Neznana in odkljukana opravila se preskocijo; opravila, ki jih v `taskIds` NI (nekdo jih
    // je medtem dodal), obdrzijo svoj polozaj in se ne izgubijo (FR-026).
    const reorderable = new Set(access.list.tasks.filter((t) => !t.done).map((t) => String(t._id)));
    const assignments = toPositionAssignments(body.taskIds.filter((id) => reorderable.has(id)));

    if (assignments.length === 0) {
      res.json(await respondWithList(access.list, userId));
      return;
    }

    const updated = await repositionTasks({ listId, userId, assignments });
    if (!updated) return await explainNoMatch(listId, userId, 'reorderTasks');

    res.json(await respondWithList(updated, userId));
  } catch (err) {
    next(err);
  }
});

todosRouter.patch(
  '/todos/lists/:listId/tasks/:taskId',
  requireScopes(TODO_SCOPES.write),
  async (req, res, next) => {
    try {
      const userId = await actorUserId(req);
      const listId = req.params.listId as string;
      const taskId = req.params.taskId as string;
      const body = taskPatchSchema.parse(req.body);

      const access = await resolveListAccess(listId, userId);
      requireObjectId(taskId, 'Opravilo');

      // Zahtevana zmožnost je odvisna od POLJ v telesu — to je edini razlog, da stopnja
      // `check` obstaja (research.md §9).
      const fields = {
        ...(body.done !== undefined ? { done: body.done } : {}),
        ...(body.title !== undefined ? { title: sanitizeTaskTitle(body.title) } : {}),
        ...(body.dueDate !== undefined ? { dueDate: parseDueDate(body.dueDate) } : {}),
      };
      if (fields.title !== undefined && fields.title === '') {
        throw badRequest('Opravilo brez besedila ni mogoče.');
      }

      const capability = requiredCapabilityFor(fields);
      assertCan(access, capability);

      const updated = await setTaskFields({
        listId,
        userId,
        taskId,
        capability,
        fields,
        now: new Date(),
      });
      if (!updated) return await explainNoMatch(listId, userId, capability, taskId);

      res.json(await respondWithList(updated, userId));
    } catch (err) {
      next(err);
    }
  },
);

todosRouter.delete(
  '/todos/lists/:listId/tasks/:taskId',
  requireScopes(TODO_SCOPES.write),
  async (req, res, next) => {
    try {
      const userId = await actorUserId(req);
      const listId = req.params.listId as string;
      const taskId = req.params.taskId as string;

      const access = await resolveListAccess(listId, userId);
      requireObjectId(taskId, 'Opravilo');
      assertCan(access, 'writeTasks');

      const updated = await removeTask({ listId, userId, taskId });
      if (!updated) return await explainNoMatch(listId, userId, 'writeTasks', taskId);

      // 200 s telesom in NE 204: hramba idempotence zajame odgovor tako, da ovije `res.json`,
      // odgovor brez telesa pa skoznjo ne gre — ponovljen DELETE z istim ključem bi se izvedel
      // znova in vrnil 404 (plan.md, Complexity Tracking U2).
      res.json({ deleted: true, list: await respondWithList(updated, userId) });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------------------
// Deljenje
// ---------------------------------------------------------------------------------------

todosRouter.put(
  '/todos/lists/:listId/members/:userId',
  requireScopes(TODO_SCOPES.share),
  async (req, res, next) => {
    try {
      const actorId = await actorUserId(req);
      const listId = req.params.listId as string;
      const targetUserId = requireObjectId(req.params.userId as string, 'Uporabnik');
      const body = memberPutSchema.parse(req.body);

      const access = await resolveListAccess(listId, actorId);
      assertCan(access, 'manageSharing');

      // Lastnik ni ena od stopenj (FR-048). 400 in ne 403: to ni pomanjkanje pravice, ampak
      // zahteva, ki nima pomena — lastnik ima že vse.
      if (String(access.list.ownerId) === targetUserId) {
        throw badRequest('Lastnika ni mogoče dodati med soudeležence — že ima poln dostop.');
      }

      // Ponuditi človeka, ki se ne more prijaviti, je obljuba, ki je ni mogoče izpolniti
      // (FR-070). Preverjeno tu in ne le v imeniku, ker API ključ imenika ne uporablja.
      if (!(await isShareableUser(targetUserId))) {
        throw badRequest('Ta uporabnik se v CleverDash še ni prijavil, zato deljenje ni mogoče.');
      }

      const change = await addOrUpdateMember({
        listId,
        ownerId: actorId,
        targetUserId,
        role: body.role,
        now: new Date(),
        logger: req.log,
      });

      if (!change) {
        // Edini razlog, ki ga razsodnik ne zna pojasniti, je polnost — zato ga povemo tu.
        if (access.list.members.length >= MAX_MEMBERS_PER_LIST) {
          throw new ProblemError(
            409,
            'Preveč soudeležencev',
            `Seznam je lahko deljen z največ ${MAX_MEMBERS_PER_LIST} osebami.`,
          );
        }
        return await explainNoMatch(listId, actorId, 'manageSharing');
      }

      res.status(change.created ? 201 : 200).json(await respondWithList(change.list, actorId));
    } catch (err) {
      next(err);
    }
  },
);

todosRouter.delete(
  '/todos/lists/:listId/members/:userId',
  requireScopes(TODO_SCOPES.write),
  async (req, res, next) => {
    try {
      const actorId = await actorUserId(req);
      const listId = req.params.listId as string;
      const targetUserId = requireObjectId(req.params.userId as string, 'Uporabnik');
      const selfLeave = targetUserId === actorId;

      // Odvzem TUJEGA dostopa je lastnikovo dejanje in zahteva strožji obseg; odhod s
      // seznama je svoje dejanje in ga ne (FR-047).
      if (!selfLeave) requireShareScope(req);

      const access = await resolveListAccess(listId, actorId);
      assertCan(access, selfLeave ? 'leaveList' : 'manageSharing');

      const updated = await removeMember({
        listId,
        actorUserId: actorId,
        targetUserId,
        logger: req.log,
      });

      if (!updated) {
        // Odvzem dostopa nekomu, ki ga nima, je ŽE dosežen izid — 200 in ne 404, da ponovljen
        // klic z istim Idempotency-Key ne vrne napake namesto prvotnega uspeha (FR-094).
        res.json({ removed: false, list: await respondWithList(access.list, actorId) });
        return;
      }

      // Po odhodu s seznama ga klicatelj ne vidi več, zato zanj ni česa vrniti.
      res.json({
        removed: true,
        list: selfLeave ? null : await respondWithList(updated, actorId),
      });
    } catch (err) {
      next(err);
    }
  },
);

todosRouter.post('/todos/lists/:listId/seen', requireScopes(TODO_SCOPES.read), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const listId = req.params.listId as string;

    // Obseg je BRALNI: ogled je bralčevo lastno knjigovodstvo. Z zahtevo po pisalnem obsegu
    // soudeleženec s stopnjo "ogled" oznake "novo" nikoli ne bi mogel odstraniti.
    const access = await resolveListAccess(listId, userId);
    assertCan(access, 'readList');

    // Deluje tudi na ZAKLENJENEM seznamu: ogled ni sprememba vsebine (UNAFFECTED_BY_LOCK).
    const updated = await markSeen({ listId, userId, now: new Date() });

    // Za lastnika se ne ujame nič in to je pravilno — svojega seznama si ni delil sam s sabo.
    res.json(await respondWithList(updated ?? access.list, userId));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------------------
// En seznam — parametrične poti NA KONCU
// ---------------------------------------------------------------------------------------

todosRouter.get('/todos/lists/:listId', requireScopes(TODO_SCOPES.read), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const access = await resolveListAccess(req.params.listId as string, userId);
    assertCan(access, 'readList');
    res.json(await respondWithList(access.list, userId));
  } catch (err) {
    next(err);
  }
});

todosRouter.patch('/todos/lists/:listId', requireScopes(TODO_SCOPES.write), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const listId = req.params.listId as string;
    const body = listPatchSchema.parse(req.body);

    const access = await resolveListAccess(listId, userId);

    const $set: Record<string, unknown> = { lastModifiedBy: userId };
    if (body.title !== undefined) {
      assertCan(access, 'renameList');
      const title = sanitizeListTitle(body.title);
      if (!title) throw badRequest('Ime seznama ne sme biti prazno.');
      $set.title = title;
    }
    if (body.locked !== undefined) {
      assertCan(access, 'toggleLock');
      $set.locked = body.locked;
    }

    // Filter je `ownerId`, ker sta obe polji lastnikovi (FR-045) — pogoj dostopa je tudi tu v
    // zapisu, ne samo v razsodniku.
    const updated = await TodoListModel.findOneAndUpdate(
      { _id: listId, ownerId: userId },
      { $set },
      { new: true },
    ).lean<TodoListSnapshot | null>();
    if (!updated) return await explainNoMatch(listId, userId, body.locked !== undefined ? 'toggleLock' : 'renameList');

    if (body.locked !== undefined) {
      auditListLockChanged(req.log, { actorUserId: userId, listId, locked: body.locked });
    }

    res.json(await respondWithList(updated, userId));
  } catch (err) {
    next(err);
  }
});

todosRouter.delete('/todos/lists/:listId', requireScopes(TODO_SCOPES.write), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const listId = req.params.listId as string;

    const access = await resolveListAccess(listId, userId);
    assertCan(access, 'deleteList');

    // Izbris odstrani opravila IN vsa članstva, ker so v istem dokumentu — to je ena od stvari,
    // ki jih ločena zbirka brez transakcij ne bi mogla narediti atomarno (research.md §1).
    const deleted = await TodoListModel.findOneAndDelete({
      _id: listId,
      ownerId: userId,
    }).lean<TodoListSnapshot | null>();
    if (!deleted) return await explainNoMatch(listId, userId, 'deleteList');

    // 200 s telesom, ne 204 — glej opombo pri brisanju opravila.
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});
