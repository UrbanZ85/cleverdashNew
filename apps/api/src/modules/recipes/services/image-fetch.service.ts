import { validateOutboundUrl } from '../../../domain/outbound-url.js';
import { loadEnv } from '../../../platform/config/env.js';
import { checkImageUpload } from '../domain/image-type.js';
import { RecipeImageModel } from '../models/recipe-image.model.js';
import { RecipeModel } from '../models/recipe.model.js';

// Prenese sliko z NASLOVA in jo shrani k receptu. Obstaja izključno za uvoz iz agenta
// (`modules/recipes/ingest.ts`).
//
// ZAKAJ NASLOV IN NE BAJTI. Vmesnik sliko naloži kot surovo telo zahteve
// (`POST /recipes/{id}/images`) in tako mora ostati — brskalnik bajte ima. Agent jih NIMA: prebral
// je stran in iz nje pozna kvečjemu naslov slike. Base64 v JSON bi bil edina druga možnost in bi
// pomenil, da mora agent sliko najprej sam prenesti, jo zakodirati in poslati skozi pogovorno okno
// — česar jezikovni model ne zmore in ne sme početi.
//
// ZAKAJ JE TO SPREJEMLJIVO GLEDE NA ČLEN VIII. Uvoz sicer strani NE obiskuje (agent jo je prebral
// namesto nas). Slika je izjema, ker je ni mogoče dobiti drugače kot s prenosom, in gre za EN
// omejen prenos ob nastanku recepta — ne za ponavljajoče preverjanje. Isto razmerje kot pri
// faviconih v modulu 008.
//
// ZGRADBA JE PREPISANA iz `recipe-import.service.ts` (ki jo je sam prepisal iz modula 008), ne
// uvožena: varovalo, ročne preusmeritve, en proračun čez vse skoke, omejeno branje telesa. Kar je
// prestalo varnostni pregled, se tu ne sme na novo izumiti — to je pot, po kateri strežnik na
// ukaz zunanjega agenta obišče poljuben naslov, torej najbolj izpostavljen odhodni klic v tej
// kodni bazi.

export type ImageFetchStatus = 'ok' | 'skipped' | 'failed';

export interface ImageFetchResult {
  status: ImageFetchStatus;
  imageId: string | null;
  /** Razlog, kadar status ni `ok`. Gre v `warnings` odgovora (člen VII) — uporabnik mora vedeti,
   * da slike ni, in zakaj. */
  reason: string | null;
}

const MAX_REDIRECTS = 3;
const USER_AGENT = 'CleverDash/1.0';

/** Vrste, ki jih sploh poskusimo prenesti. Ni to, kar odloči — odloči PODPIS datoteke
 * (`checkImageUpload`). Glava je samo prvi filter, da ne prenašamo HTML strani do konca. */
const ACCEPT = 'image/jpeg,image/png,image/webp,image/*';

/**
 * Prebere največ `maxBytes` bajtov in tok nato PREKINE.
 *
 * Meja je ista kot za nalaganje iz vmesnika (`RECIPES_IMAGE_MAX_MB`). Prekinitev in ne zavrnitev
 * po prenosu: naslov, ki bi vračal neskončen tok, bi sicer zasedel strežnik do proračuna.
 */
async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  const body = res.body;
  if (!body) return Buffer.alloc(0);

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
      // Eden več od meje je dovolj, da `checkImageUpload` prepozna preveliko sliko in to POVE —
      // prekinitev točno na meji bi dala okrnjeno sliko, ki bi jo podpis morda še prepoznal.
      if (total > maxBytes) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

function skipped(reason: string): ImageFetchResult {
  return { status: 'skipped', imageId: null, reason };
}

function failed(reason: string): ImageFetchResult {
  return { status: 'failed', imageId: null, reason };
}

/**
 * Prenese sliko in jo shrani kot sliko recepta; prva slika postane NASLOVNA.
 *
 * Nikoli ne vrže: neuspeh slike ne sme razveljaviti recepta, ki je ob klicu že shranjen (isto
 * pravilo kot pri branju izvorne strani — FR-012). Izid je `reason`, ki ga klicatelj da v
 * `warnings`.
 *
 * `fetchImpl` je vhod zaradi testov, enako kot v `recipe-import.service.ts`.
 */
export async function fetchRecipeImageFromUrl(
  recipeId: string,
  ownerId: string,
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ImageFetchResult> {
  const env = loadEnv();
  const maxBytes = env.RECIPES_IMAGE_MAX_MB * 1024 * 1024;

  // Varovalo je PRVO in edino, kar odloča, ali odhodni klic sploh nastane. Nespremenjeno isto kot
  // pri 005, 008 in 013 — dovoli izključno `https` in zavrne zasebne ter link-local gostitelje.
  // Tu je pomembnejše kot kjer koli drugje: naslov pride od ZUNANJEGA agenta, ne od človeka pred
  // zaslonom.
  const guard = validateOutboundUrl(rawUrl);
  if (!guard.ok) return skipped(guard.reason);

  const signal = AbortSignal.timeout(env.RECIPES_IMPORT_TIMEOUT_MS);
  const visited = new Set<string>();
  let current = guard.url.href;

  try {
    let buffer: Buffer | null = null;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (visited.has(current)) return failed('redirect-cycle');
      visited.add(current);

      const res = await fetchImpl(current, {
        // `manual` in NE `follow`: vsak cilj preusmeritve mora ZNOVA skozi varovalo. `follow` bi
        // preusmeritev opravil, preden bi jo mi videli — to je pot mimo varovala v notranje omrežje.
        redirect: 'manual',
        signal,
        headers: { accept: ACCEPT, 'user-agent': USER_AGENT },
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
        if (!nextGuard.ok) return failed(`redirect-${nextGuard.reason}`);

        current = nextGuard.url.href;
        continue;
      }

      if (!res.ok) return failed(`http-${res.status}`);

      buffer = await readCapped(res, maxBytes);
      break;
    }

    if (!buffer) return failed('too-many-redirects');

    // ISTA preverba kot pri nalaganju iz vmesnika, in vrsta se ugotovi IZ PODPISA datoteke, ne iz
    // glave `Content-Type`. Glava je izjava tujega strežnika; dokument HTML, postrežen kot slika z
    // naše domene, bi bil shranjen XSS (domain/image-type.ts).
    const check = checkImageUpload(buffer, maxBytes);
    if (!check.ok || !check.mimeType) return failed(check.reason ?? 'unsupported');

    const existing = await RecipeImageModel.countDocuments({ recipeId });
    if (existing >= env.RECIPES_MAX_IMAGES) return failed('too-many-images');

    const image = await RecipeImageModel.create({
      recipeId,
      ownerId,
      // Uvoz teče v imenu lastnika; soudeleženca, ki bi sliko naložil, tu ni.
      uploadedBy: ownerId,
      mimeType: check.mimeType,
      byteSize: buffer.length,
      data: buffer,
      // Pomanjšave NI: izračuna jo odjemalec v `<canvas>` (research.md §5), agent pa je nima od kod
      // vzeti. `null` je veljavno stanje — seznam takrat postreže izvirnik.
      thumb: null,
      thumbMimeType: null,
      caption: null,
    });

    // Naslovna postane samo, če je recept še nima — isto pravilo kot pri nalaganju iz vmesnika
    // (FR-024). Uvoz ne sme prepisati naslovne slike, ki jo je izbral človek.
    await RecipeModel.updateOne(
      { _id: recipeId, coverImageId: null },
      { $set: { coverImageId: image._id } },
    );

    return { status: 'ok', imageId: String(image._id), reason: null };
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error';
    return failed(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network');
  }
}
