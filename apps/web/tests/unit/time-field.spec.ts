import { describe, expect, it } from 'vitest';
import { completeTime, formatTimeInput, isValidTime, timeDigits } from '../../src/app/shared/time-field/time-field.util.js';

// Polje za uro: na telefonu `type="time"` ne pokaže tipkovnice, zato je vnos besedilo s številsko tipkovnico.

describe('time-field.util', () => {
  it('samo števke, največ štiri', () => {
    expect(timeDigits('17:30')).toBe('1730');
    expect(timeDigits('abc1 7-3x0999')).toBe('1730');
    expect(timeDigits('')).toBe('');
  });

  it('oblikovanje med tipkanjem', () => {
    expect(formatTimeInput('1')).toBe('1');
    expect(formatTimeInput('17')).toBe('17');
    expect(formatTimeInput('173')).toBe('17:3');
    expect(formatTimeInput('1730')).toBe('17:30');
    expect(formatTimeInput('17:30')).toBe('17:30');
    expect(formatTimeInput('17301')).toBe('17:30');
  });

  it('veljavnost HH:MM', () => {
    for (const ok of ['00:00', '09:05', '17:30', '23:59']) expect(isValidTime(ok)).toBe(true);
    for (const bad of ['', '24:00', '9:30', '17:60', '1730', '17:3', 'ab:cd', '17:30:00']) expect(isValidTime(bad)).toBe(false);
  });

  it('dopolnitev ob zapustitvi polja', () => {
    expect(completeTime('9')).toBe('09:00');
    expect(completeTime('17')).toBe('17:00');
    expect(completeTime('930')).toBe('09:30');
    expect(completeTime('1730')).toBe('17:30');
  });

  it('neveljavno ne uide kot ura (nič se ne ugiba)', () => {
    expect(completeTime('25')).toBe('');
    expect(completeTime('1260')).toBe('');
    expect(completeTime('2400')).toBe('');
    expect(completeTime('')).toBe('');
    expect(completeTime('99')).toBe('');
    expect(completeTime('17:3')).toBe(''); // dvoumno (17:03 ali 17:30): ne ugiba
    expect(completeTime('173')).toBe('');
  });
});
