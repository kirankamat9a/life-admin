import { AlertTriangle, CheckCircle2, Info, ShieldCheck } from 'lucide-react';
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
import { calculateSubscriptionAnalytics } from '../shared/domainLogic';
import type { NavSection, SubscriptionCategory, WorkspaceState } from '../shared/types';

interface SubscriptionsViewProps {
  workspace: WorkspaceState;
  globalSearch: string;
  onPrepareCancellation: (subId: string) => Promise<void>;
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
      return 'text-[#635BFF]';
    case 'Cancelled':
      return 'text-[#64748B]';
  }
}

export function SubscriptionsView({
  workspace,
  globalSearch,
  onPrepareCancellation,
  onNavigate,
}: SubscriptionsViewProps) {
  const [filter, setFilter] = useState<'All' | SubscriptionCategory>('All');
  const [busySubId, setBusySubId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(workspace.subscriptions[1]?.id ?? null);

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

  return (
    <div className="space-y-6">
      {/* Top Analytics Summary */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E8ECF3] rounded-xl p-5">
          <p className="text-[12.5px] font-medium text-[#64748B]">Monthly Subscription Spend</p>
          <p className="font-display text-[26px] font-bold text-[#172033] tabular-nums mt-1">
            ${stats.activeMonthlySpend.toFixed(2)}
          </p>
          <p className="text-[12px] text-[#64748B] mt-1 tabular-nums">
            Across {stats.activeCount} recurring plans
          </p>
        </div>

        <div className="bg-white border border-[#E8ECF3] rounded-xl p-5">
          <p className="text-[12.5px] font-medium text-[#64748B]">Annualized Spend</p>
          <p className="font-display text-[26px] font-bold text-[#172033] tabular-nums mt-1">
            ${stats.activeAnnualSpend.toFixed(2)}
          </p>
          <p className="text-[12px] text-[#64748B] mt-1">Projected 12-month total</p>
        </div>

        <div className="bg-white border border-[#E8ECF3] rounded-xl p-5">
          <p className="text-[12.5px] font-medium text-[#64748B]">Potential Monthly Savings</p>
          <p className="font-display text-[26px] font-bold text-[#16A34A] tabular-nums mt-1">
            ${stats.potentialMonthlySavings.toFixed(2)}
          </p>
          <p className="text-[12px] text-[#64748B] mt-1 tabular-nums">
            ${stats.potentialAnnualSavings.toFixed(2)}/year from {stats.flaggedCount} flagged plan(s)
          </p>
        </div>

        <div className="bg-white border border-[#E8ECF3] rounded-xl p-5">
          <p className="text-[12.5px] font-medium text-[#64748B]">Upcoming Charges (14d)</p>
          <p className="font-display text-[26px] font-bold text-[#172033] tabular-nums mt-1">
            {stats.upcomingWithin14Days.length}
          </p>
          <p className="text-[12px] text-[#64748B] mt-1">
            Next: {stats.upcomingWithin14Days[0]?.name ?? 'None due'}
          </p>
        </div>
      </section>

      {/* Spend & Savings Chart */}
      <section className="bg-white border border-[#E8ECF3] rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-[#172033]">
              Annualized Cost vs. Potential Savings by Subscription
            </h2>
            <p className="text-[12.5px] text-[#64748B]">
              Identified via Email MCP billing receipts. Cancellations always require explicit human approval.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('approvals')}
            className="text-[12.5px] font-semibold text-[#635BFF] hover:underline whitespace-nowrap"
          >
            View Approval Queue
          </button>
        </div>
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
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
              <Bar dataKey="monthly" name="Monthly Cost ($)" fill="#635BFF" radius={[4, 4, 0, 0]} />
              <Bar dataKey="savings" name="Flagged Monthly Savings ($)" fill="#16A34A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Category Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors whitespace-nowrap ${
                filter === cat
                  ? 'bg-white text-[#172033] shadow-xs font-semibold'
                  : 'text-[#64748B] hover:text-[#172033]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-[#64748B] flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-[#635BFF]" />
          No subscription is ever cancelled without your approval
        </span>
      </div>

      {/* Subscriptions Table */}
      <div className="bg-white border border-[#E8ECF3] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E8ECF3] bg-[#F8FAFC] text-[12px] font-semibold text-[#64748B]">
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
            <tbody className="divide-y divide-[#E8ECF3] text-[13px]">
              {filteredSubs.map((sub) => {
                const isFlagged = sub.category === 'Duplicate' || sub.category === 'Potentially Unused';
                const pendingApr = workspace.approvals.find(
                  (a) => a.relatedEntityId === sub.id && a.status === 'pending'
                );

                return (
                  <Fragment key={sub.id}>
                    <tr
                      className="hover:bg-[#F8FAFC]/80 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
                          className="text-left focus-visible:outline-none focus-visible:underline"
                        >
                          <p className="font-semibold text-[#172033]">{sub.name}</p>
                          <p className="text-[12px] text-[#64748B]">{sub.provider} · {sub.status}</p>
                        </button>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`font-semibold text-[12.5px] ${categoryColor(sub.category)}`}>
                          {sub.category}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-[#172033]">
                        ${sub.monthlyCost.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#475569]">
                        ${sub.annualCost.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-[#475569]">{sub.billingFrequency}</td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-[#475569]">
                        {sub.lastPayment}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-[#172033]">
                        {sub.nextBillingDate}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {sub.category === 'Cancelled' ? (
                          <span className="text-[12px] text-[#64748B]">Cancelled</span>
                        ) : sub.category === 'Cancellation Pending' ? (
                          <span className="text-[12px] font-medium text-[#635BFF] inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Queued (Demo)
                          </span>
                        ) : pendingApr ? (
                          <button
                            type="button"
                            onClick={() => onNavigate('approvals')}
                            className="px-3 py-1.5 rounded-lg bg-[#635BFF]/[0.08] text-[#635BFF] text-[12px] font-semibold hover:bg-[#635BFF]/[0.14]"
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
                                : 'bg-white border border-[#E8ECF3] text-[#172033] hover:bg-[#F8FAFC]'
                            }`}
                          >
                            {busySubId === sub.id ? 'Preparing...' : 'Prepare Cancellation'}
                          </button>
                        )}
                      </td>
                    </tr>

                    {expandedId === sub.id && (
                      <tr key={`${sub.id}-details`} className="bg-[#F8FAFC]">
                        <td colSpan={8} className="px-4 py-3 text-[12.5px] text-[#475569]">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-start gap-2">
                              {isFlagged ? (
                                <AlertTriangle className="h-4 w-4 text-[#F59E0B] shrink-0 mt-0.5" />
                              ) : (
                                <Info className="h-4 w-4 text-[#635BFF] shrink-0 mt-0.5" />
                              )}
                              <div>
                                <span className="font-semibold text-[#172033]">Usage & Cancellation Instructions: </span>
                                {sub.usageNote} — {sub.cancellationInstructions}
                              </div>
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
      </div>
    </div>
  );
}
