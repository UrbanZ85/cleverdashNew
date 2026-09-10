import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 012 — administrator dela v imenu drugega uporabnika.
//
// Testi berejo IZVORNO KODO in ne tečejo skozi TestBed, po istem dogovoru kot
// `auth-interceptor-exempt.spec.ts`: interceptor je funkcija z `inject()` v telesu, storitev pa
// se dotika `window.location`. Postavitev obojega bi bila desetkrat več kode kot preverjanje,
// ki dejansko šteje.

const SERVICE = resolve(process.cwd(), 'src/app/core/acting-user/acting-user.service.ts');
const INTERCEPTOR = resolve(process.cwd(), 'src/app/core/auth/auth.interceptor.ts');
const CURRENT_USER = resolve(process.cwd(), 'src/app/core/user/current-user.service.ts');

describe('acting-user.service — preklop uporabnika', () => {
  it('preklop uporabi location.reload(), NE location.assign', () => {
    // To je popravek prijavljene napake: z `location.assign('/')` se učinek preklopa ni
    // pokazal, dokler uporabnik ni sam osvežil strani — izbira je bila shranjena, zaslon pa je
    // še naprej kazal prejšnjega uporabnika. `reload()` je natanko tisto, kar naredi F5.
    const source = readFileSync(SERVICE, 'utf8');
    expect(source).toContain('window.location.reload()');
    expect(source).not.toContain('window.location.assign');
    expect(source).not.toContain('window.location.href =');
  });

  it('izbira se zapiše v shrambo PRED ponovnim nalaganjem', () => {
    // Obrnjen vrstni red bi pomenil, da ponovno naloženi dokument ne vidi nove vrednosti in se
    // preklop tiho ne zgodi.
    const source = readFileSync(SERVICE, 'utf8');
    const select = /select\(userId: string \| null\): void \{([\s\S]*?)\n {2}\}/.exec(source)?.[1] ?? '';
    expect(select).not.toBe('');
    expect(select.indexOf('writeStored(')).toBeLessThan(select.indexOf('window.location.reload()'));
  });

  it('dostop do localStorage je v try/catch — zasebno okno ne sme podreti aplikacije', () => {
    const source = readFileSync(SERVICE, 'utf8');
    expect(source).toMatch(/function readStored[\s\S]*?try \{[\s\S]*?\} catch \{/);
    expect(source).toMatch(/function writeStored[\s\S]*?try \{[\s\S]*?\} catch \{/);
  });

  it('`forget()` NE naloži strani znova — sicer bi samopopravek postal zanka', () => {
    // `forget()` se kliče iz odgovora `GET /auth/me` (`actingAs: null`). Ponovno nalaganje bi
    // sprožilo nov `/auth/me`, ta nov `forget()`, in tako naprej.
    const source = readFileSync(SERVICE, 'utf8');
    const forget = /forget\(\): void \{([\s\S]*?)\n {2}\}/.exec(source)?.[1] ?? '';
    expect(forget).not.toBe('');
    expect(forget).not.toContain('location');
  });
});

describe('auth.interceptor — glava X-Acting-User', () => {
  it('glava se pošlje na vsako NEizvzeto zahtevo', () => {
    // Brez seznama poti, na katerih je pomembna: seznam bi moral rasti z vsakim novim modulom
    // in bi bil ob prvi pozabljeni poti tiha napaka — zaslon bi kazal tuje podatke, en klic v
    // ozadju pa bi pisal v adminove lastne.
    const source = readFileSync(INTERCEPTOR, 'utf8');
    expect(source).toContain("headers['X-Acting-User']");
    expect(source).toMatch(/if \(!isExempt\) \{[\s\S]*?X-Acting-User/);
  });

  it('javne poti glave ne dobijo — `/share/` in `/drop/` sta brez računa', () => {
    const source = readFileSync(INTERCEPTOR, 'utf8');
    // Glava visi na istem `isExempt`, ki ščiti `Authorization`; ena razlaga izvzetosti, ne dve.
    const send = /const send = \(\) => \{([\s\S]*?)\n {2}\};/.exec(source)?.[1] ?? '';
    expect(send).not.toBe('');
    expect((send.match(/isExempt/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('current-user.service — samopopravek obvisele izbire', () => {
  it('ob `actingAs: null` iz strežnika izbiro pozabi', () => {
    // Strežnik na `/auth/me` namenoma ne vrne napake tudi ob neveljavni glavi
    // (platform/auth/acting-user.ts). Če odjemalec tega odgovora ne bi upošteval, bi obvisela
    // izbira (izbrisan uporabnik, odvzeta admin vloga) pomenila 403/404 na vsaki drugi poti in
    // aplikacijo brez izhoda.
    const source = readFileSync(CURRENT_USER, 'utf8');
    expect(source).toContain('if (!user.actingAs) this.actingUser.forget();');
  });

  it('`canActAsOthers` je vezan na obseg admin', () => {
    const source = readFileSync(CURRENT_USER, 'utf8');
    expect(source).toMatch(/canActAsOthers[\s\S]*?scopes\.includes\('admin'\)/);
  });
});
