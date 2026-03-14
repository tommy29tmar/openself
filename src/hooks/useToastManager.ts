"use client";

import { useState, useCallback, useRef } from "react";

export type ToastType = "success" | "info" | "error";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  createdAt: number;
}

interface ToastManagerOpts {
  maxVisible?: number;
  dismissAfterMs?: number;
  onChange?: () => void;
}

const DEFAULT_MAX_VISIBLE = 5;
const DEFAULT_DISMISS_MS = 3000;

/**
 * Imperative toast manager — no React dependency.
 * Exported for unit testing; the React hook wraps this.
 */
export function createToastManager(opts?: ToastManagerOpts) {
  let _counter = 0;
  function nextId(): string {
    return `toast-${++_counter}-${Date.now()}`;
  }
  const maxVisible = opts?.maxVisible ?? DEFAULT_MAX_VISIBLE;
  const dismissAfterMs = opts?.dismissAfterMs ?? DEFAULT_DISMISS_MS;
  const onChange = opts?.onChange;

  let toasts: Toast[] = [];
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function notify() {
    onChange?.();
  }

  function getVisible(): Toast[] {
    // Return the most recent `maxVisible` toasts
    if (toasts.length <= maxVisible) return [...toasts];
    return toasts.slice(toasts.length - maxVisible);
  }

  function add(message: string, type: ToastType): Toast {
    const toast: Toast = {
      id: nextId(),
      message,
      type,
      createdAt: Date.now(),
    };
    toasts.push(toast);
    notify();

    // Auto-dismiss
    const timer = setTimeout(() => {
      dismiss(toast.id);
    }, dismissAfterMs);
    timers.set(toast.id, timer);

    return toast;
  }

  function dismiss(id: string): void {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }

  function clear(): void {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    toasts = [];
    notify();
  }

  return { add, dismiss, clear, getVisible };
}

export type ToastManager = ReturnType<typeof createToastManager>;

/**
 * React hook wrapping the imperative toast manager.
 * Re-renders the component on toast changes.
 */
export function useToastManager(opts?: {
  maxVisible?: number;
  dismissAfterMs?: number;
}) {
  const [, setTick] = useState(0);
  const mgrRef = useRef<ToastManager | null>(null);

  if (!mgrRef.current) {
    mgrRef.current = createToastManager({
      ...opts,
      onChange: () => setTick((t) => t + 1),
    });
  }

  const add = useCallback(
    (message: string, type: ToastType) => mgrRef.current!.add(message, type),
    [],
  );

  const dismiss = useCallback(
    (id: string) => mgrRef.current!.dismiss(id),
    [],
  );

  const clear = useCallback(() => mgrRef.current!.clear(), []);

  return {
    toasts: mgrRef.current.getVisible(),
    add,
    dismiss,
    clear,
  };
}
