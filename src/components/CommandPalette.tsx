'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Provider } from '@/lib/api';
import { useAdminAccess, useProviders } from '@/lib/hooks';
import { useWallet } from '@/lib/wallet';
import { Modal } from '@/components/ui';

type Command = {
  id: string;
  label: string;
  description: string;
  href: string;
};

const PAGES: Command[] = [
  { id: 'clinics', label: 'Clinics', description: 'Browse verified clinics', href: '/' },
  { id: 'how-it-works', label: 'How it works', description: 'Learn about care vouchers', href: '/how-it-works' },
  { id: 'my-vouchers', label: 'My vouchers', description: 'View funded vouchers', href: '/my' },
  { id: 'clinic-desk', label: 'Clinic desk', description: 'Manage a clinic', href: '/clinic' },
  { id: 'attest', label: 'Attest', description: 'Review care claims', href: '/attest' },
  { id: 'attesters', label: 'Attesters', description: 'View trusted attesters', href: '/attesters' },
  { id: 'stats', label: 'Stats', description: 'View protocol statistics', href: '/stats' },
  { id: 'faq', label: 'FAQ', description: 'Frequently asked questions', href: '/faq' },
  { id: 'privacy', label: 'Privacy', description: 'Privacy information', href: '/privacy' },
];

function clinicCommand(provider: Provider): Command {
  return {
    id: `clinic-${provider.address}`,
    label: provider.name,
    description: `${provider.country} clinic`,
    href: `/clinics/${provider.address}`,
  };
}

function matches(command: Command, query: string): boolean {
  const value = query.trim().toLocaleLowerCase();
  return !value || `${command.label} ${command.description}`.toLocaleLowerCase().includes(value);
}

export function CommandPalette() {
  const router = useRouter();
  const { address } = useWallet();
  const { isAdmin } = useAdminAccess(address);
  const { providers } = useProviders({ status: 'Active' });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { commands, voucherCommand } = useMemo(() => {
    const term = query.trim();
    const pageCommands = isAdmin
      ? [...PAGES, { id: 'admin', label: 'Admin', description: 'Administration', href: '/admin' }]
      : PAGES;
    const pages = pageCommands.filter((command) => matches(command, term));
    const clinics = term
      ? providers
          .filter((provider) =>
            `${provider.name} ${provider.country} ${provider.services.map((service) => service.label).join(' ')}`
              .toLocaleLowerCase()
              .includes(term.toLocaleLowerCase()),
          )
          .map(clinicCommand)
      : [];
    const voucherId = term.replace(/^#/, '');
    const voucher = /^\d+$/.test(voucherId)
      ? {
          id: `voucher-${voucherId}`,
          label: `Open voucher #${voucherId}`,
          description: 'Go to voucher number',
          href: `/vouchers/${encodeURIComponent(voucherId)}`,
        }
      : null;
    return { commands: [...pages, ...clinics], voucherCommand: voucher };
  }, [isAdmin, providers, query]);
  const results = voucherCommand ? [voucherCommand, ...commands] : commands;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => {
          if (!current) {
            setQuery('');
            setActiveIndex(0);
          }
          return !current;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  function navigate(command: Command) {
    close();
    router.push(command.href);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (results.length ? (index + 1) % results.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (results.length ? (index - 1 + results.length) % results.length : 0));
    } else if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      navigate(results[activeIndex]);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Go to">
      <label htmlFor="command-search" className="sr-only">
        Search clinics, pages, or voucher number
      </label>
      <input
        ref={inputRef}
        id="command-search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls="command-results"
        aria-activedescendant={results[activeIndex] ? `command-option-${activeIndex}` : undefined}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={onInputKeyDown}
        placeholder="Search clinics, pages, or voucher number"
        className="h-12 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-base text-[var(--color-ink)] outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
      />
      <ul
        id="command-results"
        role="listbox"
        aria-label="Navigation results"
        className="mt-2 max-h-[min(55vh,24rem)] overflow-y-auto"
      >
        {results.map((command, index) => (
          <li
            key={command.id}
            id={`command-option-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => navigate(command)}
            className={`flex min-h-12 cursor-pointer flex-col justify-center rounded-md px-3 py-2 ${
              index === activeIndex
                ? 'bg-[var(--color-canvas)] text-[var(--color-ink)]'
                : 'text-[var(--color-ink-soft)]'
            }`}
          >
            <span className="font-medium text-[var(--color-ink)]">{command.label}</span>
            <span className="text-xs">{command.description}</span>
          </li>
        ))}
        {results.length === 0 && (
          <li role="option" aria-selected="false" className="px-3 py-4 text-sm text-[var(--color-ink-soft)]">
            No matching destinations
          </li>
        )}
      </ul>
      <p className="sr-only" aria-live="polite">
        {results.length} {results.length === 1 ? 'result' : 'results'}
      </p>
    </Modal>
  );
}