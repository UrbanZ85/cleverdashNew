import { isPrivateOrLocalHost } from './camera-validation.js';

// Člen IX: čista funkcija, testirana brez omrežja in brez baze.
//
// Vtičniki (005) prinesejo nekaj, česar prej ni bilo: naslov, ki ga vpiše UPORABNIK in ki
// ga potem prenese STREŽNIK sam (GET /dashboard/plugins/:id/data gre skozi predpomnilnik,
// ker člen VIII prepoveduje, da bi zunanji vir klical brskalnik). To je klasična pot do
// SSRF — brez preverjanja bi lahko vsak prijavljen uporabnik pripravil vtičnik, ki
// strežniku naroči, naj prebere `http://169.254.169.254/` ali storitev v notranjem omrežju
// in mu vrne odgovor.
//
// Razlika do `camera-validation.ts` je namerna in pomembna: tam je `http://` in zasebni
// gostitelj DOVOLJEN, ker je posledica samo ta, da gre vir obvezno prek proxyja
// (`requiresProxy`), naslov pa vpisuje lastnik svoje kamere v svojem omrežju. Tu strežnik
// naslov res obišče in ga vrne naprej, zato je merilo strožje.

/** Zgornja meja dolžine — daljši naslov je skoraj zagotovo napaka ali zloraba, in dolžino
 * je bolje omejiti tu kot v shemi baze. */
export const MAX_OUTBOUND_URL_LENGTH = 2048;

export type OutboundUrlRejection =
  | 'invalid'
  | 'too-long'
  | 'scheme'
  | 'credentials'
  | 'private-host';

export type OutboundUrlResult =
  | { ok: true; url: URL }
  | { ok: false; reason: OutboundUrlRejection; message: string };

/** IPv6 zanka in unique-local (fc00::/7); `camera-validation.ts` pokriva samo IPv4. */
function isPrivateIpv6(hostname: string): boolean {
  // URL API zapiše IPv6 gostitelja v oglatih oklepajih.
  const bare = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (bare === '::1' || bare === '::') return true;
  const head = bare.split(':')[0] ?? '';
  // fc00::/7 → prvi zlog 0xfc ali 0xfd; fe80::/10 (link-local) → fe80..febf.
  if (/^f[cd][0-9a-f]{0,2}$/.test(head)) return true;
  if (/^fe[89ab][0-9a-f]?$/.test(head)) return true;
  return false;
}

/** IPv4 link-local (169.254.0.0/16) — naslov storitve metapodatkov v oblaku. `0.0.0.0` je
 * prav tako pot do lokalnega gostitelja. `camera-validation.ts` tega para ne pokriva, ker
 * tam ni bilo pomembno. */
function isLinkLocalOrUnspecifiedIpv4(hostname: string): boolean {
  if (hostname === '0.0.0.0') return true;
  return /^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

/**
 * Preveri naslov, ki ga bo STREŽNIK sam prenesel v imenu uporabnika.
 *
 * Opomba o dosegu: preverja se ime gostitelja, kot je zapisano — brez razreševanja DNS.
 * Ime, ki se razreši v zasebni naslov (DNS rebinding), s tem ni ujeto; to je zavestna
 * meja, enaka kot jo je postavil `camera-validation.ts`, in bi zahtevala razreševanje ob
 * vsakem prenosu ter vpenjanje na naslov.
 */
export function validateOutboundUrl(raw: string): OutboundUrlResult {
  const value = raw.trim();

  if (value.length === 0) {
    return { ok: false, reason: 'invalid', message: 'Naslov je prazen.' };
  }
  if (value.length > MAX_OUTBOUND_URL_LENGTH) {
    return {
      ok: false,
      reason: 'too-long',
      message: `Naslov je predolg (največ ${MAX_OUTBOUND_URL_LENGTH} znakov).`,
    };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'invalid', message: 'Naslov ni veljaven URL.' };
  }

  if (url.protocol !== 'https:') {
    return {
      ok: false,
      reason: 'scheme',
      message: 'Dovoljen je samo https — po nešifrirani povezavi strežnik ne prenaša tujih virov.',
    };
  }

  if (url.username !== '' || url.password !== '') {
    return {
      ok: false,
      reason: 'credentials',
      message: 'Naslov ne sme vsebovati uporabniškega imena ali gesla.',
    };
  }

  const hostname = url.hostname.toLowerCase();
  if (isPrivateOrLocalHost(hostname) || isLinkLocalOrUnspecifiedIpv4(hostname) || isPrivateIpv6(hostname)) {
    return {
      ok: false,
      reason: 'private-host',
      message: 'Naslov kaže na lokalno ali zasebno omrežje, kamor strežnik ne sme segati.',
    };
  }

  return { ok: true, url };
}
