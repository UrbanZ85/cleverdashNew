import { test, expect } from '@playwright/test';

// SC-001: od odprtja aplikacije do vidnega vremena in premikajoče se radarske slike mine
// manj kot 3 sekunde pri običajni povezavi. Meri se od navigacije do trenutka, ko sta OBE
// ploščici vidni — ne od DOMContentLoaded, ker uporabnika zanima, kdaj VIDI podatek, ne
// kdaj je HTML prispel.
//
// Opomba: za verodostojno meritev SC-001 naj to teče proti produkcijskemu buildu
// (`npm run build:web` + statični strežnik), ne proti razvojnemu strežniku, ki je
// namenoma neoptimiziran in počasnejši.
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'zacetno-geslo-12';

test('vreme in radar sta vidna v manj kot 3 s po prijavi (SC-001)', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-pošta').fill(ADMIN_EMAIL);
  await page.getByLabel('Geslo', { exact: true }).fill(ADMIN_PASSWORD);

  const start = Date.now();
  await page.getByRole('button', { name: /prijava/i }).click();

  // Če je zahtevana menjava gesla, SC-001 ta test ne meri (izven njegovega obsega — to je
  // enkraten dogodek ob prvem zagonu, ne vsakodnevna izkušnja, ki jo SC-001 opisuje).
  if (await page.getByLabel('Trenutno geslo').isVisible({ timeout: 1000 }).catch(() => false)) {
    test.skip(true, 'Prvi zagon zahteva menjavo gesla — SC-001 meri naslednje prijave.');
  }

  await expect(page.getByAltText('Radarska slika padavin ARSO')).toBeVisible();
  await expect(page.getByText('Vir: ARSO').first()).toBeVisible();
  const elapsedMs = Date.now() - start;

  expect(elapsedMs).toBeLessThan(3000);
});
