import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  FileText,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { rewriteApprovalDraftApi } from '../api/client';
import { buildApprovalPlainSummary, deriveApprovalRiskLevel } from '../shared/domainLogic';
import type { ApprovalRequest, ApprovalRiskLevel, RewriteTone, WorkspaceState } from '../shared/types';
import { HelpTip } from './HelpTip';

function getAssociatedDocumentNames(
  apr: ApprovalRequest,
  workspace: WorkspaceState
): string[] {
  const names: string[] = [];

  for (const cit of apr.evidenceCitations) {
    if (cit.sourceType === 'document') {
      names.push(cit.label);
      const doc = workspace.documents.find((d) => d.id === cit.sourceId);
      if (doc) {
        names.push(doc.title, doc.fileName);
      }
    }
  }

  if (apr.relatedEntityId) {
    const relatedCase = workspace.cases.find((c) => c.id === apr.relatedEntityId);
    if (relatedCase) {
      for (const docId of relatedCase.documentIds) {
        const doc = workspace.documents.find((d) => d.id === docId);
        if (doc) {
          names.push(doc.title, doc.fileName);
        }
      }
    }
  }

  const mcpDocId = apr.mcpArgs?.documentId;
  if (typeof mcpDocId === 'string') {
    const doc = workspace.documents.find((d) => d.id === mcpDocId);
    if (doc) {
      names.push(doc.title, doc.fileName);
    }
  }

  return names;
}

function riskBadgeStyle(risk: ApprovalRiskLevel): string {
  if (risk === 'High') {
    return 'bg-[#FEF2F2] dark:bg-red-950/70 text-[#B91C1C] dark:text-red-300 border-[#FECACA] dark:border-red-800';
  }
  if (risk === 'Medium') {
    return 'bg-[#FFFBEB] dark:bg-amber-950/70 text-[#B45309] dark:text-amber-300 border-[#FDE68A] dark:border-amber-800';
  }
  return 'bg-[#F0FDF4] dark:bg-emerald-950/70 text-[#15803D] dark:text-emerald-300 border-[#BBF7D0] dark:border-emerald-800';
}

interface ApprovalCentreViewProps {
  workspace: WorkspaceState;
  onDecideApproval: (
    id: string,
    decision: 'approve' | 'reject' | 'edit',
    edits?: { subject?: string; messageContent?: string }
  ) => Promise<string | void>;
  onBulkDecideApprovals?: (
    ids: string[],
    decision: 'approve' | 'reject'
  ) => Promise<string | void>;
  onUndoRejectedApproval?: (id: string) => Promise<string | void>;
}

