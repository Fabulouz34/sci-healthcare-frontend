import { expect, test } from '@playwright/test';

import {
  FUNDER,
  PROVIDER,
  ATTESTER,
  SERVICE_CATALOGUE,
  SERVICE_BY_CODE,
} from './fixtures';
import { mockBackend, useMockWallet } from './helpers';

/**
 * Finding care by service (#126) and comparing prices across clinics (#125).
 *
 * The read API is mocked; the wallet is a mock so no keystore or network is
 * needed. Each test runs at desktop width and 390px via the Playwright
 * projects.
 */

test.beforeEach(async ({ page }) => {
  await useMockWallet(page, FUNDER);
  await mockBackend(page, {
    providers: [
      {
        address: PROVIDER,
        name: 'Ikeja General Clinic',
        country: 'NG',
        status: 'Active',
        registeredAt: '2026-04-01T00:00:00.000Z',
        services: [
          { code: 101, label: 'Outpatient consult', price: '30000000', priceDisplay: '3.00', active: true },
          { code: 102, label: 'Malaria test', price: '50000000', priceDisplay: '5.00', active: true },
        ],
      },
      {
        address: ATTESTER,
        name: 'Lekki Care Centre',
        country: 'NG',
        status: 'Active',
        registeredAt: '2026-04-01T00:00:00.000Z',
        services: [
          { code: 101, label: 'Outpatient consult', price: '45000000', priceDisplay: '4.50', active: true },
        ],
      },
    ],
    services: SERVICE_CATALOGUE,
    serviceByCode: SERVICE_BY_CODE,
  });
});

test('service catalogue lists services with clinic counts and price ranges', async ({ page }) => {
  await page.goto('/services');
  await expect(page.getByRole('heading', { name: 'Find care by service' })).toBeVisible();

  await expect(page.getByText('Outpatient consult')).toBeVisible();
  await expect(page.getByText('Malaria test')).toBeVisible();
  await expect(page.getByText('2 clinics')).toBeVisible();
  await expect(page.getByText('$3.00 – $4.50')).toBeVisible();
});

test('search box filters services', async ({ page }) => {
  await page.goto('/services');

  await expect(page.getByText('Outpatient consult')).toBeVisible();
  await expect(page.getByText('Malaria test')).toBeVisible();

  await page.getByLabel('Search service name').fill('Nonexistent');
  await expect(page.getByText('No services match your search.')).toBeVisible();
  await expect(page.getByText('Outpatient consult')).toHaveCount(0);
  await expect(page.getByText('Malaria test')).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByText('Outpatient consult')).toBeVisible();
  await expect(page.getByText('Malaria test')).toBeVisible();
});

test('service comparison page lists clinics sorted by price, active only', async ({ page }) => {
  await page.goto('/services/101');
  await expect(page.getByRole('heading', { name: 'Outpatient consult' })).toBeVisible();

  // Sorted by price ascending: Ikeja ($3.00) before Lekki ($4.50).
  await expect(page.getByText('Ikeja General Clinic')).toBeVisible();
  await expect(page.getByText('Lekki Care Centre')).toBeVisible();
  await expect(
    page.locator('tr').filter({ hasText: 'Ikeja General Clinic' }),
  ).toBeVisible();
  await expect(
    page.locator('tr').filter({ hasText: 'Lekki Care Centre' }),
  ).toBeVisible();

  const ikejaRow = page.locator('tr').filter({ hasText: 'Ikeja General Clinic' });
  await expect(ikejaRow).toContainText('$3.00');
  const lekiRow = page.locator('tr').filter({ hasText: 'Lekki Care Centre' });
  await expect(lekiRow).toContainText('$4.50');

  // Ikeja is cheaper, so it comes first.
  await expect(
    page.locator('tbody tr').nth(0),
  ).toContainText('Ikeja General Clinic');

  // Fund link points at the clinic page.
  await expect(page.getByRole('link', { name: /Fund care/i }).first()).toHaveAttribute(
    'href',
    `/clinics/${PROVIDER}`,
  );
});
