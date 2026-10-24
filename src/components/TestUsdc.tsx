'use client';

import { useCallback, useEffect, useState } from 'react';

import { formatUsdc } from '@/lib/amounts';
import { config } from '@/lib/config';
import { FAUCET_ERRORS, humaniseError } from '@/lib/errors';
import { faucet, usdc } from '@/lib/protocol';
import { useWallet } from '@/lib/wallet';

import { Alert, Button, Card } from './ui';
import { useToast } from './Toast';

/**
 * Testnet only: the connected wallet's demo USDC balance and a button to
 * get more from the faucet contract. Renders nothing when no faucet is
 * configured, so a production build never shows it.
 */
export function TestUsdc({
  compact = false,
  trustlineHint = true,
}: {
  compact?: boolean;
  /**
   * False where the page already offers the one-click Add USDC fix (#1):
   * two trustline instructions side by side read as a contradiction.
   */
  trustlineHint?: boolean;
}) {
  const { address, signTransaction, connect } = useWallet();
  const [balance, setBalance] = useState<bigint | null>(null);
  // Ledger time of the next allowed drip; 0 when one is allowed now.
  const [nextAt, setNextAt] = useState<number>(0);
  const [drip, setDrip] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsTrustline, setNeedsTrustline] = useState(false);
  const toast = useToast();

  const [reloads, setReloads] = useState(0);
  const refresh = useCallback(() => setReloads((n) => n + 1), []);

  useEffect(() => {
    if (!address || !faucet.enabled()) return;
    let ignore = false;
    (async () => {
      const [b, n, d] = await Promise.all([
        // A balance read fails outright when there is no trustline.
        usdc.balance(address).catch(() => null),
        faucet.nextDripAt(address).catch(() => 0),
        faucet.amount().catch(() => null),
      ]);
      if (ignore) return;
      setBalance(b);
      setNextAt(n > Date.now() / 1000 ? n : 0);
      setDrip(d);
    })();
    return () => {
      ignore = true;
    };
  }, [address, reloads]);

  if (!faucet.enabled()) return null;

  async function getUsdc() {
    if (!address) return void connect();
    setBusy(true);
    setNeedsTrustline(false);
    try {
      await faucet.drip(address, signTransaction);
      refresh();
    } catch (err) {
      const msg = humaniseError(err, FAUCET_ERRORS);
      if (/trustline/i.test(msg)) setNeedsTrustline(true);
      else toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const coolingDown = nextAt > 0;
  const label = drip ? `Get ${formatUsdc(drip)} test USDC` : 'Get test USDC';

  const body = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {address ? (
            <>
              Test USDC balance:{' '}
              <span className="mono font-medium">
                {balance === null ? '—' : `$${formatUsdc(balance)}`}
              </span>
            </>
          ) : (
            'Connect a testnet wallet to get free test USDC.'
          )}
        </div>
        <Button
          variant="ghost"
          disabled={busy || coolingDown}
          onClick={() => void getUsdc()}
        >
          {busy ? 'Confirming…' : coolingDown ? 'Come back tomorrow' : label}
        </Button>
      </div>

      {coolingDown && (
        <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
          One top-up per wallet per day. Next one from{' '}
          {new Date(nextAt * 1000).toLocaleString('en-GB', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
          .
        </p>
      )}

      {trustlineHint && (needsTrustline || (address && balance === null)) && (
        <div className="mt-3">
          <Alert kind="info">
            Your wallet must trust the test USDC asset before it can hold it. In
            Freighter: <strong>Manage assets → Add an asset</strong>, then add code{' '}
            <span className="mono">USDC</span> with issuer{' '}
            <span className="mono break-all">{config.usdcIssuer || 'see the docs'}</span>.
            Then press the button again.
          </Alert>
        </div>
      )}
    </>
  );

  if (compact) return <div className="text-sm">{body}</div>;
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold">Test USDC (testnet demo)</h2>
      {body}
    </Card>
  );
}
