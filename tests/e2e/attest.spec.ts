import { expect, test } from '@playwright/test';

import { E2E_CONTRACTS } from './contracts';
import { ATTESTER, CLAIMED_VOUCHER } from './fixtures';
import { mockBackend, mockInvokes, useMockWallet } from './helpers';

/** Attester flow: a claimed voucher is confirmed as delivered. */

test.beforeEach(async ({ page }) => {
  await useMockWallet(page, ATTESTER);
  await mockBackend(page, {
    vouchers: [CLAIMED_VOUCHER('22')],
    // Indexer catches up to the attestation a few polls in (#9).
    voucherConverges: { status: 'Attested' },
  });
});

test('attester confirms care delivered', async ({ page }) => {
  await page.goto('/attest');

  await expect(page.getByText('Awaiting confirmation')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm care delivered' }).click();

  // Attesting pays the clinic after the dispute window, so it confirms in a modal.
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();

  await expect(page.getByText('Done.')).toBeVisible();
  expect(await mockInvokes(page)).toContainEqual({
    kind: 'invoke',
    contractId: E2E_CONTRACTS.voucher,
    method: 'attest',
  });
});

/** Keyboard review (#160): j/k, Enter and `a`, with the modal still required. */
test.describe('keyboard workflow', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page, {
      vouchers: [CLAIMED_VOUCHER('22'), CLAIMED_VOUCHER('23')],
      voucherConverges: { status: 'Attested' },
    });
  });

  test('j/k move between claims and `a` opens the confirmation', async ({ page }) => {
    await page.goto('/attest');
    await expect(page.getByText('#23')).toBeVisible();
    const selected = page.locator('[aria-current="true"]');

    await page.keyboard.press('j');
    await expect(selected).toContainText('#22');
    await page.keyboard.press('j');
    await expect(selected).toContainText('#23');
    await page.keyboard.press('k');
    await expect(selected).toContainText('#22');

    // `a` only opens the dialog; nothing is submitted until Confirm.
    await page.keyboard.press('a');
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await mockInvokes(page)).toEqual([]);

    // Backing out leaves the claim untouched, and the shortcuts keep working.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await mockInvokes(page)).toEqual([]);

    await page.keyboard.press('a');
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Done.')).toBeVisible();
    expect(await mockInvokes(page)).toEqual([
      { kind: 'invoke', contractId: E2E_CONTRACTS.voucher, method: 'attest' },
    ]);
  });

  test('Enter opens the selected claim', async ({ page }) => {
    await page.goto('/attest');
    await expect(page.getByText('#23')).toBeVisible();

    await page.keyboard.press('j');
    await page.keyboard.press('j');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/vouchers\/23$/);
  });

  test('shortcuts are ignored while typing in a control', async ({ page }) => {
    await page.goto('/attest');
    await expect(page.getByText('#23')).toBeVisible();

    await page.getByRole('main').getByRole('combobox').focus();
    await page.keyboard.press('j');
    await page.keyboard.press('a');
    await expect(page.locator('[aria-current="true"]')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
