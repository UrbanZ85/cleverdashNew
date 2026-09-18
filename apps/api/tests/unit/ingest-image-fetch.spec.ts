import { describe, expect, it, vi } from 'vitest';
import { fetchRecipeImageFromUrl } from '../../src/modules/recipes/services/image-fetch.service.js';
import { setTestEnv } from '../setup/test-env.js';

setTestEnv();

// Ta storitev je edini odhodni klic, ki ga sproži ZUNANJI agent — torej najbolj izpostavljena
// pot v tej kodni bazi. Testirana je brez baze in brez omrežja (člen IX): zavrnitve se zgodijo
// PRED kakršnim koli zapisom, zato do modelov nikoli ne pride.

/** `fetch`, ki se ne sme poklicati. Vsak klic je napaka testa. */
const noFetch = vi.fn(async () => {
  throw new Error('odhodni klic se NE bi smel zgoditi');
}) as unknown as typeof fetch;

describe('varovalo odhodnih naslovov pri sliki', () => {
  it.each([
    ['http://primer.si/slika.jpg', 'scheme'],
    ['https://127.0.0.1/slika.jpg', 'private-host'],
    ['https://169.254.169.254/slika.jpg', 'private-host'],
    ['https://192.168.1.10/slika.jpg', 'private-host'],
    ['https://user:geslo@primer.si/slika.jpg', 'credentials'],
    ['ni-naslov', 'invalid'],
  ])('%s je zavrnjen BREZ odhodnega klica', async (url, reason) => {
    const res = await fetchRecipeImageFromUrl('r1', 'u1', url, noFetch);
    expect(res.status).toBe('skipped');
    expect(res.reason).toBe(reason);
    expect(res.imageId).toBeNull();
  });

  it('naslova storitve metapodatkov v oblaku ne obišče niti prek preusmeritve', async () => {
    // `redirect: 'manual'` in ponovno varovalo na vsakem skoku sta edino, kar to prepreči —
    // `follow` bi preusmeritev opravil, preden bi jo videli.
    const fetchImpl = vi.fn(async () =>
      // `https`, da preverbo res opravi pravilo o zasebnem gostitelju in ne že pravilo o shemi.
      new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data/' } }),
    ) as unknown as typeof fetch;

    const res = await fetchRecipeImageFromUrl('r1', 'u1', 'https://primer.si/slika.jpg', fetchImpl);
    expect(res.status).toBe('failed');
    expect(res.reason).toBe('redirect-private-host');
  });

  it('preusmeritvena zanka se ustavi', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: 'https://primer.si/slika.jpg' } }),
    ) as unknown as typeof fetch;

    const res = await fetchRecipeImageFromUrl('r1', 'u1', 'https://primer.si/slika.jpg', fetchImpl);
    expect(res.status).toBe('failed');
    expect(res.reason).toBe('redirect-cycle');
  });
});

describe('vrsta se ugotovi iz PODPISA in ne iz glave', () => {
  it('HTML, postrežen kot image/jpeg, je zavrnjen', async () => {
    // To je cel razlog za preverbo podpisa: dokument HTML, shranjen kot "slika" in pozneje
    // postrežen z naše domene, bi bil shranjen XSS.
    const fetchImpl = vi.fn(async () =>
      new Response('<!doctype html><script>alert(1)</script>', {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      }),
    ) as unknown as typeof fetch;

    const res = await fetchRecipeImageFromUrl('r1', 'u1', 'https://primer.si/slika.jpg', fetchImpl);
    expect(res.status).toBe('failed');
    expect(res.reason).toBe('unsupported');
    expect(res.imageId).toBeNull();
  });

  it('prazno telo je zavrnjeno', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(new Uint8Array(0), { status: 200, headers: { 'content-type': 'image/png' } }),
    ) as unknown as typeof fetch;

    const res = await fetchRecipeImageFromUrl('r1', 'u1', 'https://primer.si/slika.png', fetchImpl);
    expect(res.status).toBe('failed');
    expect(res.reason).toBe('empty');
  });
});

describe('napake tujega strežnika', () => {
  it('404 je failed in ne vrže', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    const res = await fetchRecipeImageFromUrl('r1', 'u1', 'https://primer.si/ni.jpg', fetchImpl);
    expect(res.status).toBe('failed');
    expect(res.reason).toBe('http-404');
  });

  it('napaka omrežja je failed in ne vrže — recept mora preživeti', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const res = await fetchRecipeImageFromUrl('r1', 'u1', 'https://primer.si/slika.jpg', fetchImpl);
    expect(res.status).toBe('failed');
    expect(res.reason).toBe('network');
  });
});
