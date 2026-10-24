import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ANALYTICS_PREFERENCE_KEY,
  isAnalyticsOptedOut,
  isDoNotTrackEnabled,
  setAnalyticsOptOut,
} from './analytics-preference';

/**
 * Analytics opt-out preference (#143).
 *
 * A tiny in-memory stand-in for `window.localStorage` keeps the test in the
 * Node environment: the module reads the same API the browser exposes, and
 * the test can assert the stored flag and the notification event.
 */

function memoryStorage(initial?: Record<string, string>) {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    get size() {
      return data.size;
    },
  };
}

function stubBrowser(options: {
  stored?: string;
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
  storageThrows?: boolean;
}) {
  const storage = memoryStorage(
    options.stored === undefined ? {} : { [ANALYTICS_PREFERENCE_KEY]: options.stored },
  );
  if (options.storageThrows) {
    storage.getItem = () => {
      throw new Error('storage blocked');
    };
    storage.setItem = () => {
      throw new Error('storage blocked');
    };
  }
  const dispatchEvent = vi.fn();
  vi.stubGlobal('window', {
    localStorage: storage,
    dispatchEvent,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('navigator', {
    doNotTrack: options.doNotTrack ?? null,
    globalPrivacyControl: options.globalPrivacyControl ?? false,
  });
  return { storage, dispatchEvent };
}

beforeEach(() => {
  stubBrowser({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isDoNotTrackEnabled', () => {
  it('reads navigator.doNotTrack and the global privacy control signal', () => {
    stubBrowser({ doNotTrack: '1' });
    expect(isDoNotTrackEnabled()).toBe(true);

    stubBrowser({ doNotTrack: '0' });
    expect(isDoNotTrackEnabled()).toBe(false);

    stubBrowser({ globalPrivacyControl: true });
    expect(isDoNotTrackEnabled()).toBe(true);
  });
});

describe('isAnalyticsOptedOut', () => {
  it('follows Do Not Track until the visitor makes an explicit choice', () => {
    stubBrowser({ doNotTrack: '1' });
    expect(isAnalyticsOptedOut()).toBe(true);

    // An explicit "on" is the visitor asking for analytics despite DNT.
    stubBrowser({ stored: '0', doNotTrack: '1' });
    expect(isAnalyticsOptedOut()).toBe(false);
  });

  it('honours an explicit opt-out even without a DNT signal', () => {
    stubBrowser({ stored: '1', doNotTrack: '0' });
    expect(isAnalyticsOptedOut()).toBe(true);
  });

  it('is on by default when the browser sends no signal', () => {
    stubBrowser({});
    expect(isAnalyticsOptedOut()).toBe(false);
  });

  it('falls back to the browser signal when storage is unavailable', () => {
    stubBrowser({ storageThrows: true, doNotTrack: '1' });
    expect(isAnalyticsOptedOut()).toBe(true);
  });
});

describe('setAnalyticsOptOut', () => {
  it('stores the choice as a plain flag and notifies subscribers', () => {
    const { storage, dispatchEvent } = stubBrowser({});

    setAnalyticsOptOut(true);
    expect(storage.getItem(ANALYTICS_PREFERENCE_KEY)).toBe('1');
    expect(dispatchEvent).toHaveBeenCalledTimes(1);

    setAnalyticsOptOut(false);
    expect(storage.getItem(ANALYTICS_PREFERENCE_KEY)).toBe('0');
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
  });

  it('does not throw when storage is blocked', () => {
    const { dispatchEvent } = stubBrowser({ storageThrows: true });
    expect(() => setAnalyticsOptOut(true)).not.toThrow();
    expect(dispatchEvent).toHaveBeenCalled();
  });
});
