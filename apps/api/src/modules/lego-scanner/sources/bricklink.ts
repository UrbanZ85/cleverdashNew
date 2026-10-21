import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { Env } from '../../../platform/config/env.js';
import type { PriceGuide } from '../domain/valuation.js';
import { fetchCachedJson } from './http.js';
import type { PriceSource, SourceOutcome } from './types.js';

// BrickLink — CENIK (018, research §4). OAuth 1.0 s podpisom HMAC-SHA1 (štiri vrednosti), podpis
// sestavljen z `node:crypto`; brez odvisnosti. Pogoj za delovanje je v BrickLink računu REGISTRIRAN IP
// naslov strežnika — brez njega API zavrne dostop (`unauthorized` z navodilom).
//
// Prodaje (`guide_type=sold`, zadnjih 6 mesecev) in aktivne ponudbe (`stock`) sta LOČENA klica in ločeni
// polji: aktivne ponudbe nikoli niso vir vrednosti. Številke prihajajo kot nizi; razčlenitev je
// tolerantna in vse nečitljivo postane `null`, nikoli 0.
//
// Uradne strani (JS) nisem mogel prebrati strojno: oblika (`data.avg_price`, `qty_avg_price`,
// `unit_quantity`, `price_detail[]`) je iz poznavanja API-ja in se potrdi ob prvem pravem klicu.

export const BRICKLINK_GAP_MS = 300;

/** RFC 3986 odstotno kodiranje (OAuth 1.0 zahteva stroge znake: `!'()*` se kodirajo). */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Osnovni niz podpisa po RFC 5849 §3.4.1: METODA & URL brez poizvedbe & normaliziran seznam parametrov. */
export function oauthBaseString(method: string, baseUrl: string, params: ReadonlyArray<readonly [string, string]>): string {
  const normalized = params
    .map(([k, v]) => [percentEncode(k), percentEncode(v)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `${method.toUpperCase()}&${percentEncode(baseUrl)}&${percentEncode(normalized)}`;
}

export interface OAuthCredentials {
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
}

export interface SignedRequest {
  url: string;
  authorization: string;
}

/** Podpiše GET zahtevo; `timestamp` in `nonce` sta parametra zaradi testov. */
export function signOAuth1Get(
  baseUrl: string,
  query: ReadonlyArray<readonly [string, string]>,
  credentials: OAuthCredentials,
  timestamp = String(Math.floor(Date.now() / 1000)),
  nonce = randomBytes(12).toString('hex'),
): SignedRequest {
  const oauth: Array<readonly [string, string]> = [
    ['oauth_consumer_key', credentials.consumerKey],
    ['oauth_token', credentials.token],
    ['oauth_signature_method', 'HMAC-SHA1'],
    ['oauth_timestamp', timestamp],
    ['oauth_nonce', nonce],
    ['oauth_version', '1.0'],
  ];
  const base = oauthBaseString('GET', baseUrl, [...query, ...oauth]);
  const key = `${percentEncode(credentials.consumerSecret)}&${percentEncode(credentials.tokenSecret)}`;
  const signature = createHmac('sha1', key).update(base).digest('base64');
  const header = [...oauth, ['oauth_signature', signature] as const].map(([k, v]) => `${k}="${percentEncode(v)}"`).join(', ');
  const qs = query.map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`).join('&');
  return { url: qs ? `${baseUrl}?${qs}` : baseUrl, authorization: `OAuth realm="", ${header}` };
}

type Json = Record<string, unknown>;

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** `null` = vir seta ne pozna; sicer cenik (lahko s `count: 0`). */
export function parsePriceGuide(body: unknown): PriceGuide | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Json;
  const meta = root.meta as Json | undefined;
  if (meta && typeof meta.code === 'number' && meta.code === 404) return null;
  const data = root.data as Json | undefined;
  if (!data || typeof data !== 'object') return null;
  const details = Array.isArray(data.price_detail)
    ? (data.price_detail as Json[])
        .map((d) => ({ unitPrice: num(d?.unit_price), quantity: num(d?.quantity) }))
        .filter((d): d is { unitPrice: number; quantity: number } => d.unitPrice !== null && d.quantity !== null && d.quantity > 0)
    : [];
  const currency = typeof data.currency_code === 'string' && data.currency_code.trim() ? data.currency_code.trim().toUpperCase() : null;
  return {
    currency,
    average: num(data.avg_price),
    qtyAverage: num(data.qty_avg_price),
    min: num(data.min_price),
    max: num(data.max_price),
    count: Math.max(0, Math.trunc(num(data.unit_quantity) ?? 0)),
    details: details.length > 0 ? details : null,
  };
}

function credentials(env: Env): OAuthCredentials | null {
  const { BRICKLINK_CONSUMER_KEY: ck, BRICKLINK_CONSUMER_SECRET: cs, BRICKLINK_TOKEN: t, BRICKLINK_TOKEN_SECRET: ts } = env;
  return ck && cs && t && ts ? { consumerKey: ck, consumerSecret: cs, token: t, tokenSecret: ts } : null;
}

export const bricklinkPrices: PriceSource = {
  id: 'bricklink',
  label: 'BrickLink',

  disabledReason(env) {
    const missing = (['BRICKLINK_CONSUMER_KEY', 'BRICKLINK_CONSUMER_SECRET', 'BRICKLINK_TOKEN', 'BRICKLINK_TOKEN_SECRET'] as const).filter((k) => !env[k]);
    return missing.length === 0 ? null : `Manjkajo ključi: ${missing.join(', ')}.`;
  },

  async getPriceGuide(rt, setNumber, newOrUsed, guide, currency): Promise<SourceOutcome<PriceGuide | null>> {
    const { env } = rt;
    const creds = credentials(env);
    if (!creds) return { ok: false, code: 'disabled', message: 'BrickLink ni vklopljen (manjkajo ključi).' };
    const baseUrl = `${env.BRICKLINK_URL}/items/SET/${encodeURIComponent(setNumber)}/price`;
    const query: Array<readonly [string, string]> = [
      ['guide_type', guide],
      ['new_or_used', newOrUsed],
      ['currency_code', currency],
    ];
    const cacheKey = `lego:bricklink:price:${setNumber}:${newOrUsed}:${guide}:${currency}`;
    const out = await fetchCachedJson(
      {
        usageSource: 'bricklink',
        cacheKey,
        // Brez podpisa in ključev: samo identiteta zahteve.
        sourceUrl: `${baseUrl}?${createHash('sha256').update(cacheKey).digest('hex').slice(0, 8)}`,
        buildRequest: () => {
          const signed = signOAuth1Get(baseUrl, query, creds);
          return { url: signed.url, headers: { Authorization: signed.authorization, Accept: 'application/json' } };
        },
        ttlSeconds: env.LEGO_PRICE_CACHE_HOURS * 3600,
        dailyLimit: env.LEGO_BRICKLINK_DAILY_LIMIT,
        rt,
        paceId: 'bricklink',
        notFoundAsNull: true,
      },
      'BrickLink',
    );
    if (!out.ok) return out;
    return { ok: true, value: parsePriceGuide(out.value), stale: out.stale };
  },
};
