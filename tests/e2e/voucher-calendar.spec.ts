import { expect, test } from '@playwright/test';

import { blockAnalytics } from '../analytics-guard';
import { CLINIC, FUNDER } from './fixtures';
import { mockBackend, useMockWallet } from './helpers';

/**
 * The "Add to calendar" reminder (#140): clicking it downloads a valid `.ics`
 * whose all-day reminder lands on the voucher's expiry day in UTC, links to
 * the public voucher page, and carries no patient data.
 */

const VOUCHER_ID = '99';
const EXPIRES_AT = '2026-06-19T10:00:00.000Z';

const VOUCHER = {
  id: VOUCHER_ID,
  funder: FUNDER,
  beneficiaryRef: 'ab'.repeat(32),
  provider: CLINIC,
  serviceCode: 101,
  serviceLabel: 'Outpatient consult',
  amount: '30000000',
  amountDisplay: '3.00',
  status: 'Funded',
  createdAt: '2026-05-20T10:00:00.000Z',
  expiresAt: EXPIRES_AT,
  claimedAt: null,
  attestedAt: null,
  disputeDeadline: null,
  settledNet: null,
  settledFee: null,
  disputeReason: null,
  refundableAt: null,
  isSettleable: false,
  isRefundable: false,
  receipt: null,
};

test.beforeEach(async ({ page }) => {
  await blockAnalytics(page);
  await useMockWallet(page, FUNDER);
});

test('add to calendar downloads a valid .ics reminder for the expiry day', async ({
  page,
}) => {
  await mockBackend(page, {
    provider: CLINIC,
    voucherById: { [VOUCHER_ID]: VOUCHER },
  });

  await page.goto(`/vouchers/${VOUCHER_ID}`);
  await expect(page.getByRole('heading', { name: VOUCHER.serviceLabel })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Add to calendar' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.ics$/);

  const { promises: fs } = await import('fs');
  const path = await download.path();
  expect(path).not.toBeNull();
  const content = await fs.readFile(path!, 'utf8');

  expect(content.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  expect(content.endsWith('END:VCALENDAR\r\n')).toBe(true);
  expect(content).toContain('VERSION:2.0\r\n');
  expect(content).toContain('CALSCALE:GREGORIAN\r\n');
  // All-day reminder on the expiry day, UTC.
  expect(content).toContain(`DTSTART;VALUE=DATE:20260619\r\n`);
  expect(content).toContain(`DTEND;VALUE=DATE:20260620\r\n`);
  expect(content).toContain(`SUMMARY:Voucher expiry — Voucher #${VOUCHER_ID}\r\n`);
  expect(content).toContain(`URL:${page.url()}\r\n`);
  // Public facts only — no patient or beneficiary data.
  expect(content).not.toContain('beneficiary');
  expect(content).not.toContain(VOUCHER.beneficiaryRef);
});
