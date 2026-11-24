import { ArrowRight, CheckCircle2, Clock, Cpu, ShieldAlert, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import type { AgentStatus, WorkspaceState } from '../shared/types';

interface ActivityMonitorViewProps {
  workspace: WorkspaceState;
}

function statusColor(status: AgentStatus): string {
  switch (status) {
    case 'Completed':
      return 'text-[#16A34A] border-[#BBF7D0] bg-[#F0FDF4]';
    case 'Processing':
      return 'text-[#0EA5E9] border-[#BAE6FD] bg-[#F0F9FF]';
    case 'Waiting for Approval':
      return 'text-[#B45309] border-[#FDE68A] bg-[#FFFBEB]';
    case 'Failed':
      return 'text-[#EF4444] border-[#FECACA] bg-[#FEF2F2]';
    default:
      return 'text-[#64748B] border-[#E8ECF3] bg-[#F8FAFC]';
  }
}

export function ActivityMonitorView({ workspace }: ActivityMonitorViewProps) {
  const latestRun = workspace.agentRuns[0];

  return (
    <div className="space-y-6">
      {/* Multi-Agent AI Monitor Pipeline */}
      <section className="bg-white border border-[#E8ECF3] rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-[16px] font-semibold text-[#172033]">
              Multi-Agent AI Monitor
            </h2>
            <p className="text-[13px] text-[#64748B]">
              Real-time orchestration pipeline across five specialised agents with human-gated execution
            </p>
          </div>
          {latestRun && (
            <span className="text-[12.5px] font-semibold text-[#635BFF]">
              Latest Run Status: {latestRun.overallStatus}
            </span>
          )}
        </div>

        {latestRun ? (
          <>
            <div className="p-3.5 rounded-lg bg-[#F8FAFC] border border-[#E8ECF3] flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <div>
                <span className="text-[#64748B]">Active Prompt: </span>
                <span className="font-semibold text-[#172033]">{latestRun.prompt}</span>
              </div>
              <span className="font-mono text-[11.5px] text-[#64748B] tabular-nums">
                {latestRun.startedAt.slice(0, 19).replace('T', ' ')}
              </span>
            </div>

            {/* Visual 5-Agent Horizontal Flow */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {latestRun.steps.map((step, index) => (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  className="relative flex flex-col justify-between p-4 rounded-xl border border-[#E8ECF3] bg-white space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-mono text-[11px] font-semibold text-[#64748B]">
                        0{index + 1}
                      </span>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${statusColor(
                          step.status
                        )}`}
                      >
                        {step.status}
                      </span>
                    </div>

                    <h3 className="font-display text-[13.5px] font-semibold text-[#172033] leading-snug">
                      {step.role}
                    </h3>

                    <p className="text-[12px] font-medium text-[#172033]">{step.currentTask}</p>
                    <p className="text-[12px] text-[#64748B] leading-snug">{step.taskSummary}</p>
                  </div>

                  <div className="pt-2.5 border-t border-[#E8ECF3] space-y-1">
                    {step.toolsInvoked.length > 0 && (
                      <div className="font-mono text-[11px] text-[#635BFF] space-y-0.5">
                        {step.toolsInvoked.map((t) => (
                          <p key={t} className="break-words">
                            {t}
                          </p>
                        ))}
                      </div>
                    )}
                    <p className="text-[11.5px] text-[#475569]">{step.executionResult}</p>
                    <p className="font-mono text-[10.5px] text-[#64748B] tabular-nums">
                      {step.timestamp.slice(11, 19)}
                    </p>
                  </div>

                  {index < latestRun.steps.length - 1 && (
                    <ArrowRight
                      aria-hidden="true"
                      className="hidden md:block h-4 w-4 text-[#94A3B8] absolute -right-2.5 top-1/2 -translate-y-1/2 bg-white rounded-full z-10"
                    />
                  )}
                </motion.div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[13px] text-[#64748B]">No multi-agent runs recorded yet.</p>
        )}
      </section>

      {/* Chronological Activity Timeline */}
      <section className="bg-white border border-[#E8ECF3] rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-[#172033]">
              Activity Timeline
            </h2>
            <p className="text-[12.5px] text-[#64748B]">
              Chronological log of agent investigations, MCP calls, document checks, and approval decisions
            </p>
          </div>
          <span className="text-[12px] text-[#64748B] tabular-nums">
            {workspace.activityTimeline.length} events
          </span>
        </div>

        <div className="divide-y divide-[#E8ECF3]">
          {workspace.activityTimeline.map((item) => (
            <div key={item.id} className="py-3.5 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                {item.category === 'approval' ? (
                  <ShieldAlert className="h-4.5 w-4.5 text-[#635BFF] shrink-0 mt-0.5" />
                ) : item.category === 'mcp' ? (
                  <Cpu className="h-4.5 w-4.5 text-[#0EA5E9] shrink-0 mt-0.5" />
                ) : item.category === 'document' ? (
                  <Clock className="h-4.5 w-4.5 text-[#F59E0B] shrink-0 mt-0.5" />
                ) : item.title.startsWith('Rejected') ? (
                  <XCircle className="h-4.5 w-4.5 text-[#EF4444] shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="h-4.5 w-4.5 text-[#16A34A] shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="text-[13.5px] font-semibold text-[#172033]">{item.title}</p>
                  <p className="text-[12.5px] text-[#64748B] mt-0.5">{item.description}</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono text-[11.5px] text-[#64748B] tabular-nums">
                  {item.timestamp.slice(0, 19).replace('T', ' ')}
                </p>
                <p className="text-[11px] text-[#64748B] mt-0.5">
                  {item.simulated ? 'Demo Sandbox' : 'Live'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
