import { Play, PlugZap, Terminal, XCircle } from 'lucide-react';
import { useState } from 'react';
import { callMcpRpc } from '../api/client';
import type { McpServerState, WorkspaceState } from '../shared/types';
import { HelpTip } from './HelpTip';

interface McpConnectionsViewProps {
  workspace: WorkspaceState;
  onRefreshWorkspace: () => Promise<void>;
  onToolFeedback?: (kind: 'success' | 'error', message: string) => void;
}

const DEFAULT_ARGS: Record<string, Record<string, unknown>> = {
  'email-mcp:search_emails': { query: 'laptop' },
  'email-mcp:read_email': { emailId: 'email-001' },
  'email-mcp:create_email_draft': {
    to: 'warranty@croma-demo.example',
    subject: 'Draft Follow-Up',
    body: 'Staged via Connected Tools sandbox test.',
  },
  'calendar-mcp:check_availability': {
    start: '2026-11-25T14:00:00',
    end: '2026-11-25T15:00:00',
  },
  'calendar-mcp:find_available_slots': {
    targetDate: '2026-11-25',
    durationMinutes: 60,
    preferredPeriod: 'Afternoon',
  },
  'calendar-mcp:create_calendar_event': {
    title: 'Sandbox Schedule Check',
    start: '2026-11-25T14:00:00',
    end: '2026-11-25T15:00:00',
  },
  'document-mcp:search_documents': { query: 'Zenith' },
  'document-mcp:extract_invoice_details': { documentId: 'doc-invoice-laptop' },
  'document-mcp:analyze_warranty_document': { documentId: 'doc-warranty-laptop' },
  'action-mcp:send_approved_email': { approvalId: 'apr-history-000' },
  'action-mcp:create_approved_appointment': { approvalId: 'unapproved-test' },
  'action-mcp:generate_case_report': { caseId: 'case-laptop-001' },
};

