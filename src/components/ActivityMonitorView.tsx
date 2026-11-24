import { ArrowRight, CheckCircle2, Clock, Cpu, ShieldAlert, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import type { AgentStatus, WorkspaceState } from '../shared/types';
import { HelpTip } from './HelpTip';

interface ActivityMonitorViewProps {
  workspace: WorkspaceState;
}

function statusColor(status: AgentStatus): string {
  switch (status) {
    case 'Completed':
      return 'text-[#16A34A] border-[#BBF7D0] dark:border-emerald-800 bg-[#F0FDF4] dark:bg-emerald-950/60';
    case 'Processing':
      return 'text-[#0EA5E9] border-[#BAE6FD] dark:border-sky-800 bg-[#F0F9FF] dark:bg-sky-950/60';
    case 'Waiting for Approval':
      return 'text-[#B45309] dark:text-amber-300 border-[#FDE68A] dark:border-amber-800 bg-[#FFFBEB] dark:bg-amber-950/60';
    case 'Failed':
      return 'text-[#EF4444] border-[#FECACA] dark:border-red-800 bg-[#FEF2F2] dark:bg-red-950/60';
    default:
      return 'text-[#64748B] dark:text-slate-300 border-[#E8ECF3] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800';
  }
}

export function ActivityMonitorView({ workspace }: ActivityMonitorViewProps) {
  const latestRun = workspace.agentRuns[0];

  return (
    <div className="space-y-6">
      {/* 5-Step Assistant Workflow */}
      <section className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-[16px] font-semibold text-[#172033] dark:text-slate-100">
                5-Step Assistant Workflow
              </h2>
              <HelpTip
                title="How Your Request Is Processed"
                description="Every question goes through five transparent steps: understanding your request, searching records, verifying facts, drafting an action, and pausing for your approval."
              />
            </div>
            <p className="text-[13px] text-[#64748B] dark:text-slate-400">
              Step-by-step trace of how the assistant gathered evidence and paused before taking external action
            </p>
          </div>
          {latestRun && (
            <span className="text-[12.5px] font-semibold text-[#635BFF] dark:text-indigo-300">
              Latest Run: {latestRun.overallStatus}
            </span>
          )}
        </div>

        {latestRun ? (
          <>
            <div className="p-3.5 rounded-lg bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <div>
                <span className="text-[#64748B] dark:text-slate-400">Latest Request: </span>
                <span className="font-semibold text-[#172033] dark:text-slate-100">
                  {latestRun.prompt}
                </span>
              </div>
              <span className="font-mono text-[11.5px] text-[#64748B] dark:text-slate-400 tabular-nums">
                {latestRun.startedAt.slice(0, 19).replace('T', ' ')}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {latestRun.steps.map((step, index) => (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  className="relative flex flex-col justify-between p-4 rounded-xl border border-[#E8ECF3] dark:border-slate-700 bg-white dark:bg-slate-800/70 space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-mono text-[11px] font-semibold text-[#64748B] dark:text-slate-400">
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

                    <h3 className="font-display text-[13.5px] font-semibold text-[#172033] dark:text-slate-100 leading-snug">
                      {step.role}
                    </h3>

                    <p className="text-[12px] font-medium text-[#172033] dark:text-slate-200">
                      {step.currentTask}
                    </p>
                    <p className="text-[12px] text-[#64748B] dark:text-slate-400 leading-snug">
                      {step.taskSummary}
                    </p>
                  </div>

                  <div className="pt-2.5 border-t border-[#E8ECF3] dark:border-slate-700 space-y-1">
                    {step.toolsInvoked.length > 0 && (
                      <div className="font-mono text-[11px] text-[#635BFF] dark:text-indigo-300 space-y-0.5">
                        {step.toolsInvoked.map((t) => (
                          <p key={t} className="break-words">
                            {t}
                          </p>
                        ))}
                      </div>
                    )}
                    <p className="text-[11.5px] text-[#475569] dark:text-slate-300">
                      {step.executionResult}
                    </p>
                    <p className="font-mono text-[10.5px] text-[#64748B] dark:text-slate-400 tabular-nums">
                      {step.timestamp.slice(11, 19)}
                    </p>
                  </div>

                  {index < latestRun.steps.length - 1 && (
                    <ArrowRight
                      aria-hidden="true"
                      className="hidden md:block h-4 w-4 text-[#94A3B8] absolute -right-2.5 top-1/2 -translate-y-1/2 bg-white dark:bg-slate-900 rounded-full z-10"
                    />
                  )}
                </motion.div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[13px] text-[#64748B] dark:text-slate-400">
            No workflow runs recorded yet. Ask a question in AI Assistant to inspect the steps here.
          </p>
        )}
      </section>

      {/* Chronological Activity Timeline */}
      <section className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
              Activity Timeline
            </h2>
            <p className="text-[12.5px] text-[#64748B] dark:text-slate-400">
              Chronological log of investigations, connected tool checks, document scans, and your approval decisions
            </p>
          </div>
          <span className="text-[12px] text-[#64748B] dark:text-slate-400 tabular-nums">
            {workspace.activityTimeline.length} events
          </span>
        </div>

        {workspace.activityTimeline.length === 0 ? (
          <p className="text-[13px] text-[#64748B] dark:text-slate-400 py-4 text-center">
            No activity events recorded yet.
          </p>
        ) : (
          <div className="divide-y divide-[#E8ECF3] dark:divide-slate-800">
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
                    <p className="text-[13.5px] font-semibold text-[#172033] dark:text-slate-100">
                      {item.title}
                    </p>
                    <p className="text-[12.5px] text-[#64748B] dark:text-slate-400 mt-0.5">
                      {item.description}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-[11.5px] text-[#64748B] dark:text-slate-400 tabular-nums">
                    {item.timestamp.slice(0, 19).replace('T', ' ')}
                  </p>
                  <p className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5">
                    {item.simulated ? 'Demo Sandbox' : 'Live'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
