import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  detectCalendarConflicts,
  detectDocumentContradictions,
  evaluateWarrantyEligibility,
  findAvailableSlots,
} from './src/shared/domainLogic';
import type { ApprovalRequest, DocumentRecord } from './src/shared/types';
import { runMultiAgentWorkflow } from './server/agents/orchestrator';
import { extractDocumentWithGemini, isGeminiConfigured } from './server/gemini';
import type { JsonRpcRequest } from './server/mcp/protocol';
import { mcpRouter } from './server/mcp/servers';
import { workspaceStore } from './server/store';

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // 1. Full Workspace Snapshot + AI Provider Status
  app.get('/api/workspace', (_req, res) => {
    res.json({
      ...workspaceStore.getState(),
      geminiConfigured: isGeminiConfigured(),
    });
  });

  // 2. Genuine Model Context Protocol (MCP) JSON-RPC 2.0 Endpoint
  app.post('/api/mcp/rpc', (req, res) => {
    const rpcReq = req.body as JsonRpcRequest;
    if (!rpcReq || rpcReq.jsonrpc !== '2.0' || !rpcReq.method || !rpcReq.params?.serverId) {
      res.status(400).json({
        jsonrpc: '2.0',
        id: rpcReq?.id ?? null,
        error: { code: -32600, message: 'Invalid JSON-RPC 2.0 MCP request.' },
      });
      return;
    }

    const state = workspaceStore.getState();
    const rpcRes = mcpRouter.handleRpc(state, rpcReq);
    res.json(rpcRes);
  });

  // 3. AI Assistant Multi-Agent Endpoint
  app.post('/api/assistant/chat', async (req, res) => {
    try {
      const prompt = String(req.body?.prompt ?? '').trim();
      const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : undefined;
      if (!prompt) {
        res.status(400).json({ error: 'Prompt message cannot be empty.' });
        return;
      }

      const state = workspaceStore.getState();
      const result = await runMultiAgentWorkflow(state, prompt, attachments);
      res.json({
        ...result,
        state: {
          ...state,
          geminiConfigured: isGeminiConfigured(),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Assistant workflow failed.';
      res.status(500).json({ error: message });
    }
  });

  // 4. Demo Scenario Quick Runners (Scenarios 1, 2, 3)
  app.post('/api/scenarios/run', async (req, res) => {
    const scenario = Number(req.body?.scenario);
    const promptMap: Record<number, string> = {
      1: 'Find my laptop invoice and check whether it is still under warranty.',
      2: 'Find subscriptions that are charging me every month and identify potential savings.',
      3: 'Schedule a meeting tomorrow afternoon without conflicting with my calendar.',
    };
    const prompt = promptMap[scenario];
    if (!prompt) {
      res.status(400).json({ error: 'Invalid scenario ID (expected 1, 2, or 3).' });
      return;
    }

    const state = workspaceStore.getState();
    const result = await runMultiAgentWorkflow(state, prompt);
    res.json({
      ...result,
      state: {
        ...state,
        geminiConfigured: isGeminiConfigured(),
      },
    });
  });

  function applyApprovalDecision(
    state: ReturnType<typeof workspaceStore.getState>,
    approval: ApprovalRequest,
    decision: 'approve' | 'reject' | 'edit',
    edits?: { subject?: string; messageContent?: string }
  ) {
    const uidSuffix = Math.random().toString(36).slice(2, 6);
    const editedSubject = edits?.subject;
    const editedMessage = edits?.messageContent;

    if (decision === 'edit') {
      if (editedSubject !== undefined) approval.subject = editedSubject;
      if (editedMessage !== undefined) approval.messageContent = editedMessage;
      state.activityTimeline.unshift({
        id: `act-${Date.now()}-${uidSuffix}`,
        timestamp: new Date().toISOString(),
        category: 'approval',
        title: `Edited Approval Request: ${approval.title}`,
        description: 'User updated draft content prior to sign-off.',
        simulated: true,
      });
      return { approval };
    }

    if (decision === 'reject') {
      approval.status = 'rejected';
      approval.decidedAt = new Date().toISOString();
      state.activityTimeline.unshift({
        id: `act-${Date.now()}-${uidSuffix}`,
        timestamp: approval.decidedAt,
        category: 'approval',
        title: `Rejected: ${approval.title}`,
        description: 'Human reviewer blocked external execution. No action taken.',
        simulated: true,
      });
      return { approval };
    }

    if (editedSubject !== undefined) approval.subject = editedSubject;
    if (editedMessage !== undefined) approval.messageContent = editedMessage;

    approval.status = 'approved';
    approval.decidedAt = new Date().toISOString();

    // Execute via Action MCP (which strictly verifies approval.status === 'approved')
    const execOutcome = mcpRouter.callTool(state, 'action-mcp', approval.mcpTool, {
      approvalId: approval.id,
      ...approval.mcpArgs,
    });

    if (execOutcome.ok) {
      approval.status = 'executed';
      approval.simulatedExecutionNote =
        '[DEMO SANDBOX] Simulated execution completed after explicit human approval. No real external API/email was sent.';
      state.tasksCompletedCount += 1;

      // Update linked domain entities
      if (approval.actionType === 'send_email' && approval.relatedEntityId) {
        const warrantyCase = state.cases.find((c) => c.id === approval.relatedEntityId);
        if (warrantyCase) {
          warrantyCase.status = 'Awaiting Response';
          warrantyCase.timeline.push({
            id: `tl-${Date.now()}-${uidSuffix}`,
            timestamp: new Date().toISOString(),
            title: 'Approved Complaint Sent (Demo Sandbox)',
            description: `Simulated claim email dispatched to ${approval.recipient} via Action MCP.`,
            actor: 'Action MCP (Human Approved)',
            citationIds: warrantyCase.citations.map((c) => c.id),
          });
        }
      }

      if (approval.actionType === 'cancel_subscription' && approval.relatedEntityId) {
        const sub = state.subscriptions.find((s) => s.id === approval.relatedEntityId);
        if (sub) {
          sub.category = 'Cancellation Pending';
          sub.status = 'Cancellation notice queued (Demo Sandbox)';
          sub.potentialSavingsMonthly = 0;
        }
      }

      if (approval.actionType === 'create_appointment') {
        const args = approval.mcpArgs as {
          title?: string;
          start?: string;
          end?: string;
          location?: string;
        };
        if (args.start && args.end) {
          state.events.push({
            id: `ev-${Date.now()}-${uidSuffix}`,
            title: args.title ?? approval.title,
            start: args.start,
            end: args.end,
            location: args.location ?? 'Video Call',
            attendees: [state.settings.profile.email],
            status: 'confirmed',
            source: 'approved_action',
            notes: 'Created after human approval via Action MCP (Demo Sandbox).',
          });
        }
      }

      // Update any waiting Execution Agent step in latest agent run
      const latestRun = state.agentRuns[0];
      if (latestRun && latestRun.overallStatus === 'Waiting for Approval') {
        latestRun.overallStatus = 'Completed';
        latestRun.completedAt = new Date().toISOString();
        const execStep = latestRun.steps.find((s) => s.role === 'Execution Agent');
        if (execStep) {
          execStep.status = 'Completed';
          execStep.executionResult = execOutcome.summary;
          execStep.timestamp = new Date().toISOString();
        }
      }

      state.activityTimeline.unshift({
        id: `act-${Date.now()}-${uidSuffix}`,
        timestamp: new Date().toISOString(),
        category: 'approval',
        title: `Approved & Executed (Demo): ${approval.title}`,
        description: execOutcome.summary,
        simulated: true,
      });
    }

    return { approval, execution: execOutcome };
  }

  // 5. Human Approval Centre Decision Endpoints (Single & Bulk)
  app.post('/api/approvals/bulk-decide', (req, res) => {
    const state = workspaceStore.getState();
    const rawIds: unknown[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = Array.from(
      new Set<string>(rawIds.map((id) => String(id ?? '').trim()).filter(Boolean))
    );
    const decision = String(req.body?.decision ?? '');

    if (ids.length === 0) {
      res.status(400).json({ error: 'Select at least one approval request.' });
      return;
    }
    if (decision !== 'approve' && decision !== 'reject') {
      res.status(400).json({ error: 'Invalid bulk decision. Expected approve or reject.' });
      return;
    }

    const processed: ApprovalRequest[] = [];
    const failures: Array<{ id: string; status: number; error: string }> = [];

    for (const id of ids) {
      const approval = state.approvals.find((a) => a.id === id);
      if (!approval) {
        failures.push({ id, status: 404, error: 'Approval request not found.' });
        continue;
      }
      if (approval.status !== 'pending') {
        failures.push({ id, status: 409, error: `Approval already ${approval.status}.` });
        continue;
      }
      const outcome = applyApprovalDecision(state, approval, decision);
      processed.push(outcome.approval);
    }

    if (processed.length === 0 && failures.length > 0) {
      const status = failures.some((f) => f.status === 409) ? 409 : 404;
      res.status(status).json({
        error: failures[0].error,
        processed,
        failures,
        state: { ...state, geminiConfigured: isGeminiConfigured() },
      });
      return;
    }

    res.json({
      processed,
      failures,
      state: { ...state, geminiConfigured: isGeminiConfigured() },
    });
  });

  app.post('/api/approvals/:id/decide', (req, res) => {
    const state = workspaceStore.getState();
    const approval = state.approvals.find((a) => a.id === req.params.id);
    if (!approval) {
      res.status(404).json({ error: 'Approval request not found.' });
      return;
    }
    if (approval.status !== 'pending') {
      res.status(409).json({ error: `Approval already ${approval.status}.` });
      return;
    }

    const decision = String(req.body?.decision ?? '') as 'approve' | 'reject' | 'edit';
    if (decision !== 'approve' && decision !== 'reject' && decision !== 'edit') {
      res.status(400).json({ error: 'Invalid decision. Expected approve, reject, or edit.' });
      return;
    }

    const editedSubject = req.body?.subject ? String(req.body.subject) : undefined;
    const editedMessage = req.body?.messageContent ? String(req.body.messageContent) : undefined;
    const outcome = applyApprovalDecision(state, approval, decision, {
      subject: editedSubject,
      messageContent: editedMessage,
    });

    res.json({
      ...outcome,
      state: { ...state, geminiConfigured: isGeminiConfigured() },
    });
  });

  // 6. Refund & Warranty Actions
  app.post('/api/cases/:id/investigate', (req, res) => {
    const state = workspaceStore.getState();
    const c = state.cases.find((item) => item.id === req.params.id);
    if (!c) {
      res.status(404).json({ error: 'Case not found.' });
      return;
    }

    mcpRouter.callTool(state, 'email-mcp', 'search_emails', { query: c.product.split(' ')[0] });
    if (c.documentIds[0]) {
      mcpRouter.callTool(state, 'document-mcp', 'extract_invoice_details', {
        documentId: c.documentIds[0],
      });
    }

    const evalRes = evaluateWarrantyEligibility({
      purchaseDate: c.purchaseDate,
      warrantyPeriodMonths: c.warrantyPeriodMonths,
      currentDate: state.referenceDate,
      hasInvoice: c.documentIds.length > 0,
      hasDefectEvidence: c.missingEvidence.length === 0,
    });

    c.status = evalRes.recommendedStatus;
    c.eligibilitySummary = evalRes.summary;
    c.timeline.push({
      id: `tl-${Date.now()}`,
      timestamp: new Date().toISOString(),
      title: 'Warranty Re-Investigation Completed',
      description: evalRes.summary,
      actor: 'Policy Analysis Agent',
      citationIds: c.citations.map((cit) => cit.id),
    });

    res.json({ case: c, state: { ...state, geminiConfigured: isGeminiConfigured() } });
  });

  app.post('/api/cases/:id/prepare-complaint', (req, res) => {
    const state = workspaceStore.getState();
    const c = state.cases.find((item) => item.id === req.params.id);
    if (!c) {
      res.status(404).json({ error: 'Case not found.' });
      return;
    }

    const subject = `Warranty Claim — Invoice #${c.invoiceNumber} (${c.product})`;
    const draft =
      c.complaintDraft ||
      `Dear ${c.seller} Support,\n\nI am requesting warranty coverage for ${c.product} purchased on ${c.purchaseDate} (Invoice #${c.invoiceNumber}, $${c.purchaseAmount.toFixed(2)}).\n\nIssue: ${c.issueSummary}\nWarranty Expiration: ${c.warrantyExpiration}.\n\nPlease advise next steps.\n\nSincerely,\n${state.settings.profile.name}`;

    c.complaintDraft = draft;
    c.status = 'Complaint Prepared';

    mcpRouter.callTool(state, 'email-mcp', 'create_email_draft', {
      to: c.sellerEmail,
      subject,
      body: draft,
    });

    const approval: ApprovalRequest = {
      id: `apr-case-${Date.now()}`,
      title: `Send Warranty Claim — ${c.product}`,
      actionType: 'send_email',
      recipient: c.sellerEmail,
      subject,
      messageContent: draft,
      evidenceCitations: c.citations,
      expectedConsequences: [
        `Dispatches simulated warranty claim for $${c.purchaseAmount.toFixed(2)} purchase.`,
        'Moves case status to Awaiting Response.',
      ],
      potentialRisks:
        c.missingEvidence.length > 0
          ? [`Missing evidence noted: ${c.missingEvidence.join('; ')}`]
          : ['Seller may request RMA inspection prior to refund.'],
      status: 'pending',
      createdAt: new Date().toISOString(),
      relatedEntityId: c.id,
      mcpServer: 'action-mcp',
      mcpTool: 'send_approved_email',
      mcpArgs: { to: c.sellerEmail, caseId: c.id },
    };

    state.approvals.unshift(approval);
    state.activityTimeline.unshift({
      id: `act-${Date.now()}`,
      timestamp: new Date().toISOString(),
      category: 'refund',
      title: `Prepared Warranty Complaint: ${c.product}`,
      description: 'Draft queued in Approval Centre before simulated dispatch.',
      simulated: true,
    });

    res.json({ approval, case: c, state: { ...state, geminiConfigured: isGeminiConfigured() } });
  });

  // 7. Subscription Cancellation Preparation (Never auto-cancels)
  app.post('/api/subscriptions/:id/prepare-cancellation', (req, res) => {
    const state = workspaceStore.getState();
    const sub = state.subscriptions.find((s) => s.id === req.params.id);
    if (!sub) {
      res.status(404).json({ error: 'Subscription not found.' });
      return;
    }

    const existing = state.approvals.find(
      (a) => a.relatedEntityId === sub.id && a.status === 'pending'
    );
    if (existing) {
      res.json({ approval: existing, state: { ...state, geminiConfigured: isGeminiConfigured() } });
      return;
    }

    const subject = `Subscription Cancellation Request — ${sub.name}`;
    const body =
      `Hello ${sub.provider} Billing Team,\n\n` +
      `Please cancel my "${sub.name}" (${sub.billingFrequency}, $${sub.monthlyCost.toFixed(2)}/mo) subscription prior to the upcoming ${sub.nextBillingDate} renewal.\n\n` +
      `Account Owner: ${state.settings.profile.email}\n` +
      `Notes: ${sub.usageNote}\n\nThank you,\n${state.settings.profile.name}`;

    mcpRouter.callTool(state, 'email-mcp', 'create_email_draft', {
      to: sub.providerEmail,
      subject,
      body,
    });

    const approval: ApprovalRequest = {
      id: `apr-sub-${Date.now()}`,
      title: `Cancel ${sub.name} ($${sub.monthlyCost.toFixed(2)}/mo)`,
      actionType: 'cancel_subscription',
      recipient: sub.providerEmail,
      subject,
      messageContent: body,
      evidenceCitations: [
        {
          id: `cit-${sub.id}`,
          sourceType: 'email',
          sourceId: sub.sourceEmailId ?? 'email-002',
          label: `${sub.provider} Billing Record`,
          excerpt: `${sub.usageNote} · Next billing: ${sub.nextBillingDate}`,
        },
      ],
      expectedConsequences: [
        `Avoids $${sub.monthlyCost.toFixed(2)}/mo ($${sub.annualCost.toFixed(2)}/yr) recurring charge.`,
        `Marks ${sub.name} as Cancellation Pending upon approval.`,
      ],
      potentialRisks: ['Premium benefits end at close of current billing period.'],
      status: 'pending',
      createdAt: new Date().toISOString(),
      relatedEntityId: sub.id,
      mcpServer: 'action-mcp',
      mcpTool: 'send_approved_email',
      mcpArgs: { to: sub.providerEmail, subscriptionId: sub.id },
    };

    state.approvals.unshift(approval);
    state.activityTimeline.unshift({
      id: `act-${Date.now()}`,
      timestamp: new Date().toISOString(),
      category: 'subscription',
      title: `Staged Cancellation: ${sub.name}`,
      description: 'Waiting for human sign-off in Approval Centre.',
      simulated: true,
    });

    res.json({ approval, state: { ...state, geminiConfigured: isGeminiConfigured() } });
  });

  // 8. Appointment Slot Finder & Approval Staging
  app.post('/api/appointments/find-slots', (req, res) => {
    const state = workspaceStore.getState();
    const targetDate = String(req.body?.targetDate ?? '2026-11-25');
    const durationMinutes = Number(req.body?.durationMinutes ?? 60);
    const preferredPeriod = (req.body?.preferredPeriod ?? 'Afternoon') as
      | 'Morning'
      | 'Afternoon'
      | 'Evening'
      | 'Any';

    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      res.status(400).json({ error: 'Invalid targetDate. Expected YYYY-MM-DD format.' });
      return;
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) {
      res.status(400).json({ error: 'Duration must be between 15 and 480 minutes.' });
      return;
    }

    mcpRouter.callTool(state, 'calendar-mcp', 'find_available_slots', {
      targetDate,
      durationMinutes,
      preferredPeriod,
    });

    const slots = findAvailableSlots({
      events: state.events,
      targetDate,
      durationMinutes,
      preferredPeriod,
    });

    res.json({
      targetDate,
      slots,
      state: { ...state, geminiConfigured: isGeminiConfigured() },
    });
  });

  app.post('/api/appointments/propose', (req, res) => {
    const state = workspaceStore.getState();
    const title = String(req.body?.title ?? '').trim();
    const start = String(req.body?.start ?? '');
    const end = String(req.body?.end ?? '');
    const location = String(req.body?.location ?? 'Video Call');

    if (!title || !start || !end) {
      res.status(400).json({ error: 'Title, start, and end times are required.' });
      return;
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate <= startDate
    ) {
      res.status(400).json({ error: 'End time must be after start time.' });
      return;
    }

    const conflicts = detectCalendarConflicts(state.events, start, end);
    mcpRouter.callTool(state, 'calendar-mcp', 'create_calendar_event', { title, start, end });

    const approval: ApprovalRequest = {
      id: `apr-appt-${Date.now()}`,
      title: `Create Appointment: ${title}`,
      actionType: 'create_appointment',
      recipient: state.settings.profile.email,
      subject: `${title} (${start.slice(0, 10)} ${start.slice(11, 16)}–${end.slice(11, 16)})`,
      messageContent: `Title: ${title}\nStart: ${start}\nEnd: ${end}\nLocation: ${location}\nConflicts detected: ${conflicts.length}`,
      evidenceCitations: [
        {
          id: `cit-cal-${Date.now()}`,
          sourceType: 'calendar',
          sourceId: 'calendar-mcp',
          label: `Calendar Availability Check (${start.slice(0, 10)})`,
          excerpt:
            conflicts.length === 0
              ? 'Zero overlapping events found.'
              : `Overlaps with: ${conflicts.map((c) => c.title).join(', ')}`,
        },
      ],
      expectedConsequences: [
        `Adds "${title}" to your workspace calendar (${start.slice(0, 10)}).`,
      ],
      potentialRisks:
        conflicts.length > 0
          ? [`Double-books ${conflicts.map((c) => c.title).join(', ')}.`]
          : ['None — conflict-free slot verified.'],
      status: 'pending',
      createdAt: new Date().toISOString(),
      mcpServer: 'action-mcp',
      mcpTool: 'create_approved_appointment',
      mcpArgs: { title, start, end, location },
    };

    state.approvals.unshift(approval);
    state.activityTimeline.unshift({
      id: `act-${Date.now()}`,
      timestamp: new Date().toISOString(),
      category: 'appointment',
      title: `Proposed Appointment: ${title}`,
      description: 'Staged in Approval Centre prior to calendar booking.',
      simulated: true,
    });

    res.json({
      approval,
      conflicts,
      state: { ...state, geminiConfigured: isGeminiConfigured() },
    });
  });

  // 9. Document Upload & Intelligence Extraction (Gemini Multimodal + Document MCP)
  app.post('/api/documents/upload', async (req, res) => {
    try {
      const fileName = String(req.body?.fileName ?? 'uploaded_document.txt');
      const mimeType = String(req.body?.mimeType ?? 'text/plain');
      const base64Data = String(req.body?.base64Data ?? '');
      const docType = (req.body?.type ?? 'upload') as DocumentRecord['type'];

      if (!base64Data) {
        res.status(400).json({ error: 'File content is empty.' });
        return;
      }

      const state = workspaceStore.getState();
      let extractedFields: DocumentRecord['extractedFields'] = {};
      let rawText = '';
      let citations: string[] = [];
      let geminiWarning: string | undefined;

      if (mimeType.startsWith('text/') || fileName.endsWith('.txt') || fileName.endsWith('.csv')) {
        rawText = Buffer.from(base64Data, 'base64').toString('utf8').slice(0, 4000);
      }

      if (isGeminiConfigured() && (mimeType.startsWith('image/') || mimeType === 'application/pdf')) {
        try {
          const parsed = await extractDocumentWithGemini({
            fileName,
            mimeType,
            base64Data,
          });
          extractedFields = {
            merchant: parsed.merchant,
            product: parsed.product,
            purchaseDate: parsed.purchaseDate,
            invoiceNumber: parsed.invoiceNumber,
            totalAmount: parsed.totalAmount,
            warrantyPeriod: parsed.warrantyPeriod,
            warrantyExpiration: parsed.warrantyExpiration,
          };
          rawText = parsed.summaryText;
          citations = parsed.citations;
        } catch (err) {
          geminiWarning = err instanceof Error ? err.message : 'Gemini extraction failed';
        }
      }

      if (Object.keys(extractedFields).length === 0) {
        // Structured deterministic fallback for local text/demo files
        const invMatch =
          rawText.match(/INV[-#:\s]+([A-Z0-9-]+)/i) ?? rawText.match(/INV[-#:\s]*([A-Z0-9-]+)/i);
        const totalMatch = rawText.match(/(?:total|amount)[:\s]*\$?\s*([\d,]+\.?\d*)/i);
        const merchantMatch = rawText.match(/merchant[:\s]*(.+)/i);
        const productMatch = rawText.match(/product[:\s]*(.+)/i);
        const warrantyMatch = rawText.match(/warranty[:\s]*(.+)/i);
        extractedFields = {
          merchant: merchantMatch?.[1]?.trim() || 'Uploaded Vendor Document',
          product:
            productMatch?.[1]?.trim() ||
            fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
          purchaseDate: state.referenceDate,
          invoiceNumber: invMatch?.[1]?.trim() || `UP-${Date.now().toString().slice(-5)}`,
          totalAmount: totalMatch?.[1] ? `$${totalMatch[1]}` : 'Pending verification',
          warrantyPeriod: warrantyMatch?.[1]?.trim() || '12 Months (Estimated)',
        };
        if (!rawText) {
          rawText = `Uploaded ${fileName} (${mimeType}). Ready for Document MCP indexing.`;
        }
        citations = citations.length > 0 ? citations : [`Source file: ${fileName} uploaded on ${state.referenceDate}`];
      }

      const newDoc: DocumentRecord = {
        id: `doc-up-${Date.now()}`,
        title: fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
        type: docType,
        uploadedAt: new Date().toISOString(),
        fileName,
        mimeType,
        previewUrl: mimeType.startsWith('image/') ? `data:${mimeType};base64,${base64Data}` : undefined,
        ocrStatus: 'Completed',
        extractedFields,
        contradictions: [],
        citations,
        rawText,
      };

      state.documents.unshift(newDoc);

      // Re-run contradiction detector across all docs
      const allContradictions = detectDocumentContradictions(state.documents);
      newDoc.contradictions = allContradictions.filter(
        (c) => c.comparedDocumentId === newDoc.id || newDoc.type === 'invoice' || newDoc.type === 'warranty'
      );

      mcpRouter.callTool(state, 'document-mcp', 'extract_invoice_details', {
        documentId: newDoc.id,
      });

      state.activityTimeline.unshift({
        id: `act-${Date.now()}`,
        timestamp: new Date().toISOString(),
        category: 'document',
        title: `Analyzed Document: ${newDoc.fileName}`,
        description: `Extracted structured fields via Document MCP${isGeminiConfigured() && !geminiWarning ? ' + Gemini Vision' : ''}.`,
        simulated: true,
      });

      res.json({
        document: newDoc,
        geminiWarning,
        state: { ...state, geminiConfigured: isGeminiConfigured() },
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Document upload failed.' });
    }
  });

  // 10. Settings, Notifications, Demo Reset
  app.patch('/api/settings', (req, res) => {
    const state = workspaceStore.getState();
    if (req.body?.profile) {
      state.settings.profile = { ...state.settings.profile, ...req.body.profile };
    }
    if (req.body?.notifications) {
      state.settings.notifications = { ...state.settings.notifications, ...req.body.notifications };
    }
    if (req.body?.requireHumanApprovalForEmails === true) {
      state.settings.requireHumanApprovalForEmails = true;
    }
    if (req.body?.requireHumanApprovalForCalendar === true) {
      state.settings.requireHumanApprovalForCalendar = true;
    }
    if (req.body?.requireHumanApprovalForCancellations === true) {
      state.settings.requireHumanApprovalForCancellations = true;
    }
    res.json({ settings: state.settings, state: { ...state, geminiConfigured: isGeminiConfigured() } });
  });

  app.post('/api/notifications/read-all', (_req, res) => {
    const state = workspaceStore.getState();
    for (const n of state.notifications) {
      n.read = true;
    }
    res.json({ state: { ...state, geminiConfigured: isGeminiConfigured() } });
  });

  app.post('/api/demo/reset', (_req, res) => {
    const fresh = workspaceStore.resetDemo();
    res.json({ ...fresh, geminiConfigured: isGeminiConfigured() });
  });

  // Vite Middleware (dev) or Static Dist (prod)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distPath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`LIFEADMIN AI server listening on http://localhost:${port}`);
  });
}

startServer();
