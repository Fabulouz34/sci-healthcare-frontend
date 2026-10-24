'use client';

import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';

import { explorerTx } from '@/lib/config';
import { beneficiaryRef } from '@/lib/beneficiary';
import { humaniseError, VOUCHER_ERRORS } from '@/lib/errors';
import { formatUsdc } from '@/lib/amounts';
import { voucher } from '@/lib/protocol';
import { buildSep7TxUri, isStellarAccountAddress } from '@/lib/sep7';
import {
  waitForPreparedInvocation,
  type PreparedInvocation,
} from '@/lib/stellar';
import { CopyValue } from '@/components/CopyValue';
import { Alert, Button, ExplorerLink } from '@/components/ui';

/**
 * Funding through a SEP-7 payment link (#162).
 *
 * A browser-extension wallet is not the only way to sign: SEP-7 lets any
 * compatible wallet — including a mobile one such as LOBSTR — sign a
 * prepared transaction, so this panel builds the same `create_voucher`
 * call the "Fund voucher" button would sign locally, then hands the
 * envelope to the user's wallet and watches the ledger for it.
 *
 * The app still never sees a key: the wallet signs and submits, and the
 * panel only polls for the transaction it prepared. No payment details
 * are written anywhere until the user submits from the wallet.
 */
export type Sep7FundPanelProps = {
  /** Amount in base units (7 decimals). */
  amount: bigint;
  /** Expiry of the voucher, in Unix seconds, or null until a date is chosen. */
  expiresAt: number | null;
  /** Clinic address, which receives the voucher. */
  provider: string;
  /** Selected service code; a SEP-7 link funds exactly one service. */
  serviceCode: number;
  /** Patient reference, HMAC'd in the browser before it is put on chain. */
  identifier: string;
  /** Patient secret, used only to derive the reference locally. */
  secret: string;
  /** Connected wallet, offered as the default payer. */
  walletAddress: string | null;
  /** Called once the payment is confirmed, to refresh voucher lists. */
  onFunded: (result: { hash: string }) => void;
};

type Phase = 'idle' | 'building' | 'waiting' | 'confirmed';

