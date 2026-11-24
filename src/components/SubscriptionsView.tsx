import { AlertTriangle, CheckCircle2, Info, ShieldCheck, Sparkles } from 'lucide-react';
import { Fragment, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildDeterministicSubscriptionInsight,
  calculateSubscriptionAnalytics,
  formatINR,
} from '../shared/domainLogic';
import type { NavSection, SubscriptionCategory, WorkspaceState } from '../shared/types';
import { HelpTip } from './HelpTip';

interface SubscriptionsViewProps {
  workspace: WorkspaceState;
  globalSearch: string;
  onPrepareCancellation: (subId: string) => Promise<void>;
  onRefreshInsights: () => Promise<void>;
  onNavigate: (section: NavSection) => void;
}

const CATEGORIES: Array<'All' | SubscriptionCategory> = [
  'All',
  'Active',
  'Potentially Unused',
  'Duplicate',
  'Cancellation Pending',
  'Cancelled',
];

function categoryColor(cat: SubscriptionCategory): string {
  switch (cat) {
    case 'Active':
      return 'text-[#16A34A]';
    case 'Potentially Unused':
      return 'text-[#F59E0B]';
    case 'Duplicate':
      return 'text-[#EF4444]';
    case 'Cancellation Pending':
      return 'text-[#635BFF] dark:text-indigo-300';
    case 'Cancelled':
      return 'text-[#64748B] dark:text-slate-400';
  }
}

