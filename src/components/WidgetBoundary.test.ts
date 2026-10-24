// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WidgetBoundary } from './WidgetBoundary';

/**
 * Widget error boundary (#169).
 *
 * A widget that throws is replaced by a fallback inside its own box, the
 * page around it keeps rendering, and the error is handed to Sentry —
 * mocked here at the module boundary, as the SDK is a no-op in tests.
 */
const captureException = vi.hoisted(() => vi.fn());
vi.mock('@sentry/browser', () => ({ captureException }));

let shouldThrow = true;
function Flaky() {
  if (shouldThrow) throw new Error('chart exploded');
  return createElement('p', null, 'Chart drawn');
}

function page() {
  // `children` arrives as createElement's third argument, which its typing
  // does not count towards the required prop.
  const props = { label: 'This chart' } as ComponentProps<typeof WidgetBoundary>;
  return createElement(
    'div',
    null,
    createElement('h1', null, 'Protocol statistics'),
    createElement(WidgetBoundary, props, createElement(Flaky)),
    createElement('p', null, 'Clinics by country'),
  );
}

beforeEach(() => {
  shouldThrow = true;
  captureException.mockClear();
  // React logs every caught render error; keep the test output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WidgetBoundary', () => {
  it('renders its children when nothing throws', () => {
    shouldThrow = false;
    render(page());
    expect(screen.getByText('Chart drawn')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('replaces only the failing widget and keeps the page usable', () => {
    render(page());
    expect(screen.getByRole('alert').textContent).toContain(
      'This chart could not be shown. The rest of the page still works.',
    );
    expect(screen.getByText('Protocol statistics')).toBeTruthy();
    expect(screen.getByText('Clinics by country')).toBeTruthy();
    expect(screen.queryByText('Chart drawn')).toBeNull();
  });

  it('reports the error with the widget it came from', () => {
    render(page());
    expect(captureException).toHaveBeenCalledTimes(1);
    const [error, context] = captureException.mock.calls[0];
    expect((error as Error).message).toBe('chart exploded');
    expect(context).toMatchObject({ tags: { widget: 'This chart' } });
  });

  it('tries the widget again on request', () => {
    render(page());
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Chart drawn')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
