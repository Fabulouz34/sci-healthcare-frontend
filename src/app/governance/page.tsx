'use client';

import { formatDate, shortAddress } from '@/lib/amounts';
import { explorerAccount, explorerTx } from '@/lib/config';
import { useGovernance } from '@/lib/hooks';
import { useLocaleContext } from '@/i18n/LocaleContext';
import { CopyValue } from '@/components/CopyValue';
import { Alert, Card, Empty, ExplorerLink } from '@/components/ui';
import type { GovernanceContract } from '@/lib/api';

/** Pill badge for a single admin address. */
function AdminAddress({ address }: { address: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 py-1 font-mono text-xs">
      <ExplorerLink href={explorerAccount(address)}>
        {shortAddress(address, 6)}
      </ExplorerLink>
      <CopyValue value={address} buttonOnly label="admin address" />
    </span>
  );
}

/** One contract card: current admins, optional pending section, change log. */
function ContractCard({ contract, t }: { contract: GovernanceContract; t: (k: string) => string }) {
  const recentChanges = contract.changes.slice().reverse().slice(0, 10);

  return (
    <Card className="divide-y divide-[var(--color-line)] overflow-hidden">
      {/* Contract header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-soft)]">
            {t('governance.contract')}
          </span>
          <h2 className="mt-0.5 text-base font-semibold capitalize">
            {contract.label}
          </h2>
        </div>
        <ExplorerLink href={explorerAccount(contract.contract)}>
          <span className="font-mono text-xs">{shortAddress(contract.contract, 8)}</span>
        </ExplorerLink>
      </div>

      {/* Current admins */}
      <div className="px-5 py-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-ink-soft)]">
          {t('governance.currentAdmins')}
        </div>
        {contract.currentAdmins.length === 0 ? (
          <p className="text-xs text-[var(--color-ink-soft)]">—</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {contract.currentAdmins.map((addr) => (
              <AdminAddress key={addr} address={addr} />
            ))}
          </div>
        )}
      </div>

      {/* Pending admins — only rendered when there are any */}
      {contract.pendingAdmins.length > 0 && (
        <div className="px-5 py-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-amber-700">
              {t('governance.pendingAdmins')}
            </span>
            <span className="inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
              {contract.pendingAdmins.length}
            </span>
          </div>
          <p className="mb-2 text-xs text-[var(--color-ink-soft)]">
            {t('governance.pendingNote')}
          </p>
          <div className="flex flex-wrap gap-2">
            {contract.pendingAdmins.map((addr) => (
              <AdminAddress key={addr} address={addr} />
            ))}
          </div>
        </div>
      )}

      {/* Recent changes */}
      <div className="px-5 py-4">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--color-ink-soft)]">
          {t('governance.recentChanges')}
        </div>
        {recentChanges.length === 0 ? (
          <p className="text-xs text-[var(--color-ink-soft)]">{t('governance.noChanges')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">
                Governance change log for {contract.label} contract
              </caption>
              <thead>
                <tr className="border-b border-[var(--color-line)] text-[var(--color-ink-soft)]">
                  <th scope="col" className="pb-2 font-medium">Admin</th>
                  <th scope="col" className="pb-2 font-medium">Action</th>
                  <th scope="col" className="pb-2 font-medium">Date</th>
                  <th scope="col" className="pb-2 text-right font-medium">Transaction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {recentChanges.map((change, i) => (
                  <tr key={`${change.txHash}-${i}`} className="align-top">
                    <td className="py-2 pr-3 font-mono">
                      <span className="inline-flex items-center gap-1">
                        <ExplorerLink href={explorerAccount(change.admin)}>
                          {shortAddress(change.admin, 6)}
                        </ExplorerLink>
                        <CopyValue value={change.admin} buttonOnly label="admin address" />
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                          change.action === 'added'
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : 'bg-red-50 text-red-700 ring-red-200'
                        }`}
                      >
                        {change.action === 'added'
                          ? t('governance.actionAdded')
                          : t('governance.actionRemoved')}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-[var(--color-ink-soft)]">
                      {formatDate(change.at)}
                    </td>
                    <td className="py-2 text-right">
                      <ExplorerLink href={explorerTx(change.txHash)}>
                        {t('governance.viewTx')} ↗
                      </ExplorerLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function GovernancePage() {
  const { contracts, updatedAt, isLoading, error } = useGovernance();
  const { t } = useLocaleContext();

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight">{t('governance.title')}</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          {t('governance.description')}
        </p>
        {updatedAt && (
          <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
            {t('governance.updatedAt')}: {formatDate(updatedAt)}
          </p>
        )}
      </div>

      {error && (
        <Alert kind="error">{t('governance.loadingError')}</Alert>
      )}

      {isLoading && (
        <p className="text-sm text-[var(--color-ink-soft)]">{t('common.loading')}</p>
      )}

      {!isLoading && !error && contracts.length === 0 && (
        <Empty>{t('governance.noContracts')}</Empty>
      )}

      {!isLoading && contracts.length > 0 && (
        <div className="space-y-6">
          {contracts.map((c) => (
            <ContractCard key={c.contract} contract={c} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
