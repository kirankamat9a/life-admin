import {
  Bell,
  CheckCheck,
  Menu,
  Moon,
  RotateCcw,
  Search,
  Sparkles,
  Sun,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { NavSection, NotificationItem, UserSettings } from '../shared/types';

interface TopBarProps {
  activeSection: NavSection;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  notifications: NotificationItem[];
  onMarkAllRead: () => void;
  onNavigate: (section: NavSection) => void;
  onOpenMobileMenu: () => void;
  settings: UserSettings;
  aiOnline: boolean;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onRequestResetDemo: () => void;
}

const SECTION_TITLES: Record<NavSection, string> = {
  overview: 'Overview',
  assistant: 'AI Assistant',
  refunds: 'Refund & Warranty',
  subscriptions: 'Subscriptions',
  appointments: 'Appointments',
  documents: 'My Documents',
  activity: 'Activity Timeline',
  approvals: 'Approval Centre',
  mcp: 'Connected Tools',
  settings: 'Settings',
};

export function TopBar({
  activeSection,
  searchQuery,
  onSearchChange,
  notifications,
  onMarkAllRead,
  onNavigate,
  onOpenMobileMenu,
  settings,
  aiOnline,
  darkMode,
  onToggleDarkMode,
  onRequestResetDemo,
}: TopBarProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const notifContainerRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!notifOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (notifContainerRef.current && !notifContainerRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [notifOpen]);

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-[#E8ECF3] dark:border-slate-800">
      <div className="h-16 px-4 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open navigation menu"
            className="lg:hidden p-2 -ml-1 text-[#64748B] dark:text-slate-300 hover:text-[#172033] dark:hover:text-white rounded-lg hover:bg-[#F8FAFC] dark:hover:bg-slate-800"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="font-display text-[16px] font-semibold text-[#172033] dark:text-slate-100 truncate whitespace-nowrap">
            {SECTION_TITLES[activeSection]}
          </h1>
        </div>

        <div className="hidden md:flex flex-1 max-w-md items-center">
          <div className="relative w-full">
            <Search className="h-4 w-4 text-[#64748B] dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search cases, subscriptions, documents, and approvals"
              placeholder="Search invoices, subscriptions, appointments..."
              className="w-full h-9 pl-9 pr-3 text-[13px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 rounded-lg text-[#172033] dark:text-slate-100 placeholder:text-[#64748B] dark:placeholder:text-slate-400 focus:outline-none focus:border-[#635BFF] focus:bg-white dark:focus:bg-slate-900 transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* AI Connection Status Indicator (Part B.5) */}
          <span
            title={
              aiOnline
                ? 'Live Gemini AI connected on server'
                : 'Gemini AI unavailable — running in local deterministic fallback mode'
            }
            className={`hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium rounded-lg border whitespace-nowrap ${
              aiOnline
                ? 'text-[#15803D] dark:text-emerald-300 bg-[#F0FDF4] dark:bg-emerald-950/60 border-[#BBF7D0] dark:border-emerald-800'
                : 'text-[#475569] dark:text-slate-300 bg-[#F8FAFC] dark:bg-slate-800 border-[#E8ECF3] dark:border-slate-700'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{aiOnline ? 'AI connected' : 'AI offline (fallback mode)'}</span>
          </span>

          {/* Persistent Demo Mode Indicator + Reset button (Part A.9) */}
          {settings.demoMode && (
            <div className="hidden sm:inline-flex items-center rounded-lg border border-[#FDE68A] dark:border-amber-800 bg-[#FEF3C7]/75 dark:bg-amber-950/60 overflow-hidden">
              <span className="px-2.5 py-1.5 text-[11.5px] font-medium text-[#92400E] dark:text-amber-200 whitespace-nowrap">
                Demo Mode: actions are simulated
              </span>
              <button
                type="button"
                onClick={onRequestResetDemo}
                aria-label="Reset demo data"
                title="Reset demo data back to initial state"
                className="px-2 py-1.5 border-l border-[#FDE68A] dark:border-amber-800 text-[11.5px] font-semibold text-[#92400E] dark:text-amber-200 hover:bg-[#FDE68A]/50 dark:hover:bg-amber-900/50 inline-flex items-center gap-1 whitespace-nowrap"
              >
                <RotateCcw className="h-3 w-3" />
                <span className="hidden md:inline">Reset demo data</span>
              </button>
            </div>
          )}

          {/* Dark Mode Toggle (Part A.7) */}
          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-2 text-[#475569] dark:text-slate-300 hover:text-[#172033] dark:hover:text-white hover:bg-[#F8FAFC] dark:hover:bg-slate-800 rounded-lg border border-transparent hover:border-[#E8ECF3] dark:hover:border-slate-700 transition-colors"
          >
            {darkMode ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
          </button>

          {/* Notifications */}
          <div ref={notifContainerRef} className="relative">
            <button
              type="button"
              onClick={() => setNotifOpen((prev) => !prev)}
              aria-label={`Notifications (${unreadCount} unread)`}
              aria-expanded={notifOpen}
              className="relative p-2 text-[#475569] dark:text-slate-300 hover:text-[#172033] dark:hover:text-white hover:bg-[#F8FAFC] dark:hover:bg-slate-800 rounded-lg border border-transparent hover:border-[#E8ECF3] dark:hover:border-slate-700 transition-colors"
            >
              <Bell className="h-4.5 w-4.5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#635BFF] text-white text-[10px] font-mono font-semibold flex items-center justify-center tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-700 rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8ECF3] dark:border-slate-800">
                  <span className="font-display text-[13px] font-semibold text-[#172033] dark:text-slate-100">
                    Notifications
                  </span>
                  <button
                    type="button"
                    onClick={onMarkAllRead}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-[#635BFF] dark:text-indigo-300 hover:underline"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark all read
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-[#E8ECF3] dark:divide-slate-800">
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        onNavigate(n.targetSection);
                        setNotifOpen(false);
                      }}
                      className={`w-full text-left px-4 py-3 hover:bg-[#F8FAFC] dark:hover:bg-slate-800 transition-colors ${
                        n.read ? 'opacity-75' : 'bg-[#635BFF]/[0.03] dark:bg-[#635BFF]/10'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12.5px] font-semibold text-[#172033] dark:text-slate-100">
                          {n.title}
                        </span>
                        {!n.read && (
                          <span className="text-[11px] font-medium text-[#635BFF] dark:text-indigo-300">
                            New
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-[#64748B] dark:text-slate-300 mt-0.5 leading-snug">
                        {n.message}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onNavigate('settings')}
            aria-label="Open user profile and settings"
            className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-lg hover:bg-[#F8FAFC] dark:hover:bg-slate-800 border border-transparent hover:border-[#E8ECF3] dark:hover:border-slate-700 transition-colors shrink-0"
          >
            <img
              src="/src/assets/images/user_avatar_portrait_1795507692565.jpg"
              alt={settings.profile.name}
              referrerPolicy="no-referrer"
              className="h-7 w-7 rounded-full object-cover border border-[#E8ECF3] dark:border-slate-700"
            />
            <span className="hidden sm:block text-left leading-tight">
              <span className="block text-[12.5px] font-semibold text-[#172033] dark:text-slate-100 whitespace-nowrap">
                {settings.profile.name}
              </span>
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
