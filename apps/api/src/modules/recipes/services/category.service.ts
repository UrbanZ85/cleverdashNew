import { Types } from 'mongoose';
import { badRequest, notFound } from '../../../platform/errors/problem.js';
import { MAX_CATEGORIES } from '../domain/recipe-input.js';
import { foldTag } from '../domain/search-text.js';
import { RecipeCategoryModel } from '../models/recipe-category.model.js';
import { RecipeModel } from '../models/recipe.model.js';

// Besednjak kategorij enega uporabnika. Vsa pisanja vanj gredo skozi to datoteko.
//
// Osrednja stvar, ki jo je treba razumeti: besednjak in recepti so LOČENA vira resnice, povezana
// prek ZLOŽENEGA IMENA (`key`), ne prek identifikatorja — glej recipe-category.model.ts. Iz tega
// sledi vse spodaj: `ensure` ob pisanju recepta besednjak dopolni, preimenovanje popravi obe
// strani, izbris pa kategorijo odstrani iz receptov, namesto da bi jih pustil kazati v nič.

export interface CategorySummary {
  id: string;
  name: string;
  key: string;
  order: number;
  /** Koliko receptov klicatelja nosi to kategorijo. Vmesnik iz tega pove, kaj bo izgubljeno ob
   * izbrisu — brez tega bi bila potrditev brisanja brez vsebine. */
  recipeCount: number;
}

interface CategoryLean {
  _id: Types.ObjectId;
  name: string;
  key: string;
  order: number;
}

/**
 * Besednjak s števci, v DVEH poizvedbah namesto N+1.
 *
 * Šteje se po `categoryKeys` in po `ownerId` klicatelja: število pove, koliko SVOJIH receptov bo
 * poseg zadel. Deljeni recepti tujih lastnikov v števec ne gredo — nanje preimenovanje in izbris
 * tako ali tako ne sežeta (glej `renameCategory`).
 */
export async function listCategories(userId: string): Promise<CategorySummary[]> {
  const categories = await RecipeCategoryModel.find({ userId })
    .sort({ order: 1 })
    .lean<CategoryLean[]>();

  if (categories.length === 0) return [];

  const counts = await RecipeModel.aggregate<{ _id: string; count: number }>([
    { $match: { ownerId: new Types.ObjectId(userId) } },
    { $unwind: '$categoryKeys' },
    { $group: { _id: '$categoryKeys', count: { $sum: 1 } } },
  ]);
  const byKey = new Map(counts.map((row) => [row._id, row.count]));

  return categories.map((category) => ({
    id: String(category._id),
    name: category.name,
    key: category.key,
    order: category.order,
    recipeCount: byKey.get(category.key) ?? 0,
  }));
}

/**
 * Poskrbi, da so vsa navedena imena v besednjaku — kliče se ob VSAKEM pisanju recepta s
 * kategorijami.
 *
 * Zakaj samodejno dodajanje in ne zavrnitev neznanega imena: kategorije mora biti mogoče nastaviti
 * tudi iz n8n (`POST /recipes` s `categories: ["Juhe"]`), ne da bi klicatelj prej upravljal
 * besednjak. Zavrnitev bi pomenila dva klica za eno dejanje in past, v katero bi vsak nov odjemalec
 * padel enkrat.
 *
 * Besednjak je VEDNO klicateljev, tudi kadar ureja tuj deljen recept: `userId` je tisti, ki piše.
 * Alternativa (pisati v lastnikov besednjak) bi pomenila, da soudeleženec tujemu človeku spreminja
 * njegov seznam — kar je posledica, ki je nihče ne pričakuje od urejanja recepta.
 *
 * Tiho ne stori ničesar, kadar bi besednjak presegel `MAX_CATEGORIES`: recept se MORA shraniti in
 * imena v njem ostanejo veljavna tudi brez vnosa v besednjaku (recept hrani imena, ne
 * identifikatorjev). Meja varuje izbirnik, ne zapis.
 */
