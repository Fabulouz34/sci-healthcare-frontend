import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The policies are created lazily against `window.trustedTypes`, so these
 * tests stand in a minimal window. The CSP allowlists both policy names
 * (`trusted-types default sci-healthcare`), which is why the names are
 * asserted here: renaming one without the policy would make enforcement
 * throw.
 */

type Rules = { createScriptURL: (url: string) => string };

/** A window whose `createPolicy` applies the rules it is given. */
function stubWindow(options: { withTrustedTypes?: boolean } = {}): {
  createPolicy: ReturnType<typeof vi.fn>;
} {
  const createPolicy = vi.fn((_name: string, rules: Rules) => ({
    createScriptURL: (url: string) => rules.createScriptURL(url),
  }));
  vi.stubGlobal('window', {
    location: { href: 'https://app.test/clinics/x', origin: 'https://app.test' },
    trustedTypes:
      options.withTrustedTypes === false ? undefined : { createPolicy },
  });
  return { createPolicy };
}

describe('sameOriginScriptUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns the plain string when the browser has no Trusted Types', async () => {
    stubWindow({ withTrustedTypes: false });
    vi.resetModules();
    const { sameOriginScriptUrl } = await import('./trusted-types');
    expect(sameOriginScriptUrl('/sw.js')).toBe('/sw.js');
  });

  it('creates the allowlisted policy once and wraps same-origin URLs', async () => {
    const { createPolicy } = stubWindow();
    vi.resetModules();
    const { sameOriginScriptUrl, TRUSTED_TYPES_POLICY } = await import(
      './trusted-types'
    );

    expect(TRUSTED_TYPES_POLICY).toBe('sci-healthcare');
    expect(sameOriginScriptUrl('/sw.js')).toBe('/sw.js');
    expect(createPolicy).toHaveBeenCalledTimes(1);
    expect(createPolicy).toHaveBeenCalledWith(
      TRUSTED_TYPES_POLICY,
      expect.objectContaining({ createScriptURL: expect.any(Function) }),
    );

    // A second call reuses the cached policy instead of creating another.
    sameOriginScriptUrl('/sw.js');
    expect(createPolicy).toHaveBeenCalledTimes(1);
  });

  it('refuses cross-origin script URLs', async () => {
    stubWindow();
    vi.resetModules();
    const { sameOriginScriptUrl } = await import('./trusted-types');
    expect(() => sameOriginScriptUrl('https://evil.example/x.js')).toThrow(
      /cross-origin/i,
    );
  });

  it('falls back to the plain string if the policy cannot be created', async () => {
    const createPolicy = vi.fn(() => {
      throw new TypeError('Policy "sci-healthcare" disallowed');
    });
    vi.stubGlobal('window', {
      location: { href: 'https://app.test/', origin: 'https://app.test' },
      trustedTypes: { createPolicy },
    });
    vi.resetModules();
    const { sameOriginScriptUrl } = await import('./trusted-types');
    expect(sameOriginScriptUrl('/sw.js')).toBe('/sw.js');
  });
});

describe('installTrustedTypesDefaultPolicy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('creates the default policy with a script-URL rule only', async () => {
    const { createPolicy } = stubWindow();
    vi.resetModules();
    const { installTrustedTypesDefaultPolicy } = await import(
      './trusted-types'
    );

    installTrustedTypesDefaultPolicy();
    expect(createPolicy).toHaveBeenCalledTimes(1);

    const [name, rules] = createPolicy.mock.calls[0] as [string, Rules];
    expect(name).toBe('default');
    // No createHTML/createScript: inline markup and inline script must keep
    // throwing under enforcement.
    expect(Object.keys(rules)).toEqual(['createScriptURL']);
  });

  it('allows same-origin and the analytics origin, and nothing else', async () => {
    const { createPolicy } = stubWindow();
    vi.resetModules();
    const { installTrustedTypesDefaultPolicy } = await import(
      './trusted-types'
    );
    installTrustedTypesDefaultPolicy();

    const [, rules] = createPolicy.mock.calls[0] as [string, Rules];
    expect(rules.createScriptURL('/_next/static/chunk.js')).toBe(
      '/_next/static/chunk.js',
    );
    expect(
      rules.createScriptURL('https://plausible.io/js/script.manual.js'),
    ).toBe('https://plausible.io/js/script.manual.js');
    expect(() => rules.createScriptURL('https://evil.example/x.js')).toThrow(
      /not allowed/i,
    );
  });

  it('is a no-op without Trusted Types', async () => {
    vi.stubGlobal('window', {
      location: { href: 'https://app.test/', origin: 'https://app.test' },
    });
    vi.resetModules();
    const { installTrustedTypesDefaultPolicy } = await import(
      './trusted-types'
    );
    expect(() => installTrustedTypesDefaultPolicy()).not.toThrow();
  });
});
