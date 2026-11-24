import type {
  DocumentExtractPreview,
  DocumentRecord,
  HealthResponse,
  RewriteTone,
  WorkspaceState,
} from '../shared/types';

export interface WorkspaceApiResponse extends WorkspaceState {
  geminiConfigured: boolean;
}

const REQUEST_TIMEOUT_MS = 30_000;

function friendlyStatusError(status: number): string {
  if (status === 400) return 'Please check your input and try again.';
  if (status === 404) return 'That item could not be found.';
  if (status === 409) return 'This action was already processed.';
  if (status === 413) return 'The uploaded file is too large (max 10 MB).';
  if (status >= 500) return 'The server ran into a temporary issue. Please try again.';
  return `Request could not be completed (${status}).`;
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const data = (await res.json()) as { error?: unknown };
      if (typeof data?.error === 'string' && data.error.trim()) {
        return data.error.trim();
      }
    }
  } catch {
    // Fall back to status mapping below
  }
  return friendlyStatusError(res.status);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const isIdempotentGet = method === 'GET';
  const maxAttempts = isIdempotentGet ? 2 : 1;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const externalSignal = options.signal;
    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        throw new Error('Request cancelled.');
      }
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (!res.ok) {
        const message = await parseErrorMessage(res);
        if (isIdempotentGet && res.status >= 500 && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 350));
          continue;
        }
        throw new ApiError(message, res.status);
      }

      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      if (err instanceof ApiError) {
        throw err;
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (externalSignal?.aborted) {
          throw new Error('Request cancelled.');
        }
        if (isIdempotentGet && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 350));
          continue;
        }
        throw new Error('The request took too long and timed out. Please try again.');
      }
      if (isIdempotentGet && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 350));
        continue;
      }
      throw new Error('Unable to reach the server. Check your connection and try again.');
    } finally {
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed.');
}

export async function fetchHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/api/health', { timeoutMs: 8_000 });
}

export async function fetchWorkspace(): Promise<WorkspaceApiResponse> {
  return apiRequest<WorkspaceApiResponse>('/api/workspace');
}

export async function sendAssistantPrompt(
  prompt: string,
  attachments?: Array<{ name: string; mimeType: string; documentId?: string }>
): Promise<{
  message: WorkspaceState['chatMessages'][number];
  agentRun: WorkspaceState['agentRuns'][number];
  createdApproval?: WorkspaceState['approvals'][number];
  geminiError?: string;
  fallbackMode: boolean;
  state: WorkspaceApiResponse;
}> {
  return apiRequest('/api/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, attachments }),
  });
}

export interface StreamAssistantCallbacks {
  signal?: AbortSignal;
  onStep?: (label: string) => void;
  onTool?: (tool: { server: string; tool: string; summary: string }) => void;
  onToken?: (token: string) => void;
}

export async function streamAssistantPrompt(
  prompt: string,
  attachments: Array<{ name: string; mimeType: string; documentId?: string }> | undefined,
  callbacks: StreamAssistantCallbacks
): Promise<{
  message: WorkspaceState['chatMessages'][number];
  agentRun: WorkspaceState['agentRuns'][number];
  createdApproval?: WorkspaceState['approvals'][number];
  geminiError?: string;
  fallbackMode: boolean;
  state: WorkspaceApiResponse;
}> {
  const timeoutController = new AbortController();
  const onExternalAbort = () => timeoutController.abort();
  if (callbacks.signal) {
    if (callbacks.signal.aborted) throw new Error('Request cancelled.');
    callbacks.signal.addEventListener('abort', onExternalAbort, { once: true });
  }
  const timer = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch('/api/assistant/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, attachments }),
      signal: timeoutController.signal,
    });

    if (!res.ok) {
      throw new ApiError(await parseErrorMessage(res), res.status);
    }
    if (!res.body) {
      throw new Error('Streaming is not supported in this browser.');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult: {
      message: WorkspaceState['chatMessages'][number];
      agentRun: WorkspaceState['agentRuns'][number];
      createdApproval?: WorkspaceState['approvals'][number];
      geminiError?: string;
      fallbackMode: boolean;
      state: WorkspaceApiResponse;
    } | null = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sepIdx = buffer.indexOf('\n\n');
      while (sepIdx >= 0) {
        const rawBlock = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        sepIdx = buffer.indexOf('\n\n');

        let eventName = 'message';
        const dataLines: string[] = [];
        for (const line of rawBlock.split('\n')) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
        }
        if (dataLines.length === 0) continue;

        const payload = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
        if (eventName === 'step' && typeof payload.label === 'string') {
          callbacks.onStep?.(payload.label);
        } else if (eventName === 'tool') {
          callbacks.onTool?.(payload as { server: string; tool: string; summary: string });
        } else if (eventName === 'token' && typeof payload.token === 'string') {
          callbacks.onToken?.(payload.token);
        } else if (eventName === 'error') {
          throw new Error(typeof payload.error === 'string' ? payload.error : 'Stream interrupted.');
        } else if (eventName === 'done') {
          finalResult = payload as unknown as NonNullable<typeof finalResult>;
        }
      }
    }

    if (!finalResult) {
      throw new Error('Response stream ended unexpectedly. Please try again.');
    }
    return finalResult;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (callbacks.signal?.aborted) {
        throw new Error('Generation stopped.');
      }
      throw new Error('The assistant timed out while responding. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (callbacks.signal) {
      callbacks.signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

export async function runDemoScenario(scenario: 1 | 2 | 3): Promise<{
  message: WorkspaceState['chatMessages'][number];
  agentRun: WorkspaceState['agentRuns'][number];
  createdApproval?: WorkspaceState['approvals'][number];
  fallbackMode?: boolean;
  state: WorkspaceApiResponse;
}> {
  return apiRequest('/api/scenarios/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario }),
  });
}

