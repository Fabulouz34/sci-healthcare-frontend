'use client';

import { useMemo, useState } from 'react';

import { formatUsdc } from '@/lib/amounts';
import { useDailyStats, useProviders, useStats, useVouchers } from '@/lib/hooks';
import { Card, Empty } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { SkeletonCard } from '@/components/Skeleton';
import { WidgetBoundary } from '@/components/WidgetBoundary';

type TimeRange = 7 | 14 | 30 | 90;

/** Simple SVG Bar Chart for daily counts with accessible properties. */
function ActivityChart({
  title,
  data,
  color,
  unit = '',
}: {
  title: string;
  data: { date: string; value: number; formattedValue?: string }[];
  color: string;
  unit?: string;
}) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const chartHeight = 160;
  const chartWidth = 600;
  const paddingX = 40;
  const paddingY = 25;
  const plotWidth = chartWidth - paddingX * 2;
  const plotHeight = chartHeight - paddingY * 2;

  const barWidth = Math.max(2, Math.min(24, (plotWidth / (data.length || 1)) * 0.7));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-medium text-[var(--color-ink-soft)]">
        <span>{title}</span>
        <span>Max: {unit}{maxVal.toLocaleString()}</span>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-44 w-full min-w-[320px]"
          role="img"
          aria-label={`${title} chart`}
        >
          {/* Background grid lines */}
          <line
            x1={paddingX}
            y1={paddingY}
            x2={chartWidth - paddingX}
            y2={paddingY}
            stroke="var(--color-line)"
            strokeDasharray="4 4"
          />
          <line
            x1={paddingX}
            y1={paddingY + plotHeight / 2}
            x2={chartWidth - paddingX}
            y2={paddingY + plotHeight / 2}
            stroke="var(--color-line)"
            strokeDasharray="4 4"
          />
          <line
            x1={paddingX}
            y1={chartHeight - paddingY}
            x2={chartWidth - paddingX}
            y2={chartHeight - paddingY}
            stroke="var(--color-line)"
          />

          {/* Bars */}
          {data.map((d, i) => {
            const x =
              paddingX +
              (i * plotWidth) / (data.length > 1 ? data.length - 1 : 1) -
              barWidth / 2;
            const h = (d.value / maxVal) * plotHeight;
            const y = chartHeight - paddingY - h;

            return (
              <g key={d.date} className="group">
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(h, 2)}
                  rx={2}
                  fill={color}
                  className="transition-opacity hover:opacity-80"
                >
                  <title>{`${d.date}: ${unit}${d.formattedValue ?? d.value}`}</title>
                </rect>
              </g>
            );
          })}

          {/* First and Last Date Labels */}
          {data.length > 0 && (
            <>
              <text
                x={paddingX}
                y={chartHeight - 6}
                fontSize="10"
                fill="currentColor"
                className="text-[var(--color-ink-soft)]"
              >
                {data[0].date}
              </text>
              <text
                x={chartWidth - paddingX}
                y={chartHeight - 6}
                textAnchor="end"
                fontSize="10"
                fill="currentColor"
                className="text-[var(--color-ink-soft)]"
              >
                {data[data.length - 1].date}
              </text>
            </>
          )}
        </svg>
      </div>
    </div>
  );
}

