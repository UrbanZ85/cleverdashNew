import { describe, expect, it } from 'vitest';
import { MAX_TAB_SLOTS, isTabActive, tabSlots } from '../../src/app/shared/navigation/tab-slots.js';

// Spodnja vrstica zavihkov na telefonu. Preverja se brez TestBed, ker je razporeditev čista
// funkcija (glej tab-slots.ts) — komponenta iz nje samo bere.

const REGISTER = [
  { route: '/dashboard' },
  { route: '/notes' },
  { route: '/todos' },
  { route: '/time-tracking' },
  { route: '/timesheet' },
  { route: '/cameras' },
  { route: '/settings' },
];

describe('isTabActive', () => {
  it('ujame natanko pot zavihka', () => {
    expect(isTabActive('/notes', '/notes')).toBe(true);
  });

  it('ujame podstran zavihka', () => {
    expect(isTabActive('/time-tracking', '/time-tracking/schedule')).toBe(true);
  });

  it('NE ujame poti, ki se le začne z istim besedilom', () => {
    expect(isTabActive('/notes', '/notes-arhiv')).toBe(false);
  });

  it('prezre poizvedbo in odsek', () => {
    expect(isTabActive('/cameras', '/cameras?includeInactive=true')).toBe(true);
    expect(isTabActive('/cameras', '/cameras#zadnja')).toBe(true);
  });

  it('tuja pot ni dejavna', () => {
    expect(isTabActive('/notes', '/dashboard')).toBe(false);
  });
});

describe('tabSlots', () => {
  it('do MAX_TAB_SLOTS zavihkov gre vse v vrstico, brez gumba Več', () => {
    const tabs = REGISTER.slice(0, MAX_TAB_SLOTS);
    const slots = tabSlots(tabs, '/dashboard');
    expect(slots.visible).toEqual(tabs);
    expect(slots.overflow).toBe(false);
  });

  it('pri več zavihkih ostane zadnje mesto gumbu Več', () => {
    const slots = tabSlots(REGISTER, '/dashboard');
    expect(slots.overflow).toBe(true);
    expect(slots.visible).toHaveLength(MAX_TAB_SLOTS - 1);
    expect(slots.visible.map((t) => t.route)).toEqual(['/dashboard', '/notes', '/todos', '/time-tracking']);
  });

  it('zavihek, na katerem smo, je vedno viden — tudi če je po vrstnem redu zadaj', () => {
    const slots = tabSlots(REGISTER, '/settings');
    expect(slots.visible.map((t) => t.route)).toContain('/settings');
    // Izrine ZADNJEGA vidnega, ne prvega: nadzorna plošča ostane.
    expect(slots.visible.map((t) => t.route)).toEqual(['/dashboard', '/notes', '/todos', '/settings']);
  });

  it('podstran skritega zavihka ga prav tako prinese v vrstico', () => {
    const slots = tabSlots(REGISTER, '/cameras/manage');
    expect(slots.visible.map((t) => t.route)).toEqual(['/dashboard', '/notes', '/todos', '/cameras']);
  });

  it('pot, ki ni noben zavihek, pusti vrstni red registra', () => {
    const slots = tabSlots(REGISTER, '/d/nek-zeton');
    expect(slots.visible.map((t) => t.route)).toEqual(['/dashboard', '/notes', '/todos', '/time-tracking']);
  });

  it('prazen register ne vrne ničesar in ne zahteva gumba Več', () => {
    expect(tabSlots([], '/dashboard')).toEqual({ visible: [], overflow: false });
  });

  it('vhodnega polja NE spremeni', () => {
    const tabs = [...REGISTER];
    tabSlots(tabs, '/settings');
    expect(tabs).toEqual(REGISTER);
  });
});
