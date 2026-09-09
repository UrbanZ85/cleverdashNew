import { describe, expect, it } from 'vitest';
import {
  ArsoHistoryFormatError,
  parseStationHistory,
} from '../../src/modules/meteo/domain/history-parse.js';

// 011: razčlenjevanje ARSO strani z dvodnevno zgodovino postaje.
//
// Vzorec je skrajšan odsek PRAVE strani (Vrhnika in Ljubljana Bežigrad, prenesena 9. 9. 2026):
// ohranjeni so vsi znaki oblike, ki jih razčlenjevalnik uporablja — podvojeni stolpci (skrita
// celica s surovo vrednostjo + vidna z zaokroženo), prazne celice postaje brez merilnika in
// ikona pojava kot `<img>`.

const HEADER_ROW = `<tr>
<th class="meteoSI-header" id="title">Vrhnika</th><th class="valid" style="display:none;">Velja za</th><th class="valid_UTC" style="display:none;">Velja za</th><th class="t" id="header">Temperatura [&deg;C]</th><th class="rr_val" id="header">Padavine [mm]</th>
</tr>`;

/** Ena vrstica meritve v obliki vira: skrita celica s surovo vrednostjo, nato vidna. */
function row(options: {
  validUtc: string;
  t?: string;
  rh?: string;
  ffavg?: string;
  ffmax?: string;
  dd?: string;
  rr?: string;
  msl?: string;
  clouds?: string;
}): string {
  const {
    validUtc,
    t = '',
    rh = '',
    ffavg = '',
    ffmax = '',
    dd = '',
    rr = '',
    msl = '',
    clouds = '',
  } = options;
  const cloudsCell = clouds
    ? `<img src="/uploads/meteo/style/img/weather/${clouds}.png">`
    : '';
  return [
    '<tr>',
    `<td class="meteoSI-th">Sreda, ${validUtc} CEST</td>`,
    `<td class="valid" style="display:none;" id="valid">${validUtc} CEST</td>`,
    `<td class="valid_day" style="display:none;" id="valid_day">Sreda</td>`,
    `<td class="valid_UTC" style="display:none;" id="valid_UTC">${validUtc}</td>`,
    `<td class="domain_longTitle" style="display:none;" id="domain_longTitle">Vrhnika</td>`,
    `<td class="domain_altitude" style="display:none;" id="domain_altitude">310</td>`,
    `<td class="domain_lat" style="display:none;" id="domain_lat">45.966</td>`,
    `<td class="domain_lon" style="display:none;" id="domain_lon">14.2717</td>`,
    `<td class="clouds_icon_wwsyn_icon" style="display:none;" id="clouds_icon_wwsyn_icon">${cloudsCell}</td>`,
    `<td class="clouds_icon_wwsyn_icon">${cloudsCell}</td>`,
    `<td class="t" style="display:none;" id="t">${t}</td><td class="t">${t}</td>`,
    `<td class="rh" style="display:none;" id="rh">${rh}</td><td class="rh">${rh}</td>`,
    `<td class="ffavg_val" style="display:none;" id="ffavg_val">${ffavg}</td><td class="ffavg_val">${ffavg ? Math.round(Number(ffavg)) : ''}</td>`,
    `<td class="ddff_icon" style="display:none;" id="ddff_icon"><img src="/uploads/meteo/style/img/weather/lightSW.png"></td>`,
    `<td class="dd_val" style="display:none;" id="dd_val">${dd}</td>`,
    `<td class="ffmax_val" style="display:none;" id="ffmax_val">${ffmax}</td><td class="ffmax_val">${ffmax ? Math.round(Number(ffmax)) : ''}</td>`,
    `<td class="msl" style="display:none;" id="msl">${msl}</td><td class="msl">${msl}</td>`,
    `<td class="rr_val" style="display:none;" id="rr_val">${rr}</td><td class="rr_val">${rr}</td>`,
    `<td class="tp_12h_acc" style="display:none;" id="tp_12h_acc">0.2</td><td class="tp_12h_acc">0.2</td>`,
    `<td class="snow" style="display:none;" id="snow">0</td><td class="snow">0</td>`,
    `<td class="tw" style="display:none;" id="tw"></td><td class="tw"></td>`,
    '</tr>',
  ].join('');
}

