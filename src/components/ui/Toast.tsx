"use client";

import type { Toast as ToastData } from "@/hooks/useToastManager";

const TYPE_STYLES: Record<string, string> = {
  success: "border-l-green-500 bg-green-950/80",
  info: "border-l-blue-500 bg-blue-950/80",
  error: "border-l-red-500 bg-red-950/80",
};

interface ToastItemProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-3 rounded border-l-4 px-4 py-3 text-sm text-white/90 shadow-lg backdrop-blur-sm ${TYPE_STYLES[toast.type] ?? TYPE_STYLES.info}`}
    >
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 text-white/50 hover:text-white/80"
        aria-label="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
  mobile?: boolean;
  tabBarVisible?: boolean;
}

/**
 * Toast container: stacks toasts at the bottom.
 * - Mobile: above bottom tab bar (56px when visible)
 * - Desktop: bottom-right corner
 */
export function ToastContainer({ toasts, onDismiss, mobile, tabBarVisible }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  const bottomOffset = mobile && tabBarVisible ? 64 : 16; // 56px tab bar + 8px gap

  return (
    <div
      className="pointer-events-none fixed z-[300] flex flex-col gap-2"
      style={
        mobile
          ? { left: 16, right: 16, bottom: bottomOffset }
          : { right: 16, bottom: 16, width: 360 }
      }
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
