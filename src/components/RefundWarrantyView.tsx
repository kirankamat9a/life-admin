import { AlertCircle, CheckCircle2, FileText, Mail, RefreshCw, Search } from 'lucide-react';
import { useState } from 'react';
import { formatINR } from '../shared/domainLogic';
import type { CaseStatus, NavSection, WorkspaceState } from '../shared/types';
import { HelpTip } from './HelpTip';

interface RefundWarrantyViewProps {
  workspace: WorkspaceState;
  globalSearch: string;
  onInvestigateCase: (caseId: string) => Promise<void>;
  onPrepareComplaint: (caseId: string) => Promise<void>;
  onNavigate: (section: NavSection) => void;
}

const STATUS_FILTERS: Array<'All' | CaseStatus> = [
  'All',
  'Eligible',
  'Evidence Required',
  'Complaint Prepared',
  'Awaiting Response',
  'Resolved',
];

function statusTextColor(status: CaseStatus): string {
  switch (status) {
    case 'Eligible':
    case 'Resolved':
      return 'text-[#16A34A]';
    case 'Evidence Required':
      return 'text-[#F59E0B]';
    case 'Complaint Prepared':
    case 'Awaiting Response':
      return 'text-[#635BFF] dark:text-indigo-300';
    default:
      return 'text-[#64748B] dark:text-slate-400';
  }
}

