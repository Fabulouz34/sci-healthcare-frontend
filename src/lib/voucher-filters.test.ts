import { describe, expect, it } from 'vitest';

import type { Voucher } from './api';
import { filterVouchers, matchesVoucherNumber, statusCounts } from './voucher-filters';

/**
 * Voucher list view state (#32). `/my` and the clinic desk both filter a
 * cached list; a wrong match here either hides the voucher a clerk is
 * holding or shows rows that are not it, so the combinations are pinned.
 */

function voucher(id: string, overrides: Partial<Voucher> = {}): Voucher {
  return {
    id,
    funder: 'GFUNDER',
    beneficiaryRef: 'ab'.repeat(32),
    provider: { address: 'GPROVIDER', name: 'Ikeja General Clinic', country: 'NG' },
    serviceCode: 101,
    serviceLabel: 'Outpatient consult',
    amount: '30000000',
    amountDisplay: '3.00',
    status: 'Funded',
    createdAt: '2026-05-01T10:00:00.000Z',
    expiresAt: '2026-06-01T10:00:00.000Z',
    claimedAt: null,
    attestedAt: null,
    disputeDeadline: null,
    settledNet: null,
    settledFee: null,
    disputeReason: null,
    refundableAt: null,
    isSettleable: false,
    isRefundable: false,
    ...overrides,
  };
}

const LIST = [
  voucher('21'),
  voucher('22', { status: 'Claimed' }),
  voucher('23', { status: 'Claimed' }),
  voucher('204', {
    status: 'Attested',
    provider: { address: 'GOTHER', name: 'Lekki Care Centre', country: 'NG' },
  }),
];

const ids = (vouchers: Voucher[]) => vouchers.map((v) => v.id);

describe('matchesVoucherNumber', () => {
  it('matches an empty search and the printed number with its #', () => {
    expect(matchesVoucherNumber(voucher('21'), '')).toBe(true);
    expect(matchesVoucherNumber(voucher('21'), '   ')).toBe(true);
    expect(matchesVoucherNumber(voucher('21'), '21')).toBe(true);
    expect(matchesVoucherNumber(voucher('21'), '#21')).toBe(true);
    expect(matchesVoucherNumber(voucher('21'), '  # 21 ')).toBe(true);
  });

  it('matches from the start of the number only', () => {
    // A clerk typing 2 is looking for a number that begins with 2.
    expect(matchesVoucherNumber(voucher('204'), '20')).toBe(true);
    expect(matchesVoucherNumber(voucher('21'), '2')).toBe(true);
    // 21 does not begin with 1, so it is not a match for "1".
    expect(matchesVoucherNumber(voucher('21'), '1')).toBe(false);
    expect(matchesVoucherNumber(voucher('21'), '22')).toBe(false);
  });
});

describe('statusCounts', () => {
  it('counts every status, including the ones not present', () => {
    expect(statusCounts(LIST)).toEqual({
      Funded: 1,
      Claimed: 2,
      Attested: 1,
      Settled: 0,
      Disputed: 0,
      Refunded: 0,
    });
  });

  it('is all zeroes for an empty list', () => {
    expect(statusCounts([])).toEqual({
      Funded: 0,
      Claimed: 0,
      Attested: 0,
      Settled: 0,
      Disputed: 0,
      Refunded: 0,
    });
  });
});

describe('filterVouchers', () => {
  it('leaves the list alone when nothing is chosen', () => {
    expect(filterVouchers(LIST, { status: null, clinic: null })).toEqual(LIST);
    expect(
      filterVouchers(LIST, { status: null, clinic: null, search: '  ' }),
    ).toEqual(LIST);
  });

  it('combines status, clinic and voucher number', () => {
    expect(ids(filterVouchers(LIST, { status: 'Claimed', clinic: null }))).toEqual([
      '22',
      '23',
    ]);
    expect(
      ids(filterVouchers(LIST, { status: null, clinic: 'GOTHER', search: '#204' })),
    ).toEqual(['204']);
    expect(ids(filterVouchers(LIST, { status: 'Claimed', clinic: null, search: '2' }))).toEqual([
      '22',
      '23',
    ]);
    // No voucher is both Claimed and a number starting with 1.
    expect(
      filterVouchers(LIST, { status: 'Claimed', clinic: null, search: '1' }),
    ).toEqual([]);
  });

  it('ignores an unknown clinic rather than matching everything to it', () => {
    expect(filterVouchers(LIST, { status: null, clinic: 'GNOWHERE' })).toEqual([]);
  });
});
