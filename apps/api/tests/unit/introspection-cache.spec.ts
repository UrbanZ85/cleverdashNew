import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// research.md §4: znotraj TTL se Keycloak NE kliče znova (fail-closed predpomnilnik v
// pomnilniku procesa) — enako preverljivo brez pravega omrežja kot mapRolesToScopes.

const { mockTokenIntrospection } = vi.hoisted(() => ({ mockTokenIntrospection: vi.fn() }));

vi.mock('openid-client', () => ({
  tokenIntrospection: mockTokenIntrospection,
}));
vi.mock('../../src/platform/keycloak/client.js', () => ({
  getKeycloakConfig: vi.fn().mockResolvedValue({}),
}));

const ENV = {
  KEYCLOAK_ISSUER_URL: 'https://sso.example.com/realms/cleverdash-dev',
  KEYCLOAK_CLIENT_ID: 'cleverdash-api',
  KEYCLOAK_CLIENT_SECRET: 'secret',
  KEYCLOAK_INTROSPECTION_CACHE_SECONDS: 5,
  NODE_ENV: 'test' as const,
};

beforeEach(() => {
  vi.useFakeTimers();
  mockTokenIntrospection.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('introspectAccessToken', () => {
  it('klic znotraj TTL ne pokliče znova tokenIntrospection', async () => {
    const { introspectAccessToken, resetIntrospectionCacheForTests } = await import(
      '../../src/platform/keycloak/introspection-cache.js'
    );
    resetIntrospectionCacheForTests();
    mockTokenIntrospection.mockResolvedValue({ active: true, sub: 'user-1', realm_access: { roles: ['cleverdash-admin'] } });

    const first = await introspectAccessToken(ENV, 'token-a');
    const second = await introspectAccessToken(ENV, 'token-a');

    expect(first).toEqual({ active: true, subject: 'user-1', roles: ['cleverdash-admin'] });
    expect(second).toEqual(first);
    expect(mockTokenIntrospection).toHaveBeenCalledTimes(1);
  });

  it('klic po izteku TTL pokliče introspekcijo znova', async () => {
    const { introspectAccessToken, resetIntrospectionCacheForTests } = await import(
      '../../src/platform/keycloak/introspection-cache.js'
    );
    resetIntrospectionCacheForTests();
    mockTokenIntrospection.mockResolvedValue({ active: true, sub: 'user-1', realm_access: { roles: [] } });

    await introspectAccessToken(ENV, 'token-b');
    vi.advanceTimersByTime(6000);
    await introspectAccessToken(ENV, 'token-b');

    expect(mockTokenIntrospection).toHaveBeenCalledTimes(2);
  });

  it('napaka introspekcije (Keycloak nedosegljiv) se vrže naprej, brez padca na staro vrednost (FR-007)', async () => {
    const { introspectAccessToken, resetIntrospectionCacheForTests } = await import(
      '../../src/platform/keycloak/introspection-cache.js'
    );
    resetIntrospectionCacheForTests();
    mockTokenIntrospection.mockResolvedValue({ active: true, sub: 'user-1', realm_access: { roles: [] } });
    await introspectAccessToken(ENV, 'token-c');

    vi.advanceTimersByTime(6000);
    mockTokenIntrospection.mockRejectedValue(new Error('Keycloak nedosegljiv'));

    await expect(introspectAccessToken(ENV, 'token-c')).rejects.toThrow('Keycloak nedosegljiv');
  });
});
