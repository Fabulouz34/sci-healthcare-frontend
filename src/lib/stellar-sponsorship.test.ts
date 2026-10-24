import { Account, Keypair, Networks, SorobanDataBuilder, Transaction, TransactionBuilder, nativeToScVal } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { config } from './config';
import { invokeContract } from './stellar';
import { isTransactionPending } from './pending-tx';

const rpcMock = vi.hoisted(() => ({
  getAccount: vi.fn(), simulateTransaction: vi.fn(), sendTransaction: vi.fn(), getTransaction: vi.fn(),
}));
vi.mock('@stellar/stellar-sdk', async (original) => {
  const sdk = await original<typeof import('@stellar/stellar-sdk')>();
  return { ...sdk, rpc: { ...sdk.rpc,
    Server: class { constructor() { return rpcMock; } },
  } };
});
vi.mock('./config', () => ({ config: {
  sponsoredFees: true, network: 'testnet', networkPassphrase: 'Test SDF Network ; September 2015',
  apiUrl: 'https://api.example.test', rpcUrl: 'https://rpc.example.test',
  contracts: { voucher: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM' },
} }));

const wallet = Keypair.random();
const sponsor = Keypair.random();
const args = [nativeToScVal(wallet.publicKey()), nativeToScVal('opaque'), nativeToScVal('provider'),
  nativeToScVal(1), nativeToScVal(30_0000000n, { type: 'i128' }), nativeToScVal(100)];
const sign = vi.fn(async (xdr: string) => {
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET); tx.sign(wallet); return tx.toXDR();
});
function invoke(sponsored = true, method = 'create_voucher', callArgs = args) {
  return invokeContract(config.contracts.voucher, method, callArgs, wallet.publicKey(), sign, sponsored);
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcMock.getAccount.mockImplementation(async () => new Account(wallet.publicKey(), '1'));
  rpcMock.simulateTransaction.mockResolvedValue({ _parsed: true, id: '1', latestLedger: 1,
    minResourceFee: '500', transactionData: new SorobanDataBuilder().setResourceFee('500'),
    result: { auth: [], retval: nativeToScVal(7n) }, events: [],
  });
  rpcMock.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'ab'.repeat(32) });
  rpcMock.getTransaction.mockResolvedValue({ status: 'SUCCESS', returnValue: nativeToScVal(7n) });
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const inner = TransactionBuilder.fromXDR(JSON.parse(options.body).transaction, Networks.TESTNET) as Transaction;
    const bump = TransactionBuilder.buildFeeBumpTransaction(sponsor.publicKey(), '100', inner, Networks.TESTNET);
    bump.sign(sponsor);
    return new Response(JSON.stringify({ transaction: bump.toXDR() }));
  }));
});
afterEach(() => vi.unstubAllGlobals());

it('simulates before signing, submits the fee bump and polls its hash for the voucher ID', async () => {
  await expect(invoke()).resolves.toEqual({ hash: 'ab'.repeat(32), returnValue: 7n });
  expect(rpcMock.simulateTransaction.mock.invocationCallOrder[0]).toBeLessThan(sign.mock.invocationCallOrder[0]);
  expect(rpcMock.sendTransaction.mock.calls[0][0].feeSource).toBe(sponsor.publicKey());
  expect(rpcMock.sendTransaction.mock.calls[0][0].innerTransaction.fee).toBe('600');
  expect(rpcMock.getTransaction).toHaveBeenCalledWith('ab'.repeat(32));
});
it('includes simulated Soroban resource fees in the cap before signing', async () => {
  rpcMock.simulateTransaction.mockResolvedValue({ _parsed: true,
    minResourceFee: '10000000', transactionData: new SorobanDataBuilder().setResourceFee('10000000'),
    result: { auth: [], retval: nativeToScVal(7n) }, events: [],
  });
  await expect(invoke()).rejects.toThrow('fee exceeds');
  expect(sign).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it('keeps ordinary funding on the direct path', async () => {
  await invoke(false);
  expect(fetch).not.toHaveBeenCalled();
  expect(rpcMock.sendTransaction.mock.calls[0][0]).toBeInstanceOf(Transaction);
});
it('never prompts the wallet after a failed simulation', async () => {
  rpcMock.simulateTransaction.mockResolvedValue({ error: 'contract rejected' });
  await expect(invoke()).rejects.toThrow('contract rejected');
  expect(sign).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it('does not submit or fall back after a sponsor refusal', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
  await expect(invoke()).rejects.toThrow('limit');
  expect(rpcMock.sendTransaction).not.toHaveBeenCalled();
  expect(isTransactionPending()).toBe(false);
});
it('reports an RPC rejection without retrying the inner transaction', async () => {
  rpcMock.sendTransaction.mockResolvedValue({ status: 'ERROR' });
  await expect(invoke()).rejects.toThrow('Transaction rejected');
  expect(rpcMock.sendTransaction).toHaveBeenCalledOnce();
  expect(rpcMock.getTransaction).not.toHaveBeenCalled();
  expect(isTransactionPending()).toBe(false);
});
it('never sends a refused wallet signature to the sponsor', async () => {
  sign.mockRejectedValueOnce(new Error('Wallet cancelled'));
  await expect(invoke()).rejects.toThrow('Wallet cancelled');
  expect(fetch).not.toHaveBeenCalled(); expect(rpcMock.sendTransaction).not.toHaveBeenCalled();
});
it('rejects other methods and excessive funding before simulation or signing', async () => {
  await expect(invoke(true, 'refund')).rejects.toThrow('Only voucher');
  const over = [...args]; over[4] = nativeToScVal(100_0000001n, { type: 'i128' });
  await expect(invoke(true, 'create_voucher', over)).rejects.toThrow('limited');
  expect(rpcMock.simulateTransaction).not.toHaveBeenCalled(); expect(sign).not.toHaveBeenCalled();
});
