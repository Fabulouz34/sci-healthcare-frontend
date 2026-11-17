import { expect, test } from '@playwright/test';

import { blockAnalytics } from '../analytics-guard';
import { CLINIC_ADDRESS } from '../visual/fixtures';
import { mockBackend } from './helpers';

const SECOND_CLINIC_ADDRESS = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';

test.beforeEach(async ({ page }) => {
  await blockAnalytics(page);
  await mockBackend(page, {
    providers: [
      {
        address: CLINIC_ADDRESS,
        name: 'Alpha Clinic',
        country: 'Nigeria',
        status: 'Active',
        services: [{ code: 1, label: 'General Consult', price: '25000000', active: true }],
      },
      {
        address: SECOND_CLINIC_ADDRESS,
        name: 'Beta Clinic',
        country: 'Nigeria',
        status: 'Active',
        services: [{ code: 2, label: 'Specialist Consult', price: '50000000', active: true }],
      },
    ],
  });
});

test('favourite clinic persists in localStorage and shows first on home page', async ({ page }) => {
  // Initially, clinics appear in default order: Alpha Clinic, then Beta Clinic
  await page.goto('/');
  await expect(page.getByText('Verified clinics')).toBeVisible();
  const clinicCards = page.locator('#directory a[href^="/clinics/"] h3');
  await expect(clinicCards.nth(0)).toHaveText('Alpha Clinic');
  await expect(clinicCards.nth(1)).toHaveText('Beta Clinic');

  // Go to Beta Clinic's detail page and favourite it
  await page.goto(`/clinics/${SECOND_CLINIC_ADDRESS}`);
  const starButton = page.getByRole('button', { name: /Add Beta Clinic to favourites/i });
  await expect(starButton).toBeVisible();
  await expect(starButton).toHaveAttribute('aria-pressed', 'false');

  await starButton.click();
  const removeStarButton = page.getByRole('button', { name: /Remove Beta Clinic from favourites/i });
  await expect(removeStarButton).toBeVisible();
  await expect(removeStarButton).toHaveAttribute('aria-pressed', 'true');

  // Return to home page: favourite Beta Clinic must now appear first
  await page.goto('/');
  await expect(clinicCards.nth(0)).toHaveText('Beta Clinic');
  await expect(clinicCards.nth(1)).toHaveText('Alpha Clinic');

  // Unfavourite Beta Clinic
  await page.goto(`/clinics/${SECOND_CLINIC_ADDRESS}`);
  const removeButton = page.getByRole('button', { name: /Remove Beta Clinic from favourites/i });
  await removeButton.click();
  const addButton = page.getByRole('button', { name: /Add Beta Clinic to favourites/i });
  await expect(addButton).toBeVisible();
  await expect(addButton).toHaveAttribute('aria-pressed', 'false');

  // Return to home page: order restored
  await page.goto('/');
  await expect(clinicCards.nth(0)).toHaveText('Alpha Clinic');
  await expect(clinicCards.nth(1)).toHaveText('Beta Clinic');
});
