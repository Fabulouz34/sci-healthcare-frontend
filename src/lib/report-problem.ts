/**
 * Prefilled problem report for a voucher (#138).
 *
 * Only the funder can open a dispute in the contract, but a patient, a
 * relative or a bystander may be the first to notice something wrong. This
 * builds a GitHub issue whose template asks for the missing description and
 * carries only facts that are already public on the ledger: the voucher
 * number, its status, the service category and the clinic's public name.
 *
 * Nothing identifying is accepted or copied into the report. In particular
 * the beneficiary reference, the funder address, the patient identifier and
 * the HMAC key have no place in the payload — the caller passes a narrow
 * shape and any extra properties are dropped rather than interpolated.
 */

export const PROBLEM_REPORT_REPOSITORY =
  'https://github.com/Godgift-care/sci-healthcare-frontend';

export type ProblemReportVoucher = {
  /** Public voucher number. */
  id: string;
  /** Public lifecycle status, e.g. `Claimed`. */
  status: string;
  /** Coarse service category; never a diagnosis. */
  service?: string | null;
  /** Public clinic name from the directory. */
  clinic?: string | null;
};

export type ProblemReport = {
  title: string;
  body: string;
};

/**
 * The text that lands in the GitHub issue body. Kept as a pure function so
 * it is unit-tested and so no component can accidentally add a field.
 */
export function buildProblemReport(voucher: ProblemReportVoucher): ProblemReport {
  const title = `Problem with voucher #${voucher.id}`;
  const publicDetails = [
    `- Voucher: #${voucher.id}`,
    `- Status: ${voucher.status}`,
  ];
  if (voucher.service) publicDetails.push(`- Service: ${voucher.service}`);
  if (voucher.clinic) publicDetails.push(`- Clinic: ${voucher.clinic}`);

  const body = [
    '## What happened',
    '',
    '<!-- Describe the problem you noticed. Please do not include a patient name,',
    'clinic card number, patient reference, secret key or any other identifying',
    'health information. This issue is public. -->',
    '',
    '## Public voucher details',
    '',
    ...publicDetails,
    '',
    '## Who can open a dispute',
    '',
    'Only the wallet that funded a voucher can open a dispute from the app.',
    'If you are the patient, a relative, or anyone else who has noticed a',
    'problem, a maintainer will review this report and follow up. Do not post',
    'medical records or patient identifiers here.',
    '',
    '_The patient reference was deliberately left out of this report: it is an',
    'opaque digest and this issue is public._',
  ].join('\n');

  return { title, body };
}

/** A prefilled "new issue" URL with no patient data in it. */
export function problemReportUrl(voucher: ProblemReportVoucher): string {
  const { title, body } = buildProblemReport(voucher);
  const params = new URLSearchParams({ title, body });
  return `${PROBLEM_REPORT_REPOSITORY}/issues/new?${params.toString()}`;
}
