import { describe, expect, it } from 'vitest';
import { legoConfigSchema, validateLegoConfig } from '../../../src/modules/lego-scanner/config.js';
import { searchQueries } from '../../../src/modules/lego-scanner/execute.js';

// Več kompletov in več iskalnih nizov v enem skenerju: vsak je svoja poizvedba pri viru oglasov.

const env = { EBAY_MARKETPLACES: 'EBAY_DE,EBAY_IT' };
const parse = (input: unknown) => {
  const r = legoConfigSchema.safeParse(input);
  if (!r.success) throw new Error(r.error.issues[0]?.message);
  return r.data;
};

describe('searchQueries', () => {
  it('brez dodatnih vrednosti je kot doslej: ena združena poizvedba', () => {
    expect(searchQueries(parse({ setNumber: '75192', keywords: 'falcon' }))).toEqual(['LEGO 75192 falcon']);
    expect(searchQueries(parse({ theme: 'Technic' }))).toEqual(['LEGO Technic']);
    expect(searchQueries(parse({ maxPrice: 100 }))).toEqual(['LEGO']);
  });

  it('vsak komplet in vsak iskalni niz je svoja poizvedba', () => {
    const c = parse({ setNumbers: ['75192', '75252-1', '75060'], searches: ['UCS', 'Star Wars retired'] });
    expect(searchQueries(c)).toEqual(['LEGO 75192', 'LEGO 75252', 'LEGO 75060', 'LEGO UCS', 'LEGO Star Wars retired']);
  });

  it('enovrednostni polji ostaneta ena združena poizvedba poleg dodatnih; dvojniki odpadejo', () => {
    const c = parse({ setNumber: '75192', setNumbers: ['75192', '75252'], searches: ['75252'] });
    expect(searchQueries(c)).toEqual(['LEGO 75192', 'LEGO 75252']);
  });
});

describe('konfiguracija: več kompletov in iskanj', () => {
  it('normalizira številke, odstrani dvojnike in je sama zase dovolj kot kriterij', () => {
    const c = parse({ setNumbers: [' 75192 ', '75192-1', '10264'] });
    expect(c.setNumbers).toEqual(['75192-1', '10264-1']);
    expect(validateLegoConfig(c, env)).toBeNull();
    expect(validateLegoConfig(parse({ searches: ['LEGO UCS'] }), env)).toBeNull();
  });

  it('neveljavna številka ali predolg niz sta zavrnjena', () => {
    expect(() => parse({ setNumbers: ['12'] })).toThrow('4 do 6 števk');
    expect(() => parse({ searches: ['x'.repeat(121)] })).toThrow('120');
    expect(() => parse({ searches: [''] })).toThrow('prazen');
  });

  it('skupaj največ 30 poizvedb', () => {
    const many = Array.from({ length: 20 }, (_, i) => `${10000 + i}`);
    const searches = Array.from({ length: 11 }, (_, i) => `iskanje ${i}`);
    expect(validateLegoConfig(parse({ setNumbers: many, searches }), env)).toContain('največ 30');
    expect(validateLegoConfig(parse({ setNumbers: many, searches: searches.slice(0, 10) }), env)).toBeNull();
  });
});
