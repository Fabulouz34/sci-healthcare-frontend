import { expect, test } from '@playwright/test';

import { E2E_CONTRACTS } from './contracts';
import { CLINIC, FUNDED_VOUCHER, PROVIDER, SETTLEABLE_VOUCHER } from './fixtures';
import { mockBackend, mockInvokes, useMockWallet } from './helpers';

/**
 * Clinic flow: release payment for every voucher past its dispute window in
 * one go (#35).
 *
 * The clinic desk lists vouchers in every state. "Settle all" must write only
 * the settleable ones — a voucher still inside its window cannot be settled,
 * and the contract would reject the call — while showing how far it has got.
 * The assertions read the recorded contract calls, so a run that renders
 * progress without settling anything cannot pass. Runs at desktop width and
 * at 390px through the two Playwright projects.
 */

// Writes are held for a moment so the progress state is observable; the mock
// chain still resolves every call.
test.beforeEach(async ({ page }) => {
  await useMockWallet(page, PROVIDER, 250);
  await mockBackend(page, {
    provider: CLINIC,
    vouchers: [
      SETTLEABLE_VOUCHER('31'),
      FUNDED_VOUCHER('32'),
      SETTLEABLE_VOUCHER('33'),
    ],
  });
});

test('settle all releases every due voucher and leaves the others alone', async ({
  page,
}) => {
  await page.goto('/clinic');
  await expect(page.getByText('This clinic is verified')).toBeVisible();

  // Two of the three listed vouchers are past their dispute window; the
  // funded one still needs a claim, so it is not part of the batch.
  const settleAll = page.getByRole('button', { name: 'Settle all (2)' });
  await expect(settleAll).toBeVisible();
  await settleAll.click();

  // Progress is announced (and the button disabled) while the writes run.
  await expect(page.getByRole('progressbar')).toBeVisible();
  const busy = page.getByRole('button', { name: /Settling \d+\/\d+/ });
  await expect(busy).toBeVisible();
  await expect(busy).toBeDisabled();

  const summary = page.getByText(/Payment released for/);
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('#31');
  await expect(summary).toContainText('#33');

  // One `settle` per due voucher, and nothing written for the funded one.
  const writes = await mockInvokes(page);
  const settles = writes.filter(
    (call) => call.contractId === E2E_CONTRACTS.voucher && call.method === 'settle',
  );
  expect(settles).toHaveLength(2);
  expect(writes.some((call) => call.method === 'claim')).toBe(false);

  // 390px is the narrowest supported width: the button and summary may wrap
  // but must not push the page sideways.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
