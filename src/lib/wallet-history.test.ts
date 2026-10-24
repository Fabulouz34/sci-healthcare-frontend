import { describe, expect, it } from 'vitest';

import type { Voucher, VoucherEvent } from './api';
import {
  attributeActor,
  buildHistoryRows,
  countSignedByWallet,
  eventTimestamp,
  mapWithConcurrency,
  mergeVouchers,
  sortHistoryRows,
  walletRoles,
} from './wallet-history';

/**
 * The wallet's transaction history (#165).
 *
 * The page has to answer "what did this wallet take part in, and what did
 * it sign?", so two things matter here: the order of the rows, and the
 * honesty of the attribution. A row marked as signed by the wallet when it
 * was not is a false claim about a signature, and a row missing from the
 * history is a missing transaction.
 */

const FUNDER = 'GFUNDER';
const PROVIDER = 'GPROVIDER';

function voucher(overrides: Partial<Voucher> = {}): Voucher {
  return {
    id: '1',
    funder: FUNDER,
    beneficiaryRef: 'ab'.repeat(32),
    provider: { address: PROVIDER, name: 'Ikeja General Clinic', country: 'NG' },
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

function event(overrides: Partial<VoucherEvent> & { name: string }): VoucherEvent {
  return {
    id: `${overrides.name}-1`,
    txHash: `TX-${overrides.name.toUpperCase()}`,
    ...overrides,
  };
}

describe('wallet roles', () => {
  it('finds the funder and the clinic of a voucher', () => {
    expect(walletRoles(voucher(), FUNDER)).toEqual(['funder']);
    expect(walletRoles(voucher(), PROVIDER)).toEqual(['provider']);
    expect(walletRoles(voucher(), 'GSTRANGER')).toEqual([]);
  });
});

describe('mergeVouchers', () => {
  it('keeps one copy of a voucher listed twice', () => {
    const merged = mergeVouchers([voucher({ id: '1' })], [voucher({ id: '1' }), voucher({ id: '2' })]);
    expect(merged.map((v) => v.id)).toEqual(['1', '2']);
  });
});

describe('attribution', () => {
  it('marks the events the wallet signed itself', () => {
    expect(attributeActor('funder', ['funder'])).toBe('wallet');
    expect(attributeActor('provider', ['provider'])).toBe('wallet');
  });

  it('keeps the signer of the other party', () => {
    expect(attributeActor('funder', ['provider'])).toBe('funder');
    expect(attributeActor('provider', ['funder'])).toBe('provider');
  });

  it('never claims an attestation, a resolution or a permissionless step', () => {
    // The contract allows anyone to settle or refund, and the indexer does
    // not record who submitted them, so they cannot be attributed.
    expect(attributeActor('anyone', ['funder'])).toBe('anyone');
    expect(attributeActor('admin', ['funder'])).toBe('admin');
    // The voucher does not carry its attester, so an attestation is not the
    // wallet's to claim either.
    expect(attributeActor('attester', ['funder'])).toBe('attester');
  });
});

describe('eventTimestamp', () => {
  it('uses the ledger close time when the indexer sends one', () => {
    const { at, timeMs } = eventTimestamp(
      event({ name: 'voucher_created', closedAt: '2026-05-02T09:00:00.000Z' }),
      voucher(),
    );
    expect(at).toBe('2026-05-02T09:00:00.000Z');
    expect(timeMs).toBe(Date.parse('2026-05-02T09:00:00.000Z'));
  });

  it('falls back to the timestamp the voucher carries for that step', () => {
    const claimed = voucher({ claimedAt: '2026-05-03T10:00:00.000Z' });
    const { at } = eventTimestamp(event({ name: 'voucher_claimed' }), claimed);
    expect(at).toBe('2026-05-03T10:00:00.000Z');
  });

  it('falls back to the creation time of the voucher for a step with no date', () => {
    const { at } = eventTimestamp(event({ name: 'voucher_settled' }), voucher());
    expect(at).toBe('2026-05-01T10:00:00.000Z');
  });
});

describe('buildHistoryRows', () => {
  const funded = voucher({ id: '1' });
  const received = voucher({ id: '2', funder: 'GOTHER', provider: { address: FUNDER, name: 'Ikeja General Clinic', country: 'NG' } });

  it('builds one row per event, with the transaction hash', () => {
    const rows = buildHistoryRows(
      [funded],
      {
        '1': [
          event({ name: 'voucher_created', closedAt: '2026-05-01T10:00:00.000Z' }),
          event({ name: 'voucher_claimed', closedAt: '2026-05-05T10:00:00.000Z' }),
        ],
      },
      FUNDER,
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.label).toBe('Funded');
    expect(rows[0]?.actor).toBe('wallet');
    expect(rows[1]?.label).toBe('Patient seen');
    // The clinic claimed it, not this wallet.
    expect(rows[1]?.actor).toBe('provider');
    expect(rows[1]?.txHash).toBe('TX-VOUCHER_CLAIMED');
  });

  it('skips vouchers the wallet is not part of', () => {
    const rows = buildHistoryRows(
      [voucher({ id: '9', funder: 'GOTHER', provider: { address: 'GOTHER2', name: 'Clinic', country: 'NG' } })],
      { '9': [event({ name: 'voucher_created' })] },
      FUNDER,
    );
    expect(rows).toHaveLength(0);
  });

  it('keeps an event it has no label for, without claiming a signer', () => {
    const rows = buildHistoryRows(
      [funded],
      { '1': [event({ name: 'voucher_expired' })] },
      FUNDER,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe('voucher expired');
    expect(rows[0]?.actor).toBe('unknown');
  });

  it('names the dispute reason on the disputed row', () => {
    const disputed = voucher({ id: '3', disputeReason: 1 });
    const rows = buildHistoryRows(
      [disputed],
      { '3': [event({ name: 'voucher_disputed' })] },
      FUNDER,
    );
    expect(rows[0]?.detail).toContain('The patient was not seen');
    expect(rows[0]?.actor).toBe('wallet');
  });

  it('counts the rows the wallet signed itself', () => {
    const rows = buildHistoryRows(
      [funded, received],
      {
        '1': [event({ name: 'voucher_created' })],
        '2': [event({ name: 'voucher_claimed' })],
      },
      FUNDER,
    );
    expect(countSignedByWallet(rows)).toBe(2);
  });
});

describe('sortHistoryRows', () => {
  const rows = buildHistoryRows(
    [voucher({ id: '1' }), voucher({ id: '2' })],
    {
      '1': [
        event({ name: 'voucher_created', closedAt: '2026-05-01T10:00:00.000Z' }),
        event({ name: 'voucher_claimed', closedAt: '2026-05-05T10:00:00.000Z' }),
      ],
      '2': [event({ name: 'voucher_created', closedAt: '2026-05-03T10:00:00.000Z' })],
    },
    FUNDER,
  );

  it('puts the newest first by default', () => {
    expect(sortHistoryRows(rows).map((r) => r.at)).toEqual([
      '2026-05-05T10:00:00.000Z',
      '2026-05-03T10:00:00.000Z',
      '2026-05-01T10:00:00.000Z',
    ]);
  });

  it('puts the oldest first when asked', () => {
    expect(sortHistoryRows(rows, 'oldest').map((r) => r.at)).toEqual([
      '2026-05-01T10:00:00.000Z',
      '2026-05-03T10:00:00.000Z',
      '2026-05-05T10:00:00.000Z',
    ]);
  });

  it('sorts rows without a usable timestamp last', () => {
    const undated = buildHistoryRows(
      [voucher({ id: '3' })],
      { '3': [event({ name: 'voucher_refunded', closedAt: 'not-a-date' })] },
      FUNDER,
    );
    const merged = sortHistoryRows([...rows, ...undated]);
    expect(merged[merged.length - 1]?.event).toBe('voucher_refunded');
  });
});

describe('mapWithConcurrency', () => {
  it('keeps the order of the input', async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 2);
    expect(out).toEqual([2, 4, 6, 8, 10]);
  });

  it('never runs more than the limit at once', async () => {
    let running = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running -= 1;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });
});
