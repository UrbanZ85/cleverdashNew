import { describe, expect, it } from 'vitest';
import {
  buildRecipesFilter,
  normalizeTags,
  splitLines,
} from '../../src/modules/recipes/domain/recipe-input.js';
import {
  hostLabel,
  normalizeOptionalRecipeUrl,
  normalizeRecipeUrl,
} from '../../src/modules/recipes/domain/recipe-url.js';
import { buildSearchText, foldForSearch, foldTag } from '../../src/modules/recipes/domain/search-text.js';
import {
  checkImageUpload,
  safeImageFileName,
  sniffImageMimeType,
} from '../../src/modules/recipes/domain/image-type.js';
import { isRecipeShareTokenShaped } from '../../src/modules/recipes/domain/share-token.js';

// 013: čista domenska plast. Brez baze, brez omrežja, brez express (člen IX).

describe('normalizeRecipeUrl', () => {
  it('dopolni manjkajočo shemo', () => {
    const result = normalizeRecipeUrl('okusno.si/bucna-juha');
    expect(result).toEqual({ ok: true, url: 'https://okusno.si/bucna-juha' });
  });

  it('zniža gostitelja, POTI pa se ne dotakne', () => {
    // Pot je na strežnikih Linuxa občutljiva na velike črke — znižanje bi pripeljalo do 404.
    const result = normalizeRecipeUrl('https://OKUSNO.si/Bucna-Juha');
    expect(result).toEqual({ ok: true, url: 'https://okusno.si/Bucna-Juha' });
  });

  it('zavrne shemo, ki ni http(s), Z RAZLOGOM', () => {
    const result = normalizeRecipeUrl('javascript:alert(1)');
    expect(result.ok).toBe(false);
    // `javascript:` se kot URL uspešno razčleni, zato bi ga poskus-ujemi spustil naprej. Razlog
    // mora biti `scheme`, ne `invalid` — sicer prepoznava sheme ne deluje.
    expect(result.ok === false && result.reason).toBe('scheme');
  });

  it('zavrne predolg naslov namesto da bi ga odrezal', () => {
    const result = normalizeRecipeUrl(`https://okusno.si/${'a'.repeat(3000)}`);
    expect(result.ok === false && result.reason).toBe('too-long');
  });
});

describe('normalizeOptionalRecipeUrl — trije vhodi pomenijo tri različne stvari', () => {
  it('undefined pomeni "ne spreminjaj"', () => {
    expect(normalizeOptionalRecipeUrl(undefined)).toEqual({ ok: true, url: undefined });
  });

  it('null in prazen niz pomenita "pobriši"', () => {
    // Brez te ločnice uporabnik naslova ne bi mogel odstraniti (FR-002).
    expect(normalizeOptionalRecipeUrl(null)).toEqual({ ok: true, url: null });
    expect(normalizeOptionalRecipeUrl('   ')).toEqual({ ok: true, url: null });
  });

  it('niz se normalizira', () => {
    expect(normalizeOptionalRecipeUrl('okusno.si')).toEqual({ ok: true, url: 'https://okusno.si/' });
  });
});

describe('hostLabel', () => {
  it('odstrani www in vrne null za nenaslov', () => {
    expect(hostLabel('https://www.okusno.si/x')).toBe('okusno.si');
    expect(hostLabel(null)).toBeNull();
    expect(hostLabel('ni-naslov')).toBeNull();
  });
});

