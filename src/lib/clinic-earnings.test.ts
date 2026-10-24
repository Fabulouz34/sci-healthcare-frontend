import { describe, expect, it } from 'vitest';

import {
  monthKey,
  monthlyEarnings,
  summariseEarnings,
  type EarningsVoucher,
} from './clinic-earnings';

function voucher(overrides: Partial<EarningsVoucher> & { amount: string; status: string }): EarningsVoucher {
  return {
    createdAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('summariseEarnings', () => {
  it('separates gross settled value, the fee paid and the net received', () => {
    const summary = summariseEarnings([
      voucher({
        amount: '30000000',
        status: 'Settled',
        settledNet: '29400000',
        settledFee: '600000',
      }),
      voucher({
        amount: '50000000',
        status: 'Settled',
        settledNet: '49000000',
        settledFee: '1000000',
      }),
    ]);

    expect(summary).toEqual({
      settled: '80000000',
      settledCount: 2,
      netReceived: '78400000',
      fees: '1600000',
      pending: '0',
      pendingCount: 0,
    });
  });

  it('counts only claimed, attested or disputed vouchers as pending payout', () => {
    const summary = summariseEarnings([
      voucher({ amount: '30000000', status: 'Claimed' }),
      voucher({ amount: '20000000', status: 'Attested' }),
      voucher({ amount: '10000000', status: 'Disputed' }),
      // Not care yet: it may expire and refund.
      voucher({ amount: '90000000', status: 'Funded' }),
      voucher({ amount: '70000000', status: 'Refunded' }),
      voucher({
        amount: '50000000',
        status: 'Settled',
        settledNet: '49500000',
        settledFee: '500000',
      }),
    ]);

    expect(summary.pending).toBe('60000000');
    expect(summary.pendingCount).toBe(3);
    expect(summary.settled).toBe('50000000');
    expect(summary.settledCount).toBe(1);
  });

  it('derives a missing fee from the net, and a missing net from the fee', () => {
    const fromNet = summariseEarnings([
      voucher({ amount: '30000000', status: 'Settled', settledNet: '29500000' }),
    ]);
    expect(fromNet.fees).toBe('500000');
    expect(fromNet.netReceived).toBe('29500000');

    const fromFee = summariseEarnings([
      voucher({ amount: '30000000', status: 'Settled', settledFee: '500000' }),
    ]);
    expect(fromFee.fees).toBe('500000');
    expect(fromFee.netReceived).toBe('29500000');
  });

  it('sums amounts past Number.MAX_SAFE_INTEGER exactly', () => {
    const summary = summariseEarnings([
      voucher({
        amount: '90071992547409910',
        status: 'Settled',
        settledNet: '89171272621935811',
        settledFee: '900719925474099',
      }),
      voucher({
        amount: '90071992547409910',
        status: 'Settled',
        settledNet: '89171272621935811',
        settledFee: '900719925474099',
      }),
    ]);

    expect(summary.settled).toBe('180143985094819820');
    expect(summary.fees).toBe('1801439850948198');
    expect(summary.netReceived).toBe('178342545243871622');
  });

  it('returns zeroes for a clinic with no vouchers', () => {
    expect(summariseEarnings([])).toEqual({
      settled: '0',
      settledCount: 0,
      netReceived: '0',
      fees: '0',
      pending: '0',
      pendingCount: 0,
    });
  });
});

describe('monthKey', () => {
  it('buckets by UTC month, not the local timezone', () => {
    // 23:30 on 31 October UTC is already 1 November in UTC+1.
    expect(monthKey('2026-10-31T23:30:00.000Z')).toBe('2026-10');
    expect(monthKey(new Date('2026-01-05T00:00:00.000Z'))).toBe('2026-01');
  });

  it('ignores an unparseable date', () => {
    expect(monthKey('not a date')).toBeNull();
  });
});

describe('monthlyEarnings', () => {
  it('splits settled, pending and fees by funding month, newest first', () => {
    const months = monthlyEarnings([
      voucher({
        amount: '30000000',
        status: 'Settled',
        createdAt: '2026-08-04T10:00:00.000Z',
        settledNet: '29400000',
        settledFee: '600000',
      }),
      voucher({
        amount: '20000000',
        status: 'Claimed',
        createdAt: '2026-09-12T10:00:00.000Z',
      }),
      voucher({
        amount: '50000000',
        status: 'Attested',
        createdAt: '2026-09-28T23:00:00.000Z',
      }),
      voucher({
        amount: '10000000',
        status: 'Refunded',
        createdAt: '2026-07-01T10:00:00.000Z',
      }),
    ]);

    expect(months).toEqual([
      {
        month: '2026-09',
        settled: '0',
        pending: '70000000',
        fees: '0',
        settledCount: 0,
        pendingCount: 2,
      },
      {
        month: '2026-08',
        settled: '30000000',
        pending: '0',
        fees: '600000',
        settledCount: 1,
        pendingCount: 0,
      },
    ]);
  });

  it('omits months with no settled or pending money', () => {
    expect(
      monthlyEarnings([
        voucher({ amount: '10000000', status: 'Funded', createdAt: '2026-06-10T00:00:00.000Z' }),
        voucher({ amount: '20000000', status: 'Refunded', createdAt: '2026-06-11T00:00:00.000Z' }),
      ]),
    ).toEqual([]);
  });

  it('keeps every voucher in the month it was funded, even when it settled later', () => {
    const months = monthlyEarnings([
      voucher({
        amount: '30000000',
        status: 'Settled',
        createdAt: '2026-05-31T23:59:59.000Z',
        settledNet: '29700000',
        settledFee: '300000',
      }),
    ]);

    expect(months).toHaveLength(1);
    expect(months[0].month).toBe('2026-05');
    expect(months[0].settled).toBe('30000000');
  });
});
