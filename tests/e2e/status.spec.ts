import { expect, test } from '@playwright/test';

import { FUNDER } from './fixtures';
import { mockBackend, useMockWallet } from './helpers';

/**
 * Status page (#168): API readiness, indexer lag, network and versions,
 * reached from the footer. The readiness answer is mocked in each state a
 * user can meet: healthy, degraded (503 with a body) and unreachable.
 */

test.beforeEach(async ({ page }) => {
  await useMockWallet(page, FUNDER);
});

test('is linked from the footer and shows a healthy API', async ({ page }) => {
  await mockBackend(page, {});
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Footer navigation' }).getByRole('link', { name: 'Status' }).click();

  await expect(page).toHaveURL(/\/status$/);
  await expect(page.getByText('All systems operational')).toBeVisible();
  await expect(page.getByText('Up to date')).toBeVisible();
  await expect(page.getByText('512,340')).toBeVisible();
  await expect(page.getByText('0.2.0 (abc1234)')).toBeVisible();
});

test('shows a degraded indexer and says what is wrong', async ({ page }) => {
  await mockBackend(page, {
    ready: {
      status: 'degraded',
      checks: { database: true, network: 'testnet', indexedLedger: 512000, lagLedgers: 340, gapDetected: true },
    },
  });
  await page.goto('/status');

  await expect(page.getByText('Degraded: the API is up but not fully healthy')).toBeVisible();
  await expect(page.getByText('340 ledgers behind (about 28 min)').first()).toBeVisible();
  await expect(page.getByText('Gap detected')).toBeVisible();
  await expect(page.getByText(/some past events may be missing/)).toBeVisible();
});

test('shows an unreachable API', async ({ page }) => {
  await mockBackend(page, {});
  // Registered after the mock, so it wins for the readiness route only.
  await page.route('http://localhost:8080/ready', (route) => route.abort());
  await page.goto('/status');

  await expect(page.getByText('The API cannot be reached')).toBeVisible();
  await expect(page.getByText('Unreachable', { exact: true })).toBeVisible();
});

test('warns when the API indexes another network', async ({ page }) => {
  await mockBackend(page, {
    version: {
      version: '0.2.0',
      commit: null,
      network: 'public',
      contracts: { registry: '', voucher: '', receipt: '', usdc: null, faucet: null },
      startedAt: '2026-06-01T00:00:00.000Z',
    },
  });
  await page.goto('/status');

  await expect(page.getByText('This app is built for testnet, but the API indexes public.')).toBeVisible();
});
