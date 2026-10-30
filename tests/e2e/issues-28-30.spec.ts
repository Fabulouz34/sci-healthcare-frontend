import { expect, test } from '@playwright/test';

import { blockAnalytics } from '../analytics-guard';
import { CLINIC, FUNDER, FUNDED_VOUCHER } from './fixtures';
import { mockBackend, mockInvokes, useMockWallet } from './helpers';

test.beforeEach(async ({ page }) => {
  await blockAnalytics(page);
});

test('previews and refreshes the network fee without signing', async ({ page }) => {
  await useMockWallet(page, FUNDER);
  await mockBackend(page, { provider: CLINIC });

  await page.goto(`/clinics/${CLINIC.address}`);
  const estimate = page.getByRole('status').filter({ hasText: 'Estimated network fee:' });
  await expect(estimate).toHaveText('Estimated network fee: 0.01 XLM');

  const firstSimulationCount = await page.evaluate(
    () => window.__SCI_MOCK_RPC__?.calls.filter((call) => call.kind === 'simulate').length ?? 0,
  );
  expect(firstSimulationCount).toBeGreaterThan(0);
  expect(await mockInvokes(page)).toEqual([]);

  await page.getByLabel('Amount (USDC)').fill('4.25');
  await expect(page.getByLabel('Amount (USDC)')).toHaveValue('4.25');
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__SCI_MOCK_RPC__?.calls.filter((call) => call.kind === 'simulate').length ?? 0,
      ),
    )
    .toBeGreaterThan(firstSimulationCount);
  await expect(estimate).toHaveText('Estimated network fee: 0.01 XLM');
  expect(await mockInvokes(page)).toEqual([]);
});

test('fund again prefills public funding details but requires the patient key again', async ({
  page,
}) => {
  const voucher = FUNDED_VOUCHER('280');
  await mockBackend(page, { provider: CLINIC, voucherById: { '280': voucher } });

  await page.goto('/vouchers/280');
  const fundAgain = page.getByRole('link', { name: 'Fund again' });
  await expect(fundAgain).toHaveAttribute(
    'href',
    `/clinics/${CLINIC.address}?service=101&amount=3.00`,
  );
  await fundAgain.click();

  await expect(page.getByLabel('Amount (USDC)')).toHaveValue('3.00');
  await expect(page.getByPlaceholder('e.g. clinic card number')).toHaveValue('');
  await expect(page.getByPlaceholder('stays on this device')).toHaveValue('');
  await expect(page).toHaveURL(/\?service=101&amount=3\.00$/);
});

test('shares a generic voucher message without the patient reference', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (payload: unknown) => {
        sessionStorage.setItem('shared-payload', JSON.stringify(payload));
      },
    });
  });
  const voucher = FUNDED_VOUCHER('290');
  await mockBackend(page, { provider: CLINIC, voucherById: { '290': voucher } });

  await page.goto('/vouchers/290');
  const shareMessage = `A healthcare voucher is ready for you: ${page.url()}`;
  await page.getByRole('button', { name: 'Share voucher' }).click();

  const sharedPayload = await page.evaluate(() => sessionStorage.getItem('shared-payload'));
  expect(sharedPayload).toContain(shareMessage);
  expect(sharedPayload).not.toContain(voucher.beneficiaryRef);

  const whatsApp = page.getByRole('link', { name: 'WhatsApp' });
  const sms = page.getByRole('link', { name: 'SMS' });
  await expect(whatsApp).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=/);
  await expect(sms).toHaveAttribute('href', /^sms:\?body=/);
  expect(decodeURIComponent((await whatsApp.getAttribute('href')) ?? '')).not.toContain(
    voucher.beneficiaryRef,
  );
  expect(decodeURIComponent((await sms.getAttribute('href')) ?? '')).not.toContain(
    voucher.beneficiaryRef,
  );
});
