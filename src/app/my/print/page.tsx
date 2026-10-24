'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { formatDate, shortAddress } from '@/lib/amounts';
import { beneficiaryRef } from '@/lib/beneficiary';
import { useProviders, useReceipts } from '@/lib/hooks';
import { useSavedIdentity } from '@/lib/useSavedIdentity';
import { Button, Card, Empty } from '@/components/ui';

/**
 * Print-friendly summary of care delivered to a patient (#46).
 *
 * Designed to provide patients a portable record of their settled care vouchers
 * when transferring between clinics, without exposing or printing any cryptographic
 * patient reference, secret key, or beneficiary hash.
 */
export default function PrintableCareSummaryPage() {
  const saved = useSavedIdentity();
  const [activeRef, setActiveRef] = useState<string | null>(null);
  const [deriving, setDeriving] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function derive() {
      if (!saved.identifier || !saved.key) {
        if (!cancelled) {
          setActiveRef(null);
          setDeriving(false);
        }
        return;
      }
      try {
        const ref = await beneficiaryRef(saved.identifier, saved.key);
        if (!cancelled) {
          setActiveRef(ref);
          setDeriving(false);
        }
      } catch {
        if (!cancelled) {
          setActiveRef(null);
          setDeriving(false);
        }
      }
    }
    void derive();
    return () => {
      cancelled = true;
    };
  }, [saved.identifier, saved.key]);

  const { receipts, totalSpendDisplay: spend, isLoading: receiptsLoading } = useReceipts(activeRef);
  const { providers } = useProviders();

  const providerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of providers) {
      map.set(p.address, p.name);
    }
    return map;
  }, [providers]);

  const loading = deriving || receiptsLoading;

  return (
    <div className="space-y-6">
      {/* Print actions toolbar - hidden during printing */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 print:hidden">
        <div>
          <Link
            href="/my"
            className="text-xs font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] transition"
          >
            &larr; Back to My vouchers
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-[var(--color-ink)]">
            Printable care summary
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => window.print()}
            disabled={loading || receipts.length === 0}
          >
            <span className="flex items-center gap-1.5">
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
                <path d="M6 9V2h12v7" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <path d="M6 14h12v8H6z" />
              </svg>
              Print summary
            </span>
          </Button>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-[var(--color-ink-soft)] print:hidden">Loading care history…</p>
      )}

      {!loading && receipts.length === 0 && (
        <Card className="p-8 text-center print:hidden">
          <Empty>
            No settled care receipts found for this patient.
          </Empty>
          <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
            Make sure you have looked up care history with the patient reference and secret key on{' '}
            <Link href="/my" className="underline text-[var(--color-brand)]">
              My vouchers
            </Link>.
          </p>
        </Card>
      )}

      {/* Printable Document Container */}
      {receipts.length > 0 && (
        <div className="rounded-2xl border border-[var(--color-line)] bg-white p-6 sm:p-10 shadow-xs print:border-none print:p-0 print:shadow-none space-y-8">
          {/* Document Header */}
          <div className="border-b border-[var(--color-line)] pb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold tracking-wider text-[var(--color-brand)] uppercase">
                SCI Healthcare Protocol
              </div>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                Patient Care Summary
              </h2>
              <p className="mt-1 text-xs text-slate-600 max-w-lg leading-relaxed">
                Official portable record of clinical care vouchers funded, verified, and settled on the
                Stellar blockchain ledger.
              </p>
            </div>
            <div className="text-start sm:text-end text-xs text-slate-500 space-y-1">
              <div>
                <span className="font-medium text-slate-700">Issued:</span>{' '}
                {formatDate(new Date())}
              </div>
              <div>
                <span className="font-medium text-slate-700">Services delivered:</span>{' '}
                {receipts.length}
              </div>
              <div>
                <span className="font-medium text-slate-700">Total care funded:</span>{' '}
                <span className="font-mono font-semibold text-slate-900">${spend} USDC</span>
              </div>
            </div>
          </div>

          {/* Receipts Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm border-collapse">
              <caption className="sr-only">Delivered patient care receipts</caption>
              <thead>
                <tr className="border-b-2 border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  <th scope="col" className="py-3 pe-4">Date</th>
                  <th scope="col" className="py-3 px-4">Clinic</th>
                  <th scope="col" className="py-3 px-4">Service</th>
                  <th scope="col" className="py-3 px-4 text-end">Amount</th>
                  <th scope="col" className="py-3 ps-4 text-end">Receipt #</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receipts.map((r) => {
                  const clinicName = providerMap.get(r.providerAddress) ?? shortAddress(r.providerAddress);
                  return (
                    <tr key={r.voucherId} className="hover:bg-slate-50/50">
                      <td className="py-3.5 pe-4 text-xs font-medium text-slate-700 whitespace-nowrap">
                        {formatDate(r.settledAt)}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-900">
                        {clinicName}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">
                        {r.serviceLabel ?? `Service ${r.serviceCode}`}
                      </td>
                      <td className="py-3.5 px-4 text-end font-mono font-medium text-slate-900 whitespace-nowrap">
                        ${r.amountDisplay}
                      </td>
                      <td className="py-3.5 ps-4 text-end font-mono text-xs text-slate-500 whitespace-nowrap">
                        #{r.voucherId}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-semibold text-slate-900">
                  <td colSpan={3} className="py-3.5 pe-4 text-xs uppercase tracking-wider">
                    Total
                  </td>
                  <td className="py-3.5 px-4 text-end font-mono text-base">
                    ${spend}
                  </td>
                  <td className="py-3.5 ps-4 text-end text-xs text-slate-500">
                    USDC
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Verification Notice */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-600 space-y-1">
            <div className="font-semibold text-slate-800">Ledger verification</div>
            <p className="leading-relaxed">
              Every service listed above represents an escrowed voucher claimed by the licensed clinic,
              confirmed by an accredited independent medical attester, and finalized after the dispute window
              elapsed. Patient privacy is preserved cryptographically without storing personal medical records on-chain.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
