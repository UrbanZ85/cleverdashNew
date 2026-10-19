import { describe, expect, it } from 'vitest';
import { scheduleLabel, typeScheduleLabel } from '../../../src/platform/scanner/domain/schedule-label.js';

// FR-040: opis urnika v vrstici seznama je slovenski in pove, ali ga določa administrator.

describe('scheduleLabel', () => {
  it('prednastavitev dobi svoj naziv z malo začetnico', () => {
    expect(scheduleLabel({ preset: 'every-6h', cronExpression: '0 */6 * * *' })).toBe('vsakih 6 ur');
    expect(scheduleLabel({ preset: 'hourly', cronExpression: '0 * * * *' })).toBe('vsako uro');
  });
  it('brez preseta se prepozna iz izraza; po meri se izpiše izraz', () => {
    expect(scheduleLabel({ cronExpression: '0 6,18 * * *' })).toBe('vsak dan ob 6:00 in 18:00');
    expect(scheduleLabel({ preset: 'custom', cronExpression: '15  7 * * 2' })).toBe('po meri: 15 7 * * 2');
  });
  it('tuja cona je navedena, domača ne', () => {
    expect(scheduleLabel({ preset: 'daily-06', cronExpression: '0 6 * * *', timezone: 'Europe/Ljubljana' })).toBe('vsak dan ob 6:00');
    expect(scheduleLabel({ preset: 'daily-06', cronExpression: '0 6 * * *', timezone: 'America/New_York' })).toBe('vsak dan ob 6:00 (America/New_York)');
  });
  it('urnik tipa pove, da je tipov, ali da je izklopljen', () => {
    expect(typeScheduleLabel({ enabled: true, preset: 'daily-06-18', cronExpression: '0 6,18 * * *' })).toBe('po urniku tipa (vsak dan ob 6:00 in 18:00)');
    expect(typeScheduleLabel({ enabled: false, preset: 'daily-06-18', cronExpression: '0 6,18 * * *' })).toBe('po urniku tipa (izklopljen)');
  });
});
