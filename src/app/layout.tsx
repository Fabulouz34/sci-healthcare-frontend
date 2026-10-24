import type { Metadata, Viewport } from 'next';
import Link from 'next/link';

import { Analytics } from '@/components/Analytics';
import { AnalyticsToggle } from '@/components/AnalyticsToggle';
import { CommandPalette } from '@/components/CommandPalette';
import { ErrorReporter } from '@/components/ErrorReporter';
import { PendingTransactionGuard } from '@/components/PendingTransactionGuard';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import { SwrProvider } from '@/components/SwrProvider';
import { TestnetNotice } from '@/components/TestnetNotice';
import { ToastProvider } from '@/components/Toast';
import { SiteHeader } from '@/components/SiteHeader';
import { WalletProvider } from '@/lib/wallet';
import { config, isTestnet } from '@/lib/config';

import { LocaleProvider } from '@/i18n/LocaleContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

import './globals.css';

export const metadata: Metadata = {
  title: 'SCI Healthcare — care vouchers on Stellar',
  description:
    'Prepaid, purpose-bound care vouchers. Money committed to a named clinic and a named service, released when care is confirmed delivered.',
  // Installable app (#74). The manifest itself is served from
  // `src/app/manifest.ts`; declaring it here keeps the link explicit (and is
  // what makes the install prompt available at all).
  manifest: '/manifest.webmanifest',
  applicationName: 'SCI Healthcare',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    title: 'SCI Healthcare',
    statusBarStyle: 'default',
  },
};

/** Same brand colour the app paints with, so the chrome does not flash. */
export const viewport: Viewport = {
  themeColor: '#0f766e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // suppressHydrationWarning: the theme init script sets data-theme before
  // paint, which the server render cannot know (#10).
  //
  // dir starts as `ltr` because the server renders English; LocaleProvider
  // rewrites it from the stored locale (#131), the same way it rewrites
  // `lang`. Every layout rule below is a logical utility, so the whole tree
  // follows that one attribute.
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        {/* Theme before paint (#10): stored override, else the OS setting.
            A same-origin script in the server HTML rather than an inline
            `dangerouslySetInnerHTML` script: React renders inline script
            content through `innerHTML`, a Trusted Types script sink (#147).
            Parser-inserted and synchronous, so it still runs before paint. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- runs before
            paint on purpose; deferring it would flash the wrong theme */}
        <script src="/theme-init.js" />
      </head>
      <body>
        {config.plausibleDomain ? <Analytics domain={config.plausibleDomain} /> : null}
        <ErrorReporter />
        <PendingTransactionGuard />
        <ServiceWorkerRegistration />
        <WalletProvider>
          {/* Application-wide SWR defaults, relaxed in low-bandwidth mode
              (#75). The setting is read once here so every page below sees
              the same behaviour. */}
          <SwrProvider>
            {/* Language for translated text (#5); defaults to English and
                remembers the visitor's choice. */}
            <LocaleProvider>
            <div className="print:hidden">
              <TestnetNotice />
            </div>
            <SiteHeader />
            <CommandPalette />

            <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 print:max-w-none print:px-0 print:py-0">
              {/* Toasts live here so transaction results from any page appear
                  wherever the user is looking (#80). */}
              <ToastProvider>{children}</ToastProvider>
            </main>

            <footer className="mx-auto max-w-6xl border-t border-[var(--color-line)] px-4 py-8 text-xs text-[var(--color-ink-soft)] sm:px-6 print:hidden">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-xl">
                  {isTestnet
                    ? 'Testnet deployment. No real funds, and no patient health information is stored on chain — vouchers reference a service category and an opaque beneficiary reference only.'
                    : 'No patient health information is stored on chain — vouchers reference a service category and an opaque beneficiary reference only.'}
                </p>
                {/* Language choice for translated text (#5). */}
                <LanguageSwitcher />
                {/* Explicit analytics opt-out (#143); hidden when analytics
                    is not configured at build time. */}
                <AnalyticsToggle />
                <nav aria-label="Footer navigation" className="flex flex-wrap gap-4 font-medium text-[var(--color-ink)]">
                  <Link href="/how-it-works" className="hover:text-[var(--color-brand)]">
                    How it works
                  </Link>
                  <Link href="/stats" className="hover:text-[var(--color-brand)]">
                    Stats
                  </Link>
                  <Link href="/attesters" className="hover:text-[var(--color-brand)]">
                    Attesters
                  </Link>
                  <Link href="/privacy" className="hover:text-[var(--color-brand)]">
                    Privacy
                  </Link>
                  <Link href="/faq" className="hover:text-[var(--color-brand)]">
                    FAQ
                  </Link>
                  <Link href="/status" className="hover:text-[var(--color-brand)]">
                    Status
                  </Link>
                  <a
                    href="https://godgift-care.github.io/sci-healthcare-contracts/"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-[var(--color-brand)]"
                  >
                    Docs
                  </a>
                </nav>
              </div>
            </footer>
            </LocaleProvider>
          </SwrProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
