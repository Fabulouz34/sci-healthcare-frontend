import { expect, test } from '@playwright/test';

import { FUNDER } from './fixtures';
import { mockBackend, useMockWallet } from './helpers';

/**
 * Activity by country on the stats page (#123).
 *
 * The read API is mocked; the wallet is a mock. Each test runs at desktop
 * width and 390px via the Playwright projects.
 */

test.beforeEach(async ({ page }) => {
  await useMockWallet(page, FUNDER);
  await mockBackend(page, {
    vouchers: [
      {
        id: '1',
        funder: FUNDER,
        provider: { address: 'CLINIC-A', name: 'Clinic A', country: 'NG' },
        serviceCode: 101,
        amount: '30000000',
        status: 'Funded',
      },
      {
        id: '2',
        funder: FUNDER,
        provider: { address: 'CLINIC-B', name: 'Clinic B', country: 'KE' },
        serviceCode: 102,
        amount: '50000000',
        status: 'Settled',
      },
      {
        id: '3',
        funder: FUNDER,
        provider: { address: 'CLINIC-C', name: 'Clinic C', country: 'NG' },
        serviceCode: 101,
        amount: '30000000',
        status: 'Settled',
      },
    ],
  });
});

test('renders voucher activity by country with data', async ({ page }) => {
  await page.goto('/stats');
  await expect(page.getByRole('heading', { name: 'Protocol statistics' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Voucher activity by country' })).toBeVisible();

  // NG: 1 funded (3.00) + 1 settled (3.00); KE: 1 settled (5.00).
  await expect(page.getByText('NG', { exact: true })).toBeVisible();
  await expect(page.getByText('KE', { exact: true })).toBeVisible();

  // NG row: 1 funded, 1 settled, $3.00
  await expect(page.locator('tr').filter({ hasText: 'NG' })).toContainText('1 funded');
  await expect(page.locator('tr').filter({ hasText: 'NG' })).toContainText('1 settled');
  await expect(page.locator('tr').filter({ hasText: 'NG' })).toContainText('$3.00');

  // KE row: 1 settled, $5.00
  await expect(page.locator('tr').filter({ hasText: 'KE' })).toContainText('1 settled');
  await expect(page.locator('tr').filter({ hasText: 'KE' })).toContainText('$5.00');
});

test('renders empty state when there is no voucher activity', async ({ page }) => {
  await useMockWallet(page, FUNDER);
  await mockBackend(page, { vouchers: [] });
  await page.goto('/stats');

  await expect(page.getByRole('heading', { name: 'Voucher activity by country' })).toBeVisible();
  await expect(
    page.getByText('No voucher activity recorded yet.'),
  ).toBeVisible();
});
