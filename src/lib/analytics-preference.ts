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
