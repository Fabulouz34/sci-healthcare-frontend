'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { defaultLocale, isLocale, messages, type Locale } from './config';
import { directionForLocale } from './direction';

export const LOCALE_STORAGE_KEY = 'sci-locale';

/** Where the choice is written as well, for when localStorage is blocked. */
const LOCALE_COOKIE = 'NEXT_LOCALE';
/** Dispatched on the window when the choice changes in this tab. */
const LOCALE_CHANGE_EVENT = 'sci-locale-change';

/**
 * The locale to use: the stored choice first, then the cookie it was also
 * written to, then the browser's language when we support it, then English.
 */
function readLocale(): Locale {
  if (typeof window === 'undefined') return defaultLocale;
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // Storage disabled; the cookie below still carries the choice.
  }
  const cookie = new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`).exec(
    document.cookie,
  )?.[1];
  if (isLocale(cookie)) return cookie;
  const navLang = window.navigator.language.slice(0, 2).toLowerCase();
  return isLocale(navLang) ? navLang : defaultLocale;
}

/** The server has no storage to read, so it renders English. */
function serverLocale(): Locale {
  return defaultLocale;
}

/**
 * The locale store. `useSyncExternalStore` (the same shape as the theme in
 * src/lib/theme.ts) keeps the server render and the first client render in
 * agreement: the server has no storage to read, so it renders English and
 * the stored locale is applied as soon as hydration is done.
 *
 * Reading storage in a `useState` initialiser instead would make the first
 * client render differ from the server HTML — React reports that as a
 * hydration mismatch and re-renders the tree on the client, so every visitor
 * who chose another language paid for a broken hydration on every page.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener(LOCALE_CHANGE_EVENT, onChange);
  // Another tab changed the choice.
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(LOCALE_CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: defaultLocale,
  setLocale: () => {},
  t: (key: string) => key,
});

export function useLocaleContext() {
  return useContext(LocaleContext);
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribe, readLocale, serverLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    if (!isLocale(newLocale)) return;
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    } catch {
      // Storage unavailable; the cookie below still carries the choice.
    }
    try {
      document.cookie = `${LOCALE_COOKIE}=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // Cookies unavailable; the choice applies to this page only.
    }
    window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
  }, []);

  /**
   * The document carries the language and the reading direction (#5, #131).
   * The direction comes from the locale through `directionForLocale`, so a
   * right-to-left catalogue flips the layout without touching a component:
   * the logical utilities read the `dir` attribute. It is written in the
   * same effect as `lang` because both are properties of the chosen
   * language, and writing one without the other would translate the text
   * but leave it laid out the wrong way round.
   */
  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = directionForLocale(locale);
  }, [locale]);

  const t = useCallback(
    (path: string, params?: Record<string, string | number>): string => {
      const keys = path.split('.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let current: any = messages[locale] ?? messages[defaultLocale];

      for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
          current = current[key];
        } else {
          // Fallback to English
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let fallbackCurrent: any = messages[defaultLocale];
          for (const fbKey of keys) {
            if (
              fallbackCurrent &&
              typeof fallbackCurrent === 'object' &&
              fbKey in fallbackCurrent
            ) {
              fallbackCurrent = fallbackCurrent[fbKey];
            } else {
              return path;
            }
          }
          current = fallbackCurrent;
          break;
        }
      }

      if (typeof current !== 'string') {
        return path;
      }

      if (!params) {
        return current;
      }

      return current.replace(/{(\w+)}/g, (_, match) => {
        return params[match] !== undefined ? String(params[match]) : `{${match}}`;
      });
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}
