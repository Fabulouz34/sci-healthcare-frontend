import { expect, test } from '@playwright/test';

import { E2E_CONTRACTS } from './contracts';
import { CLINIC, FUNDER, PROVIDER } from './fixtures';
import { mockBackend, mockInvokes, useMockWallet } from './helpers';

const ADMIN_READS = {
  [`${E2E_CONTRACTS.registry}:get_admin`]: FUNDER,
  [`${E2E_CONTRACTS.voucher}:get_config`]: { admin: FUNDER },
};

const PENDING_CLINIC = { ...CLINIC, status: 'Pending' };
const DISPUTED_VOUCHER = {
  id: '42',
  funder: PROVIDER,
  provider: { address: CLINIC.address, name: CLINIC.name, country: CLINIC.country },
  amount: '30000000',
  amountDisplay: '3.00',
  status: 'Disputed',
  disputeReason: 2,
};

test('non-admin wallet cannot see the admin route or navigation item', async ({ page }) => {
  await useMockWallet(page, PROVIDER, 0, {
    [`${E2E_CONTRACTS.registry}:get_admin`]: PROVIDER,
    [`${E2E_CONTRACTS.voucher}:get_config`]: { admin: FUNDER },
  });
  await mockBackend(page, {});

  await page.goto('/admin');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Admin console' })).toHaveCount(0);
});

test('admin can approve clinics, resolve disputes, and manage attesters', async ({ page }) => {
  await useMockWallet(page, FUNDER, 0, ADMIN_READS);
  await mockBackend(page, {
    providers: [PENDING_CLINIC],
    vouchers: [DISPUTED_VOUCHER],
    attesters: [
      {
        address: PROVIDER,
        active: true,
        addedAt: '2026-01-15T10:00:00.000Z',
        attestations: 4,
        name: 'Field reviewer',
      },
    ],
  });

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin console' })).toBeVisible();
  if (page.viewportSize()?.width === 390) {
    await page.getByRole('button', { name: 'Open menu' }).click();
  }
  await expect(page.getByRole('link', { name: 'Admin', exact: true })).toBeVisible();
  await expect(page.getByText('Ikeja General Clinic', { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Funder's reason: #2: Care was not delivered as described")).toBeVisible();

  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('dialog')).toContainText('Set Ikeja General Clinic');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm transaction' }).click();
  await expect(page.getByRole('link', { name: 'View transaction' }).first()).toHaveAttribute(
    'href',
    `https://stellar.expert/explorer/testnet/tx/${'ab'.repeat(32)}`,
  );

  await page.getByRole('button', { name: 'Suspend' }).click();
  await expect(page.getByRole('dialog')).toContainText('to Suspended');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm transaction' }).click();
  await expect(page.getByRole('link', { name: 'View transaction' }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Pay clinic' }).click();
  await expect(page.getByRole('dialog')).toContainText('receives $3.00');
  await expect(page.getByRole('dialog')).toContainText('protocol fee is $0.00');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm transaction' }).click();
  await expect(page.getByRole('link', { name: 'View transaction' }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Refund funder' }).click();
  await expect(page.getByRole('dialog')).toContainText(`The funder ${PROVIDER}`);
  await expect(page.getByRole('dialog')).toContainText('full escrow of $3.00');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm transaction' }).click();
  await expect(page.getByRole('link', { name: 'View transaction' }).first()).toBeVisible();

  await page.getByLabel('Stellar address').fill(PROVIDER);
  await page.getByRole('button', { name: 'Add attester' }).click();
  await expect(page.getByText('Attester added.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'View transaction' }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(PROVIDER);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm transaction' }).click();
  await expect(page.getByText('Transaction submitted.').last()).toBeVisible();
  await expect(page.getByRole('link', { name: 'View transaction' }).first()).toBeVisible();

  const invokes = await mockInvokes(page);
  expect(invokes.map(({ method }) => method)).toEqual([
    'set_provider_status',
    'set_provider_status',
    'resolve_dispute',
    'resolve_dispute',
    'add_attester',
    'remove_attester',
  ]);
});

test('dispute refund confirmation names the funder and full escrow', async ({ page }) => {
  await useMockWallet(page, FUNDER, 0, ADMIN_READS);
  await mockBackend(page, { vouchers: [DISPUTED_VOUCHER] });

  await page.goto('/admin');
  await page.getByRole('button', { name: 'Refund funder' }).click();
  await expect(page.getByRole('dialog')).toContainText(`The funder ${PROVIDER}`);
  await expect(page.getByRole('dialog')).toContainText('full escrow of $3.00');
});