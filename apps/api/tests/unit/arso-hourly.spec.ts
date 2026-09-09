import { describe, expect, it } from 'vitest';
import type { StationMeasurement } from '../../src/modules/meteo/domain/measurement.js';
import {
  PRECIPITATION_WINDOW_HOURS,
  detectAvailableSeries,
  precipitationWindows,
  summarize,
  toHourlyBuckets,
  withinHours,
} from '../../src/modules/meteo/domain/hourly.js';

// 011: urne vrednosti iz posameznih meritev. Člen IX — čista logika, brez omrežja in baze.
// Med testi je izrecno vključen prehod na zimski čas (vrata 2 v ustavi).

function measurement(validUtc: string, fields: Partial<StationMeasurement> = {}): StationMeasurement {
  return {
    validUtc,
    temperatureC: null,
    humidityPct: null,
    windAvgKmh: null,
    windMaxKmh: null,
    windDirectionDeg: null,
    precipitationMm: null,
    precipitation12hMm: null,
    pressureMslHpa: null,
    pressureHpa: null,
    globalRadiationWm2: null,
    diffuseRadiationWm2: null,
    snowCm: null,
    waterTemperatureC: null,
    uvIndex: null,
    cloudsIcon: null,
    ...fields,
  };
}

describe('toHourlyBuckets', () => {
  it('sešteje padavine ure in šteje meritve, ki so sodelovale', () => {
    // 12:10–13:00 UTC = 14:10–15:00 po lokalnem času (poletni čas) → ura 14.
    const buckets = toHourlyBuckets([
      measurement('2026-09-09T12:10:00.000Z', { precipitationMm: 0.2 }),
      measurement('2026-09-09T12:20:00.000Z', { precipitationMm: 0 }),
      measurement('2026-09-09T12:30:00.000Z', { precipitationMm: 1.4 }),
      measurement('2026-09-09T12:40:00.000Z', { precipitationMm: 0.1 }),
      measurement('2026-09-09T12:50:00.000Z', { precipitationMm: 0 }),
      measurement('2026-09-09T13:00:00.000Z', { precipitationMm: 0.3 }),
    ]);

    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.label).toBe('14');
    expect(buckets[0]!.samples).toBe(6);
    // 0.2 + 1.4 + 0.1 + 0.3; brez zaokrožitve bi bilo 2.0000000000000004.
    expect(buckets[0]!.precipitationMm).toBe(2);
  });

  it('meritev ob polni uri pripada uri, ki se je pravkar KONČALA', () => {
    // Vir označuje interval z njegovim koncem ("vsota padavin v časovnem intervalu"), zato
    // dež, izmerjen ob 15:00, pripada uri 14–15 in ne uri, ki se ravno začenja.
    const buckets = toHourlyBuckets([
      measurement('2026-09-09T13:00:00.000Z', { precipitationMm: 1 }),
      measurement('2026-09-09T13:10:00.000Z', { precipitationMm: 2 }),
    ]);

    expect(buckets.map((b) => [b.label, b.precipitationMm])).toEqual([
      ['14', 1],
      ['15', 2],
    ]);
  });

  it('padavine so null, kadar postaja padavin ne meri (in ne 0)', () => {
    const buckets = toHourlyBuckets([measurement('2026-09-09T13:10:00.000Z', { temperatureC: 12 })]);
    expect(buckets[0]!.precipitationMm).toBeNull();
    expect(buckets[0]!.temperatureAvgC).toBe(12);
  });

  it('prehod na zimski čas: podvojena ura 02 sta DVE vedri, ne eno z dvojno vsoto', () => {
    // 25. 10. 2026 je nedelja premika ure: 03:00 CEST → 02:00 CET. Lokalni "02:30" se zgodi
    // dvakrat (00:30 UTC in 01:30 UTC).
    const buckets = toHourlyBuckets([
      measurement('2026-10-25T00:30:00.000Z', { precipitationMm: 1 }),
      measurement('2026-10-25T01:30:00.000Z', { precipitationMm: 3 }),
    ]);

    expect(buckets).toHaveLength(2);
    expect(buckets.map((b) => b.label)).toEqual(['02', '02']);
    expect(buckets.map((b) => b.precipitationMm)).toEqual([1, 3]);
    // Ključ je instant, zato sta vedri kljub enakemu napisu ločljivi.
    expect(buckets[0]!.startUtc).not.toBe(buckets[1]!.startUtc);
  });

  it('smer vetra povpreči vektorsko — 350° in 10° dasta severnik, ne južnika', () => {
    const buckets = toHourlyBuckets([
      measurement('2026-09-09T13:10:00.000Z', { windDirectionDeg: 350, windAvgKmh: 10 }),
      measurement('2026-09-09T13:20:00.000Z', { windDirectionDeg: 10, windAvgKmh: 10 }),
    ]);

    expect(buckets[0]!.windDirectionDeg).toBe(0);
  });

  it('sunek ure je največji sunek, ne povprečje', () => {
    const buckets = toHourlyBuckets([
      measurement('2026-09-09T13:10:00.000Z', { windAvgKmh: 5, windMaxKmh: 12.5 }),
      measurement('2026-09-09T13:20:00.000Z', { windAvgKmh: 9, windMaxKmh: 30.24 }),
    ]);

    expect(buckets[0]!.windMaxKmh).toBe(30.2);
    expect(buckets[0]!.windAvgKmh).toBe(7);
  });
});

