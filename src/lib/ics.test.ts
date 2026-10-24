import { describe, expect, it } from 'vitest';

import { buildVoucherExpiryIcs } from './ics';

/**
 * The expiry calendar file (#140) must be a valid RFC 5545 `.ics`: correct
 * structure, UTC all-day dates, and public facts only — never patient data.
 */
describe('buildVoucherExpiryIcs', () => {
  const expiresAt = Math.floor(Date.UTC(2026, 11, 24, 23, 59, 59) / 1000);
  const ics = buildVoucherExpiryIcs({
    id: '42',
    expiresAt,
    serviceLabel: 'Outpatient consult',
    voucherUrl: 'https://sci.example/vouchers/42',
  });

  it('is a valid RFC 5545 calendar with CRLF line endings', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0\r\n');
    expect(ics).toContain('CALSCALE:GREGORIAN\r\n');
    expect(ics).toContain('METHOD:PUBLISH\r\n');
    expect(ics).toMatch(/^BEGIN:VEVENT\r\n/m);
    expect(ics).toMatch(/^END:VEVENT\r\n/m);
  });

  it('carries a stable UID and a UTC DTSTAMP', () => {
    expect(ics).toMatch(/^UID:sci-voucher-42-\d+@sci-healthcare\r\n/m);
    expect(ics).toMatch(/^DTSTAMP:\d{8}T\d{6}Z\r\n/m);
  });

  it('places the all-day reminder on the expiry day in UTC (VALUE=DATE)', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20261224\r\n');
    // DTEND is exclusive for all-day events: the day after expiry.
    expect(ics).toContain('DTEND;VALUE=DATE:20261225\r\n');
  });

  it('names the voucher and service, with no patient data', () => {
    expect(ics).toContain('SUMMARY:Voucher expiry — Voucher #42\r\n');
    expect(ics).toContain('Service: Outpatient consult');
    expect(ics).not.toContain('beneficiary');
    expect(ics).not.toMatch(/[0-9a-f]{64}/);
  });

  it('links to the public voucher page only', () => {
    expect(ics).toContain('URL:https://sci.example/vouchers/42\r\n');
  });
});
