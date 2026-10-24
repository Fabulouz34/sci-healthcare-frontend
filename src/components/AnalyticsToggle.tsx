'use client';

import { isAnalyticsConfigured } from '@/lib/analytics';
import { setAnalyticsOptOut, useAnalyticsOptOut } from '@/lib/analytics-preference';

/**
 * Explicit opt-out for cookieless usage analytics (#143).
 *
 * Rendered only when analytics is configured at build time, so a deployment
 * without NEXT_PUBLIC_PLAUSIBLE_DOMAIN does not show a switch that controls
 * nothing. `aria-checked` is the inverse of the stored opt-out flag: on by
 * default, off when the visitor opted out or the browser sends DNT.
 *
 * The explanation lives in the accessible label and the tooltip, because
 * the footer already has to fit a language picker and navigation at 390px.
 */
export function AnalyticsToggle() {
  const optedOut = useAnalyticsOptOut();

  if (!isAnalyticsConfigured()) return null;

  const explanation = optedOut
    ? 'Usage analytics is off: no analytics script is loaded and no pageview is sent. Turn it on to share anonymous, cookieless usage counts.'
    : 'Usage analytics is on: cookieless pageview and funnel counts only, never addresses, patient references, amounts or voucher ids. Turn it off to stop all analytics requests.';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={!optedOut}
      aria-label="Usage analytics"
      title={explanation}
      onClick={() => setAnalyticsOptOut(!optedOut)}
      className={`inline-flex max-sm:min-h-11 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset transition max-sm:px-3 ${
        optedOut
          ? 'bg-[var(--color-canvas)] text-[var(--color-ink-soft)] ring-[var(--color-line)] hover:text-[var(--color-ink)]'
          : 'bg-emerald-50 text-emerald-800 ring-emerald-200'
      }`}
    >
      <span aria-hidden className={optedOut ? '' : 'text-emerald-600'}>
        {optedOut ? '○' : '●'}
      </span>
      Analytics {optedOut ? 'off' : 'on'}
    </button>
  );
}
