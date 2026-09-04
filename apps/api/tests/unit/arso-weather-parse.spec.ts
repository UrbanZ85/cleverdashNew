import { describe, expect, it } from 'vitest';
import { parseArsoWeather } from '../../src/platform/arso/weather.client.js';

// Fixture je prirezana pravo oblika odgovora, preverjena neposredno proti
// https://vreme.arso.gov.si/api/1.0/location/?location=Ljubljana dne 19. 8. 2026
// (research.md §3, 001). `webcam` je bil do 003 neuporabljen (samo dokaz, da shema ne
// podre razčlenjevanja); od 003 dalje (research.md §2) se dejansko prebere — glej
// spodnji opis "prebere webcam ...". Ostala neuporabljena polja (msl, ddff_icon, ...)
// ostajajo namenoma prezrta.

function fixture(overrides: Partial<{ observation: unknown; forecast3h: unknown }> = {}) {
  return {
    observation: overrides.observation ?? {
      features: [
        {
          properties: {
            days: [
              {
                date: '2026-08-19',
                timeline: [
                  {
                    webcam: [{ direction: '', image: 'x.jpg' }],
                    clouds_shortText: 'jasno',
                    dd_shortText: 'Z',
                    ff_shortText: 'zmeren Z',
                    clouds_icon_wwsyn_icon: 'clear_day',
                    msl: '1012',
                    t: '32',
                    rh: '36',
                    valid: '2026-08-19T13:00:00+00:00',
                    ff_val: '18',
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    forecast3h: overrides.forecast3h ?? {
      features: [
        {
          properties: {
            days: [
              {
                date: '2026-08-19',
                timeline: [
                  { clouds_shortText: 'jasno', t: '33', valid: '2026-08-19T15:00:00+00:00' },
                  { clouds_shortText: 'delno oblačno', t: '30', valid: '2026-08-19T18:00:00+00:00' },
                ],
              },
              {
                date: '2026-08-20',
                timeline: Array.from({ length: 8 }, (_, i) => ({
                  t: String(20 + i),
                  valid: `2026-08-20T0${i}:00:00+00:00`,
                })),
              },
            ],
          },
        },
      ],
    },
  };
}

describe('parseArsoWeather', () => {
  it('prebere trenutno meritev iz observation.features[0].properties.days[0].timeline[0]', () => {
    const data = parseArsoWeather(fixture());
    expect(data.current).toEqual({
      temperatureC: 32,
      humidityPercent: 36,
      windSpeed: 'zmeren Z',
      windDirection: 'Z',
      skyCondition: 'jasno',
      icon: 'clear_day',
      validAt: '2026-08-19T13:00:00+00:00',
      webcam: [{ direction: '', image: 'x.jpg' }],
    });
  });

  it('prebere webcam iz trenutne meritve za predlogo pri dodajanju kamere (003, FR-037)', () => {
    const data = parseArsoWeather(fixture());
    expect(data.current?.webcam).toEqual([{ direction: '', image: 'x.jpg' }]);
  });

  it('manjkajoč webcam v odgovoru vrne prazen seznam, ne napako (lokacija brez slike)', () => {
    const data = parseArsoWeather(
      fixture({
        observation: {
          features: [
            {
              properties: {
                days: [
                  {
                    date: '2026-08-19',
                    timeline: [{ t: '20', valid: '2026-08-19T13:00:00+00:00' }],
                  },
                ],
              },
            },
          ],
        },
      }),
    );
    expect(data.current?.webcam).toEqual([]);
  });

  it('sploščí forecast3h čez več dni in omeji na 8 vnosov (~24h)', () => {
    const data = parseArsoWeather(fixture());
    expect(data.forecast).toHaveLength(8);
    expect(data.forecast[0]?.temperatureC).toBe(33);
  });

  it('prezre neuporabljena polja (msl, ddff_icon, ...) brez napake', () => {
    expect(() => parseArsoWeather(fixture())).not.toThrow();
  });

  it('manjkajoč current vrne null namesto napake, če je timeline prazen', () => {
    const data = parseArsoWeather(
      fixture({
        observation: {
          features: [{ properties: { days: [{ date: '2026-08-19', timeline: [] }] } }],
        },
      }),
    );
    expect(data.current).toBeNull();
  });

  it('spremenjena struktura uporabljenega dela (manjka "valid") vrže napako — past za shema drift', () => {
    const broken = fixture();
    // @ts-expect-error namenoma pokvarjena struktura za test
    delete broken.observation.features[0].properties.days[0].timeline[0].valid;
    expect(() => parseArsoWeather(broken)).toThrow();
  });
});
