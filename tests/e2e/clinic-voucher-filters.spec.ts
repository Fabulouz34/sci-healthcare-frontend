import { expect, test, type Page } from '@playwright/test';

import { blockAnalytics } from '../analytics-guard';
import { CLINIC, PROVIDER } from './fixtures';
import { mockBackend, useMockWallet } from './helpers';

/**
 * A clinic desk receives every voucher the clinic is paid with (#32), so the
 * clerk narrows the list by status and by the number on the patient's pass.
 * The two filters combine, and each tab carries the number of vouchers in
 * that status so the desk can see how much is waiting without opening rows.
 */

function voucher(id: string, overrides: Record<string, unknown>) {
  return {
    id,
    funder: 'GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR',
    beneficiaryRef: 'ab'.repeat(32),
    provider: { address: PROVIDER, name: CLINIC.name, country: CLINIC.country },
    serviceCode: 101,
    serviceLabel: 'Outpatient consult',
    amount: '30000000',
    amountDisplay: '3.00',
    status: 'Funded',
    createdAt: '2026-05-01T10:00:00.000Z',
    expiresAt: '2026-06-19T10:00:00.000Z',
    claimedAt: null,
    attestedAt: null,
    disputeDeadline: null,
    settledNet: null,
    settledFee: null,
    isSettleable: false,
    isRefundable: false,
    receipt: null,
    ...overrides,
  };
}

const VOUCHERS = [
  voucher('21', {}),
  voucher('22', {
    status: 'Claimed',
    claimedAt: '2026-05-04T10:00:00.000Z',
    refundableAt: '2026-07-01T00:00:00.000Z',
  }),
  voucher('23', {
    status: 'Claimed',
    claimedAt: '2026-05-05T10:00:00.000Z',
    refundableAt: '2026-07-01T00:00:00.000Z',
  }),
  voucher('204', {
    status: 'Attested',
    claimedAt: '2026-05-05T10:00:00.000Z',
    attestedAt: '2026-05-06T10:00:00.000Z',
    disputeDeadline: '2026-05-10T10:00:00.000Z',
    isSettleable: true,
  }),
];

test.beforeEach(async ({ page }) => {
  await blockAnalytics(page);
  await useMockWallet(page, PROVIDER);
  await mockBackend(page, {
    provider: CLINIC,
    vouchers: VOUCHERS,
    voucherById: Object.fromEntries(VOUCHERS.map((v) => [v.id, v])),
  });
  await page.goto('/clinic');
  await expect(page.getByRole('link', { name: '#21' })).toBeVisible();
});

/** Voucher ids in the order the rows appear. */
async function voucherIds(page: Page): Promise<string[]> {
  const texts = await page.locator('a[href^="/vouchers/"]').allTextContents();
  return texts.map((t) => t.trim().replace(/^#/, ''));
}

test('shows a count for every status present, with All as the whole inbox', async ({
  page,
}) => {
  await expect(page.getByRole('button', { name: 'All 4' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Funded 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Claimed 2' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Attested 1' })).toBeVisible();
  // Statuses with nothing in them are not offered as tabs.
  await expect(page.getByRole('button', { name: /^Settled/ })).toHaveCount(0);
  await expect(page.getByText('Showing 4 of 4 vouchers')).toBeVisible();
  await expect.poll(() => voucherIds(page)).toEqual(['21', '22', '23', '204']);
});

test('filters by status without changing the counts', async ({ page }) => {
  await page.getByRole('button', { name: 'Claimed 2' }).click();

  await expect(page.getByRole('button', { name: 'Claimed 2' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect.poll(() => voucherIds(page)).toEqual(['22', '23']);
  await expect(page.getByText('Showing 2 of 4 vouchers')).toBeVisible();
  // The tabs still describe the whole inbox, not the filtered view.
  await expect(page.getByRole('button', { name: 'All 4' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Funded 1' })).toBeVisible();
});

test('searches by voucher number, with or without the # on the pass', async ({
  page,
}) => {
  const search = page.getByRole('searchbox', { name: 'Voucher number' });

  await search.fill('#20');
  await expect.poll(() => voucherIds(page)).toEqual(['204']);
  await expect(page.getByText('Showing 1 of 4 vouchers')).toBeVisible();

  // The number alone is enough; the leading # is optional.
  await search.fill('23');
  await expect.poll(() => voucherIds(page)).toEqual(['23']);
});

test('filters and search work together', async ({ page }) => {
  const search = page.getByRole('searchbox', { name: 'Voucher number' });

  await page.getByRole('button', { name: 'Claimed 2' }).click();
  await search.fill('22');
  await expect.poll(() => voucherIds(page)).toEqual(['22']);
  await expect(page.getByText('Showing 1 of 4 vouchers')).toBeVisible();

  // Claimed + a number that belongs to another status: nothing matches.
  await search.fill('204');
  await expect.poll(() => voucherIds(page)).toEqual([]);
  await expect(page.getByText('No vouchers match this search.')).toBeVisible();
  await expect(page.getByText('Showing 0 of 4 vouchers')).toBeVisible();

  // Both the toolbar and the empty view offer a reset; either does the job.
  await page.getByRole('button', { name: 'Clear filters' }).first().click();
  await expect.poll(() => voucherIds(page)).toEqual(['21', '22', '23', '204']);
  await expect(search).toHaveValue('');
  await expect(page.getByRole('button', { name: 'All 4' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('switching back to All restores the whole inbox', async ({ page }) => {
  await page.getByRole('button', { name: 'Claimed 2' }).click();
  await page.getByRole('button', { name: 'All 4' }).click();

  await expect.poll(() => voucherIds(page)).toEqual(['21', '22', '23', '204']);
  await expect(page.getByText('Showing 4 of 4 vouchers')).toBeVisible();
});
