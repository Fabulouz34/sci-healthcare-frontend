'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsAttester, useLiveUpdates, useVouchers } from '@/lib/hooks';
import { useWallet } from '@/lib/wallet';
import { VoucherRow, type VoucherRowHandle } from '@/components/VoucherRow';
import { Alert, Empty, Button } from '@/components/ui';
import { useNow } from '@/lib/hooks';

/** Keys typed into these belong to the control, not to the shortcuts. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
  );
}

/**
 * Attester view.
 *
 * Attesters are the check on the clinic being paid: the contract refuses an
 * attestation from the provider that stands to receive the funds. This is
 * the protocol's trust assumption made visible rather than hidden.
 */
export default function AttestPage() {
  const { address } = useWallet();
  useLiveUpdates();
  const now = useNow();

  const { isAttester: authorised } = useIsAttester(address);
  const {
    vouchers: claimedRaw,
    error,
    mutate,
  } = useVouchers(address ? { status: 'Claimed' } : null);

  // Sort by refundableAt ascending (most urgent first)
  const claimedSorted = useMemo(() => {
    return [...claimedRaw].sort((a, b) => {
      // Vouchers without refundableAt go to the end
      if (!a.refundableAt && !b.refundableAt) return 0;
      if (!a.refundableAt) return 1;
      if (!b.refundableAt) return -1;
      return new Date(a.refundableAt).getTime() - new Date(b.refundableAt).getTime();
    });
  }, [claimedRaw]);

  // Extract unique clinics from claimed vouchers for the filter
  const clinics = useMemo(() => {
    const clinicMap = new Map<string, { address: string; name: string; country: string }>();
    for (const v of claimedSorted) {
      if (!clinicMap.has(v.provider.address)) {
        clinicMap.set(v.provider.address, v.provider);
      }
    }
    return Array.from(clinicMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [claimedSorted]);

  const [clinicFilter, setClinicFilter] = useState<string>('');

  const claimed = useMemo(() => {
    if (!clinicFilter) return claimedSorted;
    return claimedSorted.filter((v) => v.provider.address === clinicFilter);
  }, [claimedSorted, clinicFilter]);

  // Keyboard review (#160): j/k move between claims, Enter opens the
  // selected voucher, `a` opens its confirmation modal. Selection is kept by
  // id so a live refresh reordering the list does not jump it elsewhere.
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const rowRefs = useRef(new Map<string, VoucherRowHandle>());

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (isTypingTarget(e.target)) return;
      // An open modal owns the keyboard; its Enter must never open a page.
      if (document.querySelector('[role="dialog"]')) return;
      if (claimed.length === 0) return;

      const index = claimed.findIndex((v) => v.id === selectedId);
      const select = (i: number) => {
        const id = claimed[i].id;
        setSelectedId(id);
        const card = cardRefs.current.get(id);
        card?.focus();
        card?.scrollIntoView({ block: 'nearest' });
      };

      if (e.key === 'j') {
        e.preventDefault();
        select(Math.min(index + 1, claimed.length - 1));
      } else if (e.key === 'k') {
        e.preventDefault();
        select(Math.max(index - 1, 0));
      } else if (index === -1) {
        return;
      } else if (e.key === 'Enter') {
        // Enter on a focused button or link is that control's own click.
        if (e.target instanceof HTMLElement && e.target.closest('a, button')) return;
        e.preventDefault();
        router.push(`/vouchers/${claimed[index].id}`);
      } else if (e.key === 'a') {
        // Opens the confirmation modal; the attestation still needs Confirm.
        if (rowRefs.current.get(claimed[index].id)?.startAttest()) e.preventDefault();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [claimed, selectedId, router]);

  if (!address) return <Empty>Connect an attester wallet to review claims.</Empty>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Awaiting confirmation</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Confirm only care you have actually verified. Confirming opens a dispute
          window, after which the clinic is paid.
        </p>
      </div>

      {error && <Alert>{error}</Alert>}
      {authorised === false && (
        <Alert kind="info">
          This wallet is not an authorised attester, so confirmations will be
          rejected by the contract. Ask an administrator to add it.
        </Alert>
      )}

      {clinics.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-[var(--color-ink-soft)]">Filter by clinic:</label>
          <select
            value={clinicFilter}
            onChange={(e) => setClinicFilter(e.target.value)}
            className="h-10 w-full max-w-xs rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm"
          >
            <option value="">All clinics</option>
            {clinics.map((c) => (
              <option key={c.address} value={c.address}>
                {c.name} ({c.country})
              </option>
            ))}
          </select>
          {clinicFilter && (
            <Button variant="ghost" onClick={() => setClinicFilter('')}>
              Clear
            </Button>
          )}
        </div>
      )}

      {claimed.length === 0 && <Empty>Nothing is waiting for confirmation.</Empty>}
      {claimed.length > 0 && (
        <p className="hidden text-xs text-[var(--color-ink-soft)] sm:block">
          Keyboard: <kbd className="mono">j</kbd>/<kbd className="mono">k</kbd> to
          move between claims, <kbd className="mono">Enter</kbd> to open,{' '}
          <kbd className="mono">a</kbd> to start confirming — you still confirm
          in the dialog.
        </p>
      )}
      <div className="space-y-3">
        {claimed.map((v) => (
          <div
            key={v.id}
            ref={(el) => {
              if (el) cardRefs.current.set(v.id, el);
              else cardRefs.current.delete(v.id);
            }}
            tabIndex={-1}
            aria-current={v.id === selectedId ? 'true' : undefined}
            onFocus={() => setSelectedId(v.id)}
            className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] aria-[current=true]:ring-2 aria-[current=true]:ring-[var(--color-brand)]"
          >
            <VoucherRow
              ref={(handle) => {
                if (handle) rowRefs.current.set(v.id, handle);
                else rowRefs.current.delete(v.id);
              }}
              v={v}
              actions={['attest']}
              onDone={() => void mutate()}
              now={now}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
