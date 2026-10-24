import { Account, Contract, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from './config';
import { requireSponsorship, sponsorTransaction, sponsorshipAvailable } from './sponsorship';

vi.mock('./config', () => ({ config: {
  sponsoredFees: true, network: 'testnet', networkPassphrase: 'Test SDF Network ; September 2015',
  apiUrl: 'https://api.example.test',
} }));

const funder = Keypair.random();
const sponsor = Keypair.random();
const contract = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
function transaction(fee = '100', sequence = '1') {
  return new TransactionBuilder(new Account(funder.publicKey(), sequence), {
    fee, networkPassphrase: Networks.TESTNET,
  }).addOperation(new Contract(contract).call('create_voucher')).setTimeout(180).build();
}
function sign(envelope: string) {
  const tx = TransactionBuilder.fromXDR(envelope, Networks.TESTNET);
  tx.sign(funder);
  return Promise.resolve(tx.toXDR());
}

describe('fee sponsorship', () => {
  beforeEach(() => {
    Object.assign(config, { sponsoredFees: true });
    Object.assign(config, { network: 'testnet' });
    Object.assign(config, { networkPassphrase: Networks.TESTNET });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('requires the flag and exact testnet network/passphrase', () => {
    expect(sponsorshipAvailable()).toBe(true);
    Object.assign(config, { sponsoredFees: false });
    expect(sponsorshipAvailable()).toBe(false);
    Object.assign(config, { sponsoredFees: true });
    Object.assign(config, { network: 'public' });
    expect(sponsorshipAvailable()).toBe(false);
    Object.assign(config, { network: 'testnet' });
    Object.assign(config, { networkPassphrase: Networks.PUBLIC });
    expect(sponsorshipAvailable()).toBe(false);
  });

  it.each([0n, -1n, 100_0000001n])('rejects amount %s', (amount) => {
    expect(() => requireSponsorship(amount)).toThrow('limited');
  });
  it('accepts positive amounts through the exact cap', () => {
    expect(() => requireSponsorship(1n)).not.toThrow();
    expect(() => requireSponsorship(100_0000000n)).not.toThrow();
  });

  it('does not sign or call a sponsor when the flag is off', async () => {
    Object.assign(config, { sponsoredFees: false });
    const signer = vi.fn(sign);
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(sponsorTransaction(transaction(), signer)).rejects.toThrow('unavailable');
    expect(signer).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([null, {}, { transaction: 1 }, { transaction: 'x'.repeat(100_001) }])('rejects a malformed response body', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    await expect(sponsorTransaction(transaction(), sign)).rejects.toThrow('invalid fee-bump');
  });

  it('returns a signed fee bump preserving the exact wallet envelope', async () => {
    const prepared = transaction();
    const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      expect(Object.keys(body).sort()).toEqual(['network', 'transaction']);
      expect(body.network).toBe('testnet');
      expect(body.transaction).toBe(await sign(prepared.toXDR()));
      const inner = TransactionBuilder.fromXDR(body.transaction, Networks.TESTNET);
      const bump = TransactionBuilder.buildFeeBumpTransaction(sponsor.publicKey(), '100', inner as ReturnType<typeof transaction>, Networks.TESTNET);
      bump.sign(sponsor);
      return new Response(JSON.stringify({ transaction: bump.toXDR() }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const bump = await sponsorTransaction(prepared, sign);
    expect(bump.feeSource).toBe(sponsor.publicKey());
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/sponsorship/fee-bump');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store' });
  });

  it('rejects excessive simulated fees before asking the wallet', async () => {
    const signer = vi.fn(sign);
    await expect(sponsorTransaction(transaction('10000000'), signer)).rejects.toThrow('fee exceeds');
    expect(signer).not.toHaveBeenCalled();
  });

  it.each(['unsigned', 'changed'])('rejects a %s wallet response before contacting the sponsor', async (kind) => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(sponsorTransaction(transaction(), kind === 'unsigned'
      ? async (xdr) => xdr : async () => sign(transaction('100', '99').toXDR()))).rejects.toThrow('expected funding');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([403, 429, 503])('handles HTTP %s without falling back or exposing response data', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('sensitive response', { status })));
    await expect(sponsorTransaction(transaction(), sign)).rejects.toThrow(/limit|declined/);
  });
  it('handles an outage without retrying or submitting directly', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(sponsorTransaction(transaction(), sign)).rejects.toThrow('No transaction was submitted');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(['plain', 'changed', 'unsigned bump', 'wrong signature', 'self paid', 'over cap', 'malformed'])('rejects %s sponsor responses', async (kind) => {
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      const { transaction: envelope } = JSON.parse(options.body);
      const inner = TransactionBuilder.fromXDR(envelope, Networks.TESTNET) as ReturnType<typeof transaction>;
      let result = envelope;
      if (kind === 'malformed') result = 'invalid-xdr';
      else if (kind !== 'plain') {
        const changed = transaction('100', '50'); changed.sign(funder);
        const bump = TransactionBuilder.buildFeeBumpTransaction(
          kind === 'self paid' ? funder.publicKey() : sponsor.publicKey(),
          kind === 'over cap' ? '10000000' : '100',
          kind === 'changed' ? changed : inner, Networks.TESTNET,
        );
        if (kind !== 'unsigned bump') bump.sign(kind === 'wrong signature' ? funder : sponsor);
        result = bump.toXDR();
      }
      return new Response(JSON.stringify({ transaction: result }));
    }));
    await expect(sponsorTransaction(transaction(), sign)).rejects.toThrow('invalid fee-bump');
  });
});
