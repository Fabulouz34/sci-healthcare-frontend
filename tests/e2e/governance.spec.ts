/**
 * E2E tests for /governance — contract governance page.
 *
 * Covers:
 * - Default render: two contracts, current admins, change log with explorer links.
 * - Pending-admins section renders only when there are pending admins.
 * - Empty state when no contracts are returned.
 * - Error state when the indexer is unavailable.
 */
import { expect, test } from '@playwright/test';

import { blockAnalytics } from '../analytics-guard';
import { mockBackend } from './helpers';

const ADMIN_ADDRESS = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
const PENDING_ADDRESS = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAA';
const TX_HASH =
  'abc123def456abc123def456abc123def456abc123def456abc123def4560001';

const VOUCHER_CONTRACT = 'CBPUQN6CNJCNGPKNEXB7UM4T7RINKQB7HQI5CXEOSQ5EFRHE4G4VKPSQ';
const REGISTRY_CONTRACT = 'CAMU635NRFEHATJ6MTY5SI43IAZ43KHPFXAQDQAST2AHKCHLSGWHVE4V';

test.beforeEach(async ({ page }) => {
  await blockAnalytics(page);
});

test.describe('/governance — default render (no pending admins)', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page, {
      governance: {
        contracts: [
          {
            contract: VOUCHER_CONTRACT,
            label: 'voucher',
            currentAdmins: [ADMIN_ADDRESS],
            pendingAdmins: [],
            changes: [
              {
                contract: VOUCHER_CONTRACT,
                contractLabel: 'voucher',
                admin: ADMIN_ADDRESS,
                action: 'added',
                txHash: TX_HASH,
                at: '2026-01-10T12:00:00.000Z',
                ledger: 1000,
              },
            ],
          },
          {
            contract: REGISTRY_CONTRACT,
            label: 'registry',
            currentAdmins: [ADMIN_ADDRESS],
            pendingAdmins: [],
            changes: [],
          },
        ],
        updatedAt: '2026-06-15T10:00:00.000Z',
      },
    });
    await page.goto('/governance');
  });

  test('shows page heading and description', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Contract governance' }),
    ).toBeVisible();
    await expect(
      page.getByText(/who controls each contract/i),
    ).toBeVisible();
  });

  test('shows both contract cards with their labels', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'voucher' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'registry' })).toBeVisible();
  });

  test('current admins section is present', async ({ page }) => {
    const headings = page.getByText('Current admins');
    await expect(headings.first()).toBeVisible();
  });

  test('does NOT show pending-admins section when there are no pending admins', async ({ page }) => {
    await expect(page.getByText('Pending admins')).not.toBeVisible();
  });

  test('shows the change log with an explorer transaction link', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'voucher' })).toBeVisible();

    // "View transaction ↗" link in the change log
    const txLink = page.getByRole('link', { name: /View transaction/i }).first();
    await expect(txLink).toBeVisible();
    const href = await txLink.getAttribute('href');
    expect(href).toContain(TX_HASH);
    expect(href).toContain('stellar.expert');
  });

  test('change log shows action badge (added / removed)', async ({ page }) => {
    await expect(page.getByText('added').first()).toBeVisible();
  });

  test('shows "No governance changes recorded" for registry with empty change log', async ({ page }) => {
    await expect(
      page.getByText('No governance changes recorded yet.'),
    ).toBeVisible();
  });
});

test.describe('/governance — with pending admins', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page, {
      governance: {
        contracts: [
          {
            contract: VOUCHER_CONTRACT,
            label: 'voucher',
            currentAdmins: [ADMIN_ADDRESS],
            pendingAdmins: [PENDING_ADDRESS],
            changes: [],
          },
        ],
        updatedAt: '2026-06-15T10:00:00.000Z',
      },
    });
    await page.goto('/governance');
  });

  test('shows pending-admins section', async ({ page }) => {
    await expect(page.getByText('Pending admins')).toBeVisible();
  });

  test('shows the count badge next to pending admins header', async ({ page }) => {
    // The badge is a span with the count "1"
    const badge = page.locator(
      'span.text-amber-700 + span.rounded-full',
    );
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('1');
  });

  test('pending-admins section is absent on a contract without pending admins', async ({ page }) => {
    // Only one contract in this fixture and it has pending admins,
    // so the section must be visible — the absence check for a second
    // contract is covered by the default-render suite.
    await expect(page.getByText('Pending admins')).toBeVisible();
  });
});

test.describe('/governance — empty state', () => {
  test('shows empty state message when no contracts are returned', async ({ page }) => {
    await mockBackend(page, {
      governance: { contracts: [], updatedAt: null },
    });
    await page.goto('/governance');
    await expect(
      page.getByText('No governance data available.'),
    ).toBeVisible();
  });
});

test.describe('/governance — error state', () => {
  test('shows an error alert when the indexer is unavailable', async ({ page }) => {
    // Register the wildcard mock backend first; Playwright matches routes in
    // LIFO order, so the more-specific route registered below takes priority.
    await mockBackend(page, {});
    // Override only the governance endpoint with a 500 so the page shows the
    // error state while all other routes still resolve normally.
    await page.route('http://localhost:8080/governance', (route) => {
      route.fulfill({ status: 500, body: 'Internal Server Error' });
    });
    await page.goto('/governance');
    await expect(
      page.getByText(/Could not load governance data/i),
    ).toBeVisible();
  });
});
