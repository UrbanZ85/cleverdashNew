import { z } from 'zod';
import {
  registerIngestTarget,
  type IngestContext,
  type IngestOutcome,
} from '../../platform/ingest/registry.js';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_INGREDIENTS,
  MAX_INGREDIENT_LENGTH,
  MAX_PREP_MINUTES,
  MAX_SERVINGS,
  MAX_STEPS,
  MAX_STEP_LENGTH,
  MAX_TITLE_LENGTH,
  normalizeCategories,
  normalizeTags,
  splitLines,
} from './domain/recipe-input.js';
import { MAX_RECIPE_URL_LENGTH, normalizeOptionalRecipeUrl } from './domain/recipe-url.js';
import { fetchRecipeImageFromUrl } from './services/image-fetch.service.js';
import { buildSearchText } from './domain/search-text.js';
import { RecipeModel } from './models/recipe.model.js';
import { ensureCategories } from './services/category.service.js';
import { RECIPE_SCOPES } from './scopes.js';

// Prispevek modula 013 k vstopni točki za agente (`platform/ingest/`). Živi TU in ne v
// `platform/`, ker uvaža `RecipeModel` in domensko plast tega modula — v `platform/` bi bila to
// natanko tista datoteka, ki bi brisanje mape `recipes/` spremenila v popravljanje kode drugod
// (člen I). Odstranitev zavihka ostane brisanje te mape in enega klica v `main.ts`.
//
// RAZMERJE DO `POST /recipes`. Ta datoteka NE podvaja pravil: iste normalizacije
// (`splitLines`, `normalizeTags`, `normalizeCategories`, `buildSearchText`) in ista preverba
// naslova. Razlike sta dve, obe iz narave klicatelja:
//
//  1. STREŽNIK STRANI NE OBIŠČE. Agent jo je pravkar prebral — to je cel smisel te poti. Drugo
//     branje iste strani bi bilo odveč in bi tujemu strežniku prineslo dva obiska namesto enega
//     (člen VIII). Zato ni `importFromUrl` in `sourceStatus` ostane `skipped`.
//
//     EDINA IZJEMA je `imageUrl`: fotografije ni mogoče dobiti drugače kot s prenosom, ker agent
//     bajtov nima in jih ne more imeti. Gre za en omejen prenos ob nastanku recepta, ne za
//     ponavljajoče branje, in teče skozi isto varovalo odhodnih naslovov kot vse ostalo
//     (`services/image-fetch.service.ts`).
//  2. DVOJNIK NE NASTANE. Agent isti naslov pošlje večkrat pogosteje kot človek (ponovi klic,
//     uporabnik prilepi isto stran drugič). V vmesniku je dvojnik odločitev človeka pred
//     zaslonom; tu ga nihče ne vidi, dokler knjižnica ni polna podvojenih receptov.

const ingestSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
  url: z.string().max(MAX_RECIPE_URL_LENGTH).nullish(),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).nullish(),
  // Isti `z.union([string, string[]])` kot v `recipeWriteSchema`: agent seznam sestavin pogosto
  // pošlje kot eno besedilo z novimi vrsticami, in zavrnitev ene od oblik bi bila arbitrarna.
  ingredients: z.union([z.string(), z.array(z.string())]).optional(),
  steps: z.union([z.string(), z.array(z.string())]).optional(),
  prepMinutes: z.coerce.number().int().min(1).max(MAX_PREP_MINUTES).nullish(),
  servings: z.coerce.number().int().min(1).max(MAX_SERVINGS).nullish(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  /**
   * Naslov FOTOGRAFIJE jedi. Edina stvar, zaradi katere strežnik pri uvozu sploh naredi odhodni
   * klic — in edini način, da recept dobi sliko še ob nastanku: agent bajtov nima, pozna kvečjemu
   * naslov (glej `services/image-fetch.service.ts`).
   *
   * Neuspeh NE razveljavi recepta: izid pride v `warnings`.
   */
  imageUrl: z.string().max(MAX_RECIPE_URL_LENGTH).nullish(),
  categories: z.union([z.string(), z.array(z.string())]).optional(),
  /** Izhod v sili, kadar je dvojnik NAMEREN (dve različici iste jedi z istega naslova).
   * Privzeto `false`: agent te možnosti ne pozna iz navodila in je ne bo uporabil sam. */
  allowDuplicate: z.boolean().default(false),
});

type RecipeIngestInput = z.infer<typeof ingestSchema>;

