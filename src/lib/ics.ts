/**
 * Builds an `.ics` calendar reminder for a voucher's expiry.
 *
 * - Valid RFC 5545 (`VERSION:2.0`, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`).
 * - Correct time zone: all-day `VALUE=DATE` entries, so the reminder lands on
 *   the voucher's expiry day in UTC with no floating local-time ambiguity.
 * - Public facts only: voucher number, service and a public voucher URL — no
 *   patient or beneficiary data.
 */
export function buildVoucherExpiryIcs({
  id,
  expiresAt,
  serviceLabel,
  voucherUrl,
}: {
  id: string;
  /** unix seconds, the voucher's `expires_at` */
  expiresAt: number;
  serviceLabel: string;
  voucherUrl: string;
}): string {
  const stamp = new Date();
  const expiry = new Date(expiresAt * 1000);
  // DTEND is exclusive for all-day events, so the reminder spans the expiry day.
  const dayAfter = new Date(expiry.getTime() + 86_400_000);
  const uid = `sci-voucher-${id}-${expiresAt}@sci-healthcare`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SCI Healthcare//Voucher Expiry//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsTimestamp(stamp)}`,
    `DTSTART;VALUE=DATE:${formatIcsDate(expiry)}`,
    `DTEND;VALUE=DATE:${formatIcsDate(dayAfter)}`,
    `SUMMARY:Voucher expiry — Voucher #${id}`,
    `DESCRIPTION:Care must be provided before this voucher expires.\\n\\nVoucher: #${id}\\nService: ${escapeText(serviceLabel)}\\n\\nThis calendar entry contains no personal data.`,
    `URL:${voucherUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n') + '\r\n';
}

/** `YYYYMMDD` in UTC. */
function formatIcsDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
  ].join('');
}

/** `YYYYMMDDTHHMMSSZ` in UTC. */
function formatIcsTimestamp(date: Date): string {
  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
    'T',
    pad2(date.getUTCHours()),
    pad2(date.getUTCMinutes()),
    pad2(date.getUTCSeconds()),
    'Z',
  ].join('');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Escape text for an iCalendar property value (RFC 5545). */
function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
