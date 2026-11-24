import type {
  ApprovalRequest,
  ApprovalRiskLevel,
  CalendarEvent,
  CaseStatus,
  DocumentContradiction,
  DocumentRecord,
  RewriteTone,
  Subscription,
  TimeSlotSuggestion,
} from './types';

export interface WarrantyEligibilityResult {
  expirationDate: string;
  daysRemaining: number;
  isWithinWarranty: boolean;
  recommendedStatus: CaseStatus;
  summary: string;
}

export function formatINR(amount: number, decimals = 2): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `₹${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safe)}`;
}

export function addMonthsIso(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  return date.toISOString().slice(0, 10);
}

export function diffDaysIso(fromIso: string, toIso: string): number {
  const fromMs = Date.parse(`${fromIso}T00:00:00Z`);
  const toMs = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24));
}

export function evaluateWarrantyEligibility(params: {
  purchaseDate: string;
  warrantyPeriodMonths: number;
  currentDate: string;
  hasInvoice: boolean;
  hasDefectEvidence: boolean;
}): WarrantyEligibilityResult {
  const expirationDate = addMonthsIso(params.purchaseDate, params.warrantyPeriodMonths);
  const daysRemaining = diffDaysIso(params.currentDate, expirationDate);
  const isWithinWarranty = daysRemaining >= 0;

  if (!isWithinWarranty) {
    return {
      expirationDate,
      daysRemaining,
      isWithinWarranty: false,
      recommendedStatus: 'Resolved',
      summary: `Standard ${params.warrantyPeriodMonths}-month warranty expired on ${expirationDate} (${Math.abs(daysRemaining)} days ago).`,
    };
  }

  if (!params.hasInvoice || !params.hasDefectEvidence) {
    const missing: string[] = [];
    if (!params.hasInvoice) missing.push('purchase invoice');
    if (!params.hasDefectEvidence) missing.push('defect proof / photo');
    return {
      expirationDate,
      daysRemaining,
      isWithinWarranty: true,
      recommendedStatus: 'Evidence Required',
      summary: `Within warranty (${daysRemaining} days remaining until ${expirationDate}), but missing ${missing.join(' and ')}.`,
    };
  }

  return {
    expirationDate,
    daysRemaining,
    isWithinWarranty: true,
    recommendedStatus: 'Eligible',
    summary: `Eligible under ${params.warrantyPeriodMonths}-month manufacturer & seller warranty. ${daysRemaining} days remaining until ${expirationDate}.`,
  };
}

export interface SubscriptionAnalytics {
  activeMonthlySpend: number;
  activeAnnualSpend: number;
  potentialMonthlySavings: number;
  potentialAnnualSavings: number;
  activeCount: number;
  flaggedCount: number;
  upcomingWithin14Days: Subscription[];
}

