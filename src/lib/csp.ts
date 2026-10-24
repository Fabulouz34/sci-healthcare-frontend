/**
 * Content-Security-Policy for the web app (#73, #147).
 *
 * A pure function of the build environment so it can be unit-tested in Node
 * (`src/lib/csp.test.ts`) while `next.config.ts` only wires it into headers.
 * Nothing here touches the DOM, the filesystem or `process.env` directly.
 *
 * Trusted Types (#147)
 * --------------------
 * `script-src` limits which scripts may load, but says nothing about the DOM
 * APIs that turn strings into script: `Element.innerHTML`, `insertAdjacentHTML`,
 * `eval`, `new Function`, `document.write`, `Range.createContextualFragment`
 * and script/URL assignment. Trusted Types makes those sinks accept only a
 * `TrustedHTML`/`TrustedScript`/`TrustedScriptURL` created by an allowlisted
 * policy, which removes the whole "inject a string that becomes script" class
 * of XSS — the highest-value bug in an app that signs transactions.
 *
 * The directive ships in the same policy as the rest: report-only by default
 * (so a deployment can be exercised with real wallets and violations are
 * reported without blocking anything), enforcing when `CSP_ENFORCE=1` is set
 * at build time. The app itself has no unsafe DOM sinks — the only one, the
 * pre-paint theme script, is served as a static file (`public/theme-init.js`)
 * instead of `dangerouslySetInnerHTML` — so enforcement adds no work for the
 * app's own code. `trusted-types` names the one policy this app may create,
 * and every wallet runs in its own document (extension world or popup) and is
 * therefore outside this policy.
 */

import { TRUSTED_TYPES_POLICY } from './trusted-types';

export type CspEnv = Record<string, string | undefined>;

export { TRUSTED_TYPES_POLICY };

/** `https://host` for an absolute URL, or null when it is missing/unusable. */
function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Horizon, read directly for account state and spendable XLM. */
function horizonOrigin(network: string): string {
  if (network === 'public') return 'https://horizon.stellar.org';
  if (network === 'futurenet') return 'https://horizon-futurenet.stellar.org';
  return 'https://horizon-testnet.stellar.org';
}

/**
 * The wallet endpoints a user can actually reach from this page.
 *
 * Freighter, Rabet, LOBSTR, Hana, Klever, OneKey, Bitget, Cactus and D'CENT
 * are browser extensions: their scripts are injected into an isolated world
 * and are not subject to this policy at all. Albedo and xBull open a popup
 * and hand it the request — Albedo over XHR to `albedo.link`, xBull over
 * `postMessage` to `wallet.xbull.app` — so both hosts have to be allowed to
 * connect. `stellar.creit.tech` serves the wallet icons in the kit's own
 * selection modal.
 */
const WALLETS = {
  albedo: 'https://albedo.link',
  xbull: 'https://wallet.xbull.app',
  icons: 'https://stellar.creit.tech',
};

/**
 * WalletConnect / Reown AppKit (#163), only when the build configured a
 * project id. The pairing relay is a WebSocket; the rest are the verify,
 * explorer and wallet-icon endpoints AppKit reaches while the user picks a
 * mobile wallet.
 */
const WALLET_CONNECT = {
  relay: 'https://relay.walletconnect.com',
  relaySocket: 'wss://relay.walletconnect.com',
  verify: 'https://verify.walletconnect.com',
  explorer: 'https://explorer-api.walletconnect.com',
  pulse: 'https://pulse.walletconnect.org',
  web3modal: 'https://api.web3modal.com',
  reownApi: 'https://api.web3modal.org',
  icons: 'https://walletconnect.com',
  assets: 'https://assets.reown.com',
  fonts: 'https://fonts.reown.com',
} as const;

/** OpenStreetMap raster tiles, requested only when the map view is opened. */
const MAP_TILES = 'https://tile.openstreetmap.org';

/**
 * Builds the policy string.
 *
 * `isDev` is passed rather than read from `process.env.NODE_ENV` so the
 * development-only allowances (`'unsafe-eval'`, `ws:`) are assertable too.
 */
