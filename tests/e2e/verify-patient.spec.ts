import { expect, test, type Page } from '@playwright/test';

import { E2E_CONTRACTS } from './contracts';
import {
  CLINIC,
  FUNDED_VOUCHER,
  PATIENT_IDENTIFIER,
  PATIENT_KEY,
  PROVIDER,
} from './fixtures';
import { mockBackend, mockInvokes, useMockWallet } from './helpers';

/**
 * Point-of-care patient check (#33).
 *
 * A clinic may not want to hand a funded voucher to the wrong person. The
 * patient (or their key holder) enters the reference and key on the clinic's
 * device; the app derives the beneficiary reference locally, compares it
 * with the voucher, and only then enables the claim.
 *
 * These assertions also pin the privacy promise: the typed values are not
 * written to storage, not put in a cookie, and not sent in any request.
 */

async function storageSnapshot(page: Page) {
  return page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
}

test.beforeEach(async ({ page }) => {
  await useMockWallet(page, PROVIDER);
  await mockBackend(page, {
    provider: CLINIC,
    vouchers: [FUNDED_VOUCHER('331')],
    // Indexer catches up to the claim a few polls in (#9).
    voucherConverges: { status: 'Claimed' },
  });
});

test('checks the patient locally before the clinic claims', async ({ page, context }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    requests.push(`${request.method()} ${request.url()} ${request.postData() ?? ''}`);
  });

  await page.goto('/clinic');
  await expect(page.getByText('This clinic is verified')).toBeVisible();

  const claim = page.getByRole('button', { name: 'Mark patient seen' });
  await expect(claim).toBeDisabled();
  await expect(page.getByText(/requires a patient check before claiming/)).toBeVisible();

  // The check is optional to open, and explains both sides of what it means.
  await page.getByRole('button', { name: 'Verify patient' }).click();
  await expect(page.getByText(/What a match proves:/)).toBeVisible();
  await expect(page.getByText(/What it does not:/)).toBeVisible();

  const storageBefore = await storageSnapshot(page);
  const cookiesBefore = await context.cookies();

  // Wrong details: clear no-match, still nothing claimable.
  await page.getByLabel('Patient reference').fill('CARD-999');
  await page.getByLabel('Patient secret key').fill(PATIENT_KEY);
  await page.getByRole('button', { name: 'Check patient' }).click();
  await expect(page.getByText('No match.')).toBeVisible();
  await expect(claim).toBeDisabled();
  expect(await mockInvokes(page)).toEqual([]);

  // Right details: a match, and only the boolean remains — the fields are
  // wiped rather than kept for the next patient.
  await page.getByLabel('Patient reference').fill(PATIENT_IDENTIFIER);
  await page.getByLabel('Patient secret key').fill(PATIENT_KEY);
  await page.getByRole('button', { name: 'Check patient' }).click();
  await expect(page.getByText('Match.')).toBeVisible();
  await expect(page.getByLabel('Patient reference')).toHaveValue('');
  await expect(page.getByLabel('Patient secret key')).toHaveValue('');

  await expect(claim).toBeEnabled();

  // Nothing typed was stored, cooked into a cookie, or sent anywhere.
  expect(await storageSnapshot(page)).toEqual(storageBefore);
  expect(await context.cookies()).toEqual(cookiesBefore);
  expect(JSON.stringify(await storageSnapshot(page))).not.toContain(PATIENT_KEY);
  expect(JSON.stringify(await storageSnapshot(page))).not.toContain(PATIENT_IDENTIFIER);
  expect(page.url()).not.toContain(PATIENT_IDENTIFIER);
  const sent = requests.join('\n');
  expect(sent).not.toContain(PATIENT_KEY);
  expect(sent).not.toContain(PATIENT_IDENTIFIER);

  await claim.click();
  await expect(page.getByText('Done.')).toBeVisible();
  expect(await mockInvokes(page)).toContainEqual({
    kind: 'invoke',
    contractId: E2E_CONTRACTS.voucher,
    method: 'claim',
  });
});

test('an edit after a match disables the claim again', async ({ page }) => {
  await page.goto('/clinic');
  await expect(page.getByText('This clinic is verified')).toBeVisible();

  const claim = page.getByRole('button', { name: 'Mark patient seen' });
  await page.getByRole('button', { name: 'Verify patient' }).click();
  await page.getByLabel('Patient reference').fill(PATIENT_IDENTIFIER);
  await page.getByLabel('Patient secret key').fill(PATIENT_KEY);
  await page.getByRole('button', { name: 'Check patient' }).click();
  await expect(page.getByText('Match.')).toBeVisible();
  await expect(claim).toBeEnabled();

  // Collapsing the panel keeps the match for this voucher...
  await page.getByRole('button', { name: 'Hide check' }).click();
  await page.getByRole('button', { name: 'Verify again' }).click();
  await expect(claim).toBeEnabled();

  // ...but a new reference starts a new check, so the earlier match is gone.
  await page.getByLabel('Patient reference').fill('CARD-124');
  await expect(claim).toBeDisabled();
});
