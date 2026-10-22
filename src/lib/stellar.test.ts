import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAccountSpendableBalance, simulateContractFee } from './stellar';

describe('getAccountSpendableBalance', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns a zeroed balance when Horizon omits the native balance entry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ balances: [], subentry_count: 3 }),
      }),
    );

    await expect(getAccountSpendableBalance('GTEST')).resolves.toMatchObject({
      rawBalance: 0,
      minBalance: 2.5,
      spendable: 0,
      isLowForFees: true,
    });
  });

  it('ignores malformed balance strings instead of crashing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          balances: [{ asset_type: 'native', balance: 'not-a-number' }],
          subentry_count: 0,
        }),
      }),
    );

    await expect(getAccountSpendableBalance('GTEST')).resolves.toMatchObject({
      rawBalance: 0,
      minBalance: 1,
      spendable: 0,
      isLowForFees: true,
    });
  });
});

describe('simulateContractFee', () => {
  it('returns the mocked resource fee and records a simulation, not a write', async () => {
    const calls: unknown[] = [];
    vi.stubGlobal('window', {
      __SCI_MOCK_RPC__: { calls, args: [] },
    });

    await expect(simulateContractFee('CCONTRACT', 'create_voucher', [], 'GACCOUNT'))
      .resolves.toBe(100_000n);
    expect(calls).toEqual([
      { kind: 'simulate', contractId: 'CCONTRACT', method: 'create_voucher' },
    ]);
  });
});
