// Imena letalskih družb po IATA kodi — čista tabela brez omrežja (člen IX). Viri ponudb vrnejo
// praviloma samo kodo (Travelpayouts `airline: "FR"`), uporabnik pa hoče brati "Ryanair".
//
// Tabela je ročno sestavljena za prevoznike, ki letijo iz/v Evropo, Sredozemlje, Turčijo, Bližnji
// vzhod in Severno Afriko (19. 10. 2026). Neznana koda ostane koda — nikoli ne ugibamo.
// Dodajanje: `KODA: 'Ime'`; koda je 2 znaka (črke ali števke), vedno velike črke.

export const AIRLINE_NAMES: Readonly<Record<string, string>> = {
  // nizkocenovni
  FR: 'Ryanair',
  RK: 'Ryanair UK',
  RR: 'Ryanair (Buzz)',
  AL: 'Malta Air',
  W6: 'Wizz Air',
  W4: 'Wizz Air Malta',
  W9: 'Wizz Air UK',
  '5W': 'Wizz Air Abu Dhabi',
  U2: 'easyJet',
  EC: 'easyJet Europe',
  DS: 'easyJet Switzerland',
  VY: 'Vueling',
  V7: 'Volotea',
  EW: 'Eurowings',
  '4Y': 'Eurowings Discover',
  DE: 'Condor',
  X3: 'TUI fly Deutschland',
  BY: 'TUI Airways',
  OR: 'TUI fly Netherlands',
  TB: 'TUI fly Belgium',
  HV: 'Transavia',
  TO: 'Transavia France',
  DY: 'Norwegian',
  D8: 'Norwegian Air Sweden',
  LS: 'Jet2',
  PC: 'Pegasus Airlines',
  XQ: 'SunExpress',
  XC: 'Corendon Airlines',
  CD: 'Corendon Dutch Airlines',
  '0B': 'Blue Air',
  H4: 'HiSky',
  '5F': 'FlyOne',
  '3F': 'FlyOne Armenia',
  BT: 'airBaltic',
  FZ: 'flydubai',
  G9: 'Air Arabia',
  '3O': 'Air Arabia Maroc',
  E5: 'Air Arabia Egypt',
  F3: 'flyadeal',
  XY: 'flynas',
  J9: 'Jazeera Airways',
  SM: 'Air Cairo',
  NE: 'Nesma Airlines',
  '6H': 'Israir',
  IZ: 'Arkia',
  OE: 'Laudamotion',
  // klasični evropski
  LH: 'Lufthansa',
  CL: 'Lufthansa CityLine',
  VL: 'Lufthansa City Airlines',
  OS: 'Austrian Airlines',
  LX: 'Swiss',
  SN: 'Brussels Airlines',
  AF: 'Air France',
  A5: 'HOP!',
  KL: 'KLM',
  WA: 'KLM Cityhopper',
  BA: 'British Airways',
  VS: 'Virgin Atlantic',
  EI: 'Aer Lingus',
  IB: 'Iberia',
  I2: 'Iberia Express',
  YW: 'Air Nostrum',
  UX: 'Air Europa',
  TP: 'TAP Air Portugal',
  AZ: 'ITA Airways',
  SK: 'SAS',
  AY: 'Finnair',
  LO: 'LOT Polish Airlines',
  OK: 'Czech Airlines',
  QS: 'Smartwings',
  OU: 'Croatia Airlines',
  JU: 'Air Serbia',
  YM: 'Montenegro Airlines',
  '4O': 'Air Montenegro',
  RO: 'TAROM',
  FB: 'Bulgaria Air',
  A3: 'Aegean Airlines',
  OA: 'Olympic Air',
  GQ: 'Sky Express',
  CY: 'Cyprus Airways',
  TK: 'Turkish Airlines',
  AJ: 'AJet',
  KM: 'KM Malta Airlines',
  LG: 'Luxair',
  FI: 'Icelandair',
  WK: 'Edelweiss Air',
  '2L': 'Helvetic Airways',
  '9U': 'Air Moldova',
  B2: 'Belavia',
  PS: 'Ukraine International Airlines',
  LY: 'El Al',
  RJ: 'Royal Jordanian',
  ME: 'Middle East Airlines',
  MS: 'EgyptAir',
  AT: 'Royal Air Maroc',
  TU: 'Tunisair',
  AH: 'Air Algérie',
  EK: 'Emirates',
  EY: 'Etihad Airways',
  QR: 'Qatar Airways',
  SV: 'Saudia',
  GF: 'Gulf Air',
  WY: 'Oman Air',
  KU: 'Kuwait Airways',
  J2: 'Azerbaijan Airlines',
  A9: 'Georgian Airways',
  KC: 'Air Astana',
  // Severna Amerika in Azija, kadar pridejo v odgovor
  DL: 'Delta Air Lines',
  UA: 'United Airlines',
  AA: 'American Airlines',
  AC: 'Air Canada',
  SQ: 'Singapore Airlines',
  CX: 'Cathay Pacific',
  AI: 'Air India',
  ET: 'Ethiopian Airlines',
  // regionalni/ostali v naši regiji
  JP: 'Adria Airways',
  S4: 'Azores Airlines',
  NT: 'Binter Canarias',
  TR: 'Scoot',
  EN: 'Air Dolomiti',
  NO: 'Neos',
  SU: 'Aeroflot',
  N4: 'Nordwind Airlines',
  U6: 'Ural Airlines',
  S7: 'S7 Airlines',
};

export function airlineName(code: string | null | undefined): string | null {
  if (!code) return null;
  return AIRLINE_NAMES[code.trim().toUpperCase()] ?? null;
}

export interface OfferAirline {
  code: string;
  /** `null`, kadar koda ni v tabeli — odjemalec pokaže kodo. */
  name: string | null;
}

interface AirlineBearingOffer {
  airline: string;
  airlineName: string | null;
  outbound: { flightNumbers: string[] };
  inbound: { flightNumbers: string[] } | null;
}

/** Predpona številke leta (`FR1234`, `W6 4561`, `U2 8081A`) → koda prevoznika. */
const FLIGHT_NUMBER_PREFIX = /^([A-Z0-9]{2})\s?\d{1,4}[A-Z]?$/;

/**
 * Vsi prevozniki ponudbe, brez dvojnikov: najprej glavni (`airline`), nato tisti iz številk
 * letov obeh smeri. Ponudba z odhodom pri Ryanairu in povratkom pri Wizz Airu tako pokaže oba
 * (lastnikova zahteva 19. 10. 2026); viri, ki vrnejo samo eno kodo, dajo enega.
 */
export function offerAirlines(offer: AirlineBearingOffer): OfferAirline[] {
  const codes: string[] = [];
  const push = (raw: string | null | undefined) => {
    const code = raw?.trim().toUpperCase();
    if (code && code.length === 2 && !codes.includes(code)) codes.push(code);
  };
  push(offer.airline);
  for (const fn of [...offer.outbound.flightNumbers, ...(offer.inbound?.flightNumbers ?? [])]) {
    const m = FLIGHT_NUMBER_PREFIX.exec(fn.trim().toUpperCase());
    if (m) push(m[1]);
  }
  return codes.map((code) => ({
    code,
    name: (code === offer.airline.trim().toUpperCase() ? offer.airlineName : null) ?? airlineName(code),
  }));
}

/** "Ryanair (FR) + Wizz Air (W6)"; neznana koda sama: "MW". */
export function airlinesLabel(airlines: readonly OfferAirline[]): string {
  return airlines.map((a) => (a.name ? `${a.name} (${a.code})` : a.code)).join(' + ');
}
