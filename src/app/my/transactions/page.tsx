'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { useLocaleContext } from '@/i18n/LocaleContext';
import { formatDate } from '@/lib/amounts';
import { explorerTx } from '@/lib/config';
import { useLiveUpdates, useWalletHistory } from '@/lib/hooks';
import { sortHistoryRows, type HistoryOrder } from '@/lib/wallet-history';
import { useWallet } from '@/lib/wallet';
import { Alert, Card, Empty, ExplorerLink } from '@/components/ui';
import { SkeletonRow } from '@/components/Skeleton';

/**
 * The connected wallet's transaction history (#165).
 *
 * The question this page answers is "what did this wallet take part in, and
 * what did it sign?". Every line is one contract event, in time order, with
 * the link to the transaction behind it — so the answer can be checked on
 * chain instead of taken on trust.
 */

type Scope = 'all' | 'signed';

export default function TransactionsPage() {
  const { address } = useWallet();
  const { locale } = useLocaleContext();
  useLiveUpdates();

  const { rows, signedCount, error, isLoading, eventsUnavailable, truncated } =
    useWalletHistory(address);

  const [scope, setScope] = useState<Scope>('all');
  const [order, setOrder] = useState<HistoryOrder>('newest');

  const visible = useMemo(() => {
    const scoped = scope === 'signed' ? rows.filter((row) => row.actor === 'wallet') : rows;
    return sortHistoryRows(scoped, order);
  }, [rows, scope, order]);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">Transaction history</h1>
        <p className="text-sm text-[var(--color-ink-soft)]">
          Every transaction this wallet took part in, newest first. Each line links to the
          transaction on Stellar Explorer, so it can be checked on chain.
        </p>
      </section>

      {!address && (
        <Empty>Connect a wallet to see the transactions it took part in.</Empty>
      )}

      {address && error && <Alert>{error}</Alert>}

      {address && eventsUnavailable && (
        <Alert kind="info">
          This indexer does not publish the on-chain event log yet, so the transactions cannot
          be listed. The vouchers themselves are still shown on{' '}
          <Link href="/my" className="font-medium underline underline-offset-2">
            My vouchers
          </Link>
          .
        </Alert>
      )}

      {address && isLoading && (
        <Card className="space-y-4 p-5">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </Card>
      )}

      {address && !isLoading && !eventsUnavailable && rows.length === 0 && (
        <Empty>
          No transactions yet. The history fills up as this wallet funds a voucher or takes
          part in one.
        </Empty>
      )}

      {address && !isLoading && rows.length === 0 && eventsUnavailable && (
        <Empty>No transactions to show.</Empty>
      )}

      {visible.length > 0 && (
        <>
          <Card className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                  Show
                </span>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as Scope)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                >
                  <option value="all">All transactions</option>
                  <option value="signed">Signed by this wallet</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                  Order
                </span>
                <select
                  value={order}
                  onChange={(e) => setOrder(e.target.value as HistoryOrder)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </label>
            </div>
            <div className="text-xs text-[var(--color-ink-soft)]" aria-live="polite">
              Showing {visible.length} transaction{visible.length === 1 ? '' : 's'}
              {scope === 'signed' ? ' signed by this wallet' : ''} · {signedCount} signed by
              this wallet in total
              {truncated && ' · older vouchers are not listed here yet'}
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <ul className="divide-y divide-[var(--color-line)]">
              {visible.map((row) => (
                <li
                  key={row.key}
                  className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{row.label}</span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          row.actor === 'wallet'
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : 'bg-slate-100 text-slate-600 ring-slate-200'
                        }`}
                      >
                        {row.actorLabel}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--color-ink-soft)]">{row.detail}</div>
                    <div className="text-xs text-[var(--color-ink-soft)]">
                      {row.clinicName}
                      {row.clinicName && row.serviceLabel ? ' · ' : ''}
                      {row.serviceLabel}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <Link
                        href={`/vouchers/${row.voucherId}`}
                        className="text-[var(--color-ink-soft)] underline underline-offset-2"
                      >
                        Voucher #{row.voucherId}
                      </Link>
                      {row.txHash ? (
                        <ExplorerLink href={explorerTx(row.txHash)}>
                          View transaction
                        </ExplorerLink>
                      ) : (
                        <span className="text-[var(--color-ink-soft)]">
                          No transaction hash
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-start sm:text-end">
                    <div className="mono text-sm font-semibold">${row.amountDisplay}</div>
                    <div className="text-xs text-[var(--color-ink-soft)]">
                      {row.at ? formatDate(row.at, locale) : 'Date unknown'}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
