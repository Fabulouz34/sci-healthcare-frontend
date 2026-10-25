import {
  ApiError,
  createClient,
  type Attester,
  type DailyStats,
  type ListProvidersParams,
  type ListVouchersParams,
  type Provider,
  type ReadyStatus,
  type Receipt,
  type ServiceCatalogueItem,
  type ServicesResponse,
  type Stats,
  type VersionInfo,
  type Voucher as ClientVoucher,
  type VoucherStatus,
} from '@sci-healthcare/client';

import { config } from './config';

/**
 * Typed read model served by the indexer. Never used for writes.
 *
 * The models and the HTTP client come from `@sci-healthcare/client`, which is
 * generated from the backend's OpenAPI contract, so a route or field change
 * in the indexer reaches this app as a type error instead of a runtime 404.
 */
export {
  ApiError,
  providerLocation,
  type Attester,
  type DailyBucket,
  type DailyRow,
  type DailyStats,
  type ListProvidersParams,
  type ListVouchersParams,
  type Provider,
  type ProviderLocation,
  type ReadyStatus,
  type Receipt,
  type ReceiptsResponse,
  type Service,
  type ServiceCatalogueItem,
  type ServicesResponse,
  type Stats,
  type VersionInfo,
  type VoucherStatus,
  type VouchersResponse,
} from '@sci-healthcare/client';

/**
 * Deadline for a read that a page render is waiting on: the
 * `generateMetadata` behind a shared voucher or clinic link. The indexer host
 * sleeps when idle and can take 30–60s to wake, so a preview fetch gives up
 * quickly and the page falls back to the default title instead of hanging on
 * a cold API.
 */
export const METADATA_TIMEOUT_MS = 4_000;

/**
 * Dispute-resolution fields returned by the indexer (#47) that the generated
 * client does not describe yet. Kept as an extension of the shared model so
 * the rest of the voucher shape still comes from one place; delete this once
 * the OpenAPI schema publishes them.
 */
export type Voucher = ClientVoucher & {
  /** When resolved, whether the dispute resulted in settlement or refund. */
  disputeOutcome?: 'Settled' | 'Refunded' | string | null;
  /** Timestamp when the dispute was resolved by an administrator. */
  disputeResolvedAt?: string | null;
};

/** A voucher plus the receipt minted when it settled (`null` until then). */
export type VoucherDetail = Voucher & { receipt: Receipt | null };

/**
 * One row of the indexer's append-only contract-event log (backend #13).
 *
 * Every processed event is stored once, in ledger order, with the hash of
 * the transaction that emitted it — the raw material for linking a
 * timeline step to Stellar Expert (#18). The generated client does not
 * expose this endpoint yet, so the shape stays local until it does.
 */
export type VoucherEvent = {
  /** RPC event id; unique, and the indexer is idempotent on it. */
  id?: string | number;
  /** Address of the contract that emitted the event. */
  contract?: string;
  /** Event name as decoded from the topic, e.g. `voucher_created`. */
  name: string;
  /** Ledger the event was closed in; rows come back in this order. */
  ledger?: number;
  /** Hash of the transaction that emitted the event. */
  txHash: string;
  /** Ledger close time of the event. */
  closedAt?: string;
  /** The voucher this event belongs to, when the event carries one. */
  voucherId?: string | number | null;
  /** Decoded payload; addresses and amounts are strings, never numbers. */
  data?: Record<string, unknown> | null;
};

/**
 * A clinic's own throughput (`GET /providers/:address/stats`, backend #10).
 *
 * Counts are returned for every voucher status, zero included, so the desk
 * can render the full breakdown without filling gaps itself. The settled
 * value is the gross escrow released on settled care; the net the clinic
 * received and the fee it paid live on each voucher (`settledNet`,
 * `settledFee`).
 *
 * The endpoint is not in the vendored generated client yet, so the shape is
 * declared locally and fetched through `rawGet`, like the attester routes.
 */
export type ProviderStats = {
  address: string;
  name: string;
  status: string;
  vouchers: number;
  byStatus: Record<VoucherStatus, number>;
  settledVouchers: number;
  settledValue: string;
  settledValueDisplay?: string;
};

/**
 * Normalises the payload of `GET /vouchers/:id/events` into a plain list.
 *
 * The endpoint is new (backend #13) and its envelope is not settled yet,
 * so both shapes are accepted: a bare array, or an object carrying
 * `events`. Anything else — a 404 body from an indexer that predates the
 * endpoint, an empty object, a stray non-event row — becomes an empty
 * list, and the caller shows a timeline without links rather than an
 * error (#18).
 */
export function parseVoucherEvents(body: unknown): VoucherEvent[] {
  const list: unknown[] = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && Array.isArray((body as { events?: unknown }).events)
      ? (body as { events: unknown[] }).events
      : [];

  return list.filter(
    (e): e is VoucherEvent =>
      !!e &&
      typeof e === 'object' &&
      typeof (e as VoucherEvent).name === 'string' &&
      typeof (e as VoucherEvent).txHash === 'string' &&
      (e as VoucherEvent).txHash.length > 0,
  );
}

/**
 * True for a `GET /ready` body, whichever HTTP status it came with.
 *
 * A readiness probe conventionally answers 503 when degraded, with the same
 * body — and that body is the useful part: it says which check failed.
 */
