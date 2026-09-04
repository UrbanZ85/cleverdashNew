// Člen IX (razširjen duh, glej plan.md Constitution Check): čista funkcija, testirana brez
// baze in brez omrežja. FR-034, research.md §6: preveri naslov kamere pred shranjevanjem.
//
// Shema http/https je vedno dovoljena — `http://` samodejno pomeni, da mora vir iti prek
// backend proxyja (FR-020), ne razlog za zavrnitev. Zavrnjena je samo shema, ki ni niti
// http niti https (npr. `javascript:`, `data:`, `file:`), in gostitelj vdelave, ki ni na
// efektivnem seznamu dovoljenih (FR-022).

export type CameraType = 'snapshot' | 'mjpeg' | 'hls' | 'iframe' | 'snapshot+iframe';

const EMBED_TYPES: ReadonlySet<CameraType> = new Set(['iframe', 'snapshot+iframe']);

export interface CameraValidationInput {
  type: CameraType;
  previewUrl: string;
  fullUrl?: string | null;
  hasCredentials: boolean;
}

export type CameraValidationResult =
  | { valid: true }
  | { valid: false; field: 'previewUrl' | 'fullUrl'; reason: string };

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isAllowedHost(hostname: string, allowedHosts: readonly string[]): boolean {
  const host = hostname.toLowerCase();
  return allowedHosts.some((allowed) => {
    const a = allowed.toLowerCase();
    return host === a || host.endsWith(`.${a}`);
  });
}

/** Zasebni/lokalni IPv4 razponi in `localhost` — eden od pogojev za obvezen proxy
 * (FR-020). Namenoma preprost (brez IPv6, brez DNS razrešitve) — dovolj za domensko
 * odločitev; DNS rebinding ipd. ni v obsegu te funkcionalnosti (enouporabniška aplikacija). */
export function isPrivateOrLocalHost(hostname: string): boolean {
  if (hostname === 'localhost') return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** FR-020: kateri od treh pogojev velja za ta naslov — uporablja `camera-proxy.service.ts`,
 * ne vpliva na validacijo (http je vedno sprejet, samo pove, da gre prek proxyja). */
export function requiresProxy(url: URL, hasCredentials: boolean): boolean {
  return url.protocol === 'http:' || hasCredentials || isPrivateOrLocalHost(url.hostname);
}

function validateScheme(url: URL, field: 'previewUrl' | 'fullUrl'): CameraValidationResult | null {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { valid: false, field, reason: `Naslov mora uporabljati http ali https, ne "${url.protocol}".` };
  }
  return null;
}

/**
 * Preveri naslov(a) kamere pred shranjevanjem (FR-034). `allowedEmbedHosts` je efektivni
 * seznam (osnovni iz okolja ∪ `cameraEmbedAllowlist`, research.md §6) — ta funkcija ga
 * samo prejme kot parameter, ne prebira baze ali okolja sama (člen IX).
 */
export function validateCameraAddress(
  input: CameraValidationInput,
  allowedEmbedHosts: readonly string[],
): CameraValidationResult {
  const preview = parseUrl(input.previewUrl);
  if (!preview) {
    return { valid: false, field: 'previewUrl', reason: 'Naslov predogleda ni veljaven URL.' };
  }
  const previewSchemeError = validateScheme(preview, 'previewUrl');
  if (previewSchemeError) return previewSchemeError;

  let full: URL | null = null;
  if (input.fullUrl) {
    full = parseUrl(input.fullUrl);
    if (!full) {
      return { valid: false, field: 'fullUrl', reason: 'Naslov polnega prikaza ni veljaven URL.' };
    }
    const fullSchemeError = validateScheme(full, 'fullUrl');
    if (fullSchemeError) return fullSchemeError;
  }

  if (EMBED_TYPES.has(input.type)) {
    // data-model.md: pri `snapshot+iframe` se vdela `fullUrl`, če je podan, sicer `previewUrl`;
    // pri `iframe` vedno `previewUrl` (edini naslov, ki ga ta vrsta ima).
    const useFull = input.type === 'snapshot+iframe' && full !== null;
    const embedUrl = useFull ? (full as URL) : preview;
    const embedField: 'previewUrl' | 'fullUrl' = useFull ? 'fullUrl' : 'previewUrl';
    if (!isAllowedHost(embedUrl.hostname, allowedEmbedHosts)) {
      return {
        valid: false,
        field: embedField,
        reason: `Gostitelj "${embedUrl.hostname}" ni na seznamu dovoljenih za vdelavo.`,
      };
    }
  }

  return { valid: true };
}