export async function ensureCategories(userId: string, names: readonly string[]): Promise<void> {
  if (names.length === 0) return;

  const wanted = new Map<string, string>();
  for (const name of names) {
    const key = foldTag(name);
    if (key.length > 0 && !wanted.has(key)) wanted.set(key, name);
  }
  if (wanted.size === 0) return;

  const existing = await RecipeCategoryModel.find({ userId, key: { $in: [...wanted.keys()] } })
    .select('key')
    .lean<{ key: string }[]>();
  for (const row of existing) wanted.delete(row.key);
  if (wanted.size === 0) return;

  const total = await RecipeCategoryModel.countDocuments({ userId });
  const room = MAX_CATEGORIES - total;
  if (room <= 0) return;

  const last = await RecipeCategoryModel.findOne({ userId })
    .sort({ order: -1 })
    .select('order')
    .lean<{ order: number } | null>();
  let order = last ? last.order + 1 : 0;

  const docs = [...wanted.entries()]
    .slice(0, room)
    .map(([key, name]) => ({ userId, name, key, order: order++ }));

  try {
    // `ordered: false`: če vzporeden klic med tem vstavi isto kategorijo, naj se preostale vseeno
    // vstavijo. Trk enoličnega indeksa je tu PRIČAKOVAN izid in ne napaka.
    await RecipeCategoryModel.insertMany(docs, { ordered: false });
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
  }
}

/** Nova kategorija v besednjaku — izrecno, iz zaslona za urejanje kategorij. */
export async function createCategory(userId: string, name: string): Promise<CategorySummary> {
  const key = foldTag(name);
  if (key.length === 0) {
    throw badRequest('Ime kategorije mora vsebovati vsaj eno črko ali številko.');
  }
  if (await RecipeCategoryModel.exists({ userId, key })) {
    throw badRequest('Kategorija s tem imenom že obstaja.');
  }
  if ((await RecipeCategoryModel.countDocuments({ userId })) >= MAX_CATEGORIES) {
    throw badRequest(`Kategorij je lahko največ ${MAX_CATEGORIES}.`);
  }

  // Nova kategorija gre na KONEC seznama — obratno od receptov, ki gredo na vrh. Kategorija je
  // razvrstitev in ne najdba: uporabnik jo je pravkar ustvaril in ve, kje je.
  const last = await RecipeCategoryModel.findOne({ userId })
    .sort({ order: -1 })
    .select('order')
    .lean<{ order: number } | null>();

  try {
    const created = await RecipeCategoryModel.create({
      userId,
      name,
      key,
      order: last ? last.order + 1 : 0,
    });
    return {
      id: String(created._id),
      name: created.name,
      key: created.key,
      order: created.order,
      recipeCount: 0,
    };
  } catch (err) {
    // Preverba zgoraj ne prepreči sočasnosti, indeks pa se gradi asinhrono — potrebna sta oba
    // (glej opombo v recipe-category.model.ts).
    if (isDuplicateKey(err)) throw badRequest('Kategorija s tem imenom že obstaja.');
    throw err;
  }
}

/**
 * Preimenovanje popravi OBE strani: vnos v besednjaku in ime v vseh receptih, katerih lastnik je
 * klicatelj.
 *
 * Kar preimenovanje NE doseže in je zapisano tudi v pogodbi: tuje deljene recepte, ki nosijo isto
 * ime. Tam je ime last tistega, ki recept ima, in poseg vanj bi pomenil, da urejanje lastnega
 * besednjaka spreminja tuje zapise.
 *
 * Kadar se zložena oblika NE spremeni (`Juhe` → `juhe`), receptov ni treba popravljati po ključu —
 * a prikazno ime se vseeno posodobi, sicer bi v izpisu ostala stara različica.
 */
