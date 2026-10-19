import type { Env } from '../../../platform/config/env.js';
import type { ProviderId } from '../domain/types.js';
import { fakeProvider } from './fake.provider.js';
import { ryanairProvider } from './ryanair.provider.js';
import { travelpayoutsProvider } from './travelpayouts.provider.js';
import { easyjetProvider, wizzairProvider } from './unsupported.providers.js';
import type { FlightProvider } from './types.js';

// Register virov: nov vir je nova datoteka in ena vrstica tukaj (isti dogovor kot
// modules/meteo/providers/index.ts in register zavihkov, člen I).
//
// Vrstni red je vrstni red v vmesniku: najprej produkcijski, nato neuradni in nepodprti, testni
// zadnji.
export const FLIGHT_PROVIDERS: readonly FlightProvider[] = [
  travelpayoutsProvider,
  ryanairProvider,
  wizzairProvider,
  easyjetProvider,
  fakeProvider,
];

export function providerById(id: ProviderId): FlightProvider | null {
  return FLIGHT_PROVIDERS.find((p) => p.id === id) ?? null;
}

export function enabledProviders(env: Env): FlightProvider[] {
  return FLIGHT_PROVIDERS.filter((p) => p.isEnabled(env));
}
