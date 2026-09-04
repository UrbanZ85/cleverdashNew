import { describe, expect, it } from 'vitest';
import {
  buildMonthCells,
  daysBetween,
  isoDate,
  isoWeekday,
  mergeDays,
  type MonthCellsInput,
} from '../../src/app/features/time-tracking/calendar/month-cells.js';

// Mreža koledarja je edini pravi izračun na zaslonu Koledar (vse ostalo je prikaz), zato je tu.
// Napačna mreža ni videti kot napaka — dnevi so samo v napačnih stolpcih, česar nihče ne
// preveri na roko.

const NO_FALLBACK: MonthCellsInput['fallback'] = () => ({ status: 'unknown', reason: '' });

function input(over: Partial<MonthCellsInput> = {}): MonthCellsInput {
  return {
    year: 2026,
    month: 7, // avgust
    today: '2026-08-28',
    statuses: {},
    plannedTimes: {},
    expectedTimes: () => [],
    locationLabel: () => null,
    fallback: NO_FALLBACK,
    selectionStart: null,
    selectionEnd: null,
    ...over,
  };
}

/** Datumi celic v enem nizu, da se preverja zaporedje in ne posamezne celice. */
function flatDates(weeks: ReturnType<typeof buildMonthCells>): string[] {
  return weeks.flat().map((c) => c.date);
}

describe('isoWeekday', () => {
  it('šteje ponedeljek kot 1 in nedeljo kot 7 (ISO, ne getUTCDay)', () => {
    expect(isoWeekday('2026-08-24')).toBe(1); // ponedeljek
    expect(isoWeekday('2026-08-30')).toBe(7); // nedelja
  });
});

