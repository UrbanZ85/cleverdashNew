import type { MeteoProviderId } from '../../../domain/meteo-station-ref.js';
import { arsoProvider } from './arso.provider.js';
import { neverinProvider } from './neverin.provider.js';
import type { StationProvider } from './types.js';

// Register ponudnikov. Nov ponudnik = nova datoteka `*.provider.ts` in ena vrstica tukaj.

export type { Env, SourceRequest, StationProvider } from './types.js';

const PROVIDERS: Record<MeteoProviderId, StationProvider> = {
  arso: arsoProvider,
  neverin: neverinProvider,
};

/** Vsi ponudniki v vrstnem redu, v katerem se pojavijo v seznamu postaj. ARSO je prvi, ker je
 * privzeti vir te namestitve in ker so njegove postaje državne. */
export const ALL_PROVIDERS: readonly StationProvider[] = [arsoProvider, neverinProvider];

/** Ponudnik po oznaki. Oznaka je preverjena že ob razčlenitvi sklica
 * (`domain/meteo-station-ref.ts`), zato je tu vedno znana. */
export function providerFor(id: MeteoProviderId): StationProvider {
  return PROVIDERS[id];
}
