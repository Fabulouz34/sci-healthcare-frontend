import type { Page } from '@playwright/test';

/**
 * Mocked read-model payloads for visual snapshots.
 *
 * Dates are fixed (never "now") and amounts are base-unit strings, so the
 * rendered output is identical on every run. The clock is frozen separately
 * (see freezeClock) so relative helpers like the dispute-window countdown
 * cannot drift between the two project viewports.
 */

export const CLINIC_ADDRESS =
  'GCKX5KAFVF7GLFZ3JWQGJ4F62RYYZU67PI3TACBGKVPJ73JELMI3L4KR';

const CLINIC_B_ADDRESS =
  'GDIY5KAFVF7GLFZ3JWQGJ4F62RYYZU67PI3TACBGKVPJ73JELMI3AAAAA';

export const VOUCHER_ID = '1';

/** Frozen "now" for every snapshot: 2026-06-15T12:00:00Z. */
export const FROZEN_NOW_ISO = '2026-06-15T12:00:00.000Z';

export const stats = {
  providers: 2,
  activeProviders: 2,
  vouchers: 12,
  settledVouchers: 5,
  settledValue: '250000000',
  receipts: 5,
};

const services = [
  {
    code: 101,
    label: 'Outpatient consult',
    price: '30000000',
    priceDisplay: '3.00',
    active: true,
  },
  {
    code: 102,
    label: 'Malaria test',
    price: '50000000',
    priceDisplay: '5.00',
    active: true,
  },
  {
    code: 201,
    label: 'Antenatal visit',
    price: '100000000',
    priceDisplay: '10.00',
    active: true,
  },
];

export const providersList = {
  total: 2,
  providers: [
    {
      address: CLINIC_ADDRESS,
      name: 'Ikeja General Clinic',
      country: 'NG',
      status: 'Active',
      registeredAt: '2026-04-01T00:00:00.000Z',
      // Published coordinates (contracts #10 metadata): appears on the map.
      location: { lat: 6.6018, lng: 3.3515 },
      services,
    },
    {
      address: CLINIC_B_ADDRESS,
      name: 'Lekki Care Centre',
      country: 'NG',
      status: 'Active',
      registeredAt: '2026-04-10T00:00:00.000Z',
      // No published location: listed below the map instead.
      services: services.slice(0, 2),
    },
  ],
};

export const providerDetail = providersList.providers[0];

export const voucherDetail = {
  id: VOUCHER_ID,
  funder: 'GFUNDERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAXYZ',
  beneficiaryRef: 'ab'.repeat(32),
  provider: {
    address: CLINIC_ADDRESS,
    name: 'Ikeja General Clinic',
    country: 'NG',
  },
  serviceCode: 101,
  serviceLabel: 'Outpatient consult',
  amount: '30000000',
  amountDisplay: '3.00',
  status: 'Attested',
  createdAt: '2026-05-20T10:00:00.000Z',
  expiresAt: '2026-06-19T10:00:00.000Z',
  claimedAt: '2026-05-22T10:00:00.000Z',
  attestedAt: '2026-05-23T10:00:00.000Z',
  // In the past relative to FROZEN_NOW_ISO, so the timeline renders "Closed"
  // deterministically instead of depending on the real clock.
  disputeDeadline: '2026-05-30T10:00:00.000Z',
  settledNet: null,
  settledFee: null,
  disputeReason: null,
  refundableAt: '2026-07-01T00:00:00.000Z',
  isSettleable: true,
  isRefundable: false,
  receipt: null,
};

/** Freeze Date.now so relative time never drifts between runs. */
export async function freezeClock(page: Page): Promise<void> {
  await page.addInitScript(
    `Date.now = () => new Date('${FROZEN_NOW_ISO}').getTime();`,
  );
}

/** Never hit the real RPC in snapshots; quotes fail silently by design. */
export async function blockRpc(page: Page): Promise<void> {
  await page.route(
    '**/soroban-testnet.stellar.org/**',
    (route) => route.abort(),
  );
}

/**
 * Serve the read model from fixtures. Anything unmocked returns an empty
 * list so disconnected pages (no wallet, no fetch) stay untouched and no
 * test ever reaches the real backend.
 *
 * Scoped to the API host on purpose: a bare `**\/vouchers**` pattern would
 * also match the app's own `/vouchers/[id]` page navigation and serve it
 * JSON instead of HTML.
 */
export async function mockApi(page: Page): Promise<void> {
  await page.route('http://localhost:8080/**', (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split('/').filter(Boolean);
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (parts[0] === 'stats') {
      if (parts[1] === 'daily') {
        return json({
          days: 30,
          from: '2026-05-16T00:00:00.000Z',
          to: '2026-06-15T00:00:00.000Z',
          series: [
            {
              date: '2026-06-01',
              funded: { count: 3, amount: '90000000' },
              settled: { count: 2, amount: '60000000' },
              refunded: { count: 0, amount: '0' },
            },
            {
              date: '2026-06-10',
              funded: { count: 9, amount: '160000000' },
              settled: { count: 3, amount: '190000000' },
              refunded: { count: 0, amount: '0' },
            },
          ],
        });
      }
      return json(stats);
    }

    if (parts[0] === 'attesters') {
      return json({
        total: 2,
        limit: 50,
        offset: 0,
        attesters: [
          {
            address: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAA',
            active: true,
            addedAt: '2026-01-15T10:00:00.000Z',
            removedAt: null,
            attestations: 14,
            name: 'Red Cross Clinical Inspector',
            organisation: 'International Medical Verification',
          },
          {
            address: 'GBTYQNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVBBB',
            active: true,
            addedAt: '2026-02-01T10:00:00.000Z',
            removedAt: null,
            attestations: 8,
            name: 'State Health Board Auditor',
            organisation: 'Public Health Oversight Agency',
          },
        ],
      });
    }

    if (parts[0] === 'receipts') {
      return json({ total: 0, totalSpendDisplay: '0.00', receipts: [] });
    }

    if (parts[0] === 'providers') {
      if (url.searchParams.get('status') === 'Pending') {
        return json({
          total: 1,
          providers: [{ ...providersList.providers[0], status: 'Pending' }],
        });
      }
      // /providers/<address> — the last segment is the address.
      if (parts.length === 2) {
        const found = providersList.providers.find((p) => p.address === parts[1]);
        if (found) return json(found);
        return json({ message: 'Not found' }, 404);
      }
      return json(providersList);
    }

    if (parts[0] === 'vouchers') {
      if (url.searchParams.get('status') === 'Disputed') {
        return json({
          total: 1,
          vouchers: [{
            ...voucherDetail,
            funder: 'GFUNDERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAXYZ',
            status: 'Disputed',
            disputeReason: 2,
          }],
        });
      }
      // /vouchers/<id>/events — a pre-#13 indexer answers 404, so the
      // timeline snapshot shows dates without "view transaction" links.
      if (parts.length === 3 && parts[2] === 'events') {
        return json({ message: 'Not found' }, 404);
      }
      // /vouchers/<id>
      if (parts.length === 2) {
        if (parts[1] === VOUCHER_ID) return json(voucherDetail);
        return json({ message: 'Not found' }, 404);
      }
      return json({ total: 0, vouchers: [] });
    }

    return route.continue();
  });
}

/**
 * Kill CSS motion and wait for the app to settle before screenshotting.
 * Call after navigation, before expect(page).toHaveScreenshot().
 */
export async function settle(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }',
  });
  await page.waitForLoadState('networkidle');
}