export function contentSecurityPolicy(
  env: CspEnv,
  isDev = false,
): string {
  const network = env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
  const api = originOf(env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080');
  const rpc = originOf(env.NEXT_PUBLIC_SOROBAN_RPC_URL);
  // Empty DSN disables error reporting entirely; then no origin is allowed.
  const sentry = originOf(env.NEXT_PUBLIC_SENTRY_DSN);
  // Empty domain disables analytics entirely; the script never loads.
  const plausible = env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN
    ? 'https://plausible.io'
    : null;
  const walletConnectEnabled = Boolean(
    env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim(),
  );

  const directives: Record<string, (string | false | null | undefined)[]> = {
    'default-src': ["'self'"],
    // No <base> rewriting, no plugins, no framing, no cross-origin form posts.
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    // Next's hydration payload is an inline script. Without a per-request
    // nonce — which would force every route to render dynamically and break
    // the installable offline shell (#74) — 'unsafe-inline' is what lets it
    // run. External scripts are still restricted to 'self' and Plausible,
    // which is where the injected-script risk lives. Dev additionally needs
    // 'unsafe-eval' for the HMR runtime.
    'script-src': ["'self'", "'unsafe-inline'", plausible, isDev && "'unsafe-eval'"],
    // Trusted Types (#147): the DOM sinks behind script-src's blind spot.
    // `trusted-types` limits policy creation to this app's own policy;
    // `require-trusted-types-for 'script'` is what turns string sinks into
    // TypeError/securitypolicyviolation. In a report-only policy both are
    // observed and reported, never enforced — which is the rollout state.
    // `default` is the framework's script loader (see trusted-types.ts);
    // `sci-healthcare` is the app's own policy. Nothing else may be created.
    'trusted-types': ['default', TRUSTED_TYPES_POLICY, "'allow-duplicates'"],
    'require-trusted-types-for': ["'script'"],
    // Tailwind ships a stylesheet, but Leaflet positions markers with inline
    // style attributes, which need 'unsafe-inline' here.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': [
      "'self'",
      'data:',
      'blob:',
      MAP_TILES,
      WALLETS.icons,
      walletConnectEnabled && WALLET_CONNECT.icons,
      walletConnectEnabled && WALLET_CONNECT.explorer,
      walletConnectEnabled && WALLET_CONNECT.assets,
      walletConnectEnabled && WALLET_CONNECT.web3modal,
    ],
    'font-src': [
      "'self'",
      'data:',
      walletConnectEnabled && WALLET_CONNECT.fonts,
    ],
    // Every fetch, EventSource and contract read/write the app performs.
    'connect-src': [
      "'self'",
      api,
      rpc,
      horizonOrigin(network),
      WALLETS.albedo,
      WALLETS.xbull,
      plausible,
      sentry,
      walletConnectEnabled && WALLET_CONNECT.relay,
      walletConnectEnabled && WALLET_CONNECT.relaySocket,
      walletConnectEnabled && WALLET_CONNECT.verify,
      walletConnectEnabled && WALLET_CONNECT.explorer,
      walletConnectEnabled && WALLET_CONNECT.pulse,
      walletConnectEnabled && WALLET_CONNECT.web3modal,
      walletConnectEnabled && WALLET_CONNECT.reownApi,
      isDev && 'ws:',
    ],
    // Wallet signing happens in a popup (window.open), never an iframe, so
    // only this app's own frames are allowed. WalletConnect's Verify screen
    // is the one exception: AppKit embeds it while a mobile wallet pairs.
    'frame-src': [
      "'self'",
      walletConnectEnabled && WALLET_CONNECT.verify,
    ],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
  };

  return Object.entries(directives)
    .map(([name, values]) => {
      const allowed = values.filter((value): value is string => Boolean(value));
      return `${name} ${allowed.join(' ')}`;
    })
    .join('; ');
}

/** Header the policy is sent under: report-only until `CSP_ENFORCE=1`. */
export function contentSecurityPolicyHeaderName(env: CspEnv): string {
  return env.CSP_ENFORCE
    ? 'Content-Security-Policy'
    : 'Content-Security-Policy-Report-Only';
}
