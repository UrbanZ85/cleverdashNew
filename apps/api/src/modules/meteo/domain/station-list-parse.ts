import { stationIdFromMeteosiId } from '../../../domain/arso-station.js';

// Seznam ARSO samodejnih postaj iz `observationAms_si_latest.xml` — datoteke z zadnjo
// meritvijo VSEH postaj (106 postaj, ~800 kB, 9. 9. 2026).
//
// Bere se samo ovojnica postaje (`domain_*`), meritve iz te datoteke pa ne: zgodovina pride
// s strani posamezne postaje. Namen seznama je en sam — da uporabnik postajo IZBERE s
// seznama in ne prepiše oznake iz naslova. Predpomni se za dan (postaje ne nastajajo).
//
// Zakaj razčlenjevanje z regularnim izrazom in ne s knjižnico za XML: strežnik knjižnice za
// XML nima (ARSO vreme v 001 je JSON), zaradi te ene datoteke pa ni razloga za novo
// odvisnost. Bere se pet polj fiksne oblike; postaja, ki katerega od njih ne izpolni, se
// preskoči — člen VII: raje ena postaja manj na seznamu kot pokvarjen seznam.
//
// Člen IX: čista funkcija nad nizom (tests/unit/arso-station-list.spec.ts).

export interface ArsoStation {
  /** Oznaka za naslov — `domain_meteosiId` brez zaključnega podčrtaja (glej station-id.ts). */
  id: string;
  /** Ime, kakor ga vidi človek ("Bilje Nova Gorica"). */
  title: string;
  altitudeM: number | null;
  latitude: number | null;
  longitude: number | null;
}

export function parseStationList(xml: string): ArsoStation[] {
  const stations: ArsoStation[] = [];
  const seen = new Set<string>();

  for (const block of xml.match(/<metData>[\s\S]*?<\/metData>/g) ?? []) {
    const meteosiId = tagText(block, 'domain_meteosiId');
    if (!meteosiId) continue;
    const id = stationIdFromMeteosiId(meteosiId);
    if (!id || seen.has(id)) continue;

    const title = tagText(block, 'domain_longTitle') ?? tagText(block, 'domain_title');
    if (!title) continue;

    seen.add(id);
    stations.push({
      id,
      title,
      altitudeM: tagNumber(block, 'domain_altitude'),
      latitude: tagNumber(block, 'domain_lat'),
      longitude: tagNumber(block, 'domain_lon'),
    });
  }

  // Po imenu in po slovensko: seznam je namenjen iskanju s pogledom (Č za C, ne za Z).
  stations.sort((a, b) => a.title.localeCompare(b.title, 'sl'));
  return stations;
}

function tagText(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
  const text = match?.[1]?.replace(/\s+/g, ' ').trim();
  return text ? text : null;
}

function tagNumber(block: string, tag: string): number | null {
  const text = tagText(block, tag);
  if (text === null) return null;
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}
