/**
 * Onboarding checklist for the clinic desk (#31).
 *
 * A newly registered clinic sees five steps between registration and its
 * first payment, and each step is derived from what the indexer and the
 * registry already say: the clinic's standing, its listed services and the
 * vouchers it has received. Keeping that derivation pure means the states
 * can be pinned across every stage without a wallet, a network or a DOM.
 */

/** The registry standing, plus the "no entry" case the desk shows. */
export type ClinicStatus = 'Unregistered' | 'Pending' | 'Active' | 'Suspended';

export const CHECKLIST_STEP_IDS = [
  'register',
  'verification',
  'service',
  'claim',
  'paid',
] as const;

export type ChecklistStepId = (typeof CHECKLIST_STEP_IDS)[number];

export type ChecklistStepState = 'done' | 'current' | 'pending';

/**
 * What to do next, when a step is the current one. The desk translates the
 * code, so the copy stays in the message catalogues rather than here.
 */
export type ChecklistHint =
  | 'register'
  | 'waitingVerification'
  | 'suspended'
  | 'listService'
  | 'claimVoucher'
  | 'shareClinic'
  | 'waitingAttester'
  | 'waitingDisputeWindow'
  | 'disputed'
  | 'releasePayment';

export type ClinicChecklistStep = {
  id: ChecklistStepId;
  state: ChecklistStepState;
  /** Present only for the current step. */
  hint: ChecklistHint | null;
};

export type ClinicChecklistInput = {
  status: ClinicStatus;
  /** The clinic's service list; inactive rows are delisted. */
  services: { active?: boolean | null }[];
  /** Every voucher the clinic has received, or as many as are loaded. */
  vouchers: { status: string; isSettleable?: boolean }[];
};

/** Statuses a voucher reaches only after the clinic marked the patient seen. */
const CLAIMED_STATUSES = new Set(['Claimed', 'Attested', 'Settled', 'Disputed']);

/**
 * The five steps, in order, each done/current/pending.
 *
 * The first unfinished step is `current`; the ones after it are `pending`.
 * A suspended clinic cannot list services or be paid, so verification stays
 * the current step (with the "contact the administrator" hint) even though
 * the clinic has registered.
 */
export function clinicChecklist({
  status,
  services,
  vouchers,
}: ClinicChecklistInput): ClinicChecklistStep[] {
  const registered = status !== 'Unregistered';
  // A suspended clinic was verified once, but it is not in good standing
  // now and none of the later steps can proceed from here.
  const verified = status === 'Active';
  const hasService = services.some((service) => service.active !== false);
  const claimed = vouchers.some((voucher) => CLAIMED_STATUSES.has(voucher.status));
  const paid = vouchers.some((voucher) => voucher.status === 'Settled');

  const funded = vouchers.some((voucher) => voucher.status === 'Funded');
  const disputed = vouchers.some((voucher) => voucher.status === 'Disputed');
  const settleable = vouchers.some((voucher) => voucher.isSettleable === true);
  const attested = vouchers.some((voucher) => voucher.status === 'Attested');

  const paidHint: ChecklistHint = disputed
    ? 'disputed'
    : settleable
      ? 'releasePayment'
      : attested
        ? 'waitingDisputeWindow'
        : 'waitingAttester';

  const steps: { id: ChecklistStepId; done: boolean; hint: ChecklistHint }[] = [
    { id: 'register', done: registered, hint: 'register' },
    {
      id: 'verification',
      done: verified,
      hint: status === 'Suspended' ? 'suspended' : 'waitingVerification',
    },
    { id: 'service', done: hasService, hint: 'listService' },
    { id: 'claim', done: claimed, hint: funded ? 'claimVoucher' : 'shareClinic' },
    { id: 'paid', done: paid, hint: paidHint },
  ];

  let currentTaken = false;
  return steps.map(({ id, done, hint }) => {
    if (done) return { id, state: 'done', hint: null };
    if (!currentTaken) {
      currentTaken = true;
      return { id, state: 'current', hint };
    }
    return { id, state: 'pending', hint: null };
  });
}
