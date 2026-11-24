import {
  type Content,
  type FunctionDeclaration,
  GoogleGenAI,
  Type,
} from '@google/genai';
import type {
  GroundingSource,
  McpServerState,
  RewriteTone,
  Subscription,
  WorkspaceState,
} from '../src/shared/types';
import { mcpRouter } from './mcp/servers';

const GEMINI_MODEL = 'gemini-4-hydrogen';
const GEMINI_TIMEOUT_MS = 20_000;

export const LIFEADMIN_SYSTEM_INSTRUCTION =
  'You are LIFEADMIN AI (India Edition), a helpful everyday administrative assistant operating in Demo Mode. ' +
  'Strict rules: ' +
  '1) Always cite the exact document filename, GST invoice number, or email subject/ID for every factual claim. ' +
  '2) Use Indian Rupee (₹ / INR with Indian lakh/crore grouping such as ₹1,24,990.00), Indian Standard Time (IST), GST invoice context, UPI AutoPay / RBI e-mandate terminology, and Indian Consumer Protection Act, 2019 / National Consumer Helpline (NCH 1915) context when relevant. ' +
  '3) Never claim an external email was sent, a subscription was cancelled, or a calendar appointment was booked unless an approval record is explicitly marked executed. ' +
  '4) If information is missing or unknown in the workspace records, state that explicitly rather than guessing. ' +
  '5) Never reveal or repeat API keys, tokens, or secrets. ' +
  '6) Never expose raw internal chain-of-thought; keep explanations clear, concise, and user-friendly.';

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function isGeminiConfigured(): boolean {
  return createGeminiClient() !== null;
}

export function humanizeGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const lower = raw.toLowerCase();
  if (lower.includes('not_configured') || lower.includes('api_key')) {
    return 'AI key is not configured';
  }
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return 'AI service timed out';
  }
  if (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded')
  ) {
    return 'AI service is temporarily busy';
  }
  if (lower.includes('429') || lower.includes('rate') || lower.includes('quota')) {
    return 'AI service rate limit reached';
  }
  if (lower.includes('cancelled')) {
    return 'Request cancelled';
  }
  return 'AI service is temporarily unavailable';
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  signal?: AbortSignal
): Promise<T> {
  if (signal?.aborted) {
    throw new Error('Request cancelled by user.');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs);
      if (signal) {
        const onAbort = () => {
          if (timer) clearTimeout(timer);
          reject(new Error('Request cancelled by user.'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export interface AssistantGeminiResult {
  intentCategory: 'refund_warranty' | 'subscription_audit' | 'appointment_scheduling' | 'general_admin';
  reasoningSummary: string;
  responseText: string;
  targetDate?: string;
  preferredPeriod?: 'Morning' | 'Afternoon' | 'Evening';
}

export async function synthesizeWithGemini(params: {
  userMessage: string;
  evidenceSummary: string;
  signal?: AbortSignal;
}): Promise<AssistantGeminiResult> {
  const ai = createGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
  }

  const response = await withTimeout(
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `User Request: ${params.userMessage}\n\nVerified Tool Evidence & Workspace Context:\n${params.evidenceSummary}`,
      config: {
        systemInstruction: LIFEADMIN_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intentCategory: {
              type: Type.STRING,
              description: 'One of: refund_warranty, subscription_audit, appointment_scheduling, general_admin',
            },
            reasoningSummary: {
              type: Type.STRING,
              description: 'Concise 1-2 sentence evidence-backed reasoning summary without private chain-of-thought.',
            },
            responseText: {
              type: Type.STRING,
              description: 'Clear, helpful response citing exact invoice numbers, dates, prices, or available time slots.',
            },
            targetDate: {
              type: Type.STRING,
              description: 'Optional YYYY-MM-DD date if scheduling was requested.',
            },
            preferredPeriod: {
              type: Type.STRING,
              description: 'Optional Morning, Afternoon, or Evening.',
            },
          },
          required: ['intentCategory', 'reasoningSummary', 'responseText'],
        },
      },
    }),
    GEMINI_TIMEOUT_MS,
    'Gemini synthesis',
    params.signal
  );

  const raw = (response.text ?? '{}').trim();
  const parsed = JSON.parse(raw) as AssistantGeminiResult;
  if (!parsed || typeof parsed.responseText !== 'string') {
    throw new Error('Invalid JSON response from Gemini.');
  }
  return parsed;
}

