import { expect, test } from '@playwright/test';

import { blockAnalytics } from '../analytics-guard';
import { CLINIC, FUNDER } from './fixtures';
import { mockBackend, useMockWallet } from './helpers';

/**
 * Verification header on the public clinic page.
 *
 * A funder choosing a clinic needs the status, the registration date and the
 * clinic's track record. The settled count is read from the API filtered by
 * provider and status, and every stat is omitted rather than guessed when the
 * indexer cannot answer.
 */

test.beforeEach(async ({ page }) => {
  await blockAnalytics(page);
  await useMockWallet(page, FUNDER);
});

test('shows verified status, registration date and settled count', async ({
  page,
}) => {
  await mockBackend(page, {
    provider: CLINIC,
    // The list route returns these whatever the filter, so one settled
    // voucher is one settled voucher for this clinic.
    vouchers: [{ id: '9001', status: 'Settled', provider: CLINIC }],
  });

  const settledRequest = page.waitForRequest(
    (request) =>
      request.url().includes('/vouchers?') &&
      request.url().includes('status=Settled'),
  );
  await page.goto(`/clinics/${CLINIC.address}`);

  // The count is a server-side filter over this clinic, not a client tally,
  // and it fetches one row: the total is all the header needs.
  const settledUrl = new URL((await settledRequest).url());
  expect(settledUrl.searchParams.get('provider')).toBe(CLINIC.address);
  expect(settledUrl.searchParams.get('status')).toBe('Settled');
  expect(settledUrl.searchParams.get('limit')).toBe('1');

  await expect(page.getByRole('heading', { name: CLINIC.name })).toBeVisible();
  await expect(page.getByText('Verified')).toBeVisible();
  await expect(page.getByText('Registered')).toBeVisible();
  await expect(page.getByText('1 Apr 2026')).toBeVisible();

  await expect(page.getByText('Vouchers settled')).toBeVisible();
  await expect(
    page.locator('dt:text-is("Vouchers settled") + dd'),
  ).toHaveText('1');

  // The rest of the page is untouched: a funder can still pick a service.
  await expect(page.getByText('Fund care')).toBeVisible();
});

test('hides stats the API cannot provide', async ({ page }) => {
  await mockBackend(page, {
    // An older API deployment that does not send a registration date.
    provider: { ...CLINIC, registeredAt: '' },
    vouchers: [],
  });
  // Registered last, so it takes precedence over the catch-all mock route.
  await page.route('http://localhost:8080/vouchers?**', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'indexer unavailable' }),
    }),
  );

  await page.goto(`/clinics/${CLINIC.address}`);

  await expect(page.getByRole('heading', { name: CLINIC.name })).toBeVisible();
  await expect(page.getByText('Verified')).toBeVisible();
  await expect(page.getByText('Fund care')).toBeVisible();

  // Missing fields are absent, not shown as zero or an em dash.
  await expect(page.getByText('Registered')).toHaveCount(0);
  await expect(page.getByText('Vouchers settled')).toHaveCount(0);
});

test('renders not-found for an invalid clinic address without network calls', async ({
  page,
}) => {
  const requests = [] as string[];
  page.on('request', (request) => requests.push(request.url()));

  await mockBackend(page, { provider: CLINIC, vouchers: [] });

  const response = await page.goto('/clinics/not-a-stellar-address');

  // Next.js may answer an invalid dynamic segment with a 404 or a 200 page
  // that renders the not-found state; the contract is the visible result and
  // the absence of API calls, so only a missing response is treated as failure.
  expect(response).not.toBeNull();
  await expect(page.getByText(/not found/i)).toBeVisible();
  expect(requests.filter((url) => url.includes('/providers'))).toHaveLength(0);
  expect(requests.filter((url) => url.includes('/vouchers'))).toHaveLength(0);
});
