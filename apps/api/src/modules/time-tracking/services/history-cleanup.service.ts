import { PlannedActionModel } from '../models/planned-action.model.js';

// data-model.md, US9 (T102): `plannedActions` je TEKOČ načrt, majhna kolekcija. Ko je
// akcija zaključena, je `ActionRecordModel` že takrat (sinhrono, ob zaključku — glej
// record-execution.service.ts) postal trajna kopija (FR-050/FR-052). Ta funkcija samo
// POČISTI staro `plannedActions` po obdobju hrambe, da tekoč načrt ostane majhen —
// `actionRecords` (evidenca) se NIKOLI ne briše (data-model.md, §Čiščenje).

const TERMINAL_STATES = ['succeeded', 'failed', 'already_done', 'missed', 'skipped', 'cancelled'];
const PLANNED_ACTION_RETENTION_DAYS = 90;

export async function cleanupOldPlannedActions(retentionDays = PLANNED_ACTION_RETENTION_DAYS): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const result = await PlannedActionModel.deleteMany({
    state: { $in: TERMINAL_STATES },
    updatedAt: { $lt: cutoff },
  });
  return result.deletedCount ?? 0;
}
