import { describe, expect, it } from 'vitest';
import {
  capabilitiesFor,
  denyReason,
  describeDeny,
  RECIPE_CAPABILITIES,
  roleFor,
  rolesWith,
  type MemberRole,
  type RecipeCapability,
  type RecipeRole,
} from '../../src/modules/recipes/domain/capabilities.js';

// 013, FR-030 do FR-035. Matrika pravic je čista funkcija, zato je TU pokrita izčrpno — vse vloge
// krat vse zmožnosti — in v pogodbenih testih samo toliko, da se vidi, da jo usmerjevalnik res
// uporablja.
//
// Ta test obstaja, ker je raztresen pogoj `if (role === 'edit')` po dvajsetih poteh natanko tisto,
// česar ni mogoče preveriti: en pozabljen pogoj je tiha luknja v deljenju.

const OWNER: RecipeRole = 'owner';

describe('roleFor', () => {
  it('lastnik je lastnik, tudi če bi bil pomotoma tudi med soudeleženci', () => {
    // Pisanja tega stanja ne dovolijo (FR-037), a če bi do njega kdaj prišlo, LASTNIŠTVO NE SME
    // biti znižano na stopnjo soudeleženca — sicer bi napačen zapis lastniku vzel njegov recept.
    const recipe = { ownerId: 'u1', members: [{ userId: 'u1', role: 'view' as MemberRole }] };
    expect(roleFor(recipe, 'u1')).toBe('owner');
  });

  it('soudeleženec dobi svojo stopnjo', () => {
    const recipe = { ownerId: 'u1', members: [{ userId: 'u2', role: 'edit' as MemberRole }] };
    expect(roleFor(recipe, 'u2')).toBe('edit');
  });

  it('tujec nima vloge', () => {
    const recipe = { ownerId: 'u1', members: [{ userId: 'u2', role: 'edit' as MemberRole }] };
    expect(roleFor(recipe, 'u3')).toBeNull();
  });
});

describe('denyReason — matrika vlog krat zmožnosti', () => {
  /** Pričakovana matrika je zapisana IZČRPNO in ne izračunana iz iste tabele, ki jo preverja:
   * izračun bi preveril le, da je koda skladna sama s sabo. */
  const EXPECTED: Record<RecipeRole, Record<RecipeCapability, boolean>> = {
    owner: {
      readRecipe: true,
      editRecipe: true,
      manageImages: true,
      markCooked: true,
      rateRecipe: true,
      deleteRecipe: true,
      manageSharing: true,
      managePublicLink: true,
      // Lastnik svojega recepta NE more zapustiti — lahko ga samo izbriše (FR-032).
      leaveRecipe: false,
    },
    edit: {
      readRecipe: true,
      editRecipe: true,
      manageImages: true,
      markCooked: true,
      // Ocena je lastnikova (FR-035): soudeleženec z urejanjem sme popraviti sestavino, ne pa
      // oceniti tujega recepta.
      rateRecipe: false,
      deleteRecipe: false,
      manageSharing: false,
      managePublicLink: false,
      leaveRecipe: true,
    },
    view: {
      readRecipe: true,
      // Bralec ne sme spremeniti NIČESAR, vključno z oznako "skuhano" in slikami (FR-033).
      editRecipe: false,
      manageImages: false,
      markCooked: false,
      rateRecipe: false,
      deleteRecipe: false,
      manageSharing: false,
      managePublicLink: false,
      leaveRecipe: true,
    },
  };

  for (const role of ['owner', 'edit', 'view'] as RecipeRole[]) {
    for (const capability of RECIPE_CAPABILITIES) {
      const allowed = EXPECTED[role][capability];
      it(`${role} ${allowed ? 'sme' : 'ne sme'} ${capability}`, () => {
        expect(denyReason(role, capability) === null).toBe(allowed);
      });
    }
  }
});

describe('capabilitiesFor', () => {
  it('vrne vsako zmožnost — vmesnik ne sme nobene ugibati (FR-064, SC-007)', () => {
    const caps = capabilitiesFor('view');
    for (const capability of RECIPE_CAPABILITIES) {
      expect(caps).toHaveProperty(capability);
      expect(typeof caps[capability]).toBe('boolean');
    }
  });

  it('se ujema z denyReason za vse vloge — dva vira resnice bi se razšla', () => {
    for (const role of [OWNER, 'edit', 'view'] as RecipeRole[]) {
      const caps = capabilitiesFor(role);
      for (const capability of RECIPE_CAPABILITIES) {
        expect(caps[capability]).toBe(denyReason(role, capability) === null);
      }
    }
  });
});

describe('rolesWith', () => {
  it('izhaja iz iste tabele kot denyReason', () => {
    for (const capability of RECIPE_CAPABILITIES) {
      for (const role of ['view', 'edit'] as MemberRole[]) {
        expect(rolesWith(capability).includes(role)).toBe(denyReason(role, capability) === null);
      }
    }
  });

  it('vrne KOPIJO — klicatelj ne sme spremeniti tabele pravic', () => {
    const roles = rolesWith('editRecipe');
    roles.push('view');
    expect(rolesWith('editRecipe')).toEqual(['edit']);
  });
});

describe('describeDeny', () => {
  it('ima besedilo za vsako zmožnost in nobeno ni prazno', () => {
    for (const capability of RECIPE_CAPABILITIES) {
      expect(describeDeny(capability).length).toBeGreaterThan(0);
    }
  });

  it('pove, KAJ narediti ali koga vprašati — ne ponovi statusne kode (člen VI)', () => {
    expect(describeDeny('editRecipe')).toContain('prosi lastnika');
    expect(describeDeny('deleteRecipe')).toContain('zapustiš');
    for (const capability of RECIPE_CAPABILITIES) {
      expect(describeDeny(capability)).not.toMatch(/40[0-9]|Forbidden|error/i);
    }
  });
});
