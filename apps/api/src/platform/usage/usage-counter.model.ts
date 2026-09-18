import { Schema, model, type InferSchemaType } from 'mongoose';

// specs/014-admin-analytics/data-model.md. EDINA nova hranjena telemetrija v aplikaciji.
//
// Zapis je ŠTEVEC, ne dogodek: ena vrstica na (oseba, dan, vrsta, ključ). Iz nje je mogoče
// prešteti uporabo, ni pa mogoče rekonstruirati, kaj je kdo delal ob pol štirih popoldne —
// ogledi istega dne so en zapis brez vrstnega reda (člen XII).
//
// ČESA V TEM ZAPISU NI IN NIKOLI NE BO: IP naslova, uporabniškega agenta, poti (URL),
// identifikatorja seje ali naprave, trajanja in časovnega žiga posameznega ogleda.
//
// `userId` je FIZIČNA OSEBA za tipkovnico (`req.actor`), ne lastnik podatkov (`req.auth`). To je
// obratno od vseh modulov (docs/adding-a-tab.md, korak 7) in je namerno: med prevzemom imena
// (012) mora ogled pripasti administratorju, sicer njegovo pregledovanje tujih podatkov napihne
// prav tiste številke, ki jih bere.

const usageCounterSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** `yyyy-LL-dd` v `Europe/Ljubljana` (domain/usage-day.ts, člen V.4). */
    day: { type: String, required: true },
    kind: { type: String, required: true, enum: ['login', 'tab-view'] },
    /** Oznaka zavihka; pri prijavi konstanta `'-'` (glej `NO_KEY` in razlog tam). */
    key: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
    /** UTC instant zadnjega dogodka. Nosi okno proti dvojnemu štetju — primerjava je v filtru
     * poizvedbe, ne v kodi (research.md §4). */
    lastAt: { type: Date, required: true },
    /** `day` + `USAGE_RETENTION_DAYS`, konec dneva. Izračunan iz DNEVA, zato ob vsakem
     * povečanju ista vrednost — sicer bi števec svoj rok ves dan odrival pred sabo. */
    expiresAt: { type: Date, required: true },
  },
  // `createdAt`/`updatedAt` bi bila tretji in četrti čas ob `day` in `lastAt`, ki ne odgovarjata
  // na nobeno vprašanje s tega zaslona.
  { timestamps: false, versionKey: false },
);

// ZAPORA PRED DVOJNIM ŠTETJEM, ne pospešek. `recorder.service.ts` se nanjo izrecno zanaša:
// zapis, ki filtra ne ujame, pade na tem indeksu z `E11000`, kar pot obravnava kot "že šteto".
// Brez unikatnosti bi dva hkratna ogleda ustvarila dve vrstici in obe bi bili šteti.
usageCounterSchema.index({ userId: 1, day: 1, kind: 1, key: 1 }, { unique: true });
// Lestvica cele namestitve v obdobju.
usageCounterSchema.index({ day: 1, kind: 1 });
// Lestvica po posameznem zavihku skozi obdobje.
usageCounterSchema.index({ kind: 1, key: 1, day: 1 });
// TTL je tu PRAVILEN — nasprotno od `platform/cache/model.ts`, kjer je izrecno prepovedan, ker je
// iztečen zapis tam zadnje znano stanje. Star števec ni nič. TTL obenem pomeni, da roka hrambe
// ne more nihče pozabiti izvajati: indeks je bodisi ustvarjen bodisi ga ni (FR-030).
usageCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type UsageCounterDoc = InferSchemaType<typeof usageCounterSchema>;
export const UsageCounterModel = model('UsageCounter', usageCounterSchema);
