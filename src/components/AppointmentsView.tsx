import { CalendarCheck2, Clock, MapPin, PlusCircle, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { detectCalendarConflicts, findAvailableSlots } from '../shared/domainLogic';
import type { NavSection, WorkspaceState } from '../shared/types';

interface AppointmentsViewProps {
  workspace: WorkspaceState;
  onFindSlots: (params: {
    targetDate: string;
    durationMinutes: number;
    preferredPeriod: 'Morning' | 'Afternoon' | 'Evening' | 'Any';
  }) => Promise<void>;
  onProposeAppointment: (params: {
    title: string;
    start: string;
    end: string;
    location: string;
  }) => Promise<void>;
  onNavigate: (section: NavSection) => void;
}

const CALENDAR_DAYS = [
  { date: '2026-11-24', label: 'Tue · Nov 24 (Today)' },
  { date: '2026-11-25', label: 'Wed · Nov 25 (Tomorrow)' },
  { date: '2026-11-26', label: 'Thu · Nov 26' },
];

export function AppointmentsView({
  workspace,
  onFindSlots,
  onProposeAppointment,
  onNavigate,
}: AppointmentsViewProps) {
  const [selectedDate, setSelectedDate] = useState('2026-11-25');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [preferredPeriod, setPreferredPeriod] = useState<'Morning' | 'Afternoon' | 'Evening' | 'Any'>(
    'Afternoon'
  );
  const [meetingTitle, setMeetingTitle] = useState('Product & Ops Follow-Up');
  const [location, setLocation] = useState('Video Call');
  const [busy, setBusy] = useState(false);

  const dayEvents = workspace.events
    .filter((e) => e.start.startsWith(selectedDate))
    .sort((a, b) => a.start.localeCompare(b.start));

  const availableSlots = findAvailableSlots({
    events: workspace.events,
    targetDate: selectedDate,
    durationMinutes,
    preferredPeriod,
  });

  const handleSearchSlots = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onFindSlots({ targetDate: selectedDate, durationMinutes, preferredPeriod });
    } finally {
      setBusy(false);
    }
  };

  const handleProposeSlot = async (start: string, end: string) => {
    if (!meetingTitle.trim()) return;
    setBusy(true);
    try {
      await onProposeAppointment({
        title: meetingTitle.trim(),
        start,
        end,
        location: location.trim() || 'Video Call',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Slot Finder & Conflict Check Bar */}
      <form
        onSubmit={handleSearchSlots}
        className="bg-white border border-[#E8ECF3] rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end"
      >
        <div>
          <label htmlFor="appt-title" className="block text-[12px] font-medium text-[#64748B] mb-1">
            Proposed Meeting Title
          </label>
          <input
            id="appt-title"
            type="text"
            value={meetingTitle}
            onChange={(e) => setMeetingTitle(e.target.value)}
            required
            className="w-full h-9 px-3 text-[13px] bg-[#F8FAFC] border border-[#E8ECF3] rounded-lg text-[#172033] focus:outline-none focus:border-[#635BFF]"
          />
        </div>

        <div>
          <label htmlFor="appt-date" className="block text-[12px] font-medium text-[#64748B] mb-1">
            Target Date
          </label>
          <select
            id="appt-date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full h-9 px-3 text-[13px] bg-[#F8FAFC] border border-[#E8ECF3] rounded-lg text-[#172033] focus:outline-none focus:border-[#635BFF]"
          >
            {CALENDAR_DAYS.map((d) => (
              <option key={d.date} value={d.date}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="appt-period" className="block text-[12px] font-medium text-[#64748B] mb-1">
            Preferred Window
          </label>
          <select
            id="appt-period"
            value={preferredPeriod}
            onChange={(e) =>
              setPreferredPeriod(e.target.value as 'Morning' | 'Afternoon' | 'Evening' | 'Any')
            }
            className="w-full h-9 px-3 text-[13px] bg-[#F8FAFC] border border-[#E8ECF3] rounded-lg text-[#172033] focus:outline-none focus:border-[#635BFF]"
          >
            <option value="Afternoon">Afternoon (12:00–17:00)</option>
            <option value="Morning">Morning (09:00–12:00)</option>
            <option value="Evening">Evening (17:00–18:00)</option>
            <option value="Any">Any Work Hours</option>
          </select>
        </div>

        <div>
          <label htmlFor="appt-duration" className="block text-[12px] font-medium text-[#64748B] mb-1">
            Duration
          </label>
          <select
            id="appt-duration"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="w-full h-9 px-3 text-[13px] bg-[#F8FAFC] border border-[#E8ECF3] rounded-lg text-[#172033] focus:outline-none focus:border-[#635BFF]"
          >
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
            <option value={60}>60 minutes</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="h-9 px-4 rounded-lg bg-[#635BFF] text-white text-[13px] font-semibold hover:bg-[#5249F5] disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {busy ? 'Checking MCP...' : 'Check Availability'}
        </button>
      </form>

      {/* Interactive Multi-Day Calendar + Available Slots */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 3-Day Schedule Grid */}
        <section className="lg:col-span-7 bg-white border border-[#E8ECF3] rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-[15px] font-semibold text-[#172033]">
                Interactive Calendar Schedule (Demo Sandbox)
              </h2>
              <p className="text-[12.5px] text-[#64748B]">
                Confirmed events vs. conflict-free windows
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg">
              {CALENDAR_DAYS.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setSelectedDate(d.date)}
                  className={`px-2.5 py-1 text-[12px] font-medium rounded-md transition-colors whitespace-nowrap ${
                    selectedDate === d.date
                      ? 'bg-white text-[#172033] shadow-xs font-semibold'
                      : 'text-[#64748B] hover:text-[#172033]'
                  }`}
                >
                  {d.date.slice(5)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {dayEvents.length === 0 ? (
              <div className="p-6 text-center rounded-lg bg-[#F8FAFC] border border-[#E8ECF3]">
                <p className="text-[13.5px] font-semibold text-[#172033]">No busy blocks on {selectedDate}</p>
                <p className="text-[12.5px] text-[#64748B] mt-1">All work hours are open.</p>
              </div>
            ) : (
              dayEvents.map((ev) => {
                const overlaps = detectCalendarConflicts(
                  dayEvents.filter((other) => other.id !== ev.id),
                  ev.start,
                  ev.end
                );
                return (
                  <div
                    key={ev.id}
                    className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E8ECF3] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12.5px] font-semibold text-[#635BFF] tabular-nums">
                          {ev.start.slice(11, 16)} – {ev.end.slice(11, 16)}
                        </span>
                        <span className="text-[11.5px] font-medium text-[#16A34A]">
                          {ev.source === 'approved_action' ? 'Approved & Added' : 'Confirmed Busy'}
                        </span>
                        {overlaps.length > 0 && (
                          <span className="text-[11.5px] font-semibold text-[#EF4444]">
                            Conflict Detected
                          </span>
                        )}
                      </div>
                      <p className="text-[14px] font-semibold text-[#172033]">{ev.title}</p>
                      <p className="text-[12px] text-[#64748B] flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>{ev.location}</span>
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Suggested Conflict-Free Slots */}
        <section className="lg:col-span-5 bg-white border border-[#E8ECF3] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-[15px] font-semibold text-[#172033]">
                Conflict-Free Suggested Slots
              </h3>
              <p className="text-[12.5px] text-[#64748B]">
                {selectedDate} · {preferredPeriod} ({durationMinutes}m)
              </p>
            </div>
            <CalendarCheck2 className="h-5 w-5 text-[#0EA5E9]" />
          </div>

          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {availableSlots.length === 0 ? (
              <p className="text-[13px] text-[#64748B]">
                No conflict-free slots match this filter. Try switching window to Any Work Hours.
              </p>
            ) : (
              availableSlots.slice(0, 6).map((slot) => (
                <div
                  key={slot.start}
                  className="p-3.5 rounded-lg bg-[#F8FAFC] border border-[#E8ECF3] flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-mono text-[13px] font-semibold text-[#172033] tabular-nums flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-[#16A34A]" />
                      {slot.label}
                    </p>
                    <p className="text-[12px] text-[#64748B] mt-0.5">{slot.reason}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleProposeSlot(slot.start, slot.end)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#635BFF] text-white text-[12px] font-semibold hover:bg-[#5249F5] disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    Propose Slot
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="pt-3 border-t border-[#E8ECF3] flex items-center justify-between text-[12px] text-[#64748B]">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-[#635BFF]" />
              Proposed slots go to Approval Centre first
            </span>
            <button
              type="button"
              onClick={() => onNavigate('approvals')}
              className="font-semibold text-[#635BFF] hover:underline whitespace-nowrap"
            >
              Approval Centre
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
