import type { Express } from 'express';
import request from 'supertest';
import { UserModel } from '../../../src/modules/auth/models/user.model.js';
import { SharedFileModel } from '../../../src/modules/file-sharing/models/shared-file.model.js';
import { fakeKeycloakForTests } from '../../setup/keycloak-global.js';
import { loginAsTestUser, DEFAULT_IDENTITY } from '../../setup/login-as-test-user.js';

// Skupni pomožniki za pogodbene teste 009 proti specs/009-file-sharing/contracts/openapi.yaml —
// po vzoru tests/contract/notes/_helpers.ts.

export async function loginAndUnlock(app: Express): Promise<string> {
  const { accessToken } = await loginAsTestUser(app, fakeKeycloakForTests, { roles: ['cleverdash-admin'] });
  return accessToken;
}

export async function defaultTestUserId(): Promise<string> {
  const user = await UserModel.findOneAndUpdate(
    { keycloakSubject: DEFAULT_IDENTITY.sub },
    { $setOnInsert: { email: DEFAULT_IDENTITY.email, displayName: DEFAULT_IDENTITY.name, scopes: [] } },
    { upsert: true, new: true },
  );
  return String(user._id);
}

export interface UploadedShare {
  id: string;
  token: string;
  shareUrl: string;
  password: string;
  byteSize: number;
}

/**
  * Cel tok nalaganja: napovej (`POST /files`) → naloži vsebino (`PUT /files/{id}/content`).
  *
  * Vsebina je majhna in namenoma NI pravi format: strežnik je ne dekodira in ne pregleduje
  * (FR-054). Testi, ki merijo pretakanje, si vsebino pripravijo sami.
  */
export async function uploadFile(
  app: Express,
  token: string,
  options: { fileName?: string; content?: Buffer; expiresInDays?: 1 | 7 | 30 | null } = {},
): Promise<UploadedShare> {
  const content = options.content ?? Buffer.from('vsebina testne datoteke');
  const body: Record<string, unknown> = {
    fileName: options.fileName ?? 'porocilo.pdf',
    byteSize: content.byteLength,
  };
  if ('expiresInDays' in options) body.expiresInDays = options.expiresInDays;

  const created = await request(app)
    .post('/api/v1/files')
    .set('Authorization', `Bearer ${token}`)
    .send(body)
    .expect(201);

  const uploaded = await request(app)
    .put(`/api/v1/files/${created.body.id}/content`)
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'application/octet-stream')
    .send(content)
    .expect(201);

  const doc = await SharedFileModel.findById(created.body.id).lean<{ token: string } | null>();
  return {
    id: created.body.id,
    token: doc!.token,
    shareUrl: uploaded.body.shareUrl,
    password: uploaded.body.password,
    byteSize: content.byteLength,
  };
}

/** Odklene povezavo z geslom in vrne piškotek z dovolilnico za nadaljnje zahteve. */
export async function unlock(app: Express, shareToken: string, password: string) {
  const res = await request(app).post(`/api/v1/share/${shareToken}/unlock`).send({ password });
  const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
  return { res, cookie: cookies?.[0] ?? '' };
}
