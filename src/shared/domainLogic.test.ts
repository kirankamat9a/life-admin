import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonthsIso,
  calculateSubscriptionAnalytics,
  detectCalendarConflicts,
  detectDocumentContradictions,
  evaluateWarrantyEligibility,
  findAvailableSlots,
} from './domainLogic';
import type { CalendarEvent, DocumentRecord, Subscription } from './types';

test('addMonthsIso computes exact warranty expiration date', () => {
  assert.equal(addMonthsIso('2026-08-24', 24), '2028-08-24');
  assert.equal(addMonthsIso('2026-01-15', 12), '2027-01-15');
});

test('evaluateWarrantyEligibility identifies eligible, evidence-required, and expired cases', () => {
  const eligible = evaluateWarrantyEligibility({
    purchaseDate: '2026-08-24',
    warrantyPeriodMonths: 24,
    currentDate: '2026-11-24',
    hasInvoice: true,
    hasDefectEvidence: true,
  });
  assert.equal(eligible.isWithinWarranty, true);
  assert.equal(eligible.recommendedStatus, 'Eligible');
  assert.equal(eligible.expirationDate, '2028-08-24');

  const missingEvidence = evaluateWarrantyEligibility({
    purchaseDate: '2026-08-24',
    warrantyPeriodMonths: 24,
    currentDate: '2026-11-24',
    hasInvoice: true,
    hasDefectEvidence: false,
  });
  assert.equal(missingEvidence.recommendedStatus, 'Evidence Required');

  const expired = evaluateWarrantyEligibility({
    purchaseDate: '2024-01-01',
    warrantyPeriodMonths: 12,
    currentDate: '2026-11-24',
    hasInvoice: true,
    hasDefectEvidence: true,
  });
  assert.equal(expired.isWithinWarranty, false);
});

test('calculateSubscriptionAnalytics computes monthly spend, savings, and upcoming renewals', () => {
  const subs: Subscription[] = [
    {
      id: '1',
      name: 'Active Tool',
      provider: 'ToolCo',
      providerEmail: 'support@tool.co',
      monthlyCost: 20,
      annualCost: 240,
      billingFrequency: 'Monthly',
      lastPayment: '2026-11-01',
      nextBillingDate: '2026-12-01',
      category: 'Active',
      status: 'Used daily',
      cancellationInstructions: 'Cancel in portal',
      usageNote: 'Active',
      potentialSavingsMonthly: 0,
    },
    {
      id: '2',
      name: 'Unused Stream',
      provider: 'StreamCo',
      providerEmail: 'billing@stream.co',
      monthlyCost: 15,
      annualCost: 180,
      billingFrequency: 'Monthly',
      lastPayment: '2026-11-10',
      nextBillingDate: '2026-12-10',
      category: 'Potentially Unused',
      status: 'Idle 60d',
      cancellationInstructions: 'Send cancellation email',
      usageNote: '0 hours',
      potentialSavingsMonthly: 15,
    },
    {
      id: '3',
      name: 'Old Cancelled',
      provider: 'OldCo',
      providerEmail: 'help@old.co',
      monthlyCost: 10,
      annualCost: 120,
      billingFrequency: 'Monthly',
      lastPayment: '2026-10-01',
      nextBillingDate: '2026-12-20',
      category: 'Cancelled',
      status: 'Cancelled',
      cancellationInstructions: 'Done',
      usageNote: 'Cancelled',
      potentialSavingsMonthly: 0,
    },
  ];

  const stats = calculateSubscriptionAnalytics(subs, '2026-11-24');
  assert.equal(stats.activeMonthlySpend, 35);
  assert.equal(stats.activeAnnualSpend, 420);
  assert.equal(stats.potentialMonthlySavings, 15);
  assert.equal(stats.potentialAnnualSavings, 180);
  assert.equal(stats.activeCount, 2);
  assert.equal(stats.flaggedCount, 1);
  assert.equal(stats.upcomingWithin14Days.length, 1);
  assert.equal(stats.upcomingWithin14Days[0].id, '1');
});

test('detectCalendarConflicts and findAvailableSlots respect busy blocks', () => {
  const events: CalendarEvent[] = [
    {
      id: 'e1',
      title: 'Q4 Budget Review',
      start: '2026-11-25T13:00:00',
      end: '2026-11-25T14:00:00',
      location: 'Meet',
      attendees: [],
      status: 'confirmed',
      source: 'demo_calendar',
    },
    {
      id: 'e2',
      title: 'Dental Checkup',
      start: '2026-11-25T15:30:00',
      end: '2026-11-25T16:30:00',
      location: 'Clinic',
      attendees: [],
      status: 'confirmed',
      source: 'demo_calendar',
    },
  ];

  const conflicts = detectCalendarConflicts(events, '2026-11-25T13:30:00', '2026-11-25T14:30:00');
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].id, 'e1');

  const afternoonSlots = findAvailableSlots({
    events,
    targetDate: '2026-11-25',
    durationMinutes: 60,
    preferredPeriod: 'Afternoon',
  });

  // 14:00-15:00 and 14:30-15:30 should be free; 13:00-14:00 and 15:30-16:30 should be excluded
  assert.ok(afternoonSlots.some((s) => s.start === '2026-11-25T14:00:00'));
  assert.ok(!afternoonSlots.some((s) => s.start === '2026-11-25T13:00:00'));
  assert.ok(!afternoonSlots.some((s) => s.start === '2026-11-25T15:30:00'));
});

test('detectDocumentContradictions flags mismatched dates across matching products', () => {
  const docs: DocumentRecord[] = [
    {
      id: 'd1',
      title: 'Invoice',
      type: 'invoice',
      uploadedAt: '2026-11-24',
      fileName: 'inv.pdf',
      mimeType: 'application/pdf',
      ocrStatus: 'Completed',
      extractedFields: { product: 'Zenith 15 Pro', purchaseDate: '2026-08-24' },
      contradictions: [],
      citations: [],
      rawText: 'Invoice',
    },
    {
      id: 'd2',
      title: 'Warranty',
      type: 'warranty',
      uploadedAt: '2026-11-24',
      fileName: 'war.pdf',
      mimeType: 'application/pdf',
      ocrStatus: 'Completed',
      extractedFields: { product: 'Zenith 15 Pro', purchaseDate: '2026-08-20' },
      contradictions: [],
      citations: [],
      rawText: 'Warranty',
    },
  ];
  const issues = detectDocumentContradictions(docs);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, 'Purchase Date');
});
