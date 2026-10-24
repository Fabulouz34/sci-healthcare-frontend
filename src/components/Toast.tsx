'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * Transaction results as toasts (#80).
 *
 * A result shown inside the card that produced it scrolls off screen exactly
 * when it matters — after a wallet prompt and a round trip to the RPC. Toasts
 * appear wherever the user is looking, announce themselves through an ARIA
 * live region, and clear themselves; the page behind them never moves.
 */

export type ToastKind = 'success' | 'error' | 'info';

type Toast = { id: number; kind: ToastKind; message: ReactNode };

type ToastApi = {
  success: (message: ReactNode) => void;
  error: (message: ReactNode) => void;
  info: (message: ReactNode) => void;
  dismiss: (id: number) => void;
};

/** Long enough to read and act on a link, short enough not to pile up. */
const DEFAULT_MS = 6000;

const NOOP: ToastApi = {
  success: () => {},
  error: () => {},
  info: () => {},
  dismiss: () => {},
};

const ToastContext = createContext<ToastApi>(NOOP);

const STYLES: Record<ToastKind, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  info: 'border-blue-200 bg-blue-50 text-blue-900',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: ReactNode) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, kind, message }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DEFAULT_MS),
      );
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
      dismiss,
    }),
    [push, dismiss],
  );

  // Clear any pending timers if the provider unmounts.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${STYLES[t.kind]}`}
          >
            <div className="min-w-0 flex-1 break-words">{t.message}</div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="-me-1 -mt-1 flex-none rounded-md px-1.5 py-0.5 text-base leading-none opacity-60 transition hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
