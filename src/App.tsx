import { CheckCircle2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  bulkDecideApprovals,
  decideApproval,
  fetchWorkspace,
  findCalendarSlotsApi,
  investigateCase,
  markAllNotificationsRead,
  prepareCaseComplaint,
  prepareSubscriptionCancellation,
  proposeAppointmentApi,
  resetDemoSandbox,
  runDemoScenario,
  sendAssistantPrompt,
  updateSettingsApi,
  uploadDocumentApi,
  type WorkspaceApiResponse,
} from './api/client';
import { ActivityMonitorView } from './components/ActivityMonitorView';
import { AppointmentsView } from './components/AppointmentsView';
import { ApprovalCentreView } from './components/ApprovalCentreView';
import { AssistantView } from './components/AssistantView';
import { DocumentsView } from './components/DocumentsView';
import { McpConnectionsView } from './components/McpConnectionsView';
import { OverviewView } from './components/OverviewView';
import { RefundWarrantyView } from './components/RefundWarrantyView';
import { SettingsView } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { SubscriptionsView } from './components/SubscriptionsView';
import { TopBar } from './components/TopBar';
import type { DocumentRecord, NavSection } from './shared/types';

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sendingChat, setSendingChat] = useState(false);
  const [busyScenario, setBusyScenario] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const showSuccess = (text: string) => {
    setBanner({ kind: 'success', text });
  };

  const showError = (err: unknown) => {
    setBanner({
      kind: 'error',
      text: err instanceof Error ? err.message : 'An unexpected error occurred.',
    });
  };

  const refresh = useCallback(async () => {
    try {
      const data = await fetchWorkspace();
      setWorkspace(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSendPrompt = async (
    prompt: string,
    attachments?: Array<{ name: string; mimeType: string; documentId?: string }>
  ) => {
    setSendingChat(true);
    setBanner(null);
    try {
      const res = await sendAssistantPrompt(prompt, attachments);
      setWorkspace(res.state);
      if (res.geminiError) {
        setBanner({
          kind: 'error',
          text: `Gemini API warning: ${res.geminiError}. Local MCP evidence was still compiled.`,
        });
      } else if (res.createdApproval) {
        showSuccess(`Staged approval request: ${res.createdApproval.title}`);
      }
    } catch (err) {
      showError(err);
    } finally {
      setSendingChat(false);
    }
  };

  const handleRunScenario = async (scenario: 1 | 2 | 3) => {
    setBusyScenario(scenario);
    setBanner(null);
    try {
      const res = await runDemoScenario(scenario);
      setWorkspace(res.state);
      setActiveSection('assistant');
      showSuccess(
        `Scenario ${scenario} completed via Multi-Agent MCP pipeline. Review the staged approval card.`
      );
    } catch (err) {
      showError(err);
    } finally {
      setBusyScenario(null);
    }
  };

  const handleDecideApproval = async (
    id: string,
    decision: 'approve' | 'reject' | 'edit',
    edits?: { subject?: string; messageContent?: string }
  ): Promise<string | void> => {
    setBanner(null);
    try {
      const res = await decideApproval(id, decision, edits);
      setWorkspace(res.state);
      if (decision === 'approve') {
        showSuccess(
          `Approved & simulated via Action MCP: ${res.approval.title} (Demo Sandbox only).`
        );
      } else if (decision === 'reject') {
        showSuccess(`Rejected: ${res.approval.title}. External action blocked.`);
      } else {
        showSuccess('Saved draft changes to approval request.');
      }
    } catch (err) {
      showError(err);
      return err instanceof Error ? err.message : 'An unexpected error occurred.';
    }
  };

  const handleBulkDecideApprovals = async (
    ids: string[],
    decision: 'approve' | 'reject'
  ): Promise<string | void> => {
    setBanner(null);
    try {
      const res = await bulkDecideApprovals(ids, decision);
      setWorkspace(res.state);
      const count = res.processed.length;
      if (decision === 'approve') {
        showSuccess(
          `Approved & simulated ${count} request${count === 1 ? '' : 's'} via Action MCP (Demo Sandbox only).`
        );
      } else {
        showSuccess(
          `Rejected ${count} request${count === 1 ? '' : 's'}. External actions blocked.`
        );
      }
      if (res.failures.length > 0) {
        return res.failures[0].error;
      }
    } catch (err) {
      showError(err);
      return err instanceof Error ? err.message : 'An unexpected error occurred.';
    }
  };

  const handleUploadDocument = async (
    file: File,
    docType: DocumentRecord['type'] = 'upload'
  ): Promise<{ id: string; fileName: string; mimeType: string } | null> => {
    setBanner(null);
    try {
      const base64Data = await readFileAsBase64(file);
      const res = await uploadDocumentApi({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64Data,
        type: docType,
      });
      setWorkspace(res.state);
      showSuccess(`Analyzed and indexed "${res.document.fileName}" via Document MCP.`);
      return {
        id: res.document.id,
        fileName: res.document.fileName,
        mimeType: res.document.mimeType,
      };
    } catch (err) {
      showError(err);
      return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E8ECF3] rounded-xl px-6 py-5 text-center space-y-2">
          <p className="font-display text-[16px] font-semibold text-[#172033]">
            Loading LIFEADMIN AI Workspace
          </p>
          <p className="text-[13px] text-[#64748B]">Connecting local MCP servers...</p>
        </div>
      </div>
    );
  }

  if (loadError || !workspace) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="bg-white border border-[#FECACA] rounded-xl p-6 max-w-md text-center space-y-3">
          <p className="font-display text-[16px] font-semibold text-[#EF4444]">
            Unable to Load Workspace
          </p>
          <p className="text-[13px] text-[#64748B]">{loadError ?? 'Server unavailable.'}</p>
          <button
            type="button"
            onClick={refresh}
            className="px-4 py-2 rounded-lg bg-[#635BFF] text-white text-[13px] font-semibold"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const pendingApprovalsCount = workspace.approvals.filter((a) => a.status === 'pending').length;
  const connectedMcpCount = workspace.mcpServers.filter((s) =>
    s.status.startsWith('Connected')
  ).length;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#172033] flex">
      <Sidebar
        activeSection={activeSection}
        onSelect={setActiveSection}
        pendingApprovalCount={pendingApprovalsCount}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          activeSection={activeSection}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          notifications={workspace.notifications}
          onMarkAllRead={async () => {
            const res = await markAllNotificationsRead();
            setWorkspace(res.state);
          }}
          onNavigate={setActiveSection}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          settings={workspace.settings}
          connectedMcpCount={connectedMcpCount}
          totalMcpCount={workspace.mcpServers.length}
        />

        <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto space-y-5">
          {banner && (
            <div
              role={banner.kind === 'error' ? 'alert' : 'status'}
              className={`px-4 py-3 rounded-xl border flex items-center justify-between gap-3 text-[13px] ${
                banner.kind === 'error'
                  ? 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
                  : 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
              }`}
            >
              <span className="flex items-center gap-2">
                {banner.kind === 'error' ? (
                  <XCircle className="h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                )}
                <span>{banner.text}</span>
              </span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="text-[12px] font-semibold underline shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {activeSection === 'overview' && (
            <OverviewView
              workspace={workspace}
              onNavigate={setActiveSection}
              onRunScenario={handleRunScenario}
              busyScenario={busyScenario}
            />
          )}

          {activeSection === 'assistant' && (
            <AssistantView
              workspace={workspace}
              geminiConfigured={workspace.geminiConfigured}
              onSendPrompt={handleSendPrompt}
              onUploadFile={(file) => handleUploadDocument(file, 'upload')}
              onApproveAction={async (id, decision) => {
                await handleDecideApproval(id, decision);
              }}
              onNavigate={setActiveSection}
              sending={sendingChat}
            />
          )}

          {activeSection === 'refunds' && (
            <RefundWarrantyView
              workspace={workspace}
              globalSearch={searchQuery}
              onInvestigateCase={async (caseId) => {
                try {
                  const res = await investigateCase(caseId);
                  setWorkspace(res.state);
                  showSuccess(`Re-evaluated warranty policy for ${res.case.product}.`);
                } catch (err) {
                  showError(err);
                }
              }}
              onPrepareComplaint={async (caseId) => {
                try {
                  const res = await prepareCaseComplaint(caseId);
                  setWorkspace(res.state);
                  showSuccess(`Warranty complaint staged in Approval Centre (${res.approval.title}).`);
                } catch (err) {
                  showError(err);
                }
              }}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === 'subscriptions' && (
            <SubscriptionsView
              workspace={workspace}
              globalSearch={searchQuery}
              onPrepareCancellation={async (subId) => {
                try {
                  const res = await prepareSubscriptionCancellation(subId);
                  setWorkspace(res.state);
                  showSuccess(`Prepared cancellation approval: ${res.approval.title}`);
                } catch (err) {
                  showError(err);
                }
              }}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === 'appointments' && (
            <AppointmentsView
              workspace={workspace}
              onFindSlots={async (params) => {
                try {
                  const res = await findCalendarSlotsApi(params);
                  setWorkspace(res.state);
                  showSuccess(`Found ${res.slots.length} conflict-free slot(s) on ${res.targetDate}.`);
                } catch (err) {
                  showError(err);
                }
              }}
              onProposeAppointment={async (params) => {
                try {
                  const res = await proposeAppointmentApi(params);
                  setWorkspace(res.state);
                  showSuccess(`Appointment staged in Approval Centre: ${res.approval.title}`);
                } catch (err) {
                  showError(err);
                }
              }}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === 'documents' && (
            <DocumentsView
              workspace={workspace}
              globalSearch={searchQuery}
              onUploadDocument={async (file, docType) => {
                await handleUploadDocument(file, docType);
              }}
            />
          )}

          {activeSection === 'activity' && <ActivityMonitorView workspace={workspace} />}

          {activeSection === 'approvals' && (
            <ApprovalCentreView
              workspace={workspace}
              onDecideApproval={handleDecideApproval}
              onBulkDecideApprovals={handleBulkDecideApprovals}
            />
          )}

          {activeSection === 'mcp' && (
            <McpConnectionsView workspace={workspace} onRefreshWorkspace={refresh} />
          )}

          {activeSection === 'settings' && (
            <SettingsView
              workspace={workspace}
              geminiConfigured={workspace.geminiConfigured}
              onUpdateSettings={async (payload) => {
                try {
                  const res = await updateSettingsApi(payload);
                  setWorkspace(res.state);
                } catch (err) {
                  showError(err);
                }
              }}
              onResetDemo={async () => {
                try {
                  const fresh = await resetDemoSandbox();
                  setWorkspace(fresh);
                  showSuccess('Demo Sandbox reset to initial state.');
                } catch (err) {
                  showError(err);
                }
              }}
              onRunScenario={handleRunScenario}
            />
          )}
        </main>

        <footer className="px-6 py-4 border-t border-[#E8ECF3] bg-white text-[12px] text-[#64748B] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>LIFEADMIN AI — "Your life has enough tasks. Let AI handle the paperwork."</span>
          <span>Make MCP Matter · Demo Sandbox Environment</span>
        </footer>
      </div>
    </div>
  );
}
