// Rok veljavnosti in stanja deljene datoteke (data-model.md, FR-040/FR-041/FR-042).
//
// Ključna odločitev: "POTEKLO" NI SHRANJENO STANJE. Izpelje se iz `expiresAt < zdaj`. Shranjeno
// stanje bi se moralo vzdrževati z opravilom in bi se med trenutkom poteka in trenutkom zapisa
// razhajalo s časom — povezava bi bila formalno še veljavna, čeprav je rok minil.
//
// Člen IX: čiste funkcije, brez baze, omrežja in datotečnega sistema.

export const EXPIRY_CHOICES = [1, 7, 30] as const;
export type ExpiryChoice = (typeof EXPIRY_CHOICES)[number];

/** Shranjena stanja. `expired` med njimi NI — glej opombo zgoraj. */
export const SHARE_STATES = ['uploading', 'ready', 'revoked', 'broken'] as const;
export type ShareState = (typeof SHARE_STATES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

export function isExpiryChoice(value: unknown): value is ExpiryChoice {
  return EXPIRY_CHOICES.includes(value as ExpiryChoice);
}

/**
 * Rok povezave.
 *
 * - `undefined` (polje izpuščeno) → privzetek namestitve;
 * - `null` (izrecna izbira "brez roka") → `null`, kar pomeni **brez roka**, ne "poteklo";
 * - 1 / 7 / 30 → toliko dni od zdaj.
 *
 * Razlika med `undefined` in `null` je namerna in je edini način, da "brez roka" ni isto kot
 * "nisem izbral".
 */
export function computeExpiresAt(
  choice: ExpiryChoice | null | undefined,
  now: Date,
  defaultDays: number,
): Date | null {
  if (choice === null) return null;
  const days = choice === undefined ? defaultDays : choice;
  return new Date(now.getTime() + days * DAY_MS);
}

/** `null` je BREZ ROKA in ni nikoli poteklo. */
export function isExpired(expiresAt: Date | null | undefined, now: Date): boolean {
  if (expiresAt === null || expiresAt === undefined) return false;
  return expiresAt.getTime() <= now.getTime();
}

/** Kdaj se sme vsebina POBRISATI z diska: rok hrambe teče od poteka, ne od nalaganja. */
export function isPastRetention(expiresAt: Date | null | undefined, now: Date, retentionDays: number): boolean {
  if (expiresAt === null || expiresAt === undefined) return false;
  return now.getTime() >= expiresAt.getTime() + retentionDays * DAY_MS;
}

/**
 * Dovoljeni NEPOSREDNI prehodi stanj.
 *
 * `revoked → ready` NI med njimi: preklic se ne "odklene". Edina pot nazaj v obtok je izdaja
 * novega gesla, kar je druga operacija z drugimi posledicami (nov žeton, razveljavljene
 * dovolilnice) — glej `canReissue` in research.md §12.
 */
export function canTransition(from: ShareState, to: ShareState): boolean {
  switch (from) {
    case 'uploading':
      // Nalaganje se konča z uspehom ali pa zapisa ni — preklicati ni česa (FR-041).
      return to === 'ready';
    case 'ready':
      return to === 'revoked' || to === 'broken';
    case 'revoked':
      return to === 'broken';
    case 'broken':
      // Pokvarjeno je ugotovitev, ne stanje, iz katerega bi kdo lahko šel naprej.
      return false;
  }
}

/** Novo geslo je mogoče izdati za datoteko, ki OBSTAJA na disku — tudi preklicano. */
export function canReissue(state: ShareState): boolean {
  return state === 'ready' || state === 'revoked';
}

/** Ali sme prevzem sploh steči: pravo stanje IN rok, ki še ni minil. */
export function isDownloadable(file: { state: ShareState; expiresAt: Date | null }, now: Date): boolean {
  return file.state === 'ready' && !isExpired(file.expiresAt, now);
}
