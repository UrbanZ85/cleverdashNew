import { Router } from 'express';
import type { Types } from 'mongoose';
import { notFound, tooManyRequests } from '../../platform/errors/problem.js';
import { safeImageFileName } from './domain/image-type.js';
import { isRecipeShareTokenShaped } from './domain/share-token.js';
import { RecipeImageModel } from './models/recipe-image.model.js';
import { RecipeModel } from './models/recipe.model.js';
import { checkPublicRate } from './services/public-throttle.service.js';

// JAVNE poti modula — `/shared-recipes/*`. Edine v tem modulu BREZ `requireScopes`.
//
// Vpete so kot vsak drug modul in NE pred vratarji (main.ts): `apiKeyGuard` in `accessTokenGuard`
// zahteve brez poverilnic ne zavrneta — samo nastavita `req.auth`, če glava obstaja — zavrne šele
// `requireScopes`. Javna pot je torej pot, ki ga NE pokliče. S tem pa še vedno teče skozi
// korelacijo, idempotentnost in obravnavo napak, kar bi `app.use` pred vratarji preskočil. Isti
// razlog in ista ureditev kot pri `fileSharingPublicRouter` (009).
//
// TA DATOTEKA JE VARNOSTNO OBČUTLJIVA. Vse, kar se vrne od tu, vidi kdor koli na internetu, ki ima
// naslov. Pravilo, ki ga uveljavlja `toPublicRecipe`: v odgovor gre IZKLJUČNO tisto, kar je na
// seznamu (FR-042) — nikoli `...doc` in nikoli polje, ki bi se pojavilo samo zato, ker je bilo
// dodano v model.
export const recipesPublicRouter = Router();

interface PublicRecipeLean {
  _id: Types.ObjectId;
  title: string;
  url: string | null;
  description: string | null;
  ingredients: string[];
  steps: string[];
  prepMinutes: number | null;
  servings: number | null;
  tags: string[];
  coverImageId: Types.ObjectId | null;
  updatedAt: Date;
}

/**
 * Projekcija je EKSPLICITNA in kratka — to je glavna obramba te datoteke.
 *
 * Česa tu NI in nikoli ne sme biti (FR-042): `ownerId`, `members`, `rating`, `lastCookedAt`,
 * `cookCount`, `lastModifiedBy`, `publicShare` in `searchText`. Prvi trije bi razkrili ljudi,
 * naslednja dva navade, `publicShare` pa bi žeton vrnil v telesu odgovora, od koder bi ga pobral
 * vsak posrednik in vsak dnevnik.
 *
 * Zapisana je kot seznam polj in ne kot izločitev (`-ownerId`): izločitev pomeni, da se vsako novo
 * polje v modelu privzeto RAZKRIJE, dokler se kdo ne spomni nanj. Ta smer mora biti obrnjena.
 */
const PUBLIC_PROJECTION =
  '_id title url description ingredients steps prepMinutes servings tags coverImageId updatedAt';

