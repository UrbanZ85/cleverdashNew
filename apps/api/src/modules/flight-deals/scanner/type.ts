import { z } from 'zod';
import type { ScannerType } from '../../../platform/scanner/types.js';
import type { DigestItem } from '../domain/email-template.js';
import { FLIGHT_DEALS_SCOPES } from '../scopes.js';
import { flightAdminExtras } from './admin-extras.js';
import { flightAiHooks } from './ai.js';
import { flightDefinitions } from './definitions.js';
import { executeFlightBatch } from './execute.js';
import { flightNotificationHooks } from './notifications.js';
import { flightResultReader } from './results.js';

// Tip `flights` za jedro skenerjev (016, research.md §2, §3, §7). Modul Leti OSTANE svoj modul z
// lastnimi zbirkami in vmesnikom; jedru preda samo to, česar sam ne rabi več imeti: kdaj se
// preverja (urnik tipa), zagon z zaporami, outbox dopisov in administracijo.
//
// `execution: 'batch'`: vsa aktivna iskanja vseh uporabnikov v ENEM zagonu po urniku tipa, ki ga
// določi administrator — združevanje poizvedb med uporabniki (SC-007 iz 015), dnevna meja
// neuradnega vira in en dopis na prejemnika na zagon so odvisni natanko od tega.
// `results: 'custom'`: ponudbe, ujemanja in zgodovina cen ostanejo v zbirkah modula; generični
// bralni vmesnik (`resultReader`) in prispevek na seznam (`definitions`) pridejo z zavihkom
// Skenerji (US3, US5).
// `configSchema: z.never()`: iskanja letov se NE ustvarjajo prek `POST /scanners` — modul jih
// hrani sam (`FlightSearchRule`), čarovnik preusmeri na `createRoute`.

export const flightScannerType: ScannerType<never, DigestItem> = {
  type: 'flights',
  label: 'Leti',
  icon: 'airplane-outline',
  description: 'Letalske ponudbe po tvojih kriterijih: letališča, cilj ali "kamor koli", datumi, nočitve, cena.',
  execution: 'batch',
  results: 'custom',
  scopes: { read: FLIGHT_DEALS_SCOPES.read, write: FLIGHT_DEALS_SCOPES.write },
  defaultSchedule: { preset: 'daily-06-18', cronExpression: '0 6,18 * * *', timezone: 'Europe/Ljubljana' },
  createRoute: '/flight-deals/searches/new',
  isEnabled: () => true,
  configSchema: z.never(),
  definitions: flightDefinitions,
  resultReader: flightResultReader,
  execute: executeFlightBatch,
  notifications: flightNotificationHooks,
  admin: { extras: flightAdminExtras },
  // 017: leti hranijo ponudbe sami, zato povedo, katere so kandidati za analizo in kam gre izid.
  ai: flightAiHooks,
};
