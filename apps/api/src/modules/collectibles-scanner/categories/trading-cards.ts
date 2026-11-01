import { z } from 'zod';
import { candidateNameTokens, identifyCard, type CardIdentifyResult } from '../domain/card-identify.js';
import { conditionFromListing } from '../domain/condition.js';
import { canValue } from '../domain/identification.js';
import { nameTokens } from '../domain/text.js';
import { CARD_LANGUAGES, GRADING_COMPANIES, type CardLanguage, type CatalogCard, type CollectibleAttributes, type RawListing } from '../domain/types.js';
import type { FailureCode } from '../sources/types.js';
import type { CategoryHandler, CategoryRun, FieldDescriptor, IdentifiedListing, ValuationParts } from './types.js';

// Kategorija "zbirateljske kartice" (019, FR-005): Pokémon prek TCGdex. Katalog potrdi kartico; cene
// kataloga (Cardmarket) so OCENE neocenjene kartice — za ocenjene kartice ali kartice z več izdajami
// ocene ni (katalog cen ne loči po oceni in izdaji), zato taki oglasi ostanejo brez vrednosti.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Največ ${max} znakov.`)
    .transform((s) => (s.length === 0 ? undefined : s))
    .optional();

export const cardsFilterSchema = z.object({
  game: z.enum(['pokemon']).default('pokemon'),
  setName: optionalText(60),
  cardNumber: z
    .string()
    .trim()
    .transform((s, ctx) => {
      if (s.length === 0) return undefined;
      const m = /^#?(\d{1,3})(?:\s*\/\s*\d{1,3})?$/.exec(s);
      if (!m) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Številka kartice je oblike 4 ali 4/102.' });
        return z.NEVER;
      }
      return String(Number(m[1]));
    })
    .optional(),
  language: z.enum([...CARD_LANGUAGES, 'any']).default('any'),
  edition: z.enum(['first', 'unlimited', 'shadowless', 'any']).default('any'),
  finish: z.enum(['holo', 'reverse', 'normal', 'any']).default('any'),
  gradeStatus: z.enum(['raw', 'graded', 'any']).default('any'),
  gradingCompany: z.enum([...GRADING_COMPANIES, 'any']).default('any'),
  grade: z
    .string()
    .trim()
    .toUpperCase()
    .transform((s, ctx) => {
      if (s.length === 0) return undefined;
      if (!/^(10|[1-9](\.5)?)$/.test(s.replace(',', '.'))) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ocena je od 1 do 10 (npr. 9 ali 9.5).' });
        return z.NEVER;
      }
      return s.replace(',', '.');
    })
    .optional(),
  sealedOnly: z.boolean().default(false),
});

export type CardFilters = z.infer<typeof cardsFilterSchema>;

export interface CardsConfigLike {
  keywords?: string | undefined;
  cards: CardFilters;
}

const LANGUAGE_LABELS: Record<CardLanguage, string> = { en: 'angleščina', de: 'nemščina', fr: 'francoščina', it: 'italijanščina', es: 'španščina', ja: 'japonščina' };

const fields: FieldDescriptor[] = [
  { key: 'cards.setName', label: 'Set', kind: 'text', help: 'Npr. Base Set ali Obsidian Flames.' },
  { key: 'cards.cardNumber', label: 'Številka kartice', kind: 'text', help: 'Npr. 4 ali 4/102.' },
  { key: 'cards.language', label: 'Jezik', kind: 'select', options: [{ value: 'any', label: 'Vsi' }, ...CARD_LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABELS[l] }))], help: 'Oglas mora jezik izrecno navesti.' },
  { key: 'cards.edition', label: 'Izdaja', kind: 'select', options: [{ value: 'any', label: 'Vse' }, { value: 'first', label: 'Prva izdaja' }, { value: 'unlimited', label: 'Unlimited' }, { value: 'shadowless', label: 'Shadowless' }] },
  { key: 'cards.finish', label: 'Površina', kind: 'select', options: [{ value: 'any', label: 'Vse' }, { value: 'holo', label: 'Holo' }, { value: 'reverse', label: 'Reverse holo' }, { value: 'normal', label: 'Navadna' }] },
  { key: 'cards.gradeStatus', label: 'Ocenjevanje', kind: 'select', options: [{ value: 'any', label: 'Vse' }, { value: 'raw', label: 'Neocenjena' }, { value: 'graded', label: 'Ocenjena' }] },
  { key: 'cards.gradingCompany', label: 'Ocenjevalec', kind: 'select', options: [{ value: 'any', label: 'Vsi' }, ...GRADING_COMPANIES.map((g) => ({ value: g, label: g }))] },
  { key: 'cards.grade', label: 'Ocena', kind: 'text', help: 'Npr. 9 ali 9.5; PSA 9 ni enako PSA 10.' },
  { key: 'cards.sealedOnly', label: 'Samo zapečateni izdelki', kind: 'boolean', help: 'Brez tega so zapečateni izdelki (boosterji, škatle) izločeni.' },
];

