import { ArrowRight, Bot, Play, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface OnboardingTourModalProps {
  open: boolean;
  onClose: () => void;
  onTryScenario: () => void;
}

const STEPS = [
  {
    icon: Bot,
    badge: 'Step 1 of 3 · Welcome',
    title: 'What LIFEADMIN AI (India Edition) Does',
    body: 'LIFEADMIN AI connects your inbox receipts, GST tax invoices, warranty terms, UPI AutoPay subscriptions, and IST calendar in one calm workspace. Ask a question in plain English and let our focused helpers gather the exact facts for you.',
    highlight: 'Everything runs safely in Demo Mode using Indian sample records — zero real emails or payments are ever sent.',
  },
  {
    icon: ShieldCheck,
    badge: 'Step 2 of 3 · Human-in-the-Loop',
    title: 'How Approvals Keep You in Control',
    body: 'The assistant can search records, check warranty coverage, spot unused UPI AutoPay plans, and draft replies — but it NEVER sends an email, cancels a plan, or books your calendar without your explicit sign-off.',
    highlight: 'Every proposed action lands in the Approval Centre with plain-language consequences, risk level, and an Edit option.',
  },
  {
    icon: Sparkles,
    badge: 'Step 3 of 3 · Try It Live',
    title: 'Try a Guided Demo Scenario',
    body: 'Start by checking your Croma GST invoice for the Zenith 15 Pro Laptop and its 24-month India warranty coverage, or skip straight to the Overview dashboard to explore quick actions.',
    highlight: 'You can replay this tour anytime from Settings.',
  },
];

export function OnboardingTourModal({
  open,
  onClose,
  onTryScenario,
}: OnboardingTourModalProps) {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (open) setStepIdx(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const step = STEPS[stepIdx];
  const Icon = step.icon;
  const isLast = stepIdx === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#172033]/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-tour-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-700 p-6 shadow-2xl space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#635BFF]/10 text-[#635BFF] shrink-0">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-[#635BFF]">
                {step.badge}
              </p>
              <h2
                id="onboarding-tour-title"
                className="font-display text-[18px] font-bold text-[#172033] dark:text-slate-100"
              >
                {step.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Skip welcome tour"
            className="text-[12.5px] font-semibold text-[#64748B] dark:text-slate-300 hover:text-[#172033] dark:hover:text-white inline-flex items-center gap-1 px-2 py-1 rounded-md"
          >
            <span>Skip</span>
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-[14px] leading-relaxed text-[#475569] dark:text-slate-300">
          {step.body}
        </p>

        <div className="rounded-xl bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 p-3.5 text-[12.5px] text-[#172033] dark:text-slate-200">
          {step.highlight}
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {STEPS.map((s, idx) => (
              <span
                key={s.badge}
                className={`h-2 rounded-full transition-all ${
                  idx === stepIdx ? 'w-6 bg-[#635BFF]' : 'w-2 bg-[#E8ECF3] dark:bg-slate-700'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                className="px-3.5 py-2 rounded-lg border border-[#E8ECF3] dark:border-slate-700 text-[13px] font-semibold text-[#172033] dark:text-slate-200 hover:bg-[#F8FAFC] dark:hover:bg-slate-800"
              >
                Back
              </button>
            )}
            {!isLast ? (
              <button
                type="button"
                onClick={() => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#635BFF] text-white text-[13px] font-semibold hover:bg-[#5249F5]"
              >
                <span>Next</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-lg border border-[#E8ECF3] dark:border-slate-700 text-[13px] font-semibold text-[#172033] dark:text-slate-200 hover:bg-[#F8FAFC] dark:hover:bg-slate-800"
                >
                  Explore Workspace
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onTryScenario();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#635BFF] text-white text-[13px] font-semibold hover:bg-[#5249F5]"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Try Laptop Warranty Demo</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
