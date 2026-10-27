import { expect, test, type Page } from '@playwright/test';

import { CLAIMED_VOUCHER, CLINIC, FUNDER } from './fixtures';
import { mockBackend, useMockWallet } from './helpers';

/**
 * Installable app and offline shell (#74).
 *
 * Three separate promises are checked, and they are different promises:
 *
 * 1. the browser is *allowed* to install the app — a manifest it can parse,
 *    icons it can decode at the sizes the install prompt requires;
 * 2. the shell is there when the network is not — the frame renders from the
 *    cache, and says it cannot reach the indexer, which is the truth;
 * 3. nothing with patient context is ever written to that cache — the API
 *    answer is fetched in the third test, and the cache is inspected for it
 *    afterwards.
 *
 * Service workers are blocked for every other suite (see
 * playwright.config.ts); this is the one place they run for real.
 */

test.use({ serviceWorkers: 'allow' });

/** Every URL currently cached, in every cache this origin owns. */
async function cachedUrls(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const urls: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(request.url);
    }
    return urls;
  });
}

/** Resolves once a service worker controls this page. */
async function waitForController(page: Page): Promise<void> {
  await expect
    .poll(
      () => page.evaluate(() => navigator.serviceWorker?.controller != null),
      { timeout: 15_000 },
    )
    .toBe(true);
}

test('the manifest and its icons make the app installable', async ({ page }) => {
  await page.goto('/');

  const href = await page.getAttribute('link[rel="manifest"]', 'href');
  expect(href).toBe('/manifest.webmanifest');

  const manifest = (await page.evaluate(
    async (url) => (await fetch(url as string)).json(),
    href,
  )) as {
    name: string;
    short_name: string;
    start_url: string;
    display: string;
    theme_color: string;
    icons: { src: string; sizes: string; type: string; purpose?: string }[];
  };

  expect(manifest.name).toContain('SCI Healthcare');
  expect(manifest.short_name).toBe('SCI Healthcare');
  expect(manifest.start_url).toBe('/');
  expect(manifest.display).toBe('standalone');
  // The app's own brand colour, so the install/splash chrome matches.
  expect(manifest.theme_color).toBe('#0f766e');

  // Chromium will not offer to install without both sizes.
  const sizes = manifest.icons.map((icon) => icon.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);

  for (const icon of manifest.icons) {
    const response = await page.request.get(icon.src);
    expect(response.status(), icon.src).toBe(200);
    expect(response.headers()['content-type']).toContain(icon.type);
  }

  // An image that does not decode is not an icon: check the real dimensions the
  // generator claims, in the browser that would have to render them.
  const decoded = await page.evaluate(async (sources: string[]) => {
    const load = (src: string) =>
      new Promise<[string, number]>((resolve) => {
        const image = new Image();
        image.onload = () => resolve([src, image.naturalWidth]);
        image.onerror = () => resolve([src, 0]);
        image.src = src;
      });
    return Promise.all(sources.map(load));
  }, manifest.icons.map((icon) => icon.src));

  const dimensions = Object.fromEntries(decoded);
  expect(dimensions['/icons/icon.svg']).toBeGreaterThan(0);
  delete dimensions['/icons/icon.svg'];
  expect(dimensions).toEqual({
    '/icons/icon-192.png': 192,
    '/icons/icon-512.png': 512,
    '/icons/icon-maskable-512.png': 512,
  });
});

test('the shell loads offline, and the app still asks the indexer', async ({
  page,
  context,
}) => {
  // No backend is mocked here on purpose: the API must be unreachable so the
  // assertions are about the shell, not about planted data.
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('http://localhost:8080')) {
      apiRequests.push(request.url());
    }
  });

  await page.goto('/');
  await waitForController(page);
  const origin = await page.evaluate(() => location.origin);

  // The document is in the cache, so the frame can be painted with no
  // network at all.
  await expect
    .poll(async () => (await cachedUrls(page)).includes(`${origin}/`))
    .toBe(true);
  expect(apiRequests.length, 'the app should have called the indexer').toBeGreaterThan(0);

  const whileOnline = apiRequests.length;

  await context.setOffline(true);
  const reloaded = await page.reload();

  // The document itself came from the worker's cache, not from the browser's
  // HTTP cache or a still-open connection.
  expect(reloaded?.fromServiceWorker(), 'reload should be served by the worker').toBe(true);

  // Header, footer and nav come from the cached shell...
  await expect(page.getByRole('link', { name: 'SCI Healthcare' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Footer navigation' }),
  ).toBeVisible();
  // ...and the data does not: offline, the app asks the indexer, fails, and
  // says so. A cached API answer would have hidden that — and, worse, could
  // be a voucher state from any time in the past.
  await expect(page.getByText(/Cannot reach the API/)).toBeVisible();
  expect(apiRequests.length).toBeGreaterThan(whileOnline);
});

test('indexer data is never cached, however patient-shaped it is', async ({ page }) => {
  await useMockWallet(page, FUNDER);
  await mockBackend(page, {
    providers: [CLINIC],
    vouchers: [CLAIMED_VOUCHER('7')],
    voucherById: { 7: CLAIMED_VOUCHER('7') },
  });

  await page.goto('/');
  await expect(page.getByText('Ikeja General Clinic')).toBeVisible();
  await waitForController(page);

  // Give the worker every chance to cache something it should not: visit the
  // routes that carry a voucher id and a beneficiary reference.
  await page.goto('/vouchers/7');
  await expect(page.getByText('History')).toBeVisible();
  await page.goto('/my');
  await expect(page.getByText('Vouchers I funded')).toBeVisible();

  const urls = await cachedUrls(page);
  const paths = urls.map((url) => new URL(url).pathname);

  // The shell is cached...
  expect(urls.some((url) => url.endsWith('/'))).toBe(true);
  // ...the API host and the RSC payloads are not, and neither is any route
  // that names a clinic or a voucher.
  expect(urls.filter((url) => url.includes('localhost:8080'))).toEqual([]);
  expect(paths.filter((path) => /^\/(clinics|vouchers|my)\b/.test(path))).toEqual([]);
  expect(urls.filter((url) => url.includes('_rsc='))).toEqual([]);
});
