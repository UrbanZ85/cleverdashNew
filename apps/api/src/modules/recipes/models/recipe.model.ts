import { Schema, model, type InferSchemaType } from 'mongoose';
import { MEMBER_ROLES } from '../domain/capabilities.js';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_INGREDIENT_LENGTH,
  MAX_STEP_LENGTH,
  MAX_TITLE_LENGTH,
} from '../domain/recipe-input.js';

// data-model.md (013). Recept je AGREGAT: vsebina, oznake, soudeleženci in javna povezava so v
// enem dokumentu.
//
// Zakaj vse v enem dokumentu (research.md §13): ta namestitev ima MongoDB kot samostojen
// strežnik brez `--replSet` (v produkciji skupni vsebnik `mongo` na VPS-u, v testih
// `MongoMemoryServer`), zato transakcij čez več dokumentov NI. Sprememba, ki bi se dotaknila
// recepta in njegovega članstva hkrati, bi bila v ločenih zbirkah dve pisanji brez transakcije —
// torej stanje, ki ga izpad sredi operacije pusti napol. V enem dokumentu je to eno atomarno
// pisanje.
//
// SLIKE so edina izjema in so v svoji zbirki (recipe-image.model.ts): bajti so veliki in se ob
// izpisu seznama ne smejo brati (FR-025). To je natanko tista razmejitev, ki je v modulu 010
// opravila PUSTILA v dokumentu (majhna, brana vedno) in v modulu 007 zvok iz beležke VZELA ven
// (velik, bran redko).

const recipeMemberSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: MEMBER_ROLES, required: true },
    addedAt: { type: Date, required: true },
    /** `null` pomeni, da soudeleženec recepta še ni odprl — takrat je zanj označen kot NOV
     * (FR-038). To je nadomestilo za potisno obvestilo, ki v tej namestitvi ne deluje. */
    seenAt: { type: Date, default: null },
  },
  {
    // Brez `_id`: članstvo JE `userId`. Lasten `_id` bi isti stvari dal drugo identiteto in
    // dopustil dva vnosa za istega človeka z različnima vlogama — stanje, na katero razsodnik
    // dostopa (domain/capabilities.ts, `roleFor`) nima enoličnega odgovora. Enoličnosti NE
    // uveljavlja indeks (enoličen indeks nad `members.userId` bi prepovedal članstvo v DVEH
    // receptih), ampak pogoj `'members.userId': { $ne: ... }` v `$push`
    // (services/recipe-access.service.ts).
    _id: false,
  },
);

const publicShareSchema = new Schema(
  {
    /** 22 znakov base64url = 16 naključnih bajtov (domain/share-token.ts). */
    token: { type: String, required: true },
    createdAt: { type: Date, required: true },
    /** `null` = povezava je živa. Preklic je NEPOVRATEN (FR-044): zapis se obdrži in se ne
     * pobriše, ker bi brisanje izbrisalo tudi dejstvo, da je povezava obstajala. Nova izdaja je
     * NOV `token`, ne oživitev starega (FR-045). */
    revokedAt: { type: Date, default: null },
  },
  { _id: false },
);

