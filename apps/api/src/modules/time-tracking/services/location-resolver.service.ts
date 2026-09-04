import { resolveCoordinate } from '../../../domain/coordinates.js';
import { notFound } from '../../../platform/errors/problem.js';
import { RemoteSessionModel } from '../models/remote-session.model.js';
import { TrackingLocationModel } from '../models/tracking-location.model.js';
import type { Diagnostics, ResolvedLocation } from '../clock-portal/index.js';

/** Naloži lokacijo (privzeto aktivno, če `locationId` ni podan) in njeno sejo, ter razreši
 * šablono koordinat v konkretno število — domenska odgovornost, ne portala
 * (docs/legacy-engine.md §3). 004: `userId` obvezen — lokacija je osebni podatek
 * (data-model.md), `locationId` brez ujemajočega `userId` vrne enako 404 kot neobstoječa
 * (ne razkriva tuje kamere/lokacije, enak vzorec kot cameras/router.ts). */
export async function resolveLocationForPortal(
  userId: string,
  locationId?: string,
): Promise<{
  locationDoc: InstanceType<typeof TrackingLocationModel>;
  sessionDoc: InstanceType<typeof RemoteSessionModel>;
  resolved: ResolvedLocation;
}> {
  const locationDoc = locationId
    ? await TrackingLocationModel.findOne({ _id: locationId, userId })
    : await TrackingLocationModel.findOne({ userId, active: true });
  if (!locationDoc) {
    throw notFound('Lokacija ni najdena. Ustvari jo v Nastavitvah.');
  }

  const sessionDoc = await RemoteSessionModel.findOne({ _id: locationDoc.sessionId, userId });
  if (!sessionDoc) {
    throw notFound('Seja za to lokacijo ni najdena.');
  }

  const resolved: ResolvedLocation = {
    url: locationDoc.url,
    // FR-094: koordinati se razrešita SAMO, kadar naj se lokacija pošlje. Odločitev je tu in
    // ne v portalu: portal ne sme poznati nastavitev, samo to, kaj naj naredi (člen IX).
    ...(locationDoc.sendGeolocation && locationDoc.coordinateTemplate
      ? {
          latitude: resolveCoordinate(locationDoc.coordinateTemplate.latitude),
          longitude: resolveCoordinate(locationDoc.coordinateTemplate.longitude),
        }
      : {}),
    cookieName: sessionDoc.cookieName,
    cookieValue: sessionDoc.cookieValue,
    cookieDomain: sessionDoc.cookieDomain,
    ...(sessionDoc.expiresAt ? { cookieExpiresAt: Math.floor(sessionDoc.expiresAt.getTime() / 1000) } : {}),
  };

  return { locationDoc, sessionDoc, resolved };
}

/**
 * US8, T094: prazen nabor akcij je LAHKO potekla seja, ne nujno "selektor ni najden"
 * (FR-022). Portal sam ne pozna seje (samo cookie vrednost), zato razločevanje poteka tu,
 * kjer je seja na voljo — enkrat, ne v vsakem klicatelju posebej.
 */
export function enrichDiagnosticsWithSession(
  diagnostics: Diagnostics,
  sessionDoc: InstanceType<typeof RemoteSessionModel>,
  locationDoc?: InstanceType<typeof TrackingLocationModel>,
): Diagnostics {
  if (diagnostics.reason !== 'selector_not_found') return diagnostics;
  const expired = sessionDoc.status === 'expired' || (!!sessionDoc.expiresAt && sessionDoc.expiresAt < new Date());
  if (expired) {
    return {
      reason: 'session_expired',
      message: `Seja "${sessionDoc.name}" je potekla.`,
      hint: 'Vpiši nov sejni piškotek v Nastavitvah.',
    };
  }
  // FR-094: odkar je pošiljanje lokacije izklopljivo, je to druga verjetna razlaga praznega
  // nabora gumbov — stran, ki lego zahteva, brez nje ne pokaže ničesar. Vzroka ne trdimo
  // (reason ostane `selector_not_found`), ponudimo pa prvo stvar, ki jo je vredno preveriti.
  if (locationDoc && !locationDoc.sendGeolocation) {
    return {
      ...diagnostics,
      hint: `Pošiljanje lokacije je za "${locationDoc.name}" izklopljeno. Če stran gumbe pokaže šele, ko pozna lego naprave, ga v Nastavitvah vklopi nazaj.`,
    };
  }
  return diagnostics;
}
