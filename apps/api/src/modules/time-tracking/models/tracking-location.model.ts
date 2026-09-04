import { Schema, model, type InferSchemaType } from 'mongoose';
import { START_ACTIONS } from '../../../domain/clock-state.js';

// data-model.md: kje in na kateri strani se registracija zgodi. `coordinateTemplate`
// ohranja obliko z "_" iz starega sistema (docs/legacy-engine.md §3), a je pomen zdaj
// eksplicitno dokumentiran v shemi. Razrešitev v konkretno število se zgodi v domenski
// plasti, portal prejme že razrešeno lokacijo.
const coordinateTemplateSchema = new Schema(
  {
    latitude: { type: String, required: true },
    longitude: { type: String, required: true },
  },
  { _id: false },
);

const trackingLocationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 004: edinstvenost je zdaj (userId, name), ne globalno `name` — glej indeks spodaj.
    name: { type: String, required: true },
    url: { type: String, required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'RemoteSession', required: true },
    // FR-090: gumb, s katerim se na TEJ lokaciji začne delo. Stran delodajalca ponuja štiri
    // izključujoče se različice (domain/clock-state.ts, `START_ACTIONS`) in izbira med njimi
    // je lastnost KRAJA, ne urnika: isti profil pritisne "Prijava na delo" iz pisarne, "Delo
    // od doma" doma in "Delo na terenu" na terenu. Zato živi tu in ne v profilu.
    startAction: { type: String, enum: START_ACTIONS, required: true, default: 'Prijava na delo' },
    // FR-094: koordinati sta obvezni SAMO, kadar se lokacija pošilja. Lokacija, ki strani
    // lege ne pove, koordinat nima kje dobiti — zahtevati ju je pomenilo siliti uporabnika,
    // da si jih izmisli, izmišljena vrednost pa je videti kot resnična.
    coordinateTemplate: {
      type: coordinateTemplateSchema,
      required: function (this: { sendGeolocation?: boolean }) {
        return this.sendGeolocation !== false;
      },
    },
    // FR-094: ali se lega naprave sploh pošlje strani. Izklopljeno pomeni, da brskalnik
    // geolokacije nima (dovoljenje je izrecno zavrnjeno) — koordinati se OHRANITA, ker je
    // stikalo namenjeno preklapljanju, ne brisanju vnesenih podatkov.
    sendGeolocation: { type: Boolean, default: true },
    jitterMeters: { type: Number, default: 10 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

trackingLocationSchema.index({ userId: 1, name: 1 }, { unique: true });

export type TrackingLocationDoc = InferSchemaType<typeof trackingLocationSchema>;
export const TrackingLocationModel = model('TrackingLocation', trackingLocationSchema);
