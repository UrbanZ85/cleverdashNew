import { Types } from 'mongoose';
import type { DefinitionsContext, LastRunInfo, ScannerSummary, TypeDefinitions } from '../../../platform/scanner/types.js';
import { formatSlotLocal } from '../../../platform/scanner/domain/schedule-slots.js';
import { FlightSearchRuleModel } from '../models/flight-search-rule.model.js';
import { listOwnRules, requireObjectId, type RuleLean } from '../services/rule-access.service.js';
import { readOfferCounts } from '../services/rule-response.service.js';

// Prispevek modula Leti na seznam skenerjev (016, FR-008, research.md §3): iskanje letov je
// skener tipa `flights` z urnikom TIPA. Jedro zanj nima zapisa — vrstico sestavi modul iz
// `FlightSearchRule`, povezave kažejo na obstoječe strani Leti.

function lastRunOf(rule: RuleLean): LastRunInfo | null {
  if (!rule.lastCheck) return null;
  const outcomes = rule.lastCheck.outcomes ?? [];
  const success = outcomes.some((o) => o.outcome === 'ok' || o.outcome === 'noFlights');
  const failure = outcomes.find((o) => o.outcome === 'unreachable' || o.outcome === 'rateLimited' || o.outcome === 'incomplete');
  return {
    at: rule.lastCheck.at,
    outcome: success ? 'ok' : 'failed',
    message: success ? null : (failure?.message ?? 'Noben vir ni odgovoril.'),
  };
}

function toSummary(rule: RuleLean, ctx: DefinitionsContext, resultCount: number): ScannerSummary {
  const { typeSchedule } = ctx;
  return {
    id: String(rule._id),
    type: 'flights',
    name: rule.name,
    enabled: rule.active,
    schedule: {
      mode: 'type',
      preset: typeSchedule.preset,
      cronExpression: typeSchedule.cronExpression,
      timezone: typeSchedule.timezone,
      label: typeSchedule.label,
      nextRunAt: rule.active ? typeSchedule.nextRunAt : null,
      nextRunLocal: rule.active && typeSchedule.nextRunAt ? formatSlotLocal(typeSchedule.nextRunAt, typeSchedule.timezone) : null,
    },
    lastRun: lastRunOf(rule),
    lastSuccessAt: rule.lastSuccessfulCheckAt,
    resultCount,
    links: { edit: `/flight-deals/searches/${String(rule._id)}`, results: `/flight-deals?search=${String(rule._id)}` },
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

export const flightDefinitions: TypeDefinitions = {
  async listForUser(userId, ctx) {
    const rules = await listOwnRules(userId);
    const counts = await readOfferCounts(rules.map((r) => r._id));
    return rules.map((rule) => toSummary(rule, ctx, counts.get(String(rule._id)) ?? 0));
  },

  async findForUser(userId, id, ctx) {
    if (!Types.ObjectId.isValid(id)) return null;
    const rule = await FlightSearchRuleModel.findOne({ _id: requireObjectId(id, 'Iskanje'), userId: new Types.ObjectId(userId) }).lean<RuleLean | null>();
    if (!rule) return null;
    const counts = await readOfferCounts([rule._id]);
    return toSummary(rule, ctx, counts.get(String(rule._id)) ?? 0);
  },

  countAll() {
    return FlightSearchRuleModel.countDocuments();
  },
};
