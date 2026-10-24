import { expect, test } from '@playwright/test';

import { ATTESTER, CLAIMED_VOUCHER, CLINIC, FUNDER } from './fixtures';
import { mockBackend, useMockWallet } from './helpers';

/**
 * "Report a problem" (#138).
 *
 * Only the funder can dispute, but a patient or relative should still be
 * able to tell someone. The link opens a prefilled GitHub issue that must
 * carry public voucher facts and nothing identifying.
 */
test.describe('Report a problem with a voucher', () => {
  test('explains who can dispute and prefills only public details', async ({ page }) => {
    const voucher = CLAIMED_VOUCHER('7');
    await useMockWallet(page, ATTESTER);
    await mockBackend(page, {
      provider: CLINIC,
      voucherById: { 7: voucher },
    });

    await page.goto('/vouchers/7');

    await expect(
      page.getByRole('heading', { name: 'Report a problem' }),
    ).toBeVisible();
    await expect(
      page.getByText(/Only the funder can open a dispute/i),
    ).toBeVisible();

    const link = page.getByRole('link', { name: /report a problem/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noreferrer');

    const href = await link.getAttribute('href');
    expect(href).toBeTruthy();

    const url = new URL(href!);
    expect(url.origin + url.pathname).toBe(
      'https://github.com/Godgift-care/sci-healthcare-frontend/issues/new',
    );
    expect(url.searchParams.get('title')).toBe('Problem with voucher #7');

    const body = url.searchParams.get('body') ?? '';
    expect(body).toContain('Voucher: #7');
    expect(body).toContain('Status: Claimed');
    expect(body).toContain('Outpatient consult');
    expect(body).toContain('Ikeja General Clinic');
    expect(body).toContain('Who can open a dispute');

    // No patient data, funder address or 64-hex digest in the URL — note
    // that URLSearchParams has already decoded the body.
    const decoded = decodeURIComponent(href!);
    expect(decoded).not.toContain(voucher.beneficiaryRef);
    expect(decoded).not.toContain(FUNDER);
    expect(decoded).not.toContain('ab'.repeat(32));
    expect(body).not.toMatch(/[0-9a-f]{32,}/i);
  });
});
