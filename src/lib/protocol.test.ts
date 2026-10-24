import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Batch settlement (`voucher.settleMany`).
 *
 * The deployed contract has no batch-settle method yet (contracts #4 is an
 * optional upgrade), so both branches are pinned here with the contract spec
 * and the transaction layer mocked: the single batch write when the spec
 * exposes one, the ordinary per-voucher writes when it does not, and the
 * fallback when a batch write fails. Encoding goes through `funcArgsToScVals`,
 * so the tests also assert the argument name is read off the spec rather than
 * hardcoded.
 */

const state = vi.hoisted(() => ({
  functions: ['claim', 'attest', 'settle', 'refund'] as string[],
  argName: 'voucher_ids',
  encoded: [] as Array<{ method: string; args: Record<string, unknown> }>,
  invokes: [] as string[],
  /** Methods that always fail, e.g. a deployment rejecting its own spec. */
  failMethods: new Set<string>(),
  /** Fail this occurrence (1-based) of a method instead of every one. */
  failNth: null as { method: string; nth: number } | null,
  calls: new Map<string, number>(),
  /** The last call as it reached the transaction layer, for shape checks. */
  lastCall: null as Record<string, unknown> | null,
}));

vi.mock('./contracts', () => {
  class FakeClient {
    spec = {
      funcs: () => state.functions.map((name) => ({ name })),
      getFunc: (name: string) => {
        if (!state.functions.includes(name)) throw new Error(`no ${name}`);
        return { inputs: [{ name: state.argName }] };
      },
      funcArgsToScVals: (method: string, args: Record<string, unknown>) => {
        state.encoded.push({ method, args });
        return [];
      },
    };
  }
  return { VoucherClient: FakeClient, RegistryClient: FakeClient, FaucetClient: FakeClient };
});

vi.mock('./stellar', () => ({
  invokeContract: async (
    contractId: string,
    method: string,
    args: unknown[],
    wallet: string,
    sign: unknown,
  ) => {
    state.lastCall = { contractId, method, args, wallet, sign };
    state.invokes.push(method);
    const seen = (state.calls.get(method) ?? 0) + 1;
    state.calls.set(method, seen);
    const nthFailure =
      state.failNth?.method === method && state.failNth.nth === seen;
    if (state.failMethods.has(method) || nthFailure) {
      throw new Error(`${method} failed`);
    }
    return { hash: 'ab'.repeat(32), returnValue: null };
  },
  invokeContractBatch: vi.fn(),
  invokePathPaymentThenContract: vi.fn(),
  readContract: vi.fn(),
  arg: {},
}));

const { voucher } = await import('./protocol');

const CALLER = 'GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR';
const sign = async () => 'signed';

beforeEach(() => {
  state.functions = ['claim', 'attest', 'settle', 'refund'];
  state.argName = 'voucher_ids';
  state.encoded = [];
  state.invokes = [];
  state.failMethods = new Set();
  state.failNth = null;
  state.calls = new Map();
  state.lastCall = null;
});

describe('settleMany', () => {
  it('settles one voucher per write when the contract has no batch method', async () => {
    const progress: Array<[number, number, string]> = [];
    const result = await voucher.settleMany(CALLER, ['11', '12'], sign, (done, total, id) =>
      progress.push([done, total, id]),
    );

    expect(state.invokes).toEqual(['settle', 'settle']);
    expect(state.encoded.map((c) => c.method)).toEqual(['settle', 'settle']);
    expect(result).toEqual({ settled: ['11', '12'], failed: [] });
    expect(progress).toEqual([
      [1, 2, '11'],
      [2, 2, '12'],
    ]);
  });

  it('uses the contract batch method when its spec exposes one', async () => {
    state.functions = ['settle', 'settle_many'];

    const result = await voucher.settleMany(CALLER, ['21', '22', '23'], sign);

    // One write for all three, encoded with the spec's own argument name.
    expect(state.invokes).toEqual(['settle_many']);
    // The batch write is signed by the caller and addressed to the voucher contract.
    expect(state.lastCall?.wallet).toBe(CALLER);
    expect(state.encoded).toEqual([
      { method: 'settle_many', args: { voucher_ids: [21n, 22n, 23n] } },
    ]);
    expect(result).toEqual({ settled: ['21', '22', '23'], failed: [] });
  });

  it('finds the batch method under any of its known names', async () => {
    state.functions = ['settle', 'batch_settle'];

    await voucher.settleMany(CALLER, ['31', '32'], sign);

    expect(state.invokes).toEqual(['batch_settle']);
  });

  it('settles a single id the ordinary way even when batching is available', async () => {
    state.functions = ['settle', 'settle_many'];

    const result = await voucher.settleMany(CALLER, ['41'], sign);

    expect(state.invokes).toEqual(['settle']);
    expect(result.settled).toEqual(['41']);
  });

  it('falls back to per-voucher writes when the batch write fails', async () => {
    state.functions = ['settle', 'settle_many'];
    state.failMethods = new Set(['settle_many']);

    const result = await voucher.settleMany(CALLER, ['51', '52'], sign);

    expect(state.invokes).toEqual(['settle_many', 'settle', 'settle']);
    expect(result).toEqual({ settled: ['51', '52'], failed: [] });
  });

  it('reports a rejected voucher without stranding the rest', async () => {
    // The second voucher is no longer settleable by the time it is written.
    state.failNth = { method: 'settle', nth: 2 };
    const progress: string[] = [];

    const result = await voucher.settleMany(CALLER, ['61', '62', '63'], sign, (_d, _t, id) =>
      progress.push(id),
    );

    expect(state.invokes).toEqual(['settle', 'settle', 'settle']);
    expect(result.settled).toEqual(['61', '63']);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].id).toBe('62');
    expect(progress).toEqual(['61', '63']);
  });

  it('does nothing for an empty list', async () => {
    const result = await voucher.settleMany(CALLER, [], sign);

    expect(state.invokes).toEqual([]);
    expect(result).toEqual({ settled: [], failed: [] });
  });
});
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
