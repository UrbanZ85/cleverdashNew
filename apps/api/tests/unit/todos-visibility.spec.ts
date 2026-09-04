import { describe, expect, it } from 'vitest';
import { buildVisibleListsFilter } from '../../src/modules/todos/domain/visibility.js';

// FR-004, FR-005. Ta test je videti trivialen in ni: varuje pred izpustom ČLANSKE veje.
//
// Izpust te veje ne bi povzročil nobene napake in nobenega zapisa v dnevniku — deljeni
// seznami bi preprosto izginili iz izpisa, kar bi bilo videti kot "deljenje ne dela" in bi se
// iskalo v čisto napačnem delu kode. Test pade takoj, ko veja izpade.

describe('buildVisibleListsFilter', () => {
  const userId = '507f1f77bcf86cd799439011';

  it('vsebuje OBE veji: lastništvo in članstvo', () => {
    const filter = buildVisibleListsFilter(userId);
    expect(filter.$or).toHaveLength(2);
    expect(filter.$or).toContainEqual({ ownerId: userId });
    expect(filter.$or).toContainEqual({ 'members.userId': userId });
  });

  it('članska veja poizveduje po members.userId — indeks je postavljen prav na to pot', () => {
    // Vrstni red polj v indeksu (data-model.md) sledi natanko tej poti. Sprememba imena polja
    // brez spremembe indeksa bi pomenila pregled cele zbirke, ne napake.
    const filter = buildVisibleListsFilter(userId);
    expect(Object.keys(filter.$or[1])).toEqual(['members.userId']);
  });

  it('ne vsebuje ničesar drugega — noben dodaten pogoj ne sme tiho zožiti izpisa', () => {
    expect(Object.keys(buildVisibleListsFilter(userId))).toEqual(['$or']);
  });

  it('dva različna uporabnika dasta različna filtra', () => {
    const drug = '507f1f77bcf86cd799439012';
    expect(buildVisibleListsFilter(userId)).not.toEqual(buildVisibleListsFilter(drug));
  });
});
