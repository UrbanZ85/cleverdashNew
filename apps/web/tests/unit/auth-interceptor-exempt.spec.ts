import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// research.md §2: javna stran `/d/:token` kliče `/api/v1/share/*`. Te zahteve NE smejo nositi
// glave `Authorization`.
//
// Razlog ni estetski: če ima brskalnik POTEKEL žeton, ga vratar na strežniku zavrne s 401, še
// preden zahteva doseže usmerjevalnik — javna stran bi se podrla zaradi seje, s katero nima
// nobene zveze. Prejemnik, ki ni in ne bo uporabnik, bi videl napako namesto datoteke.
//
// Test bere IZVORNO KODO in ne teče skozi TestBed: interceptor je funkcija z `inject()` v
// telesu (glej opombo v auth.interceptor.ts) in postavitev vbrizgovalnega konteksta zanj bi
// bila desetkrat več kode kot preverjanje, ki dejansko šteje — da je predpona na seznamu.

const INTERCEPTOR = resolve(process.cwd(), 'src/app/core/auth/auth.interceptor.ts');
const ROUTES = resolve(process.cwd(), 'src/app/app.routes.ts');

describe('auth.interceptor — izjema za javne poti (009)', () => {
  it('`/api/v1/share/` je na seznamu izvzetih poti', () => {
    const source = readFileSync(INTERCEPTOR, 'utf8');
    const list = /const AUTH_EXEMPT = \[([^\]]*)\]/s.exec(source)?.[1] ?? '';
    expect(list).toContain('/api/v1/share/');
    // Obstoječi izjemi morata ostati — brez njiju bi neuspela obnova žetona sprožila samo sebe.
    expect(list).toContain('/auth/refresh');
    expect(list).toContain('/auth/login');
  });

  it('izjema velja tudi za obravnavo 401 — javna pot ne sme sprožiti odjave', () => {
    // 401 z javne poti pomeni "manjka dovolilnica", ne "seja je potekla".
    const source = readFileSync(INTERCEPTOR, 'utf8');
    expect(source).toMatch(/if \(isExempt \|\| !\(err instanceof HttpErrorResponse\)/);
  });
});

describe('app.routes — javna stran je zunaj varovanj (009)', () => {
  it('pot `d/:token` nima ne authGuard ne tabGuard', () => {
    const source = readFileSync(ROUTES, 'utf8');
    const block = /path: 'd\/:token',([\s\S]*?)\},/.exec(source)?.[1] ?? '';
    expect(block).not.toBe('');
    expect(block).not.toContain('authGuard');
    expect(block).not.toContain('tabGuard');
  });

  it('stoji PRED lovilcem `**`, sicer bi jo prestregla preusmeritev na nadzorno ploščo', () => {
    const source = readFileSync(ROUTES, 'utf8');
    expect(source.indexOf("path: 'd/:token'")).toBeLessThan(source.indexOf("path: '**'"));
  });

  it('zavihek `file-sharing` pa OBE varovanji ima', () => {
    const source = readFileSync(ROUTES, 'utf8');
    const block = /path: 'file-sharing',([\s\S]*?)\},/.exec(source)?.[1] ?? '';
    expect(block).toContain('authGuard');
    expect(block).toContain('tabGuard');
  });
});
