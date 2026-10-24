'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import useSWR from 'swr';

import { formatUsdc, toAmountInput, toBaseUnits } from '@/lib/amounts';
import type { VoucherStatus } from '@/lib/api';
import { monthlyEarnings, summariseEarnings } from '@/lib/clinic-earnings';
import { explorerTx } from '@/lib/config';
import { humaniseError, REGISTRY_ERRORS } from '@/lib/errors';
import {
  useLiveUpdates,
  useProvider,
  useProviderStats,
  useProviderVouchers,
  useVouchers,
} from '@/lib/hooks';
import { registry, type ProviderStanding } from '@/lib/protocol';
import {
  VOUCHER_STATUSES,
  filterVouchers,
  statusCounts,
} from '@/lib/voucher-filters';
import { useWallet } from '@/lib/wallet';
import { ClinicChecklist } from '@/components/ClinicChecklist';
import { QrScannerModal } from '@/components/QrScannerModal';
import { VoucherRow } from '@/components/VoucherRow';
import { useToast } from '@/components/Toast';
import { Button, Card, Empty, ExplorerLink } from '@/components/ui';
import { Skeleton, SkeletonRow } from '@/components/Skeleton';

import { useLocaleContext } from '@/i18n/LocaleContext';

/** null while loading; 'Unregistered' when the registry has no entry. */
type Standing = ProviderStanding | 'Unregistered' | null;

/**
 * One status tab. `aria-pressed` rather than a tablist: the list below is not
 * a separate panel, and a pressed filter button is announced as one.
 */
