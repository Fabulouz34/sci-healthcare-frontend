import { expect, test, type Page } from '@playwright/test';

import {
  CLAIMED_VOUCHER,
  CLINIC,
  FUNDED_VOUCHER,
  FUNDER,
  PATIENT_IDENTIFIER,
  PATIENT_KEY,
  PROVIDER,
} from './fixtures';
import { mockBackend, useMockWallet } from './helpers';

/**
 * Privacy: analytics must never carry identifiers.
 *
 * The Plausible script request itself is blocked (see useMockWallet) while
 * `window.plausible` is stubbed to record what the app *would* send. Every
 * assertion below scans the full payload: pageviews must use normalized
 * routes and funnel events must be names without properties.
 */

declare global {
  interface Window {
    plausible?: (...args: unknown[]) => void;
    __sciAnalyticsEvents?: unknown[][];
  }
}

/**
 * Core Web Vitals reporter entries. Metric events carry a `{ props: { value } }`
 * payload (see the LCP entry in the failing logs), so they are recognised by
 * name and excluded from the prop-less funnel checks.
 */
const VITAL_NAMES = new Set(['core_web_vitals', 'LCP', 'CLS', 'INP', 'FCP', 'TTFB']);

/**
 * Analytics events that are not gated by the opt-out (Core Web Vitals reports
 * are a separate, non-identifying stream). Used to filter the recorder output.
 */
function isGatedEvent(e: unknown[]): boolean {
  return e[0] === 'pageview' || !VITAL_NAMES.has(String(e[0]));
}

async function recordAnalytics(page: Page): Promise<void> {
  await page.addInitScript(`
    window.plausible = function (...args) {
      (window.__sciAnalyticsEvents ??= []).push(args);
    };
  `);
}

async function analyticsEvents(page: Page): Promise<unknown[][]> {
  return page.evaluate(() => window.__sciAnalyticsEvents ?? []);
}

async function pageviewUrls(page: Page): Promise<string[]> {
  const events = await analyticsEvents(page);
  return events
    .filter((e) => e[0] === 'pageview')
    .map((e) => (e[1] as { u: string }).u);
}

/** Polls until the current page has recorded exactly the expected pageviews. */
async function expectPageviews(page: Page, urls: string[]): Promise<void> {
  await expect
    .poll(() => pageviewUrls(page), { timeout: 10000 })
    .toEqual(urls);
}

/** Nothing identifying may appear in any recorded payload. */
function expectNoIdentifiers(events: unknown[][], secrets: string[]): void {
  const blob = JSON.stringify(events);
  for (const secret of secrets) expect(blob).not.toContain(secret);
  expect(blob).not.toMatch(/[0-9a-f]{64}/);
}

/** Core Web Vitals entries (by name). */
function coreVitalsEvents(events: unknown[][]): unknown[][] {
  return events.filter((e) => VITAL_NAMES.has(String(e[0])));
}

/**
 * Funnel events are the non-pageview, non-vitals entries. Funnel events are
 * prop-less by contract: only the event name, nothing after it.
 */
function funnelEvents(events: unknown[][]): unknown[][] {
  return events.filter((e) => e[0] !== 'pageview' && !VITAL_NAMES.has(String(e[0])));
}

/** Flattens recorded events to their names and string arguments only. */
function eventNames(events: unknown[][]): unknown[] {
  return events.flat().filter((v) => typeof v === 'string');
}

test('pageviews use normalized routes, never identifiers', async ({ page }) => {
  await recordAnalytics(page);
  await useMockWallet(page, FUNDER);
  await mockBackend(page, {
    provider: CLINIC,
    voucherById: { 7: CLAIMED_VOUCHER('7') },
  });

  // The recorder resets on every navigation, so each page is asserted
  // before moving on.
  await page.goto('/');
  await expectPageviews(page, ['http://127.0.0.1:3100/']);
  expectNoIdentifiers(await analyticsEvents(page), [FUNDER, PROVIDER]);

  await page.goto(`/clinics/${PROVIDER}`);
  await expect(page.getByText('Fund care')).toBeVisible();
  await expectPageviews(page, ['http://127.0.0.1:3100/clinics/[address]']);
  expectNoIdentifiers(await analyticsEvents(page), [FUNDER, PROVIDER]);

  await page.goto('/vouchers/7');
  await expect(page.getByText('History')).toBeVisible();
  await expectPageviews(page, ['http://127.0.0.1:3100/vouchers/[id]']);
  expectNoIdentifiers(await analyticsEvents(page), [FUNDER, PROVIDER]);
});

