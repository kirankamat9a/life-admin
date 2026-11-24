import type { WorkspaceState } from '../shared/types';

export interface WorkspaceApiResponse extends WorkspaceState {
  geminiConfigured: boolean;
}

async function handleJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export async function fetchWorkspace(): Promise<WorkspaceApiResponse> {
  const res = await fetch('/api/workspace');
  return handleJson<WorkspaceApiResponse>(res);
}

export async function sendAssistantPrompt(
  prompt: string,
  attachments?: Array<{ name: string; mimeType: string; documentId?: string }>
): Promise<{
  message: WorkspaceState['chatMessages'][number];
  agentRun: WorkspaceState['agentRuns'][number];
  createdApproval?: WorkspaceState['approvals'][number];
  geminiError?: string;
  state: WorkspaceApiResponse;
}> {
  const res = await fetch('/api/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, attachments }),
  });
  return handleJson(res);
}

export async function runDemoScenario(scenario: 1 | 2 | 3): Promise<{
  message: WorkspaceState['chatMessages'][number];
  agentRun: WorkspaceState['agentRuns'][number];
  createdApproval?: WorkspaceState['approvals'][number];
  state: WorkspaceApiResponse;
}> {
  const res = await fetch('/api/scenarios/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario }),
  });
  return handleJson(res);
}

export async function decideApproval(
  id: string,
  decision: 'approve' | 'reject' | 'edit',
  edits?: { subject?: string; messageContent?: string }
): Promise<{
  approval: WorkspaceState['approvals'][number];
  state: WorkspaceApiResponse;
}> {
  const res = await fetch(`/api/approvals/${encodeURIComponent(id)}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, ...edits }),
  });
  return handleJson(res);
}

export async function bulkDecideApprovals(
  ids: string[],
  decision: 'approve' | 'reject'
): Promise<{
  processed: WorkspaceState['approvals'];
  failures: Array<{ id: string; status: number; error: string }>;
  state: WorkspaceApiResponse;
}> {
  const res = await fetch('/api/approvals/bulk-decide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, decision }),
  });
  return handleJson(res);
}

export async function investigateCase(caseId: string): Promise<{
  case: WorkspaceState['cases'][number];
  state: WorkspaceApiResponse;
}> {
  const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/investigate`, {
    method: 'POST',
  });
  return handleJson(res);
}

export async function prepareCaseComplaint(caseId: string): Promise<{
  approval: WorkspaceState['approvals'][number];
  case: WorkspaceState['cases'][number];
  state: WorkspaceApiResponse;
}> {
  const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/prepare-complaint`, {
    method: 'POST',
  });
  return handleJson(res);
}

export async function prepareSubscriptionCancellation(subId: string): Promise<{
  approval: WorkspaceState['approvals'][number];
  state: WorkspaceApiResponse;
}> {
  const res = await fetch(`/api/subscriptions/${encodeURIComponent(subId)}/prepare-cancellation`, {
    method: 'POST',
  });
  return handleJson(res);
}

export async function findCalendarSlotsApi(params: {
  targetDate: string;
  durationMinutes: number;
  preferredPeriod: 'Morning' | 'Afternoon' | 'Evening' | 'Any';
}): Promise<{
  targetDate: string;
  slots: Array<{
    start: string;
    end: string;
    label: string;
    period: string;
    conflictFree: boolean;
    reason: string;
  }>;
  state: WorkspaceApiResponse;
}> {
  const res = await fetch('/api/appointments/find-slots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return handleJson(res);
}

export async function proposeAppointmentApi(params: {
  title: string;
  start: string;
  end: string;
  location: string;
}): Promise<{
  approval: WorkspaceState['approvals'][number];
  conflicts: WorkspaceState['events'];
  state: WorkspaceApiResponse;
}> {
  const res = await fetch('/api/appointments/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return handleJson(res);
}

export async function uploadDocumentApi(params: {
  fileName: string;
  mimeType: string;
  base64Data: string;
  type: 'invoice' | 'warranty' | 'receipt' | 'policy' | 'upload';
}): Promise<{
  document: WorkspaceState['documents'][number];
  geminiWarning?: string;
  state: WorkspaceApiResponse;
}> {
  const res = await fetch('/api/documents/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return handleJson(res);
}

export async function callMcpRpc(params: {
  method: 'tools/list' | 'tools/call';
  serverId: 'email-mcp' | 'calendar-mcp' | 'document-mcp' | 'action-mcp';
  name?: string;
  arguments?: Record<string, unknown>;
}): Promise<{
  jsonrpc: '2.0';
  result?: {
    tools?: Array<{ name: string; description: string }>;
    content?: Array<{ type: string; text?: string; data?: unknown }>;
    isError?: boolean;
    mode: 'DEMO_MODE';
    simulated: boolean;
  };
  error?: { code: number; message: string };
}> {
  const res = await fetch('/api/mcp/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `ui-${Date.now()}`,
      method: params.method,
      params: {
        serverId: params.serverId,
        name: params.name,
        arguments: params.arguments ?? {},
      },
    }),
  });
  return handleJson(res);
}

export async function updateSettingsApi(
  payload: Record<string, unknown>
): Promise<{ state: WorkspaceApiResponse }> {
  const res = await fetch('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}

export async function markAllNotificationsRead(): Promise<{ state: WorkspaceApiResponse }> {
  const res = await fetch('/api/notifications/read-all', { method: 'POST' });
  return handleJson(res);
}

export async function resetDemoSandbox(): Promise<WorkspaceApiResponse> {
  const res = await fetch('/api/demo/reset', { method: 'POST' });
  return handleJson<WorkspaceApiResponse>(res);
}
