import { describe, expect, it, vi } from 'vitest';
import { validateTileLayout } from '../../src/modules/settings/services/tile-layout.service.js';
import type { Logger } from '../../src/platform/logging/logger.js';

// data-model.md: neznana vrsta ploščice v `tiles` se ob branju PRESKOČI in ZABELEŽI, ne
// povzroči napake — drugače bi odstranjena vrsta ploščice podrla ves dashboard.

function fakeLogger() {
  return { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
}

describe('validateTileLayout', () => {
  it('sprejme znani vrsti ploščic (weather, radar)', () => {
    const logger = fakeLogger();
    const result = validateTileLayout(
      [
        { type: 'weather', position: 0 },
        { type: 'radar', position: 1, visible: false },
      ],
      logger,
    );
    expect(result).toHaveLength(2);
    expect(result[1]?.visible).toBe(false);
  });

  it('neznana vrsta ploščice je PRESKOČENA, ne napaka — dashboard ostane funkcionalen', () => {
    const logger = fakeLogger();
    const result = validateTileLayout(
      [
        { type: 'weather', position: 0 },
        { type: 'neka-prihodnja-plosčica-002', position: 1 },
      ],
      logger,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('weather');
  });

  it('preskočena neznana vrsta se ZABELEŽI (člen VI duh — tiha napaka ni sprejemljiva)', () => {
    const logger = fakeLogger();
    validateTileLayout([{ type: 'nepoznano', position: 0 }], logger);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'settings.tile_layout.unknown_type', types: ['nepoznano'] }),
      expect.any(String),
    );
  });

  it('podvojen position MED ZNANIMI vrstami je napaka (odjemalčeva obveznost)', () => {
    const logger = fakeLogger();
    expect(() =>
      validateTileLayout(
        [
          { type: 'weather', position: 0 },
          { type: 'radar', position: 0 },
        ],
        logger,
      ),
    ).toThrow();
  });

  it('neznana vrsta ne šteje v preverjanje podvojenega position (samo preskočena)', () => {
    const logger = fakeLogger();
    // Neznana vrsta na position 0 se preskoči; znana vrsta lahko potem uporabi isti position.
    expect(() =>
      validateTileLayout(
        [
          { type: 'nepoznano', position: 0 },
          { type: 'weather', position: 0 },
        ],
        logger,
      ),
    ).not.toThrow();
  });

  it('vnos brez "type" ali "position" je napaka', () => {
    const logger = fakeLogger();
    expect(() => validateTileLayout([{ position: 0 }], logger)).toThrow();
    expect(() => validateTileLayout([{ type: 'weather' }], logger)).toThrow();
  });

  it('privzeta vidnost je true, če ni podana', () => {
    const logger = fakeLogger();
    const result = validateTileLayout([{ type: 'weather', position: 0 }], logger);
    expect(result[0]?.visible).toBe(true);
  });
});
