import { validateOutboundUrl } from '../../../domain/outbound-url.js';
import { loadEnv } from '../../../platform/config/env.js';
import { extractLinkMetadata } from '../domain/link-metadata.js';

// research.md §2, §3, §5, §14: strežnik obišče shranjeni naslov SAMO zato, da prebere
// `<title>` in razreši favicon — enkrat ob shranjevanju in nato le na izrecno zahtevo
// (`POST /saved-links/{id}/refresh-metadata`). Ponavljajočega preverjanja shranjenih strani
// ni in ne sme biti (člen VIII; izrecno izven obsega, spec.md).
//
// Tri stanja izida, ki jih ta storitev vrne, so pomenska in ne tehnična (člen VII):
//  - `skipped` — naslova NISMO obiskali, ker ni prestal varovala. To ni napaka: zapis je
//    veljaven, `http://192.168.1.1` je legitimen zaznamek (research.md §5).
//  - `failed`  — poskusili smo in ni šlo (proračun, omrežje, odgovor ni HTML).
//  - `ok`      — stran je odgovorila in dokument je bil razčlenjen.
//
// Stran brez `<title>` je `ok` z `title: null`: dokument smo prebrali, samo naslova ni imel.
// Za klicatelja je razlika bistvena — pri `failed` ponudi "osveži podatke strani", pri `ok`
// brez naslova pa ni česa osveževati.
//
// POSLEDICA, ki jo je treba poznati: `validateOutboundUrl` dovoli izključno `https`, zato je
// vsak shranjen `http://` naslov `skipped` in se mu ime nikoli ne prebere samodejno. To je
// namerno — varovalo se uporabi NESPREMENJENO (plan.md, research.md §5), ker je edina stvar,
// ki stoji med uporabnikovim vnosom in odhodnim klicem strežnika, in mehčanje meril zanjo ne
// sodi v ta modul. Zapis je vseeno veljaven in brskalnik ga odpre; uporabnik ime po potrebi
// vpiše sam.

export type LinkMetadataStatus = 'ok' | 'skipped' | 'failed';

export interface LinkMetadataResult {
  title: string | null;
  /** RAZREŠENI absolutni naslov favicona, ali `null`. Manjkajoč favicon NI napaka. */
  faviconUrl: string | null;
  status: LinkMetadataStatus;
  /** Razlog, kadar status ni `ok` — za dnevnik in diagnostiko, ne za vmesnik. Nikoli ne
   * vsebuje poverilnic iz naslova (člen IV): varovalo jih zavrne, preden pridemo sem. */
  reason: string | null;
}

/** Največ toliko preusmeritev; četrta pomeni `failed` (research.md §3). */
const MAX_REDIRECTS = 3;

/** Kar strežnik pove o sebi. Brez piškotkov in brez avtentikacije — beremo javno stran. */
const USER_AGENT = 'CleverDash/1.0';

function skipped(reason: string): LinkMetadataResult {
  return { title: null, faviconUrl: null, status: 'skipped', reason };
}

function failed(reason: string): LinkMetadataResult {
  return { title: null, faviconUrl: null, status: 'failed', reason };
}

/**
 * Prebere največ `maxBytes` bajtov telesa in tok nato PREKINE.
 *
 * `res.text()` bi prebral cel dokument — stran s stotimi megabajti bi zasedla strežnik, čeprav
 * je `<title>` v prvem kilobajtu (research.md §14). Zato branje po kosih in `cancel()`.
 */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const body = res.body;
  if (!body) return '';

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      total += value.byteLength;
      if (total >= maxBytes) break;
    }
  } finally {
    // Tuja stran ne sme ostati z odprto povezavo, ker smo mi dobili dovolj (člen VIII).
    await reader.cancel().catch(() => undefined);
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c)))
    .subarray(0, maxBytes)
    .toString('utf8');
}

/** Absolutni naslov favicona: iz `<link rel="icon">`, sicer `/favicon.ico` na istem
 * gostitelju (research.md §4). Naslov, ki ga ni mogoče razrešiti, pomeni "brez favicona". */
function resolveFaviconUrl(href: string | null, documentUrl: string): string | null {
  try {
    return new URL(href ?? '/favicon.ico', documentUrl).href;
  } catch {
    return null;
  }
}

/**
 * Prebere ime strani in naslov favicona.
 *
 * Proračun (`SAVED_LINKS_METADATA_TIMEOUT_MS`) velja za CELO branje, vključno s
 * preusmeritvami — en `AbortSignal` za vse skoke skupaj, ne po skoku. Tri preusmeritve z
 * dvema sekundama vsaka bi bile sicer šest sekund, kar je natanko tisto, čemur se proračun
 * izogiba.
 *
 * `fetchImpl` je vhod zaradi testov (podtaknjen `fetch`); privzeto je globalni `fetch`.
 */
export async function readLinkMetadata(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LinkMetadataResult> {
  const env = loadEnv();

  // Varovalo je PRVO in edino, kar odloča, ali odhodni klic sploh nastane (FR-011, SC-008).
  // Isto varovalo kot 005, nespremenjeno (research.md §5).
  const guard = validateOutboundUrl(rawUrl);
  if (!guard.ok) return skipped(guard.reason);

  const signal = AbortSignal.timeout(env.SAVED_LINKS_METADATA_TIMEOUT_MS);
  const visited = new Set<string>();
  let current = guard.url.href;

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (visited.has(current)) return failed('redirect-cycle');
      visited.add(current);

      const res = await fetchImpl(current, {
        // `manual` in NE `follow`: vsak cilj preusmeritve mora ZNOVA skozi varovalo. Brez
        // tega je preusmeritev pot mimo varovala naravnost v notranje omrežje
        // (research.md §3) — `follow` bi jo opravil, preden bi jo mi videli.
        redirect: 'manual',
        signal,
        headers: { accept: 'text/html', 'user-agent': USER_AGENT },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) return failed('redirect-without-location');
        if (hop === MAX_REDIRECTS) return failed('too-many-redirects');

        let next: string;
        try {
          next = new URL(location, current).href;
        } catch {
          return failed('redirect-invalid-location');
        }

        const nextGuard = validateOutboundUrl(next);
        // Zavrnitev na drugem skoku je `failed` in ne `skipped`: poskus JE bil, cilj pa je
        // bil zavrnjen — quickstart.md §4, primer s preusmeritvijo na `http://10.0.0.1/`.
        if (!nextGuard.ok) return failed(`redirect-${nextGuard.reason}`);

        current = nextGuard.url.href;
        continue;
      }

      if (!res.ok) return failed(`http-${res.status}`);

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('text/html')) {
        // PDF ali slika se ne razčlenjuje — in telo se niti ne prebere.
        await res.body?.cancel().catch(() => undefined);
        return failed('not-html');
      }

      const html = await readCapped(res, env.SAVED_LINKS_METADATA_MAX_BYTES);
      const fields = extractLinkMetadata(html);
      return {
        title: fields.title,
        faviconUrl: resolveFaviconUrl(fields.faviconHref, current),
        status: 'ok',
        reason: null,
      };
    }

    return failed('too-many-redirects');
  } catch (err) {
    // Prekoračen proračun in napaka omrežja sta za uporabnika isto: "podatkov s strani ni".
    // Sporočilo gre v `reason` za diagnostiko, ne v odgovor kot napaka (FR-013).
    const name = err instanceof Error ? err.name : 'Error';
    return failed(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network');
  }
}
