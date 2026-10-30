import type { MetadataRoute } from 'next';

/**
 * Web app manifest (#74).
 *
 * What makes the app installable: a name, a start URL, `standalone` display
 * and icons at the two sizes the install prompt requires, plus a maskable
 * one so an Android launcher can crop it to its own shape.
 *
 * The colours are the ones the app itself paints with (see `globals.css`),
 * so the splash screen and status bar do not flash a different product on
 * the way in.
 *
 * The offline behaviour that goes with this lives in `public/sw.js`, which
 * is registered from `ServiceWorkerRegistration`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SCI Healthcare — care vouchers on Stellar',
    short_name: 'SCI Healthcare',
    description:
      'Prepaid, purpose-bound care vouchers. Money committed to a named clinic and a named service, released when care is confirmed delivered.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f6f8fa',
    theme_color: '#0f766e',
    icons: [
      {
        src: '/icons/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
