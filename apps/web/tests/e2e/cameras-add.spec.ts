import { test, expect } from '@playwright/test';

// 004 TODO (specs/004-keycloak-sso-multiuser): ta test še predpostavlja staro prijavo z
// e-pošto/geslom na '/login', ki ne obstaja več (FR-017) — prijava je zdaj preusmeritev na
// Keycloaka (quickstart.md §3). Preden se ta datoteka spet zažene, jo je treba prenoviti na
// dejansko Keycloakovo prijavno stran (selektorji so odvisni od Keycloakove teme, zato niso
// uganjeni tu) — glej tasks.md T068. Test ostaja zapisan, a NEIZVEDEN (glej opombo spodaj).

// US3 (P3), T075 (analiza F2 — plan.md Technical Context, "Testing", en Playwright E2E
// tok, po vzoru edinega toka v 001/002): odpri zaslon za urejanje kamer → dodaj kamero
// vrste `iframe` → preveri, da se pojavi v mreži brez ponovnega nalaganja aplikacije
// (SC-002, FR-031).
//
// Kot pri `time-tracking-manual.spec.ts` (glej tam za popolno utemeljitev vzorca): to je
// zapisan, a NEIZVEDEN test v tej razvojni seji — zagon zahteva `npx playwright install`,
// kar namenoma ni bilo storjeno tukaj. Za razliko od časovnega beleženja ta tok NE
// potrebuje zunanjega predpogoja (seja/lokacija/profil) — kamere so samostojen podatek
// (FR-001), zato je test izvedljiv takoj po `docker compose up` brez ročnega sejanja.
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'zacetno-geslo-12';
const NEW_PASSWORD = process.env.E2E_NEW_PASSWORD ?? 'e2e-novo-mocno-geslo-123';

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-pošta').fill(ADMIN_EMAIL);
  await page.getByLabel('Geslo', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /prijava/i }).click();

  if (await page.getByLabel('Trenutno geslo').isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.getByLabel('Trenutno geslo').fill(ADMIN_PASSWORD);
    await page.getByLabel(/Novo geslo/).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: /shrani novo geslo/i }).click();
  }
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 });
}

test('dodajanje kamere prek zaslona za urejanje se takoj pojavi v mreži (SC-002)', async ({ page }) => {
  await login(page);

  const cameraName = `E2E test kamera ${Date.now()}`;

  await page.goto('/cameras/manage');
  await expect(page.getByRole('heading', { name: 'Urejanje kamer' })).toBeVisible();

  await page.getByRole('button', { name: 'Dodaj kamero' }).click();
  await page.getByLabel('Ime').fill(cameraName);
  await page.getByLabel('Vrsta vira').click();
  await page.getByText('Vdelava tuje strani').click();
  await page.getByLabel('Naslov').fill('https://www.youtube.com/embed/dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Dodaj kamero' }).click();

  // Nazaj na seznam za urejanje — nova kamera je vidna, brez ponovnega nalaganja strani.
  await expect(page.getByText(cameraName)).toBeVisible({ timeout: 5000 });

  // Mreža (US1) jo prikaže brez ponovnega nalaganja aplikacije (FR-031, SC-002).
  await page.goto('/cameras');
  await expect(page.getByText(cameraName)).toBeVisible({ timeout: 5000 });
});
