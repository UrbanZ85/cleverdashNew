import { validateOutboundUrl } from '../../../domain/outbound-url.js';
import { loadEnv } from '../../../platform/config/env.js';
import { EMPTY_PARSED_RECIPE, extractRecipeFromHtml, type ParsedRecipe } from '../domain/recipe-jsonld.js';

// research.md §9: strežnik obišče izvorno stran SAMO zato, da iz nje prebere označen recept —
// enkrat ob nastanku zapisa in nato le na izrecno zahtevo (`POST /recipes/{id}/import`).
// Ponavljajočega preverjanja shranjenih strani ni in ne sme biti (člen VIII, FR-013).
//
// Zgradba je PREPISANA iz `modules/saved-links/services/link-metadata.service.ts`, ne uvožena
// (člen I): varovalo, ročne preusmeritve, proračun čez vse skoke, omejeno branje telesa. Kar je
// tam prestalo varnostni pregled, se tu ne sme na novo izumiti. Razlikuje se izključno to, kaj se
// iz dokumenta izlušči.
//
// Tri stanja izida so pomenska in ne tehnična (člen VII):
//  - `skipped` — naslova NISMO obiskali, ker ni prestal varovala. To NI napaka: zapis je
//    veljaven (FR-011, FR-012).
//  - `failed`  — poskusili smo in ni šlo (proračun, omrežje, odgovor ni HTML).
//  - `ok`      — stran je odgovorila in dokument je bil razčlenjen. Tudi kadar v njem ni bilo
//    označenega recepta: dokument SMO prebrali, samo recepta ni imel. Za klicatelja je razlika
//    bistvena — pri `failed` ponudi "poskusi znova", pri `ok` brez recepta pa ni česa poskušati.

export type RecipeImportStatus = 'ok' | 'skipped' | 'failed';

export interface RecipeImportResult {
  status: RecipeImportStatus;
  recipe: ParsedRecipe;
  /** Razlog, kadar status ni `ok` — za dnevnik in diagnostiko, ne za vmesnik. Nikoli ne vsebuje
   * poverilnic iz naslova (člen IV): varovalo jih zavrne, preden pridemo sem. */
  reason: string | null;
}

/** Največ toliko preusmeritev; četrta pomeni `failed`. */
const MAX_REDIRECTS = 3;

/** Kar strežnik pove o sebi. Brez piškotkov in brez avtentikacije — beremo javno stran. */
const USER_AGENT = 'CleverDash/1.0';

function skipped(reason: string): RecipeImportResult {
  return { status: 'skipped', recipe: EMPTY_PARSED_RECIPE, reason };
}

function failed(reason: string): RecipeImportResult {
  return { status: 'failed', recipe: EMPTY_PARSED_RECIPE, reason };
}

/**
 * Prebere največ `maxBytes` bajtov telesa in tok nato PREKINE.
 *
 * `res.text()` bi prebral cel dokument — stran s stotimi megabajti bi zasedla strežnik. Pri
 * receptih je meja višja kot pri branju samega `<title>` v modulu 008: blok `ld+json` je pogosto
 * na DNU dokumenta, za vsem besedilom in komentarji, zato bi prekratko branje vrnilo prazno na
 * straneh, ki recept pravilno označujejo. Meja je zato svoja nastavitev
 * (`RECIPES_IMPORT_MAX_BYTES`) in ne prevzeta vrednost.
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

/**
 * Obišče stran in iz nje izlušči recept, označen po `schema.org/Recipe`.
 *
 * Proračun (`RECIPES_IMPORT_TIMEOUT_MS`) velja za CELO branje, vključno s preusmeritvami — en
 * `AbortSignal` za vse skoke skupaj, ne po skoku. Tri preusmeritve z dvema sekundama vsaka bi bile
 * sicer šest sekund, kar je natanko tisto, čemur se proračun izogiba.
 *
 * `fetchImpl` je vhod zaradi testov (podtaknjen `fetch`); privzeto je globalni `fetch`.
 */
export async function importRecipeFromUrl(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RecipeImportResult> {
  const env = loadEnv();

  // Varovalo je PRVO in edino, kar odloča, ali odhodni klic sploh nastane (FR-011). Isto varovalo
  // kot 005 in 008, NESPREMENJENO: je edina stvar, ki stoji med uporabnikovim vnosom in odhodnim
  // klicem strežnika, in mehčanje meril zanjo ne sodi v ta modul.
  //
  // POSLEDICA, ki jo je treba poznati: varovalo dovoli izključno `https`, zato je vsak `http://`
  // naslov `skipped` in se z njega nikoli ne uvozi nič. Zapis je vseeno veljaven in brskalnik ga
  // odpre; uporabnik vsebino po potrebi vpiše sam.
  const guard = validateOutboundUrl(rawUrl);
  if (!guard.ok) return skipped(guard.reason);

  const signal = AbortSignal.timeout(env.RECIPES_IMPORT_TIMEOUT_MS);
  const visited = new Set<string>();
  let current = guard.url.href;

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (visited.has(current)) return failed('redirect-cycle');
      visited.add(current);

      const res = await fetchImpl(current, {
        // `manual` in NE `follow`: vsak cilj preusmeritve mora ZNOVA skozi varovalo. Brez tega je
        // preusmeritev pot mimo varovala naravnost v notranje omrežje — `follow` bi jo opravil,
        // preden bi jo mi videli.
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
        // Zavrnitev na drugem skoku je `failed` in ne `skipped`: poskus JE bil, cilj pa je bil
        // zavrnjen.
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

      const html = await readCapped(res, env.RECIPES_IMPORT_MAX_BYTES);
      // `ok` tudi, kadar strani ni bilo mogoče razčleniti v recept — glej opombo na vrhu.
      return { status: 'ok', recipe: extractRecipeFromHtml(html), reason: null };
    }

    return failed('too-many-redirects');
  } catch (err) {
    // Prekoračen proračun in napaka omrežja sta za uporabnika isto: "podatkov s strani ni".
    // Sporočilo gre v `reason` za diagnostiko, ne v odgovor kot napaka (FR-012).
    const name = err instanceof Error ? err.name : 'Error';
    return failed(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network');
  }
}
