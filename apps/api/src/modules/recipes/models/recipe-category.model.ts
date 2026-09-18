import { Schema, model, type InferSchemaType } from 'mongoose';
import { MAX_CATEGORY_NAME_LENGTH } from '../domain/recipe-input.js';

// Kategorije so UPORABNIKOV BESEDNJAK: "Juhe", "Kosila", "Zajtrki", "Večerje". Zbirka obstaja
// zato, da jih je mogoče ponuditi v izbirniku, preimenovati, prerazporediti in izbrisati — in da
// kategorija lahko obstaja, preden je vanjo uvrščen prvi recept.
//
// POZOR na delitev, ki je bistvena za razumevanje tega modula:
//
//   ta zbirka  = SEZNAM MOŽNOSTI (besednjak enega uporabnika)
//   Recipe.categories / categoryKeys = IMENA, zapisana v receptu
//
// Recept torej NE hrani identifikatorjev kategorij, ampak njihova IMENA — enako kot oznake.
// Razlog je deljenje: recept vidita dva uporabnika z DVEMA različnima besednjakoma, in zapis
// `categoryId` bi za soudeleženca kazal v zbirko, ki ni njegova. Z imeni filtriranje deluje
// enotno čez lastne in deljene recepte, izbris kategorije pa recepta ne pusti kazati v nič.
//
// Cena te odločitve je zapisana in sprejeta: preimenovanje kategorije popravi imena samo v
// receptih, katerih LASTNIK je klicatelj (services/category.service.ts). Na tuj deljen recept ne
// seže — tam je ime last tistega, ki recept ima.

const recipeCategorySchema = new Schema(
  {
    /** `userId` in NE `ownerId`: besednjak je ZASEBEN in ga ne vidi nihče drug — tu obljuba
     * "`{_id, userId}` je pogoj dostopa" drži v celoti, za razliko od `Recipe.ownerId`. */
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Prikazna oblika, kot jo je vpisal uporabnik. */
    name: { type: String, required: true, maxlength: MAX_CATEGORY_NAME_LENGTH },
    /** Zložena oblika (`foldTag`) — po njej se ugotavlja enakost in teče filter. `Juhe` in
     * `juhe` sta ista kategorija; brez tega bi besednjak razpadel na različice istega. */
    key: { type: String, required: true },
    order: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, versionKey: false },
);

// Seznam, kot ga vidi uporabnik — TOČNO vrstni red iz `GET /recipe-categories`.
recipeCategorySchema.index({ userId: 1, order: 1 });
// Ena kategorija na ime, na uporabnika. Enoličnost uveljavljata OBOJE — ta indeks IN preverba
// pred vstavljanjem (services/category.service.ts). Nobeno samo zase ne zadošča: preverba ne
// prepreči sočasnosti, indeks pa se v Mongoose gradi asinhrono (`autoIndex`) in ob zapisu takoj
// po zagonu procesa še ne obstaja. Isti par varovalk in isti razlog kot pri mapah v modulu 008,
// kjer je bila to prava napaka v celotnem naboru testov.
recipeCategorySchema.index({ userId: 1, key: 1 }, { unique: true });

export type RecipeCategoryDoc = InferSchemaType<typeof recipeCategorySchema>;
export const RecipeCategoryModel = model('RecipeCategory', recipeCategorySchema);
