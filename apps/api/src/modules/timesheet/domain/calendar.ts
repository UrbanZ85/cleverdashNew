// Koledarska matematika v UTC. To NI kršitev člena V ("vsi časi so v Europe/Ljubljana"):
// tu ni nobenega trenutka v času, samo koledarski dnevi meseca, ki ga je uporabnik izbral.
// Prav zato je UTC edina pravilna izbira — z lokalno cono bi prehod na poletni/zimski čas
// (zadnja nedelja v marcu in oktobru) premaknil dan za eno mesto v mreži tednov.
// Trenutek "danes" (privzeti mesec v obrazcu) je stvar odjemalca oz. domain/timezone.ts,
// ne te datoteke.

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Dnevi od ponedeljka za ta UTC dan v tednu (pon = 0 … ned = 6). */
function offsetFromMonday(utcWeekday: number): number {
  return (utcWeekday + 6) % 7;
}

/** ISO številka dneva v tednu: 1 = ponedeljek … 7 = nedelja (NE `Date.getUTCDay()`, ki da 0 za nedeljo). */
export function isoWeekday(utcWeekday: number): number {
  return utcWeekday === 0 ? 7 : utcWeekday;
}

export function addUtcDays(
  year: number,
  month: number,
  day: number,
  delta: number,
): { y: number; m: number; d: number } {
  const ms = Date.UTC(year, month - 1, day) + delta * 86400000;
  const dt = new Date(ms);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export interface GridDay {
  y: number;
  m: number;
  d: number;
  inMonth: boolean;
  /** UTC dan v tednu 0–6 (ned–sob). */
  utcWeekday: number;
}

/**
 * Tedni ponedeljek–nedelja: od ponedeljka tistega tedna, ki vsebuje 1. v mesecu, do nedelje
 * tistega tedna, ki vsebuje zadnji dan v mesecu.
 */
export function monthWeekGrid(year: number, month: number): GridDay[][] {
  const last = daysInMonth(year, month);
  const firstWd = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  let cur = addUtcDays(year, month, 1, -offsetFromMonday(firstWd));

  const lastWd = new Date(Date.UTC(year, month - 1, last)).getUTCDay();
  const end = addUtcDays(year, month, last, 6 - offsetFromMonday(lastWd));

  const weeks: GridDay[][] = [];
  for (;;) {
    const week: GridDay[] = [];
    for (let i = 0; i < 7; i++) {
      const cell = addUtcDays(cur.y, cur.m, cur.d, i);
      const inMonth = cell.m === month && cell.y === year;
      const utcWeekday = new Date(Date.UTC(cell.y, cell.m - 1, cell.d)).getUTCDay();
      week.push({ ...cell, inMonth, utcWeekday });
    }
    weeks.push(week);
    const nextStart = addUtcDays(cur.y, cur.m, cur.d, 7);
    cur = nextStart;
    if (
      nextStart.y > end.y ||
      (nextStart.y === end.y && nextStart.m > end.m) ||
      (nextStart.y === end.y && nextStart.m === end.m && nextStart.d > end.d)
    ) {
      break;
    }
  }
  return weeks;
}

/** Število delovnikov (pon–pet) v mesecu × ure/dan — "mesečna delovna obveza" v predlogi. */
export function nominalMonthHours(year: number, month: number, hoursPerWorkday = 8): number {
  const dim = daysInMonth(year, month);
  let workdays = 0;
  for (let d = 1; d <= dim; d++) {
    const w = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (w >= 1 && w <= 5) workdays++;
  }
  return workdays * hoursPerWorkday;
}
