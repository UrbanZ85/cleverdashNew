import type { DateRange } from './date-window.js';
import type { ProviderId } from './types.js';

// Načrt poizvedb (FR-023, FR-024, SC-007): poizvedbe vseh aktivnih iskanj se zložijo v množico po
// ključu, da se ista kombinacija (vir, letališče, cilj, obdobje, potniki …) pri viru vpraša
// ENKRAT, ne glede na število uporabnikov. Vsako iskanje se nato ovrednoti nad rezultati svojih
// ključev po lastnih pravilih (rule-matcher.ts).
//
// Kako vir razbije okno na poizvedbe (po mesecih, po celem oknu …), ve vir sam
// (providers/*.ts, `buildQueries`); tu je samo združevanje in meja na iskanje.

export interface ProviderQuery {
  providerId: ProviderId;
  origin: string;
  /** `null` = "kamor koli" (vir vrne vse destinacije). Pri načinu `countries` je prav tako
   * `null`, filtrira se lokalno — vir filtra po državi nima. */
  destination: string | null;
  outbound: DateRange;
  inbound: DateRange | null;
  direct: boolean;
  currency: string;
  adults: number;
  children: number;
  minNights: number | null;
  maxNights: number | null;
  /** Najvišja cena na osebo, kadar jo vir zna filtrirati sam (Ryanair `priceValueTo`); `null` pri virih, ki
   * je ne — tam ostane v ključu `-`, da se poizvedbe različnih uporabnikov še vedno zlijejo. */
  priceCapPerPerson: number | null;
}

/** Deterministični ključ: isti vhod → isti niz, ne glede na vrstni red polj. */
export function queryKeyOf(q: ProviderQuery): string {
  return [
    q.providerId,
    q.origin,
    q.destination ?? '*',
    q.outbound.from,
    q.outbound.to,
    q.inbound ? `${q.inbound.from}..${q.inbound.to}` : '-',
    q.direct ? 'direct' : 'any',
    q.currency,
    `${q.adults}+${q.children}`,
    q.minNights ?? '-',
    q.maxNights ?? '-',
    q.priceCapPerPerson ?? '-',
  ].join('|');
}

export interface RulePlan {
  ruleId: string;
  queryKeys: string[];
  truncated: boolean;
}

export interface QueryPlan {
  queries: Map<string, ProviderQuery>;
  perRule: Map<string, RulePlan>;
  /** Koliko poizvedb bi bilo brez deduplikacije — za števec `queries` zagona. */
  requestedCount: number;
}

/**
 * Združi poizvedbe vseh iskanj. `maxQueriesPerRule` velja na iskanje in vir: iskanje, ki jo
 * preseže, dobi prve poizvedbe (viri jih vrnejo v kronološkem redu) in oznako `truncated`, ki je
 * vidna uporabniku (FR-015) — ne tihega skrajšanja.
 */
export function buildQueryPlan(
  perRuleQueries: ReadonlyArray<{ ruleId: string; queries: ProviderQuery[] }>,
  limits: { maxQueriesPerRule: number },
): QueryPlan {
  const queries = new Map<string, ProviderQuery>();
  const perRule = new Map<string, RulePlan>();
  let requestedCount = 0;

  for (const { ruleId, queries: ruleQueries } of perRuleQueries) {
    const byProvider = new Map<ProviderId, ProviderQuery[]>();
    for (const q of ruleQueries) {
      const list = byProvider.get(q.providerId) ?? [];
      list.push(q);
      byProvider.set(q.providerId, list);
    }
    const keys: string[] = [];
    let truncated = false;
    for (const list of byProvider.values()) {
      const kept = list.slice(0, limits.maxQueriesPerRule);
      if (kept.length < list.length) truncated = true;
      for (const q of kept) {
        const key = queryKeyOf(q);
        if (!queries.has(key)) queries.set(key, q);
        keys.push(key);
        requestedCount += 1;
      }
    }
    perRule.set(ruleId, { ruleId, queryKeys: keys, truncated });
  }

  return { queries, perRule, requestedCount };
}
