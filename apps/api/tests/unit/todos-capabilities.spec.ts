import { describe, expect, it } from 'vitest';
import {
  MEMBER_ROLES,
  TODO_CAPABILITIES,
  capabilitiesFor,
  denyReason,
  describeDeny,
  requiredCapabilityFor,
  roleFor,
  rolesWith,
  type TodoCapability,
  type TodoRole,
} from '../../src/modules/todos/domain/capabilities.js';

// SC-005: "vsaka od treh stopenj sme natanko svoja dejanja in nič več, preverjeno za vse
// kombinacije stopnja × dejanje × zaklenjenost". Ta datoteka je ta dokaz.
//
// Matrika je zapisana IZRECNO in ne izpeljana iz iste tabele, ki jo preverja: izpeljan
// pričakovani rezultat bi se z izvedbo zmotil enako in test bi ostal zelen. Kdor spremeni
// pravice, mora spremeniti obe mesti — in prav to je namen.

type Expectations = Record<TodoCapability, boolean>;

const ALL_FALSE: Expectations = {
  readList: false,
  toggleTask: false,
  writeTasks: false,
  reorderTasks: false,
  clearCompleted: false,
  renameList: false,
  deleteList: false,
  manageSharing: false,
  toggleLock: false,
  leaveList: false,
};

/** Lastnik: vse razen odhoda s svojega seznama — tega mu ne odvzame ključavnica, ampak
 * lastništvo samo (FR-047). Zaklep nanj ne vpliva (FR-062). */
const OWNER: Expectations = {
  readList: true,
  toggleTask: true,
  writeTasks: true,
  reorderTasks: true,
  clearCompleted: true,
  renameList: true,
  deleteList: true,
  manageSharing: true,
  toggleLock: true,
  leaveList: false,
};

const EDIT_UNLOCKED: Expectations = {
  ...ALL_FALSE,
  readList: true,
  toggleTask: true,
  writeTasks: true,
  reorderTasks: true,
  clearCompleted: true,
  leaveList: true,
};

const CHECK_UNLOCKED: Expectations = {
  ...ALL_FALSE,
  readList: true,
  toggleTask: true,
  leaveList: true,
};

const VIEW_UNLOCKED: Expectations = {
  ...ALL_FALSE,
  readList: true,
  leaveList: true,
};

/** Zaklenjeno: soudeležencu ostaneta samo branje in odhod (FR-061). */
const MEMBER_LOCKED: Expectations = {
  ...ALL_FALSE,
  readList: true,
  leaveList: true,
};

const MATRIX: { role: TodoRole; locked: boolean; expected: Expectations }[] = [
  { role: 'owner', locked: false, expected: OWNER },
  { role: 'owner', locked: true, expected: OWNER },
  { role: 'edit', locked: false, expected: EDIT_UNLOCKED },
  { role: 'edit', locked: true, expected: MEMBER_LOCKED },
  { role: 'check', locked: false, expected: CHECK_UNLOCKED },
  { role: 'check', locked: true, expected: MEMBER_LOCKED },
  { role: 'view', locked: false, expected: VIEW_UNLOCKED },
  { role: 'view', locked: true, expected: MEMBER_LOCKED },
];

describe('capabilitiesFor — izčrpna matrika 4 vloge × 10 zmožnosti × zaklenjenost (SC-005)', () => {
  for (const { role, locked, expected } of MATRIX) {
    for (const capability of TODO_CAPABILITIES) {
      const label = `${role}${locked ? ' (zaklenjen)' : ''} → ${capability}`;
      it(`${label} = ${expected[capability]}`, () => {
        expect(capabilitiesFor(role, locked)[capability]).toBe(expected[capability]);
      });
    }
  }

  it('pokriva vse vloge in vse zmožnosti — matrika ne sme zaostati za kodo', () => {
    const covered = new Set(MATRIX.map((m) => m.role));
    for (const role of [...MEMBER_ROLES, 'owner']) expect(covered).toContain(role);
    expect(Object.keys(ALL_FALSE).sort()).toEqual([...TODO_CAPABILITIES].sort());
  });
});

