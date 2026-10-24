'use client';

import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { useEffect, useRef } from 'react';

import { flushAnalyticsQueue, trackMetric, trackPageview } from '@/lib/analytics';
import { reportCoreWebVitals, useAnalyticsOptOut } from '@/lib/analytics-preference';
import { useLowBandwidth } from '@/lib/low-bandwidth';

/**
 * Cookieless usage analytics (Plausible).
 *
 * Rendered only when NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set. The manual script
 * variant sends nothing on its own — every pageview goes through the route
 * tracker below with a normalized path, so provider addresses and voucher
 * ids never leave the browser. Funnel events are sent separately with names
 * only (see src/lib/analytics.ts).
 *
 * Core Web Vitals (LCP, INP, CLS) are reported through the same queue once
 * per page view, so field data shows how the app performs on real phones.
 *
 * In low-bandwidth mode (#75) usage analytics is the first thing to go:
 * the script is not loaded and no pageview is sent. Nothing the app does
 * depends on it, and a clinic on a metered link should not be paying for it.
 *
 * The visitor can opt out on their own too (#143): either through the
 * footer / privacy toggle or by sending Do Not Track. Opting out removes
 * the script and stops pageviews immediately, and `trackEvent` checks the
 * same preference before sending anything.
 */
export function Analytics({ domain }: { domain: string }) {
  const pathname = usePathname();
  const lowBandwidth = useLowBandwidth();
  const optedOut = useAnalyticsOptOut();
  const enabled = !lowBandwidth && !optedOut;
  const vitalsReported = useRef(false);

  useEffect(() => {
    if (pathname && enabled) trackPageview(pathname);
  }, [pathname, enabled]);

  useEffect(() => {
    if (!enabled) {
      vitalsReported.current = false;
      return;
    }
    if (vitalsReported.current) return;
    vitalsReported.current = true;
    return reportCoreWebVitals(({ name, value }) => trackMetric(name, Math.round(value)));
  }, [enabled]);

  if (!enabled) return null;

  return (
    <Script
      src="https://plausible.io/js/script.manual.js"
      data-domain={domain}
      strategy="afterInteractive"
      onLoad={() => flushAnalyticsQueue()}
    />
  );
}
