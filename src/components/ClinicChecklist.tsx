'use client';

import { useId } from 'react';

import {
  clinicChecklist,
  type ClinicStatus,
  type ClinicChecklistStep,
} from '@/lib/clinic-checklist';
import { useLocaleContext } from '@/i18n/LocaleContext';

import { Card } from './ui';

const BADGE_STYLES: Record<ClinicChecklistStep['state'], string> = {
  done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  current: 'bg-blue-50 text-blue-700 ring-blue-200',
  pending:
    'bg-[var(--color-canvas)] text-[var(--color-ink-soft)] ring-[var(--color-line)]',
};

const MARK_STYLES: Record<ClinicChecklistStep['state'], string> = {
  done: 'bg-emerald-600 text-white',
  current: 'bg-[var(--color-brand)] text-white',
  pending:
    'border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)]',
};

/**
 * The five steps from registering a clinic to its first payment (#31).
 *
 * Every state comes from the registry standing, the service list and the
 * clinic's vouchers (see `@/lib/clinic-checklist`), so the checklist follows
 * a write without any local progress to keep in sync. Each step says either
 * that it is done or what to do next, and the current step is the only one
 * carrying an instruction.
 */
export function ClinicChecklist({
  status,
  services,
  vouchers,
}: {
  status: ClinicStatus;
  services: { active?: boolean | null }[];
  vouchers: { status: string; isSettleable?: boolean }[];
}) {
  const { t } = useLocaleContext();
  const titleId = useId();
  const steps = clinicChecklist({ status, services, vouchers });
  const done = steps.filter((step) => step.state === 'done').length;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={titleId} className="text-base font-semibold">
          {t('clinic.checklist.title')}
        </h2>
        <span className="text-xs text-[var(--color-ink-soft)]">
          {t('clinic.checklist.progress', { done, total: steps.length })}
        </span>
      </div>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        {t('clinic.checklist.note')}
      </p>

      <ol aria-labelledby={titleId} className="mt-4">
        {steps.map((step, index) => {
          const isDone = step.state === 'done';
          const isCurrent = step.state === 'current';
          return (
            <li
              key={step.id}
              aria-current={isCurrent ? 'step' : undefined}
              className="flex gap-3"
            >
              <span
                aria-hidden="true"
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${MARK_STYLES[step.state]}`}
              >
                {isDone ? '✓' : index + 1}
              </span>
              <div className={`min-w-0 ${index < steps.length - 1 ? 'pb-4' : ''}`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="text-sm font-medium">
                    {t(`clinic.checklist.steps.${step.id}`)}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${BADGE_STYLES[step.state]}`}
                  >
                    {isDone
                      ? t('clinic.checklist.done')
                      : isCurrent
                        ? t('clinic.checklist.next')
                        : t('clinic.checklist.later')}
                  </span>
                </div>
                {isCurrent && step.hint && (
                  <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                    {t(`clinic.checklist.hints.${step.hint}`)}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {done === steps.length && (
        <p className="mt-3 text-sm font-medium text-emerald-700">
          {t('clinic.checklist.allDone')}
        </p>
      )}
    </Card>
  );
}
