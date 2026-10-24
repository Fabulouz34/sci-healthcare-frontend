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
 * Core Web Vitals are the one exception to rule 2: the value is a single
 * rounded number (LCP/INP in ms, CLS as a score) and nothing else. They are
 * sent through `trackMetric`, which is not part of the funnel allowlist.
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

type PlausibleFn = (event: string, opts?: { u?: string; props?: Record<string, string | number> }) => void;

type AnalyticsWindow = {
  plausible?: PlausibleFn;
  __sciAnalyticsQueue?: Array<[string, { u?: string; props?: Record<string, string | number> }?]>;
};

type SendOptions = { u?: string; props?: Record<string, string | number> };

function send(event: string, opts?: SendOptions): void {
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
function invoke(fn: PlausibleFn, event: string, opts?: SendOptions): void {
  if (opts === undefined) fn(event);
  else fn(event, opts);
}

/** A funnel step finished. Sends the name only — never any properties. */
export function trackEvent(name: AnalyticsEvent): void {
  send(name);
}

/**
 * A Core Web Vital was recorded. Sends the metric name and its rounded
 * value as the only property. Respects the same opt-out as everything else.
 */
export function trackMetric(name: string, value: number): void {
  send(name, { props: { value } });
}

/** A route change. Sends origin + normalized path, never the real URL. */
export function trackPageview(pathname: string): void {
  send('pageview', { u: `${window.location.origin}${normalizePath(pathname)}` });
}

/**
 * Reports Core Web Vitals (LCP, INP, CLS) once per page view.
 *
 * Each metric is sent at most once per page view: the first value observed
 * for a given metric wins, and later reports (e.g. LCP updates on scroll)
 * are ignored. Values are rounded so no high-entropy fingerprint leaks.
 * Respects the same opt-out as every other event.
 */
export function reportWebVitals(): void {
  if (typeof window === 'undefined') return;
  if (!isAnalyticsEnabled()) return;

  const reported = new Set<string>();

  const report = (name: string, value: number): void => {
    if (reported.has(name)) return;
    if (!Number.isFinite(value) || value < 0) return;
    reported.add(name);
    trackMetric(name, Math.round(value));
  };

  type LayoutShiftEntry = PerformanceEntry & { value?: number; hadRecentInput?: boolean };
  type EventTimingEntry = PerformanceEntry & { interactionId?: number };

  const observe = (type: string, cb: (entry: PerformanceEntry) => void): void => {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) cb(entry);
      });
      observer.observe({ type, buffered: true } as PerformanceObserverInit);
    } catch {
      // Unsupported entry type in this browser; skip silently.
    }
  };

  // Largest Contentful Paint: keep the largest value seen before the first
  // report, then lock it in.
  let lcp = 0;
  observe('largest-contentful-paint', (entry) => {
    lcp = entry.startTime;
    report('LCP', lcp);
  });

  // Interaction to Next Paint: the worst interaction duration observed.
  observe('event', (entry) => {
    const e = entry as EventTimingEntry;
    if (e.interactionId === undefined) return;
    report('INP', e.duration);
  });

  // Cumulative Layout Shift: sum of unexpected shifts, reported once.
  let cls = 0;
  observe('layout-shift', (entry) => {
    const e = entry as LayoutShiftEntry;
    if (e.hadRecentInput) return;
    cls += e.value ?? 0;
    report('CLS', cls);
  });
}
