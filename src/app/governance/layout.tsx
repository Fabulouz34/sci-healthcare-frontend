import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contract governance — SCI Healthcare',
  description:
    'Who controls each SCI Healthcare contract on Stellar, pending admin nominations, and the full audit trail of changes.',
};

/**
 * Metadata only. `page.tsx` is a client component, and a segment's metadata
 * must be exported from a server file in that segment — so it lives here,
 * passing straight through to the page.
 */
export default function GovernanceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
