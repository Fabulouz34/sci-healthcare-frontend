'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { use, useState } from 'react';

import { ApiError } from '@/lib/api';
import { formatDate, formatUsdc } from '@/lib/amounts';
import { config, explorerContract, explorerTx } from '@/lib/config';
import { useLiveUpdates, useNameIndex, useNow, useVoucher, useVoucherEvents } from '@/lib/hooks';
import { problemReportUrl } from '@/lib/report-problem';
import { stepTxHashes, voucherTimeline, type StepState } from '@/lib/timeline';
import { useWallet } from '@/lib/wallet';
import { CopyValue } from '@/components/CopyValue';
import { VoucherQr } from '@/components/VoucherQr';
import { VoucherRow } from '@/components/VoucherRow';
import { Alert, Card, ExplorerLink, Field, StatusBadge } from '@/components/ui';
import { useLocaleContext } from '@/i18n/LocaleContext';

/**
 * Voucher ids are positive integers. Anything else (empty, non-numeric,
 * negative, zero, decimals) is not a voucher and must not reach the API.
 */
function isValidVoucherId(id: string): boolean {
  if (!/^[1-9]\d*$/.test(id)) return false;
  return Number.isSafeInteger(Number(id));
}

/**
 * One voucher, end to end: what it pays for, where it is in its lifecycle,
 * and the receipt once it settles. Shareable by link; everything shown is
 * already public on the ledger.
 *
 * Uses SWR caching (#63) and live updates via SSE with polling fallback (#64).
 */
