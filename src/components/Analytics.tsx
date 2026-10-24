'use client';

import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { useEffect, useSyncExternalStore } from 'react';

import { flushAnalyticsQueue, trackPageview } from '@/lib/analytics';
import { useAnalyticsOptOut } from '@/lib/analytics-preference';
import { useLowBandwidth } from '@/lib/low-bandwidth';

/**
 * False during SSR and the hydrating render, true afterwards. Used to keep
 * the script tag out of the server HTML: a browser-local opt-out cannot be
 * known on the server, and a script that shipped there would start loading
 * before hydration could stop it.
 */
const subscribeNever = () => () => {};
function useHasMounted(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

/**
 * Cookieless usage analytics (Plausible).
 *
 * Rendered only when NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set. The manual script
 * variant sends nothing on its own — every pageview goes through the route
 * tracker below with a normalized path, so provider addresses and voucher
 * ids never leave the browser. Funnel events are sent separately with names
 * only (see src/lib/analytics.ts).
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
  const mounted = useHasMounted();
  const enabled = mounted && !lowBandwidth && !optedOut;

  useEffect(() => {
    if (pathname && enabled) trackPageview(pathname);
  }, [pathname, enabled]);

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
