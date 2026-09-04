import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Prava napaka: brez <base href="/"> je bila aplikacija dosegljiva samo prek navigacije
// znotraj nje. Neposreden naslov, osvežitev (F5), zaznamek ali globoka povezava iz obvestila
// so na vsaki DVOSEGMENTNI poti pokazali prazno stran.
//
// Angular vpiše naslove svežnjev relativno (src="main-XXXX.js"). Brez <base> jih brskalnik
// razreši glede na imenik naslova: "/dashboard" da "/main-XXXX.js" (deluje),
// "/time-tracking/schedule" pa "/time-tracking/main-XXXX.js" — strežnik na to vrne
// index.html (SPA fallback), torej HTML namesto JavaScripta, ki ga type="module" zavrne.
// Napake ni nikjer videti, stran je samo prazna.
//
// Prevajalnik tega ne vidi in noben drug test tega ne bi ujel, ker se v testih in ob
// navigaciji znotraj aplikacije nikoli ne naloži index.html z globlje poti.
// Pot iz `process.cwd()` (= apps/web, glej vitest.config.ts) in ne iz `import.meta.url` —
// v okolju jsdom je `import.meta.url` naslov http, ne file, in `fileURLToPath` na njem vrže.
const indexHtml = readFileSync(resolve(process.cwd(), 'src/index.html'), 'utf8');

/** Brez komentarjev — brskalnik jih ne bere, preverjanje vrstnega reda pa bi se sicer
 * spotaknilo ob primer naslova, zapisan v pojasnilu ob samem <base>. */
const markup = indexHtml.replace(/<!--[\s\S]*?-->/g, '');

describe('index.html', () => {
  it('ima <base href="/"> — brez njega so globlje poti prazna stran', () => {
    expect(markup).toMatch(/<base\s+href="\/"\s*\/?>/);
  });

  it('<base> stoji pred vsemi naslovi virov, sicer ne velja zanje', () => {
    const baseAt = markup.search(/<base\s/);
    const firstAsset = markup.search(/(src|href)="(?!\/|https?:|data:|#)/);
    expect(baseAt).toBeGreaterThan(-1);
    if (firstAsset > -1) expect(baseAt).toBeLessThan(firstAsset);
  });
});
