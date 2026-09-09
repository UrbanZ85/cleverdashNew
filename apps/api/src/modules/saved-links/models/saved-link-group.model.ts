import { Schema, model, type InferSchemaType } from 'mongoose';

// Mapa je uporabnikova RAZVRSTITEV, ne lastnik zapisov — zato brisanje mape zapise premakne
// med nerazvrščene in nobenega ne izbriše (FR-022, research.md §8). Zapisi kažejo na mapo
// (`SavedLink.groupId`), mapa pa jih ne našteva: seznam znotraj dokumenta bi pri poljubno
// velikem številu zapisov rasel brez meje in bi vsak premik terjal dva zapisa namesto enega.
//
// Gnezdenja ni (FR-023): mape so ena raven, zato tu ni `parentId`.
const savedLinkGroupSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, maxlength: 60 },
    order: { type: Number, required: true, default: 0 },
    /** Zloženo stanje mora preživeti ponovni obisk (US3, scenarij 2), zato je na strežniku in
     * ne v brskalnikovi shrambi — sicer bi bilo drugo na drugi napravi. */
    collapsed: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, versionKey: false },
);

savedLinkGroupSchema.index({ userId: 1, order: 1 });
// Unikaten NA UPORABNIKA: dve mapi z istim imenom pri istem uporabniku sta napaka, pri
// različnih uporabnikih pa ne (vzorec 004). Brez `userId` v ključu bi ime "Delo" lahko imel
// samo prvi uporabnik.
savedLinkGroupSchema.index({ userId: 1, name: 1 }, { unique: true });

export type SavedLinkGroupDoc = InferSchemaType<typeof savedLinkGroupSchema>;
export const SavedLinkGroupModel = model('SavedLinkGroup', savedLinkGroupSchema);
