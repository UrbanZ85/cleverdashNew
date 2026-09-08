import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md: hrama 24 h. TTL indeks je tu PRAVILEN (nasprotno od externalCache) — star
// idempotentni zapis nima uporabne vrednosti.
const idempotencyKeySchema = new Schema(
  {
    key: { type: String, required: true },
    endpoint: { type: String, required: true },
    /**
     * KDO je ključ uporabil — `<vrsta>:<id>` klicatelja (uporabnik ali API ključ).
     *
     * Nastalo iz najdbe varnostnega pregleda 009b. Zapis je namreč shranjen ODGOVOR, ponovitev pa
     * se zgodi v vmesniku PRED `requireScopes` (main.ts): brez tega polja je vsak, ki izve
     * vrednost ključa, dobil shranjeni odgovor tuje zahteve — tudi povsem brez poverilnic. Ključ
     * je obljuba o isti zahtevi istega klicatelja, ne javna naslovnica odgovora.
     *
     * `required` NI, ker zapisi iz časa pred to spremembo tega polja nimajo; primerjava v
     * `middleware.ts` jih zavrne enako kot tuje — 24 ur (`expires`) po namestitvi jih ni več.
     */
    subject: { type: String },
    requestHash: { type: String, required: true },
    statusCode: { type: Number, required: true },
    responseBody: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: () => new Date(), expires: '24h' },
  },
  { versionKey: false },
);

// Unikatnost ostane nad `{key, endpoint}` in NE vključuje `subject`: dva klicatelja z istim
// ključem na isti poti sta napaka klicatelja, ne dva veljavna zapisa. (Poleg tega ta namestitev
// indeksov ne usklajuje z `syncIndexes` — stari indeks bi ostal in bi si z novim nasprotoval.)
idempotencyKeySchema.index({ key: 1, endpoint: 1 }, { unique: true });

export type IdempotencyKeyDoc = InferSchemaType<typeof idempotencyKeySchema>;
export const IdempotencyKeyModel = model('IdempotencyKey', idempotencyKeySchema);
