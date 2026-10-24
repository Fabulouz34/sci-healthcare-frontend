import { expect, test, type Page } from '@playwright/test';

import { blockAnalytics } from '../analytics-guard';
import { CLAIMED_VOUCHER, CLINIC, FUNDER, PROVIDER } from './fixtures';
import { mockBackend, useMockWallet } from './helpers';

/**
 * Security headers (#73).
 *
 * Two things are checked here, and they are different questions:
 *
 * 1. The policy names exactly the origins the app needs — the indexer API,
 *    Soroban RPC, Horizon, the wallet hosts the SEP-43 kit talks to — and
 *    the companion headers (framing, referrer, permissions) are present on
 *    every route.
 * 2. Normal use produces no violations at all, which is what makes flipping
 *    the policy from report-only to enforcing (CSP_ENFORCE=1 at build time)
 *    safe. The policy ships as report-only by default, so a violation here
 *    is reported by the browser rather than breaking the page — which is
 *    exactly what makes this assertable.
 *
 * An injected third-party script is the threat the policy exists for, so the
 * last test injects one and expects the browser to report it as refused.
 */

declare global {
  interface Window {
    __cspViolations?: { blockedURI: string; effectiveDirective: string }[];
  }
}

/** Records `securitypolicyviolation` events from the first script onwards. */
async function recordViolations(page: Page): Promise<void> {
  await page.addInitScript(`
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push({
        blockedURI: event.blockedURI,
        effectiveDirective: event.effectiveDirective,
      });
    });
  `);
}

async function violations(
  page: Page,
): Promise<{ blockedURI: string; effectiveDirective: string }[]> {
  return page.evaluate(() => window.__cspViolations ?? []);
}

test.beforeEach(async ({ page }) => {
  await recordViolations(page);
  await blockAnalytics(page);
  await page.route('**tile.openstreetmap.org/**', (route) => route.abort());
  await page.route('**/soroban-testnet.stellar.org/**', (route) => route.abort());
  await page.route('https://evil.example/**', (route) => route.abort());
});

test('the policy names only the origins the app needs', async ({ page }) => {
  const response = await page.goto('/');
  const headers = response?.headers() ?? {};
  const csp =
    headers['content-security-policy-report-only'] ??
    headers['content-security-policy'];

  expect(csp, 'a CSP must be sent with the document').toBeTruthy();

  // The read API, Soroban RPC and Horizon: reads, EventSource and every
  // contract write go to one of the three.
  expect(csp).toContain('http://localhost:8080');
  expect(csp).toContain('https://soroban-testnet.stellar.org');
  expect(csp).toContain('https://horizon-testnet.stellar.org');

  // Wallet hosts reachable from the page (extensions are not subject to CSP).
  expect(csp).toContain('https://albedo.link');
  expect(csp).toContain('https://wallet.xbull.app');
  expect(csp).toContain('https://stellar.creit.tech');

  // Map tiles, and the analytics origin the test build enables.
  expect(csp).toContain('https://tile.openstreetmap.org');
  expect(csp).toContain('https://plausible.io');

  // Trusted Types (#147): the DOM sinks that script-src cannot see are
  // covered by the same policy, report-only until CSP_ENFORCE=1.
  expect(csp).toContain("require-trusted-types-for 'script'");
  expect(csp).toContain(
    "trusted-types default sci-healthcare 'allow-duplicates'",
  );

  // Nothing is open by default, and nothing is wildcarded.
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("form-action 'self'");
  expect(csp).not.toContain('*');

  // Companion headers.
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
  expect(headers['permissions-policy']).toContain('geolocation=()');
});

test('normal use on every route reports no violations', async ({ page }) => {
  await useMockWallet(page, FUNDER);
  await mockBackend(page, {
    provider: CLINIC,
    vouchers: [CLAIMED_VOUCHER('7')],
    voucherById: { 7: CLAIMED_VOUCHER('7') },
  });

  // The routes a person actually walks: directory, clinic detail, own
  // vouchers, one voucher, clinic desk, attest, stats, wallet-facing pages.
  const routes = [
    '/',
    `/clinics/${PROVIDER}`,
    '/my',
    '/vouchers/7',
    '/clinic',
    '/attest',
    '/stats',
    '/attesters',
    '/how-it-works',
    '/faq',
    '/privacy',
  ];

  for (const route of routes) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    expect(await violations(page), `violations on ${route}`).toEqual([]);
  }
});

test('an injected third-party script is refused', async ({ page }) => {
  await page.goto('/');
  expect(await violations(page)).toEqual([]);

  // Trusted Types is the first line here: the `default` policy (#147)
  // allows this origin and plausible.io only, and its `createScriptURL`
  // throws for anything else — whether the CSP is enforcing or report-only.
  // Without that, script-src would report the load instead.
  const refused = await page.evaluate(() => {
    const script = document.createElement('script');
    try {
      script.src = 'https://evil.example/steal.js';
    } catch (error) {
      return String(error);
    }
    document.head.appendChild(script);
    return null;
  });

  expect(refused).not.toBeNull();
  expect(refused).toMatch(/not allowed|TrustedScriptURL/i);

  // The script never reached the DOM and no CSP report was needed: the
  // policy refused it before the network.
  expect(await violations(page)).toEqual([]);
});
