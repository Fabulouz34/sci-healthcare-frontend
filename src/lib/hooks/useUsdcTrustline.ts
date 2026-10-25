'use client';

import { useCallback, useEffect, useState } from 'react';

import { useToast } from '@/components/Toast';

import { config } from '../config';
import { addUsdcTrustline, getUsdcTrustline } from '../stellar';
import { useWallet } from '../wallet';

/**
 * The connected wallet's USDC trustline (#1).
 *
 * Stellar accounts must opt in to an asset before they can hold it, and a
 * first-time user has no reason to know that. This hook reads the line from
 * Horizon on connect so the funding form can gate on it: while `missing`,
 * the form explains what a trustline is and offers a one-click `changeTrust`
 * built here and signed in the wallet, instead of letting funding fail at
 * the last step with a raw host error.
 *
 * `unknown` (no issuer configured, account unfunded, Horizon unreachable)
 * fails open: the form behaves exactly as it did before the check existed,
 * because a transient read must never block a payment that can succeed.
 */
export type UsdcTrustlineStatus =
  | 'idle'
  | 'checking'
  | 'missing'
  | 'ready'
  | 'unknown';

export interface UsdcTrustlineState {
  status: UsdcTrustlineStatus;
  /** USDC balance in base units, once the trustline exists. */
  balance: bigint | null;
  /** True while the changeTrust round trip is in flight. */
  adding: boolean;
  add: () => Promise<void>;
}

type CheckResult = {
  address: string;
  status: 'missing' | 'ready' | 'unknown';
  balance: bigint | null;
};

export function useUsdcTrustline(): UsdcTrustlineState {
  const { address, signTransaction } = useWallet();
  const toast = useToast();
  // The result of the last completed check, tagged with the address it was
  // made for: a result for a previous wallet is never shown as this one's.
  const [result, setResult] = useState<CheckResult | null>(null);
  const [adding, setAdding] = useState(false);
  // Bumped after a successful changeTrust so the line is re-read.
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!address || !config.usdcIssuer) return;
    let ignore = false;
    (async () => {
      const info = await getUsdcTrustline(address);
      if (ignore) return;
      setResult({
        address,
        status:
          info === null ? 'unknown' : info.hasTrustline ? 'ready' : 'missing',
        balance: info?.hasTrustline ? info.balance : null,
      });
    })();
    return () => {
      ignore = true;
    };
  }, [address, reloads]);

  const fresh = result && result.address === address ? result : null;
  const status: UsdcTrustlineStatus =
    !address || !config.usdcIssuer
      ? 'idle'
      : fresh
        ? fresh.status
        : 'checking';
  const balance = fresh ? fresh.balance : null;

  const add = useCallback(async () => {
    if (!address) return;
    setAdding(true);
    try {
      await addUsdcTrustline(address, signTransaction);
      // The line exists the moment the transaction lands; the balance
      // catches up on the re-read below.
      setResult({ address, status: 'ready', balance: null });
      toast.success('USDC is ready — your wallet can hold it now.');
      setReloads((n) => n + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/reject|cancel|declin|denied/i.test(message)) {
        // Calm on purpose: nothing was sent and nothing changed.
        toast.info('Nothing was sent. Press Add USDC whenever you are ready.');
      } else {
        // addUsdcTrustline already throws Horizon codes in plain language.
        toast.error(message);
      }
    } finally {
      setAdding(false);
    }
  }, [address, signTransaction, toast]);

  return { status, balance, adding, add };
}
