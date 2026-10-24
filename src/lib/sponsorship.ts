import type { Transaction, FeeBumpTransaction } from '@stellar/stellar-sdk';

import { config } from './config';

// UX guardrails only. The sponsor must independently enforce its own budget,
// first-voucher eligibility and rate limits against verified chain state.
export const SPONSOR_MAX_AMOUNT = 100_0000000n; // 100 USDC
export const SPONSOR_MAX_FEE = 1_0000000n; // 1 XLM, including resource fees
const MAX_ENVELOPE_LENGTH = 100_000;

export function sponsorshipAvailable(): boolean {
  return config.sponsoredFees && config.network === 'testnet' &&
    config.networkPassphrase === 'Test SDF Network ; September 2015';
}

export function requireSponsorship(amount: bigint): void {
  if (!sponsorshipAvailable()) {
    throw new Error('Sponsored fees are unavailable on this network.');
  }
  if (amount <= 0n || amount > SPONSOR_MAX_AMOUNT) {
    throw new Error('Sponsored funding is limited to one voucher of up to 100 USDC.');
  }
}

/** The service signs a fee bump only; the browser validates and submits it. */
export async function sponsorTransaction(
  prepared: Transaction,
  sign: (envelope: string) => Promise<string>,
): Promise<FeeBumpTransaction> {
  if (!sponsorshipAvailable()) throw new Error('Sponsored fees are unavailable on this network.');
  if (BigInt(prepared.fee) + 100n > SPONSOR_MAX_FEE) {
    throw new Error('The estimated transaction fee exceeds the sponsorship limit.');
  }
  const { Transaction, TransactionBuilder, FeeBumpTransaction, Keypair } =
    await import('@stellar/stellar-sdk');
  const signed = TransactionBuilder.fromXDR(await sign(prepared.toXDR()), config.networkPassphrase);
  const expectedHash = prepared.hash();
  if (!(signed instanceof Transaction) || !signed.hash().every((byte, index) => byte === expectedHash[index]) ||
      signed.signatures.length === 0) {
    throw new Error('The wallet did not sign the expected funding transaction.');
  }
  const signedXdr = signed.toXDR();
  if (signedXdr.length > MAX_ENVELOPE_LENGTH) throw new Error('The transaction is too large to sponsor.');

  let response: Response;
  try {
    response = await fetch(`${config.apiUrl.replace(/\/$/, '')}/sponsorship/fee-bump`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ network: 'testnet', transaction: signedXdr }),
      signal: AbortSignal.timeout(15_000),
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
  } catch {
    throw new Error('The fee sponsor is unavailable. No transaction was submitted. Try later or turn off sponsored fees to pay with XLM.');
  }
  if (!response.ok) {
    throw new Error(response.status === 429
      ? 'The sponsorship limit has been reached. Try later or turn off sponsored fees to pay with XLM.'
      : 'The sponsor declined this request. First-voucher eligibility and limits apply. Turn off sponsored fees to pay with XLM.');
  }

  // Never echo a response body: it can contain transaction or patient data.
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('transaction' in body) ||
        typeof body.transaction !== 'string' || body.transaction.length > MAX_ENVELOPE_LENGTH) {
      throw new Error();
    }
    const bump = TransactionBuilder.fromXDR(body.transaction, config.networkPassphrase);
    if (!(bump instanceof FeeBumpTransaction) ||
        bump.innerTransaction.toXDR() !== signedXdr ||
        bump.feeSource === signed.source ||
        BigInt(bump.fee) > SPONSOR_MAX_FEE || BigInt(bump.fee) < BigInt(signed.fee) + 100n) {
      throw new Error();
    }
    const sponsor = Keypair.fromPublicKey(bump.feeSource);
    if (!bump.signatures.some((signature) =>
      sponsor.verify(bump.hash(), signature.signature))) throw new Error();
    return bump;
  } catch {
    throw new Error('The sponsor returned an invalid fee-bump transaction. Nothing was submitted.');
  }
}
