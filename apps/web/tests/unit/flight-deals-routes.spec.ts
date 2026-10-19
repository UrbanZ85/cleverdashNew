import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 015: poti zavihka Leti — koren je tab-gated, podstrani samo authGuard, administracija je podpot in
// ne zavihek (specs/015-flight-deals/plan.md). Test bere IZVORNO KODO (vzorec recipes-public-route.spec.ts).

const ROUTES = resolve(process.cwd(), 'src/app/app.routes.ts');
const source = readFileSync(ROUTES, 'utf8');

function block(path: string): string {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`path: '${escaped}',([\\s\\S]*?)\\},`).exec(source)?.[1] ?? '';
}

describe('app.routes — Leti (015)', () => {
  it('koren `flight-deals` ima authGuard IN tabGuard', () => {
    const b = block('flight-deals');
    expect(b).not.toBe('');
    expect(b).toContain('authGuard');
    expect(b).toContain('tabGuard');
  });

  it.each(['flight-deals/searches', 'flight-deals/searches/:searchId', 'flight-deals/offers/:offerId', 'flight-deals/shared', 'flight-deals/admin'])(
    'podstran %s ima authGuard, tabGuard pa NE',
    (path) => {
      const b = block(path);
      expect(b, path).not.toBe('');
      expect(b).toContain('authGuard');
      expect(b).not.toContain('tabGuard');
    },
  );

  it('`searches/new` ni ločena pot — ujame se kot :searchId', () => {
    expect(source).not.toContain("path: 'flight-deals/searches/new'");
  });

  it('statična `flight-deals/searches` stoji PRED parametrično', () => {
    expect(source.indexOf("path: 'flight-deals/searches',")).toBeLessThan(source.indexOf("path: 'flight-deals/searches/:searchId'"));
  });

  it('vse poti modula stojijo pred lovilcem `**`', () => {
    expect(source.indexOf("path: 'flight-deals/admin'")).toBeLessThan(source.indexOf("path: '**'"));
  });

  it('administracija nima lastnega varuha na odjemalcu — pravi varuh je strežnik', () => {
    expect(block('flight-deals/admin')).not.toMatch(/adminGuard|roleGuard/);
  });
});
