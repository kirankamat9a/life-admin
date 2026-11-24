import { Play, PlugZap, Terminal } from 'lucide-react';
import { useState } from 'react';
import { callMcpRpc } from '../api/client';
import type { McpServerState, WorkspaceState } from '../shared/types';

interface McpConnectionsViewProps {
  workspace: WorkspaceState;
  onRefreshWorkspace: () => Promise<void>;
}

const DEFAULT_ARGS: Record<string, Record<string, unknown>> = {
  'email-mcp:search_emails': { query: 'laptop' },
  'email-mcp:read_email': { emailId: 'email-001' },
  'email-mcp:create_email_draft': {
    to: 'support@example.com',
    subject: 'MCP Test Draft',
    body: 'Staged via MCP JSON-RPC test call.',
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
    title: 'MCP Sandbox Check',
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
}: McpConnectionsViewProps) {
  const [rpcOutput, setRpcOutput] = useState<string | null>(null);
  const [runningTool, setRunningTool] = useState<string | null>(null);

  const handleTestTool = async (
    serverId: McpServerState['id'],
    toolName: string
  ) => {
    const key = `${serverId}:${toolName}`;
    setRunningTool(key);
    try {
      const response = await callMcpRpc({
        method: 'tools/call',
        serverId,
        name: toolName,
        arguments: DEFAULT_ARGS[key] ?? {},
      });
      setRpcOutput(JSON.stringify(response, null, 2));
      await onRefreshWorkspace();
    } finally {
      setRunningTool(null);
    }
  };

  const handleDiscoverTools = async (serverId: McpServerState['id']) => {
    setRunningTool(`${serverId}:list`);
    try {
      const response = await callMcpRpc({
        method: 'tools/list',
        serverId,
      });
      setRpcOutput(JSON.stringify(response, null, 2));
    } finally {
      setRunningTool(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Honest MCP Architecture Banner */}
      <section className="bg-white border border-[#E8ECF3] rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-[15px] font-semibold text-[#172033]">
            Model Context Protocol (MCP) Connection Centre
          </h2>
          <p className="text-[13px] text-[#64748B] mt-0.5">
            Four independent JSON-RPC 2.0 MCP servers with live tool discovery (<span className="font-mono text-[#172033]">tools/list</span>) and tool invocation (<span className="font-mono text-[#172033]">tools/call</span>). External OAuth credentials are not configured, so all servers operate transparently in <span className="font-semibold text-[#B45309]">DEMO MODE</span>.
          </p>
        </div>
        <span className="px-3 py-1.5 rounded-lg bg-[#FEF3C7]/70 border border-[#FDE68A] text-[12px] font-semibold text-[#B45309] whitespace-nowrap shrink-0">
          DEMO MODE · Local JSON-RPC 2.0
        </span>
      </section>

      {/* 4 MCP Servers Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {workspace.mcpServers.map((srv) => (
          <article
            key={srv.id}
            className="bg-white border border-[#E8ECF3] rounded-xl p-5 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="p-2 rounded-lg bg-[#635BFF]/[0.08] text-[#635BFF] shrink-0">
                  <PlugZap className="h-4.5 w-4.5" />
                </span>
                <div>
                  <h3 className="font-display text-[16px] font-bold text-[#172033]">
                    {srv.name}
                  </h3>
                  <p className="font-mono text-[11.5px] text-[#64748B]">{srv.transport}</p>
                </div>
              </div>
              <span className="text-[12px] font-semibold text-[#16A34A] whitespace-nowrap">
                {srv.status}
              </span>
            </div>

            <p className="text-[13px] text-[#475569] leading-relaxed">{srv.description}</p>

            <div className="flex items-center justify-between text-[12px] text-[#64748B]">
              <span>Last connection: <span className="font-mono tabular-nums">{srv.lastConnectedAt.slice(0, 19).replace('T', ' ')}</span></span>
              <button
                type="button"
                disabled={runningTool !== null}
                onClick={() => handleDiscoverTools(srv.id)}
                className="font-mono text-[11.5px] font-semibold text-[#635BFF] hover:underline"
              >
                {runningTool === `${srv.id}:list` ? 'Discovering...' : 'Run tools/list'}
              </button>
            </div>

            {/* Available Tools */}
            <div className="pt-2 border-t border-[#E8ECF3]">
              <p className="text-[12px] font-semibold text-[#172033] mb-1.5">
                Available MCP Tools ({srv.tools.length})
              </p>
              <div className="divide-y divide-[#E8ECF3]">
                {srv.tools.map((tool) => {
                  const key = `${srv.id}:${tool.name}`;
                  return (
                    <div
                      key={tool.name}
                      className="py-2.5 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-[12.5px] font-semibold text-[#172033]">
                          {tool.name}
                        </p>
                        <p className="text-[12px] text-[#64748B] mt-0.5">{tool.description}</p>
                      </div>
                      <button
                        type="button"
                        disabled={runningTool !== null}
                        onClick={() => handleTestTool(srv.id, tool.name)}
                        aria-label={`Test ${tool.name} on ${srv.name}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white border border-[#E8ECF3] text-[11.5px] font-semibold text-[#172033] hover:border-[#635BFF] hover:text-[#635BFF] disabled:opacity-50 whitespace-nowrap shrink-0"
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

      {/* JSON-RPC Inspector Output */}
      {rpcOutput && (
        <section className="bg-white border border-[#E8ECF3] rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[14px] font-semibold text-[#172033] flex items-center gap-2">
              <Terminal className="h-4 w-4 text-[#635BFF]" />
              Latest MCP JSON-RPC 2.0 Response
            </h3>
            <button
              type="button"
              onClick={() => setRpcOutput(null)}
              className="text-[12px] text-[#64748B] hover:text-[#172033]"
            >
              Clear
            </button>
          </div>
          <pre className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E8ECF3] font-mono text-[11.5px] text-[#172033] overflow-x-auto max-h-72">
            {rpcOutput}
          </pre>
        </section>
      )}

      {/* Tool Execution History */}
      <section className="bg-white border border-[#E8ECF3] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E8ECF3] flex items-center justify-between">
          <h3 className="font-display text-[15px] font-semibold text-[#172033]">
            MCP Tool Execution History
          </h3>
          <span className="text-[12px] text-[#64748B] tabular-nums">
            {workspace.mcpHistory.length} recorded calls
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E8ECF3] text-[12px] font-semibold text-[#64748B]">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Server</th>
                <th className="py-3 px-4">Tool</th>
                <th className="py-3 px-4">Outcome</th>
                <th className="py-3 px-4">Summary</th>
                <th className="py-3 px-4 text-right">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8ECF3] text-[12.5px]">
              {workspace.mcpHistory.map((inv) => (
                <tr key={inv.id}>
                  <td className="py-3 px-4 font-mono tabular-nums text-[#64748B] whitespace-nowrap">
                    {inv.timestamp.slice(11, 19)}
                  </td>
                  <td className="py-3 px-4 font-medium text-[#172033] whitespace-nowrap">
                    {inv.serverName}
                  </td>
                  <td className="py-3 px-4 font-mono text-[#635BFF] whitespace-nowrap">
                    {inv.toolName}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap font-semibold">
                    <span
                      className={
                        inv.status === 'success'
                          ? 'text-[#16A34A]'
                          : inv.status === 'blocked_approval'
                            ? 'text-[#B45309]'
                            : 'text-[#EF4444]'
                      }
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-[#475569]">{inv.summary}</td>
                  <td className="py-3 px-4 font-mono tabular-nums text-right text-[#64748B]">
                    {inv.durationMs}ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