export default function StatsPage() {
  const [days, setDays] = useState<TimeRange>(30);
  const [showTables, setShowTables] = useState<boolean>(false);

  const { stats } = useStats();
  const { dailyStats, isLoading: dailyLoading } = useDailyStats(days);
  const { providers } = useProviders();
  const { vouchers } = useVouchers({});

  // Aggregate country statistics
  const countryCounts = useMemo(() => {
    const map = new Map<string, { count: number; active: number }>();
    for (const p of providers) {
      const entry = map.get(p.country) ?? { count: 0, active: 0 };
      entry.count += 1;
      if (p.status === 'Active') entry.active += 1;
      map.set(p.country, entry);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [providers]);

  // Voucher activity per country: funded and settled counts plus settled value.
  const countryVouchers = useMemo(() => {
    const map = new Map<
      string,
      { funded: number; fundedValue: bigint; settled: number; settledValue: bigint }
    >();
    for (const v of vouchers) {
      const country = String(v.provider?.country ?? '');
      const entry =
        map.get(country) ?? { funded: 0, fundedValue: 0n, settled: 0, settledValue: 0n };
      if (v.status === 'Funded') {
        entry.funded += 1;
        entry.fundedValue += BigInt(v.amount || '0');
      }
      if (v.status === 'Settled') {
        entry.settled += 1;
        entry.settledValue += BigInt(v.amount || '0');
      }
      map.set(country, entry);
    }
    return Array.from(map.entries()).sort(
      (a, b) => Number(b[1].settledValue - a[1].settledValue) || b[1].settled - a[1].settled,
    );
  }, [vouchers]);

  const series = useMemo(() => dailyStats?.series ?? [], [dailyStats]);

  const fundedSeries = useMemo(() => {
    return series.map((s) => ({
      date: s.date,
      value: s.funded.count,
      formattedValue: `${s.funded.count} ($${formatUsdc(s.funded.amount)})`,
    }));
  }, [series]);

  const settledSeries = useMemo(() => {
    return series.map((s) => ({
      date: s.date,
      value: s.settled.count,
      formattedValue: `${s.settled.count} ($${formatUsdc(s.settled.amount)})`,
    }));
  }, [series]);

  const totalFundedVolume = useMemo(() => {
    return series.reduce((acc, s) => acc + BigInt(s.funded.amount || '0'), 0n).toString();
  }, [series]);

  const totalSettledVolume = useMemo(() => {
    return series.reduce((acc, s) => acc + BigInt(s.settled.amount || '0'), 0n).toString();
  }, [series]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Protocol statistics</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Public ledger activity: vouchers funded, care settled, clinics, and geographic reach.
          </p>
        </div>

        {/* Range Selector */}
        <div className="flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-1 text-xs">
          {([7, 14, 30, 90] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDays(r)}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                days === r
                  ? 'bg-[var(--color-brand)] text-white'
                  : 'text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {/* Totals Grid */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Protocol totals">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
            Active clinics
          </div>
          <div className="mt-1 text-2xl font-bold">{stats ? stats.activeProviders : '—'}</div>
          <div className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
            {stats ? `${stats.providers} registered total` : '…'}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
            Countries
          </div>
          <div className="mt-1 text-2xl font-bold">{countryCounts.length || '—'}</div>
          <div className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
            operating across regions
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
            Vouchers funded
          </div>
          <div className="mt-1 text-2xl font-bold">{stats ? stats.vouchers : '—'}</div>
          <div className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
            all-time commits
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
            Care settled
          </div>
          <div className="mt-1 text-2xl font-bold">
            {stats ? `$${formatUsdc(stats.settledValue)}` : '—'}
          </div>
          <div className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
            {stats ? `${stats.settledVouchers} vouchers paid` : '…'}
          </div>
        </Card>
      </section>

      {/* View Mode Toggle for Accessibility */}
      <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
        <h2 className="text-base font-semibold">Daily activity ({days} days)</h2>
        <button
          type="button"
          onClick={() => setShowTables(!showTables)}
          className="text-xs font-medium text-[var(--color-brand)] underline hover:opacity-80"
        >
          {showTables ? 'Hide data tables' : 'Show accessible data tables'}
        </button>
      </div>

      {dailyLoading && (
        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      )}

      {/* Daily Charts */}
      {!dailyLoading && series.length === 0 ? (
        <Empty>No activity recorded in this period.</Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Funded Chart */}
          <Card className="p-5">
            <h3 className="font-medium text-sm">Vouchers funded per day</h3>
            <p className="text-xs text-[var(--color-ink-soft)]">
              Total {days}d volume: ${formatUsdc(totalFundedVolume)}
            </p>
            <div className="mt-4">
              {/* One broken chart leaves the totals, tables and the other chart up (#169). */}
              <WidgetBoundary label="This chart">
                <ActivityChart
                  title="Daily Vouchers Funded"
                  data={fundedSeries}
                  color="var(--color-brand)"
                />
              </WidgetBoundary>
            </div>
            {showTables && (
              <div className="mt-6 border-t border-[var(--color-line)] pt-4">
                <div className="max-h-60 overflow-y-auto">
                  <DataTable
                    caption="Daily vouchers funded data table"
                    rows={series}
                    getRowKey={(row) => row.date}
                    columns={[
                      {
                        key: 'date',
                        header: 'Date (UTC)',
                        accessor: (row) => row.date,
                        className: 'font-mono',
                      },
                      {
                        key: 'count',
                        header: 'Count',
                        accessor: (row) => row.funded.count,
                        align: 'right',
                      },
                      {
                        key: 'amount',
                        header: 'Volume (USDC)',
                        accessor: (row) => row.funded.amount,
                        align: 'right',
                        className: 'font-mono',
                        render: (row) => `$${formatUsdc(row.funded.amount)}`,
                      },
                    ]}
                  />
                </div>
              </div>
            )}
          </Card>

          {/* Settled Chart */}
          <Card className="p-5">
            <h3 className="font-medium text-sm">Care settled per day</h3>
            <p className="text-xs text-[var(--color-ink-soft)]">
              Total {days}d volume: ${formatUsdc(totalSettledVolume)}
            </p>
            <div className="mt-4">
              <WidgetBoundary label="This chart">
                <ActivityChart
                  title="Daily Care Settled"
                  data={settledSeries}
                  color="#059669"
                />
              </WidgetBoundary>
            </div>
            {showTables && (
              <div className="mt-6 border-t border-[var(--color-line)] pt-4">
                <div className="max-h-60 overflow-y-auto">
                  <DataTable
                    caption="Daily care settled data table"
                    rows={series}
                    getRowKey={(row) => row.date}
                    columns={[
                      {
                        key: 'date',
                        header: 'Date (UTC)',
                        accessor: (row) => row.date,
                        className: 'font-mono',
                      },
                      {
                        key: 'count',
                        header: 'Count',
                        accessor: (row) => row.settled.count,
                        align: 'right',
                      },
                      {
                        key: 'amount',
                        header: 'Volume (USDC)',
                        accessor: (row) => row.settled.amount,
                        align: 'right',
                        className: 'font-mono',
                        render: (row) => `$${formatUsdc(row.settled.amount)}`,
                      },
                    ]}
                  />
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Country Breakdown Table */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Clinics by country</h2>
        <Card className="overflow-x-auto p-4">
          <table className="block w-full text-start text-sm sm:table">
            <caption className="sr-only">Registered clinics grouped by country</caption>
            <thead className="hidden sm:table-header-group">
              <tr className="border-b border-[var(--color-line)] text-xs text-[var(--color-ink-soft)]">
                <th scope="col" className="pb-2 font-medium">Country code</th>
                <th scope="col" className="pb-2 font-medium">Total registered</th>
                <th scope="col" className="pb-2 font-medium">Active status</th>
              </tr>
            </thead>
            <tbody className="block divide-y divide-[var(--color-line)] sm:table-row-group">
              {countryCounts.length === 0 ? (
                <tr className="block sm:table-row">
                  <td
                    colSpan={3}
                    className="block py-4 text-center text-xs text-[var(--color-ink-soft)] sm:table-cell"
                  >
                    No clinics recorded yet.
                  </td>
                </tr>
              ) : (
                countryCounts.map(([country, stats]) => (
                  <tr
                    key={country}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3 sm:table-row sm:py-0"
                  >
                    <td className="block font-medium sm:table-cell sm:py-2.5">{country}</td>
                    <td className="block text-xs text-[var(--color-ink-soft)] sm:table-cell sm:py-2.5 sm:text-sm sm:text-[var(--color-ink)]">
                      {stats.count} registered
                    </td>
                    <td className="block text-xs text-emerald-700 sm:table-cell sm:py-2.5 sm:text-sm">
                      {stats.active} active
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </section>

      {/* Vouchers by country */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Voucher activity by country</h2>
        <Card className="overflow-x-auto p-4">
          <table className="block w-full text-left text-sm sm:table">
            <caption className="sr-only">
              Vouchers funded, settled and value grouped by clinic country
            </caption>
            <thead className="hidden sm:table-header-group">
              <tr className="border-b border-[var(--color-line)] text-xs text-[var(--color-ink-soft)]">
                <th scope="col" className="pb-2 font-medium">Country code</th>
                <th scope="col" className="pb-2 font-medium text-right">Vouchers funded</th>
                <th scope="col" className="pb-2 font-medium text-right">Care settled</th>
                <th scope="col" className="pb-2 font-medium text-right">Value settled</th>
              </tr>
            </thead>
            <tbody className="block divide-y divide-[var(--color-line)] sm:table-row-group">
              {countryVouchers.length === 0 ? (
                <tr className="block sm:table-row">
                  <td
                    colSpan={4}
                    className="block py-4 text-center text-xs text-[var(--color-ink-soft)] sm:table-cell"
                  >
                    No voucher activity recorded yet.
                  </td>
                </tr>
              ) : (
                countryVouchers.map(([country, activity]) => (
                  <tr
                    key={country}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3 sm:table-row sm:py-0"
                  >
                    <td className="block font-medium sm:table-cell sm:py-2.5">
                      {country}
                    </td>
                    <td className="block text-xs text-[var(--color-ink-soft)] sm:table-cell sm:py-2.5 sm:text-sm sm:text-[var(--color-ink)] text-right">
                      {activity.funded} funded
                    </td>
                    <td className="block text-xs text-emerald-700 sm:table-cell sm:py-2.5 sm:text-sm text-right">
                      {activity.settled} settled
                    </td>
                    <td className="block text-xs text-[var(--color-ink)] sm:table-cell sm:py-2.5 sm:text-sm text-right font-mono">
                      ${formatUsdc(activity.settledValue.toString())}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
