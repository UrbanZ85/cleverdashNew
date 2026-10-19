import { z } from 'zod';
import type { Env } from '../../platform/config/env.js';
import type { ExecutionContext, ExecutionOutcome, ScannerType } from '../../platform/scanner/types.js';
import { echoNotificationHooks, type EchoItem } from './notifications.js';
import { ECHO_HOST, echoResults } from './scenario.js';

// Testni tip `echo` (016, FR-046, FR-047): dokaz, da se nov tip skenerja registrira, nastavi,
// izvede po urniku, shrani rezultate v generično shrambo, zazna spremembe in sproži dopis — BREZ
// sprememb jedra. Modul brez zavihka (kot `modules/auth`); registracija je ena vrstica v `main.ts`.
// V produkciji ga `loadEnv` zavrne (`SCANNER_ECHO_ENABLED`), da izmišljeni rezultati nikoli ne
// pridejo v dopis. Hkrati je PREDLOGA za `docs/adding-a-scanner-type.md`.

export const echoConfigSchema = z.object({
  items: z
    .number({ invalid_type_error: 'Število rezultatov mora biti število.' })
    .int('Število rezultatov mora biti celo število.')
    .min(1, 'Vsaj en rezultat.')
    .max(20, 'Največ 20 rezultatov.'),
  label: z.string().trim().max(40, 'Oznaka ima lahko največ 40 znakov.').default('Echo'),
});
export type EchoConfig = z.infer<typeof echoConfigSchema>;

export async function executeEcho(ctx: ExecutionContext<EchoConfig>): Promise<ExecutionOutcome> {
  if (!ctx.definition || !ctx.results) {
    return { status: 'failed', counters: {}, definitions: [], events: [], errors: [{ code: 'no-definition', message: 'Testni tip teče samo na skener z generično shrambo.' }] };
  }
  const { definition } = ctx;
  const runIndex = ctx.previousRunCount + 1;
  const items = echoResults(runIndex, definition.config.items, definition.config.label || 'Echo');
  await ctx.heartbeat();
  if (await ctx.shouldCancel()) return { status: 'cancelled', counters: {}, definitions: [], events: [], errors: [] };
  const { events, counters } = await ctx.results.reconcile(items, { sourceSucceeded: true });
  return {
    status: 'succeeded',
    counters: { ...counters, runIndex },
    definitions: [{ definitionId: definition.id, ownerId: definition.userId, outcome: 'ok', message: null }],
    events,
    errors: [],
  };
}

export const echoScannerType: ScannerType<EchoConfig, EchoItem> = {
  type: 'echo',
  label: 'Echo (testni)',
  icon: 'layers-outline',
  description: 'Testni tip z izmišljenimi rezultati: prvi zagon jih doda, tretji enega poceni, četrti enega umakne.',
  execution: 'single',
  results: 'generic',
  allowedResultHosts: [ECHO_HOST],
  isEnabled: (env: Env) => env.SCANNER_ECHO_ENABLED && env.NODE_ENV !== 'production',
  configSchema: echoConfigSchema,
  validateConfig: (config) => (config.label.trim().length === 0 ? 'Oznaka ne sme biti prazna.' : null),
  describeConfig: (config) => `${config.items} ${config.items === 1 ? 'rezultat' : config.items === 2 ? 'rezultata' : 'rezultatov'}, oznaka ${config.label}`,
  execute: executeEcho,
  notifications: echoNotificationHooks,
};
