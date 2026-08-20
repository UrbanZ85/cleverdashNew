import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { SettingsModel } from '../../src/modules/settings/model.js';
import { resolveTabs } from '../../src/platform/tabs/resolver.js';

// research.md §9: prekritje za neobstoječ id se ignorira; koda pove, kaj obstaja, baza
// pove, kaj je vklopljeno.

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('resolveTabs', () => {
  it('brez nastavitev vrne privzeto stanje iz registra', async () => {
    const tabs = await resolveTabs([]);
    expect(tabs.map((t) => t.id)).toEqual(['dashboard']);
  });

  it('prekritje enabled:false izklopi zavihek', async () => {
    await SettingsModel.create({ _id: 'singleton', tabs: { dashboard: { enabled: false } } });
    const tabs = await resolveTabs([]);
    expect(tabs).toHaveLength(0);
  });

  it('prekritje order spremeni vrstni red', async () => {
    await SettingsModel.create({ _id: 'singleton', tabs: { dashboard: { order: 99 } } });
    const tabs = await resolveTabs([]);
    expect(tabs[0]?.order).toBe(99);
  });

  it('prekritje za neobstoječ id v registru se tiho ignorira', async () => {
    await SettingsModel.create({
      _id: 'singleton',
      tabs: { 'zavihek-ki-ne-obstaja': { enabled: true, order: -5 } },
    });
    const tabs = await resolveTabs([]);
    expect(tabs.map((t) => t.id)).toEqual(['dashboard']);
  });

  it('rezultat ne razkriva internega polja "enabled"', async () => {
    const tabs = await resolveTabs([]);
    expect(tabs[0]).not.toHaveProperty('enabled');
  });
});
