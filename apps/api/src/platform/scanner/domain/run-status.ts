import type { DefinitionOutcome, RunStatus } from '../types.js';

// Stanje zagona iz izidov po skenerjih (FR-017, FR-019). Čista funkcija; tip lahko status poda
// sam (leti ga izpeljejo iz izidov po virih), to je privzetek, kadar ga ne poda.

export function statusFromOutcomes(
  definitions: ReadonlyArray<{ outcome: DefinitionOutcome }>,
  hadError: boolean,
): Extract<RunStatus, 'succeeded' | 'partial' | 'failed'> {
  const ok = definitions.filter((d) => d.outcome === 'ok').length;
  const failed = definitions.filter((d) => d.outcome === 'failed').length;
  if (failed === 0 && !hadError) return 'succeeded';
  if (ok === 0 && (failed > 0 || hadError)) return 'failed';
  return 'partial';
}
