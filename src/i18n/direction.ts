/**
 * Text direction (#131).
 *
 * The layout is written with Tailwind's logical utilities (`ms-`, `me-`,
 * `ps-`, `pe-`, `text-start`, `text-end`, `border-s`, `border-e`, `start-`,
 * `end-`), which resolve against the `dir` attribute of the nearest
 * ancestor. Flipping the page for a right-to-left language is therefore a
 * matter of setting that attribute, not of shipping a second stylesheet.
 *
 * This module is the one place that decides the direction: the locale is
 * mapped to `ltr`/`rtl` through the language subtag. None of the locales we
 * ship today (`en`, `fr`, `sw`) is right-to-left, so adding an Arabic
 * catalogue is the only step left — the pages already follow.
 */

export type Direction = 'ltr' | 'rtl';

/**
 * Primary language subtags written right-to-left (ISO 639-1 / 639-3).
 * Deliberately a fixed list rather than "everything not listed as LTR":
 * a language we do not recognise is safer laid out as it is today.
 */
const RTL_LANGUAGES = new Set([
  'ar', // Arabic
  'arc', // Aramaic
  'ckb', // Central Kurdish (Sorani)
  'dv', // Divehi
  'fa', // Persian
  'he', // Hebrew
  'iw', // Hebrew (legacy code)
  'ps', // Pashto
  'sd', // Sindhi
  'ug', // Uyghur
  'ur', // Urdu
  'yi', // Yiddish
]);

/**
 * The direction a locale is written in.
 *
 * Takes a full tag and looks at the language subtag only, so `ar-EG`,
 * `ar_EG` and `AR` all resolve the same way. Anything unusable — an empty
 * string, a bare region, a language we do not know — stays left-to-right,
 * which is what every page renders today.
 */
export function directionForLocale(locale: string): Direction {
  if (typeof locale !== 'string') return 'ltr';
  const primary = locale.trim().toLowerCase().split(/[-_]/)[0];
  return RTL_LANGUAGES.has(primary) ? 'rtl' : 'ltr';
}
