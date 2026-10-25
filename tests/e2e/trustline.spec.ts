import { expect, test } from '@playwright/test';

import { E2E_CONTRACTS } from './contracts';
import { CLINIC, FUNDER } from './fixtures';
import { mockBackend, mockCalls, mockInvokes, useMockWallet } from './helpers';

/**
 * USDC trustline prompt (#1).
 *
 * A wallet that has never held USDC has no balance line for it, and without
 * one funding dies at signing with a raw host error most first-time users
 * cannot act on. The form must check the line on connect, explain it in one
 * plain sentence, and offer a one-click changeTrust before it offers to
 * fund. Mock mode holds USDC unless `__SCI_NO_TRUSTLINE__` is set.
 */

test.beforeEach(async ({ page }) => {
  await useMockWallet(page, FUNDER);
  await mockBackend(page, { provider: CLINIC });
});

test('prompts for the trustline instead of showing the fund button', async ({
  page,
}) => {
  await page.addInitScript(`window.__SCI_NO_TRUSTLINE__ = true;`);
  await page.goto(`/clinics/${CLINIC.address}`);

  // The explanation, in one sentence — and no fund button while the line
  // is missing, because pressing it could only fail at signing.
  await expect(
    page.getByText(/A trustline is your wallet agreeing to hold USDC/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fund voucher' })).toHaveCount(0);

  // One click builds the changeTrust, which the wallet signs (echoed by the
  // mock) and the app submits (mocked).
  await page.getByRole('button', { name: 'Add USDC' }).click();

  // The prompt disappears, the balance shows and funding is enabled.
  await expect(page.getByText(/A trustline is/)).toHaveCount(0);
  await expect(page.getByText('USDC balance: $100.00', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fund voucher' })).toBeVisible();
  expect(await mockCalls(page)).toContainEqual({
    kind: 'change_trust',
    contractId: E2E_CONTRACTS.usdc,
    method: 'change_trust',
  });

  // And the wallet it unblocked can actually fund a voucher.
  await page.getByPlaceholder('e.g. clinic card number').fill('CARD-1');
  await page.getByPlaceholder('stays on this device').fill('s'.repeat(32));
  await page.getByRole('button', { name: 'Fund voucher' }).click();

  // Funding goes through the review step (#22) like any other fund flow.
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Voucher funded.')).toBeVisible();
});

test('a rejection in the wallet leaves everything as it was', async ({ page }) => {
  await page.addInitScript(
    `window.__SCI_NO_TRUSTLINE__ = true;
     window.__SCI_MOCK_SIGN_REJECT__ = true;`,
  );
  await page.goto(`/clinics/${CLINIC.address}`);
  await page.getByRole('button', { name: 'Add USDC' }).click();

  // Calm, and accurate: nothing left the browser.
  await expect(
    page.getByText('Nothing was sent. Press Add USDC whenever you are ready.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add USDC' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Fund voucher' })).toHaveCount(0);
  // Reads (the faucet's balance poll) are fine; nothing was built, signed
  // or submitted.
  const writes = (await mockCalls(page)).filter((c) => c.kind !== 'read');
  expect(writes).toEqual([]);
});

test('warns when the USDC balance is below the voucher amount', async ({
  page,
}) => {
  await page.goto(`/clinics/${CLINIC.address}`);
  await expect(page.getByRole('button', { name: 'Fund voucher' })).toBeVisible();
  await expect(page.getByText('USDC balance: $100.00', { exact: true })).toBeVisible();

  // The mock wallet holds $100.00; ask for more than that.
  await page.getByLabel('Amount (USDC)').fill('200');
  await expect(
    page.getByText(/below the \$200\.00 voucher amount/),
  ).toBeVisible();

  // The warning is on screen before anything is built or signed: only the
  // fee-quote read has been recorded, no write.
  expect(await mockInvokes(page)).toEqual([]);
});
