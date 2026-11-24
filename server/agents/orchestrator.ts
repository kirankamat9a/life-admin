import {
  buildApprovalPlainSummary,
  calculateSubscriptionAnalytics,
  deriveApprovalRiskLevel,
  evaluateWarrantyEligibility,
  findAvailableSlots,
  formatINR,
} from '../../src/shared/domainLogic';
import type {
  AgentRun,
  AgentStep,
  ApprovalRequest,
  ChatMessage,
  EvidenceCitation,
  GroundingSource,
  WorkspaceState,
} from '../../src/shared/types';
import {
  humanizeGeminiError,
  isGeminiConfigured,
  queryWithSearchGrounding,
  runGeminiToolLoop,
  streamGeminiSynthesis,
  synthesizeWithGemini,
} from '../gemini';
import { mcpRouter } from '../mcp/servers';

export type IntentKind =
  | 'refund_warranty'
  | 'subscription_audit'
  | 'appointment_scheduling'
  | 'consumer_rights'
  | 'general_admin';

export function detectIntentFromPrompt(prompt: string): IntentKind {
  const lower = prompt.toLowerCase();
  if (
    lower.includes('consumer rights') ||
    lower.includes('consumer protection') ||
    lower.includes('statutory warranty') ||
    lower.includes('consumer law') ||
    lower.includes('consumer court') ||
    lower.includes('nch') ||
    lower.includes('1915') ||
    lower.includes('edaakhil') ||
    lower.includes('e-daakhil') ||
    lower.includes('rbi') ||
    lower.includes('ftc') ||
    lower.includes('chargeback') ||
    lower.includes('lemon law') ||
    lower.includes('return policy law') ||
    lower.includes('legal rights')
  ) {
    return 'consumer_rights';
  }
  if (
    lower.includes('laptop') ||
    lower.includes('invoice') ||
    lower.includes('gst') ||
    lower.includes('warranty') ||
    lower.includes('refund') ||
    lower.includes('complaint') ||
    lower.includes('headphone')
  ) {
    return 'refund_warranty';
  }
  if (
    lower.includes('subscription') ||
    lower.includes('upi') ||
    lower.includes('autopay') ||
    lower.includes('mandate') ||
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
  fallbackMode: boolean;
}

export interface StreamProgressCallbacks {
  onStep?: (label: string) => void;
  onTool?: (tool: { server: string; tool: string; summary: string }) => void;
  onToken?: (token: string) => void;
  signal?: AbortSignal;
}

function withPlainFields(apr: ApprovalRequest): ApprovalRequest {
  return {
    ...apr,
    riskLevel: deriveApprovalRiskLevel(apr),
    plainSummary: buildApprovalPlainSummary(apr),
  };
}

export async function runMultiAgentWorkflow(
  state: WorkspaceState,
  userPrompt: string,
  attachments?: Array<{ name: string; mimeType: string; documentId?: string }>,
  callbacks?: StreamProgressCallbacks
): Promise<OrchestratorOutput> {
  const signal = callbacks?.signal;
  if (signal?.aborted) {
    throw new Error('Request cancelled by user.');
  }

  const now = new Date().toISOString();
  const intent = detectIntentFromPrompt(userPrompt);
  const steps: AgentStep[] = [];
  const toolsExecuted: Array<{ server: string; tool: string; summary: string }> = [];
  const citations: EvidenceCitation[] = [];
  const groundingSources: GroundingSource[] = [];

  callbacks?.onStep?.('Understanding your request…');

  // 1. Intent Detection Agent
  steps.push({
    id: `step-${Date.now()}-1`,
    role: 'Intent Detection Agent',
    status: 'Completed',
    currentTask: 'Parse user request & select tools',
    taskSummary: `Classified request as "${intent.replace(/_/g, ' ')}" workflow.`,
    toolsInvoked: [],
    executionResult: `Routed to ${
      intent === 'refund_warranty'
        ? 'Email + Document Tools'
        : intent === 'subscription_audit'
          ? 'Email + Subscription Analyzer'
          : intent === 'appointment_scheduling'
            ? 'Calendar Tools'
            : intent === 'consumer_rights'
              ? 'Consumer Rights Search + Workspace Context'
              : 'Workspace Tool Suite'
    }.`,
    timestamp: now,
  });

  let evidenceSummary = '';
  let defaultReasoning = '';
  let defaultAnswer = '';
  let createdApproval: ApprovalRequest | undefined;
  let preSynthesizedAnswer: string | undefined;

  if (intent === 'refund_warranty') {
    callbacks?.onStep?.('Searching emails…');
    const emailRes = mcpRouter.callTool(state, 'email-mcp', 'search_emails', {
      query: 'Zenith 15 Pro',
    });
    const emailExec = { server: 'Email MCP', tool: 'search_emails', summary: emailRes.summary };
    toolsExecuted.push(emailExec);
    callbacks?.onTool?.(emailExec);

    if (signal?.aborted) throw new Error('Request cancelled by user.');

    callbacks?.onStep?.('Checking invoice & warranty…');
    const docRes = mcpRouter.callTool(state, 'document-mcp', 'extract_invoice_details', {
      documentId: 'doc-invoice-laptop',
    });
    const docExec = { server: 'Document MCP', tool: 'extract_invoice_details', summary: docRes.summary };
    toolsExecuted.push(docExec);
    callbacks?.onTool?.(docExec);

    const warRes = mcpRouter.callTool(state, 'document-mcp', 'analyze_warranty_document', {
      documentId: 'doc-warranty-laptop',
    });
    const warExec = { server: 'Document MCP', tool: 'analyze_warranty_document', summary: warRes.summary };
    toolsExecuted.push(warExec);
    callbacks?.onTool?.(warExec);

    steps.push({
      id: `step-${Date.now()}-2`,
      role: 'Evidence Investigation Agent',
      status: 'Completed',
      currentTask: 'Retrieve GST tax invoice email & warranty PDF',
      taskSummary: 'Located Order #CRO-7890123 / Tax Invoice #CRO-987654 and 24-month warranty document.',
      toolsInvoked: [
        'email-mcp.search_emails',
        'document-mcp.extract_invoice_details',
        'document-mcp.analyze_warranty_document',
      ],
      executionResult: `Verified ${formatINR(124990)} purchase on 2026-08-24 from Croma Retail (Infiniti Retail Ltd.).`,
      timestamp: new Date().toISOString(),
    });

    callbacks?.onStep?.('Evaluating warranty eligibility…');
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

    callbacks?.onStep?.('Preparing approval request…');
    const draftSubject = 'Warranty Service Request — Tax Invoice #CRO-987654 (Zenith 15 Pro Laptop)';
    const draftBody =
      warrantyCase?.complaintDraft ??
      'Requesting warranty repair under 24-month India On-Site Hardware Warranty for Tax Invoice #CRO-987654.';

    const draftRes = mcpRouter.callTool(state, 'email-mcp', 'create_email_draft', {
      to: warrantyCase?.sellerEmail ?? 'warranty@croma-demo.example',
      subject: draftSubject,
      body: draftBody,
    });
    const draftExec = { server: 'Email MCP', tool: 'create_email_draft', summary: draftRes.summary };
    toolsExecuted.push(draftExec);
    callbacks?.onTool?.(draftExec);

    const existingPending = state.approvals.find(
      (a) => a.relatedEntityId === 'case-laptop-001' && a.status === 'pending'
    );

    if (existingPending) {
      createdApproval = withPlainFields(existingPending);
    } else {
      createdApproval = withPlainFields({
        id: `apr-warranty-${Date.now()}`,
        title: 'Send Warranty Claim Email — Zenith 15 Pro Laptop',
        plainSummary: `Send a warranty claim email for your Zenith 15 Pro Laptop to ${(
          warrantyCase?.seller ?? 'Croma Retail (Infiniti Retail Ltd.)'
        ).replace(/\.+$/, '')}.`,
        riskLevel: 'Medium',
        actionType: 'send_email',
        recipient: warrantyCase?.sellerEmail ?? 'warranty@croma-demo.example',
        subject: draftSubject,
        messageContent: draftBody,
        evidenceCitations: citations,
        expectedConsequences: [
          'Dispatches simulated warranty claim citing Tax Invoice #CRO-987654 and Clause 4.1 (Demo Sandbox only).',
          'Transitions Zenith 15 Pro case status to Awaiting Response.',
        ],
        potentialRisks: [
          'Service centre may request physical serial number verification or carry-in diagnostic check.',
        ],
        status: 'pending',
        createdAt: new Date().toISOString(),
        relatedEntityId: 'case-laptop-001',
        mcpServer: 'action-mcp',
        mcpTool: 'send_approved_email',
        mcpArgs: {
          to: warrantyCase?.sellerEmail ?? 'warranty@croma-demo.example',
          caseId: 'case-laptop-001',
        },
      });
      state.approvals.unshift(createdApproval);
    }

    if (warrantyCase && warrantyCase.status === 'Eligible') {
      warrantyCase.status = 'Complaint Prepared';
      warrantyCase.timeline.push({
        id: `tl-${Date.now()}`,
        timestamp: new Date().toISOString(),
        title: 'Warranty Complaint Drafted for Approval',
        description: 'Action Planning Agent staged warranty claim email to Croma Retail.',
        actor: 'Action Planning Agent',
        citationIds: citations.map((c) => c.id),
      });
    }

    steps.push({
      id: `step-${Date.now()}-4`,
      role: 'Action Planning Agent',
      status: 'Completed',
      currentTask: 'Draft seller complaint & build approval packet',
      taskSummary: 'Generated complaint email citing Tax Invoice #CRO-987654 and Clause 4.1.',
      toolsInvoked: ['email-mcp.create_email_draft'],
      executionResult: `Queued Approval Request (${createdApproval.id}).`,
      timestamp: new Date().toISOString(),
    });

    steps.push({
      id: `step-${Date.now()}-5`,
      role: 'Execution Agent',
      status: 'Waiting for Approval',
      currentTask: 'Hold email dispatch pending human sign-off',
      taskSummary: 'Human approval required before Action Tool can transmit the warranty claim.',
      toolsInvoked: ['action-mcp.send_approved_email (gated)'],
      executionResult: 'Waiting for Approval.',
      timestamp: new Date().toISOString(),
    });

    evidenceSummary = `Document: Croma_Tax_Invoice_CRO-987654.pdf (Tax Invoice #CRO-987654, email-001). Product: Zenith 15 Pro Laptop, purchased 2026-08-24 for ${formatINR(124990)} from Croma Retail (Infiniti Retail Ltd.). Document: Zenith_India_Warranty_Policy.pdf (24-month India warranty active until 2028-08-24, ${eligibility.daysRemaining} days left, Clause 4.1 covers USB-C/Thunderbolt port faults). Draft warranty claim email is staged for human approval and has NOT been sent yet.`;
    defaultReasoning =
      'Located GST Tax Invoice #CRO-987654 via Email Search and verified 24-month India coverage until 2028-08-24 via Document Analysis.';
    defaultAnswer =
      'I found your **Zenith 15 Pro Laptop** purchase records in Demo Mode:\n\n' +
      `- **Tax Invoice:** #CRO-987654 in \`Croma_Tax_Invoice_CRO-987654.pdf\` (Croma Retail, purchased **2026-08-24** for **${formatINR(124990)}** incl. 18% GST)\n` +
      `- **Warranty Status:** **Eligible** — covered under the 24-month India On-Site Hardware Warranty through **2028-08-24** (${eligibility.daysRemaining} days remaining)\n` +
      '- **Policy Match:** Clause 4.1 of `Zenith_India_Warranty_Policy.pdf` covers USB-C / Thunderbolt controller defects for zero-cost repair or replacement across Authorised Service Centres.\n\n' +
      'I have prepared a warranty service email draft below. Review the evidence and click **Approve** when you are ready to execute the simulated send.';
  } else if (intent === 'subscription_audit') {
    callbacks?.onStep?.('Searching billing emails…');
    const emailRes = mcpRouter.callTool(state, 'email-mcp', 'search_emails', {
      query: 'monthly',
    });
    const emailExec = { server: 'Email MCP', tool: 'search_emails', summary: emailRes.summary };
    toolsExecuted.push(emailExec);
    callbacks?.onTool?.(emailExec);

    if (signal?.aborted) throw new Error('Request cancelled by user.');

    callbacks?.onStep?.('Checking recurring charges & savings…');
    const analytics = calculateSubscriptionAnalytics(state.subscriptions, state.referenceDate);
    const flagged = state.subscriptions.filter(
      (s) => s.category === 'Duplicate' || s.category === 'Potentially Unused'
    );

    citations.push({
      id: 'cit-sub-audit',
      sourceType: 'email',
      sourceId: 'email-002',
      label: 'Recurring UPI AutoPay & Card Billing Audit (Demo Sandbox)',
      excerpt: `${state.subscriptions.length} subscriptions tracked · ${flagged.length} flagged for potential savings (${formatINR(analytics.potentialMonthlySavings)}/mo).`,
    });

    steps.push({
      id: `step-${Date.now()}-2`,
      role: 'Evidence Investigation Agent',
      status: 'Completed',
      currentTask: 'Scan recurring billing emails & usage logs',
      taskSummary: `Identified ${state.subscriptions.length} recurring subscriptions from billing emails.`,
      toolsInvoked: ['email-mcp.search_emails'],
      executionResult: `Active monthly spend: ${formatINR(analytics.activeMonthlySpend)} (${formatINR(analytics.activeAnnualSpend)}/yr).`,
      timestamp: new Date().toISOString(),
    });

    steps.push({
      id: `step-${Date.now()}-3`,
      role: 'Policy Analysis Agent',
      status: 'Completed',
      currentTask: 'Detect duplicates & unused plans',
      taskSummary: `Flagged ${flagged.length} plans totaling ${formatINR(analytics.potentialMonthlySavings)}/mo (${formatINR(analytics.potentialAnnualSavings)}/yr) in potential savings.`,
      toolsInvoked: [],
      executionResult: flagged
        .map((f) => `${f.name} (${formatINR(f.monthlyCost)}/mo — ${f.category})`)
        .join('; '),
      timestamp: new Date().toISOString(),
    });

    callbacks?.onStep?.('Preparing cancellation approval…');
    const targetSub = flagged[0];
    let existingPending = state.approvals.find(
      (a) => a.actionType === 'cancel_subscription' && a.status === 'pending'
    );

    if (!existingPending && targetSub) {
      const body =
        `Hello ${targetSub.provider} Billing,\n\n` +
        `Please cancel my "${targetSub.name}" subscription (${formatINR(targetSub.monthlyCost)}/month) effective immediately before the next UPI AutoPay billing date (${targetSub.nextBillingDate}).\n\n` +
        `Reason: ${targetSub.usageNote}\n\nThank you,\n${state.settings.profile.name}`;
      mcpRouter.callTool(state, 'email-mcp', 'create_email_draft', {
        to: targetSub.providerEmail,
        subject: `Cancellation Request — ${targetSub.name}`,
        body,
      });
      const draftExec = {
        server: 'Email MCP',
        tool: 'create_email_draft',
        summary: `Drafted cancellation notice for ${targetSub.name}.`,
      };
      toolsExecuted.push(draftExec);
      callbacks?.onTool?.(draftExec);

      existingPending = withPlainFields({
        id: `apr-sub-${Date.now()}`,
        title: `Cancel ${targetSub.name} (${formatINR(targetSub.monthlyCost)}/mo)`,
        plainSummary: `Send a cancellation request for ${targetSub.name} to save ${formatINR(targetSub.monthlyCost)}/mo.`,
        riskLevel: 'Medium',
        actionType: 'cancel_subscription',
        recipient: targetSub.providerEmail,
        subject: `Cancellation Request — ${targetSub.name}`,
        messageContent: body,
        evidenceCitations: citations,
        expectedConsequences: [
          `Saves ${formatINR(targetSub.monthlyCost)}/month (${formatINR(targetSub.annualCost)}/year).`,
          `Prevents next scheduled UPI/card charge on ${targetSub.nextBillingDate}.`,
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
      });
      state.approvals.unshift(existingPending);
    }

    createdApproval = existingPending ? withPlainFields(existingPending) : undefined;

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

    evidenceSummary = `Emails: email-002 (JioCloud Pro & JioCloud Plus Legacy), email-003 (CineMax Ultra 4K India), email-004 (CultFit Digital Coaching). Found ${analytics.activeCount} active subscriptions totaling ${formatINR(analytics.activeMonthlySpend)}/month (${formatINR(analytics.activeAnnualSpend)}/year). Flagged ${flagged.length} plans (${flagged.map((f) => `${f.name}: ${formatINR(f.monthlyCost)}/mo [${f.category}]`).join(', ')}) representing ${formatINR(analytics.potentialMonthlySavings)}/month (${formatINR(analytics.potentialAnnualSavings)}/year) in potential savings. Nothing has been cancelled yet; approval is required.`;
    defaultReasoning =
      'Audited recurring UPI AutoPay & card billing emails and compared usage activity against monthly renewal dates.';
    defaultAnswer =
      `I audited your recurring UPI AutoPay & card charges across **${analytics.activeCount} active subscriptions** in Demo Mode:\n\n` +
      `- **Current Monthly Spend:** **${formatINR(analytics.activeMonthlySpend)}/mo** (${formatINR(analytics.activeAnnualSpend)}/yr)\n` +
      `- **Potential Savings:** **${formatINR(analytics.potentialMonthlySavings)}/mo** (${formatINR(analytics.potentialAnnualSavings)}/yr)\n` +
      `- **Flagged Plans:** ${flagged.map((f) => `**${f.name}** (${formatINR(f.monthlyCost)}/mo · ${f.category})`).join(', ')}\n\n` +
      (createdApproval
        ? 'I have prepared a cancellation request below for your explicit approval — nothing is cancelled automatically.'
        : 'All flagged subscriptions have already been reviewed.');
  } else if (intent === 'appointment_scheduling') {
    callbacks?.onStep?.('Checking calendar availability…');
    const targetDate = '2026-11-25';
    const slotsRes = mcpRouter.callTool(state, 'calendar-mcp', 'find_available_slots', {
      targetDate,
      durationMinutes: 60,
      preferredPeriod: 'Afternoon',
    });
    const slotsExec = {
      server: 'Calendar MCP',
      tool: 'find_available_slots',
      summary: slotsRes.summary,
    };
    toolsExecuted.push(slotsExec);
    callbacks?.onTool?.(slotsExec);

    if (signal?.aborted) throw new Error('Request cancelled by user.');

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
      reason:
        'Open IST window between Q3 FY26-27 Budget & Ops Planning (13:00–14:00) and Dental Checkup (15:30–16:15).',
    };

    const busyTomorrow = state.events.filter((e) => e.start.startsWith(targetDate));
    citations.push({
      id: 'cit-cal-tomorrow',
      sourceType: 'calendar',
      sourceId: 'ev-4',
      label: `Demo Calendar IST (${targetDate})`,
      excerpt: `Busy tomorrow: ${busyTomorrow.map((b) => `${b.title} (${b.start.slice(11, 16)}–${b.end.slice(11, 16)})`).join(', ')}.`,
    });

    steps.push({
      id: `step-${Date.now()}-2`,
      role: 'Evidence Investigation Agent',
      status: 'Completed',
      currentTask: `Query IST Calendar for ${targetDate}`,
      taskSummary: `Retrieved ${busyTomorrow.length} existing calendar events on ${targetDate}.`,
      toolsInvoked: ['calendar-mcp.find_available_slots'],
      executionResult: 'Detected busy blocks at 09:30–10:30, 13:00–14:00, and 15:30–16:15 IST.',
      timestamp: new Date().toISOString(),
    });

    steps.push({
      id: `step-${Date.now()}-3`,
      role: 'Policy Analysis Agent',
      status: 'Completed',
      currentTask: 'Filter conflict-free 60-minute afternoon windows',
      taskSummary: `Identified ${slots.length} conflict-free afternoon slot(s); best match is ${bestSlot.label} IST.`,
      toolsInvoked: [],
      executionResult: `Recommended ${bestSlot.label} IST on ${targetDate}.`,
      timestamp: new Date().toISOString(),
    });

    callbacks?.onStep?.('Staging calendar proposal…');
    const eventTitle = 'Admin & Strategy Sync';
    mcpRouter.callTool(state, 'calendar-mcp', 'create_calendar_event', {
      title: eventTitle,
      start: bestSlot.start,
      end: bestSlot.end,
    });
    const propExec = {
      server: 'Calendar MCP',
      tool: 'create_calendar_event',
      summary: `Staged proposed event "${eventTitle}" at ${bestSlot.label} IST on ${targetDate}.`,
    };
    toolsExecuted.push(propExec);
    callbacks?.onTool?.(propExec);

    createdApproval = withPlainFields({
      id: `apr-cal-${Date.now()}`,
      title: `Schedule "${eventTitle}" (${targetDate} · ${bestSlot.label} IST)`,
      plainSummary: `Add "${eventTitle}" to your calendar tomorrow (${targetDate}) from ${bestSlot.label} IST.`,
      riskLevel: 'Low',
      actionType: 'create_appointment',
      recipient: `Demo Workspace Calendar (${state.settings.profile.email})`,
      subject: `${eventTitle} — ${targetDate} ${bestSlot.label} IST`,
      messageContent:
        `Proposed Calendar Event: ${eventTitle}\n` +
        `Date: ${targetDate}\n` +
        `Time: ${bestSlot.label} IST\n` +
        `Conflicts Checked: Clear of Q3 FY26-27 Budget & Ops Planning (13:00–14:00) and Dental Checkup (15:30–16:15).`,
      evidenceCitations: citations,
      expectedConsequences: [
        `Adds "${eventTitle}" (${bestSlot.label} IST) to your workspace calendar on ${targetDate}.`,
        'Zero scheduling conflicts with existing commitments.',
      ],
      potentialRisks: [
        'Leaves 0-minute transition buffer immediately after Q3 FY26-27 Budget & Ops Planning (ends 14:00).',
      ],
      status: 'pending',
      createdAt: new Date().toISOString(),
      mcpServer: 'action-mcp',
      mcpTool: 'create_approved_appointment',
      mcpArgs: {
        title: eventTitle,
        start: bestSlot.start,
        end: bestSlot.end,
        location: 'Google Meet (IST)',
      },
    });
    state.approvals.unshift(createdApproval);

    steps.push({
      id: `step-${Date.now()}-4`,
      role: 'Action Planning Agent',
      status: 'Completed',
      currentTask: 'Stage proposed calendar event for approval',
      taskSummary: `Prepared appointment proposal for ${targetDate} at ${bestSlot.label} IST.`,
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

    evidenceSummary = `Demo Calendar IST (${targetDate}): Busy blocks are 09:30–10:30 Engineering Standup, 13:00–14:00 Q3 FY26-27 Budget & Ops Planning, 15:30–16:15 Dental Checkup (Indiranagar Clinic). Conflict-free afternoon slots: ${slots.map((s) => s.label).join(', ')}. Proposed "${eventTitle}" at ${bestSlot.label} IST is staged for human approval (not booked yet).`;
    defaultReasoning = `Inspected ${targetDate} IST calendar, avoided 3 existing events, and ranked conflict-free afternoon windows.`;
    defaultAnswer =
      `I checked your Demo Calendar (IST) for **tomorrow (${targetDate})** and avoided your existing commitments:\n\n` +
      `- **Busy Windows Avoided:** Q3 FY26-27 Budget & Ops Planning (13:00–14:00) and Dental Checkup at Indiranagar Clinic (15:30–16:15)\n` +
      `- **Recommended Conflict-Free Slot:** **${bestSlot.label} IST**\n` +
      `- **Other Afternoon Options:** ${slots.slice(1, 4).map((s) => s.label).join(', ') || '16:30 – 17:30'}\n\n` +
      'I have staged the proposed calendar event below. Approve it to add the meeting to your Appointment Manager.';
  } else if (intent === 'consumer_rights') {
    callbacks?.onStep?.('Searching consumer rights & warranty laws…');
    if (isGeminiConfigured()) {
      try {
        const grounded = await queryWithSearchGrounding({ userPrompt, signal });
        if (grounded.text) {
          preSynthesizedAnswer = grounded.text;
          groundingSources.push(...grounded.sources);
        }
      } catch {
        // Fallback handled below
      }
    }

    steps.push({
      id: `step-${Date.now()}-2`,
      role: 'Evidence Investigation Agent',
      status: 'Completed',
      currentTask: 'Research consumer protection & warranty guidance',
      taskSummary:
        groundingSources.length > 0
          ? `Found ${groundingSources.length} live web source(s) via Google Search grounding.`
          : 'Used built-in consumer rights checklist (AI web search unavailable offline).',
      toolsInvoked: groundingSources.length > 0 ? ['googleSearch'] : [],
      executionResult: groundingSources.length > 0 ? 'Grounded sources attached.' : 'Fallback guidance ready.',
      timestamp: new Date().toISOString(),
    });
    steps.push({
      id: `step-${Date.now()}-3`,
      role: 'Policy Analysis Agent',
      status: 'Completed',
      currentTask: 'Relate guidance to workspace cases',
      taskSummary: 'Cross-referenced active Zenith 15 Pro & AeroPulse cases.',
      toolsInvoked: [],
      executionResult: 'Guidance ready.',
      timestamp: new Date().toISOString(),
    });
    steps.push({
      id: `step-${Date.now()}-4`,
      role: 'Action Planning Agent',
      status: 'Completed',
      currentTask: 'Compile summary',
      taskSummary: 'Read-only consumer rights summary prepared.',
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

    evidenceSummary = `Indian consumer-rights inquiry: "${userPrompt}". Active workspace cases: Zenith 15 Pro Laptop (${formatINR(124990)}, Tax Invoice #CRO-987654) and AeroPulse Headphones (${formatINR(18990)}, Order #RD-44190).`;
    defaultReasoning =
      groundingSources.length > 0
        ? 'Checked live web sources via Google Search grounding for Indian consumer protection and warranty rules.'
        : 'Provided Indian Consumer Protection Act, 2019 & RBI UPI e-mandate guidance (offline fallback mode).';
    defaultAnswer =
      preSynthesizedAnswer ??
      'Here is practical guidance under **India\'s Consumer Protection Act, 2019** for defective purchases and recurring billing:\n\n' +
        '- **GST Invoice & Written Warranty:** Retain your dated GST tax invoice (`Croma_Tax_Invoice_CRO-987654.pdf`) and warranty policy (`Zenith_India_Warranty_Policy.pdf`). A seller or brand cannot refuse warranty repair on the pretext of missing original packaging.\n' +
        '- **Defective Goods & Deficiency in Service:** Under the Consumer Protection Act, 2019, you can demand free repair, replacement, or a full refund if a product has an inherent defect within warranty.\n' +
        '- **Escalation Channels:** File a grievance on the **National Consumer Helpline (NCH — call 1915 or consumerhelpline.gov.in)** or file an online complaint with the District Consumer Commission via **e-Daakhil (edaakhil.nic.in)**. For unauthorised UPI AutoPay/card debits, revoke the mandate in your UPI app and raise a dispute with your bank under RBI e-mandate guidelines.\n\n' +
        '*(Live web citations require a connected `GEMINI_API_KEY` with Google Search grounding.)*';
  } else {
    // General admin query: use Gemini Function Calling when available!
    callbacks?.onStep?.('Searching workspace documents & emails…');
    if (isGeminiConfigured()) {
      try {
        const toolLoop = await runGeminiToolLoop({
          state,
          userPrompt,
          onStep: callbacks?.onStep,
          onTool: (t) => {
            toolsExecuted.push(t);
            callbacks?.onTool?.(t);
          },
          signal,
        });
        preSynthesizedAnswer = toolLoop.answerText;
      } catch {
        // Fall through cleanly to deterministic tool inspection
      }
    }

    if (toolsExecuted.length === 0) {
      const docSearch = mcpRouter.callTool(state, 'document-mcp', 'search_documents', {
        query: '',
      });
      const docExec = {
        server: 'Document MCP',
        tool: 'search_documents',
        summary: docSearch.summary,
      };
      toolsExecuted.push(docExec);
      callbacks?.onTool?.(docExec);
    }

    const analytics = calculateSubscriptionAnalytics(state.subscriptions, state.referenceDate);
    steps.push({
      id: `step-${Date.now()}-2`,
      role: 'Evidence Investigation Agent',
      status: 'Completed',
      currentTask: 'Gather workspace status across connected tools',
      taskSummary: `Indexed ${state.cases.length} warranty cases, ${state.subscriptions.length} subscriptions, and ${state.documents.length} documents.`,
      toolsInvoked: toolsExecuted.map((t) => `${t.server}.${t.tool}`),
      executionResult: 'Workspace context assembled.',
      timestamp: new Date().toISOString(),
    });
    steps.push({
      id: `step-${Date.now()}-3`,
      role: 'Policy Analysis Agent',
      status: 'Completed',
      currentTask: 'Prioritize actionable recommendations',
      taskSummary: `Found ${formatINR(analytics.potentialMonthlySavings)}/mo subscription savings and 1 eligible laptop warranty claim.`,
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

    evidenceSummary = `Workspace summary (${state.referenceDate}): ${state.cases.length} warranty cases (Zenith 15 Pro Laptop ${formatINR(124990)}, Invoice #CRO-987654, eligible until 2028-08-24; AeroPulse Headphones ${formatINR(18990)}, Order #RD-44190, needs serial photo), ${analytics.activeCount} subscriptions (${formatINR(analytics.activeMonthlySpend)}/mo, ${formatINR(analytics.potentialMonthlySavings)}/mo savings available), ${state.approvals.filter((a) => a.status === 'pending').length} pending approvals.`;
    defaultReasoning = 'Scanned local workspace tools (Document, Email, Calendar) to assemble a verified summary.';
    defaultAnswer =
      preSynthesizedAnswer ??
      'Here is your verified Demo Mode workspace summary (India Edition):\n\n' +
        `- **Warranty & Refunds:** Zenith 15 Pro Laptop (${formatINR(124990)}, \`Croma_Tax_Invoice_CRO-987654.pdf\`) is within its 24-month India warranty; AeroPulse Headphones (\`RelianceDigital_Order_RD4419.pdf\`) need serial number evidence.\n` +
        `- **UPI AutoPay & Subscriptions:** ${formatINR(analytics.activeMonthlySpend)}/mo active across ${analytics.activeCount} plans, with **${formatINR(analytics.potentialMonthlySavings)}/mo** in potential savings.\n` +
        `- **Pending Approvals:** ${state.approvals.filter((a) => a.status === 'pending').length} item(s) waiting in the Approval Centre.`;
  }

  let finalReasoning = defaultReasoning;
  let finalResponse = preSynthesizedAnswer ?? defaultAnswer;
  let geminiError: string | undefined;
  let fallbackMode = !isGeminiConfigured();

  if (callbacks?.onToken) {
    // Streaming path
    if (preSynthesizedAnswer) {
      // Stream pre-computed Gemini function-calling or grounded answer smoothly
      const chunks = preSynthesizedAnswer.match(/\S+\s*/g) ?? [preSynthesizedAnswer];
      for (const ch of chunks) {
        if (signal?.aborted) throw new Error('Request cancelled by user.');
        callbacks.onToken(ch);
      }
      fallbackMode = !isGeminiConfigured();
    } else if (isGeminiConfigured()) {
      callbacks.onStep?.('Writing your answer…');
      try {
        const streamed = await streamGeminiSynthesis({
          userMessage: userPrompt,
          evidenceSummary,
          onToken: callbacks.onToken,
          signal,
        });
        if (streamed) {
          finalResponse = streamed;
          fallbackMode = false;
        }
      } catch (err) {
        if (signal?.aborted) throw err;
        geminiError = humanizeGeminiError(err);
        fallbackMode = true;
        const chunks = defaultAnswer.match(/\S+\s*/g) ?? [defaultAnswer];
        for (const ch of chunks) {
          callbacks.onToken(ch);
        }
      }
    } else {
      // Offline deterministic mode: still stream words smoothly for responsive UI
      fallbackMode = true;
      const chunks = defaultAnswer.match(/\S+\s*/g) ?? [defaultAnswer];
      for (const ch of chunks) {
        if (signal?.aborted) throw new Error('Request cancelled by user.');
        callbacks.onToken(ch);
      }
    }
  } else if (!preSynthesizedAnswer && isGeminiConfigured()) {
    try {
      const synthesized = await synthesizeWithGemini({
        userMessage: userPrompt,
        evidenceSummary,
        signal,
      });
      if (synthesized.reasoningSummary) finalReasoning = synthesized.reasoningSummary;
      if (synthesized.responseText) finalResponse = synthesized.responseText;
      fallbackMode = false;
    } catch (err) {
      if (signal?.aborted) throw err;
      geminiError = humanizeGeminiError(err);
      fallbackMode = true;
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
    groundingSources: groundingSources.length > 0 ? groundingSources : undefined,
    fallbackMode,
    toolsExecuted,
    approvalId: createdApproval?.id,
    agentRunId: agentRun.id,
  };

  state.chatMessages.push(userMsg, assistantMsg);

  state.activityTimeline.unshift({
    id: `act-${Date.now()}`,
    timestamp: new Date().toISOString(),
    category: 'agent',
    title: `Multi-Agent Run: ${intent.replace(/_/g, ' ')}`,
    description: `${toolsExecuted.length} tool(s) executed${createdApproval ? '; staged 1 human approval' : ''}.`,
    simulated: true,
  });

  return {
    message: assistantMsg,
    agentRun,
    createdApproval,
    geminiError,
    fallbackMode,
  };
}
