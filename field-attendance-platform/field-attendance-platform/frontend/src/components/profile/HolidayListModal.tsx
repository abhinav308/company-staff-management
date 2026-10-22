import React, { useEffect, useState } from 'react';
import { 
  ChevronLeft, 
  Sparkles, 
  Calendar, 
  MapPin, 
  Clock, 
  AlertTriangle 
} from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { fmtDate } from '../../services/format';
import type { Holiday } from '../../types';

interface HolidayListModalProps {
  onClose: () => void;
}

export default function HolidayListModal({ onClose }: HolidayListModalProps) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchHolidays = async (year: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<Holiday[]>(`/me/holidays/?year=${year}`);
      setHolidays(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHolidays(selectedYear);
  }, [selectedYear]);

  // Find next upcoming holiday
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcomingHoliday = holidays
    .filter(h => h.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  // Group holidays by month
  const groupedHolidays = holidays.reduce((acc, h) => {
    const month = new Date(h.date).toLocaleString('default', { month: 'long' });
    if (!acc[month]) acc[month] = [];
    acc[month].push(h);
    return acc;
  }, {} as Record<string, Holiday[]>);

  const getDayName = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('default', { weekday: 'long' });
  };

  const getDayNumber = (dateStr: string) => {
    return new Date(dateStr).getDate();
  };

  const getTypeBadge = (type: Holiday['holiday_type']) => {
    switch (type) {
      case 'NATIONAL':
        return { label: 'National Holiday', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
      case 'STATE':
        return { label: 'State Holiday', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
      case 'OPTIONAL':
      default:
        return { label: 'Optional Holiday', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
    }
  };

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
              <h2 className="text-base font-bold text-slate-900 leading-tight">Holiday List</h2>
              <p className="text-[11px] text-slate-500">Official Company & Gazetted Holidays</p>
            </div>
          </div>

          {/* Year Selector */}
          <div className="flex bg-slate-100 rounded-lg p-0.5 border border-slate-200 text-xs font-semibold">
            {[currentYear - 1, currentYear, currentYear + 1].map(yr => (
              <button
                key={yr}
                type="button"
                onClick={() => setSelectedYear(yr)}
                className={`px-2.5 py-1 rounded-md transition-all ${selectedYear === yr ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {yr}
              </button>
            ))}
          </div>
        </header>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Next Upcoming Holiday Highlight Card */}
          {upcomingHoliday && (
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-2xl p-4 shadow-md shadow-emerald-900/10 relative overflow-hidden">
              <div className="absolute top-2 right-2 opacity-15">
                <Sparkles className="w-20 h-20 text-white" />
              </div>
              <div className="flex items-center gap-1.5 text-emerald-100 text-[10px] font-bold uppercase tracking-wider mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                NEXT UPCOMING HOLIDAY
              </div>
              <h3 className="text-xl font-black text-white leading-tight">
                {upcomingHoliday.name}
              </h3>
              <p className="text-emerald-100 text-xs mt-1">
                {getDayName(upcomingHoliday.date)}, {fmtDate(upcomingHoliday.date)}
              </p>
              <div className="mt-3 inline-block px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-semibold text-white">
                {upcomingHoliday.holiday_type} HOLIDAY
              </div>
            </div>
          )}

          {loading && (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">Loading holidays for {selectedYear}...</p>
            </div>
          )}

          {!loading && holidays.length === 0 && (
            <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
              <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-800">No Holidays Listed</h4>
              <p className="text-xs text-slate-400 mt-1">No official holidays found for {selectedYear}.</p>
            </div>
          )}

          {/* Grouped Months List */}
          {!loading && Object.keys(groupedHolidays).map(monthName => (
            <div key={monthName} className="space-y-2">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
                {monthName}
              </h4>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm divide-y divide-slate-100">
                {groupedHolidays[monthName].map(h => {
                  const isUpcoming = h.id === upcomingHoliday?.id;
                  const badge = getTypeBadge(h.holiday_type);

                  return (
                    <div 
                      key={h.id} 
                      className={`p-3.5 flex items-center justify-between transition-colors ${isUpcoming ? 'bg-emerald-50/40' : 'hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center font-bold text-xs ${isUpcoming ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700'}`}>
                          <span className="text-sm leading-none">{getDayNumber(h.date)}</span>
                          <span className="text-[8px] uppercase tracking-tighter opacity-80 mt-0.5">
                            {getDayName(h.date).slice(0, 3)}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-slate-900 block">
                              {h.name}
                            </span>
                            {isUpcoming && (
                              <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                NEXT
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {getDayName(h.date)} · {fmtDate(h.date)}
                          </span>
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge.bg} ${badge.text} ${badge.border}`}>
                        {badge.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

        </div>

      </div>
    </div>
  );
}