interface CardRef {
  result: CardIdentifyResult;
}

function attributesOf(listing: RawListing, result: CardIdentifyResult): CollectibleAttributes {
  const { parsed, card, identification } = result;
  const grading = parsed.grading;
  const attrs: CollectibleAttributes = {
    category: 'trading-cards',
    brand: 'Pokémon',
    condition: conditionFromListing('trading-cards', listing.conditionId),
    listingType: listing.listingType,
    card: {
      game: 'pokemon',
      graded: grading !== null ? true : parsed.ungradedMention ? false : null,
      sealed: identification.kind === 'SEALED' ? true : parsed.sealed ? true : null,
    },
  };
  if (card) {
    attrs.name = card.name;
    attrs.catalogId = card.id;
    if (attrs.card) {
      if (card.setId) attrs.card.setId = card.setId;
      if (card.setName) attrs.card.setName = card.setName;
      attrs.card.cardNumber = card.localId;
      if (card.rarity) attrs.card.rarity = card.rarity;
    }
  } else if (parsed.number && attrs.card) {
    attrs.card.cardNumber = parsed.number;
  }
  if (parsed.language) attrs.language = parsed.language;
  if (result.edition) attrs.edition = result.edition;
  if (result.finish && attrs.card) attrs.card.finish = result.finish;
  if (grading) {
    attrs.gradingCompany = grading.company;
    attrs.grade = grading.grade;
  }
  if (listing.sellerCountry) attrs.sellerCountry = listing.sellerCountry;
  if (listing.endsAt) attrs.auctionEnd = listing.endsAt.toISOString();
  return attrs;
}

function matchesFilters(config: CardsConfigLike, result: CardIdentifyResult): boolean {
  const f = config.cards;
  const { parsed, card, identification } = result;
  const sealed = identification.kind === 'SEALED';
  if (f.sealedOnly !== sealed) return false;
  if (sealed) return true; // zapečatenih izdelkov kartični filtri ne opisujejo
  if (f.language !== 'any' && parsed.language !== f.language) return false;
  if (f.cardNumber && (card ? card.localId.replace(/^0+/, '') : parsed.number) !== f.cardNumber) return false;
  if (f.setName) {
    const wanted = nameTokens(f.setName);
    const haystack = new Set(card?.setName ? nameTokens(card.setName) : []);
    if (!(wanted.length > 0 && wanted.every((w) => haystack.has(w)))) return false;
  }
  if (f.edition !== 'any') {
    const e = result.edition;
    const ok = f.edition === 'unlimited' ? e === 'unlimited' || e === 'standard' : e === f.edition;
    if (!ok) return false;
  }
  if (f.finish !== 'any' && result.finish !== f.finish) return false;
  if (f.gradeStatus === 'raw' && (parsed.grading !== null || parsed.gradedMention)) return false;
  if (f.gradeStatus === 'graded' && !(parsed.grading !== null || parsed.gradedMention)) return false;
  if (f.gradingCompany !== 'any' && parsed.grading?.company !== f.gradingCompany) return false;
  if (f.grade && parsed.grading?.grade !== f.grade) return false;
  return true;
}

const STOP_CODES: ReadonlySet<FailureCode> = new Set(['daily-limit', 'unauthorized', 'rate-limited']);

async function lookup(run: CategoryRun, language: CardLanguage, parsedNumber: string | null, tokens: readonly string[]): Promise<CatalogCard[] | null> {
  const catalog = run.sources.cardCatalog;
  if (!catalog) return null;
  const stopKey = `stop:${catalog.id}`;
  if (run.memo.get(stopKey) === true) return null;
  for (const token of tokens) {
    const key = `cards:${language}:${token}:${parsedNumber ?? ''}`;
    if (run.memo.has(key)) {
      const cached = run.memo.get(key) as CatalogCard[];
      if (cached.length > 0) return cached;
      continue;
    }
    if (run.counters.catalogLookups >= run.env.COLLECTIBLES_MAX_CATALOG_LOOKUPS_PER_RUN) return null;
    run.counters.catalogLookups += 1;
    const out = await catalog.searchCards(run.rt, { name: token, language, number: parsedNumber });
    if (!out.ok) {
      run.fail(catalog.id, out.code, out.message);
      if (STOP_CODES.has(out.code)) run.memo.set(stopKey, true);
      return null;
    }
    run.memo.set(key, out.value);
    if (out.value.length > 0) return out.value;
  }
  return [];
}

