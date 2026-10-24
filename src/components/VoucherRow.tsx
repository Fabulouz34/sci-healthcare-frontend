'use client';

import Link from 'next/link';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';

import { api, type Voucher } from '@/lib/api';
import { formatDate, formatUsdc, timeUntil, timeSince } from '@/lib/amounts';
import { trackEvent, type AnalyticsEvent } from '@/lib/analytics';
import { explorerTx } from '@/lib/config';
import { DISPUTE_REASONS, disputeReasonLabel, type DisputeReasonCode } from '@/lib/disputes';
import { humaniseError } from '@/lib/errors';
import { invalidateVouchers, useNow } from '@/lib/hooks';
import { voucher as protocol } from '@/lib/protocol';
import { EXPECTED_STATUS, pollVoucherStatus } from '@/lib/reconcile';
import { useWallet } from '@/lib/wallet';

import { Button, Card, ExplorerLink, InfoTip, Modal, StatusBadge } from './ui';
import { AddressName } from './AddressName';
import { useToast } from './Toast';
import { VerifyPatient } from './VerifyPatient';
import { availableActions, type VoucherAction as Action } from '@/lib/voucher-actions';

/** Funnel step per contract write. Names only — never any properties. */
const ACTION_EVENTS = {
  claim: 'voucher_claimed',
  attest: 'care_confirmed',
  dispute: 'dispute_opened',
  settle: 'voucher_settled',
  refund: 'voucher_refunded',
} as const satisfies Record<Action, AnalyticsEvent>;

/** Returns true if the deadline is within 48 hours. */
function isUrgent(iso: string | Date | null, now: number): boolean {
  if (!iso) return false;
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const ms = d.getTime() - now;
  return ms > 0 && ms <= 48 * 60 * 60 * 1000;
}

/**
 * Lets a list drive a row from the keyboard (#160). `startAttest` opens the
 * same confirmation modal the button does — it never submits on its own —
 * and returns false when attesting is not on offer right now.
 */
export type VoucherRowHandle = { startAttest: () => boolean };