export function Sep7FundPanel({
  amount,
  expiresAt,
  provider,
  serviceCode,
  identifier,
  secret,
  walletAddress,
  onFunded,
}: Sep7FundPanelProps) {
  const [payerDraft, setPayerDraft] = useState<string | null>(null);
  // Default to the connected wallet without overwriting an address the funder
  // typed (they may pay from a different account in a mobile wallet).
  const payer = payerDraft ?? walletAddress ?? '';
  const [phase, setPhase] = useState<Phase>('idle');
  const [prepared, setPrepared] = useState<PreparedInvocation | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A wallet gets the prepared envelope as a QR code. Rendering it here keeps
  // the encoded value identical to the link's, including the testnet
  // passphrase, which is the part a wallet would otherwise get wrong.
  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    QRCode.toDataURL(uri, {
      width: 240,
      margin: 2,
      color: { dark: '#0d1b2a', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then((dataUrl) => {
        if (!cancelled) setQr(dataUrl);
      })
      .catch(() => {
        // The link still works if a canvas is unavailable; the QR is a
        // convenience, not the only way to pay.
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  // Poll the ledger for the prepared transaction. SEP-7 wallets submit on
  // their own infrastructure, so there is no response to await: the poller is
  // what turns "the wallet signed" into "the voucher exists".
  const onFundedRef = useRef(onFunded);
  useEffect(() => {
    onFundedRef.current = onFunded;
  }, [onFunded]);

  useEffect(() => {
    if (!prepared || phase !== 'waiting') return;
    const controller = new AbortController();
    let cancelled = false;

    waitForPreparedInvocation(prepared, { signal: controller.signal })
      .then((result) => {
        if (cancelled) return;
        setHash(result.hash);
        setPhase('confirmed');
        onFundedRef.current({ hash: result.hash });
      })
      .catch((err) => {
        if (cancelled || controller.signal.aborted) return;
        setError(humaniseError(err, VOUCHER_ERRORS));
        setPhase('idle');
        setPrepared(null);
        setUri(null);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [prepared, phase]);

  const validPayer = isStellarAccountAddress(payer);
  const expiresAtSeconds = expiresAt;
  const canBuild =
    phase !== 'building' &&
    amount > 0n &&
    expiresAtSeconds !== null &&
    validPayer &&
    identifier.trim().length > 0 &&
    secret.length >= 32;

  async function createLink() {
    if (expiresAtSeconds === null) {
      setError('Choose the date the patient must attend by.');
      return;
    }
    setError(null);
    setPhase('building');
    try {
      const funder = payer.trim();
      const ref = await beneficiaryRef(identifier, secret);
      const next = await voucher.prepareCreate(
        {
          funder,
          beneficiaryRef: ref,
          provider,
          serviceCode,
          amount,
          expiresAt: expiresAtSeconds,
        },
        funder,
      );
      const nextUri = buildSep7TxUri({
        xdr: next.xdr,
        message: `Care voucher for $${formatUsdc(amount)}. Sign to fund it.`,
        networkPassphrase: next.networkPassphrase,
        originDomain:
          typeof window === 'undefined' ? undefined : window.location.origin,
      });
      setPrepared(next);
      setUri(nextUri);
      setQr(null);
      setPhase('waiting');
    } catch (err) {
      setError(humaniseError(err, VOUCHER_ERRORS));
      setPhase('idle');
    }
  }

  function reset() {
    setPhase('idle');
    setPrepared(null);
    setUri(null);
    setQr(null);
    setHash(null);
    setError(null);
  }

  return (
    <details className="rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Pay from a mobile wallet
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-soft)]">
        Builds the funding transaction and shows a SEP-7 link. Open it in a
        compatible wallet such as LOBSTR — no browser extension needed. Your
        key stays in the wallet.
      </p>

      {phase === 'confirmed' && hash && (
        <div className="mt-3 space-y-2">
          <Alert kind="success">Payment confirmed.</Alert>
          <p className="text-xs">
            <ExplorerLink href={explorerTx(hash)}>View transaction</ExplorerLink>
          </p>
          <Button variant="ghost" className="w-full" onClick={reset}>
            Fund another service
          </Button>
        </div>
      )}

      {phase !== 'confirmed' && (
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
              Paying Stellar address
            </span>
            <input
              value={payer}
              onChange={(e) => setPayerDraft(e.target.value)}
              placeholder="G…"
              spellCheck={false}
              autoCapitalize="off"
              className="mono mt-1 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-xs"
            />
            <span className="mt-1 block text-xs text-[var(--color-ink-soft)]">
              {payer && !validPayer
                ? 'That does not look like a Stellar account address.'
                : walletAddress
                  ? 'Defaults to your connected wallet; change it to pay from another.'
                  : 'The wallet you will pay with.'}
            </span>
          </label>

          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}

          {phase === 'waiting' && uri ? (
            <div className="space-y-3 text-center">
              {qr && (
                // The URI is the payment request itself; the QR is only a
                // second rendering of it.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qr}
                  alt="SEP-7 payment QR code"
                  width={180}
                  height={180}
                  className="mx-auto rounded-lg border border-[var(--color-line)] bg-white p-2"
                />
              )}
              <div className="flex items-center justify-center gap-2">
                <a
                  href={uri}
                  className="text-sm font-medium text-[var(--color-brand)] underline underline-offset-2"
                >
                  Open in wallet
                </a>
                <CopyValue value={uri} label="SEP-7 payment link" buttonOnly />
              </div>
              <p className="text-xs text-[var(--color-ink-soft)]">
                Waiting for the wallet to submit… Keep this page open. This
                stops after three minutes.
              </p>
              <Button variant="ghost" className="w-full" onClick={reset}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              className="w-full"
              onClick={() => void createLink()}
              disabled={!canBuild}
            >
              {phase === 'building' ? 'Building transaction…' : 'Create SEP-7 payment link'}
            </Button>
          )}

          {expiresAtSeconds === null && (
            <p className="text-xs text-[var(--color-ink-soft)]">
              Choose an expiry date first.
            </p>
          )}
        </div>
      )}
    </details>
  );
}
