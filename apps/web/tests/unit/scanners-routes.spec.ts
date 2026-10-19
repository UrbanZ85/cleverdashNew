import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 016: poti jedra skenerjev — koren je tab-gated, podstrani samo authGuard, administracija je podpot
// brez varuha na odjemalcu (specs/016-scanner-engine/plan.md). Test bere IZVORNO KODO (vzorec
// flight-deals-routes.spec.ts).

const ROUTES = resolve(process.cwd(), 'src/app/app.routes.ts');
const source = readFileSync(ROUTES, 'utf8');

function block(path: string): string {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`path: '${escaped}',([\\s\\S]*?)\\},`).exec(source)?.[1] ?? '';
}

describe('app.routes — Skenerji (016)', () => {
  it('koren `scanners` ima authGuard IN tabGuard', () => {
    const b = block('scanners');
    expect(b).not.toBe('');
    expect(b).toContain('authGuard');
    expect(b).toContain('tabGuard');
  });

  it('podstran scanners/admin ima authGuard, tabGuard pa NE, in nima varuha vloge na odjemalcu', () => {
    const b = block('scanners/admin');
    expect(b).not.toBe('');
    expect(b).toContain('authGuard');
    expect(b).not.toContain('tabGuard');
    expect(b).not.toMatch(/adminGuard|roleGuard/);
  });

  it.each(['scanners/new', 'scanners/:scannerId/edit', 'scanners/:scannerId'])('podstran %s ima authGuard, tabGuard pa NE', (path) => {
    const b = block(path);
    expect(b, path).not.toBe('');
    expect(b).toContain('authGuard');
    expect(b).not.toContain('tabGuard');
  });

  it('statična `scanners/new` in `scanners/admin` stojita PRED parametrično', () => {
    expect(source.indexOf("path: 'scanners/new'")).toBeLessThan(source.indexOf("path: 'scanners/:scannerId',"));
    expect(source.indexOf("path: 'scanners/admin'")).toBeLessThan(source.indexOf("path: 'scanners/:scannerId',"));
  });

  it('stara pot flight-deals/admin preusmeri na administracijo skenerjev s tipom flights', () => {
    expect(source).toMatch(/path: 'flight-deals\/admin', redirectTo: '\/scanners\/admin\?type=flights'/);
  });

  it('vse poti skenerjev stojijo pred lovilcem `**`', () => {
    expect(source.indexOf("path: 'scanners/admin'")).toBeLessThan(source.indexOf("path: '**'"));
  });
});
