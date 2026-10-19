import React, { useEffect, useState } from 'react';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Coffee, 
  List, 
  Grid,
  CalendarCheck
} from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { fmtDate, fmtDuration, fmtTime } from '../../services/format';
import type { AttendanceCalendarDay, AttendanceCalendarResponse } from '../../types';

interface ViewAttendanceModalProps {
  onClose: () => void;
}

export default function ViewAttendanceModal({ onClose }: ViewAttendanceModalProps) {
  const now = new Date();
  const [currentYear, setCurrentYear] = useState<number>(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(now.getMonth() + 1);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [selectedDay, setSelectedDay] = useState<AttendanceCalendarDay | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [calendarData, setCalendarData] = useState<AttendanceCalendarResponse | null>(null);

  const fetchCalendar = async (year: number, month: number) => {
    setLoading(true);
    setError('');
    setSelectedDay(null);
    try {
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      const res = await api.get<AttendanceCalendarResponse>(`/me/attendance/calendar/?month=${monthStr}`);
      setCalendarData(res.data);
      // Auto select today if in current month
      const todayMatch = res.data.days.find(d => d.is_today);
      if (todayMatch) {
        setSelectedDay(todayMatch);
      } else if (res.data.days.length > 0) {
        setSelectedDay(res.data.days[0]);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendar(currentYear, currentMonth);
  }, [currentYear, currentMonth]);

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // Status color pill generator
  const getStatusBadge = (status: AttendanceCalendarDay['status']) => {
    switch (status) {
      case 'PRESENT':
        return { label: 'Present', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' };
      case 'ABSENT':
        return { label: 'Absent', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' };
      case 'LEAVE':
        return { label: 'On Leave', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' };
      case 'HOLIDAY':
        return { label: 'Holiday', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' };
      case 'WEEKLY_OFF':
        return { label: 'Weekly Off', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', dot: 'bg-slate-400' };
      case 'PENDING_DUTY':
        return { label: 'Pending Duty', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' };
      default:
        return { label: 'Scheduled', bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200', dot: 'bg-slate-300' };
    }
  };

  // Determine leading blank days for 1st day of month
  const firstDayWeekday = calendarData && calendarData.days.length > 0
    ? new Date(currentYear, currentMonth - 1, 1).getDay()
    : 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex justify-center items-end sm:items-center sm:p-4">
      <div className="bg-slate-50 w-full max-w-md h-[95vh] sm:h-[840px] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
        
        {/* Sticky Header */}
        <header className="px-4 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={onClose}
              aria-label="Back to Profile"
              className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95 transition-all"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">View Attendance</h2>
              <p className="text-[11px] text-slate-500">Monthly Calendar & Work Logs</p>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'calendar' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              title="Calendar View"
              aria-label="Calendar View"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              title="List View"
              aria-label="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Month Selector Bar */}
        <div className="bg-white px-4 py-2.5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Previous month"
            className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 active:scale-95 transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center">
            <span className="text-sm font-bold text-slate-900 tracking-wide">
              {calendarData?.month_name || '—'} {currentYear}
            </span>
          </div>
          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Next month"
            className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 active:scale-95 transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {loading && (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">Loading attendance records...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && calendarData && (
            <>
              {/* Monthly Summary Statistics Bar */}
              <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                  MONTHLY SUMMARY
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl py-2 px-1">
                    <span className="block text-base font-extrabold text-emerald-700">
                      {calendarData.summary.present_days}
                    </span>
                    <span className="text-[10px] font-medium text-emerald-800">Present</span>
                  </div>
                  <div className="bg-rose-50/70 border border-rose-100 rounded-xl py-2 px-1">
                    <span className="block text-base font-extrabold text-rose-700">
                      {calendarData.summary.absent_days}
                    </span>
                    <span className="text-[10px] font-medium text-rose-800">Absent</span>
                  </div>
                  <div className="bg-amber-50/70 border border-amber-100 rounded-xl py-2 px-1">
                    <span className="block text-base font-extrabold text-amber-700">
                      {calendarData.summary.leave_days}
                    </span>
                    <span className="text-[10px] font-medium text-amber-800">Leave</span>
                  </div>
                  <div className="bg-purple-50/70 border border-purple-100 rounded-xl py-2 px-1">
                    <span className="block text-base font-extrabold text-purple-700">
                      {calendarData.summary.holiday_days}
                    </span>
                    <span className="text-[10px] font-medium text-purple-800">Holiday</span>
                  </div>
                </div>
                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 px-1">
                  <span>Weekly Offs: <strong className="text-slate-700">{calendarData.summary.weekly_off_days}</strong></span>
                  <span>Total Work Hours: <strong className="text-emerald-700 font-mono">{calendarData.summary.total_hours}</strong></span>
                </div>
              </div>

              {/* View Mode A: Calendar View */}
              {viewMode === 'calendar' && (
                <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-sm space-y-2">
                  {/* Weekday headers */}
                  <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-400 uppercase py-1">
                    <span className="text-rose-400">Sun</span>
                    <span>Mon</span>
                    <span>Tue</span>
                    <span>Wed</span>
                    <span>Thu</span>
                    <span>Fri</span>
                    <span>Sat</span>
                  </div>

                  {/* Day tiles grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {/* Leading blanks */}
                    {Array.from({ length: firstDayWeekday }).map((_, i) => (
                      <div key={`blank-${i}`} className="aspect-square rounded-lg bg-slate-50/40" />
                    ))}

                    {/* Active days */}
                    {calendarData.days.map((day) => {
                      const isSelected = selectedDay?.date === day.date;
                      const badge = getStatusBadge(day.status);

                      return (
                        <button
                          key={day.date}
                          type="button"
                          onClick={() => setSelectedDay(day)}
                          className={`aspect-square min-h-[44px] rounded-xl flex flex-col items-center justify-center p-1 transition-all relative border ${
                            isSelected 
                              ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20 shadow-sm' 
                              : 'border-slate-100 bg-white hover:bg-slate-50'
                          } ${day.is_today ? 'font-bold' : ''}`}
                        >
                          <span className={`text-xs ${day.is_today ? 'text-emerald-600 font-extrabold' : 'text-slate-700'}`}>
                            {day.day}
                          </span>
                          
                          {/* Dot indicator */}
                          <span 
                            className={`w-1.5 h-1.5 rounded-full mt-1 ${badge.dot}`}
                            title={badge.label}
                          />

                          {day.is_today && (
                            <span className="absolute top-1 right-1 w-1 h-1 bg-emerald-500 rounded-full" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Day Detail Card (Shows when a day is selected in calendar view) */}
              {viewMode === 'calendar' && selectedDay && (
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">
                        {selectedDay.day_name}, {fmtDate(selectedDay.date)}
                      </h4>
                      {selectedDay.is_today && (
                        <span className="text-[10px] text-emerald-600 font-semibold">Today's Attendance</span>
                      )}
                    </div>
                    {(() => {
                      const b = getStatusBadge(selectedDay.status);
                      return (
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${b.bg} ${b.text} ${b.border}`}>
                          {b.label}
                        </span>
                      );
                    })()}
                  </div>

                  {selectedDay.session ? (
                    <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Punch In</span>
                        <span className="font-semibold text-slate-800">
                          {fmtTime(selectedDay.session.punch_in_at)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Punch Out</span>
                        <span className="font-semibold text-slate-800">
                          {selectedDay.session.punch_out_at ? fmtTime(selectedDay.session.punch_out_at) : 'Active / Working'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Work Duration</span>
                        <span className="font-mono font-bold text-emerald-700">
                          {fmtDuration(selectedDay.session.duration_seconds)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Tracking Interruptions</span>
                        <span className="font-medium text-slate-700">
                          {selectedDay.session.interruptions_count || 0} incidents
                        </span>
                      </div>
                    </div>
                  ) : selectedDay.holiday ? (
                    <div className="p-3 bg-purple-50 rounded-xl border border-purple-100 text-xs text-purple-900">
                      <strong>{selectedDay.holiday.name}</strong>
                      <span className="block text-[11px] text-purple-700 mt-0.5">
                        Type: {selectedDay.holiday.type} Holiday
                      </span>
                    </div>
                  ) : selectedDay.leave ? (
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-xs text-amber-900">
                      <strong>Approved Leave: {selectedDay.leave.type}</strong>
                      <span className="block text-[11px] text-amber-700 mt-0.5">
                        {selectedDay.leave.is_half_day ? 'Half Day' : 'Full Day'} Leave
                      </span>
                    </div>
                  ) : selectedDay.status === 'WEEKLY_OFF' ? (
                    <p className="text-xs text-slate-500 italic p-2">
                      Weekly Off (Sunday). No scheduled shift.
                    </p>
                  ) : selectedDay.status === 'ABSENT' ? (
                    <p className="text-xs text-rose-600 bg-rose-50/70 p-2.5 rounded-lg border border-rose-100">
                      No attendance punch recorded for this workday.
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 italic p-2">
                      Upcoming scheduled working day.
                    </p>
                  )}
                </div>
              )}

              {/* View Mode B: List View */}
              {viewMode === 'list' && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm divide-y divide-slate-100">
                  {calendarData.days.map((day) => {
                    const badge = getStatusBadge(day.status);
                    return (
                      <div key={day.date} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center font-bold text-xs ${day.is_today ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                            <span>{day.day}</span>
                            <span className="text-[8px] uppercase tracking-tighter opacity-80">{day.day_name_short}</span>
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-slate-800 block">
                              {day.day_name}, {fmtDate(day.date)}
                            </span>
                            {day.session ? (
                              <span className="text-[11px] text-slate-500 font-mono">
                                {fmtTime(day.session.punch_in_at)} - {day.session.punch_out_at ? fmtTime(day.session.punch_out_at) : 'Active'} ({fmtDuration(day.session.duration_seconds)})
                              </span>
                            ) : day.holiday ? (
                              <span className="text-[11px] text-purple-700 font-medium">{day.holiday.name}</span>
                            ) : day.leave ? (
                              <span className="text-[11px] text-amber-700 font-medium">Leave: {day.leave.type}</span>
                            ) : (
                              <span className="text-[11px] text-slate-400">{badge.label}</span>
                            )}
                          </div>
                        </div>

                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}>
                          {badge.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

        </div>

      </div>
    </div>
  );
}
