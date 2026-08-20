import { describe, expect, it } from 'vitest';
import { SettingsModel } from '../../src/modules/settings/model.js';
import { ExternalCacheModel } from '../../src/platform/cache/model.js';
import { UserModel } from '../../src/modules/auth/models/user.model.js';
import { SessionFamilyModel } from '../../src/modules/auth/models/session-family.model.js';

// FR-016: sistem je enouporabniški, zato domenski zapisi NE nosijo lastnika. Izjema so
// avtentikacijski zapisi (sessionFamilies, refreshTokens, devices), ki nosijo `userId`
// zato, ker je uporabnik njihov PREDMET, ne njihov lastnik — data-model.md, "Načelo
// lastništva zapisov". Ta test preveri obe strani razlikovanja, ne samo eno.

describe('FR-016: odsotnost polja lastnika na domenskih zapisih', () => {
  it('settings (singleton) nima userId/owner polja', () => {
    const paths = Object.keys(SettingsModel.schema.paths);
    expect(paths).not.toContain('userId');
    expect(paths).not.toContain('owner');
  });

  it('externalCache nima userId/owner polja', () => {
    const paths = Object.keys(ExternalCacheModel.schema.paths);
    expect(paths).not.toContain('userId');
    expect(paths).not.toContain('owner');
  });

  it('kontrast: sessionFamilies UPRAVIČENO nosi userId — uporabnik je predmet zapisa, ne lastnik', () => {
    const paths = Object.keys(SessionFamilyModel.schema.paths);
    expect(paths).toContain('userId');
  });

  it('users nima lastnega userId (uporabnik je sam sebi entiteta, ne referenca)', () => {
    const paths = Object.keys(UserModel.schema.paths);
    expect(paths).not.toContain('userId');
  });
});
