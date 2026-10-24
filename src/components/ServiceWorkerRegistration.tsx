'use client';

import { useEffect } from 'react';

import { sameOriginScriptUrl } from '@/lib/trusted-types';

/**
 * Registers the offline shell service worker (#74).
 *
 * Registration is deliberately quiet and best-effort: a browser without
 * service workers, an insecure origin, or a failed registration costs the
 * offline shell and nothing else — the app is a normal web app either way,
 * which is also why this never blocks rendering or reports an error.
 *
 * Skipped in development, where a service worker would serve the previous
 * build's HTML over the dev server and make every edit look like it did
 * nothing. `next build` + `next start` is what a clinic runs.
 *
 * The worker itself (`public/sw.js`) caches the shell and the hashed build
 * output only — never the API, RPC or any other origin — and the policy is
 * documented at the top of that file.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    // `register` is a TrustedScriptURL sink (#147): the CSP only lets a
    // `TrustedScriptURL` through, so the path goes via the allowlisted
    // `sci-healthcare` policy. Same-origin only, and a plain string in
    // browsers without Trusted Types.
    navigator.serviceWorker
      .register(sameOriginScriptUrl('/sw.js'), { scope: '/' })
      .catch(() => {
        // Offline support is a convenience; a rejected registration must
        // not surface as an error to a user who is simply using the app.
      });
  }, []);

  return null;
}
