'use client';

import { useMemo } from 'react';

import useSWR from 'swr';

import { api, type VoucherEvent } from '../api';
import {
  buildHistoryRows,
  countSignedByWallet,
  mapWithConcurrency,
  mergeVouchers,
  sortHistoryRows,
  type HistoryRow,
} from '../wallet-history';
import { useVouchers } from './useData';

/**
 * The connected wallet's transaction history (#165).
 *
 * The indexer has no wallet-scoped event log, so the history is assembled
 * from the vouchers the wallet took part in — the ones it funded and the
 * ones it received as a clinic — and from the event log of each of those.
 * The event logs are read a few at a time, because a clinic can hold
 * hundreds of vouchers and the indexer is a small service.
 */

/** How many vouchers are read per role. */
const PAGE_SIZE = 100;

/** How many event logs are read at the same time. */
const EVENTS_CONCURRENCY = 6;

type EventsResult = {
  /** Event log per voucher id. */
  byVoucher: Record<string, VoucherEvent[]>;
  /** How many event logs could not be read. */
  failed: number;
};

export function useWalletHistory(address: string | null | undefined) {
  const funded = useVouchers(address ? { funder: address, limit: PAGE_SIZE } : null);
  const received = useVouchers(address ? { provider: address, limit: PAGE_SIZE } : null);

  const vouchers = useMemo(
    () => mergeVouchers(funded.vouchers, received.vouchers),
    [funded.vouchers, received.vouchers],
  );

  // The id list is kept as a string so the SWR key below does not change
  // identity on every render — the ids themselves are the cache key.
  const idKey = useMemo(() => vouchers.map((v) => v.id).join(','), [vouchers]);
  const ids = useMemo(() => (idKey ? idKey.split(',') : []), [idKey]);

  const {
    data,
    isLoading: eventsLoading,
    isValidating: eventsValidating,
  } = useSWR<EventsResult>(
    ids.length > 0 ? ['wallet-events', idKey] : null,
    async () => {
      const results = await mapWithConcurrency(ids, EVENTS_CONCURRENCY, async (id) => {
        try {
          return { id, events: await api.voucherEvents(id), failed: false };
        } catch {
          // An indexer that predates the events endpoint answers 404. The
          // history then shows the dates it has, without the on-chain links,
          // instead of failing the whole page.
          return { id, events: [] as VoucherEvent[], failed: true };
        }
      });

      const byVoucher: Record<string, VoucherEvent[]> = {};
      let failed = 0;
      for (const result of results) {
        byVoucher[result.id] = result.events;
        if (result.failed) failed += 1;
      }
      return { byVoucher, failed };
    },
    { shouldRetryOnError: false, keepPreviousData: true },
  );

  const rows = useMemo<HistoryRow[]>(
    () =>
      sortHistoryRows(
        buildHistoryRows(vouchers, data?.byVoucher ?? {}, address ?? ''),
      ),
    [vouchers, data?.byVoucher, address],
  );

  const errorMessage = funded.error ?? received.error ?? null;
  // Every log unreadable means the endpoint is missing, not that the
  // vouchers have no events — the two cases are shown differently.
  const eventsUnavailable = Boolean(data && data.failed > 0 && data.failed === ids.length);
  // The indexer counts more vouchers than one page holds.
  const truncated =
    funded.total > funded.vouchers.length || received.total > received.vouchers.length;

  return {
    rows,
    vouchers,
    signedCount: countSignedByWallet(rows),
    error: errorMessage,
    isLoading: funded.isLoading || received.isLoading || eventsLoading,
    isValidating: eventsValidating,
    eventsUnavailable,
    truncated,
  };
}
