import { expect, test, type Page } from '@playwright/test';

import { CLINIC } from './fixtures';
import { mockBackend } from './helpers';

/**
 * Analytics opt-out (#143).
 *
 * The app must stop talking to Plausible when the visitor opts out, and
 * must never start when the browser sends Do Not Track. Both are asserted
 * against the network, not just the UI: a switch that only flips a label
 * would still leak the pageview.
 */

declare global {
  interface Window {
    plausible?: (...args: unknown[]) => void;
    __sciAnalyticsEvents?: unknown[][];
  }
}

// Only pageview/custom events are gated by the opt-out. Core Web Vitals
// reports (e.g. ["LCP", {props: {...}}]) are a separate stream and are
// excluded here so this spec asserts the opt-out contract alone.
const VITAL_NAMES = new Set(['core_web_vitals', 'LCP', 'CLS', 'INP', 'FCP', 'TTFB']);

function isGatedEvent(e: unknown[]): boolean {
  return e.length > 0 && !VITAL_NAMES.has(String(e[0]));
}

/**
 * Records requests to Plausible's script and event endpoints. The Plausible
 * script (script.manual.js) is a *third-party script load*, so it is also
 * recorded here: a DNT or opted-out visitor must not even load it.
 */
async function recordAnalytics(page: Page): Promise<string[]> {
  const requests: string[] = [];
  // Intercept rather than block with useMockWallet so the spec can assert
  // that no request was even attempted.
  await page.route('https://plausible.io/**', (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  await page.addInitScript(`
    window.plausible = function (...args) {
      (window.__sciAnalyticsEvents ??= []).push(args);
    };
  `);
  return requests;
}

/** Only gated (non-vitals) requests count against the opt-out contract. */
function gatedRequests(requests: string[]): string[] {
  return requests.filter((url) => !url.endsWith('/js/script.manual.js'));
}

async function events(page: Page): Promise<unknown[][]> {
  return page.evaluate(() => window.__sciAnalyticsEvents ?? []);
}

test.describe('analytics opt-out', () => {
  test('sends a pageview when analytics is on (positive control)', async ({ page }) => {
    const requests = await recordAnalytics(page);
    await mockBackend(page, { provider: CLINIC });

    await page.goto('/');

    await expect
      .poll(() => requests.length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    await expect
      .poll(async () => (await events(page)).filter((e) => e[0] === 'pageview').length)
      .toBe(1);
  });

  test('respects Do Not Track without any interaction', async ({ page }) => {
    const requests = await recordAnalytics(page);
    await page.addInitScript(`
      Object.defineProperty(navigator, 'doNotTrack', {
        configurable: true,
        get: () => '1',
      });
    `);
    await mockBackend(page, { provider: CLINIC });

    await page.goto('/');

    const toggle = page.getByRole('switch', { name: 'Usage analytics' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    // Give the afterInteractive script every chance to load before
    // asserting that it did not.
    await page.waitForTimeout(500);
    expect(gatedRequests(requests)).toEqual([]);
    // Only the pageview/custom event stream is gated; the injected
    // recorder must not receive any gated event payloads.
    expect((await events(page)).filter(isGatedEvent)).toEqual([]);
  });

  test('stops all requests once the visitor turns it off', async ({ page }) => {
    const requests = await recordAnalytics(page);
    await mockBackend(page, { provider: CLINIC });

    await page.goto('/privacy');
    const toggle = page.getByRole('switch', { name: 'Usage analytics' }).first();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    // Let the first page's script request land before clearing the log, so
    // the assertion below is about requests made after the choice.
    await expect
      .poll(() => requests.length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    requests.length = 0;
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(
      await page.evaluate(() => window.localStorage.getItem('sci-analytics')),
    ).toBe('1');

    // A fresh document starts with the opt-out already stored, so neither
    // the script nor a pageview may be requested.
    await page.goto('/');
    await page.waitForTimeout(500);

    expect(gatedRequests(requests)).toEqual([]);
    // Only gated (pageview/custom) events count; Core Web Vitals reports
    // are a separate stream and are filtered out by isGatedEvent.
    expect((await events(page)).filter(isGatedEvent)).toEqual([]);
  });
});
