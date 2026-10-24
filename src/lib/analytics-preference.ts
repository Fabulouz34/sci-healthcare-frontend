'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether this browser wants cookieless usage analytics (#143).
 *
 * Analytics is on by default, but the visitor is always in charge:
 *
 * - `navigator.doNotTrack === '1'` (and the older vendor-prefixed forms)
 *   opts out without any interaction, so a browser-wide choice is respected
 *   before the first pageview is sent.
 * - The toggle in the footer / privacy page stores an explicit choice in
 *   `localStorage`. An explicit "on" overrides Do Not Track, because the
 *   person actively asked for it; an explicit "off" always wins.
 *
 * The preference is a plain flag, like low-bandwidth mode (`low-bandwidth.ts`),
 * so it can be read before React hydrates and no analytics request is made
 * while the app is deciding.
 */

export const ANALYTICS_PREFERENCE_KEY = 'sci-analytics';
const CHANGE_EVENT = 'sci-analytics-change';

/** `'1'` = explicitly opted out, `'0'` = explicitly opted in, absent = unset. */
type StoredChoice = 'opted-out' | 'opted-in' | null;

function storedChoice(): StoredChoice {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(ANALYTICS_PREFERENCE_KEY);
    if (value === '1') return 'opted-out';
    if (value === '0') return 'opted-in';
    return null;
  } catch {
    return null;
  }
}

/**
 * The browser's Do Not Track signal, including the prefixed properties older
 * browsers shipped before the standard settled. Server rendering has no
 * navigator, so it answers false there.
 */
export function isDoNotTrackEnabled(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    msDoNotTrack?: string | null;
    globalPrivacyControl?: boolean;
  };
  const win =
    typeof window !== 'undefined'
      ? (window as Window & { doNotTrack?: string | null })
      : undefined;

  return (
    nav.doNotTrack === '1' ||
    win?.doNotTrack === '1' ||
    nav.msDoNotTrack === '1' ||
    // Global Privacy Control is the successor signal to DNT; treated the
    // same way so a browser that sends it is not tracked by default.
    nav.globalPrivacyControl === true
  );
}

/** True when analytics must not run, from the stored choice or DNT. */
export function isAnalyticsOptedOut(): boolean {
  const choice = storedChoice();
  if (choice === 'opted-out') return true;
  if (choice === 'opted-in') return false;
  return isDoNotTrackEnabled();
}

/**
 * Report Core Web Vitals (LCP, INP, CLS) through the existing analytics,
 * once per page view, and only when the visitor has not opted out.
 *
 * Uses the standard `PerformanceObserver` entry types. Browsers that do not
 * support a metric simply never report it. The reporter is a no-op on the
 * server and when analytics is opted out, so no request is made.
 */
export function reportCoreWebVitals(
  send: (metric: { name: string; value: number }) => void,
): () => void {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
    return () => {};
  }
  if (isAnalyticsOptedOut()) return () => {};

  const reported = new Set<string>();
  const observers: PerformanceObserver[] = [];

  const report = (name: string, value: number) => {
    if (reported.has(name) || !Number.isFinite(value)) return;
    reported.add(name);
    send({ name, value });
  };

  const observe = (type: string, handler: (entries: PerformanceEntryList) => void) => {
    try {
      const observer = new PerformanceObserver((list) => handler(list.getEntries()));
      observer.observe({ type, buffered: true } as PerformanceObserverInit);
      observers.push(observer);
    } catch {
      // Unsupported entry type; skip this metric.
    }
  };

  // LCP: the last entry before the page is hidden or unloaded.
  observe('largest-contentful-paint', (entries) => {
    const last = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
    if (last) report('LCP', last.startTime);
  });

  // CLS: sum of layout shifts without recent input, reported on hide.
  let cls = 0;
  observe('layout-shift', (entries) => {
    for (const entry of entries as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
      if (!entry.hadRecentInput) cls += entry.value;
    }
  });

  // INP: the longest interaction duration observed, reported on hide.
  let inp = 0;
  observe('event', (entries) => {
    for (const entry of entries as Array<PerformanceEntry & { duration: number }>) {
      if (entry.duration > inp) inp = entry.duration;
    }
  });

  const flush = () => {
    report('CLS', cls);
    report('INP', inp);
  };

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', flush);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', flush);
    for (const observer of observers) observer.disconnect();
  };
}

/** Store an explicit choice and tell every subscriber in this tab. */
export function setAnalyticsOptOut(optedOut: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    // '1' means "do not track me"; an absent key means "follow the browser".
    window.localStorage.setItem(ANALYTICS_PREFERENCE_KEY, optedOut ? '1' : '0');
  } catch {
    // Storage can be unavailable (private mode, blocked storage); the
    // setting then applies to this page via the change event below.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  // A second tab changing the setting applies here too.
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * The preference as React state. The server cannot know it, so the first
 * client render starts from "not opted out" and updates after hydration;
 * no analytics request is sent until that update has happened.
 */
export function useAnalyticsOptOut(): boolean {
  return useSyncExternalStore(subscribe, isAnalyticsOptedOut, () => false);
}
