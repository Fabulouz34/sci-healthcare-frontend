import { describe, expect, it } from 'vitest';

import { clinicChecklist, type ClinicChecklistInput } from './clinic-checklist';

/** Step states as a compact map, so an assertion reads as the whole list. */
function states(input: ClinicChecklistInput) {
  return Object.fromEntries(
    clinicChecklist(input).map((step) => [step.id, step.state]),
  );
}

const SERVICE = { active: true };
const voucher = (status: string, isSettleable = false) => ({ status, isSettleable });

describe('clinicChecklist', () => {
  it('starts an unregistered wallet on registration', () => {
    const steps = clinicChecklist({ status: 'Unregistered', services: [], vouchers: [] });

    expect(steps.map((step) => step.state)).toEqual([
      'current',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
    expect(steps[0]).toEqual({ id: 'register', state: 'current', hint: 'register' });
  });

  it('marks registration done and waits for verification while pending', () => {
    const steps = clinicChecklist({ status: 'Pending', services: [], vouchers: [] });

    expect(steps[0].state).toBe('done');
    expect(steps[0].hint).toBeNull();
    expect(steps[1]).toEqual({
      id: 'verification',
      state: 'current',
      hint: 'waitingVerification',
    });
    expect(states({ status: 'Pending', services: [], vouchers: [] })).toMatchObject({
      service: 'pending',
      claim: 'pending',
      paid: 'pending',
    });
  });

  it('asks a verified clinic to list its first service', () => {
    const steps = clinicChecklist({ status: 'Active', services: [], vouchers: [] });

    expect(steps.slice(0, 2).map((step) => step.state)).toEqual(['done', 'done']);
    expect(steps[2]).toEqual({ id: 'service', state: 'current', hint: 'listService' });
    expect(steps[3].state).toBe('pending');
  });

  it('does not count a delisted service as listed', () => {
    const steps = clinicChecklist({
      status: 'Active',
      services: [{ active: false }],
      vouchers: [],
    });

    expect(steps[2]).toEqual({ id: 'service', state: 'current', hint: 'listService' });
  });

  it('asks for a funder when nothing has been funded yet', () => {
    const steps = clinicChecklist({
      status: 'Active',
      services: [SERVICE],
      vouchers: [],
    });

    expect(steps[2].state).toBe('done');
    expect(steps[3]).toEqual({ id: 'claim', state: 'current', hint: 'shareClinic' });
  });

  it('points at a waiting voucher when one has been funded', () => {
    const steps = clinicChecklist({
      status: 'Active',
      services: [SERVICE],
      vouchers: [voucher('Funded')],
    });

    expect(steps[3]).toEqual({ id: 'claim', state: 'current', hint: 'claimVoucher' });
  });

  it.each(['Claimed', 'Attested', 'Settled', 'Disputed'])(
    'counts a %s voucher as claimed',
    (status) => {
      expect(
        states({
          status: 'Active',
          services: [SERVICE],
          vouchers: [voucher('Funded'), voucher(status)],
        }).claim,
      ).toBe('done');
    },
  );

  it('does not count a refunded voucher as claimed', () => {
    expect(
      states({
        status: 'Active',
        services: [SERVICE],
        vouchers: [voucher('Refunded')],
      }).claim,
    ).toBe('current');
  });

  it('waits for the attester while care is claimed', () => {
    const steps = clinicChecklist({
      status: 'Active',
      services: [SERVICE],
      vouchers: [voucher('Claimed')],
    });

    expect(steps[3].state).toBe('done');
    expect(steps[4]).toEqual({ id: 'paid', state: 'current', hint: 'waitingAttester' });
  });

  it('waits for the dispute window once care is attested', () => {
    const steps = clinicChecklist({
      status: 'Active',
      services: [SERVICE],
      vouchers: [voucher('Attested')],
    });

    expect(steps[4].hint).toBe('waitingDisputeWindow');
  });

  it('offers to release the payment once a voucher is settleable', () => {
    const steps = clinicChecklist({
      status: 'Active',
      services: [SERVICE],
      vouchers: [voucher('Attested', true)],
    });

    expect(steps[4]).toEqual({ id: 'paid', state: 'current', hint: 'releasePayment' });
  });

  it('explains that a dispute freezes the payout', () => {
    const steps = clinicChecklist({
      status: 'Active',
      services: [SERVICE],
      vouchers: [voucher('Disputed')],
    });

    expect(steps[4]).toEqual({ id: 'paid', state: 'current', hint: 'disputed' });
  });

  it('marks every step done after the first settlement', () => {
    const steps = clinicChecklist({
      status: 'Active',
      services: [SERVICE],
      vouchers: [voucher('Claimed'), voucher('Settled', true)],
    });

    expect(steps.map((step) => step.state)).toEqual([
      'done',
      'done',
      'done',
      'done',
      'done',
    ]);
    expect(steps.every((step) => step.hint === null)).toBe(true);
  });

  it('stops a suspended clinic at verification, whatever its history', () => {
    const steps = clinicChecklist({
      status: 'Suspended',
      services: [SERVICE],
      vouchers: [voucher('Settled', true)],
    });

    expect(steps[0].state).toBe('done');
    expect(steps[1]).toEqual({
      id: 'verification',
      state: 'current',
      hint: 'suspended',
    });
    // Historical achievements stay visible; only the blocked step is current.
    expect(steps[2].state).toBe('done');
    expect(steps[4].state).toBe('done');
  });
});