describe('splitLines', () => {
  it('razbije prilepljeno besedilo po vrsticah in zavrže prazne', () => {
    const { items } = splitLines('400 g buče\n\n1 čebula\n  \nsol', { maxItems: 10, maxLength: 200 });
    expect(items).toEqual(['400 g buče', '1 čebula', 'sol']);
  });

  it('odstrani vodilne oznake seznama, ki jih prinese lepljenje', () => {
    const { items } = splitLines('- 400 g buče\n* 1 čebula\n1. sol\n2) poper', {
      maxItems: 10,
      maxLength: 200,
    });
    expect(items).toEqual(['400 g buče', '1 čebula', 'sol', 'poper']);
  });

  it('reže in JAVI rezanje, namesto da bi zavrnilo cel vnos', () => {
    const many = Array.from({ length: 150 }, (_, i) => `sestavina ${i}`);
    const { items, truncated } = splitLines(many, { maxItems: 100, maxLength: 200 });
    expect(items).toHaveLength(100);
    expect(truncated).toBe(true);
  });

  it('sprejme tudi seznam nizov, v katerem je vnos z novimi vrsticami', () => {
    const { items } = splitLines(['a\nb', 'c'], { maxItems: 10, maxLength: 200 });
    expect(items).toEqual(['a', 'b', 'c']);
  });
});

describe('normalizeTags', () => {
  it('ohrani prikazno obliko in zloži ključ', () => {
    const { tags, tagKeys } = normalizeTags(['Sladice', 'Hitra Kosila']);
    expect(tags).toEqual(['Sladice', 'Hitra Kosila']);
    expect(tagKeys).toEqual(['sladice', 'hitra-kosila']);
  });

  it('podvojene po ZLOŽENI obliki zavrže — sicer bi se seznam oznak razpršil', () => {
    const { tags } = normalizeTags(['Juha', 'juha', 'JUHA']);
    expect(tags).toEqual(['Juha']);
  });

  it('zavrže oznako, od katere po zlaganju ne ostane nič', () => {
    // Filtra po njej ne bi bilo mogoče sestaviti.
    const { tags } = normalizeTags(['!!!', '   ', 'juha']);
    expect(tags).toEqual(['juha']);
  });

  it('sprejme en niz z vejicami', () => {
    expect(normalizeTags('juha, vegi').tags).toEqual(['juha', 'vegi']);
  });
});

describe('iskanje', () => {
  it('zlaganje odstrani šumnike in velike črke', () => {
    expect(foldForSearch('BUČA Žlica Šalica')).toBe('buca zlica salica');
  });

  it('searchText zajame sestavine — recept se išče po tem, kar je v hladilniku', () => {
    const text = buildSearchText({
      title: 'Juha',
      description: 'Za hladne dni',
      ingredients: ['400 g buče'],
      tags: ['Vegi'],
    });
    expect(text).toContain('buce');
    expect(text).toContain('vegi');
  });

  it('searchText NE zajame korakov', () => {
    // Koraki so navodila in bi vanj prinesli "peci", "segrej", "premešaj" — besede iz skoraj
    // vsakega recepta, po katerih bi iskanje vrnilo vse.
    const text = buildSearchText({ title: 'Juha', ingredients: ['buča'] });
    expect(text).not.toContain('peci');
  });

  it('foldTag naredi iz presledkov vezaje', () => {
    expect(foldTag('Hitra Kosila!')).toBe('hitra-kosila');
  });
});

describe('buildRecipesFilter', () => {
  it('privzeto zajame LASTNE in DELJENE', () => {
    const filter = buildRecipesFilter({ userId: 'u1' });
    expect(filter).toEqual({ $or: [{ ownerId: 'u1' }, { 'members.userId': 'u1' }] });
  });

  it('scope own in shared sta izključna', () => {
    expect(buildRecipesFilter({ userId: 'u1', scope: 'own' })).toEqual({ ownerId: 'u1' });
    expect(buildRecipesFilter({ userId: 'u1', scope: 'shared' })).toEqual({ 'members.userId': 'u1' });
  });

  it('iskalni niz je UBEŽEN — sicer bi "." vrnil vse', () => {
    const filter = buildRecipesFilter({ userId: 'u1', query: 'c++' });
    expect((filter.searchText as { $regex: string }).$regex).toBe('c\\+\\+');
  });

  it('oznaka, od katere ne ostane nič, NE pomeni "brez filtra"', () => {
    // Uporabnik je filter izbral; prazen seznam je pošten odgovor, celoten seznam pa ne.
    const filter = buildRecipesFilter({ userId: 'u1', tag: '!!!' });
    expect(filter.tagKeys).toEqual({ $in: [] });
  });
});

