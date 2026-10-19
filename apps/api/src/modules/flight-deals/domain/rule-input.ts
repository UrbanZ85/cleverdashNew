import { z } from 'zod';
import { BAGGAGE_OPTIONS, DATE_MODES, DESTINATION_MODES } from './types.js';

// Čista domenska plast (člen IX): brez express in mongoose. Delitev dela kot pri 010/013: zod pove
// OBLIKO (tipi, dolžine, nabori), `rule-validation.ts` pa POMEN (max >= min, letališče obstaja,
// kombinacija datumskega načina in nočitev).
//
// Meje, odvisne od okolja (FLIGHT_MAX_FLEX_DAYS, FLIGHT_MAX_RECIPIENTS …), tu niso — shema ima
// zgornje konstante, ki jih noben env ne sme preseči, dejanska meja namestitve pa se preveri v
// `rule-validation.ts` s podanim parametrom.

export const MAX_NAME_LENGTH = 80;
export const MAX_DEPARTURE_AIRPORTS = 10;
export const MAX_DESTINATION_ITEMS = 50;
export const MAX_CHILDREN = 8;
export const MAX_ADULTS = 9;
export const MAX_NIGHTS = 60;
export const MAX_FLEX_DAYS_HARD = 365;
export const MAX_AIRLINES = 20;
export const MAX_ROLLING_MONTHS = 12;

const iata = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, 'Oznaka letališča mora imeti tri črke.'));

const iso2 = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{2}$/, 'Oznaka države mora imeti dve črki.'));

const currencyCode = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, 'Valuta mora biti tričrkovna oznaka (npr. EUR).'));

/** `yyyy-LL-dd` — koledarski dan brez cone; pomen (lokalni čas odhodnega letališča) je v domeni. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum mora biti v obliki LLLL-MM-DD.');

/** `HH:mm` v lokalnem času letališča. */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Ura mora biti v obliki HH:MM.');

export const dayWindowSchema = z.object({
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
  earliest: hhmm.nullable().default(null),
  latest: hhmm.nullable().default(null),
});
export type DayWindowInput = z.infer<typeof dayWindowSchema>;

const EMPTY_WINDOW: DayWindowInput = { weekdays: [], earliest: null, latest: null };

export const searchCreateSchema = z.object({
  name: z.string().trim().min(1, 'Ime iskanja je obvezno.').max(MAX_NAME_LENGTH),
  active: z.boolean().default(true),
  /** 017: analiza ponudb z umetno inteligenco; privzeto izklopljena. */
  aiEnabled: z.boolean().default(false),
  departureAirports: z
    .array(iata)
    .min(1, 'Izberi vsaj eno odhodno letališče.')
    .max(MAX_DEPARTURE_AIRPORTS, `Največ ${MAX_DEPARTURE_AIRPORTS} odhodnih letališč.`),
  destination: z.object({
    mode: z.enum(DESTINATION_MODES),
    countries: z.array(iso2).max(MAX_DESTINATION_ITEMS).default([]),
    airports: z.array(iata).max(MAX_DESTINATION_ITEMS).default([]),
  }),
  excluded: z
    .object({
      countries: z.array(iso2).max(MAX_DESTINATION_ITEMS).default([]),
      airports: z.array(iata).max(MAX_DESTINATION_ITEMS).default([]),
    })
    .default({ countries: [], airports: [] }),
  dates: z.object({
    mode: z.enum(DATE_MODES),
    departDate: isoDate.optional(),
    returnDate: isoDate.nullable().optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    months: z.number().int().min(1).max(MAX_ROLLING_MONTHS).optional(),
  }),
  flexDays: z
    .number({ invalid_type_error: 'Fleksibilnost mora biti število dni.' })
    .int('Fleksibilnost mora biti celo število dni.')
    .min(0, 'Fleksibilnost ne more biti negativna.')
    .max(MAX_FLEX_DAYS_HARD)
    .default(0),
  returnWithinWindow: z.boolean().default(true),
  minNights: z.number().int().min(0).max(MAX_NIGHTS).nullable().default(null),
  maxNights: z.number().int().min(0).max(MAX_NIGHTS).nullable().default(null),
  outbound: dayWindowSchema.default(EMPTY_WINDOW),
  inbound: dayWindowSchema.default(EMPTY_WINDOW),
  minStayHours: z.number().int().min(0).max(720).nullable().default(null),
  passengers: z.object({
    adults: z.number().int().min(1, 'Vsaj en odrasel potnik.').max(MAX_ADULTS),
    childrenAges: z.array(z.number().int().min(0).max(17)).max(MAX_CHILDREN, `Največ ${MAX_CHILDREN} otrok.`).default([]),
  }),
  price: z
    .object({
      maxPerPerson: z.number().positive().nullable().default(null),
      maxTotal: z.number().positive().nullable().default(null),
      currency: currencyCode.default('EUR'),
    })
    .default({ maxPerPerson: null, maxTotal: null, currency: 'EUR' }),
  airlines: z
    .array(
      z
        .string()
        .trim()
        .transform((s) => s.toUpperCase())
        .pipe(z.string().min(2).max(3)),
    )
    .max(MAX_AIRLINES)
    .default([]),
  maxStops: z.number().int().min(0).max(3).default(0),
  baggage: z.enum(BAGGAGE_OPTIONS).default('any'),
});

export type SearchInput = z.infer<typeof searchCreateSchema>;

/** Delni vnos: izpuščeno polje pomeni "ne spreminjaj" (na prvi ravni; vgnezdeni objekti se
 * zamenjajo v celoti, ker je npr. `dates` smiseln samo kot celota). */
export const searchPatchSchema = searchCreateSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Vsaj eno polje mora biti navedeno.' });
export type SearchPatch = z.infer<typeof searchPatchSchema>;

const boolParam = z.enum(['true', 'false']).transform((v) => v === 'true');

export const OFFER_SORTS = ['price', 'departure', 'appeared', 'change'] as const;
export type OfferSort = (typeof OFFER_SORTS)[number];

export const offersQuerySchema = z.object({
  scope: z.enum(['all', 'own', 'shared']).default('all'),
  searchId: z.string().optional(),
  changed: boolParam.optional(),
  sort: z.enum(OFFER_SORTS).default('price'),
  includeUnavailable: boolParam.default('false'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type OffersQuery = z.infer<typeof offersQuerySchema>;

export const searchOffersQuerySchema = offersQuerySchema.pick({ sort: true, includeUnavailable: true, limit: true });

export const overviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const airportsQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  near: z.string().trim().max(10).optional(),
  radiusKm: z.coerce.number().int().min(10).max(500).default(150),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

export const recipientPutSchema = z.object({
  notify: z.boolean().default(true),
});

// 016: sheme urnika, zagonov in outboxa so v platform/scanner/domain/definition-input.ts.