export async function renameCategory(
  userId: string,
  categoryId: string,
  name: string,
): Promise<{ category: CategorySummary; updatedRecipes: number }> {
  const category = await findOr404(userId, categoryId);
  const nextKey = foldTag(name);
  if (nextKey.length === 0) {
    throw badRequest('Ime kategorije mora vsebovati vsaj eno črko ali številko.');
  }

  if (nextKey !== category.key && (await RecipeCategoryModel.exists({ userId, key: nextKey }))) {
    throw badRequest('Kategorija s tem imenom že obstaja.');
  }

  const oldKey = category.key;
  const oldName = category.name;

  await RecipeCategoryModel.updateOne({ _id: category._id }, { $set: { name, key: nextKey } });

  // Recepti nosijo IMENA, zato je treba zamenjati element v obeh poljih. `arrayFilters` zadene
  // natanko tisti element in pusti ostale pri miru — brez njega bi bilo treba polje prebrati,
  // spremeniti in zapisati, kar je vzorec, ki ga ta modul nikjer ne uporablja.
  const result = await RecipeModel.updateMany(
    { ownerId: userId, categoryKeys: oldKey },
    { $set: { 'categories.$[oldName]': name, 'categoryKeys.$[oldKey]': nextKey } },
    { arrayFilters: [{ oldName: oldName }, { oldKey: oldKey }] },
  );

  return {
    category: { id: String(category._id), name, key: nextKey, order: category.order, recipeCount: 0 },
    updatedRecipes: result.modifiedCount,
  };
}

/**
 * Izbris kategorije jo ODSTRANI iz receptov (FR-085).
 *
 * VRSTNI RED JE POMEMBEN: recepti se popravijo PRED brisanjem vnosa. Obraten vrstni red bi ob
 * napaki med brisanjem pustil recepte z imenom kategorije, ki je ni več v besednjaku — kar sicer
 * ni pokvarjeno stanje (recept hrani imena), a bi izbirnik in seznam kazala različno.
 *
 * Izbris kategorije NE SME nikoli izbrisati recepta: recept je delo uporabnika, kategorija je
 * zgolj njegova razvrstitev. Isto pravilo kot za mape v modulu 008.
 */
export async function deleteCategory(
  userId: string,
  categoryId: string,
): Promise<{ updatedRecipes: number }> {
  const category = await findOr404(userId, categoryId);

  const result = await RecipeModel.updateMany(
    { ownerId: userId, categoryKeys: category.key },
    { $pull: { categories: category.name, categoryKeys: category.key } },
  );
  await RecipeCategoryModel.deleteOne({ _id: category._id });

  return { updatedRecipes: result.modifiedCount };
}

/** Vrstni red besednjaka — ena operacija s CELIM seznamom. */
export async function reorderCategories(userId: string, categoryIds: string[]): Promise<void> {
  const ids = categoryIds.map(String);
  if (ids.some((id) => !Types.ObjectId.isValid(id))) {
    throw badRequest('Seznam vsebuje neveljaven ID kategorije.');
  }

  // Vsak poslani ID mora biti klicateljev. Brez te preverbe bi seznam s tujim ID-jem tiho naredil
  // pol posodobitve — vrstni red bi bil videti shranjen, pa ne bi bil.
  const owned = await RecipeCategoryModel.find({ _id: { $in: ids }, userId }).select('_id').lean();
  if (owned.length !== new Set(ids).size) {
    throw badRequest('Seznam vsebuje ID kategorije, ki ni tvoja.');
  }

  await Promise.all(
    ids.map((id, index) => RecipeCategoryModel.updateOne({ _id: id, userId }, { order: index })),
  );
}

async function findOr404(userId: string, categoryId: string): Promise<CategoryLean> {
  if (!Types.ObjectId.isValid(categoryId)) throw notFound('Kategorija ne obstaja.');
  const category = await RecipeCategoryModel.findOne({ _id: categoryId, userId }).lean<CategoryLean | null>();
  if (!category) throw notFound('Kategorija ne obstaja.');
  return category;
}

function isDuplicateKey(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: number }).code;
  // `insertMany({ ordered: false })` ovije trke v `writeErrors` in sam nosi kodo 11000 le včasih.
  return code === 11000 || Array.isArray((err as { writeErrors?: unknown[] }).writeErrors);
}
