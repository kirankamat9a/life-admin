import {
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  CreditCard,
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
import { calculateSubscriptionAnalytics } from '../shared/domainLogic';
import type { NavSection, WorkspaceState } from '../shared/types';

interface OverviewViewProps {
  workspace: WorkspaceState;
  onNavigate: (section: NavSection) => void;
  onRunScenario: (scenario: 1 | 2 | 3) => Promise<void>;
  busyScenario: number | null;
}

const MONTHLY_ACTIVITY_DATA = [
  { month: 'Jun', tasks: 9, recovered: 120 },
  { month: 'Jul', tasks: 12, recovered: 185 },
  { month: 'Aug', tasks: 15, recovered: 240 },
  { month: 'Sep', tasks: 11, recovered: 95 },
  { month: 'Oct', tasks: 18, recovered: 349 },
  { month: 'Nov', tasks: 14, recovered: 410 },
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

  const subscriptionChartData = workspace.subscriptions.map((s) => ({
    name: s.name.split(' ')[0] + (s.name.includes('Plus') ? ' Legacy' : ''),
    monthly: s.category === 'Cancelled' ? 0 : s.monthlyCost,
    savings: s.potentialSavingsMonthly,
  }));

  const kpis = [
    {
      label: 'Active Cases',
      value: String(activeCases.length),
      sub: '1 Eligible · 1 Evidence Needed',
      section: 'refunds' as NavSection,
    },
    {
      label: 'Potential Refund Value',
      value: `$${potentialRefundAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      sub: 'Covered under active warranties',
      section: 'refunds' as NavSection,
    },
    {
      label: 'Monthly Subscriptions',
      value: `$${subStats.activeMonthlySpend.toFixed(2)}`,
      sub: `Save $${subStats.potentialMonthlySavings.toFixed(2)}/mo identified`,
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
      sub: pendingApprovals.length > 0 ? 'Human sign-off required' : 'All actions reviewed',
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
      <section className="bg-white border border-[#E8ECF3] rounded-xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div className="space-y-1.5 max-w-2xl">
          <p className="text-[12px] font-medium text-[#635BFF]">
            Your Everyday Problem-Solving Agent · Demo Sandbox
          </p>
          <h2 className="font-display text-[22px] sm:text-[24px] font-bold tracking-tight text-[#172033]">
            Less time managing life. More time living it.
          </h2>
          <p className="text-[14px] text-[#64748B] leading-relaxed">
            Inspect invoices, catch duplicate subscriptions, and resolve scheduling conflicts through four local Model Context Protocol servers — with zero external actions executed without your explicit approval.
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
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-[#E8ECF3] text-[#172033] text-[13px] font-semibold hover:bg-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
          >
            Review Approvals ({pendingApprovals.length})
          </button>
        </div>
      </section>

      {/* 6 KPI Metric Cards */}
      <section aria-label="Key Workspace Metrics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={() => onNavigate(kpi.section)}
            className="text-left bg-white border border-[#E8ECF3] rounded-xl p-5 hover:border-[#635BFF]/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#635BFF]"
          >
            <p className="text-[12.5px] font-medium text-[#64748B]">{kpi.label}</p>
            <p className="font-display text-[26px] font-bold text-[#172033] tabular-nums mt-1.5">
              {kpi.value}
            </p>
            <p className="text-[12px] text-[#64748B] mt-1">{kpi.sub}</p>
          </button>
        ))}
      </section>

      {/* Interactive Demo Workflows Strip */}
      <section className="bg-white border border-[#E8ECF3] rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h3 className="font-display text-[15px] font-semibold text-[#172033]">
              Interactive Demo Workflows
            </h3>
            <p className="text-[13px] text-[#64748B]">
              Run an end-to-end multi-agent investigation across MCP servers and inspect the generated approval packet.
            </p>
          </div>
          <span className="text-[12px] text-[#64748B] whitespace-nowrap">Simulated Sandbox Data</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E8ECF3] flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[12px] font-semibold text-[#635BFF]">
                <ReceiptText className="h-4 w-4" />
                <span>Scenario 1 · Warranty Claim</span>
              </div>
              <p className="text-[13.5px] font-semibold text-[#172033] mt-2">
                Zenith 15 Pro Laptop Invoice & Warranty
              </p>
              <p className="text-[12.5px] text-[#64748B] mt-1">
                Finds Invoice #TI-987654, verifies 24-month warranty terms, and drafts a claim email for approval.
              </p>
            </div>
            <button
              type="button"
              disabled={busyScenario !== null}
              onClick={() => onRunScenario(1)}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-[#E8ECF3] text-[12.5px] font-semibold text-[#172033] hover:border-[#635BFF] hover:text-[#635BFF] disabled:opacity-50 transition-colors"
            >
              <span>{busyScenario === 1 ? 'Running Agents...' : 'Run Warranty Check'}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E8ECF3] flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[12px] font-semibold text-[#8B5CF6]">
                <CreditCard className="h-4 w-4" />
                <span>Scenario 2 · Subscription Audit</span>
              </div>
              <p className="text-[13.5px] font-semibold text-[#172033] mt-2">
                Recurring Spend & Savings Discovery
              </p>
              <p className="text-[12.5px] text-[#64748B] mt-1">
                Audits 5 subscriptions, flags unused/duplicate plans (${subStats.potentialMonthlySavings.toFixed(2)}/mo), and prepares cancellation.
              </p>
            </div>
            <button
              type="button"
              disabled={busyScenario !== null}
              onClick={() => onRunScenario(2)}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-[#E8ECF3] text-[12.5px] font-semibold text-[#172033] hover:border-[#635BFF] hover:text-[#635BFF] disabled:opacity-50 transition-colors"
            >
              <span>{busyScenario === 2 ? 'Auditing Plans...' : 'Run Subscription Audit'}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E8ECF3] flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[12px] font-semibold text-[#0EA5E9]">
                <CalendarClock className="h-4 w-4" />
                <span>Scenario 3 · Smart Scheduling</span>
              </div>
              <p className="text-[13.5px] font-semibold text-[#172033] mt-2">
                Tomorrow Afternoon Conflict Check
              </p>
              <p className="text-[12.5px] text-[#64748B] mt-1">
                Avoids Q4 Budget & Dental conflicts on Nov 25 and proposes an open afternoon slot for sign-off.
              </p>
            </div>
            <button
              type="button"
              disabled={busyScenario !== null}
              onClick={() => onRunScenario(3)}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-[#E8ECF3] text-[12.5px] font-semibold text-[#172033] hover:border-[#635BFF] hover:text-[#635BFF] disabled:opacity-50 transition-colors"
            >
              <span>{busyScenario === 3 ? 'Checking Calendar...' : 'Find Open Slot'}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Recharts Analytics Row */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E8ECF3] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-[15px] font-semibold text-[#172033]">
                Monthly Activity & Value Recovered
              </h3>
              <p className="text-[12.5px] text-[#64748B]">
                Administrative tasks resolved and refund/savings value ($)
              </p>
            </div>
            <span className="font-mono text-[12px] text-[#64748B] tabular-nums">Jun – Nov 2026</span>
          </div>
          <div className="h-64 w-full" data-testid="monthly-activity-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MONTHLY_ACTIVITY_DATA} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
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
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E8ECF3',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="recovered"
                  name="Recovered / Saved ($)"
                  stroke="#635BFF"
                  strokeWidth={2}
                  fill="url(#recoveredGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-[#E8ECF3] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-[15px] font-semibold text-[#172033]">
                Subscription Spending Breakdown
              </h3>
              <p className="text-[12.5px] text-[#64748B]">
                Monthly cost vs. flagged potential savings per service
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('subscriptions')}
              className="text-[12.5px] font-medium text-[#635BFF] hover:underline whitespace-nowrap"
            >
              Manage all
            </button>
          </div>
          <div className="h-64 w-full" data-testid="subscription-spending-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subscriptionChartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF3" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E8ECF3',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="monthly" name="Monthly Cost ($)" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="savings" name="Potential Savings ($)" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Recommendations, Pending Tasks, Recent Timeline, Connected Apps */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E8ECF3] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[15px] font-semibold text-[#172033]">
              AI Recommendations & Pending Tasks
            </h3>
            <span className="text-[12px] text-[#64748B] tabular-nums">
              {pendingApprovals.length + 2} actionable
            </span>
          </div>

          <div className="divide-y divide-[#E8ECF3]">
            <div className="py-3 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="h-4.5 w-4.5 text-[#635BFF] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13.5px] font-semibold text-[#172033]">
                    File Warranty Service for Zenith 15 Pro Laptop
                  </p>
                  <p className="text-[12.5px] text-[#64748B] mt-0.5">
                    Invoice #TI-987654 ($1,499.99) verified · 639 warranty days remaining
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('refunds')}
                className="text-[12.5px] font-semibold text-[#635BFF] hover:underline whitespace-nowrap shrink-0"
              >
                Open Case
              </button>
            </div>

            <div className="py-3 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <FileWarning className="h-4.5 w-4.5 text-[#F59E0B] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13.5px] font-semibold text-[#172033]">
                    Resolve AeroPulse Date Contradiction
                  </p>
                  <p className="text-[12.5px] text-[#64748B] mt-0.5">
                    Receipt date (2026-06-11) differs from registration card (2026-06-15)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('documents')}
                className="text-[12.5px] font-semibold text-[#635BFF] hover:underline whitespace-nowrap shrink-0"
              >
                Inspect Docs
              </button>
            </div>

            <div className="py-3 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-4.5 w-4.5 text-[#16A34A] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13.5px] font-semibold text-[#172033]">
                    Review Pending Human Approvals ({pendingApprovals.length})
                  </p>
                  <p className="text-[12.5px] text-[#64748B] mt-0.5">
                    {pendingApprovals[0]?.title ?? 'No actions currently queued'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('approvals')}
                className="text-[12.5px] font-semibold text-[#635BFF] hover:underline whitespace-nowrap shrink-0"
              >
                Review
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#E8ECF3] rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[15px] font-semibold text-[#172033]">
              Recent Activity & Connected MCP Servers
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('activity')}
              className="text-[12.5px] font-medium text-[#635BFF] hover:underline whitespace-nowrap"
            >
              Full Timeline
            </button>
          </div>

          <div className="space-y-3">
            {workspace.activityTimeline.slice(0, 3).map((act) => (
              <div key={act.id} className="flex items-start justify-between gap-3 text-[13px]">
                <div className="min-w-0">
                  <p className="font-medium text-[#172033] truncate">{act.title}</p>
                  <p className="text-[12px] text-[#64748B] truncate">{act.description}</p>
                </div>
                <span className="font-mono text-[11px] text-[#64748B] tabular-nums whitespace-nowrap shrink-0">
                  {act.timestamp.slice(0, 10)}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-[#E8ECF3]">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[12.5px] font-semibold text-[#172033]">Connected Applications (MCP)</span>
              <button
                type="button"
                onClick={() => onNavigate('mcp')}
                className="text-[12px] font-medium text-[#635BFF] hover:underline"
              >
                Inspect Servers
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {workspace.mcpServers.map((srv) => (
                <div
                  key={srv.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#E8ECF3]"
                >
                  <span className="flex items-center gap-2 text-[12.5px] font-medium text-[#172033]">
                    <PlugZap className="h-3.5 w-3.5 text-[#16A34A]" />
                    {srv.name}
                  </span>
                  <span className="text-[11px] font-medium text-[#64748B]">Demo</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
