import { describe, expect, it } from 'vitest';

import { directionForLocale } from './direction';

/**
 * Direction mapping (#131).
 *
 * The layout flips off a single attribute, so this mapping is the only place
 * a wrong answer can reach the page: a right-to-left language read as
 * left-to-right renders every logical utility on the wrong side.
 */
describe('directionForLocale', () => {
  it('keeps the languages we ship left-to-right', () => {
    expect(directionForLocale('en')).toBe('ltr');
    expect(directionForLocale('fr')).toBe('ltr');
    expect(directionForLocale('sw')).toBe('ltr');
  });

  it('marks right-to-left languages', () => {
    expect(directionForLocale('ar')).toBe('rtl');
    expect(directionForLocale('fa')).toBe('rtl');
    expect(directionForLocale('he')).toBe('rtl');
    expect(directionForLocale('ur')).toBe('rtl');
    expect(directionForLocale('ckb')).toBe('rtl');
  });

  it('reads the language subtag and ignores case and region', () => {
    expect(directionForLocale('ar-EG')).toBe('rtl');
    expect(directionForLocale('ar_EG')).toBe('rtl');
    expect(directionForLocale('AR')).toBe('rtl');
    expect(directionForLocale('  Ar-eg  ')).toBe('rtl');
    expect(directionForLocale('en-GB')).toBe('ltr');
  });

  it('falls back to left-to-right for values it cannot place', () => {
    expect(directionForLocale('')).toBe('ltr');
    expect(directionForLocale('zz')).toBe('ltr');
    expect(directionForLocale('-EG')).toBe('ltr');
    // Kurdish written in Latin script is left-to-right; only the codes we
    // list as right-to-left flip, so an unrecognised tag is never worse than
    // today's layout.
    expect(directionForLocale('ku')).toBe('ltr');
    expect(directionForLocale(undefined as unknown as string)).toBe('ltr');
  });
});
