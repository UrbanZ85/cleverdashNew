import { planEvent as sharedPlanEvent, type EventReason, type EventPlan as SharedEventPlan, type PlanInput as SharedPlanInput } from '../../platform/scanner/domain/alert-plan.js';
import type { LegoAlerts, ListingType } from './domain/types.js';

// Odločitve o dogodkih obvestil LEGO (018, research §7). Pravila so od 019 skupna
// (`platform/scanner/domain/alert-plan.ts`); tu so samo LEGO tipi zastavic in vrste ponudbe.

export type { EventReason };

export interface PlanInput extends Omit<SharedPlanInput, 'previous' | 'listingType'> {
  listingType: ListingType;
  previous: LegoAlerts | null;
}

export interface EventPlan extends Omit<SharedEventPlan, 'alerts'> {
  alerts: LegoAlerts;
}

export function planEvent(input: PlanInput): EventPlan {
  return sharedPlanEvent(input);
}
