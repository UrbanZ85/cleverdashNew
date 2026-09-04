import { describe, expect, it } from 'vitest';
import { mapRolesToAccess } from '../../src/platform/keycloak/role-mapping.js';

// research.md §6: preslikava Keycloak vlog v CleverDashev dostop/`scopes` je čista funkcija,
// testabilna brez omrežja (člen IX).

const ADMIN_ROLE = 'cleverdash-admin';
const USER_ROLE = 'cleverdash-user';

describe('mapRolesToAccess', () => {
  it('vloga KEYCLOAK_ADMIN_ROLE da dostop in scopes ["admin"]', () => {
    expect(mapRolesToAccess([ADMIN_ROLE], ADMIN_ROLE, USER_ROLE)).toEqual({
      hasAccess: true,
      scopes: ['admin'],
    });
  });

  it('vloga KEYCLOAK_USER_ROLE da dostop in osnovne aplikacijske scope-e, a NE "admin" (FR-010/FR-011/FR-013)', () => {
    const result = mapRolesToAccess([USER_ROLE], ADMIN_ROLE, USER_ROLE);
    expect(result.hasAccess).toBe(true);
    expect(result.scopes).not.toContain('admin');
    // Kamere in beleženje časa sta zdaj na voljo vsakemu uporabniku za LASTNE podatke
    // (izolacija je z `userId`, ne s scope sistemom) — glej role-mapping.ts.
    expect(result.scopes).toEqual(
      expect.arrayContaining(['cameras:read', 'cameras:write', 'state:read', 'action:write', 'history:read']),
    );
  });

  it('brez katerekoli prepoznane vloge NI dostopa (FR-007/FR-008)', () => {
    expect(mapRolesToAccess(['neka-druga-vloga'], ADMIN_ROLE, USER_ROLE)).toEqual({
      hasAccess: false,
      scopes: [],
    });
    expect(mapRolesToAccess([], ADMIN_ROLE, USER_ROLE)).toEqual({ hasAccess: false, scopes: [] });
  });

  it('admin vloga med več vlogami da dostop in ["admin"], ne dvojnika', () => {
    expect(mapRolesToAccess(['offline_access', ADMIN_ROLE, USER_ROLE], ADMIN_ROLE, USER_ROLE)).toEqual({
      hasAccess: true,
      scopes: ['admin'],
    });
  });
});