const PAGE = `<html><body><table class="meteoSI-table">
${HEADER_ROW}
${row({ validUtc: '2026-09-09 07:40', t: '22.8', rh: '63', ffavg: '6.156', ffmax: '13.824', dd: '255', rr: '0', clouds: 'mostClear' })}
${row({ validUtc: '2026-09-09 07:30', t: '22.6', rh: '65', ffavg: '9.360000000000001', ffmax: '16.38', dd: '249', rr: '0.4' })}
${row({ validUtc: '2026-09-09 07:20', t: '20.4', rh: '79', ffavg: '6.372', ffmax: '14.616', dd: '235', rr: '0' })}
</table></body></html>`;

describe('parseStationHistory', () => {
  it('prebere meritve in jih uredi od najstarejše naprej', () => {
    const parsed = parseStationHistory(PAGE);

    expect(parsed.measurements).toHaveLength(3);
    expect(parsed.measurements.map((m) => m.validUtc)).toEqual([
      '2026-09-09T07:20:00.000Z',
      '2026-09-09T07:30:00.000Z',
      '2026-09-09T07:40:00.000Z',
    ]);
  });

  it('vzame SUROVO vrednost iz skrite celice, ne zaokrožene iz vidne', () => {
    const parsed = parseStationHistory(PAGE);
    const last = parsed.measurements[2]!;

    // Vidna celica pri tej meritvi piše "6" oziroma "14"; graf iz zaokroženih vrednosti je
    // stopničast, zato razčlenjevalnik bere prvo (skrito) celico stolpca.
    expect(last.windAvgKmh).toBeCloseTo(6.156, 3);
    expect(last.windMaxKmh).toBeCloseTo(13.824, 3);
  });

  it('prazna celica je null in ne 0 — "ni merilnika" ni "ni dežja"', () => {
    const parsed = parseStationHistory(PAGE);

    // Vrhnika tlaka in temperature vode ne meri; padavine meri in jih ta meritev ima 0.
    expect(parsed.measurements[0]!.pressureMslHpa).toBeNull();
    expect(parsed.measurements[0]!.waterTemperatureC).toBeNull();
    expect(parsed.measurements[0]!.precipitationMm).toBe(0);
    expect(parsed.measurements[1]!.precipitationMm).toBe(0.4);
  });

  it('prebere podatke o postaji in ime ikone pojava', () => {
    const parsed = parseStationHistory(PAGE);

    expect(parsed.station).toEqual({
      title: 'Vrhnika',
      altitudeM: 310,
      latitude: 45.966,
      longitude: 14.2717,
    });
    expect(parsed.measurements[2]!.cloudsIcon).toBe('mostClear');
    expect(parsed.measurements[1]!.cloudsIcon).toBeNull();
  });

  it('celice išče po imenu stolpca, zato prerazporejeni stolpci ničesar ne premaknejo', () => {
    const shuffled = `<table>${HEADER_ROW}<tr>
      <td class="valid_UTC" style="display:none;" id="valid_UTC">2026-09-09 06:00</td>
      <td class="rr_val" style="display:none;" id="rr_val">1.2</td>
      <td class="t" style="display:none;" id="t">15.5</td>
    </tr></table>`;

    const parsed = parseStationHistory(shuffled);
    expect(parsed.measurements[0]).toMatchObject({
      validUtc: '2026-09-09T06:00:00.000Z',
      temperatureC: 15.5,
      precipitationMm: 1.2,
      humidityPct: null,
    });
  });

  it('stran brez vrstice s časom je spremenjena oblika vira, ne prazen rezultat', () => {
    expect(() => parseStationHistory('<html><body><p>Stran je v prenovi.</p></body></html>')).toThrow(
      ArsoHistoryFormatError,
    );
    expect(() => parseStationHistory(`<table>${HEADER_ROW}</table>`)).toThrow(ArsoHistoryFormatError);
  });
});
