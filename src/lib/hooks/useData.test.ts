// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { cache } from 'swr/_internal';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  invalidateProvider,
  invalidateVouchers,
  useAttesters,
  useDailyStats,
  useIsAttester,
  useProvider,
  useProviders,
  useReceipts,
  useStats,
  useVoucher,
  useVoucherEvents,
  useVouchers,
} from './useData';
import { ApiError } from '../api';

/**
 * Data hooks (#152).
 *
 * Every hook in `useData` is driven by SWR against the shared indexer
 * client. The tests mock `fetch` at the boundary, so they exercise the real
 * client — URL, status handling and `ApiError` — rather than stubbing the
 * hook's own module. Each suite covers the success path, an HTTP error with
 * its status, and a revalidation: either the `mutate` the hook returns or
 * the invalidation helper a write calls.
 *
 * `fetch` is replaced in `vi.hoisted` so the client in `../api` binds the
 * mock at module import time.
 */
const fetchMock = vi.hoisted(() => {
  const mock = vi.fn();
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
});

const registryIsAttester = vi.hoisted(() => vi.fn());
vi.mock('../protocol', () => ({
  registry: { isAttester: registryIsAttester },
}));

const FUNDER = 'GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR';
const PROVIDER = 'GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U';
const PATIENT_REF = 'ab'.repeat(32);

type JsonReply = { body: unknown; status?: number };

/** Routes a mocked fetch by pathname; an unexpected path fails loudly. */
function respond(handler: (url: URL) => JsonReply): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url,
    );
    const reply = handler(url);
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

function error(status: number, message: string, code = `http_${status}`): JsonReply {
  return { status, body: { error: code, message } };
}

const voucher = (status = 'Claimed') => ({
  id: '7',
  funder: FUNDER,
  beneficiaryRef: PATIENT_REF,
  provider: { address: PROVIDER, name: 'Ikeja General Clinic', country: 'NG' },
  serviceCode: 101,
  serviceLabel: 'Outpatient consult',
  amount: '30000000',
  amountDisplay: '3.00',
  status,
  createdAt: '2026-05-20T10:00:00.000Z',
  expiresAt: '2026-06-19T10:00:00.000Z',
  claimedAt: '2026-05-22T10:00:00.000Z',
  attestedAt: null,
  disputeDeadline: null,
  settledNet: null,
  settledFee: null,
  refundableAt: null,
  isSettleable: false,
  isRefundable: false,
  receipt: {
    voucherId: '7',
    providerAddress: PROVIDER,
    providerName: 'Ikeja General Clinic',
    providerCountry: 'NG',
    serviceCode: 101,
    serviceLabel: 'Outpatient consult',
    amount: '30000000',
    amountDisplay: '3.00',
    settledAt: '2026-05-22T10:00:00.000Z',
  },
});

const provider = {
  address: PROVIDER,
  name: 'Ikeja General Clinic',
  country: 'NG',
  status: 'Active',
  registeredAt: '2026-04-01T00:00:00.000Z',
  services: [
    {
      code: 101,
      label: 'Outpatient consult',
      price: '30000000',
      priceDisplay: '3.00',
      active: true,
    },
  ],
};

const stats = {
  providers: 1,
  activeProviders: 1,
  vouchers: 2,
  settledVouchers: 1,
  settledValue: '30000000',
  receipts: 1,
};

const dailyStats = {
  days: 7,
  from: '2026-05-16T00:00:00.000Z',
  to: '2026-06-15T00:00:00.000Z',
  series: [
    {
      date: '2026-06-01',
      funded: { count: 1, amount: '30000000' },
      settled: { count: 1, amount: '30000000' },
      refunded: { count: 0, amount: '0' },
    },
  ],
};

const attesters = {
  total: 1,
  limit: 50,
  offset: 0,
  attesters: [
    {
      address: FUNDER,
      active: true,
      addedAt: '2026-01-15T10:00:00.000Z',
      removedAt: null,
      attestations: 14,
      name: 'Red Cross Clinical Inspector',
      organisation: 'International Medical Verification',
    },
  ],
};

const receipts = {
  total: 1,
  totalSpendDisplay: '3.00',
  receipts: [voucher().receipt],
};