export async function decideApproval(
  id: string,
  decision: 'approve' | 'reject' | 'edit',
  edits?: { subject?: string; messageContent?: string }
): Promise<{
  approval: WorkspaceState['approvals'][number];
  state: WorkspaceApiResponse;
}> {
  return apiRequest(`/api/approvals/${encodeURIComponent(id)}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, ...edits }),
  });
}

export async function undoRejectedApprovalApi(id: string): Promise<{
  approval: WorkspaceState['approvals'][number];
  state: WorkspaceApiResponse;
}> {
  return apiRequest(`/api/approvals/${encodeURIComponent(id)}/undo`, {
    method: 'POST',
  });
}

export async function rewriteApprovalDraftApi(
  id: string,
  tone: RewriteTone
): Promise<{
  subject?: string;
  messageContent: string;
  tone: RewriteTone;
  fallbackUsed: boolean;
  geminiWarning?: string;
}> {
  return apiRequest(`/api/approvals/${encodeURIComponent(id)}/rewrite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tone }),
  });
}

export async function bulkDecideApprovals(
  ids: string[],
  decision: 'approve' | 'reject'
): Promise<{
  processed: WorkspaceState['approvals'];
  failures: Array<{ id: string; status: number; error: string }>;
  state: WorkspaceApiResponse;
}> {
  return apiRequest('/api/approvals/bulk-decide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, decision }),
  });
}

export async function investigateCase(caseId: string): Promise<{
  case: WorkspaceState['cases'][number];
  state: WorkspaceApiResponse;
}> {
  return apiRequest(`/api/cases/${encodeURIComponent(caseId)}/investigate`, {
    method: 'POST',
  });
}

export async function prepareCaseComplaint(caseId: string): Promise<{
  approval: WorkspaceState['approvals'][number];
  case: WorkspaceState['cases'][number];
  state: WorkspaceApiResponse;
}> {
  return apiRequest(`/api/cases/${encodeURIComponent(caseId)}/prepare-complaint`, {
    method: 'POST',
  });
}

export async function prepareSubscriptionCancellation(subId: string): Promise<{
  approval: WorkspaceState['approvals'][number];
  state: WorkspaceApiResponse;
}> {
  return apiRequest(`/api/subscriptions/${encodeURIComponent(subId)}/prepare-cancellation`, {
    method: 'POST',
  });
}

export async function refreshSubscriptionInsightsApi(): Promise<{
  fallbackUsed: boolean;
  geminiWarning?: string;
  state: WorkspaceApiResponse;
}> {
  return apiRequest('/api/subscriptions/insights', { method: 'POST' });
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
  return apiRequest('/api/appointments/find-slots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
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
  return apiRequest('/api/appointments/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export async function extractDocumentPreviewApi(params: {
  fileName: string;
  mimeType: string;
  base64Data: string;
  type: DocumentRecord['type'];
}): Promise<DocumentExtractPreview> {
  return apiRequest('/api/documents/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export async function uploadDocumentApi(params: {
  fileName: string;
  mimeType: string;
  base64Data: string;
  type: DocumentRecord['type'];
  extractedFields?: DocumentRecord['extractedFields'];
  rawText?: string;
  citations?: string[];
}): Promise<{
  document: WorkspaceState['documents'][number];
  geminiWarning?: string;
  fallbackUsed?: boolean;
  state: WorkspaceApiResponse;
}> {
  return apiRequest('/api/documents/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
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
  return apiRequest('/api/mcp/rpc', {
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
}

export async function updateSettingsApi(
  payload: Record<string, unknown>
): Promise<{ state: WorkspaceApiResponse }> {
  return apiRequest('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function markAllNotificationsRead(): Promise<{ state: WorkspaceApiResponse }> {
  return apiRequest('/api/notifications/read-all', { method: 'POST' });
}

export async function resetDemoSandbox(): Promise<WorkspaceApiResponse> {
  return apiRequest<WorkspaceApiResponse>('/api/demo/reset', { method: 'POST' });
}
