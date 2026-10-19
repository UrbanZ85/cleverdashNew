import type { Express } from 'express';
import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { z } from 'zod';
import { ApiKeyModel } from '../../../src/platform/apikeys/model.js';
import { ScannerDefinitionModel } from '../../../src/platform/scanner/models/scanner-definition.model.js';
import { registerScannerType } from '../../../src/platform/scanner/registry.js';
import type { ExecutionContext, ExecutionOutcome, ScannerType } from '../../../src/platform/scanner/types.js';
import { fakeKeycloakForTests } from '../../setup/keycloak-global.js';
import { loginAsTestUser } from '../../setup/login-as-test-user.js';

// Skupni pomožniki za pogodbene teste jedra skenerjev (016) proti
// specs/016-scanner-engine/contracts/openapi.yaml — po vzoru tests/contract/flight-deals/_helpers.ts.
// Mock tipi se registrirajo PO `createApp()` (ta registrira lete) in ne prihajajo iz nobenega modula.

export interface TestUser {
  token: string;
  userId: string;
}

export async function loginAs(app: Express, key: string): Promise<TestUser> {
  const { accessToken, userId } = await loginAsTestUser(app, fakeKeycloakForTests, {
    sub: `kc-sub-sc-${key}`,
    email: `${key}@example.com`,
    name: `Uporabnik ${key.toUpperCase()}`,
    roles: ['cleverdash-user'],
  });
  return { token: accessToken, userId };
}

export async function loginAsAdmin(app: Express, key = 'admin'): Promise<TestUser> {
  const { accessToken, userId } = await loginAsTestUser(app, fakeKeycloakForTests, {
    sub: `kc-sub-sc-${key}`,
    email: `${key}@example.com`,
    name: 'Administrator Skenerjev',
    roles: ['cleverdash-admin'],
  });
  return { token: accessToken, userId };
}

export async function seedApiKey(scopes: string[], ownerId: string | null = null, secret = `seed-sc-${scopes.join('-')}`): Promise<string> {
  await ApiKeyModel.create({
    label: `seed-${scopes.join(',')}`,
    keyHash: createHash('sha256').update(secret).digest('hex'),
    keyPrefix: secret.slice(0, 8),
    scopes,
    ownerId: ownerId ? new Types.ObjectId(ownerId) : null,
  });
  return secret;
}

export const AUTH = (token: string) => ({ Authorization: `Bearer ${token}` });

export interface MockConfig {
  n: number;
}

export interface MockHandle {
  type: ScannerType<MockConfig, unknown>;
  behaviour: { execute: (ctx: ExecutionContext<MockConfig>) => Promise<ExecutionOutcome> };
}

export function okOutcome(partial: Partial<ExecutionOutcome> = {}): ExecutionOutcome {
  return { status: 'succeeded', counters: {}, definitions: [], events: [], errors: [], ...partial };
}

/** Registrira mock tip; `scopes` neobvezno (privzeto skupna `scanners:*`). */
export function registerMockType(name: string, execution: 'batch' | 'single', options: { enabled?: boolean; scopes?: { read: string; write: string } } = {}): MockHandle {
  const handle: MockHandle = {
    behaviour: { execute: async () => okOutcome() },
    type: {
      type: name,
      label: `Tip ${name}`,
      icon: 'layers-outline',
      description: 'Testni tip pogodbe.',
      execution,
      results: 'generic',
      ...(options.scopes ? { scopes: options.scopes } : {}),
      isEnabled: () => options.enabled ?? true,
      configSchema: z.object({ n: z.number().int().min(1).max(20) }),
      validateConfig: (c) => (c.n === 13 ? 'Trinajst ni dovoljeno.' : null),
      describeConfig: (c) => `${c.n} rezultatov`,
      execute: (ctx) => handle.behaviour.execute(ctx),
      notifications: {
        verify: async (items) => items,
        render: (items) => ({ subject: `Mock ${items.length}`, html: '<p>x</p>', text: 'x' }),
      },
    },
  };
  registerScannerType(handle.type);
  return handle;
}

export async function seedDefinition(userId: string, type: string, overrides: Record<string, unknown> = {}) {
  return ScannerDefinitionModel.create({
    userId: new Types.ObjectId(userId),
    name: `Skener ${type}`,
    type,
    enabled: true,
    schedule: { mode: 'own', preset: 'hourly', cronExpression: '0 * * * *', timezone: 'Europe/Ljubljana', lastScheduledSlotAt: null },
    notifications: { enabled: true, mode: 'all-changes' },
    config: { n: 3 },
    ...overrides,
  });
}
