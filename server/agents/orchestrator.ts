import {
  calculateSubscriptionAnalytics,
  evaluateWarrantyEligibility,
  findAvailableSlots,
} from '../../src/shared/domainLogic';
import type {
  AgentRun,
  AgentStep,
  ApprovalRequest,
  ChatMessage,
  EvidenceCitation,
  WorkspaceState,
} from '../../src/shared/types';
import { isGeminiConfigured, synthesizeWithGemini } from '../gemini';
import { mcpRouter } from '../mcp/servers';

export type IntentKind =
  | 'refund_warranty'
  | 'subscription_audit'
  | 'appointment_scheduling'
  | 'general_admin';

export function detectIntentFromPrompt(prompt: string): IntentKind {
  const lower = prompt.toLowerCase();
  if (
    lower.includes('laptop') ||
    lower.includes('invoice') ||
    lower.includes('warranty') ||
    lower.includes('refund') ||
    lower.includes('complaint') ||
    lower.includes('headphone')
  ) {
    return 'refund_warranty';
  }
  if (
    lower.includes('subscription') ||
    lower.includes('recurring') ||
    lower.includes('charge') ||
    lower.includes('cancel') ||
    lower.includes('saving')
  ) {
    return 'subscription_audit';
  }
  if (
    lower.includes('schedule') ||
    lower.includes('meeting') ||
    lower.includes('calendar') ||
    lower.includes('appointment') ||
    lower.includes('slot') ||
    lower.includes('tomorrow')
  ) {
    return 'appointment_scheduling';
  }
  return 'general_admin';
}

export interface OrchestratorOutput {
  message: ChatMessage;
  agentRun: AgentRun;
  createdApproval?: ApprovalRequest;
  geminiError?: string;
}