export function ApprovalCentreView({
  workspace,
  onDecideApproval,
  onBulkDecideApprovals,
  onUndoRejectedApproval,
}: ApprovalCentreViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<'approve' | 'reject' | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastRejected, setLastRejected] = useState<{ id: string; title: string } | null>(null);
  const [rewriteToneById, setRewriteToneById] = useState<Record<string, RewriteTone>>({});
  const [rewritingId, setRewritingId] = useState<string | null>(null);
  const [rewritePreview, setRewritePreview] = useState<{
    approvalId: string;
    subject?: string;
    messageContent: string;
    tone: RewriteTone;
    fallbackUsed: boolean;
  } | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchesSearch = (apr: ApprovalRequest) => {
    if (!normalizedQuery) return true;
    if (apr.title.toLowerCase().includes(normalizedQuery)) return true;
    const summary = buildApprovalPlainSummary(apr).toLowerCase();
    if (summary.includes(normalizedQuery)) return true;
    return getAssociatedDocumentNames(apr, workspace).some((name) =>
      name.toLowerCase().includes(normalizedQuery)
    );
  };

  const allPending = workspace.approvals.filter((a) => a.status === 'pending');
  const allHistory = workspace.approvals.filter((a) => a.status !== 'pending');
  const pending = allPending.filter(matchesSearch);
  const history = allHistory.filter(matchesSearch);
  const pendingIdSet = new Set(pending.map((a) => a.id));
  const activeSelectedIds = selectedIds.filter((id) => pendingIdSet.has(id));
  const allSelected = pending.length > 0 && activeSelectedIds.length === pending.length;
  const someSelected = activeSelectedIds.length > 0 && activeSelectedIds.length < pending.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pending.map((a) => a.id));
    }
  };

  const startEdit = (apr: ApprovalRequest) => {
    if (apr.status !== 'pending' || bulkBusy !== null) return;
    setErrorMsg(null);
    setEditingId(apr.id);
    setEditSubject(apr.subject ?? '');
    setEditMessage(apr.messageContent);
  };

  const handleAction = async (
    id: string,
    decision: 'approve' | 'reject' | 'edit',
    edits?: { subject?: string; messageContent?: string }
  ) => {
    setErrorMsg(null);
    setBusyId(id);
    const target = workspace.approvals.find((a) => a.id === id);
    try {
      const errResult = await onDecideApproval(id, decision, edits);
      if (typeof errResult === 'string' && errResult) {
        setErrorMsg(errResult);
        return;
      }
      if (decision === 'edit' || decision === 'approve') {
        setEditingId(null);
        setRewritePreview((curr) => (curr?.approvalId === id ? null : curr));
      }
      if (decision === 'reject' && target) {
        setLastRejected({ id: target.id, title: target.title });
      } else if (decision === 'approve') {
        setLastRejected((curr) => (curr?.id === id ? null : curr));
      }
      if (decision === 'approve' || decision === 'reject') {
        setSelectedIds((prev) => prev.filter((item) => item !== id));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to process approval decision.');
    } finally {
      setBusyId(null);
    }
  };

  const handleBulkAction = async (decision: 'approve' | 'reject') => {
    if (activeSelectedIds.length === 0 || bulkBusy !== null) return;
    setErrorMsg(null);
    setBulkBusy(decision);
    try {
      if (onBulkDecideApprovals) {
        const errResult = await onBulkDecideApprovals(activeSelectedIds, decision);
        if (typeof errResult === 'string' && errResult) {
          setErrorMsg(errResult);
        }
      } else {
        for (const id of activeSelectedIds) {
          const errResult = await onDecideApproval(id, decision);
          if (typeof errResult === 'string' && errResult) {
            setErrorMsg(errResult);
            break;
          }
        }
      }
      setEditingId(null);
      setSelectedIds([]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to process bulk approval decision.');
    } finally {
      setBulkBusy(null);
    }
  };

  const handleRewriteWithAi = async (apr: ApprovalRequest) => {
    const tone = rewriteToneById[apr.id] ?? 'polite';
    setErrorMsg(null);
    setRewritingId(apr.id);
    try {
      const result = await rewriteApprovalDraftApi(apr.id, tone);
      setRewritePreview({
        approvalId: apr.id,
        subject: result.subject,
        messageContent: result.messageContent,
        tone: result.tone,
        fallbackUsed: result.fallbackUsed,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to rewrite draft.');
    } finally {
      setRewritingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-lg bg-[#FEF2F2] dark:bg-red-950/80 border border-[#FECACA] dark:border-red-800 text-[13px] text-[#B91C1C] dark:text-red-200 flex items-center justify-between gap-3"
        >
          <span className="flex items-center gap-2">
            <XCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-[12px] font-semibold underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Undo hint banner after rejecting (Part A.4) */}
      {lastRejected && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 text-[13px] text-[#172033] dark:text-slate-100 flex flex-wrap items-center justify-between gap-3"
        >
          <span>
            Rejected <strong className="font-semibold">{lastRejected.title}</strong>. No external action was sent. Need to reconsider?
          </span>
          <div className="flex items-center gap-3">
            {onUndoRejectedApproval && (
              <button
                type="button"
                onClick={async () => {
                  const err = await onUndoRejectedApproval(lastRejected.id);
                  if (!err) setLastRejected(null);
                  else setErrorMsg(err);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-600 text-[12px] font-semibold text-[#635BFF] dark:text-indigo-300 hover:border-[#635BFF]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Undo reject</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setLastRejected(null)}
              className="text-[12px] text-[#64748B] dark:text-slate-400 hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Safety Guarantee Banner */}
      <section className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-[#635BFF] shrink-0 mt-0.5" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
                Human Approval Gate
              </h2>
              <HelpTip
                title="How Approvals Protect You"
                description="Nothing leaves this workspace without your click. Review the plain-language summary, risk level, and draft text, edit or rewrite with AI if needed, then Approve or Reject."
              />
            </div>
            <p className="text-[13px] text-[#64748B] dark:text-slate-300">
              Emails, subscription cancellations, and calendar bookings are paused here until you explicitly approve them. All actions in Demo Mode are simulated locally.
            </p>
          </div>
        </div>
        <span className="font-mono text-[12.5px] font-semibold text-[#635BFF] dark:text-indigo-300 tabular-nums whitespace-nowrap shrink-0">
          {allPending.length} Pending · {allHistory.length} Audited
        </span>
      </section>

      {/* Search Bar */}
      <section className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative w-full sm:max-w-md">
          <Search className="h-4 w-4 text-[#64748B] dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search approval requests by title or associated document name"
            placeholder="Search approvals by title or document name..."
            className="w-full h-9 pl-9 pr-3 text-[13px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 rounded-lg text-[#172033] dark:text-slate-100 placeholder:text-[#64748B] dark:placeholder:text-slate-400 focus:outline-none focus:border-[#635BFF]"
          />
        </div>
        <div className="flex items-center gap-3 text-[12.5px] text-[#64748B] dark:text-slate-400">
          {normalizedQuery ? (
            <>
              <span className="font-mono tabular-nums">
                Showing {pending.length} of {allPending.length} pending · {history.length} of{' '}
                {allHistory.length} audited
              </span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="font-semibold text-[#635BFF] dark:text-indigo-300 hover:underline whitespace-nowrap"
              >
                Clear
              </button>
            </>
          ) : (
            <span>Filter requests by title or linked document name</span>
          )}
        </div>
      </section>

      {/* Pending Approvals */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
            Pending Approval Requests ({pending.length})
          </h3>
          {pending.length > 0 && (
            <label className="inline-flex items-center gap-2 text-[12.5px] font-medium text-[#475569] dark:text-slate-300 cursor-pointer select-none">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allSelected}
                disabled={bulkBusy !== null}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded accent-[#635BFF] cursor-pointer disabled:opacity-50"
              />
              <span>Select all ({pending.length})</span>
            </label>
          )}
        </div>

        {pending.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-8 text-center">
            {normalizedQuery && allPending.length > 0 ? (
              <>
                <Search className="h-8 w-8 text-[#64748B] mx-auto mb-2" />
                <p className="text-[14px] font-semibold text-[#172033] dark:text-slate-100">
                  No pending approvals match &quot;{searchQuery.trim()}&quot;
                </p>
                <p className="text-[12.5px] text-[#64748B] dark:text-slate-400 mt-1">
                  Try a different approval title or associated document name.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-3 px-3.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 text-[12.5px] font-semibold text-[#635BFF] dark:text-indigo-300 hover:border-[#635BFF]"
                >
                  Clear search
                </button>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-8 w-8 text-[#16A34A] mx-auto mb-2" />
                <p className="text-[14px] font-semibold text-[#172033] dark:text-slate-100">
                  All proposed actions have been reviewed
                </p>
                <p className="text-[12.5px] text-[#64748B] dark:text-slate-400 mt-1">
                  Run a workflow in AI Assistant, Refund &amp; Warranty, Subscriptions, or Appointments to stage a new request.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((apr) => {
              const isPending = apr.status === 'pending';
              const isEditing = isPending && editingId === apr.id;
              const isSelected = activeSelectedIds.includes(apr.id);
              const isBusy = busyId === apr.id || bulkBusy !== null;
              const risk = deriveApprovalRiskLevel(apr);
              const plainSummary = buildApprovalPlainSummary(apr);
              const activeTone = rewriteToneById[apr.id] ?? 'polite';
              const previewForThis =
                rewritePreview && rewritePreview.approvalId === apr.id ? rewritePreview : null;

              return (
                <article
                  key={apr.id}
                  className={`bg-white dark:bg-slate-900 rounded-xl p-6 space-y-5 transition-colors border ${
                    isSelected
                      ? 'border-[#635BFF] ring-1 ring-[#635BFF]/20'
                      : 'border-[#E8ECF3] dark:border-slate-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!isPending || isBusy}
                        onChange={() => toggleSelect(apr.id)}
                        aria-label={`Select ${apr.title}`}
                        className="mt-1 h-4 w-4 rounded accent-[#635BFF] cursor-pointer shrink-0 disabled:opacity-50"
                      />
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11.5px] font-semibold ${riskBadgeStyle(
                              risk
                            )}`}
                          >
                            {risk} Risk
                          </span>
                          <span className="text-[12px] font-medium text-[#64748B] dark:text-slate-400">
                            Waiting for your decision
                          </span>
                        </div>
                        {/* Plain-language summary (Part A.4) */}
                        <h4 className="font-display text-[17px] font-bold text-[#172033] dark:text-slate-100">
                          {plainSummary}
                        </h4>
                        <p className="text-[13px] text-[#64748B] dark:text-slate-300">
                          <span className="font-medium text-[#172033] dark:text-slate-200">{apr.title}</span>
                          <span aria-hidden="true"> · </span>
                          Recipient: <span className="font-medium text-[#172033] dark:text-slate-200">{apr.recipient}</span>
                          {apr.subject && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span>Subject: {apr.subject}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-[11.5px] text-[#64748B] dark:text-slate-400 tabular-nums whitespace-nowrap">
                      {apr.createdAt.slice(0, 19).replace('T', ' ')}
                    </span>
                  </div>

                  {/* Message Content + Write with AI Tone Rewrite */}
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label
                        htmlFor={`msg-${apr.id}`}
                        className="block text-[12.5px] font-semibold text-[#172033] dark:text-slate-100"
                      >
                        Draft Message / Action Details
                      </label>

                      {isPending && apr.actionType !== 'create_appointment' && (
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            aria-label={`Select tone for rewriting ${apr.title}`}
                            value={activeTone}
                            onChange={(e) =>
                              setRewriteToneById((prev) => ({
                                ...prev,
                                [apr.id]: e.target.value as RewriteTone,
                              }))
                            }
                            className="h-8 px-2.5 text-[12px] rounded-lg bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 text-[#172033] dark:text-slate-100"
                          >
                            <option value="polite">Tone: Polite</option>
                            <option value="firm">Tone: Firm</option>
                            <option value="short">Tone: Short</option>
                          </select>
                          <button
                            type="button"
                            disabled={rewritingId === apr.id || isBusy}
                            onClick={() => handleRewriteWithAi(apr)}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#635BFF]/10 text-[#635BFF] dark:text-indigo-300 text-[12px] font-semibold hover:bg-[#635BFF]/20 disabled:opacity-50"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>{rewritingId === apr.id ? 'Rewriting...' : 'Write with AI'}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* AI Rewrite Preview with Accept / Discard (Part C.5) */}
                    {previewForThis && (
                      <div className="p-4 rounded-xl bg-[#635BFF]/[0.04] dark:bg-indigo-950/30 border border-[#635BFF]/30 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[12px] font-semibold text-[#635BFF] dark:text-indigo-300 flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5" />
                            Suggested {previewForThis.tone} rewrite
                            {previewForThis.fallbackUsed && ' (Offline template)'}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setRewritePreview(null)}
                              className="px-2.5 py-1 rounded-md border border-[#E8ECF3] dark:border-slate-700 bg-white dark:bg-slate-800 text-[12px] font-medium text-[#475569] dark:text-slate-300"
                            >
                              Discard
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={async () => {
                                await handleAction(apr.id, 'edit', {
                                  subject: previewForThis.subject,
                                  messageContent: previewForThis.messageContent,
                                });
                              }}
                              className="px-3 py-1 rounded-md bg-[#635BFF] text-white text-[12px] font-semibold hover:bg-[#5249F5]"
                            >
                              Accept Rewrite
                            </button>
                          </div>
                        </div>
                        {previewForThis.subject && (
                          <p className="text-[12px] font-semibold text-[#172033] dark:text-slate-100">
                            Subject: {previewForThis.subject}
                          </p>
                        )}
                        <pre className="text-[12.5px] text-[#172033] dark:text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                          {previewForThis.messageContent}
                        </pre>
                      </div>
                    )}

                    {isEditing ? (
                      <div className="space-y-2.5">
                        {apr.subject !== undefined && (
                          <input
                            type="text"
                            value={editSubject}
                            onChange={(e) => setEditSubject(e.target.value)}
                            aria-label="Edit email subject"
                            className="w-full h-9 px-3 text-[13px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#635BFF] rounded-lg text-[#172033] dark:text-slate-100"
                          />
                        )}
                        <textarea
                          id={`msg-${apr.id}`}
                          rows={6}
                          value={editMessage}
                          onChange={(e) => setEditMessage(e.target.value)}
                          className="w-full p-3 text-[13px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#635BFF] rounded-lg text-[#172033] dark:text-slate-100 font-sans leading-relaxed"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={!isPending || isBusy}
                            onClick={() =>
                              handleAction(apr.id, 'edit', {
                                subject: editSubject,
                                messageContent: editMessage,
                              })
                            }
                            className="px-3.5 py-1.5 rounded-lg bg-[#635BFF] text-white text-[12.5px] font-semibold hover:bg-[#5249F5] disabled:opacity-50"
                          >
                            Save Draft Edits
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-3.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 text-[#475569] dark:text-slate-300 text-[12.5px] font-medium"
                          >
                            Cancel Edit
                          </button>
                        </div>
                      </div>
                    ) : (
                      <pre
                        id={`msg-${apr.id}`}
                        className="p-4 rounded-lg bg-[#F8FAFC] dark:bg-slate-800/80 border border-[#E8ECF3] dark:border-slate-700 text-[12.5px] text-[#172033] dark:text-slate-200 whitespace-pre-wrap font-sans leading-relaxed"
                      >
                        {apr.messageContent}
                      </pre>
                    )}
                  </div>

                  {/* Consequences, Risks & Evidence */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-3.5 rounded-lg bg-[#F8FAFC] dark:bg-slate-800/70 border border-[#E8ECF3] dark:border-slate-700 space-y-1.5">
                      <p className="text-[12px] font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-[#635BFF]" />
                        Supporting Evidence
                      </p>
                      {apr.evidenceCitations.length === 0 ? (
                        <p className="text-[12px] text-[#64748B] dark:text-slate-400">
                          No citations attached.
                        </p>
                      ) : (
                        apr.evidenceCitations.map((c) => (
                          <p key={c.id} className="text-[12px] text-[#475569] dark:text-slate-300">
                            <span className="font-medium text-[#172033] dark:text-slate-100">{c.label}:</span>{' '}
                            {c.excerpt}
                          </p>
                        ))
                      )}
                    </div>

                    <div className="p-3.5 rounded-lg bg-[#F0FDF4] dark:bg-emerald-950/40 border border-[#BBF7D0] dark:border-emerald-800 space-y-1.5">
                      <p className="text-[12px] font-semibold text-[#15803D] dark:text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        What Happens If Approved
                      </p>
                      <ul className="space-y-1 text-[12px] text-[#166534] dark:text-emerald-200">
                        {apr.expectedConsequences.map((c) => (
                          <li key={c}>• {c}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3.5 rounded-lg bg-[#FFFBEB] dark:bg-amber-950/40 border border-[#FDE68A] dark:border-amber-800 space-y-1.5">
                      <p className="text-[12px] font-semibold text-[#B45309] dark:text-amber-300 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Things to Watch Out For
                      </p>
                      <ul className="space-y-1 text-[12px] text-[#92400E] dark:text-amber-200">
                        {apr.potentialRisks.map((r) => (
                          <li key={r}>• {r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Decision Buttons */}
                  <div className="pt-3 border-t border-[#E8ECF3] dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-[12px] text-[#64748B] dark:text-slate-400">
                      Demo Mode: Approving simulates execution locally without sending real emails or charges.
                    </span>
                    {isPending && (
                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          disabled={!isPending || isBusy}
                          onClick={() => handleAction(apr.id, 'reject')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 text-[#EF4444] text-[13px] font-semibold hover:bg-[#FEF2F2] dark:hover:bg-red-950/40 disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" />
                          Reject
                        </button>

                        {!isEditing && (
                          <button
                            type="button"
                            disabled={!isPending || isBusy}
                            onClick={() => startEdit(apr)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 text-[#172033] dark:text-slate-100 text-[13px] font-semibold hover:bg-[#F8FAFC] dark:hover:bg-slate-700 disabled:opacity-50"
                          >
                            <Edit3 className="h-4 w-4" />
                            Edit
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={!isPending || isBusy}
                          onClick={() =>
                            handleAction(
                              apr.id,
                              'approve',
                              isEditing
                                ? { subject: editSubject, messageContent: editMessage }
                                : undefined
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#16A34A] text-white text-[13px] font-semibold hover:bg-[#15803D] disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {busyId === apr.id ? 'Executing...' : 'Approve'}
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Complete Audit History */}
      <section className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E8ECF3] dark:border-slate-800">
          <h3 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
            Approval Audit History
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] dark:bg-slate-800/70 border-b border-[#E8ECF3] dark:border-slate-800 text-[12px] font-semibold text-[#64748B] dark:text-slate-400">
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Recipient</th>
                <th className="py-3 px-4">Decision</th>
                <th className="py-3 px-4">Execution Note</th>
                <th className="py-3 px-4">Decided At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8ECF3] dark:divide-slate-800 text-[12.5px]">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 px-4 text-center text-[#64748B] dark:text-slate-400">
                    {normalizedQuery
                      ? `No approval history matches "${searchQuery.trim()}".`
                      : 'No audited approval decisions yet.'}
                  </td>
                </tr>
              ) : (
                history.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 px-4 font-semibold text-[#172033] dark:text-slate-100">
                      {item.title}
                    </td>
                    <td className="py-3 px-4 text-[#475569] dark:text-slate-300">{item.recipient}</td>
                    <td className="py-3 px-4 font-semibold capitalize">
                      <span
                        className={
                          item.status === 'rejected' ? 'text-[#EF4444]' : 'text-[#16A34A]'
                        }
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#64748B] dark:text-slate-400">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{item.simulatedExecutionNote ?? 'Blocked by human reviewer.'}</span>
                        {item.status === 'rejected' && onUndoRejectedApproval && (
                          <button
                            type="button"
                            onClick={async () => {
                              const err = await onUndoRejectedApproval(item.id);
                              if (err) setErrorMsg(err);
                            }}
                            className="text-[11.5px] font-semibold text-[#635BFF] dark:text-indigo-300 hover:underline"
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-[#64748B] dark:text-slate-400 whitespace-nowrap">
                      {(item.decidedAt ?? item.createdAt).slice(0, 19).replace('T', ' ')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Persistent Bulk Action Toolbar */}
      {activeSelectedIds.length > 0 && (
        <div
          role="region"
          aria-label="Bulk approval actions"
          className="sticky bottom-4 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border border-[#635BFF]/30 shadow-lg rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[13px] font-semibold text-[#172033] dark:text-slate-100 tabular-nums">
              {activeSelectedIds.length} selected
            </span>
            {!allSelected && (
              <button
                type="button"
                disabled={bulkBusy !== null}
                onClick={() => setSelectedIds(pending.map((a) => a.id))}
                className="text-[12.5px] font-semibold text-[#635BFF] dark:text-indigo-300 hover:underline disabled:opacity-50"
              >
                Select all ({pending.length})
              </button>
            )}
            <button
              type="button"
              disabled={bulkBusy !== null}
              onClick={() => setSelectedIds([])}
              className="text-[12.5px] font-medium text-[#64748B] dark:text-slate-400 hover:text-[#172033] dark:hover:text-white disabled:opacity-50"
            >
              Clear selection
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={bulkBusy !== null}
              onClick={() => handleBulkAction('reject')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white dark:bg-slate-800 border border-[#FECACA] dark:border-red-800 text-[#EF4444] text-[13px] font-semibold hover:bg-[#FEF2F2] dark:hover:bg-red-950/40 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              {bulkBusy === 'reject'
                ? 'Rejecting...'
                : `Reject Selected (${activeSelectedIds.length})`}
            </button>
            <button
              type="button"
              disabled={bulkBusy !== null}
              onClick={() => handleBulkAction('approve')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#16A34A] text-white text-[13px] font-semibold hover:bg-[#15803D] disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {bulkBusy === 'approve'
                ? 'Executing...'
                : `Approve Selected (${activeSelectedIds.length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
