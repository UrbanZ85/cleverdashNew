import { beforeEach, describe, expect, it, vi } from 'vitest';

// platform/email (015, research.md §9): nodemailer je MOCKAN — test ne odpre nobene vtičnice.

const { mockSendMail, mockCreateTransport } = vi.hoisted(() => {
  const mockSendMail = vi.fn();
  const mockCreateTransport = vi.fn(() => ({ sendMail: mockSendMail }));
  return { mockSendMail, mockCreateTransport };
});
vi.mock('nodemailer', () => ({ createTransport: mockCreateTransport, default: { createTransport: mockCreateTransport } }));

const { isEmailConfigured, resetMailerForTests, scrub, sendEmail } = await import('../../../src/platform/email/mailer.service.js');
const { loadEnv, resetEnvCacheForTests } = await import('../../../src/platform/config/env.js');

const BASE = {
  NODE_ENV: 'test',
  PORT: '3000',
  TZ: 'Europe/Ljubljana',
  PUBLIC_BASE_URL: 'https://app.si',
  MONGO_URI: 'mongodb://x/y',
  SESSION_COOKIE_SECRET: 'c'.repeat(32),
  KEYCLOAK_ISSUER_URL: 'https://sso.example.com/realms/x',
  KEYCLOAK_CLIENT_ID: 'x',
  KEYCLOAK_CLIENT_SECRET: 'y',
  CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

function env(extra: Record<string, string> = {}) {
  resetEnvCacheForTests();
  return loadEnv({ ...BASE, ...extra });
}

const message = { to: 'ana@example.com', subject: 'Test', html: '<p>x</p>', text: 'x' };

beforeEach(() => {
  mockSendMail.mockReset();
  mockCreateTransport.mockClear();
  resetMailerForTests();
});

describe('mailer.service', () => {
  it('brez SMTP_HOST ni nastavljen in sendEmail vrne trajno "smtp-not-configured" brez klica', async () => {
    const e = env();
    expect(isEmailConfigured(e)).toBe(false);
    const res = await sendEmail(e, message);
    expect(res).toMatchObject({ ok: false, permanent: true, code: 'smtp-not-configured' });
    expect(mockCreateTransport).not.toHaveBeenCalled();
  });

  it('posreduje host/port/secure/auth in vrne messageId', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<abc@x>', accepted: ['ana@example.com'], rejected: [] });
    const e = env({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: 'u', SMTP_PASSWORD: 'p', SMTP_FROM: 'noreply@example.com' });
    expect(isEmailConfigured(e)).toBe(true);
    const res = await sendEmail(e, message);
    expect(res).toEqual({ ok: true, messageId: '<abc@x>' });
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.com', port: 587, secure: false, auth: { user: 'u', pass: 'p' } }),
    );
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'noreply@example.com', to: 'ana@example.com', subject: 'Test' }));
  });

  it('napaka transporta je začasna, EAUTH je trajna; sporočilo brez naslovov', async () => {
    const e = env({ SMTP_HOST: 'smtp.example.com', SMTP_FROM: 'noreply@example.com' });
    mockSendMail.mockRejectedValueOnce(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNECTION' }));
    expect(await sendEmail(e, message)).toMatchObject({ ok: false, permanent: false, code: 'ECONNECTION' });
    mockSendMail.mockRejectedValueOnce(Object.assign(new Error('Invalid login for ana@example.com'), { code: 'EAUTH' }));
    const res = await sendEmail(e, message);
    expect(res).toMatchObject({ ok: false, permanent: true, code: 'EAUTH' });
    expect((res as { message: string }).message).not.toContain('ana@example.com');
  });

  it('scrub zamenja e-naslove', () => {
    expect(scrub('zavrnjeno za janez.novak+x@agenda.si in b@c.d')).toBe('zavrnjeno za <naslov> in <naslov>');
  });

  it('transport se ponovno uporabi, dokler se nastavitve ne spremenijo', async () => {
    mockSendMail.mockResolvedValue({ messageId: 'm', accepted: ['x'], rejected: [] });
    const e = env({ SMTP_HOST: 'smtp.example.com', SMTP_FROM: 'noreply@example.com' });
    await sendEmail(e, message);
    await sendEmail(e, message);
    expect(mockCreateTransport).toHaveBeenCalledTimes(1);
  });
});
