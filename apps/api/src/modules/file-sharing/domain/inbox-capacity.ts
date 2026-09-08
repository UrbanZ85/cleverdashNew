// FR-087/FR-088: koliko sme v EN predal.
//
// Kvota iz `quota.ts` je meja LASTNIKA in tu ne zadošča. Predal je edina pot, po kateri v to
// namestitev piše nekdo brez računa; brez svoje meje bi mu bila na voljo vsa lastnikova kvota,
// in kdor bi enkrat dobil kodo, bi lahko zapolnil disk do konca. Meji predala sta zato DRUGI
// obroč pod kvoto, ne njena kopija: lastnik ju izbere ob nastanku predala in ju navzgor omejuje
// nastavitev namestitve (`FILE_SHARE_INBOX_MAX_FILES`, `FILE_SHARE_INBOX_MAX_MB`).
//
// Zasedenost predala se — enako kot kvota — VEDNO sešteje z agregacijo po `inboxId`, nikoli iz
// števca na predalu: števec bi se moral vzdrževati ob vsakem brisanju, prekinjeni oddaji in
// pometaču, in prva pozabljena pot bi ga tiho razsinhronizirala (glej quota.ts).
//
// Člen IX: čiste funkcije, brez baze.

export interface InboxUsage {
  /** Vsi zapisi predala, VKLJUČNO s tistimi v stanju `uploading` — ti prostor rezervirajo. */
  files: number;
  bytes: number;
}

export interface InboxLimits {
  maxFiles: number;
  maxTotalBytes: number;
}

export type CapacityRefusal = 'file-count' | 'total-bytes';
export type CapacityVerdict = { ok: true } | { ok: false; reason: CapacityRefusal };

/**
 * Ali sme datoteka napovedane velikosti še v ta predal.
 *
 * Robna enakost (`zasedeno + prihajajoče === meja`) je ŠE DOVOLJENA — meja je zgornja meja
 * zasedenosti, ne vrednost, ki je ni dovoljeno doseči (isto pravilo kot `checkQuota`).
 *
 * Vrstni red preverjanj je pomemben za sporočilo: število datotek se preveri prvo, ker
 * pošiljatelju pove nekaj, kar sam lahko razume ("predal je poln"), medtem ko je presežen
 * skupni prostor odvisen od velikosti datoteke, ki jo ravno ponuja.
 */
export function checkCapacity(usage: InboxUsage, limits: InboxLimits, incomingBytes: number): CapacityVerdict {
  if (usage.files + 1 > limits.maxFiles) return { ok: false, reason: 'file-count' };
  if (usage.bytes + incomingBytes > limits.maxTotalBytes) return { ok: false, reason: 'total-bytes' };
  return { ok: true };
}

/** Koliko datotek še sme noter. Nikoli negativno — znižana meja ne sme dati negativnega števila. */
export function remainingFiles(usage: InboxUsage, limits: InboxLimits): number {
  return Math.max(0, limits.maxFiles - usage.files);
}

export function remainingBytes(usage: InboxUsage, limits: InboxLimits): number {
  return Math.max(0, limits.maxTotalBytes - usage.bytes);
}

/**
 * Največja ENA datoteka, ki jo ta predal še sprejme.
 *
 * Manjša od dveh: meja namestitve (`FILE_SHARE_MAX_MB`) in preostali prostor predala. Pošiljatelj
 * mora videti PRAVO številko — meja 500 MB pri predalu, v katerem je prostora še za 40 MB, bi ga
 * pripravila do tega, da začne pošiljati nekaj, kar bo zavrnjeno.
 */
export function maxSingleFileBytes(usage: InboxUsage, limits: InboxLimits, installationMaxBytes: number): number {
  return Math.min(installationMaxBytes, remainingBytes(usage, limits));
}
