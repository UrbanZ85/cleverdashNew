import { HolidayModel } from '../models/holiday.model.js';

// research.md §5: fiksni dela prosti dnevi + premikajoči po veliki noči (anonimni
// gregorijanski algoritem). `isHoliday`/`isWorkFree` ločeno — 17. avgust (združitev
// prekmurskih Slovencev) in 23. november (dan Rudolfa Maistra) sta državna praznika, ki
// NISTA dela prosta. Za urnik šteje samo `isWorkFree` (glej domain/calendar.ts).

interface FixedHoliday {
  month: number; // 1-12
  day: number;
  name: string;
  isWorkFree: boolean;
}

const FIXED_HOLIDAYS: FixedHoliday[] = [
  { month: 1, day: 1, name: 'novo leto', isWorkFree: true },
  { month: 1, day: 2, name: 'novo leto', isWorkFree: true },
  { month: 2, day: 8, name: 'Prešernov dan', isWorkFree: true },
  { month: 4, day: 27, name: 'dan upora proti okupatorju', isWorkFree: true },
  { month: 5, day: 1, name: 'praznik dela', isWorkFree: true },
  { month: 5, day: 2, name: 'praznik dela', isWorkFree: true },
  { month: 6, day: 25, name: 'dan državnosti', isWorkFree: true },
  { month: 8, day: 15, name: 'Marijino vnebovzetje', isWorkFree: true },
  { month: 8, day: 17, name: 'združitev prekmurskih Slovencev', isWorkFree: false },
  { month: 10, day: 31, name: 'dan reformacije', isWorkFree: true },
  { month: 11, day: 1, name: 'dan spomina na mrtve', isWorkFree: true },
  { month: 11, day: 23, name: 'dan Rudolfa Maistra', isWorkFree: false },
  { month: 12, day: 25, name: 'božič', isWorkFree: true },
  { month: 12, day: 26, name: 'dan samostojnosti in enotnosti', isWorkFree: true },
];

/** Anonimni gregorijanski algoritem (Meeus/Jones/Butcher) za datum velike noči. Vrne
 * `{ month, day }` v gregorijanskem koledarju. */
export function computeEasterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function addDays(year: number, month: number, day: number, offset: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + offset);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Izračuna vse slovenske praznike za eno leto — brez odvisnosti na omrežje (research.md
 * §5: "izračun mora delovati brez omrežja"). Zunanji vir (date.nager.at) je bil uporabljen
 * samo za enkratno primerjalno preverjanje med raziskavo, ne kot odvisnost med izvajanjem. */
export function computeHolidaysForYear(year: number): Array<{ date: string; name: string; isWorkFree: boolean }> {
  const holidays = FIXED_HOLIDAYS.map((h) => ({
    date: `${year}-${pad2(h.month)}-${pad2(h.day)}`,
    name: h.name,
    isWorkFree: h.isWorkFree,
  }));

  const easter = computeEasterSunday(year);
  const easterMonday = addDays(year, easter.month, easter.day, 1);
  const pentecost = addDays(year, easter.month, easter.day, 49); // binkoštna nedelja = velika noč + 49

  holidays.push({
    date: `${easterMonday.year}-${pad2(easterMonday.month)}-${pad2(easterMonday.day)}`,
    name: 'velikonočni ponedeljek',
    isWorkFree: true,
  });
  holidays.push({
    date: `${pentecost.year}-${pad2(pentecost.month)}-${pad2(pentecost.day)}`,
    name: 'binkoštna nedelja',
    isWorkFree: true,
  });

  return holidays;
}

/** FR-011: ob prvi uporabi vsakega koledarskega leta se prazniki napolnijo samodejno.
 * Ročni vnos (`source: manual`) ima prednost — `$setOnInsert` NIKOLI ne prepiše
 * obstoječega zapisa (ročnega ali že prej izračunanega), samo doda manjkajoče. Namenoma
 * BREZ ločenega "ali je leto že napolnjeno" preverjanja: tak vsevprašalen izhod bi pomenil,
 * da en sam ročno dodan praznik za leto tiho prepreči polnjenje vseh ostalih. */
export async function ensureHolidaysSeeded(year: number): Promise<void> {
  const computed = computeHolidaysForYear(year);
  for (const holiday of computed) {
    await HolidayModel.updateOne(
      { date: holiday.date },
      { $setOnInsert: { ...holiday, isHoliday: true, source: 'computed' } },
      { upsert: true },
    );
  }
}
