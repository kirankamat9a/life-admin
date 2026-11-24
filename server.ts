import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  applyDeterministicToneRewrite,
  buildApprovalPlainSummary,
  buildDeterministicSubscriptionInsight,
  deriveApprovalRiskLevel,
  detectCalendarConflicts,
  detectDocumentContradictions,
  evaluateWarrantyEligibility,
  findAvailableSlots,
  formatINR,
  validateDocumentUploadMeta,
} from './src/shared/domainLogic';
import type {
  ApprovalRequest,
  DocumentExtractPreview,
  DocumentRecord,
  RewriteTone,
} from './src/shared/types';
import { runMultiAgentWorkflow } from './server/agents/orchestrator';
import {
  extractDocumentWithGemini,
  generateSubscriptionInsightsWithGemini,
  humanizeGeminiError,
  isGeminiConfigured,
  rewriteApprovalWithGemini,
} from './server/gemini';
import type { JsonRpcRequest } from './server/mcp/protocol';
import { mcpRouter } from './server/mcp/servers';
import { workspaceStore } from './server/store';

const MAX_PROMPT_LENGTH = 4000;
const MAX_ATTACHMENTS = 5;

function parseDocumentExtractionInput(body: Record<string, unknown>) {
  const fileName = String(body?.fileName ?? '').trim();
  const mimeType = String(body?.mimeType ?? 'application/octet-stream').trim();
  const base64Data = String(body?.base64Data ?? '');
  const rawType = String(body?.type ?? 'upload');
  const allowedTypes: DocumentRecord['type'][] = ['invoice', 'warranty', 'receipt', 'policy', 'upload'];
  const docType: DocumentRecord['type'] = allowedTypes.includes(rawType as DocumentRecord['type'])
    ? (rawType as DocumentRecord['type'])
    : 'upload';

  const decodedBytes = base64Data ? Buffer.from(base64Data, 'base64').byteLength : 0;
  const check = validateDocumentUploadMeta({
    fileName,
    mimeType,
    sizeBytes: decodedBytes,
  });

  return { fileName, mimeType, base64Data, docType, check };
}

