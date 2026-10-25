import { expect, test } from '@playwright/test';

import { CLINIC } from './fixtures';
import { mockBackend } from './helpers';

test.beforeEach(async ({ page }) => {
  await mockBackend(page, { provider: CLINIC });
});

test('patient QR backup still renders when its encoder is loaded on demand', async ({ page }) => {
  await page.goto('/my');
  await page.getByLabel('Patient reference', { exact: true }).fill('LOCAL-TEST-PATIENT');
  await page.getByLabel('Secret key', { exact: true }).fill('k'.repeat(32));
  await page.getByRole('button', { name: 'Back up key', exact: true }).click();
  await page.getByRole('checkbox', { name: /I understand that this secret/ }).check();
  await page.getByRole('button', { name: 'Show QR code', exact: true }).click();
  const qr = page.getByAltText('Patient backup QR code');
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute('src', /^data:image\/png;base64,/);
});

test('scanner discovers cameras only after explicit opt-in and handles no camera', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as { cameraLookups: number };
    state.cameraLookups = 0;
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
      configurable: true,
      value: async () => {
        state.cameraLookups += 1;
        return [];
      },
    });
  });
  await page.goto('/my');
  await expect(page.getByRole('heading', { name: 'Care history', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { cameraLookups: number }).cameraLookups)).toBe(0);
  await page.getByRole('button', { name: 'Scan QR', exact: true }).click();
  await expect(page.getByText('No camera is available on this device.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { cameraLookups: number }).cameraLookups)).toBe(1);
});