export function SubscriptionsView({
  workspace,
  globalSearch,
  onPrepareCancellation,
  onRefreshInsights,
  onNavigate,
}: SubscriptionsViewProps) {
  const [filter, setFilter] = useState<'All' | SubscriptionCategory>('All');
  const [busySubId, setBusySubId] = useState<string | null>(null);
  const [refreshingInsights, setRefreshingInsights] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(
    workspace.subscriptions[1]?.id ?? workspace.subscriptions[0]?.id ?? null
  );

  const stats = calculateSubscriptionAnalytics(
    workspace.subscriptions,
    workspace.referenceDate
  );

  const query = globalSearch.toLowerCase().trim();
  const filteredSubs = workspace.subscriptions.filter((s) => {
    const matchesCat = filter === 'All' || s.category === filter;
    const matchesSearch =
      !query ||
      s.name.toLowerCase().includes(query) ||
      s.provider.toLowerCase().includes(query);
    return matchesCat && matchesSearch;
  });

  const chartData = workspace.subscriptions.map((s) => ({
    name: s.name.replace(' (Personal)', '').replace(' (Legacy Plan)', ' Legacy'),
    monthly: s.category === 'Cancelled' ? 0 : s.monthlyCost,
    annual: s.category === 'Cancelled' ? 0 : s.annualCost,
    savings: s.potentialSavingsMonthly,
  }));

  const handleStageCancellation = async (subId: string) => {
    setBusySubId(subId);
    try {
      await onPrepareCancellation(subId);
    } finally {
      setBusySubId(null);
    }
  };

  const handleRefreshInsights = async () => {
    setRefreshingInsights(true);
    try {
      await onRefreshInsights();
    } finally {
      setRefreshingInsights(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Analytics Summary */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-5">
          <p className="text-[12.5px] font-medium text-[#64748B] dark:text-slate-400">
            Monthly Subscription Spend
          </p>
          <p className="font-display text-[26px] font-bold text-[#172033] dark:text-slate-100 tabular-nums mt-1">
            {formatINR(stats.activeMonthlySpend)}
          </p>
          <p className="text-[12px] text-[#64748B] dark:text-slate-400 mt-1 tabular-nums">
            Across {stats.activeCount} recurring plans
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-5">
          <p className="text-[12.5px] font-medium text-[#64748B] dark:text-slate-400">
            Annualized Spend
          </p>
          <p className="font-display text-[26px] font-bold text-[#172033] dark:text-slate-100 tabular-nums mt-1">
            {formatINR(stats.activeAnnualSpend)}
          </p>
          <p className="text-[12px] text-[#64748B] dark:text-slate-400 mt-1">
            Projected 12-month total
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-5">
          <p className="text-[12.5px] font-medium text-[#64748B] dark:text-slate-400">
            Potential Monthly Savings
          </p>
          <p className="font-display text-[26px] font-bold text-[#16A34A] tabular-nums mt-1">
            {formatINR(stats.potentialMonthlySavings)}
          </p>
          <p className="text-[12px] text-[#64748B] dark:text-slate-400 mt-1 tabular-nums">
            {formatINR(stats.potentialAnnualSavings)}/year from {stats.flaggedCount} flagged plan(s)
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-5">
          <p className="text-[12.5px] font-medium text-[#64748B] dark:text-slate-400">
            Upcoming Charges (14d)
          </p>
          <p className="font-display text-[26px] font-bold text-[#172033] dark:text-slate-100 tabular-nums mt-1">
            {stats.upcomingWithin14Days.length}
          </p>
          <p className="text-[12px] text-[#64748B] dark:text-slate-400 mt-1">
            Next: {stats.upcomingWithin14Days[0]?.name ?? 'None due'}
          </p>
        </div>
      </section>

      {/* Spend & Savings Chart */}
      <section className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
                Monthly Cost vs. Potential Savings
              </h2>
              <HelpTip
                title="Managing Subscriptions Safely"
                description="We detect duplicate or unused plans from your billing emails and generate plain-language savings insights. Preparing a cancellation only creates a draft in the Approval Centre."
              />
            </div>
            <p className="text-[12.5px] text-[#64748B] dark:text-slate-400">
              Identified from connected billing receipts. Cancellations always require your explicit approval.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={refreshingInsights}
              onClick={handleRefreshInsights}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#635BFF]/10 text-[#635BFF] dark:text-indigo-300 text-[12px] font-semibold hover:bg-[#635BFF]/20 disabled:opacity-50 whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{refreshingInsights ? 'Refreshing...' : 'Refresh AI Insights'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('approvals')}
              className="text-[12.5px] font-semibold text-[#635BFF] dark:text-indigo-300 hover:underline whitespace-nowrap"
            >
              View Approval Queue
            </button>
          </div>
        </div>
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
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
              <Bar dataKey="monthly" name="Monthly Cost (₹)" fill="#635BFF" radius={[4, 4, 0, 0]} />
              <Bar dataKey="savings" name="Flagged Monthly Savings (₹)" fill="#16A34A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Category Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F1F5F9] dark:bg-slate-800 rounded-lg">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors whitespace-nowrap ${
                filter === cat
                  ? 'bg-white dark:bg-slate-900 text-[#172033] dark:text-slate-100 shadow-xs font-semibold'
                  : 'text-[#64748B] dark:text-slate-300 hover:text-[#172033] dark:hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-[#64748B] dark:text-slate-400 flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-[#635BFF]" />
          No subscription is ever cancelled without your approval
        </span>
      </div>

      {/* Subscriptions Table */}
      <div className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl overflow-hidden">
        {filteredSubs.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-[14px] font-semibold text-[#172033] dark:text-slate-100">
              No subscriptions match this filter
            </p>
            <p className="text-[12.5px] text-[#64748B] dark:text-slate-400">
              Switch back to All categories or clear the top search bar to see your recurring plans.
            </p>
            {filter !== 'All' && (
              <button
                type="button"
                onClick={() => setFilter('All')}
                className="mt-2 px-3.5 py-1.5 rounded-lg border border-[#E8ECF3] dark:border-slate-700 text-[12.5px] font-semibold text-[#635BFF] dark:text-indigo-300 hover:border-[#635BFF]"
              >
                Show all subscriptions
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E8ECF3] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-800/70 text-[12px] font-semibold text-[#64748B] dark:text-slate-400">
                  <th className="py-3 px-4">Subscription</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Monthly</th>
                  <th className="py-3 px-4 text-right">Annual</th>
                  <th className="py-3 px-4">Billing</th>
                  <th className="py-3 px-4">Last Payment</th>
                  <th className="py-3 px-4">Next Billing</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8ECF3] dark:divide-slate-800 text-[13px]">
                {filteredSubs.map((sub) => {
                  const isFlagged =
                    sub.category === 'Duplicate' || sub.category === 'Potentially Unused';
                  const pendingApr = workspace.approvals.find(
                    (a) => a.relatedEntityId === sub.id && a.status === 'pending'
                  );
                  const insight =
                    sub.aiInsight || buildDeterministicSubscriptionInsight(sub);

                  return (
                    <Fragment key={sub.id}>
                      <tr className="hover:bg-[#F8FAFC]/80 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
                            aria-expanded={expandedId === sub.id}
                            className="text-left focus-visible:underline"
                          >
                            <p className="font-semibold text-[#172033] dark:text-slate-100">
                              {sub.name}
                            </p>
                            <p className="text-[12px] text-[#64748B] dark:text-slate-400">
                              {sub.provider} · {sub.status}
                            </p>
                          </button>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`font-semibold text-[12.5px] ${categoryColor(sub.category)}`}>
                            {sub.category}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-[#172033] dark:text-slate-100">
                          {formatINR(sub.monthlyCost)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#475569] dark:text-slate-300">
                          {formatINR(sub.annualCost)}
                        </td>
                        <td className="py-3.5 px-4 text-[#475569] dark:text-slate-300">
                          {sub.billingFrequency}
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-[#475569] dark:text-slate-300">
                          {sub.lastPayment}
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-[#172033] dark:text-slate-100">
                          {sub.nextBillingDate}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {sub.category === 'Cancelled' ? (
                            <span className="text-[12px] text-[#64748B] dark:text-slate-400">
                              Cancelled
                            </span>
                          ) : sub.category === 'Cancellation Pending' ? (
                            <span className="text-[12px] font-medium text-[#635BFF] dark:text-indigo-300 inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Queued (Demo)
                            </span>
                          ) : pendingApr ? (
                            <button
                              type="button"
                              onClick={() => onNavigate('approvals')}
                              className="px-3 py-1.5 rounded-lg bg-[#635BFF]/[0.08] text-[#635BFF] dark:text-indigo-300 text-[12px] font-semibold hover:bg-[#635BFF]/[0.14]"
                            >
                              Review Approval
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busySubId === sub.id}
                              onClick={() => handleStageCancellation(sub.id)}
                              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors whitespace-nowrap ${
                                isFlagged
                                  ? 'bg-[#635BFF] text-white hover:bg-[#5249F5]'
                                  : 'bg-white dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 text-[#172033] dark:text-slate-100 hover:bg-[#F8FAFC] dark:hover:bg-slate-700'
                              }`}
                            >
                              {busySubId === sub.id ? 'Preparing...' : 'Prepare Cancellation'}
                            </button>
                          )}
                        </td>
                      </tr>

                      {expandedId === sub.id && (
                        <tr key={`${sub.id}-details`} className="bg-[#F8FAFC] dark:bg-slate-800/60">
                          <td colSpan={8} className="px-4 py-3.5 text-[12.5px] text-[#475569] dark:text-slate-300 space-y-2">
                            <div className="flex items-start gap-2 rounded-lg bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-700 p-3">
                              <Sparkles className="h-4 w-4 text-[#635BFF] shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold text-[#172033] dark:text-slate-100">
                                  Plain-Language Insight:{' '}
                                </span>
                                <span>{insight}</span>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              {isFlagged ? (
                                <AlertTriangle className="h-4 w-4 text-[#F59E0B] shrink-0 mt-0.5" />
                              ) : (
                                <Info className="h-4 w-4 text-[#635BFF] shrink-0 mt-0.5" />
                              )}
                              <div>
                                <span className="font-semibold text-[#172033] dark:text-slate-100">
                                  Usage &amp; Cancellation Steps:{' '}
                                </span>
                                {sub.usageNote} — {sub.cancellationInstructions}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
