import type { Env } from '../../../platform/config/env.js';
import type { CatalogSet } from '../domain/types.js';
import { normalizeSetNumber } from '../domain/set-number.js';
import { fetchCachedJson } from './http.js';
import type { CatalogSource, SourceOutcome, SourceRuntime } from './types.js';

// Rebrickable — KATALOG setov (018, research §3). NI vir cen. Ključ v glavi `Authorization: key …`
// (nikoli v URL: URL pristane v `ExternalCache.sourceUrl` in v dnevniku, člen IV). ~1 zahteva/s, ob
// prekoračitvi 429 (ignoriranje vodi v ban IP) → razmik 1100 ms, en klic naenkrat.
//
// Oblika odgovorov (set_num, name, year, theme_id, num_parts, set_img_url, set_url; teme id/parent_id/
// name) je iz javne dokumentacije; razčlenitev je TOLERANTNA: manjkajoče ali napačno tipizirano polje je
// `null`, nikoli izmišljena vrednost. Potrditev ob prvem pravem klicu je v quickstartu.

export const REBRICKABLE_GAP_MS = 1100;

type Json = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}
function int(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null;
}
function httpsUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    return new URL(s).protocol === 'https:' ? s : null;
  } catch {
    return null;
  }
}

export interface ThemeInfo {
  id: number;
  parentId: number | null;
  name: string;
}

export function parseThemes(body: unknown): Map<number, ThemeInfo> {
  const out = new Map<number, ThemeInfo>();
  const results = body && typeof body === 'object' ? (body as Json).results : null;
  if (!Array.isArray(results)) return out;
  for (const row of results as Json[]) {
    const id = int(row?.id);
    const name = str(row?.name);
    if (id === null || name === null) continue;
    out.set(id, { id, parentId: int(row?.parent_id), name });
  }
  return out;
}

/** Tema = koren verige, podtema = tema seta, kadar ima starša. */
export function resolveTheme(themeId: number | null, themes: ReadonlyMap<number, ThemeInfo>): { theme: string | null; subtheme: string | null } {
  if (themeId === null) return { theme: null, subtheme: null };
  const own = themes.get(themeId);
  if (!own) return { theme: null, subtheme: null };
  let root = own;
  const seen = new Set<number>([own.id]);
  while (root.parentId !== null) {
    const parent = themes.get(root.parentId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    root = parent;
  }
  return root.id === own.id ? { theme: own.name, subtheme: null } : { theme: root.name, subtheme: own.name };
}

export function parseSet(row: unknown, themes: ReadonlyMap<number, ThemeInfo> = new Map()): CatalogSet | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Json;
  const setNumber = normalizeSetNumber(str(r.set_num) ?? '');
  const name = str(r.name);
  if (!setNumber || !name) return null;
  const themeId = int(r.theme_id);
  const { theme, subtheme } = resolveTheme(themeId, themes);
  return {
    setNumber,
    name,
    year: int(r.year),
    themeId,
    theme,
    subtheme,
    pieces: int(r.num_parts),
    imageUrl: httpsUrl(r.set_img_url),
    url: httpsUrl(r.set_url),
  };
}

export function parseSetList(body: unknown, themes: ReadonlyMap<number, ThemeInfo> = new Map()): CatalogSet[] {
  const results = body && typeof body === 'object' ? (body as Json).results : null;
  if (!Array.isArray(results)) return [];
  return results.map((row) => parseSet(row, themes)).filter((s): s is CatalogSet => s !== null);
}

function headers(env: Env): Record<string, string> {
  return { Authorization: `key ${env.REBRICKABLE_API_KEY}`, Accept: 'application/json' };
}

async function loadThemes(rt: SourceRuntime): Promise<Map<number, ThemeInfo>> {
  const { env } = rt;
  const out = await fetchCachedJson(
    {
      usageSource: 'rebrickable',
      cacheKey: 'lego:rebrickable:themes',
      sourceUrl: `${env.REBRICKABLE_URL}/lego/themes/`,
      buildRequest: () => ({ url: `${env.REBRICKABLE_URL}/lego/themes/?page_size=1000`, headers: headers(env) }),
      ttlSeconds: env.LEGO_CATALOG_CACHE_DAYS * 86_400,
      dailyLimit: env.LEGO_REBRICKABLE_DAILY_LIMIT,
      rt,
      paceId: 'rebrickable',
    },
    'Rebrickable',
  );
  // Teme so dodatek: brez njih sta tema in podtema `null`, set sam je še vedno prepoznan.
  return out.ok ? parseThemes(out.value) : new Map();
}

export const rebrickableCatalog: CatalogSource = {
  id: 'rebrickable',
  label: 'Rebrickable',

  disabledReason(env) {
    return env.REBRICKABLE_API_KEY ? null : 'Ključ REBRICKABLE_API_KEY ni nastavljen.';
  },

  async getSet(rt, setNumber): Promise<SourceOutcome<CatalogSet | null>> {
    const { env } = rt;
    const out = await fetchCachedJson(
      {
        usageSource: 'rebrickable',
        cacheKey: `lego:rebrickable:set:${setNumber}`,
        sourceUrl: `${env.REBRICKABLE_URL}/lego/sets/${setNumber}/`,
        buildRequest: () => ({ url: `${env.REBRICKABLE_URL}/lego/sets/${encodeURIComponent(setNumber)}/`, headers: headers(env) }),
        ttlSeconds: env.LEGO_CATALOG_CACHE_DAYS * 86_400,
        dailyLimit: env.LEGO_REBRICKABLE_DAILY_LIMIT,
        rt,
        paceId: 'rebrickable',
        notFoundAsNull: true,
      },
      'Rebrickable',
    );
    if (!out.ok) return out;
    if (out.value === null) return { ok: true, value: null, stale: out.stale };
    const themes = await loadThemes(rt);
    return { ok: true, value: parseSet(out.value, themes), stale: out.stale };
  },

  async searchByName(rt, query): Promise<SourceOutcome<CatalogSet[]>> {
    const { env } = rt;
    const q = query.trim().slice(0, 80);
    if (q.length < 3) return { ok: true, value: [], stale: false };
    const out = await fetchCachedJson(
      {
        usageSource: 'rebrickable',
        cacheKey: `lego:rebrickable:search:${q.toLowerCase()}`,
        sourceUrl: `${env.REBRICKABLE_URL}/lego/sets/`,
        buildRequest: () => ({ url: `${env.REBRICKABLE_URL}/lego/sets/?search=${encodeURIComponent(q)}&page_size=10&ordering=-year`, headers: headers(env) }),
        ttlSeconds: 7 * 86_400,
        dailyLimit: env.LEGO_REBRICKABLE_DAILY_LIMIT,
        rt,
        paceId: 'rebrickable',
      },
      'Rebrickable',
    );
    if (!out.ok) return out;
    const themes = await loadThemes(rt);
    return { ok: true, value: parseSetList(out.value, themes), stale: out.stale };
  },
};
