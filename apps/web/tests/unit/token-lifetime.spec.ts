import { describe, expect, it } from 'vitest';
import {
  MAX_REFRESH_DELAY_MS,
  MIN_REFRESH_DELAY_MS,
  REFRESH_SKEW_MS,
  expiryFrom,
  msUntilRefresh,
  needsRefreshNow,
} from '../../src/app/core/auth/token-lifetime.js';

// Ta logika obstaja zaradi prave napake: odjemalec je `expiresIn` iz `POST /auth/refresh`
// zavrgel in sejo obnavljal šele PO 401. Vsakih pet minut (življenjska doba Keycloakovega
// žetona) je zato prva serija zahtev padla, strežnik pa je za vsako zabeležil opozorilo —
// aplikacija je delovala in hkrati javljala, da seja ni aktivna.
//
// Testi so nad čistimi funkcijami: brez brskalnika, brez ure, brez pravega Keycloaka.

const now = new Date('2026-09-02T09:00:00.000Z');
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);

describe('expiryFrom', () => {
  it('sekunde iz odgovora pretvori v trenutek izteka', () => {
    expect(expiryFrom(300, now)).toBe(now.getTime() + 300_000);
  });

  it('nesmiselno vrednost obravnava kot "poteče takoj", ne kot NaN', () => {
    // `NaN` bi se skozi primerjave prenesel kot "nikoli ne potrebuje obnove" in napaka bi
    // bila spet nevidna — enaka past kot `SALT_ROUNDS` v starem sistemu (docs/env-reference.md §6).
    expect(expiryFrom(Number.NaN, now)).toBe(now.getTime());
    expect(expiryFrom(-10, now)).toBe(now.getTime());
  });
});

describe('needsRefreshNow', () => {
  it('žeton, ki poteče čez pet minut, ne potrebuje obnove', () => {
    expect(needsRefreshNow(expiryFrom(300, now), now)).toBe(false);
  });

  it('žeton, ki poteče znotraj minute, potrebuje obnovo PRED zahtevo', () => {
    expect(needsRefreshNow(expiryFrom(59, now), now)).toBe(true);
    expect(needsRefreshNow(now.getTime() + REFRESH_SKEW_MS, now)).toBe(true);
  });

  it('že potekel žeton potrebuje obnovo', () => {
    expect(needsRefreshNow(expiryFrom(300, now), at(400_000))).toBe(true);
  });

  it('neznan iztek ne ugiba — ostane reaktivna pot ob 401', () => {
    expect(needsRefreshNow(null, now)).toBe(false);
  });
});

describe('msUntilRefresh', () => {
  it('obnovi minuto pred iztekom', () => {
    expect(msUntilRefresh(expiryFrom(300, now), now)).toBe(300_000 - REFRESH_SKEW_MS);
  });

  it('nikoli ne vrne 0 ali negativne vrednosti — to bi bila tesna zanka', () => {
    expect(msUntilRefresh(expiryFrom(10, now), now)).toBe(MIN_REFRESH_DELAY_MS);
    expect(msUntilRefresh(expiryFrom(300, now), at(400_000))).toBe(MIN_REFRESH_DELAY_MS);
  });

  it('nikoli ne čaka neomejeno dolgo, tudi pri zelo dolgi življenjski dobi', () => {
    // Ura naprave se lahko premakne, naprava lahko spi — stanje se vsaj pogleda.
    expect(msUntilRefresh(expiryFrom(24 * 3600, now), now)).toBe(MAX_REFRESH_DELAY_MS);
    expect(msUntilRefresh(null, now)).toBe(MAX_REFRESH_DELAY_MS);
  });

  it('vsak izid je znotraj dogovorjenih mej', () => {
    for (const seconds of [0, 1, 30, 61, 120, 300, 900, 3600, 86_400]) {
      const ms = msUntilRefresh(expiryFrom(seconds, now), now);
      expect(ms, `expiresIn=${seconds}`).toBeGreaterThanOrEqual(MIN_REFRESH_DELAY_MS);
      expect(ms, `expiresIn=${seconds}`).toBeLessThanOrEqual(MAX_REFRESH_DELAY_MS);
    }
  });

  it('po obnovi je naslednji tik znotraj življenjske dobe žetona', () => {
    // Bistvo popravka: obnova se MORA zgoditi, preden žeton poteče, sicer je 401 spet edini
    // signal.
    const expiresIn = 300;
    const expiresAt = expiryFrom(expiresIn, now);
    expect(msUntilRefresh(expiresAt, now)).toBeLessThan(expiresIn * 1000);
  });
});
