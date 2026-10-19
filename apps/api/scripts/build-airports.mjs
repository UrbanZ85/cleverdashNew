#!/usr/bin/env node
/**
 * Zgradi vgrajen nabor letališč za modul Leti (015):
 *   OurAirports `airports.csv` + `countries.csv` (javna domena, posodobljeno dnevno)
 *   + IANA časovni pas iz koordinat (`geo-tz`, devDependency)
 *   → `src/modules/flight-deals/assets/airports.json`
 *
 * Filter: `type` ∈ {large_airport, medium_airport} ∧ `scheduled_service = yes` ∧ `iata_code ≠ ''`
 * (~3 400 letališč z rednim potniškim prometom). Izhodna datoteka je COMMITANA: gradnja slike ne
 * sme biti odvisna od omrežja (kakovostna vrata, točka 4), zato ta skripta teče ROČNO ob
 * osvežitvi nabora in ne v `npm run build`.
 *
 *   node apps/api/scripts/build-airports.mjs            # prenese in zapiše
 *   node apps/api/scripts/build-airports.mjs --from DIR # bere airports.csv/countries.csv iz DIR
 *
 * Zakaj ne Travelpayouts `data/en/airports.json` (ki cono že ima): dosegljiv samo z omrežjem, vezan
 * na vir, ki ga lastnik lahko izklopi, in ni licenciran za vgradnjo (research.md §10).
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { find as findTimezone } from 'geo-tz';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../src/modules/flight-deals/assets/airports.json');
const BASE = 'https://davidmegginson.github.io/ourairports-data';

// `geo-tz` vrne KANONIČNO cono iz tzdb, v kateri so od 2022 Ljubljana, Zagreb, Sarajevo, Skopje in
// Podgorica povezave na Europe/Belgrade. Za Luxon je to isto, za človeka in za člen V.4
// ("vsi časi so v Europe/Ljubljana") pa ne — zato se za države, katerih cona je v tzdb samo
// povezava, zapiše ime, ki ga aplikacija uporablja povsod drugje.
const COUNTRY_ZONE_ALIAS = {
  SI: ['Europe/Belgrade', 'Europe/Ljubljana'],
  HR: ['Europe/Belgrade', 'Europe/Zagreb'],
  BA: ['Europe/Belgrade', 'Europe/Sarajevo'],
  MK: ['Europe/Belgrade', 'Europe/Skopje'],
  ME: ['Europe/Belgrade', 'Europe/Podgorica'],
  SK: ['Europe/Prague', 'Europe/Bratislava'],
  LI: ['Europe/Zurich', 'Europe/Vaduz'],
  SM: ['Europe/Rome', 'Europe/San_Marino'],
  VA: ['Europe/Rome', 'Europe/Vatican'],
  AX: ['Europe/Helsinki', 'Europe/Mariehamn'],
  JE: ['Europe/London', 'Europe/Jersey'],
  GG: ['Europe/London', 'Europe/Guernsey'],
  IM: ['Europe/London', 'Europe/Isle_of_Man'],
};

// Slovenska imena mest (eksonimi), ki jih vir nima: uporabnik vpiše "trst" ali "benetke" in mora
// najti letališče (FR-003). Seznam je ročen in ne poskuša biti popoln — pokriva destinacije, ki so
// iz Slovenije običajne. Vrstica brez vnosa tu ima samo vir (angleško ime, mesto, OurAirports
// `keywords`).
const SLOVENIAN_ALIASES = {
  TRS: ['Trst'], VCE: ['Benetke'], TSF: ['Benetke Treviso'], GRZ: ['Gradec'], KLU: ['Celovec'],
  VIE: ['Dunaj'], BUD: ['Budimpešta'], MXP: ['Milano'], LIN: ['Milano'], BGY: ['Milano Bergamo'],
  FCO: ['Rim'], CIA: ['Rim'], NAP: ['Neapelj'], FLR: ['Firence'], PRG: ['Praga'], MUC: ['München'],
  BRU: ['Bruselj'], CRL: ['Bruselj Charleroi'], STN: ['London'], LTN: ['London'], LGW: ['London'],
  LHR: ['London'], SEN: ['London'], CDG: ['Pariz'], ORY: ['Pariz'], BVA: ['Pariz Beauvais'],
  LIS: ['Lizbona'], ATH: ['Atene'], PUY: ['Pulj'], RJK: ['Reka'], BEG: ['Beograd'], SOF: ['Sofija'],
  OTP: ['Bukarešta'], WAW: ['Varšava'], KRK: ['Krakov'], CPH: ['Kopenhagen'], EDI: ['Edinburg'],
  IST: ['Istanbul', 'Carigrad'], SAW: ['Istanbul', 'Carigrad'], GVA: ['Ženeva'], CGN: ['Köln'],
  HER: ['Heraklion', 'Kreta'], RHO: ['Rodos'], CFU: ['Krf'], SKG: ['Solun'], LCA: ['Larnaka', 'Ciper'],
  PFO: ['Pafos', 'Ciper'], CAI: ['Kairo'], HRG: ['Hurgada'], SSH: ['Šarm el Šejh'], RAK: ['Marakeš'],
  DXB: ['Dubaj'], TLV: ['Tel Aviv'], FMM: ['Memmingen', 'München zahod'], PMI: ['Palma de Mallorca', 'Majorka'],
  TFS: ['Tenerife'], LPA: ['Gran Canaria'], MLA: ['Malta'], JTR: ['Santorini'], AGP: ['Malaga'],
};

/** Minimalen CSV razčlenjevalnik (RFC 4180: narekovaji, podvojeni narekovaji, nove vrstice v poljih). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift();
  return rows.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

async function loadCsv(name, fromDir) {
  if (fromDir) return readFile(join(fromDir, name), 'utf-8');
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.text();
}

function zoneFor(lat, lon, country) {
  const [canonical] = findTimezone(lat, lon);
  const alias = COUNTRY_ZONE_ALIAS[country];
  if (alias && alias[0] === canonical) return alias[1];
  return canonical ?? 'UTC';
}

async function main() {
  const fromIdx = process.argv.indexOf('--from');
  const fromDir = fromIdx >= 0 ? resolve(process.argv[fromIdx + 1]) : null;

  const [airportsCsv, countriesCsv] = await Promise.all([loadCsv('airports.csv', fromDir), loadCsv('countries.csv', fromDir)]);
  const countries = new Map(parseCsv(countriesCsv).map((c) => [c.code, c.name]));

  const airports = parseCsv(airportsCsv)
    .filter(
      (a) =>
        (a.type === 'large_airport' || a.type === 'medium_airport') &&
        a.scheduled_service === 'yes' &&
        a.iata_code.trim().length === 3,
    )
    .map((a) => {
      const lat = Number(a.latitude_deg);
      const lon = Number(a.longitude_deg);
      const iata = a.iata_code.trim().toUpperCase();
      const aliases = [
        ...a.keywords.split(',').map((k) => k.trim()).filter((k) => k.length > 1 && k.length <= 60),
        ...(SLOVENIAN_ALIASES[iata] ?? []),
      ];
      return {
        iata,
        name: a.name,
        city: a.municipality || a.name,
        aliases: [...new Set(aliases)],
        country: a.iso_country,
        countryName: countries.get(a.iso_country) ?? a.iso_country,
        lat: Math.round(lat * 1e4) / 1e4,
        lon: Math.round(lon * 1e4) / 1e4,
        tz: zoneFor(lat, lon, a.iso_country),
      };
    })
    .sort((a, b) => a.iata.localeCompare(b.iata));

  // Dvojnik IATA kode (vir jih občasno ima) obdrži večje letališče — `large_airport` je v CSV pred
  // `medium_airport` samo po naključju, zato se odloči izrecno.
  const byIata = new Map();
  for (const a of airports) if (!byIata.has(a.iata)) byIata.set(a.iata, a);

  const out = {
    source: 'OurAirports (https://ourairports.com, public domain)',
    generatedAt: new Date().toISOString(),
    airports: [...byIata.values()],
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 0) + '\n', 'utf-8');
  console.log(`Zapisano ${out.airports.length} letališč → ${OUT}`);
}

main().catch((err) => {
  console.error('Gradnja nabora letališč je spodletela:', err);
  process.exit(1);
});
