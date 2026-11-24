import { RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  bulkDecideApprovals,
  decideApproval,
  fetchHealth,
  fetchWorkspace,
  findCalendarSlotsApi,
  investigateCase,
  markAllNotificationsRead,
  prepareCaseComplaint,
  prepareSubscriptionCancellation,
  proposeAppointmentApi,
  refreshSubscriptionInsightsApi,
  resetDemoSandbox,
  runDemoScenario,
  streamAssistantPrompt,
  undoRejectedApprovalApi,
  updateSettingsApi,
  uploadDocumentApi,
  type WorkspaceApiResponse,
} from './api/client';
import { ActivityMonitorView } from './components/ActivityMonitorView';
import { AppointmentsView } from './components/AppointmentsView';
import { ApprovalCentreView } from './components/ApprovalCentreView';
import { AssistantView } from './components/AssistantView';
import { ConfirmModal } from './components/ConfirmModal';
import { DocumentsView } from './components/DocumentsView';
import { McpConnectionsView } from './components/McpConnectionsView';
import { OnboardingTourModal } from './components/OnboardingTourModal';
import { OverviewView } from './components/OverviewView';
import { RefundWarrantyView } from './components/RefundWarrantyView';
import { SettingsView } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { SubscriptionsView } from './components/SubscriptionsView';
import { ToastContainer, type ToastItem } from './components/ToastContainer';
import { TopBar } from './components/TopBar';
import { WorkspaceSkeleton } from './components/WorkspaceSkeleton';
import type { DocumentRecord, HealthResponse, NavSection } from './shared/types';

