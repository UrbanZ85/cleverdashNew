import { vi } from 'vitest';
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import { loadEnv } from '../../../src/platform/config/env.js';
import { getLogger } from '../../../src/platform/logging/logger.js';
import { executeRun } from '../../../src/platform/scanner/services/run-executor.service.js';
import { requestManualRun } from '../../../src/platform/scanner/services/scheduler.service.js';
import { registerFlightScannerType } from '../../../src/modules/flight-deals/scanner/index.js';
import { nextFriday } from '../../contract/flight-deals/_helpers.js';

// Pomožniki za integracijske teste zagona (015, od 016 prek jedra skenerjev). Zagon se kliče
// NEPOSREDNO (člen IX): brez čakanja na tik in z ničelnimi zamiki ponovitev. Tip `flights` se
// registrira tu, ker ti testi ne zaganjajo `createApp()`.

export const ACTOR = new Types.ObjectId().toString();

/** Obseg zagona tipa leti — vsa aktivna iskanja v enem zagonu (batch). */
export const FLIGHTS_SCOPE = { kind: 'type', type: 'flights' } as const;

/** Možnosti za tip (ctx.typeOptions): ničelni zamiki ponovitev pri virih. */
export const FLIGHT_TEST_OPTIONS = { runner: { retryDelaysMs: [0, 0] } };

export async function runOnce(now = new Date(), options: { processOutbox?: boolean } = {}) {
  registerFlightScannerType();
  const env = loadEnv();
  const { runId } = await requestManualRun(env, FLIGHTS_SCOPE, ACTOR, now);
  const run = await executeRun(runId, env, getLogger(env), now, {
    typeOptions: FLIGHT_TEST_OPTIONS,
    processOutbox: options.processOutbox ?? false,
  });
  return { runId, run };
}

/** Vrstica Travelpayouts za LJU → `destination`, odhod naslednji petek ob `hour`:`minute` LJU, povratek nedelja. */
export function tpRow(params: { destination?: string; price?: number; hour?: number; minute?: number; airline?: string; flight?: string; now?: Date } = {}) {
  const friday = nextFriday(params.now ?? new Date());
  const dep = friday.set({ hour: params.hour ?? 15, minute: params.minute ?? 10 });
  // `keepLocalTime`: nedelja ostane nedelja po londonskem koledarju, ne premik instanta.
  const ret = friday.plus({ days: 2 }).setZone('Europe/London', { keepLocalTime: true }).set({ hour: 17, minute: 40 });
  return {
    origin: 'LJU',
    destination: params.destination ?? 'STN',
    origin_airport: 'LJU',
    destination_airport: params.destination ?? 'STN',
    price: params.price ?? 59,
    airline: params.airline ?? 'FR',
    flight_number: params.flight ?? '1234',
    departure_at: dep.toISO({ suppressMilliseconds: true }),
    return_at: ret.toISO({ suppressMilliseconds: true }),
    transfers: 0,
    return_transfers: 0,
    duration: 300,
    duration_to: 130,
    duration_back: 170,
    link: '/search/LJU2310STN25101?t=FR&search_date=16102026',
  };
}

export interface FetchScript {
  /** Zaporedje odgovorov; zadnji se ponavlja. */
  responses: Array<{ status: number; body?: unknown }>;
}

const realFetch = globalThis.fetch;

/** `fetch` zamenjan: klici na Travelpayouts dobijo scenarij, vse ostalo (ponarejen Keycloak na
 * 127.0.0.1) gre naprej. Vrne vohun, iz katerega test prešteje klice na vir. */
export function stubTravelpayouts(script: FetchScript) {
  let index = 0;
  const calls: string[] = [];
  const spy = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('127.0.0.1')) return realFetch(input, init);
    if (!url.includes('api.travelpayouts.com')) throw new Error(`Nepričakovan fetch na ${url}`);
    calls.push(url);
    const step = script.responses[Math.min(index, script.responses.length - 1)]!;
    index += 1;
    if (step.status === 200) {
      return new Response(JSON.stringify(step.body ?? { success: true, data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ success: false, data: {}, error: `HTTP ${step.status}` }), { status: step.status });
  });
  vi.stubGlobal('fetch', spy);
  return { spy, calls };
}

export function todayLjubljana(now = new Date()): string {
  return DateTime.fromJSDate(now, { zone: 'utc' }).setZone('Europe/Ljubljana').toFormat('yyyy-LL-dd');
}
