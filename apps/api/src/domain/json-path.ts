// Člen IX: čista funkcija, brez omrežja in baze.
//
// Vtičnik vrste `json` prebere polje iz tujega JSON odgovora po poti, ki jo vpiše
// uporabnik (npr. `observation.t` ali `list.0.main.temp`). Namenoma NI polni JSONPath:
// uporabnik ga vpisuje v obrazec, zato mora biti oblika taka, da si jo je mogoče izmisliti
// brez branja specifikacije — pike za polja, števila za indekse v seznamu.

/** Zgornja meja globine — pot z več kot toliko koraki je skoraj zagotovo napaka in ščiti
 * pred sprehodom po zlonamerno globokem dokumentu. */
export const MAX_PATH_DEPTH = 12;

export type JsonPathValue = string | number | boolean | null;

/** Razdeli pot na korake. Prazna pot pomeni koren dokumenta. */
export function parseJsonPath(path: string): string[] {
  return path
    .trim()
    .split('.')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

export function isValidJsonPath(path: string): boolean {
  const segments = parseJsonPath(path);
  if (segments.length === 0 || segments.length > MAX_PATH_DEPTH) return false;
  // Prepovedani so ključi, ki bi segli v prototip objekta.
  return segments.every((s) => s !== '__proto__' && s !== 'constructor' && s !== 'prototype');
}

/**
 * Prebere vrednost po poti. Vrne `undefined`, če poti ni — kar je nekaj DRUGEGA kot
 * `null`, ki je lahko veljavna vrednost v dokumentu; klicatelj mora ločiti "polja ni" od
 * "polje je prazno".
 */
export function readJsonPath(document: unknown, path: string): JsonPathValue | undefined {
  if (!isValidJsonPath(path)) return undefined;

  let current: unknown = document;
  for (const segment of parseJsonPath(path)) {
    if (current === null || current === undefined) return undefined;

    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
      continue;
    }

    if (typeof current !== 'object') return undefined;
    // `Object.hasOwn` (in ne `in`) namenoma: podedovanih lastnosti ne izpostavljamo.
    if (!Object.hasOwn(current as Record<string, unknown>, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  if (current === null) return null;
  const t = typeof current;
  if (t === 'string' || t === 'number' || t === 'boolean') return current as JsonPathValue;
  // Objekt ali seznam ni vrednost, ki bi jo bilo mogoče izpisati na ploščici — uporabnik
  // mora pot podaljšati do konkretnega polja.
  return undefined;
}

export interface PluginFieldSpec {
  label: string;
  path: string;
  unit?: string | null;
}

export interface PluginFieldValue {
  label: string;
  /** Že oblikovana vrednost za prikaz; `null` pomeni "polja v odgovoru ni". */
  value: string | null;
}

/** Pretvori odgovor vira v seznam parov oznaka/vrednost, kot jih izriše ploščica. */
export function extractPluginFields(
  document: unknown,
  fields: readonly PluginFieldSpec[],
): PluginFieldValue[] {
  return fields.map((field) => {
    const raw = readJsonPath(document, field.path);
    if (raw === undefined) return { label: field.label, value: null };
    // Enota se pripne SAMO dejanski vrednosti: "— m/s" za prazno polje je nesmisel.
    if (raw === null) return { label: field.label, value: '—' };
    const text = String(raw);
    return { label: field.label, value: field.unit ? `${text} ${field.unit}` : text };
  });
}