export function isReadyStatus(body: unknown): body is ReadyStatus {
  if (!body || typeof body !== 'object') return false;
  const { status, checks } = body as { status?: unknown; checks?: unknown };
  return (
    (status === 'ready' || status === 'degraded') &&
    !!checks &&
    typeof checks === 'object'
  );
}

/** The shared client, pointed at the configured indexer. */
const client = createClient({ baseUrl: config.apiUrl });

/**
 * A client whose reads carry a deadline.
 *
 * `Client` takes its fetch implementation per client rather than per call,
 * so a caller that passes an abort signal (the link-preview layouts) gets a
 * small per-request client instead of the shared one. Reads like that happen
 * while a page is waiting, where an unbounded fetch is worse than a second
 * client.
 */
function timedClient(signal?: AbortSignal | null) {
  if (!signal) return client;
  return createClient({
    baseUrl: config.apiUrl,
    fetch: (input, init) => fetch(input, { ...init, signal }),
  });
}

type AttestersResponse = {
  total: number;
  limit: number;
  offset: number;
  attesters: Attester[];
};

export const api = {
  /**
   * Indexer readiness: database, indexed ledger and lag (#168).
   *
   * Fetched directly rather than through the shared client, whose error
   * handling would discard the body of a degraded (503) answer. Anything
   * that is not a readiness body — an unreachable host, a proxy error page —
   * still throws, and the status page reports the API as unreachable.
   */
  ready: async (): Promise<ReadyStatus> => {
    const base = config.apiUrl.replace(/\/+$/, '');
    let res: Response;
    try {
      res = await fetch(`${base}/ready`, { headers: { accept: 'application/json' } });
    } catch (cause) {
      throw new ApiError(0, 'network_error', `Cannot reach the API at ${base}`, cause);
    }
    const body: unknown = await res.json().catch(() => null);
    if (isReadyStatus(body)) return body;
    throw new ApiError(res.status, `http_${res.status}`, res.statusText || 'Readiness check failed');
  },

  /** Build version, commit and network the indexer is running (#168). */
  version: (): Promise<VersionInfo> => client.version(),

  stats: (): Promise<Stats> => client.stats(),

  dailyStats: (days = 30): Promise<DailyStats> => client.dailyStats(days),

  providers: (params?: ListProvidersParams) => client.providers(params),

  provider: (address: string, init?: RequestInit): Promise<Provider> =>
    timedClient(init?.signal).provider(address),

  /** Aggregate voucher counts and settled value for one clinic (backend #10). */
  providerStats: (address: string): Promise<ProviderStats> =>
    client.rawGet<ProviderStats>(`/providers/${encodeURIComponent(address)}/stats`),

  vouchers: (params: ListVouchersParams) => client.vouchers(params),

  /**
   * Every voucher received by a clinic, across list-route pages.
   *
   * The monthly earnings table needs the whole history, not the first page,
   * and `/vouchers` caps a page at 100 rows. The walk stops on a short page
   * or when the reported total is reached. `total` is read per page because
   * a write can land mid-walk; either boundary still yields a complete list
   * of what existed when the walk began, and SWR refetches on focus/live
   * updates anyway.
   */
  providerVouchers: async (address: string): Promise<Voucher[]> => {
    const pageSize = 100;
    const all: Voucher[] = [];
    for (;;) {
      const page = await client.vouchers({
        provider: address,
        limit: pageSize,
        offset: all.length,
      });
      all.push(...page.vouchers);
      if (
        page.vouchers.length < pageSize ||
        (typeof page.total === 'number' && all.length >= page.total)
      ) {
        return all;
      }
    }
  },

  voucher: async (id: string, init?: RequestInit): Promise<VoucherDetail> => {
    const voucher = await timedClient(init?.signal).voucher(id);
    return { ...voucher, receipt: voucher.receipt ?? null };
  },

  /**
   * A voucher's on-chain event log, in ledger order (#18, backend #13).
   *
   * Throws when the endpoint is unavailable — an indexer that predates it
   * answers 404 — and callers are expected to treat that as "no links",
   * not as a failure of the page.
   */
  voucherEvents: async (id: string, init?: RequestInit): Promise<VoucherEvent[]> =>
    parseVoucherEvents(
      await timedClient(init?.signal).rawGet<unknown>(
        `/vouchers/${encodeURIComponent(id)}/events`,
      ),
    ),

  receipts: (beneficiaryRef: string, params?: { limit?: number; offset?: number }) =>
    client.receipts({ beneficiaryRef, ...params }),

  /**
   * Attester directory. Not part of the generated client yet, so it goes
   * through `rawGet` with the documented response envelope.
   */
  attesters: (params?: { all?: boolean; limit?: number; offset?: number }) =>
    client.rawGet<AttestersResponse>('/attesters', {
      all: params?.all ? 'true' : 'false',
      limit: params?.limit,
      offset: params?.offset,
    }),

  attester: (address: string): Promise<Attester> =>
    client.rawGet<Attester>(`/attesters/${encodeURIComponent(address)}`),

  services: (): Promise<ServicesResponse> => client.services(),

  service: (code: number): Promise<ServiceCatalogueItem> => client.service(code),
};
