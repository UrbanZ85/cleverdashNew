import { extractSetNumbers } from './set-number.js';

// Vrsta oglasa (018, FR-012): ali je to set, ali pa paket, deli, minifigura ali prazna škatla.
// Čista funkcija nad naslovom (in kratkim opisom). Vrstni red pravil je POMEMBEN in testiran:
//
//   1. prazna škatla   — "nur leere Box 75192" ima številko seta, a seta ni;
//   2. paket           — več različnih številk ali beseda paket/zbirka/bundle/lot;
//   3. deli            — izrecne besedne zveze za LOSE dele ("Konvolut", "Ersatzteile", "parts only");
//                        gola beseda "Teile" NE šteje: "7541 Teile" je število kock celega seta;
//   4. minifigura      — samo, kadar ni številke seta ali oglas pravi "samo figura".
//
// Pravila so večjezična (de/it/en/sl), ker sta tržnici DE in IT. Pravila NE ugibajo: kar nobeno ne
// ujame, je kandidat za set in o njem odloči identifikacija (identify.ts).

export type ListingKind = 'EMPTY_BOX' | 'BUNDLE' | 'PARTS' | 'MINIFIG' | 'CANDIDATE';

export interface Classified {
  kind: ListingKind;
  /** Različne številke setov v besedilu. */
  numbers: string[];
  reason: string;
}

const EMPTY_BOX = new RegExp(
  [
    'leere?[rsmn]?\\s+(?:original\\s*)?(?:box|verpackung|schachtel|karton|packung)',
    'nur\\s+(?:die\\s+|der\\s+|eine\\s+)?(?:leere?[rsmn]?\\s+)?(?:original\\s*)?(?:box|verpackung|schachtel|karton)',
    '(?:box|verpackung|karton|schachtel)\\s+(?:nur|ohne\\s+inhalt|leer)',
    'ohne\\s+inhalt',
    'empty\\s+(?:box|packaging|carton)',
    '(?:box|carton|packaging)\\s+only',
    'only\\s+(?:the\\s+)?(?:empty\\s+)?(?:box|carton)',
    'scatola\\s+vuota',
    'solo\\s+(?:la\\s+)?(?:scatola|box|confezione)',
    'senza\\s+contenuto',
    'prazna\\s+(?:škatl\\w*|embalaž\\w*)',
    'samo\\s+(?:škatl\\w*|embalaž\\w*)',
  ].join('|'),
  'i',
);

const BUNDLE_WORDS = new RegExp(
  [
    '\\bbundle\\b',
    '\\bpaket\\b',
    '\\bsammlung\\b',
    '\\bcollection\\b',
    '\\bcollezione\\b',
    '\\bkolekcij\\w*',
    '\\blotto\\b',
    '\\bsets?\\s+lot\\b',
    '\\b(?:mehrere|viele|zwei|drei|vier)\\s+sets?\\b',
    '\\b[2-9]\\s*(?:x\\s*)?(?:lego\\s*)?sets\\b',
    '\\b(?:2|3|4|5)\\s*x\\s*lego\\b',
    '\\bset\\s*(?:\\+|und|and|e)\\s*set\\b',
    '\\bgro(?:ss|ß)es?\\s+konvolut\\b',
  ].join('|'),
  'i',
);

const PARTS = new RegExp(
  [
    '\\bkonvolut\\b',
    '\\bersatzteil\\w*',
    '\\beinzelteil\\w*',
    '\\bnur\\s+teile\\b',
    '\\blose\\s+(?:steine|teile|bausteine)\\b',
    '\\b(?:lego\\s+)?steine\\s+(?:lot|mix|sammlung|kiloweise)\\b',
    '\\bkiloweise\\b',
    '\\bparts?\\s+(?:only|lot)\\b',
    '\\b(?:spare|loose|bulk)\\s+(?:parts?|bricks?|pieces?)\\b',
    '\\bbricks?\\s+(?:lot|mix|bulk)\\b',
    '\\bfor\\s+parts\\b',
    '\\bpezzi\\s+(?:sfusi|di\\s+ricambio)\\b',
    '\\bmattoncini\\s+sfusi\\b',
    '\\bsfus[io]\\b',
    '\\bricambi\\b',
    '\\bdelcki\\b',
    '\\bdelčki\\b',
    '\\bposamezni\\s+deli\\b',
    '\\bdeli\\s+(?:seta|sklopov)\\b',
  ].join('|'),
  'i',
);

const MINIFIG = /\b(?:minifig(?:ur(?:e|en|es|a)?)?s?|mini[-\s]?fig(?:ure)?s?|figur(?:a|e|en)?|personagg(?:io|i)|minifigurk\w*)\b/i;
const FIGURE_ONLY = /\b(?:nur|only|solo|samo)\s+(?:\w+\s+){0,2}(?:minifig\w*|figur\w*|personagg\w*)\b/i;

export function classifyListing(title: string, description: string | null = null): Classified {
  const text = description ? `${title} ${description}` : title;
  const numbers = extractSetNumbers(title);
  const textNumbers = description ? extractSetNumbers(text) : numbers;

  if (EMPTY_BOX.test(text)) {
    return { kind: 'EMPTY_BOX', numbers, reason: 'Oglas ponuja samo prazno škatlo, ne seta.' };
  }
  if (textNumbers.length >= 2 || BUNDLE_WORDS.test(text)) {
    return {
      kind: 'BUNDLE',
      numbers: textNumbers,
      reason: textNumbers.length >= 2 ? `V oglasu je več različnih številk setov (${textNumbers.join(', ')}); to je paket.` : 'Oglas ponuja paket ali zbirko, ne enega seta.',
    };
  }
  if (PARTS.test(text)) {
    return { kind: 'PARTS', numbers, reason: 'Oglas ponuja posamezne dele, ne kompletnega seta.' };
  }
  if (FIGURE_ONLY.test(text) || (MINIFIG.test(title) && numbers.length === 0)) {
    return { kind: 'MINIFIG', numbers, reason: 'Oglas ponuja minifiguro, ne seta.' };
  }
  return { kind: 'CANDIDATE', numbers, reason: 'Oglas je kandidat za set.' };
}
