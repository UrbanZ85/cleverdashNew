#!/usr/bin/env node
/**
 * Osveži zapisani imenik ARSO samodejnih postaj
 * (`apps/api/src/modules/meteo/domain/station-catalog.ts`).
 *
 * ZAKAJ ta skripta obstaja: `observationAms_si_latest.xml` ni imenik postaj, ampak posnetek
 * zadnjega objavnega cikla — v enem klicu vrne 19, 69, 98 ali 106 postaj, odvisno od trenutka
 * (izmerjeno 9. 9. 2026). En prenos torej ne da popolnega seznama. Skripta zato vir prebere
 * večkrat, unijo uredi po imenu in prepiše konstanto `STATION_CATALOG`.
 *
 * Poganja se ROČNO in redko (ko ARSO doda ali preimenuje postajo) — ne v CI in ne ob gradnji:
 * modul deluje z obstoječim imenikom, ker ga živi vir ob vsakem klicu dopolni
 * (`mergeStationCatalog`). Namen imenika je samo POKRITOST seznama v nastavitvah.
 *
 * Skripta imenik DOPOLNI in ga ne nadomesti: obstoječi vnosi so izhodišče unije, prebrani cikli
 * pa jih osvežijo in dodajo nove. Brez tega bi eno samo branje (cikel z 99 postajami) pobrisalo
 * sedem postaj, ki tisti trenutek niso objavile — natanko napaka, ki jo ta imenik odpravlja.
 *
 *   node apps/api/scripts/refresh-arso-stations.mjs [število_branj]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL =
  'https://meteo.arso.gov.si/uploads/probase/www/observ/surface/text/sl/observationAms_si_latest.xml';
const TARGET = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/modules/meteo/domain/station-catalog.ts',
);
/** Med branji je premor, ker se cikel vira menja na minute, ne na sekunde. */
const PAUSE_MS = 20_000;
const READS = Number.parseInt(process.argv[2] ?? '6', 10);

function tagText(block, name) {
  const match = block.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return match ? match[1].trim() : '';
}

function tagNumber(block, name) {
  const text = tagText(block, name);
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function absorb(xml, into, label) {
  const blocks = xml.match(/<metData>[\s\S]*?<\/metData>/g) ?? [];
  let added = 0;
  for (const block of blocks) {
    // Oznaka za naslov je `domain_meteosiId` BREZ zaključnega podčrtaja — glej
    // apps/api/src/domain/arso-station.ts.
    const id = tagText(block, 'domain_meteosiId').replace(/_+$/, '');
    const title = tagText(block, 'domain_longTitle') || tagText(block, 'domain_title');
    if (!id || !title) continue;
    if (!into.has(id)) added += 1;
    into.set(id, {
      id,
      title,
      altitudeM: tagNumber(block, 'domain_altitude'),
      latitude: tagNumber(block, 'domain_lat'),
      longitude: tagNumber(block, 'domain_lon'),
    });
  }
  console.log(`${label}: v ciklu ${blocks.length} postaj, novih ${added}, skupaj ${into.size}`);
}

const stations = new Map();

// Izhodišče je OBSTOJEČI imenik, prebran iz konstante v ciljni datoteki (in ne uvožen — to je
// TypeScript, skripta pa navaden Node). Zapis je zato lahko strojno berljiv: ena postaja na
// vrstico, v obliki, ki jo ta skripta tudi piše.
const existing = readFileSync(TARGET, 'utf8');
const rowPattern =
  /id: '([^']+)', title: '(.*)', altitudeM: (null|-?[\d.]+), latitude: (null|-?[\d.]+), longitude: (null|-?[\d.]+)/g;
for (const row of existing.matchAll(rowPattern)) {
  const [, id, title, altitudeM, latitude, longitude] = row;
  stations.set(id, {
    id,
    // Ime se zapiše z ubežnim znakom pred enojnim narekovajem (spodaj) — tu ga odstranimo.
    title: title.split("\\'").join("'"),
    altitudeM: altitudeM === 'null' ? null : Number(altitudeM),
    latitude: latitude === 'null' ? null : Number(latitude),
    longitude: longitude === 'null' ? null : Number(longitude),
  });
}
console.log(`obstoječi imenik: ${stations.size} postaj`);

for (let read = 1; read <= READS; read += 1) {
  try {
    const res = await fetch(SOURCE_URL, { headers: { accept: 'application/xml' }, cache: 'no-store' });
    if (!res.ok) throw new Error(`vir je vrnil ${res.status}`);
    absorb(await res.text(), stations, `branje ${read}/${READS}`);
  } catch (err) {
    // Eno spodletelo branje ni razlog za prekinitev — unija se sestavlja iz tistih, ki uspejo.
    console.log(`branje ${read}/${READS}: napaka (${err.message})`);
  }
  if (read < READS) await new Promise((r) => setTimeout(r, PAUSE_MS));
}

if (stations.size === 0) {
  console.error('Iz vira ni prišla nobena postaja — imenik OSTAJA nespremenjen.');
  process.exit(1);
}

const start = existing.indexOf('export const STATION_CATALOG');
const end = existing.indexOf('];', start);
if (start < 0 || end < 0) {
  console.error(`V ${TARGET} ni mogoče najti konstante STATION_CATALOG.`);
  process.exit(1);
}

const sorted = [...stations.values()].sort((a, b) => a.title.localeCompare(b.title, 'sl'));
const rows = sorted
  .map(
    (s) =>
      `  { id: '${s.id}', title: '${s.title.replace(/'/g, "\\'")}', altitudeM: ${s.altitudeM}, ` +
      `latitude: ${s.latitude}, longitude: ${s.longitude} },`,
  )
  .join('\n');

const updated = `${existing.slice(0, start)}export const STATION_CATALOG: readonly ArsoStation[] = [\n${rows}\n${existing.slice(end)}`;
writeFileSync(TARGET, updated, 'utf8');
console.log(`Zapisano: ${sorted.length} postaj v ${TARGET}`);
