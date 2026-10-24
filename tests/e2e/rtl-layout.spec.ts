import { expect, test, type Page } from '@playwright/test';

import { blockAnalytics } from '../analytics-guard';
import { CLINIC } from './fixtures';
import { mockBackend } from './helpers';

/**
 * Right-to-left layout (#131).
 *
 * None of the shipped locales is right-to-left yet, so these tests set
 * `dir="rtl"` on the document by hand — the acceptance criterion on the
 * issue — and check that the layout really follows it. That is the whole
 * point of the change: the pages are written with logical utilities, so the
 * attribute alone has to move the header, the table alignment and the accent
 * stripes to the other side, with nothing else to remember when an Arabic
 * catalogue is added.
 *
 * The document is flipped after load rather than through the locale store,
 * because `LocaleProvider` writes `dir` from the locale and would put it
 * straight back for `en`.
 */

/** Flip the document by hand, as a translator checking a page would. */
async function forceRtl(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.documentElement.dir = 'rtl';
  });
}

/** Horizontal overflow of the document, in pixels. */
async function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/**
 * How far the text of an element sits from its inline start and inline end
 * edges. Measured from a range around the contents rather than through
 * `getComputedStyle`, which reports `text-align: start` as written instead
 * of as resolved — the geometry is what a reader actually sees.
 */
async function textInsets(
  page: Page,
  selector: string,
): Promise<{ start: number; end: number }> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`no element for ${sel}`);
    const box = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    const text = range.getBoundingClientRect();
    const rtl = document.documentElement.dir === 'rtl';
    return {
      start: Math.round(rtl ? box.right - text.right : text.left - box.left),
      end: Math.round(rtl ? text.left - box.left : box.right - text.right),
    };
  }, selector);
}

test.beforeEach(async ({ page }) => {
  await blockAnalytics(page);
  await mockBackend(page, { provider: CLINIC });
});

test.describe('Right-to-left layout (#131)', () => {
  test('moves the header to the inline end', async ({ page }) => {
    await page.goto('/how-it-works');

    // The header row is the flex container; its two children are the brand
    // (with the desktop nav) and the utility cluster, which carries the
    // `ms-auto` that pushes it to the inline end.
    const row = page.locator('header > div').first();
    const brand = page.locator('header a[href="/"]').first();
    const cluster = page.locator('header .ms-auto');

    const box = (await row.boundingBox())!;
    const ltrBrand = (await brand.boundingBox())!;
    const ltrCluster = (await cluster.boundingBox())!;
    // Left-to-right: brand against the left edge, cluster against the right.
    // The row has a 16px gutter (24px from `sm` up), so the edge test is
    // generous by design.
    expect(ltrBrand.x - box.x).toBeLessThan(40);
    expect(box.x + box.width - (ltrCluster.x + ltrCluster.width)).toBeLessThan(40);

    await forceRtl(page);

    const rtlBrand = (await brand.boundingBox())!;
    const rtlCluster = (await cluster.boundingBox())!;
    // Right-to-left: the same two rules put the brand on the right edge and
    // the cluster on the left. Physical margins would have left both where
    // they were.
    expect(box.x + box.width - (rtlBrand.x + rtlBrand.width)).toBeLessThan(40);
    expect(rtlCluster.x - box.x).toBeLessThan(40);
  });

  test('puts the accent stripe on the inline start edge', async ({ page }) => {
    await page.goto('/how-it-works');

    const card = page.locator('.border-s-4').first();
    // Left-to-right: inline start is the left edge.
    await expect(card).toHaveCSS('border-left-width', '4px');
    await expect(card).toHaveCSS('border-right-width', '1px');

    await forceRtl(page);

    // Right-to-left: the stripe is on the right, and the plain 1px border is
    // on the left. A physical `border-l-4` would have stayed put.
    await expect(card).toHaveCSS('border-right-width', '4px');
    await expect(card).toHaveCSS('border-left-width', '1px');
  });

  test('aligns table text to the inline start', async ({ page }) => {
    await page.goto('/privacy');

    // Body cells, not headers: a `th` is centred by the browser's own
    // stylesheet whatever the table says, so it would not tell us anything
    // about the direction. The cells inherit `text-start` from the table.
    const cell = 'table td';
    const ltr = await textInsets(page, cell);
    expect(ltr.start).toBeLessThan(24);
    expect(ltr.start).toBeLessThan(ltr.end);

    await forceRtl(page);

    // Same rule, other edge: the text still hugs the inline start, which is
    // now the right side. With a physical `text-left` the insets would swap
    // and both assertions would fail.
    const rtl = await textInsets(page, cell);
    expect(rtl.start).toBeLessThan(24);
    expect(rtl.start).toBeLessThan(rtl.end);
  });

  test('does not overflow the viewport in either direction', async ({ page }) => {
    for (const path of ['/', '/how-it-works', '/privacy', '/faq']) {
      await page.goto(path);
      const ltr = await overflow(page);
      await forceRtl(page);
      const rtl = await overflow(page);
      // Flipping must not introduce a horizontal scrollbar that the
      // left-to-right page does not already have.
      expect(rtl, `${path} overflows when flipped`).toBeLessThanOrEqual(ltr + 1);
    }
  });

  test('keeps the shipped locales left-to-right', async ({ page }) => {
    await page.goto('/how-it-works');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    await page.locator('#language-select').selectOption('fr');

    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });
});