describe('sniffImageMimeType — vrsta iz VSEBINE, ne iz imena (FR-021)', () => {
  const pad = (head: number[]) => Buffer.concat([Buffer.from(head), Buffer.alloc(16)]);

  it('prepozna JPEG, PNG in WebP', () => {
    expect(sniffImageMimeType(pad([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
    expect(sniffImageMimeType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(
      sniffImageMimeType(
        Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16)]),
      ),
    ).toBe('image/webp');
  });

  it('zavrne HTML, tudi če je poimenovan kot slika', () => {
    // To je cel razlog te funkcije: HTML, ki bi se naložil kot "slika" in se pozneje postregel z
    // naše domene, bi bil shranjen XSS (research.md §6).
    expect(sniffImageMimeType(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
  });

  it('zavrne okrnjen PNG podpis — zadnji štirje bajti so del standarda', () => {
    expect(sniffImageMimeType(pad([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]))).toBeNull();
  });

  it('zavrne prekratko vsebino', () => {
    expect(sniffImageMimeType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('checkImageUpload', () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32)]);

  it('sprejme veljavno sliko', () => {
    expect(checkImageUpload(jpeg, 1024)).toMatchObject({ ok: true, mimeType: 'image/jpeg' });
  });

  it('prazno telo, prevelika in nepodprta imajo LOČENE razloge', () => {
    // Odjemalec se nanje odzove drugače (pomanjšaj proti izberi drugo datoteko), zato en sam
    // razlog ne bi zadoščal.
    expect(checkImageUpload(Buffer.alloc(0), 1024).reason).toBe('empty');
    expect(checkImageUpload(jpeg, 4).reason).toBe('too-large');
    expect(checkImageUpload(Buffer.alloc(32), 1024).reason).toBe('unsupported');
  });

  it('sporočilo o preveliki sliki navede mejo', () => {
    const result = checkImageUpload(Buffer.concat([jpeg, Buffer.alloc(5_000_000)]), 1024 * 1024);
    expect(result.message).toContain('Največ 1 MB');
  });
});

describe('safeImageFileName', () => {
  it('odstrani znake, ki bi bili vbrizg v glavo odgovora', () => {
    const name = safeImageFileName('a"; drop\r\nX: y', 'image/jpeg');
    expect(name).toBe('a drop X y.jpg');
    // Bistvo ni natanko to ime, ampak da v njem ne ostane NIČ, kar bi zaprlo narekovaj ali
    // začelo novo glavo odgovora.
    expect(name).not.toMatch(/["\r\n;:]/);
  });

  it('brez uporabnega imena vrne nevtralno ime s pravo končnico', () => {
    expect(safeImageFileName(null, 'image/png')).toBe('slika.png');
    expect(safeImageFileName('!!!', 'image/webp')).toBe('slika.webp');
  });
});

describe('isRecipeShareTokenShaped — oblika se preveri PRED poizvedbo', () => {
  it('sprejme 22 znakov base64url', () => {
    expect(isRecipeShareTokenShaped('a'.repeat(22))).toBe(true);
  });

  it('zavrne napačno dolžino, tuje znake in vse, kar ni niz', () => {
    // Vzorec iz varnostnega pregleda 009: razčlenjen objekt v pogoju poizvedbe je OPERATOR.
    expect(isRecipeShareTokenShaped('a'.repeat(21))).toBe(false);
    expect(isRecipeShareTokenShaped(`a'"${'b'.repeat(19)}`)).toBe(false);
    expect(isRecipeShareTokenShaped({ $ne: null })).toBe(false);
    expect(isRecipeShareTokenShaped(undefined)).toBe(false);
  });
});
