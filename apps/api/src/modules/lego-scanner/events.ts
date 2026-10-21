import type { ChangeType, NotifiableChangeType } from '../../platform/scanner/types.js';
import type { LegoAlerts, ListingType } from './domain/types.js';

// Odločitve o dogodkih obvestil (018, research §7). Čista funkcija: jedro generične shrambe zazna
// spremembo samo po ceni in ne pozna praga dobička ali dražb, zato tip sam odloči, kdaj in zakaj
// nastane dogodek. Stanje med zagoni je v `data.alerts` (zastavici), ki je del shranjenega rezultata.
//
//  - NOV oglas / pocenitev / podražitev gre v dopis, kadar ni praga ali je dobiček znan in ≥ prag;
//  - "podcenjena najdba": dobiček je ta zagon PRVIČ nad pragom (zastavica `profitNotified`), tudi brez
//    spremembe cene (npr. po osvežitvi cenika); ko dobiček pade pod prag, se zastavica ponastavi;
//  - "dražba se izteka": enkrat na oglas v oknu `auctionEndingHours`;
//  - sprememba stanja ali vrste ponudbe (hash `comparable`) je "spremenjeno".
// Brez praga se obvešča o vsakem novem/spremenjenem oglasu; pri znanem pragu oglas z NEZNANIM dobičkom
// ne obvešča (ne moremo trditi, da dosega prag).

export type EventReason = 'new' | 'price-down' | 'price-up' | 'undervalued' | 'auction-ending' | 'changed';

export interface PlanInput {
  isNew: boolean;
  change: ChangeType;
  comparableChanged: boolean;
  profit: number | null;
  threshold: number | undefined;
  listingType: ListingType;
  endsAt: Date | null;
  now: Date;
  auctionEndingHours: number;
  previous: LegoAlerts | null;
}

export interface EventPlan {
  alerts: LegoAlerts;
  reasons: EventReason[];
  /** `null` = brez dogodka. */
  changeType: NotifiableChangeType | null;
}

export function planEvent(input: PlanInput): EventPlan {
  const { threshold, profit } = input;
  const passes = threshold === undefined || (profit !== null && profit >= threshold);
  const prevProfit = input.previous?.profitNotified ?? false;
  const prevAuction = input.previous?.auctionEndingNotified ?? false;
  const reasons: EventReason[] = [];

  if (passes) {
    if (input.isNew || input.change === 'NEW') reasons.push('new');
    else if (input.change === 'PRICE_DOWN') reasons.push('price-down');
    else if (input.change === 'PRICE_UP') reasons.push('price-up');
    else if (input.comparableChanged) reasons.push('changed');
    if (threshold !== undefined && !prevProfit && !reasons.includes('new')) reasons.push('undervalued');
  }

  let auctionEndingNotified = prevAuction;
  if (input.listingType === 'AUCTION' && input.endsAt && !prevAuction && passes) {
    const remaining = input.endsAt.getTime() - input.now.getTime();
    if (remaining > 0 && remaining <= input.auctionEndingHours * 3_600_000) {
      reasons.push('auction-ending');
      auctionEndingNotified = true;
    }
  }

  const alerts: LegoAlerts = { profitNotified: threshold !== undefined && passes, auctionEndingNotified };
  if (reasons.length === 0) return { alerts, reasons, changeType: null };
  const changeType: NotifiableChangeType = reasons.includes('new') ? 'NEW' : reasons.includes('price-down') ? 'PRICE_DOWN' : reasons.includes('price-up') ? 'PRICE_UP' : 'CHANGED';
  return { alerts, reasons, changeType };
}
