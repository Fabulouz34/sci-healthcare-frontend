import { describe, expect, it } from 'vitest';

import { BATCH_SETTLE_METHODS, batchSettleMethod, settleableVouchers } from './batch-settle';

/**
 * Settle-all rules for the clinic desk. Only vouchers the indexer marks
 * settleable may be written, and a batch write is used only when the
 * contract spec actually has the method (contracts #4 is optional).
 */

const vouchers = [
  { id: '1', isSettleable: true },
  { id: '2', isSettleable: false },
  { id: '3', isSettleable: true },
];

describe('settleableVouchers', () => {
  it('keeps only vouchers past their dispute window, in list order', () => {
    expect(settleableVouchers(vouchers).map((v) => v.id)).toEqual(['1', '3']);
  });

  it('leaves non-settleable vouchers untouched', () => {
    const result = settleableVouchers(vouchers);
    expect(result).not.toContainEqual({ id: '2', isSettleable: false });
  });

  it('handles an empty list and a list with nothing due', () => {
    expect(settleableVouchers([])).toEqual([]);
    expect(settleableVouchers([{ id: '9', isSettleable: false }])).toEqual([]);
  });
});

describe('batchSettleMethod', () => {
  it('finds each supported batch method', () => {
    for (const method of BATCH_SETTLE_METHODS) {
      expect(batchSettleMethod(['claim', method, 'settle'])).toBe(method);
    }
  });

  it('returns null when the contract only has the single settle', () => {
    // Today's deployed spec: batch settle (contracts #4) is not there, so the
    // caller settles one voucher per write.
    expect(batchSettleMethod(['claim', 'attest', 'settle', 'refund'])).toBeNull();
    expect(batchSettleMethod([])).toBeNull();
  });

  it('does not mistake a similar name for the batch method', () => {
    expect(batchSettleMethod(['settle', 'settle_one', 'settled_many'])).toBeNull();
  });
});
