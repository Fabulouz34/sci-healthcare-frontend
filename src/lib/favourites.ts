'use client';

import { useSyncExternalStore } from 'react';

/**
 * Favourite clinics (#issue-favourite-clinics).
 *
 * Repeat funders return to the same clinic but must find it again each time.
 * Storing favourited clinic addresses in localStorage lets funders star clinics
 * on their clinic detail pages, and see their favourite clinics listed first
 * on the home page directory.
 *
 * Designed to gracefully fall back when storage is disabled or throws (e.g.
 * in private mode, restricted environments, or server rendering).
 */

export const FAVOURITES_STORAGE_KEY = 'sci-favourite-clinics';
const CHANGE_EVENT = 'sci-favourite-clinics-change';

let memoryFallback: string[] | null = null;
let cachedRaw: string | null = null;
let cachedList: string[] = [];

function readStorage(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FAVOURITES_STORAGE_KEY);
    if (raw === cachedRaw) {
      return cachedList;
    }
    cachedRaw = raw;
    if (!raw) {
      cachedList = [];
      return cachedList;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      cachedList = parsed;
    } else {
      cachedList = [];
    }
    return cachedList;
  } catch {
    if (memoryFallback !== null) {
      return memoryFallback;
    }
    cachedRaw = null;
    cachedList = [];
    return cachedList;
  }
}

/**
 * Returns the list of favourite clinic addresses.
 * Falls back gracefully to an empty array when storage is unavailable.
 */
export function getFavouriteClinics(): string[] {
  return readStorage();
}

/**
 * Returns whether a clinic address is marked as a favourite.
 */
export function isClinicFavourite(address: string): boolean {
  if (!address) return false;
  return getFavouriteClinics().includes(address);
}

/**
 * Adds or removes a clinic address from favourites.
 * Notifies all subscribers in the current tab and other tabs via custom and storage events.
 */
export function toggleFavouriteClinic(address: string): boolean {
  if (typeof window === 'undefined' || !address) return false;
  try {
    const current = getFavouriteClinics();
    const exists = current.includes(address);
    const next = exists ? current.filter((a) => a !== address) : [...current, address];

    try {
      window.localStorage.setItem(FAVOURITES_STORAGE_KEY, JSON.stringify(next));
      memoryFallback = null;
      cachedRaw = JSON.stringify(next);
      cachedList = next;
    } catch {
      // Storage might be disabled/quota exceeded. Keep in-memory cache updated for this session.
      memoryFallback = next;
      cachedRaw = null;
      cachedList = next;
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return !exists;
  } catch {
    return false;
  }
}

/**
 * Sets the favourite state for a clinic explicitly.
 */
export function setClinicFavourite(address: string, favourite: boolean): boolean {
  if (typeof window === 'undefined' || !address) return false;
  try {
    const current = getFavouriteClinics();
    const exists = current.includes(address);
    if (exists === favourite) return favourite;

    const next = favourite ? [...current, address] : current.filter((a) => a !== address);
    try {
      window.localStorage.setItem(FAVOURITES_STORAGE_KEY, JSON.stringify(next));
      memoryFallback = null;
      cachedRaw = JSON.stringify(next);
      cachedList = next;
    } catch {
      // Storage might be disabled/quota exceeded.
      memoryFallback = next;
      cachedRaw = null;
      cachedList = next;
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return favourite;
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

const EMPTY_FAVOURITES: string[] = [];

/**
 * Hook to access favourite clinic addresses reactively.
 */
export function useFavouriteClinics(): string[] {
  return useSyncExternalStore(subscribe, getFavouriteClinics, () => EMPTY_FAVOURITES);
}

/**
 * Hook to check if a specific clinic address is favourited.
 */
export function useIsClinicFavourite(address: string): boolean {
  const favourites = useFavouriteClinics();
  return favourites.includes(address);
}

/**
 * Test helper to reset internal cache
 */
export function _resetFavouritesCache(): void {
  cachedRaw = null;
  cachedList = [];
  memoryFallback = null;
}
