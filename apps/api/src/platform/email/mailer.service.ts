import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../config/env.js';

// Pošiljanje e-pošte — SKUPNA storitev (015, specs/015-flight-deals/research.md §9).
//
// Zakaj v `platform/` in ne v modulu Leti: pošiljanje pošte ni pojem letov (isti test kot pri
// `platform/users/` v 010 in `platform/usage/` v 014), `docs/env-reference.md` §3 pa je vprašanje
// o e-pošti pustil odprto od 001. Modul pozna samo `isEmailConfigured` in `sendEmail`.
//
// Nastavitve so IZKLJUČNO iz okolja (`SMTP_*`, člen IV) in se v odgovorih API-ja nikoli ne
// pojavijo — admin vidi samo `configured: true|false`. Brez `SMTP_HOST` pošiljanje ne odpove,
// ampak vrne `{ ok: false, permanent: true, code: 'smtp-not-configured' }`, da klicatelj dopis
// zabeleži kot zadržan in ne kot napako (FR-038).
//
// Ta plast NE ponavlja in NE hrani ničesar: ponovitve z zamikom so stvar klicateljevega outboxa
// (modules/flight-deals/services/notification-sender.service.ts), ker je pravilo "en dopis na
// prejemnika na zagon" domensko in tu ni vidno.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendEmailResult =
  | { ok: true; messageId: string | null }
  | {
      ok: false;
      /** `true`, kadar ponavljanje ne more pomagati (ni nastavitev, zavrnjena avtentikacija,
       * neveljaven naslov). */
      permanent: boolean;
      code: string;
      /** Brez naslovov in brez gesel — gre v `lastError` in v dnevnik. */
      message: string;
    };

let transporter: Transporter | null = null;
let transporterKey = '';

export function isEmailConfigured(env: Pick<Env, 'SMTP_HOST' | 'SMTP_FROM'>): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_HOST.trim().length > 0 && env.SMTP_FROM && env.SMTP_FROM.trim().length > 0);
}

function transportFor(env: Env): Transporter {
  const key = `${env.SMTP_HOST}|${env.SMTP_PORT}|${env.SMTP_SECURE}|${env.SMTP_USER ?? ''}`;
  if (transporter && transporterKey === key) return transporter;
  transporter = createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // `false` na 587 = navadna povezava z nadgradnjo STARTTLS, kadar jo strežnik ponudi;
    // `true` = TLS od prvega bajta (465).
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  transporterKey = key;
  return transporter;
}

/** Kode SMTP napak, pri katerih ponavljanje ne pomaga. */
const PERMANENT_CODES = new Set(['EAUTH', 'EENVELOPE', 'EMESSAGE']);

export async function sendEmail(env: Env, message: EmailMessage): Promise<SendEmailResult> {
  if (!isEmailConfigured(env)) {
    return { ok: false, permanent: true, code: 'smtp-not-configured', message: 'Poštni strežnik ni nastavljen (SMTP_HOST, SMTP_FROM).' };
  }
  try {
    const info = await transportFor(env).sendMail({
      from: env.SMTP_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    const rejected = Array.isArray(info.rejected) ? info.rejected.length : 0;
    if (rejected > 0 && (!Array.isArray(info.accepted) || info.accepted.length === 0)) {
      return { ok: false, permanent: true, code: 'rejected', message: 'Poštni strežnik je naslov zavrnil.' };
    }
    return { ok: true, messageId: typeof info.messageId === 'string' ? info.messageId : null };
  } catch (err) {
    const code = (err as { code?: unknown })?.code;
    const codeStr = typeof code === 'string' ? code : 'ESEND';
    return {
      ok: false,
      permanent: PERMANENT_CODES.has(codeStr),
      code: codeStr,
      message: scrub(err instanceof Error ? err.message : String(err)),
    };
  }
}

/** Sporočilo knjižnice brez e-naslovov — gre v bazo in dnevnik (FR-054). */
export function scrub(message: string): string {
  return message.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<naslov>').slice(0, 300);
}

/** Samo za teste: pozabi transport, da mock ali nove nastavitve veljajo. */
export function resetMailerForTests(): void {
  transporter = null;
  transporterKey = '';
}