describe('daysBetween', () => {
  it('vključi oba konca — "od 1. do 15." je 15 dni (FR-012)', () => {
    expect(daysBetween('2026-08-01', '2026-08-15')).toHaveLength(15);
  });

  it('en dan je en datum, ne prazen seznam — vnos enodnevnega dopusta', () => {
    expect(daysBetween('2026-08-28', '2026-08-28')).toEqual(['2026-08-28']);
  });

  it('gre čez mejo meseca in leta', () => {
    expect(daysBetween('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });
});

describe('mergeDays', () => {
  // Prava napaka: uporabnik je imel dva urnika, koledar pa je upošteval samo enega. Vsak
  // urnik dan ocenjuje po SVOJIH daysOfWeek, zato pon–sre urnik za četrtek pošlje status
  // "weekend" ("ni v dneh profila") — in ta je prekril delovni dan drugega urnika.
  const ponSre = 'p1';
  const cetPet = 'p2';

  it('dan je delovni, če ga dela katerikoli urnik', () => {
    const merged = mergeDays([
      { localDate: '2026-08-27', profileId: ponSre, status: 'weekend', reason: 'ni v dneh profila (čet)' },
      { localDate: '2026-08-27', profileId: cetPet, status: 'workday', reason: 'običajen delovni dan profila' },
    ]);
    expect(merged['2026-08-27']?.status).toBe('workday');
    expect(merged['2026-08-27']?.profileId).toBe(cetPet);
  });

  it('vrstni red vrstic ne vpliva na izid', () => {
    const rows = [
      { localDate: '2026-08-27', profileId: cetPet, status: 'workday', reason: 'dela' },
      { localDate: '2026-08-27', profileId: ponSre, status: 'weekend', reason: 'ne dela' },
    ];
    expect(mergeDays(rows)['2026-08-27']?.status).toBe('workday');
    expect(mergeDays([...rows].reverse())['2026-08-27']?.status).toBe('workday');
  });

  it('dan, ki ga ne dela noben urnik, ostane prost', () => {
    const merged = mergeDays([
      { localDate: '2026-08-29', profileId: ponSre, status: 'weekend', reason: 'sob' },
      { localDate: '2026-08-29', profileId: cetPet, status: 'weekend', reason: 'sob' },
    ]);
    expect(merged['2026-08-29']?.status).toBe('weekend');
  });

  it('vsiljen delovni dan prevlada nad vsem', () => {
    const merged = mergeDays([
      { localDate: '2026-08-29', profileId: ponSre, status: 'holiday', reason: 'praznik' },
      { localDate: '2026-08-29', profileId: cetPet, status: 'forced', reason: 'ročno vsiljen delovni dan' },
    ]);
    expect(merged['2026-08-29']?.status).toBe('forced');
  });

  it('odsotnost prevlada nad vikendom — vnesena je bila namenoma', () => {
    const merged = mergeDays([
      { localDate: '2026-08-29', profileId: ponSre, status: 'weekend', reason: 'sob' },
      { localDate: '2026-08-29', profileId: cetPet, status: 'vacation', reason: 'dopust' },
    ]);
    expect(merged['2026-08-29']?.status).toBe('vacation');
  });

  it('delovni dan prevlada nad odsotnostjo, vezano samo na drug urnik', () => {
    const merged = mergeDays([
      { localDate: '2026-08-27', profileId: ponSre, status: 'sick', reason: 'bolniška' },
      { localDate: '2026-08-27', profileId: cetPet, status: 'workday', reason: 'dela' },
    ]);
    expect(merged['2026-08-27']?.status).toBe('workday');
  });

  it('en sam urnik gre skozi nespremenjen', () => {
    const merged = mergeDays([
      { localDate: '2026-08-27', profileId: ponSre, status: 'workday', reason: 'običajen delovni dan profila' },
    ]);
    expect(merged).toEqual({
      '2026-08-27': { status: 'workday', reason: 'običajen delovni dan profila', profileId: ponSre },
    });
  });

  it('neznanega statusa ne povzdigne nad delovni dan', () => {
    const merged = mergeDays([
      { localDate: '2026-08-27', profileId: ponSre, status: 'workday', reason: 'dela' },
      { localDate: '2026-08-27', profileId: cetPet, status: 'nekaj-novega', reason: '?' },
    ]);
    expect(merged['2026-08-27']?.status).toBe('workday');
  });
});

describe('buildMonthCells', () => {
  it('vrne cele tedne in začne v ponedeljek', () => {
    const weeks = buildMonthCells(input());
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(isoWeekday(weeks[0]![0]!.date)).toBe(1);
    expect(isoWeekday(weeks[weeks.length - 1]![6]!.date)).toBe(7);
  });

  it('datumi so strnjeni, brez preskokov in podvojitev', () => {
    const dates = flatDates(buildMonthCells(input({ month: 2 }))); // marec 2026, prehod na poletni čas
    expect(new Set(dates).size).toBe(dates.length);
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(`${dates[i - 1]}T00:00:00Z`);
      prev.setUTCDate(prev.getUTCDate() + 1);
      expect(dates[i]).toBe(prev.toISOString().slice(0, 10));
    }
  });

  it('vsebuje natanko vse dni meseca, označene kot inMonth', () => {
    const weeks = buildMonthCells(input({ month: 1 })); // februar 2026, 28 dni
    const inMonth = weeks.flat().filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(28);
    expect(inMonth[0]!.date).toBe('2026-02-01');
    expect(inMonth[27]!.date).toBe('2026-02-28');
  });

  it('mesec, ki se začne v ponedeljek in ima 28 dni, je brez dopolnil (februar 2027)', () => {
    const weeks = buildMonthCells(input({ year: 2027, month: 1 }));
    expect(weeks).toHaveLength(4);
    expect(weeks.flat().every((c) => c.inMonth)).toBe(true);
  });

  it('dopolnilne celice so iz sosednjih mesecev in niso izbirljive', () => {
    const weeks = buildMonthCells(input()); // avgust 2026 se začne v soboto
    const pads = weeks.flat().filter((c) => !c.inMonth);
    expect(pads.length).toBeGreaterThan(0);
    expect(pads.every((c) => c.status === 'pad')).toBe(true);
    expect(pads[0]!.date).toBe('2026-07-27');
  });

  it('status in razlog prideta s strežnika, kadar ju je poslal', () => {
    const weeks = buildMonthCells(
      input({ statuses: { '2026-08-17': { status: 'holiday', reason: 'Marijino vnebovzetje' } } }),
    );
    const day = weeks.flat().find((c) => c.date === '2026-08-17');
    expect(day?.status).toBe('holiday');
    expect(day?.reason).toBe('Marijino vnebovzetje');
  });

  it('kadar strežnik dneva ne pozna, obvelja nadomestni izračun', () => {
    const weeks = buildMonthCells(
      input({ fallback: () => ({ status: 'vacation', reason: 'dopust' }) }),
    );
    expect(weeks.flat().filter((c) => c.inMonth).every((c) => c.status === 'vacation')).toBe(true);
  });

  it('načrtovane ure prevladajo nad predvidenimi in dan označijo kot načrtovan', () => {
    const weeks = buildMonthCells(
      input({
        statuses: {
          '2026-08-28': { status: 'workday', reason: 'delovni dan' },
          '2026-08-27': { status: 'workday', reason: 'delovni dan' },
        },
        plannedTimes: { '2026-08-28': ['07:12', '15:03'] },
        expectedTimes: () => ['08:00', '16:00'],
      }),
    );
    const planned = weeks.flat().find((c) => c.date === '2026-08-28');
    expect(planned?.times).toEqual(['07:12', '15:03']);
    expect(planned?.planned).toBe(true);

    // Dan brez načrta pokaže, kaj urnik PREDVIDEVA — načrt obstaja samo za danes in jutri.
    const expected = weeks.flat().find((c) => c.date === '2026-08-27');
    expect(expected?.times).toEqual(['08:00', '16:00']);
    expect(expected?.planned).toBe(false);
  });

  it('dan, ki ni delovni, ne pokaže predvidenih ur', () => {
    const weeks = buildMonthCells(
      input({
        statuses: { '2026-08-29': { status: 'weekend', reason: 'vikend' } },
        expectedTimes: () => ['08:00', '16:00'],
      }),
    );
    expect(weeks.flat().find((c) => c.date === '2026-08-29')?.times).toEqual([]);
  });

  it('izredni delovni dan pokaže ure kot delovni dan (FR-016)', () => {
    const weeks = buildMonthCells(
      input({
        statuses: { '2026-08-29': { status: 'forced', reason: 'ročno vsiljen delovni dan' } },
        expectedTimes: () => ['08:00'],
      }),
    );
    expect(weeks.flat().find((c) => c.date === '2026-08-29')?.times).toEqual(['08:00']);
  });

  it('značka lokacije stoji samo na dnevih, ko se dela', () => {
    const weeks = buildMonthCells(
      input({
        statuses: {
          '2026-08-27': { status: 'workday', reason: 'dela' },
          '2026-08-29': { status: 'weekend', reason: 'sob' },
          '2026-08-31': { status: 'forced', reason: 'izredni' },
        },
        locationLabel: () => 'Doma',
      }),
    );
    const byDate = new Map(weeks.flat().map((c) => [c.date, c]));
    expect(byDate.get('2026-08-27')?.locationLabel).toBe('Doma');
    expect(byDate.get('2026-08-31')?.locationLabel).toBe('Doma');
    // Na prostem dnevu ni kaj beležiti, zato tudi značke ne — sicer bi dopust izgledal delovno.
    expect(byDate.get('2026-08-29')?.locationLabel).toBeNull();
  });

  it('vsak dan lahko pripada svoji lokaciji in svojemu urniku', () => {
    const weeks = buildMonthCells(
      input({
        statuses: {
          '2026-08-27': { status: 'workday', reason: 'dela' },
          '2026-08-28': { status: 'workday', reason: 'dela' },
        },
        locationLabel: (date) => (date === '2026-08-27' ? 'Služba' : 'Doma'),
        expectedTimes: (date) => (date === '2026-08-27' ? ['08:00'] : ['09:00']),
      }),
    );
    const byDate = new Map(weeks.flat().map((c) => [c.date, c]));
    expect(byDate.get('2026-08-27')?.locationLabel).toBe('Služba');
    expect(byDate.get('2026-08-28')?.locationLabel).toBe('Doma');
    expect(byDate.get('2026-08-27')?.times).toEqual(['08:00']);
    expect(byDate.get('2026-08-28')?.times).toEqual(['09:00']);
  });

  it('izbrana sta oba konca obdobja, vmesni dnevi so v obsegu', () => {
    const weeks = buildMonthCells(input({ selectionStart: '2026-08-10', selectionEnd: '2026-08-13' }));
    const byDate = new Map(weeks.flat().map((c) => [c.date, c]));
    expect(byDate.get('2026-08-10')?.selected).toBe(true);
    expect(byDate.get('2026-08-13')?.selected).toBe(true);
    expect(byDate.get('2026-08-11')?.inRange).toBe(true);
    expect(byDate.get('2026-08-12')?.inRange).toBe(true);
    // Konca nista "vmes" — sicer bi dobila dva obrisa hkrati.
    expect(byDate.get('2026-08-10')?.inRange).toBe(false);
    expect(byDate.get('2026-08-14')?.inRange).toBe(false);
  });

  it('en izbran dan brez drugega klika ne razpre obsega', () => {
    const weeks = buildMonthCells(input({ selectionStart: '2026-08-10', selectionEnd: null }));
    expect(weeks.flat().filter((c) => c.selected)).toHaveLength(1);
    expect(weeks.flat().some((c) => c.inRange)).toBe(false);
  });

  it('današnji dan je označen natanko enkrat', () => {
    const weeks = buildMonthCells(input({ today: '2026-08-28' }));
    expect(weeks.flat().filter((c) => c.isToday)).toHaveLength(1);
  });

  it('isoDate ne zdrsne ob prehodu na poletni čas', () => {
    // 29. 3. 2026 je nedelja prehoda; lokalna aritmetika bi tu vrnila 28. ali 30.
    expect(isoDate(2026, 2, 29)).toBe('2026-03-29');
    expect(isoDate(2026, 2, 32)).toBe('2026-04-01');
    expect(isoDate(2026, 0, 0)).toBe('2025-12-31');
  });
});
