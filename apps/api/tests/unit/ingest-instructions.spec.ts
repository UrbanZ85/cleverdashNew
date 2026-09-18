import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildCurlExample,
  buildIngestInstructions,
} from '../../src/platform/ingest/instructions.js';
import { listIngestTargets, resetIngestTargetsForTests } from '../../src/platform/ingest/registry.js';
import { registerRecipesIngest } from '../../src/modules/recipes/ingest.js';
import { registerNotesIngest } from '../../src/modules/notes/ingest.js';

// Navodilo je edini del te funkcionalnosti, ki ga NE prebere noben stroj v tej kodni bazi —
// prebere ga jezikovni model v tujem pogovornem oknu. Zato je tu preverjeno kot besedilo: kar
// manjka v njem, se ne pokaže kot napaka nikjer drugje.

beforeEach(resetIngestTargetsForTests);
afterEach(resetIngestTargetsForTests);

function targets(...keys: string[]) {
  registerRecipesIngest();
  registerNotesIngest();
  return listIngestTargets().filter((t) => keys.includes(t.key));
}

const BASE = 'https://cleverdash.example';

describe('navodilo za agenta', () => {
  it('vsebuje naslov vstopne točke, ključ in obliko telesa', () => {
    const text = buildIngestInstructions({
      baseUrl: BASE,
      secret: 'cd_tajni',
      targets: targets('recipes'),
      expiresAt: null,
    });

    expect(text).toContain(`POST ${BASE}/api/v1/ingest`);
    expect(text).toContain('X-API-Key: cd_tajni');
    expect(text).toContain('Content-Type: application/json');
    expect(text).toContain('"target": "recipes"');
  });

  it('naslov nima podvojene poševnice, tudi če jo ima PUBLIC_BASE_URL', () => {
    // `PUBLIC_BASE_URL` je nastavitev okolja in jo človek zapiše tako ali drugače. Naslov s
    // `//api/v1` bi agent poslal dobesedno in dobil 404, ki ga nihče ne bi znal razložiti.
    const text = buildIngestInstructions({
      baseUrl: 'https://cleverdash.example///',
      secret: 'cd_x',
      targets: targets('recipes'),
      expiresAt: null,
    });
    expect(text).toContain('POST https://cleverdash.example/api/v1/ingest');
    expect(text).not.toContain('example//api');
  });

  it('brez čistopisa vstavi očiten nadomestek in ne izmišljene vrednosti', () => {
    const text = buildIngestInstructions({
      baseUrl: BASE,
      secret: null,
      targets: targets('recipes'),
      expiresAt: null,
    });
    expect(text).toContain('X-API-Key: <TVOJ-KLJUC>');
    expect(text).not.toMatch(/X-API-Key: cd_/);
  });

  it('opiše vsako polje cilja, z oznako obveznosti', () => {
    const [recipes] = targets('recipes');
    const text = buildIngestInstructions({
      baseUrl: BASE,
      secret: 'cd_x',
      targets: [recipes!],
      expiresAt: null,
    });

    for (const field of recipes!.fields) {
      expect(text, `polje "${field.name}" manjka v navodilu`).toContain(field.name);
      expect(text).toContain(field.description);
    }
    // `title` je edino obvezno polje recepta — oznaka mora biti ob njem in ne ob drugih.
    expect(text).toMatch(/title\s+besedilo\s+OBVEZNO/);
    expect(text).not.toMatch(/servings\s+število\s+OBVEZNO/);
  });

  it('primer je izpisan kot CELOTNO telo, z ovojnico', () => {
    // Agent prepiše tisto, kar vidi. Primer brez `{"target":…,"data":…}` je zanesljiva pot do 400.
    const text = buildIngestInstructions({
      baseUrl: BASE,
      secret: 'cd_x',
      targets: targets('recipes'),
      expiresAt: null,
    });
    expect(text).toContain('"data": {');
    expect(text).toContain('"Bučna juha z ingverjem"');
  });

  it('pri enem cilju ne sili v izbiro, pri dveh pa jo zahteva', () => {
    const one = buildIngestInstructions({
      baseUrl: BASE,
      secret: 'cd_x',
      targets: targets('recipes'),
      expiresAt: null,
    });
    expect(one).not.toContain('Izberi enega od');

    const two = buildIngestInstructions({
      baseUrl: BASE,
      secret: 'cd_x',
      targets: targets('recipes', 'notes'),
      expiresAt: null,
    });
    expect(two).toContain('Izberi enega od');
    expect(two).toContain('"recipes"');
    expect(two).toContain('"notes"');
    expect(two).toContain('CILJ "notes" — Beležke');
  });

  it('pove, kaj pomeni vsak izid, vključno z dvojnikom', () => {
    const text = buildIngestInstructions({
      baseUrl: BASE,
      secret: 'cd_x',
      targets: targets('recipes'),
      expiresAt: null,
    });
    expect(text).toContain('201');
    expect(text).toContain('"status": "duplicate"');
    expect(text).toContain('4xx');
    // Brez tega agent ob 4xx ponavlja zahtevo, dokler ne naredi škode ali ne obupa.
    expect(text).toContain('ne poskušaj znova');
  });

  it('agentu prepove izmišljanje podatkov in razkritje ključa', () => {
    const text = buildIngestInstructions({
      baseUrl: BASE,
      secret: 'cd_x',
      targets: targets('recipes'),
      expiresAt: null,
    });
    expect(text).toContain('Ne izmišljuj si podatkov');
    expect(text).toMatch(/ključa .*ne izpiši/i);
  });
});

describe('veljavnost v navodilu', () => {
  it('datum je slovenski in v domačem časovnem pasu, ne v UTC (člen V.4)', () => {
    // 31. 12. 2026 ob 23:30 po Ljubljani je v UTC že 22:30 istega dne — a ob 00:30 bi `toISOString()`
    // dal 1. 1. 2027. Ta test drži prav to mejo: ključ, ki velja "do 31. 12.", ne sme pisati "do 1. 1.".
    const text = buildIngestInstructions({
      baseUrl: BASE,
      secret: 'cd_x',
      targets: targets('recipes'),
      expiresAt: new Date('2026-12-31T23:30:00+01:00'),
    });
    expect(text).toMatch(/31\.\s*12\.\s*2026/);
    expect(text).not.toContain('2027');
  });

  it('brez roka to izrecno pove', () => {
    const text = buildIngestInstructions({
      baseUrl: BASE,
      secret: 'cd_x',
      targets: targets('recipes'),
      expiresAt: null,
    });
    expect(text).toContain('nima roka veljavnosti');
  });
});

describe('primer za curl', () => {
  it('je izvedljiv klic z istim ključem in istim telesom', () => {
    const curl = buildCurlExample({
      baseUrl: BASE,
      secret: 'cd_tajni',
      targets: targets('recipes'),
      expiresAt: null,
    });
    expect(curl).toContain(`curl -X POST ${BASE}/api/v1/ingest`);
    expect(curl).toContain('-H "X-API-Key: cd_tajni"');
    // Telo mora biti veljaven JSON — `curl` s pokvarjenim telesom bi bil slabši od nobenega.
    const body = curl.slice(curl.indexOf("-d '") + 4, curl.lastIndexOf("'"));
    expect(() => JSON.parse(body)).not.toThrow();
    expect(JSON.parse(body)).toMatchObject({ target: 'recipes' });
  });
});