describe('denyReason — razlog, ne samo prepoved', () => {
  it('lastnik sme pisati tudi po ZAKLENJENEM seznamu (FR-062)', () => {
    expect(denyReason('owner', true, 'writeTasks')).toBeNull();
    expect(denyReason('owner', true, 'toggleTask')).toBeNull();
    expect(denyReason('owner', true, 'deleteList')).toBeNull();
  });

  it('član s pravico urejanja na zaklenjenem seznamu dobi razlog "locked" (→ 409)', () => {
    expect(denyReason('edit', true, 'writeTasks')).toBe('locked');
    expect(denyReason('check', true, 'toggleTask')).toBe('locked');
  });

  it('član brez pravice dobi razlog "role" (→ 403), tudi kadar je seznam zaklenjen', () => {
    // Vrstni red preverjanj: vloga PRED ključavnico. Odklep temu človeku ne bi nič pomagal,
    // zato ga sporočilo o ključavnici ne sme poslati prosit za napačno stvar.
    expect(denyReason('view', false, 'toggleTask')).toBe('role');
    expect(denyReason('view', true, 'toggleTask')).toBe('role');
    expect(denyReason('check', true, 'writeTasks')).toBe('role');
  });

  it('odhod s seznama je dovoljen tudi ob zaklepu (FR-047)', () => {
    expect(denyReason('view', true, 'leaveList')).toBeNull();
    expect(denyReason('edit', true, 'leaveList')).toBeNull();
  });

  it('lastnik svojega seznama ne more zapustiti — lahko ga samo izbriše', () => {
    expect(denyReason('owner', false, 'leaveList')).toBe('role');
  });

  it('branje ni sprememba: zaklep ga ne omeji nobeni stopnji', () => {
    for (const role of MEMBER_ROLES) expect(denyReason(role, true, 'readList')).toBeNull();
  });
});

describe('roleFor', () => {
  const owner = '507f1f77bcf86cd799439011';
  const member = '507f1f77bcf86cd799439012';
  const stranger = '507f1f77bcf86cd799439013';

  it('lastnik je "owner"', () => {
    expect(roleFor({ ownerId: owner, members: [] }, owner)).toBe('owner');
  });

  it('soudeleženec dobi svojo stopnjo', () => {
    const list = { ownerId: owner, members: [{ userId: member, role: 'check' as const }] };
    expect(roleFor(list, member)).toBe('check');
  });

  it('tujec dobi null', () => {
    expect(roleFor({ ownerId: owner, members: [] }, stranger)).toBeNull();
  });

  it('lastnik ostane "owner", tudi če se je po pomoti znašel med soudeleženci', () => {
    // Pisanja tega ne dovolijo, a če bi se zgodilo, ga zapis med člani NE SME znižati.
    const list = { ownerId: owner, members: [{ userId: owner, role: 'view' as const }] };
    expect(roleFor(list, owner)).toBe('owner');
  });

  it('primerja po nizu, ne po referenci — ObjectId iz baze ni string', () => {
    const asObject = { toString: () => owner };
    expect(roleFor({ ownerId: asObject, members: [] }, owner)).toBe('owner');
  });
});

describe('requiredCapabilityFor — edini razlog, da stopnja "check" obstaja', () => {
  it('samo done zahteva toggleTask', () => {
    expect(requiredCapabilityFor({ done: true })).toBe('toggleTask');
    expect(requiredCapabilityFor({ done: false })).toBe('toggleTask');
  });

  it('title ali dueDate zahtevata writeTasks', () => {
    expect(requiredCapabilityFor({ title: 'Mleko' })).toBe('writeTasks');
    expect(requiredCapabilityFor({ dueDate: null })).toBe('writeTasks');
  });

  it('telo z obojim zahteva VIŠJO od potrebnih', () => {
    expect(requiredCapabilityFor({ done: true, title: 'Mleko' })).toBe('writeTasks');
  });

  it('prazno telo pade na najstrožjo zmožnost, ne na najmilejšo', () => {
    expect(requiredCapabilityFor({})).toBe('writeTasks');
  });
});

describe('rolesWith — filter zapisa in razsodnik ne smeta razhajati', () => {
  it('vrne iste stopnje, kot jih dovoli denyReason pri odklenjenem seznamu', () => {
    for (const capability of TODO_CAPABILITIES) {
      const fromTable = rolesWith(capability);
      const fromReason = MEMBER_ROLES.filter((r) => denyReason(r, false, capability) === null);
      expect(fromTable.sort(), `zmožnost ${capability}`).toEqual([...fromReason].sort());
    }
  });

  it('vrne kopijo — klicatelj ne sme spremeniti notranje tabele', () => {
    const first = rolesWith('writeTasks');
    first.push('view');
    expect(rolesWith('writeTasks')).not.toContain('view');
  });
});

describe('describeDeny', () => {
  it('pri ključavnici pove, da je seznam zaklenil lastnik — ne "nimaš pravice"', () => {
    const text = describeDeny('locked', 'edit', 'writeTasks');
    expect(text).toContain('zaklenil');
    expect(text).not.toContain('pravic');
  });

  it('stopnji "check" pove, česa natanko ne sme — ne samo, da ne sme', () => {
    expect(describeDeny('role', 'check', 'writeTasks')).toContain('odkljukaš');
  });

  it('vsaka zmožnost ima neprazno slovensko besedilo', () => {
    for (const capability of TODO_CAPABILITIES) {
      expect(describeDeny('role', 'view', capability).length).toBeGreaterThan(10);
    }
  });
});
