import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonthsIso,
  applyDeterministicToneRewrite,
  buildApprovalPlainSummary,
  buildDeterministicSubscriptionInsight,
  calculateSubscriptionAnalytics,
  deriveApprovalRiskLevel,
  detectCalendarConflicts,
  detectDocumentContradictions,
  evaluateWarrantyEligibility,
  findAvailableSlots,
  formatINR,
  MAX_DOCUMENT_BYTES,
  validateAppointmentForm,
  validateDocumentUploadMeta,
} from './domainLogic';
import type { CalendarEvent, DocumentRecord, Subscription } from './types';

test('formatINR formats Indian numbering with Rupee symbol', () => {
  assert.equal(formatINR(124990), '₹1,24,990.00');
  assert.equal(formatINR(499), '₹499.00');
  assert.equal(formatINR(47964, 0), '₹47,964');
});

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
  assert.ok(expired.summary.toLowerCase().includes('expired'));
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

test('detectCalendarConflicts and findAvailableSlots respect busy blocks across periods', () => {
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

  const morningSlots = findAvailableSlots({
    events,
    targetDate: '2026-11-25',
    durationMinutes: 60,
    preferredPeriod: 'Morning',
  });
  assert.ok(morningSlots.length > 0 && morningSlots.every((s) => s.period === 'Morning'));

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

  const eveningSlots = findAvailableSlots({
    events,
    targetDate: '2026-11-25',
    durationMinutes: 60,
    preferredPeriod: 'Evening',
  });
  assert.ok(eveningSlots.length > 0 && eveningSlots.every((s) => s.period === 'Evening'));

  const anySlots = findAvailableSlots({
    events,
    targetDate: '2026-11-25',
    durationMinutes: 60,
    preferredPeriod: 'Any',
  });
  assert.equal(anySlots.length, morningSlots.length + afternoonSlots.length + eveningSlots.length);
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

test('deriveApprovalRiskLevel and buildApprovalPlainSummary classify approvals accurately', () => {
  assert.equal(
    deriveApprovalRiskLevel({
      actionType: 'create_appointment',
      potentialRisks: ['Double-books Dental Checkup.'],
      title: 'Schedule meeting',
    }),
    'High'
  );
  assert.equal(
    deriveApprovalRiskLevel({
      actionType: 'cancel_subscription',
      potentialRisks: ['Ends access at cycle end.'],
      title: 'Cancel JioCloud Plus',
    }),
    'Medium'
  );
  assert.equal(
    deriveApprovalRiskLevel({
      actionType: 'create_appointment',
      potentialRisks: ['None'],
      title: 'Schedule sync',
    }),
    'Low'
  );

  const summary = buildApprovalPlainSummary({
    actionType: 'create_appointment',
    title: 'Create Appointment: Team Sync',
    recipient: 'user@example.com',
    mcpArgs: { title: 'Team Sync', start: '2026-11-25T14:00:00' },
  });
  assert.equal(summary, 'Add "Team Sync" to your calendar on 2026-11-25.');
});

test('validateDocumentUploadMeta enforces file type and 10 MB size limit', () => {
  assert.equal(
    validateDocumentUploadMeta({ fileName: 'invoice.pdf', mimeType: 'application/pdf', sizeBytes: 2048 }).valid,
    true
  );
  assert.equal(
    validateDocumentUploadMeta({ fileName: 'huge.pdf', mimeType: 'application/pdf', sizeBytes: MAX_DOCUMENT_BYTES + 1 }).valid,
    false
  );
  assert.equal(
    validateDocumentUploadMeta({ fileName: 'script.exe', mimeType: 'application/x-msdownload', sizeBytes: 512 }).valid,
    false
  );
});

test('validateAppointmentForm catches missing title and inverted times', () => {
  const invalid = validateAppointmentForm({
    title: 'Hi',
    targetDate: '2026-11-25',
    durationMinutes: 60,
    startTime: '15:00',
    endTime: '14:00',
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.title);
  assert.ok(invalid.errors.time);

  const valid = validateAppointmentForm({
    title: 'Quarterly Sync',
    targetDate: '2026-11-25',
    durationMinutes: 45,
    startTime: '14:00',
    endTime: '14:45',
  });
  assert.equal(valid.valid, true);
});

test('buildDeterministicSubscriptionInsight and applyDeterministicToneRewrite work deterministically', () => {
  const insight = buildDeterministicSubscriptionInsight({
    id: 'sub-2',
    name: 'JioCloud Plus',
    provider: 'JioCloud India',
    providerEmail: 'billing@jiocloud-demo.example',
    monthlyCost: 499,
    annualCost: 5988,
    billingFrequency: 'Monthly',
    lastPayment: '2026-11-03',
    nextBillingDate: '2026-12-03',
    category: 'Duplicate',
    status: 'Duplicate',
    cancellationInstructions: 'Email support',
    usageNote: '0 MB uploaded in 120 days.',
    potentialSavingsMonthly: 499,
  });
  assert.ok(insight.includes('₹499.00/mo'));
  assert.ok(insight.includes('₹5,988.00/yr'));

  const firm = applyDeterministicToneRewrite({
    subject: 'Warranty Request',
    messageContent: 'Please repair my laptop under warranty.',
    tone: 'firm',
  });
  assert.ok(firm.subject?.includes('[Action Required]'));
  assert.ok(firm.messageContent.includes('3 business days'));
});

