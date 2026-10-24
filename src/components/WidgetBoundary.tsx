'use client';

import * as Sentry from '@sentry/browser';
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from './ui';

/**
 * Error boundary for one optional widget (#169): the clinic map, a stats
 * chart. When the widget throws, only its own box is replaced by a short
 * message, and the rest of the page keeps working — instead of the route's
 * `error.tsx` taking over the whole page.
 *
 * The error is reported through Sentry, which is a no-op unless error
 * reporting is configured, and passes the same `beforeSend` scrubber as
 * every other report (see ErrorReporter).
 */
export class WidgetBoundary extends Component<
  {
    /** What failed, in the fallback's words: "The map", "This chart". */
    label: string;
    children: ReactNode;
  },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    Sentry.captureException(error, {
      tags: { widget: this.props.label },
      extra: { componentStack: info.componentStack },
    });
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        className="rounded-xl border border-dashed border-[var(--color-line)] px-6 py-8 text-center text-sm text-[var(--color-ink-soft)]"
      >
        <p>{this.props.label} could not be shown. The rest of the page still works.</p>
        <Button variant="ghost" className="mt-3" onClick={() => this.setState({ failed: false })}>
          Try again
        </Button>
      </div>
    );
  }
}