export function VoucherRow({
  v,
  actions,
  onDone,
  summary = true,
  now: nowProp,
  ref,
  requirePatientMatch = false,
}: {
  v: Voucher;
  actions: Action[];
  onDone?: () => void;
  /** False on the voucher's own page, which already shows the summary. */
  summary?: boolean;
  /** Optional current time in ms (e.g., from parent using useNow). Falls back to internal useNow. */
  now?: number;
  ref?: Ref<VoucherRowHandle>;
  /**
   * Hold the claim button until the patient's reference and key match this
   * voucher (#33). Off by default: the check is still offered, but a clinic
   * can claim without it. Point-of-care desks pass `true`.
   */
  requirePatientMatch?: boolean;
}) {
  const { address, signTransaction, connect } = useWallet();
  const nowInternal = useNow();
  const now = nowProp ?? nowInternal;
  const toast = useToast();
  const [busy, setBusy] = useState<Action | null>(null);
  // After a write the chain has moved but the indexer lags (#9): while
  // polling, the row shows a pending state instead of the stale status.
  const [reconciling, setReconciling] = useState<Action | null>(null);
  // Transaction hash when the indexer never caught up in time.
  const [staleTx, setStaleTx] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
  }, []);
  // Disputing freezes funds, so it takes a reason and a confirmation modal.
  // Attesting pays the clinic after the dispute window, so it confirms too.
  const [disputing, setDisputing] = useState(false);
  const [attesting, setAttesting] = useState(false);
  const [reason, setReason] = useState<DisputeReasonCode>(DISPUTE_REASONS[0].code);
  // Patient check (#33): keep which voucher matched, never the typed values.
  // Keying the match by voucher means a changed row cannot inherit a match.
  const [verifying, setVerifying] = useState(false);
  const [verifiedFor, setVerifiedFor] = useState<string | null>(null);
  const verificationKey = `${v.id}:${v.beneficiaryRef}`;
  const patientVerified = verifiedFor === verificationKey;

  async function run(action: Action) {
    if (!address) return void connect();
    setBusy(action);
    try {
      const fns: Record<Action, () => Promise<{ hash: string }>> = {
        claim: () => protocol.claim(address, v.id, signTransaction),
        attest: () => protocol.attest(address, v.id, signTransaction),
        settle: () => protocol.settle(address, v.id, signTransaction),
        refund: () => protocol.refund(address, v.id, signTransaction),
        dispute: () => protocol.dispute(address, v.id, reason, signTransaction),
      };
      const res = await fns[action]();
      setDisputing(false);
      setAttesting(false);
      trackEvent(ACTION_EVENTS[action]);
      // The transaction is confirmed on chain; wait for the indexer to
      // catch up instead of refetching a stale row immediately (#9).
      setBusy(null);
      setStaleTx(null);
      setReconciling(action);
      const outcome = await pollVoucherStatus(
        () => api.voucher(v.id).then((detail) => detail.status),
        EXPECTED_STATUS[action],
      );
      if (!mounted.current) return;
      setReconciling(null);
      void invalidateVouchers(v.id);
      onDone?.();
      if (outcome === 'matched') {
        toast.success(
          <>
            Done.{' '}
            <ExplorerLink href={explorerTx(res.hash)}>View transaction</ExplorerLink>
          </>,
        );
      } else {
        setStaleTx(res.hash);
        toast.success(
          <>
            Confirmed on chain — the indexer is still catching up.{' '}
            <ExplorerLink href={explorerTx(res.hash)}>View transaction</ExplorerLink>
          </>,
        );
      }
    } catch (err) {
      toast.error(humaniseError(err));
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  // Only offer an action the contract will actually accept right now
  // (state machine in `@/lib/voucher-actions`, covered by unit tests).
  const available = availableActions(
    v.status,
    { isSettleable: v.isSettleable, isRefundable: v.isRefundable },
    actions,
  );

  useImperativeHandle(ref, () => ({
    startAttest: () => {
      if (!available.includes('attest') || busy !== null || reconciling !== null) return false;
      setAttesting(true);
      return true;
    },
  }));

  return (
    // Without the summary, the first hint or button row sits at the top.
    <Card className={summary ? 'p-5' : 'p-5 [&>:first-child]:mt-0'}>
      {summary && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href={`/vouchers/${v.id}`}
                className="mono text-xs text-[var(--color-ink-soft)] underline-offset-2 hover:underline"
              >
                #{v.id}
              </Link>
              <StatusBadge status={v.status} />
            </div>
            <h3 className="mt-1 font-medium">
              <AddressName address={v.provider.address} name={v.provider.name} />
            </h3>
            <p className="text-xs text-[var(--color-ink-soft)]">
              {v.serviceLabel ?? `Service ${v.serviceCode}`} · funded {formatDate(v.createdAt)}
            </p>
          </div>
          <div className="text-end">
            <div className="mono text-lg font-semibold">${formatUsdc(v.amount)}</div>
            {v.status === 'Settled' && v.settledNet && (
              <div className="text-xs text-[var(--color-ink-soft)]">
                clinic received ${formatUsdc(v.settledNet)}
              </div>
            )}
          </div>
        </div>
      )}

      {v.status === 'Attested' && v.disputeDeadline && !v.isSettleable && (
        <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
          Dispute window closes in {timeUntil(v.disputeDeadline, now)} — settles after
          that.
          <InfoTip content="The funder can dispute before the window closes. After it closes, anyone can release the payment to the clinic." />
        </p>
      )}
      {v.status === 'Funded' && (
        <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
          Expires {formatDate(v.expiresAt)} · refundable after that if unused.
          <InfoTip content="If the clinic never marks the patient seen, the funder can reclaim the escrow after expiry." />
        </p>
      )}
      {v.status === 'Claimed' && v.refundableAt && !v.isRefundable && (
        <>
          {v.claimedAt && (
            <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
              Claimed {timeSince(v.claimedAt, now)}.
            </p>
          )}
          <p className="mt-1 text-xs">
            Refundable in <span className={isUrgent(v.refundableAt, now) ? 'font-semibold text-[var(--color-danger)]' : ''}>
              {timeUntil(v.refundableAt, now)}
            </span>
            ({formatDate(v.refundableAt)}).
            <InfoTip content="An independent attester must confirm care was delivered. Without confirmation the funder can reclaim after this date." />
          </p>
        </>
      )}
      {v.status === 'Disputed' && v.disputeReason != null && (
        <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
          Disputed: {disputeReasonLabel(v.disputeReason)}. Funds are frozen until
          an administrator resolves it.
        </p>
      )}
      {v.disputeOutcome && (
        <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
          Dispute resolved: {v.disputeOutcome}
          {v.disputeResolvedAt && ` on ${formatDate(v.disputeResolvedAt)}`}.
        </p>
      )}

      {available.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {available.map((a) => (
            <Button
              key={a}
              variant={a === 'dispute' ? 'danger' : a === 'settle' ? 'primary' : 'ghost'}
              disabled={
                busy !== null ||
                reconciling !== null ||
                (a === 'claim' && requirePatientMatch && !patientVerified)
              }
              onClick={() => {
                if (a === 'dispute') setDisputing(true);
                else if (a === 'attest') setAttesting(true);
                else void run(a);
              }}
            >
              {busy === a ? 'Confirming…' : reconciling === a ? 'Updating…' : LABELS[a]}
            </Button>
          ))}
        </div>
      )}

      {available.includes('claim') && (
        <div className="mt-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 className="flex items-center gap-2 text-sm font-medium">
                Verify patient
                {patientVerified && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                    Match
                  </span>
                )}
              </h4>
              <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                {requirePatientMatch
                  ? 'Have the patient, or whoever holds their key, confirm this voucher on this device before claiming.'
                  : 'Optional: have the patient, or whoever holds their key, confirm this voucher on this device.'}
              </p>
            </div>
            <Button variant="ghost" onClick={() => setVerifying((open) => !open)}>
              {verifying ? 'Hide check' : patientVerified ? 'Verify again' : 'Verify patient'}
            </Button>
          </div>

          {!verifying && requirePatientMatch && !patientVerified && (
            <p role="status" className="mt-3 text-xs text-[var(--color-ink-soft)]">
              This desk requires a patient check before claiming. The reference and key
              enable “Mark patient seen”.
            </p>
          )}

          {verifying && (
            <div className="mt-3">
              <VerifyPatient
                expectedRef={v.beneficiaryRef}
                onVerifiedChange={(verified) =>
                  setVerifiedFor(verified ? verificationKey : null)
                }
              />
            </div>
          )}
        </div>
      )}

      {reconciling && (
        <p role="status" className="mt-3 text-xs text-[var(--color-ink-soft)]">
          Confirmed on chain, updating…
        </p>
      )}
      {staleTx && !reconciling && (
        <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
          The transaction succeeded on chain but the list has not caught up yet.{' '}
          <ExplorerLink href={explorerTx(staleTx)}>View transaction</ExplorerLink>
        </p>
      )}

      <Modal
        open={disputing}
        onClose={() => {
          if (busy === null) setDisputing(false);
        }}
        title="Open dispute"
        actions={
          <>
            <Button
              variant="danger"
              disabled={busy !== null}
              onClick={() => void run('dispute')}
            >
              {busy === 'dispute' ? 'Confirming…' : 'Open dispute'}
            </Button>
            <Button
              variant="ghost"
              disabled={busy !== null}
              onClick={() => setDisputing(false)}
            >
              Cancel
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
              What went wrong?
            </span>
            <select
              value={reason}
              onChange={(e) => setReason(Number(e.target.value) as DisputeReasonCode)}
              className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            >
              {DISPUTE_REASONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
            The clinic will not be paid while this is open. An administrator
            reviews it and returns the money to you or releases it to the clinic.
            <InfoTip content="Disputing freezes the escrow. Only open one for care you funded and believe was not delivered." />
          </p>
        </div>
      </Modal>

      <Modal
        open={attesting}
        onClose={() => {
          if (busy === null) setAttesting(false);
        }}
        title="Confirm care delivered"
        actions={
          <>
            <Button
              disabled={busy !== null}
              onClick={() => void run('attest')}
            >
              {busy === 'attest' ? 'Confirming…' : 'Confirm'}
            </Button>
            <Button
              variant="ghost"
              disabled={busy !== null}
              onClick={() => setAttesting(false)}
            >
              Cancel
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
            Confirm only care you have actually verified. Confirming opens a
            dispute window, after which the clinic is paid.
            <InfoTip content="Your attestation is written on chain. The funder can still dispute before the window closes." />
          </p>
        </div>
      </Modal>
    </Card>
  );
}

const LABELS: Record<Action, string> = {
  claim: 'Mark patient seen',
  attest: 'Confirm care delivered',
  settle: 'Release payment',
  refund: 'Refund me',
  dispute: 'Dispute',
};
