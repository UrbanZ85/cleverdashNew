import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { UserModel } from '../../../src/modules/auth/models/user.model.js';
import { resetFakeProviderForTests } from '../../../src/modules/flight-deals/providers/fake.provider.js';
import { seedRule } from '../../contract/flight-deals/_helpers.js';
import { runOnce } from './_run.js';
import { ScannerNotificationModel as NotificationModel } from '../../../src/platform/scanner/models/scanner-notification.model.js';

// 016, SC-002: REGRESIJSKI POSNETEK dopisov modula Leti. Nastal je PRED refaktoringom v skupno
// jedro skenerjev in je bil zelen nad kodo 015 (commit b57211e). Pričakovanja so zapisana
// DOBESEDNO — niso izpeljana iz kode, ampak iz scenarija testnega vira (providers/fake.provider.ts):
//
//   zagon 1: LJU→STN 120 € (NOVO), LJU→BGY 60 € (NOVO); let ob 14:30 ne ustreza "po 15:00"
//   zagon 2: STN 89 € (POCENITEV, prej 120), BGY nespremenjeno → ena postavka
//   zagon 3: STN 110 € (PODRAŽITEV, prej 89), BGY izgine (NEDOSEGLJIVO, brez postavke) → ena postavka
//
// Dopisi se NE pošiljajo (`processOutbox: false`): preverja se, kar zagon sestavi v outbox, za
// lastnika IN za prejemnika. Po refaktoringu se sme spremeniti samo `itemView` spodaj (oblika
// postavke v generičnem outboxu) in uvozi — pričakovanja ostanejo.

beforeAll(async () => {
  setTestEnv({ FLIGHT_FAKE_PROVIDER_ENABLED: 'true' });
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  resetFakeProviderForTests();
  await clearTestDb();
});

async function user(name: string) {
  return UserModel.create({ keycloakSubject: `kc-${name}`, email: `${name}@example.com`, displayName: `Oseba ${name}`, lastLoginAt: new Date() });
}

interface ItemView {
  changeType: string;
  amount: number;
  previousAmount: number | null;
  ruleName: string;
  ruleOwnerName: string | null;
}

/** Oblika postavke, neodvisna od modela: po refaktoringu se spremeni SAMO ta preslikava. */
function itemView(item: {
  changeType: string;
  definitionName: string;
  ownerName: string | null;
  payload: unknown;
}): ItemView {
  // 016: postavka generičnega outboxa — iskanje je `definitionName`, cena je v `payload` tipa.
  const payload = item.payload as { price: { amount: number }; previousPrice: { amount: number } | null };
  return {
    changeType: item.changeType,
    amount: payload.price.amount,
    previousAmount: payload.previousPrice?.amount ?? null,
    ruleName: item.definitionName,
    ruleOwnerName: item.ownerName,
  };
}

async function itemsFor(recipientId: Types.ObjectId, runId: Types.ObjectId): Promise<ItemView[]> {
  const n = await NotificationModel.findOne({ recipientUserId: recipientId, runId }).lean();
  if (!n) return [];
  return n.items.map((i) => itemView(i as Parameters<typeof itemView>[0])).sort((a, b) => a.amount - b.amount);
}

describe('regresijski posnetek dopisov letov (016, SC-002)', () => {
  it('trije zagoni s testnim virom dajo natanko te postavke za lastnika in prejemnika', async () => {
    const ana = await user('ana');
    const bor = await user('bor');
    await seedRule(String(ana._id), { passengers: { adults: 1, childrenAges: [] } }, [{ userId: String(bor._id), notify: true }]);
    const t0 = Date.now();

    const first = await runOnce(new Date(t0));
    expect(first.run?.status).toBe('succeeded');
    expect(await NotificationModel.countDocuments({ runId: first.runId })).toBe(2);
    expect(await itemsFor(ana._id, first.runId)).toEqual([
      { changeType: 'NEW', amount: 60, previousAmount: null, ruleName: 'Testni vikend', ruleOwnerName: null },
      { changeType: 'NEW', amount: 120, previousAmount: null, ruleName: 'Testni vikend', ruleOwnerName: null },
    ]);
    expect(await itemsFor(bor._id, first.runId)).toEqual([
      { changeType: 'NEW', amount: 60, previousAmount: null, ruleName: 'Testni vikend', ruleOwnerName: 'Oseba ana' },
      { changeType: 'NEW', amount: 120, previousAmount: null, ruleName: 'Testni vikend', ruleOwnerName: 'Oseba ana' },
    ]);

    const second = await runOnce(new Date(t0 + 60_000));
    expect(second.run?.status).toBe('succeeded');
    expect(await NotificationModel.countDocuments({ runId: second.runId })).toBe(2);
    expect(await itemsFor(ana._id, second.runId)).toEqual([
      { changeType: 'PRICE_DOWN', amount: 89, previousAmount: 120, ruleName: 'Testni vikend', ruleOwnerName: null },
    ]);
    expect(await itemsFor(bor._id, second.runId)).toEqual([
      { changeType: 'PRICE_DOWN', amount: 89, previousAmount: 120, ruleName: 'Testni vikend', ruleOwnerName: 'Oseba ana' },
    ]);

    const third = await runOnce(new Date(t0 + 120_000));
    expect(third.run?.status).toBe('succeeded');
    expect(await NotificationModel.countDocuments({ runId: third.runId })).toBe(2);
    expect(await itemsFor(ana._id, third.runId)).toEqual([
      { changeType: 'PRICE_UP', amount: 110, previousAmount: 89, ruleName: 'Testni vikend', ruleOwnerName: null },
    ]);

    // Četrti zagon: nič novega → nobenega dopisa.
    const fourth = await runOnce(new Date(t0 + 180_000));
    expect(fourth.run?.status).toBe('succeeded');
    expect(await NotificationModel.countDocuments({ runId: fourth.runId })).toBe(0);
    expect(await NotificationModel.countDocuments()).toBe(6);
  });
});
