import { registerTabDetailProvider, type TabDetail } from '../../platform/tabs/extension.js';
import { TrackingLocationModel } from './models/tracking-location.model.js';
import { RemoteSessionModel } from './models/remote-session.model.js';

// Zahteva: "v meniju mora biti vidno, kateri podatki se uporabljajo za beleženje časa".
//
// Do zdaj tega ni bilo mogoče videti nikjer: lokacija in stanje seje sta obstajala samo v
// bazi in v diagnostiki. Ker meni pripada `platform/tabs`, modul podatek PRISPEVA prek
// registra (platform/tabs/extension.ts) — obratna smer bi bila uvoz modula iz platforme in
// bi kršila člen I.
//
// FR-092 velja tudi tukaj: vrednost piškotka ne sme nikoli ven. Prispevata se samo ime
// lokacije in gostitelj portala (ki je v naslovu lokacije, ne v piškotku).

/** Gostitelj brez `www.` — v meniju je prostora za nekaj znakov, ne za cel URL. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function statusOf(sessionStatus: string | null | undefined): Pick<TabDetail, 'status' | 'statusLabel'> {
  switch (sessionStatus) {
    case 'active':
      return { status: 'ok' };
    case 'expiring':
      return { status: 'warning', statusLabel: 'seji poteče' };
    case 'expired':
      return { status: 'danger', statusLabel: 'seja potekla' };
    default:
      // 'unknown' ali brez seje: še ni bilo preverjeno — to NI napaka in ne sme svetiti
      // rdeče, sicer značka izgubi pomen (člen VII: opozorilo mora nekaj pomeniti).
      return { status: 'warning', statusLabel: 'ni preverjeno' };
  }
}

export async function buildTimeTrackingTabDetail(userId: string): Promise<TabDetail | null> {
  const locations = await TrackingLocationModel.find({ userId, active: true }).sort({ name: 1 }).lean();
  if (locations.length === 0) {
    return { subtitle: 'Ni nastavljene lokacije', status: 'warning', statusLabel: 'ni nastavljeno' };
  }

  const primary = locations[0]!;
  const host = hostOf(primary.url);
  const extra = locations.length > 1 ? ` +${locations.length - 1}` : '';
  const subtitle = host ? `${primary.name} — ${host}${extra}` : `${primary.name}${extra}`;

  const session = await RemoteSessionModel.findById(primary.sessionId).lean();

  return { subtitle, ...statusOf(session?.status) };
}

/** Prijava je idempotentna (Map po `tabId`), zato jo `createApp()` sme klicati večkrat —
 * v testih teče enkrat na testno datoteko. */
export function registerTimeTrackingTabDetail(): void {
  registerTabDetailProvider('time-tracking', buildTimeTrackingTabDetail);
}