export default function VoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { address } = useWallet();
  const { t, locale } = useLocaleContext();
  const now = useNow();
  const names = useNameIndex();
  const [copied, setCopied] = useState(false);

  // Validate before any hook fires a request: an invalid id is a missing page.
  const validId = isValidVoucherId(id);

  async function copyLink() {
    try {
      const url = typeof window !== 'undefined' ? window.location.href : '';
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write failed
    }
  }

  const { voucher: v, error, rawError, mutate } = useVoucher(validId ? id : undefined);
  // Per-step transaction hashes (#18). An indexer without the events
  // endpoint (backend #13) yields an empty list and the history renders
  // exactly as before, only without the "view transaction" links.
  const { events } = useVoucherEvents(validId ? id : undefined);
  useLiveUpdates({ voucherId: validId ? id : undefined });

  if (!validId) notFound();
  // An unknown voucher number is a missing page, not an API failure.
  if (rawError instanceof ApiError && rawError.status === 404) notFound();
  if (error) return <Alert>{error}</Alert>;
  if (!v) return <p className="text-sm text-[var(--color-ink-soft)]">{t('common.loading')}</p>;

  // Offer the actions this wallet can take. settle and refund are
  // permissionless, so anyone may trigger them once they are due.
  const actions =
    address === v.funder
      ? (['dispute', 'refund', 'settle'] as const)
      : address === v.provider.address
        ? (['claim', 'settle'] as const)
        : (['settle', 'refund'] as const);

  const steps = voucherTimeline(v, v.receipt, now, stepTxHashes(events));
  // Public facts only: the builder takes a narrow shape and deliberately
  // drops the beneficiary reference, funder address and every patient value
  // (#138).
  const reportHref = problemReportUrl({
    id: v.id,
    status: v.status,
    service: v.serviceLabel ?? `Service ${v.serviceCode}`,
    clinic: v.provider.name,
  });

  return (
    <div className="voucher-print-page space-y-6 print:space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mono text-xs text-[var(--color-ink-soft)]">
              {t('voucher.voucherNumber', { id: v.id })}
            </span>
            <StatusBadge status={v.status} />
            <button
              type="button"
              onClick={() => void copyLink()}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-0.5 text-xs font-medium text-[var(--color-ink-soft)] transition hover:border-[var(--color-brand)] hover:text-[var(--color-ink)]"
              aria-label="Copy link"
            >
              {copied ? (
                <span className="font-medium text-emerald-700">{t('voucher.linkCopied')}</span>
              ) : (
                <>
                  <svg
                    aria-hidden="true"
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>{t('voucher.copyLink')}</span>
                </>
              )}
            </button>
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {v.serviceLabel ?? `Service ${v.serviceCode}`}
          </h1>
          <p className="text-sm text-[var(--color-ink-soft)]">
            {t('voucher.at')}{' '}
            <Link href={`/clinics/${v.provider.address}`} className="underline underline-offset-2">
              {v.provider.name}
            </Link>{' '}
            · {v.provider.country}
          </p>
        </div>
        <div className="text-end">
          <div className="mono text-2xl font-semibold">${formatUsdc(v.amount, locale)}</div>
          <div className="text-xs text-[var(--color-ink-soft)]">{t('common.usdc')}</div>
        </div>
      </div>

      <VoucherQr
        voucherId={v.id}
        contractAddress={config.contracts.voucher}
        serviceLabel={v.serviceLabel ?? `Service ${v.serviceCode}`}
        providerName={v.provider.name}
        amount={formatUsdc(v.amount, locale)}
        expiresAt={formatDate(v.expiresAt, locale)}
      />

      <div className="grid gap-6 md:grid-cols-[2fr_1fr] print:grid-cols-[2fr_1fr] print:gap-3">
        <Card className="voucher-print-history p-5 print:p-3">
          <h2 className="text-sm font-semibold">{t('voucher.history')}</h2>
          <ol className="mt-4 space-y-4 print:mt-2 print:space-y-2">
            {steps.map((s) => (
              <li key={s.label} className="flex gap-3">
                <span
                  aria-hidden
                  className={`mt-1 h-3 w-3 flex-none rounded-full ${DOT[s.state]}`}
                />
                <div className={s.state === 'skipped' ? 'opacity-50' : ''}>
                  <div className="text-sm font-medium">
                    {s.label}
                    <span className="sr-only"> ({s.state})</span>
                  </div>
                  <div className="text-xs text-[var(--color-ink-soft)]">
                    {s.detail}
                    {s.at && ` · ${formatDate(s.at, locale)}`}
                    {s.txHash && (
                      <>
                        {' · '}
                        <ExplorerLink href={explorerTx(s.txHash)}>
                          {t('common.viewTransaction')}
                        </ExplorerLink>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="voucher-print-history space-y-4 p-5 print:space-y-2 print:p-3">
          <div className="print:hidden">
            <Field label={t('voucher.fundedBy')}>
              <CopyValue value={v.funder} name={names.get(v.funder)} label="funder address" />
            </Field>
          </div>
          <Field label={t('voucher.expires')}>{formatDate(v.expiresAt, locale)}</Field>
          {v.status === 'Settled' && v.settledNet && (
            <Field label={t('voucher.clinicReceived')}>
              <span className="mono">${formatUsdc(v.settledNet, locale)}</span>
              {v.settledFee && (
                <span className="text-xs text-[var(--color-ink-soft)]">
                  {' '}
                  ({t('voucher.fee')} ${formatUsdc(v.settledFee, locale)})
                </span>
              )}
            </Field>
          )}
          {v.disputeOutcome && (
            <Field label={t('voucher.disputeOutcome')}>
              <span className="font-medium">
                {v.disputeOutcome}
                {v.disputeResolvedAt && ` · ${formatDate(v.disputeResolvedAt, locale)}`}
              </span>
            </Field>
          )}
          {v.receipt && (
            <Field label={t('voucher.careReceipt')}>{t('voucher.minted')} {formatDate(v.receipt.settledAt, locale)}</Field>
          )}
          <div className="space-y-4 print:hidden">
            <Field label={t('voucher.patientReference')}>
              <CopyValue
                value={v.beneficiaryRef}
                display={`${v.beneficiaryRef.slice(0, 16)}…`}
                label="patient reference"
              />
            </Field>
            <p className="text-xs text-[var(--color-ink-soft)]">
              {t('voucher.patientReferenceNote')}
            </p>
            <ExplorerLink href={explorerContract(config.contracts.voucher)}>
              {t('voucher.viewContract')}
            </ExplorerLink>
          </div>
        </Card>
      </div>

      {/* The clinic can also claim from a scanned voucher link; the patient
          check guards that path too (#33). */}
      <div className="print:hidden">
        <VoucherRow
          v={v}
          actions={[...actions]}
          onDone={() => {
            void mutate();
          }}
          summary={false}
          requirePatientMatch
        />
      </div>

      {/* Only the funder can dispute, but anyone who notices a problem can
          report it (#138). The prefilled issue carries public voucher
          details only — never the patient reference. */}
      <Card className="print:hidden space-y-2 p-5">
        <h2 className="text-sm font-semibold">{t('voucher.reportProblem')}</h2>
        <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
          {t('voucher.reportProblemIntro')}
        </p>
        <a
          href={reportHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-brand)] underline underline-offset-2 hover:opacity-80"
        >
          {t('voucher.reportProblemAction')}
          <span aria-hidden="true">↗</span>
        </a>
      </Card>
    </div>
  );
}

const DOT: Record<StepState, string> = {
  done: 'bg-[var(--color-brand)]',
  current: 'bg-amber-400 ring-4 ring-amber-100',
  upcoming: 'bg-[var(--color-line)]',
  skipped: 'bg-[var(--color-line)]',
};
