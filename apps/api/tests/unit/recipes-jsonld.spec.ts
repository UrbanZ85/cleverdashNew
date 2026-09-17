import { describe, expect, it } from 'vitest';
import {
  extractRecipeFromHtml,
  parseIsoDuration,
} from '../../src/modules/recipes/domain/recipe-jsonld.js';

// 013, FR-010, research.md §9. Razčlenjevanje je čista funkcija, zato je TU pokrito z vzorci
// strani in BREZ enega samega odhodnega klica.
//
// Vsi trije "robovi" spodaj so v praksi pravilo in ne izjema — zato ima vsak svoj primer.

function page(jsonLd: unknown): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body>x</body></html>`;
}

describe('extractRecipeFromHtml', () => {
  it('prebere osnovni recept', () => {
    const html = page({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Bučna juha',
      description: 'Za hladne dni',
      recipeIngredient: ['400 g buče', '1 čebula'],
      recipeInstructions: ['Popeci čebulo.', 'Dodaj bučo.'],
      recipeYield: '4 porcije',
      totalTime: 'PT45M',
      image: 'https://okusno.si/juha.jpg',
    });

    expect(extractRecipeFromHtml(html)).toMatchObject({
      title: 'Bučna juha',
      description: 'Za hladne dni',
      ingredients: ['400 g buče', '1 čebula'],
      steps: ['Popeci čebulo.', 'Dodaj bučo.'],
      servings: 4,
      prepMinutes: 45,
      imageUrl: 'https://okusno.si/juha.jpg',
    });
  });

  it('rob 1: najde Recipe, zavit v @graph', () => {
    const html = page({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', name: 'Okusno' },
        { '@type': 'Recipe', name: 'Potica', recipeIngredient: ['moka'] },
      ],
    });
    expect(extractRecipeFromHtml(html).title).toBe('Potica');
  });

  it('rob 2: recipeInstructions kot HowToStep objekti', () => {
    const html = page({
      '@type': 'Recipe',
      name: 'X',
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Prvi korak.' },
        { '@type': 'HowToStep', text: 'Drugi korak.' },
      ],
    });
    expect(extractRecipeFromHtml(html).steps).toEqual(['Prvi korak.', 'Drugi korak.']);
  });

  it('rob 2b: recipeInstructions kot HowToSection z ugnezdenim seznamom', () => {
    const html = page({
      '@type': 'Recipe',
      name: 'X',
      recipeInstructions: [
        {
          '@type': 'HowToSection',
          name: 'Testo',
          itemListElement: [{ '@type': 'HowToStep', text: 'Zamesi.' }],
        },
        {
          '@type': 'HowToSection',
          itemListElement: [{ '@type': 'HowToStep', text: 'Speci.' }],
        },
      ],
    });
    expect(extractRecipeFromHtml(html).steps).toEqual(['Zamesi.', 'Speci.']);
  });

  it('rob 2c: recipeInstructions kot en dolg niz z novimi vrsticami', () => {
    const html = page({ '@type': 'Recipe', name: 'X', recipeInstructions: 'Prvi.\nDrugi.\n\nTretji.' });
    expect(extractRecipeFromHtml(html).steps).toEqual(['Prvi.', 'Drugi.', 'Tretji.']);
  });

  it('rob 3: @type je seznam', () => {
    const html = page({ '@type': ['Recipe', 'NewsArticle'], name: 'Štruklji' });
    expect(extractRecipeFromHtml(html).title).toBe('Štruklji');
  });

  it('iz opisa odstrani HTML značke', () => {
    // Značke bi se v vmesniku bodisi izpisale dobesedno bodisi — huje — izrisale.
    const html = page({ '@type': 'Recipe', name: 'X', description: '<p>Zelo <b>dobro</b></p>' });
    expect(extractRecipeFromHtml(html).description).toBe('Zelo dobro');
  });

  it('POKVARJEN blok ne prekine branja — recept je lahko v naslednjem', () => {
    const html = `<html><script type="application/ld+json">{ to ni json</script>${page({
      '@type': 'Recipe',
      name: 'Gibanica',
    })}</html>`;
    expect(extractRecipeFromHtml(html).title).toBe('Gibanica');
  });

  it('stran brez označenega recepta vrne prazno, ne napake', () => {
    const html = page({ '@type': 'NewsArticle', headline: 'Nekaj drugega' });
    expect(extractRecipeFromHtml(html)).toMatchObject({ title: null, ingredients: [], steps: [] });
    expect(extractRecipeFromHtml('<html><body>brez skripte</body></html>').title).toBeNull();
  });

  it('reže stran s 400 sestavinami namesto da bi zavrnila cel zapis', () => {
    const html = page({
      '@type': 'Recipe',
      name: 'X',
      recipeIngredient: Array.from({ length: 400 }, (_, i) => `sestavina ${i}`),
    });
    expect(extractRecipeFromHtml(html).ingredients).toHaveLength(100);
  });

  it('keywords kot en niz z vejicami postanejo oznake', () => {
    const html = page({ '@type': 'Recipe', name: 'X', keywords: 'juha, vegi, hitro' });
    expect(extractRecipeFromHtml(html).tags).toEqual(['juha', 'vegi', 'hitro']);
  });
});

describe('parseIsoDuration', () => {
  it('prebere ure in minute', () => {
    expect(parseIsoDuration('PT1H30M')).toBe(90);
    expect(parseIsoDuration('PT45M')).toBe(45);
    expect(parseIsoDuration('PT2H')).toBe(120);
  });

  it('prebere dneve — vzhajanje in mariniranje ju resnično uporabljata', () => {
    expect(parseIsoDuration('P1DT2H')).toBe(1560);
  });

  it('zavrne dvoumno in neveljavno obliko', () => {
    // `P1M` je v ISO 8601 dvoumen (mesec ali minuta, odvisno od položaja) in pri receptu ni
    // pomena, ki bi opravičil ugibanje.
    expect(parseIsoDuration('P1M')).toBeNull();
    expect(parseIsoDuration('45 min')).toBeNull();
    expect(parseIsoDuration(null)).toBeNull();
    expect(parseIsoDuration('PT0M')).toBeNull();
  });
});

describe('vsota časov', () => {
  it('kadar totalTime manjka, sešteje prepTime in cookTime', () => {
    const html = page({ '@type': 'Recipe', name: 'X', prepTime: 'PT15M', cookTime: 'PT30M' });
    expect(extractRecipeFromHtml(html).prepMinutes).toBe(45);
  });

  it('totalTime ima prednost pred vsoto', () => {
    const html = page({
      '@type': 'Recipe',
      name: 'X',
      totalTime: 'PT40M',
      prepTime: 'PT15M',
      cookTime: 'PT30M',
    });
    expect(extractRecipeFromHtml(html).prepMinutes).toBe(40);
  });
});
