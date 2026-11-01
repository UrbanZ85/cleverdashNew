import { planEvent, type EventPlan as SharedEventPlan, type EventReason, type PlanInput as SharedPlanInput } from '../../platform/scanner/domain/alert-plan.js';
import type { CollectiblesAlerts } from './domain/types.js';

// Odločitve o dogodkih obvestil zbirateljskega skenerja (019, FR-024). Pravila (nov, pocenitev, podcenjeno,
// dražba, sprememba) so skupna z LEGO (`platform/scanner/domain/alert-plan.ts`); tu je samo to, kar je
// zbirateljsko: DVA možna praga — dobiček (samo iz preverjenih prodaj) ali popust do ocene — od katerih velja
// natanko eden (prag dobička ima prednost), in zastavice stanja na rezultatu.

export type { EventReason };

export interface PlanCollectiblesInput extends Omit<SharedPlanInput, 'previous' | 'profit' | 'threshold'> {
  profit: number | null;
  discountPct: number | null;
  notifyMinProfit: number | undefined;
  notifyMinDiscountPct: number | undefined;
  previous: CollectiblesAlerts | null;
}

export interface CollectiblesEventPlan extends Omit<SharedEventPlan, 'alerts'> {
  alerts: CollectiblesAlerts;
  /** Kateri prag je veljal; `null` = brez praga. */
  thresholdKind: 'profit' | 'discount' | null;
}

export function planCollectiblesEvent(input: PlanCollectiblesInput): CollectiblesEventPlan {
  const useDiscount = input.notifyMinProfit === undefined && input.notifyMinDiscountPct !== undefined;
  const threshold = useDiscount ? input.notifyMinDiscountPct : input.notifyMinProfit;
  const metric = useDiscount ? input.discountPct : input.profit;
  const prev = input.previous;
  const shared = planEvent({
    isNew: input.isNew,
    change: input.change,
    comparableChanged: input.comparableChanged,
    profit: metric,
    threshold,
    listingType: input.listingType,
    endsAt: input.endsAt,
    now: input.now,
    auctionEndingHours: input.auctionEndingHours,
    previous: prev ? { profitNotified: useDiscount ? prev.discountNotified : prev.profitNotified, auctionEndingNotified: prev.auctionEndingNotified } : null,
  });
  return {
    reasons: shared.reasons,
    changeType: shared.changeType,
    thresholdKind: threshold === undefined ? null : useDiscount ? 'discount' : 'profit',
    alerts: {
      profitNotified: useDiscount ? false : shared.alerts.profitNotified,
      discountNotified: useDiscount ? shared.alerts.profitNotified : false,
      auctionEndingNotified: shared.alerts.auctionEndingNotified,
    },
  };
}
