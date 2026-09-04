import { Types } from 'mongoose';
import type { Logger } from '../../../platform/logging/logger.js';
import { badRequest } from '../../../platform/errors/problem.js';

// FR-020, FR-028, data-model.md: `position` je unikaten znotraj `tiles`. Neznana vrsta
// ploščice (npr. odstranjena v novejši izdaji) se pri branju PRESKOČI in ZABELEŽI, ne
// povzroči napake — drugače bi odstranjena vrsta ploščice podrla ves dashboard.
//
// Seznam znanih vrst je namenoma tukaj, ne v registru zavihkov: ploščice so vtičniki v
// mreži dashboarda (FR-020), ne zavihki v meniju — ločena os od tabs/registry.ts.
// 'forecast' je bil dodan naknadno: GET /dashboard/forecast je obstajal že od 001, a ga ni
// izrisovala nobena ploščica. Brez vnosa tukaj bi bila razporeditev z njim tiho očiščena
// (skippedTypes) in uporabnikova nastavitev bi izginila ob shranjevanju.
//
// 'commute' (005) je imel isto napako, le da dlje: ploščica "Pot" je bila registrirana samo
// na strani odjemalca (apps/web/.../shared/tiles/tile-registry.ts), tukaj pa ne. Vsaka
// shranjena razporeditev, ki jo je vsebovala, je zato ob PUT /settings tiho izgubila prav to
// ploščico — enak razred napake kot pri 'forecast' zgoraj in zato enak popravek.
const KNOWN_TILE_TYPES = new Set(['weather', 'forecast', 'radar', 'commute', 'todos']);

// 005: vrsta "plugin" je uporabniško definirana ploščica. Za razliko od vgrajenih vrst je
// ni v seznamu zgoraj — vsak vnos nosi `config.pluginId`, ki kaže na dokument v zbirki
// `dashboardPlugins` (modules/dashboard/models/dashboard-plugin.model.ts). Razporeditev
// ostane tudi zanje TUKAJ, da ima vrstni red en sam vir resnice.
//
// Lastništvo `pluginId` se tu NE preverja: to bi pomenilo poizvedbo v drug modul iz
// nastavitev (člen I). Tuj ali izbrisan ID ni varnostna luknja — `GET /dashboard/plugins`
// vrne samo lastne vtičnike, zato dashboard vnosa, ki mu ne ustreza noben vtičnik,
// preprosto ne izriše (ista pot kot za neznano vrsto ploščice, FR-020).
export const PLUGIN_TILE_TYPE = 'plugin';

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

    const config = isPlainObject(raw.config) ? raw.config : undefined;

    if (raw.type === PLUGIN_TILE_TYPE) {
      const pluginId = config?.['pluginId'];
      if (typeof pluginId !== 'string' || !Types.ObjectId.isValid(pluginId)) {
        throw badRequest('Vnos vrste "plugin" potrebuje veljaven "config.pluginId".');
      }
    } else if (!KNOWN_TILE_TYPES.has(raw.type)) {
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
      config,
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
