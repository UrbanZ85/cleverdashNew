import { test, expect } from '@playwright/test';

// Člen II ustave: enotni izvor, brez CORS. Ta test opazuje VSE mrežne zahteve med celotnim
// tokom prijave in nalaganja dashboarda ter preveri dve stvari, ki ju je pri ročnem
// pregledu omrežnega zavihka najlažje spregledati enkrat, tu pa se preverita vsakič:
// (1) nobena zahteva ne gre na drugo izhodišče, (2) nobena ni predhodna `OPTIONS`
// zahteva (CORS preflight), ki bi razkrila, da je nekje vendarle konfiguriran CORS.
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'zacetno-geslo-12';

test('nobena zahteva ne zapusti izvora aplikacije, nobene OPTIONS predhodne zahteve', async ({ page, baseURL }) => {
  const appOrigin = new URL(baseURL ?? 'http://localhost:4200').origin;
  const foreignRequests: string[] = [];
  const optionsRequests: string[] = [];

  page.on('request', (req) => {
    const url = req.url();
    if (!url.startsWith(appOrigin) && url.startsWith('http')) {
      foreignRequests.push(`${req.method()} ${url}`);
    }
    if (req.method() === 'OPTIONS') {
      optionsRequests.push(url);
    }
  });

  await page.goto('/login');
  await page.getByLabel('E-pošta').fill(ADMIN_EMAIL);
  await page.getByLabel('Geslo', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /prijava/i }).click();

  if (await page.getByLabel('Trenutno geslo').isVisible({ timeout: 3000 }).catch(() => false)) {
    // Ne izpolnjuje menjave — za ta test zadošča, da smo prišli do avtenticirane seje;
    // opazovanje omrežja se konča tukaj, ker je dashboard dosegljiv šele po menjavi.
  } else {
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 });
    await page.waitForLoadState('networkidle');
  }

  expect(foreignRequests, `Zahteve na drug izvor: ${foreignRequests.join(', ')}`).toEqual([]);
  expect(optionsRequests, `OPTIONS predhodne zahteve: ${optionsRequests.join(', ')}`).toEqual([]);
});
