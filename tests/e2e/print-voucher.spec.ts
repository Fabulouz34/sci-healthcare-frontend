import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

import { blockAnalytics } from '../analytics-guard';
import { CLINIC, FUNDER } from './fixtures';
import { mockBackend } from './helpers';

const VOUCHER_ID = '139';

const SETTLED_VOUCHER = {
  id: VOUCHER_ID,
  funder: FUNDER,
  beneficiaryRef: 'ab'.repeat(32),
  provider: CLINIC,
  serviceCode: 101,
  serviceLabel: 'Outpatient consult',
  amount: '30000000',
  amountDisplay: '3.00',
  status: 'Settled',
  createdAt: '2026-05-01T10:00:00.000Z',
  expiresAt: '2026-06-01T10:00:00.000Z',
  claimedAt: '2026-05-05T10:00:00.000Z',
  attestedAt: '2026-05-06T10:00:00.000Z',
  disputeDeadline: '2026-05-10T10:00:00.000Z',
  settledNet: '29400000',
  settledFee: '600000',
  disputeReason: null,
  refundableAt: null,
  isSettleable: false,
  isRefundable: false,
  receipt: {
    voucherId: VOUCHER_ID,
    providerAddress: CLINIC.address,
    serviceCode: 101,
    serviceLabel: 'Outpatient consult',
    amount: '30000000',
    amountDisplay: '3.00',
    settledAt: '2026-05-20T10:00:00.000Z',
  },
};

test('voucher print preview shows the QR, summary and history on one A4 page', async ({
  page,
}, testInfo) => {
  await blockAnalytics(page);
  await mockBackend(page, {
    provider: CLINIC,
    voucherById: { [VOUCHER_ID]: SETTLED_VOUCHER },
  });

  await page.goto(`/vouchers/${VOUCHER_ID}`);
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  await expect(page.locator(`img[alt="QR code for voucher #${VOUCHER_ID}"]`).first()).toBeVisible();

  const screenshotDirectory = resolve(process.cwd(), 'docs', 'screenshots');
  await mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({
    path: resolve(screenshotDirectory, `issue-139-voucher-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await page.setViewportSize({ width: 794, height: 1123 });
  await page.emulateMedia({ media: 'print' });

  const printDocument = page.locator('.voucher-print-document');
  await expect(page.locator('header')).toBeHidden();
  await expect(page.locator('footer')).toBeHidden();
  await expect(
    printDocument.getByRole('heading', { name: 'Patient Clinic Voucher' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  await expect(printDocument.getByText('Outpatient consult', { exact: true })).toBeVisible();
  await expect(printDocument.getByText('Ikeja General Clinic', { exact: true })).toBeVisible();
  await expect(page.getByText('Patient reference', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Print voucher pass' })).toBeHidden();
  await expect(
    page.locator(`img[alt="QR code for voucher #${VOUCHER_ID}"]:visible`),
  ).toHaveCount(1);

  const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  const pageCount = [...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
  expect(pageCount).toBe(1);

  if (testInfo.project.name === 'desktop') {
    await page.screenshot({
      path: resolve(screenshotDirectory, 'issue-139-voucher-print-preview.png'),
      fullPage: true,
    });
  }
});