export async function streamGeminiSynthesis(params: {
  userMessage: string;
  evidenceSummary: string;
  onToken: (chunkText: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const ai = createGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
  }

  const stream = await withTimeout(
    ai.models.generateContentStream({
      model: GEMINI_MODEL,
      contents:
        `User Request: ${params.userMessage}\n\n` +
        `Verified Tool Evidence & Workspace Context:\n${params.evidenceSummary}\n\n` +
        'Write a clear, helpful, markdown-formatted response citing exact document filenames, invoice numbers, dates, or Rupee (₹) amounts from the evidence above. Do not fabricate facts.',
      config: {
        systemInstruction: LIFEADMIN_SYSTEM_INSTRUCTION,
      },
    }),
    GEMINI_TIMEOUT_MS,
    'Gemini stream',
    params.signal
  );

  let fullText = '';
  for await (const chunk of stream) {
    if (params.signal?.aborted) {
      throw new Error('Request cancelled by user.');
    }
    const piece = chunk.text ?? '';
    if (piece) {
      fullText += piece;
      params.onToken(piece);
    }
  }
  return fullText.trim();
}

const MCP_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'search_emails',
    description: 'Search the user inbox for emails matching a keyword, merchant, or topic.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Search keywords, or empty string for all emails.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_email',
    description: 'Read full email details by emailId (e.g., email-001).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        emailId: { type: Type.STRING, description: 'Email ID.' },
      },
      required: ['emailId'],
    },
  },
  {
    name: 'search_documents',
    description: 'Search uploaded invoices, warranties, and receipts in the Document Vault.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Product, merchant, or invoice keyword.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'extract_invoice_details',
    description: 'Get structured invoice metadata for a document ID.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        documentId: { type: Type.STRING, description: 'Document ID.' },
      },
      required: ['documentId'],
    },
  },
  {
    name: 'analyze_warranty_document',
    description: 'Evaluate warranty terms and eligibility for a warranty document ID.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        documentId: { type: Type.STRING, description: 'Warranty document ID.' },
      },
      required: ['documentId'],
    },
  },
  {
    name: 'find_available_slots',
    description: 'Find conflict-free calendar slots on a YYYY-MM-DD date.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        targetDate: { type: Type.STRING, description: 'Date in YYYY-MM-DD format.' },
        durationMinutes: { type: Type.NUMBER, description: 'Meeting length in minutes (e.g., 60).' },
        preferredPeriod: { type: Type.STRING, description: 'Morning, Afternoon, Evening, or Any.' },
      },
      required: ['targetDate', 'durationMinutes'],
    },
  },
  {
    name: 'check_availability',
    description: 'Check if a specific ISO start/end time window conflicts with calendar events.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        start: { type: Type.STRING, description: 'ISO start datetime (YYYY-MM-DDTHH:mm:ss).' },
        end: { type: Type.STRING, description: 'ISO end datetime (YYYY-MM-DDTHH:mm:ss).' },
      },
      required: ['start', 'end'],
    },
  },
  {
    name: 'generate_case_report',
    description: 'Compile a structured evidence report for a warranty case ID.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        caseId: { type: Type.STRING, description: 'Warranty case ID.' },
      },
      required: ['caseId'],
    },
  },
];

const TOOL_TO_SERVER: Record<string, McpServerState['id']> = {
  search_emails: 'email-mcp',
  read_email: 'email-mcp',
  create_email_draft: 'email-mcp',
  search_documents: 'document-mcp',
  extract_invoice_details: 'document-mcp',
  analyze_warranty_document: 'document-mcp',
  find_available_slots: 'calendar-mcp',
  check_availability: 'calendar-mcp',
  create_calendar_event: 'calendar-mcp',
  generate_case_report: 'action-mcp',
};

export interface GeminiToolLoopResult {
  answerText: string;
  toolsExecuted: Array<{ server: string; tool: string; summary: string }>;
}

