import { describe, expect, it } from 'vitest';
import { fitWithin, shouldUseEncoded } from '../../src/app/features/recipes/image-resize.js';

// 013: priprava slike pred nalaganjem (pomanjšava + WebP).
//
// Kodiranja samega tu NI mogoče pokriti — `canvas.toBlob` v jsdom ne obstaja. Pokrita sta oba čista
// dela, ki sta hkrati tista, ki se dasta pokvariti TIHO: razmerje stranic (popačena slika je videti
// kot slaba fotografija, ne kot hrošč) in odločitev, katero sliko sploh naložiti.

describe('fitWithin', () => {
  it('pomanjša daljšo stranico na mejo in ohrani razmerje', () => {
    expect(fitWithin({ width: 4000, height: 3000 }, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin({ width: 3000, height: 4000 }, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('NIKOLI ne poveča — manjša slika ostane svoje velikosti', () => {
    // Povečava ne doda podatka, poveča pa datoteko: natanko obratno od namena.
    expect(fitWithin({ width: 800, height: 600 }, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin({ width: 1600, height: 900 }, 1600)).toEqual({ width: 1600, height: 900 });
  });

  it('kvadratno sliko pomanjša v kvadrat', () => {
    expect(fitWithin({ width: 2400, height: 2400 }, 600)).toEqual({ width: 600, height: 600 });
  });

  it('pri zelo podolgovati sliki nikoli ne vrne stranice 0', () => {
    // `<canvas>` s širino 0 vrže; zaokroževanje bi tu brez varovala dalo 0.
    const result = fitWithin({ width: 10_000, height: 3 }, 600);
    expect(result.width).toBe(600);
    expect(result.height).toBeGreaterThanOrEqual(1);
  });

  it('prenese prazne mere brez deljenja z nič', () => {
    expect(fitWithin({ width: 0, height: 0 }, 1600)).toEqual({ width: 0, height: 0 });
  });
});

describe('shouldUseEncoded', () => {
  it('pomanjšana slika obvelja, tudi če je večja od izvirnika', () => {
    // Slika je bila prevelika za prikaz; mere so takrat pomembnejše od bajtov.
    expect(shouldUseEncoded({ originalBytes: 100, encodedBytes: 900, resized: true })).toBe(true);
  });

  it('brez pomanjšave obvelja MANJŠA od obeh', () => {
    expect(shouldUseEncoded({ originalBytes: 5_000_000, encodedBytes: 250_000, resized: false })).toBe(true);
    // Majhen, že dobro stisnjen JPEG: pretvorba bi ga napihnila, zato obvelja izvirnik.
    expect(shouldUseEncoded({ originalBytes: 40_000, encodedBytes: 60_000, resized: false })).toBe(false);
  });

  it('enaka velikost brez pomanjšave ne opraviči zamenjave', () => {
    expect(shouldUseEncoded({ originalBytes: 1000, encodedBytes: 1000, resized: false })).toBe(false);
  });
});
