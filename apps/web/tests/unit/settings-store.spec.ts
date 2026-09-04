import { describe, expect, it } from 'vitest';
import { applyPatch, mergeWithDefaults, type Settings } from '../../src/app/core/settings/settings.model.js';

const base = (): Settings =>
  mergeWithDefaults({
    weather: { locationName: 'Maribor', latitude: 46.5547, longitude: 15.6459 },
    theme: 'dark',
    tiles: [{ type: 'weather', position: 0, visible: true }],
    tabs: { cameras: { enabled: false, order: 3 } },
    sources: { weatherUrl: 'https://vreme.example/api/' },
    cameraDataSaverEnabled: false,
  });

describe('mergeWithDefaults', () => {
  it('dopolni manjkajoča polja s privzetki, namesto da bi vrnil undefined', () => {
    const s = mergeWithDefaults({});
    expect(s.weather.locationName).toBe('Ljubljana');
    expect(s.theme).toBe('system');
    expect(s.tiles).toEqual([]);
    expect(s.tabs).toEqual({});
    expect(s.sources).toEqual({});
    expect(s.cameraDataSaverEnabled).toBe(true);
  });

  it('prenese delen vremenski objekt brez izgube ostalih koordinat', () => {
    const s = mergeWithDefaults({ weather: { locationName: 'Kredarica' } as Settings['weather'] });
    expect(s.weather.locationName).toBe('Kredarica');
    expect(s.weather.latitude).toBe(46.0629);
  });

  it('prazen odgovor strežnika ne podre shrambe', () => {
    expect(() => mergeWithDefaults(null)).not.toThrow();
    expect(mergeWithDefaults(undefined).theme).toBe('system');
  });
});

describe('applyPatch', () => {
  it('spremeni samo popravljena polja', () => {
    const next = applyPatch(base(), { theme: 'light' });
    expect(next.theme).toBe('light');
    expect(next.weather.locationName).toBe('Maribor');
    expect(next.cameraDataSaverEnabled).toBe(false);
  });

  it('delno prekritje zavihka ohrani shranjeni "order"', () => {
    // To je bistvo: PUT /settings na strežniku zliva PO ZAVIHKIH (settings/router.ts).
    // Če bi odjemalec prekritje zamenjal namesto zlil, bi vklop zavihka pobrisal vrstni red.
    const next = applyPatch(base(), { tabs: { cameras: { enabled: true } } });
    expect(next.tabs['cameras']).toEqual({ enabled: true, order: 3 });
  });

  it('doda novo prekritje zavihka, ne da bi izgubil obstoječa', () => {
    const next = applyPatch(base(), { tabs: { settings: { order: 1 } } });
    expect(next.tabs['cameras']).toEqual({ enabled: false, order: 3 });
    expect(next.tabs['settings']).toEqual({ order: 1 });
  });

  it('viri se zlijejo, tako da nastavitev enega URL-ja ne pobriše drugega', () => {
    const next = applyPatch(base(), { sources: { radarUrl: 'https://radar.example/si.gif' } });
    expect(next.sources.weatherUrl).toBe('https://vreme.example/api/');
    expect(next.sources.radarUrl).toBe('https://radar.example/si.gif');
  });

  it('prazen popravek pusti stanje nedotaknjeno', () => {
    const before = base();
    expect(applyPatch(before, {})).toEqual(before);
  });

  it('razporeditev ploščic se ZAMENJA, ne zlije — vrstni red je celota', () => {
    const next = applyPatch(base(), { tiles: [{ type: 'radar', position: 0, visible: true }] });
    expect(next.tiles).toEqual([{ type: 'radar', position: 0, visible: true }]);
  });
});
