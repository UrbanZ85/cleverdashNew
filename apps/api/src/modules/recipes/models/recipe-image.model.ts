import { Schema, model, type InferSchemaType } from 'mongoose';
import { ALLOWED_IMAGE_MIME_TYPES } from '../domain/image-type.js';

// Slike so v Mongu kot `Buffer`, ne na datotečnem sistemu in ne v GridFS — research.md §4.
//
// Primerjava z obema obstoječima odločitvama v tem zaledju:
//  - `modules/notes/models/note-audio.model.ts` (007): `Buffer` v Mongu, do 10 MB. Datotečni
//    sistem bi zahteval nov trajni nosilec v infra/docker-compose.yml in bi se razšel z varnostno
//    kopijo baze — posnetek bi lahko preživel svojo beležko ali obratno.
//  - `modules/file-sharing/services/blob-storage.service.ts` (009): datotečni sistem, do 500 MB.
//    `Buffer` bi vsebnik ubil.
//
// Fotografija s telefona je na strani ZVOKA: nekaj MB, dva reda velikosti pod mejo dokumenta
// (16 MB). Odločilen ni prostor, ampak to, da se slika in recept ne smeta raziti.
//
// LOČENA zbirka in ne polje v receptu: `select: false` pomeni, da noben izpis seznama ne prenese
// bajtov (FR-025, SC-005) — te prebere izključno pot za prikaz, ki jih izrecno zahteva.

const recipeImageSchema = new Schema(
  {
    recipeId: { type: Schema.Types.ObjectId, ref: 'Recipe', required: true },
    /** Lastnik RECEPTA ob nalaganju. Podvojeno iz recepta namerno: omogoča počiščenje osirotelih
     * slik in izračun kvote brez branja receptov. */
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Kdo je sliko naložil — lahko je soudeleženec s pravico urejanja, ne le lastnik (FR-034). */
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    /** IZKLJUČNO iz podpisa datoteke (domain/image-type.ts), nikoli iz glave `Content-Type`, ki
     * jo pošlje odjemalec. Slika se s to vrsto postreže nazaj, zato bi bila tu izjava odjemalca
     * pot do shranjenega XSS (FR-021, research.md §6). `enum` je druga, neodvisna zapora: tudi
     * napaka v klicatelju ne more v to polje spraviti `text/html`. */
    mimeType: { type: String, required: true, enum: ALLOWED_IMAGE_MIME_TYPES },
    byteSize: { type: Number, required: true },

    /** Kar je izmeril brskalnik. `null`, kadar tega ni sporočil — mer NAMENOMA ne izračunavamo iz
     * slike, ker bi to terjalo dekodirnik slik na strežniku, prikaz razmerja stranic pa ni vreden
     * te odvisnosti. Isti razlog kot `durationMs` pri zvoku beležk. */
    width: { type: Number, default: null },
    height: { type: Number, default: null },

    data: { type: Buffer, required: true, select: false },

    /** Pomanjšava za seznam (research.md §5). Izračuna jo ODJEMALEC v `<canvas>` in jo pošlje ob
     * izvirniku; `sharp` na strežniku bi bil izvorni gradnik (`node-gyp`, drugačen paket za
     * arm64 in amd64) — strošek, ki ga ena pomanjšana slika ne opraviči.
     *
     * Ker pride od odjemalca, je NEPREVERJEN VNOS in gre skozi isto preverbo podpisa in velikosti
     * kot izvirnik, le z nižjo mejo. `null` ni napaka: takrat seznam postreže izvirnik. Ta pot
     * mora obstajati, sicer bi bil `<canvas>` v brskalniku pogoj za shranjevanje slike. */
    thumb: { type: Buffer, default: null, select: false },
    thumbMimeType: { type: String, default: null, enum: [...ALLOWED_IMAGE_MIME_TYPES, null] },

    caption: { type: String, default: null, maxlength: 200 },
  },
  { timestamps: true, versionKey: false },
);

// Slike enega recepta v vrstnem redu nalaganja — tako jih vrne izpis in tako se izbere naslednja
// naslovna ob brisanju prejšnje (FR-024).
recipeImageSchema.index({ recipeId: 1, createdAt: 1 });
// Počiščenje osirotelih slik in kvota po uporabniku.
recipeImageSchema.index({ ownerId: 1 });

export type RecipeImageDoc = InferSchemaType<typeof recipeImageSchema>;
export const RecipeImageModel = model('RecipeImage', recipeImageSchema);
