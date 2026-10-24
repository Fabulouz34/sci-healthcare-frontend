'use client';

import { useMemo, useState, type ReactNode } from 'react';

import { nextSortDirection, sortRows, type SortDirection, type SortState } from '@/lib/data-table';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  accessor: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right';
  className?: string;
  render?: (row: T) => ReactNode;
}

/**
 * Accessible, keyboard-sortable table.
 *
 * Each sortable header is a real button inside its `<th>`, so it can be
 * activated with Enter/Space and reached with Tab. The active column exposes the
 * current order through `aria-sort`; every table has a caption for screen
 * readers.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowKey,
  emptyMessage = 'No data recorded yet.',
}: {
  caption: string;
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowKey: (row: T, index: number) => string | number;
  emptyMessage?: string;
}) {
  const [sort, setSort] = useState<SortState | null>(
    columns.length > 0 ? { key: columns[0].key, direction: 'ascending' } : null,
  );

  const activeColumn = sort ? (columns.find((column) => column.key === sort.key) ?? null) : null;

  const sortedRows = useMemo(() => {
    if (!sort || !activeColumn) {
      return [...rows];
    }
    return sortRows(rows, activeColumn.accessor, sort.direction);
  }, [rows, sort, activeColumn]);

  return (
    <table className="w-full text-start text-xs">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-[var(--color-line)] text-[var(--color-ink-soft)]">
          {columns.map((column) => {
            const direction: SortDirection | null =
              sort && sort.key === column.key ? sort.direction : null;
            return (
              <th
                key={column.key}
                scope="col"
                aria-sort={direction ?? 'none'}
                className={`py-1.5 font-medium ${column.align === 'right' ? 'text-end' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => setSort((current) => nextSortDirection(current, column.key))}
                  aria-label={`Sort by ${column.header}${direction ? `, currently ${direction}` : ''}`}
                  className="inline-flex min-h-6 items-center gap-1 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)]"
                >
                  {column.header}
                  <span aria-hidden="true" className="text-[0.7em]">
                    {direction ? (direction === 'ascending' ? '▲' : '▼') : '↕'}
                  </span>
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--color-line)]">
        {sortedRows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="py-4 text-center text-[var(--color-ink-soft)]">
              {emptyMessage}
            </td>
          </tr>
        ) : (
          sortedRows.map((row, index) => (
            <tr key={getRowKey(row, index)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`py-1.5 ${column.align === 'right' ? 'text-end' : ''} ${column.className ?? ''}`}
                >
                  {column.render ? column.render(row) : column.accessor(row)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
