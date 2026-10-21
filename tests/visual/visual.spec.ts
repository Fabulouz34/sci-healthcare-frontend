import { expect, test } from '@playwright/test';

import { blockAnalytics } from '../analytics-guard';
import { E2E_CONTRACTS } from '../e2e/contracts';
import {
  blockRpc,
  CLINIC_ADDRESS,
  freezeClock,
  mockApi,
  settle,
  VOUCHER_ID,
} from './fixtures';

/**
 * Visual regression snapshots for the six routes that make up the app.
 *
 * Each test runs once per project (desktop 1280px, mobile 390px) with the
 * backend mocked, so no testnet, indexer or wallet is needed. If a snapshot
 * fails after an intentional style change, run
 * `npm run test:visual:update`, inspect the diff, and commit the new files.
 */

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
  await blockRpc(page);
  await blockAnalytics(page);
  await mockApi(page);
});

test('home — verified clinic directory', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Verified clinics')).toBeVisible();
  await expect(page.getByText('Ikeja General Clinic')).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot('home.png');
});

test('clinic detail — fund a voucher', async ({ page }) => {
  await page.goto(`/clinics/${CLINIC_ADDRESS}`);
  await expect(page.getByText('Fund care')).toBeVisible();
  await expect(page.getByText('Outpatient consult').first()).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot('clinic-detail.png');
});

test('my vouchers — disconnected', async ({ page }) => {
  await page.goto('/my');
  await expect(page.getByText('Vouchers I funded')).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot('my.png');
});

test('clinic desk — disconnected', async ({ page }) => {
  await page.goto('/clinic');
  await expect(page.getByText('Connect the clinic')).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot('clinic-desk.png');
});

test('clinic desk — SEP-24 cash-out handoff', async ({ page }) => {
  await page.addInitScript(
    `window.__SCI_MOCK_WALLET__ = { address: '${CLINIC_ADDRESS}' };
     window.__SCI_MOCK_RPC__ = { calls: [], args: [] };`,
  );
  await page.route('https://anchor.example/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/.well-known/stellar.toml') {
      return route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: `NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"\nSIGNING_KEY = "GCSGSR6KQQ5BP2FXVPWRL6SWPUSFWLVONLIBJZUKTVQB5FYJFVL6XOXE"\nWEB_AUTH_ENDPOINT = "https://anchor.example/auth"\nTRANSFER_SERVER_SEP0024 = "https://anchor.example/sep24"\n\n[[CURRENCIES]]\ncode = "USDC"\nissuer = "${E2E_CONTRACTS.usdcIssuer}"`,
      });
    }
    if (url.pathname === '/sep24/info') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ withdraw: { USDC: { enabled: true, min_amount: 1, max_amount: 100 } } }),
      });
    }
    return route.fulfill({ status: 404, body: '{}' });
  });

  await page.goto('/clinic');
  await expect(page.getByRole('heading', { name: 'Local cash-out' })).toBeVisible();
  await page.getByLabel('Anchor').selectOption('anchor.example');
  await expect(page.getByText('Anchor limits: 1–100 USDC.')).toBeVisible();
  await expect(page.getByText(/may require identity verification \(KYC\)/)).toBeVisible();
  await settle(page);
  await expect(page.getByRole('region', { name: 'Local cash-out' })).toHaveScreenshot('clinic-cashout.png');
});

test('attest — disconnected', async ({ page }) => {
  await page.goto('/attest');
  await expect(page.getByText('Connect an attester')).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot('attest.png');
});

test('voucher detail — history and receipt', async ({ page }) => {
  await page.goto(`/vouchers/${VOUCHER_ID}`);
  await expect(page.getByText('History')).toBeVisible();
  await expect(page.getByText('Outpatient consult').first()).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot('voucher.png');
});
