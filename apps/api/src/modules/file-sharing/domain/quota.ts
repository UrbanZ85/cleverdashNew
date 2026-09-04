// FR-009: kvota prostora na uporabnika.
//
// Zasedeno se VEDNO izračuna z agregacijo po `userId` (vsota `byteSize`), nikoli iz števca na
// uporabniku: števec bi se moral vzdrževati ob vsakem brisanju, prekinjenem nalaganju in
// pometaču, in prva pozabljena pot bi ga tiho razsinhronizirala. Vsota se ne more zmotiti.
//
// Člen IX: čiste funkcije, brez baze.

export type QuotaCheck = { ok: true; availableBytes: number } | { ok: false; availableBytes: number };

/**
 * Ali sme datoteka napovedane velikosti še noter.
 *
 * Robna enakost (`zasedeno + prihajajoče === meja`) je ŠE DOVOLJENA — kvota je zgornja meja
 * zasedenosti, ne meja, ki je ni dovoljeno doseči.
 */
export function checkQuota(usedBytes: number, incomingBytes: number, limitBytes: number): QuotaCheck {
  const availableBytes = Math.max(0, limitBytes - usedBytes);
  return usedBytes + incomingBytes <= limitBytes ? { ok: true, availableBytes } : { ok: false, availableBytes };
}

/** Za sporočilo uporabniku — MB navzdol, da obljuba ni večja od resnice. */
export function bytesToMb(bytes: number): number {
  return Math.floor(bytes / (1024 * 1024));
}
