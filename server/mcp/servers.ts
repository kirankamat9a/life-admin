import {
  detectCalendarConflicts,
  evaluateWarrantyEligibility,
  findAvailableSlots,
} from '../../src/shared/domainLogic';
import type { WorkspaceState } from '../../src/shared/types';
import { McpClientRouter, type McpServerAdapter } from './protocol';

const emailMcpServer: McpServerAdapter = {
  id: 'email-mcp',
  listTools: (state) => state.mcpServers.find((s) => s.id === 'email-mcp')?.tools ?? [],
  executeTool: (state, toolName, args) => {
    if (toolName === 'search_emails') {
      const query = String(args.query ?? '').toLowerCase().trim();
      const matches = state.emails.filter(
        (e) =>
          !query ||
          e.subject.toLowerCase().includes(query) ||
          e.body.toLowerCase().includes(query) ||
          e.from.toLowerCase().includes(query)
      );
      return {
        ok: true,
        summary: `Email MCP searched demo inbox for "${query || '*'}" and matched ${matches.length} email(s).`,
        data: { simulated: true, matches },
      };
    }

    if (toolName === 'read_email') {
      const emailId = String(args.emailId ?? '');
      const email = state.emails.find((e) => e.id === emailId);
      if (!email) {
        return { ok: false, summary: `Email ${emailId} not found in demo inbox.`, data: null };
      }
      return {
        ok: true,
        summary: `Retrieved email "${email.subject}" from ${email.from}.`,
        data: { simulated: true, email },
      };
    }

    if (toolName === 'create_email_draft') {
      const to = String(args.to ?? '');
      const subject = String(args.subject ?? '');
      const body = String(args.body ?? '');
      if (!to || !subject) {
        return { ok: false, summary: 'create_email_draft requires "to" and "subject".', data: null };
      }
      return {
        ok: true,
        summary: `Staged non-sent email draft to ${to} ("${subject}") for human review.`,
        data: {
          simulated: true,
          draftStatus: 'STAGED_FOR_APPROVAL',
          to,
          subject,
          body,
        },
      };
    }

    return { ok: false, summary: `Unknown tool "${toolName}" on email-mcp.`, data: null };
  },
};

const calendarMcpServer: McpServerAdapter = {
  id: 'calendar-mcp',
  listTools: (state) => state.mcpServers.find((s) => s.id === 'calendar-mcp')?.tools ?? [],
  executeTool: (state, toolName, args) => {
    if (toolName === 'check_availability') {
      const start = String(args.start ?? '');
      const end = String(args.end ?? '');
      const conflicts = detectCalendarConflicts(state.events, start, end);
      return {
        ok: true,
        summary:
          conflicts.length === 0
            ? `Window ${start} – ${end} is conflict-free.`
            : `Detected ${conflicts.length} conflict(s): ${conflicts.map((c) => c.title).join(', ')}.`,
        data: { simulated: true, available: conflicts.length === 0, conflicts },
      };
    }

    if (toolName === 'find_available_slots') {
      const targetDate = String(args.targetDate ?? '2026-11-25');
      const durationMinutes = Number(args.durationMinutes ?? 60);
      const preferredPeriod = (args.preferredPeriod as 'Morning' | 'Afternoon' | 'Evening' | 'Any') ?? 'Afternoon';
      const slots = findAvailableSlots({
        events: state.events,
        targetDate,
        durationMinutes,
        preferredPeriod,
      });
      const busyOnDate = state.events.filter((e) => e.start.startsWith(targetDate));
      return {
        ok: true,
        summary: `Found ${slots.length} conflict-free ${preferredPeriod.toLowerCase()} slot(s) on ${targetDate} (${busyOnDate.length} busy block(s) avoided).`,
        data: { simulated: true, targetDate, busyOnDate, slots },
      };
    }

    if (toolName === 'create_calendar_event') {
      const title = String(args.title ?? 'Proposed Meeting');
      const start = String(args.start ?? '');
      const end = String(args.end ?? '');
      const conflicts = detectCalendarConflicts(state.events, start, end);
      return {
        ok: true,
        summary: `Prepared proposed calendar event "${title}" (${start}) for human approval. ${conflicts.length} conflict(s).`,
        data: {
          simulated: true,
          requiresApproval: true,
          proposedEvent: { title, start, end, conflicts },
        },
      };
    }

    return { ok: false, summary: `Unknown tool "${toolName}" on calendar-mcp.`, data: null };
  },
};