beforeEach(async () => {
  // Start every test from an empty SWR cache and a fresh fetch mock.
  cleanup();
  for (const key of [...cache.keys()]) cache.delete(key);
  fetchMock.mockReset();
  registryIsAttester.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('useVoucher', () => {
  it('loads a voucher and its receipt', async () => {
    respond(() => ({ body: voucher() }));
    const { result } = renderHook(() =>
      useVoucher('7', { dedupingInterval: 0 }),
    );

    await waitFor(() => expect(result.current.voucher?.id).toBe('7'));
    expect(result.current.receipt?.voucherId).toBe('7');
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/vouchers/7');
  });

  it('surfaces an HTTP error with its status', async () => {
    respond(() => error(404, 'Voucher not found'));
    const { result } = renderHook(() => useVoucher('missing'));

    await waitFor(() => expect(result.current.error).toBe('Voucher not found'));
    expect(result.current.voucher).toBeNull();
    expect(result.current.rawError).toBeInstanceOf(ApiError);
    expect((result.current.rawError as ApiError).status).toBe(404);
  });

  it('refetches after a write invalidates the voucher', async () => {
    let reads = 0;
    respond(() => {
      reads += 1;
      return { body: voucher(reads === 1 ? 'Claimed' : 'Settled') };
    });
    const { result } = renderHook(() =>
      useVoucher('7', { dedupingInterval: 0 }),
    );

    await waitFor(() => expect(result.current.voucher?.status).toBe('Claimed'));
    await act(async () => {
      await invalidateVouchers();
    });
    await waitFor(() => expect(result.current.voucher?.status).toBe('Settled'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not fetch when the id is null', () => {
    const { result } = renderHook(() => useVoucher(null));
    expect(result.current.voucher).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('useVoucherEvents', () => {
  it('loads the event log', async () => {
    respond(() => ({
      body: {
        total: 1,
        events: [
          {
            id: '0-1',
            name: 'voucher_claimed',
            txHash: 'HASHCLAIM',
            voucherId: '7',
          },
        ],
      },
    }));
    const { result } = renderHook(() => useVoucherEvents('ev-success'));

    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].txHash).toBe('HASHCLAIM');
    expect(result.current.error).toBeNull();
  });

  it('treats an unavailable endpoint as no events, not a failure', async () => {
    respond(() => error(404, 'Not found'));
    const { result } = renderHook(() => useVoucherEvents('ev-404'));

    await waitFor(() => expect(result.current.error).toBe('Not found'));
    expect(result.current.events).toEqual([]);
    // shouldRetryOnError is off for the optional endpoint.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches after a voucher write invalidates the event log', async () => {
    let reads = 0;
    respond(() => {
      reads += 1;
      return {
        body: [
          {
            id: `0-${reads}`,
            name: reads === 1 ? 'voucher_created' : 'voucher_claimed',
            txHash: `HASH${reads}`,
            voucherId: '7',
          },
        ],
      };
    });
    const { result } = renderHook(() => useVoucherEvents('ev-refetch'));

    await waitFor(() => expect(result.current.events[0].name).toBe('voucher_created'));
    await act(async () => {
      await invalidateVouchers();
    });
    await waitFor(() => expect(result.current.events[0].name).toBe('voucher_claimed'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('useVouchers', () => {
  it('loads a filtered list and its total', async () => {
    respond(() => ({ body: { total: 1, vouchers: [voucher()] } }));
    const { result } = renderHook(() =>
      useVouchers({ funder: FUNDER }, { dedupingInterval: 0 }),
    );

    await waitFor(() => expect(result.current.vouchers).toHaveLength(1));
    expect(result.current.total).toBe(1);
    expect(result.current.error).toBeNull();
    expect(String(fetchMock.mock.calls[0][0])).toContain(`funder=${FUNDER}`);
  });

  it('surfaces an HTTP error with its status', async () => {
    respond(() => error(500, 'Indexer unavailable'));
    const { result } = renderHook(() => useVouchers({ funder: FUNDER }));

    await waitFor(() => expect(result.current.error).toBe('Indexer unavailable'));
    expect((result.current.rawError as ApiError).status).toBe(500);
    expect(result.current.vouchers).toEqual([]);
    expect(result.current.total).toBe(0);
  });

  it('refetches when the caller mutates after a write', async () => {
    let reads = 0;
    respond(() => {
      reads += 1;
      return { body: { total: reads, vouchers: [voucher()] } };
    });
    const { result } = renderHook(() =>
      useVouchers({ funder: FUNDER }, { dedupingInterval: 0 }),
    );

    await waitFor(() => expect(result.current.total).toBe(1));
    await act(async () => {
      await result.current.mutate();
    });
    await waitFor(() => expect(result.current.total).toBe(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not fetch when params are null', () => {
    const { result } = renderHook(() => useVouchers(null));
    expect(result.current.vouchers).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('useProvider', () => {
  it('loads a provider profile', async () => {
    respond(() => ({ body: provider }));
    const { result } = renderHook(() =>
      useProvider(PROVIDER, { dedupingInterval: 0 }),
    );

    await waitFor(() => expect(result.current.provider?.name).toBe('Ikeja General Clinic'));
    expect(result.current.error).toBeNull();
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/providers/${PROVIDER}`);
  });

  it('surfaces an HTTP error with its status', async () => {
    respond(() => error(404, 'Provider not found'));
    const { result } = renderHook(() => useProvider('GMISSING'));

    await waitFor(() => expect(result.current.error).toBe('Provider not found'));
    expect((result.current.rawError as ApiError).status).toBe(404);
    expect(result.current.provider).toBeNull();
  });

  it('refetches after a provider write invalidates the profile', async () => {
    let reads = 0;
    respond(() => {
      reads += 1;
      return {
        body: { ...provider, name: reads === 1 ? 'Old name' : 'New name' },
      };
    });
    const { result } = renderHook(() =>
      useProvider(PROVIDER, { dedupingInterval: 0 }),
    );

    await waitFor(() => expect(result.current.provider?.name).toBe('Old name'));
    await act(async () => {
      await invalidateProvider();
    });
    await waitFor(() => expect(result.current.provider?.name).toBe('New name'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('useProviders', () => {
  it('loads the directory and its total', async () => {
    respond(() => ({ body: { total: 1, providers: [provider] } }));
    const { result } = renderHook(() =>
      useProviders({ status: 'Active' }, { dedupingInterval: 0 }),
    );

    await waitFor(() => expect(result.current.providers).toHaveLength(1));
    expect(result.current.total).toBe(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('status=Active');
  });

  it('surfaces an HTTP error with its status', async () => {
    respond(() => error(503, 'Service unavailable'));
    const { result } = renderHook(() => useProviders());

    await waitFor(() => expect(result.current.error).toBe('Service unavailable'));
    expect((result.current.rawError as ApiError).status).toBe(503);
    expect(result.current.providers).toEqual([]);
  });

  it('refetches after a provider write invalidates the directory', async () => {
    let reads = 0;
    respond(() => {
      reads += 1;
      return { body: { total: reads, providers: [provider] } };
    });
    const { result } = renderHook(() => useProviders(undefined, { dedupingInterval: 0 }));

    await waitFor(() => expect(result.current.total).toBe(1));
    await act(async () => {
      await invalidateProvider();
    });
    await waitFor(() => expect(result.current.total).toBe(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('useStats', () => {
  it('loads protocol statistics', async () => {
    respond(() => ({ body: stats }));
    const { result } = renderHook(() => useStats({ dedupingInterval: 0 }));

    await waitFor(() => expect(result.current.stats?.vouchers).toBe(2));
    expect(result.current.error).toBeNull();
    expect(String(fetchMock.mock.calls[0][0])).toContain('/stats');
  });

  it('surfaces an HTTP error with its status', async () => {
    respond(() => error(500, 'Stats failed'));
    const { result } = renderHook(() => useStats());

    await waitFor(() => expect(result.current.error).toBe('Stats failed'));
    expect((result.current.rawError as ApiError).status).toBe(500);
    expect(result.current.stats).toBeNull();
  });

  it('refetches when the caller mutates after a write', async () => {
    let reads = 0;
    respond(() => {
      reads += 1;
      return { body: { ...stats, vouchers: reads } };
    });
    const { result } = renderHook(() => useStats({ dedupingInterval: 0 }));

    await waitFor(() => expect(result.current.stats?.vouchers).toBe(1));
    await act(async () => {
      await result.current.mutate();
    });
    await waitFor(() => expect(result.current.stats?.vouchers).toBe(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('useDailyStats', () => {
  it('loads the time series for the requested window', async () => {
    respond(() => ({ body: dailyStats }));
    const { result } = renderHook(() => useDailyStats(7, { dedupingInterval: 0 }));

    await waitFor(() => expect(result.current.dailyStats?.days).toBe(7));
    expect(result.current.dailyStats?.series).toHaveLength(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/stats/daily?days=7');
  });

  it('surfaces an HTTP error with its status', async () => {
    respond(() => error(422, 'Invalid window'));
    const { result } = renderHook(() => useDailyStats(90));

    await waitFor(() => expect(result.current.error).toBe('Invalid window'));
    expect((result.current.rawError as ApiError).status).toBe(422);
    expect(result.current.dailyStats).toBeNull();
  });

  it('refetches when the caller mutates after a write', async () => {
    let reads = 0;
    respond(() => {
      reads += 1;
      return { body: { ...dailyStats, days: reads === 1 ? 7 : 8 } };
    });
    const { result } = renderHook(() => useDailyStats(7, { dedupingInterval: 0 }));

    await waitFor(() => expect(result.current.dailyStats?.days).toBe(7));
    await act(async () => {
      await result.current.mutate();
    });
    await waitFor(() => expect(result.current.dailyStats?.days).toBe(8));
  });
});

describe('useAttesters', () => {
  it('loads the attester directory', async () => {
    respond(() => ({ body: attesters }));
    const { result } = renderHook(() =>
      useAttesters({ all: true }, { dedupingInterval: 0 }),
    );

    await waitFor(() => expect(result.current.attesters).toHaveLength(1));
    expect(result.current.total).toBe(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('all=true');
  });

  it('surfaces an HTTP error with its status', async () => {
    respond(() => error(500, 'Attesters failed'));
    const { result } = renderHook(() => useAttesters());

    await waitFor(() => expect(result.current.error).toBe('Attesters failed'));
    expect((result.current.rawError as ApiError).status).toBe(500);
    expect(result.current.attesters).toEqual([]);
  });

  it('refetches when the caller mutates after a write', async () => {
    let reads = 0;
    respond(() => {
      reads += 1;
      return { body: { ...attesters, total: reads } };
    });
    const { result } = renderHook(() => useAttesters(undefined, { dedupingInterval: 0 }));

    await waitFor(() => expect(result.current.total).toBe(1));
    await act(async () => {
      await result.current.mutate();
    });
    await waitFor(() => expect(result.current.total).toBe(2));
  });
});

describe('useReceipts', () => {
  it('loads receipts for a beneficiary reference', async () => {
    respond(() => ({ body: receipts }));
    const { result } = renderHook(() =>
      useReceipts(PATIENT_REF, { dedupingInterval: 0 }),
    );

    await waitFor(() => expect(result.current.receipts).toHaveLength(1));
    expect(result.current.total).toBe(1);
    expect(result.current.totalSpendDisplay).toBe('3.00');
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      `beneficiaryRef=${PATIENT_REF}`,
    );
  });

  it('surfaces an HTTP error with its status', async () => {
    respond(() => error(400, 'Invalid beneficiary reference'));
    const { result } = renderHook(() => useReceipts('bad'));

    await waitFor(() =>
      expect(result.current.error).toBe('Invalid beneficiary reference'),
    );
    expect((result.current.rawError as ApiError).status).toBe(400);
    expect(result.current.receipts).toEqual([]);
    expect(result.current.totalSpendDisplay).toBe('0.00');
  });

  it('refetches after a write invalidates receipts', async () => {
    let reads = 0;
    respond(() => {
      reads += 1;
      return {
        body: { ...receipts, totalSpendDisplay: reads === 1 ? '3.00' : '6.00' },
      };
    });
    const { result } = renderHook(() =>
      useReceipts(PATIENT_REF, { dedupingInterval: 0 }),
    );

    await waitFor(() => expect(result.current.totalSpendDisplay).toBe('3.00'));
    await act(async () => {
      await invalidateVouchers();
    });
    await waitFor(() => expect(result.current.totalSpendDisplay).toBe('6.00'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not fetch without a beneficiary reference', () => {
    const { result } = renderHook(() => useReceipts(''));
    expect(result.current.receipts).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('useIsAttester', () => {
  it('reads the registry through the contract client', async () => {
    registryIsAttester.mockResolvedValue(true);
    const { result } = renderHook(() => useIsAttester(FUNDER));

    await waitFor(() => expect(result.current.isAttester).toBe(true));
    expect(registryIsAttester).toHaveBeenCalledWith(FUNDER);
    expect(result.current.error).toBeNull();
  });

  it('treats a failed registry read as not an attester', async () => {
    registryIsAttester.mockRejectedValue(new Error('RPC unavailable'));
    const { result } = renderHook(() => useIsAttester(PROVIDER));

    await waitFor(() => expect(result.current.isAttester).toBe(false));
    expect(result.current.error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not read the registry without an address', () => {
    const { result } = renderHook(() => useIsAttester(null));
    expect(result.current.isAttester).toBeNull();
    expect(registryIsAttester).not.toHaveBeenCalled();
  });
});
