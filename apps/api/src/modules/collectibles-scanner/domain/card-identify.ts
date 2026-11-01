import { parseCardTitle, type ParsedCard } from './card-parse.js';
import { unidentified } from './identification.js';
import { nameTokens } from './text.js';
import type { CardFinish, CatalogCard, Identification, IdentificationConfidence } from './types.js';
import { cardVariantKey, type CardEdition } from './variant-key.js';

// Prepoznava Pokémon kartice (019, research §8). Čista funkcija nad razčlenjenim naslovom in kandidati iz
// kataloga (TCGdex). Pravila:
//  - ime kartice se ujema samo, če so VSE besede kataloškega imena v naslovu ("Charizard ex" ≠ "Charizard");
//  - daljše ime ima prednost (naslov "Charizard ex" ujema "Charizard" in "Charizard ex": prvo je podmnožica);
//  - številka in skupno število kartic (4/102) razločita karto med seti;
//  - jezik, izdaja, površina (holo/reverse) in ocena so del ključa različice; kar naslov ne pove in je za
//    primerjavo potrebno, je dvoumnost (`ambiguities`), ne domneva.

/** Besede naslova, ki niso ime kartice (iskanje v katalogu jih ne uporabi kot ime). */
const NOISE = new Set([
  'pokemon', 'pokmon', 'tcg', 'ccg', 'card', 'cards', 'karte', 'karten', 'carte', 'carta', 'cartas', 'kartica', 'trading', 'game',
  'holo', 'holofoil', 'foil', 'reverse', 'rare', 'rarity', 'common', 'uncommon', 'mint', 'near', 'nm', 'mt', 'gem', 'lp', 'ex', 'gx', 'vmax', 'vstar', 'v',
  'psa', 'bgs', 'cgc', 'sgc', 'beckett', 'graded', 'slab', 'raw', 'ungraded', 'english', 'englisch', 'german', 'deutsch', 'japanese', 'japanisch', 'french', 'italian', 'spanish',
  'jap', 'jpn', 'jp', 'eng', 'en', 'de', 'fr', 'it', 'es', 'ger', '1st', 'first', 'edition', 'unlimited', 'shadowless', 'set', 'base', 'the', 'and', 'und', 'mit', 'ovp', 'neu', 'new',
  'sealed', 'top', 'sehr', 'gut', 'selten', 'rar', 'original', 'orig', 'sammelkarte', 'tauschkarte', 'sammelkarten', 'no', 'nr', 'nummer', 'with', 'for', 'sale', 'free', 'shipping',
]);

/** Kandidati za ime v katalogu: prve besede naslova, ki niso šum, številka ali ocena (največ 3). */
export function candidateNameTokens(parsed: ParsedCard): string[] {
  const out: string[] = [];
  for (const w of nameTokens(parsed.rest)) {
    if (NOISE.has(w) || /^\d+$/.test(w) || w.length < 3 || /^(psa|bgs|cgc|sgc)\d/.test(w)) continue;
    if (!out.includes(w)) out.push(w);
    if (out.length >= 3) break;
  }
  return out;
}

export interface CardIdentifyInput {
  title: string;
  description?: string | null;
  /** Kandidati iz kataloga v jeziku oglasa; `null` = katalog ni bil vprašan ali ni na voljo. */
  catalog: CatalogCard[] | null;
}

export interface CardIdentifyResult {
  identification: Identification;
  parsed: ParsedCard;
  card: CatalogCard | null;
  edition: CardEdition | null;
  finish: CardFinish | null;
}

function localIdOf(card: CatalogCard): string {
  const n = Number(card.localId);
  return Number.isFinite(n) && /^\d+$/.test(card.localId) ? String(n) : card.localId.toLowerCase();
}

function finishesOf(card: CatalogCard): CardFinish[] {
  const v = card.variants;
  if (!v) return [];
  const out: CardFinish[] = [];
  if (v.normal) out.push('normal');
  if (v.holo) out.push('holo');
  if (v.reverse) out.push('reverse');
  return out;
}

function rank(c: IdentificationConfidence): number {
  return c === 'high' ? 3 : c === 'medium' ? 2 : c === 'low' ? 1 : 0;
}

