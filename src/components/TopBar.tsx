import { Bell, CheckCheck, Menu, PlugZap, Search } from 'lucide-react';
import { useState } from 'react';
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
  connectedMcpCount: number;
  totalMcpCount: number;
}

const SECTION_TITLES: Record<NavSection, string> = {
  overview: 'Overview',
  assistant: 'AI Assistant',
  refunds: 'Refund & Warranty',
  subscriptions: 'Subscription Manager',
  appointments: 'Appointment Manager',
  documents: 'My Documents',
  activity: 'Activity Timeline & Agent Monitor',
  approvals: 'Approval Centre',
  mcp: 'MCP Connections',
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
  connectedMcpCount,
  totalMcpCount,
}: TopBarProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-sm border-b border-[#E8ECF3] px-4 sm:px-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 -ml-1 text-[#64748B] hover:text-[#172033] rounded-lg hover:bg-[#F8FAFC]"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="font-display text-[16px] font-semibold text-[#172033] truncate whitespace-nowrap">
          {SECTION_TITLES[activeSection]}
        </h1>
      </div>

      <div className="hidden md:flex flex-1 max-w-md items-center">
        <div className="relative w-full">
          <Search className="h-4 w-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search cases, subscriptions, documents, and approvals"
            placeholder="Search invoices, subscriptions, appointments..."
            className="w-full h-9 pl-9 pr-3 text-[13px] bg-[#F8FAFC] border border-[#E8ECF3] rounded-lg text-[#172033] placeholder:text-[#64748B] focus:outline-none focus:border-[#635BFF] focus:bg-white transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {settings.demoMode && (
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-[#B45309] bg-[#FEF3C7]/70 border border-[#FDE68A] rounded-lg hover:bg-[#FEF3C7] transition-colors whitespace-nowrap shrink-0"
            title="Running in Demo Sandbox Mode — no real external emails or payments are executed"
          >
            <span>Demo Mode · Sandbox</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onNavigate('mcp')}
          aria-label={`MCP Connection Status: ${connectedMcpCount} of ${totalMcpCount} Demo Servers Connected`}
          className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg hover:bg-[#DCFCE7]/70 transition-colors whitespace-nowrap shrink-0"
        >
          <PlugZap className="h-3.5 w-3.5" />
          <span className="tabular-nums">{connectedMcpCount}/{totalMcpCount} MCP Sandbox</span>
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((prev) => !prev)}
            aria-label={`Notifications (${unreadCount} unread)`}
            aria-expanded={notifOpen}
            className="relative p-2 text-[#475569] hover:text-[#172033] hover:bg-[#F8FAFC] rounded-lg border border-transparent hover:border-[#E8ECF3] transition-colors"
          >
            <Bell className="h-4.5 w-4.5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#635BFF] text-white text-[10px] font-mono font-semibold flex items-center justify-center tabular-nums">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-[#E8ECF3] rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8ECF3]">
                <span className="font-display text-[13px] font-semibold text-[#172033]">
                  Notifications
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onMarkAllRead();
                  }}
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-[#635BFF] hover:underline"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-[#E8ECF3]">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      onNavigate(n.targetSection);
                      setNotifOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 hover:bg-[#F8FAFC] transition-colors ${
                      n.read ? 'opacity-75' : 'bg-[#635BFF]/[0.02]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-semibold text-[#172033]">{n.title}</span>
                      {!n.read && <span className="text-[11px] font-medium text-[#635BFF]">New</span>}
                    </div>
                    <p className="text-[12px] text-[#64748B] mt-0.5 leading-snug">{n.message}</p>
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
          className="flex items-center gap-2.5 pl-1.5 pr-2.5 py-1 rounded-lg hover:bg-[#F8FAFC] border border-transparent hover:border-[#E8ECF3] transition-colors shrink-0"
        >
          <img
            src="/src/assets/images/user_avatar_portrait_1795507692565.jpg"
            alt={settings.profile.name}
            referrerPolicy="no-referrer"
            className="h-7 w-7 rounded-full object-cover border border-[#E8ECF3]"
          />
          <span className="hidden sm:block text-left leading-tight">
            <span className="block text-[12.5px] font-semibold text-[#172033] whitespace-nowrap">
              {settings.profile.name}
            </span>
          </span>
        </button>
      </div>
    </header>
  );
}
