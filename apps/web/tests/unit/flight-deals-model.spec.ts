import { describe, expect, it } from 'vitest';
import {
  changeColor,
  changeText,
  chartPoints,
  dayWindowText,
  emptySearchForm,
  flexPresetFor,
  formFromSearch,
  formatPrice,
  pluralNights,
  quickValidate,
  airlinesText,
  checkAnalysisText,
  searchStatusText,
  toOptionalInt,
  toSearchInput,
  weekdayLabels,
  windowText,
  type FlightSearch,
} from '../../src/app/features/flight-deals/flight-deals.model.js';

// 015: čiste funkcije vmesnika (brez TestBed, vzorec recipes-model.spec.ts). Pokrite so odločitve,
// ki jih je mogoče pokvariti tiho: oblika cene in spremembe (FR-030), besedilo okna (FR-007),
// pretvorba obrazca v vnos.

describe('formatPrice in changeText (FR-030)', () => {
  it('cela cena brez decimalk, decimalna z vejico, EUR kot €', () => {
    expect(formatPrice({ amount: 89, currency: 'EUR' })).toBe('89 €');
    expect(formatPrice({ amount: 89.5, currency: 'EUR' })).toBe('89,50 €');
    expect(formatPrice({ amount: 120, currency: 'GBP' })).toBe('120 GBP');
    expect(formatPrice(null)).toBe('');
  });

  it('pocenitev −31 € (−25,8 %) in podražitev +21 € (+23,6 %)', () => {
    expect(changeText({ type: 'PRICE_DOWN', absolute: -31, percent: -25.8 })).toBe('−31 € (−25,8 %)');
    expect(changeText({ type: 'PRICE_UP', absolute: 21, percent: 23.6 })).toBe('+21 € (+23,6 %)');
  });

  it('NOVO in brez primerjave da prazno; barve success/danger/null', () => {
    expect(changeText({ type: 'NEW', absolute: 0, percent: 0 })).toBe('');
    expect(changeText(null)).toBe('');
    expect(changeColor('PRICE_DOWN')).toBe('success');
    expect(changeColor('PRICE_UP')).toBe('danger');
    expect(changeColor('NEW')).toBeNull();
    expect(changeColor('UNAVAILABLE')).toBeNull();
  });
});

describe('besedila oken in dni', () => {
  it('windowText: "20. 10. – 3. 11. 2026", en dan je en datum', () => {
    expect(windowText({ from: '2026-10-20', to: '2026-11-03' })).toBe('20. 10. – 3. 11. 2026');
    expect(windowText({ from: '2026-11-10', to: '2026-11-10' })).toBe('10. 11. 2026');
    expect(windowText(null)).toBe('');
  });

  it('weekdayLabels in dayWindowText', () => {
    expect(weekdayLabels([5, 1])).toBe('pon, pet');
    expect(weekdayLabels([])).toBe('kateri koli dan');
    expect(dayWindowText({ weekdays: [5], earliest: '15:00', latest: null })).toBe('pet po 15:00');
    expect(dayWindowText({ weekdays: [], earliest: null, latest: '16:00' })).toBe('kateri koli dan do 16:00');
  });

  it('pluralNights', () => {
    expect(pluralNights(1)).toBe('1 nočitev');
    expect(pluralNights(2)).toBe('2 nočitvi');
    expect(pluralNights(3)).toBe('3 nočitve');
    expect(pluralNights(5)).toBe('5 nočitev');
    expect(pluralNights(null)).toBe('');
  });
});