export function calculateSubscriptionAnalytics(
  subscriptions: Subscription[],
  referenceDate: string
): SubscriptionAnalytics {
  let activeMonthlySpend = 0;
  let potentialMonthlySavings = 0;
  let activeCount = 0;
  let flaggedCount = 0;
  const upcomingWithin14Days: Subscription[] = [];

  for (const sub of subscriptions) {
    if (sub.category !== 'Cancelled') {
      activeMonthlySpend += sub.monthlyCost;
      activeCount += 1;

      const daysUntilBill = diffDaysIso(referenceDate, sub.nextBillingDate);
      if (daysUntilBill >= 0 && daysUntilBill <= 14) {
        upcomingWithin14Days.push(sub);
      }
    }

    if (sub.category === 'Potentially Unused' || sub.category === 'Duplicate') {
      potentialMonthlySavings += sub.potentialSavingsMonthly;
      flaggedCount += 1;
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    activeMonthlySpend: round2(activeMonthlySpend),
    activeAnnualSpend: round2(activeMonthlySpend * 12),
    potentialMonthlySavings: round2(potentialMonthlySavings),
    potentialAnnualSavings: round2(potentialMonthlySavings * 12),
    activeCount,
    flaggedCount,
    upcomingWithin14Days,
  };
}

export function detectCalendarConflicts(
  events: CalendarEvent[],
  candidateStart: string,
  candidateEnd: string
): CalendarEvent[] {
  const startMs = Date.parse(candidateStart);
  const endMs = Date.parse(candidateEnd);

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return [];
  }

  return events.filter((ev) => {
    if (ev.status === 'conflict') return false;
    const evStart = Date.parse(ev.start);
    const evEnd = Date.parse(ev.end);
    return startMs < evEnd && endMs > evStart;
  });
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatTimeRangeLabel(startHour: number, startMin: number, durationMin: number): string {
  const endTotal = startHour * 60 + startMin + durationMin;
  const endHour = Math.floor(endTotal / 60);
  const endMin = endTotal % 60;
  return `${pad2(startHour)}:${pad2(startMin)} – ${pad2(endHour)}:${pad2(endMin)}`;
}

export function findAvailableSlots(params: {
  events: CalendarEvent[];
  targetDate: string; // YYYY-MM-DD
  durationMinutes: number;
  preferredPeriod?: 'Morning' | 'Afternoon' | 'Evening' | 'Any';
}): TimeSlotSuggestion[] {
  const { events, targetDate, durationMinutes, preferredPeriod = 'Any' } = params;
  const suggestions: TimeSlotSuggestion[] = [];

  const workStartMin = 9 * 60;
  const workEndMin = 18 * 60;

  for (let startMin = workStartMin; startMin + durationMinutes <= workEndMin; startMin += 30) {
    const sh = Math.floor(startMin / 60);
    const sm = startMin % 60;
    const endMinTotal = startMin + durationMinutes;
    const eh = Math.floor(endMinTotal / 60);
    const em = endMinTotal % 60;

    const startIso = `${targetDate}T${pad2(sh)}:${pad2(sm)}:00`;
    const endIso = `${targetDate}T${pad2(eh)}:${pad2(em)}:00`;

    const period: 'Morning' | 'Afternoon' | 'Evening' =
      sh < 12 ? 'Morning' : sh < 17 ? 'Afternoon' : 'Evening';

    if (preferredPeriod !== 'Any' && period !== preferredPeriod) {
      continue;
    }

    const conflicts = detectCalendarConflicts(events, startIso, endIso);
    if (conflicts.length === 0) {
      suggestions.push({
        start: startIso,
        end: endIso,
        label: formatTimeRangeLabel(sh, sm, durationMinutes),
        period,
        conflictFree: true,
        reason: `No overlapping events on ${targetDate} (${period.toLowerCase()} window).`,
      });
    }
  }

  return suggestions;
}

export function detectDocumentContradictions(documents: DocumentRecord[]): DocumentContradiction[] {
  const contradictions: DocumentContradiction[] = [];

  const invoices = documents.filter((d) => d.type === 'invoice' || d.type === 'receipt');
  const warranties = documents.filter((d) => d.type === 'warranty' || d.type === 'policy');

  for (const inv of invoices) {
    for (const war of warranties) {
      if (
        inv.extractedFields.product &&
        war.extractedFields.product &&
        inv.extractedFields.product.toLowerCase() === war.extractedFields.product.toLowerCase()
      ) {
        if (
          inv.extractedFields.purchaseDate &&
          war.extractedFields.purchaseDate &&
          inv.extractedFields.purchaseDate !== war.extractedFields.purchaseDate
        ) {
          contradictions.push({
            id: `contra-${inv.id}-${war.id}-date`,
            severity: 'warning',
            field: 'Purchase Date',
            description: `Invoice ${inv.fileName} records purchase date ${inv.extractedFields.purchaseDate}, whereas warranty document ${war.fileName} lists ${war.extractedFields.purchaseDate}.`,
            comparedDocumentId: war.id,
          });
        }
      }
    }
  }

  return contradictions;
}

export function deriveApprovalRiskLevel(
  apr: Pick<ApprovalRequest, 'actionType' | 'potentialRisks' | 'title' | 'riskLevel'>
): ApprovalRiskLevel {
  if (apr.riskLevel) return apr.riskLevel;
  const risksJoined = (apr.potentialRisks ?? []).join(' ').toLowerCase();
  if (risksJoined.includes('double-book') || risksJoined.includes('missing evidence')) {
    return 'High';
  }
  if (apr.actionType === 'cancel_subscription') {
    return 'Medium';
  }
  if (apr.actionType === 'send_email') {
    if (apr.title.toLowerCase().includes('confirmation')) return 'Low';
    return 'Medium';
  }
  if (apr.actionType === 'create_appointment' || apr.actionType === 'generate_report') {
    return 'Low';
  }
  return 'Medium';
}

export function buildApprovalPlainSummary(
  apr: Pick<ApprovalRequest, 'actionType' | 'title' | 'recipient' | 'plainSummary' | 'mcpArgs'>
): string {
  if (apr.plainSummary) return apr.plainSummary;
  const recipientClean = apr.recipient.replace(/\.+$/, '').trim();
  if (apr.actionType === 'send_email') {
    const cleanTitle = apr.title.replace(/^Send\s+/i, '').trim();
    return `Send an email (${cleanTitle}) to ${recipientClean}.`;
  }
  if (apr.actionType === 'cancel_subscription') {
    return `Send a cancellation request for ${apr.title.replace(/^Cancel\s+/i, '')} to ${recipientClean}.`;
  }
  if (apr.actionType === 'create_appointment') {
    const args = apr.mcpArgs as { title?: string; start?: string };
    const dateLabel = typeof args.start === 'string' ? args.start.slice(0, 10) : 'your calendar';
    return `Add "${args.title ?? apr.title}" to your calendar on ${dateLabel}.`;
  }
  return apr.title;
}

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_DOCUMENT_EXTENSIONS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.txt',
  '.csv',
]);

const ALLOWED_DOCUMENT_MIME_PREFIXES = ['image/', 'text/'];
const ALLOWED_DOCUMENT_MIME_EXACT = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel',
]);

