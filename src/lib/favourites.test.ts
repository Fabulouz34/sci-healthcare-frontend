import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetFavouritesCache,
  FAVOURITES_STORAGE_KEY,
  getFavouriteClinics,
  isClinicFavourite,
  setClinicFavourite,
  toggleFavouriteClinic,
} from './favourites';

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
  storageThrows?: boolean;
}) {
  _resetFavouritesCache();
  const storage = memoryStorage(
    options.stored === undefined ? {} : { [FAVOURITES_STORAGE_KEY]: options.stored },
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
  return { storage, dispatchEvent };
}

describe('favourites storage helper', () => {
  beforeEach(() => {
    stubBrowser({});
  });

  afterEach(() => {
    _resetFavouritesCache();
    vi.unstubAllGlobals();
  });

  it('reads stored favourite clinic addresses', () => {
    stubBrowser({ stored: JSON.stringify(['GAAA111', 'GBBB222']) });
    expect(getFavouriteClinics()).toEqual(['GAAA111', 'GBBB222']);
    expect(isClinicFavourite('GAAA111')).toBe(true);
    expect(isClinicFavourite('GCCC333')).toBe(false);
  });

  it('falls back gracefully to empty array when storage is empty or invalid JSON', () => {
    stubBrowser({ stored: 'invalid json' });
    expect(getFavouriteClinics()).toEqual([]);

    stubBrowser({ stored: JSON.stringify('not-an-array') });
    expect(getFavouriteClinics()).toEqual([]);
  });

  it('falls back gracefully when storage throws (private/restricted mode)', () => {
    stubBrowser({ storageThrows: true });
    expect(getFavouriteClinics()).toEqual([]);
    expect(isClinicFavourite('GAAA111')).toBe(false);

    // toggling should not crash even if storage throws
    const res = toggleFavouriteClinic('GAAA111');
    expect(res).toBe(true);
    expect(isClinicFavourite('GAAA111')).toBe(true);
    expect(getFavouriteClinics()).toEqual(['GAAA111']);
  });

  it('toggles favourite state and dispatches change event', () => {
    const { storage, dispatchEvent } = stubBrowser({});
    expect(isClinicFavourite('GAAA111')).toBe(false);

    const added = toggleFavouriteClinic('GAAA111');
    expect(added).toBe(true);
    expect(isClinicFavourite('GAAA111')).toBe(true);
    expect(storage.getItem(FAVOURITES_STORAGE_KEY)).toBe(JSON.stringify(['GAAA111']));
    expect(dispatchEvent).toHaveBeenCalled();

    const removed = toggleFavouriteClinic('GAAA111');
    expect(removed).toBe(false);
    expect(isClinicFavourite('GAAA111')).toBe(false);
    expect(storage.getItem(FAVOURITES_STORAGE_KEY)).toBe(JSON.stringify([]));
  });

  it('sets clinic favourite explicitly', () => {
    stubBrowser({});
    setClinicFavourite('GAAA111', true);
    expect(isClinicFavourite('GAAA111')).toBe(true);

    setClinicFavourite('GAAA111', true); // no change
    expect(isClinicFavourite('GAAA111')).toBe(true);

    setClinicFavourite('GAAA111', false);
    expect(isClinicFavourite('GAAA111')).toBe(false);
  });
});
