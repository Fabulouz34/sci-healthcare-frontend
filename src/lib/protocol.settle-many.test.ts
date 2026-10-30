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
