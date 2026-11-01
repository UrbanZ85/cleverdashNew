import { createHash } from 'node:crypto';
import { fetchCachedJson } from '../../../platform/external-sources/http.js';
import type { RetroProduct } from '../domain/retro-identify.js';
import { RETRO_PLATFORMS } from '../domain/retro-parse.js';
import { normalizeText } from '../domain/text.js';
import type { RetroRegion } from '../domain/types.js';
import type { PriceQuote, RetroPrices, RetroPriceSource, SourceOutcome, SourceRuntime } from './types.js';

// PriceCharting — cenik retro iger (019, research §4). PLAČLJIV in izbirni: vklopljen samo ob
// `PRICECHARTING_API_KEY`. ⚠ Oblika odgovora je iz javne dokumentacije in spomina in NI preverjena z
// živim klicem (stran dokumentacije je vrnila 403): `GET /api/products?t=…&q=…` →
// `{ status, products: [{ id, "product-name", "console-name", "loose-price", "cib-price", "new-price" }] }`,
// `GET /api/product?t=…&id=…` → ena zapis; cene so v CENTIH v USD. Razčlenitev je tolerantna (manjkajoče
// polje = izpuščena cena). Pri prvem pravem klicu se oblika potrdi in popravi skupaj z mockom.
//
// Cene so CENIK (`basis: 'guide'`), ne seznam prodaj: dobička ne dajo (research §5). Valuta je USD in
// pretvorbe ni: oglas v EUR zato ni primerljiv (to je izrecno povedano ob vrednosti).
//
// Žeton je v poizvedbi (vir tako zahteva), zato je `sourceUrl` za predpomnilnik in dnevnik BREZ njega
// (člen IV); žeton se doda šele v `buildRequest`.

export const PRICECHARTING_GAP_MS = 1000;
const CURRENCY = 'USD';

type Json = Record<string, unknown>;

function cents(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) / 100 : null;
}

function regionOf(consoleName: string): RetroRegion {
  const c = consoleName.trim().toLowerCase();
  if (c.startsWith('pal ')) return 'PAL';
  if (c.startsWith('jp ') || c.startsWith('japanese ')) return 'NTSC-J';
  return 'NTSC-U';
}

function platformOf(consoleName: string): string | null {
  const c = normalizeText(consoleName.replace(/^(pal|jp|japanese)\s+/i, ''));
  for (const p of RETRO_PLATFORMS) {
    if (normalizeText(p.label) === c || p.aliases.some((a) => normalizeText(a) === c)) return p.id;
  }
  return null;
}

function productOf(item: Json): RetroProduct | null {
  const id = typeof item.id === 'string' || typeof item.id === 'number' ? String(item.id) : null;
  const name = typeof item['product-name'] === 'string' ? item['product-name'].trim() : null;
  const consoleName = typeof item['console-name'] === 'string' ? item['console-name'] : '';
  if (!id || !name) return null;
  return { id, name, platform: platformOf(consoleName), region: consoleName ? regionOf(consoleName) : null };
}

export function parseProducts(body: unknown): RetroProduct[] {
  if (!body || typeof body !== 'object') return [];
  const products = (body as Json).products;
  if (!Array.isArray(products)) return [];
  return (products as Json[]).map(productOf).filter((p): p is RetroProduct => p !== null);
}

export function parsePrices(body: unknown): RetroPrices | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Json;
  const quote = (v: unknown): PriceQuote | null => {
    const value = cents(v);
    return value === null ? null : { value, count: null };
  };
  const loose = quote(o['loose-price']);
  const cib = quote(o['cib-price']);
  const sealed = quote(o['new-price']);
  if (!loose && !cib && !sealed) return null;
  return { currency: CURRENCY, basis: 'guide', updatedAt: null, periodMonths: null, loose, cib, sealed };
}

export const pricechartingPrices: RetroPriceSource = {
  id: 'pricecharting',
  label: 'PriceCharting (cenik retro iger)',

  disabledReason(env) {
    return env.PRICECHARTING_API_KEY ? null : 'Manjka PRICECHARTING_API_KEY (plačljiv vir); retro igre so brez vrednosti.';
  },

  async findProducts(rt, query): Promise<SourceOutcome<RetroProduct[]>> {
    const { env } = rt;
    const q = query.text.trim();
    const url = `${env.PRICECHARTING_URL}/api/products?q=${encodeURIComponent(q)}`;
    const out = await fetchCachedJson(
      {
        usageSource: 'pricecharting',
        cacheKey: `collectibles:pricecharting:search:${createHash('sha256').update(url).digest('hex').slice(0, 24)}`,
        sourceUrl: url,
        buildRequest: () => ({ url: `${url}&t=${encodeURIComponent(env.PRICECHARTING_API_KEY ?? '')}`, headers: { Accept: 'application/json' } }),
        ttlSeconds: env.COLLECTIBLES_CATALOG_CACHE_DAYS * 86_400,
        dailyLimit: env.COLLECTIBLES_PRICECHARTING_DAILY_LIMIT,
        rt: rt as SourceRuntime,
        paceId: 'pricecharting',
        timeoutMs: env.COLLECTIBLES_TIMEOUT_MS,
        logPrefix: 'collectibles',
      },
      'PriceCharting',
    );
    if (!out.ok) return out;
    const products = parseProducts(out.value).filter((p) => query.platform === null || p.platform === null || p.platform === query.platform);
    return { ok: true, value: products, stale: out.stale };
  },

  async getPrices(rt, product): Promise<SourceOutcome<RetroPrices | null>> {
    const { env } = rt;
    const url = `${env.PRICECHARTING_URL}/api/product?id=${encodeURIComponent(product.id)}`;
    const out = await fetchCachedJson(
      {
        usageSource: 'pricecharting',
        cacheKey: `collectibles:pricecharting:product:${product.id}`,
        sourceUrl: url,
        buildRequest: () => ({ url: `${url}&t=${encodeURIComponent(env.PRICECHARTING_API_KEY ?? '')}`, headers: { Accept: 'application/json' } }),
        ttlSeconds: env.COLLECTIBLES_PRICE_CACHE_HOURS * 3600,
        dailyLimit: env.COLLECTIBLES_PRICECHARTING_DAILY_LIMIT,
        rt: rt as SourceRuntime,
        paceId: 'pricecharting',
        timeoutMs: env.COLLECTIBLES_TIMEOUT_MS,
        logPrefix: 'collectibles',
        notFoundAsNull: true,
      },
      'PriceCharting',
    );
    if (!out.ok) return out;
    return { ok: true, value: parsePrices(out.value), stale: out.stale };
  },
};
