import { detectDocumentContradictions } from '../src/shared/domainLogic';
import type { WorkspaceState } from '../src/shared/types';

export function createInitialWorkspaceState(): WorkspaceState {
  const referenceDate = '2026-11-24';

  const documents: WorkspaceState['documents'] = [
    {
      id: 'doc-invoice-laptop',
      title: 'TechInnovate Retail Invoice — Zenith 15 Pro Laptop',
      type: 'invoice',
      uploadedAt: '2026-08-24T14:22:00Z',
      fileName: 'TechInnovate_Invoice_TI-987654.pdf',
      mimeType: 'image/jpeg',
      previewUrl: '/src/assets/images/laptop_invoice_scan_1795507693527.jpg',
      ocrStatus: 'Completed',
      extractedFields: {
        merchant: 'TechInnovate Electronics Ltd.',
        product: 'Zenith 15 Pro Laptop (15", i7, 16GB RAM, 512GB SSD)',
        purchaseDate: '2026-08-24',
        invoiceNumber: 'TI-987654',
        totalAmount: '$1,499.99',
        warrantyPeriod: '24 Months Standard Limited Hardware Warranty',
        warrantyExpiration: '2028-08-24',
        paymentMethod: 'Visa Debit (•••• 5432)',
      },
      contradictions: [],
      citations: [
        'Invoice #TI-987654 dated 2026-08-24 · Line Item: Zenith 15 Pro Laptop ($1,499.99)',
        'Warranty Certificate Section 2: Covers hardware port & power delivery defects until 2028-08-24',
      ],
      rawText:
        'TECHINNOVATE ELECTRONICS LTD. Retail Invoice TI-987654. Purchase Date: 2026-08-24. Item: Zenith 15 Pro Laptop (15", i7, 16GB RAM, 512GB SSD). Total Paid: $1,499.99. Includes Standard 2-Year Limited Hardware Warranty ending 2028-08-24. Support: warranty@techinnovate-demo.example',
    },
    {
      id: 'doc-warranty-laptop',
      title: 'Zenith Manufacturer 24-Month Warranty Terms',
      type: 'warranty',
      uploadedAt: '2026-08-24T14:25:00Z',
      fileName: 'Zenith_Hardware_Warranty_Policy.pdf',
      mimeType: 'application/pdf',
      ocrStatus: 'Completed',
      extractedFields: {
        merchant: 'Zenith Computing Corp.',
        product: 'Zenith 15 Pro Laptop (15", i7, 16GB RAM, 512GB SSD)',
        purchaseDate: '2026-08-24',
        warrantyPeriod: '24 Months Carry-In or Express Replacement',
        warrantyExpiration: '2028-08-24',
      },
      contradictions: [],
      citations: [
        'Clause 4.1: Intermittent USB-C / Thunderbolt controller faults qualify for zero-cost repair or replacement within 24 months.',
        'Clause 6.2: Seller must acknowledge claim within 3 business days upon submission of original invoice.',
      ],
      rawText:
        'ZENITH COMPUTING CORP. 24-Month Limited Hardware Warranty. Coverage applies to display, motherboard, and USB-C/Thunderbolt controller defects arising under normal use for 24 months from invoice date 2026-08-24.',
    },
    {
      id: 'doc-headphones-receipt',
      title: 'SoundStage Receipt — AeroPulse ANC Headphones',
      type: 'receipt',
      uploadedAt: '2026-06-11T10:15:00Z',
      fileName: 'SoundStage_Order_SS4419.pdf',
      mimeType: 'application/pdf',
      ocrStatus: 'Completed',
      extractedFields: {
        merchant: 'SoundStage Audio',
        product: 'AeroPulse Studio ANC Headphones',
        purchaseDate: '2026-06-11',
        invoiceNumber: 'SS-44190',
        totalAmount: '$289.00',
        warrantyPeriod: '12 Months',
        warrantyExpiration: '2027-06-11',
      },
      contradictions: [],
      citations: [
        'Order SS-44190: Purchased 2026-06-11 for $289.00. 12-month warranty active until 2027-06-11.',
      ],
      rawText:
        'SoundStage Audio Receipt #SS-44190. AeroPulse Studio ANC Headphones. Purchase Date: 2026-06-11. Total: $289.00. 12-month limited warranty.',
    },
    {
      id: 'doc-headphones-warranty-slip',
      title: 'AeroPulse Extended Care Registration Card',
      type: 'warranty',
      uploadedAt: '2026-06-14T09:00:00Z',
      fileName: 'AeroPulse_Registration_Card.pdf',
      mimeType: 'application/pdf',
      ocrStatus: 'Completed',
      extractedFields: {
        merchant: 'SoundStage Audio',
        product: 'AeroPulse Studio ANC Headphones',
        purchaseDate: '2026-06-15', // Intentional 4-day registration discrepancy for contradiction detector!
        warrantyPeriod: '12 Months',
        warrantyExpiration: '2027-06-15',
      },
      contradictions: [],
      citations: [
        'Registration Card lists purchase date as 2026-06-15, conflicting with receipt 2026-06-11.',
      ],
      rawText:
        'AeroPulse Warranty Registration. Product: AeroPulse Studio ANC Headphones. Registered Purchase Date: 2026-06-15.',
    },
  ];

  // Run pure contradiction check on initial docs
  const detectedContradictions = detectDocumentContradictions(documents);
  for (const c of detectedContradictions) {
    const targetDoc = documents.find((d) => d.id === c.comparedDocumentId || d.id === 'doc-headphones-receipt');
    if (targetDoc) {
      targetDoc.contradictions.push(c);
    }
  }

  const emails: WorkspaceState['emails'] = [
    {
      id: 'email-001',
      from: 'orders@techinnovate-demo.example',
      to: 'kiran.kamat@lifeadmin-demo.example',
      subject: 'Your TechInnovate Order & Invoice #TI-987654 (Zenith 15 Pro Laptop)',
      date: '2026-08-24T14:20:00Z',
      snippet: 'Thank you for your purchase of Zenith 15 Pro Laptop ($1,499.99). Your 24-month warranty certificate is attached.',
      body: 'Order #TI-7890123 | Invoice #TI-987654. Item: Zenith 15 Pro Laptop (15", i7, 16GB RAM, 512GB SSD). Total Paid: $1,499.99 via Visa Debit ending 5432. Covered under 24-Month Limited Hardware Warranty until 2028-08-24.',
      attachmentDocIds: ['doc-invoice-laptop', 'doc-warranty-laptop'],
    },
    {
      id: 'email-002',
      from: 'billing@cloudvault-demo.example',
      to: 'kiran.kamat@lifeadmin-demo.example',
      subject: 'Receipt for CloudVault Pro & CloudVault Plus Legacy',
      date: '2026-11-03T08:12:00Z',
      snippet: 'Recurring monthly charges processed: CloudVault Pro ($14.99) and CloudVault Plus Legacy ($14.99).',
      body: 'Your monthly billing statement shows two active plans on your account: CloudVault Pro ($14.99/mo) and CloudVault Plus Legacy ($14.99/mo).',
      attachmentDocIds: [],
    },
    {
      id: 'email-003',
      from: 'receipts@streammax-demo.example',
      to: 'kiran.kamat@lifeadmin-demo.example',
      subject: 'StreamMax Ultra 4K — Monthly Renewal Confirmation ($22.99)',
      date: '2026-11-05T06:00:00Z',
      snippet: 'Your StreamMax Ultra 4K subscription renewed for $22.99. Next billing date: December 5, 2026.',
      body: 'Plan: StreamMax Ultra 4K ($22.99/month). Last playback activity: September 17, 2026 (68 days ago).',
      attachmentDocIds: [],
    },
    {
      id: 'email-004',
      from: 'billing@fitpulse-demo.example',
      to: 'kiran.kamat@lifeadmin-demo.example',
      subject: 'FitPulse Coaching Monthly Invoice ($29.00)',
      date: '2026-11-12T09:40:00Z',
      snippet: 'Your FitPulse Coaching membership renewed for $29.00. Next charge on December 12, 2026.',
      body: 'FitPulse Coaching Membership ($29.00/mo). Account activity: 0 sessions logged in the past 54 days.',
      attachmentDocIds: [],
    },
  ];

  const cases: WorkspaceState['cases'] = [
    {
      id: 'case-laptop-001',
      product: 'Zenith 15 Pro Laptop (15", i7, 16GB)',
      seller: 'TechInnovate Electronics Ltd.',
      sellerEmail: 'warranty@techinnovate-demo.example',
      purchaseDate: '2026-08-24',
      invoiceNumber: 'TI-987654',
      purchaseAmount: 1499.99,
      currency: 'USD',
      warrantyPeriodMonths: 24,
      warrantyExpiration: '2028-08-24',
      status: 'Eligible',
      issueSummary: 'Primary USB-C / Thunderbolt port intermittently disconnects external display and charging.',
      eligibilitySummary:
        'Eligible under 24-month hardware warranty (639 days remaining until 2028-08-24). Invoice TI-987654 and policy Clause 4.1 verified.',
      missingEvidence: [],
      complaintDraft:
        'Subject: Warranty Service & Repair Request — Invoice #TI-987654 (Zenith 15 Pro Laptop)\n\nDear TechInnovate Warranty Support,\n\nI am writing to request warranty service for my Zenith 15 Pro Laptop purchased on August 24, 2026 (Invoice #TI-987654, Total: $1,499.99).\n\nIssue Description:\nThe primary USB-C / Thunderbolt port has developed intermittent display output and power-delivery failures under normal desk use.\n\nWarranty Coverage Reference:\nPer the Standard 24-Month Limited Hardware Warranty (valid through August 24, 2028, Clause 4.1), motherboard and Thunderbolt controller defects are covered for zero-cost repair or replacement.\n\nAttached Evidence:\n- Retail Invoice #TI-987654 (dated 2026-08-24)\n- Zenith 24-Month Warranty Certificate\n\nPlease confirm RMA instructions or replacement turnaround within 3 business days per Clause 6.2.\n\nSincerely,\nKiran Kamat',
      documentIds: ['doc-invoice-laptop', 'doc-warranty-laptop'],
      citations: [
        {
          id: 'cit-1',
          sourceType: 'document',
          sourceId: 'doc-invoice-laptop',
          label: 'TechInnovate_Invoice_TI-987654.pdf',
          excerpt: 'Purchased 2026-08-24 · Zenith 15 Pro Laptop · $1,499.99 · Invoice #TI-987654',
        },
        {
          id: 'cit-2',
          sourceType: 'document',
          sourceId: 'doc-warranty-laptop',
          label: 'Zenith_Hardware_Warranty_Policy.pdf (Clause 4.1)',
          excerpt: 'USB-C / Thunderbolt controller defects qualify for repair/replacement within 24 months.',
        },
      ],
      timeline: [
        {
          id: 'tl-1',
          timestamp: '2026-08-24T14:20:00Z',
          title: 'Purchase Invoice Archived',
          description: 'Invoice #TI-987654 ($1,499.99) received from TechInnovate Electronics.',
          actor: 'Email MCP',
          citationIds: ['cit-1'],
        },
        {
          id: 'tl-2',
          timestamp: '2026-11-23T18:10:00Z',
          title: 'Warranty Eligibility Verified',
          description: 'Policy Analysis Agent confirmed 24-month warranty coverage active until 2028-08-24.',
          actor: 'Policy Analysis Agent',
          citationIds: ['cit-1', 'cit-2'],
        },
      ],
    },
    {
      id: 'case-headphones-002',
      product: 'AeroPulse Studio ANC Headphones',
      seller: 'SoundStage Audio',
      sellerEmail: 'support@soundstage-demo.example',
      purchaseDate: '2026-06-11',
      invoiceNumber: 'SS-44190',
      purchaseAmount: 289.0,
      currency: 'USD',
      warrantyPeriodMonths: 12,
      warrantyExpiration: '2027-06-11',
      status: 'Evidence Required',
      issueSummary: 'Right earcup active noise cancellation emits static hum.',
      eligibilitySummary:
        'Within 12-month warranty (199 days remaining until 2027-06-11), but missing device serial number photo and date discrepancy resolution.',
      missingEvidence: [
        'Photo of serial number inside right headband',
        'Confirm receipt date (2026-06-11) vs registration card (2026-06-15)',
      ],
      complaintDraft: '',
      documentIds: ['doc-headphones-receipt', 'doc-headphones-warranty-slip'],
      citations: [
        {
          id: 'cit-3',
          sourceType: 'document',
          sourceId: 'doc-headphones-receipt',
          label: 'SoundStage_Order_SS4419.pdf',
          excerpt: 'Purchased 2026-06-11 · $289.00 · 12-month warranty',
        },
      ],
      timeline: [
        {
          id: 'tl-3',
          timestamp: '2026-11-20T11:30:00Z',
          title: 'Date Discrepancy Flagged',
          description: 'Document MCP detected a 4-day date mismatch between receipt and registration card.',
          actor: 'Document MCP',
          citationIds: ['cit-3'],
        },
      ],
    },
    {
      id: 'case-espresso-003',
      product: 'BrewMaster Espresso Pro',
      seller: 'KitchenCraft Direct',
      sellerEmail: 'claims@kitchencraft-demo.example',
      purchaseDate: '2026-05-04',
      invoiceNumber: 'KC-31042',
      purchaseAmount: 349.0,
      currency: 'USD',
      warrantyPeriodMonths: 12,
      warrantyExpiration: '2027-05-04',
      status: 'Resolved',
      issueSummary: 'Steam wand pressure valve seal failure after 4 months.',
      eligibilitySummary: 'Full refund of $349.00 approved and settled via original payment method.',
      missingEvidence: [],
      complaintDraft: '',
      documentIds: [],
      citations: [],
      timeline: [
        {
          id: 'tl-4',
          timestamp: '2026-10-14T16:00:00Z',
          title: 'Refund Settled ($349.00)',
          description: 'KitchenCraft Direct issued full refund following approved warranty claim.',
          actor: 'Seller Confirmation',
          citationIds: [],
        },
      ],
    },
  ];

  const subscriptions: WorkspaceState['subscriptions'] = [
    {
      id: 'sub-1',
      name: 'CloudVault Pro (Personal)',
      provider: 'CloudVault Inc.',
      providerEmail: 'billing@cloudvault-demo.example',
      monthlyCost: 14.99,
      annualCost: 179.88,
      billingFrequency: 'Monthly',
      lastPayment: '2026-11-03',
      nextBillingDate: '2026-12-03',
      category: 'Active',
      status: 'Used daily · 412 GB stored',
      cancellationInstructions: 'Account Settings -> Billing -> Downgrade to Free',
      usageNote: 'Primary cloud backup synced 2 hours ago.',
      potentialSavingsMonthly: 0,
      sourceEmailId: 'email-002',
    },
    {
      id: 'sub-2',
      name: 'CloudVault Plus (Legacy Plan)',
      provider: 'CloudVault Inc.',
      providerEmail: 'billing@cloudvault-demo.example',
      monthlyCost: 14.99,
      annualCost: 179.88,
      billingFrequency: 'Monthly',
      lastPayment: '2026-11-03',
      nextBillingDate: '2026-12-03',
      category: 'Duplicate',
      status: 'Duplicate storage plan',
      cancellationInstructions: 'Email billing@cloudvault-demo.example referencing Legacy Account #CV-8821 to terminate duplicate billing.',
      usageNote: '0 MB uploaded in 120 days; overlaps with CloudVault Pro.',
      potentialSavingsMonthly: 14.99,
      sourceEmailId: 'email-002',
    },
    {
      id: 'sub-3',
      name: 'StreamMax Ultra 4K',
      provider: 'StreamMax Media',
      providerEmail: 'support@streammax-demo.example',
      monthlyCost: 22.99,
      annualCost: 275.88,
      billingFrequency: 'Monthly',
      lastPayment: '2026-11-05',
      nextBillingDate: '2026-12-05',
      category: 'Potentially Unused',
      status: '0 hours watched in 68 days',
      cancellationInstructions: 'Send written cancellation request to support@streammax-demo.example or cancel via Billing Portal.',
      usageNote: 'Last stream recorded on 2026-09-17.',
      potentialSavingsMonthly: 22.99,
      sourceEmailId: 'email-003',
    },
    {
      id: 'sub-4',
      name: 'FocusFlow Workspace',
      provider: 'FocusFlow Labs',
      providerEmail: 'billing@focusflow-demo.example',
      monthlyCost: 18.0,
      annualCost: 216.0,
      billingFrequency: 'Monthly',
      lastPayment: '2026-11-18',
      nextBillingDate: '2026-12-18',
      category: 'Active',
      status: 'Active · 24 sessions this month',
      cancellationInstructions: 'Manage in Workspace Settings -> Subscription.',
      usageNote: 'Used every weekday for task and note workflows.',
      potentialSavingsMonthly: 0,
    },
    {
      id: 'sub-5',
      name: 'FitPulse Coaching',
      provider: 'FitPulse Health',
      providerEmail: 'billing@fitpulse-demo.example',
      monthlyCost: 29.0,
      annualCost: 348.0,
      billingFrequency: 'Monthly',
      lastPayment: '2026-11-12',
      nextBillingDate: '2026-12-12',
      category: 'Potentially Unused',
      status: 'No activity in 54 days',
      cancellationInstructions: 'Submit cancellation notice to billing@fitpulse-demo.example at least 48h before next cycle.',
      usageNote: '0 workouts logged since 2026-10-01.',
      potentialSavingsMonthly: 29.0,
      sourceEmailId: 'email-004',
    },
  ];

  const events: WorkspaceState['events'] = [
    {
      id: 'ev-1',
      title: 'Weekly Product Architecture Review',
      start: '2026-11-24T10:00:00',
      end: '2026-11-24T11:00:00',
      location: 'Video Call',
      attendees: ['kiran.kamat@lifeadmin-demo.example', 'maya.lin@example.com'],
      status: 'confirmed',
      source: 'demo_calendar',
    },
    {
      id: 'ev-2',
      title: 'Vendor Contract Check-In',
      start: '2026-11-24T15:00:00',
      end: '2026-11-24T16:00:00',
      location: 'Room 4B / Meet',
      attendees: ['kiran.kamat@lifeadmin-demo.example'],
      status: 'confirmed',
      source: 'demo_calendar',
    },
    {
      id: 'ev-3',
      title: 'Engineering Standup & Roadmap Sync',
      start: '2026-11-25T09:30:00',
      end: '2026-11-25T10:30:00',
      location: 'Video Call',
      attendees: ['kiran.kamat@lifeadmin-demo.example', 'team@example.com'],
      status: 'confirmed',
      source: 'demo_calendar',
    },
    {
      id: 'ev-4',
      title: 'Q4 Budget & Ops Planning',
      start: '2026-11-25T13:00:00',
      end: '2026-11-25T14:00:00',
      location: 'Finance Suite',
      attendees: ['kiran.kamat@lifeadmin-demo.example', 'alex.chen@example.com'],
      status: 'confirmed',
      source: 'demo_calendar',
    },
    {
      id: 'ev-5',
      title: 'Dental Checkup (Downtown Clinic)',
      start: '2026-11-25T15:30:00',
      end: '2026-11-25T16:15:00',
      location: '420 Market St, Suite 300',
      attendees: ['kiran.kamat@lifeadmin-demo.example'],
      status: 'confirmed',
      source: 'demo_calendar',
    },
    {
      id: 'ev-6',
      title: 'Design Critique Session',
      start: '2026-11-26T11:00:00',
      end: '2026-11-26T12:00:00',
      location: 'Video Call',
      attendees: ['kiran.kamat@lifeadmin-demo.example'],
      status: 'confirmed',
      source: 'demo_calendar',
    },
  ];

  const approvals: WorkspaceState['approvals'] = [
    {
      id: 'apr-initial-sub',
      title: 'Cancel Duplicate CloudVault Plus (Legacy Plan)',
      actionType: 'cancel_subscription',
      recipient: 'billing@cloudvault-demo.example',
      subject: 'Cancellation Request — Duplicate Legacy Plan (#CV-8821)',
      messageContent:
        'Hello CloudVault Billing Support,\n\nI currently maintain an active CloudVault Pro Personal subscription ($14.99/mo) and noticed a duplicate legacy CloudVault Plus charge ($14.99/mo, Account #CV-8821) on November 3, 2026.\n\nPlease cancel the CloudVault Plus Legacy Plan immediately before the December 3, 2026 billing cycle and confirm no further charges will be made.\n\nThank you,\nKiran Kamat',
      evidenceCitations: [
        {
          id: 'cit-sub-dup',
          sourceType: 'email',
          sourceId: 'email-002',
          label: 'CloudVault Billing Receipt (Nov 3, 2026)',
          excerpt: 'Two overlapping $14.99/mo charges billed on 2026-11-03; Legacy Plan shows 0 MB uploaded in 120 days.',
        },
      ],
      expectedConsequences: [
        'Stops recurring $14.99/month ($179.88/year) duplicate billing before Dec 3, 2026.',
        'Primary CloudVault Pro account (412 GB) remains completely unaffected.',
      ],
      potentialRisks: [
        'Any unmigrated legacy archive folders under #CV-8821 (currently 0 MB) would become inaccessible.',
      ],
      status: 'pending',
      createdAt: '2026-11-24T00:02:00Z',
      relatedEntityId: 'sub-2',
      mcpServer: 'action-mcp',
      mcpTool: 'send_approved_email',
      mcpArgs: {
        to: 'billing@cloudvault-demo.example',
        subject: 'Cancellation Request — Duplicate Legacy Plan (#CV-8821)',
        subscriptionId: 'sub-2',
      },
    },
    {
      id: 'apr-history-000',
      title: 'Send Warranty Settlement Confirmation — BrewMaster Espresso Pro',
      actionType: 'send_email',
      recipient: 'claims@kitchencraft-demo.example',
      subject: 'Confirmation of Refund Receipt — Order #KC-31042',
      messageContent: 'Confirming receipt of the $349.00 refund for BrewMaster Espresso Pro (Order #KC-31042). Case closed.',
      evidenceCitations: [],
      expectedConsequences: ['Marks warranty case KC-31042 as Resolved in archive.'],
      potentialRisks: ['None — confirmation closure notice only.'],
      status: 'executed',
      createdAt: '2026-10-14T15:40:00Z',
      decidedAt: '2026-10-14T15:45:00Z',
      relatedEntityId: 'case-espresso-003',
      mcpServer: 'action-mcp',
      mcpTool: 'send_approved_email',
      mcpArgs: {
        to: 'claims@kitchencraft-demo.example',
        caseId: 'case-espresso-003',
      },
      simulatedExecutionNote: '[DEMO SANDBOX] Simulated email dispatch recorded locally. No external email server contacted.',
    },
  ];

  const mcpServers: WorkspaceState['mcpServers'] = [
    {
      id: 'email-mcp',
      name: 'Email MCP',
      transport: 'JSON-RPC 2.0 (Local Sandbox Transport)',
      mode: 'DEMO_MODE',
      status: 'Connected (Demo Sandbox)',
      description: 'Searches indexed purchase receipts, billing notifications, and prepares draft correspondence without auto-sending.',
      lastConnectedAt: '2026-11-24T00:05:00Z',
      tools: [
        {
          name: 'search_emails',
          description: 'Search user inbox messages by keyword, merchant, or billing topic.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search keywords such as laptop, invoice, or CloudVault' },
            },
            required: ['query'],
          },
        },
        {
          name: 'read_email',
          description: 'Retrieve full body and linked attachment IDs for a specific email ID.',
          inputSchema: {
            type: 'object',
            properties: {
              emailId: { type: 'string', description: 'Email identifier (e.g. email-001)' },
            },
            required: ['emailId'],
          },
        },
        {
          name: 'create_email_draft',
          description: 'Compose a non-sent email draft queued for human approval.',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string', description: 'Recipient email address' },
              subject: { type: 'string', description: 'Email subject line' },
              body: { type: 'string', description: 'Email body content' },
            },
            required: ['to', 'subject', 'body'],
          },
        },
      ],
    },
    {
      id: 'calendar-mcp',
      name: 'Calendar MCP',
      transport: 'JSON-RPC 2.0 (Local Sandbox Transport)',
      mode: 'DEMO_MODE',
      status: 'Connected (Demo Sandbox)',
      description: 'Checks calendar availability, detects overlapping conflicts, and proposes conflict-free appointment slots.',
      lastConnectedAt: '2026-11-24T00:05:00Z',
      tools: [
        {
          name: 'check_availability',
          description: 'Check whether a candidate time window overlaps any confirmed calendar events.',
          inputSchema: {
            type: 'object',
            properties: {
              start: { type: 'string', description: 'ISO start datetime (YYYY-MM-DDTHH:mm:ss)' },
              end: { type: 'string', description: 'ISO end datetime (YYYY-MM-DDTHH:mm:ss)' },
            },
            required: ['start', 'end'],
          },
        },
        {
          name: 'find_available_slots',
          description: 'Find conflict-free slots on a given date and preferred day period.',
          inputSchema: {
            type: 'object',
            properties: {
              targetDate: { type: 'string', description: 'Target date YYYY-MM-DD (e.g. 2026-11-25)' },
              durationMinutes: { type: 'number', description: 'Meeting length in minutes (e.g. 60)' },
              preferredPeriod: { type: 'string', description: 'Morning, Afternoon, Evening, or Any' },
            },
            required: ['targetDate', 'durationMinutes'],
          },
        },
        {
          name: 'create_calendar_event',
          description: 'Stage a proposed calendar event for human approval (never auto-books external calendars).',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Meeting title' },
              start: { type: 'string', description: 'ISO start datetime' },
              end: { type: 'string', description: 'ISO end datetime' },
            },
            required: ['title', 'start', 'end'],
          },
        },
      ],
    },
    {
      id: 'document-mcp',
      name: 'Document MCP',
      transport: 'JSON-RPC 2.0 (Local Sandbox Transport)',
      mode: 'DEMO_MODE',
      status: 'Connected (Demo Sandbox)',
      description: 'Parses uploaded PDFs/images, extracts structured invoice & warranty fields, and checks document contradictions.',
      lastConnectedAt: '2026-11-24T00:05:00Z',
      tools: [
        {
          name: 'search_documents',
          description: 'Search indexed invoices, warranty certificates, and receipts.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Product, merchant, or invoice query' },
            },
            required: ['query'],
          },
        },
        {
          name: 'extract_invoice_details',
          description: 'Return structured invoice fields (merchant, purchaseDate, invoiceNumber, totalAmount).',
          inputSchema: {
            type: 'object',
            properties: {
              documentId: { type: 'string', description: 'Document ID (e.g. doc-invoice-laptop)' },
            },
            required: ['documentId'],
          },
        },
        {
          name: 'analyze_warranty_document',
          description: 'Evaluate warranty terms, expiration date, and eligibility status for a product document.',
          inputSchema: {
            type: 'object',
            properties: {
              documentId: { type: 'string', description: 'Warranty document ID (e.g. doc-warranty-laptop)' },
            },
            required: ['documentId'],
          },
        },
      ],
    },
    {
      id: 'action-mcp',
      name: 'Action MCP',
      transport: 'JSON-RPC 2.0 (Approval-Gated Sandbox)',
      mode: 'DEMO_MODE',
      status: 'Connected (Demo Sandbox)',
      description: 'Executes approved external actions only after verifying explicit human approval state.',
      lastConnectedAt: '2026-11-24T00:05:00Z',
      tools: [
        {
          name: 'send_approved_email',
          description: 'Simulate sending an email ONLY when backed by an approved human decision.',
          inputSchema: {
            type: 'object',
            properties: {
              approvalId: { type: 'string', description: 'Human approval record ID' },
            },
            required: ['approvalId'],
          },
        },
        {
          name: 'create_approved_appointment',
          description: 'Commit an approved appointment to the workspace calendar.',
          inputSchema: {
            type: 'object',
            properties: {
              approvalId: { type: 'string', description: 'Human approval record ID' },
            },
            required: ['approvalId'],
          },
        },
        {
          name: 'generate_case_report',
          description: 'Compile a structured evidence and timeline summary report for a warranty case.',
          inputSchema: {
            type: 'object',
            properties: {
              caseId: { type: 'string', description: 'Case ID (e.g. case-laptop-001)' },
            },
            required: ['caseId'],
          },
        },
      ],
    },
  ];

  const mcpHistory: WorkspaceState['mcpHistory'] = [
    {
      id: 'inv-001',
      timestamp: '2026-11-24T00:01:12Z',
      serverId: 'email-mcp',
      serverName: 'Email MCP',
      toolName: 'search_emails',
      arguments: { query: 'CloudVault recurring' },
      status: 'success',
      durationMs: 18,
      summary: 'Found 1 billing email matching CloudVault duplicate plan.',
      mode: 'DEMO_MODE',
    },
    {
      id: 'inv-002',
      timestamp: '2026-11-24T00:01:35Z',
      serverId: 'document-mcp',
      serverName: 'Document MCP',
      toolName: 'analyze_warranty_document',
      arguments: { documentId: 'doc-warranty-laptop' },
      status: 'success',
      durationMs: 24,
      summary: 'Verified 24-month hardware warranty valid until 2028-08-24.',
      mode: 'DEMO_MODE',
    },
  ];

  const agentRuns: WorkspaceState['agentRuns'] = [
    {
      id: 'run-initial',
      prompt: 'Audit recent billing emails for duplicate or unused subscriptions.',
      startedAt: '2026-11-24T00:01:10Z',
      completedAt: '2026-11-24T00:02:00Z',
      overallStatus: 'Waiting for Approval',
      steps: [
        {
          id: 'step-1',
          role: 'Intent Detection Agent',
          status: 'Completed',
          currentTask: 'Classify subscription audit request',
          taskSummary: 'Detected recurring payment audit & cancellation preparation intent.',
          toolsInvoked: [],
          executionResult: 'Routed to Email MCP and Subscription Policy Analyzer.',
          timestamp: '2026-11-24T00:01:10Z',
        },
        {
          id: 'step-2',
          role: 'Evidence Investigation Agent',
          status: 'Completed',
          currentTask: 'Scan billing receipts via Email MCP',
          taskSummary: 'Retrieved 3 recurring billing emails and usage metadata.',
          toolsInvoked: ['email-mcp.search_emails'],
          executionResult: 'Identified CloudVault duplicate plan + 2 unused subscriptions.',
          timestamp: '2026-11-24T00:01:14Z',
        },
        {
          id: 'step-3',
          role: 'Policy Analysis Agent',
          status: 'Completed',
          currentTask: 'Calculate savings & cancellation notice windows',
          taskSummary: 'Verified $66.98/mo ($803.76/yr) potential savings across 3 flagged plans.',
          toolsInvoked: [],
          executionResult: 'Flagged CloudVault Plus Legacy (#CV-8821) as immediate duplicate.',
          timestamp: '2026-11-24T00:01:38Z',
        },
        {
          id: 'step-4',
          role: 'Action Planning Agent',
          status: 'Completed',
          currentTask: 'Stage cancellation request for approval',
          taskSummary: 'Prepared cancellation email draft and risk summary for CloudVault Plus.',
          toolsInvoked: ['email-mcp.create_email_draft'],
          executionResult: 'Created Approval Request apr-initial-sub.',
          timestamp: '2026-11-24T00:02:00Z',
        },
        {
          id: 'step-5',
          role: 'Execution Agent',
          status: 'Waiting for Approval',
          currentTask: 'Awaiting explicit human sign-off',
          taskSummary: 'Blocked external send until user approves in Approval Centre.',
          toolsInvoked: ['action-mcp.send_approved_email (gated)'],
          executionResult: 'Waiting for Approval.',
          timestamp: '2026-11-24T00:02:00Z',
        },
      ],
    },
  ];

  const chatMessages: WorkspaceState['chatMessages'] = [
    {
      id: 'msg-welcome',
      role: 'assistant',
      content:
        'Welcome to LIFEADMIN AI (Demo Mode). I am connected to four local MCP servers (Email, Calendar, Document, and Approval-Gated Action) using synthetic workspace records.\n\nTry one of the prompts below or upload an invoice/warranty document to inspect how the multi-agent pipeline investigates evidence and prepares human-approved actions.',
      timestamp: '2026-11-24T00:00:00Z',
      reasoningSummary: 'Ready to route natural-language requests through Intent, Evidence Investigation, Policy Analysis, Action Planning, and Execution agents.',
    },
  ];

  const activityTimeline: WorkspaceState['activityTimeline'] = [
    {
      id: 'act-1',
      timestamp: '2026-11-24T00:02:00Z',
      category: 'approval',
      title: 'Approval Required: Cancel Duplicate CloudVault Plus',
      description: 'Action Planning Agent staged cancellation request for $14.99/mo duplicate plan.',
      simulated: true,
    },
    {
      id: 'act-2',
      timestamp: '2026-11-24T00:01:35Z',
      category: 'mcp',
      title: 'Document MCP Verified Laptop Warranty',
      description: 'Extracted Invoice #TI-987654 and confirmed 24-month warranty active until 2028-08-24.',
      simulated: true,
    },
    {
      id: 'act-3',
      timestamp: '2026-11-20T11:30:00Z',
      category: 'document',
      title: 'Contradiction Flagged in AeroPulse Documents',
      description: 'Purchase date mismatch detected between receipt (2026-06-11) and registration card (2026-06-15).',
      simulated: true,
    },
  ];

  const notifications: WorkspaceState['notifications'] = [
    {
      id: 'notif-1',
      type: 'approval',
      title: '1 Action Waiting for Approval',
      message: 'Review cancellation request for duplicate CloudVault Plus ($14.99/mo).',
      timestamp: '2026-11-24T00:02:00Z',
      read: false,
      targetSection: 'approvals',
    },
    {
      id: 'notif-2',
      type: 'subscription',
      title: 'Upcoming Renewal in 9 Days',
      message: 'CloudVault Plus Legacy ($14.99) is scheduled to renew on Dec 3, 2026.',
      timestamp: '2026-11-24T00:01:15Z',
      read: false,
      targetSection: 'subscriptions',
    },
    {
      id: 'notif-3',
      type: 'refund',
      title: 'Zenith 15 Pro Warranty Ready to File',
      message: 'All supporting invoice & policy citations verified ($1,499.99 coverage).',
      timestamp: '2026-11-23T18:10:00Z',
      read: false,
      targetSection: 'refunds',
    },
    {
      id: 'notif-4',
      type: 'appointment',
      title: 'Calendar Busy Tomorrow Afternoon',
      message: 'Q4 Budget Planning (13:00) and Dental Checkup (15:30) confirmed on Nov 25.',
      timestamp: '2026-11-23T16:00:00Z',
      read: true,
      targetSection: 'appointments',
    },
  ];

  const settings: WorkspaceState['settings'] = {
    profile: {
      name: 'Kiran Kamat',
      email: 'kirankamat9a@gmail.com',
      timezone: 'America/Los_Angeles (PST)',
    },
    demoMode: true,
    requireHumanApprovalForEmails: true,
    requireHumanApprovalForCalendar: true,
    requireHumanApprovalForCancellations: true,
    googleWorkspaceConnected: false,
    notifications: {
      upcomingCharges: true,
      refundUpdates: true,
      warrantyDeadlines: true,
      pendingApprovals: true,
      appointmentReminders: true,
      mcpFailures: true,
    },
  };

  return {
    demoMode: true,
    referenceDate,
    cases,
    subscriptions,
    events,
    documents,
    emails,
    approvals,
    mcpServers,
    mcpHistory,
    agentRuns,
    chatMessages,
    activityTimeline,
    notifications,
    settings,
    tasksCompletedCount: 14,
  };
}

export class WorkspaceStore {
  private state: WorkspaceState;

  constructor() {
    this.state = createInitialWorkspaceState();
  }

  getState(): WorkspaceState {
    return this.state;
  }

  resetDemo(): WorkspaceState {
    this.state = createInitialWorkspaceState();
    return this.state;
  }
}

export const workspaceStore = new WorkspaceStore();
