// Številka LEGO seta (018, FR-011). Čista funkcija: iz besedila izlušči kandidate in jih normalizira
// v obliko kataloga `NNNNN-V` (Rebrickable). Uradne številke setov so 4–6 mestne; krajše so deli ali
// naključne številke, daljše EAN/telefon. Letnice (1949–2100) in datumi se ne štejejo za set, razen
// kadar jih spremlja pripona `-1` ali beseda "set/nr/no/art" tik pred njimi.

const CANDIDATE = /(?<!\d)(\d{4,6})(?:-(\d{1,2}))?(?!\d)/g;
const CONTEXT = /(?:set|nr\.?|no\.?|art\.?|n°|#|lego)\s*$/i;
const UNIT_AFTER = /^\s?(?:teile|teilen|pieces|piece|pcs|st[uü]ck|stk|pz|kosov|kosi|euro|eur|€|cm|mm|kg|g\b|ml|jahre|anni|years|\/)/i;

function isYearLike(n: number): boolean {
  return n >= 1949 && n <= 2100;
}

/** `75192`, `75192-1`, `LEGO 75192` → `75192-1`. Neveljavno → `null`. */
export function normalizeSetNumber(input: string): string | null {
  const m = /^\s*(?:lego\s*)?(\d{4,6})(?:-(\d{1,2}))?\s*$/i.exec(input);
  if (!m) return null;
  return `${m[1]}-${m[2] ?? '1'}`;
}

/** Vsi različni kandidati za številko seta v besedilu, v vrstnem redu pojavitve. */
export function extractSetNumbers(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(CANDIDATE)) {
    const digits = match[1]!;
    const variant = match[2];
    const index = match.index ?? 0;
    const end = index + match[0].length;
    const before = text.slice(Math.max(0, index - 8), index);
    const after = text.slice(end, end + 12);
    const prev = index > 0 ? text[index - 1]! : ' ';
    // Oznake z črkami ("sw0123", "sp45", "col12") so kode minifigur/delov, ne seti; edina izjema je zlepljeno "LEGO75192".
    const letters = /([a-zA-Z]+)$/.exec(text.slice(0, index))?.[1]?.toLowerCase();
    if (letters && !/^(lego|nr|no|art|set)$/.test(letters) && /[a-zA-Z]/.test(prev)) continue;
    if (digits.startsWith('0')) continue;
    // Del večje številke ali datuma/cene ("21.10.2026", "1.299", "12,500"): ni set.
    if ('.,/'.includes(prev) && /\d/.test(text[index - 2] ?? '')) continue;
    if (/^[.,/]\d/.test(after)) continue;
    if (UNIT_AFTER.test(after)) continue;
    const n = Number(digits);
    if (digits.length === 4 && isYearLike(n) && !variant && !CONTEXT.test(before)) continue;
    if (/^0+$/.test(digits)) continue;
    const normalized = `${digits}-${variant ?? '1'}`;
    if (!found.includes(normalized)) found.push(normalized);
  }
  return found;
}

/** Ime seta za primerjavo: brez šumnikov, ločil in besed, ki niso ime ("lego", "set", "neu"…). */
export function normalizeName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 0 && !NOISE.has(w))
    .join(' ');
}

const NOISE = new Set([
  'lego', 'set', 'neu', 'new', 'nuovo', 'novo', 'ovp', 'originalverpackt', 'sealed', 'versiegelt', 'misb', 'nib', 'nisb',
  'sigillato', 'scatola', 'box', 'ungeoeffnet', 'ungeoffnet', 'mit', 'und', 'the', 'der', 'die', 'das', 'il', 'di', 'e', 'a',
  'gebraucht', 'used', 'usato', 'komplett', 'complete', 'completo', 'bauanleitung', 'instructions', 'versand', 'shipping',
]);
