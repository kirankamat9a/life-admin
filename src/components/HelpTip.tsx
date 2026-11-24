import { HelpCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface HelpTipProps {
  title: string;
  description: string;
}

export function HelpTip({ title, description }: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Help: ${title}`}
        aria-expanded={open}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#E8ECF3] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 text-[#64748B] dark:text-slate-300 hover:text-[#635BFF] hover:border-[#635BFF]/40 transition-colors"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={title}
          className="absolute right-0 top-8 z-40 w-72 rounded-xl border border-[#E8ECF3] dark:border-slate-700 bg-white dark:bg-slate-900 p-3.5 shadow-lg text-left"
        >
          <p className="text-[12.5px] font-semibold text-[#172033] dark:text-slate-100">{title}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-[#475569] dark:text-slate-300">
            {description}
          </p>
        </div>
      )}
    </div>
  );
}