function toPublicRecipe(doc: PublicRecipeLean, images: { id: string; caption: string | null }[]) {
  return {
    title: doc.title,
    url: doc.url ?? null,
    description: doc.description ?? null,
    ingredients: doc.ingredients ?? [],
    steps: doc.steps ?? [],
    prepMinutes: doc.prepMinutes ?? null,
    servings: doc.servings ?? null,
    tags: doc.tags ?? [],
    coverImageId: doc.coverImageId ? String(doc.coverImageId) : null,
    images,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Recept za dani žeton, ali `null`.
 *
 * ENAK odgovor za neveljaven, preklican, neobstoječ in izbrisan žeton (FR-046, FR-048): različni
 * odgovori bi povedali, da je žeton nekoč obstajal, in bi iz javne strani naredili orodje za
 * ugotavljanje, kdo je kdaj kaj delil.
 *
 * Oblika žetona se preveri PRED poizvedbo (domain/share-token.ts) — vzorec iz varnostnega pregleda
 * modula 009.
 */
async function findByToken(token: unknown): Promise<PublicRecipeLean | null> {
  if (!isRecipeShareTokenShaped(token)) return null;
  return RecipeModel.findOne({ 'publicShare.token': token, 'publicShare.revokedAt': null })
    .select(PUBLIC_PROJECTION)
    .lean<PublicRecipeLean | null>();
}

/** Dušenje po izvornem naslovu (FR-047). Teče PRED poizvedbo, sicer bi bilo preverjanje samo
 * omejitev odgovora in ne obramba baze. */
function guardRate(ip: string | undefined): void {
  const verdict = checkPublicRate(ip);
  if (!verdict.allowed) {
    throw tooManyRequests(
      `Preveč zahtev. Poskusi znova čez ${verdict.retryAfterSeconds} s.`,
    );
  }
}

/** Isti odgovor za vse razloge — glej `findByToken`. */
function gone(): never {
  throw notFound('Ta povezava ne obstaja ali ni več veljavna.');
}

recipesPublicRouter.get('/shared-recipes/:token', async (req, res, next) => {
  try {
    guardRate(req.ip);

    const recipe = await findByToken(req.params.token);
    if (!recipe) gone();

    const images = await RecipeImageModel.find({ recipeId: recipe._id })
      .sort({ createdAt: 1 })
      .select('_id caption')
      .lean<{ _id: Types.ObjectId; caption: string | null }[]>();

    // `no-store` in ne `private`: pred nami je skupni Caddy, odgovor pa je javen in vezan na
    // žeton, ki je lahko med tem preklican. Predpomnjen odgovor bi pomenil, da preklic ne učinkuje
    // takoj (FR-044) — natanko tista lastnost, zaradi katere preklic sploh obstaja.
    res.setHeader('Cache-Control', 'no-store');
    // Javna stran ne sme v tuje okvire: povezava gre v pogovore in okvir na tuji strani bi jo
    // predstavil kot tujo vsebino.
    res.setHeader('X-Frame-Options', 'DENY');

    res.json(
      toPublicRecipe(
        recipe,
        images.map((image) => ({ id: String(image._id), caption: image.caption ?? null })),
      ),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * Bajti slike na javni strani.
 *
 * Slika je vezana na ŽETON in ne na identifikator recepta: pot oblike `/images/:imageId` brez
 * žetona bi bila odprta pot do vsake slike v bazi, ki bi jo bilo mogoče preiskati z ugibanjem
 * `ObjectId` — ta pa nosi časovni žig in števec in zato ni naključen.
 *
 * Slika mora pripadati natanko temu receptu (`recipeId`), sicer žeton enega recepta odpre slike
 * vseh.
 */
recipesPublicRouter.get('/shared-recipes/:token/images/:imageId', async (req, res, next) => {
  try {
    guardRate(req.ip);

    const recipe = await findByToken(req.params.token);
    if (!recipe) gone();

    // Brez `Types.ObjectId.isValid` bi neveljaven identifikator vrgel CastError in 500; tu mora
    // biti isti odgovor kot za neobstoječo sliko.
    const imageId = String(req.params.imageId);
    if (!/^[a-f\d]{24}$/i.test(imageId)) gone();

    const image = await RecipeImageModel.findOne({ _id: imageId, recipeId: recipe._id }).select(
      '+data +thumb',
    );
    if (!image) gone();

    const useThumb = String(req.query.variant ?? '') === 'thumb' && image.thumb && image.thumbMimeType;
    const body = useThumb ? image.thumb : image.data;
    const mimeType = useThumb ? image.thumbMimeType! : image.mimeType;

    // Iste varnostne glave kot na prijavljeni poti in iz istih razlogov (glej router.ts):
    // `Content-Type` izhaja iz podpisa datoteke ob nalaganju, `nosniff` prepove ugibanje vrste,
    // ime v `Content-Disposition` je očiščeno.
    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${safeImageFileName(image.caption, mimeType)}"`);
    // Tu je predpomnjenje DOVOLJENO, a kratko in samo v brskalniku obiskovalca: slike so največji
    // del strani, ki se med brskanjem po korakih večkrat izriše. `private` zato, da preklic ne
    // obvisi v skupnem predpomnilniku posrednika dlje od te minute.
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(body);
  } catch (err) {
    next(err);
  }
});
