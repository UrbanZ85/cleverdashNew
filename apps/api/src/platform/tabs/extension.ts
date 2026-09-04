// Člen I: `platform/tabs` ne sme vedeti ničesar o modulih, meni pa mora vseeno pokazati,
// KATERI vir se pod posameznim zavihkom uporablja in ali ta vir živi (zahteva: "v meniju
// mora biti vidno, kateri podatki se uporabljajo za beleženje časa").
//
// Isti vzorec kot `platform/health/extension.ts` in `registerTickStep`: modul se PRIJAVI
// sem, platform ga ne pozna po imenu. Brez prijave zavihek preprosto nima dodatka —
// vedenje pred to spremembo.

export interface TabDetail {
  /** Ena vrstica pod naslovom zavihka, npr. "Agenda — e-racuni.com". */
  subtitle?: string;
  /** Barva značke: `warning`/`danger` pomenita, da vir potrebuje pozornost (člen VII). */
  status?: 'ok' | 'warning' | 'danger';
  /** Kratko besedilo značke, npr. "seji poteče". Brez njega se značka ne izriše. */
  statusLabel?: string;
}

/** Ponudnik dobi ID uporabnika, ker je podatek OSEBEN (vsak ima svoje lokacije in seje). */
export type TabDetailProvider = (userId: string) => Promise<TabDetail | null> | TabDetail | null;

const providers = new Map<string, TabDetailProvider>();

/** Kliče modul ob zagonu (glej modules/time-tracking/tab-detail.ts). Ponovna prijava za
 * isti `tabId` prejšnjo zamenja — `createApp()` v testih teče večkrat. */
export function registerTabDetailProvider(tabId: string, provider: TabDetailProvider): void {
  providers.set(tabId, provider);
}

/**
 * Zbere dodatke za vse zavihke, ki jih imajo. Napaka ENEGA ponudnika ne sme podreti menija
 * — brez menija aplikacije ni mogoče uporabljati, medtem ko je manjkajoč podnaslov le
 * manjkajoč podnaslov.
 */
export async function collectTabDetails(userId: string | null): Promise<Map<string, TabDetail>> {
  const details = new Map<string, TabDetail>();
  if (!userId || providers.size === 0) return details;

  await Promise.all(
    [...providers.entries()].map(async ([tabId, provider]) => {
      try {
        const detail = await provider(userId);
        if (detail) details.set(tabId, detail);
      } catch {
        // Namerno tiho: meni je pomembnejši od svojega okrasa.
      }
    }),
  );

  return details;
}

/** Samo za teste. */
export function resetTabDetailProvidersForTests(): void {
  providers.clear();
}
