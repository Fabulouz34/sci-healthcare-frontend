'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { use, useMemo } from 'react';

import { ApiError, type ServiceCatalogueItem } from '@/lib/api';
import { formatUsdc } from '@/lib/amounts';
import { useProviders, useService } from '@/lib/hooks';
import { Alert, Button, Card, Empty } from '@/components/ui';
import { SkeletonCard, SkeletonDetail } from '@/components/Skeleton';

export default function ServicePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: codeParam } = use(params);
  const code = Number(codeParam);

  const { service, error: loadError, rawError: loadRawError } = useService(code);
  const { providers: allProviders } = useProviders();

  const activeAddresses = useMemo(
    () => new Set(allProviders.filter((p) => p.status === 'Active').map((p) => p.address)),
    [allProviders],
  );

  const clinics = useMemo(() => {
    if (!service) return [];
    const listed = service.providers ?? [];
    return listed
      .filter((c) => activeAddresses.has(c.address))
      .sort((a, b) => Number(BigInt(a.price) - BigInt(b.price)));
  }, [service, activeAddresses]);

  // An unknown service code is a missing page, not an API failure.
  if (loadRawError instanceof ApiError && loadRawError.status === 404) notFound();
  if (loadError) return <Alert>{loadError}</Alert>;
  if (!service) {
    return <SkeletonDetail />;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--color-line)] bg-gradient-to-b from-[var(--color-surface)] to-[var(--color-canvas)] p-4 sm:p-5">
        <div className="max-w-2xl space-y-1.5">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
            Care-voucher protocol on Stellar
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--color-ink)]">
            {service.labels.join(' · ')}
          </h1>
          <p className="text-xs sm:text-sm leading-relaxed text-[var(--color-ink-soft)]">
            Compare what active clinics charge for this service, then fund a
            voucher from the clinic of your choice.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
          <Link
            href="/services"
            className="inline-flex max-sm:min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--color-line)] bg-white px-3.5 py-1.5 text-sm font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-canvas)]"
          >
            Service catalogue →
          </Link>
          <Link
            href="/"
            className="inline-flex max-sm:min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--color-line)] bg-white px-3.5 py-1.5 text-sm font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-canvas)]"
          >
            Browse clinics →
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Clinics offering this service</h2>
          <p className="text-xs text-[var(--color-ink-soft)]">
            Sorted by price, active clinics only.
          </p>
        </div>

        {loadError && <Alert>{loadError}</Alert>}
        {!service && !loadError && (
          <div className="grid gap-3 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {!service && !loadError && clinics.length === 0 && (
          <Empty>
            No active clinics list this service yet.
          </Empty>
        )}

        {service && clinics.length > 0 && (
          <div className="overflow-x-auto border border-[var(--color-line)] rounded-xl sm:overflow-visible">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">
                Clinics offering {service.labels.join(' · ')}, sorted by price
              </caption>
              <thead className="border-b border-[var(--color-line)] text-[var(--color-ink-soft)]">
                <tr className="text-xs uppercase tracking-wide">
                  <th scope="col" className="px-4 py-3 font-medium">
                    Clinic
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Country
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">
                    Price
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">
                    Fund
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {clinics.map((c) => (
                  <tr key={c.address} className="text-sm">
                    <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                      {c.name}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-soft)]">
                      {c.country}
                    </td>
                    <td className="px-4 py-3 mono text-right text-[var(--color-ink)]">
                      ${formatUsdc(c.price)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/clinics/${c.address}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-line)] bg-white px-3.5 py-1.5 text-xs font-medium text-[var(--color-brand)] transition hover:bg-[var(--color-canvas)]"
                      >
                        Fund care →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