export function identifyCard(input: CardIdentifyInput): CardIdentifyResult {
  const parsed = parseCardTitle(input.title, input.description);
  const base = { parsed, card: null, edition: null, finish: null } as const;
  const make = (identification: Identification): CardIdentifyResult => ({ ...base, identification });

  if (parsed.proxy) return make(unidentified('Naslov omenja reprodukcijo ali proxy; ni originalna kartica.', 'PROXY'));
  if (parsed.lot) return make(unidentified('Več kartic v enem oglasu; ni ene različice.', 'LOT'));
  if (parsed.sealed && parsed.number === null) return make(unidentified('Zapečaten izdelek (booster, škatla); ni posamezna kartica.', 'SEALED'));
  if (parsed.unsupportedLanguage) return make({ ...unidentified('Jezik kartice ni podprt v katalogu; ročni pregled.'), needsReview: true });

  if (input.catalog === null) {
    return make({ ...unidentified('Katalog kartic ni na voljo; kartica ni potrjena.'), kind: 'CARD', confidence: 'low', needsReview: true, ambiguities: ['catalog'] });
  }

  const titleTokens = new Set(nameTokens(parsed.rest));
  // Ime: vse besede kataloškega imena morajo biti v naslovu.
  const named = input.catalog.filter((c) => {
    const tokens = nameTokens(c.name);
    return tokens.length > 0 && tokens.every((t) => titleTokens.has(t));
  });
  const longest = named.reduce((m, c) => Math.max(m, nameTokens(c.name).length), 0);
  let candidates = named.filter((c) => nameTokens(c.name).length === longest);

  if (candidates.length === 0) return make({ ...unidentified('Ime kartice v katalogu ni najdeno.'), needsReview: true });

  const withNumber = parsed.number !== null ? candidates.filter((c) => localIdOf(c) === parsed.number) : candidates;
  if (parsed.number !== null && withNumber.length === 0) return make({ ...unidentified(`Kartica z imenom in številko ${parsed.number} ni v katalogu.`), needsReview: true });
  candidates = withNumber;

  if (parsed.printedTotal !== null) {
    const byTotal = candidates.filter((c) => c.setOfficialCount === null || String(c.setOfficialCount) === parsed.printedTotal);
    if (byTotal.length > 0) candidates = byTotal;
  }
  // Set iz besedila (vse besede imena seta v naslovu).
  const bySet = candidates.filter((c) => c.setName !== null && nameTokens(c.setName).every((t) => titleTokens.has(t)));
  const setMatched = bySet.length > 0;
  if (bySet.length > 0) candidates = bySet;

  if (candidates.length > 1) {
    const reason = parsed.number === null ? 'Več kartic z istim imenom in brez številke; ročni pregled.' : 'Več kartic z istim imenom in številko v različnih setih; ročni pregled.';
    return make({ ...unidentified(reason), kind: 'CARD', confidence: 'low', needsReview: true, ambiguities: ['card'] });
  }

  const card = candidates[0]!;
  const totalMatched = parsed.printedTotal !== null && card.setOfficialCount !== null && String(card.setOfficialCount) === parsed.printedTotal;
  let confidence: IdentificationConfidence;
  let reason: string;
  if (parsed.number !== null && (setMatched || totalMatched)) {
    confidence = 'high';
    reason = `Ime, številka ${card.localId}${totalMatched ? `/${card.setOfficialCount}` : ''} in set ${card.setName ?? ''} se ujemajo s katalogom.`.replace(/ {2,}/g, ' ');
  } else if (parsed.number !== null) {
    confidence = 'medium';
    reason = 'Ime in številka se ujemata s katalogom; set v naslovu ni naveden.';
  } else {
    confidence = 'low';
    reason = 'Samo ime se ujema s katalogom (ena kartica); številka ni navedena.';
  }

  const ambiguities: string[] = [];
  const language = parsed.language;
  if (language === null) ambiguities.push('language');
  else if (language !== card.language) ambiguities.push('language');

  // Izdaja: kjer kartica obstaja kot prva izdaja ali shadowless, naslov pa tega ne pove, je ocena napačna.
  let edition: CardEdition | null = null;
  const firstPossible = card.variants?.firstEdition ?? null;
  if (parsed.firstEdition) {
    if (firstPossible === false) {
      return make({ ...unidentified('Naslov omenja prvo izdajo, katalog te kartice kot prve izdaje ne pozna; ročni pregled.'), kind: 'CARD', confidence: 'low', needsReview: true });
    }
    edition = 'first';
  } else if (parsed.shadowless) edition = 'shadowless';
  else if (firstPossible === false) edition = 'standard';
  else if (parsed.unlimited) edition = 'unlimited';
  else ambiguities.push('edition');

  // Površina.
  const finishes = finishesOf(card);
  let finish: CardFinish | null = null;
  if (parsed.reverseHolo) finish = 'reverse';
  else if (parsed.holo) finish = 'holo';
  else if (finishes.length === 1) finish = finishes[0]!;
  else if (finishes.length === 0) finish = null;
  else ambiguities.push('finish');
  if (finish !== null && finishes.length > 0 && !finishes.includes(finish)) {
    return make({ ...unidentified(`Naslov omenja površino ${finish}, ki je katalog za to kartico ne pozna; ročni pregled.`), kind: 'CARD', confidence: 'low', needsReview: true });
  }
  if (finish === null && finishes.length === 0) ambiguities.push('finish');

  // Ocena.
  const grading = parsed.grading;
  if (parsed.gradedMention && grading === null) ambiguities.push('grade');

  if (language === null || language !== card.language) confidence = rank(confidence) > 2 ? 'medium' : confidence;

  const needsReview = rank(confidence) < 2 || ambiguities.includes('edition') || ambiguities.includes('grade');
  let variantKey: string | null = null;
  if (edition !== null && finish !== null && language !== null && language === card.language && !ambiguities.includes('grade')) {
    variantKey = cardVariantKey({ catalogId: card.id, language, edition, finish, grading });
  }

  const extra: string[] = [];
  if (ambiguities.includes('language')) extra.push('jezik ni naveden');
  if (ambiguities.includes('edition')) extra.push('izdaja ni navedena (kartica obstaja kot prva izdaja)');
  if (ambiguities.includes('finish')) extra.push('površina (holo/reverse) ni navedena');
  if (ambiguities.includes('grade')) extra.push('ocena ni razvidna');
  if (grading === null && !parsed.gradedMention) extra.push('naslov ne omenja ocenjevanja: obravnavano kot neocenjena');

  return {
    parsed,
    card,
    edition,
    finish,
    identification: {
      kind: 'CARD',
      confidence,
      reason: extra.length > 0 ? `${reason} Opombe: ${extra.join('; ')}.` : reason,
      needsReview,
      variantKey,
      ambiguities,
      catalog: { id: card.id, name: card.name, setName: card.setName, number: card.localId, rarity: card.rarity, imageUrl: card.imageUrl },
    },
  };
}
