import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTestEnv } from '../setup/test-env.js';
import { readLinkMetadata } from '../../src/modules/saved-links/services/link-metadata.service.js';

// 008, research.md §3/§5/§14 in quickstart.md §4. Vse teče s PODTAKNJENIM `fetch` in brez
// baze: preverjamo, kam strežnik sme seči in kdaj neha brati, ne pa ali je neka tuja stran
// danes dosegljiva.
//
// `fetch` se podtakne kot ARGUMENT in ne prek `vi.stubGlobal`: tako je iz testa razvidno, da
// storitev odhodni klic res opravi samo prek podane funkcije, in števec klicev je zanesljiv.

beforeEach(() => {
  setTestEnv();
});

/** Odgovor s preusmeritvijo. */
function redirect(to: string): Response {
  return new Response(null, { status: 302, headers: { location: to } });
}

function html(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

describe('readLinkMetadata — varovalo odhodnih naslovov', () => {
  it('zasebnega naslova NE obišče: status skipped in nič klicev (SC-008)', async () => {
    const fetchSpy = vi.fn();
    const result = await readLinkMetadata('http://192.168.1.1/', fetchSpy as unknown as typeof fetch);

    expect(result.status).toBe('skipped');
    expect(result.title).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('naslova s poverilnicami NE obišče (člen IV)', async () => {
    const fetchSpy = vi.fn();
    const result = await readLinkMetadata(
      'https://uporabnik:geslo@primer.si/',
      fetchSpy as unknown as typeof fetch,
    );

    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('credentials');
    expect(fetchSpy).not.toHaveBeenCalled();
    // Razlog ne sme nositi poverilnic naprej v dnevnik.
    expect(result.reason).not.toContain('geslo');
  });
});

describe('readLinkMetadata — preusmeritve', () => {
  it('preusmeritev na http://10.0.0.1/ je zavrnjena na DRUGEM skoku in je failed, ne skipped', async () => {
    // Poskus JE bil — zato `failed`. Zavrnitev pred prvim klicem bi bila `skipped`.
    const visited: string[] = [];
    const fetchSpy = vi.fn(async (input: string | URL) => {
      visited.push(String(input));
      return redirect('http://10.0.0.1/');
    });
    const result = await readLinkMetadata('https://kratko.si/x', fetchSpy as unknown as typeof fetch);

    expect(result.status).toBe('failed');
    expect(result.reason).toContain('redirect');
    // Cilj preusmeritve NI bil obiskan: en klic, ne dva.
    expect(visited).toEqual(['https://kratko.si/x']);
  });

  it('sledi do treh preusmeritev in prebere ime na cilju', async () => {
    const fetchSpy = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/1')) return redirect('https://primer.si/2');
      if (url.endsWith('/2')) return redirect('https://primer.si/3');
      return html('<head><title>Cilj</title></head>');
    });

    const result = await readLinkMetadata('https://primer.si/1', fetchSpy as unknown as typeof fetch);

    expect(result.status).toBe('ok');
    expect(result.title).toBe('Cilj');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('ČETRTI skok je zavrnjen', async () => {
    let n = 0;
    const fetchSpy = vi.fn(async () => {
      n += 1;
      return redirect(`https://primer.si/${n + 1}`);
    });

    const result = await readLinkMetadata('https://primer.si/1', fetchSpy as unknown as typeof fetch);

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('too-many-redirects');
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it('cikel preusmeritev ne zavrti storitve v neskončnost', async () => {
    const fetchSpy = vi.fn(async () => redirect('https://primer.si/a'));
    const result = await readLinkMetadata('https://primer.si/a', fetchSpy as unknown as typeof fetch);

    expect(result.status).toBe('failed');
    expect(['redirect-cycle', 'too-many-redirects']).toContain(result.reason);
  });
});

describe('readLinkMetadata — vrsta in velikost odgovora', () => {
  it('odgovora application/pdf ne razčlenjuje', async () => {
    const fetchSpy = vi.fn(
      async () => new Response('%PDF-1.7', { status: 200, headers: { 'content-type': 'application/pdf' } }),
    );

    const result = await readLinkMetadata('https://primer.si/a.pdf', fetchSpy as unknown as typeof fetch);

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('not-html');
    expect(result.title).toBeNull();
  });

  it('telo nad mejo se odreže — kar je za mejo, se ne prebere', async () => {
    setTestEnv({ SAVED_LINKS_METADATA_MAX_BYTES: '256' });
    const padding = '<!-- '.padEnd(400, 'x') + ' -->';
    const fetchSpy = vi.fn(async () => html(`${padding}<title>Za mejo</title>`));

    const result = await readLinkMetadata('https://primer.si/', fetchSpy as unknown as typeof fetch);

    expect(result.status).toBe('ok');
    expect(result.title).toBeNull();
  });

  it('napaka omrežja je failed z razlogom network', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });

    const result = await readLinkMetadata('https://ni-te-domene.si/', fetchSpy as unknown as typeof fetch);

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('network');
  });

  it('status 500 je failed in ne vrže napake naprej', async () => {
    const fetchSpy = vi.fn(async () => new Response('', { status: 500 }));
    const result = await readLinkMetadata('https://primer.si/', fetchSpy as unknown as typeof fetch);

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('http-500');
  });
});

describe('readLinkMetadata — favicon', () => {
  it('relativni href razreši proti naslovu dokumenta', async () => {
    const fetchSpy = vi.fn(async () => html('<head><link rel="icon" href="slike/i.png"></head>'));
    const result = await readLinkMetadata('https://primer.si/a/b', fetchSpy as unknown as typeof fetch);

    expect(result.faviconUrl).toBe('https://primer.si/a/slike/i.png');
  });

  it('brez značke <link> uporabi /favicon.ico na istem gostitelju (research.md §4)', async () => {
    const fetchSpy = vi.fn(async () => html('<head><title>x</title></head>'));
    const result = await readLinkMetadata('https://primer.si/a/b', fetchSpy as unknown as typeof fetch);

    expect(result.faviconUrl).toBe('https://primer.si/favicon.ico');
  });

  it('po preusmeritvi se favicon razreši proti KONČNEMU naslovu, ne začetnemu', async () => {
    const fetchSpy = vi.fn(async (input: string | URL) => {
      if (String(input).includes('kratko.si')) return redirect('https://dolgo.si/stran');
      return html('<head><link rel="icon" href="/i.png"></head>');
    });

    const result = await readLinkMetadata('https://kratko.si/x', fetchSpy as unknown as typeof fetch);

    expect(result.faviconUrl).toBe('https://dolgo.si/i.png');
  });
});
