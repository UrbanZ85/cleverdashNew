// Pomožne funkcije za besedilo naslovov oglasov (019). Čiste, brez odvisnosti.

/** Male črke, brez diakritike, ločila → presledek, strnjeni presledki. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/#.+\-぀-ヿ一-龯]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Besede brez ločil za primerjavo imen (brez `/`, `#`, `.`). */
export function nameTokens(s: string): string[] {
  return normalizeText(s)
    .replace(/[/#.+-]/g, ' ')
    .split(' ')
    .filter(Boolean);
}

/** `true`, kadar naslov vsebuje besedo ali besedno zvezo (celotne besede). */
export function hasWord(normalized: string, ...words: string[]): boolean {
  return words.some((w) => new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(normalized));
}