export async function runGeminiToolLoop(params: {
  state: WorkspaceState;
  userPrompt: string;
  onStep?: (label: string) => void;
  onTool?: (tool: { server: string; tool: string; summary: string }) => void;
  signal?: AbortSignal;
}): Promise<GeminiToolLoopResult> {
  const ai = createGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
  }

  const toolsExecuted: Array<{ server: string; tool: string; summary: string }> = [];
  const contents: Content[] = [
    {
      role: 'user',
      parts: [
        {
          text:
            `Today's reference date is ${params.state.referenceDate}. ` +
            `User profile: ${params.state.settings.profile.name} (${params.state.settings.profile.email}). ` +
            `Known warranty cases: ${params.state.cases.map((c) => `${c.id}: ${c.product} (${c.status})`).join('; ')}. ` +
            `Known subscriptions: ${params.state.subscriptions.map((s) => `${s.name} (₹${s.monthlyCost}/mo, ${s.category})`).join('; ')}.\n\n` +
            `User question: ${params.userPrompt}`,
        },
      ],
    },
  ];

  const MAX_TURNS = 4;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    params.onStep?.(turn === 0 ? 'Investigating workspace tools…' : 'Reviewing tool evidence…');
    const response = await withTimeout(
      ai.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: {
          systemInstruction: LIFEADMIN_SYSTEM_INSTRUCTION,
          tools: [{ functionDeclarations: MCP_FUNCTION_DECLARATIONS }],
        },
      }),
      GEMINI_TIMEOUT_MS,
      'Gemini tool call',
      params.signal
    );

    const candidateContent = response.candidates?.[0]?.content;
    const calls = response.functionCalls;

    if (!calls || calls.length === 0) {
      const text = (response.text ?? '').trim();
      if (!text) {
        throw new Error('Gemini returned an empty response.');
      }
      return { answerText: text, toolsExecuted };
    }

    if (candidateContent) {
      contents.push(candidateContent);
    }

    const responseParts: Array<{
      functionResponse: { id?: string; name: string; response: Record<string, unknown> };
    }> = [];

    for (const call of calls) {
      const fnName = call.name ?? '';
      const serverId = TOOL_TO_SERVER[fnName];
      if (!serverId) {
        responseParts.push({
          functionResponse: {
            id: call.id,
            name: fnName,
            response: { error: `Tool "${fnName}" is not permitted for automatic execution.` },
          },
        });
        continue;
      }

      const prettyLabel =
        serverId === 'email-mcp'
          ? 'Searching emails…'
          : serverId === 'document-mcp'
            ? 'Checking documents & warranties…'
            : serverId === 'calendar-mcp'
              ? 'Checking calendar availability…'
              : 'Generating report…';
      params.onStep?.(prettyLabel);

      const outcome = mcpRouter.callTool(
        params.state,
        serverId,
        fnName,
        (call.args ?? {}) as Record<string, unknown>
      );

      const serverMeta = params.state.mcpServers.find((s) => s.id === serverId);
      const execRecord = {
        server: serverMeta?.name ?? serverId,
        tool: fnName,
        summary: outcome.summary,
      };
      toolsExecuted.push(execRecord);
      params.onTool?.(execRecord);

      responseParts.push({
        functionResponse: {
          id: call.id,
          name: fnName,
          response: { ok: outcome.ok, summary: outcome.summary, data: outcome.data },
        },
      });
    }

    contents.push({
      role: 'user',
      parts: responseParts,
    });
  }

  throw new Error('Tool execution exceeded maximum turn depth.');
}

export async function queryWithSearchGrounding(params: {
  userPrompt: string;
  signal?: AbortSignal;
}): Promise<{ text: string; sources: GroundingSource[] }> {
  const ai = createGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
  }

  const response = await withTimeout(
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: params.userPrompt,
      config: {
        systemInstruction:
          LIFEADMIN_SYSTEM_INSTRUCTION +
          ' Provide factual Indian consumer-rights, warranty, RBI UPI e-mandate, or return-policy guidance (referencing Consumer Protection Act, 2019, National Consumer Helpline 1915, or e-Daakhil where applicable) grounded in authoritative web sources.',
        tools: [{ googleSearch: {} }],
      },
    }),
    GEMINI_TIMEOUT_MS,
    'Google Search grounding',
    params.signal
  );

  const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources: GroundingSource[] = [];
  const seen = new Set<string>();
  for (const chunk of rawChunks) {
    const uri = chunk.web?.uri;
    const title = chunk.web?.title ?? uri;
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      sources.push({ title: title ?? 'Source', uri });
    }
  }

  return {
    text: (response.text ?? '').trim(),
    sources,
  };
}

export interface ExtractedDocGeminiResult {
  merchant?: string;
  product?: string;
  purchaseDate?: string;
  invoiceNumber?: string;
  totalAmount?: string;
  warrantyPeriod?: string;
  warrantyExpiration?: string;
  summaryText: string;
  citations: string[];
}

