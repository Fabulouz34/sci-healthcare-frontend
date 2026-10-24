'use client';

import { useState } from 'react';
import Link from 'next/link';

interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  docTitle: string;
  docUrl: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'patient-never-attends',
    category: 'Vouchers & Lifecycle',
    question: 'What happens if the patient never goes to the clinic?',
    answer:
      'If the patient does not attend and the voucher expires unclaimed, the funder gets 100% of their money back. Funds remain safely in the contract escrow until the expiration date. Once expired, anyone can trigger the permissionless refund function to return the entire USDC amount to the funder’s wallet without any fee penalty.',
    docTitle: 'Voucher Lifecycle: Funded & Expiry',
    docUrl:
      'https://github.com/Godgift-care/sci-healthcare-contracts/blob/main/docs/protocol/lifecycle.md#funded',
  },
  {
    id: 'claimed-never-attested',
    category: 'Vouchers & Lifecycle',
    question:
      'What happens if a clinic claims a voucher, but no attester confirms the visit?',
    answer:
      'To prevent a clinic from holding a funder’s money hostage with an unconfirmed claim, the protocol enforces a 7-day claim grace period. If a voucher is marked as claimed by a clinic but is never confirmed by an independent attester within 7 days past the voucher’s expiration date, the voucher becomes fully refundable, and the complete amount is returned to the funder.',
    docTitle: 'Voucher Lifecycle: Claim Grace Period',
    docUrl:
      'https://github.com/Godgift-care/sci-healthcare-contracts/blob/main/docs/protocol/lifecycle.md#claimed',
  },
  {
    id: 'who-are-attesters',
    category: 'Trust & Verification',
    question: 'Who are attesters and what role do they play?',
    answer:
      'Attesters are trusted independent third parties (such as community health liaisons, NGO inspectors, or verified observers) appointed by protocol governance to confirm that physical healthcare delivery occurred. Smart contracts strictly prevent clinics from attesting their own care to eliminate conflict of interest and fraudulent self-settlement.',
    docTitle: 'Trust Model: Attesters & Separation of Powers',
    docUrl:
      'https://github.com/Godgift-care/sci-healthcare-contracts/blob/main/docs/protocol/trust.md#attesters',
  },
  {
    id: 'protocol-fees',
    category: 'Economics & Costs',
    question: 'What are the protocol fees and transaction costs?',
    answer:
      'The protocol takes a transparent fee of 100 basis points (1.0%) only upon successful settlement when care has been attested. Funding a voucher is free, and refunds on unrendered care are 100% free with zero fees retained. Stellar network transaction fees are paid in XLM and typically amount to fractions of a cent (around 0.00001 XLM per transaction).',
    docTitle: 'Protocol Economics: Fees & Network Costs',
    docUrl:
      'https://github.com/Godgift-care/sci-healthcare-contracts/blob/main/docs/protocol/economics.md#the-fee',
  },
  {
    id: 'dispute-process',
    category: 'Vouchers & Lifecycle',
    question: 'How does the dispute process work if care was not delivered?',
    answer:
      'After an attester confirms care, a mandatory 72-hour dispute window opens before funds can be settled to the clinic. During this window, the funder can raise a dispute specifying a standard reason code (such as patient not seen, inadequate care, or incorrect service). While disputed, funds stay in escrow until resolved by protocol governance.',
    docTitle: 'Voucher Lifecycle: Disputes & Resolution',
    docUrl:
      'https://github.com/Godgift-care/sci-healthcare-contracts/blob/main/docs/protocol/lifecycle.md#disputed',
  },
  {
    id: 'can-admin-steal',
    category: 'Trust & Verification',
    question: 'Can a contract administrator steal or redirect escrowed funds?',
    answer:
      'No. The smart contracts are mathematically constrained: funds in escrow can only ever go to the specified clinic upon valid settlement or return to the funder upon refund or resolved dispute. There is no code path or administrative backdoor that permits transferring escrowed funds to an administrator, the protocol treasury, or an arbitrary third-party address.',
    docTitle: 'Trust Model: What the Contract Guarantees',
    docUrl:
      'https://github.com/Godgift-care/sci-healthcare-contracts/blob/main/docs/protocol/trust.md#what-the-contract-does-guarantee',
  },
  {
    id: 'on-chain-privacy',
    category: 'Privacy & Security',
    question: 'Is any private medical or patient health data stored on chain?',
    answer:
      'No. The protocol enforces a strict zero-PHI (Protected Health Information) rule. No patient names, phone numbers, birthdates, clinical notes, or diagnoses are ever written to the ledger or sent across the network. Vouchers record only broad service category codes (e.g., outpatient consult) and an opaque 32-byte hash.',
    docTitle: 'Protocol Privacy: On-Chain Data Rules',
    docUrl:
      'https://github.com/Godgift-care/sci-healthcare-contracts/blob/main/docs/protocol/privacy.md#what-is-on-chain',
  },
  {
    id: 'beneficiary-reference',
    category: 'Privacy & Security',
    question: 'How is patient identity protected by the beneficiary reference?',
    answer:
      'Beneficiary references are computed locally in the browser using Web Crypto HMAC-SHA256 from a patient identifier (e.g., clinic card number) and a private secret key. The identifier and secret key never leave the browser. This provides pseudonymous care records that allow repeat visits to be tracked by authorized parties without exposing identities on-chain.',
    docTitle: 'Protocol Privacy: Beneficiary References',
    docUrl:
      'https://github.com/Godgift-care/sci-healthcare-contracts/blob/main/docs/protocol/privacy.md#beneficiary-references',
  },
  {
    id: 'no-float',
    category: 'Economics & Costs',
    question: 'Why is there no general float or pool balance held in the protocol?',
    answer:
      'SCI Healthcare operates strictly as purpose-bound, prepaid escrow rather than a pooled fund or banking deposit. Money enters the contract only as a voucher already earmarked for a specific clinic, service, and expiry date. This eliminates pooling risk, prevents insolvency, and conforms to non-custodial prepaid regulatory standards.',
    docTitle: 'Protocol Economics: Why There is No Float',
    docUrl:
      'https://github.com/Godgift-care/sci-healthcare-contracts/blob/main/docs/protocol/economics.md#why-there-is-no-float',
  },
  {
    id: 'who-triggers-actions',
    category: 'Vouchers & Lifecycle',
    question: 'Who can trigger settlement and refund transactions?',
    answer:
      'Settlement (after the 72-hour dispute window concludes) and refunds (after voucher expiry or the 7-day claim grace period) are permissionless functions. Any user, clinic, or automated keeper service can execute them. Clinics never have to chase funders for payment, and funders never need special permission to reclaim unspent money.',
    docTitle: 'Protocol Economics: Who Pays and Triggers Actions',
    docUrl:
      'https://github.com/Godgift-care/sci-healthcare-contracts/blob/main/docs/protocol/economics.md#who-pays-what',
  },
  {
    id: 'how-clinics-verified',
    category: 'Trust & Verification',
    question: 'How are clinics verified before listing services?',
    answer:
      'Clinics submit their registration details through the Clinic Desk. Verifiers validate physical credentials, facility licenses, and accreditation off-chain before activating the clinic in the on-chain registry contract. Unverified or suspended clinics cannot claim vouchers or receive escrowed funds.',
    docTitle: 'Trust Model: The Clinic Registry',
    docUrl:
      'https://github.com/Godgift-care/sci-healthcare-contracts/blob/main/docs/protocol/trust.md#the-registry',
  },
  {
    id: 'what-currencies-supported',
    category: 'Economics & Costs',
    question: 'What currency is used and how can I get test funds?',
    answer:
      'The protocol settles vouchers in USDC on the Stellar blockchain. On the Stellar Testnet, visitors can claim 50 test USDC daily from the integrated faucet contract via "My vouchers" to test creating and settling vouchers without using real money.',
    docTitle: 'Protocol Economics: Testnet USDC Faucet',
    docUrl:
      'https://github.com/Godgift-care/sci-healthcare-contracts/blob/main/docs/protocol/economics.md#worked-numbers-at-1',
  },
];