function StatusTab({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex max-sm:min-h-11 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'border-transparent bg-[var(--color-brand)] text-white'
          : 'border-[var(--color-line)] bg-white text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]'
      }`}
    >
      <span>{children}</span>
      <span
        className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
          active ? 'bg-white/20' : 'bg-[var(--color-canvas)]'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

const STANDING_TEXT: Record<Exclude<Standing, null>, string> = {
  Unregistered: 'This wallet is not registered as a clinic yet. Register below.',
  Pending:
    'Registered and awaiting verification. An administrator must verify this clinic before it can list services or receive vouchers.',
  Active: 'This clinic is verified and can receive vouchers.',
  Suspended:
    'This clinic is suspended. It cannot list services, receive new vouchers or claim funded ones. Contact the administrator.',
};

/** `YYYY-MM` as a localised short month and year, read in UTC. */
function monthLabel(month: string, locale: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const tag = locale === 'fr' ? 'fr-FR' : locale === 'sw' ? 'sw-KE' : 'en-GB';
  return new Intl.DateTimeFormat(tag, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

/**
 * Clinic desk.
 *
 * A clinic self-registers here and is Pending until an administrator
 * activates it. Only then can it list services or receive vouchers.
 *
 * Uses SWR caching (#63) and live updates via SSE with polling fallback (#64).
 */
export default function ClinicDeskPage() {
  const router = useRouter();
  const { address, signTransaction, connect } = useWallet();
  const { t, locale } = useLocaleContext();

  const [busy, setBusy] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const toast = useToast();

  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [price, setPrice] = useState('');
  // Delisting takes a second click, like disputing.
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  // Incoming-voucher filters. A clerk reads one number off a patient's pass,
  // so the list narrows by status and by that number, together.
  const [statusFilter, setStatusFilter] = useState<VoucherStatus | null>(null);
  const [search, setSearch] = useState('');

  // SWR cached reads (#63)
  const { provider, mutate: mutateProvider } = useProvider(address);
  const { vouchers, mutate: mutateVouchers } = useVouchers(
    address ? { provider: address } : null,
  );
  const { data: status, mutate: mutateStatus } = useSWR(
    address ? ['registry:status', address] : null,
    () => registry.providerStatus(address!),
  );

  const standing: Standing =
    status !== undefined
      ? (status ?? 'Unregistered')
      : provider
        ? provider.status
        : null;

  // Only a registered clinic has statistics to read; an unregistered wallet
  // would get a 404 from the endpoint on every page load.
  const earningsAddress = standing && standing !== 'Unregistered' ? address : null;
  const {
    stats: clinicStats,
    error: statsError,
    mutate: mutateStats,
  } = useProviderStats(earningsAddress);
  const {
    vouchers: earningsVouchers,
    error: earningsError,
    isLoading: earningsLoading,
    mutate: mutateEarningsVouchers,
  } = useProviderVouchers(earningsAddress);

  const earnings = useMemo(() => summariseEarnings(earningsVouchers), [earningsVouchers]);
  const months = useMemo(() => monthlyEarnings(earningsVouchers), [earningsVouchers]);
  // Distinguish "nothing earned yet" from "the vouchers could not be read":
  // the first is worth showing as zero, the second is not.
  const earningsReady = !earningsLoading && !earningsError;

  // Live SSE stream with automatic fallback to polling (#64)
  useLiveUpdates({ providerAddress: address ?? undefined });

  const refreshAll = () => {
    void mutateProvider();
    void mutateVouchers();
    void mutateStatus();
    void mutateStats();
    void mutateEarningsVouchers();
  };

  const services = (provider?.services ?? []).filter((s) => s.active !== false);

  async function submit(fn: () => Promise<{ hash: string }>, table = REGISTRY_ERRORS) {
    if (!address) return void connect();
    setBusy(true);
    try {
      const res = await fn();
      setConfirmRemove(null);
      refreshAll();
      toast.success(
        <>
          {t('common.submitted')}{' '}
          <ExplorerLink href={explorerTx(res.hash)}>{t('common.viewTransaction')}</ExplorerLink>{' '}
          {t('common.indexerCatchUp')}
        </>,
      );
    } catch (err) {
      toast.error(humaniseError(err, table, locale));
    } finally {
      setBusy(false);
    }
  }

  function edit(s: { code: number; label: string; price: string }) {
    setCode(String(s.code));
    setLabel(s.label);
    setPrice(toAmountInput(s.price));
  }

  if (!address) {
    return <Empty>{t('clinic.connectWallet')}</Empty>;
  }

  const editing = services.some((s) => String(s.code) === code);

  // Counts cover the whole inbox, not the current search, so the tabs stay a
  // map of what is waiting rather than shrinking as a number is typed.
  const counts = statusCounts(vouchers);
  const statusTabs = VOUCHER_STATUSES.filter(
    (s) => counts[s] > 0 || s === statusFilter,
  );
  const visibleVouchers = filterVouchers(vouchers, {
    status: statusFilter,
    clinic: null,
    search,
  });
  const filtering = statusFilter !== null || search.trim() !== '';

  function clearFilters() {
    setStatusFilter(null);
    setSearch('');
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('clinic.title')}</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            {standing === null ? t('clinic.checking') : STANDING_TEXT[standing]}
          </p>
        </div>
        <div>
          <Button
            variant="ghost"
            onClick={() => setScannerOpen(true)}
            className="flex items-center gap-1.5"
            aria-label="Scan voucher QR code"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span>{t('clinic.scanVoucherQr')}</span>
          </Button>
        </div>
      </div>

      <QrScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(voucherId) => {
          setScannerOpen(false);
          router.push(`/vouchers/${voucherId}`);
        }}
      />

      {standing !== null && (standing === 'Unregistered' || provider !== null) && (
        <ClinicChecklist
          status={standing}
          services={provider?.services ?? []}
          vouchers={earningsVouchers}
        />
      )}

      {standing !== null && standing !== 'Unregistered' && (
        <section aria-labelledby="clinic-earnings" className="space-y-5">
          <div>
            <h2 id="clinic-earnings" className="text-lg font-semibold">
              {t('clinic.earnings')}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              {t('clinic.earningsNote')}
            </p>
          </div>

          {(statsError || earningsError) && (
            <p className="text-sm text-[var(--color-ink-soft)]">
              {t('clinic.earningsUnavailable')}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div role="group" aria-label={t('clinic.earningsSettled')}>
              <Card className="h-full p-4">
                <div className="text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                  {t('clinic.earningsSettled')}
                </div>
                <div className="mt-1 text-2xl font-bold">
                  {clinicStats
                    ? `$${formatUsdc(clinicStats.settledValue, locale)}`
                    : earningsReady
                      ? `$${formatUsdc(earnings.settled, locale)}`
                      : '—'}
                </div>
                <div className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                  {earningsLoading ? (
                    <Skeleton className="mt-1 h-3 w-28" />
                  ) : (
                    t('clinic.earningsSettledDetail', {
                      count: clinicStats?.settledVouchers ?? earnings.settledCount,
                      net: earningsReady
                        ? `$${formatUsdc(earnings.netReceived, locale)}`
                        : '—',
                    })
                  )}
                </div>
              </Card>
            </div>

            <div role="group" aria-label={t('clinic.earningsPending')}>
              <Card className="h-full p-4">
                <div className="text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                  {t('clinic.earningsPending')}
                </div>
                <div className="mt-1 text-2xl font-bold">
                  {earningsReady ? `$${formatUsdc(earnings.pending, locale)}` : '—'}
                </div>
                <div className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                  {earningsLoading ? (
                    <Skeleton className="mt-1 h-3 w-28" />
                  ) : earningsReady ? (
                    t('clinic.earningsPendingDetail', {
                      count: earnings.pendingCount,
                    })
                  ) : (
                    t('clinic.earningsUnavailable')
                  )}
                </div>
              </Card>
            </div>

            <div role="group" aria-label={t('clinic.earningsFees')}>
              <Card className="h-full p-4">
                <div className="text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                  {t('clinic.earningsFees')}
                </div>
                <div className="mt-1 text-2xl font-bold">
                  {earningsReady ? `$${formatUsdc(earnings.fees, locale)}` : '—'}
                </div>
                <div className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                  {t('clinic.earningsFeesDetail')}
                </div>
              </Card>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-base font-semibold">{t('clinic.earningsMonthly')}</h3>
              <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                {t('clinic.earningsMonthlyNote')}
              </p>
            </div>

            <Card className="p-4">
              {earningsLoading ? (
                <div className="space-y-4 py-2">
                  <SkeletonRow />
                  <SkeletonRow />
                </div>
              ) : earningsError ? (
                <p className="text-sm text-[var(--color-ink-soft)]">
                  {t('clinic.earningsUnavailable')}
                </p>
              ) : months.length === 0 ? (
                <Empty>{t('clinic.earningsEmpty')}</Empty>
              ) : (
                <table className="block w-full text-start text-sm sm:table">
                  <caption className="sr-only">{t('clinic.earningsMonthly')}</caption>
                  <thead className="hidden sm:table-header-group">
                    <tr className="border-b border-[var(--color-line)] text-xs text-[var(--color-ink-soft)]">
                      <th scope="col" className="pb-2 font-medium">
                        {t('clinic.earningsMonth')}
                      </th>
                      <th scope="col" className="pb-2 text-end font-medium">
                        {t('clinic.earningsSettled')}
                      </th>
                      <th scope="col" className="pb-2 text-end font-medium">
                        {t('clinic.earningsPending')}
                      </th>
                      <th scope="col" className="pb-2 text-end font-medium">
                        {t('clinic.earningsFees')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="block divide-y divide-[var(--color-line)] sm:table-row-group">
                    {months.map((month) => (
                      <tr
                        key={month.month}
                        className="grid grid-cols-3 gap-x-3 gap-y-1 py-3 sm:table-row sm:py-0"
                      >
                        <th
                          scope="row"
                          className="col-span-3 text-start font-medium sm:table-cell sm:py-2.5"
                        >
                          {monthLabel(month.month, locale)}
                        </th>
                        <td className="sm:table-cell sm:py-2.5 sm:text-end">
                          <span className="block text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)] sm:hidden">
                            {t('clinic.earningsSettled')}
                          </span>
                          <span className="mono">${formatUsdc(month.settled, locale)}</span>
                        </td>
                        <td className="sm:table-cell sm:py-2.5 sm:text-end">
                          <span className="block text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)] sm:hidden">
                            {t('clinic.earningsPending')}
                          </span>
                          <span className="mono">${formatUsdc(month.pending, locale)}</span>
                        </td>
                        <td className="sm:table-cell sm:py-2.5 sm:text-end">
                          <span className="block text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)] sm:hidden">
                            {t('clinic.earningsFees')}
                          </span>
                          <span className="mono">${formatUsdc(month.fees, locale)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="block border-t border-[var(--color-line)] font-medium sm:table-footer-group">
                    <tr className="grid grid-cols-3 gap-x-3 gap-y-1 pt-3 sm:table-row sm:pt-0">
                      <th scope="row" className="col-span-3 text-start sm:table-cell sm:py-2.5">
                        {t('clinic.earningsTotal')}
                      </th>
                      <td className="sm:table-cell sm:py-2.5 sm:text-end">
                        <span className="block text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)] sm:hidden">
                          {t('clinic.earningsSettled')}
                        </span>
                        <span className="mono">${formatUsdc(earnings.settled, locale)}</span>
                      </td>
                      <td className="sm:table-cell sm:py-2.5 sm:text-end">
                        <span className="block text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)] sm:hidden">
                          {t('clinic.earningsPending')}
                        </span>
                        <span className="mono">${formatUsdc(earnings.pending, locale)}</span>
                      </td>
                      <td className="sm:table-cell sm:py-2.5 sm:text-end">
                        <span className="block text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)] sm:hidden">
                          {t('clinic.earningsFees')}
                        </span>
                        <span className="mono">${formatUsdc(earnings.fees, locale)}</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </Card>
          </div>
        </section>
      )}

      {standing === 'Unregistered' && (
        <Card className="space-y-3 p-5">
          <h2 className="font-medium">{t('clinic.registerTitle')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('clinic.clinicName')}
              className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
            />
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
              placeholder={t('clinic.countryCode')}
              className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
            />
          </div>
          <Button
            disabled={busy || !name || country.length !== 2}
            onClick={() =>
              void submit(() =>
                registry.registerProvider(address, name, country, signTransaction),
              )
            }
          >
            {busy ? t('common.confirming') : t('clinic.register')}
          </Button>
        </Card>
      )}

      {standing === 'Active' && (
        <Card className="p-5">
          <h2 className="font-medium">{t('clinic.services')}</h2>
          {services.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              {t('clinic.noServices')}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--color-line)]">
              {services.map((s) => (
                <li
                  key={s.code}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="text-xs text-[var(--color-ink-soft)]">
                      {t('clinic.code', { code: s.code })} · <span className="mono">${formatUsdc(s.price, locale)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" disabled={busy} onClick={() => edit(s)}>
                      {t('clinic.edit')}
                    </Button>
                    {confirmRemove === s.code ? (
                      <>
                        <Button
                          variant="danger"
                          disabled={busy}
                          onClick={() =>
                            void submit(() =>
                              registry.removeService(address, s.code, signTransaction),
                            )
                          }
                        >
                          {busy ? t('common.confirming') : t('clinic.confirmDelist')}
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setConfirmRemove(null)}
                        >
                          {t('common.cancel')}
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setConfirmRemove(s.code)}
                      >
                        {t('clinic.delist')}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {confirmRemove !== null && (
            <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
              {t('clinic.delistNote')}
            </p>
          )}
        </Card>
      )}

      {standing === 'Active' && (
        <Card className="space-y-3 p-5">
          <h2 className="font-medium">
            {editing ? t('clinic.updateService', { code }) : t('clinic.listService')}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder={t('clinic.codePlaceholder')}
              className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
            />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('clinic.labelPlaceholder')}
              className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm sm:col-span-2"
            />
          </div>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={t('clinic.pricePlaceholder')}
            className="mono w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
          />
          <p className="text-xs text-[var(--color-ink-soft)]">
            {t('clinic.serviceNote')}
          </p>
          <Button
            disabled={busy || !code || !label || !price}
            onClick={() =>
              void submit(() =>
                registry.upsertService(
                  address,
                  Number(code),
                  label,
                  toBaseUnits(price),
                  signTransaction,
                ),
              )
            }
          >
            {busy ? t('common.confirming') : editing ? t('clinic.updateService', { code }) : t('clinic.listService')}
          </Button>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('clinic.incomingVouchers')}</h2>
        {vouchers.length === 0 && <Empty>{t('clinic.noIncoming')}</Empty>}
        {vouchers.length > 0 && (
          <Card className="space-y-3 p-4">
            <div
              role="group"
              aria-label={t('clinic.filterByStatus')}
              className="flex flex-wrap gap-2"
            >
              <StatusTab
                active={statusFilter === null}
                count={vouchers.length}
                onClick={() => setStatusFilter(null)}
              >
                {t('clinic.allStatuses')}
              </StatusTab>
              {statusTabs.map((s) => (
                <StatusTab
                  key={s}
                  active={statusFilter === s}
                  count={counts[s]}
                  onClick={() => setStatusFilter(s)}
                >
                  {s}
                </StatusTab>
              ))}
            </div>
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                {t('clinic.searchVoucherNumber')}
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('clinic.searchVoucherPlaceholder')}
                className="mono mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm sm:max-w-xs"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-ink-soft)]">
              <span aria-live="polite">
                {t('clinic.showingVouchers', {
                  shown: visibleVouchers.length,
                  total: vouchers.length,
                })}
              </span>
              {filtering && (
                <Button
                  variant="ghost"
                  className="px-3 py-1.5 text-xs"
                  onClick={clearFilters}
                >
                  {t('clinic.clearFilters')}
                </Button>
              )}
            </div>
          </Card>
        )}
        {vouchers.length > 0 && visibleVouchers.length === 0 && (
          <Empty>
            {t('clinic.noMatchingVouchers')}{' '}
            <button
              type="button"
              onClick={clearFilters}
              className="font-medium underline underline-offset-2 hover:no-underline"
            >
              {t('clinic.clearFilters')}
            </button>
          </Empty>
        )}
        <div className="space-y-3">
          {visibleVouchers.map((v) => (
            <VoucherRow
              key={v.id}
              v={v}
              actions={['claim', 'settle']}
              onDone={refreshAll}
              requirePatientMatch
            />
          ))}
        </div>
      </section>
    </div>
  );
}
