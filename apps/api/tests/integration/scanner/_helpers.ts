import { Types } from 'mongoose';
import { z } from 'zod';
import { UserModel } from '../../../src/modules/auth/models/user.model.js';
import { ScannerDefinitionModel } from '../../../src/platform/scanner/models/scanner-definition.model.js';
import { registerScannerType } from '../../../src/platform/scanner/registry.js';
import type { ExecutionContext, ExecutionOutcome, NotificationHooks, ScannerType } from '../../../src/platform/scanner/types.js';

// Pomožniki za teste jedra skenerjev (016). MOCK tipi NE prihajajo iz nobenega modula — dokaz, da
// jedro teče brez letov (SC-003). Vedenje `execute` je zamenljivo med testom (`behaviour`).

export interface MockConfig {
  n: number;
}

export interface MockTypeHandle {
  type: ScannerType<MockConfig, unknown>;
  /** Zamenjaj med testom: kaj naj `execute` vrne ali vrže. */
  behaviour: { execute: (ctx: ExecutionContext<MockConfig>) => Promise<ExecutionOutcome>; verify?: NotificationHooks['verify'] };
  calls: Array<{ runId: string; definitionId: string | null }>;
}

export function okOutcome(partial: Partial<ExecutionOutcome> = {}): ExecutionOutcome {
  return { status: 'succeeded', counters: {}, definitions: [], events: [], errors: [], ...partial };
}

export function mockType(name: string, execution: 'batch' | 'single', options: { enabled?: boolean } = {}): MockTypeHandle {
  const handle: MockTypeHandle = {
    calls: [],
    behaviour: { execute: async () => okOutcome() },
    type: {
      type: name,
      label: `Tip ${name}`,
      icon: 'layers-outline',
      description: 'Testni tip jedra.',
      execution,
      results: 'generic',
      allowedResultHosts: ['example.test'],
      isEnabled: () => options.enabled ?? true,
      configSchema: z.object({ n: z.number().int().min(0).max(100) }),
      validateConfig: (c) => (c.n === 13 ? 'Trinajst ni dovoljeno.' : null),
      defaultSchedule: { preset: 'daily-06-18', cronExpression: '0 6,18 * * *', timezone: 'Europe/Ljubljana' },
      execute: async (ctx) => {
        handle.calls.push({ runId: ctx.runId, definitionId: ctx.definition?.id ?? null });
        return handle.behaviour.execute(ctx);
      },
      notifications: {
        verify: async (items, recipient, now) => (handle.behaviour.verify ? handle.behaviour.verify(items, recipient, now) : items),
        render: (items) => ({
          subject: `Mock: ${items.length} sprememb`,
          html: `<ul>${items.map((i) => `<li>${JSON.stringify((i as { payload: unknown }).payload)}</li>`).join('')}</ul>`,
          text: items.map((i) => JSON.stringify((i as { payload: unknown }).payload)).join('\n'),
        }),
      },
    },
  };
  registerScannerType(handle.type);
  return handle;
}

export async function seedUser(name: string) {
  return UserModel.create({ keycloakSubject: `kc-${name}`, email: `${name}@example.com`, displayName: `Oseba ${name}`, lastLoginAt: new Date() });
}

export async function seedDefinition(
  userId: Types.ObjectId | string,
  type: string,
  overrides: Record<string, unknown> = {},
  schedule: { cronExpression?: string; timezone?: string; lastScheduledSlotAt?: Date | null } = {},
) {
  return ScannerDefinitionModel.create({
    userId: new Types.ObjectId(userId),
    name: `Skener ${type}`,
    type,
    enabled: true,
    schedule: {
      mode: 'own',
      preset: 'hourly',
      cronExpression: schedule.cronExpression ?? '0 * * * *',
      timezone: schedule.timezone ?? 'Europe/Ljubljana',
      lastScheduledSlotAt: schedule.lastScheduledSlotAt ?? null,
    },
    notifications: { enabled: true, mode: 'all-changes' },
    config: { n: 3 },
    ...overrides,
  });
}
