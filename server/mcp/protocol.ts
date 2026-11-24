import type { McpServerState, McpToolInvocation, McpToolSchema, WorkspaceState } from '../../src/shared/types';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: 'tools/list' | 'tools/call';
  params: {
    serverId: McpServerState['id'];
    name?: string;
    arguments?: Record<string, unknown>;
  };
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: {
    tools?: McpToolSchema[];
    content?: Array<{ type: 'text' | 'json'; text?: string; data?: unknown }>;
    isError?: boolean;
    mode: 'DEMO_MODE';
    simulated: boolean;
  };
  error?: {
    code: number;
    message: string;
  };
}

export interface McpServerAdapter {
  id: McpServerState['id'];
  listTools: (state: WorkspaceState) => McpToolSchema[];
  executeTool: (
    state: WorkspaceState,
    toolName: string,
    args: Record<string, unknown>
  ) => {
    ok: boolean;
    blockedApproval?: boolean;
    summary: string;
    data: unknown;
  };
}

export class McpClientRouter {
  private servers = new Map<McpServerState['id'], McpServerAdapter>();

  registerServer(adapter: McpServerAdapter): void {
    this.servers.set(adapter.id, adapter);
  }

  handleRpc(state: WorkspaceState, req: JsonRpcRequest): JsonRpcResponse {
    const server = this.servers.get(req.params.serverId);
    if (!server) {
      return {
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32601, message: `Unknown MCP server: ${req.params.serverId}` },
      };
    }

    if (req.method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          tools: server.listTools(state),
          mode: 'DEMO_MODE',
          simulated: true,
        },
      };
    }

    if (req.method === 'tools/call') {
      const toolName = req.params.name ?? '';
      const args = req.params.arguments ?? {};
      const started = Date.now();
      const outcome = server.executeTool(state, toolName, args);
      const durationMs = Math.max(4, Date.now() - started);

      const serverMeta = state.mcpServers.find((s) => s.id === server.id);
      const serverName = serverMeta?.name ?? server.id;
      if (serverMeta) {
        serverMeta.lastConnectedAt = new Date().toISOString();
      }

      const invocation: McpToolInvocation = {
        id: `mcp-inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        serverId: server.id,
        serverName,
        toolName,
        arguments: args,
        status: outcome.blockedApproval
          ? 'blocked_approval'
          : outcome.ok
            ? 'success'
            : 'error',
        durationMs,
        summary: outcome.summary,
        mode: 'DEMO_MODE',
      };

      state.mcpHistory.unshift(invocation);
      if (state.mcpHistory.length > 50) {
        state.mcpHistory.length = 50;
      }

      return {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          content: [
            { type: 'text', text: outcome.summary },
            { type: 'json', data: outcome.data },
          ],
          isError: !outcome.ok,
          mode: 'DEMO_MODE',
          simulated: true,
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id: req.id,
      error: { code: -32601, message: `Unsupported MCP method: ${req.method}` },
    };
  }

  callTool(
    state: WorkspaceState,
    serverId: McpServerState['id'],
    toolName: string,
    args: Record<string, unknown> = {}
  ): { ok: boolean; summary: string; data: unknown; blockedApproval?: boolean } {
    const res = this.handleRpc(state, {
      jsonrpc: '2.0',
      id: `call-${Date.now()}`,
      method: 'tools/call',
      params: { serverId, name: toolName, arguments: args },
    });

    if (res.error) {
      return { ok: false, summary: res.error.message, data: null };
    }

    const jsonPart = res.result?.content?.find((c) => c.type === 'json');
    const textPart = res.result?.content?.find((c) => c.type === 'text');
    const latestInv = state.mcpHistory[0];
    return {
      ok: !res.result?.isError,
      blockedApproval: latestInv?.status === 'blocked_approval',
      summary: textPart?.text ?? 'MCP call completed',
      data: jsonPart?.data ?? null,
    };
  }
}
