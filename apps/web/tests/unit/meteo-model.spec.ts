import { describe, expect, it } from 'vitest';
import {
  METEO_WINDOWS,
  bucketAxisLabels,
  cumulativePrecipitation,
  formatValue,
  hasPrecipitation,
  localDateTimeLabel,
  localTimeLabel,
  precipitationAxisMax,
  windArrowRotation,
  windDirectionLabel,
  type MeteoHourBucket,
} from '../../src/app/core/meteo/meteo.model.js';

// 011: čisti del odjemalca za meritve ARSO postaje. Teče brez TestBed-a (isti vzorec kot
// plugin-model.spec.ts) — vsa logika, ki se lahko zmoti, je zato preverljiva brez ogrodja.

function bucket(label: string, dayLabel: string, precipitationMm: number | null): MeteoHourBucket {
  return {
    startUtc: `2026-09-09T${label.padStart(2, '0')}:00:00.000Z`,
    label,
    dayLabel,
    precipitationMm,
    temperatureAvgC: null,
    temperatureMinC: null,
    temperatureMaxC: null,
    humidityAvgPct: null,
    windAvgKmh: null,
    windMaxKmh: null,
    windDirectionDeg: null,
    pressureHpa: null,
    globalRadiationWm2: null,
    snowCm: null,
    samples: 6,
  };
}

describe('windDirectionLabel', () => {
  it('preslika stopinje v slovensko oznako smeri', () => {
    expect(windDirectionLabel(0)).toBe('S');
    expect(windDirectionLabel(90)).toBe('V');
    expect(windDirectionLabel(180)).toBe('J');
    expect(windDirectionLabel(255)).toBe('Z');
    expect(windDirectionLabel(315)).toBe('SZ');
  });

  it('359° je severnik in ne severozahodnik', () => {
    expect(windDirectionLabel(359)).toBe('S');
  });

  it('brez meritve ni oznake', () => {
    expect(windDirectionLabel(null)).toBeNull();
    expect(windDirectionLabel(undefined)).toBeNull();
    expect(windDirectionLabel(Number.NaN)).toBeNull();
  });
});

describe('windArrowRotation', () => {
  it('puščica kaže, KAM piha, vir pa pove, OD KOD — zato je obrnjena za 180°', () => {
    // Brez tega bi puščice kazale natanko narobe, česar na sliki ni videti.
    expect(windArrowRotation(0)).toBe(180);
    expect(windArrowRotation(255)).toBe(75);
    expect(windArrowRotation(180)).toBe(0);
  });

  it('brez meritve ni puščice', () => {
    expect(windArrowRotation(null)).toBeNull();
  });
});

describe('bucketAxisLabels', () => {
  it('ob spremembi dneva (in na prvem vedru) doda dan k uri', () => {
    const labels = bucketAxisLabels([
      bucket('22', 'tor. 8. 9.', 0),
      bucket('23', 'tor. 8. 9.', 0),
      bucket('00', 'sre. 9. 9.', 0),
      bucket('01', 'sre. 9. 9.', 0),
    ]);

    expect(labels).toEqual(['22 | tor. 8. 9.', '23', '00 | sre. 9. 9.', '01']);
  });

  it('prazen vhod da prazne oznake', () => {
    expect(bucketAxisLabels([])).toEqual([]);
  });
});

describe('cumulativePrecipitation', () => {
  it('sešteva skozi okno in šteje manjkajoče vedro kot nič dodanega', () => {
    const totals = cumulativePrecipitation([
      bucket('10', 'sre. 9. 9.', 0.2),
      bucket('11', 'sre. 9. 9.', null),
      bucket('12', 'sre. 9. 9.', 0.1),
      bucket('13', 'sre. 9. 9.', 1.4),
    ]);

    // Brez zaokrožitve ob vsakem koraku bi bila druga vrednost 0.30000000000000004.
    expect(totals).toEqual([0.2, 0.2, 0.3, 1.7]);
  });
});

describe('precipitationAxisMax', () => {
  it('ob rosenju os ne naredi naliva', () => {
    // 0,2 mm na prilagojeni osi je stolpec do vrha grafa — kar je laž o tem, koliko je padlo.
    expect(precipitationAxisMax([bucket('10', 'sre. 9. 9.', 0.2)])).toBe(2);
  });

  it('ob nalivu se os razširi nad najvišji stolpec', () => {
    expect(precipitationAxisMax([bucket('10', 'sre. 9. 9.', 12.4)])).toBe(15);
  });

  it('brez veder ostane spodnja meja', () => {
    expect(precipitationAxisMax([])).toBe(2);
  });
});

describe('hasPrecipitation', () => {
  it('loči "ni padlo nič" od "postaja ne meri"', () => {
    expect(hasPrecipitation([bucket('10', 'sre. 9. 9.', 0)])).toBe(false);
    expect(hasPrecipitation([bucket('10', 'sre. 9. 9.', null)])).toBe(false);
    expect(hasPrecipitation([bucket('10', 'sre. 9. 9.', 0.2)])).toBe(true);
  });
});

describe('formatValue', () => {
  it('zapiše vrednost z enoto in decimalno vejico (člen X)', () => {
    expect(formatValue(22.84, '°C')).toBe('22,8 °C');
    expect(formatValue(63, '%', 0)).toBe('63 %');
  });

  it('manjkajoča meritev je pomišljaj in ne nič', () => {
    expect(formatValue(null, '°C')).toBe('–');
    expect(formatValue(undefined, 'mm')).toBe('–');
    // Nič padavin PA je meritev in se izpiše kot številka.
    expect(formatValue(0, 'mm')).toBe('0,0 mm');
  });
});

describe('localTimeLabel / localDateTimeLabel', () => {
  it('čas je v slovenski coni in ne v coni brskalnika (člen V.4)', () => {
    // 07:40 UTC je v poletnem času 09:40 v Ljubljani.
    expect(localTimeLabel('2026-09-09T07:40:00.000Z')).toBe('09:40');
    // 9. januarja velja zimski čas — ista ura UTC je 08:40.
    expect(localTimeLabel('2026-01-09T07:40:00.000Z')).toBe('08:40');
  });

  it('dolga oblika vsebuje dan in uro', () => {
    expect(localDateTimeLabel('2026-09-09T07:40:00.000Z')).toMatch(/9\.\s*9\./);
    expect(localDateTimeLabel('2026-09-09T07:40:00.000Z')).toMatch(/09:40/);
  });

  it('neveljaven čas ne podre izpisa', () => {
    expect(localTimeLabel('ni datum')).toBe('');
  });
});

describe('METEO_WINDOWS', () => {
  it('nobeno okno ne presega dveh dni, ki jih vir hrani', () => {
    // `GET /meteo/history` daljše okno zavrne (hours <= 48) — gumb, ki bi vrnil 400, ne sme
    // obstajati.
    expect(METEO_WINDOWS.every((w) => w.hours <= 48)).toBe(true);
  });
});
