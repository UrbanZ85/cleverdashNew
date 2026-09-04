import { badRequest } from '../../../platform/errors/problem.js';
import { validateOutboundUrl } from '../../../domain/outbound-url.js';

export interface SourceOverrides {
  weatherUrl?: string | null;
  radarUrl?: string | null;
  webcamBaseUrl?: string | null;
}

const FIELD_LABELS: Record<keyof SourceOverrides, string> = {
  weatherUrl: 'Naslov vremenskega vira',
  radarUrl: 'Naslov radarske slike',
  webcamBaseUrl: 'Osnovni naslov spletnih kamer',
};

/**
 * Preveri osebne prepise naslovov virov.
 *
 * Pomen vrednosti:
 *  - `null` ali prazen niz → povrni na sistemski privzetek iz `.env` (to NI izbris polja,
 *    ampak izbira "naj velja privzetek");
 *  - `undefined` → polja ta zahteva ne spreminja.
 *
 * Naslove prenaša strežnik sam, zato veljajo ista pravila kot za vtičnike
 * (`domain/outbound-url.ts`): samo https, brez poverilnic, brez zasebnih omrežij.
 */
export function validateSourceOverrides(patch: SourceOverrides): SourceOverrides {
  const result: SourceOverrides = {};

  for (const key of Object.keys(FIELD_LABELS) as Array<keyof SourceOverrides>) {
    const value = patch[key];
    if (value === undefined) continue;

    if (value === null || value.trim() === '') {
      result[key] = null;
      continue;
    }

    const check = validateOutboundUrl(value);
    if (!check.ok) {
      throw badRequest(`${FIELD_LABELS[key]}: ${check.message}`);
    }
    result[key] = check.url.href;
  }

  return result;
}
