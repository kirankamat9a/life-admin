import { CheckCircle2, Compass, RotateCcw, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { WorkspaceState } from '../shared/types';
import { HelpTip } from './HelpTip';

interface SettingsViewProps {
  workspace: WorkspaceState;
  aiOnline: boolean;
  onUpdateSettings: (payload: Record<string, unknown>) => Promise<void>;
  onRequestResetDemo: () => void;
  onRunScenario: (scenario: 1 | 2 | 3) => Promise<void>;
  onShowTour: () => void;
}

export function SettingsView({
  workspace,
  aiOnline,
  onUpdateSettings,
  onRequestResetDemo,
  onRunScenario,
  onShowTour,
}: SettingsViewProps) {
  const { settings } = workspace;
  const [name, setName] = useState(settings.profile.name);
  const [email, setEmail] = useState(settings.profile.email);
  const [timezone, setTimezone] = useState(settings.profile.timezone);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    setName(settings.profile.name);
    setEmail(settings.profile.email);
    setTimezone(settings.profile.timezone);
  }, [settings.profile.name, settings.profile.email, settings.profile.timezone]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    try {
      await onUpdateSettings({
        profile: { name: name.trim(), email: email.trim(), timezone: timezone.trim() },
      });
      setSavedMsg('Profile preferences saved.');
    } finally {
      setSaving(false);
    }
  };

  const toggleNotif = async (key: keyof WorkspaceState['settings']['notifications']) => {
    await onUpdateSettings({
      notifications: {
        ...settings.notifications,
        [key]: !settings.notifications[key],
      },
    });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {savedMsg && (
        <div
          role="status"
          className="p-3.5 rounded-lg bg-[#F0FDF4] dark:bg-emerald-950/60 border border-[#BBF7D0] dark:border-emerald-800 text-[13px] text-[#15803D] dark:text-emerald-200 flex items-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{savedMsg}</span>
        </div>
      )}

      {/* User Profile */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-6 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
                User Profile
              </h2>
              <HelpTip
                title="Profile & Safety Settings"
                description="Update the name and email used on drafted warranty claims and appointment proposals. Safety approval guardrails remain locked ON in Demo Mode."
              />
            </div>
            <p className="text-[12.5px] text-[#64748B] dark:text-slate-400">
              Identity details used when drafting warranty claims and appointment proposals.
            </p>
          </div>
          <button
            type="button"
            onClick={onShowTour}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E8ECF3] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 text-[12.5px] font-semibold text-[#635BFF] dark:text-indigo-300 hover:border-[#635BFF] whitespace-nowrap"
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Show tour again</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="prof-name"
              className="block text-[12px] font-medium text-[#64748B] dark:text-slate-400 mb-1"
            >
              Full Name
            </label>
            <input
              id="prof-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full h-9 px-3 text-[13px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 rounded-lg text-[#172033] dark:text-slate-100"
            />
          </div>
          <div>
            <label
              htmlFor="prof-email"
              className="block text-[12px] font-medium text-[#64748B] dark:text-slate-400 mb-1"
            >
              Email Address
            </label>
            <input
              id="prof-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full h-9 px-3 text-[13px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 rounded-lg text-[#172033] dark:text-slate-100"
            />
          </div>
          <div>
            <label
              htmlFor="prof-tz"
              className="block text-[12px] font-medium text-[#64748B] dark:text-slate-400 mb-1"
            >
              Timezone
            </label>
            <input
              id="prof-tz"
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full h-9 px-3 text-[13px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 rounded-lg text-[#172033] dark:text-slate-100"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[#635BFF] text-white text-[13px] font-semibold hover:bg-[#5249F5] disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>

      {/* Connected Applications & AI Status */}
      <section className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
            Connected Applications &amp; AI Status
          </h2>
          <p className="text-[12.5px] text-[#64748B] dark:text-slate-400">
            Current connection status for your sandbox tools and AI assistant
          </p>
        </div>

        <div className="divide-y divide-[#E8ECF3] dark:divide-slate-800 text-[13px]">
          <div className="py-3 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-[#172033] dark:text-slate-100">
                Inbox &amp; Calendar Sandbox
              </p>
              <p className="text-[12px] text-[#64748B] dark:text-slate-400">
                All emails, subscriptions, and calendar events run safely on simulated Demo Mode records.
              </p>
            </div>
            <span className="text-[12px] font-semibold text-[#B45309] dark:text-amber-300 whitespace-nowrap">
              Demo Mode Active
            </span>
          </div>

          <div className="py-3 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-[#172033] dark:text-slate-100">
                AI Assistant Engine
              </p>
              <p className="text-[12px] text-[#64748B] dark:text-slate-400">
                {aiOnline
                  ? 'Connected to server-side Gemini AI for smart answers, document scanning, draft rewrites, and web grounding.'
                  : 'Running in local fallback mode (offline rules & templates) because no AI key is active or reachable.'}
              </p>
            </div>
            <span
              className={`text-[12px] font-semibold whitespace-nowrap ${
                aiOnline ? 'text-[#16A34A]' : 'text-[#64748B] dark:text-slate-300'
              }`}
            >
              {aiOnline ? 'AI connected' : 'AI offline (fallback mode)'}
            </span>
          </div>
        </div>
      </section>

      {/* Security & Human Approval Guardrails */}
      <section className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[#635BFF]" />
          <h2 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
            Security &amp; Human Approval Guardrails
          </h2>
        </div>

        <div className="space-y-3 text-[13px]">
          {[
            {
              key: 'requireHumanApprovalForEmails',
              label: 'Require explicit approval before sending any complaint or cancellation email',
            },
            {
              key: 'requireHumanApprovalForCalendar',
              label: 'Require explicit approval before creating calendar appointments',
            },
            {
              key: 'requireHumanApprovalForCancellations',
              label: 'Require explicit approval before initiating subscription cancellations',
            },
          ].map((rule) => (
            <label
              key={rule.key}
              className="flex items-center justify-between gap-4 py-1 cursor-not-allowed"
            >
              <span className="text-[#172033] dark:text-slate-200">{rule.label}</span>
              <span className="flex items-center gap-2.5 shrink-0">
                <span className="text-[11.5px] font-medium text-[#64748B] dark:text-slate-400">
                  Always on in Demo Mode
                </span>
                <input
                  type="checkbox"
                  checked={true}
                  disabled
                  readOnly
                  aria-label={`${rule.label} (Always on in Demo Mode)`}
                  className="h-4 w-4 accent-[#635BFF] cursor-not-allowed opacity-70"
                />
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* Notification Preferences */}
      <section className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
          Notification Preferences
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
          {(
            [
              ['upcomingCharges', 'Upcoming subscription charges'],
              ['refundUpdates', 'Refund & warranty case updates'],
              ['warrantyDeadlines', 'Warranty expiration deadlines'],
              ['pendingApprovals', 'Pending human approval alerts'],
              ['appointmentReminders', 'Calendar conflict & appointment reminders'],
              ['mcpFailures', 'Connected tool or sync failures'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notifications[key]}
                onChange={() => toggleNotif(key)}
                className="h-4 w-4 accent-[#635BFF]"
              />
              <span className="text-[#172033] dark:text-slate-200">{label}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Demo Mode Controls */}
      <section className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
              Demo Mode Sandbox Controls
            </h2>
            <p className="text-[12.5px] text-[#64748B] dark:text-slate-400">
              Launch guided demo scenarios or reset all simulated workspace data back to defaults.
            </p>
          </div>
          <button
            type="button"
            onClick={onRequestResetDemo}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 text-[13px] font-semibold text-[#EF4444] hover:bg-[#FEF2F2] dark:hover:bg-red-950/40 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Reset Demo Sandbox</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => onRunScenario(1)}
            className="px-3.5 py-2 rounded-lg bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 text-[12.5px] font-semibold text-[#172033] dark:text-slate-100 hover:border-[#635BFF]"
          >
            Trigger Demo Scenario 1 (Laptop Warranty)
          </button>
          <button
            type="button"
            onClick={() => onRunScenario(2)}
            className="px-3.5 py-2 rounded-lg bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 text-[12.5px] font-semibold text-[#172033] dark:text-slate-100 hover:border-[#635BFF]"
          >
            Trigger Demo Scenario 2 (UPI Subscriptions)
          </button>
          <button
            type="button"
            onClick={() => onRunScenario(3)}
            className="px-3.5 py-2 rounded-lg bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 text-[12.5px] font-semibold text-[#172033] dark:text-slate-100 hover:border-[#635BFF]"
          >
            Trigger Demo Scenario 3 (IST Calendar Slot)
          </button>
        </div>
      </section>
    </div>
  );
}
