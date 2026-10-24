'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { beneficiaryRef } from '@/lib/beneficiary';

import { Alert, Button } from './ui';

type CheckResult = 'idle' | 'checking' | 'match' | 'no-match';

/**
 * Point-of-care patient check (#33).
 *
 * The patient, or whoever holds their key, types the patient reference and
 * secret key on the clinic's device. `beneficiaryRef` hashes them here, in
 * this browser, and the digest is compared with the voucher's beneficiary
 * reference. Neither value is sent to the API, logged, put in a URL, or
 * written to storage — only the match result leaves this component.
 *
 * It proves control of this voucher's key. It does not prove identity: a
 * copied key, a relative, or clinic staff holding the key also match.
 */
export function VerifyPatient({
  expectedRef,
  onVerifiedChange,
}: {
  /** The voucher's on-chain beneficiary reference. */
  expectedRef: string;
  /** Receives only the match result; the typed values stay here. */
  onVerifiedChange?: (verified: boolean) => void;
}) {
  const identifierId = useId();
  const keyId = useId();
  const [identifier, setIdentifier] = useState('');
  const [key, setKey] = useState('');
  const [result, setResult] = useState<CheckResult>('idle');
  const [error, setError] = useState('');

  // A check that resolves after the panel closed must not enable claiming.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Any edit starts a new check: a previous match no longer applies, even
   * one made before the panel was collapsed and reopened.
   */
  function edited(setValue: (value: string) => void, value: string) {
    setValue(value);
    setResult('idle');
    setError('');
    onVerifiedChange?.(false);
  }

  async function check() {
    if (!identifier.trim() || !key) return;
    setResult('checking');
    setError('');
    try {
      const derived = await beneficiaryRef(identifier, key);
      if (!mounted.current) return;
      if (derived === expectedRef.trim().toLowerCase()) {
        setResult('match');
        onVerifiedChange?.(true);
        // Keep nothing once the check is done: the match is now just a
        // boolean in the row, and the panel shows no patient details.
        setIdentifier('');
        setKey('');
      } else {
        setResult('no-match');
        onVerifiedChange?.(false);
      }
    } catch (err) {
      if (!mounted.current) return;
      setResult('idle');
      setError(err instanceof Error ? err.message : 'Could not check those details.');
      onVerifiedChange?.(false);
    }
  }

  const checking = result === 'checking';
  const canCheck = !checking && identifier.trim() !== '' && key !== '';

  // Enter checks, but the panel is deliberately not a <form>: submitting a
  // password field is what makes browsers and password managers offer to
  // save it, and nothing here may be stored.
  function onEnter(event: KeyboardEvent) {
    if (event.key !== 'Enter' || !canCheck) return;
    event.preventDefault();
    void check();
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={identifierId} className="block">
          <span className="text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
            Patient reference
          </span>
          <input
            id={identifierId}
            type="text"
            value={identifier}
            onChange={(event) => edited(setIdentifier, event.target.value)}
            onKeyDown={onEnter}
            disabled={checking}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="the reference the funder gave them"
            className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          />
        </label>
        <label htmlFor={keyId} className="block">
          <span className="text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
            Patient secret key
          </span>
          <input
            id={keyId}
            type="password"
            value={key}
            onChange={(event) => edited(setKey, event.target.value)}
            onKeyDown={onEnter}
            disabled={checking}
            autoComplete="new-password"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="the key kept by the patient"
            className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          disabled={!canCheck}
          onClick={() => void check()}
        >
          {checking ? 'Checking…' : 'Check patient'}
        </Button>
        <p className="text-xs text-[var(--color-ink-soft)]">
          Used only for this check — never stored or sent.
        </p>
      </div>

      <div role="status" aria-live="polite">
        {result === 'match' && (
          <Alert kind="success">
            <span className="font-medium">Match.</span> These details belong to this
            voucher&apos;s patient reference.
          </Alert>
        )}
        {result === 'no-match' && (
          <Alert>
            <span className="font-medium">No match.</span> These details do not belong
            to this voucher. Check the reference and key with the patient before
            claiming.
          </Alert>
        )}
        {error && <Alert>{error}</Alert>}
      </div>

      <div className="space-y-1 text-xs leading-relaxed text-[var(--color-ink-soft)]">
        <p>
          <span className="font-medium text-[var(--color-ink)]">What a match proves:</span>{' '}
          whoever entered this key is the patient this voucher was funded for, or
          holds their key.
        </p>
        <p>
          <span className="font-medium text-[var(--color-ink)]">What it does not:</span>{' '}
          that the person is who they say they are, or that this care is the right
          care. A copied key or a relative acting for the patient also matches. Check
          identity the way your clinic normally does.
        </p>
      </div>
    </div>
  );
}
