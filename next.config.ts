import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import bundleAnalyzer from '@next/bundle-analyzer';

import { contentSecurityPolicy, contentSecurityPolicyHeaderName } from './src/lib/csp';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/* -------------------------------------------------------------------------
 * Fail the build when configuration is missing (#76)
 *
 * Every `NEXT_PUBLIC_*` value is inlined into the client bundle by Next at
 * build time. Nothing in the app can tell "not configured" from "configured
 * as empty" once the build is over, so a deployment with contract ids
 * missing used to succeed and then fail in the user's browser on the first
 * contract call, via `requireContracts()` in src/lib/config.ts — which is
 * exactly the failure a release should not be able to produce.
 *
 * The check runs for a real Next production build only. The config is
 * exported as a function so Next hands us the build phase: `next build`
 * passes `PHASE_PRODUCTION_BUILD`, while `next dev` and Storybook (which
 * loads this file with `PHASE_DEVELOPMENT_SERVER`) do not.
 *
 * Every problem is reported at once, with the symptom it causes, because a
 * message that names one variable at a time turns a five-minute fix into
 * five builds.
 * ---------------------------------------------------------------------- */

type RequiredVar = {
  name: string;
  /** What the app does with it, and what breaks without it. */
  why: string;
};

// NEXT_PUBLIC_FAUCET_CONTRACT_ID and NEXT_PUBLIC_USDC_ISSUER are
// deliberately absent: they only enable testnet conveniences (the demo
// faucet and its trustline instructions), and a build without them is a
// valid deployment. This list is the set without which the app cannot work
// at all. Their *shape* is still checked below when they are present.
const REQUIRED_BUILD_VARS: RequiredVar[] = [
  {
    name: 'NEXT_PUBLIC_API_URL',
    why: 'the indexer the directory, vouchers and receipts are read from',
  },
  {
    name: 'NEXT_PUBLIC_STELLAR_NETWORK',
    why: 'which network is signed for, and whether the testnet UI shows',
  },
  {
    name: 'NEXT_PUBLIC_SOROBAN_RPC_URL',
    why: 'where transactions are simulated, submitted and confirmed',
  },
  {
    name: 'NEXT_PUBLIC_NETWORK_PASSPHRASE',
    why: 'the passphrase transactions are signed with',
  },
  {
    name: 'NEXT_PUBLIC_REGISTRY_CONTRACT_ID',
    why: 'clinic and attester registration',
  },
  {
    name: 'NEXT_PUBLIC_VOUCHER_CONTRACT_ID',
    why: 'every voucher read and write, including funding',
  },
  {
    name: 'NEXT_PUBLIC_RECEIPT_CONTRACT_ID',
    why: 'receipts and the printable care summary',
  },
  {
    name: 'NEXT_PUBLIC_USDC_CONTRACT_ID',
    why: 'the token that is escrowed, quoted and settled',
  },
];

/** Soroban contract ids are `C` plus 55 base32 characters. */
const CONTRACT_ID_SHAPE = /^C[A-Z2-7]{55}$/;

function isAbsoluteUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Everything wrong with the build environment, in one list. */
function configProblems(env: NodeJS.ProcessEnv): string[] {
  const problems: string[] = [];

  for (const { name, why } of REQUIRED_BUILD_VARS) {
    if (!env[name]?.trim()) {
      problems.push(`${name} is not set — ${why}.`);
    }
  }

  const apiUrl = env.NEXT_PUBLIC_API_URL?.trim();
  if (apiUrl && !isAbsoluteUrl(apiUrl)) {
    problems.push(
      `NEXT_PUBLIC_API_URL is not an absolute http(s) URL ("${apiUrl}") — the ` +
        'browser would resolve it against the page instead.',
    );
  }

  const rpcUrl = env.NEXT_PUBLIC_SOROBAN_RPC_URL?.trim();
  if (rpcUrl && !isAbsoluteUrl(rpcUrl)) {
    problems.push(
      `NEXT_PUBLIC_SOROBAN_RPC_URL is not an absolute http(s) URL ("${rpcUrl}").`,
    );
  }

  for (const name of [
    'NEXT_PUBLIC_REGISTRY_CONTRACT_ID',
    'NEXT_PUBLIC_VOUCHER_CONTRACT_ID',
    'NEXT_PUBLIC_RECEIPT_CONTRACT_ID',
    'NEXT_PUBLIC_USDC_CONTRACT_ID',
    'NEXT_PUBLIC_FAUCET_CONTRACT_ID',
  ]) {
    const value = env[name]?.trim();
    if (value && !CONTRACT_ID_SHAPE.test(value)) {
      problems.push(
        `${name} is not a contract id ("${value}") — it must be C followed by ` +
          '55 base32 characters, as printed by the deployment script.',
      );
    }
  }

  return problems;
}

function assertBuildConfig(phase: string): void {
  if (phase !== PHASE_PRODUCTION_BUILD) return;

  const problems = configProblems(process.env);
  if (problems.length === 0) return;

  console.error(
    [
      '',
      'Build stopped: required configuration is missing or invalid.',
      '',
      ...problems.map((problem) => `  • ${problem}`),
      '',
      'Every value above is inlined into the browser bundle at build time, so',
      "setting it only in the host's runtime environment changes nothing and",
      'the build would ship an app that fails on its first API or contract',
      'call. Set them in .env.local for a local build, and in the build',
      "environment for a deployment (Vercel: Project → Settings →",
      'Environment Variables, then redeploy). See .env.example, DEPLOY.md',
      'and the Environment section of README.md.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

/* -------------------------------------------------------------------------
 * Security headers (#73, #147)
 *
 * The policy itself lives in `src/lib/csp.ts`: a pure function of the build
 * environment, unit-tested in `src/lib/csp.test.ts`. It is the difference
 * between "an injected script exfiltrates the user's balance" and "the
 * browser refuses to load it", and it includes Trusted Types (#147) so the
 * DOM sinks that script-src cannot see are covered too.
 *
 * Rollout: the policy is sent as `Content-Security-Policy-Report-Only` by
 * default, so a deployment can be exercised with real wallets while
 * violations are reported and nothing is blocked. Build with
 * `CSP_ENFORCE=1` to send the enforcing header instead. Either way this is a
 * build-time decision — headers are baked in, so redeploy after changing it.
 * ---------------------------------------------------------------------- */

const securityHeaders = [
  {
    key: contentSecurityPolicyHeaderName(process.env),
    value: contentSecurityPolicy(
      process.env,
      process.env.NODE_ENV === 'development',
    ),
  },
  // Never let a browser guess a type: the JSON read model must not be able
  // to render as script.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Belt and braces next to frame-ancestors: nothing embeds the app, ever.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Cross-origin requests carry the origin only, never the path — clinic
  // addresses and voucher ids live in paths.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // The app asks for none of these; a wallet signature is not a payment
  // permission, so the browser APIs stay off.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  // xBull and Albedo hand the signing request to a popup and read the answer
  // back through window.opener, so the stricter `same-origin` would break
  // connecting. This still isolates the document from other openers and
  // cross-origin iframes.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
];

// HSTS only makes sense on a real deployment; a local build is served over
// plain http, where browsers ignore the header anyway.
if (process.env.NODE_ENV === 'production') {
  securityHeaders.push({
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains',
  });
}

const config: NextConfig = {
  reactStrictMode: true,
  // The API base is read at build time for the browser bundle, so it must
  // be present in the hosting platform's build environment, not only at
  // runtime. A frontend still calling localhost in production is almost
  // always this variable missing from the build step.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080',
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default function nextConfig(phase: string): NextConfig {
  assertBuildConfig(phase);
  return withBundleAnalyzer(config);
}
