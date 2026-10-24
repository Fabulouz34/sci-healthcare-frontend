import { expect, test } from '@playwright/test';

import { CLINIC, PROVIDER } from './fixtures';
import { mockBackend, useMockWallet } from './helpers';

/**
 * Clinic earnings summary (#34).
 *
 * The cards read the clinic statistics endpoint (backend #10); the monthly
 * table is built from the clinic's vouchers, where the fee and net are
 * recorded. Amounts are base units in the API and dollars in the UI.
 */

function earningsVoucher(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    funder: 'GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR',
    beneficiaryRef: 'ab'.repeat(32),
    provider: { address: PROVIDER, name: 'Ikeja General Clinic', country: 'NG' },
    serviceCode: 101,
    serviceLabel: 'Outpatient consult',
    amount: '30000000',
    amountDisplay: '3.00',
    status: 'Funded',
    createdAt: '2026-10-05T10:00:00.000Z',
    expiresAt: '2026-11-04T10:00:00.000Z',
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
    ...overrides,
  };
}

const VOUCHERS = [
  // October: two settled vouchers, $70.00 gross, $7.00 in fees.
  earningsVoucher('101', {
    status: 'Settled',
    amount: '500000000',
    amountDisplay: '50.00',
    createdAt: '2026-10-02T10:00:00.000Z',
    settledNet: '495000000',
    settledFee: '5000000',
  }),
  earningsVoucher('102', {
    status: 'Settled',
    amount: '200000000',
    amountDisplay: '20.00',
    createdAt: '2026-10-20T10:00:00.000Z',
    settledNet: '198000000',
    settledFee: '2000000',
  }),
  // September: $40.00 still on its way, plus a funded voucher that is not
  // pending payout because nobody has claimed it yet.
  earningsVoucher('103', {
    status: 'Claimed',
    amount: '300000000',
    amountDisplay: '30.00',
    createdAt: '2026-09-12T10:00:00.000Z',
  }),
  earningsVoucher('104', {
    status: 'Attested',
    amount: '100000000',
    amountDisplay: '10.00',
    createdAt: '2026-09-28T23:30:00.000Z',
  }),
  earningsVoucher('105', {
    status: 'Funded',
    amount: '900000000',
    amountDisplay: '90.00',
    createdAt: '2026-09-15T10:00:00.000Z',
  }),
  // August: refunded, so neither settled nor pending.
  earningsVoucher('106', {
    status: 'Refunded',
    amount: '700000000',
    amountDisplay: '70.00',
    createdAt: '2026-08-01T10:00:00.000Z',
  }),
];

const STATS = {
  address: PROVIDER,
  name: 'Ikeja General Clinic',
  status: 'Active',
  vouchers: VOUCHERS.length,
  byStatus: {
    Funded: 1,
    Claimed: 1,
    Attested: 1,
    Settled: 2,
    Disputed: 0,
    Refunded: 1,
  },
  settledVouchers: 2,
  settledValue: '700000000',
  settledValueDisplay: '70.00',
};

test.describe('Clinic earnings summary (#34)', () => {
  test('shows settled, pending and fee totals with a monthly breakdown', async ({ page }) => {
    await useMockWallet(page, PROVIDER);
    await mockBackend(page, {
      provider: CLINIC,
      vouchers: VOUCHERS,
      providerStats: STATS,
    });

    await page.goto('/clinic');

    await expect(page.getByRole('heading', { name: 'Earnings', exact: true })).toBeVisible();

    const settledCard = page.getByRole('group', { name: 'Settled' });
    await expect(settledCard).toContainText('$70.00');
    await expect(settledCard).toContainText('2 vouchers');
    await expect(settledCard).toContainText('$69.30 net after fees');

    const pendingCard = page.getByRole('group', { name: 'Pending payout' });
    await expect(pendingCard).toContainText('$40.00');
    await expect(pendingCard).toContainText('2 claimed, attested or disputed');

    const feesCard = page.getByRole('group', { name: 'Fees paid' });
    await expect(feesCard).toContainText('$0.70');

    const table = page.getByRole('table', { name: 'Monthly earnings' });
    await expect(table).toBeVisible();

    const october = table.locator('tr', { hasText: 'Oct 2026' });
    await expect(october).toContainText('$70.00');
    await expect(october).toContainText('$0.70');

    const september = table.locator('tr', { hasText: 'Sept 2026' });
    await expect(september).toContainText('$40.00');

    // August has money in it but nothing settled or pending, so it is left
    // out rather than rendered as a row of zeroes.
    await expect(table.locator('tr', { hasText: 'Aug 2026' })).toHaveCount(0);

    const totalRow = table.locator('tfoot tr');
    await expect(totalRow).toContainText('$70.00');
    await expect(totalRow).toContainText('$40.00');
    await expect(totalRow).toContainText('$0.70');

    // The desk must fit the viewport at both widths, with no sideways scroll.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows).toBe(false);
  });

  test('takes the settled total from the statistics endpoint', async ({ page }) => {
    await useMockWallet(page, PROVIDER);
    await mockBackend(page, {
      provider: CLINIC,
      vouchers: VOUCHERS,
      // Deliberately different from the voucher sum: the card must read the
      // endpoint rather than recomputing it in the browser.
      providerStats: {
        ...STATS,
        settledVouchers: 9,
        settledValue: '1234500000',
        settledValueDisplay: '123.45',
      },
    });

    await page.goto('/clinic');

    const settledCard = page.getByRole('group', { name: 'Settled' });
    await expect(settledCard).toContainText('$123.45');
    await expect(settledCard).toContainText('9 vouchers');
  });

  test('renders a clean empty state for a clinic with no money in flight', async ({ page }) => {
    await useMockWallet(page, PROVIDER);
    await mockBackend(page, {
      provider: CLINIC,
      vouchers: [earningsVoucher('201', { status: 'Funded' })],
      providerStats: {
        ...STATS,
        vouchers: 1,
        byStatus: { Funded: 1, Claimed: 0, Attested: 0, Settled: 0, Disputed: 0, Refunded: 0 },
        settledVouchers: 0,
        settledValue: '0',
        settledValueDisplay: '0.00',
      },
    });

    await page.goto('/clinic');

    await expect(page.getByRole('group', { name: 'Settled' })).toContainText('$0.00');
    await expect(page.getByRole('group', { name: 'Pending payout' })).toContainText('$0.00');
    await expect(page.getByText('No settled or pending earnings yet.')).toBeVisible();
  });
});
