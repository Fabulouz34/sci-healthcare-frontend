/**
 * Earnings arithmetic for the clinic desk (#34).
 *
 * The indexer's clinic statistics endpoint (backend #10) answers counts by
 * status and the gross value of settled care. The clinic's own vouchers
 * carry the net it received (`settledNet`) and the protocol fee it paid
 * (`settledFee`), which is what turns those counts into the cash-flow view
 * the desk needs.
 *
 * Everything here stays in BigInt: amounts are i128 base units carried as
 * decimal strings, and summing them as `Number` would round past 2^53.
 */

/** A voucher, reduced to the fields earnings care about. */
export type EarningsVoucher = {
  amount: string;
  status: string;
  createdAt: string | Date;
  settledNet?: string | null;
  settledFee?: string | null;
};

/**
 * Vouchers whose care has started but whose payout has not landed.
 *
 * A `Funded` voucher is not pending payout: nobody has claimed it yet, and
 * it may still expire and refund. `Settled` has paid, `Refunded` never will.
 */
export const PENDING_PAYOUT_STATUSES = ['Claimed', 'Attested', 'Disputed'] as const;

const PENDING = new Set<string>(PENDING_PAYOUT_STATUSES);

export type ClinicEarnings = {
  /** Gross value of settled care, before the protocol fee. */
  settled: string;
  settledCount: number;
  /** What actually reached the clinic, after fees. */
  netReceived: string;
  /** Protocol fees paid on settled care. */
  fees: string;
  /** Gross value of vouchers claimed, attested or disputed, awaiting payout. */
  pending: string;
  pendingCount: number;
};

export type ClinicEarningsMonth = {
  /** `YYYY-MM`, in UTC. */
  month: string;
  /** Gross value settled in vouchers funded this month. */
  settled: string;
  /** Gross value still awaiting payout on vouchers funded this month. */
  pending: string;
  /** Protocol fees paid on the settled vouchers funded this month. */
  fees: string;
  settledCount: number;
  pendingCount: number;
};

function units(value: string | null | undefined): bigint {
  if (value === null || value === undefined || value === '') return 0n;
  return BigInt(value);
}

/** The fee charged on a settled voucher, from the indexer when it has it. */
function settledFee(voucher: EarningsVoucher): bigint {
  if (voucher.settledFee !== null && voucher.settledFee !== undefined) {
    return units(voucher.settledFee);
  }
  if (voucher.settledNet !== null && voucher.settledNet !== undefined) {
    return units(voucher.amount) - units(voucher.settledNet);
  }
  // A pre-fee indexer row: no fee data, so report the gross as received
  // rather than inventing a charge.
  return 0n;
}

/** What reached the clinic: the indexed net, or gross minus the fee. */
function settledNet(voucher: EarningsVoucher, fee: bigint): bigint {
  if (voucher.settledNet !== null && voucher.settledNet !== undefined) {
    return units(voucher.settledNet);
  }
  return units(voucher.amount) - fee;
}

/** `YYYY-MM` for a timestamp, in UTC so a clinic's month does not shift. */
export function monthKey(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}`;
}

/**
 * Totals across every voucher a clinic has received.
 *
 * `settled` is gross, so it can be compared with the statistics endpoint's
 * `settledValue`; `fees` and `netReceived` explain the difference.
 */
export function summariseEarnings(vouchers: EarningsVoucher[]): ClinicEarnings {
  let settled = 0n;
  let netReceived = 0n;
  let fees = 0n;
  let pending = 0n;
  let settledCount = 0;
  let pendingCount = 0;

  for (const voucher of vouchers) {
    const amount = units(voucher.amount);
    if (voucher.status === 'Settled') {
      const fee = settledFee(voucher);
      settled += amount;
      fees += fee;
      netReceived += settledNet(voucher, fee);
      settledCount += 1;
    } else if (PENDING.has(voucher.status)) {
      pending += amount;
      pendingCount += 1;
    }
  }

  return {
    settled: settled.toString(),
    settledCount,
    netReceived: netReceived.toString(),
    fees: fees.toString(),
    pending: pending.toString(),
    pendingCount,
  };
}

/**
 * The same split, one row per month the vouchers were funded in.
 *
 * Vouchers are grouped by `createdAt`, the only date the list route carries:
 * a settled voucher has no settlement timestamp until its receipt is read.
 * The page says so, rather than implying a cash-received month. Newest first,
 * and months with neither settled nor pending money are omitted — a row of
 * zeros adds nothing to a cash-flow table.
 */
export function monthlyEarnings(vouchers: EarningsVoucher[]): ClinicEarningsMonth[] {
  const months = new Map<
    string,
    { settled: bigint; pending: bigint; fees: bigint; settledCount: number; pendingCount: number }
  >();

  for (const voucher of vouchers) {
    const key = monthKey(voucher.createdAt);
    if (!key) continue;
    const amount = units(voucher.amount);
    const row =
      months.get(key) ??
      { settled: 0n, pending: 0n, fees: 0n, settledCount: 0, pendingCount: 0 };

    if (voucher.status === 'Settled') {
      row.settled += amount;
      row.fees += settledFee(voucher);
      row.settledCount += 1;
    } else if (PENDING.has(voucher.status)) {
      row.pending += amount;
      row.pendingCount += 1;
    } else {
      continue;
    }
    months.set(key, row);
  }

  return [...months.entries()]
    .filter(([, row]) => row.settled > 0n || row.pending > 0n)
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([month, row]) => ({
      month,
      settled: row.settled.toString(),
      pending: row.pending.toString(),
      fees: row.fees.toString(),
      settledCount: row.settledCount,
      pendingCount: row.pendingCount,
    }));
}
