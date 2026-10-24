/**
 * Trusted Types support for the app's own DOM sinks (#147).
 *
 * The CSP (`src/lib/csp.ts`) sends `require-trusted-types-for 'script'` and
 * allowlists exactly one policy, `sci-healthcare`. Browsers that do not
 * implement Trusted Types simply expose no `window.trustedTypes`, and every
 * helper here degrades to returning the plain string.
 *
 * Two policies are used, both allowlisted by the CSP:
 *
 * - `sci-healthcare` (named): the app's own sinks, currently the service
 *   worker registration.
 * - `default`: the framework's script loader assigns `script.src` for route
 *   chunks and `next/script`, which is a `TrustedScriptURL` sink. A default
 *   policy is the only way to keep the framework working under enforcement.
 *   It deliberately exposes *only* `createScriptURL`, limited to this origin
 *   and the analytics origin the CSP already allows; there is no
 *   `createHTML` and no `createScript`, so `innerHTML`, `insertAdjacentHTML`,
 *   `eval`, `new Function` and `document.write` still throw under
 *   enforcement. That is the part of Trusted Types that stops XSS.
 */

export const TRUSTED_TYPES_POLICY = 'sci-healthcare';

type TrustedTypePolicyLike = {
  createScriptURL(input: string): unknown;
};

type TrustedTypesLike = {
  createPolicy(
    name: string,
    rules: { createScriptURL?: (input: string) => string },
  ): TrustedTypePolicyLike;
};

function factory(): TrustedTypesLike | null {
  if (typeof window === 'undefined') return null;
  const windowWithTrustedTypes = window as unknown as {
    trustedTypes?: TrustedTypesLike;
  };
  return windowWithTrustedTypes.trustedTypes ?? null;
}

let cached: TrustedTypePolicyLike | null | undefined;

function policy(): TrustedTypePolicyLike | null {
  if (cached !== undefined) return cached;
  const trustedTypes = factory();
  if (!trustedTypes) {
    cached = null;
    return cached;
  }
  try {
    cached = trustedTypes.createPolicy(TRUSTED_TYPES_POLICY, {
      createScriptURL(input: string): string {
        const resolved = new URL(input, window.location.href);
        if (resolved.origin !== window.location.origin) {
          throw new TypeError(
            `Refusing a cross-origin script URL: ${resolved.origin}`,
          );
        }
        return input;
      },
    });
  } catch {
    // The policy already exists (hot reload) or the browser refused it. A
    // plain string is still correct where Trusted Types are not enforced.
    cached = null;
  }
  return cached;
}

/**
 * A `TrustedScriptURL` for a same-origin script (the service worker), or the
 * input unchanged when Trusted Types are unavailable.
 */
export function sameOriginScriptUrl(url: string): string {
  const active = policy();
  if (!active) return url;
  return active.createScriptURL(url) as string;
}

/** Origins a script may be loaded from, matching the CSP's `script-src`. */
function isAllowedScriptOrigin(url: URL): boolean {
  return (
    url.origin === window.location.origin ||
    url.origin === 'https://plausible.io'
  );
}

/**
 * Installs the `default` Trusted Types policy. Must run before any framework
 * code assigns a script URL; `instrumentation-client.ts` calls it on the
 * client entry, before React hydrates. Without Trusted Types (or when the
 * policy was already created) this is a no-op.
 */
export function installTrustedTypesDefaultPolicy(): void {
  if (typeof window === 'undefined') return;
  const trustedTypes = factory();
  if (!trustedTypes) return;
  const existing = (window as unknown as { __sciTrustedTypesDefault?: boolean })
    .__sciTrustedTypesDefault;
  if (existing) return;
  try {
    trustedTypes.createPolicy('default', {
      createScriptURL(input: string): string {
        const resolved = new URL(input, window.location.href);
        if (!isAllowedScriptOrigin(resolved)) {
          throw new TypeError(
            `Refusing a script from ${resolved.origin}: not allowed by the policy`,
          );
        }
        return input;
      },
    });
    (window as unknown as { __sciTrustedTypesDefault?: boolean })
      .__sciTrustedTypesDefault = true;
  } catch {
    // The CSP does not allow the default policy (older build) or it already
    // exists; either way the page keeps working where TT is report-only.
  }
}
