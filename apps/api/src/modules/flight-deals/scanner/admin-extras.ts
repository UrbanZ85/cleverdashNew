import type { Env } from '../../../platform/config/env.js';
import { FlightProviderStatusModel } from '../models/flight-provider-status.model.js';
import type { ProviderOutcome } from '../domain/types.js';
import { FLIGHT_PROVIDERS } from '../providers/index.js';

// Dodatek tipa `flights` za administracijo skenerjev (016, FR-045): stanje virov z zadnjo napako,
// dnevnimi mejami in zadnjim uspehom — do 016 `GET /flight-deals/admin/providers`. Brez
// skrivnosti (žetoni ostanejo v okolju). Ali je pošta nastavljena, pove jedro, ne tip.

export interface FlightProviderAdmin {
  id: string;
  label: string;
  official: boolean;
  enabled: boolean;
  lastSuccessAt: string | null;
  notice: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  lastOutcome: ProviderOutcome | null;
  requestsToday: number;
  dailyLimit: number | null;
}

export async function flightAdminExtras(env: Env): Promise<{ providers: FlightProviderAdmin[] }> {
  const statuses = await FlightProviderStatusModel.find().lean<
    Array<{
      providerId: string;
      lastSuccessAt: Date | null;
      lastErrorAt: Date | null;
      lastError: string | null;
      lastOutcome: ProviderOutcome | null;
      requestsToday: { day: string | null; count: number };
    }>
  >();
  const byId = new Map(statuses.map((s) => [s.providerId, s]));
  return {
    providers: FLIGHT_PROVIDERS.map((p) => {
      const s = byId.get(p.id);
      return {
        id: p.id,
        label: p.label,
        official: p.official,
        enabled: p.isEnabled(env),
        lastSuccessAt: s?.lastSuccessAt?.toISOString() ?? null,
        notice: p.notice,
        lastErrorAt: s?.lastErrorAt?.toISOString() ?? null,
        lastError: s?.lastError ?? null,
        lastOutcome: s?.lastOutcome ?? null,
        requestsToday: s?.requestsToday?.count ?? 0,
        dailyLimit: p.dailyRunLimit,
      };
    }),
  };
}
