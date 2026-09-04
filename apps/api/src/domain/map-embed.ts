// Člen IX: čista funkcija, brez omrežja in brez baze. Sestavi naslov ZEMLJEVIDA, ki se
// izriše v okvirju ploščice "Pot" — za pot med dvema nastavljenima krajema.
//
// Zakaj ne kar povezava do Google Zemljevidov: navadno povezavo (`…/maps/dir/…`,
// `maps.app.goo.gl/…`) Google v tujem okvirju ZAVRNE (`X-Frame-Options`) in okvir ostane
// prazen brez pojasnila. Vdelavo dovolita dve obliki, in ta funkcija izbere med njima:
//
//  1. **Maps Embed API** (`/maps/embed/v1/directions`) — uradna in dokumentirana, a zahteva
//     ključ, ki konča v naslovu okvirja in ga zato vidi vsak obiskovalec. Uporabi se, kadar
//     je `GOOGLE_MAPS_EMBED_KEY` nastavljen (ločen, po napotitelju omejen ključ — glej
//     platform/config/env.ts).
//  2. **Klasična oblika** (`maps.google.com/maps?saddr=…&daddr=…&output=embed`) — ključa ne
//     potrebuje in zna narisati pot, a je NEDOKUMENTIRANA. Je privzetek, da namestitev brez
//     ključa za vdelavo deluje takoj; če jo Google kdaj ukine, je pot iz točke 1 tista, ki
//     ostane.
//
// Naslov sestavi STREŽNIK in ne odjemalec: ključ za vdelavo je konfiguracija namestitve
// (člen IV) in odjemalec je ne sme poznati, prav tako pa mora enak naslov dobiti tudi
// klicatelj prek API-ja (člen III).

import type { CommutePlace } from './commute-route.js';

const EMBED_API = 'https://www.google.com/maps/embed/v1/directions';
const CLASSIC_EMBED = 'https://maps.google.com/maps';

/** Jezik oznak na zemljevidu — vmesnik je slovenski (člen X). */
const MAP_LANGUAGE = 'sl';

export interface MapEmbedOptions {
  /** `GOOGLE_MAPS_EMBED_KEY`; prazen ali odsoten pomeni klasično obliko. */
  embedApiKey?: string;
}

/**
 * Kraj kot ga zapiše naslov zemljevida. Koordinati imata prednost pred naslovom (enako kot
 * pri `placeToWaypoint`): zemljevid tako pokaže natanko tisto točko, ne rezultata iskanja.
 */
export function placeToMapQuery(place: CommutePlace): string | null {
  if (typeof place.latitude === 'number' && typeof place.longitude === 'number') {
    return `${place.latitude},${place.longitude}`;
  }
  const address = place.address?.trim() ?? '';
  return address.length > 0 ? address : null;
}

/**
 * Naslov vdelanega zemljevida s potjo med krajema, ali `null`, kadar kraja nista dovolj
 * določena (ploščica takrat okvirja ne izriše — prazen okvir je videti kot okvara).
 */
export function buildDirectionsEmbedUrl(
  from: CommutePlace,
  to: CommutePlace,
  options: MapEmbedOptions = {},
): string | null {
  const origin = placeToMapQuery(from);
  const destination = placeToMapQuery(to);
  if (!origin || !destination) return null;

  const key = options.embedApiKey?.trim() ?? '';
  if (key.length > 0) {
    const url = new URL(EMBED_API);
    url.searchParams.set('key', key);
    url.searchParams.set('origin', origin);
    url.searchParams.set('destination', destination);
    url.searchParams.set('mode', 'driving');
    url.searchParams.set('language', MAP_LANGUAGE);
    return url.toString();
  }

  const url = new URL(CLASSIC_EMBED);
  url.searchParams.set('saddr', origin);
  url.searchParams.set('daddr', destination);
  url.searchParams.set('hl', MAP_LANGUAGE);
  url.searchParams.set('output', 'embed');
  return url.toString();
}
