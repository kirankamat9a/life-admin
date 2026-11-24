import type {
  CalendarEvent,
  CaseStatus,
  DocumentContradiction,
  DocumentRecord,
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
