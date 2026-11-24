import {
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FileUp,
  FileWarning,
  PlugZap,
  ReceiptText,
  ShieldAlert,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { calculateSubscriptionAnalytics, formatINR } from '../shared/domainLogic';
import type { NavSection, WorkspaceState } from '../shared/types';
import { HelpTip } from './HelpTip';

interface OverviewViewProps {
  workspace: WorkspaceState;
  onNavigate: (section: NavSection) => void;
  onRunScenario: (scenario: 1 | 2 | 3) => Promise<void>;
  busyScenario: number | null;
}

const MONTHLY_ACTIVITY_DATA = [
  { month: 'Jun', tasks: 9, recovered: 12500 },
  { month: 'Jul', tasks: 12, recovered: 18400 },
  { month: 'Aug', tasks: 15, recovered: 24990 },
  { month: 'Sep', tasks: 11, recovered: 9800 },
  { month: 'Oct', tasks: 18, recovered: 31200 },
  { month: 'Nov', tasks: 14, recovered: 38500 },
];

export function OverviewView({
  workspace,
  onNavigate,
  onRunScenario,
  busyScenario,
}: OverviewViewProps) {
  const subStats = calculateSubscriptionAnalytics(
    workspace.subscriptions,
    workspace.referenceDate
  );

  const activeCases = workspace.cases.filter((c) => c.status !== 'Resolved');
  const potentialRefundAmount = activeCases.reduce((sum, c) => sum + c.purchaseAmount, 0);
  const upcomingAppointments = workspace.events.filter(
    (e) => e.start.slice(0, 10) >= workspace.referenceDate
  ).length;
  const pendingApprovals = workspace.approvals.filter((a) => a.status === 'pending');

  const contradictionCount = workspace.documents.reduce(
    (sum, d) => sum + d.contradictions.length,
    0
  );

  const subscriptionChartData = workspace.subscriptions.map((s) => ({
    name: s.name.split(' ')[0] + (s.name.includes('Plus') ? ' Legacy' : ''),
    monthly: s.category === 'Cancelled' ? 0 : s.monthlyCost,
    savings: s.potentialSavingsMonthly,
  }));

  const quickActions = [
    {
      title: 'Check a warranty',
      subtitle: 'Verify invoice coverage & draft a claim',
      icon: ReceiptText,
      color: 'text-[#635BFF] bg-[#635BFF]/10',
      action: () => onRunScenario(1),
      busy: busyScenario === 1,
    },
    {
      title: 'Find wasted subscriptions',
      subtitle: `Spot unused plans (${subStats.flaggedCount} flagged)`,
      icon: CreditCard,
      color: 'text-[#8B5CF6] bg-[#8B5CF6]/10',
      action: () => onRunScenario(2),
      busy: busyScenario === 2,
    },
    {
      title: 'Book a meeting',
      subtitle: 'Find a conflict-free time tomorrow',
      icon: CalendarClock,
      color: 'text-[#0EA5E9] bg-[#0EA5E9]/10',
      action: () => onRunScenario(3),
      busy: busyScenario === 3,
    },
    {
      title: 'Upload a document',
      subtitle: 'Scan an invoice, receipt, or warranty PDF',
      icon: FileUp,
      color: 'text-[#16A34A] bg-[#16A34A]/10',
      action: () => onNavigate('documents'),
      busy: false,
    },
  ];

  const eligibleCount = activeCases.filter((c) => c.status === 'Eligible').length;
  const preparedCount = activeCases.filter((c) => c.status === 'Complaint Prepared').length;
  const needsEvidenceCount = activeCases.filter((c) => c.status === 'Evidence Required').length;

  const kpis = [
    {
      label: 'Active Cases',
      value: String(activeCases.length),
      sub:
        preparedCount > 0
          ? `${eligibleCount} Eligible · ${preparedCount} Prepared · ${needsEvidenceCount} Needs Evidence`
          : `${eligibleCount} Eligible · ${needsEvidenceCount} Needs Evidence`,
      section: 'refunds' as NavSection,
    },
    {
      label: 'Potential Refund Value',
      value: formatINR(potentialRefundAmount),
      sub: 'Covered under active warranties',
      section: 'refunds' as NavSection,
    },
    {
      label: 'Monthly Subscriptions',
      value: formatINR(subStats.activeMonthlySpend),
      sub: `Save ${formatINR(subStats.potentialMonthlySavings)}/mo identified`,
      section: 'subscriptions' as NavSection,
    },
    {
      label: 'Upcoming Appointments',
      value: String(upcomingAppointments),
      sub: 'Next 7 days in Demo Calendar',
      section: 'appointments' as NavSection,
    },
    {
      label: 'Pending Approvals',
      value: String(pendingApprovals.length),
      sub: pendingApprovals.length > 0 ? 'Waiting for your sign-off' : 'All actions reviewed',
      section: 'approvals' as NavSection,
    },
    {
      label: 'Tasks Completed',
      value: String(workspace.tasksCompletedCount),
      sub: 'Audited & evidence-backed',
      section: 'activity' as NavSection,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Executive Header Banner */}
      <section className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <p className="text-[12px] font-medium text-[#635BFF] dark:text-indigo-300">
              Your Everyday Problem-Solving Assistant · India Edition (Demo Sandbox)
            </p>
            <HelpTip
              title="About the Overview"
              description="See what needs your attention today, launch one-click workflows, and review money saved across warranties and subscriptions. No real emails or charges are sent."
            />
          </div>
          <h2 className="font-display text-[22px] sm:text-[24px] font-bold tracking-tight text-[#172033] dark:text-slate-100">
            Less time managing life. More time living it.
          </h2>
          <p className="text-[14px] text-[#64748B] dark:text-slate-300 leading-relaxed">
            Inspect invoices, catch duplicate subscriptions, and resolve scheduling conflicts across your connected tools — nothing is ever sent or booked without your explicit approval.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('assistant')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#635BFF] text-white text-[13px] font-semibold hover:bg-[#5249F5] transition-colors whitespace-nowrap shrink-0"
          >
            <Bot className="h-4 w-4" />
            Open AI Assistant
          </button>
          <button
            type="button"
            onClick={() => onNavigate('approvals')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 text-[#172033] dark:text-slate-100 text-[13px] font-semibold hover:bg-[#F8FAFC] dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
          >
            Review Approvals ({pendingApprovals.length})
          </button>
        </div>
      </section>

      {/* Quick Actions Cards (Part A.2) */}
      <section aria-label="Quick actions" className="space-y-3">
        <h3 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
          Quick actions
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {quickActions.map((qa) => {
            const Icon = qa.icon;
            return (
              <button
                key={qa.title}
                type="button"
                disabled={busyScenario !== null && qa.title !== 'Upload a document'}
                onClick={qa.action}
                className="text-left bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-4 hover:border-[#635BFF]/50 transition-colors flex items-start gap-3.5 disabled:opacity-60"
              >
                <span className={`p-2.5 rounded-lg shrink-0 ${qa.color}`}>
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-[#172033] dark:text-slate-100 flex items-center justify-between gap-2">
                    <span>{qa.busy ? 'Running...' : qa.title}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-[#64748B] shrink-0" />
                  </p>
                  <p className="text-[12px] text-[#64748B] dark:text-slate-400 mt-0.5 leading-snug">
                    {qa.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 6 KPI Metric Cards */}
      <section aria-label="Key Workspace Metrics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={() => onNavigate(kpi.section)}
            className="text-left bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-5 hover:border-[#635BFF]/40 transition-colors"
          >
            <p className="text-[12.5px] font-medium text-[#64748B] dark:text-slate-400">{kpi.label}</p>
            <p className="font-display text-[26px] font-bold text-[#172033] dark:text-slate-100 tabular-nums mt-1.5">
              {kpi.value}
            </p>
            <p className="text-[12px] text-[#64748B] dark:text-slate-400 mt-1">{kpi.sub}</p>
          </button>
        ))}
      </section>

      {/* What Needs Your Attention + Recent Activity & Connected Tools */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
                What needs your attention
              </h3>
              <p className="text-[12.5px] text-[#64748B] dark:text-slate-400">
                Plain-language priorities waiting for your decision
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('approvals')}
              className="text-[12px] font-semibold px-2.5 py-1 rounded-lg bg-[#635BFF]/10 text-[#635BFF] dark:text-indigo-300 tabular-nums whitespace-nowrap"
            >
              {pendingApprovals.length} pending approval{pendingApprovals.length === 1 ? '' : 's'}
            </button>
          </div>

          <div className="divide-y divide-[#E8ECF3] dark:divide-slate-800">
            <div className="py-3 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-4.5 w-4.5 text-[#16A34A] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13.5px] font-semibold text-[#172033] dark:text-slate-100">
                    {pendingApprovals.length > 0
                      ? `${pendingApprovals.length} action${pendingApprovals.length === 1 ? '' : 's'} waiting for your approval`
                      : 'All proposed actions have been reviewed'}
                  </p>
                  <p className="text-[12.5px] text-[#64748B] dark:text-slate-400 mt-0.5">
                    {pendingApprovals[0]?.plainSummary ??
                      pendingApprovals[0]?.title ??
                      'Nothing waiting — run a quick action above to get started.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('approvals')}
                className="text-[12.5px] font-semibold text-[#635BFF] dark:text-indigo-300 hover:underline whitespace-nowrap shrink-0"
              >
                Review
              </button>
            </div>

            <div className="py-3 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="h-4.5 w-4.5 text-[#635BFF] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13.5px] font-semibold text-[#172033] dark:text-slate-100">
                    Laptop warranty is ready to claim ({formatINR(124990)})
                  </p>
                  <p className="text-[12.5px] text-[#64748B] dark:text-slate-400 mt-0.5">
                    Your Zenith 15 Pro Laptop (Croma Retail) is covered through 2028-08-24 with GST Invoice #CRO-987654 on file.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('refunds')}
                className="text-[12.5px] font-semibold text-[#635BFF] dark:text-indigo-300 hover:underline whitespace-nowrap shrink-0"
              >
                Open Case
              </button>
            </div>

            <div className="py-3 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <FileWarning className="h-4.5 w-4.5 text-[#F59E0B] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13.5px] font-semibold text-[#172033] dark:text-slate-100">
                    {contradictionCount > 0
                      ? 'Check a date mismatch on your headphones paperwork'
                      : 'Review your uploaded documents'}
                  </p>
                  <p className="text-[12.5px] text-[#64748B] dark:text-slate-400 mt-0.5">
                    Receipt shows 2026-06-11 while the warranty card lists 2026-06-15.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('documents')}
                className="text-[12.5px] font-semibold text-[#635BFF] dark:text-indigo-300 hover:underline whitespace-nowrap shrink-0"
              >
                Inspect Docs
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
              Recent Activity & Connected Tools
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('activity')}
              className="text-[12.5px] font-medium text-[#635BFF] dark:text-indigo-300 hover:underline whitespace-nowrap"
            >
              Full Timeline
            </button>
          </div>

          <div className="space-y-3">
            {workspace.activityTimeline.slice(0, 3).map((act) => (
              <div key={act.id} className="flex items-start justify-between gap-3 text-[13px]">
                <div className="min-w-0">
                  <p className="font-medium text-[#172033] dark:text-slate-100 truncate">{act.title}</p>
                  <p className="text-[12px] text-[#64748B] dark:text-slate-400 truncate">
                    {act.description}
                  </p>
                </div>
                <span className="font-mono text-[11px] text-[#64748B] dark:text-slate-400 tabular-nums whitespace-nowrap shrink-0">
                  {act.timestamp.slice(0, 10)}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-[#E8ECF3] dark:border-slate-800">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[12.5px] font-semibold text-[#172033] dark:text-slate-100">
                Connected Tools (Simulated)
              </span>
              <button
                type="button"
                onClick={() => onNavigate('mcp')}
                className="text-[12px] font-medium text-[#635BFF] dark:text-indigo-300 hover:underline"
              >
                Inspect Tools
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {workspace.mcpServers.map((srv) => (
                <div
                  key={srv.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700"
                >
                  <span className="flex items-center gap-2 text-[12.5px] font-medium text-[#172033] dark:text-slate-200 truncate">
                    <PlugZap className="h-3.5 w-3.5 text-[#16A34A] shrink-0" />
                    <span className="truncate">{srv.name.replace(' MCP', ' Tool')}</span>
                  </span>
                  <span className="text-[11px] font-medium text-[#64748B] dark:text-slate-400">
                    Demo
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Recharts Analytics Row */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
                Monthly Activity & Value Recovered
              </h3>
              <p className="text-[12.5px] text-[#64748B] dark:text-slate-400">
                Administrative tasks resolved and refund/savings value (₹)
              </p>
            </div>
            <span className="font-mono text-[12px] text-[#64748B] dark:text-slate-400 tabular-nums">
              Jun – Nov 2026
            </span>
          </div>
          <div className="h-64 w-full" data-testid="monthly-activity-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MONTHLY_ACTIVITY_DATA} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="recoveredGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#635BFF" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#635BFF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF3" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value) => formatINR(Number(value ?? 0), 0)}
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E8ECF3',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#172033',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="recovered"
                  name="Recovered / Saved (₹)"
                  stroke="#635BFF"
                  strokeWidth={2}
                  fill="url(#recoveredGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
                Subscription Spending Breakdown
              </h3>
              <p className="text-[12.5px] text-[#64748B] dark:text-slate-400">
                Monthly cost vs. flagged potential savings per service (₹)
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('subscriptions')}
              className="text-[12.5px] font-medium text-[#635BFF] dark:text-indigo-300 hover:underline whitespace-nowrap"
            >
              Manage all
            </button>
          </div>
          <div className="h-64 w-full" data-testid="subscription-spending-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subscriptionChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF3" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value) => formatINR(Number(value ?? 0))}
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E8ECF3',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#172033',
                  }}
                />
                <Bar dataKey="monthly" name="Monthly Cost (₹)" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="savings" name="Potential Savings (₹)" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </div>
  );
}
