import { describe, expect, it } from 'vitest';

import {
  contentSecurityPolicy,
  contentSecurityPolicyHeaderName,
  TRUSTED_TYPES_POLICY,
} from './csp';

/**
 * The policy is a pure function of the build environment so it can be
 * asserted here, in Node, without a browser. The Playwright suite then
 * checks the header the running app actually sends
 * (tests/e2e/security-headers.spec.ts).
 */

const BASE_ENV = {
  NEXT_PUBLIC_API_URL: 'https://api.example.test',
  NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
  NEXT_PUBLIC_SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
  NEXT_PUBLIC_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  NEXT_PUBLIC_REGISTRY_CONTRACT_ID: `C${'A'.repeat(55)}`,
};

function directives(policy: string): Map<string, string> {
  return new Map(
    policy.split(';').map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values.join(' ')];
    }),
  );
}

describe('contentSecurityPolicy', () => {
  it('includes the Trusted Types directives (#147)', () => {
    const csp = contentSecurityPolicy(BASE_ENV);
    const map = directives(csp);

    expect(map.get('require-trusted-types-for')).toBe("'script'");
    expect(map.get('trusted-types')).toBe(
      `default ${TRUSTED_TYPES_POLICY} 'allow-duplicates'`,
    );
  });

  it('keeps Trusted Types in the same policy as the script sources', () => {
    const csp = contentSecurityPolicy(BASE_ENV);
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");

    // No wildcard policy: a permissive `trusted-types *` would turn every
    // string into TrustedHTML and make the directive decorative.
    expect(directives(csp).get('trusted-types')).not.toContain('*');
  });

  it('allows exactly the origins the app calls', () => {
    const csp = contentSecurityPolicy({
      ...BASE_ENV,
      NEXT_PUBLIC_SENTRY_DSN: 'https://key@sentry.example.test/42',
      NEXT_PUBLIC_PLAUSIBLE_DOMAIN: 'stats.example.test',
    });
    const map = directives(csp);

    expect(map.get('connect-src')).toContain('https://api.example.test');
    expect(map.get('connect-src')).toContain(
      'https://soroban-testnet.stellar.org',
    );
    expect(map.get('connect-src')).toContain(
      'https://horizon-testnet.stellar.org',
    );
    expect(map.get('connect-src')).toContain('https://albedo.link');
    expect(map.get('connect-src')).toContain('https://wallet.xbull.app');
    expect(map.get('connect-src')).toContain('https://plausible.io');
    expect(map.get('connect-src')).toContain('https://sentry.example.test');
    expect(map.get('img-src')).toContain('https://tile.openstreetmap.org');
    expect(map.get('img-src')).toContain('https://stellar.creit.tech');
  });

  it('picks Horizon from the network', () => {
    const publicNet = contentSecurityPolicy({
      ...BASE_ENV,
      NEXT_PUBLIC_STELLAR_NETWORK: 'public',
    });
    expect(directives(publicNet).get('connect-src')).toContain(
      'https://horizon.stellar.org',
    );

    const futurenet = contentSecurityPolicy({
      ...BASE_ENV,
      NEXT_PUBLIC_STELLAR_NETWORK: 'futurenet',
    });
    expect(directives(futurenet).get('connect-src')).toContain(
      'https://horizon-futurenet.stellar.org',
    );
  });

  it('does not allow WalletConnect or analytics when they are not configured', () => {
    const map = directives(contentSecurityPolicy(BASE_ENV));
    expect(map.get('connect-src')).not.toContain('relay.walletconnect.com');
    expect(map.get('connect-src')).not.toContain('plausible.io');
    expect(map.get('img-src')).not.toContain('walletconnect.com');
  });

  it('adds WalletConnect origins only with a project id', () => {
    const map = directives(
      contentSecurityPolicy({
        ...BASE_ENV,
        NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: 'project-id',
      }),
    );
    expect(map.get('connect-src')).toContain('https://relay.walletconnect.com');
    expect(map.get('connect-src')).toContain('wss://relay.walletconnect.com');
    expect(map.get('frame-src')).toContain(
      'https://verify.walletconnect.com',
    );
  });

  it('adds the development-only allowances only in development', () => {
    expect(directives(contentSecurityPolicy(BASE_ENV, true)).get('script-src'))
      .toContain("'unsafe-eval'");
    expect(directives(contentSecurityPolicy(BASE_ENV, false)).get('script-src'))
      .not.toContain("'unsafe-eval'");
  });

  it('keeps the page unframeable and plugins off', () => {
    const map = directives(contentSecurityPolicy(BASE_ENV));
    expect(map.get('default-src')).toBe("'self'");
    expect(map.get('frame-ancestors')).toBe("'none'");
    expect(map.get('object-src')).toBe("'none'");
    expect(map.get('base-uri')).toBe("'self'");
    expect(map.get('form-action')).toBe("'self'");
    expect(map.get('worker-src')).toBe("'self'");
  });
});

describe('contentSecurityPolicyHeaderName', () => {
  it('is report-only until CSP_ENFORCE is set', () => {
    expect(contentSecurityPolicyHeaderName({})).toBe(
      'Content-Security-Policy-Report-Only',
    );
    expect(contentSecurityPolicyHeaderName({ CSP_ENFORCE: '' })).toBe(
      'Content-Security-Policy-Report-Only',
    );
  });

  it('enforces when the build sets CSP_ENFORCE=1', () => {
    expect(contentSecurityPolicyHeaderName({ CSP_ENFORCE: '1' })).toBe(
      'Content-Security-Policy',
    );
  });
});
