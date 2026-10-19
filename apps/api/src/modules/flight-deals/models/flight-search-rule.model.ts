import { Schema, model, type InferSchemaType } from 'mongoose';
import { BAGGAGE_OPTIONS, DATE_MODES, DESTINATION_MODES, PROVIDER_IDS, PROVIDER_OUTCOMES } from '../domain/types.js';

// data-model.md (015): iskanje — lastnikova opredelitev, kaj išče.
//
// Polje lastnika je `userId` in NE `ownerId`, čeprav ima zapis `recipients`. Razlika do
// `TodoList.ownerId` + `members` (010) ni kozmetična: soudeleženec seznama opravil seznam BERE,
// prejemnik iskanja pa iskanja NIKOLI ne bere (FR-041) — bere samo ponudbe, do katerih pride
// PREK iskanja (FlightSearchMatch). Vsak dostop do tega zapisa je zato še vedno `{ _id, userId }`,
// kar je točno obljuba, ki jo ime `userId` v tej bazi daje (004). `recipients` je seznam
// naslovov za obvestila, ne seznam soudeležencev z vlogo; polja `role` ni, ker je vloga ena.
//
// Imena oseb se NE hranijo — razrešijo se ob branju (platform/users/directory.service.ts), da
// preimenovanje v Keycloaku ne pusti zamrznjene kopije. Edina izjema je posnetek v
// FlightNotification.items (glej tam).

const dayWindowSchema = new Schema(
  {
    /** ISO dnevi 1–7 (1 = ponedeljek); prazno = kateri koli dan. Isti dogovor kot
     * `TrackingProfile.daysOfWeek` (002). */
    weekdays: { type: [Number], default: [] },
    /** `HH:mm` v LOKALNEM času zadevnega letališča (FR-011); `null` = brez meje. */
    earliest: { type: String, default: null },
    latest: { type: String, default: null },
  },
  { _id: false },
);

const recipientSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** `false` začasno utiša dopise, ne da bi oseba izgubila vpogled v deljene ponudbe. */
    notify: { type: Boolean, required: true, default: true },
    addedAt: { type: Date, required: true },
  },
  {
    // Brez `_id`: prejemnik JE `userId`. Enoličnosti NE uveljavlja indeks (prepovedal bi istega
    // človeka pri dveh iskanjih), ampak pogoj `'recipients.userId': { $ne }` v `$push`
    // (router.ts) — isti razlog kot pri `TodoList.members`.
    _id: false,
  },
);

const checkOutcomeSchema = new Schema(
  {
    providerId: { type: String, enum: PROVIDER_IDS, required: true },
    outcome: { type: String, enum: PROVIDER_OUTCOMES, required: true },
    /** Slovensko, za uporabnika — brez tehničnih podrobnosti (FR-017). */
    message: { type: String, default: null },
    queries: { type: Number, required: true, default: 0 },
    offers: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const flightSearchRuleSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, maxlength: 80 },
    active: { type: Boolean, required: true, default: true },
    /** IATA kode, velike črke, preverjene proti vgrajenemu naboru (domain/airports.ts). */
    departureAirports: { type: [String], required: true },
    destination: {
      mode: { type: String, enum: DESTINATION_MODES, required: true },
      countries: { type: [String], default: [] },
      airports: { type: [String], default: [] },
    },
    excluded: {
      countries: { type: [String], default: [] },
      airports: { type: [String], default: [] },
    },
    dates: {
      mode: { type: String, enum: DATE_MODES, required: true },
      /** `yyyy-LL-dd` brez cone — dan po lokalnem času odhodnega letališča (člen V.4). */
      departDate: { type: String, default: null },
      /** `null` pri `fixed` = enosmerno. */
      returnDate: { type: String, default: null },
      from: { type: String, default: null },
      to: { type: String, default: null },
      /** Pri `rolling`: koliko mesecev od dneva preverjanja. */
      months: { type: Number, default: null },
    },
    flexDays: { type: Number, required: true, default: 0 },
    returnWithinWindow: { type: Boolean, required: true, default: true },
    /** `null` pri enosmernem iskanju. */
    minNights: { type: Number, default: null },
    maxNights: { type: Number, default: null },
    outbound: { type: dayWindowSchema, required: true },
    inbound: { type: dayWindowSchema, required: true },
    minStayHours: { type: Number, default: null },
    passengers: {
      adults: { type: Number, required: true, default: 1 },
      childrenAges: { type: [Number], default: [] },
    },
    price: {
      maxPerPerson: { type: Number, default: null },
      maxTotal: { type: Number, default: null },
      currency: { type: String, required: true, default: 'EUR' },
    },
    airlines: { type: [String], default: [] },
    /** `0` = samo direktni (FR-012). */
    maxStops: { type: Number, required: true, default: 0 },
    baggage: { type: String, enum: BAGGAGE_OPTIONS, required: true, default: 'any' },
    recipients: { type: [recipientSchema], default: [] },
    /** Stanje ZADNJEGA preverjanja po virih (FR-017). `null`, dokler ni bilo nobenega. */
    lastCheck: {
      type: new Schema(
        {
          runId: { type: Schema.Types.ObjectId, ref: 'FlightSearchRun', required: true },
          at: { type: Date, required: true },
          outcomes: { type: [checkOutcomeSchema], default: [] },
        },
        { _id: false },
      ),
      default: null,
    },
    lastSuccessfulCheckAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

// Moja iskanja: `{ userId }` + razvrstitev po zadnji spremembi — `updatedAt` na KONCU, da Mongo
// ne ureja v pomnilniku (ista opomba kot pri `todoListSchema`).
flightSearchRuleSchema.index({ userId: 1, updatedAt: -1 });
// Deljene ponudbe: "katera iskanja me obveščajo" — večključni indeks nad vdelanim seznamom.
flightSearchRuleSchema.index({ 'recipients.userId': 1 });
// Zagon: aktivna iskanja. Nizka selektivnost, a zagon tega ne bere pogosto in brez indeksa bi
// bil to pregled zbirke ob vsakem terminu.
flightSearchRuleSchema.index({ active: 1 });

export type FlightSearchRuleDoc = InferSchemaType<typeof flightSearchRuleSchema>;
export const FlightSearchRuleModel = model('FlightSearchRule', flightSearchRuleSchema);
