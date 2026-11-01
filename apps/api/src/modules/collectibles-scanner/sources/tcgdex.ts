import { createHash } from 'node:crypto';
import { fetchCachedJson } from '../../../platform/external-sources/http.js';
import type { CardLanguage, CatalogCard, CatalogPricing } from '../domain/types.js';
import type { CardCatalogSource, SourceOutcome, SourceRuntime } from './types.js';

// TCGdex — katalog Pokémon kartic (019, research §3). Brez ključa. Preverjeno z živim klicem (21. 10. 2026):
//   GET /v2/{jezik}/cards?name=…&localId=…  → [{id, localId, name, image?}]   (name = podniz, brez razlike
//                                                v velikosti; filtra se kombinirata)
//   GET /v2/{jezik}/cards/{id}              → ime, redkost, set{id,name,cardCount{official}}, variants{…},
//                                                pricing{cardmarket{updated,unit,avg,low,trend,avg7,avg30,
//                                                trend-holo,…}}
// Japonski katalog ima DRUGE id-je in japonska imena: angleški naslov oglasa se z njim ne ujema (kartica gre
// v ročni pregled, ne v ugibanje). ⚠ Licenca podatkov in meje hitrosti uradno nista potrjeni (research §3):
// konzervativen razmik in dnevna meja.
//
// Cene kataloga (Cardmarket) so OCENE, ne prodaje. Podrobnosti (z ocenami) se predpomnijo po
// `COLLECTIBLES_PRICE_CACHE_HOURS`, seznami po `COLLECTIBLES_CATALOG_CACHE_DAYS`.

export const TCGDEX_GAP_MS = 250;
const MAX_DETAILS = 8;
const MAX_LIST_WITHOUT_NUMBER = 25;

type Json = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}
function imageOf(v: unknown): string | null {
  const url = str(v);
  if (!url) return null;
  try {
    if (new URL(url).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  // Osnovni naslov brez pripone ni slika: dodamo velikost (⚠ potrditi ob prvem pravem klicu).
  return /\.(png|webp|jpg)$/i.test(url) ? url : `${url}/low.webp`;
}

export function parseCardList(body: unknown, language: CardLanguage): Array<{ id: string; localId: string; name: string; imageUrl: string | null; language: CardLanguage }> {
  if (!Array.isArray(body)) return [];
  const out: Array<{ id: string; localId: string; name: string; imageUrl: string | null; language: CardLanguage }> = [];
  for (const item of body as Json[]) {
    const id = str(item?.id);
    const localId = str(item?.localId);
    const name = str(item?.name);
    if (!id || !localId || !name) continue;
    out.push({ id, localId, name, imageUrl: imageOf(item.image), language });
  }
  return out;
}

export function parsePricing(body: unknown): CatalogPricing | null {
  if (!body || typeof body !== 'object') return null;
  const cm = (body as Json).cardmarket;
  if (!cm || typeof cm !== 'object') return null;
  const c = cm as Json;
  const currency = str(c.unit);
  if (!currency) return null;
  return {
    source: 'cardmarket',
    currency: currency.toUpperCase(),
    updatedAt: str(c.updated),
    avg: num(c.avg),
    low: num(c.low),
    trend: num(c.trend),
    avg7: num(c.avg7),
    avg30: num(c.avg30),
    trendHolo: num(c['trend-holo']),
  };
}

export function parseCardDetail(body: unknown, language: CardLanguage): CatalogCard | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Json;
  const id = str(o.id);
  const localId = str(o.localId);
  const name = str(o.name);
  if (!id || !localId || !name) return null;
  const set = (o.set && typeof o.set === 'object' ? o.set : null) as Json | null;
  const count = set && set.cardCount && typeof set.cardCount === 'object' ? (set.cardCount as Json) : null;
  const variants = o.variants && typeof o.variants === 'object' ? (o.variants as Json) : null;
  return {
    id,
    language,
    name,
    localId,
    setId: set ? str(set.id) : null,
    setName: set ? str(set.name) : null,
    setOfficialCount: count ? num(count.official) : null,
    rarity: str(o.rarity),
    imageUrl: imageOf(o.image),
    variants: variants
      ? { firstEdition: bool(variants.firstEdition), holo: bool(variants.holo), normal: bool(variants.normal), reverse: bool(variants.reverse) }
      : null,
    pricing: parsePricing(o.pricing),
  };
}

function sameNumber(localId: string, wanted: string): boolean {
  const a = /^\d+$/.test(localId) ? String(Number(localId)) : localId.toLowerCase();
  return a === wanted;
}

export const tcgdexCatalog: CardCatalogSource = {
  id: 'tcgdex',
  label: 'TCGdex (katalog kartic)',

  disabledReason: () => null,

  async searchCards(rt, query): Promise<SourceOutcome<CatalogCard[]>> {
    const { env } = rt;
    const base = env.TCGDEX_URL.replace(/\/$/, '');
    const common = {
      usageSource: 'tcgdex' as const,
      dailyLimit: env.COLLECTIBLES_TCGDEX_DAILY_LIMIT,
      timeoutMs: env.COLLECTIBLES_TIMEOUT_MS,
      logPrefix: 'collectibles',
      rt: rt as SourceRuntime,
      paceId: 'tcgdex',
    };
    const listUrl = `${base}/${query.language}/cards?name=${encodeURIComponent(query.name)}${query.number ? `&localId=${encodeURIComponent(query.number)}` : ''}`;
    const list = await fetchCachedJson(
      {
        ...common,
        cacheKey: `collectibles:tcgdex:list:${createHash('sha256').update(listUrl).digest('hex').slice(0, 24)}`,
        sourceUrl: listUrl,
        buildRequest: () => ({ url: listUrl, headers: { Accept: 'application/json' } }),
        ttlSeconds: env.COLLECTIBLES_CATALOG_CACHE_DAYS * 86_400,
      },
      'TCGdex',
    );
    if (!list.ok) return list;
    let stale = list.stale;
    const items = parseCardList(list.value, query.language);

    if (!query.number) {
      // Brez številke ni mogoče izbrati ene kartice: osnovni podatki, domena bo sporočila "več kartic".
      const cards: CatalogCard[] = items.slice(0, MAX_LIST_WITHOUT_NUMBER).map((i) => ({
        id: i.id,
        language: i.language,
        name: i.name,
        localId: i.localId,
        setId: null,
        setName: null,
        setOfficialCount: null,
        rarity: null,
        imageUrl: i.imageUrl,
        variants: null,
        pricing: null,
      }));
      return { ok: true, value: cards, stale };
    }

    const wanted = items.filter((i) => sameNumber(i.localId, query.number!)).slice(0, MAX_DETAILS);
    const cards: CatalogCard[] = [];
    for (const item of wanted) {
      const url = `${base}/${query.language}/cards/${encodeURIComponent(item.id)}`;
      const detail = await fetchCachedJson(
        {
          ...common,
          cacheKey: `collectibles:tcgdex:card:${query.language}:${item.id}`,
          sourceUrl: url,
          buildRequest: () => ({ url, headers: { Accept: 'application/json' } }),
          ttlSeconds: env.COLLECTIBLES_PRICE_CACHE_HOURS * 3600,
          notFoundAsNull: true,
        },
        'TCGdex',
      );
      if (!detail.ok) return detail;
      stale = stale || detail.stale;
      const card = parseCardDetail(detail.value, query.language);
      if (card) cards.push(card);
    }
    return { ok: true, value: cards, stale };
  },
};
