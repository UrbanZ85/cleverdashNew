import { unidentified } from './identification.js';
import { parseRetroTitle, RETRO_PLATFORMS, type ParsedRetro } from './retro-parse.js';
import { nameTokens } from './text.js';
import type { Identification, IdentificationConfidence, RetroCompleteness, RetroKind, RetroRegion, RetroWorking } from './types.js';
import { retroVariantKey } from './variant-key.js';

// Prepoznava retro igre ali konzole (019, research §9). Čista funkcija. Brez kataloga je prepoznava samo iz
// besedila in je največ "srednja"; s katalogom (PriceCharting, izbirno) se ime potrdi. Pravila:
//  - platforma, regija in popolnost embalaže so del ključa (loose ≠ CIB, PAL ≠ NTSC);
//  - reprodukcija in paketi nimajo ene različice; pokvarjena konzola ni enaka delujoči;
//  - kar naslov ne pove, je dvoumnost, ne domneva.

/** Katalogni izdelek, normaliziran iz vira (oblika vira je skrita v `sources/`). */
export interface RetroProduct {
  id: string;
  name: string;
  platform: string | null;
  region: RetroRegion | null;
}

const NOISE = new Set([
  'nintendo', 'sega', 'sony', 'game', 'games', 'spiel', 'spiele', 'cartridge', 'cart', 'modul', 'disc', 'console', 'konsole', 'system', 'handheld', 'retro', 'vintage', 'original', 'orig', 'classic',
  'cib', 'loose', 'complete', 'komplett', 'boxed', 'box', 'ovp', 'only', 'nur', 'ohne', 'mit', 'with', 'manual', 'anleitung', 'in', 'and', 'und', 'the', 'no', 'for', 'sale', 'free', 'shipping',
  'tested', 'getestet', 'working', 'funktioniert', 'untested', 'ungetestet', 'defekt', 'defective', 'broken', 'parts', 'good', 'condition', 'zustand', 'sehr', 'gut', 'neu', 'new', 'used', 'gebraucht', 'sealed',
  'pal', 'ntsc', 'usa', 'us', 'eur', 'euro', 'europe', 'uk', 'jap', 'japan', 'japanese', 'jpn', 'jp', 'u', 'c', 'j', 'version', 'region', 'free',
]);

/** Oznake platform kot zaporedja besed (najdaljše prej): odstranijo se kot CELOTE, ne po besedah ("Super Mario" ni "Super Nintendo"). */
const PLATFORM_SEQUENCES: string[][] = RETRO_PLATFORMS.flatMap((p) => p.aliases.map((a) => nameTokens(a))).sort((a, b) => b.length - a.length);

function stripPlatformPhrases(tokens: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const seq = PLATFORM_SEQUENCES.find((s) => s.length > 0 && s.every((w, k) => tokens[i + k] === w));
    if (seq) i += seq.length;
    else out.push(tokens[i++]!);
  }
  return out;
}

/** Normaliziran naslov igre ali konzole brez platforme, regije, popolnosti in drugega šuma; besede razvrščene. */
export function retroTitleKey(text: string): string {
  return stripPlatformPhrases(nameTokens(text))
    .filter((w) => !NOISE.has(w) && w.length > 0)
    .sort()
    .join('-');
}

/** Iskalni niz za katalog: besede naslova brez platforme, regije in šuma, v izvirnem vrstnem redu. */
export function retroSearchText(title: string): string {
  return stripPlatformPhrases(nameTokens(title))
    .filter((w) => !NOISE.has(w))
    .join(' ');
}

export interface RetroIdentifyInput {
  title: string;
  description?: string | null;
  /** Kandidati iz kataloga; `null` = brez kataloga (vir ni vklopljen ali ni bil vprašan). */
  catalog: RetroProduct[] | null;
}

export interface RetroIdentifyResult {
  identification: Identification;
  parsed: ParsedRetro;
  kind: RetroKind | null;
  completeness: RetroCompleteness | null;
  region: RetroRegion | null;
  working: RetroWorking | null;
}

