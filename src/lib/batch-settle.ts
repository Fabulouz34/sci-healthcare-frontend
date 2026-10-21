/**
 * Rules for settling every due voucher in one go (clinic desk).
 *
 * A clinic with many vouchers past their dispute window should not have to
 * press "Release payment" once per row. These helpers are pure so the two
 * decisions involved are unit-tested without a wallet, a network or a DOM:
 * which vouchers are due, and whether the deployed contract can settle them
 * in a single write.
 */

/**
 * Method names a batch-settle-aware voucher contract may expose
 * (contracts #4). The deployed contract need not have any of them — batch
 * settle is an optional upgrade — so this is a probe, not an assumption.
 */
export const BATCH_SETTLE_METHODS = ['settle_many', 'settle_batch', 'batch_settle'] as const;

/**
 * The vouchers the contract will accept `settle` for right now, in list
 * order. `isSettleable` comes from the indexer and already accounts for the
 * dispute window, so everything else is left untouched.
 */
export function settleableVouchers<T extends { isSettleable: boolean }>(
  vouchers: readonly T[],
): T[] {
  return vouchers.filter((v) => v.isSettleable);
}

/**
 * The first batch-settle method present in the contract's spec, or null when
 * it only offers the single `settle`. Callers fall back to one write per
 * voucher, which is what a contract without #4 requires.
 */
export function batchSettleMethod(functions: readonly string[]): string | null {
  return BATCH_SETTLE_METHODS.find((method) => functions.includes(method)) ?? null;
}