async function handle(input: RecipeIngestInput, ctx: IngestContext): Promise<IngestOutcome> {
  const warnings: string[] = [];

  const url = normalizeOptionalRecipeUrl(input.url);
  // Neveljaven naslov recepta NE zavrne: recept s prepisanimi sestavinami je uporaben tudi brez
  // vira, zavrnitev pa bi agentu vzela ves prebrani tekst zaradi ene napačne vrstice. Izid je
  // opozorilo — člen VII: povej, da nekaj ni šlo, ne skrij tega v dnevnik.
  const sourceUrl = url.ok ? (url.url ?? null) : null;
  if (!url.ok) warnings.push(`Naslov vira je izpuščen: ${url.message}`);

  if (sourceUrl && !input.allowDuplicate) {
    const existing = await RecipeModel.findOne({ ownerId: ctx.userId, url: sourceUrl })
      .select('_id title')
      .lean();
    if (existing) {
      return {
        status: 'duplicate',
        id: String(existing._id),
        title: existing.title,
        path: `/recipes/${String(existing._id)}`,
      };
    }
  }

  const ingredients = splitLines(input.ingredients ?? [], {
    maxItems: MAX_INGREDIENTS,
    maxLength: MAX_INGREDIENT_LENGTH,
  });
  if (ingredients.truncated) warnings.push(`Sestavin je bilo več kot ${MAX_INGREDIENTS}; odvečne so izpuščene.`);

  const steps = splitLines(input.steps ?? [], { maxItems: MAX_STEPS, maxLength: MAX_STEP_LENGTH });
  if (steps.truncated) warnings.push(`Korakov je bilo več kot ${MAX_STEPS}; odvečni so izpuščeni.`);

  const { tags, tagKeys } = normalizeTags(input.tags);
  const { categories, categoryKeys } = normalizeCategories(input.categories);

  const created = await RecipeModel.create({
    ownerId: ctx.userId,
    title: input.title,
    url: sourceUrl,
    description: input.description ?? null,
    ingredients: ingredients.items,
    steps: steps.items,
    prepMinutes: input.prepMinutes ?? null,
    servings: input.servings ?? null,
    tags,
    tagKeys,
    categories,
    categoryKeys,
    rating: null,
    searchText: buildSearchText({
      title: input.title,
      description: input.description,
      ingredients: ingredients.items,
      tags,
      categories,
    }),
    // `skipped` in ne `ok`: to je stanje "strežnik strani NI obiskal" (isti pomen kot
    // `metadataStatus` v modulu 008). `ok` bi trdil, da je vsebina prišla iz našega branja
    // strani, kar ni res — prišla je od agenta in zanjo jamči on.
    sourceStatus: sourceUrl ? 'skipped' : 'none',
    lastModifiedBy: ctx.userId,
  });

  // Besednjak se dopolni PO nastanku in njegov neuspeh recepta ne razveljavi — enako kot v
  // `POST /recipes`. Imena kategorij so zapisana v receptu in veljajo tudi brez vnosa v
  // besednjaku.
  await ensureCategories(ctx.userId, categories);

  // Slika je ZADNJA in po tem, ko recept že obstaja — isto pravilo kot pri branju izvorne strani
  // (FR-012): zapis ne sme biti odvisen od dosegljivosti tujega strežnika, in če slike ni, recept
  // ostane. Izid je opozorilo, ne napaka.
  if (input.imageUrl) {
    const image = await fetchRecipeImageFromUrl(String(created._id), ctx.userId, input.imageUrl);
    if (image.status !== 'ok') {
      warnings.push(`Slike ni bilo mogoče shraniti (${image.reason}). Recept je shranjen brez nje.`);
    }
  }

  return {
    status: 'created',
    id: String(created._id),
    title: created.title,
    path: `/recipes/${String(created._id)}`,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export function registerRecipesIngest(): void {
  registerIngestTarget({
    key: 'recipes',
    title: 'Recepti',
    summary: 'Shrani recept s spletne strani v kuharico.',
    scope: RECIPE_SCOPES.write,
    schema: ingestSchema,
    handle,
    // Opisi polj so pisani AGENTU in ne razvijalcu: gredo dobesedno v navodilo, ki ga uporabnik
    // prilepi v pogovor (`platform/ingest/instructions.ts`).
    fields: [
      { name: 'title', type: 'string', required: true, description: 'Ime jedi, kot piše na strani.' },
      { name: 'url', type: 'string', required: false, description: 'Naslov strani, s katere je recept.' },
      { name: 'description', type: 'string', required: false, description: 'Kratek opis jedi, če ga stran ima.' },
      { name: 'ingredients', type: 'string[]', required: false, description: 'Sestavine, vsaka svoj vnos, z količino ("400 g buče").' },
      { name: 'steps', type: 'string[]', required: false, description: 'Koraki priprave po vrsti, vsak svoj vnos.' },
      { name: 'prepMinutes', type: 'number', required: false, description: 'Skupni čas priprave v MINUTAH (1 h 30 min = 90).' },
      { name: 'servings', type: 'number', required: false, description: 'Za koliko oseb je recept.' },
      { name: 'tags', type: 'string[]', required: false, description: 'Proste oznake ("vegi", "hitro"). Največ 20.' },
      { name: 'categories', type: 'string[]', required: false, description: 'Vrsta jedi ali obrok ("Juhe", "Kosila"). Največ 8.' },
      { name: 'imageUrl', type: 'string', required: false, description: 'Neposreden naslov FOTOGRAFIJE jedi (končnica .jpg, .png ali .webp, obvezno https). Postane naslovna slika recepta.' },
    ],
    example: {
      title: 'Bučna juha z ingverjem',
      url: 'https://okusno.si/recept/bucna-juha',
      description: 'Kremna juha iz pečene hokaido buče.',
      ingredients: ['1 hokaido buča (700 g)', '1 čebula', '2 cm ingverja', '500 ml zelenjavne jušne osnove'],
      steps: ['Bučo očisti in nareži na kocke.', 'Peci 25 minut na 200 °C.', 'Vse zmiksaj z jušno osnovo.'],
      prepMinutes: 45,
      servings: 4,
      tags: ['vegi', 'jesen'],
      categories: ['Juhe'],
      imageUrl: 'https://okusno.si/slike/bucna-juha.jpg',
    },
  });
}