async function runDocumentExtraction(params: {
  fileName: string;
  mimeType: string;
  base64Data: string;
  docType: DocumentRecord['type'];
  referenceDate: string;
}): Promise<DocumentExtractPreview> {
  const { fileName, mimeType, base64Data, docType, referenceDate } = params;
  let extractedFields: DocumentRecord['extractedFields'] = {};
  let rawText = '';
  let citations: string[] = [];
  let geminiWarning: string | undefined;
  let fallbackUsed = false;

  const isTextLike =
    mimeType.startsWith('text/') ||
    fileName.toLowerCase().endsWith('.txt') ||
    fileName.toLowerCase().endsWith('.csv');

  if (isTextLike) {
    rawText = Buffer.from(base64Data, 'base64').toString('utf8').slice(0, 4000);
  }

  if (
    isGeminiConfigured() &&
    (mimeType.startsWith('image/') || mimeType === 'application/pdf' || isTextLike)
  ) {
    try {
      const parsed = await extractDocumentWithGemini({
        fileName,
        mimeType: isTextLike ? 'text/plain' : mimeType,
        base64Data,
      });
      extractedFields = {
        merchant: parsed.merchant || undefined,
        product: parsed.product || undefined,
        purchaseDate: parsed.purchaseDate || undefined,
        invoiceNumber: parsed.invoiceNumber || undefined,
        totalAmount: parsed.totalAmount || undefined,
        warrantyPeriod: parsed.warrantyPeriod || undefined,
        warrantyExpiration: parsed.warrantyExpiration || undefined,
      };
      // Remove empty undefined keys cleanly
      for (const k of Object.keys(extractedFields) as Array<keyof typeof extractedFields>) {
        if (!extractedFields[k]) delete extractedFields[k];
      }
      if (parsed.summaryText) {
        rawText = rawText ? `${rawText}\n\nAI Summary: ${parsed.summaryText}` : parsed.summaryText;
      }
      citations = parsed.citations ?? [];
    } catch (err) {
      geminiWarning = humanizeGeminiError(err);
      fallbackUsed = true;
    }
  } else {
    fallbackUsed = true;
  }

  if (Object.keys(extractedFields).length === 0) {
    fallbackUsed = true;
    const invMatch =
      rawText.match(/INV[-#:\s]+([A-Z0-9-]+)/i) ??
      rawText.match(/(?:CRO|RD|TC|INV)[-#:\s]*([A-Z0-9-]+)/i);
    const totalMatch = rawText.match(
      /(?:total|amount|grand total|paid)[:\s]*(?:₹|Rs\.?|INR|\$)?\s*([\d,]+\.?\d*)/i
    );
    const merchantMatch = rawText.match(/merchant[:\s]*(.+)/i);
    const productMatch = rawText.match(/product[:\s]*(.+)/i);
    const warrantyMatch = rawText.match(/warranty[:\s]*(.+)/i);
    const parsedTotalNum = totalMatch?.[1] ? Number(totalMatch[1].replace(/,/g, '')) : NaN;
    extractedFields = {
      merchant: merchantMatch?.[1]?.trim() || 'Uploaded Vendor Document',
      product:
        productMatch?.[1]?.trim() ||
        fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
      purchaseDate: referenceDate,
      invoiceNumber: invMatch?.[1]?.trim() || `UP-${Date.now().toString().slice(-5)}`,
      totalAmount: Number.isFinite(parsedTotalNum)
        ? formatINR(parsedTotalNum)
        : totalMatch?.[1]
          ? `₹${totalMatch[1]}`
          : 'Pending verification',
      warrantyPeriod: warrantyMatch?.[1]?.trim() || '12 Months (Estimated)',
    };
    if (!rawText) {
      rawText = `Uploaded ${fileName} (${mimeType}). Ready for document indexing.`;
    }
    citations =
      citations.length > 0
        ? citations
        : [`Source file: ${fileName} uploaded on ${referenceDate}`];
  }

  return {
    fileName,
    mimeType,
    type: docType,
    previewUrl: mimeType.startsWith('image/') ? `data:${mimeType};base64,${base64Data}` : undefined,
    extractedFields,
    rawText,
    citations,
    geminiWarning,
    fallbackUsed,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '16mb' }));

  // 0. Health Endpoint (Part B.5)
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: isGeminiConfigured(),
      uptime: Math.round(process.uptime()),
    });
  });

  // 1. Full Workspace Snapshot + AI Provider Status
  app.get('/api/workspace', (_req, res, next) => {
    try {
      res.json({
        ...workspaceStore.getState(),
        geminiConfigured: isGeminiConfigured(),
      });
    } catch (err) {
      next(err);
    }
  });

  // 2. Model Context Protocol (MCP) JSON-RPC 2.0 Endpoint
  app.post('/api/mcp/rpc', (req, res, next) => {
    try {
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
    } catch (err) {
      next(err);
    }
  });

  // 3. AI Assistant Multi-Agent Endpoint (Standard JSON)
  app.post('/api/assistant/chat', async (req, res, next) => {
    try {
      const prompt = String(req.body?.prompt ?? '').trim();
      const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : undefined;
      if (!prompt) {
        res.status(400).json({ error: 'Please enter a message before sending.' });
        return;
      }
      if (prompt.length > MAX_PROMPT_LENGTH) {
        res.status(400).json({ error: `Prompt is too long (max ${MAX_PROMPT_LENGTH} characters).` });
        return;
      }
      if (attachments && attachments.length > MAX_ATTACHMENTS) {
        res.status(400).json({ error: `You can attach at most ${MAX_ATTACHMENTS} files at once.` });
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
      next(err);
    }
  });

  // 3b. AI Assistant Streaming Endpoint (SSE with Abort Support)
  app.post('/api/assistant/stream', async (req, res) => {
    const prompt = String(req.body?.prompt ?? '').trim();
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : undefined;

    if (!prompt) {
      res.status(400).json({ error: 'Please enter a message before sending.' });
      return;
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      res.status(400).json({ error: `Prompt is too long (max ${MAX_PROMPT_LENGTH} characters).` });
      return;
    }
    if (attachments && attachments.length > MAX_ATTACHMENTS) {
      res.status(400).json({ error: `You can attach at most ${MAX_ATTACHMENTS} files at once.` });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    const sendEvent = (eventName: string, payload: unknown) => {
      if (res.writableEnded || abortController.signal.aborted) return;
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const state = workspaceStore.getState();
      const result = await runMultiAgentWorkflow(state, prompt, attachments, {
        signal: abortController.signal,
        onStep: (label) => sendEvent('step', { label }),
        onTool: (tool) => sendEvent('tool', tool),
        onToken: (token) => sendEvent('token', { token }),
      });

      sendEvent('done', {
        ...result,
        state: {
          ...state,
          geminiConfigured: isGeminiConfigured(),
        },
      });
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Assistant streaming failed.';
      sendEvent('error', { error: message });
      if (!res.writableEnded) res.end();
    }
  });

  // 4. Demo Scenario Quick Runners (Scenarios 1, 2, 3)
  app.post('/api/scenarios/run', async (req, res, next) => {
    try {
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
    } catch (err) {
      next(err);
    }
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

    const execOutcome = mcpRouter.callTool(state, 'action-mcp', approval.mcpTool, {
      approvalId: approval.id,
      ...approval.mcpArgs,
    });

    if (execOutcome.ok) {
      approval.status = 'executed';
      approval.simulatedExecutionNote =
        '[DEMO SANDBOX] Simulated execution completed after explicit human approval. No real external API/email was sent.';
      state.tasksCompletedCount += 1;

      if (approval.actionType === 'send_email' && approval.relatedEntityId) {
        const warrantyCase = state.cases.find((c) => c.id === approval.relatedEntityId);
        if (warrantyCase) {
          warrantyCase.status = 'Awaiting Response';
          warrantyCase.timeline.push({
            id: `tl-${Date.now()}-${uidSuffix}`,
            timestamp: new Date().toISOString(),
            title: 'Approved Complaint Sent (Demo Sandbox)',
            description: `Simulated claim email dispatched to ${approval.recipient} via Action Tool.`,
            actor: 'Action Tool (Human Approved)',
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
          sub.aiInsight = buildDeterministicSubscriptionInsight(sub);
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
            location: args.location ?? 'Google Meet (IST)',
            attendees: [state.settings.profile.email],
            status: 'confirmed',
            source: 'approved_action',
            notes: 'Created after human approval via Action Tool (Demo Sandbox).',
          });
        }
      }

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

  // 5. Human Approval Centre Decision Endpoints (Single, Bulk, Undo Reject, Rewrite)
  app.post('/api/approvals/bulk-decide', (req, res, next) => {
    try {
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
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/approvals/:id/decide', (req, res, next) => {
    try {
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

      const editedSubject = req.body?.subject !== undefined ? String(req.body.subject).slice(0, 300) : undefined;
      const editedMessage =
        req.body?.messageContent !== undefined ? String(req.body.messageContent).slice(0, 6000) : undefined;
      if (decision === 'edit' && editedMessage !== undefined && !editedMessage.trim()) {
        res.status(400).json({ error: 'Message content cannot be empty.' });
        return;
      }

      const outcome = applyApprovalDecision(state, approval, decision, {
        subject: editedSubject,
        messageContent: editedMessage,
      });

      res.json({
        ...outcome,
        state: { ...state, geminiConfigured: isGeminiConfigured() },
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/approvals/:id/undo', (req, res, next) => {
    try {
      const state = workspaceStore.getState();
      const approval = state.approvals.find((a) => a.id === req.params.id);
      if (!approval) {
        res.status(404).json({ error: 'Approval request not found.' });
        return;
      }
      if (approval.status !== 'rejected') {
        res.status(409).json({
          error: `Only rejected approvals can be restored to pending (currently ${approval.status}).`,
        });
        return;
      }

      approval.status = 'pending';
      approval.decidedAt = undefined;
      state.activityTimeline.unshift({
        id: `act-${Date.now()}`,
        timestamp: new Date().toISOString(),
        category: 'approval',
        title: `Restored Rejected Approval: ${approval.title}`,
        description: 'Returned request to pending queue at user request.',
        simulated: true,
      });

      res.json({
        approval,
        state: { ...state, geminiConfigured: isGeminiConfigured() },
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/approvals/:id/rewrite', async (req, res, next) => {
    try {
      const state = workspaceStore.getState();
      const approval = state.approvals.find((a) => a.id === req.params.id);
      if (!approval) {
        res.status(404).json({ error: 'Approval request not found.' });
        return;
      }
      if (approval.status !== 'pending') {
        res.status(409).json({ error: `Cannot rewrite an approval that is already ${approval.status}.` });
        return;
      }

      const tone = String(req.body?.tone ?? '') as RewriteTone;
      if (tone !== 'polite' && tone !== 'firm' && tone !== 'short') {
        res.status(400).json({ error: 'Invalid tone. Choose polite, firm, or short.' });
        return;
      }

      let subject = approval.subject;
      let messageContent = approval.messageContent;
      let fallbackUsed = false;
      let geminiWarning: string | undefined;

      if (isGeminiConfigured()) {
        try {
          const rewritten = await rewriteApprovalWithGemini({
            title: approval.title,
            recipient: approval.recipient,
            subject: approval.subject,
            messageContent: approval.messageContent,
            tone,
          });
          subject = rewritten.subject;
          messageContent = rewritten.messageContent;
        } catch (err) {
          geminiWarning = humanizeGeminiError(err);
          fallbackUsed = true;
          const fb = applyDeterministicToneRewrite({
            subject: approval.subject,
            messageContent: approval.messageContent,
            tone,
          });
          subject = fb.subject;
          messageContent = fb.messageContent;
        }
      } else {
        fallbackUsed = true;
        const fb = applyDeterministicToneRewrite({
          subject: approval.subject,
          messageContent: approval.messageContent,
          tone,
        });
        subject = fb.subject;
        messageContent = fb.messageContent;
      }

      res.json({
        subject,
        messageContent,
        tone,
        fallbackUsed,
        geminiWarning,
      });
    } catch (err) {
      next(err);
    }
  });

  // 6. Refund & Warranty Actions
  app.post('/api/cases/:id/investigate', (req, res, next) => {
    try {
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
      state.activityTimeline.unshift({
        id: `act-${Date.now()}`,
        timestamp: new Date().toISOString(),
        category: 'refund',
        title: `Re-Investigated Case: ${c.product}`,
        description: evalRes.summary,
        simulated: true,
      });

      res.json({ case: c, state: { ...state, geminiConfigured: isGeminiConfigured() } });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/cases/:id/prepare-complaint', (req, res, next) => {
    try {
      const state = workspaceStore.getState();
      const c = state.cases.find((item) => item.id === req.params.id);
      if (!c) {
        res.status(404).json({ error: 'Case not found.' });
        return;
      }

      const subject = `Warranty Claim — Tax Invoice #${c.invoiceNumber} (${c.product})`;
      const draft =
        c.complaintDraft ||
        `Dear ${c.seller} Support,\n\nI am requesting warranty coverage for ${c.product} purchased on ${c.purchaseDate} (Invoice #${c.invoiceNumber}, ${formatINR(c.purchaseAmount)}).\n\nIssue: ${c.issueSummary}\nWarranty Expiration: ${c.warrantyExpiration}.\n\nPlease advise next steps.\n\nSincerely,\n${state.settings.profile.name}`;

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
          `Dispatches simulated warranty claim for ${formatINR(c.purchaseAmount)} purchase.`,
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
      approval.riskLevel = deriveApprovalRiskLevel(approval);
      approval.plainSummary = buildApprovalPlainSummary(approval);

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
    } catch (err) {
      next(err);
    }
  });

  // 7. Subscription Cancellation Preparation & AI Insights
  app.post('/api/subscriptions/:id/prepare-cancellation', (req, res, next) => {
    try {
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
        `Please cancel my "${sub.name}" (${sub.billingFrequency}, ${formatINR(sub.monthlyCost)}/mo) subscription prior to the upcoming ${sub.nextBillingDate} UPI AutoPay/card renewal.\n\n` +
        `Account Owner: ${state.settings.profile.email}\n` +
        `Notes: ${sub.usageNote}\n\nThank you,\n${state.settings.profile.name}`;

      mcpRouter.callTool(state, 'email-mcp', 'create_email_draft', {
        to: sub.providerEmail,
        subject,
        body,
      });

      const approval: ApprovalRequest = {
        id: `apr-sub-${Date.now()}`,
        title: `Cancel ${sub.name} (${formatINR(sub.monthlyCost)}/mo)`,
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
          `Avoids ${formatINR(sub.monthlyCost)}/mo (${formatINR(sub.annualCost)}/yr) recurring charge.`,
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
      approval.riskLevel = deriveApprovalRiskLevel(approval);
      approval.plainSummary = buildApprovalPlainSummary(approval);

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
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/subscriptions/insights', async (_req, res, next) => {
    try {
      const state = workspaceStore.getState();
      let fallbackUsed = false;
      let geminiWarning: string | undefined;

      if (isGeminiConfigured()) {
        try {
          const map = await generateSubscriptionInsightsWithGemini(state.subscriptions);
          for (const sub of state.subscriptions) {
            sub.aiInsight = map[sub.id] ?? buildDeterministicSubscriptionInsight(sub);
          }
        } catch (err) {
          fallbackUsed = true;
          geminiWarning = humanizeGeminiError(err);
          for (const sub of state.subscriptions) {
            sub.aiInsight = buildDeterministicSubscriptionInsight(sub);
          }
        }
      } else {
        fallbackUsed = true;
        for (const sub of state.subscriptions) {
          sub.aiInsight = buildDeterministicSubscriptionInsight(sub);
        }
      }

      res.json({
        fallbackUsed,
        geminiWarning,
        state: { ...state, geminiConfigured: isGeminiConfigured() },
      });
    } catch (err) {
      next(err);
    }
  });

  // 8. Appointment Slot Finder & Approval Staging
  app.post('/api/appointments/find-slots', (req, res, next) => {
    try {
      const state = workspaceStore.getState();
      const targetDate = String(req.body?.targetDate ?? '2026-11-25');
      const durationMinutes = Number(req.body?.durationMinutes ?? 60);
      const preferredPeriod = (req.body?.preferredPeriod ?? 'Afternoon') as
        | 'Morning'
        | 'Afternoon'
        | 'Evening'
        | 'Any';

      if (!['Morning', 'Afternoon', 'Evening', 'Any'].includes(preferredPeriod)) {
        res.status(400).json({ error: 'Invalid preferredPeriod. Expected Morning, Afternoon, Evening, or Any.' });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
        res.status(400).json({ error: 'Invalid targetDate. Expected YYYY-MM-DD format.' });
        return;
      }
      const [yr, mo, dy] = targetDate.split('-').map(Number);
      const parsedTargetDate = new Date(Date.UTC(yr, mo - 1, dy));
      if (
        parsedTargetDate.getUTCFullYear() !== yr ||
        parsedTargetDate.getUTCMonth() !== mo - 1 ||
        parsedTargetDate.getUTCDate() !== dy
      ) {
        res.status(400).json({ error: 'Invalid targetDate calendar date.' });
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

      state.activityTimeline.unshift({
        id: `act-${Date.now()}`,
        timestamp: new Date().toISOString(),
        category: 'appointment',
        title: `Checked Calendar Slots (${targetDate})`,
        description: `Found ${slots.length} conflict-free ${preferredPeriod.toLowerCase()} slot(s).`,
        simulated: true,
      });

      res.json({
        targetDate,
        slots,
        state: { ...state, geminiConfigured: isGeminiConfigured() },
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/appointments/propose', (req, res, next) => {
    try {
      const state = workspaceStore.getState();
      const title = String(req.body?.title ?? '').trim();
      const start = String(req.body?.start ?? '');
      const end = String(req.body?.end ?? '');
      const location =
        String(req.body?.location ?? 'Google Meet (IST)').trim() || 'Google Meet (IST)';

      if (!title || !start || !end) {
        res.status(400).json({ error: 'Title, start, and end times are required.' });
        return;
      }
      if (title.length > 120) {
        res.status(400).json({ error: 'Meeting title cannot exceed 120 characters.' });
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
      approval.riskLevel = deriveApprovalRiskLevel(approval);
      approval.plainSummary = buildApprovalPlainSummary(approval);

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
    } catch (err) {
      next(err);
    }
  });

  // 9. Document Extraction Preview & Saving (Gemini Multimodal + Review Step)
  app.post('/api/documents/extract', async (req, res, next) => {
    try {
      const { fileName, mimeType, base64Data, docType, check } = parseDocumentExtractionInput(
        req.body ?? {}
      );
      if (!check.valid) {
        res.status(400).json({ error: check.error ?? 'Invalid file upload.' });
        return;
      }

      const state = workspaceStore.getState();
      const preview = await runDocumentExtraction({
        fileName,
        mimeType,
        base64Data,
        docType,
        referenceDate: state.referenceDate,
      });

      res.json(preview);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/documents/upload', async (req, res, next) => {
    try {
      const { fileName, mimeType, base64Data, docType, check } = parseDocumentExtractionInput(
        req.body ?? {}
      );
      if (!check.valid) {
        res.status(400).json({ error: check.error ?? 'Invalid file upload.' });
        return;
      }

      const state = workspaceStore.getState();
      const providedFields =
        req.body?.extractedFields && typeof req.body.extractedFields === 'object'
          ? (req.body.extractedFields as DocumentRecord['extractedFields'])
          : undefined;
      const providedRawText =
        typeof req.body?.rawText === 'string' && req.body.rawText.trim()
          ? req.body.rawText.trim().slice(0, 8000)
          : undefined;
      const providedCitations = Array.isArray(req.body?.citations)
        ? (req.body.citations as string[]).filter((c) => typeof c === 'string').slice(0, 10)
        : undefined;

      let extractedFields: DocumentRecord['extractedFields'];
      let rawText: string;
      let citations: string[];
      let previewUrl: string | undefined;
      let geminiWarning: string | undefined;
      let fallbackUsed = false;

      if (providedFields) {
        extractedFields = {
          merchant: providedFields.merchant ? String(providedFields.merchant).trim() : undefined,
          product: providedFields.product ? String(providedFields.product).trim() : undefined,
          purchaseDate: providedFields.purchaseDate ? String(providedFields.purchaseDate).trim() : undefined,
          invoiceNumber: providedFields.invoiceNumber ? String(providedFields.invoiceNumber).trim() : undefined,
          totalAmount: providedFields.totalAmount ? String(providedFields.totalAmount).trim() : undefined,
          warrantyPeriod: providedFields.warrantyPeriod ? String(providedFields.warrantyPeriod).trim() : undefined,
          warrantyExpiration: providedFields.warrantyExpiration
            ? String(providedFields.warrantyExpiration).trim()
            : undefined,
        };
        rawText =
          providedRawText ??
          (mimeType.startsWith('text/') || fileName.endsWith('.txt') || fileName.endsWith('.csv')
            ? Buffer.from(base64Data, 'base64').toString('utf8').slice(0, 4000)
            : `Uploaded ${fileName} (${mimeType}).`);
        citations =
          providedCitations && providedCitations.length > 0
            ? providedCitations
            : [`Reviewed & saved: ${fileName} on ${state.referenceDate}`];
        previewUrl = mimeType.startsWith('image/') ? `data:${mimeType};base64,${base64Data}` : undefined;
      } else {
        const extracted = await runDocumentExtraction({
          fileName,
          mimeType,
          base64Data,
          docType,
          referenceDate: state.referenceDate,
        });
        extractedFields = extracted.extractedFields;
        rawText = extracted.rawText;
        citations = extracted.citations;
        previewUrl = extracted.previewUrl;
        geminiWarning = extracted.geminiWarning;
        fallbackUsed = extracted.fallbackUsed;
      }

      const newDoc: DocumentRecord = {
        id: `doc-up-${Date.now()}`,
        title: fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
        type: docType,
        uploadedAt: new Date().toISOString(),
        fileName,
        mimeType,
        previewUrl,
        ocrStatus: 'Completed',
        extractedFields,
        contradictions: [],
        citations,
        rawText,
      };

      state.documents.unshift(newDoc);

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
        title: `Saved Document: ${newDoc.fileName}`,
        description: `Indexed structured fields${!fallbackUsed && isGeminiConfigured() ? ' with AI extraction' : ' (local extractor)'}.`,
        simulated: true,
      });

      res.json({
        document: newDoc,
        geminiWarning,
        fallbackUsed,
        state: { ...state, geminiConfigured: isGeminiConfigured() },
      });
    } catch (err) {
      next(err);
    }
  });

  // 10. Settings, Notifications, Demo Reset
  app.patch('/api/settings', (req, res, next) => {
    try {
      const state = workspaceStore.getState();
      if (req.body?.profile) {
        const name = String(req.body.profile.name ?? state.settings.profile.name).trim();
        const email = String(req.body.profile.email ?? state.settings.profile.email).trim();
        const timezone = String(req.body.profile.timezone ?? state.settings.profile.timezone).trim();
        if (!name || !email || !email.includes('@')) {
          res.status(400).json({ error: 'Valid full name and email address are required.' });
          return;
        }
        state.settings.profile = { name, email, timezone: timezone || state.settings.profile.timezone };
      }
      if (req.body?.notifications && typeof req.body.notifications === 'object') {
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
      state.activityTimeline.unshift({
        id: `act-${Date.now()}`,
        timestamp: new Date().toISOString(),
        category: 'agent',
        title: 'Updated Workspace Settings',
        description: 'Saved profile or notification preferences (human-approval guardrails remain locked ON).',
        simulated: true,
      });
      res.json({ settings: state.settings, state: { ...state, geminiConfigured: isGeminiConfigured() } });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/notifications/read-all', (_req, res, next) => {
    try {
      const state = workspaceStore.getState();
      for (const n of state.notifications) {
        n.read = true;
      }
      state.activityTimeline.unshift({
        id: `act-${Date.now()}`,
        timestamp: new Date().toISOString(),
        category: 'agent',
        title: 'Marked Notifications Read',
        description: `Cleared ${state.notifications.length} workspace notification(s).`,
        simulated: true,
      });
      res.json({ state: { ...state, geminiConfigured: isGeminiConfigured() } });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/demo/reset', (_req, res, next) => {
    try {
      const fresh = workspaceStore.resetDemo();
      res.json({ ...fresh, geminiConfigured: isGeminiConfigured() });
    } catch (err) {
      next(err);
    }
  });

  // Global API error middleware (Part B.6)
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message =
      err instanceof Error ? err.message : 'An unexpected server error occurred. Please try again.';
    const status =
      typeof (err as { status?: unknown })?.status === 'number'
        ? ((err as { status: number }).status)
        : 500;
    res.status(status).json({ error: message });
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
