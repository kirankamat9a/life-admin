import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileUp,
  Mic,
  MicOff,
  Paperclip,
  Send,
  ShieldCheck,
  Square,
  Wrench,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { validateDocumentUploadMeta } from '../shared/domainLogic';
import type { ApprovalRequest, NavSection, WorkspaceState } from '../shared/types';
import { HelpTip } from './HelpTip';

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

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface AssistantViewProps {
  workspace: WorkspaceState;
  aiOnline: boolean;
  onSendPrompt: (
    prompt: string,
    attachments?: Array<{ name: string; mimeType: string; documentId?: string }>
  ) => Promise<void>;
  onStopStreaming: () => void;
  onUploadFile: (file: File) => Promise<{ id: string; fileName: string; mimeType: string } | null>;
  onApproveAction: (id: string, decision: 'approve' | 'reject') => Promise<void>;
  onNavigate: (section: NavSection) => void;
  sending: boolean;
  streamingStep: string | null;
  streamingText: string;
  streamingTools: Array<{ server: string; tool: string; summary: string }>;
}

const SUGGESTED_PROMPTS = [
  'Find my Croma laptop GST invoice and check whether it is still under warranty.',
  'Find UPI AutoPay & recurring subscriptions charging me every month.',
  'Schedule a meeting tomorrow afternoon (IST) without conflicting with my calendar.',
  "What are my rights under India's Consumer Protection Act, 2019 for a defective laptop?",
];