describe('withinHours', () => {
  const series = [
    measurement('2026-09-07T08:00:00.000Z'),
    measurement('2026-09-08T08:00:00.000Z'),
    measurement('2026-09-09T08:00:00.000Z'),
  ];

  it('okno se meri od ZADNJE meritve, ne od trenutnega časa', () => {
    // Vir, ki zastane, mora pokazati zadnje znano stanje (FR-026) — ne praznega grafa.
    expect(withinHours(series, 24)).toHaveLength(2);
    expect(withinHours(series, 48)).toHaveLength(3);
  });

  it('prazen vhod da prazen izhod', () => {
    expect(withinHours([], 24)).toEqual([]);
  });
});

describe('summarize', () => {
  it('vrne skrajne vrednosti, vsoti padavin in zadnjo meritev', () => {
    const summary = summarize([
      measurement('2026-09-07T08:00:00.000Z', { temperatureC: 15.84, precipitationMm: 5, windMaxKmh: 40 }),
      measurement('2026-09-09T07:00:00.000Z', { temperatureC: 31.5, precipitationMm: 1, windMaxKmh: 23.004 }),
      measurement('2026-09-09T08:00:00.000Z', { temperatureC: 22.8, precipitationMm: 0.2, windMaxKmh: 12 }),
    ])!;

    expect(summary.temperatureMinC).toBe(15.8);
    expect(summary.temperatureMaxC).toBe(31.5);
    expect(summary.precipitationTotalMm).toBe(6.2);
    // Zadnjih 24 ur okna: obe meritvi 9. 9., ne pa tista dva dneva prej.
    expect(summary.precipitation24hMm).toBe(1.2);
    expect(summary.windMaxKmh).toBe(40);
    expect(summary.latest.validUtc).toBe('2026-09-09T08:00:00.000Z');
  });

  it('brez meritev vrne null (klicatelj to prevede v 503, ne v prazen graf)', () => {
    expect(summarize([])).toBeNull();
  });
});

describe('precipitationWindows', () => {
  // Ura za uro nazaj od zadnje meritve; v vsaki uri po 1 mm.
  const series = Array.from({ length: 49 }, (_, i) =>
    measurement(new Date(Date.UTC(2026, 8, 9, 8, 0) - (48 - i) * 3600_000).toISOString(), {
      precipitationMm: 1,
    }),
  );

  it('vrne vsote za 4, 8, 12, 24 in 48 ur', () => {
    const windows = precipitationWindows(series);

    expect(windows.map((w) => w.hours)).toEqual([...PRECIPITATION_WINDOW_HOURS]);
    // Meja je vključujoča (glej withinHours), zato je v 4-urnem oknu 5 meritev.
    expect(windows.map((w) => w.millimeters)).toEqual([5, 9, 13, 25, 49]);
  });

  it('šteje meritve v oknu — kratka serija ne sme brati kot "toliko je padlo v 48 urah"', () => {
    const windows = precipitationWindows(series.slice(-3));
    expect(windows.find((w) => w.hours === 48)?.samples).toBe(3);
    expect(windows.find((w) => w.hours === 48)?.millimeters).toBe(3);
  });

  it('postaja brez merilnika padavin da null in ne 0', () => {
    const windows = precipitationWindows([measurement('2026-09-09T08:00:00.000Z', { temperatureC: 20 })]);
    expect(windows.every((w) => w.millimeters === null)).toBe(true);
  });

  it('prazna serija da null v vseh oknih', () => {
    expect(precipitationWindows([]).every((w) => w.millimeters === null && w.samples === 0)).toBe(true);
  });
});

describe('detectAvailableSeries', () => {
  it('postaja brez barometra in brez sevanja teh dveh grafov ne ponudi', () => {
    const available = detectAvailableSeries([
      measurement('2026-09-09T08:00:00.000Z', { temperatureC: 22, humidityPct: 63, precipitationMm: 0, snowCm: 0 }),
    ]);

    expect(available).toMatchObject({
      temperature: true,
      humidity: true,
      precipitation: true,
      snow: true,
      pressure: false,
      radiation: false,
      wind: false,
      waterTemperature: false,
    });
  });
});
