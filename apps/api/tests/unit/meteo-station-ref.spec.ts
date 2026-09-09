import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATION_REF,
  MAX_SELECTED_STATIONS,
  METEO_PROVIDERS,
  formatStationRef,
  isValidProvider,
  isValidStationIdFor,
  parseStationRef,
  parseStationRefs,
  stationRefEquals,
} from '../../src/domain/meteo-station-ref.js';

// 011 razširitev: sklic na postajo, ki pove tudi, čigava je. Člen IX — čista logika.
//
// Osrednja skrb teh testov je ZDRUŽLJIVOST NAZAJ: dokler je bil ponudnik en sam, so bile
// izbrane postaje shranjene kot gole oznake (`VRHNIKA`) in take so še vedno v bazi ter v
// `.env` (`ARSO_DEFAULT_STATION`). Če bi jih razčlenjevalnik zavrnil, bi vsak obstoječi
// uporabnik ob nadgradnji tiho izgubil svojo postajo.

describe('parseStationRef', () => {
  it('razčleni sklic s ponudnikom', () => {
    expect(parseStationRef('arso:VRHNIKA')).toEqual({ provider: 'arso', id: 'VRHNIKA' });
    expect(parseStationRef('neverin:sveta-marina')).toEqual({ provider: 'neverin', id: 'sveta-marina' });
  });

  it('golo oznako bere kot ARSO (združljivost s shranjenimi nastavitvami)', () => {
    expect(parseStationRef('VRHNIKA')).toEqual({ provider: 'arso', id: 'VRHNIKA' });
    expect(parseStationRef('NOVA-GOR_BILJE')).toEqual({ provider: 'arso', id: 'NOVA-GOR_BILJE' });
    expect(parseStationRef(' vrhnika ')).toEqual({ provider: 'arso', id: 'VRHNIKA' });
  });

  it('poenoti velikost črk po ponudniku', () => {
    // ARSO oznake so v naslovu vedno velike, Neverinovi slugi vedno mali. Brez poenotenja bi
    // bila ista postaja v seznamu priljubljenih lahko dvakrat.
    expect(parseStationRef('ARSO:vrhnika')).toEqual({ provider: 'arso', id: 'VRHNIKA' });
    expect(parseStationRef('NEVERIN:Sveta-Marina')).toEqual({ provider: 'neverin', id: 'sveta-marina' });
  });

  it('zavrne neznanega ponudnika in oznako, ki ne ustreza njegovemu prostoru imen', () => {
    expect(parseStationRef('meteoblue:x')).toBeNull();
    // Mali črki v ARSO oznaki se povelikočrkovita, presledek pa ostane in oznako ovrže.
    expect(parseStationRef('arso:NOVA GORICA')).toBeNull();
    // Neverinov slug z veliko začetnico se pomanjša; podčrtaj v njem ni dovoljen.
    expect(parseStationRef('neverin:sveta_marina')).toBeNull();
  });

  it('zavrne, kar bi lahko premaknilo naslov ali zamenjalo gostitelja', () => {
    // Iz sklica se sestavi naslov, ki ga strežnik SAM prenese (člen VIII, SSRF).
    expect(parseStationRef('arso:../../etc/passwd')).toBeNull();
    expect(parseStationRef('neverin:../../etc/passwd')).toBeNull();
    expect(parseStationRef('https://zlonamerno.example')).toBeNull();
    expect(parseStationRef('')).toBeNull();
    expect(parseStationRef('   ')).toBeNull();
  });
});

describe('formatStationRef', () => {
  it('je obratna operacija razčlenitve', () => {
    for (const value of ['arso:VRHNIKA', 'neverin:sveta-marina']) {
      expect(formatStationRef(parseStationRef(value)!)).toBe(value);
    }
  });

  it('golo oznako zapiše s ponudnikom — tako se shrani v nastavitve', () => {
    expect(formatStationRef(parseStationRef('VRHNIKA')!)).toBe('arso:VRHNIKA');
  });
});

describe('parseStationRefs', () => {
  it('ohrani vrstni red in odvrže podvojene', () => {
    expect(parseStationRefs(['arso:VRHNIKA', 'neverin:sveta-marina', 'VRHNIKA'])).toEqual([
      { provider: 'arso', id: 'VRHNIKA' },
      { provider: 'neverin', id: 'sveta-marina' },
    ]);
  });

  it('neveljavno postajo ODVRŽE in ne zavrne celega seznama', () => {
    // Nastavitve so lahko starejše od pravil; ena postaja, ki je vir ne pozna več, ne sme
    // pomeniti praznega zavihka za vse ostale.
    expect(parseStationRefs(['ni-ponudnik:x', 'arso:VRHNIKA'])).toEqual([
      { provider: 'arso', id: 'VRHNIKA' },
    ]);
  });

  it('odreže pri zgornji meji izbranih postaj', () => {
    const many = Array.from({ length: MAX_SELECTED_STATIONS + 5 }, (_, i) => `neverin:postaja-${i}`);
    expect(parseStationRefs(many)).toHaveLength(MAX_SELECTED_STATIONS);
  });

  it('prazen seznam ostane prazen (klicatelj to prevede v privzetek namestitve)', () => {
    expect(parseStationRefs([])).toEqual([]);
  });
});

describe('ponudniki', () => {
  it('pozna natanko ARSO in Neverin', () => {
    expect([...METEO_PROVIDERS]).toEqual(['arso', 'neverin']);
    expect(isValidProvider('arso')).toBe(true);
    expect(isValidProvider('neverin')).toBe(true);
    expect(isValidProvider('meteoblue')).toBe(false);
  });

  it('vsak ponudnik preverja oznako v SVOJEM prostoru imen', () => {
    // Prostora se ne prekrivata, a se na to ne zanašamo: razločevanje po obliki vrednosti je
    // pravilo, ki drži, dokler ga en nov ponudnik ne podre.
    expect(isValidStationIdFor('arso', 'VRHNIKA')).toBe(true);
    expect(isValidStationIdFor('arso', 'sveta-marina')).toBe(false);
    expect(isValidStationIdFor('neverin', 'sveta-marina')).toBe(true);
    expect(isValidStationIdFor('neverin', 'VRHNIKA')).toBe(false);
  });

  it('privzetek namestitve je veljaven sklic', () => {
    expect(isValidStationIdFor(DEFAULT_STATION_REF.provider, DEFAULT_STATION_REF.id)).toBe(true);
    expect(stationRefEquals(DEFAULT_STATION_REF, parseStationRef('arso:LJUBL-ANA_BEZIGRAD')!)).toBe(true);
  });
});
