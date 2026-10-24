import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAccountSpendableBalance, usdcTrustlineFromAccount } from './stellar';

const ISSUER = 'GCKX5KAFVF7GLFZ3JWQGJ4F62RYYZU67PI3TACBGKVPJ73JELMI3L4KR';
const OTHER_ISSUER = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAA';

/** The shape of a Horizon account record the parser cares about. */
type Line = {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
};

function account(balances: Line[]): { balances: Line[]; subentry_count: number } {
  return { balances, subentry_count: balances.length };
}

/**
 * Which line counts as *the* USDC trustline (#1), and what is read off it.
 *
 * A wrong answer here decides whether the funding form blocks: matching on
 * the code alone would accept a lookalike token from another issuer, and
 * matching on the issuer alone would accept any other asset that issuer
 * happens to have issued.
 */
describe('usdcTrustlineFromAccount', () => {
  it('finds the USDC line for the configured issuer and parses its balance', () => {
    const info = usdcTrustlineFromAccount(
      account([
        { asset_type: 'native', balance: '42.0000000' },
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: ISSUER,
          balance: '3.0000000',
        },
      ]),
      ISSUER,
    );
    expect(info).toEqual({ hasTrustline: true, balance: 30_000000n });
  });

  it('reports a missing trustline for a fresh account holding only XLM', () => {
    const info = usdcTrustlineFromAccount(
      account([{ asset_type: 'native', balance: '100.0000000' }]),
      ISSUER,
    );
    expect(info).toEqual({ hasTrustline: false, balance: null });
  });

  it('ignores USDC issued by someone else', () => {
    const info = usdcTrustlineFromAccount(
      account([
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: OTHER_ISSUER,
          balance: '9.0000000',
        },
      ]),
      ISSUER,
    );
    expect(info).toEqual({ hasTrustline: false, balance: null });
  });

  it('ignores another asset from the same issuer', () => {
    const info = usdcTrustlineFromAccount(
      account([
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'OTHER',
          asset_issuer: ISSUER,
          balance: '9.0000000',
        },
      ]),
      ISSUER,
    );
    expect(info).toEqual({ hasTrustline: false, balance: null });
  });

  it('accepts a twelve-character asset code', () => {
    const info = usdcTrustlineFromAccount(
      account([
        {
          asset_type: 'credit_alphanum12',
          asset_code: 'USDC',
          asset_issuer: ISSUER,
          balance: '0.0000001',
        },
      ]),
      ISSUER,
    );
    expect(info).toEqual({ hasTrustline: true, balance: 1n });
  });

  it('keeps the trustline when the balance cannot be parsed', () => {
    const info = usdcTrustlineFromAccount(
      account([
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: ISSUER,
          balance: 'not-a-number',
        },
      ]),
      ISSUER,
    );
    expect(info).toEqual({ hasTrustline: true, balance: null });
  });
});

describe('getAccountSpendableBalance', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
