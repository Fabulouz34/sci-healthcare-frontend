import { expect, test } from '@playwright/test';

import { blockAnalytics } from '../analytics-guard';
import { E2E_CONTRACTS } from './contracts';
import { CLINIC, PROVIDER } from './fixtures';
import { mockBackend, useMockWallet } from './helpers';

const STELLAR_TOML = `
NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"
SIGNING_KEY = "GCSGSR6KQQ5BP2FXVPWRL6SWPUSFWLVONLIBJZUKTVQB5FYJFVL6XOXE"
WEB_AUTH_ENDPOINT = "https://anchor.example/auth"
TRANSFER_SERVER_SEP0024 = "https://anchor.example/sep24"

[[CURRENCIES]]
code = "USDC"
issuer = "${E2E_CONTRACTS.usdcIssuer}"
`;

test.beforeEach(async ({ page }) => {
  await blockAnalytics(page);
  await useMockWallet(page, PROVIDER);
});

test('discovers a country anchor and explains SEP-24 requirements', async ({ page }) => {
  await mockBackend(page, { provider: CLINIC });
  await page.route('https://anchor.example/**', async (route) => {
    const url = new URL(route.request().url());
    const headers = { 'Access-Control-Allow-Origin': '*' };
    if (url.pathname === '/.well-known/stellar.toml') {
      return route.fulfill({ status: 200, headers, contentType: 'text/plain', body: STELLAR_TOML });
    }
    if (url.pathname === '/sep24/info') {
      return route.fulfill({
        status: 200,
        headers,
        contentType: 'application/json',
        body: JSON.stringify({ withdraw: { USDC: { enabled: true, min_amount: 1, max_amount: 100 } } }),
      });
    }
    return route.fulfill({ status: 404, headers, body: '{}' });
  });

  await page.goto('/clinic');
  await expect(page.getByRole('heading', { name: 'Local cash-out' })).toBeVisible();
  await expect(page.getByText('separate off-chain withdrawal')).toBeVisible();
  await page.getByLabel('Anchor').selectOption('anchor.example');
  await expect(page.getByText('Anchor limits: 1–100 USDC.')).toBeVisible();
  await expect(page.getByText(/may require identity verification \(KYC\)/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Withdraw with anchor' })).toBeDisabled();
});

test('shows a useful message when no configured anchor serves the country', async ({ page }) => {
  await mockBackend(page, { provider: { ...CLINIC, country: 'KE' } });
  let anchorRequests = 0;
  await page.route('https://anchor.example/**', (route) => {
    anchorRequests++;
    return route.abort();
  });

  await page.goto('/clinic');
  await expect(page.getByRole('heading', { name: 'Local cash-out' })).toBeVisible();
  await expect(page.getByText(/No configured cash-out anchor currently serves KE/)).toBeVisible();
  expect(anchorRequests).toBe(0);
});