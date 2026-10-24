import type { Metadata } from 'next';
import Link from 'next/link';

import { AnalyticsToggle } from '@/components/AnalyticsToggle';
import { Card } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Privacy — SCI Healthcare',
  description:
    'How SCI Healthcare protects patient privacy: what is written to the blockchain, what stays on your device, and what the API sees.',
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-10">
      <header className="space-y-3">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
          Privacy by design
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Privacy Architecture</h1>
        <p className="text-base leading-relaxed text-[var(--color-ink-soft)]">
          The single strictest rule in this protocol: <strong>no protected health
          information or personal identifying details ever reach the public blockchain.</strong>
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          1. Why this matters
        </h2>
        <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
          A public blockchain like Stellar is permanent, immutable, and accessible
          worldwide. Anything committed to it remains there indefinitely. Medical
          diagnoses, patient names, and health records do not belong on a public ledger.
          Attempts to store encrypted medical records on-chain risk eventual exposure
          through cryptographic advances, metadata correlation, or key leaks.
        </p>
        <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
          SCI Healthcare takes a structural approach: rather than encrypting sensitive
          health records on chain, we ensure that sensitive data never enters the
          system in the first place.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          2. What is written on chain (The Stellar ledger)
        </h2>
        <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
          Each care voucher is managed by open-source smart contracts on the Stellar
          network. The on-chain voucher record contains only the minimum parameters
          required for financial escrow and delivery confirmation:
        </p>

        <div className="overflow-x-auto rounded-xl border border-[var(--color-line)]">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-[var(--color-line)] bg-[var(--color-canvas)] text-xs font-medium uppercase tracking-wider text-[var(--color-ink-soft)]">
              <tr>
                <th className="px-4 py-3">Field</th>
                <th className="px-4 py-3">Example</th>
                <th className="px-4 py-3">What it reveals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)] text-xs sm:text-sm">
              <tr>
                <td className="px-4 py-3 font-mono font-medium">funder</td>
                <td className="px-4 py-3 font-mono text-[var(--color-ink-soft)]">GDUP…JG45</td>
                <td className="px-4 py-3">The public Stellar wallet address that funded the voucher.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-medium">provider</td>
                <td className="px-4 py-3 font-mono text-[var(--color-ink-soft)]">GDOO…ZKBK</td>
                <td className="px-4 py-3">The verified clinic address authorized to claim the voucher.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-medium">service_code</td>
                <td className="px-4 py-3 font-mono text-[var(--color-ink-soft)]">101</td>
                <td className="px-4 py-3">A coarse category code (e.g., outpatient consult).</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-medium">amount</td>
                <td className="px-4 py-3 font-mono text-[var(--color-ink-soft)]">30000000</td>
                <td className="px-4 py-3">The value in USDC stroops ($3.00).</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-medium">beneficiary_ref</td>
                <td className="px-4 py-3 font-mono text-[var(--color-ink-soft)]">72676a6f…0947</td>
                <td className="px-4 py-3">An opaque 32-byte cryptographic digest.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono font-medium">timestamps</td>
                <td className="px-4 py-3 font-mono text-[var(--color-ink-soft)]">1716199200</td>
                <td className="px-4 py-3">Timestamps for creation, claim, attestation, and settlement.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <strong className="font-semibold">Why service codes stay coarse:</strong> Code{' '}
          <span className="font-mono">101</span> indicates &quot;outpatient consult&quot;, not a specific
          ailment or viral test. Coarse codes deliberately prevent the public ledger from
          becoming a permanent public medical history.
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          3. What is never on chain
        </h2>
        <ul className="list-inside list-disc space-y-2 text-sm text-[var(--color-ink-soft)]">
          <li>Patient names, dates of birth, national ID numbers, and phone numbers.</li>
          <li>Residential addresses or clinic room numbers.</li>
          <li>Diagnoses, test results, prescription details, or clinical notes.</li>
          <li>Free-text input fields of any kind.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          4. What stays on your device
        </h2>
        <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
          To link vouchers to a patient without exposing who they are, the application
          derives a <strong className="text-[var(--color-ink)]">beneficiary reference</strong> entirely
          within your browser using standard Web Crypto primitives:
        </p>

        <Card className="p-4">
          <code className="text-xs sm:text-sm text-[var(--color-ink)]">
            beneficiary_ref = HMAC-SHA256(secret_key, lowercase(trim(patient_identifier)))
          </code>
        </Card>

        <ul className="space-y-2 text-sm text-[var(--color-ink-soft)]">
          <li>
            <strong className="text-[var(--color-ink)]">Browser execution:</strong> Calculated locally via{' '}
            <code className="rounded bg-[var(--color-canvas)] px-1 py-0.5 font-mono text-xs text-[var(--color-ink)]">
              crypto.subtle.sign
            </code>
            . Neither the plaintext patient identifier (such as a clinic card number) nor the secret key is ever sent across the network.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">HMAC vs. plain hashing:</strong> A bare hash (like SHA-256 on a phone number) can be reverse-engineered by brute-force dictionaries. An HMAC keyed with a secret key cannot be searched or reversed by anyone without that secret key.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Optional local storage:</strong> If you choose to save credentials in the UI, they reside strictly in your browser&apos;s{' '}
            <code className="rounded bg-[var(--color-canvas)] px-1 py-0.5 font-mono text-xs text-[var(--color-ink)]">localStorage</code>. Private browsing or clearing browser data removes them immediately.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Non-custodial key handling:</strong> The app never requests or handles your wallet&apos;s private key or seed phrase. All transaction signatures occur inside your Stellar wallet extension (such as Freighter).
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Installable app and offline shell:</strong> The app can be installed on a phone and keeps the interface it needs to open without a connection — the page frame, its icons and its build output — in the browser&apos;s cache. Never cached: any answer from the API or RPC, any voucher, and any patient reference, so the offline copy carries no health information. Your low-data preference and tour progress are small flags in{' '}
            <code className="rounded bg-[var(--color-canvas)] px-1 py-0.5 font-mono text-xs text-[var(--color-ink)]">localStorage</code>; clearing site data removes both those and the cached shell.
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          5. What the API and indexer store
        </h2>
        <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
          The backend API functions solely as a read-model cache and indexer for the
          blockchain events emitted by the contracts.
        </p>
        <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
          The database contains nothing that is not already public on the Stellar
          ledger. If the backend database were ever compromised, an attacker would obtain
          only a duplicate of the public ledger—never private medical records or personal
          identities.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          6. Analytics and error reporting safeguards
        </h2>
        <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
          Our operational monitoring is engineered to prevent accidental leaks:
        </p>
        <ul className="space-y-2 text-sm text-[var(--color-ink-soft)]">
          <li>
            <strong className="text-[var(--color-ink)]">Cookieless usage analytics (Plausible):</strong> All URL paths are normalized (e.g., recorded as{' '}
            <code className="rounded bg-[var(--color-canvas)] px-1 py-0.5 font-mono text-xs text-[var(--color-ink)]">/clinics/[address]</code> and{' '}
            <code className="rounded bg-[var(--color-canvas)] px-1 py-0.5 font-mono text-xs text-[var(--color-ink)]">/vouchers/[id]</code>
            ) so specific addresses or IDs never enter analytics. Event tracking transmits names only, without amounts or references.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Scrubbed error reports (Sentry):</strong> An automatic{' '}
            <code className="rounded bg-[var(--color-canvas)] px-1 py-0.5 font-mono text-xs text-[var(--color-ink)]">beforeSend</code> scrubber redacts all 64-character hex strings, Stellar addresses, and sensitive URL query parameters. Session replay and user tracking remain completely disabled.
          </li>
        </ul>

        <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[var(--color-ink)]">Usage analytics</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-soft)]">
                On by default, cookieless and identifier-free. Your browser&apos;s Do
                Not Track signal is respected automatically. Turn it off here at any
                time and no analytics script is loaded and no pageview is sent.
              </p>
            </div>
            <AnalyticsToggle />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          7. Honest limitations: Pseudonymity vs. Anonymity
        </h2>
        <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
          We believe in honest guarantees rather than false reassurance:
        </p>
        <ul className="list-inside list-disc space-y-2 text-sm text-[var(--color-ink-soft)]">
          <li>
            <strong>Known keyholder verification:</strong> Anyone who already knows both the patient identifier and the secret key can compute the digest and verify which vouchers belong to that patient.
          </li>
          <li>
            <strong>Funder address correlation:</strong> If a funder uses the same Stellar wallet for all donations, public block explorers can link those funding activities together.
          </li>
          <li>
            <strong>Physical observation:</strong> An observer watching a patient enter a specific clinic at a specific time can correlate that physical visit with a timestamped on-chain claim.
          </li>
        </ul>
        <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
          SCI Healthcare offers rigorous cryptographic pseudonymity and zero-PHI escrow.
          For further technical details, read the{' '}
          <a
            href="https://github.com/Godgift-care/sci-healthcare-contracts/blob/main/docs/protocol/privacy.md"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--color-brand)] underline underline-offset-2 hover:opacity-80"
          >
            Protocol Privacy Specification
          </a>
          .
        </p>
      </section>

      <footer className="border-t border-[var(--color-line)] pt-6">
        <div className="flex items-center justify-between text-xs text-[var(--color-ink-soft)]">
          <span>Last reviewed against codebase: October 2026</span>
          <Link href="/faq" className="text-[var(--color-brand)] hover:underline">
            Read common questions in the FAQ &rarr;
          </Link>
        </div>
      </footer>
    </article>
  );
}
