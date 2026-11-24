import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastItem {
  id: string;
  kind: 'success' | 'error' | 'info';
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-[calc(100vw-2rem)]"
    >
      {toasts.map((toast) => {
        const isError = toast.kind === 'error';
        const isSuccess = toast.kind === 'success';
        return (
          <div
            key={toast.id}
            role={isError ? 'alert' : 'status'}
            className={`rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm flex items-start justify-between gap-3 text-[13px] ${
              isError
                ? 'bg-[#FEF2F2] dark:bg-red-950/95 border-[#FECACA] dark:border-red-800 text-[#991B1B] dark:text-red-100'
                : isSuccess
                  ? 'bg-[#F0FDF4] dark:bg-emerald-950/95 border-[#BBF7D0] dark:border-emerald-800 text-[#166534] dark:text-emerald-100'
                  : 'bg-white dark:bg-slate-900 border-[#E8ECF3] dark:border-slate-700 text-[#172033] dark:text-slate-100'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              {isError ? (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              ) : isSuccess ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#635BFF]" />
              )}
              <div className="space-y-1.5">
                <p className="leading-snug font-medium">{toast.message}</p>
                {toast.actionLabel && toast.onAction && (
                  <button
                    type="button"
                    onClick={() => {
                      toast.onAction?.();
                      onDismiss(toast.id);
                    }}
                    className="text-[12px] font-semibold underline hover:opacity-80"
                  >
                    {toast.actionLabel}
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="p-0.5 rounded opacity-70 hover:opacity-100 shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
