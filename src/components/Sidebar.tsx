import {
  Activity,
  Bot,
  CalendarClock,
  CreditCard,
  FileText,
  LayoutDashboard,
  PlugZap,
  ReceiptText,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { NavSection } from '../shared/types';

interface SidebarProps {
  activeSection: NavSection;
  onSelect: (section: NavSection) => void;
  pendingApprovalCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'assistant', label: 'AI Assistant', icon: Bot },
  { id: 'refunds', label: 'Refund & Warranty', icon: ReceiptText },
  { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
  { id: 'appointments', label: 'Appointments', icon: CalendarClock },
  { id: 'documents', label: 'My Documents', icon: FileText },
  { id: 'activity', label: 'Activity Timeline', icon: Activity },
  { id: 'approvals', label: 'Approval Centre', icon: ShieldCheck },
  { id: 'mcp', label: 'Connected Tools', icon: PlugZap },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({
  activeSection,
  onSelect,
  pendingApprovalCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navContent = (
    <div className="flex h-full flex-col bg-white dark:bg-slate-900 border-r border-[#E8ECF3] dark:border-slate-800">
      <div className="flex items-center justify-between px-5 h-16 border-b border-[#E8ECF3] dark:border-slate-800">
        <button
          type="button"
          onClick={() => {
            onSelect('overview');
            onCloseMobile();
          }}
          className="flex items-center gap-2.5 text-left rounded-lg"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#635BFF] to-[#8B5CF6] text-white font-display font-bold text-sm shadow-xs">
            LA
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-[15px] font-bold tracking-tight text-[#172033] dark:text-slate-100 whitespace-nowrap">
              LIFEADMIN AI
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 text-[#64748B] dark:text-slate-400 hover:text-[#172033] dark:hover:text-white rounded-md"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav aria-label="Primary Workspace Navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelect(item.id);
                onCloseMobile();
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-colors duration-150 ${
                isActive
                  ? 'bg-[#635BFF]/[0.1] dark:bg-[#635BFF]/20 text-[#635BFF] dark:text-indigo-300 font-semibold'
                  : 'text-[#475569] dark:text-slate-300 hover:bg-[#F8FAFC] dark:hover:bg-slate-800 hover:text-[#172033] dark:hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive ? 'text-[#635BFF] dark:text-indigo-300' : 'text-[#64748B] dark:text-slate-400'
                  }`}
                />
                <span className="truncate whitespace-nowrap">{item.label}</span>
              </span>
              {item.id === 'approvals' && pendingApprovalCount > 0 && (
                <span
                  aria-label={`${pendingApprovalCount} pending approvals`}
                  className="font-mono text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded bg-[#635BFF]/10 text-[#635BFF] dark:text-indigo-300"
                >
                  {pendingApprovalCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-3.5 border-t border-[#E8ECF3] dark:border-slate-800 bg-[#F8FAFC]/60 dark:bg-slate-950/40">
        <p className="text-[11.5px] font-semibold text-[#172033] dark:text-slate-200">
          Human-Approved Safety
        </p>
        <p className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5 leading-snug">
          No email, cancellation, or booking runs without your sign-off.
        </p>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {navContent}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#172033]/35 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-64 max-w-[82vw] h-full">{navContent}</aside>
        </div>
      )}
    </>
  );
}
