import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  FileText,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ApprovalRequest, WorkspaceState } from '../shared/types';

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
}

export function ApprovalCentreView({
  workspace,
  onDecideApproval,
  onBulkDecideApprovals,
}: ApprovalCentreViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<'approve' | 'reject' | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const pending = workspace.approvals.filter((a) => a.status === 'pending');
  const history = workspace.approvals.filter((a) => a.status !== 'pending');
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
    try {
      const errResult = await onDecideApproval(id, decision, edits);
      if (typeof errResult === 'string' && errResult) {
        setErrorMsg(errResult);
        return;
      }
      if (decision === 'edit' || decision === 'approve') {
        setEditingId(null);
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

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-[13px] text-[#B91C1C] flex items-center justify-between gap-3"
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

      {/* Safety Guarantee Banner */}
      <section className="bg-white border border-[#E8ECF3] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-[#635BFF] shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display text-[15px] font-semibold text-[#172033]">
              Human Approval Gate
            </h2>
            <p className="text-[13px] text-[#64748B]">
              External emails, subscription cancellations, and calendar bookings are strictly blocked at the Action MCP boundary until you explicitly approve them here. All actions in Demo Mode are simulated locally.
            </p>
          </div>
        </div>
        <span className="font-mono text-[12.5px] font-semibold text-[#635BFF] tabular-nums whitespace-nowrap shrink-0">
          {pending.length} Pending · {history.length} Audited
        </span>
      </section>

      {/* Pending Approvals */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-[15px] font-semibold text-[#172033]">
            Pending Approval Requests ({pending.length})
          </h3>
          {pending.length > 0 && (
            <label className="inline-flex items-center gap-2 text-[12.5px] font-medium text-[#475569] cursor-pointer select-none">
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
          <div className="bg-white border border-[#E8ECF3] rounded-xl p-8 text-center">
            <CheckCircle2 className="h-8 w-8 text-[#16A34A] mx-auto mb-2" />
            <p className="text-[14px] font-semibold text-[#172033]">All proposed actions have been reviewed</p>
            <p className="text-[12.5px] text-[#64748B] mt-1">
              Run a workflow in AI Assistant, Refund & Warranty, Subscriptions, or Appointments to stage a new request.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((apr) => {
              const isPending = apr.status === 'pending';
              const isEditing = isPending && editingId === apr.id;
              const isSelected = activeSelectedIds.includes(apr.id);
              const isBusy = busyId === apr.id || bulkBusy !== null;
              return (
                <article
                  key={apr.id}
                  className={`bg-white rounded-xl p-6 space-y-5 transition-colors border ${
                    isSelected
                      ? 'border-[#635BFF] ring-1 ring-[#635BFF]/20'
                      : 'border-[#E8ECF3]'
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
                      <div>
                        <p className="text-[12px] font-semibold text-[#B45309]">
                          Waiting for Explicit Approval · {apr.mcpServer} / {apr.mcpTool}
                        </p>
                        <h4 className="font-display text-[18px] font-bold text-[#172033] mt-0.5">
                          {apr.title}
                        </h4>
                        <p className="text-[13px] text-[#64748B] mt-1">
                          Recipient: <span className="font-medium text-[#172033]">{apr.recipient}</span>
                          {apr.subject && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span>Subject: {apr.subject}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-[11.5px] text-[#64748B] tabular-nums whitespace-nowrap">
                      {apr.createdAt.slice(0, 19).replace('T', ' ')}
                    </span>
                  </div>

                  {/* Message Content (View or Edit) */}
                  <div className="space-y-2">
                    <label
                      htmlFor={`msg-${apr.id}`}
                      className="block text-[12.5px] font-semibold text-[#172033]"
                    >
                      Proposed Message / Action Payload
                    </label>
                    {isEditing ? (
                      <div className="space-y-2.5">
                        {apr.subject !== undefined && (
                          <input
                            type="text"
                            value={editSubject}
                            onChange={(e) => setEditSubject(e.target.value)}
                            aria-label="Edit email subject"
                            className="w-full h-9 px-3 text-[13px] bg-[#F8FAFC] border border-[#635BFF] rounded-lg text-[#172033]"
                          />
                        )}
                        <textarea
                          id={`msg-${apr.id}`}
                          rows={6}
                          value={editMessage}
                          onChange={(e) => setEditMessage(e.target.value)}
                          className="w-full p-3 text-[13px] bg-[#F8FAFC] border border-[#635BFF] rounded-lg text-[#172033] font-sans leading-relaxed"
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
                            className="px-3.5 py-1.5 rounded-lg bg-white border border-[#E8ECF3] text-[#475569] text-[12.5px] font-medium"
                          >
                            Cancel Edit
                          </button>
                        </div>
                      </div>
                    ) : (
                      <pre
                        id={`msg-${apr.id}`}
                        className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E8ECF3] text-[12.5px] text-[#172033] whitespace-pre-wrap font-sans leading-relaxed"
                      >
                        {apr.messageContent}
                      </pre>
                    )}
                  </div>

                  {/* Consequences, Risks & Evidence */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-3.5 rounded-lg bg-[#F8FAFC] border border-[#E8ECF3] space-y-1.5">
                      <p className="text-[12px] font-semibold text-[#172033] flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-[#635BFF]" />
                        Relevant Evidence
                      </p>
                      {apr.evidenceCitations.length === 0 ? (
                        <p className="text-[12px] text-[#64748B]">No citations attached.</p>
                      ) : (
                        apr.evidenceCitations.map((c) => (
                          <p key={c.id} className="text-[12px] text-[#475569]">
                            <span className="font-medium text-[#172033]">{c.label}:</span> {c.excerpt}
                          </p>
                        ))
                      )}
                    </div>

                    <div className="p-3.5 rounded-lg bg-[#F0FDF4] border border-[#BBF7D0] space-y-1.5">
                      <p className="text-[12px] font-semibold text-[#15803D] flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Expected Consequences
                      </p>
                      <ul className="space-y-1 text-[12px] text-[#166534]">
                        {apr.expectedConsequences.map((c) => (
                          <li key={c}>• {c}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3.5 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] space-y-1.5">
                      <p className="text-[12px] font-semibold text-[#B45309] flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Potential Risks
                      </p>
                      <ul className="space-y-1 text-[12px] text-[#92400E]">
                        {apr.potentialRisks.map((r) => (
                          <li key={r}>• {r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Decision Buttons */}
                  <div className="pt-3 border-t border-[#E8ECF3] flex flex-wrap items-center justify-between gap-3">
                    <span className="text-[12px] text-[#64748B]">
                      Demo Mode: Approving records simulated execution in local sandbox only.
                    </span>
                    {isPending && (
                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          disabled={!isPending || isBusy}
                          onClick={() => handleAction(apr.id, 'reject')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-[#E8ECF3] text-[#EF4444] text-[13px] font-semibold hover:bg-[#FEF2F2] disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" />
                          Reject
                        </button>

                        {!isEditing && (
                          <button
                            type="button"
                            disabled={!isPending || isBusy}
                            onClick={() => startEdit(apr)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-[#E8ECF3] text-[#172033] text-[13px] font-semibold hover:bg-[#F8FAFC] disabled:opacity-50"
                          >
                            <Edit3 className="h-4 w-4" />
                            Edit Request
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
      <section className="bg-white border border-[#E8ECF3] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E8ECF3]">
          <h3 className="font-display text-[15px] font-semibold text-[#172033]">
            Approval Audit History
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E8ECF3] text-[12px] font-semibold text-[#64748B]">
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Recipient</th>
                <th className="py-3 px-4">Decision</th>
                <th className="py-3 px-4">Execution Note</th>
                <th className="py-3 px-4">Decided At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8ECF3] text-[12.5px]">
              {history.map((item) => (
                <tr key={item.id}>
                  <td className="py-3 px-4 font-semibold text-[#172033]">{item.title}</td>
                  <td className="py-3 px-4 text-[#475569]">{item.recipient}</td>
                  <td className="py-3 px-4 font-semibold capitalize">
                    <span
                      className={
                        item.status === 'rejected' ? 'text-[#EF4444]' : 'text-[#16A34A]'
                      }
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-[#64748B]">
                    {item.simulatedExecutionNote ?? 'Blocked by human reviewer.'}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-[#64748B] whitespace-nowrap">
                    {(item.decidedAt ?? item.createdAt).slice(0, 19).replace('T', ' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Persistent Bulk Action Toolbar */}
      {activeSelectedIds.length > 0 && (
        <div
          role="region"
          aria-label="Bulk approval actions"
          className="sticky bottom-4 z-30 bg-white/95 backdrop-blur-sm border border-[#635BFF]/30 shadow-lg rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[13px] font-semibold text-[#172033] tabular-nums">
              {activeSelectedIds.length} selected
            </span>
            {!allSelected && (
              <button
                type="button"
                disabled={bulkBusy !== null}
                onClick={() => setSelectedIds(pending.map((a) => a.id))}
                className="text-[12.5px] font-semibold text-[#635BFF] hover:underline disabled:opacity-50"
              >
                Select all ({pending.length})
              </button>
            )}
            <button
              type="button"
              disabled={bulkBusy !== null}
              onClick={() => setSelectedIds([])}
              className="text-[12.5px] font-medium text-[#64748B] hover:text-[#172033] disabled:opacity-50"
            >
              Clear selection
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={bulkBusy !== null}
              onClick={() => handleBulkAction('reject')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-[#FECACA] text-[#EF4444] text-[13px] font-semibold hover:bg-[#FEF2F2] disabled:opacity-50"
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
