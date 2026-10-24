import { expect, test, type Page } from '@playwright/test';

import { blockAnalytics } from '../analytics-guard';
import { CLINIC, FUNDER, PROVIDER } from './fixtures';
import { mockBackend, useMockWallet } from './helpers';

/**
 * The wallet's transaction history (#165).
 *
 * The page answers "what did this wallet take part in, and what did it
 * sign?", so the order of the rows and the honesty of the attribution both
 * matter: a row marked as signed by the wallet when it was not is a false
 * claim about a signature, and every row has to link to the transaction
 * behind it so it can be checked on chain.
 */

const FUNDED_ID = '501';
const CLINIC_ID = '502';

/** Funded by this wallet, claimed by the clinic, then paid out. */
const FUNDED_VOUCHER = {
  id: FUNDED_ID,
  funder: FUNDER,
  beneficiaryRef: 'ab'.repeat(32),
  provider: { address: PROVIDER, name: CLINIC.name, country: 'NG' },
  serviceCode: 101,
  serviceLabel: 'Outpatient consult',
  amount: '30000000',
  amountDisplay: '3.00',
  status: 'Settled',
  createdAt: '2026-05-01T10:00:00.000Z',
  expiresAt: '2026-06-19T10:00:00.000Z',
  claimedAt: '2026-05-05T10:00:00.000Z',
  attestedAt: '2026-05-06T10:00:00.000Z',
  disputeDeadline: '2026-05-10T10:00:00.000Z',
  settledNet: '29400000',
  settledFee: '600000',
  disputeReason: null,
  refundableAt: null,
  isSettleable: false,
  isRefundable: false,
  receipt: null,
};

/** Funded by somebody else, and claimed by this wallet's clinic. */
const CLINIC_VOUCHER = {
  ...FUNDED_VOUCHER,
  id: CLINIC_ID,
  funder: 'GOTHERFUNDER7WEIRDADDRESS',
  provider: { address: FUNDER, name: CLINIC.name, country: 'NG' },
  status: 'Claimed',
  settledNet: null,
  settledFee: null,
};

const FUNDED_EVENTS = [
  {
    id: '0000001-000000-000001',
    name: 'voucher_created',
    txHash: 'TXCREATED',
    closedAt: '2026-05-01T10:00:00.000Z',
    voucherId: FUNDED_ID,
  },
  {
    id: '0000002-000000-000001',
    name: 'voucher_claimed',
    txHash: 'TXCLAIMED',
    closedAt: '2026-05-05T10:00:00.000Z',
    voucherId: FUNDED_ID,
  },
  {
    id: '0000003-000000-000001',
    name: 'voucher_settled',
    txHash: 'TXSETTLED',
    closedAt: '2026-05-20T10:00:00.000Z',
    voucherId: FUNDED_ID,
  },
];

const CLINIC_EVENTS = [
  {
    id: '0000004-000000-000001',
    name: 'voucher_created',
    txHash: 'TXOTHERCREATED',
    closedAt: '2026-05-02T10:00:00.000Z',
    voucherId: CLINIC_ID,
  },
  {
    id: '0000005-000000-000001',
    name: 'voucher_claimed',
    txHash: 'TXCLINICCLAIMED',
    closedAt: '2026-05-06T10:00:00.000Z',
    voucherId: CLINIC_ID,
  },
];

const EXPLORER = 'https://stellar.expert/explorer/testnet/tx/';

/** The transactions the page links to, in the order the rows appear. */
async function linkedTransactions(page: Page): Promise<string[]> {
  return page
    .locator(`a[href^="${EXPLORER}"]`)
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
}

test.beforeEach(async ({ page }) => {
  await blockAnalytics(page);
  await useMockWallet(page, FUNDER);
  await mockBackend(page, {
    provider: CLINIC,
    vouchers: [FUNDED_VOUCHER, CLINIC_VOUCHER],
    voucherById: { [FUNDED_ID]: FUNDED_VOUCHER, [CLINIC_ID]: CLINIC_VOUCHER },
    voucherEventsById: { [FUNDED_ID]: FUNDED_EVENTS, [CLINIC_ID]: CLINIC_EVENTS },
  });
});

test.describe('Wallet transaction history (#165)', () => {
  test('lists every transaction of the wallet, newest first, linked to the chain', async ({
    page,
  }) => {
    await page.goto('/my/transactions');

    await expect(page.getByRole('heading', { name: 'Transaction history' })).toBeVisible();

    // Newest first, across both vouchers the wallet took part in.
    await expect.poll(() => linkedTransactions(page)).toEqual([
      `${EXPLORER}TXSETTLED`,
      `${EXPLORER}TXCLINICCLAIMED`,
      `${EXPLORER}TXCLAIMED`,
      `${EXPLORER}TXOTHERCREATED`,
      `${EXPLORER}TXCREATED`,
    ]);

    // The oldest first order is the same list, reversed.
    await page.getByRole('combobox', { name: 'Order' }).selectOption('oldest');
    await expect.poll(() => linkedTransactions(page)).toEqual([
      `${EXPLORER}TXCREATED`,
      `${EXPLORER}TXOTHERCREATED`,
      `${EXPLORER}TXCLAIMED`,
      `${EXPLORER}TXCLINICCLAIMED`,
      `${EXPLORER}TXSETTLED`,
    ]);
  });

  test('says who signed each transaction', async ({ page }) => {
    await page.goto('/my/transactions');

    // This wallet funded one voucher and claimed the other.
    await expect(page.getByText('Signed by you')).toHaveCount(2);
    // The clinic signed the claim on the voucher this wallet funded.
    await expect(page.getByText('Signed by the clinic')).toHaveCount(1);
    // Somebody else funded the voucher this wallet's clinic claimed.
    await expect(page.getByText('Signed by the funder')).toHaveCount(1);
    // Settling is permissionless, so the signer is not recorded.
    await expect(page.getByText('the signer is not recorded')).toHaveCount(1);
  });

  test('filters down to the transactions this wallet signed', async ({ page }) => {
    await page.goto('/my/transactions');

    await page.getByRole('combobox', { name: 'Show' }).selectOption('signed');

    await expect.poll(() => linkedTransactions(page)).toEqual([
      `${EXPLORER}TXCLINICCLAIMED`,
      `${EXPLORER}TXCREATED`,
    ]);
  });

  test('links to the voucher each transaction belongs to', async ({ page }) => {
    await page.goto('/my/transactions');

    await expect(page.getByRole('link', { name: `Voucher #${FUNDED_ID}` }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: `Voucher #${CLINIC_ID}` }).first()).toBeVisible();
  });

  test('says so when the indexer has no event log to read', async ({ page }) => {
    // No event log in the mock: the endpoint answers 404, exactly like an
    // indexer that predates backend #13.
    await mockBackend(page, {
      provider: CLINIC,
      vouchers: [FUNDED_VOUCHER, CLINIC_VOUCHER],
      voucherById: { [FUNDED_ID]: FUNDED_VOUCHER, [CLINIC_ID]: CLINIC_VOUCHER },
    });

    await page.goto('/my/transactions');

    await expect(
      page.getByText('does not publish the on-chain event log yet'),
    ).toBeVisible();
    await expect(page.locator(`a[href^="${EXPLORER}"]`)).toHaveCount(0);
  });

  test('is reachable from the voucher list', async ({ page }) => {
    await page.goto('/my');

    const link = page.getByRole('link', { name: 'Transaction history' });
    await expect(link).toBeVisible();
    await link.click();

    await expect(page.getByRole('heading', { name: 'Transaction history' })).toBeVisible();
  });
});