const recipeSchema = new Schema(
  {
    /** Lastnik. Polje se imenuje `ownerId` in NE `userId`: pri deljenem zapisu obstajata dve
     * vrsti pripadnosti in ju je treba ločiti že v imenu. `userId` v tej bazi pomeni "ta zapis je
     * zaseben in `{ _id, userId }` je pogoj dostopa" (glej note.model.ts, saved-link.model.ts) —
     * obljuba, ki je tu NAMENOMA neresnična: soudeleženec bere zapis, katerega `ownerId` ni
     * njegov, dostop pa odloči `resolveRecipeAccess`. Ponovna uporaba imena bi vsakega bodočega
     * bralca zavedla v izolacijo, ki je ta model ne daje. Isti razlog in ista izbira kot pri
     * `TodoList.ownerId`; `tests/unit/no-owner-fields.spec.ts` ima za to svojo kategorijo. */
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    /** EDINO obvezno polje (FR-001). To je glavna razlika do modula 008, kjer je obvezen naslov:
     * recept z babičinega lista nima naslova in ga ne bo imel (research.md §1). */
    title: { type: String, required: true, maxlength: MAX_TITLE_LENGTH },

    /** NORMALIZIRAN naslov (domain/recipe-url.ts) ali `null`. `null` je polnopravno stanje in ne
     * pomanjkljivost (FR-002). */
    url: { type: String, default: null, maxlength: 2048 },

    description: { type: String, default: null, maxlength: MAX_DESCRIPTION_LENGTH },

    /** Besedilo, ne razčlenjene količine (FR-004, research.md §12): "400 g buče" je en vnos.
     * Razčlenjevanje bi se motilo natanko pri vnosih, ki jih človek vpiše na roko ("ščepec",
     * "2-3 žlice"), napačno razčlenjena sestavina pa je slabša od nerazčlenjene. */
    ingredients: { type: [{ type: String, maxlength: MAX_INGREDIENT_LENGTH }], default: [] },
    steps: { type: [{ type: String, maxlength: MAX_STEP_LENGTH }], default: [] },

    prepMinutes: { type: Number, default: null },
    servings: { type: Number, default: null },

    /** Prikazna oblika, kot jo je vpisal uporabnik (FR-006). */
    tags: { type: [String], default: [] },
    /** Zložena oblika istih oznak — po njej teče filter. Dve polji in ne eno, ker mora `Sladice`
     * ostati `Sladice` v izpisu, a se ujeti s filtrom `sladice`; z enim poljem bi bilo treba
     * izbrati med lepim izpisom in delujočim filtrom. Vzdržuje ju skupaj `normalizeTags`. */
    tagKeys: { type: [String], default: [] },

    /** Kategorije ("Juhe", "Kosila", "Zajtrki") — IMENA, ne identifikatorji.
     *
     * Zakaj imena in ne `ref: 'RecipeCategory'` (glej recipe-category.model.ts): recept vidita dva
     * uporabnika z DVEMA različnima besednjakoma, in `categoryId` bi za soudeleženca kazal v
     * zbirko, ki ni njegova. Z imeni filtriranje deluje enotno čez lastne in deljene recepte,
     * izbris kategorije iz besednjaka pa ne pusti recepta kazati v nič.
     *
     * Zakaj SVOJI polji in ne del `tags`: kategorija pride iz urejenega besednjaka in je obrok
     * oziroma vrsta jedi, oznaka je prosto besedilo ("vegi", "za goste"). Filtra sta dva in ju je
     * mogoče uporabiti hkrati; z enim poljem tega ne bi bilo mogoče ločiti. */
    categories: { type: [String], default: [] },
    categoryKeys: { type: [String], default: [] },

    /** 1–5, `null` = brez ocene. LASTNIKOVA (FR-035, research.md §3): ocena na članstvu bi
     * odprla povprečja in s tem recenzijski sistem, ki ga nihče ni naročil. */
    rating: { type: Number, default: null, min: 1, max: 5 },

    /** `null` = nikoli kuhano. Pri razvrstitvi po tem polju naraščajoče gre `null` PRED najstarejši
     * datum, kar je natanko želeni vrstni red (FR-053) — Mongo `null` uvrsti najnižje. */
    lastCookedAt: { type: Date, default: null },
    cookCount: { type: Number, required: true, default: 0 },

    /** Naslovna slika. Ob brisanju naslovne se prenese na najstarejšo preostalo ali postane
     * `null` (FR-024) — recept brez slike je veljaven recept. */
    coverImageId: { type: Schema.Types.ObjectId, ref: 'RecipeImage', default: null },

    members: { type: [recipeMemberSchema], default: [] },
    publicShare: { type: publicShareSchema, default: null },

    /** Izid branja izvorne strani. `none` = naslova ni, in to NI napaka. Izid je POLJE v
     * odgovoru in ne vrstica v dnevniku (člen VII): uporabnik mora videti, da strani ni bilo
     * mogoče prebrati, sicer ne ve, zakaj so polja prazna. */
    sourceStatus: {
      type: String,
      enum: ['none', 'ok', 'skipped', 'failed'],
      default: 'none',
    },
    sourceFetchedAt: { type: Date, default: null },

    /** Izpeljano ob vsakem pisanju: ime + opis + sestavine + oznake, zloženo
     * (domain/search-text.ts). Korakov v njem NI — glej razlog tam. */
    searchText: { type: String, required: true, default: '' },

    /** Kdo je nazadnje karkoli spremenil (FR-009) — pri deljenem receptu edini podatek, ki
     * odgovori na vprašanje "kdo je popravil količino moke?". Nastavi ga VSAK zapis. */
    lastModifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    // `versionKey: false` ostane in optimistične sočasnosti NAMENOMA ni (research.md §14): z
    // `__v` bi `save()` IZGLEDAL varen — deloval bi v razvoju in izgubljal popravke v produkciji,
    // medtem ko je odsotnost `__v` uveljavljanje pravila "nikoli brati-spremeniti-pisati". Vsa
    // pisanja v tem modulu gredo prek operatorjev.
    versionKey: false,
  },
);

// Seznam lastnih receptov v privzeti razvrstitvi (sort=recent).
recipeSchema.index({ ownerId: 1, updatedAt: -1 });
// Seznam DELJENIH receptov. Brez tega indeksa bi bil `$or` iz `buildRecipesFilter` na tej strani
// pregled cele zbirke — in bi z rastjo zbirke upočasnil vsak izpis, tudi lastnikov.
recipeSchema.index({ 'members.userId': 1, updatedAt: -1 });
// Filter po oznaki (FR-052) in po kategoriji (FR-082). Dva indeksa, ker sta dva neodvisna
// filtra — sestavljen indeks čez obe polji bi pospešil samo poizvedbo, ki navede OBOJE.
recipeSchema.index({ ownerId: 1, tagKeys: 1 });
recipeSchema.index({ ownerId: 1, categoryKeys: 1 });
// Javna pot. `sparse`, ker večina receptov javne povezave nima in prazni vnosi v indeksu ne
// koristijo nikomur.
//
// NI `unique`: enoličen redek indeks nad poljem v poddokumentu se ob odsotnem poddokumentu vede
// drugače, kot bralec pričakuje, pri 128 bitih naključja pa trk ni nevarnost, pred katero bi se
// bilo treba braniti z indeksom. Enoličnost je lastnost generatorja (domain/share-token.ts).
recipeSchema.index({ 'publicShare.token': 1 }, { sparse: true });

// Indeksa nad `searchText` namenoma NI: iskanje je nesidran regularni izraz, ki ga indeks ne
// pospeši, zbirka pa je po predpostavki iz spec.md nekaj sto zapisov na uporabnika.

export type RecipeDoc = InferSchemaType<typeof recipeSchema>;
export const RecipeModel = model('Recipe', recipeSchema);
