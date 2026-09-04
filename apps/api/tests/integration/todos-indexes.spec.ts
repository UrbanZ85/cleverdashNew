import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { TodoListModel } from '../../src/modules/todos/models/todo-list.model.js';
import { buildVisibleListsFilter } from '../../src/modules/todos/domain/visibility.js';

// data-model.md §Indeksi.
//
// Zakaj to ni samo preverjanje, da sta indeksa deklarirana: poizvedba "moji seznami" je `$or`
// nad lastništvom in članstvom, MongoDB pa za `$or` izbira načrt PO VSAKI VEJI LOČENO. Če bi
// katera veja ostala brez indeksa, bi delovala pravilno in bila samo počasna — z rastjo
// zbirke bi se to pokazalo kot nerazložljiva počasnost menija in ploščice, ne kot napaka.
//
// Preverja se tudi, da razvrstitev NI blokirna: `updatedAt: -1` mora biti zadnji člen obeh
// indeksov, sicer Mongo uredi v pomnilniku in `.limit(1)` ploščice ne prihrani ničesar.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
  await TodoListModel.syncIndexes();
});
afterAll(stopTestDb);

const USER = '507f1f77bcf86cd799439011';

describe('Indeksi zbirke todoLists', () => {
  it('obstajata oba pričakovana indeksa, z updatedAt na KONCU', async () => {
    const indexes = await TodoListModel.collection.indexes();
    const keys = indexes.map((i) => JSON.stringify(i.key));

    expect(keys).toContain(JSON.stringify({ ownerId: 1, updatedAt: -1 }));
    expect(keys).toContain(JSON.stringify({ 'members.userId': 1, updatedAt: -1 }));
  });

  it('poizvedba po LASTNIŠTVU uporabi indeks in ne pregleda zbirke', async () => {
    const plan = await TodoListModel.find({ ownerId: USER })
      .sort({ updatedAt: -1 })
      .explain('queryPlanner');

    const stage = JSON.stringify((plan as { queryPlanner?: unknown }).queryPlanner);
    expect(stage).toContain('IXSCAN');
    expect(stage).not.toContain('COLLSCAN');
  });

  it('poizvedba po ČLANSTVU uporabi večključni indeks', async () => {
    const plan = await TodoListModel.find({ 'members.userId': USER })
      .sort({ updatedAt: -1 })
      .explain('queryPlanner');

    const stage = JSON.stringify((plan as { queryPlanner?: unknown }).queryPlanner);
    expect(stage).toContain('IXSCAN');
    expect(stage).not.toContain('COLLSCAN');
  });

  it('poizvedba "moji seznami" ($or) NE sortira v pomnilniku', async () => {
    const plan = await TodoListModel.find(buildVisibleListsFilter(USER))
      .sort({ updatedAt: -1 })
      .limit(1)
      .explain('queryPlanner');

    const stage = JSON.stringify((plan as { queryPlanner?: unknown }).queryPlanner);
    // Blokirno sortiranje bi pomenilo, da mora Mongo prebrati VSE zadetke, preden vrne prvega —
    // `.limit(1)` ploščice bi bil zaman.
    expect(stage).not.toContain('SORT_KEY_GENERATOR');
    expect(stage).not.toContain('COLLSCAN');
  });
});