export default function FaqPage() {
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(['patient-never-attends', 'claimed-never-attested', 'who-are-attesters']),
  );

  const toggleItem = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setOpenIds(new Set(FAQ_ITEMS.map((item) => item.id)));
  };

  const collapseAll = () => {
    setOpenIds(new Set());
  };

  const categories = Array.from(new Set(FAQ_ITEMS.map((item) => item.category)));

  return (
    <article className="mx-auto max-w-3xl space-y-10">
      <header className="space-y-3">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800 ring-1 ring-inset ring-blue-200">
          Knowledge Base &amp; FAQ
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Frequently Asked Questions</h1>
        <p className="text-base leading-relaxed text-[var(--color-ink-soft)]">
          Answers to common questions about how SCI Healthcare vouchers work, who
          verifies care delivery, fees, and cryptographic patient privacy.
        </p>
        <div className="flex items-center gap-3 pt-2 text-xs">
          <button
            type="button"
            onClick={expandAll}
            className="font-medium text-[var(--color-brand)] hover:underline"
          >
            Expand all
          </button>
          <span className="text-[var(--color-line)]">|</span>
          <button
            type="button"
            onClick={collapseAll}
            className="font-medium text-[var(--color-ink-soft)] hover:underline"
          >
            Collapse all
          </button>
        </div>
      </header>

      <div className="space-y-8">
        {categories.map((category) => {
          const items = FAQ_ITEMS.filter((i) => i.category === category);
          return (
            <section key={category} className="space-y-3">
              <h2 className="text-lg font-semibold tracking-tight text-[var(--color-ink)]">
                {category}
              </h2>
              <div className="divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
                {items.map((item) => {
                  const isOpen = openIds.has(item.id);
                  const contentId = `faq-content-${item.id}`;
                  const buttonId = `faq-button-${item.id}`;

                  return (
                    <div key={item.id} className="p-4 sm:p-5">
                      <button
                        type="button"
                        id={buttonId}
                        aria-expanded={isOpen}
                        aria-controls={contentId}
                        onClick={() => toggleItem(item.id)}
                        className="flex w-full items-start justify-between gap-4 text-start font-medium text-[var(--color-ink)] transition hover:text-[var(--color-brand)]"
                      >
                        <span className="text-sm sm:text-base">{item.question}</span>
                        <span
                          aria-hidden="true"
                          className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[var(--color-line)] text-xs transition-transform duration-200 ${
                            isOpen ? 'rotate-180 bg-[var(--color-canvas)] text-[var(--color-ink)]' : 'text-[var(--color-ink-soft)]'
                          }`}
                        >
                          ▼
                        </span>
                      </button>

                      {isOpen && (
                        <div
                          id={contentId}
                          role="region"
                          aria-labelledby={buttonId}
                          className="mt-3 space-y-3 text-sm leading-relaxed text-[var(--color-ink-soft)]"
                        >
                          <p>{item.answer}</p>
                          <div className="pt-1">
                            <a
                              href={item.docUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-brand)] hover:underline"
                            >
                              <span>Source: {item.docTitle}</span>
                              <span aria-hidden="true">&rarr;</span>
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <footer className="rounded-xl border border-[var(--color-line)] bg-[var(--color-canvas)] p-6 text-center space-y-2">
        <h3 className="text-base font-semibold">Have more questions?</h3>
        <p className="text-xs text-[var(--color-ink-soft)] max-w-md mx-auto">
          Read our in-depth protocol architecture documentation or review how patient data is protected.
        </p>
        <div className="flex justify-center gap-4 pt-2 text-xs font-medium">
          <Link href="/privacy" className="text-[var(--color-brand)] hover:underline">
            Privacy Architecture &rarr;
          </Link>
          <a
            href="https://godgift-care.github.io/sci-healthcare-contracts/"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--color-brand)] hover:underline"
          >
            Protocol Docs &rarr;
          </a>
        </div>
      </footer>
    </article>
  );
}
