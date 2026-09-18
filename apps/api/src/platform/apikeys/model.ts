import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md: ključ brez obsegov ne sme obstajati — obseg je bistvo omejenosti ključa
// (člen III). Preklic je `revokedAt`, ne brisanje, da ostane sled v dnevniku.
const apiKeySchema = new Schema(
  {
    label: { type: String, required: true },
    keyHash: { type: String, required: true, unique: true },
    keyPrefix: { type: String, required: true },
    scopes: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => Array.isArray(v) && v.length > 0,
        message: 'Ključ brez obsegov ni dovoljen (člen III).',
      },
    },

    /**
     * Uporabnik, v čigar imenu ključ piše. `null` samo za ključe, izdane PRED to funkcionalnostjo.
     *
     * Do zdaj ključ ni bil vezan na nikogar in člen III je to utemeljeval z "API ključ ni geslo
     * uporabnika" — kar drži za DOSTOP, ne pa za LASTNIŠTVO nastalega zapisa. Posledica je bila
     * `resolveAutomationOwnerUserId()`: ugibanje, ki poišče uporabnika s podedovanimi podatki ali
     * edinega uporabnika, pri dveh uporabnikih pa vrne `null` in avtomatizacija nima komu pisati.
     * Pri enouporabniški namestitvi se to nikoli ni poznalo; z 004 (Keycloak, več uporabnikov) je
     * to luknja, ki se pokaže šele ob drugem uporabniku.
     *
     * Polje NE pomeni, da ključ nosi pravice tega uporabnika — te so še vedno IZKLJUČNO v
     * `scopes`. Pove samo, čigav je nastali recept. Zato tudi ostaja `ownerId` in ne `userId`:
     * enako kot pri `Recipe.ownerId` gre za lastništvo zapisa, ne za obljubo izolacije.
     */
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    /**
     * Cilji uvoza (`platform/ingest/registry.ts`), ki jih ta ključ sme uporabiti — npr.
     * `['recipes']`. Prazno polje pomeni "ta ključ ni za uvoz" in ga `POST /ingest` zavrne.
     *
     * OŽJE od obsegov in namenoma podvojeno z njimi: `recipes:write` pove, da ključ sme pisati
     * recepte, `targets: ['recipes']` pa, da sme to počel prek vstopne točke za agenta. Ključ, ki
     * ga človek prilepi v tuj pogovorni vmesnik, je najbolj izpostavljena poverilnica v tej
     * namestitvi — pri njem je ena zapora premalo.
     *
     * Vrednosti se NE preverjajo proti registru v shemi: register se napolni ob zagonu, shema pa
     * se ovrednoti ob prvem zapisu, in `enum` bi ob odstranitvi modula pokvaril zapisovanje
     * ključev za vse ostale cilje. Preverba je v `router.ts`, kjer je register gotovo naložen.
     */
    targets: { type: [String], default: [] },

    lastUsedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: false, versionKey: false },
);

apiKeySchema.index({ keyPrefix: 1 });
// Seznam ključev enega uporabnika — `GET /api-keys` po tej funkcionalnosti ne vrača več vseh
// ključev v namestitvi, ampak klicateljeve (glej router.ts).
apiKeySchema.index({ ownerId: 1 });

export type ApiKeyDoc = InferSchemaType<typeof apiKeySchema>;
export const ApiKeyModel = model('ApiKey', apiKeySchema);
