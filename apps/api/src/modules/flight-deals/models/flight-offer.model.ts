import { Schema, model, type InferSchemaType } from 'mongoose';
import { AVAILABILITIES, CHANGE_TYPES, PROVIDER_IDS } from '../domain/types.js';

// data-model.md (015): ponudba — ena konkretna kombinacija letov pri enem viru.
//
// Zapis NIMA lastnika (ne `userId` ne `ownerId`): ista ponudba je ista za vsakogar, kot zapis v
// `ExternalCache`. Kdo jo vidi, odloči FlightSearchMatch. tests/unit/no-owner-fields.spec.ts jo
// zato uvršča med SKUPNE referenčne tabele.
//
// Identiteta je `identityKey` (domain/identity.ts): hash nad letališči, časi odhodov, prevoznikom,
// številkami letov, prestopi, sestavo potnikov in valuto — NIKOLI nad ceno (FR-026) in nikoli nad
// časom pristanka (viri ga zaokrožujejo različno ali ga sploh ne dajo).

const segmentSchema = new Schema(
  {
    departureAt: { type: Date, required: true },
    arrivalAt: { type: Date, default: null },
    flightNumbers: { type: [String], default: [] },
    stops: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const moneySchema = new Schema(
  {
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
  },
  { _id: false },
);

const flightOfferSchema = new Schema(
  {
    identityKey: { type: String, required: true },
    providerId: { type: String, enum: PROVIDER_IDS, required: true },
    /** IATA koda prevoznika; `'??'`, kadar je vir ne da. */
    airline: { type: String, required: true },
    airlineName: { type: String, default: null },
    origin: { type: String, required: true },
    destination: { type: String, required: true },
    outbound: { type: segmentSchema, required: true },
    /** `null` = enosmerno. */
    inbound: { type: segmentSchema, default: null },
    /** Koledarske noči na destinaciji po lokalnem času ciljnega letališča; `null` pri enosmernem. */
    nights: { type: Number, default: null },
    /** SKUPNA cena za `passengers`. */
    price: { type: moneySchema, required: true },
    /** Kaj vir pravi, da cena vključuje (FR-013). */
    priceIncludes: { type: String, default: null },
    passengers: {
      adults: { type: Number, required: true },
      children: { type: Number, required: true, default: 0 },
    },
    fare: {
      type: { type: String, default: null },
      baggage: { type: String, default: null },
    },
    /** Samo, če gostitelj pripada viru (domain/booking-url.ts). */
    bookingUrl: { type: String, default: null },
    /** Prejšnja cena, kot jo navede VIR (Ryanair); ne vpliva na našo primerjavo. */
    providerPreviousPrice: { type: moneySchema, default: null },
    /** Čas, ki ga vir navede za podatek — pri Travelpayouts čas tuje najdbe, sicer = lastCheckedAt. */
    dataAt: { type: Date, required: true },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    lastCheckedAt: { type: Date, required: true },
    /** `unavailable` SAMO, kadar je vir za isto poizvedbo uspešno odgovoril in ponudbe ni vrnil
     * (FR-028). Neuspeh vira tega polja ne spremeni. */
    availability: { type: String, enum: AVAILABILITIES, required: true, default: 'available' },
    /** Ključ poizvedbe, ki je ponudbo ZADNJIČ vrnila — po njem se ugotavlja `unavailable`. */
    lastQueryKey: { type: String, required: true },
    /** Zadnja DRUGAČNA cena, za prikaz brez branja zgodovine. `null` pri NOVO (FR-030). */
    previousPrice: {
      type: new Schema(
        {
          amount: { type: Number, required: true },
          currency: { type: String, required: true },
          at: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    lastChangeType: { type: String, enum: CHANGE_TYPES, required: true, default: 'NEW' },
    /** Dan po zadnjem odhodu + 7 dni → TTL. Ponudba po odhodu ni več ponudba. */
    expiresAt: { type: Date, required: true },
  },
  {
    // Časi so domenski in izrecni (`firstSeenAt`, `lastSeenAt`, `lastCheckedAt`); `createdAt`
    // bi bil četrti, ki ne odgovarja na nobeno vprašanje.
    timestamps: false,
    versionKey: false,
  },
);

flightOfferSchema.index({ identityKey: 1 }, { unique: true });
// "Ali je vir to ponudbo še vrnil": ponudbe iste poizvedbe se iščejo po `lastQueryKey`.
flightOfferSchema.index({ lastQueryKey: 1 });
flightOfferSchema.index({ origin: 1, destination: 1, 'outbound.departureAt': 1 });
// TTL: ponudba izgine sama, ko je let za nami. `expireAfterSeconds: 0` = ob času v polju.
flightOfferSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type FlightOfferDoc = InferSchemaType<typeof flightOfferSchema>;
export const FlightOfferModel = model('FlightOffer', flightOfferSchema);
