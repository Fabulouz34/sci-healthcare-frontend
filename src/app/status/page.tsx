'use client';

import type { ReactNode } from 'react';

import { formatDate } from '@/lib/amounts';
import { config } from '@/lib/config';
import { useReady, useVersion } from '@/lib/hooks';
import {
  deploymentMismatches,
  describeLag,
  overallStatus,
  readinessProblems,
  shortCommit,
  type Overall,
} from '@/lib/status';
import { Alert, Button, Card } from '@/components/ui';

/** Re-check readiness while the page is open; it is what people watch. */
const READY_REFRESH_MS = 30_000;

const HEADLINE: Record<Overall, { kind: 'success' | 'error' | 'info'; text: string }> = {
  checking: { kind: 'info', text: 'Checking the API…' },
  operational: { kind: 'success', text: 'All systems operational' },
  degraded: { kind: 'error', text: 'Degraded: the API is up but not fully healthy' },
  unreachable: { kind: 'error', text: 'The API cannot be reached' },
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
      <dt className="text-sm text-[var(--color-ink-soft)]">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

function Check({ ok, okText, failText }: { ok: boolean | undefined; okText: string; failText: string }) {
  if (ok === undefined) return <span className="text-[var(--color-ink-soft)]">Not reported</span>;
  return ok ? (
    <span className="text-emerald-700">{okText}</span>
  ) : (
    <span className="text-[var(--color-danger)]">{failText}</span>
  );
}

/**
 * Service status (#168).
 *
 * Answers the first support question — "is it me, or is it down?" — by
 * showing the indexer's own readiness check, how far behind the chain it
 * is, which network it reads, and which versions are deployed. Everything
 * here comes from `GET /ready` and `GET /version`; nothing is inferred.
 */
export default function StatusPage() {
  const {
    ready,
    error: readyError,
    isValidating,
    mutate,
  } = useReady({ refreshInterval: READY_REFRESH_MS, shouldRetryOnError: false });
  const { version, error: versionError } = useVersion({ shouldRetryOnError: false });

  // A cached answer stays on screen while a refresh fails, so the page only
  // calls the API unreachable when there is no answer at all.
  const overall = overallStatus(ready, Boolean(readyError));
  const headline = HEADLINE[overall];
  // A few ledgers of lag is normal; the reasons are listed only once the
  // indexer itself says it is degraded.
  const problems = ready?.status === 'degraded' ? readinessProblems(ready) : [];
  const mismatches = version ? deploymentMismatches(config, version) : [];
  const apiNetwork = version?.network ?? ready?.checks.network;
  const appCommit = shortCommit(process.env.APP_COMMIT);
  const apiCommit = shortCommit(version?.commit);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Status</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Lists, balances and receipts are read from the API. Transactions are
            signed in your wallet and sent straight to the Stellar network, so
            they do not depend on the API being healthy.
          </p>
        </div>
        <Button variant="ghost" disabled={isValidating} onClick={() => void mutate()}>
          {isValidating ? 'Checking…' : 'Check again'}
        </Button>
      </div>

      <div role="status" aria-live="polite">
        <Alert kind={headline.kind}>
          <p className="font-semibold">{headline.text}</p>
          {overall === 'unreachable' && (
            <p className="mt-1">
              The API at <span className="mono break-all">{config.apiUrl}</span> did
              not answer. Pages that list clinics or vouchers will not load until it
              is back; it may also be waking up, which can take up to a minute.
            </p>
          )}
          {problems.length > 0 && (
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </Alert>
      </div>

      {mismatches.length > 0 && (
        <Alert>
          <p className="font-semibold">This app and the API disagree about the deployment</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {mismatches.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Alert>
      )}

      <section aria-labelledby="status-api" className="space-y-2">
        <h2 id="status-api" className="text-base font-semibold">API readiness</h2>
        <Card className="px-5 py-2">
          <dl className="divide-y divide-[var(--color-line)]">
            <Row label="Readiness">
              {ready ? (
                <Check ok={ready.status === 'ready'} okText="Ready" failText="Degraded" />
              ) : overall === 'unreachable' ? (
                <span className="text-[var(--color-danger)]">Unreachable</span>
              ) : (
                '…'
              )}
            </Row>
            <Row label="Database">
              {ready ? (
                <Check ok={ready.checks.database} okText="Connected" failText="Unreachable" />
              ) : (
                '—'
              )}
            </Row>
            <Row label="Indexer lag">
              {ready ? describeLag(ready.checks.lagLedgers) : '—'}
            </Row>
            <Row label="Latest indexed ledger">
              {ready?.checks.indexedLedger !== undefined ? (
                <span className="mono">{ready.checks.indexedLedger.toLocaleString('en')}</span>
              ) : (
                '—'
              )}
            </Row>
            <Row label="Ledger history">
              {ready?.checks.gapDetected !== undefined ? (
                <Check ok={!ready.checks.gapDetected} okText="Complete" failText="Gap detected" />
              ) : (
                '—'
              )}
            </Row>
          </dl>
        </Card>
      </section>

      <section aria-labelledby="status-network" className="space-y-2">
        <h2 id="status-network" className="text-base font-semibold">Network</h2>
        <Card className="px-5 py-2">
          <dl className="divide-y divide-[var(--color-line)]">
            <Row label="This app signs for">{config.network}</Row>
            <Row label="The API indexes">{apiNetwork ?? '—'}</Row>
          </dl>
        </Card>
      </section>

      <section aria-labelledby="status-versions" className="space-y-2">
        <h2 id="status-versions" className="text-base font-semibold">Versions</h2>
        <Card className="px-5 py-2">
          <dl className="divide-y divide-[var(--color-line)]">
            <Row label="Web app">
              <span className="mono">
                {process.env.APP_VERSION ?? 'unknown'}
                {appCommit && ` (${appCommit})`}
              </span>
            </Row>
            <Row label="API">
              {version ? (
                <span className="mono">
                  {version.version}
                  {apiCommit && ` (${apiCommit})`}
                </span>
              ) : versionError ? (
                <span className="text-[var(--color-ink-soft)]">Not available</span>
              ) : (
                '…'
              )}
            </Row>
            {version?.startedAt && (
              <Row label="API running since">{formatDate(version.startedAt)}</Row>
            )}
          </dl>
        </Card>
      </section>
    </div>
  );
}