export async function runMultiAgentWorkflow(
  state: WorkspaceState,
  userPrompt: string,
  attachments?: Array<{ name: string; mimeType: string; documentId?: string }>
): Promise<OrchestratorOutput> {
  const now = new Date().toISOString();
  const intent = detectIntentFromPrompt(userPrompt);
  const steps: AgentStep[] = [];
  const toolsExecuted: Array<{ server: string; tool: string; summary: string }> = [];
  const citations: EvidenceCitation[] = [];

  // 1. Intent Detection Agent
  steps.push({
    id: `step-${Date.now()}-1`,
    role: 'Intent Detection Agent',
    status: 'Completed',
    currentTask: 'Parse user request & select MCP workflow',
    taskSummary: `Classified request as "${intent.replace('_', ' ')}" workflow.`,
    toolsInvoked: [],
    executionResult: `Routed to ${intent === 'refund_warranty' ? 'Email + Document MCP' : intent === 'subscription_audit' ? 'Email MCP + Subscription Analyzer' : intent === 'appointment_scheduling' ? 'Calendar MCP' : 'Workspace MCP Inspector'}.`,
    timestamp: now,
  });

  let evidenceSummary = '';
  let defaultReasoning = '';
  let defaultAnswer = '';
  let createdApproval: ApprovalRequest | undefined;

  if (intent === 'refund_warranty') {
    // 2. Evidence Investigation Agent
    const emailRes = mcpRouter.callTool(state, 'email-mcp', 'search_emails', {
      query: 'Zenith 15 Pro',
    });
    toolsExecuted.push({ server: 'Email MCP', tool: 'search_emails', summary: emailRes.summary });

    const docRes = mcpRouter.callTool(state, 'document-mcp', 'extract_invoice_details', {
      documentId: 'doc-invoice-laptop',
    });
    toolsExecuted.push({ server: 'Document MCP', tool: 'extract_invoice_details', summary: docRes.summary });

    const warRes = mcpRouter.callTool(state, 'document-mcp', 'analyze_warranty_document', {
      documentId: 'doc-warranty-laptop',
    });
    toolsExecuted.push({ server: 'Document MCP', tool: 'analyze_warranty_document', summary: warRes.summary });

    steps.push({
      id: `step-${Date.now()}-2`,
      role: 'Evidence Investigation Agent',
      status: 'Completed',
      currentTask: 'Retrieve invoice email & warranty PDF via MCP',
      taskSummary: 'Located Order #TI-7890123 / Invoice #TI-987654 and 24-month warranty document.',
      toolsInvoked: [
        'email-mcp.search_emails',
        'document-mcp.extract_invoice_details',
        'document-mcp.analyze_warranty_document',
      ],
      executionResult: 'Verified $1,499.99 purchase on 2026-08-24 from TechInnovate Electronics.',
      timestamp: new Date().toISOString(),
    });

    // 3. Policy Analysis Agent
    const warrantyCase = state.cases.find((c) => c.id === 'case-laptop-001');
    const eligibility = evaluateWarrantyEligibility({
      purchaseDate: warrantyCase?.purchaseDate ?? '2026-08-24',
      warrantyPeriodMonths: warrantyCase?.warrantyPeriodMonths ?? 24,
      currentDate: state.referenceDate,
      hasInvoice: true,
      hasDefectEvidence: true,
    });

    citations.push(...(warrantyCase?.citations ?? []));

    steps.push({
      id: `step-${Date.now()}-3`,
      role: 'Policy Analysis Agent',
      status: 'Completed',
      currentTask: 'Evaluate warranty coverage & claim eligibility',
      taskSummary: eligibility.summary,
      toolsInvoked: [],
      executionResult: `Status: ${eligibility.recommendedStatus} (${eligibility.daysRemaining} days remaining).`,
      timestamp: new Date().toISOString(),
    });

    // 4. Action Planning Agent
    const draftSubject = 'Warranty Service Request — Invoice #TI-987654 (Zenith 15 Pro Laptop)';
    const draftBody =
      warrantyCase?.complaintDraft ??
      'Requesting warranty repair under 24-month hardware warranty for Invoice #TI-987654.';

    const draftRes = mcpRouter.callTool(state, 'email-mcp', 'create_email_draft', {
      to: warrantyCase?.sellerEmail ?? 'warranty@techinnovate-demo.example',
      subject: draftSubject,
      body: draftBody,
    });
    toolsExecuted.push({ server: 'Email MCP', tool: 'create_email_draft', summary: draftRes.summary });

    // Create or reuse pending approval for this warranty complaint
    const existingPending = state.approvals.find(
      (a) => a.relatedEntityId === 'case-laptop-001' && a.status === 'pending'
    );

    if (existingPending) {
      createdApproval = existingPending;
    } else {
      createdApproval = {
        id: `apr-warranty-${Date.now()}`,
        title: 'Send Warranty Claim Email — Zenith 15 Pro Laptop',
        actionType: 'send_email',
        recipient: warrantyCase?.sellerEmail ?? 'warranty@techinnovate-demo.example',
        subject: draftSubject,
        messageContent: draftBody,
        evidenceCitations: citations,
        expectedConsequences: [
          'Dispatches simulated warranty claim citing Invoice #TI-987654 and Clause 4.1 (Demo Sandbox only).',
          'Transitions Zenith 15 Pro case status to Awaiting Response.',
        ],
        potentialRisks: [
          'Seller may request physical serial number verification or carry-in diagnostic inspection.',
        ],
        status: 'pending',
        createdAt: new Date().toISOString(),
        relatedEntityId: 'case-laptop-001',
        mcpServer: 'action-mcp',
        mcpTool: 'send_approved_email',
        mcpArgs: {
          to: warrantyCase?.sellerEmail ?? 'warranty@techinnovate-demo.example',
          caseId: 'case-laptop-001',
        },
      };
      state.approvals.unshift(createdApproval);
    }

    if (warrantyCase && warrantyCase.status === 'Eligible') {
      warrantyCase.status = 'Complaint Prepared';
      warrantyCase.timeline.push({
        id: `tl-${Date.now()}`,
        timestamp: new Date().toISOString(),
        title: 'Warranty Complaint Drafted for Approval',
        description: 'Action Planning Agent staged warranty claim email to TechInnovate Electronics.',
        actor: 'Action Planning Agent',
        citationIds: citations.map((c) => c.id),
      });
    }

    steps.push({
      id: `step-${Date.now()}-4`,
      role: 'Action Planning Agent',
      status: 'Completed',
      currentTask: 'Draft seller complaint & build approval packet',
      taskSummary: 'Generated complaint email citing Invoice #TI-987654 and Clause 4.1.',
      toolsInvoked: ['email-mcp.create_email_draft'],
      executionResult: `Queued Approval Request (${createdApproval.id}).`,
      timestamp: new Date().toISOString(),
    });

    // 5. Execution Agent (always gated!)
    steps.push({
      id: `step-${Date.now()}-5`,
      role: 'Execution Agent',
      status: 'Waiting for Approval',
      currentTask: 'Hold email dispatch pending human sign-off',
      taskSummary: 'Human approval required before Action MCP can transmit the warranty claim.',
      toolsInvoked: ['action-mcp.send_approved_email (gated)'],
      executionResult: 'Waiting for Approval.',
      timestamp: new Date().toISOString(),
    });

    evidenceSummary = `Invoice TI-987654 found in Demo Inbox & Document Vault. Product: Zenith 15 Pro Laptop, purchased 2026-08-24 for $1,499.99 from TechInnovate Electronics. 24-month warranty active until 2028-08-24 (${eligibility.daysRemaining} days left). Draft warranty claim email staged for human approval.`;
    defaultReasoning =
      'Located Invoice #TI-987654 via Email MCP and verified 24-month coverage until 2028-08-24 via Document MCP.';
    defaultAnswer =
      'I found your **Zenith 15 Pro Laptop** purchase records in Demo Mode:\n\n' +
      `- **Invoice:** #TI-987654 (TechInnovate Electronics Ltd., purchased **2026-08-24** for **$1,499.99**)\n` +
      `- **Warranty Status:** **Eligible** — covered under the 24-month hardware warranty through **2028-08-24** (${eligibility.daysRemaining} days remaining)\n` +
      '- **Policy Match:** Clause 4.1 covers USB-C / Thunderbolt controller defects for zero-cost repair or replacement.\n\n' +
      'I have prepared a warranty service email draft below. Review the evidence and click **Approve** when you are ready to execute the simulated send.';
  } else if (intent === 'subscription_audit') {
    const emailRes = mcpRouter.callTool(state, 'email-mcp', 'search_emails', {
      query: 'monthly',
    });
    toolsExecuted.push({ server: 'Email MCP', tool: 'search_emails', summary: emailRes.summary });

    const analytics = calculateSubscriptionAnalytics(state.subscriptions, state.referenceDate);
    const flagged = state.subscriptions.filter(
      (s) => s.category === 'Duplicate' || s.category === 'Potentially Unused'
    );

    citations.push({
      id: 'cit-sub-audit',
      sourceType: 'email',
      sourceId: 'email-002',
      label: 'Recurring Billing Inbox Audit (Demo Sandbox)',
      excerpt: `${state.subscriptions.length} subscriptions tracked · ${flagged.length} flagged for potential savings ($${analytics.potentialMonthlySavings.toFixed(2)}/mo).`,
    });

    steps.push({
      id: `step-${Date.now()}-2`,
      role: 'Evidence Investigation Agent',
      status: 'Completed',
      currentTask: 'Scan recurring billing emails & usage logs',
      taskSummary: `Identified ${state.subscriptions.length} recurring subscriptions via Email MCP.`,
      toolsInvoked: ['email-mcp.search_emails'],
      executionResult: `Active monthly spend: $${analytics.activeMonthlySpend.toFixed(2)} ($${analytics.activeAnnualSpend.toFixed(2)}/yr).`,
      timestamp: new Date().toISOString(),
    });

    steps.push({
      id: `step-${Date.now()}-3`,
      role: 'Policy Analysis Agent',
      status: 'Completed',
      currentTask: 'Detect duplicates & unused plans',
      taskSummary: `Flagged ${flagged.length} plans totaling $${analytics.potentialMonthlySavings.toFixed(2)}/mo ($${analytics.potentialAnnualSavings.toFixed(2)}/yr) in potential savings.`,
      toolsInvoked: [],
      executionResult: flagged.map((f) => `${f.name} ($${f.monthlyCost}/mo — ${f.category})`).join('; '),
      timestamp: new Date().toISOString(),
    });

    const targetSub = flagged[0];
    let existingPending = state.approvals.find(
      (a) => a.actionType === 'cancel_subscription' && a.status === 'pending'
    );

    if (!existingPending && targetSub) {
      const body =
        `Hello ${targetSub.provider} Billing,\n\n` +
        `Please cancel my "${targetSub.name}" subscription ($${targetSub.monthlyCost.toFixed(2)}/month) effective immediately before the next billing date (${targetSub.nextBillingDate}).\n\n` +
        `Reason: ${targetSub.usageNote}\n\nThank you,\nKiran Kamat`;
      mcpRouter.callTool(state, 'email-mcp', 'create_email_draft', {
        to: targetSub.providerEmail,
        subject: `Cancellation Request — ${targetSub.name}`,
        body,
      });
      toolsExecuted.push({
        server: 'Email MCP',
        tool: 'create_email_draft',
        summary: `Drafted cancellation notice for ${targetSub.name}.`,
      });

      existingPending = {
        id: `apr-sub-${Date.now()}`,
        title: `Cancel ${targetSub.name} ($${targetSub.monthlyCost.toFixed(2)}/mo)`,
        actionType: 'cancel_subscription',
        recipient: targetSub.providerEmail,
        subject: `Cancellation Request — ${targetSub.name}`,
        messageContent: body,
        evidenceCitations: citations,
        expectedConsequences: [
          `Saves $${targetSub.monthlyCost.toFixed(2)}/month ($${targetSub.annualCost.toFixed(2)}/year).`,
          `Prevents next scheduled charge on ${targetSub.nextBillingDate}.`,
        ],
        potentialRisks: [
          'Access to this subscription tier will stop at the end of the current cycle.',
        ],
        status: 'pending',
        createdAt: new Date().toISOString(),
        relatedEntityId: targetSub.id,
        mcpServer: 'action-mcp',
        mcpTool: 'send_approved_email',
        mcpArgs: {
          to: targetSub.providerEmail,
          subscriptionId: targetSub.id,
        },
      };
      state.approvals.unshift(existingPending);
    }

    createdApproval = existingPending;

    steps.push({
      id: `step-${Date.now()}-4`,
      role: 'Action Planning Agent',
      status: 'Completed',
      currentTask: 'Prepare cancellation approval packet',
      taskSummary: createdApproval
        ? `Staged cancellation request for ${createdApproval.title}.`
        : 'All flagged subscriptions already have pending or resolved decisions.',
      toolsInvoked: ['email-mcp.create_email_draft'],
      executionResult: createdApproval ? `Pending Approval ${createdApproval.id}` : 'No new draft needed',
      timestamp: new Date().toISOString(),
    });

    steps.push({
      id: `step-${Date.now()}-5`,
      role: 'Execution Agent',
      status: createdApproval ? 'Waiting for Approval' : 'Completed',
      currentTask: 'Hold cancellation dispatch until explicit approval',
      taskSummary: 'Never cancels subscriptions automatically without human sign-off.',
      toolsInvoked: ['action-mcp.send_approved_email (gated)'],
      executionResult: createdApproval ? 'Waiting for Approval' : 'No pending execution',
      timestamp: new Date().toISOString(),
    });

    evidenceSummary = `Found ${analytics.activeCount} active subscriptions totaling $${analytics.activeMonthlySpend.toFixed(2)}/month ($${analytics.activeAnnualSpend.toFixed(2)}/year). Flagged ${flagged.length} plans (${flagged.map((f) => `${f.name}: $${f.monthlyCost}/mo [${f.category}]`).join(', ')}) representing $${analytics.potentialMonthlySavings.toFixed(2)}/month ($${analytics.potentialAnnualSavings.toFixed(2)}/year) in potential savings.`;
    defaultReasoning =
      'Audited recurring billing emails via Email MCP and compared usage telemetry against monthly renewal dates.';
    defaultAnswer =
      `I audited your recurring charges across **${analytics.activeCount} active subscriptions** in Demo Mode:\n\n` +
      `- **Current Monthly Spend:** **$${analytics.activeMonthlySpend.toFixed(2)}/mo** ($${analytics.activeAnnualSpend.toFixed(2)}/yr)\n` +
      `- **Potential Savings:** **$${analytics.potentialMonthlySavings.toFixed(2)}/mo** ($${analytics.potentialAnnualSavings.toFixed(2)}/yr)\n` +
      `- **Flagged Plans:** ${flagged.map((f) => `**${f.name}** ($${f.monthlyCost.toFixed(2)}/mo · ${f.category})`).join(', ')}\n\n` +
      (createdApproval
        ? 'I have prepared a cancellation request below for your explicit approval — nothing is cancelled automatically.'
        : 'All flagged subscriptions have already been reviewed.');
  } else if (intent === 'appointment_scheduling') {
    const targetDate = '2026-11-25'; // Tomorrow relative to 2026-11-24
    const slotsRes = mcpRouter.callTool(state, 'calendar-mcp', 'find_available_slots', {
      targetDate,
      durationMinutes: 60,
      preferredPeriod: 'Afternoon',
    });
    toolsExecuted.push({
      server: 'Calendar MCP',
      tool: 'find_available_slots',
      summary: slotsRes.summary,
    });

    const slots = findAvailableSlots({
      events: state.events,
      targetDate,
      durationMinutes: 60,
      preferredPeriod: 'Afternoon',
    });
    const bestSlot = slots[0] ?? {
      start: `${targetDate}T14:00:00`,
      end: `${targetDate}T15:00:00`,
      label: '14:00 – 15:00',
      period: 'Afternoon',
      conflictFree: true,
      reason: 'Open window between Q4 Budget Planning (13:00–14:00) and Dental Checkup (15:30–16:15).',
    };

    const busyTomorrow = state.events.filter((e) => e.start.startsWith(targetDate));
    citations.push({
      id: 'cit-cal-tomorrow',
      sourceType: 'calendar',
      sourceId: 'ev-4',
      label: `Demo Calendar (${targetDate})`,
      excerpt: `Busy tomorrow: ${busyTomorrow.map((b) => `${b.title} (${b.start.slice(11, 16)}–${b.end.slice(11, 16)})`).join(', ')}.`,
    });

    steps.push({
      id: `step-${Date.now()}-2`,
      role: 'Evidence Investigation Agent',
      status: 'Completed',
      currentTask: `Query Calendar MCP for ${targetDate}`,
      taskSummary: `Retrieved ${busyTomorrow.length} existing calendar events on ${targetDate}.`,
      toolsInvoked: ['calendar-mcp.find_available_slots'],
      executionResult: `Detected busy blocks at 09:30–10:30, 13:00–14:00, and 15:30–16:15.`,
      timestamp: new Date().toISOString(),
    });

    steps.push({
      id: `step-${Date.now()}-3`,
      role: 'Policy Analysis Agent',
      status: 'Completed',
      currentTask: 'Filter conflict-free 60-minute afternoon windows',
      taskSummary: `Identified ${slots.length} conflict-free afternoon slot(s); best match is ${bestSlot.label}.`,
      toolsInvoked: [],
      executionResult: `Recommended ${bestSlot.label} on ${targetDate}.`,
      timestamp: new Date().toISOString(),
    });

    const eventTitle = 'Admin & Strategy Sync';
    mcpRouter.callTool(state, 'calendar-mcp', 'create_calendar_event', {
      title: eventTitle,
      start: bestSlot.start,
      end: bestSlot.end,
    });
    toolsExecuted.push({
      server: 'Calendar MCP',
      tool: 'create_calendar_event',
      summary: `Staged proposed event "${eventTitle}" at ${bestSlot.label} on ${targetDate}.`,
    });

    createdApproval = {
      id: `apr-cal-${Date.now()}`,
      title: `Schedule "${eventTitle}" (${targetDate} · ${bestSlot.label})`,
      actionType: 'create_appointment',
      recipient: 'Demo Workspace Calendar (kiran.kamat@lifeadmin-demo.example)',
      subject: `${eventTitle} — ${targetDate} ${bestSlot.label}`,
      messageContent:
        `Proposed Calendar Event: ${eventTitle}\n` +
        `Date: ${targetDate}\n` +
        `Time: ${bestSlot.label}\n` +
        `Conflicts Checked: Clear of Q4 Budget & Ops Planning (13:00–14:00) and Dental Checkup (15:30–16:15).`,
      evidenceCitations: citations,
      expectedConsequences: [
        `Adds "${eventTitle}" (${bestSlot.label}) to your workspace calendar on ${targetDate}.`,
        'Zero scheduling conflicts with existing commitments.',
      ],
      potentialRisks: [
        'Leaves 0-minute transition buffer immediately after Q4 Budget & Ops Planning (ends 14:00).',
      ],
      status: 'pending',
      createdAt: new Date().toISOString(),
      mcpServer: 'action-mcp',
      mcpTool: 'create_approved_appointment',
      mcpArgs: {
        title: eventTitle,
        start: bestSlot.start,
        end: bestSlot.end,
        location: 'Video Call',
      },
    };
    state.approvals.unshift(createdApproval);

    steps.push({
      id: `step-${Date.now()}-4`,
      role: 'Action Planning Agent',
      status: 'Completed',
      currentTask: 'Stage proposed calendar event for approval',
      taskSummary: `Prepared appointment proposal for ${targetDate} at ${bestSlot.label}.`,
      toolsInvoked: ['calendar-mcp.create_calendar_event'],
      executionResult: `Created Approval Request ${createdApproval.id}.`,
      timestamp: new Date().toISOString(),
    });

    steps.push({
      id: `step-${Date.now()}-5`,
      role: 'Execution Agent',
      status: 'Waiting for Approval',
      currentTask: 'Hold calendar commit until human approval',
      taskSummary: 'Calendar remains untouched until you approve the proposed slot.',
      toolsInvoked: ['action-mcp.create_approved_appointment (gated)'],
      executionResult: 'Waiting for Approval.',
      timestamp: new Date().toISOString(),
    });

    evidenceSummary = `Checked calendar for ${targetDate}. Busy blocks: 09:30–10:30 Engineering Standup, 13:00–14:00 Q4 Budget & Ops Planning, 15:30–16:15 Dental Checkup. Recommended conflict-free afternoon slots: ${slots.map((s) => s.label).join(', ')}. Staged "${eventTitle}" at ${bestSlot.label} for human approval.`;
    defaultReasoning = `Inspected ${targetDate} via Calendar MCP, avoided 3 existing events, and ranked conflict-free afternoon windows.`;
    defaultAnswer =
      `I checked your Demo Calendar for **tomorrow (${targetDate})** and avoided your existing commitments:\n\n` +
      `- **Busy Windows Avoided:** Q4 Budget & Ops Planning (13:00–14:00) and Dental Checkup (15:30–16:15)\n` +
      `- **Recommended Conflict-Free Slot:** **${bestSlot.label}**\n` +
      `- **Other Afternoon Options:** ${slots.slice(1, 4).map((s) => s.label).join(', ') || '16:30 – 17:30'}\n\n` +
      'I have staged the proposed calendar event below. Approve it to add the meeting to your Appointment Manager.';
  } else {
    // General admin query: search documents & summarize active workspace
    const docSearch = mcpRouter.callTool(state, 'document-mcp', 'search_documents', {
      query: '',
    });
    toolsExecuted.push({
      server: 'Document MCP',
      tool: 'search_documents',
      summary: docSearch.summary,
    });

    const analytics = calculateSubscriptionAnalytics(state.subscriptions, state.referenceDate);
    steps.push({
      id: `step-${Date.now()}-2`,
      role: 'Evidence Investigation Agent',
      status: 'Completed',
      currentTask: 'Gather workspace status across MCP servers',
      taskSummary: `Indexed ${state.cases.length} warranty cases, ${state.subscriptions.length} subscriptions, and ${state.documents.length} documents.`,
      toolsInvoked: ['document-mcp.search_documents'],
      executionResult: 'Workspace context assembled.',
      timestamp: new Date().toISOString(),
    });
    steps.push({
      id: `step-${Date.now()}-3`,
      role: 'Policy Analysis Agent',
      status: 'Completed',
      currentTask: 'Prioritize actionable recommendations',
      taskSummary: `Found $${analytics.potentialMonthlySavings.toFixed(2)}/mo subscription savings and 1 eligible laptop warranty claim.`,
      toolsInvoked: [],
      executionResult: 'Recommendations prioritized.',
      timestamp: new Date().toISOString(),
    });
    steps.push({
      id: `step-${Date.now()}-4`,
      role: 'Action Planning Agent',
      status: 'Completed',
      currentTask: 'Summarize findings for user',
      taskSummary: 'Compiled evidence-backed overview.',
      toolsInvoked: [],
      executionResult: 'Ready.',
      timestamp: new Date().toISOString(),
    });
    steps.push({
      id: `step-${Date.now()}-5`,
      role: 'Execution Agent',
      status: 'Completed',
      currentTask: 'Read-only inquiry complete',
      taskSummary: 'No external state modified.',
      toolsInvoked: [],
      executionResult: 'Completed.',
      timestamp: new Date().toISOString(),
    });

    evidenceSummary = `Workspace summary: ${state.cases.length} warranty cases (Zenith 15 Pro Laptop $1,499.99 eligible until 2028-08-24), ${analytics.activeCount} subscriptions ($${analytics.activeMonthlySpend.toFixed(2)}/mo, $${analytics.potentialMonthlySavings.toFixed(2)}/mo savings available), ${state.approvals.filter((a) => a.status === 'pending').length} pending approvals.`;
    defaultReasoning = 'Scanned local MCP servers (Document, Email, Calendar) to assemble a verified workspace summary.';
    defaultAnswer =
      'Here is your verified Demo Mode workspace summary:\n\n' +
      `- **Warranty & Refunds:** Zenith 15 Pro Laptop ($1,499.99) is within its 24-month warranty; AeroPulse Headphones need serial number evidence.\n` +
      `- **Subscriptions:** $${analytics.activeMonthlySpend.toFixed(2)}/mo active across ${analytics.activeCount} plans, with **$${analytics.potentialMonthlySavings.toFixed(2)}/mo** in potential savings.\n` +
      `- **Pending Approvals:** ${state.approvals.filter((a) => a.status === 'pending').length} item(s) waiting in the Approval Centre.`;
  }

  let finalReasoning = defaultReasoning;
  let finalResponse = defaultAnswer;
  let geminiError: string | undefined;

  if (isGeminiConfigured()) {
    try {
      const synthesized = await synthesizeWithGemini({
        userMessage: userPrompt,
        evidenceSummary,
      });
      if (synthesized.reasoningSummary) finalReasoning = synthesized.reasoningSummary;
      if (synthesized.responseText) finalResponse = synthesized.responseText;
    } catch (err) {
      geminiError = err instanceof Error ? err.message : 'Gemini synthesis failed';
    }
  }

  const agentRun: AgentRun = {
    id: `run-${Date.now()}`,
    prompt: userPrompt,
    startedAt: now,
    completedAt: new Date().toISOString(),
    overallStatus: createdApproval ? 'Waiting for Approval' : 'Completed',
    steps,
  };
  state.agentRuns.unshift(agentRun);
  if (state.agentRuns.length > 20) state.agentRuns.length = 20;

  const userMsg: ChatMessage = {
    id: `msg-u-${Date.now()}`,
    role: 'user',
    content: userPrompt,
    timestamp: now,
    attachments,
  };

  const assistantMsg: ChatMessage = {
    id: `msg-a-${Date.now() + 1}`,
    role: 'assistant',
    content: finalResponse,
    timestamp: new Date().toISOString(),
    reasoningSummary: finalReasoning,
    citations,
    toolsExecuted,
    approvalId: createdApproval?.id,
    agentRunId: agentRun.id,
  };

  state.chatMessages.push(userMsg, assistantMsg);

  state.activityTimeline.unshift({
    id: `act-${Date.now()}`,
    timestamp: new Date().toISOString(),
    category: 'agent',
    title: `Multi-Agent Run: ${intent.replace('_', ' ')}`,
    description: `${toolsExecuted.length} MCP tool(s) executed${createdApproval ? '; staged 1 human approval' : ''}.`,
    simulated: true,
  });

  return {
    message: assistantMsg,
    agentRun,
    createdApproval,
    geminiError,
  };
}
