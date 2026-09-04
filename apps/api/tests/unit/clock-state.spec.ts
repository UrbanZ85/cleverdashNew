import { describe, expect, it } from 'vitest';
import {
  brokenChainPredecessor,
  deriveClockState,
  expectedStateAfter,
  isAlreadyDone,
  isStartAction,
  isStateAllowedBefore,
  resolveActionForLocation,
  START_ACTIONS,
} from '../../src/domain/clock-state.js';

// research.md §1: ena tabela poganja verifikacijo, zaznavo zamude in predpreverjanje.

describe('deriveClockState', () => {
  it('OFF_DUTY, ko je na voljo prijava na delo', () => {
    expect(deriveClockState(['Prijava na delo'])).toBe('OFF_DUTY');
  });

  it('OFF_DUTY tudi za "Delo od doma" in "Delo na terenu"', () => {
    expect(deriveClockState(['Delo od doma'])).toBe('OFF_DUTY');
    expect(deriveClockState(['Delo na terenu'])).toBe('OFF_DUTY');
  });

  it('ON_DUTY, ko je na voljo malica ali konec dela (brez konca malice)', () => {
    expect(deriveClockState(['Malica', 'Konec dela'])).toBe('ON_DUTY');
    expect(deriveClockState(['Konec dela'])).toBe('ON_DUTY');
  });

  it('ON_BREAK, ko je na voljo konec malice — PREVERJEN PRED "Konec dela"', () => {
    // Med odmorom sta lahko na voljo oba (docs/legacy-engine.md §2) — vrstni red preverjanja
    // odloči, in mora dati ON_BREAK, ne ON_DUTY.
    expect(deriveClockState(['Konec malice', 'Konec dela'])).toBe('ON_BREAK');
    expect(deriveClockState(['Konec malice'])).toBe('ON_BREAK');
  });

  it('UNKNOWN za prazen nabor — okvara, ne veljavno stanje (FR-022)', () => {
    expect(deriveClockState([])).toBe('UNKNOWN');
  });

  it('UNKNOWN za nabor z neprepoznanimi imeni', () => {
    expect(deriveClockState(['Nekaj čisto drugega'])).toBe('UNKNOWN');
  });
});

describe('isAlreadyDone / expectedStateAfter', () => {
  it('"Prijava na delo" pričakuje ON_DUTY po izvedbi', () => {
    expect(expectedStateAfter('Prijava na delo')).toBe('ON_DUTY');
  });

  it('already_done, če je pričakovano stanje že doseženo', () => {
    expect(isAlreadyDone('Prijava na delo', 'ON_DUTY')).toBe(true);
    expect(isAlreadyDone('Prijava na delo', 'OFF_DUTY')).toBe(false);
  });
});

describe('isStateAllowedBefore', () => {
  it('"Malica" je dovoljena samo iz ON_DUTY', () => {
    expect(isStateAllowedBefore('Malica', 'ON_DUTY')).toBe(true);
    expect(isStateAllowedBefore('Malica', 'OFF_DUTY')).toBe(false);
    expect(isStateAllowedBefore('Malica', 'ON_BREAK')).toBe(false);
  });

  it('neznana akcija ni dovoljena iz nobenega stanja', () => {
    expect(isStateAllowedBefore('Neznana akcija', 'ON_DUTY')).toBe(false);
  });
});

// FR-090: kateri od štirih gumbov za začetek dela se pritisne, je lastnost LOKACIJE.
describe('resolveActionForLocation', () => {
  it('akcijo za začetek dela zamenja z gumbom lokacije', () => {
    expect(resolveActionForLocation('Prijava na delo', 'Delo od doma')).toBe('Delo od doma');
    expect(resolveActionForLocation('Prijava na delo', 'Delo na terenu')).toBe('Delo na terenu');
  });

  it('vseh ostalih akcij ne spremeni — malica in konec dela sta povsod ista gumba', () => {
    for (const action of ['Malica', 'Odmor med delom', 'Konec malice', 'Konec dela']) {
      expect(resolveActionForLocation(action, 'Delo od doma')).toBe(action);
    }
  });

  it('brez gumba na lokaciji obvelja ime iz profila (stanje pred FR-090)', () => {
    expect(resolveActionForLocation('Prijava na delo', undefined)).toBe('Prijava na delo');
    expect(resolveActionForLocation('Prijava na delo', null)).toBe('Prijava na delo');
  });

  it('vsak gumb za začetek dela vodi v ON_DUTY — različica ne spremeni stanja', () => {
    for (const action of START_ACTIONS) {
      expect(isStartAction(action)).toBe(true);
      expect(expectedStateAfter(action)).toBe('ON_DUTY');
      expect(deriveClockState([action])).toBe('OFF_DUTY');
    }
    expect(isStartAction('Konec dela')).toBe(false);
  });
});

// Ena padla akcija je naslednjo razglasila za `already_done` (stanje "kot po akciji" je bilo
// posledica manjkajočega koraka) in dan je bil v zgodovini videti cel — člen VI.
describe('brokenChainPredecessor', () => {
  const dan = [
    { actionName: 'Delo od doma', actionOrder: 1, state: 'already_done' },
    { actionName: 'Malica', actionOrder: 2, state: 'failed' },
    { actionName: 'Konec malice', actionOrder: 3, state: 'due' },
    { actionName: 'Konec dela', actionOrder: 4, state: 'planned' },
  ];

  it('najde padlo akcijo pred dano', () => {
    expect(brokenChainPredecessor(3, dan)?.actionName).toBe('Malica');
    expect(brokenChainPredecessor(4, dan)?.actionName).toBe('Malica');
  });

  it('akcij ZA dano ne šteje — veriga se presoja samo nazaj', () => {
    expect(brokenChainPredecessor(2, dan)).toBeNull();
    expect(brokenChainPredecessor(1, dan)).toBeNull();
  });

  it('zamujena akcija verigo pretrga enako kot neuspela', () => {
    const zamujeno = [{ actionName: 'Malica', actionOrder: 2, state: 'missed' }];
    expect(brokenChainPredecessor(3, zamujeno)?.actionName).toBe('Malica');
  });

  it('zavestna odločitev verige ne pretrga — preskočeno in preklicano nista napaki', () => {
    for (const state of ['skipped', 'cancelled']) {
      expect(brokenChainPredecessor(3, [{ actionName: 'Malica', actionOrder: 2, state }])).toBeNull();
    }
  });

  it('cela veriga vrne null', () => {
    const cela = [
      { actionName: 'Delo od doma', actionOrder: 1, state: 'succeeded' },
      { actionName: 'Malica', actionOrder: 2, state: 'already_done' },
    ];
    expect(brokenChainPredecessor(3, cela)).toBeNull();
  });

  it('ob več padlih vrne PRVO — tam se je veriga pretrgala', () => {
    const dvakrat = [
      { actionName: 'Malica', actionOrder: 2, state: 'failed' },
      { actionName: 'Konec malice', actionOrder: 3, state: 'failed' },
    ];
    expect(brokenChainPredecessor(4, dvakrat)?.actionName).toBe('Malica');
  });
});
