import { describe, expect, it } from 'vitest';

import { compareValues, nextSortDirection, sortRows } from './data-table';

describe('compareValues', () => {
  it('compares numbers numerically', () => {
    expect(compareValues(2, 10)).toBeLessThan(0);
    expect(compareValues(10, 2)).toBeGreaterThan(0);
    expect(compareValues(5, 5)).toBe(0);
  });

  it('compares text naturally and case-insensitively', () => {
    expect(compareValues('item2', 'item10')).toBeLessThan(0);
    expect(compareValues('Alpha', 'beta')).toBeLessThan(0);
  });
});

describe('sortRows', () => {
  const rows = [
    { id: 'c', value: 3 },
    { id: 'blank', value: null },
    { id: 'a', value: 1 },
    { id: 'b', value: 2 },
  ];

  it('sorts ascending and keeps missing values last', () => {
    expect(sortRows(rows, (row) => row.value, 'ascending').map((row) => row.value)).toEqual([
      1,
      2,
      3,
      null,
    ]);
  });

  it('sorts descending and still keeps missing values last', () => {
    expect(sortRows(rows, (row) => row.value, 'descending').map((row) => row.value)).toEqual([
      3,
      2,
      1,
      null,
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [{ value: 2 }, { value: 1 }];
    sortRows(input, (row) => row.value, 'ascending');
    expect(input.map((row) => row.value)).toEqual([2, 1]);
  });
});

describe('nextSortDirection', () => {
  it('starts a new column ascending', () => {
    expect(nextSortDirection(null, 'date')).toEqual({ key: 'date', direction: 'ascending' });
  });

  it('toggles the active column between ascending and descending', () => {
    expect(nextSortDirection({ key: 'date', direction: 'ascending' }, 'date')).toEqual({
      key: 'date',
      direction: 'descending',
    });
    expect(nextSortDirection({ key: 'date', direction: 'descending' }, 'date')).toEqual({
      key: 'date',
      direction: 'ascending',
    });
  });

  it('resets to ascending when switching columns', () => {
    expect(nextSortDirection({ key: 'date', direction: 'descending' }, 'count')).toEqual({
      key: 'count',
      direction: 'ascending',
    });
  });
});