const DARK_MODE_KEY = 'lifeadmin_dark_mode';
const TOUR_SEEN_KEY = 'lifeadmin_tour_seen';

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
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [aiFallbackActive, setAiFallbackActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [sendingChat, setSendingChat] = useState(false);
  const [streamingStep, setStreamingStep] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [streamingTools, setStreamingTools] = useState<
    Array<{ server: string; tool: string; summary: string }>
  >([]);
  const streamAbortRef = useRef<AbortController | null>(null);

  const [busyScenario, setBusyScenario] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resettingDemo, setResettingDemo] = useState(false);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DARK_MODE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const [tourOpen, setTourOpen] = useState<boolean>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') return false;
      return localStorage.getItem(TOUR_SEEN_KEY) !== '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem(DARK_MODE_KEY, darkMode ? '1' : '0');
    } catch {
      // Ignore storage failures
    }
  }, [darkMode]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [activeSection]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
      const ttl = toast.kind === 'error' ? 7000 : 4500;
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, ttl);
    },
    []
  );

  const showSuccess = useCallback(
    (message: string, actionLabel?: string, onAction?: () => void) => {
      showToast({ kind: 'success', message, actionLabel, onAction });
    },
    [showToast]
  );

  const showError = useCallback(
    (err: unknown, retryAction?: () => void) => {
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Something went wrong. Please try again.';
      showToast({
        kind: 'error',
        message,
        actionLabel: retryAction ? 'Retry' : undefined,
        onAction: retryAction,
      });
    },
    [showToast]
  );

  const refresh = useCallback(async () => {
    try {
      const [wsRes, healthRes] = await Promise.all([
        fetchWorkspace(),
        fetchHealth().catch(() => null),
      ]);
      setWorkspace(wsRes);
      if (healthRes) {
        setHealth(healthRes);
        if (healthRes.geminiConfigured) setAiFallbackActive(false);
      }
      setLoadError(null);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Unable to connect to LIFEADMIN AI workspace.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCloseTour = useCallback(() => {
    setTourOpen(false);
    try {
      localStorage.setItem(TOUR_SEEN_KEY, '1');
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleStopStreaming = useCallback(() => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    setSendingChat(false);
    setStreamingStep(null);
    setStreamingText('');
    setStreamingTools([]);
    showToast({ kind: 'info', message: 'Stopped generating response.' });
  }, [showToast]);

  const handleSendPrompt = useCallback(
    async (
      prompt: string,
      attachments?: Array<{ name: string; mimeType: string; documentId?: string }>
    ) => {
      streamAbortRef.current?.abort();
      const controller = new AbortController();
      streamAbortRef.current = controller;

      setSendingChat(true);
      setStreamingStep('Understanding your request…');
      setStreamingText('');
      setStreamingTools([]);

      try {
        const res = await streamAssistantPrompt(prompt, attachments, {
          signal: controller.signal,
          onStep: (label) => setStreamingStep(label),
          onTool: (tool) => setStreamingTools((prev) => [...prev, tool]),
          onToken: (token) => setStreamingText((prev) => prev + token),
        });

        setWorkspace(res.state);
        setAiFallbackActive(Boolean(res.fallbackMode));

        if (res.geminiError) {
          showToast({
            kind: 'info',
            message: `Using fallback mode (${res.geminiError}). Local evidence was compiled.`,
          });
        } else if (res.createdApproval) {
          showSuccess(
            `Ready for your approval: ${res.createdApproval.plainSummary ?? res.createdApproval.title}`,
            'Review now',
            () => setActiveSection('approvals')
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        if (message !== 'Generation stopped.' && message !== 'Request cancelled.') {
          showError(err, () => {
            void handleSendPrompt(prompt, attachments);
          });
        }
      } finally {
        if (streamAbortRef.current === controller) {
          streamAbortRef.current = null;
        }
        setSendingChat(false);
        setStreamingStep(null);
        setStreamingText('');
        setStreamingTools([]);
      }
    },
    [showError, showSuccess, showToast]
  );

  const handleRunScenario = useCallback(
    async (scenario: 1 | 2 | 3) => {
      setBusyScenario(scenario);
      try {
        const res = await runDemoScenario(scenario);
        setWorkspace(res.state);
        setAiFallbackActive(Boolean(res.fallbackMode));
        setActiveSection('assistant');
        showSuccess(
          `Scenario ${scenario} ready. Review the staged action in Approval Centre.`,
          'Open Approval Centre',
          () => setActiveSection('approvals')
        );
      } catch (err) {
        showError(err, () => {
          void handleRunScenario(scenario);
        });
      } finally {
        setBusyScenario(null);
      }
    },
    [showError, showSuccess]
  );

  const handleDecideApproval = async (
    id: string,
    decision: 'approve' | 'reject' | 'edit',
    edits?: { subject?: string; messageContent?: string }
  ): Promise<string | void> => {
    try {
      const res = await decideApproval(id, decision, edits);
      setWorkspace(res.state);
      if (decision === 'approve') {
        showSuccess(`Approved & simulated in Demo Mode: ${res.approval.title}`);
      } else if (decision === 'reject') {
        showSuccess(
          `Rejected: ${res.approval.title}. External action blocked.`,
          'Undo reject',
          () => {
            void handleUndoRejectedApproval(id);
          }
        );
      } else {
        showSuccess('Saved draft changes.');
      }
    } catch (err) {
      showError(err);
      return err instanceof Error ? err.message : 'An unexpected error occurred.';
    }
  };

  const handleUndoRejectedApproval = async (id: string): Promise<string | void> => {
    try {
      const res = await undoRejectedApprovalApi(id);
      setWorkspace(res.state);
      showSuccess(`Restored "${res.approval.title}" back to pending.`);
    } catch (err) {
      showError(err);
      return err instanceof Error ? err.message : 'Unable to restore rejected approval.';
    }
  };

  const handleBulkDecideApprovals = async (
    ids: string[],
    decision: 'approve' | 'reject'
  ): Promise<string | void> => {
    try {
      const res = await bulkDecideApprovals(ids, decision);
      setWorkspace(res.state);
      const count = res.processed.length;
      if (decision === 'approve') {
        showSuccess(
          `Approved & simulated ${count} request${count === 1 ? '' : 's'} (Demo Mode).`
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

  const handleQuickAttachUpload = async (
    file: File,
    docType: DocumentRecord['type'] = 'upload'
  ): Promise<{ id: string; fileName: string; mimeType: string } | null> => {
    try {
      const base64Data = await readFileAsBase64(file);
      const res = await uploadDocumentApi({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64Data,
        type: docType,
      });
      setWorkspace(res.state);
      showSuccess(`Scanned and saved "${res.document.fileName}" to your vault.`);
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

  const handleConfirmResetDemo = async () => {
    setResettingDemo(true);
    try {
      const fresh = await resetDemoSandbox();
      setWorkspace(fresh);
      setAiFallbackActive(false);
      setResetConfirmOpen(false);
      showSuccess('Demo workspace reset to its initial state.');
    } catch (err) {
      showError(err);
    } finally {
      setResettingDemo(false);
    }
  };

  if (loading) {
    return <WorkspaceSkeleton />;
  }

  if (loadError || !workspace) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-white dark:bg-slate-900 border border-[#FECACA] dark:border-red-800 rounded-xl p-6 max-w-md text-center space-y-3 shadow-sm">
          <p className="font-display text-[16px] font-semibold text-[#EF4444]">
            Unable to Load Workspace
          </p>
          <p className="text-[13px] text-[#64748B] dark:text-slate-300">
            {loadError ?? 'The local server is unavailable right now.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              refresh();
            }}
            className="px-4 py-2 rounded-lg bg-[#635BFF] text-white text-[13px] font-semibold hover:bg-[#5249F5]"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const pendingApprovalsCount = workspace.approvals.filter((a) => a.status === 'pending').length;
  const aiOnline =
    Boolean(health?.geminiConfigured ?? workspace.geminiConfigured) && !aiFallbackActive;

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-[#172033] dark:text-slate-100 flex">
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
            try {
              const res = await markAllNotificationsRead();
              setWorkspace(res.state);
              showSuccess('Marked all notifications as read.');
            } catch (err) {
              showError(err);
            }
          }}
          onNavigate={setActiveSection}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          settings={workspace.settings}
          aiOnline={aiOnline}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((prev) => !prev)}
          onRequestResetDemo={() => setResetConfirmOpen(true)}
        />

        {/* Mobile Demo Mode Status Strip */}
        {workspace.settings.demoMode && (
          <div className="sm:hidden px-4 py-2 bg-[#FEF3C7]/80 dark:bg-amber-950/70 border-b border-[#FDE68A] dark:border-amber-800 flex items-center justify-between gap-2 text-[11.5px] text-[#92400E] dark:text-amber-200">
            <span className="font-medium">Demo Mode: actions are simulated</span>
            <button
              type="button"
              onClick={() => setResetConfirmOpen(true)}
              className="inline-flex items-center gap-1 font-semibold underline"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset demo data</span>
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto space-y-5">
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
              aiOnline={aiOnline}
              onSendPrompt={handleSendPrompt}
              onStopStreaming={handleStopStreaming}
              onUploadFile={(file) => handleQuickAttachUpload(file, 'upload')}
              onApproveAction={async (id, decision) => {
                await handleDecideApproval(id, decision);
              }}
              onNavigate={setActiveSection}
              sending={sendingChat}
              streamingStep={streamingStep}
              streamingText={streamingText}
              streamingTools={streamingTools}
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
                  showSuccess(`Re-checked warranty policy for ${res.case.product}.`);
                } catch (err) {
                  showError(err);
                }
              }}
              onPrepareComplaint={async (caseId) => {
                try {
                  const res = await prepareCaseComplaint(caseId);
                  setWorkspace(res.state);
                  showSuccess(
                    `Warranty claim staged in Approval Centre (${res.approval.title}).`,
                    'Open Approval Centre',
                    () => setActiveSection('approvals')
                  );
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
                  showSuccess(
                    `Prepared cancellation approval: ${res.approval.title}`,
                    'Review approval',
                    () => setActiveSection('approvals')
                  );
                } catch (err) {
                  showError(err);
                }
              }}
              onRefreshInsights={async () => {
                try {
                  const res = await refreshSubscriptionInsightsApi();
                  setWorkspace(res.state);
                  if (res.fallbackUsed) {
                    showToast({
                      kind: 'info',
                      message: `Updated subscription insights using local rules (${res.geminiWarning ?? 'AI offline'}).`,
                    });
                  } else {
                    showSuccess('Updated subscription savings insights with Gemini AI.');
                  }
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
                  showSuccess(`Found ${res.slots.length} open slot(s) on ${res.targetDate}.`);
                } catch (err) {
                  showError(err);
                }
              }}
              onProposeAppointment={async (params) => {
                try {
                  const res = await proposeAppointmentApi(params);
                  setWorkspace(res.state);
                  showSuccess(
                    `Appointment staged in Approval Centre: ${res.approval.title}`,
                    'Review approval',
                    () => setActiveSection('approvals')
                  );
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
              onSaveExtractedDocument={async (params) => {
                try {
                  const res = await uploadDocumentApi(params);
                  setWorkspace(res.state);
                  showSuccess(`Saved "${res.document.fileName}" to your Document Vault.`);
                } catch (err) {
                  showError(err);
                  throw err;
                }
              }}
            />
          )}

          {activeSection === 'activity' && <ActivityMonitorView workspace={workspace} />}

          {activeSection === 'approvals' && (
            <ApprovalCentreView
              workspace={workspace}
              onDecideApproval={handleDecideApproval}
              onBulkDecideApprovals={handleBulkDecideApprovals}
              onUndoRejectedApproval={handleUndoRejectedApproval}
            />
          )}

          {activeSection === 'mcp' && (
            <McpConnectionsView
              workspace={workspace}
              onRefreshWorkspace={refresh}
              onToolFeedback={(kind, message) => showToast({ kind, message })}
            />
          )}

          {activeSection === 'settings' && (
            <SettingsView
              workspace={workspace}
              aiOnline={aiOnline}
              onUpdateSettings={async (payload) => {
                try {
                  const res = await updateSettingsApi(payload);
                  setWorkspace(res.state);
                  showSuccess('Settings updated.');
                } catch (err) {
                  showError(err);
                }
              }}
              onRequestResetDemo={() => setResetConfirmOpen(true)}
              onRunScenario={handleRunScenario}
              onShowTour={() => setTourOpen(true)}
            />
          )}
        </main>

        <footer className="px-6 py-4 border-t border-[#E8ECF3] dark:border-slate-800 bg-white dark:bg-slate-900 text-[12px] text-[#64748B] dark:text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>LIFEADMIN AI — &quot;Less time managing life. More time living it.&quot;</span>
          <span>Demo Mode: actions are simulated safely</span>
        </footer>
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <OnboardingTourModal
        open={tourOpen}
        onClose={handleCloseTour}
        onTryScenario={() => {
          void handleRunScenario(1);
        }}
      />

      <ConfirmModal
        open={resetConfirmOpen}
        title="Reset demo data?"
        description="This will restore all sample emails, warranty cases, subscriptions, calendar events, and pending approvals back to their starting state."
        confirmLabel="Reset demo data"
        busy={resettingDemo}
        onConfirm={handleConfirmResetDemo}
        onCancel={() => {
          if (!resettingDemo) setResetConfirmOpen(false);
        }}
      />
    </div>
  );
}
