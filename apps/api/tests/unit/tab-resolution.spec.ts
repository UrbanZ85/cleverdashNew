import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { SettingsModel } from '../../src/modules/settings/model.js';
import { resolveTabs } from '../../src/platform/tabs/resolver.js';

// research.md §9: prekritje za neobstoječ id se ignorira; koda pove, kaj obstaja, baza
// pove, kaj je vklopljeno. Register vsebuje "dashboard" (order 0), "notes" (order 3, dodano
// v 007), "todos" (order 4, dodano v 010), "time-tracking" (order 5, dodano v 002), "timesheet" (order 6, dodano v 006),
// "cameras" (order 7, dodano v 003) in "settings" (order 10). Testi, ki preverjajo mehaniko
// prekritja (ne dejansko vsebino registra), vse module izklopijo prek nastavitev, da ostanejo
// osredotočeni na par dashboard/settings.
//
// 004: `Settings` ni več singleton (`_id: 'singleton'`) — ena vrstica na uporabnika,
// glej data-model.md. Testi tu uporabljajo fiksen testni `userId`.

const USER_ID = '507f1f77bcf86cd799439011';

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('resolveTabs', () => {
  it('brez nastavitev vrne privzeto stanje iz registra, urejeno po order', async () => {
    const tabs = await resolveTabs([], USER_ID);
    expect(tabs.map((t) => t.id)).toEqual([
      'dashboard',
      'notes',
      'todos',
      'time-tracking',
      'timesheet',
      'cameras',
      'settings',
    ]);
  });

  it('brez userId (API ključ) vrne privzeto stanje iz registra, brez osebnih prekritij', async () => {
    await SettingsModel.create({
      userId: USER_ID,
      tabs: { dashboard: { enabled: false } },
    });
    const tabs = await resolveTabs([], null);
    expect(tabs.map((t) => t.id)).toEqual([
      'dashboard',
      'notes',
      'todos',
      'time-tracking',
      'timesheet',
      'cameras',
      'settings',
    ]);
  });

  it('prekritje enabled:false izklopi samo ta zavihek', async () => {
    await SettingsModel.create({
      userId: USER_ID,
      tabs: {
        dashboard: { enabled: false },
        notes: { enabled: false },
        todos: { enabled: false },
        'time-tracking': { enabled: false },
        timesheet: { enabled: false },
        cameras: { enabled: false },
      },
    });
    const tabs = await resolveTabs([], USER_ID);
    expect(tabs.map((t) => t.id)).toEqual(['settings']);
  });

  it('prekritje order spremeni vrstni red', async () => {
    await SettingsModel.create({
      userId: USER_ID,
      tabs: {
        dashboard: { order: 99 },
        notes: { enabled: false },
        todos: { enabled: false },
        'time-tracking': { enabled: false },
        timesheet: { enabled: false },
        cameras: { enabled: false },
      },
    });
    const tabs = await resolveTabs([], USER_ID);
    expect(tabs[0]?.id).toBe('settings'); // dashboard je zdaj zadnji (order 99)
    expect(tabs.at(-1)?.id).toBe('dashboard');
  });

  it('prekritje za neobstoječ id v registru se tiho ignorira', async () => {
    await SettingsModel.create({
      userId: USER_ID,
      tabs: {
        'zavihek-ki-ne-obstaja': { enabled: true, order: -5 },
        notes: { enabled: false },
        todos: { enabled: false },
        'time-tracking': { enabled: false },
        timesheet: { enabled: false },
        cameras: { enabled: false },
      },
    });
    const tabs = await resolveTabs([], USER_ID);
    expect(tabs.map((t) => t.id)).toEqual(['dashboard', 'settings']);
  });

  it('rezultat ne razkriva internega polja "enabled"', async () => {
    const tabs = await resolveTabs([], USER_ID);
    for (const tab of tabs) expect(tab).not.toHaveProperty('enabled');
  });

  it('dva uporabnika imata neodvisna prekritja (SC-002)', async () => {
    const otherUserId = '507f1f77bcf86cd799439012';
    await SettingsModel.create({ userId: USER_ID, tabs: { dashboard: { enabled: false } } });
    await SettingsModel.create({ userId: otherUserId, tabs: {} });

    const mine = await resolveTabs([], USER_ID);
    const other = await resolveTabs([], otherUserId);
    expect(mine.map((t) => t.id)).not.toContain('dashboard');
    expect(other.map((t) => t.id)).toContain('dashboard');
  });
});
