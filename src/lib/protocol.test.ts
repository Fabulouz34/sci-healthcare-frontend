import { Address, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';

import { config } from './config';
import { FaucetClient, RegistryClient, VoucherClient } from './contracts';
import { faucet, registry, usdc, voucher } from './protocol';

const mocks = vi.hoisted(() => {
  const recorded: Array<{
    kind: string;
    contractId: string;
    method: string;
    args: unknown;
  }> = [];

  return {
    recorded,
    invokeContract: vi.fn(async (...args: unknown[]) => {
      recorded.push({
        kind: 'invoke',
        contractId: args[0] as string,
        method: args[1] as string,
        args: args[2],
      });
      return { hash: 'hash', returnValue: null };
    }),
    invokeContractBatch: vi.fn(async (...args: unknown[]) => {
      const calls = args[0] as Array<{
        contractId: string;
        method: string;
        args: xdr.ScVal[];
      }>;
      for (const call of calls) recorded.push({ kind: 'batch', ...call });
      return calls.map(() => ({ hash: 'hash', returnValue: null }));
    }),
    invokePathPaymentThenContract: vi.fn(async (...args: unknown[]) => {
      recorded.push({
        kind: 'path-payment',
        contractId: args[0] as string,
        method: args[1] as string,
        args: args[2],
      });
      return { hash: 'hash', returnValue: null };
    }),
    readContract: vi.fn(async (...args: unknown[]) => {
      recorded.push({
        kind: 'read',
        contractId: args[0] as string,
        method: args[1] as string,
        args: args[2],
      });
      if (args[1] === 'get_provider') return { status: 1 };
      if (args[1] === 'get_config') return { amount: 123n };
      if (args[1] === 'quote') return [1n, 2n];
      return true;
    }),
  };
});

vi.mock('./stellar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./stellar')>();
  return {
    ...actual,
    invokeContract: mocks.invokeContract,
    invokeContractBatch: mocks.invokeContractBatch,
    invokePathPaymentThenContract: mocks.invokePathPaymentThenContract,
    readContract: mocks.readContract,
  };
});

vi.mock('./config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config')>();
  return {
    ...actual,
    config: {
      ...actual.config,
      contracts: {
        ...actual.config.contracts,
        usdc: 'CCB25WG7DQ2CSNXPTOHZO2PDZ324FQPZLH3LSNCCLWYM3FEH52GEXC47',
      },
    },
  };
});

const FUNDER = 'GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR';
const PROVIDER = 'GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U';
const ATTESTER = 'GDWUSKGGFDI4FRXK5EBTRECZSVQSSWJHHJOGH6JWG3AUMFFMQ435DIAG';
const SIGN = async () => '';

const voucherBinding = new VoucherClient({
  contractId: config.contracts.voucher,
  networkPassphrase: config.networkPassphrase,
  rpcUrl: config.rpcUrl,
});
const registryBinding = new RegistryClient({
  contractId: config.contracts.registry,
  networkPassphrase: config.networkPassphrase,
  rpcUrl: config.rpcUrl,
});
const faucetBinding = new FaucetClient({
  contractId: config.contracts.faucet,
  networkPassphrase: config.networkPassphrase,
  rpcUrl: config.rpcUrl,
});

function encoded(args: xdr.ScVal[]): string[] {
  return args.map((arg) => Buffer.from(arg.toXDR()).toString('base64'));
}

function expectBindingEncoding(
  index: number,
  method: string,
  spec: VoucherClient['spec'] | RegistryClient['spec'] | FaucetClient['spec'],
  expectedArguments: Record<string, unknown>,
  kind: string,
) {
  const call = mocks.recorded[index];
  expect(call?.method, `call ${index} method`).toBe(method);
  expect(call?.kind, `call ${index} route`).toBe(kind);
  expect(
    encoded(call?.args as xdr.ScVal[]),
    `${method} ScVals should match generated binding encoding`,
  ).toEqual(encoded(spec.funcArgsToScVals(method, expectedArguments)));
}

