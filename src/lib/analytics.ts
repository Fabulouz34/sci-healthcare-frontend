import { isAnalyticsOptedOut } from './analytics-preference';
import { config } from './config';

/**
 * Privacy-respecting usage analytics (Plausible, cookieless).
 *
 * Two rules keep this honest:
 *
 * 1. Pageviews never carry identifiers. Dynamic routes are normalized, so
 *    Plausible sees `/clinics/[address]` and `/vouchers/[id]` — never the
 *    provider address or voucher id that is in the real URL.
 * 2. Funnel events carry no properties at all. `trackEvent` takes only an
 *    allowlisted name, so there is nowhere to put an address, a patient
 *    reference, a beneficiary hash or an amount even by accident.
 *
 * Everything is behind NEXT_PUBLIC_PLAUSIBLE_DOMAIN: unset means no script
 * tag, no queueing and no network calls. A visitor can also turn analytics
 * off in the footer (or with the browser's Do Not Track setting), in which
 * case `isAnalyticsEnabled` is false and nothing is sent (#143).
 */

export const ANALYTICS_EVENTS = [
  'voucher_funded',
  'voucher_claimed',
  'care_confirmed',
  'dispute_opened',
  'voucher_settled',
  'voucher_refunded',
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

/** Dynamic route patterns whose real values must never reach analytics. */
const DYNAMIC_ROUTES: Array<[RegExp, string]> = [
  [/^\/clinics\/[^/]+$/, '/clinics/[address]'],
  [/^\/vouchers\/[^/]+$/, '/vouchers/[id]'],
];

export function normalizePath(pathname: string): string {
  for (const [pattern, replacement] of DYNAMIC_ROUTES) {
    if (pattern.test(pathname)) return replacement;
  }
  return pathname;
}

/** Analytics is configured and this visitor has not opted out. */
export function isAnalyticsEnabled(): boolean {
  return config.plausibleDomain.length > 0 && !isAnalyticsOptedOut();
}

/** Analytics is configured at build time (the toggle is offered). */
export function isAnalyticsConfigured(): boolean {
  return config.plausibleDomain.length > 0;
}

type PlausibleFn = (event: string, opts?: { u?: string }) => void;

type AnalyticsWindow = {
  plausible?: PlausibleFn;
  __sciAnalyticsQueue?: Array<[string, { u?: string }?]>;
};

function send(event: string, opts?: { u?: string }): void {
  if (!isAnalyticsEnabled() || typeof window === 'undefined') return;
  const w = window as unknown as AnalyticsWindow;
  if (typeof w.plausible === 'function') {
    invoke(w.plausible, event, opts);
    return;
  }
  // The script has not finished loading yet; hold events for onLoad.
  // Capped so an ad-blocked script cannot grow this without bound.
  const queue = (w.__sciAnalyticsQueue ??= []);
  if (queue.length < 100) queue.push([event, opts]);
}

/** Events queued before the Plausible script finished loading. */
export function flushAnalyticsQueue(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as AnalyticsWindow;
  const queued = w.__sciAnalyticsQueue ?? [];
  w.__sciAnalyticsQueue = [];
  // Opting out after events were queued must drop them rather than send
  // them when the script finishes loading.
  if (!isAnalyticsEnabled()) {
    w.__sciAnalyticsQueue = [];
    return;
  }
  if (typeof w.plausible !== 'function') {
    w.__sciAnalyticsQueue = queued;
    return;
  }
  for (const [event, opts] of queued) invoke(w.plausible, event, opts);
}

/** Calls plausible with no trailing argument when there are no options. */
function invoke(fn: PlausibleFn, event: string, opts?: { u?: string }): void {
  if (opts === undefined) fn(event);
  else fn(event, opts);
}

/** A funnel step finished. Sends the name only — never any properties. */
export function trackEvent(name: AnalyticsEvent): void {
  send(name);
}

/** A route change. Sends origin + normalized path, never the real URL. */
export function trackPageview(pathname: string): void {
  send('pageview', { u: `${window.location.origin}${normalizePath(pathname)}` });
}