export function AssistantView({
  workspace,
  aiOnline,
  onSendPrompt,
  onStopStreaming,
  onUploadFile,
  onApproveAction,
  onNavigate,
  sending,
  streamingStep,
  streamingText,
  streamingTools,
}: AssistantViewProps) {
  const [input, setInput] = useState('');
  const [stagedAttachments, setStagedAttachments] = useState<
    Array<{ name: string; mimeType: string; documentId?: string }>
  >([]);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [busyApprovalId, setBusyApprovalId] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const speechSupported =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [workspace.chatMessages.length, sending, streamingText]);

  const latestRun = workspace.agentRuns[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setInput('');
    setVoiceNote(null);
    const attachments = stagedAttachments.length > 0 ? [...stagedAttachments] : undefined;
    setStagedAttachments([]);
    await onSendPrompt(trimmed, attachments);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadErr(null);

    const check = validateDocumentUploadMeta({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
    if (!check.valid) {
      setUploadErr(check.error ?? 'Invalid file.');
      e.target.value = '';
      return;
    }

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

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsgId(id);
      setTimeout(() => {
        setCopiedMsgId((curr) => (curr === id ? null : curr));
      }, 2000);
    } catch {
      // Clipboard blocked in restricted context
    }
  };

  const toggleVoiceInput = () => {
    setVoiceNote(null);
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRec) {
      setVoiceNote('Voice dictation is unavailable in this browser. Type your request below.');
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = 'en-IN';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (ev) => {
        const transcript = ev.results?.[0]?.[0]?.transcript ?? '';
        if (transcript) {
          setInput((prev) => (prev ? `${prev.trim()} ${transcript}` : transcript));
        }
      };
      rec.onerror = () => {
        setListening(false);
        setVoiceNote('Could not capture voice audio. Check microphone permissions.');
      };
      rec.onend = () => {
        setListening(false);
      };
      recognitionRef.current = rec;
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
      setVoiceNote('Voice dictation could not start in this browser.');
    }
  };

  const findApproval = (id?: string): ApprovalRequest | undefined =>
    id ? workspace.approvals.find((a) => a.id === id) : undefined;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Main Conversation Workspace */}
      <section className="xl:col-span-8 bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl flex flex-col min-h-[640px]">
        <div className="px-5 py-4 border-b border-[#E8ECF3] dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div>
              <h2 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
                Everyday Administrative Assistant
              </h2>
              <p className="text-[12.5px] text-[#64748B] dark:text-slate-400">
                {aiOnline
                  ? 'Connected to Gemini AI + Local Demo Tools'
                  : 'AI offline (fallback mode) · Using local rules & demo records'}
              </p>
            </div>
            <HelpTip
              title="Using the AI Assistant"
              description="Ask about invoices, warranties, subscriptions, calendar slots, or consumer rights. The assistant gathers facts from your workspace and stages drafts in the Approval Centre before anything is sent."
            />
          </div>
          <button
            type="button"
            onClick={() => onNavigate('activity')}
            className="text-[12.5px] font-medium text-[#635BFF] dark:text-indigo-300 hover:underline whitespace-nowrap"
          >
            View Step Timeline
          </button>
        </div>

        {/* Suggested Prompt Chips */}
        <div className="px-5 py-3 bg-[#F8FAFC] dark:bg-slate-950/50 border-b border-[#E8ECF3] dark:border-slate-800">
          <p className="text-[11.5px] font-medium text-[#64748B] dark:text-slate-400 mb-2">
            Try a suggested question
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={sending}
                onClick={() => onSendPrompt(prompt)}
                className="text-left px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-700 text-[12px] font-medium text-[#172033] dark:text-slate-200 hover:border-[#635BFF] hover:text-[#635BFF] dark:hover:text-indigo-300 disabled:opacity-50 transition-colors"
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
                      : 'bg-[#F8FAFC] dark:bg-slate-800/80 border border-[#E8ECF3] dark:border-slate-700 text-[#172033] dark:text-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 mb-1.5 text-[11px] opacity-85">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {msg.role === 'user' ? workspace.settings.profile.name : 'LIFEADMIN AI'}
                      </span>
                      {msg.role === 'assistant' && msg.fallbackMode && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[#475569] dark:text-slate-200 text-[10px] font-medium">
                          Fallback mode
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono tabular-nums">{msg.timestamp.slice(11, 16)}</span>
                      {msg.role === 'assistant' && (
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.id, msg.content)}
                          aria-label="Copy assistant answer"
                          title="Copy answer"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#E8ECF3] dark:border-slate-600 bg-white dark:bg-slate-900 text-[#475569] dark:text-slate-200 hover:text-[#635BFF] text-[10.5px] font-medium"
                        >
                          {copiedMsgId === msg.id ? (
                            <>
                              <Check className="h-3 w-3 text-[#16A34A]" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
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

                  {/* Concise Summary */}
                  {msg.reasoningSummary && (
                    <div className="mt-3 pt-2.5 border-t border-[#E8ECF3] dark:border-slate-700 text-[12px] text-[#475569] dark:text-slate-300">
                      <span className="font-semibold text-[#172033] dark:text-slate-100">Summary: </span>
                      {msg.reasoningSummary}
                    </div>
                  )}

                  {/* Tool Execution Timeline */}
                  {msg.toolsExecuted && msg.toolsExecuted.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-[#E8ECF3] dark:border-slate-700 space-y-1.5">
                      <p className="text-[11.5px] font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-1.5">
                        <Wrench className="h-3.5 w-3.5 text-[#635BFF]" />
                        Tools Checked (Demo Sandbox)
                      </p>
                      <div className="space-y-1">
                        {msg.toolsExecuted.map((tool, idx) => (
                          <div key={`${tool.tool}-${idx}`} className="text-[12px] text-[#475569] dark:text-slate-300">
                            <span className="font-mono text-[#635BFF] dark:text-indigo-300">{tool.server}</span>
                            <span aria-hidden="true"> · </span>
                            <span className="font-mono text-[#172033] dark:text-slate-100">{tool.tool}</span>
                            <span aria-hidden="true"> — </span>
                            <span>{tool.summary}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Evidence Citations */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-[#E8ECF3] dark:border-slate-700 space-y-1">
                      <p className="text-[11.5px] font-semibold text-[#172033] dark:text-slate-100">
                        Source Citations
                      </p>
                      {msg.citations.map((cit) => (
                        <p key={cit.id} className="text-[12px] text-[#64748B] dark:text-slate-300">
                          <span className="font-medium text-[#172033] dark:text-slate-100">{cit.label}:</span>{' '}
                          {cit.excerpt}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Google Search Grounding Sources (Part C.8) */}
                  {msg.groundingSources && msg.groundingSources.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-[#E8ECF3] dark:border-slate-700 space-y-1.5">
                      <p className="text-[11.5px] font-semibold text-[#172033] dark:text-slate-100">
                        Web Sources (Google Search)
                      </p>
                      <ul className="space-y-1">
                        {msg.groundingSources.map((src) => (
                          <li key={src.uri}>
                            <a
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[12px] text-[#635BFF] dark:text-indigo-300 hover:underline"
                            >
                              <span>{src.title}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Inline Human Approval Gate Card */}
                  {approval && (
                    <div className="mt-3 pt-3 border-t border-[#E8ECF3] dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg p-3.5 border">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[11.5px] font-semibold text-[#635BFF] dark:text-indigo-300 flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Human Approval Required
                          </p>
                          <p className="text-[13px] font-semibold text-[#172033] dark:text-slate-100 mt-0.5">
                            {approval.plainSummary ?? approval.title}
                          </p>
                          <p className="text-[12px] text-[#64748B] dark:text-slate-400 mt-0.5">
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
                            className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 text-[#172033] dark:text-slate-100 text-[12px] font-semibold hover:bg-[#F8FAFC] dark:hover:bg-slate-700 transition-colors"
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
                            className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 text-[#EF4444] text-[12px] font-semibold hover:bg-[#FEF2F2] dark:hover:bg-red-950/50 disabled:opacity-50 transition-colors"
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

          {/* Live Streaming Step & Token Indicator (Part A.3, C.3) */}
          {sending && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl px-4 py-3.5 bg-[#F8FAFC] dark:bg-slate-800/80 border border-[#635BFF]/30 space-y-2.5 max-w-[92%] sm:max-w-[85%]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[#635BFF] dark:text-indigo-300">
                  <span className="h-2 w-2 rounded-full bg-[#635BFF] animate-ping" />
                  <span>{streamingStep ?? 'Thinking…'}</span>
                </div>
                <button
                  type="button"
                  onClick={onStopStreaming}
                  aria-label="Stop generating response"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-[#FECACA] dark:border-red-800 text-[11.5px] font-semibold text-[#EF4444] hover:bg-[#FEF2F2]"
                >
                  <Square className="h-3 w-3 fill-current" />
                  <span>Stop</span>
                </button>
              </div>

              {streamingTools.length > 0 && (
                <div className="text-[11.5px] text-[#475569] dark:text-slate-300 space-y-0.5">
                  {streamingTools.map((t, idx) => (
                    <p key={`${t.tool}-${idx}`} className="font-mono">
                      • {t.server}: {t.summary}
                    </p>
                  ))}
                </div>
              )}

              {streamingText && (
                <div className="pt-1 border-t border-[#E8ECF3] dark:border-slate-700 text-[#172033] dark:text-slate-100">
                  <FormattedMessage content={streamingText} />
                </div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input + File Upload + Voice Dictation Bar */}
        <form
          onSubmit={handleSubmit}
          className="p-4 border-t border-[#E8ECF3] dark:border-slate-800 bg-white dark:bg-slate-900 rounded-b-xl space-y-2.5"
        >
          {uploadErr && (
            <p role="alert" className="text-[12px] text-[#EF4444] font-medium">
              {uploadErr}
            </p>
          )}
          {voiceNote && (
            <p role="status" className="text-[12px] text-[#B45309] dark:text-amber-300 font-medium">
              {voiceNote}
            </p>
          )}
          {stagedAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 text-[12px] text-[#475569] dark:text-slate-300">
              {stagedAttachments.map((att) => (
                <span
                  key={att.name}
                  className="inline-flex items-center gap-1.5 bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 px-2.5 py-1 rounded-md"
                >
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
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Upload invoice or warranty document"
            />
            <button
              type="button"
              disabled={uploading || sending}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach PDF, image, or text document"
              title="Attach PDF, PNG, JPG, TXT, or CSV (max 10 MB)"
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-[#E8ECF3] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 text-[13px] font-medium text-[#172033] dark:text-slate-100 hover:bg-[#F1F5F9] dark:hover:bg-slate-700 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <FileUp className="h-4 w-4 text-[#64748B] dark:text-slate-300" />
              <span className="hidden sm:inline">{uploading ? 'Uploading...' : 'Attach'}</span>
            </button>

            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={sending}
              aria-label={listening ? 'Stop voice dictation' : 'Dictate request using microphone'}
              title={
                speechSupported
                  ? listening
                    ? 'Stop voice input'
                    : 'Voice input (Speech-to-Text)'
                  : 'Voice input is unavailable in this browser'
              }
              className={`p-2.5 rounded-lg border transition-colors shrink-0 ${
                listening
                  ? 'border-[#EF4444] bg-[#FEF2F2] text-[#EF4444]'
                  : 'border-[#E8ECF3] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 text-[#475569] dark:text-slate-300 hover:text-[#635BFF]'
              }`}
            >
              {speechSupported ? (
                <Mic className="h-4 w-4" />
              ) : (
                <MicOff className="h-4 w-4 opacity-60" />
              )}
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={4000}
              aria-label="Ask LIFEADMIN AI to solve an administrative task"
              placeholder="Ask about a GST invoice, warranty, UPI AutoPay charge, or tomorrow's IST calendar..."
              className="flex-1 min-w-0 h-10 px-3.5 text-[13.5px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 rounded-lg text-[#172033] dark:text-slate-100 placeholder:text-[#64748B] dark:placeholder:text-slate-400 focus:outline-none focus:border-[#635BFF] focus:bg-white dark:focus:bg-slate-900"
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
      <aside className="xl:col-span-4 bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[14px] font-semibold text-[#172033] dark:text-slate-100">
            Latest Workflow Steps
          </h3>
          <span className="text-[12px] font-medium text-[#635BFF] dark:text-indigo-300">
            {sending ? 'Running…' : latestRun?.overallStatus ?? 'Idle'}
          </span>
        </div>

        {latestRun ? (
          <div className="space-y-3">
            <p className="text-[12.5px] text-[#64748B] dark:text-slate-400 leading-snug">
              Request:{' '}
              <span className="text-[#172033] dark:text-slate-100 font-medium">{latestRun.prompt}</span>
            </p>
            <ol className="space-y-2.5">
              {latestRun.steps.map((step, index) => (
                <li
                  key={step.id}
                  className="p-3 rounded-lg bg-[#F8FAFC] dark:bg-slate-800/80 border border-[#E8ECF3] dark:border-slate-700 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold text-[#172033] dark:text-slate-100">
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
                  <p className="text-[12px] text-[#64748B] dark:text-slate-300">{step.taskSummary}</p>
                  {step.toolsInvoked.length > 0 && (
                    <p className="font-mono text-[11px] text-[#635BFF] dark:text-indigo-300">
                      {step.toolsInvoked.join(', ')}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="text-[13px] text-[#64748B] dark:text-slate-400">
            Send a prompt to see step-by-step progress.
          </p>
        )}
      </aside>
    </div>
  );
}
