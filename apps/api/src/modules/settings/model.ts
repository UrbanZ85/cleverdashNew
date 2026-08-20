import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md: singleton — en dokument za celoten sistem (FR-016, enouporabniško).
// Fiksen `_id` preprečuje nastanek drugega dokumenta. Brez polja lastnika.
const SINGLETON_ID = 'singleton';

const tileLayoutEntrySchema = new Schema(
  {
    type: { type: String, required: true },
    position: { type: Number, required: true },
    visible: { type: Boolean, default: true },
    config: { type: Schema.Types.Mixed, default: undefined },
  },
  { _id: false },
);

const settingsSchema = new Schema(
  {
    _id: { type: String, default: SINGLETON_ID },
    weather: {
      locationName: { type: String, default: 'Ljubljana' },
      latitude: { type: Number, default: 46.0629 },
      longitude: { type: Number, default: 14.5602 },
    },
    theme: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
    tiles: { type: [tileLayoutEntrySchema], default: [] },
    // Record<tabId, {enabled?, order?}> — Mixed, ker so ključi dinamični (imena zavihkov).
    tabs: { type: Schema.Types.Mixed, default: {} },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

export type SettingsDoc = InferSchemaType<typeof settingsSchema>;
export const SettingsModel = model('Settings', settingsSchema);

export interface TabOverride {
  enabled?: boolean;
  order?: number;
}

/** Vrne singleton, ustvari ga z privzetki, če še ne obstaja. */
export async function getOrCreateSettings(): Promise<InstanceType<typeof SettingsModel>> {
  const existing = await SettingsModel.findById(SINGLETON_ID);
  if (existing) return existing;
  return SettingsModel.create({ _id: SINGLETON_ID });
}
