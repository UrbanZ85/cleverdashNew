import type { NormalizedResult } from '../../platform/scanner/types.js';

// Determinističen scenarij testnega tipa `echo` (016, FR-046). Čista funkcija: iz zaporedne
// številke zagona definicije in števila rezultatov sestavi rezultate tako, da se v štirih
// zagonih zgodi vse, kar jedro mora znati (quickstart.md §3):
//   zagon 1: N novih (cena 100 + i)
//   zagon 2: isti rezultati, iste cene → NESPREMENJENO, brez dopisa
//   zagon 3: rezultat 1 cena −10 → POCENITEV, en dopis z eno postavko
//   zagon 4+: rezultat N manjka → NEDOSEGLJIVO (vir je uspešno odgovoril), brez dopisa
// Vzorec je isti kot pri testnem viru letov (120 → 89 → 110, BGY izgine).

export const ECHO_SOURCE = 'echo';
export const ECHO_HOST = 'example.test';

export function echoResults(runIndex: number, items: number, label: string): NormalizedResult[] {
  const out: NormalizedResult[] = [];
  for (let i = 1; i <= items; i += 1) {
    if (runIndex >= 4 && i === items) continue;
    const amount = runIndex >= 3 && i === 1 ? 100 + i - 10 : 100 + i;
    out.push({
      identity: `${ECHO_SOURCE}:${label}:${i}`,
      source: ECHO_SOURCE,
      externalId: `echo-${i}`,
      title: `${label} #${i}`,
      url: `https://${ECHO_HOST}/echo/${i}`,
      price: { amount, currency: 'EUR' },
      data: { index: i, run: runIndex, label },
      comparable: { index: i },
    });
  }
  return out;
}
