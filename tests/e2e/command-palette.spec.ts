import { expect, test } from '@playwright/test';

import { CLAIMED_VOUCHER, CLINIC } from './fixtures';
import { mockBackend } from './helpers';

test.beforeEach(async ({ page }) => {
  await mockBackend(page, {
    provider: CLINIC,
    voucherById: { 42: CLAIMED_VOUCHER('42') },
  });
});

test('opens with the keyboard and navigates to a matching clinic', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+k');

  const dialog = page.getByRole('dialog', { name: 'Go to' });
  const search = page.getByRole('combobox', {
    name: 'Search clinics, pages, or voucher number',
  });
  await expect(dialog).toBeVisible();
  await expect(search).toBeFocused();
  await search.fill('Ikeja');
  await expect(page.getByRole('option', { name: /Ikeja General Clinic/ })).toBeVisible();
  await search.press('ArrowDown');
  await search.press('Enter');

  await expect(page).toHaveURL(new RegExp(`/clinics/${CLINIC.address}$`));
  await expect(page.getByText('Fund care')).toBeVisible();
});

test('opens a voucher by number and closes on Escape', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Meta+k');

  const search = page.getByRole('combobox', {
    name: 'Search clinics, pages, or voucher number',
  });
  await search.fill('#42');
  await search.press('Enter');

  await expect(page).toHaveURL(/\/vouchers\/42$/);
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Go to' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Go to' })).not.toBeVisible();
});

test('does not show the admin destination without admin access', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', {
    name: 'Search clinics, pages, or voucher number',
  }).fill('Admin');

  await expect(page.getByRole('option', { name: /^Admin/ })).toHaveCount(0);
});