export function RefundWarrantyView({
  workspace,
  globalSearch,
  onInvestigateCase,
  onPrepareComplaint,
  onNavigate,
}: RefundWarrantyViewProps) {
  const [statusFilter, setStatusFilter] = useState<'All' | CaseStatus>('All');
  const [localSearch, setLocalSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>(workspace.cases[0]?.id ?? '');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const query = (localSearch || globalSearch).toLowerCase().trim();
  const filteredCases = workspace.cases.filter((c) => {
    const matchesStatus = statusFilter === 'All' || c.status === statusFilter;
    const matchesQuery =
      !query ||
      c.product.toLowerCase().includes(query) ||
      c.seller.toLowerCase().includes(query) ||
      c.invoiceNumber.toLowerCase().includes(query);
    return matchesStatus && matchesQuery;
  });

  const activeCase =
    filteredCases.find((c) => c.id === selectedId) ?? filteredCases[0] ?? workspace.cases[0];

  const handleInvestigate = async (id: string) => {
    setBusyAction('investigate');
    try {
      await onInvestigateCase(id);
    } finally {
      setBusyAction(null);
    }
  };

  const handlePrepare = async (id: string) => {
    setBusyAction('complaint');
    try {
      await onPrepareComplaint(id);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filter & Search Bar */}
      <div className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F1F5F9] dark:bg-slate-800 rounded-lg">
            {STATUS_FILTERS.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white dark:bg-slate-900 text-[#172033] dark:text-slate-100 shadow-xs font-semibold'
                    : 'text-[#64748B] dark:text-slate-300 hover:text-[#172033] dark:hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
          <HelpTip
            title="Refund & Warranty Claims"
            description="Review purchase dates, warranty expiration, and missing proof. Click Prepare Complaint for Approval to stage a draft email in the Approval Centre."
          />
        </div>

        <div className="relative w-full lg:w-72">
          <Search className="h-4 w-4 text-[#64748B] dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            aria-label="Filter warranty cases"
            placeholder="Filter product, seller, invoice #..."
            className="w-full h-9 pl-9 pr-3 text-[13px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 rounded-lg text-[#172033] dark:text-slate-100 placeholder:text-[#64748B] dark:placeholder:text-slate-400 focus:outline-none focus:border-[#635BFF]"
          />
        </div>
      </div>

      {/* Master-Detail Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl divide-y divide-[#E8ECF3] dark:divide-slate-800">
          {filteredCases.length === 0 ? (
            <div className="p-8 text-center space-y-2.5">
              <p className="text-[14px] font-semibold text-[#172033] dark:text-slate-100">
                No matching cases
              </p>
              <p className="text-[12.5px] text-[#64748B] dark:text-slate-400">
                Clear filters or upload a new invoice in My Documents.
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                {(statusFilter !== 'All' || localSearch) && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('All');
                      setLocalSearch('');
                    }}
                    className="px-3 py-1.5 rounded-lg border border-[#E8ECF3] dark:border-slate-700 text-[12px] font-semibold text-[#635BFF] dark:text-indigo-300"
                  >
                    Clear filters
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onNavigate('documents')}
                  className="px-3 py-1.5 rounded-lg bg-[#635BFF] text-white text-[12px] font-semibold"
                >
                  Open My Documents
                </button>
              </div>
            </div>
          ) : (
            filteredCases.map((c) => {
              const isSelected = activeCase?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left p-4 transition-colors ${
                    isSelected
                      ? 'bg-[#635BFF]/[0.06] dark:bg-[#635BFF]/15'
                      : 'hover:bg-[#F8FAFC] dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[14px] font-semibold text-[#172033] dark:text-slate-100">
                      {c.product}
                    </p>
                    <span className={`text-[12px] font-semibold whitespace-nowrap ${statusTextColor(c.status)}`}>
                      {c.status}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-[#64748B] dark:text-slate-400 mt-1">
                    {c.seller} · Invoice <span className="font-mono">{c.invoiceNumber}</span>
                  </p>
                  <div className="flex items-center justify-between mt-2 text-[12px] text-[#475569] dark:text-slate-300 tabular-nums">
                    <span>Purchased {c.purchaseDate}</span>
                    <span className="font-semibold text-[#172033] dark:text-slate-100">
                      {formatINR(c.purchaseAmount)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Case Inspector */}
        {activeCase && (
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <p className={`text-[12px] font-semibold ${statusTextColor(activeCase.status)}`}>
                  Status: {activeCase.status}
                </p>
                <h2 className="font-display text-[20px] font-bold text-[#172033] dark:text-slate-100 mt-0.5">
                  {activeCase.product}
                </h2>
                <p className="text-[13px] text-[#64748B] dark:text-slate-400 mt-1">
                  {activeCase.issueSummary}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => handleInvestigate(activeCase.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E8ECF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-[12.5px] font-semibold text-[#172033] dark:text-slate-100 hover:bg-[#F8FAFC] dark:hover:bg-slate-700 disabled:opacity-50 whitespace-nowrap"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>{busyAction === 'investigate' ? 'Checking...' : 'Re-Check Policy'}</span>
                </button>

                {activeCase.status !== 'Resolved' && (
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => handlePrepare(activeCase.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#635BFF] text-white text-[12.5px] font-semibold hover:bg-[#5249F5] disabled:opacity-50 whitespace-nowrap"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span>
                      {busyAction === 'complaint' ? 'Staging...' : 'Prepare Complaint for Approval'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Structured Case Fields */}
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-[#E8ECF3] dark:border-slate-800 text-[13px]">
              <div>
                <dt className="text-[11.5px] text-[#64748B] dark:text-slate-400">Seller</dt>
                <dd className="font-medium text-[#172033] dark:text-slate-100 mt-0.5">
                  {activeCase.seller}
                </dd>
              </div>
              <div>
                <dt className="text-[11.5px] text-[#64748B] dark:text-slate-400">Invoice Number</dt>
                <dd className="font-mono font-medium text-[#172033] dark:text-slate-100 mt-0.5">
                  {activeCase.invoiceNumber}
                </dd>
              </div>
              <div>
                <dt className="text-[11.5px] text-[#64748B] dark:text-slate-400">Purchase Date</dt>
                <dd className="font-mono tabular-nums font-medium text-[#172033] dark:text-slate-100 mt-0.5">
                  {activeCase.purchaseDate}
                </dd>
              </div>
              <div>
                <dt className="text-[11.5px] text-[#64748B] dark:text-slate-400">Purchase Amount</dt>
                <dd className="font-mono tabular-nums font-semibold text-[#172033] dark:text-slate-100 mt-0.5">
                  {formatINR(activeCase.purchaseAmount)}
                </dd>
              </div>
              <div>
                <dt className="text-[11.5px] text-[#64748B] dark:text-slate-400">Warranty Period</dt>
                <dd className="font-medium text-[#172033] dark:text-slate-100 mt-0.5 tabular-nums">
                  {activeCase.warrantyPeriodMonths} Months
                </dd>
              </div>
              <div>
                <dt className="text-[11.5px] text-[#64748B] dark:text-slate-400">Warranty Expiration</dt>
                <dd className="font-mono tabular-nums font-medium text-[#172033] dark:text-slate-100 mt-0.5">
                  {activeCase.warrantyExpiration}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[11.5px] text-[#64748B] dark:text-slate-400">Eligibility Analysis</dt>
                <dd className="text-[#172033] dark:text-slate-200 mt-0.5">
                  {activeCase.eligibilitySummary}
                </dd>
              </div>
            </dl>

            {/* Missing Evidence Alert */}
            {activeCase.missingEvidence.length > 0 && (
              <div className="p-4 rounded-lg bg-[#FFFBEB] dark:bg-amber-950/50 border border-[#FDE68A] dark:border-amber-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-[#B45309] dark:text-amber-300">
                    <AlertCircle className="h-4 w-4" />
                    Missing Evidence Detected
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigate('documents')}
                    className="text-[12px] font-semibold text-[#635BFF] dark:text-indigo-300 hover:underline"
                  >
                    Upload in My Documents
                  </button>
                </div>
                <ul className="list-disc pl-5 text-[12.5px] text-[#92400E] dark:text-amber-200 space-y-1">
                  {activeCase.missingEvidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Evidence Citations */}
            {activeCase.citations.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[13px] font-semibold text-[#172033] dark:text-slate-100">
                  Verified Evidence Citations
                </h3>
                <div className="space-y-2">
                  {activeCase.citations.map((cit) => (
                    <div
                      key={cit.id}
                      className="flex items-start justify-between gap-3 p-3 rounded-lg bg-[#F8FAFC] dark:bg-slate-800/70 border border-[#E8ECF3] dark:border-slate-700"
                    >
                      <div className="flex items-start gap-2.5">
                        <FileText className="h-4 w-4 text-[#635BFF] shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[12.5px] font-semibold text-[#172033] dark:text-slate-100">
                            {cit.label}
                          </p>
                          <p className="text-[12px] text-[#64748B] dark:text-slate-400 mt-0.5">
                            {cit.excerpt}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate('documents')}
                        className="text-[12px] font-medium text-[#635BFF] dark:text-indigo-300 hover:underline whitespace-nowrap shrink-0"
                      >
                        View Doc
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Complaint Draft Preview */}
            {activeCase.complaintDraft && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold text-[#172033] dark:text-slate-100">
                    Prepared Complaint Email
                  </h3>
                  <button
                    type="button"
                    onClick={() => onNavigate('approvals')}
                    className="text-[12px] font-medium text-[#635BFF] dark:text-indigo-300 hover:underline"
                  >
                    Open Approval Centre
                  </button>
                </div>
                <pre className="p-3.5 rounded-lg bg-[#F8FAFC] dark:bg-slate-800/80 border border-[#E8ECF3] dark:border-slate-700 text-[12px] text-[#172033] dark:text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                  {activeCase.complaintDraft}
                </pre>
              </div>
            )}

            {/* Chronological Case Timeline */}
            <div className="space-y-2.5">
              <h3 className="text-[13px] font-semibold text-[#172033] dark:text-slate-100">
                Chronological Case Timeline
              </h3>
              <ol className="space-y-2.5">
                {activeCase.timeline.map((ev) => (
                  <li key={ev.id} className="flex items-start gap-3 text-[12.5px]">
                    <CheckCircle2 className="h-4 w-4 text-[#16A34A] shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#172033] dark:text-slate-100">
                          {ev.title}
                        </span>
                        <span className="font-mono text-[11px] text-[#64748B] dark:text-slate-400 tabular-nums">
                          {ev.timestamp.slice(0, 10)} · {ev.actor}
                        </span>
                      </div>
                      <p className="text-[#64748B] dark:text-slate-400 mt-0.5">{ev.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
