import { describe, expect, it } from 'vitest';

import { buildProblemReport, problemReportUrl } from './report-problem';

/**
 * The prefilled report (#138) is the one place user-visible text leaves the
 * app for GitHub, so the unit test is deliberately adversarial: it passes
 * the patient material a careless caller might have around and asserts the
 * report keeps none of it.
 */

const PATIENT_REFERENCE = 'ab'.repeat(32);
const FUNDER = 'GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR';
const SECRET_KEY = 's'.repeat(32);

describe('buildProblemReport', () => {
  it('includes the public voucher details a maintainer needs', () => {
    const report = buildProblemReport({
      id: '42',
      status: 'Claimed',
      service: 'Outpatient consult',
      clinic: 'Ikeja General Clinic',
    });

    expect(report.title).toBe('Problem with voucher #42');
    expect(report.body).toContain('- Voucher: #42');
    expect(report.body).toContain('- Status: Claimed');
    expect(report.body).toContain('- Service: Outpatient consult');
    expect(report.body).toContain('- Clinic: Ikeja General Clinic');
    expect(report.body).toContain('## What happened');
  });

  it('explains that only the funder can open a dispute', () => {
    const report = buildProblemReport({ id: '7', status: 'Attested' });
    expect(report.body).toContain('Only the wallet that funded a voucher can open a dispute');
    expect(report.body.toLowerCase()).toContain('patient');
  });

  it('never includes patient data, the funder address or the secret key', () => {
    const report = buildProblemReport({
      id: '9',
      status: 'Funded',
      service: 'Malaria test',
      clinic: 'Lekki Care Centre',
      // Runtime-only extras: the narrow type is the first line of defence,
      // and the builder must drop these rather than interpolate them.
      beneficiaryRef: PATIENT_REFERENCE,
      funder: FUNDER,
      patientIdentifier: 'CARD-123',
      secretKey: SECRET_KEY,
    } as unknown as Parameters<typeof buildProblemReport>[0]);

    const blob = `${report.title}\n${report.body}`;
    expect(blob).not.toContain(PATIENT_REFERENCE);
    expect(blob).not.toContain(FUNDER);
    expect(blob).not.toContain('CARD-123');
    expect(blob).not.toContain(SECRET_KEY);
    // No 64-hex digest or long hex run can slip through either.
    expect(blob).not.toMatch(/[0-9a-f]{32,}/i);
  });

  it('omits optional details when they are unknown', () => {
    const report = buildProblemReport({ id: '3', status: 'Settled' });
    expect(report.body).not.toContain('- Service:');
    expect(report.body).not.toContain('- Clinic:');
  });
});

describe('problemReportUrl', () => {
  it('opens a prefilled GitHub issue with no patient data in the URL', () => {
    const url = problemReportUrl({
      id: '42',
      status: 'Claimed',
      service: 'Outpatient consult',
      clinic: 'Ikeja General Clinic',
      beneficiaryRef: PATIENT_REFERENCE,
    } as unknown as Parameters<typeof problemReportUrl>[0]);

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      'https://github.com/Godgift-care/sci-healthcare-frontend/issues/new',
    );
    expect(parsed.searchParams.get('title')).toBe('Problem with voucher #42');
    expect(parsed.searchParams.get('body')).toContain('- Voucher: #42');
    expect(decodeURIComponent(url)).not.toContain(PATIENT_REFERENCE);
  });
});
