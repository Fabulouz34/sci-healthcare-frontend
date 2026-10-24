/**
 * Amounts are i128 on chain and are carried as decimal strings in the UI.
 * Parsing one into a JS number loses precision above 2^53, so this module
 * never does.
 */
export const DECIMALS = 7;
const SCALE = 10n ** BigInt(DECIMALS);

export function toBaseUnits(display: string): bigint {
  const trimmed = display.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Not a valid amount: ${display}`);
  }
  const [whole = '0', frac = ''] = trimmed.split('.');
  const padded = frac.padEnd(DECIMALS, '0').slice(0, DECIMALS);
  return BigInt(whole) * SCALE + BigInt(padded || '0');
}

export function validateAmountInput(display: string, minimum: bigint): string | null {
  const trimmed = display.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return 'Enter a valid amount.';

  const [, fraction = ''] = trimmed.split('.');
  if (fraction.length > DECIMALS) {
    return `Use no more than ${DECIMALS} decimal places.`;
  }

  if (toBaseUnits(trimmed) < minimum) {
    return `The listed price is $${formatUsdc(minimum)}. Enter at least that.`;
  }

  return null;
}

/** Formats base units for display, trimming trailing zeros to 2dp minimum. */
export function formatUsdc(base: string | bigint, locale = 'en'): string {
  const value = typeof base === 'bigint' ? base : BigInt(base);
  const whole = value / SCALE;
  const frac = (value % SCALE).toString().padStart(DECIMALS, '0');
  const trimmed = frac.replace(/0+$/, '').padEnd(2, '0');
  const localeTag = locale === 'fr' ? 'fr-FR' : locale === 'sw' ? 'sw-KE' : 'en-US';
  return `${whole.toLocaleString(localeTag)}.${trimmed}`;
}

/** Formats an amount with currency symbol or code according to the given locale */
export function formatCurrency(
  base: string | bigint,
  currency = 'USD',
  locale = 'en',
): string {
  const formatted = formatUsdc(base, locale);
  if (locale === 'fr') {
    return `${formatted} ${currency}`;
  }
  return `$${formatted}`;
}

export function formatXlm(base: string | bigint): string {
  const value = typeof base === 'bigint' ? base : BigInt(base);
  const whole = value / SCALE;
  const frac = (value % SCALE).toString().padStart(DECIMALS, '0');
  const trimmed = frac.replace(/0+$/, '').padEnd(2, '0');
  return `${whole.toLocaleString('en-US')}.${trimmed}`;
}

/**
 * Formats base units for an editable amount field: no thousands
 * separators, so `toBaseUnits` can parse it back. `formatUsdc` groups
 * digits ("1,000.00"), which `toBaseUnits` rightly rejects.
 */
export function toAmountInput(base: string | bigint): string {
  return formatUsdc(base, 'en').replaceAll(',', '');
}

export function shortAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

export function formatDate(iso: string | Date | null, locale = 'en'): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const localeTag = locale === 'fr' ? 'fr-FR' : locale === 'sw' ? 'sw-KE' : 'en-GB';
  return d.toLocaleDateString(localeTag, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function timeUntil(iso: string | Date | null, now?: number | Date | null): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const currentMs =
    now != null && (typeof now !== 'number' || now > 0)
      ? typeof now === 'number'
        ? now
        : now.getTime()
      : Date.now();
  const ms = d.getTime() - currentMs;
  if (ms <= 0) return 'now';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * Formats elapsed time since a timestamp (e.g., "2h ago", "3d ago").
 * Returns 'just now' for times less than a minute.
 */
export function timeSince(iso: string | Date | null, now?: number | Date | null): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const currentMs =
    now != null && (typeof now !== 'number' || now > 0)
      ? typeof now === 'number'
        ? now
        : now.getTime()
      : Date.now();
  const ms = currentMs - d.getTime();
  if (ms <= 0) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
