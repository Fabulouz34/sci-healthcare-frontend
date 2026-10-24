import type { Voucher, VoucherEvent } from './api';
import { disputeReasonLabel } from './disputes';

/**
 * The connected wallet's transaction history (#165).
 *
 * The indexer publishes one event log per voucher (`GET /vouchers/:id/events`,
 * backend #13) and no wallet-scoped one, so the history of a wallet is
 * assembled from the logs of the vouchers it is part of: the ones it funded
 * and the ones it received as a clinic. Every row keeps the hash of the
 * transaction that emitted the event, so each line can be verified on Stellar
 * Explorer.
 *
 * This module holds the parts that need no network: reading the roles a
 * wallet has in a voucher, deciding who signed an event, and turning the
 * event logs into ordered rows. The fetching lives in
 * `src/lib/hooks/useWalletHistory.ts`.
 */

/** How the connected wallet relates to a voucher. */
export type WalletRole = 'funder' | 'provider';

/**
 * Who signs the transaction behind a contract event.
 *
 * The actors mirror the contract's own authorisation rules (see
 * `src/lib/protocol.ts`): funding, claiming and disputing are signed by that
 * party, attesting is done by an attester, disputes are resolved by an
 * administrator, and settling and refunding are permissionless — anyone may
 * submit them, so their signer is not recorded where the indexer can see it.
 */
export type EventActorKind =
  | 'funder'
  | 'provider'
  | 'attester'
  | 'admin'
  | 'anyone'
  | 'unknown';

/**
 * The signer of an event, as far as the data allows.
 *
 * `wallet` means the event is provably signed by the connected wallet.
 */
export type EventActor = EventActorKind | 'wallet';

/** One line of the wallet's transaction history. */
export type HistoryRow = {
  /** Stable key: one row per event, not per voucher. */
  key: string;
  /** Contract event name, e.g. `voucher_created`. */
  event: string;
  /** Short title of the step. */
  label: string;
  /** One line describing what happened. */
  detail: string;
  /** When the event was closed, when the indexer says so. */
  at: string | null;
  /** Sort key; events without a usable timestamp sort last. */
  timeMs: number;
  /** Ledger the event was closed in. */
  ledger: number | null;
  /** Hash of the transaction that emitted the event. */
  txHash: string | null;
  /** The voucher this event belongs to. */
  voucherId: string;
  /** Clinic the voucher was paid to. */
  clinicName: string;
  /** Service the voucher was paid for. */
  serviceLabel: string;
  /** Amount in USDC, in stroops. */
  amount: string;
  /** Amount in USDC, already formatted for display. */
  amountDisplay: string;
  /** The roles the connected wallet has in this voucher. */
  roles: WalletRole[];
  /** Who signed the transaction behind the event. */
  actor: EventActor;
  /** Human label for {@link actor}. */
  actorLabel: string;
};

/** Order the rows are shown in. */
export type HistoryOrder = 'newest' | 'oldest';

type EventMeta = {
  label: string;
  detail: string;
  actor: EventActorKind;
};

/**
 * Contract events, and who signs the transaction behind them.
 *
 * Labels and wording match the voucher timeline (`src/lib/timeline.ts`), so
 * the same step reads the same way wherever it is shown.
 */
const EVENT_META: Record<string, EventMeta> = {
  voucher_created: {
    label: 'Funded',
    detail: 'USDC moved into escrow',
    actor: 'funder',
  },
  voucher_claimed: {
    label: 'Patient seen',
    detail: 'Clinic claimed the voucher',
    actor: 'provider',
  },
  voucher_attested: {
    label: 'Care confirmed',
    detail: 'An independent attester confirmed delivery',
    actor: 'attester',
  },
  voucher_disputed: {
    label: 'Disputed',
    detail: 'The funder disputed the care',
    actor: 'funder',
  },
  dispute_resolved: {
    label: 'Dispute resolved',
    detail: 'An administrator resolved the dispute',
    actor: 'admin',
  },
  voucher_settled: {
    label: 'Clinic paid',
    detail: 'Escrow released and a care receipt minted',
    actor: 'anyone',
  },
  voucher_refunded: {
    label: 'Refunded',
    detail: 'Full amount returned to the funder',
    actor: 'anyone',
  },
};

/**
 * What the history says about the signer of each event.
 *
 * The indexer records who *is affected* by an event, not who submitted the
 * transaction, so a line is only marked as signed by the wallet when the
 * contract's own rules make that certain. Settles and refunds stay
 * unattributed: they are permissionless, so the address that paid for them
 * is not in the event log.
 */
export const ACTOR_LABELS: Record<EventActor, string> = {
  wallet: 'Signed by you',
  funder: 'Signed by the funder',
  provider: 'Signed by the clinic',
  attester: 'Signed by an attester',
  admin: 'Signed by an administrator',
  anyone: 'Anyone can submit this — the signer is not recorded',
  unknown: 'Signer not recorded',
};

/** The roles the connected wallet has in a voucher. */
export function walletRoles(voucher: Voucher, address: string): WalletRole[] {
  const roles: WalletRole[] = [];
  if (voucher.funder === address) roles.push('funder');
  if (voucher.provider?.address === address) roles.push('provider');
  return roles;
}

/**
 * Decides whether an event was signed by the connected wallet.
 *
 * Only the funder-signed and clinic-signed events can be attributed from
 * the data at hand. Attestations carry no attester address and the settle
 * and refund transactions are permissionless, so those keep their own actor.
 */
