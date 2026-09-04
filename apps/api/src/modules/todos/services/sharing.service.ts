import { Types } from 'mongoose';
import type { Logger } from '../../../platform/logging/logger.js';
import { TodoListModel } from '../models/todo-list.model.js';
import { MAX_MEMBERS_PER_LIST } from '../domain/todo-input.js';
import type { MemberRole } from '../domain/capabilities.js';
import type { TodoListSnapshot } from './list-access.service.js';
import { auditListShared, auditListUnshared, auditMemberRoleChanged } from '../todos.audit.js';

// Deljenje: edine operacije v modulu, ki zadenejo človeka, ki NI klicatelj.
//
// Vsa pisanja so, tako kot pri opravilih, en atomaren operator s pogojem dostopa v filtru
// (services/task-write.service.ts). Pri članstvu je to še pomembnejše: enoličnosti soudeleženca
// NE uveljavlja noben indeks — enoličen indeks nad `members.userId` bi prepovedal članstvo v
// DVEH seznamih — ampak izključno pogoj `'members.userId': { $ne: targetId }` v `$push`.
// Brez njega bi dva hkratna klica ustvarila dva vnosa za istega človeka, kar bi razsodniku
// dostopa vzelo enoličen odgovor in podvojilo dokument v izpisu (glej opombo pri indeksu v
// models/todo-list.model.ts).

export interface MemberChange {
  list: TodoListSnapshot;
  /** `true`, kadar je članstvo NASTALO; `false` pri spremembi stopnje. Razlika je vidna
   * navzven kot 201 proti 200 in je edini signal "nov soudeleženec". */
  created: boolean;
}

/**
 * Doda soudeleženca ali spremeni njegovo stopnjo.
 *
 * Dva atomarna poskusa in nobenega branja vmes:
 *  1. posodobi stopnjo OBSTOJEČEGA vnosa,
 *  2. če se ni ujel, dodaj NOVEGA pod pogojem, da ga še ni.
 *
 * Vrstni red je pomemben: obratno bi `$push` z `$ne` pri obstoječem članu tiho ne naredil
 * ničesar in klicatelj bi mislil, da je stopnjo spremenil.
 *
 * `null` pomeni, da se ni ujelo nič — seznama ni, klicatelj ni lastnik, ali pa je članov že
 * preveč. Razloge razloči `explainNoMatch` oziroma usmerjevalnik.
 */
export async function addOrUpdateMember(params: {
  listId: string;
  ownerId: string;
  targetUserId: string;
  role: MemberRole;
  now: Date;
  logger?: Logger;
}): Promise<MemberChange | null> {
  const target = new Types.ObjectId(params.targetUserId);

  const updated = await TodoListModel.findOneAndUpdate(
    { _id: params.listId, ownerId: params.ownerId, 'members.userId': target },
    { $set: { 'members.$[m].role': params.role } },
    { arrayFilters: [{ 'm.userId': target }], new: true },
  ).lean<TodoListSnapshot | null>();

  if (updated) {
    auditMemberRoleChanged(params.logger, {
      actorUserId: params.ownerId,
      listId: params.listId,
      targetUserId: params.targetUserId,
      role: params.role,
    });
    return { list: updated, created: false };
  }

  const pushed = await TodoListModel.findOneAndUpdate(
    {
      _id: params.listId,
      ownerId: params.ownerId,
      // Atomarno jamstvo enoličnosti — glej opombo na vrhu datoteke.
      'members.userId': { $ne: target },
      // Atomarna zgornja meja, isti obrazec kot pri opravilih (research.md §8).
      [`members.${MAX_MEMBERS_PER_LIST - 1}`]: { $exists: false },
    },
    {
      $push: {
        members: { userId: target, role: params.role, addedAt: params.now, seenAt: null },
      },
    },
    { new: true },
  ).lean<TodoListSnapshot | null>();

  if (!pushed) return null;

  auditListShared(params.logger, {
    actorUserId: params.ownerId,
    listId: params.listId,
    targetUserId: params.targetUserId,
    role: params.role,
  });
  return { list: pushed, created: true };
}

/**
 * Odvzame dostop.
 *
 * Dve poti in dva različna pogoja v filtru:
 *  - **lastnik** odvzame komur koli (`ownerId: actorId`),
 *  - **soudeleženec** odstrani SEBE, in to tudi ob zaklepu: ključavnica omejuje spremembe V
 *    seznamu, ne pripadnosti tujim podatkom (FR-047). Zato v tem filtru pogoja `locked` ni.
 *
 * Lastnik svojega seznama ne more zapustiti — to prepreči že razsodnik (`leaveList` mu ni
 * dovoljen), tu pa še filter, ker `ownerId` in `members.userId` nikoli ne kažeta na isto osebo.
 */
export async function removeMember(params: {
  listId: string;
  actorUserId: string;
  targetUserId: string;
  logger?: Logger;
}): Promise<TodoListSnapshot | null> {
  const target = new Types.ObjectId(params.targetUserId);
  const selfLeave = params.actorUserId === params.targetUserId;

  const filter = selfLeave
    ? { _id: params.listId, 'members.userId': target }
    : { _id: params.listId, ownerId: params.actorUserId, 'members.userId': target };

  const updated = await TodoListModel.findOneAndUpdate(
    filter,
    { $pull: { members: { userId: target } } },
    { new: true },
  ).lean<TodoListSnapshot | null>();

  if (!updated) return null;

  auditListUnshared(params.logger, {
    actorUserId: params.actorUserId,
    listId: params.listId,
    targetUserId: params.targetUserId,
    selfLeave,
  });
  return updated;
}

/**
 * Označi, da je soudeleženec seznam videl — s tem izgine oznaka "novo" (FR-007).
 *
 * `timestamps: false` NI podrobnost: brez tega bi Mongoose ob tem zapisu posodobil `updatedAt`,
 * seznam bi skočil na vrh izpisa VSEM soudeležencem in ploščica bi preklopila nanj. Odpiranje
 * seznama bi bilo videti kot sprememba vsebine, kar ni.
 *
 * Iz istega razloga se tu NE nastavlja `lastModifiedBy`: ogled ni sprememba.
 *
 * Za lastnika je no-op — med `members` ga ni, filter se ne ujame, in to je pravilno: svojega
 * seznama si ni delil sam s sabo, zato zanj nikoli ni "nov".
 */
export async function markSeen(params: {
  listId: string;
  userId: string;
  now: Date;
}): Promise<TodoListSnapshot | null> {
  const user = new Types.ObjectId(params.userId);

  return TodoListModel.findOneAndUpdate(
    { _id: params.listId, 'members.userId': user },
    { $set: { 'members.$[m].seenAt': params.now } },
    { arrayFilters: [{ 'm.userId': user }], new: true, timestamps: false },
  ).lean<TodoListSnapshot | null>();
}
