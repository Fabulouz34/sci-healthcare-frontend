import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { THEME_INIT_SCRIPT } from './theme';

/**
 * The pre-paint theme script moved from an inline `dangerouslySetInnerHTML`
 * to the static file `public/theme-init.js` (#147): React renders inline
 * script content through `innerHTML`, a Trusted Types sink. Two copies now
 * exist, so this pins them together — a change to one without the other
 * would silently break the "no flash of the wrong theme" guarantee.
 */
describe('theme init script', () => {
  const served = readFileSync(
    new URL('../../public/theme-init.js', import.meta.url),
    'utf8',
  ).trimEnd();

  it('is served verbatim as public/theme-init.js', () => {
    expect(served).toBe(THEME_INIT_SCRIPT);
  });

  it('reads the stored override and applies it before paint', () => {
    expect(served).toContain("localStorage.getItem('sci-theme')");
    expect(served).toContain("document.documentElement.dataset.theme");
    expect(served).toContain('prefers-color-scheme: dark');
  });

  it('cannot throw when storage is unavailable', () => {
    expect(served.startsWith('try{')).toBe(true);
    expect(served.endsWith('}catch{}')).toBe(true);
  });
});