describe('obrazec', () => {
  it('flexPresetFor: 0–3 so hitre izbire, 10 je po meri', () => {
    expect(flexPresetFor(2)).toBe(2);
    expect(flexPresetFor(10)).toBe('custom');
  });

  it('toOptionalInt: prazno je null, decimalna vejica, neštevilo je NaN (strežnik pove)', () => {
    expect(toOptionalInt('')).toBeNull();
    expect(toOptionalInt(null)).toBeNull();
    expect(toOptionalInt(3)).toBe(3);
    expect(toOptionalInt('2,5')).toBe(2.5);
    expect(Number.isNaN(toOptionalInt('abc'))).toBe(true);
  });

  it('toSearchInput pretvori obrazec: flex po meri, nočitve, dnevi razvrščeni, seznami iz besedila', () => {
    const form = emptySearchForm();
    form.name = ' Vikend ';
    form.departureAirports = ['LJU', 'TRS'];
    form.dateMode = 'range';
    form.from = '2026-10-22';
    form.to = '2026-11-01';
    form.flexPreset = 'custom';
    form.flexCustom = 10;
    form.minNights = 2;
    form.maxNights = '3';
    form.outboundWeekdays = [5, 1];
    form.outboundEarliest = '15:00';
    form.airlinesText = 'fr, w6';
    form.childrenAgesText = '4, 9';
    form.adults = 2;
    form.maxPerPerson = '120';
    const input = toSearchInput(form);
    expect(input.name).toBe('Vikend');
    expect(input.flexDays).toBe(10);
    expect(input.minNights).toBe(2);
    expect(input.maxNights).toBe(3);
    expect(input.outbound).toEqual({ weekdays: [1, 5], earliest: '15:00', latest: null });
    expect(input.airlines).toEqual(['FR', 'W6']);
    expect(input.passengers).toEqual({ adults: 2, childrenAges: [4, 9] });
    expect(input.price).toEqual({ maxPerPerson: 120, maxTotal: null, currency: 'EUR' });
    expect(input.dates).toEqual({ mode: 'range', from: '2026-10-22', to: '2026-11-01' });
  });

  it('enosmerno: nočitve null; fiksni datumi brez povratka → returnDate null', () => {
    const form = emptySearchForm();
    form.name = 'x';
    form.dateMode = 'fixed';
    form.departDate = '2026-11-10';
    form.oneWay = true;
    const input = toSearchInput(form);
    expect(input.minNights).toBeNull();
    expect(input.maxNights).toBeNull();
    expect(input.dates).toEqual({ mode: 'fixed', departDate: '2026-11-10', returnDate: null });
  });

  it('quickValidate ujame prazno ime, manjkajoča letališča, max < min in neveljavno fleksibilnost', () => {
    const form = emptySearchForm();
    expect(quickValidate(form)).toMatch(/Ime/);
    form.name = 'x';
    form.departureAirports = [];
    expect(quickValidate(form)).toMatch(/letališče/);
    form.departureAirports = ['LJU'];
    form.from = '2026-10-22';
    form.to = '2026-11-01';
    form.minNights = 3;
    form.maxNights = 2;
    expect(quickValidate(form)).toMatch(/nočitev/);
    form.maxNights = 3;
    form.flexPreset = 'custom';
    form.flexCustom = -1;
    expect(quickValidate(form)).toMatch(/Fleksibilnost/);
    form.flexCustom = 10;
    expect(quickValidate(form)).toBeNull();
  });

  it('formFromSearch → toSearchInput je identiteta na bistvenih poljih', () => {
    const search: FlightSearch = {
      id: '1',
      isOwn: true,
      name: 'Vikend',
      active: true,
      departureAirports: ['LJU'],
      destination: { mode: 'countries', countries: ['GB'], airports: [] },
      excluded: { countries: [], airports: ['LTN'] },
      dates: { mode: 'rolling', months: 4 },
      flexDays: 0,
      returnWithinWindow: true,
      minNights: 2,
      maxNights: 3,
      outbound: { weekdays: [5], earliest: '15:00', latest: null },
      inbound: { weekdays: [7], earliest: null, latest: null },
      minStayHours: null,
      passengers: { adults: 2, childrenAges: [] },
      price: { maxPerPerson: 120, maxTotal: null, currency: 'EUR' },
      airlines: [],
      maxStops: 0,
      baggage: 'any',
      recipients: [],
      preview: { outboundWindow: { from: '2026-10-17', to: '2027-02-28' }, returnWindow: null, dateCombinations: 1, queries: 1, truncated: false, warnings: [] },
      lastCheck: null,
      lastSuccessfulCheckAt: null,
      offerCount: 0,
      createdAt: '2026-10-17T00:00:00Z',
      updatedAt: '2026-10-17T00:00:00Z',
    };
    const roundTrip = toSearchInput(formFromSearch(search));
    expect(roundTrip.aiEnabled).toBe(false); // 017: star zapis brez polja → izklopljeno
    expect(toSearchInput(formFromSearch({ ...search, aiEnabled: true })).aiEnabled).toBe(true);
    expect(emptySearchForm().aiEnabled).toBe(false);
    expect(roundTrip.destination).toEqual(search.destination);
    expect(roundTrip.excluded).toEqual(search.excluded);
    expect(roundTrip.dates).toEqual({ mode: 'rolling', months: 4 });
    expect(roundTrip.outbound).toEqual(search.outbound);
    expect(roundTrip.minNights).toBe(2);
    expect(roundTrip.price).toEqual(search.price);
  });
});

