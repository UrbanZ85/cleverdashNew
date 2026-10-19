import type { Express } from 'express';
import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { DateTime } from 'luxon';
import { ApiKeyModel } from '../../../src/platform/apikeys/model.js';
import { fakeKeycloakForTests } from '../../setup/keycloak-global.js';
import { loginAsTestUser } from '../../setup/login-as-test-user.js';
import { FlightSearchRuleModel } from '../../../src/modules/flight-deals/models/flight-search-rule.model.js';
import { FlightOfferModel } from '../../../src/modules/flight-deals/models/flight-offer.model.js';
import { FlightSearchMatchModel } from '../../../src/modules/flight-deals/models/flight-search-match.model.js';
import { searchCreateSchema, type SearchInput } from '../../../src/modules/flight-deals/domain/rule-input.js';
import { inputToDocument } from '../../../src/modules/flight-deals/services/rule-access.service.js';
import type { ChangeType } from '../../../src/modules/flight-deals/domain/types.js';

// Skupni pomožniki za pogodbene in integracijske teste 015 proti
// specs/015-flight-deals/contracts/openapi.yaml — po vzoru tests/contract/todos/_helpers.ts.
//
// Prijava gre skozi PRAVI tok (fakeKeycloak → /auth/callback → /auth/refresh), ker je `lastLoginAt`
// pogoj, da je oseba sploh na voljo kot prejemnik (isShareableUser, FR-040). Vloga je
// `cleverdash-user`, ne admin: admin preskoči vse preverbe obsegov in test, ki teče kot admin, ne
// dokaže, da so obsegi v `BASE_USER_SCOPES` res dodani.

export interface TestUser {
  token: string;
  userId: string;
}

export async function loginAs(app: Express, key: string): Promise<TestUser> {
  const { accessToken, userId } = await loginAsTestUser(app, fakeKeycloakForTests, {
    sub: `kc-sub-fd-${key}`,
    email: `${key}@example.com`,
    name: `Uporabnik ${key.toUpperCase()}`,
    roles: ['cleverdash-user'],
  });
  return { token: accessToken, userId };
}

export async function loginAsAdmin(app: Express, key = 'admin'): Promise<TestUser> {
  const { accessToken, userId } = await loginAsTestUser(app, fakeKeycloakForTests, {
    sub: `kc-sub-fd-${key}`,
    email: `${key}@example.com`,
    name: 'Administrator Letov',
    roles: ['cleverdash-admin'],
  });
  return { token: accessToken, userId };
}

/** API ključ, sejan neposredno v bazo (prek API-ja `admin` ne more nastati). */
export async function seedApiKey(scopes: string[], ownerId: string | null = null, secret = `seed-fd-${scopes.join('-')}`): Promise<string> {
  await ApiKeyModel.create({
    label: `seed-${scopes.join(',')}`,
    keyHash: createHash('sha256').update(secret).digest('hex'),
    keyPrefix: secret.slice(0, 8),
    scopes,
    ownerId: ownerId ? new Types.ObjectId(ownerId) : null,
  });
  return secret;
}

export const AUTH = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Vikend iskanje iz quickstart.md §3 kot VNOS za API. */
export function weekendInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Vikend',
    departureAirports: ['LJU', 'TRS'],
    destination: { mode: 'any' },
    dates: { mode: 'range', from: '2026-10-22', to: '2026-11-01' },
    flexDays: 2,
    returnWithinWindow: true,
    minNights: 2,
    maxNights: 3,
    outbound: { weekdays: [5], earliest: '15:00', latest: null },
    inbound: { weekdays: [7], earliest: null, latest: null },
    passengers: { adults: 2, childrenAges: [] },
    price: { maxPerPerson: 120, maxTotal: null, currency: 'EUR' },
    ...overrides,
  };
}

/** Iskanje, ki ustreza scenariju testnega vira: LJU → kamor koli, tekoče okno, pet po 15:00 → ned, 2 noči. */
export function fakeMatchingInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return weekendInput({
    name: 'Testni vikend',
    departureAirports: ['LJU'],
    dates: { mode: 'rolling', months: 2 },
    flexDays: 0,
    minNights: 2,
    maxNights: 2,
    price: { maxPerPerson: 200, maxTotal: null, currency: 'EUR' },
    ...overrides,
  });
}

/** Ustvari iskanje neposredno v bazi. */
export async function seedRule(userId: string, overrides: Record<string, unknown> = {}, recipients: Array<{ userId: string; notify?: boolean }> = []) {
  const input: SearchInput = searchCreateSchema.parse(fakeMatchingInput(overrides));
  const now = new Date();
  return FlightSearchRuleModel.create({
    userId: new Types.ObjectId(userId),
    ...inputToDocument(input),
    recipients: recipients.map((r) => ({ userId: new Types.ObjectId(r.userId), notify: r.notify ?? true, addedAt: now })),
    lastCheck: null,
    lastSuccessfulCheckAt: null,
  });
}

/** Ponudba LJU → STN, petek čez teden dni ob 15:10, povratek nedelja 17:40 (London). */
export async function seedOffer(overrides: Record<string, unknown> = {}) {
  const friday = nextFriday();
  const now = new Date();
  const depart = friday.set({ hour: 15, minute: 10 }).toJSDate();
  const ret = friday.plus({ days: 2 }).setZone('Europe/London', { keepLocalTime: true }).set({ hour: 17, minute: 40 }).toJSDate();
  return FlightOfferModel.create({
    identityKey: `seed-${new Types.ObjectId().toString()}`,
    providerId: 'fake',
    airline: 'FR',
    airlineName: 'Ryanair',
    origin: 'LJU',
    destination: 'STN',
    outbound: { departureAt: depart, arrivalAt: null, flightNumbers: ['FR1234'], stops: 0 },
    inbound: { departureAt: ret, arrivalAt: null, flightNumbers: ['FR1235'], stops: 0 },
    nights: 2,
    price: { amount: 178, currency: 'EUR' },
    priceIncludes: null,
    passengers: { adults: 2, children: 0 },
    fare: { type: null, baggage: null },
    bookingUrl: 'https://example.test/book',
    dataAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
    lastCheckedAt: now,
    availability: 'available',
    lastQueryKey: 'seed',
    previousPrice: null,
    lastChangeType: 'NEW',
    expiresAt: new Date(ret.getTime() + 7 * 86_400_000),
    ...overrides,
  });
}

export async function seedMatch(rule: { _id: Types.ObjectId; userId: Types.ObjectId }, offer: { _id: Types.ObjectId; expiresAt: Date }, changeType: ChangeType = 'NEW') {
  const now = new Date();
  return FlightSearchMatchModel.create({
    ruleId: rule._id,
    ruleOwnerId: rule.userId,
    offerId: offer._id,
    firstMatchedAt: now,
    lastMatchedAt: now,
    lastChangeType: changeType,
    lastChangeAt: now,
    lastRunId: new Types.ObjectId(),
    status: 'active',
    expiresAt: offer.expiresAt,
  });
}

/** Prvi petek vsaj 7 dni od danes, po Ljubljani — isti kot pri testnem viru. */
export function nextFriday(now = new Date()): DateTime {
  let d = DateTime.fromJSDate(now, { zone: 'utc' }).setZone('Europe/Ljubljana').startOf('day').plus({ days: 7 });
  while (d.weekday !== 5) d = d.plus({ days: 1 });
  return d;
}
