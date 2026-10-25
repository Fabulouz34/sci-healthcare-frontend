import { expect, test } from '@playwright/test';

import { CLINIC, FUNDER } from './fixtures';
import { mockBackend, mockInvokes, useMockWallet } from './helpers';

test.beforeEach(async ({ page }) => {
  await useMockWallet(page, FUNDER);
  await mockBackend(page, { provider: CLINIC });
});

test('sponsorship is opt-in, has amount limits and never silently changes to self-payment', async ({ page }, testInfo) => {
  await page.goto(`/clinics/${CLINIC.address}`);
  const checkbox = page.getByRole('checkbox', { name: 'Request sponsored fees' });
  await expect(checkbox).not.toBeChecked();
  await expect(checkbox).toBeEnabled();
  const mobilePayment = page.getByText('Pay from a mobile wallet', { exact: true });
  await expect(mobilePayment).toBeVisible();
  await checkbox.check();
  await expect(mobilePayment).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('sponsored-fees.png'), fullPage: true });
  await page.getByLabel('Amount (USDC)', { exact: false }).fill('101');
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  await expect(mobilePayment).toBeVisible();
  await expect(checkbox).toBeDisabled();
  await page.getByLabel('Amount (USDC)', { exact: false }).fill('3');
  await expect(checkbox).toBeEnabled();
});

test('failed sponsored preparation submits nothing; paying with XLM requires an explicit choice', async ({ page }) => {
  // Sponsored invocations deliberately use the real build/sign/submit path,
  // even when ordinary RPC reads are mocked. Fail account lookup here; real
  // signed-envelope success/refusal cases are covered by the SDK unit tests.
  await page.route('https://soroban-testnet.stellar.org/**', async (route) => {
    const request = route.request().postDataJSON();
    await route.fulfill({ json: { jsonrpc: '2.0', id: request.id,
      result: { entries: [], latestLedger: 100 } } });
  });
  let sponsorRequests = 0;
  await page.route('http://localhost:8080/sponsorship/fee-bump', async (route) => {
    sponsorRequests++;
    await route.fulfill({ status: 503, json: {} });
  });
  await page.goto(`/clinics/${CLINIC.address}`);
  await page.getByPlaceholder('e.g. clinic card number').fill('CARD-164');
  await page.getByPlaceholder('stays on this device').fill('s'.repeat(32));
  await page.getByRole('checkbox', { name: 'Request sponsored fees' }).check();
  await page.getByRole('button', { name: 'Fund voucher', exact: true }).click();
  await expect(page.getByText('A declined request will not fall back', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText(/Funded 0 of 1 service/)).toBeVisible();
  expect(await mockInvokes(page)).toEqual([]);
  expect(sponsorRequests).toBe(0);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Request sponsored fees' }).uncheck();
  await page.getByRole('button', { name: 'Fund voucher', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Voucher funded.')).toBeVisible();
  expect((await mockInvokes(page)).length).toBe(1);
});
