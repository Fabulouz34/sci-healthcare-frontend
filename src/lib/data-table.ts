export type SortDirection = 'ascending' | 'descending';

export interface SortState {
  key: string;
  direction: SortDirection;
}

function isMissing(value: string | number | null | undefined): boolean {
  return value === null || value === undefined || value === '';
}

/**
 * Compares two present cell values. Numbers compare numerically; everything
 * else compares as text using natural, case-insensitive collation so that
 * "item2" sorts before "item10".
 */
export function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/**
 * Returns a new array sorted by `accessor`. Missing values (`null`, `undefined`
 * or an empty string) always sort last, in both directions, so that an empty
 * cell never jumps to the top of a descending sort.
 */
export function sortRows<T>(
  rows: readonly T[],
  accessor: (row: T) => string | number | null | undefined,
  direction: SortDirection,
): T[] {
  const factor = direction === 'descending' ? -1 : 1;
  return [...rows].sort((left, right) => {
    const a = accessor(left);
    const b = accessor(right);
    const aMissing = isMissing(a);
    const bMissing = isMissing(b);
    if (aMissing || bMissing) {
      if (aMissing && bMissing) return 0;
      return aMissing ? 1 : -1;
    }
    return factor * compareValues(a as string | number, b as string | number);
  });
}

/**
 * Cycles a column's sort direction: a new column starts ascending, and
 * re-activating the current column toggles between ascending and descending.
 */
export function nextSortDirection(current: SortState | null, key: string): SortState {
  if (!current || current.key !== key) {
    return { key, direction: 'ascending' };
  }
  return {
    key,
    direction: current.direction === 'ascending' ? 'descending' : 'ascending',
  };
}
