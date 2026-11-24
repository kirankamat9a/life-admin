import { GoogleGenAI, Type } from '@google/genai';

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
}): Promise<AssistantGeminiResult> {
  const ai = createGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `User Request: ${params.userMessage}\n\nVerified MCP Evidence & Workspace Context:\n${params.evidenceSummary}`,
    config: {
      systemInstruction:
        'You are LIFEADMIN AI, an enterprise administrative problem-solving assistant operating in Demo Mode. ' +
        'Summarize evidence-backed findings concisely. Never expose raw internal chain-of-thought; provide only a 1-2 sentence reasoningSummary and a clear, actionable responseText citing only facts present in the MCP Evidence. ' +
        'Never claim external emails or calendar bookings have already been sent if they require human approval.',
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
  });

  const raw = (response.text ?? '{}').trim();
  const parsed = JSON.parse(raw) as AssistantGeminiResult;
  return parsed;
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
}): Promise<ExtractedDocGeminiResult> {
  const ai = createGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
  }

  const parts = [
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

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts },
    config: {
      systemInstruction:
        'You are a document intelligence OCR and extraction engine. Extract merchant, product, purchaseDate (YYYY-MM-DD if known), invoiceNumber, totalAmount, warrantyPeriod, warrantyExpiration, a concise summaryText, and 1-3 direct quote citations.',
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
  });

  const raw = (response.text ?? '{}').trim();
  return JSON.parse(raw) as ExtractedDocGeminiResult;
}