export const tradingCardsCategory: CategoryHandler<CardsConfigLike> = {
  id: 'trading-cards',
  label: 'Zbirateljske kartice (Pokémon)',
  fields,
  filterSchema: cardsFilterSchema,
  filterKey: 'cards',
  ebayCategoryId: undefined,
  sendEbayConditionIds: false,

  searchText(config) {
    const parts = ['pokemon'];
    if (config.keywords) parts.push(config.keywords);
    const f = config.cards;
    if (f.setName) parts.push(f.setName);
    if (f.cardNumber) parts.push(f.cardNumber);
    if (f.gradingCompany !== 'any') parts.push(f.gradingCompany);
    if (f.grade) parts.push(f.grade);
    if (f.sealedOnly) parts.push('sealed');
    return parts.join(' ');
  },

  hasFilters(config) {
    const f = config.cards;
    return Boolean(f.setName || f.cardNumber || f.language !== 'any' || f.edition !== 'any' || f.finish !== 'any' || f.gradeStatus !== 'any' || f.gradingCompany !== 'any' || f.grade || f.sealedOnly);
  },

  validate(config) {
    const f = config.cards;
    if (f.gradeStatus === 'raw' && (f.gradingCompany !== 'any' || f.grade)) return 'Neocenjena kartica nima ocenjevalca ali ocene.';
    if (f.grade && f.gradingCompany === 'any') return 'Ocena zahteva ocenjevalca (PSA, BGS, CGC ali SGC).';
    if (f.sealedOnly && (f.cardNumber || f.gradeStatus !== 'any' || f.gradingCompany !== 'any' || f.grade)) return 'Zapečateni izdelki nimajo številke kartice ali ocene.';
    return null;
  },

  describe(config) {
    const f = config.cards;
    const parts = ['Pokémon'];
    if (f.setName) parts.push(f.setName);
    if (f.cardNumber) parts.push(`#${f.cardNumber}`);
    if (f.gradingCompany !== 'any') parts.push(`${f.gradingCompany}${f.grade ? ` ${f.grade}` : ''}`);
    else if (f.gradeStatus !== 'any') parts.push(f.gradeStatus === 'raw' ? 'neocenjena' : 'ocenjena');
    if (f.language !== 'any') parts.push(LANGUAGE_LABELS[f.language]);
    return parts;
  },

  async identify(listings, config, run): Promise<IdentifiedListing[]> {
    const out: IdentifiedListing[] = [];
    for (const listing of listings) {
      if (await run.shouldCancel()) return out;
      // Prvi prehod: razčlenitev brez kataloga, da vemo, kaj iskati.
      const first = identifyCard({ title: listing.title, description: listing.description, catalog: [] });
      const parsed = first.parsed;
      let catalog: CatalogCard[] | null = [];
      const needsCatalog = !parsed.proxy && !parsed.lot && !(parsed.sealed && parsed.number === null) && !parsed.unsupportedLanguage;
      if (needsCatalog) {
        const language: CardLanguage = parsed.language ?? 'en';
        const tokens = candidateNameTokens(parsed);
        catalog = tokens.length > 0 ? await lookup(run, language, parsed.number, tokens) : [];
      }
      const result = identifyCard({ title: listing.title, description: listing.description, catalog });
      out.push({
        listing,
        identification: result.identification,
        collectible: attributesOf(listing, result),
        condition: conditionFromListing('trading-cards', listing.conditionId),
        matchesFilters: matchesFilters(config, result),
        ref: { result } satisfies CardRef,
      });
      await run.heartbeat();
    }
    return out;
  },

  async valuate(item): Promise<ValuationParts | null> {
    if (!canValue(item.identification)) return null;
    const { result } = item.ref as CardRef;
    const { card, parsed } = result;
    if (!card) return null;
    if (parsed.grading !== null || parsed.gradedMention) {
      return { estimate: null, sold: null, stale: false, note: 'Katalog ima cene samo za neocenjene kartice; ocenjena kartica nima ocene vrednosti.' };
    }
    if (result.edition !== 'standard') {
      return { estimate: null, sold: null, stale: false, note: 'Katalog ne loči cen po izdaji (prva izdaja, shadowless, unlimited); ocene vrednosti ni.' };
    }
    const p = card.pricing;
    if (!p) return null;
    const value = result.finish === 'reverse' ? p.trendHolo : p.trend;
    if (value === null || value <= 0) return null;
    return {
      estimate: { value, low: p.low, trend: p.trend, source: 'Cardmarket (TCGdex)', updatedAt: p.updatedAt, currency: p.currency, basis: 'estimate' },
      sold: null,
      stale: false,
      note: null,
    };
  },

  riskReservePct(item, env) {
    const { result } = item.ref as CardRef;
    let pct = env.COLLECTIBLES_RISK_RESERVE_PCT_CARDS;
    // Ocena ni preverjena: certifikata iz oglasa ni mogoče potrditi (FR-021).
    if (result.parsed.grading !== null) pct += env.COLLECTIBLES_RISK_UNVERIFIED_GRADE_PCT;
    return pct;
  },
};
