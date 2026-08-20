import type { Logger } from '../../../platform/logging/logger.js';
import { badRequest } from '../../../platform/errors/problem.js';

// FR-020, FR-028, data-model.md: `position` je unikaten znotraj `tiles`. Neznana vrsta
// ploščice (npr. odstranjena v novejši izdaji) se pri branju PRESKOČI in ZABELEŽI, ne
// povzroči napake — drugače bi odstranjena vrsta ploščice podrla ves dashboard.
//
// Seznam znanih vrst je namenoma tukaj, ne v registru zavihkov: ploščice so vtičniki v
// mreži dashboarda (FR-020), ne zavihki v meniju — ločena os od tabs/registry.ts.
const KNOWN_TILE_TYPES = new Set(['weather', 'radar']);

export interface TileLayoutEntry {
  type: string;
  position: number;
  visible: boolean;
  config?: Record<string, unknown>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validira in počisti razporeditev ploščic, ki jo pošlje odjemalec (`PUT /settings`).
 * Podvojen `position` je NAPAKA (odjemalčeva obveznost, da razporeditev sestavi
 * pravilno) — neznana vrsta ploščice pa NI napaka, samo preskočena vrstica.
 */
export function validateTileLayout(input: unknown, logger: Logger): TileLayoutEntry[] {
  if (!Array.isArray(input)) {
    throw badRequest('Razporeditev ploščic mora biti seznam.');
  }

  const seenPositions = new Set<number>();
  const result: TileLayoutEntry[] = [];
  const skippedTypes: string[] = [];

  for (const raw of input) {
    if (!isPlainObject(raw) || typeof raw.type !== 'string' || typeof raw.position !== 'number') {
      throw badRequest('Vsak vnos razporeditve potrebuje "type" (niz) in "position" (število).');
    }

    if (!KNOWN_TILE_TYPES.has(raw.type)) {
      skippedTypes.push(raw.type);
      continue;
    }

    if (seenPositions.has(raw.position)) {
      throw badRequest(`Podvojen position (${raw.position}) v razporeditvi ploščic.`);
    }
    seenPositions.add(raw.position);

    result.push({
      type: raw.type,
      position: raw.position,
      visible: typeof raw.visible === 'boolean' ? raw.visible : true,
      config: isPlainObject(raw.config) ? raw.config : undefined,
    });
  }

  if (skippedTypes.length > 0) {
    logger.warn(
      { event: 'settings.tile_layout.unknown_type', types: skippedTypes },
      'Neznana vrsta ploščice preskočena v razporeditvi',
    );
  }

  return result;
}