describe('protocol contract argument encoding', () => {
  it('matches generated binding ScVals for every contract call', async () => {
    const beneficiaryRef = 'ab'.repeat(32);
    const createParams = {
      funder: FUNDER,
      beneficiaryRef: `0x${beneficiaryRef}`,
      provider: PROVIDER,
      serviceCode: 101,
      amount: 30_000_000n,
      expiresAt: 1_800_000_000,
    };
    const createBindingArgs = {
      funder: FUNDER,
      beneficiary_ref: Buffer.from(beneficiaryRef, 'hex'),
      provider: PROVIDER,
      service_code: 101,
      amount: 30_000_000n,
      expires_at: 1_800_000_000n,
    };

    let index = mocks.recorded.length;
    await voucher.create(createParams, SIGN);
    expectBindingEncoding(index++, 'create_voucher', voucherBinding.spec, createBindingArgs, 'invoke');

    index = mocks.recorded.length;
    await voucher.createWithXlmSwap({ ...createParams, swapAmount: 10_000_000n }, SIGN);
    expectBindingEncoding(
      index++,
      'create_voucher',
      voucherBinding.spec,
      createBindingArgs,
      'path-payment',
    );

    index = mocks.recorded.length;
    await voucher.createMany(
      [createParams, { ...createParams, serviceCode: 102, amount: 50_000_000n }],
      SIGN,
    );
    expectBindingEncoding(index++, 'create_voucher', voucherBinding.spec, createBindingArgs, 'batch');
    expectBindingEncoding(
      index++,
      'create_voucher',
      voucherBinding.spec,
      { ...createBindingArgs, service_code: 102, amount: 50_000_000n },
      'batch',
    );

    index = mocks.recorded.length;
    await voucher.claim(PROVIDER, '17', SIGN);
    expectBindingEncoding(index++, 'claim', voucherBinding.spec, { provider: PROVIDER, voucher_id: 17n }, 'invoke');

    index = mocks.recorded.length;
    await voucher.attest(ATTESTER, '18', SIGN);
    expectBindingEncoding(index++, 'attest', voucherBinding.spec, { attester: ATTESTER, voucher_id: 18n }, 'invoke');

    index = mocks.recorded.length;
    await voucher.dispute(FUNDER, '19', 3, SIGN);
    expectBindingEncoding(
      index++,
      'dispute',
      voucherBinding.spec,
      { funder: FUNDER, voucher_id: 19n, reason_code: 3 },
      'invoke',
    );

    index = mocks.recorded.length;
    await voucher.settle(FUNDER, '20', SIGN);
    expectBindingEncoding(index++, 'settle', voucherBinding.spec, { voucher_id: 20n }, 'invoke');

    index = mocks.recorded.length;
    await voucher.refund(FUNDER, '21', SIGN);
    expectBindingEncoding(index++, 'refund', voucherBinding.spec, { voucher_id: 21n }, 'invoke');

    index = mocks.recorded.length;
    await voucher.quote(30_000_000n);
    expectBindingEncoding(index++, 'quote', voucherBinding.spec, { amount: 30_000_000n }, 'read');

    index = mocks.recorded.length;
    await registry.registerProvider(PROVIDER, 'Clinic', 'NG', SIGN);
    expectBindingEncoding(
      index++,
      'register_provider',
      registryBinding.spec,
      { owner: PROVIDER, name: 'Clinic', country: 'NG' },
      'invoke',
    );

    index = mocks.recorded.length;
    await registry.upsertService(PROVIDER, 101, 'Consultation', 30_000_000n, SIGN);
    expectBindingEncoding(
      index++,
      'upsert_service',
      registryBinding.spec,
      { provider_addr: PROVIDER, code: 101, label: 'Consultation', price: 30_000_000n },
      'invoke',
    );

    index = mocks.recorded.length;
    await registry.removeService(PROVIDER, 102, SIGN);
    expectBindingEncoding(
      index++,
      'remove_service',
      registryBinding.spec,
      { provider_addr: PROVIDER, code: 102 },
      'invoke',
    );

    index = mocks.recorded.length;
    await registry.providerStatus(PROVIDER);
    expectBindingEncoding(
      index++,
      'get_provider',
      registryBinding.spec,
      { provider_addr: PROVIDER },
      'read',
    );

    index = mocks.recorded.length;
    await registry.isActiveProvider(PROVIDER);
    expectBindingEncoding(
      index++,
      'is_active_provider',
      registryBinding.spec,
      { provider_addr: PROVIDER },
      'read',
    );

    index = mocks.recorded.length;
    await registry.isAttester(ATTESTER);
    expectBindingEncoding(index++, 'is_attester', registryBinding.spec, { addr: ATTESTER }, 'read');

    index = mocks.recorded.length;
    await faucet.drip(FUNDER, SIGN);
    expectBindingEncoding(index++, 'drip', faucetBinding.spec, { to: FUNDER }, 'invoke');

    index = mocks.recorded.length;
    await faucet.nextDripAt(FUNDER);
    expectBindingEncoding(index++, 'next_drip_at', faucetBinding.spec, { to: FUNDER }, 'read');

    index = mocks.recorded.length;
    await faucet.amount();
    expectBindingEncoding(index++, 'get_config', faucetBinding.spec, {}, 'read');

    index = mocks.recorded.length;
    await usdc.balance(FUNDER);
    const balanceCall = mocks.recorded[index];
    expect(balanceCall?.method).toBe('balance');
    expect(balanceCall?.kind).toBe('read');
    expect(encoded(balanceCall?.args as xdr.ScVal[])).toEqual([
      Buffer.from(Address.fromString(FUNDER).toScVal().toXDR()).toString('base64'),
    ]);

    expect(mocks.recorded).toHaveLength(index + 1);
  });
});