export function identifyRetro(input: RetroIdentifyInput): RetroIdentifyResult {
  const parsed = parseRetroTitle(input.title, input.description);
  const bare = { parsed, kind: parsed.kind, completeness: parsed.completeness, region: parsed.region, working: parsed.working };
  const make = (identification: Identification, over: Partial<RetroIdentifyResult> = {}): RetroIdentifyResult => ({ ...bare, ...over, identification });

  if (parsed.reproduction) return make(unidentified('Naslov omenja reprodukcijo ali nadomestek; ni original.', 'REPRODUCTION'));
  if (parsed.lot) return make(unidentified('Več predmetov v enem oglasu; ni ene različice.', 'LOT'));
  if (parsed.kind === 'accessory') return make(unidentified('Dodatek (krmilnik, kabel …); ni igra ali konzola.', 'ACCESSORY'));
  if (parsed.platform === null) return make({ ...unidentified('Platforma ni prepoznana; ročni pregled.'), needsReview: true });

  const titleKey = retroTitleKey(input.title);
  // Brez besed, ki bi pomenile igro, je izdelek sama konzola (npr. "Game Boy Color Atomic Purple" → barva ostane v ključu).
  const kind: RetroKind = parsed.kind ?? (titleKey === '' || parsed.rest.split(' ').some((w) => ['console', 'konsole', 'handheld'].includes(w)) ? 'console' : 'game');
  if (kind === 'game' && titleKey === '') return make({ ...unidentified('Naslov igre ni razviden; ročni pregled.'), needsReview: true });

  // Katalog: vse besede kataloškega imena morajo biti v naslovu in platforma se mora ujemati.
  const titleWords = new Set(nameTokens(parsed.rest));
  let matched: RetroProduct | null = null;
  if (input.catalog !== null) {
    const hits = input.catalog.filter((p) => {
      const words = nameTokens(p.name).filter((w) => !NOISE.has(w));
      return words.length > 0 && words.every((w) => titleWords.has(w)) && (p.platform === null || p.platform === parsed.platform) && (parsed.region === null || p.region === null || p.region === parsed.region);
    });
    const longest = hits.reduce((m, p) => Math.max(m, nameTokens(p.name).length), 0);
    const best = hits.filter((p) => nameTokens(p.name).length === longest);
    // Ista igra v več regijah: regija iz naslova mora razločiti, sicer ni enolično.
    if (best.length === 1) matched = best[0]!;
  }

  const region = parsed.region ?? matched?.region ?? null;
  const ambiguities: string[] = [];
  if (region === null) ambiguities.push('region');
  if (parsed.completeness === null) ambiguities.push('completeness');
  if (kind === 'console' && parsed.working === null) ambiguities.push('working');

  let confidence: IdentificationConfidence = matched ? 'high' : 'medium';
  if (ambiguities.length > 0 && confidence === 'high') confidence = 'medium';
  const reason = matched ? `Naslov se ujema s katalogom (${matched.name}) in platformo.` : 'Prepoznano samo iz besedila naslova; katalog ni potrdil igre.';
  const notes: string[] = [];
  if (region === null) notes.push('regija ni navedena');
  if (parsed.completeness === null) notes.push('popolnost (loose/CIB) ni navedena');
  if (kind === 'console' && parsed.working === null) notes.push('delovanje ni navedeno');
  if (kind === 'console' && parsed.working === 'not-working') notes.push('konzola je okvarjena');

  const titlePart = matched ? retroTitleKey(matched.name) : titleKey;
  const variantKey =
    region !== null && parsed.completeness !== null && (kind !== 'console' || parsed.working !== null) && parsed.platform
      ? retroVariantKey({ platform: parsed.platform, title: titlePart === '' ? 'console' : titlePart, region, completeness: parsed.completeness, working: kind === 'console' ? parsed.working : null })
      : null;

  return make(
    {
      kind: kind === 'console' ? 'CONSOLE' : 'GAME',
      confidence,
      reason: notes.length > 0 ? `${reason} Opombe: ${notes.join('; ')}.` : reason,
      // Okvarjena konzola ni "ročni pregled" — je jasna različica (not-working), le brez primerljive vrednosti v v1.
      needsReview: false,
      variantKey,
      ambiguities,
      catalog: matched ? { id: matched.id, name: matched.name, setName: matched.platform, number: null, rarity: null, imageUrl: null } : null,
    },
    { kind, region },
  );
}
