import { expect, test } from '@playwright/test';

import { FUNDER, LOCATED_CLINIC, UNLOCATED_CLINIC } from './fixtures';
import { mockBackend, useMockWallet } from './helpers';

/**
 * Home page map view.
 *
 * Only clinics with published coordinates are mapped; the rest stay in a
 * list below the map so no clinic disappears from the directory. Map tiles
 * are blocked — the assertions are about the directory split and the
 * Leaflet surface, not the imagery.
 */

test.beforeEach(async ({ page }) => {
  await useMockWallet(page, FUNDER);
  await mockBackend(page, { providers: [LOCATED_CLINIC, UNLOCATED_CLINIC] });
  await page.route('**tile.openstreetmap.org/**', (route) => route.abort());
});

test('maps clinics with coordinates and lists the rest below', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Verified clinics')).toBeVisible();

  // List view is the default and shows every clinic.
  await expect(page.getByText('Ikeja General Clinic')).toBeVisible();
  await expect(page.getByText('Lekki Care Centre')).toBeVisible();

  await page.getByRole('button', { name: 'Map' }).click();

  // The map renders for the one clinic with coordinates, with attribution.
  await expect(page.getByRole('img', { name: 'Map of 1 clinic with published locations' })).toBeVisible();
  await expect(page.getByText('OpenStreetMap')).toBeVisible();

  // The clinic without a location is listed below, not dropped.
  await expect(page.getByText('Clinics without a published location')).toBeVisible();
  await expect(page.getByText('Lekki Care Centre')).toBeVisible();
  // The located clinic lives on the map only.
  await expect(page.getByText('Ikeja General Clinic')).toHaveCount(0);
});

test('a map that fails to load leaves the rest of the directory up (#169)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Lekki Care Centre')).toBeVisible();

  // The map's code is fetched only when the view opens; failing that chunk
  // is a map crash the user can actually meet on a flaky connection.
  await page.route('**/_next/static/chunks/**', (route) => route.abort());
  await page.getByRole('button', { name: 'Map' }).click();

  await expect(page.getByText('The map could not be shown')).toBeVisible();
  await expect(page.getByText('Clinics without a published location')).toBeVisible();
  await expect(page.getByText('Lekki Care Centre')).toBeVisible();
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
});