export function McpConnectionsView({
  workspace,
  onRefreshWorkspace,
  onToolFeedback,
}: McpConnectionsViewProps) {
  const [rpcOutput, setRpcOutput] = useState<string | null>(null);
  const [runningTool, setRunningTool] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleTestTool = async (
    serverId: McpServerState['id'],
    toolName: string
  ) => {
    const key = `${serverId}:${toolName}`;
    setRunningTool(key);
    setErrorMsg(null);
    try {
      const response = await callMcpRpc({
        method: 'tools/call',
        serverId,
        name: toolName,
        arguments: DEFAULT_ARGS[key] ?? {},
      });
      setRpcOutput(JSON.stringify(response, null, 2));
      await onRefreshWorkspace();
      onToolFeedback?.('success', `Ran ${toolName} on ${serverId} (Demo Mode).`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to run tool test.';
      setErrorMsg(message);
      onToolFeedback?.('error', message);
    } finally {
      setRunningTool(null);
    }
  };

  const handleDiscoverTools = async (serverId: McpServerState['id']) => {
    setRunningTool(`${serverId}:list`);
    setErrorMsg(null);
    try {
      const response = await callMcpRpc({
        method: 'tools/list',
        serverId,
      });
      setRpcOutput(JSON.stringify(response, null, 2));
      onToolFeedback?.('success', `Listed available tools for ${serverId}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to list tools.';
      setErrorMsg(message);
      onToolFeedback?.('error', message);
    } finally {
      setRunningTool(null);
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

      {/* Plain-Language Connected Tools Overview */}
      <section className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
              Connected Tools (Demo Sandbox)
            </h2>
            <HelpTip
              title="What Are Connected Tools?"
              description="These four local tool connectors let the assistant read emails, check calendar availability, inspect uploaded documents, and simulate approved actions safely in Demo Mode."
            />
          </div>
          <p className="text-[13px] text-[#64748B] dark:text-slate-400 mt-0.5">
            Four local tool connectors (backed by the Model Context Protocol standard) let you inspect available tools and run safe test calls in{' '}
            <span className="font-semibold text-[#B45309] dark:text-amber-300">DEMO MODE</span> without external account credentials.
          </p>
        </div>
        <span className="px-3 py-1.5 rounded-lg bg-[#FEF3C7]/70 dark:bg-amber-950/60 border border-[#FDE68A] dark:border-amber-800 text-[12px] font-semibold text-[#B45309] dark:text-amber-200 whitespace-nowrap shrink-0">
          DEMO MODE · Safe Local Sandbox
        </span>
      </section>

      {/* 4 Tool Connectors Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {workspace.mcpServers.map((srv) => (
          <article
            key={srv.id}
            className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="p-2 rounded-lg bg-[#635BFF]/[0.08] text-[#635BFF] shrink-0">
                  <PlugZap className="h-4.5 w-4.5" />
                </span>
                <div>
                  <h3 className="font-display text-[16px] font-bold text-[#172033] dark:text-slate-100">
                    {srv.name}
                  </h3>
                  <p className="font-mono text-[11.5px] text-[#64748B] dark:text-slate-400">
                    {srv.transport}
                  </p>
                </div>
              </div>
              <span className="text-[12px] font-semibold text-[#16A34A] whitespace-nowrap">
                {srv.status}
              </span>
            </div>

            <p className="text-[13px] text-[#475569] dark:text-slate-300 leading-relaxed">
              {srv.description}
            </p>

            <div className="flex items-center justify-between text-[12px] text-[#64748B] dark:text-slate-400">
              <span>
                Last checked:{' '}
                <span className="font-mono tabular-nums">
                  {srv.lastConnectedAt.slice(0, 19).replace('T', ' ')}
                </span>
              </span>
              <button
                type="button"
                disabled={runningTool !== null}
                onClick={() => handleDiscoverTools(srv.id)}
                className="text-[12px] font-semibold text-[#635BFF] dark:text-indigo-300 hover:underline"
              >
                {runningTool === `${srv.id}:list` ? 'Checking...' : 'Inspect Available Tools'}
              </button>
            </div>

            {/* Available Tools */}
            <div className="pt-2 border-t border-[#E8ECF3] dark:border-slate-800">
              <p className="text-[12px] font-semibold text-[#172033] dark:text-slate-100 mb-1.5">
                Available Capabilities ({srv.tools.length})
              </p>
              <div className="divide-y divide-[#E8ECF3] dark:divide-slate-800">
                {srv.tools.map((tool) => {
                  const key = `${srv.id}:${tool.name}`;
                  return (
                    <div
                      key={tool.name}
                      className="py-2.5 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-[12.5px] font-semibold text-[#172033] dark:text-slate-100">
                          {tool.name}
                        </p>
                        <p className="text-[12px] text-[#64748B] dark:text-slate-400 mt-0.5">
                          {tool.description}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={runningTool !== null}
                        onClick={() => handleTestTool(srv.id, tool.name)}
                        aria-label={`Test ${tool.name} on ${srv.name}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 text-[11.5px] font-semibold text-[#172033] dark:text-slate-100 hover:border-[#635BFF] hover:text-[#635BFF] disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        <Play className="h-3 w-3" />
                        <span>{runningTool === key ? 'Running' : 'Test Call'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </article>
        ))}
      </section>

      {/* Inspector Output */}
      {rpcOutput && (
        <section className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[14px] font-semibold text-[#172033] dark:text-slate-100 flex items-center gap-2">
              <Terminal className="h-4 w-4 text-[#635BFF]" />
              Latest Tool Response
            </h3>
            <button
              type="button"
              onClick={() => setRpcOutput(null)}
              className="text-[12px] text-[#64748B] dark:text-slate-400 hover:text-[#172033] dark:hover:text-white"
            >
              Clear
            </button>
          </div>
          <pre className="p-4 rounded-lg bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 font-mono text-[11.5px] text-[#172033] dark:text-slate-200 overflow-x-auto max-h-72">
            {rpcOutput}
          </pre>
        </section>
      )}

      {/* Tool Execution History */}
      <section className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E8ECF3] dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
            Tool Call History
          </h3>
          <span className="text-[12px] text-[#64748B] dark:text-slate-400 tabular-nums">
            {workspace.mcpHistory.length} recorded calls
          </span>
        </div>
        {workspace.mcpHistory.length === 0 ? (
          <p className="p-6 text-center text-[13px] text-[#64748B] dark:text-slate-400">
            No tool calls recorded yet. Click Test Call on any connector above to inspect a response.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] dark:bg-slate-800/70 border-b border-[#E8ECF3] dark:border-slate-800 text-[12px] font-semibold text-[#64748B] dark:text-slate-400">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Connector</th>
                  <th className="py-3 px-4">Tool</th>
                  <th className="py-3 px-4">Outcome</th>
                  <th className="py-3 px-4">Summary</th>
                  <th className="py-3 px-4 text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8ECF3] dark:divide-slate-800 text-[12.5px]">
                {workspace.mcpHistory.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-3 px-4 font-mono tabular-nums text-[#64748B] dark:text-slate-400 whitespace-nowrap">
                      {inv.timestamp.slice(11, 19)}
                    </td>
                    <td className="py-3 px-4 font-medium text-[#172033] dark:text-slate-100 whitespace-nowrap">
                      {inv.serverName}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#635BFF] dark:text-indigo-300 whitespace-nowrap">
                      {inv.toolName}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-semibold">
                      <span
                        className={
                          inv.status === 'success'
                            ? 'text-[#16A34A]'
                            : inv.status === 'blocked_approval'
                              ? 'text-[#B45309] dark:text-amber-300'
                              : 'text-[#EF4444]'
                        }
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#475569] dark:text-slate-300">{inv.summary}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-right text-[#64748B] dark:text-slate-400">
                      {inv.durationMs}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
