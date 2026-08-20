import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md, research.md §4: predpomnilnik zunanjih virov IN nosilec zadnjega znanega
// podatka (FR-026). NA TEJ KOLEKCIJI NAMENOMA NI TTL INDEKSA — iztečen zapis se ne sme
// izbrisati, ker je natanko tisto, kar se prikaže, ko vir ne odgovori. Mongo TTL indeks bi
// to tiho onemogočil šele ob prvem resničnem izpadu v produkciji, ne v testu.
const externalCacheSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    sourceUrl: { type: String, required: true },
    contentType: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    fetchedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    etag: { type: String, default: null },
    lastModified: { type: String, default: null },
    lastAttemptAt: { type: Date, required: true },
    lastError: { type: String, default: null },
    consecutiveFailures: { type: Number, default: 0 },
  },
  { versionKey: false },
);

export type ExternalCacheDoc = InferSchemaType<typeof externalCacheSchema>;
export const ExternalCacheModel = model('ExternalCache', externalCacheSchema);
