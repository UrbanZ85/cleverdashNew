// Člen I: platform/ ne sme uvažati iz modules/time-tracking/, a /health mora vseeno
// poročati o schedulerju (T032, HealthExtension iz specs/002-time-tracking/contracts).
// Rešitev je isti vzorec kot register zavihkov — modul se PRIJAVI sem, platform ne pozna
// modula po imenu. Brez prijave endpoint vrne dokumentirane privzetke (T032:
// "unknown"/0), ne manjkajoča polja.

export interface HealthExtensionData {
  schedulerLastTickAgeSeconds: number | null;
  browser: 'ok' | 'failed' | 'unknown';
  remoteSessions: Array<{ name: string; status: string; daysUntilExpiry: number | null }>;
  failedActionsLast24h: number;
  missedActionsLast24h: number;
}

export type HealthExtensionProvider = () => Promise<HealthExtensionData> | HealthExtensionData;

const DEFAULT_EXTENSION: HealthExtensionData = {
  schedulerLastTickAgeSeconds: null,
  browser: 'unknown',
  remoteSessions: [],
  failedActionsLast24h: 0,
  missedActionsLast24h: 0,
};

let provider: HealthExtensionProvider | null = null;

/** Kliče `modules/time-tracking/scheduler.ts` ob zagonu (T034). */
export function registerHealthExtension(fn: HealthExtensionProvider): void {
  provider = fn;
}

export async function getHealthExtension(): Promise<HealthExtensionData> {
  if (!provider) return DEFAULT_EXTENSION;
  try {
    return await provider();
  } catch {
    return DEFAULT_EXTENSION;
  }
}

/** Samo za teste. */
export function resetHealthExtensionForTests(): void {
  provider = null;
}
