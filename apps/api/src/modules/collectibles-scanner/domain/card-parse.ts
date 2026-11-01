import type { CardLanguage, GradingCompany } from './types.js';
import { hasWord, normalizeText } from './text.js';

// Razčlenitev naslova oglasa za Pokémon kartico (019, research §8). Čista funkcija: vrne SAMO to, kar
// naslov (in kratek opis) izrecno pove. Kar ne piše, ostane `null` — jezik, izdaja in ocena se nikoli
// ne domnevajo (FR-016).

export interface ParsedCard {
  /** Številka kartice (`4` iz `4/102`), brez vodilnih ničel; `null`, kadar je naslov ne vsebuje. */
  number: string | null;
  /** Skupno število kartic v setu (`102`); `null`, kadar ni navedeno. */
  printedTotal: string | null;
  language: CardLanguage | null;
  /** Jezik je omenjen, a ga katalog ne podpira (npr. korejščina): primerjava ni mogoča. */
  unsupportedLanguage: boolean;
  firstEdition: boolean;
  shadowless: boolean;
  /** Izrecno "unlimited". */
  unlimited: boolean;
  reverseHolo: boolean;
  holo: boolean;
  /** Ocenjevalec in ocena iz naslova (`PSA 9` → PSA, "9"). */
  grading: { company: GradingCompany; grade: string } | null;
  /** Omenjena ocena ali ocenjevalec brez razbrane ocene (npr. "PSA graded", "slab"). */
  gradedMention: boolean;
  /** Izrecno "ungraded" / "raw" / "nicht gegradet". */
  ungradedMention: boolean;
  sealed: boolean;
  /** Več kartic naenkrat (lot, bundle, sammlung, "x10"). */
  lot: boolean;
  /** Reprodukcija ali nadomestek (proxy, custom, fan made, replica). */
  proxy: boolean;
  /** Besede naslova brez prepoznanih oznak — kandidat za ime kartice in seta. */
  rest: string;
}

const COMPANY_PATTERN = '(psa|bgs|beckett|cgc|sgc)';
const GRADE_PATTERN = '(10|[1-9](?:[.,]5)?)';

function companyOf(token: string): GradingCompany {
  const t = token.toLowerCase();
  if (t === 'psa') return 'PSA';
  if (t === 'cgc') return 'CGC';
  if (t === 'sgc') return 'SGC';
  return 'BGS';
}

const LANGUAGE_WORDS: ReadonlyArray<{ lang: CardLanguage | 'unsupported'; words: string[] }> = [
  { lang: 'ja', words: ['japanese', 'japanisch', 'japonska', 'japonski', 'japonais', 'giapponese', 'japones', 'jap', 'jpn', 'jp', '日本語'] },
  { lang: 'en', words: ['english', 'englisch', 'angleska', 'anglais', 'inglese', 'ingles', 'eng', 'en'] },
  { lang: 'de', words: ['german', 'deutsch', 'nemska', 'allemand', 'tedesco', 'aleman', 'ger', 'deu', 'de'] },
  { lang: 'fr', words: ['french', 'franzosisch', 'francais', 'francese', 'frances', 'fra', 'fr'] },
  { lang: 'it', words: ['italian', 'italienisch', 'italiano', 'italiana', 'ita'] },
  { lang: 'es', words: ['spanish', 'spanisch', 'espanol', 'espagnol', 'spagnolo', 'esp'] },
  { lang: 'unsupported', words: ['korean', 'koreanisch', 'koreano', 'chinese', 'chinesisch', 'thai', 'indonesian'] },
];

