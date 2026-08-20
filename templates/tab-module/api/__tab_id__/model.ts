import { Schema, model, type InferSchemaType } from 'mongoose';

// PREDLOGA. Sistem je enouporabniški (FR-016) — domenski zapisi ne nosijo `userId`, razen
// avtentikacijskih zapisov, kjer je uporabnik predmet, ne lastnik (glej data-model.md).
const __tab_id__Schema = new Schema(
  {
    // polja modula
  },
  { versionKey: false },
);

export type __tab_id__Doc = InferSchemaType<typeof __tab_id__Schema>;
export const __tab_id__Model = model('__TabId__', __tab_id__Schema);
