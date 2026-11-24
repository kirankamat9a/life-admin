import {
  CheckCircle2,
  FileUp,
  Paperclip,
  Send,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ApprovalRequest, NavSection, WorkspaceState } from '../shared/types';

function renderInlineBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function FormattedMessage({ content }: { content: string }) {
  const blocks = content.split(/\n\n+/);
  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed">
      {blocks.map((block, bIdx) => {
        const lines = block.split('\n').filter((l) => l.trim().length > 0);
        const isList = lines.length > 0 && lines.every((l) => l.trim().startsWith('- '));
        if (isList) {
          return (
            <ul key={bIdx} className="list-disc pl-5 space-y-1">
              {lines.map((line, lIdx) => (
                <li key={lIdx}>{renderInlineBold(line.trim().slice(2))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bIdx} className="whitespace-pre-line">
            {renderInlineBold(block)}
          </p>
        );
      })}
    </div>
  );
}

interface AssistantViewProps {
  workspace: WorkspaceState;
  geminiConfigured: boolean;
  onSendPrompt: (
    prompt: string,
    attachments?: Array<{ name: string; mimeType: string; documentId?: string }>
  ) => Promise<void>;
  onUploadFile: (file: File) => Promise<{ id: string; fileName: string; mimeType: string } | null>;
  onApproveAction: (id: string, decision: 'approve' | 'reject') => Promise<void>;
  onNavigate: (section: NavSection) => void;
  sending: boolean;
}

const SUGGESTED_PROMPTS = [
  'Find my laptop invoice and check whether it is still under warranty.',
  'Find subscriptions that are charging me every month.',
  'Schedule a meeting tomorrow afternoon without conflicting with my calendar.',
];

export function AssistantView({
  workspace,
  geminiConfigured,
  onSendPrompt,
  onUploadFile,
  onApproveAction,
  onNavigate,
  sending,
}: AssistantViewProps) {
  const [input, setInput] = useState('');
  const [stagedAttachments, setStagedAttachments] = useState<
    Array<{ name: string; mimeType: string; documentId?: string }>
  >([]);
  const [uploading, setUploading] = useState(false);
  const [busyApprovalId, setBusyApprovalId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [workspace.chatMessages.length, sending]);

  const latestRun = workspace.agentRuns[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setInput('');
    const attachments = stagedAttachments.length > 0 ? [...stagedAttachments] : undefined;
    setStagedAttachments([]);
    await onSendPrompt(trimmed, attachments);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await onUploadFile(file);
      if (uploaded) {
        setStagedAttachments((prev) => [
          ...prev,
          { name: uploaded.fileName, mimeType: uploaded.mimeType, documentId: uploaded.id },
        ]);
      }
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const findApproval = (id?: string): ApprovalRequest | undefined =>
    id ? workspace.approvals.find((a) => a.id === id) : undefined;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Main Conversation Workspace */}
      <section className="xl:col-span-8 bg-white border border-[#E8ECF3] rounded-xl flex flex-col min-h-[640px]">
        <div className="px-5 py-4 border-b border-[#E8ECF3] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-[#172033]">
              Evidence-Backed Administrative Assistant
            </h2>
            <p className="text-[12.5px] text-[#64748B]">
              {geminiConfigured
                ? 'Gemini reasoning + Local MCP Servers (Demo Sandbox)'
                : 'Local MCP Rule Engine + Multi-Agent Orchestrator (Demo Sandbox)'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('activity')}
            className="text-[12.5px] font-medium text-[#635BFF] hover:underline whitespace-nowrap"
          >
            Inspect Multi-Agent Monitor
          </button>
        </div>

        {/* Suggested Prompts Bar */}
        <div className="px-5 py-3 bg-[#F8FAFC] border-b border-[#E8ECF3]">
          <p className="text-[11.5px] font-medium text-[#64748B] mb-2">
            Suggested Administrative Workflows
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={sending}
                onClick={() => onSendPrompt(prompt)}
                className="text-left px-3 py-1.5 rounded-lg bg-white border border-[#E8ECF3] text-[12px] font-medium text-[#172033] hover:border-[#635BFF] hover:text-[#635BFF] disabled:opacity-50 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* Message History */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 max-h-[540px]">
          {workspace.chatMessages.map((msg) => {
            const approval = findApproval(msg.approvalId);

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[92%] sm:max-w-[85%] rounded-xl px-4 py-3.5 ${
                    msg.role === 'user'
                      ? 'bg-[#635BFF] text-white'
                      : 'bg-[#F8FAFC] border border-[#E8ECF3] text-[#172033]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 mb-1.5 text-[11px] opacity-80">
                    <span className="font-semibold">
                      {msg.role === 'user' ? workspace.settings.profile.name : 'LIFEADMIN AI'}
                    </span>
                    <span className="font-mono tabular-nums">{msg.timestamp.slice(11, 16)}</span>
                  </div>

                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mb-2 text-[11.5px] opacity-90 flex flex-wrap gap-2">
                      {msg.attachments.map((att) => (
                        <span key={att.name} className="inline-flex items-center gap-1 underline">
                          <Paperclip className="h-3 w-3" />
                          {att.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <FormattedMessage content={msg.content} />

                  {/* Concise Reasoning Summary (no private CoT) */}
                  {msg.reasoningSummary && (
                    <div className="mt-3 pt-2.5 border-t border-[#E8ECF3] text-[12px] text-[#475569]">
                      <span className="font-semibold text-[#172033]">Reasoning summary: </span>
                      {msg.reasoningSummary}
                    </div>
                  )}

                  {/* Tool Execution Timeline */}
                  {msg.toolsExecuted && msg.toolsExecuted.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-[#E8ECF3] space-y-1.5">
                      <p className="text-[11.5px] font-semibold text-[#172033] flex items-center gap-1.5">
                        <Wrench className="h-3.5 w-3.5 text-[#635BFF]" />
                        MCP Tools Executed (Demo Sandbox)
                      </p>
                      <div className="space-y-1">
                        {msg.toolsExecuted.map((tool, idx) => (
                          <div key={`${tool.tool}-${idx}`} className="text-[12px] text-[#475569]">
                            <span className="font-mono text-[#635BFF]">{tool.server}</span>
                            <span aria-hidden="true"> · </span>
                            <span className="font-mono text-[#172033]">{tool.tool}</span>
                            <span aria-hidden="true"> — </span>
                            <span>{tool.summary}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Evidence Citations */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-[#E8ECF3] space-y-1">
                      <p className="text-[11.5px] font-semibold text-[#172033]">Evidence Citations</p>
                      {msg.citations.map((cit) => (
                        <p key={cit.id} className="text-[12px] text-[#64748B]">
                          <span className="font-medium text-[#172033]">{cit.label}:</span> {cit.excerpt}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Inline Human Approval Gate Card */}
                  {approval && (
                    <div className="mt-3 pt-3 border-t border-[#E8ECF3] bg-white rounded-lg p-3.5 border">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[11.5px] font-semibold text-[#635BFF] flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Human Approval Required
                          </p>
                          <p className="text-[13px] font-semibold text-[#172033] mt-0.5">
                            {approval.title}
                          </p>
                          <p className="text-[12px] text-[#64748B] mt-0.5">
                            Recipient: {approval.recipient} · Status: {approval.status.toUpperCase()}
                          </p>
                        </div>
                      </div>

                      {approval.status === 'pending' ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={approval.status !== 'pending' || busyApprovalId === approval.id}
                            onClick={async () => {
                              setBusyApprovalId(approval.id);
                              try {
                                await onApproveAction(approval.id, 'approve');
                              } finally {
                                setBusyApprovalId(null);
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#16A34A] text-white text-[12px] font-semibold hover:bg-[#15803D] disabled:opacity-50 transition-colors"
                          >
                            {busyApprovalId === approval.id ? 'Executing...' : 'Approve & Execute (Demo)'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onNavigate('approvals')}
                            className="px-3 py-1.5 rounded-lg bg-white border border-[#E8ECF3] text-[#172033] text-[12px] font-semibold hover:bg-[#F8FAFC] transition-colors"
                          >
                            Inspect & Edit in Approval Centre
                          </button>
                          <button
                            type="button"
                            disabled={approval.status !== 'pending' || busyApprovalId === approval.id}
                            onClick={async () => {
                              setBusyApprovalId(approval.id);
                              try {
                                await onApproveAction(approval.id, 'reject');
                              } finally {
                                setBusyApprovalId(null);
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg bg-white border border-[#E8ECF3] text-[#EF4444] text-[12px] font-semibold hover:bg-[#FEF2F2] disabled:opacity-50 transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <p className="mt-2 text-[12px] font-medium text-[#16A34A] flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {approval.simulatedExecutionNote ?? `Decision recorded: ${approval.status}`}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="text-[13px] text-[#64748B] px-4 py-3 bg-[#F8FAFC] border border-[#E8ECF3] rounded-xl">
              Orchestrating Intent, Evidence Investigation, Policy Analysis, and Action Planning agents...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input + File Upload Bar */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-[#E8ECF3] bg-white rounded-b-xl space-y-2.5">
          {stagedAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 text-[12px] text-[#475569]">
              {stagedAttachments.map((att) => (
                <span key={att.name} className="inline-flex items-center gap-1.5 bg-[#F8FAFC] border border-[#E8ECF3] px-2.5 py-1 rounded-md">
                  <Paperclip className="h-3 w-3 text-[#635BFF]" />
                  {att.name}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/*,.txt,.csv"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Upload invoice or warranty document"
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach PDF or image document"
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-[#E8ECF3] bg-[#F8FAFC] text-[13px] font-medium text-[#172033] hover:bg-[#F1F5F9] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <FileUp className="h-4 w-4 text-[#64748B]" />
              <span className="hidden sm:inline">{uploading ? 'Uploading...' : 'Attach File'}</span>
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Ask LIFEADMIN AI to solve an administrative task"
              placeholder="Ask about an invoice, warranty, recurring charge, or tomorrow's calendar..."
              className="flex-1 h-10 px-3.5 text-[13.5px] bg-[#F8FAFC] border border-[#E8ECF3] rounded-lg text-[#172033] placeholder:text-[#64748B] focus:outline-none focus:border-[#635BFF] focus:bg-white"
            />

            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send message to AI Assistant"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#635BFF] text-white text-[13px] font-semibold hover:bg-[#5249F5] disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
            >
              <Send className="h-4 w-4" />
              <span>Send</span>
            </button>
          </div>
        </form>
      </section>

      {/* Right Rail: Live Agent Execution Summary */}
      <aside className="xl:col-span-4 bg-white border border-[#E8ECF3] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[14px] font-semibold text-[#172033]">
            Latest Multi-Agent Trace
          </h3>
          <span className="text-[12px] font-medium text-[#635BFF]">
            {latestRun?.overallStatus ?? 'Idle'}
          </span>
        </div>

        {latestRun ? (
          <div className="space-y-3">
            <p className="text-[12.5px] text-[#64748B] leading-snug">
              Prompt: <span className="text-[#172033] font-medium">{latestRun.prompt}</span>
            </p>
            <ol className="space-y-2.5">
              {latestRun.steps.map((step, index) => (
                <li
                  key={step.id}
                  className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E8ECF3] space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold text-[#172033]">
                      0{index + 1}. {step.role}
                    </span>
                    <span
                      className={`text-[11px] font-semibold whitespace-nowrap ${
                        step.status === 'Completed'
                          ? 'text-[#16A34A]'
                          : step.status === 'Waiting for Approval'
                            ? 'text-[#F59E0B]'
                            : 'text-[#64748B]'
                      }`}
                    >
                      {step.status}
                    </span>
                  </div>
                  <p className="text-[12px] text-[#64748B]">{step.taskSummary}</p>
                  {step.toolsInvoked.length > 0 && (
                    <p className="font-mono text-[11px] text-[#635BFF]">
                      {step.toolsInvoked.join(', ')}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="text-[13px] text-[#64748B]">Send a prompt to trace the 5-agent workflow.</p>
        )}
      </aside>
    </div>
  );
}
