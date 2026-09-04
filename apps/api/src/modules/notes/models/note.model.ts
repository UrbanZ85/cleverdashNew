import { Schema, model, type InferSchemaType } from 'mongoose';

// Beležka je OSEBEN podatek: `userId` je obvezen in je prvi člen vsakega indeksa, enako kot
// pri kamerah (modules/cameras/models/camera.model.ts) po 004. Izolacija med uporabniki je
// zagotovljena z `userId` na vsaki poizvedbi, ne s sistemom obsegov.
//
// Zvočni posnetki NISO tukaj, ampak v svoji kolekciji (note-audio.model.ts): posnetek je
// binarni podatek velikosti megabajtov, beležka pa se bere ob vsakem izpisu seznama. V istem
// dokumentu bi vsak seznam beležk prenesel tudi vse posnetke.
const noteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, default: '' },
    body: { type: String, default: '' },
    // Oznake so vedno normalizirane (male črke, brez podvojitev) — glej domain/note-input.ts.
    // Normalizacija je v domenski plasti in ne v shemi, ker mora biti testabilna brez baze.
    tags: { type: [String], default: [] },
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

// Seznam je vedno "pripete najprej, nato najnovejše spremenjene" (glej router.ts) — indeks
// sledi TOČNO temu vrstnemu redu, sicer bi Mongo sortiral v pomnilniku.
noteSchema.index({ userId: 1, pinned: -1, updatedAt: -1 });
noteSchema.index({ userId: 1, tags: 1 });

export type NoteDoc = InferSchemaType<typeof noteSchema>;
export const NoteModel = model('Note', noteSchema);
