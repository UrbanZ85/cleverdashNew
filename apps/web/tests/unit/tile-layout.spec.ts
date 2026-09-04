import { describe, expect, it } from 'vitest';
import { mergeMissingTypes } from '../../src/app/shared/tiles/tile-layout.model.js';

// Pravilo, ki se tiho pokvari: nova VGRAJENA vrsta ploščice se mora pojaviti sama, skrita
// ploščica pa mora ostati skrita. Prej je to logiko imel samo zaslon za razporejanje in
// nadzorna plošča nove ploščice ni pokazala, dokler uporabnik ni shranil razporeditve.
//
// Test je nad čisto funkcijo (brez registra in brez Angularjevih komponent) — register je
// samo seznam vrst, ki ga vanjo poda klicatelj.

describe('mergeMissingTypes', () => {
  it('prazno razporeditev napolni z vsemi vgrajenimi vrstami, vidnimi in po vrsti', () => {
    const result = mergeMissingTypes([], ['weather', 'radar']);
    expect(result).toEqual([
      { type: 'weather', position: 0, visible: true },
      { type: 'radar', position: 1, visible: true },
    ]);
  });

  it('novo vrsto pripne na konec, obstoječih vnosov pa ne premakne', () => {
    const stored = [
      { type: 'radar', position: 0, visible: true },
      { type: 'weather', position: 1, visible: true },
    ];
    const result = mergeMissingTypes(stored, ['weather', 'radar', 'commute']);
    expect(result.map((t) => t.type)).toEqual(['radar', 'weather', 'commute']);
    expect(result[2]).toEqual({ type: 'commute', position: 2, visible: true });
  });

  it('skrite ploščice ne prižge — obstoječ vnos ni "manjkajoč"', () => {
    const stored = [{ type: 'weather', position: 0, visible: false }];
    const result = mergeMissingTypes(stored, ['weather']);
    expect(result).toEqual(stored);
  });

  it('vnosov vtičnikov ne podvoji in jih ne izgubi', () => {
    const stored = [
      { type: 'plugin', position: 0, visible: true, config: { pluginId: 'a' } },
      { type: 'plugin', position: 1, visible: true, config: { pluginId: 'b' } },
    ];
    const result = mergeMissingTypes(stored, ['weather']);
    expect(result.filter((t) => t.type === 'plugin')).toHaveLength(2);
    expect(result.map((t) => t.type)).toEqual(['plugin', 'plugin', 'weather']);
    expect(result[0]?.config).toEqual({ pluginId: 'a' });
  });

  it('razporeditev vrne urejeno po position, tudi če je shranjena v drugem vrstnem redu', () => {
    const stored = [
      { type: 'weather', position: 2, visible: true },
      { type: 'radar', position: 1, visible: true },
    ];
    expect(mergeMissingTypes(stored, ['weather', 'radar']).map((t) => t.type)).toEqual(['radar', 'weather']);
  });

  // Regresija, najdena v uporabi (010): pripenjanje seznama na ploščico Opravila je padlo s
  // sporočilom "Pripenjanja ni bilo mogoče shraniti". Vzrok ni bil v ploščici — nova vrsta je
  // dobila položaj `base.length + i`, kar ob VRZELI v shranjenih položajih podvoji obstoječega,
  // strežnik pa podvojen `position` zavrne s 400. Vrzel nastane povsem običajno: izbris
  // vtičnika razporeditve ne pospravi.
  //
  // Napaka je bila v kodi od 001 in je nihče ni opazil, ker je bil izhod te funkcije do zdaj
  // samo IZRISAN, nikoli zapisan nazaj.
  it('ob VRZELI v položajih ne ustvari podvojenega položaja (regresija)', () => {
    const zVrzeljo = [
      { type: 'weather', position: 0, visible: true },
      { type: 'radar', position: 2, visible: true },
    ];

    const result = mergeMissingTypes(zVrzeljo, ['weather', 'forecast', 'radar', 'commute', 'todos']);
    const positions = result.map((t) => t.position);

    expect(new Set(positions).size, `podvojen položaj v ${JSON.stringify(positions)}`).toBe(
      positions.length,
    );
  });

  it('nove vrste gredo ZA največji obstoječi položaj, ne za dolžino polja', () => {
    const stored = [{ type: 'weather', position: 7, visible: true }];

    const result = mergeMissingTypes(stored, ['weather', 'radar']);

    expect(result.find((t) => t.type === 'radar')?.position).toBe(8);
    // Obstoječi vnos se NE premakne — uporabnikova razporeditev ostane, kakršna je.
    expect(result.find((t) => t.type === 'weather')?.position).toBe(7);
  });

  it('LASTNOST: noben nabor shranjenih položajev ne da podvojenega izhoda', () => {
    const builtIn = ['weather', 'forecast', 'radar', 'commute', 'todos'];
    const primeri = [
      [],
      [{ type: 'weather', position: 0, visible: true }],
      [{ type: 'weather', position: 0, visible: true }, { type: 'radar', position: 5, visible: true }],
      [{ type: 'radar', position: 3, visible: false }],
      [{ type: 'plugin', position: 9, visible: true, config: { pluginId: 'x' } }],
    ];

    for (const stored of primeri) {
      const positions = mergeMissingTypes(stored, builtIn).map((t) => t.position);
      expect(new Set(positions).size, `vhod ${JSON.stringify(stored)}`).toBe(positions.length);
    }
  });
});
