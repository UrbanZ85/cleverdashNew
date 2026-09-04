import request from 'supertest';
import type { Express } from 'express';
import type { FakeKeycloak, TestIdentity } from './fake-keycloak.js';
import { UserModel } from '../../src/modules/auth/models/user.model.js';

// research.md §3: nadomesti dosedanje razpršene `loginAndUnlock()` pomočnike po posameznih
// testnih datotekah (e-pošta/geslo, POST /auth/login). Izvede PRAVI tok skozi resnično kodo
// (`GET /auth/login` -> ponarejen Keycloak -> `GET /auth/callback` -> `POST /auth/refresh`),
// ne bypass-a je z ročnim ustvarjanjem seje v bazi — s tem test dejansko dokazuje, da tok
// deluje, ne samo da koda za dostop do podatkov deluje.

export interface LoggedInTestUser {
  accessToken: string;
  /** supertest agent z nastavljenim httpOnly sejnim piškotkom — za nadaljnje zahteve, ki
   * potrebujejo sejo (npr. POST /auth/refresh, POST /auth/logout, GET /auth/sessions). */
  agent: ReturnType<typeof request.agent>;
  /** Mongo `User._id` tega testnega uporabnika — za sejanje podatkov, ki so zdaj osebni
   * (Camera, TrackingProfile ipd., glej data-model.md), s pravilnim `userId` (US2). */
  userId: string;
}

export const DEFAULT_IDENTITY: TestIdentity = {
  sub: 'kc-sub-default',
  email: 'test-user@example.com',
  name: 'Testni uporabnik',
  roles: [],
};

export async function loginAsTestUser(
  app: Express,
  fakeKeycloak: FakeKeycloak,
  identity: Partial<TestIdentity> = {},
): Promise<LoggedInTestUser> {
  const resolvedIdentity: TestIdentity = { ...DEFAULT_IDENTITY, ...identity };
  fakeKeycloak.setNextIdentity(resolvedIdentity);

  const agent = request.agent(app);

  const loginRes = await agent.get('/api/v1/auth/login').redirects(0);
  const authorizeUrl = loginRes.headers.location as string | undefined;
  if (!authorizeUrl) {
    throw new Error(`GET /auth/login ni vrnil preusmeritve (status ${loginRes.status}).`);
  }

  // Ponarejen Keycloak je pravi, poslušajoč HTTP strežnik (glej fake-keycloak.ts) — do njega
  // gremo z navadnim fetch(), ker supertest zna nasloviti samo `app` sam.
  const authorizeRes = await fetch(authorizeUrl, { redirect: 'manual' });
  const callbackUrl = authorizeRes.headers.get('location');
  if (!callbackUrl) {
    throw new Error(`Ponarejen Keycloak ni preusmeril na redirect_uri (status ${authorizeRes.status}).`);
  }

  // supertest zahteva relativno pot znotraj `app`, callbackUrl pa je absoluten
  // (PUBLIC_BASE_URL/api/v1/auth/callback?...).
  const relativeCallback = callbackUrl.replace(/^https?:\/\/[^/]+/, '');
  const callbackRes = await agent.get(relativeCallback).redirects(0);
  if (callbackRes.status !== 302) {
    throw new Error(
      `GET /auth/callback ni uspel (status ${callbackRes.status}): ${JSON.stringify(callbackRes.body)}`,
    );
  }

  const refreshRes = await agent.post('/api/v1/auth/refresh').send();
  if (refreshRes.status !== 200) {
    throw new Error(
      `POST /auth/refresh po prijavi ni uspel (status ${refreshRes.status}): ${JSON.stringify(refreshRes.body)}`,
    );
  }

  const user = await UserModel.findOne({ keycloakSubject: resolvedIdentity.sub });
  if (!user) {
    throw new Error(`Uporabnik s keycloakSubject "${resolvedIdentity.sub}" ni bil ustvarjen ob /auth/callback.`);
  }

  return { accessToken: refreshRes.body.accessToken as string, agent, userId: String(user._id) };
}