export function parseCardTitle(title: string, description?: string | null): ParsedCard {
  // Decimalna vejica ("BGS 9,5") bi se pri normalizaciji spremenila v presledek in ocena bi bila napačna.
  const decimal = (s: string) => s.replace(/(\d),(\d)/g, '$1.$2');
  const text = normalizeText(decimal(description ? `${title} ${description}` : title));
  // Naslov je glavni vir; opis samo dopolni oznake, ne ime.
  const t = normalizeText(decimal(title));

  let number: string | null = null;
  let printedTotal: string | null = null;
  const slash = /(?:^|\s)#?(\d{1,3})\s*\/\s*(\d{1,3})(?=\s|$)/.exec(text);
  if (slash) {
    number = String(Number(slash[1]));
    printedTotal = String(Number(slash[2]));
  } else {
    const hash = /(?:^|\s)#\s?(\d{1,3})(?=\s|$)/.exec(text);
    if (hash) number = String(Number(hash[1]));
  }

  // Ocena: "psa 9", "psa9", "psa gem mint 10", "bgs 9.5", "cgc10".
  let grading: ParsedCard['grading'] = null;
  const gradeDirect = new RegExp(`(?:^|\\s)${COMPANY_PATTERN}\\s*#?\\s*${GRADE_PATTERN}(?=\\s|$)`).exec(text);
  const gradeWords = new RegExp(`(?:^|\\s)${COMPANY_PATTERN}\\s+(?:gem\\s*mint|mint|nm\\s*mt|near\\s*mint|graded)\\s*${GRADE_PATTERN}(?=\\s|$)`).exec(text);
  const gradeMatch = gradeDirect ?? gradeWords;
  if (gradeMatch) grading = { company: companyOf(gradeMatch[1]!), grade: gradeMatch[2]!.replace(',', '.') };
  const companyMention = new RegExp(`(?:^|\\s)${COMPANY_PATTERN}(?=\\s|$)`).test(text);
  const gradedMention = grading !== null || companyMention || hasWord(text, 'graded', 'slab', 'slabbed', 'gegradet', 'bewertet', 'gradiert');
  const ungradedMention = hasWord(text, 'ungraded', 'raw', 'nicht gegradet', 'ungegradet', 'unbewertet');

  const firstEdition = /(?:^|\s)(?:1st|first|1\.|erst(?:e|ausgabe)?|1)\s*(?:edition|ed|auflage|ausgabe)(?=\s|$)/.test(text) || hasWord(text, '1st ed', '1e editie', 'premiere edition');
  const shadowless = hasWord(text, 'shadowless', 'shadow less', 'ohne schatten');
  const unlimited = hasWord(text, 'unlimited', 'unlimitiert', 'unlimitierte');
  const reverseHolo = /(?:^|\s)reverse\s*(?:holo|foil)?(?=\s|$)/.test(text) || hasWord(text, 'revers holo');
  const holo = !reverseHolo && hasWord(text, 'holo', 'holofoil', 'holographic', 'foil', 'holographisch');

  let language: CardLanguage | null = null;
  let unsupportedLanguage = false;
  const words = new Set(text.split(' '));
  for (const entry of LANGUAGE_WORDS) {
    if (entry.words.some((w) => words.has(w))) {
      if (entry.lang === 'unsupported') unsupportedLanguage = true;
      else if (language === null) language = entry.lang;
    }
  }
  // Zapis z več jeziki ("english german") ni en jezik.
  const langHits = LANGUAGE_WORDS.filter((e) => e.lang !== 'unsupported' && e.words.some((w) => words.has(w))).length;
  if (langHits > 1) language = null;

  const sealed = hasWord(text, 'sealed', 'versiegelt', 'ovp', 'booster', 'etb', 'display', 'blister', 'tin', 'sammelkoffer', 'elite trainer box', 'booster box', 'booster bundle', 'zapecateno');
  const lot = /(?:^|\s)(?:x\s?\d{2,}|\d{2,}\s?x)(?=\s|$)/.test(t) || hasWord(t, 'lot', 'bundle', 'konvolut', 'sammlung', 'mixed', 'cards lot', 'job lot', 'paket', 'set of', 'karten lot') || /(?:^|\s)\d{2,}\s+(?:cards|karten|carte|cartas)(?=\s|$)/.test(t);
  const proxy = hasWord(text, 'proxy', 'custom', 'fan made', 'fanmade', 'replica', 'reproduction', 'repro', 'nachdruck', 'fake', 'orica', 'gold metal', 'metal card', 'unofficial', 'inoffiziell');

  const consumed = new Set([
    ...(slash ? [`${slash[1]}/${slash[2]}`] : []),
  ]);
  const rest = t
    .split(' ')
    .filter((w) => !consumed.has(w))
    .join(' ')
    .trim();

  return { number, printedTotal, language, unsupportedLanguage, firstEdition, shadowless, unlimited, reverseHolo, holo, grading, gradedMention, ungradedMention, sealed, lot, proxy, rest };
}
