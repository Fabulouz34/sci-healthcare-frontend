'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useServices } from '@/lib/hooks';
import { formatUsdc } from '@/lib/amounts';
import { Alert, Button, Card, Empty } from '@/components/ui';
import { SkeletonCard } from '@/components/Skeleton';

export default function ServicesPage() {
  const [query, setQuery] = useState('');
  const queryRef = useRef('');

  const { services, isLoading: loading, error } = useServices();

  // Search state lives in the URL (written via the History API) so a filtered
  // catalogue survives a reload, mirroring the clinic directory on /.
  useEffect(() => {
    const sync = () => {
      const next = window.location.search.replace(/^\?/, '');
      queryRef.current = next;
      setQuery(next);
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const searchParams = useMemo(() => new URLSearchParams(query), [query]);
  const searchTerm = (searchParams.get('q') ?? '').trim().toLowerCase();
  const visible = useMemo(
    () =>
      services.filter((s) =>
        s.labels.some((label) => label.toLowerCase().includes(searchTerm)),
      ),
    [services, searchTerm],
  );
  const filtering = searchTerm.length > 0;

  function writeParams(update: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(queryRef.current);
    update(params);
    const next = params.toString();
    queryRef.current = next;
    setQuery(next);
    window.history.replaceState(
      window.history.state,
      '',
      next ? `${window.location.pathname}?${next}` : window.location.pathname,
    );
  }

  function setParam(value: string) {
    writeParams((params) => {
      if (!value) params.delete('q');
      else params.set('q', value);
    });
  }

  function clearFilters() {
    writeParams((params) => {
      params.delete('q');
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--color-line)] bg-gradient-to-b from-[var(--color-surface)] to-[var(--color-canvas)] p-4 sm:p-5">
        <div className="max-w-2xl space-y-1.5">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
            Care-voucher protocol on Stellar
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--color-ink)]">
            Find care by service
          </h1>
          <p className="text-xs sm:text-sm leading-relaxed text-[var(--color-ink-soft)]">
            Search for the care you want to pay for and compare what clinics
            charge for it, then fund a voucher from the clinic page.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
          <Link
            href="/"
            className="inline-flex max-sm:min-h-15 items-center justify-center gap-2 rounded-lg border border-[var(--color-line)] bg-white px-3.5 py-1.5 text-sm font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-canvas)]"
          >
            Browse clinics →
          </Link>
          <Link
            href="/how-it-works"
            className="inline-flex max-sm:min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--color-line)] bg-white px-3.5 py-1.5 text-sm font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-canvas)]"
          >
            How it works →
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Service catalogue</h2>
        </div>

        <div role="search" className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <label className="block">
            <span className="sr-only">Search service name</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setParam(e.target.value)}
              placeholder="Search service name"
              className="h-11 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm"
            />
          </label>
        </div>

        {filtering && !loading && !error && (
          <p className="text-xs text-[var(--color-ink-soft)]">
            Showing {visible.length} of {services.length} services
          </p>
        )}

        {error && <Alert>{error}</Alert>}
        {loading && !error && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {!loading && !error && services.length === 0 && (
          <Empty
            title="No services listed yet"
            description="Clinics publish the care they offer from the clinic desk. Once one does, it will appear here for funders to compare."
            action={
              <Link
                href="/clinic"
                className="inline-flex max-sm:min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                List a service
              </Link>
            }
          />
        )}

        {!loading && !error && services.length > 0 && visible.length === 0 && (
          <Empty
            title="No services match your search."
            description="Try a broader term, or clear the search to see the full catalogue."
            action={
              <Button variant="ghost" onClick={clearFilters}>
                Clear search
              </Button>
            }
          />
        )}

        {!loading && !error && visible.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((s) => (
              <ServiceCard key={s.code} service={s} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ServiceCard({
  service: s,
}: {
  service: {
    code: number;
    labels: string[];
    clinicCount: number;
    minPrice: string;
    maxPrice: string;
    minPriceDisplay: string;
    maxPriceDisplay: string;
  };
}) {
  return (
    <Link href={`/services/${s.code}`}>
      <Card className="h-full p-4 transition hover:border-[var(--color-brand)] sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium break-words text-[var(--color-ink)]">
              {s.labels.join(' · ')}
            </h3>
            <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
              {s.clinicCount} clinic{s.clinicCount === 1 ? '' : 's'}
            </p>
          </div>
          <span className="shrink-0 mono text-sm font-medium">
            ${formatUsdc(s.minPrice)}
          </span>
        </div>

        <div className="mt-4 border-t border-[var(--color-line)] pt-3">
          <p className="text-xs text-[var(--color-ink-soft)]">
            Price range{' '}
            <span className="text-[var(--color-ink)]">
              ${formatUsdc(s.minPrice)} – ${formatUsdc(s.maxPrice)}
            </span>
          </p>
        </div>

        <p className="mt-3 text-xs text-[var(--color-brand)] font-medium underline underline-offset-2 hover:opacity-80">
          Compare clinics →
        </p>
      </Card>
    </Link>
  );
}