export function validateDocumentUploadMeta(params: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): { valid: boolean; error?: string } {
  const name = params.fileName.trim();
  if (!name) {
    return { valid: false, error: 'Please choose a file to upload.' };
  }
  if (params.sizeBytes <= 0) {
    return { valid: false, error: 'The selected file is empty.' };
  }
  if (params.sizeBytes > MAX_DOCUMENT_BYTES) {
    const mb = (params.sizeBytes / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File is too large (${mb} MB). Maximum supported size is 10 MB.`,
    };
  }
  const lowerName = name.toLowerCase();
  const dotIdx = lowerName.lastIndexOf('.');
  const ext = dotIdx >= 0 ? lowerName.slice(dotIdx) : '';
  const mime = (params.mimeType || '').toLowerCase();

  const extOk = ALLOWED_DOCUMENT_EXTENSIONS.has(ext);
  const mimeOk =
    ALLOWED_DOCUMENT_MIME_EXACT.has(mime) ||
    ALLOWED_DOCUMENT_MIME_PREFIXES.some((p) => mime.startsWith(p));

  if (!extOk && !mimeOk) {
    return {
      valid: false,
      error: `Unsupported file type "${ext || mime || 'unknown'}". Please upload a PDF, PNG, JPG, WEBP, TXT, or CSV file.`,
    };
  }

  return { valid: true };
}

export function validateAppointmentForm(params: {
  title: string;
  targetDate: string;
  durationMinutes: number;
  startTime?: string;
  endTime?: string;
}): { valid: boolean; errors: { title?: string; targetDate?: string; time?: string } } {
  const errors: { title?: string; targetDate?: string; time?: string } = {};
  const trimmedTitle = params.title.trim();

  if (!trimmedTitle) {
    errors.title = 'Please enter a meeting title.';
  } else if (trimmedTitle.length < 3) {
    errors.title = 'Meeting title must be at least 3 characters.';
  } else if (trimmedTitle.length > 120) {
    errors.title = 'Meeting title cannot exceed 120 characters.';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.targetDate)) {
    errors.targetDate = 'Choose a valid date (YYYY-MM-DD).';
  }

  if (!Number.isFinite(params.durationMinutes) || params.durationMinutes < 15 || params.durationMinutes > 480) {
    errors.time = 'Duration must be between 15 and 480 minutes.';
  } else if (params.startTime && params.endTime) {
    const startMs = Date.parse(`${params.targetDate}T${params.startTime}:00`);
    const endMs = Date.parse(`${params.targetDate}T${params.endTime}:00`);
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      errors.time = 'End time must be after start time.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function buildDeterministicSubscriptionInsight(sub: Subscription): string {
  const monthly = formatINR(sub.monthlyCost);
  const annual = formatINR(sub.annualCost);
  if (sub.category === 'Duplicate') {
    return `Flagged as a duplicate plan: ${sub.usageNote} Cancelling saves ${monthly}/mo (${annual}/yr) without affecting your primary plan.`;
  }
  if (sub.category === 'Potentially Unused') {
    return `Flagged for low usage: ${sub.usageNote} Cancelling before ${sub.nextBillingDate} saves ${monthly}/mo (${annual}/yr).`;
  }
  if (sub.category === 'Cancellation Pending') {
    return `Cancellation request approved and queued before ${sub.nextBillingDate} (${annual}/yr protected).`;
  }
  if (sub.category === 'Cancelled') {
    return 'Subscription has been cancelled; no further recurring UPI/card charges expected.';
  }
  return `Active plan in regular use (${sub.status}). Keeping this saves switching effort (${monthly}/mo).`;
}

export function applyDeterministicToneRewrite(params: {
  subject?: string;
  messageContent: string;
  tone: RewriteTone;
}): { subject?: string; messageContent: string } {
  const raw = params.messageContent.trim();
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const bodyCore = lines
    .filter(
      (l) =>
        !/^dear\b/i.test(l) &&
        !/^hello\b/i.test(l) &&
        !/^sincerely/i.test(l) &&
        !/^thank you/i.test(l) &&
        !/^subject:/i.test(l)
    )
    .join('\n\n');
  const core = bodyCore || raw;

  if (params.tone === 'short') {
    const condensed = core.split(/\n+/)[0]?.slice(0, 260) ?? core.slice(0, 260);
    return {
      subject: params.subject,
      messageContent: `Hello,\n\n${condensed}\n\nPlease confirm next steps at your earliest convenience.\n\nThank you,\nKiran Kamat`,
    };
  }

  if (params.tone === 'firm') {
    return {
      subject: params.subject ? `[Action Required] ${params.subject.replace(/^\[Action Required\]\s*/i, '')}` : undefined,
      messageContent: `Dear Support Team,\n\n${core}\n\nPlease confirm resolution and written acknowledgment within 3 business days so I can close this record promptly.\n\nRegards,\nKiran Kamat`,
    };
  }

  return {
    subject: params.subject?.replace(/^\[Action Required\]\s*/i, ''),
    messageContent: `Hello,\n\nI hope you are doing well.\n\n${core}\n\nThank you very much for your help!\n\nBest regards,\nKiran Kamat`,
  };
}

