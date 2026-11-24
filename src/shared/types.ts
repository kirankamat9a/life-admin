export type NavSection =
  | 'overview'
  | 'assistant'
  | 'refunds'
  | 'subscriptions'
  | 'appointments'
  | 'documents'
  | 'activity'
  | 'approvals'
  | 'mcp'
  | 'settings';

export type CaseStatus =
  | 'Investigating'
  | 'Eligible'
  | 'Evidence Required'
  | 'Complaint Prepared'
  | 'Awaiting Response'
  | 'Resolved';

export type SubscriptionCategory =
  | 'Active'
  | 'Potentially Unused'
  | 'Duplicate'
  | 'Cancellation Pending'
  | 'Cancelled';

export type AgentStatus =
  | 'Idle'
  | 'Processing'
  | 'Completed'
  | 'Failed'
  | 'Waiting for Approval';

export type AgentRole =
  | 'Intent Detection Agent'
  | 'Evidence Investigation Agent'
  | 'Policy Analysis Agent'
  | 'Action Planning Agent'
  | 'Execution Agent';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'executed';

export type ApprovalActionType =
  | 'send_email'
  | 'cancel_subscription'
  | 'create_appointment'
  | 'generate_report';

export interface EvidenceCitation {
  id: string;
  sourceType: 'email' | 'document' | 'calendar' | 'policy';
  sourceId: string;
  label: string;
  excerpt: string;
}

export interface CaseTimelineItem {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  actor: string;
  citationIds: string[];
}

export interface WarrantyCase {
  id: string;
  product: string;
  seller: string;
  sellerEmail: string;
  purchaseDate: string; // YYYY-MM-DD
  invoiceNumber: string;
  purchaseAmount: number;
  currency: string;
  warrantyPeriodMonths: number;
  warrantyExpiration: string; // YYYY-MM-DD
  status: CaseStatus;
  issueSummary: string;
  eligibilitySummary: string;
  missingEvidence: string[];
  complaintDraft: string;
  documentIds: string[];
  citations: EvidenceCitation[];
  timeline: CaseTimelineItem[];
}

export interface Subscription {
  id: string;
  name: string;
  provider: string;
  providerEmail: string;
  monthlyCost: number;
  annualCost: number;
  billingFrequency: 'Monthly' | 'Annual';
  lastPayment: string; // YYYY-MM-DD
  nextBillingDate: string; // YYYY-MM-DD
  category: SubscriptionCategory;
  status: string;
  cancellationInstructions: string;
  usageNote: string;
  potentialSavingsMonthly: number;
  sourceEmailId?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO string e.g. 2026-11-25T09:30:00
  end: string;   // ISO string
  location: string;
  attendees: string[];
  status: 'confirmed' | 'proposed' | 'conflict';
  source: 'demo_calendar' | 'approved_action';
  notes?: string;
}

export interface TimeSlotSuggestion {
  start: string;
  end: string;
  label: string;
  period: 'Morning' | 'Afternoon' | 'Evening';
  conflictFree: boolean;
  reason: string;
}

export interface DocumentContradiction {
  id: string;
  severity: 'warning' | 'info' | 'critical';
  field: string;
  description: string;
  comparedDocumentId?: string;
}

export interface DocumentRecord {
  id: string;
  title: string;
  type: 'invoice' | 'warranty' | 'receipt' | 'policy' | 'upload';
  uploadedAt: string;
  fileName: string;
  mimeType: string;
  previewUrl?: string;
  ocrStatus: 'Completed' | 'Processing' | 'Failed';
  extractedFields: {
    merchant?: string;
    product?: string;
    purchaseDate?: string;
    invoiceNumber?: string;
    totalAmount?: string;
    warrantyPeriod?: string;
    warrantyExpiration?: string;
    paymentMethod?: string;
  };
  contradictions: DocumentContradiction[];
  citations: string[];
  rawText: string;
}

export interface ApprovalRequest {
  id: string;
  title: string;
  actionType: ApprovalActionType;
  recipient: string;
  subject?: string;
  messageContent: string;
  evidenceCitations: EvidenceCitation[];
  expectedConsequences: string[];
  potentialRisks: string[];
  status: ApprovalStatus;
  createdAt: string;
  decidedAt?: string;
  relatedEntityId?: string;
  mcpServer: 'action-mcp' | 'email-mcp' | 'calendar-mcp';
  mcpTool: string;
  mcpArgs: Record<string, unknown>;
  simulatedExecutionNote?: string;
}

export interface McpToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

export interface McpServerState {
  id: 'email-mcp' | 'calendar-mcp' | 'document-mcp' | 'action-mcp';
  name: string;
  transport: string;
  mode: 'DEMO_MODE' | 'LIVE';
  status: 'Connected (Demo Sandbox)' | 'Disconnected' | 'OAuth Required';
  description: string;
  lastConnectedAt: string;
  tools: McpToolSchema[];
}

export interface McpToolInvocation {
  id: string;
  timestamp: string;
  serverId: McpServerState['id'];
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
  status: 'success' | 'blocked_approval' | 'error';
  durationMs: number;
  summary: string;
  mode: 'DEMO_MODE';
}

export interface AgentStep {
  id: string;
  role: AgentRole;
  status: AgentStatus;
  currentTask: string;
  taskSummary: string;
  toolsInvoked: string[];
  executionResult: string;
  timestamp: string;
}

export interface AgentRun {
  id: string;
  prompt: string;
  startedAt: string;
  completedAt?: string;
  overallStatus: AgentStatus;
  steps: AgentStep[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  reasoningSummary?: string;
  citations?: EvidenceCitation[];
  toolsExecuted?: Array<{ server: string; tool: string; summary: string }>;
  approvalId?: string;
  attachments?: Array<{ name: string; mimeType: string; documentId?: string }>;
  agentRunId?: string;
}

export interface ActivityEvent {
  id: string;
  timestamp: string;
  category: 'agent' | 'mcp' | 'approval' | 'refund' | 'subscription' | 'appointment' | 'document';
  title: string;
  description: string;
  simulated: boolean;
}

export interface NotificationItem {
  id: string;
  type: 'subscription' | 'refund' | 'warranty' | 'approval' | 'appointment' | 'mcp';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  targetSection: NavSection;
}

export interface UserSettings {
  profile: {
    name: string;
    email: string;
    timezone: string;
  };
  demoMode: boolean;
  requireHumanApprovalForEmails: boolean;
  requireHumanApprovalForCalendar: boolean;
  requireHumanApprovalForCancellations: boolean;
  googleWorkspaceConnected: boolean;
  notifications: {
    upcomingCharges: boolean;
    refundUpdates: boolean;
    warrantyDeadlines: boolean;
    pendingApprovals: boolean;
    appointmentReminders: boolean;
    mcpFailures: boolean;
  };
}

export interface DemoEmail {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  attachmentDocIds: string[];
}

export interface WorkspaceState {
  demoMode: boolean;
  referenceDate: string;
  cases: WarrantyCase[];
  subscriptions: Subscription[];
  events: CalendarEvent[];
  documents: DocumentRecord[];
  emails: DemoEmail[];
  approvals: ApprovalRequest[];
  mcpServers: McpServerState[];
  mcpHistory: McpToolInvocation[];
  agentRuns: AgentRun[];
  chatMessages: ChatMessage[];
  activityTimeline: ActivityEvent[];
  notifications: NotificationItem[];
  settings: UserSettings;
  tasksCompletedCount: number;
}
