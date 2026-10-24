import { expect, test, type Page } from '@playwright/test';

import { E2E_CONTRACTS } from './contracts';
import {
  CLAIMED_VOUCHER,
  CLINIC,
  FUNDED_VOUCHER,
  PROVIDER,
} from './fixtures';
import { mockBackend, useMockWallet } from './helpers';

/**
 * Clinic onboarding checklist (#31).
 *
 * Every stage is derived from the registry standing, the service list and the
 * clinic's vouchers, so each test serves one stage and reads the states the
 * desk renders. The registry reads come from the RPC mock (`get_provider`),
 * which defaults to Active; a stage overrides it with the contract's status
 * discriminant (`0` Pending, `3` — an out-of-range value — unregistered).
 */

const TITLE = 'Getting to your first payment';

function checklist(page: Page) {
  return page.getByRole('list', { name: TITLE });
}

/** The row for a step, e.g. "Wait for verification". */
function step(page: Page, label: string) {
  return checklist(page).getByRole('listitem').filter({ hasText: label });
}

async function expectState(
  page: Page,
  label: string,
  state: 'done' | 'current' | 'pending',
): Promise<void> {
  const row = step(page, label);
  if (state === 'current') {
    await expect(row).toHaveAttribute('aria-current', 'step');
    await expect(row).toContainText('Next');
    return;
  }
  await expect(row).not.toHaveAttribute('aria-current', 'step');
  await expect(row).toContainText(state === 'done' ? 'Done' : 'Not yet');
}

/** A settled voucher: every checklist step is behind the clinic. */
function settledVoucher(id: string) {
  return {
    ...CLAIMED_VOUCHER(id),
    status: 'Settled',
    settledNet: '29400000',
    settledFee: '600000',
    isSettleable: true,
  };
}

test.describe('Clinic onboarding checklist (#31)', () => {
  test('an unregistered wallet starts at registration', async ({ page }) => {
    await useMockWallet(page, PROVIDER, 0, {
      // 3 is outside the registry's Pending/Active/Suspended discriminants,
      // which readContract maps to null: no provider entry.
      [`${E2E_CONTRACTS.registry}:get_provider`]: { status: 3 },
    });
    await mockBackend(page, { vouchers: [] });

    await page.goto('/clinic');
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();

    await expectState(page, 'Register the clinic', 'current');
    await expect(step(page, 'Register the clinic')).toContainText(
      'Fill in the form below with the clinic name and country code.',
    );
    await expectState(page, 'Wait for verification', 'pending');
    await expectState(page, 'List a service', 'pending');
    await expectState(page, 'Claim a voucher', 'pending');
    await expectState(page, 'Get paid', 'pending');
    await expect(page.getByText('0 of 5 done')).toBeVisible();
  });

  test('a pending clinic waits for an administrator', async ({ page }) => {
    await useMockWallet(page, PROVIDER, 0, {
      [`${E2E_CONTRACTS.registry}:get_provider`]: { status: 0 },
    });
    await mockBackend(page, {
      provider: { ...CLINIC, status: 'Pending', services: [] },
      vouchers: [],
    });

    await page.goto('/clinic');
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();

    await expectState(page, 'Register the clinic', 'done');
    await expectState(page, 'Wait for verification', 'current');
    await expect(step(page, 'Wait for verification')).toContainText(
      'An administrator must verify the clinic.',
    );
    await expect(page.getByText('1 of 5 done')).toBeVisible();
  });

  test('a verified clinic without services is asked to list one', async ({ page }) => {
    await useMockWallet(page, PROVIDER);
    await mockBackend(page, {
      provider: { ...CLINIC, services: [] },
      vouchers: [],
    });

    await page.goto('/clinic');
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();

    await expectState(page, 'Register the clinic', 'done');
    await expectState(page, 'Wait for verification', 'done');
    await expectState(page, 'List a service', 'current');
    await expect(step(page, 'List a service')).toContainText(
      'Add your first service and price below so funders can buy it.',
    );
    await expectState(page, 'Claim a voucher', 'pending');
    await expect(page.getByText('2 of 5 done')).toBeVisible();

    // The checklist must fit the viewport at both project widths.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows).toBe(false);
  });

  test('a funded voucher is the next thing to claim', async ({ page }) => {
    await useMockWallet(page, PROVIDER);
    await mockBackend(page, {
      provider: CLINIC,
      vouchers: [FUNDED_VOUCHER('301')],
    });

    await page.goto('/clinic');
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();

    await expectState(page, 'List a service', 'done');
    await expectState(page, 'Claim a voucher', 'current');
    await expect(step(page, 'Claim a voucher')).toContainText(
      'A voucher is waiting below. Mark the patient seen to claim it.',
    );
    await expectState(page, 'Get paid', 'pending');
  });

  test('claimed care waits for the attester before payment', async ({ page }) => {
    await useMockWallet(page, PROVIDER);
    await mockBackend(page, {
      provider: CLINIC,
      vouchers: [CLAIMED_VOUCHER('302')],
    });

    await page.goto('/clinic');
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();

    await expectState(page, 'Claim a voucher', 'done');
    await expectState(page, 'Get paid', 'current');
    await expect(step(page, 'Get paid')).toContainText(
      'An independent attester confirms it before payment.',
    );
    await expect(page.getByText('4 of 5 done')).toBeVisible();
  });

  test('a clinic with a settled voucher sees every step done', async ({ page }) => {
    await useMockWallet(page, PROVIDER);
    await mockBackend(page, {
      provider: CLINIC,
      vouchers: [settledVoucher('303')],
    });

    await page.goto('/clinic');
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();

    for (const label of [
      'Register the clinic',
      'Wait for verification',
      'List a service',
      'Claim a voucher',
      'Get paid',
    ]) {
      await expectState(page, label, 'done');
    }
    await expect(page.getByText('5 of 5 done')).toBeVisible();
    await expect(
      page.getByText('All five steps are complete. Settled payments appear in Earnings.'),
    ).toBeVisible();
  });
});
