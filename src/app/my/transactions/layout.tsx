import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Transaction history — SCI Healthcare',
  description:
    'Every transaction the connected wallet took part in, in time order, with a link to each transaction on Stellar Explorer.',
};

/**
 * Metadata only. `page.tsx` is a client component, and a segment's metadata
 * must be exported from a server file in that segment — so it lives here,
 * passing straight through to the page.
 */
export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
