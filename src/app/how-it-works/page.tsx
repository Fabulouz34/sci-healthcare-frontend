import type { Metadata } from 'next';
import Link from 'next/link';

import { Card } from '@/components/ui';

export const metadata: Metadata = {
  title: 'How it works — SCI Healthcare',
};

export default function HowItWorksPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="max-w-2xl space-y-2.5">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
          Care-voucher protocol on Stellar
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-ink)]">
          How SCI Healthcare Works
        </h1>
        <p className="text-sm sm:text-base leading-relaxed text-[var(--color-ink-soft)]">
          Prepaid, purpose-bound healthcare vouchers that release funds to licensed clinics
          only when independent attesters confirm care was delivered.
        </p>
      </div>

      {/* Visual Flow Diagram */}
      <section aria-label="Protocol lifecycle overview" className="space-y-4">
        <h2 className="text-base font-semibold">The voucher lifecycle</h2>
        <Card className="p-4 sm:p-6 bg-gradient-to-b from-[var(--color-surface)] to-[var(--color-canvas)]">
          <div className="grid gap-3 sm:grid-cols-5 text-center">
            {/* Step 1 */}
            <div className="rounded-xl border border-[var(--color-line)] bg-white p-3.5 space-y-1.5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">
                1
              </span>
              <div className="font-semibold text-sm">Fund</div>
              <p className="text-xs text-[var(--color-ink-soft)] leading-normal">
                Funder commits USDC into smart contract escrow.
              </p>
            </div>

            {/* Step 2 */}
            <div className="rounded-xl border border-[var(--color-line)] bg-white p-3.5 space-y-1.5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">
                2
              </span>
              <div className="font-semibold text-sm">Claim</div>
              <p className="text-xs text-[var(--color-ink-soft)] leading-normal">
                Clinic sees patient and logs medical care.
              </p>
            </div>

            {/* Step 3 */}
            <div className="rounded-xl border border-[var(--color-line)] bg-white p-3.5 space-y-1.5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-800">
                3
              </span>
              <div className="font-semibold text-sm">Attest</div>
              <p className="text-xs text-[var(--color-ink-soft)] leading-normal">
                Third-party attester audits clinical proof.
              </p>
            </div>

            {/* Step 4 */}
            <div className="rounded-xl border border-[var(--color-line)] bg-white p-3.5 space-y-1.5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800">
                4
              </span>
              <div className="font-semibold text-sm">Dispute window</div>
              <p className="text-xs text-[var(--color-ink-soft)] leading-normal">
                Time window for funder to raise any dispute.
              </p>
            </div>

            {/* Step 5 */}
            <div className="rounded-xl border border-[var(--color-line)] bg-white p-3.5 space-y-1.5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                5
              </span>
              <div className="font-semibold text-sm">Pay or Refund</div>
              <p className="text-xs text-[var(--color-ink-soft)] leading-normal">
                Clinic receives funds or 100% refunded to funder.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Deep-dive walkthrough steps */}
      <section className="space-y-6">
        <h2 className="text-lg font-semibold">Step-by-step walkthrough</h2>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Step 1 detail */}
          <Card className="p-5 space-y-3 border-s-4 border-s-blue-500">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded bg-blue-100 text-xs font-bold text-blue-800">
                1
              </span>
              <h3 className="font-semibold text-base">Fund into Escrow</h3>
            </div>
            <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
              A funder (grantmaker, donor, or patient sponsor) selects a verified clinic and a specific catalog service code (e.g., malaria test, outpatient visit).
            </p>
            <ul className="text-xs text-[var(--color-ink-soft)] space-y-1 list-disc list-inside">
              <li>USDC is locked in the Soroban smart contract.</li>
              <li>A secret beneficiary hash is committed to protect patient identity.</li>
              <li>Money cannot be withdrawn or diverted while active.</li>
            </ul>
          </Card>

          {/* Step 2 detail */}
          <Card className="p-5 space-y-3 border-s-4 border-s-amber-500">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded bg-amber-100 text-xs font-bold text-amber-800">
                2
              </span>
              <h3 className="font-semibold text-base">Clinic Claims Attendance</h3>
            </div>
            <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
              When the patient arrives and care is delivered, the licensed clinic logs attendance by signing a claim transaction with the voucher ID.
            </p>
            <ul className="text-xs text-[var(--color-ink-soft)] space-y-1 list-disc list-inside">
              <li>Changes status from <code>Funded</code> to <code>Claimed</code>.</li>
              <li>Starts the confirmation clock.</li>
              <li>Does not release money yet — self-claims are never auto-paid.</li>
            </ul>
          </Card>

          {/* Step 3 detail */}
          <Card className="p-5 space-y-3 border-s-4 border-s-violet-500">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded bg-violet-100 text-xs font-bold text-violet-800">
                3
              </span>
              <h3 className="font-semibold text-base">Independent Attestation</h3>
            </div>
            <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
              An independent, accredited third-party attester audits clinical documentation or physical verification to confirm care took place.
            </p>
            <ul className="text-xs text-[var(--color-ink-soft)] space-y-1 list-disc list-inside">
              <li>Only registered attesters can sign confirmation transactions.</li>
              <li>Attester identity and confirmed voucher counts are recorded on chain.</li>
              <li>Transitions voucher status to <code>Attested</code>.</li>
            </ul>
          </Card>

          {/* Step 4 detail */}
          <Card className="p-5 space-y-3 border-s-4 border-s-indigo-500">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded bg-indigo-100 text-xs font-bold text-indigo-800">
                4
              </span>
              <h3 className="font-semibold text-base">Time-Locked Dispute Window</h3>
            </div>
            <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
              Before payment can settle, a transparent dispute window opens. Anyone with standing can challenge fraudulent or improper claims.
            </p>
            <ul className="text-xs text-[var(--color-ink-soft)] space-y-1 list-disc list-inside">
              <li>Live countdown timer shows remaining window.</li>
              <li>Disputes immediately freeze funds pending governance resolution.</li>
              <li>Once the window elapses peacefully, settlement unlocks.</li>
            </ul>
          </Card>
        </div>

        {/* Step 5 detail: Release vs Refund */}
        <div className="mt-8 space-y-4">
          <h3 className="text-base font-semibold">5. Settlement: Pay or Refund</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-5 border-s-4 border-s-emerald-500 bg-emerald-50/30">
              <div className="font-semibold text-sm text-emerald-900">Outcome A: Care Paid</div>
              <p className="mt-2 text-xs text-[var(--color-ink-soft)] leading-relaxed">
                When the dispute window expires with care confirmed, settlement can be triggered permissionlessly by anyone.
                USDC releases straight to the clinic&apos;s Stellar address, and an immutable care receipt is minted on chain.
              </p>
            </Card>

            <Card className="p-5 border-s-4 border-s-blue-500 bg-blue-50/30">
              <div className="font-semibold text-sm text-blue-900">Outcome B: 100% Refunded</div>
              <p className="mt-2 text-xs text-[var(--color-ink-soft)] leading-relaxed">
                If the patient never attends, or if care is not attested before the expiry deadline, the funder can trigger a complete refund.
                Every single cent committed in USDC returns to the funder with zero fees deducted.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Explore further CTAs */}
      <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6 space-y-4">
        <h2 className="text-lg font-semibold">Ready to explore?</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            Browse verified clinics
          </Link>
          <Link
            href="/attesters"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--color-line)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-canvas)]"
          >
            View attester directory
          </Link>
          <Link
            href="/stats"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--color-line)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-canvas)]"
          >
            Protocol statistics
          </Link>
          <Link
            href="/faq"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--color-line)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-canvas)]"
          >
            Read FAQ
          </Link>
        </div>
      </section>
    </div>
  );
}
