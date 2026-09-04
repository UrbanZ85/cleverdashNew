import type { ClockPortal, ResolvedLocation, StateReading } from '../clock-portal/index.js';

// contracts/openapi.yaml, readState: predpomnjeno za `cacheSeconds` (privzeto 60), ker
// vsak klic pomeni zagon brskalnika. `refresh=true` predpomnilnik obide. Kratkoživ,
// namenoma v pomnilniku (ne v Mongu kot 001-ov externalCache) — semantika je popolnoma
// drugačna: tu gre za zaščito pred zaporednimi kliki, ne za "zadnje znano stanje ob izpadu".

interface CacheEntry {
  reading: StateReading;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export interface CachedStateReading extends StateReading {
  fromCache: boolean;
}

export async function readStateCached(
  clockPortal: ClockPortal,
  location: ResolvedLocation,
  cacheKey: string,
  cacheSeconds: number,
  refresh: boolean,
): Promise<CachedStateReading> {
  const now = Date.now();
  if (!refresh) {
    const entry = cache.get(cacheKey);
    if (entry && entry.expiresAt > now) {
      return { ...entry.reading, fromCache: true };
    }
  }
  const reading = await clockPortal.readState(location);
  cache.set(cacheKey, { reading, expiresAt: now + cacheSeconds * 1000 });
  return { ...reading, fromCache: false };
}

export function resetStateCacheForTests(): void {
  cache.clear();
}
