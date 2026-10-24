import { installTrustedTypesDefaultPolicy } from '@/lib/trusted-types';

/**
 * Runs once on the client before the app hydrates (Next.js client
 * instrumentation). Trusted Types enforcement (#147) applies to
 * `script.src`, which Next's script loader and `next/script` use for route
 * chunks and third-party scripts, so the default policy has to exist before
 * any of that runs. See src/lib/trusted-types.ts.
 */
installTrustedTypesDefaultPolicy();