export function attributeActor(actor: EventActorKind, roles: WalletRole[]): EventActor {
  if (actor === 'funder') return roles.includes('funder') ? 'wallet' : 'funder';
  if (actor === 'provider') return roles.includes('provider') ? 'wallet' : 'provider';
  return actor;
}

/**
 * When an event happened.
 *
 * The indexer closes each event with a ledger timestamp, which is the time
 * shown. Older indexers do not send one, so the voucher's own timestamp for
 * that step is used instead — the same dates the voucher timeline shows.
 */
export function eventTimestamp(
  event: VoucherEvent,
  voucher: Voucher,
): { at: string | null; timeMs: number } {
  const name = event.name?.trim().toLowerCase() ?? '';
  const fromVoucher =
    name === 'voucher_created'
      ? voucher.createdAt
      : name === 'voucher_claimed'
        ? voucher.claimedAt
        : name === 'voucher_attested'
          ? voucher.attestedAt
          : name === 'voucher_refunded'
            ? voucher.disputeResolvedAt ?? voucher.refundableAt
            : name === 'dispute_resolved'
              ? voucher.disputeResolvedAt
              : null;

  const at = event.closedAt ?? toIso(fromVoucher) ?? toIso(voucher.createdAt);
  const parsed = at ? Date.parse(at) : Number.NaN;
  return { at: at ?? null, timeMs: Number.isNaN(parsed) ? 0 : parsed };
}

/** The indexer sends timestamps as strings; a parsed date is normalised back. */
function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.toISOString();
}

/**
 * Merges voucher lists into one, without duplicates.
 *
 * A wallet can be the funder of one voucher and the clinic of another, so
 * the page queries both roles and joins the results. The same voucher can
 * also come back twice — a backend that ignores the role filter answers
 * every query with the same list — so rows are keyed by voucher id.
 */
export function mergeVouchers(...lists: Voucher[][]): Voucher[] {
  const byId = new Map<string, Voucher>();
  for (const list of lists) {
    for (const voucher of list) {
      if (!voucher?.id) continue;
      if (!byId.has(voucher.id)) byId.set(voucher.id, voucher);
    }
  }
  return [...byId.values()];
}

/**
 * Turns the event logs of a wallet's vouchers into one ordered history.
 *
 * Vouchers the wallet is neither the funder nor the clinic of are skipped,
 * as are events the indexer reports without a name. Every remaining event
 * becomes a row, whether or not the wallet signed it: the page answers "what
 * did this wallet take part in", and each row says who signed it.
 */
export function buildHistoryRows(
  vouchers: Voucher[],
  eventsByVoucher: Record<string, VoucherEvent[]>,
  address: string,
): HistoryRow[] {
  const rows: HistoryRow[] = [];

  for (const voucher of vouchers) {
    const roles = walletRoles(voucher, address);
    if (roles.length === 0) continue;

    for (const event of eventsByVoucher[voucher.id] ?? []) {
      if (!event || typeof event.name !== 'string') continue;

      const name = event.name.trim().toLowerCase();
      const meta = EVENT_META[name];
      const actor = meta ? attributeActor(meta.actor, roles) : 'unknown';
      const { at, timeMs } = eventTimestamp(event, voucher);
      const fallbackLabel = name.replaceAll('_', ' ');
      const detail =
        name === 'voucher_disputed'
          ? `${disputeReasonLabel(voucher.disputeReason) ?? 'Reason not given'}. The funder disputed the care.`
          : (meta?.detail ?? fallbackLabel);

      rows.push({
        key: `${voucher.id}:${event.id ?? name}:${event.txHash ?? ''}`,
        event: name,
        label: meta?.label ?? fallbackLabel,
        detail,
        at,
        timeMs,
        ledger: typeof event.ledger === 'number' ? event.ledger : null,
        txHash: typeof event.txHash === 'string' && event.txHash ? event.txHash : null,
        voucherId: voucher.id,
        clinicName: voucher.provider?.name ?? '',
        serviceLabel: voucher.serviceLabel ?? `Service ${voucher.serviceCode}`,
        amount: voucher.amount,
        amountDisplay: voucher.amountDisplay,
        roles,
        actor,
        actorLabel: ACTOR_LABELS[actor],
      });
    }
  }

  return rows;
}

/**
 * Orders rows by time, newest first unless asked otherwise.
 *
 * Events without a usable timestamp sort last in both directions, so a
 * row the indexer dated badly never floats to the top of the history.
 * Ties are broken by ledger, then voucher and event name, so the order does
 * not depend on how the events came back from the network.
 */
export function sortHistoryRows(
  rows: HistoryRow[],
  order: HistoryOrder = 'newest',
): HistoryRow[] {
  const direction = order === 'oldest' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (a.timeMs !== b.timeMs) return (a.timeMs - b.timeMs) * direction;
    const aLedger = a.ledger ?? 0;
    const bLedger = b.ledger ?? 0;
    if (aLedger !== bLedger) return (aLedger - bLedger) * direction;
    if (a.voucherId !== b.voucherId) return a.voucherId < b.voucherId ? -1 : 1;
    if (a.event !== b.event) return a.event < b.event ? -1 : 1;
    return 0;
  });
}

/** How many rows the connected wallet signed itself. */
export function countSignedByWallet(rows: HistoryRow[]): number {
  return rows.filter((row) => row.actor === 'wallet').length;
}

/**
 * Runs a task over many items with a bounded number in flight.
 *
 * The wallet's history reads one event log per voucher, and a clinic can
 * hold hundreds of vouchers. Firing all of those requests at once would
 * flood the indexer — and a metered connection — so they are read a few at
 * a time instead. The results keep the order of the input.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const size = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  const workers = Array.from({ length: size }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await task(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}
