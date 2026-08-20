import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// research.md §6, člen I: meja med moduli se uveljavlja z lint pravilom, ne z dogovorom.
// `lintText` z navideznim `filePath` preveri pravilo, ne da bi bilo treba ustvariti pravo
// kršitev v izvorni kodi (kar bi samo sebe zlomilo pri naslednjem `npm run lint`).

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

async function lint(virtualPath: string, code: string) {
  const eslint = new ESLint({ cwd: repoRoot });
  const [result] = await eslint.lintText(code, { filePath: virtualPath });
  return result?.messages ?? [];
}

describe('meja med moduli (eslint.config.js)', () => {
  it('zavrne uvoz iz modula "dashboard" znotraj modula "auth" kot NAPAKO', async () => {
    const messages = await lint(
      'apps/api/src/modules/auth/fixture.ts',
      "import { dashboardRouter } from '../dashboard/router.js';\nexport const x = dashboardRouter;\n",
    );
    const violation = messages.find((m) => m.ruleId === 'cleverdash/module-boundary');
    expect(violation).toBeTruthy();
    expect(violation?.severity).toBe(2); // napaka, ne opozorilo
  });

  it('zavrne uvoz iz modula "auth" znotraj modula "settings"', async () => {
    const messages = await lint(
      'apps/api/src/modules/settings/fixture.ts',
      "import { authRouter } from '../auth/router.js';\nexport const x = authRouter;\n",
    );
    expect(messages.some((m) => m.ruleId === 'cleverdash/module-boundary')).toBe(true);
  });

  it('dovoli uvoz iz platform/ znotraj modula "auth"', async () => {
    const messages = await lint(
      'apps/api/src/modules/auth/fixture-ok.ts',
      "import { requireScopes } from '../../platform/auth/scopes.js';\nexport const x = requireScopes;\n",
    );
    expect(messages.some((m) => m.ruleId === 'cleverdash/module-boundary')).toBe(false);
  });

  it('dovoli uvoz znotraj ISTEGA modula (sibling datoteka)', async () => {
    const messages = await lint(
      'apps/api/src/modules/auth/fixture-sibling.ts',
      "import { hashPassword } from './services/password.service.js';\nexport const x = hashPassword;\n",
    );
    expect(messages.some((m) => m.ruleId === 'cleverdash/module-boundary')).toBe(false);
  });

  it('isto pravilo velja na strani odjemalca za features/ (dashboard proti settings)', async () => {
    const messages = await lint(
      'apps/web/src/app/features/dashboard/fixture.ts',
      "import { x } from '../settings/anything.js';\nexport const y = x;\n",
    );
    expect(messages.some((m) => m.ruleId === 'cleverdash/module-boundary')).toBe(true);
  });
});
