import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 013: javna stran deljenega recepta (`/r/:token`) je TRETJA pot v tej aplikaciji, ki jo odpre
// človek brez računa — ob `/d/:token` (prevzem datoteke) in `/u/:token` (oddaja) iz 009.
//
// Ta datoteka je napisana po vzoru `auth-interceptor-exempt.spec.ts` in pokriva isti dve
// varovalki, ker sta obe takšni, da se ju pokvari tiho: aplikacija se prevede, testi modula
// tečejo, in šele obiskovalec brez računa vidi prijavo ali prazno stran.
//
// Testa bereta IZVORNO KODO in ne tečeta skozi TestBed — iz istega razloga kot pri 009:
// interceptor je funkcija z `inject()` v telesu, postavitev vbrizgovalnega konteksta zanj pa bi
// bila desetkrat več kode kot preverjanje, ki dejansko šteje.

const INTERCEPTOR = resolve(process.cwd(), 'src/app/core/auth/auth.interceptor.ts');
const ROUTES = resolve(process.cwd(), 'src/app/app.routes.ts');

describe('auth.interceptor — javna pot receptov je izvzeta (013)', () => {
  it('`/api/v1/shared-recipes/` je na seznamu izvzetih poti', () => {
    // Brez tega bi POTEKEL žeton v brskalniku vratar zavrnil s 401, še preden bi zahteva dosegla
    // usmerjevalnik — javna stran bi se podrla zaradi seje, s katero nima nobene zveze. To je
    // natanko razlog, zakaj sta tam že `/share/` in `/drop/`.
    const source = readFileSync(INTERCEPTOR, 'utf8');
    const list = /const AUTH_EXEMPT = \[([^\]]*)\]/s.exec(source)?.[1] ?? '';
    expect(list).toContain('/api/v1/shared-recipes/');
  });

  it('predpona je DOVOLJ ozka, da ne izvzame prijavljenih poti modula', () => {
    // `/recipes/` bi bilo videti kot enako dobra izjema in bi tiho razorožilo CEL modul: vsaka
    // prijavljena zahteva bi šla brez glave `Authorization` in vrnila 401.
    const source = readFileSync(INTERCEPTOR, 'utf8');
    const list = /const AUTH_EXEMPT = \[([^\]]*)\]/s.exec(source)?.[1] ?? '';
    expect(list).not.toMatch(/'\/api\/v1\/recipes\/'/);
  });
});

describe('app.routes — javna stran recepta je zunaj varovanj (013)', () => {
  it('pot `r/:token` nima ne authGuard ne tabGuard', () => {
    // `authGuard` bi obiskovalca poslal na Keycloak, `tabGuard` pa preverja ujemanje z registrom
    // zavihkov, kjer te poti ni in ne sme biti — javna stran ne sme biti odvisna od tega, ali ima
    // lastnik zavihek vklopljen.
    const source = readFileSync(ROUTES, 'utf8');
    const block = /path: 'r\/:token',([\s\S]*?)\},/.exec(source)?.[1] ?? '';
    expect(block).not.toBe('');
    expect(block).not.toContain('authGuard');
    expect(block).not.toContain('tabGuard');
  });

  it('stoji PRED lovilcem `**`, sicer bi jo prestregla preusmeritev na nadzorno ploščo', () => {
    const source = readFileSync(ROUTES, 'utf8');
    expect(source.indexOf("path: 'r/:token'")).toBeLessThan(source.indexOf("path: '**'"));
  });

  it('je LOČENA od obeh poti modula 009', () => {
    // Trije različni zasloni s tremi različnimi posledicami. Skupna pot bi pomenila, da iz naslova
    // v pogovoru ali v dnevniku ni razvidno, za kaj je šlo.
    const source = readFileSync(ROUTES, 'utf8');
    expect(source).toContain("path: 'd/:token'");
    expect(source).toContain("path: 'u/:token'");
    expect(source).toContain("path: 'r/:token'");
  });

  it('zavihek `recipes` pa OBE varovanji ima', () => {
    const source = readFileSync(ROUTES, 'utf8');
    const block = /path: 'recipes',([\s\S]*?)\},/.exec(source)?.[1] ?? '';
    expect(block).toContain('authGuard');
    expect(block).toContain('tabGuard');
  });

  it('urejevalnik ima authGuard, tabGuard pa NE — je podstran zavihka', () => {
    // `tabGuard` preverja TOČNO ujemanje poti z registrom; podstran tam ne obstaja in bi bila z
    // njim nedosegljiva. Enak vzorec kot `notes/:noteId` in `cameras/:cameraId`.
    const source = readFileSync(ROUTES, 'utf8');
    const block = /path: 'recipes\/:recipeId',([\s\S]*?)\},/.exec(source)?.[1] ?? '';
    expect(block).toContain('authGuard');
    expect(block).not.toContain('tabGuard');
  });
});
