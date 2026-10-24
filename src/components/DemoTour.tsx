'use client';

import Link from 'next/link';
import { useState } from 'react';

import { isTestnet } from '@/lib/config';
import { markTourDone, useTourDone } from '@/lib/tour';

import { Button, Card, Modal } from './ui';

type Step = {
  title: string;
  body: string;
  href: string;
  cta: string;
};

/**
 * Optional guided tour for reviewers and first-time visitors: the three
 * steps that show the whole product (get test USDC, fund care, follow the
 * voucher).
 *
 * Offered as a card on the home page rather than an overlay that opens on
 * its own, so it never blocks navigation. Completing or dismissing it is
 * remembered (`src/lib/tour.ts`). The faucet step is testnet-only, so a
 * mainnet build leads with connecting a wallet instead.
 */
export function DemoTour() {
  const done = useTourDone();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  if (done) return null;

  const steps: Step[] = [
    isTestnet
      ? {
          title: 'Get test USDC',
          body: 'Connect a testnet wallet and draw demo USDC from the faucet — one top-up per wallet per day.',
          href: '/my',
          cta: 'Open My vouchers',
        }
      : {
          title: 'Connect your wallet',
          body: 'Connect a Stellar wallet that holds USDC. The app never sees your secret key; your wallet signs every transaction.',
          href: '/my',
          cta: 'Open My vouchers',
        },
    {
      title: 'Fund care for a clinic',
      body: 'Pick a verified clinic and the service your family needs. The money is escrowed by the contract, not sent to the clinic yet.',
      href: '/',
      cta: 'Browse clinics',
    },
    {
      title: 'Follow the voucher',
      body: 'Every voucher has its own page with its on-chain history, receipt and the actions you can take. It is safe to share by link.',
      href: '/my',
      cta: 'See your vouchers',
    },
  ];

  const step = steps[index];
  const isLast = index === steps.length - 1;

  function finish() {
    setOpen(false);
    markTourDone();
  }

  return (
    <>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl">
            <h2 className="text-sm font-semibold">New here? Take the demo tour</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              {isTestnet
                ? 'Three steps through the whole product: get test USDC, fund a voucher, then follow it to the receipt.'
                : 'Three steps through the whole product: connect a wallet, fund a voucher, then follow it to the receipt.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setOpen(true)}>Take the tour</Button>
            <button
              type="button"
              onClick={finish}
              aria-label="Dismiss the demo tour"
              className="rounded-md px-2 py-1 text-lg leading-none text-[var(--color-ink-soft)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]"
            >
              ×
            </button>
          </div>
        </div>
      </Card>

      <Modal
        open={open}
        onClose={finish}
        title={`Demo tour — step ${index + 1} of ${steps.length}`}
        actions={
          <>
            <Button
              variant="ghost"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              Back
            </Button>
            {isLast ? (
              <Button onClick={finish}>Finish</Button>
            ) : (
              <Button onClick={() => setIndex((i) => i + 1)}>Next</Button>
            )}
            <Button variant="ghost" onClick={finish}>
              Skip
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{step.title}</h3>
          <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
            {step.body}
          </p>
          <Link
            href={step.href}
            onClick={finish}
            className="inline-block text-sm text-[var(--color-brand)] underline underline-offset-2 hover:opacity-80"
          >
            {step.cta}{' '}
            {/* Points onwards, so it follows the reading direction (#131). */}
            <span aria-hidden className="inline-block rtl-flip">
              →
            </span>
          </Link>
        </div>
      </Modal>
    </>
  );
}