describe('stanje iskanja in graf', () => {
  it('searchStatusText: neaktivno, še ni preverjeno, uspeh, izpad vira', () => {
    expect(searchStatusText({ active: false, lastCheck: null, lastSuccessfulCheckAt: null }).text).toBe('neaktivno');
    expect(searchStatusText({ active: true, lastCheck: null, lastSuccessfulCheckAt: null }).text).toBe('še ni preverjeno');
    const ok = searchStatusText({
      active: true,
      lastCheck: { runId: 'r', at: '2026-10-17T04:00:00Z', outcomes: [{ providerId: 'travelpayouts', outcome: 'ok', queries: 2, offers: 3 }] },
      lastSuccessfulCheckAt: '2026-10-17T04:00:00Z',
    });
    expect(ok.color).toBe('success');
    expect(ok.text).toContain('preverjeno');
    const down = searchStatusText({
      active: true,
      lastCheck: { runId: 'r', at: '2026-10-17T04:00:00Z', outcomes: [{ providerId: 'travelpayouts', outcome: 'unreachable', queries: 2, offers: 0 }] },
      lastSuccessfulCheckAt: null,
    });
    expect(down.color).toBe('danger');
    expect(down.text).toContain('vir ni dosegljiv');
  });

  it('checkAnalysisText: brez analize null; nič vrnjenega; razlogi padajoče z "drugo" za presežek', () => {
    expect(checkAnalysisText({ lastCheck: null })).toBeNull();
    expect(checkAnalysisText({ lastCheck: { runId: 'r', at: '2026-10-19T09:30:00Z', outcomes: [] } })).toBeNull();
    expect(checkAnalysisText({ lastCheck: { runId: 'r', at: '2026-10-19T09:30:00Z', outcomes: [], analysis: { returned: 0, matched: 0, rejected: [] } } })).toBe(
      'viri za te poizvedbe niso vrnili nobene ponudbe',
    );
    const text = checkAnalysisText({
      lastCheck: {
        runId: 'r',
        at: '2026-10-19T09:30:00Z',
        outcomes: [],
        analysis: {
          returned: 1240,
          matched: 10,
          rejected: [
            { reason: 'pricePerPerson', label: 'cena na osebo nad mejo', count: 900 },
            { reason: 'outboundWeekday', label: 'odhod na nedovoljen dan', count: 280 },
            { reason: 'minStay', label: 'prekratek čas na destinaciji', count: 30 },
            { reason: 'nights', label: 'trajanje zunaj meja', count: 12 },
            { reason: 'stops', label: 'preveč prestopov', count: 5 },
            { reason: 'airline', label: 'drug prevoznik', count: 3 },
          ],
        },
      },
    });
    expect(text).toContain('ponudb · 10 ujemanj · zavrnjeno: cena na osebo nad mejo 900, odhod na nedovoljen dan 280, prekratek čas na destinaciji 30, trajanje zunaj meja 12, drugo 8');
    // sl-SI ločilo tisočic je pri štirimestnih številih odvisno od ICU (1240 ali 1.240).
    expect((text ?? '').replace(/[\s.]/g, '')).toMatch(/^virivrnili1240ponudb/);
    expect(checkAnalysisText({ lastCheck: { runId: 'r', at: 'x', outcomes: [], analysis: { returned: 2, matched: 1, rejected: [{ reason: 'nights', label: 'trajanje zunaj meja', count: 1 }] } } })).toBe(
      'viri vrnili 2 ponudbi · 1 ujemanje · zavrnjeno: trajanje zunaj meja 1',
    );
  });

  it('airlinesText: več prevoznikov s "+", neznana koda ostane koda, brez seznama glavni prevoznik', () => {
    expect(airlinesText({ airline: 'FR', airlineName: 'Ryanair', airlines: [{ code: 'FR', name: 'Ryanair' }, { code: 'W6', name: 'Wizz Air' }] })).toBe('Ryanair + Wizz Air');
    expect(airlinesText({ airline: 'MW', airlineName: null, airlines: [{ code: 'MW', name: null }] })).toBe('MW');
    expect(airlinesText({ airline: 'OU', airlineName: 'Croatia Airlines' })).toBe('Croatia Airlines');
    expect(airlinesText({ airline: 'OU', airlineName: null, airlines: [] })).toBe('OU');
  });

  it('chartPoints: UNAVAILABLE je vrzel (null), ne ničla', () => {
    const points = chartPoints([
      { checkedAt: '2026-10-17T04:00:00Z', price: { amount: 120, currency: 'EUR' }, previousPrice: null, changeType: 'NEW' },
      { checkedAt: '2026-10-18T04:00:00Z', price: null, previousPrice: { amount: 120, currency: 'EUR' }, changeType: 'UNAVAILABLE' },
      { checkedAt: '2026-10-19T04:00:00Z', price: { amount: 89, currency: 'EUR' }, previousPrice: null, changeType: 'UNCHANGED' },
    ]);
    expect(points.values).toEqual([120, null, 89]);
    expect(points.labels).toHaveLength(3);
  });
});