export async function extractDocumentWithGemini(params: {
  fileName: string;
  mimeType: string;
  base64Data: string;
  signal?: AbortSignal;
}): Promise<ExtractedDocGeminiResult> {
  const ai = createGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
  }

  const isTextLike =
    params.mimeType.startsWith('text/') ||
    params.fileName.toLowerCase().endsWith('.txt') ||
    params.fileName.toLowerCase().endsWith('.csv');

  const parts = isTextLike
    ? [
        {
          text:
            `Extract structured invoice, receipt, or warranty details from "${params.fileName}".\n\n` +
            Buffer.from(params.base64Data, 'base64').toString('utf8').slice(0, 8000),
        },
      ]
    : [
        {
          inlineData: {
            mimeType: params.mimeType,
            data: params.base64Data,
          },
        },
        {
          text: `Extract structured invoice, receipt, or warranty details from "${params.fileName}". Return only factual fields visible in the document.`,
        },
      ];

  const response = await withTimeout(
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: { parts },
      config: {
        systemInstruction:
          'You are a document intelligence OCR and extraction engine tailored for Indian and international invoices (GST tax invoices, GSTIN, INR/₹/Rs., CGST/SGST). Extract merchant, product, purchaseDate (YYYY-MM-DD if known), invoiceNumber, totalAmount (preserve ₹ symbol if INR), warrantyPeriod, warrantyExpiration, a concise summaryText, and 1-3 direct quote citations. Never invent values that are not present.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            merchant: { type: Type.STRING },
            product: { type: Type.STRING },
            purchaseDate: { type: Type.STRING },
            invoiceNumber: { type: Type.STRING },
            totalAmount: { type: Type.STRING },
            warrantyPeriod: { type: Type.STRING },
            warrantyExpiration: { type: Type.STRING },
            summaryText: { type: Type.STRING },
            citations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['summaryText', 'citations'],
        },
      },
    }),
    GEMINI_TIMEOUT_MS,
    'Gemini document extraction',
    params.signal
  );

  const raw = (response.text ?? '{}').trim();
  const parsed = JSON.parse(raw) as ExtractedDocGeminiResult;
  if (!parsed || typeof parsed.summaryText !== 'string' || !Array.isArray(parsed.citations)) {
    throw new Error('Gemini returned an unexpected document extraction schema.');
  }
  return parsed;
}

export async function rewriteApprovalWithGemini(params: {
  title: string;
  recipient: string;
  subject?: string;
  messageContent: string;
  tone: RewriteTone;
  signal?: AbortSignal;
}): Promise<{ subject?: string; messageContent: string }> {
  const ai = createGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
  }

  const toneDirective =
    params.tone === 'polite'
      ? 'warm, polite, collaborative customer tone while preserving every factual number, date, and invoice reference'
      : params.tone === 'firm'
        ? 'firm, clear, assertive consumer-rights tone requesting timely acknowledgment while preserving every factual number, date, and invoice reference'
        : 'concise, direct, short bullet-or-3-sentence message preserving every key number, date, and invoice reference';

  const response = await withTimeout(
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents:
        `Rewrite the following draft email in a ${toneDirective}.\n\n` +
        `Action: ${params.title}\nRecipient: ${params.recipient}\n` +
        `Current Subject: ${params.subject ?? ''}\n` +
        `Current Body:\n${params.messageContent}`,
      config: {
        systemInstruction:
          LIFEADMIN_SYSTEM_INSTRUCTION +
          ' Do not invent new dates, prices, or promises that are not in the original message.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING },
            messageContent: { type: Type.STRING },
          },
          required: ['messageContent'],
        },
      },
    }),
    GEMINI_TIMEOUT_MS,
    'Gemini draft rewrite',
    params.signal
  );

  const raw = (response.text ?? '{}').trim();
  const parsed = JSON.parse(raw) as { subject?: string; messageContent: string };
  if (!parsed || typeof parsed.messageContent !== 'string' || !parsed.messageContent.trim()) {
    throw new Error('Gemini returned an invalid rewrite payload.');
  }
  return {
    subject: parsed.subject ?? params.subject,
    messageContent: parsed.messageContent.trim(),
  };
}

export async function generateSubscriptionInsightsWithGemini(
  subscriptions: Subscription[],
  signal?: AbortSignal
): Promise<Record<string, string>> {
  const ai = createGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
  }

  const summaryInput = subscriptions
    .map(
      (s) =>
        `ID: ${s.id} | Name: ${s.name} | Provider: ${s.provider} | Cost: ₹${s.monthlyCost}/mo (₹${s.annualCost}/yr) | Category: ${s.category} | Status: ${s.status} | Usage: ${s.usageNote} | Next Billing: ${s.nextBillingDate}`
    )
    .join('\n');

  const response = await withTimeout(
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents:
        `Generate a clear, 1-2 sentence plain-language insight for each subscription explaining why it is flagged (or healthy) and the exact monthly + annual ₹ savings if cancelled.\n\n${summaryInput}`,
      config: {
        systemInstruction: LIFEADMIN_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              insight: { type: Type.STRING },
            },
            required: ['id', 'insight'],
          },
        },
      },
    }),
    GEMINI_TIMEOUT_MS,
    'Gemini subscription insights',
    signal
  );

  const raw = (response.text ?? '[]').trim();
  const list = JSON.parse(raw) as Array<{ id: string; insight: string }>;
  if (!Array.isArray(list)) {
    throw new Error('Invalid insights payload from Gemini.');
  }
  const map: Record<string, string> = {};
  for (const item of list) {
    if (item && typeof item.id === 'string' && typeof item.insight === 'string') {
      map[item.id] = item.insight.trim();
    }
  }
  return map;
}
