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

// ── 009b: sprejemni predali (obrnjena smer) ───────────────────────────────────────────────

export interface CreatedInbox {
  id: string;
  /** Žeton iz `dropUrl` — pot `/u/{token}` je za pošiljatelja edini naslov. */
  token: string;
  dropUrl: string;
  code: string;
  maxFiles: number;
  maxTotalBytes: number;
}

/** Žeton iz naslova za oddajo. Namenoma iz ODGOVORA in ne iz baze: če se oblika naslova kdaj
 * spremeni, mora to opaziti test, ne šele pošiljatelj. */
function tokenFromDropUrl(dropUrl: string): string {
  const token = dropUrl.split('/u/')[1];
  if (!token) throw new Error(`dropUrl ni v pričakovani obliki: ${dropUrl}`);
  return token;
}

export async function createInbox(
  app: Express,
  accessToken: string,
  options: {
    label?: string;
    note?: string;
    expiresInDays?: 1 | 7 | 30 | null;
    maxFiles?: number;
    maxTotalMb?: number;
  } = {},
): Promise<CreatedInbox> {
  const body: Record<string, unknown> = { label: options.label ?? 'Skenirane pogodbe' };
  if (options.note !== undefined) body.note = options.note;
  if ('expiresInDays' in options) body.expiresInDays = options.expiresInDays;
  if (options.maxFiles !== undefined) body.maxFiles = options.maxFiles;
  if (options.maxTotalMb !== undefined) body.maxTotalMb = options.maxTotalMb;

  const created = await request(app)
    .post('/api/v1/inboxes')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(body)
    .expect(201);

  return {
    id: created.body.inbox.id,
    token: tokenFromDropUrl(created.body.dropUrl),
    dropUrl: created.body.dropUrl,
    code: created.body.code,
    maxFiles: created.body.inbox.maxFiles,
    maxTotalBytes: created.body.inbox.maxTotalBytes,
  };
}

/** Vpiše kodo in vrne dovolilnico za oddajo. Ta potuje v GLAVI, ne v piškotku (FR-091). */
export async function unlockDrop(app: Express, dropToken: string, code: string) {
  const res = await request(app).post(`/api/v1/drop/${dropToken}/unlock`).send({ code });
  return { res, ticket: (res.body?.ticket as string | undefined) ?? '' };
}

/**
 * Cela oddaja: napovej (`POST /drop/{token}/files`) → pošlji vsebino
 * (`PUT /drop/{token}/files/{id}/content`).
 *
 * `declaredSize` obstaja zato, da je mogoče preveriti tudi LAŽ o velikosti — napoved je obljuba
 * pošiljatelja in ne dejstvo (FR-089).
 */
export async function dropFile(
  app: Express,
  dropToken: string,
  ticket: string,
  content: Buffer,
  options: { fileName?: string; senderName?: string; declaredSize?: number; contentType?: string } = {},
) {
  const body: Record<string, unknown> = {
    fileName: options.fileName ?? 'racun.pdf',
    byteSize: options.declaredSize ?? content.byteLength,
  };
  if (options.senderName !== undefined) body.senderName = options.senderName;

  const declared = await request(app)
    .post(`/api/v1/drop/${dropToken}/files`)
    .set('X-Drop-Ticket', ticket)
    .send(body);
  if (declared.status !== 201) return { declared, uploaded: null };

  const uploaded = await request(app)
    .put(`/api/v1/drop/${dropToken}/files/${declared.body.id}/content`)
    .set('X-Drop-Ticket', ticket)
    .set('Content-Type', options.contentType ?? 'application/octet-stream')
    .send(content);

  return { declared, uploaded };
}
