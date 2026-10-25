'use client';

import { useEffect, useState } from 'react';

import { Alert, Button, Card, ExplorerLink } from '@/components/ui';
import { toBaseUnits } from '@/lib/amounts';
import { config, explorerAccount } from '@/lib/config';
import { isAnchorUrl } from '@/lib/sep24-config';
import {
  authenticateSep10,
  discoverAnchor,
  getWithdrawalInfo,
  getWithdrawalStatus,
  startWithdrawal,
  type DiscoveredAnchor,
  type Sep24Transaction,
} from '@/lib/sep24';
import { supportsCountry } from '@/lib/sep24-config';

const POLL_INTERVAL_MS = 12_000;
const TERMINAL_STATUSES = new Set([
  'completed',
  'error',
  'expired',
  'refunded',
  'no_market',
  'too_small',
  'too_large',
]);

function safeAnchorLink(value: string, domain: string): string | null {
  try {
    const url = new URL(value);
    return isAnchorUrl(url, domain) && !url.port ? url.href : null;
  } catch {
    return null;
  }
}

type WithdrawalState = {
  anchor: DiscoveredAnchor;
  id: string;
  token: string;
  transaction: Sep24Transaction;
};

export function Sep24Cashout({
  account,
  country,
  signTransaction,
}: {
  account: string;
  country: string;
  signTransaction: (xdr: string) => Promise<string>;
}) {
  const countryAnchors = config.sep24Anchors.filter((anchor) => supportsCountry(anchor, country));
  const anchors = countryAnchors.filter(
    (anchor) => anchor.assetIssuer === config.usdcIssuer,
  );
  const [selectedDomain, setSelectedDomain] = useState('');
  const [amount, setAmount] = useState('');
  const [info, setInfo] = useState<{ enabled: boolean; minAmount?: string | number; maxAmount?: string | number } | null>(null);
  const [anchor, setAnchor] = useState<DiscoveredAnchor | null>(null);
  const [withdrawal, setWithdrawal] = useState<WithdrawalState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const moreInfoUrl = withdrawal?.transaction.more_info_url
    ? safeAnchorLink(withdrawal.transaction.more_info_url, withdrawal.anchor.config.domain)
    : null;

  useEffect(() => {
    if (!withdrawal || TERMINAL_STATUSES.has(withdrawal.transaction.status)) return;
    const current = withdrawal;
    const timer = window.setInterval(async () => {
      try {
        const transaction = await getWithdrawalStatus(
          current.anchor,
          current.id,
          current.token,
        );
        setWithdrawal((previous) =>
          previous?.id === current.id ? { ...previous, transaction } : previous,
        );
        setPollError(null);
      } catch (err) {
        setPollError(err instanceof Error ? err.message : String(err));
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [withdrawal]);

  async function refreshStatus(current = withdrawal) {
    if (!current) return;
    try {
      const transaction = await getWithdrawalStatus(
        current.anchor,
        current.id,
        current.token,
      );
      setWithdrawal((previous) =>
        previous?.id === current.id ? { ...previous, transaction } : previous,
      );
      setPollError(null);
    } catch (err) {
      setPollError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadAnchor(domain: string) {
    setSelectedDomain(domain);
    setError(null);
    setInfo(null);
    setAnchor(null);
    const configured = anchors.find((candidate) => candidate.domain === domain);
    if (!configured) return;
    setBusy(true);
    try {
      const discovered = await discoverAnchor(configured, config.networkPassphrase);
      const withdrawalInfo = await getWithdrawalInfo(discovered);
      setAnchor(discovered);
      setInfo(withdrawalInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function beginCashout() {
    if (!anchor || !info?.enabled || !amount.trim()) return;
    let amountValue: bigint;
    try {
      if (!/^\d+(\.\d{1,7})?$/.test(amount)) {
        throw new Error('Enter an amount greater than zero with up to 7 decimal places.');
      }
      amountValue = toBaseUnits(amount);
      if (amountValue <= 0n) {
        throw new Error('Enter an amount greater than zero with up to 7 decimal places.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    if (
      (info.minAmount !== undefined && amountValue < toBaseUnits(String(info.minAmount))) ||
      (info.maxAmount !== undefined && amountValue > toBaseUnits(String(info.maxAmount)))
    ) {
      setError(
        `The anchor accepts ${info.minAmount ?? 'any'} to ${info.maxAmount ?? 'any'} ${anchor.config.assetCode}.`,
      );
      return;
    }

    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      setError('Allow pop-ups for this site to continue to the anchor.');
      return;
    }
    popup.opener = null;
    setBusy(true);
    setError(null);
    setPollError(null);
    try {
      const token = await authenticateSep10(
        anchor,
        account,
        config.networkPassphrase,
        signTransaction,
      );
      const started = await startWithdrawal(anchor, {
        account,
        amount,
        country: country.toUpperCase(),
        token,
      });
      popup.location.replace(started.url.href);
      setWithdrawal({
        anchor,
        id: started.id,
        token,
        transaction: { id: started.id, status: 'pending_user' },
      });
    } catch (err) {
      popup.close();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (countryAnchors.length === 0) {
    return (
      <section aria-labelledby="cashout-title" className="space-y-3">
        <h2 id="cashout-title" className="text-lg font-semibold">Local cash-out</h2>
        <Alert kind="info">
          No configured cash-out anchor currently serves {country}. Your clinic receives USDC on chain; local-currency withdrawal is a separate service provided by an anchor.
        </Alert>
      </section>
    );
  }

  if (!account.startsWith('G')) {
    return (
      <section aria-labelledby="cashout-title" className="space-y-3">
        <h2 id="cashout-title" className="text-lg font-semibold">Local cash-out</h2>
        <Alert kind="info">
          This wallet is a smart contract account. The configured anchors require SEP-10 authentication with a Stellar account address, so cash-out is not available from this wallet.
        </Alert>
      </section>
    );
  }

  return (
    <section aria-labelledby="cashout-title" className="space-y-3">
      <div>
        <h2 id="cashout-title" className="text-lg font-semibold">Local cash-out</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Voucher settlement releases USDC to your Stellar wallet. Cash-out is a separate off-chain withdrawal through an anchor, with its own fees and processing time.
        </p>
      </div>
      {anchors.length === 0 ? (
        <Alert kind="info">
          An anchor is configured for {country}, but none accepts this deployment&apos;s USDC issuer. Ask the operator to configure an anchor for the exact token before withdrawing.
        </Alert>
      ) : (
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Anchor</span>
              <select
                value={selectedDomain}
                onChange={(event) => void loadAnchor(event.target.value)}
                disabled={busy}
                className="min-h-11 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm"
              >
                <option value="" disabled>Select an anchor</option>
                {anchors.map((candidate) => (
                  <option key={candidate.domain} value={candidate.domain}>{candidate.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">USDC amount</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                disabled={busy}
                className="min-h-11 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm"
              />
            </label>
            <Button
              disabled={
                !anchor ||
                !info?.enabled ||
                busy ||
                !amount.trim() ||
                (!!withdrawal && !TERMINAL_STATUSES.has(withdrawal.transaction.status))
              }
              onClick={() => void beginCashout()}
            >
              {busy ? 'Connecting…' : 'Withdraw with anchor'}
            </Button>
          </div>
          {anchor && info && (
            <p className="text-xs text-[var(--color-ink-soft)]">
              {info.enabled
                ? `Anchor limits: ${info.minAmount ?? 'no minimum'}–${info.maxAmount ?? 'no maximum'} ${anchor.config.assetCode}.`
                : `The anchor has disabled ${anchor.config.assetCode} withdrawals.`}
            </p>
          )}
          <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
            The anchor may require identity verification (KYC), additional documents, and acceptance of its own fees and terms. SCI Healthcare does not perform or guarantee the fiat payout.
          </p>
          {error && <Alert>{error}</Alert>}
        </Card>
      )}
      {error && anchors.length === 0 && <Alert>{error}</Alert>}
      {withdrawal && (
        <Card className="space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">Anchor withdrawal status</h3>
            <span className="rounded-md bg-[var(--color-canvas)] px-2 py-1 text-xs font-semibold uppercase">{withdrawal.transaction.status.replaceAll('_', ' ')}</span>
          </div>
          <p className="break-all text-xs text-[var(--color-ink-soft)]">Anchor transaction: {withdrawal.id}</p>
          {withdrawal.transaction.amount_out && (
            <p className="text-sm">
              Anchor-reported payout: {withdrawal.transaction.amount_out}{' '}
              {withdrawal.transaction.amount_out_asset ?? ''}
            </p>
          )}
          {withdrawal.transaction.message && <p className="text-sm">{withdrawal.transaction.message}</p>}
          {moreInfoUrl && <ExplorerLink href={moreInfoUrl}>More information from the anchor</ExplorerLink>}
          {pollError && <Alert kind="info">Status refresh failed: {pollError}. The anchor may still be processing this withdrawal.</Alert>}
          {!TERMINAL_STATUSES.has(withdrawal.transaction.status) && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button variant="ghost" onClick={() => void refreshStatus()}>Refresh status</Button>
              <span className="text-xs text-[var(--color-ink-soft)]">Refreshes automatically every 12 seconds.</span>
            </div>
          )}
        </Card>
      )}
      <p className="text-xs text-[var(--color-ink-soft)]">
        Cash-out does not change voucher or on-chain settlement status.{' '}
        <ExplorerLink href={explorerAccount(account)}>View your Stellar account</ExplorerLink>
      </p>
    </section>
  );
}