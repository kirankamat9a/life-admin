import { AlertTriangle, X } from 'lucide-react';
import { useEffect } from 'react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#172033]/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-700 p-6 shadow-xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="p-2 rounded-lg bg-[#FEF3C7] dark:bg-amber-950 text-[#B45309] dark:text-amber-300 shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <h2
                id="confirm-modal-title"
                className="font-display text-[16px] font-bold text-[#172033] dark:text-slate-100"
              >
                {title}
              </h2>
              <p className="mt-1 text-[13px] text-[#64748B] dark:text-slate-300 leading-relaxed">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            aria-label="Close confirmation dialog"
            className="p-1 rounded-md text-[#64748B] hover:text-[#172033] dark:text-slate-400 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-[#E8ECF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-[13px] font-semibold text-[#172033] dark:text-slate-200 hover:bg-[#F8FAFC] dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-[#EF4444] text-white text-[13px] font-semibold hover:bg-[#DC2626] disabled:opacity-50"
          >
            {busy ? 'Resetting...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