const documentMcpServer: McpServerAdapter = {
  id: 'document-mcp',
  listTools: (state) => state.mcpServers.find((s) => s.id === 'document-mcp')?.tools ?? [],
  executeTool: (state, toolName, args) => {
    if (toolName === 'search_documents') {
      const query = String(args.query ?? '').toLowerCase().trim();
      const matches = state.documents.filter(
        (d) =>
          !query ||
          d.title.toLowerCase().includes(query) ||
          d.fileName.toLowerCase().includes(query) ||
          d.rawText.toLowerCase().includes(query)
      );
      return {
        ok: true,
        summary: `Document MCP matched ${matches.length} document(s) for "${query || '*'}".`,
        data: { simulated: true, matches },
      };
    }

    if (toolName === 'extract_invoice_details') {
      const docId = String(args.documentId ?? 'doc-invoice-laptop');
      const doc = state.documents.find((d) => d.id === docId);
      if (!doc) {
        return { ok: false, summary: `Document ${docId} not found.`, data: null };
      }
      return {
        ok: true,
        summary: `Extracted invoice metadata from ${doc.fileName} (${doc.extractedFields.invoiceNumber ?? 'N/A'}).`,
        data: { simulated: true, documentId: doc.id, extractedFields: doc.extractedFields, citations: doc.citations },
      };
    }

    if (toolName === 'analyze_warranty_document') {
      const docId = String(args.documentId ?? 'doc-warranty-laptop');
      const doc = state.documents.find((d) => d.id === docId);
      if (!doc) {
        return { ok: false, summary: `Warranty document ${docId} not found.`, data: null };
      }
      const purchaseDate = doc.extractedFields.purchaseDate ?? '2026-08-24';
      const evalResult = evaluateWarrantyEligibility({
        purchaseDate,
        warrantyPeriodMonths: 24,
        currentDate: state.referenceDate,
        hasInvoice: true,
        hasDefectEvidence: true,
      });
      return {
        ok: true,
        summary: evalResult.summary,
        data: { simulated: true, documentId: doc.id, eligibility: evalResult, citations: doc.citations },
      };
    }

    return { ok: false, summary: `Unknown tool "${toolName}" on document-mcp.`, data: null };
  },
};

const actionMcpServer: McpServerAdapter = {
  id: 'action-mcp',
  listTools: (state) => state.mcpServers.find((s) => s.id === 'action-mcp')?.tools ?? [],
  executeTool: (state, toolName, args) => {
    if (toolName === 'send_approved_email') {
      const approvalId = String(args.approvalId ?? '');
      const approval = state.approvals.find((a) => a.id === approvalId);
      if (!approval || (approval.status !== 'approved' && approval.status !== 'executed')) {
        return {
          ok: false,
          blockedApproval: true,
          summary: `Blocked by Human Approval Gate: Approval ${approvalId || '(missing)'} is not approved.`,
          data: { blocked: true, reason: 'Human approval required before external email execution.' },
        };
      }
      return {
        ok: true,
        summary: `[DEMO SANDBOX] Simulated sending approved email to ${approval.recipient} ("${approval.subject ?? approval.title}").`,
        data: {
          simulated: true,
          executed: true,
          approvalId: approval.id,
          recipient: approval.recipient,
          note: 'Simulated execution only — no real external email was transmitted in Demo Mode.',
        },
      };
    }

    if (toolName === 'create_approved_appointment') {
      const approvalId = String(args.approvalId ?? '');
      const approval = state.approvals.find((a) => a.id === approvalId);
      if (!approval || (approval.status !== 'approved' && approval.status !== 'executed')) {
        return {
          ok: false,
          blockedApproval: true,
          summary: `Blocked by Human Approval Gate: Approval ${approvalId || '(missing)'} is not approved.`,
          data: { blocked: true, reason: 'Human approval required before calendar creation.' },
        };
      }
      return {
        ok: true,
        summary: `[DEMO SANDBOX] Created approved calendar event "${approval.title}" in workspace calendar.`,
        data: {
          simulated: true,
          executed: true,
          approvalId: approval.id,
          note: 'Added to Demo Sandbox Calendar. Connect Google Calendar OAuth to sync externally.',
        },
      };
    }

    if (toolName === 'generate_case_report') {
      const caseId = String(args.caseId ?? 'case-laptop-001');
      const warrantyCase = state.cases.find((c) => c.id === caseId);
      if (!warrantyCase) {
        return { ok: false, summary: `Case ${caseId} not found.`, data: null };
      }
      return {
        ok: true,
        summary: `Generated structured evidence report for ${warrantyCase.product} (Status: ${warrantyCase.status}).`,
        data: {
          simulated: true,
          report: {
            caseId: warrantyCase.id,
            product: warrantyCase.product,
            invoiceNumber: warrantyCase.invoiceNumber,
            purchaseAmount: warrantyCase.purchaseAmount,
            warrantyExpiration: warrantyCase.warrantyExpiration,
            status: warrantyCase.status,
            citations: warrantyCase.citations,
          },
        },
      };
    }

    return { ok: false, summary: `Unknown tool "${toolName}" on action-mcp.`, data: null };
  },
};

export function createMcpRouter(): McpClientRouter {
  const router = new McpClientRouter();
  router.registerServer(emailMcpServer);
  router.registerServer(calendarMcpServer);
  router.registerServer(documentMcpServer);
  router.registerServer(actionMcpServer);
  return router;
}

export const mcpRouter = createMcpRouter();
