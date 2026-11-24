export function WorkspaceSkeleton() {
  return (
    <div
      className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 flex"
      aria-busy="true"
      aria-label="Loading LIFEADMIN AI Workspace"
    >
      <div className="hidden lg:block w-64 shrink-0 border-r border-[#E8ECF3] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="h-8 w-40 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="space-y-2.5 pt-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="h-9 rounded-lg bg-slate-100 dark:bg-slate-800/70 animate-pulse"
            />
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="h-16 border-b border-[#E8ECF3] dark:border-slate-800 bg-white dark:bg-slate-900 px-6 flex items-center justify-between">
          <div className="h-5 w-36 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="h-8 w-56 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
        </div>
        <div className="p-6 max-w-[1400px] w-full mx-auto space-y-6">
          <div className="h-36 rounded-xl bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-28 rounded-xl bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 animate-pulse"
              />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 rounded-xl bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 animate-pulse" />
            <div className="h-64 rounded-xl bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
