import { CalendarCheck2, Clock, MapPin, PlusCircle, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import {
  detectCalendarConflicts,
  findAvailableSlots,
  validateAppointmentForm,
} from '../shared/domainLogic';
import type { NavSection, WorkspaceState } from '../shared/types';
import { HelpTip } from './HelpTip';

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
  const [location, setLocation] = useState('Google Meet (IST)');
  const [touchedTitle, setTouchedTitle] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
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

  const validation = validateAppointmentForm({
    title: meetingTitle,
    targetDate: selectedDate,
    durationMinutes,
  });
  const showTitleError = (touchedTitle || formSubmitted) && Boolean(validation.errors.title);
  const showDateError = formSubmitted && Boolean(validation.errors.targetDate);
  const showTimeError = formSubmitted && Boolean(validation.errors.time);

  const handleSearchSlots = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitted(true);
    if (!validation.valid) return;
    setBusy(true);
    try {
      await onFindSlots({ targetDate: selectedDate, durationMinutes, preferredPeriod });
    } finally {
      setBusy(false);
    }
  };

  const handleProposeSlot = async (start: string, end: string) => {
    setFormSubmitted(true);
    setTouchedTitle(true);
    if (!validation.valid) return;
    setBusy(true);
    try {
      await onProposeAppointment({
        title: meetingTitle.trim(),
        start,
        end,
        location: location.trim() || 'Google Meet (IST)',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Slot Finder & Conflict Check Bar with Inline Validation (Part A.6) */}
      <form
        noValidate
        onSubmit={handleSearchSlots}
        className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-5 space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
              Find a Conflict-Free Time Slot
            </h2>
            <HelpTip
              title="How Appointment Scheduling Works"
              description="Enter a meeting title, pick a day and window, and click Check Availability. Any slot you propose goes into the Approval Centre before it is added to your calendar."
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-start">
          <div className="lg:col-span-2">
            <label
              htmlFor="appt-title"
              className="block text-[12px] font-medium text-[#64748B] dark:text-slate-400 mb-1"
            >
              Proposed Meeting Title
            </label>
            <input
              id="appt-title"
              type="text"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              onBlur={() => setTouchedTitle(true)}
              aria-invalid={showTitleError}
              aria-describedby={showTitleError ? 'appt-title-err' : undefined}
              placeholder="e.g. Service Follow-Up Call"
              className={`w-full h-9 px-3 text-[13px] bg-[#F8FAFC] dark:bg-slate-800 border rounded-lg text-[#172033] dark:text-slate-100 focus:outline-none ${
                showTitleError
                  ? 'border-[#EF4444]'
                  : 'border-[#E8ECF3] dark:border-slate-700 focus:border-[#635BFF]'
              }`}
            />
            {showTitleError && (
              <p id="appt-title-err" role="alert" className="mt-1 text-[11.5px] text-[#EF4444] font-medium">
                {validation.errors.title}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="appt-location"
              className="block text-[12px] font-medium text-[#64748B] dark:text-slate-400 mb-1"
            >
              Location / Link
            </label>
            <input
              id="appt-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Google Meet (IST)"
              className="w-full h-9 px-3 text-[13px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 rounded-lg text-[#172033] dark:text-slate-100 focus:outline-none focus:border-[#635BFF]"
            />
          </div>

          <div>
            <label
              htmlFor="appt-date"
              className="block text-[12px] font-medium text-[#64748B] dark:text-slate-400 mb-1"
            >
              Target Date
            </label>
            <select
              id="appt-date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              aria-invalid={showDateError}
              className="w-full h-9 px-3 text-[13px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 rounded-lg text-[#172033] dark:text-slate-100 focus:outline-none focus:border-[#635BFF]"
            >
              {CALENDAR_DAYS.map((d) => (
                <option key={d.date} value={d.date}>
                  {d.label}
                </option>
              ))}
            </select>
            {showDateError && (
              <p role="alert" className="mt-1 text-[11.5px] text-[#EF4444] font-medium">
                {validation.errors.targetDate}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="appt-period"
              className="block text-[12px] font-medium text-[#64748B] dark:text-slate-400 mb-1"
            >
              Window &amp; Duration
            </label>
            <div className="flex gap-1.5">
              <select
                id="appt-period"
                aria-label="Preferred Window"
                value={preferredPeriod}
                onChange={(e) =>
                  setPreferredPeriod(e.target.value as 'Morning' | 'Afternoon' | 'Evening' | 'Any')
                }
                className="w-full h-9 px-2 text-[12.5px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 rounded-lg text-[#172033] dark:text-slate-100 focus:outline-none focus:border-[#635BFF]"
              >
                <option value="Afternoon">Afternoon</option>
                <option value="Morning">Morning</option>
                <option value="Evening">Evening</option>
                <option value="Any">Any Hours</option>
              </select>
              <select
                id="appt-duration"
                aria-label="Meeting Duration"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-20 shrink-0 h-9 px-2 text-[12.5px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 rounded-lg text-[#172033] dark:text-slate-100 focus:outline-none focus:border-[#635BFF]"
              >
                <option value={30}>30m</option>
                <option value={45}>45m</option>
                <option value={60}>60m</option>
              </select>
            </div>
            {showTimeError && (
              <p role="alert" className="mt-1 text-[11.5px] text-[#EF4444] font-medium">
                {validation.errors.time}
              </p>
            )}
          </div>

          <div className="lg:pt-5">
            <button
              type="submit"
              disabled={busy}
              className="w-full h-9 px-4 rounded-lg bg-[#635BFF] text-white text-[13px] font-semibold hover:bg-[#5249F5] disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {busy ? 'Checking Calendar...' : 'Check Availability'}
            </button>
          </div>
        </div>
      </form>

      {/* Interactive Multi-Day Calendar + Available Slots */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 3-Day Schedule Grid */}
        <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
                Calendar Schedule (Demo Sandbox)
              </h3>
              <p className="text-[12.5px] text-[#64748B] dark:text-slate-400">
                Confirmed events vs. conflict-free windows
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] dark:bg-slate-800 rounded-lg">
              {CALENDAR_DAYS.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setSelectedDate(d.date)}
                  className={`px-2.5 py-1 text-[12px] font-medium rounded-md transition-colors whitespace-nowrap ${
                    selectedDate === d.date
                      ? 'bg-white dark:bg-slate-900 text-[#172033] dark:text-slate-100 shadow-xs font-semibold'
                      : 'text-[#64748B] dark:text-slate-300 hover:text-[#172033] dark:hover:text-white'
                  }`}
                >
                  {d.date.slice(5)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {dayEvents.length === 0 ? (
              <div className="p-6 text-center rounded-lg bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700">
                <p className="text-[13.5px] font-semibold text-[#172033] dark:text-slate-100">
                  No busy blocks on {selectedDate}
                </p>
                <p className="text-[12.5px] text-[#64748B] dark:text-slate-400 mt-1">
                  All work hours are open. Pick a suggested slot on the right to propose a meeting.
                </p>
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
                    className="p-4 rounded-lg bg-[#F8FAFC] dark:bg-slate-800/70 border border-[#E8ECF3] dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12.5px] font-semibold text-[#635BFF] dark:text-indigo-300 tabular-nums">
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
                      <p className="text-[14px] font-semibold text-[#172033] dark:text-slate-100">
                        {ev.title}
                      </p>
                      <p className="text-[12px] text-[#64748B] dark:text-slate-400 flex items-center gap-1.5">
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
        <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
                Conflict-Free Suggested Slots
              </h3>
              <p className="text-[12.5px] text-[#64748B] dark:text-slate-400">
                {selectedDate} · {preferredPeriod} ({durationMinutes}m)
              </p>
            </div>
            <CalendarCheck2 className="h-5 w-5 text-[#0EA5E9]" />
          </div>

          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {availableSlots.length === 0 ? (
              <div className="p-4 rounded-lg bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 space-y-2">
                <p className="text-[13px] font-semibold text-[#172033] dark:text-slate-100">
                  No open slots in this window
                </p>
                <p className="text-[12px] text-[#64748B] dark:text-slate-400">
                  Try switching the preferred window to Any Hours or picking a shorter duration.
                </p>
                {preferredPeriod !== 'Any' && (
                  <button
                    type="button"
                    onClick={() => setPreferredPeriod('Any')}
                    className="px-3 py-1 rounded-md border border-[#E8ECF3] dark:border-slate-600 text-[12px] font-semibold text-[#635BFF] dark:text-indigo-300"
                  >
                    Show Any Work Hours
                  </button>
                )}
              </div>
            ) : (
              availableSlots.slice(0, 6).map((slot) => (
                <div
                  key={slot.start}
                  className="p-3.5 rounded-lg bg-[#F8FAFC] dark:bg-slate-800/70 border border-[#E8ECF3] dark:border-slate-700 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-mono text-[13px] font-semibold text-[#172033] dark:text-slate-100 tabular-nums flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-[#16A34A]" />
                      {slot.label}
                    </p>
                    <p className="text-[12px] text-[#64748B] dark:text-slate-400 mt-0.5">
                      {slot.reason}
                    </p>
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

          <div className="pt-3 border-t border-[#E8ECF3] dark:border-slate-800 flex items-center justify-between text-[12px] text-[#64748B] dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-[#635BFF]" />
              Proposed slots go to Approval Centre first
            </span>
            <button
              type="button"
              onClick={() => onNavigate('approvals')}
              className="font-semibold text-[#635BFF] dark:text-indigo-300 hover:underline whitespace-nowrap"
            >
              Approval Centre
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
