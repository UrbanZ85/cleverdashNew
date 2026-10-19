import { describe, expect, it } from 'vitest';
import {
  SCHEDULE_PRESETS,
  formatSlotLocal,
  latestDueSlot,
  nextRun,
  nextRuns,
  presetFor,
  presetForExpression,
  scopedSlotKey,
  slotKeyFor,
  validateCron,
} from '../../../src/platform/scanner/domain/schedule-slots.js';

// 016 (preseljeno iz 015, FR-046 do FR-051): izrazi, termini, dohitevanje; kakovostna vrata: prehod na
// zimski čas 25. 10. 2026 in ključ termina z OBSEGOM (tip ali skener), research.md §4.

const TZ = 'Europe/Ljubljana';

describe('validateCron', () => {
  it('veljavni izrazi prednastavitev prestanejo', () => {
    for (const p of SCHEDULE_PRESETS) if (p.cronExpression) expect(validateCron(p.cronExpression), p.id).toBeNull();
  });
  it('minuta 60 ali 25. ura je zavrnjena s slovenskim razlogom', () => {
    expect(validateCron('0 25 * * *')).toMatch(/ni veljaven/);
    expect(validateCron('60 6 * * *')).toMatch(/ni veljaven/);
  });
  it('šest polj (sekunde) je zavrnjenih; štiri tudi', () => {
    expect(validateCron('0 0 6 * * *')).toMatch(/pet polj/);
    expect(validateCron('0 6 * *')).toMatch(/pet polj/);
  });
});

describe('nextRun in prehod na zimski čas', () => {
  it('"0 6 * * *" po 24. 10. 20:00Z da 25. 10. 2026 ob 6:00 lokalno = 05:00Z (po prehodu)', () => {
    const next = nextRun('0 6 * * *', TZ, new Date('2026-10-24T20:00:00Z'));
    expect(next?.toISOString()).toBe('2026-10-25T05:00:00.000Z');
    expect(formatSlotLocal(next!, TZ)).toContain('25. 10. 2026 ob 06:00');
  });
  it('dan pred prehodom je 6:00 lokalno = 04:00Z', () => {
    expect(nextRun('0 6 * * *', TZ, new Date('2026-10-23T20:00:00Z'))?.toISOString()).toBe('2026-10-24T04:00:00.000Z');
  });
  it('"0 */6 * * *" da štiri termine na dan', () => {
    const runs = nextRuns('0 */6 * * *', TZ, new Date('2026-10-20T00:30:00Z'), 4);
    expect(runs.map((d) => formatSlotLocal(d, TZ).slice(-5))).toEqual(['06:00', '12:00', '18:00', '00:00']);
  });
  it('ponedeljek ob 8:00', () => {
    const next = nextRun('0 8 * * 1', TZ, new Date('2026-10-17T12:00:00Z')); // sobota
    expect(formatSlotLocal(next!, TZ)).toMatch(/^pon\.?, 19\. 10\. 2026 ob 08:00$/);
  });
});

describe('latestDueSlot', () => {
  const expr = '0 6,18 * * *';
  it('vrne ZADNJI zapadli termin, ne vseh (dohitevanje enega termina)', () => {
    const now = new Date('2026-10-17T20:00:00Z'); // 22:00 lokalno
    const last = new Date('2026-10-15T04:00:00Z'); // 15. 10. 06:00 lokalno
    const slot = latestDueSlot(expr, TZ, now, last);
    expect(slot?.toISOString()).toBe('2026-10-17T16:00:00.000Z'); // 18:00 CEST
  });
  it('nič, kadar zadnji termin že pokriva vse do zdaj', () => {
    const now = new Date('2026-10-17T10:00:00Z');
    expect(latestDueSlot(expr, TZ, now, new Date('2026-10-17T04:00:00Z'))).toBeNull();
  });
  it('sveža namestitev (null) dohiti zadnji termin zadnjega dne', () => {
    const now = new Date('2026-10-17T10:00:00Z'); // 12:00 lokalno
    expect(latestDueSlot(expr, TZ, now, null)?.toISOString()).toBe('2026-10-17T04:00:00.000Z');
  });
  it('izraz, ki se do zdaj ni sprožil, da null', () => {
    const now = new Date('2026-10-17T10:00:00Z');
    expect(latestDueSlot('0 15 * * *', TZ, now, new Date('2026-10-17T09:00:00Z'))).toBeNull();
  });
});

describe('slotKey in prednastavitve', () => {
  it('slotKey je termin v coni urnika, z odmikom, brez sekund', () => {
    expect(slotKeyFor(new Date('2026-10-17T04:00:00Z'), TZ)).toBe('schedule:2026-10-17T06:00+02:00');
    expect(slotKeyFor(new Date('2026-10-26T05:00:00Z'), TZ)).toBe('schedule:2026-10-26T06:00+01:00');
  });
  it('ključ z obsegom: tip in skener z istim izrazom dobita RAZLIČNA ključa, isti obseg istega', () => {
    const slot = new Date('2026-10-17T04:00:00Z');
    expect(scopedSlotKey('type:flights', slot, TZ)).toBe('schedule:type:flights:2026-10-17T06:00+02:00');
    expect(scopedSlotKey('def:abc', slot, TZ)).toBe('schedule:def:abc:2026-10-17T06:00+02:00');
    expect(scopedSlotKey('def:abc', slot, TZ)).not.toBe(scopedSlotKey('def:xyz', slot, TZ));
    // Po prehodu na zimski čas isti lokalni termin nosi drug odmik — ključ ga pove.
    expect(scopedSlotKey('type:flights', new Date('2026-10-26T05:00:00Z'), TZ)).toBe('schedule:type:flights:2026-10-26T06:00+01:00');
  });

  it('urnik skenerja v drugi coni da termin v tisti coni', () => {
    const next = nextRun('0 6 * * *', 'America/New_York', new Date('2026-10-24T20:00:00Z'));
    expect(next?.toISOString()).toBe('2026-10-25T10:00:00.000Z');
    expect(scopedSlotKey('def:ny', next!, 'America/New_York')).toBe('schedule:def:ny:2026-10-25T06:00-04:00');
  });

  it('hourly je prednastavitev z izrazom na polno uro', () => {
    expect(presetFor('hourly').cronExpression).toBe('0 * * * *');
    expect(presetForExpression('0 * * * *')).toBe('hourly');
  });

  it('isti termin iz dveh izvodov da isti ključ', () => {
    const a = nextRun('0 6 * * *', TZ, new Date('2026-10-24T20:00:00Z'))!;
    const b = nextRun('0 6 * * *', TZ, new Date('2026-10-24T21:00:00Z'))!;
    expect(slotKeyFor(a, TZ)).toBe(slotKeyFor(b, TZ));
  });
  it('presetForExpression prepozna prednastavitev tudi z odvečnimi presledki', () => {
    expect(presetForExpression('0  6,18 * * *')).toBe('daily-06-18');
    expect(presetForExpression('5 4 * * *')).toBe('custom');
    expect(presetFor('monday-08').cronExpression).toBe('0 8 * * 1');
  });
});
