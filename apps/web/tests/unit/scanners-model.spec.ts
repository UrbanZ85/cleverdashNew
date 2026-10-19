import { describe, expect, it } from 'vitest';
import {
  changeColor,
  changeLabel,
  countersText,
  formatPrice,
  formatPriceOrDash,
  lastRunText,
  notificationLabel,
  runStatusLabel,
  scheduleSummary,
} from '../../src/app/core/scanners/scanners.model.js';

// 016: čiste funkcije vmesnika jedra skenerjev (brez TestBed, vzorec flight-deals-model.spec.ts).

describe('cena in sprememba', () => {
  it('formatPrice: cela brez decimalk, decimalna z vejico, EUR kot €; brez cene pomišljaj', () => {
    expect(formatPrice({ amount: 89, currency: 'EUR' })).toBe('89 €');
    expect(formatPrice({ amount: 89.5, currency: 'EUR' })).toBe('89,50 €');
    expect(formatPrice({ amount: 12, currency: 'GBP' })).toBe('12 GBP');
    expect(formatPriceOrDash(null)).toBe('—');
  });

  it('changeLabel pozna tudi CHANGED (sprememba brez cene); neznano vrne, kot je', () => {
    expect(changeLabel('CHANGED')).toBe('Spremenjeno');
    expect(changeLabel('NEW')).toBe('Novo');
    expect(changeLabel('X')).toBe('X');
    expect(changeLabel(null)).toBe('');
  });

  it('changeColor: pocenitev zelena, podražitev rdeča, novo/spremenjeno primarna, nedosegljivo siva', () => {
    expect(changeColor('PRICE_DOWN')).toBe('success');
    expect(changeColor('PRICE_UP')).toBe('danger');
    expect(changeColor('CHANGED')).toBe('primary');
    expect(changeColor('UNAVAILABLE')).toBe('medium');
    expect(changeColor('UNCHANGED')).toBeNull();
  });
});

describe('urnik, zagon, dopis', () => {
  it('scheduleSummary: naslednji termin ali izklopljen', () => {
    const schedule = { mode: 'own' as const, label: 'vsakih 6 ur', nextRunAt: '2026-10-19T16:00:00.000Z', nextRunLocal: 'pon, 19. 10. 2026 ob 18:00' };
    expect(scheduleSummary(schedule)).toBe('vsakih 6 ur · naslednjič pon, 19. 10. 2026 ob 18:00');
    expect(scheduleSummary(schedule, false)).toBe('vsakih 6 ur · izklopljen');
    expect(scheduleSummary({ ...schedule, nextRunAt: null, nextRunLocal: null })).toBe('vsakih 6 ur');
  });

  it('lastRunText: brez zagona, uspeh, neuspeh z razlogom', () => {
    expect(lastRunText(null)).toEqual({ text: 'še ni bilo izvedeno', color: 'medium' });
    expect(lastRunText({ at: '2026-10-19T16:00:00.000Z', outcome: 'ok', message: null }).color).toBe('success');
    const failed = lastRunText({ at: '2026-10-19T16:00:00.000Z', outcome: 'failed', message: 'vir ni odgovoril' });
    expect(failed.color).toBe('danger');
    expect(failed.text).toContain('vir ni odgovoril');
  });

  it('runStatusLabel in notificationLabel sta slovenska, z razlogom zadržanja', () => {
    expect(runStatusLabel('partial')).toBe('delno');
    expect(runStatusLabel('neznano')).toBe('neznano');
    expect(notificationLabel({ status: 'suppressed', suppressedReason: 'type-unavailable' })).toBe('zadržano: tip skenerja ni več na voljo');
    expect(notificationLabel({ status: 'sent', suppressedReason: null })).toBe('poslano');
  });

  it('countersText: znani števci po vrsti z nazivi, ostali po abecedi; notificationsPending skrit', () => {
    expect(countersText({ rules: 3, definitions: 3, notificationsSent: 1, notificationsPending: 0, queries: 6 })).toBe('3 skenerjev · 1 dopisov poslanih · queries: 6 · rules: 3');
  });
});
