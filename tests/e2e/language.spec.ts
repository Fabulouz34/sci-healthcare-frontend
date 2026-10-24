import { expect, test, type Page } from '@playwright/test';

import { blockAnalytics } from '../analytics-guard';
import { CLINIC, FUNDED_VOUCHER, PROVIDER } from './fixtures';
import { mockBackend, useMockWallet } from './helpers';

/**
 * Language switching persists (#153).
 *
 * The visitor picks a language in the footer switcher; every translated
 * string on the page follows. The choice has to outlive the page it was made
 * on: a client-side navigation keeps the provider mounted, and a full reload
 * rebuilds it from storage. If either lost the choice, the translations would
 * be useless to the people who need them most.
 */

const VOUCHER_ID = '42';

/**
 * The footer switcher. It sits in the footer on every route and at every
 * width, so one selector serves both projects.
 */
function languageSwitcher(page: Page) {
  return page.locator('#language-select');
}

/**
 * The header collapses into a menu button below `sm`, so the nav links are
 * only reachable once the menu is open. Open it when it is there.
 */
async function openNavMenu(page: Page): Promise<void> {
  const menu = page.getByRole('button', { name: 'Open menu' });
  if (await menu.isVisible()) await menu.click();
}

/**
 * React reports a hydration mismatch as an uncaught error (#418). The server
 * renders English, so the client has to start from English too and apply the
 * stored language afterwards — otherwise every page load of a translated
 * visitor starts with a broken hydration.
 */
function hydrationErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    if (/#4\d\d|hydrat|did not match/i.test(error.message)) {
      errors.push(error.message);
    }
  });
  return errors;
}

test.beforeEach(async ({ page }) => {
  await blockAnalytics(page);
  await useMockWallet(page, PROVIDER);
  await mockBackend(page, {
    provider: CLINIC,
    vouchers: [FUNDED_VOUCHER(VOUCHER_ID)],
    voucherById: { [VOUCHER_ID]: FUNDED_VOUCHER(VOUCHER_ID) },
  });
});

test.describe('Language switching persists (#153)', () => {
  test('keeps French across a navigation and a reload', async ({ page }) => {
    const errors = hydrationErrors(page);

    await page.goto(`/vouchers/${VOUCHER_ID}`);
    await expect(page.getByText(`Voucher #${VOUCHER_ID}`)).toBeVisible();

    await languageSwitcher(page).selectOption('fr');

    // The page is translated as soon as the choice is made.
    await expect(page.getByText(`Bon #${VOUCHER_ID}`)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Historique' })).toBeVisible();
    // The switcher's own label follows the language it is in.
    await expect(languageSwitcher(page)).toHaveAttribute(
      'aria-label',
      'Choisir la langue',
    );

    // A client-side navigation keeps the provider mounted.
    await openNavMenu(page);
    await page.getByRole('link', { name: 'Clinic desk' }).first().click();
    await expect(page).toHaveURL(/\/clinic$/);
    await expect(page.getByRole('heading', { name: 'Bureau clinique' })).toBeVisible();

    // A reload rebuilds the provider: the choice comes back from storage.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Bureau clinique' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

    // The server rendered English; the client has to start from there too.
    expect(errors).toEqual([]);
  });

  test('keeps Swahili across a reload', async ({ page }) => {
    await page.goto(`/vouchers/${VOUCHER_ID}`);
    await expect(page.getByText(`Voucher #${VOUCHER_ID}`)).toBeVisible();

    await languageSwitcher(page).selectOption('sw');

    await expect(page.getByText(`Vocha #${VOUCHER_ID}`)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Historia' })).toBeVisible();

    await page.reload();
    await expect(page.getByText(`Vocha #${VOUCHER_ID}`)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Historia' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'sw');
  });

  test('applies the stored language to a page opened directly', async ({ page }) => {
    const errors = hydrationErrors(page);

    await page.goto(`/vouchers/${VOUCHER_ID}`);
    await languageSwitcher(page).selectOption('fr');
    await expect(page.getByText(`Bon #${VOUCHER_ID}`)).toBeVisible();

    // A different URL, loaded from scratch rather than navigated to.
    await page.goto('/clinic');
    await expect(page.getByRole('heading', { name: 'Bureau clinique' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

    // The server rendered English; the client has to start from there too.
    expect(errors).toEqual([]);
  });

  test('leaves English as the default for a first-time visitor', async ({ page }) => {
    await page.goto(`/vouchers/${VOUCHER_ID}`);

    await expect(languageSwitcher(page)).toHaveValue('en');
    await expect(page.getByText(`Voucher #${VOUCHER_ID}`)).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});