test('funding records a prop-less event', async ({ page }) => {
  await recordAnalytics(page);
  await useMockWallet(page, FUNDER);
  await mockBackend(page, {
    provider: CLINIC,
    voucherById: { 7: CLAIMED_VOUCHER('7') },
  });

  await page.goto(`/clinics/${CLINIC.address}`);
  await page.getByPlaceholder('e.g. clinic card number').fill('CARD-123');
  await page.getByPlaceholder('stays on this device').fill('s'.repeat(32));
  await page.getByRole('button', { name: 'Fund voucher' }).click();
  // Funding now goes through a review step (#22).
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Voucher funded.')).toBeVisible();

  await expect
    .poll(async () => eventNames(await analyticsEvents(page)), { timeout: 10000 })
    .toContain('voucher_funded');

  const events = await analyticsEvents(page);
  expectNoIdentifiers(events, [FUNDER, PROVIDER, 'CARD-123', '30000000']);
  for (const e of funnelEvents(events)) {
    expect(e).toHaveLength(1);
  }
});

test('claiming records a prop-less event', async ({ page }) => {
  await recordAnalytics(page);
  await useMockWallet(page, PROVIDER);
  await mockBackend(page, {
    provider: CLINIC,
    vouchers: [FUNDED_VOUCHER('31')],
    // Indexer catches up to the claim a few polls in (#9).
    voucherConverges: { status: 'Claimed' },
  });

  await page.goto('/clinic');
  // Claiming needs a matching patient check at the desk (#33).
  await page.getByRole('button', { name: 'Verify patient' }).click();
  await page.getByLabel('Patient reference').fill(PATIENT_IDENTIFIER);
  await page.getByLabel('Patient secret key').fill(PATIENT_KEY);
  await page.getByRole('button', { name: 'Check patient' }).click();
  await expect(page.getByText('Match.')).toBeVisible();
  await page.getByRole('button', { name: 'Mark patient seen' }).click();
  await expect(page.getByText('Done.')).toBeVisible();

  // Wait for the claim event to be recorded; the reporter can flush after
  // the UI settles, so a synchronous read is racy.
  await expect
    .poll(async () => eventNames(await analyticsEvents(page)), { timeout: 10000 })
    .toContain('voucher_claimed');

  const events = await analyticsEvents(page);
  expectNoIdentifiers(events, [FUNDER, PROVIDER]);
  for (const e of funnelEvents(events)) {
    expect(e).toHaveLength(1);
  }
});

test('core web vitals are reported once per page view', async ({ page }) => {
  await recordAnalytics(page);
  await useMockWallet(page, FUNDER);
  await mockBackend(page, {
    provider: CLINIC,
    voucherById: { 7: CLAIMED_VOUCHER('7') },
  });

  await page.goto('/');
  await expectPageviews(page, ['http://127.0.0.1:3100/']);

  // Vitals arrive after the page settles; wait for the reporter to flush.
  await expect
    .poll(async () => coreVitalsEvents(await analyticsEvents(page)), {
      timeout: 10000,
    })
    .toHaveLength(1);

  const events = await analyticsEvents(page);
  const vitals = coreVitalsEvents(events);
  // No identifiers in any vitals payload.
  expectNoIdentifiers(vitals, [FUNDER, PROVIDER]);

  // Navigating away and back must not double-report for the same page view.
  await page.goto(`/clinics/${PROVIDER}`);
  await expect(page.getByText('Fund care')).toBeVisible();
  await expectPageviews(page, ['http://127.0.0.1:3100/clinics/[address]']);
  await expect
    .poll(async () => coreVitalsEvents(await analyticsEvents(page)), {
      timeout: 10000,
    })
    .toHaveLength(1);
});
