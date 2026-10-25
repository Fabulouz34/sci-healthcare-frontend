import { Card } from "./ui";

export function Skeleton({
  className = "",
  "aria-hidden": ariaHidden = true,
}: {
  className?: string;
  "aria-hidden"?: boolean;
}) {
  return (
    <div
      aria-hidden={ariaHidden}
      className={`animate-pulse rounded bg-[var(--color-line)] ${className}`}
    />
  );
}

export function SkeletonRow({
  className = "",
  lines = 2,
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading content"
      className={`flex items-start gap-3 ${className}`}
    >
      <span className="sr-only">Loading…</span>
      <Skeleton className="mt-1 h-3 w-3 flex-none rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-40" />
        {lines > 1 && <Skeleton className="h-3 w-full max-w-sm" />}
      </div>
    </div>
  );
}

export function SkeletonCard({
  className = "",
  lines = 3,
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading card">
      <Card className={`space-y-4 p-5 ${className}`}>
        <span className="sr-only">Loading…</span>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="space-y-2 pt-2">
          {Array.from({ length: lines }).map((_, i) => (
            <div key={i} className="flex justify-between gap-3">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function SkeletonDetail({ className = "" }: { className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading details"
      className={`space-y-6 ${className}`}
    >
      <span className="sr-only">Loading…</span>

      <div className="space-y-2" aria-hidden>
        <Skeleton className="h-6 w-48 rounded-md" />
        <Skeleton className="h-3 w-64 rounded-md" />
      </div>

      <div className="grid gap-6 md:grid-cols-[2fr_1fr]" aria-hidden>
        <Card className="space-y-4 p-5">
          <Skeleton className="h-4 w-24" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="mt-1 h-3 w-3 flex-none rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-full max-w-sm" />
              </div>
            </div>
          ))}
        </Card>

        <Card className="space-y-4 p-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
