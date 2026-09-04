import { test, expect } from '@playwright/test';

// 004 TODO (specs/004-keycloak-sso-multiuser): ta test še predpostavlja staro prijavo z
// e-pošto/geslom na '/login', ki ne obstaja več (FR-017) — prijava je zdaj preusmeritev na
// Keycloaka (quickstart.md §3). Preden se ta datoteka spet zažene, jo je treba prenoviti na
// dejansko Keycloakovo prijavno stran (selektorji so odvisni od Keycloakove teme, zato niso
// uganjeni tu) — glej tasks.md T068. Test ostaja zapisan, a NEIZVEDEN (glej opombo spodaj).

// US1 (P1, MVP), T118: E2E tok ročnega pritiska na zaslonu "Danes" — prijava → /time-tracking
// → pritisk razpoložljive akcije → izid viden v nekaj sekundah (SC-006, FR-030, FR-050).
//
// Kot pri `happy-path.spec.ts` (glej 001 tasks.md T137): to je zapisan, a NEIZVEDEN test —
// zagon zahteva namestitev Playwrightovega brskalnika (`npx playwright install`), kar v tej
// razvojni seji namenoma ni bilo storjeno. Ko nekdo zažene E2E paket, mora biti izpolnjen
// dodaten predpogoj glede na 001: API mora teči s `CLOCK_PORTAL=fake` (quickstart.md §5) IN
// mora obstajati vsaj ena aktivna `TrackingLocation` z veljavno `RemoteSession` ter profil,
// ki se nanjo veže — to se namenoma NE seje iz tega testa, ker `POST` za ustvarjanje
// `RemoteSession` (prava piškotna vrednost) ne obstaja v javnem API-ju (glej router.ts —
// seja se nastavi enkrat, ročno, prek `app-time-tracking-settings` ali migracijskega
// skripta T124), enako kot se ARSO poverilnice v `happy-path.spec.ts` ne ustvarjajo v testu.
//
// `FakeClockPortal.setAvailableActions(...)` (glej apps/api/tests/unit/clock-state.spec.ts
// za semantiko stanj) mora biti pred zagonom nastavljen tako, da je na voljo vsaj ena akcija
// — v razvojnem okolju je za to najlažje pognati diagnostiko in preveriti seznam pred testom.
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'zacetno-geslo-12';
const NEW_PASSWORD = process.env.E2E_NEW_PASSWORD ?? 'e2e-novo-mocno-geslo-123';

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-pošta').fill(ADMIN_EMAIL);
  await page.getByLabel('Geslo', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /prijava/i }).click();

  // FR-014: prvi zagon zahteva zamenjavo gesla — pogojno, enako kot v happy-path.spec.ts.
  if (await page.getByLabel('Trenutno geslo').isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.getByLabel('Trenutno geslo').fill(ADMIN_PASSWORD);
    await page.getByLabel(/Novo geslo/).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: /shrani novo geslo/i }).click();
  }
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 });
}

test('ročni pritisk razpoložljive akcije na "Danes" da izid v nekaj sekundah (SC-006)', async ({ page }) => {
  await login(page);

  await page.goto('/time-tracking');
  await expect(page.getByRole('heading', { name: 'Danes' })).toBeVisible();

  // FR-020: trenutno stanje je vidno, ne le "nalaganje".
  await expect(page.getByText(/Trenutno stanje:/)).toBeVisible({ timeout: 10_000 });

  const actionButtons = page.locator('ion-list ion-item ion-button');
  const availableCount = await actionButtons.count();

  test.skip(
    availableCount === 0,
    'Ni seznanjene aktivne lokacije/seje/razpoložljive akcije za ta razvojni zagon — glej predpogoje zgoraj.',
  );

  const firstAction = actionButtons.first();
  const actionName = (await firstAction.textContent())?.trim() ?? '';
  expect(actionName.length).toBeGreaterThan(0);

  await firstAction.click();

  // SC-006: izid v nekaj sekundah, brez ročnega osveževanja.
  const result = page.locator('.action-result');
  await expect(result).toBeVisible({ timeout: 10_000 });
  await expect(result).toContainText(actionName);

  // Člen VI: izid je bodisi "že opravljeno", bodisi eksplicitno potrjen uspeh, bodisi
  // eksplicitno nepotrjen neuspeh — nikoli tih uspeh brez besedila o stanju/napaki.
  const text = (await result.textContent()) ?? '';
  const isKnownOutcome =
    text.includes('je bilo že opravljeno') || text.includes('uspešno izvedeno in potrjeno') || text.includes('ni bilo potrjeno');
  expect(isKnownOutcome, `Nepričakovano besedilo izida: "${text}"`).toBe(true);
});
