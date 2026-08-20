import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { SettingsModel } from '../../src/modules/settings/model.js';
import { resolveTabs } from '../../src/platform/tabs/resolver.js';

// research.md §9: prekritje za neobstoječ id se ignorira; koda pove, kaj obstaja, baza
// pove, kaj je vklopljeno. Register vsebuje "dashboard" (order 0) in "settings" (order 10).

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('resolveTabs', () => {
  it('brez nastavitev vrne privzeto stanje iz registra, urejeno po order', async () => {
    const tabs = await resolveTabs([]);
    expect(tabs.map((t) => t.id)).toEqual(['dashboard', 'settings']);
  });

  it('prekritje enabled:false izklopi samo ta zavihek', async () => {
    await SettingsModel.create({ _id: 'singleton', tabs: { dashboard: { enabled: false } } });
    const tabs = await resolveTabs([]);
    expect(tabs.map((t) => t.id)).toEqual(['settings']);
  });

  it('prekritje order spremeni vrstni red', async () => {
    await SettingsModel.create({ _id: 'singleton', tabs: { dashboard: { order: 99 } } });
    const tabs = await resolveTabs([]);
    expect(tabs[0]?.id).toBe('settings'); // dashboard je zdaj zadnji (order 99)
    expect(tabs.at(-1)?.id).toBe('dashboard');
  });

  it('prekritje za neobstoječ id v registru se tiho ignorira', async () => {
    await SettingsModel.create({
      _id: 'singleton',
      tabs: { 'zavihek-ki-ne-obstaja': { enabled: true, order: -5 } },
    });
    const tabs = await resolveTabs([]);
    expect(tabs.map((t) => t.id)).toEqual(['dashboard', 'settings']);
  });

  it('rezultat ne razkriva internega polja "enabled"', async () => {
    const tabs = await resolveTabs([]);
    for (const tab of tabs) expect(tab).not.toHaveProperty('enabled');
  });
});
