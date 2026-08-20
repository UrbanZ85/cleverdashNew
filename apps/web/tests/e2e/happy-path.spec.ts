import { test, expect } from '@playwright/test';

// Osnovni E2E tok (plan.md, Technical Context: Testing): prijava → dashboard → viden
// premikajoč se radar. Teče proti `npm run dev:api` + `npm run dev:web` (glej
// quickstart.md §5) ali proti produkcijskemu buildu, streženemu lokalno.
//
// Poverilnice pridejo iz okolja (ADMIN_EMAIL/ADMIN_INITIAL_PASSWORD v .env, enaki
// vrednosti tudi tukaj) — nikoli trdo zapisane v testu. Ob prvem zagonu sistem zahteva
// zamenjavo gesla (FR-014); ta tok to obravnava kot del "srečne poti", ne kot posebnost.
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'zacetno-geslo-12';
const NEW_PASSWORD = process.env.E2E_NEW_PASSWORD ?? 'e2e-novo-mocno-geslo-123';

test('prijava → (menjava gesla, če je zahtevana) → dashboard → viden radar', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('E-pošta').fill(ADMIN_EMAIL);
  await page.getByLabel('Geslo', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /prijava/i }).click();

  // FR-014: prvi zagon zahteva zamenjavo gesla — ta korak je pogojen, ker se po prvi
  // uspešni zamenjavi v naslednjih zagonih preskoči.
  if (await page.getByLabel('Trenutno geslo').isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.getByLabel('Trenutno geslo').fill(ADMIN_PASSWORD);
    await page.getByLabel(/Novo geslo/).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: /shrani novo geslo/i }).click();
  }

  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 });

  // FR-021: radarska slika se prikaže in je animirana (image/gif). Preverimo prisotnost
  // slike s pravim `src` (object URL iz blob-a, glej radar-tile.component.ts) — dejansko
  // gibanje GIF-a znotraj slike ni nekaj, kar Playwright smiselno preverja.
  const radarImg = page.getByAltText('Radarska slika padavin ARSO');
  await expect(radarImg).toBeVisible({ timeout: 10_000 });
  await expect(radarImg).toHaveAttribute('src', /^blob:/);

  // FR-023, FR-027: vremenska ploščica in navedba vira.
  await expect(page.getByText('Vir: ARSO').first()).toBeVisible();
});
