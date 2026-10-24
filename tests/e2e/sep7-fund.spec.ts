import { expect, test } from '@playwright/test';

import { E2E_CONTRACTS } from './contracts';
import { CLINIC, FUNDER } from './fixtures';
import { mockBackend, mockInvokes, useMockWallet } from './helpers';

/**
 * SEP-7 funding (#162): build the `create_voucher` transaction, hand it to a
 * wallet as a `web+stellar:tx` link, and confirm the voucher once the wallet
 * submits it.
 *
 * The mocked RPC records the prepared call, so the test can assert the link
 * carries a real prepared envelope and that the panel waits for the ledger
 * rather than assuming success when the link is opened.
 */

test.beforeEach(async ({ page }) => {
  await useMockWallet(page, FUNDER);
  await mockBackend(page, { provider: CLINIC });
});

test('fund a voucher through a SEP-7 payment link', async ({ page }) => {
  await page.goto(`/clinics/${CLINIC.address}`);

  await page.getByPlaceholder('e.g. clinic card number').fill('CARD-123');
  await page.getByPlaceholder('stays on this device').fill('s'.repeat(32));

  // The panel is opt-in: the extension-wallet flow stays the default.
  await page.getByText('Pay from a mobile wallet').click();
  const create = page.getByRole('button', { name: 'Create SEP-7 payment link' });
  await expect(create).toBeEnabled();
  await create.click();

  const walletLink = page.getByRole('link', { name: 'Open in wallet' });
  await expect(walletLink).toBeVisible();

  const href = await walletLink.getAttribute('href');
  expect(href).toBeTruthy();
  expect(href).toContain('web+stellar:tx?');
  expect(href).toContain('xdr=');
  expect(href).toContain('msg=Care%20voucher');
  // Testnet wallets must be told which network to sign for; the public
  // network is the SEP-7 default, so omitting this would fund nothing.
  expect(decodeURIComponent(href!)).toContain(
    'Test SDF Network ; September 2015',
  );

  await expect(page.getByAltText('SEP-7 payment QR code')).toBeVisible();
  await expect(page.getByText('Waiting for the wallet to submit…')).toBeVisible();

  // The same `create_voucher` call the local signer would build, prepared and
  // simulated for the wallet instead.
  expect(await mockInvokes(page)).toContainEqual({
    kind: 'invoke',
    contractId: E2E_CONTRACTS.voucher,
    method: 'create_voucher',
  });

  // Opening the link does not prove payment: only the poller finding the
  // transaction does.
  await page.evaluate(() => {
    window.__SCI_MOCK_SEP7__ = { hash: 'a'.repeat(64) };
  });

  await expect(page.getByText('Payment confirmed.')).toBeVisible({
    timeout: 15_000,
  });
  // Both the panel and the toast link to the transaction; scope to the panel.
  await expect(
    page.locator('details').getByRole('link', { name: 'View transaction' }),
  ).toHaveAttribute(
    'href',
    new RegExp(`/explorer/testnet/tx/${'a'.repeat(64)}$`),
  );
});
