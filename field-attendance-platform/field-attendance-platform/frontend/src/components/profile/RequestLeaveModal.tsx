import React, { useEffect, useState } from 'react';
import { 
  ChevronLeft, 
  CalendarOff, 
  Send, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  FileText, 
  Paperclip,
  Trash2
} from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { fmtDate } from '../../services/format';
import type { LeaveBalance, LeaveRequest } from '../../types';

interface RequestLeaveModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export default function RequestLeaveModal({ onClose, onSuccess }: RequestLeaveModalProps) {
  const [activeTab, setActiveTab] = useState<'apply' | 'requests'>('apply');

  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form State
  const [form, setForm] = useState({
    leave_type: '',
    start_date: '',
    end_date: '',
    is_half_day: false,
    half_day_period: 'FIRST_HALF' as 'FIRST_HALF' | 'SECOND_HALF',
    reason: '',
  });
  const [attachment, setAttachment] = useState<File | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [balRes, reqRes] = await Promise.all([
        api.get<LeaveBalance[]>('/me/leaves/balances/'),
        api.get<LeaveRequest[]>('/me/leaves/'),
      ]);
      setBalances(balRes.data);
      setRequests(reqRes.data);
      if (balRes.data.length > 0 && !form.leave_type) {
        setForm(prev => ({ ...prev, leave_type: balRes.data[0].leave_type_code }));
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!form.leave_type) {
      setError('Please select a leave type.');
      return;
    }
    if (!form.start_date) {
      setError('Please select a start date.');
      return;
    }
    const end = form.is_half_day ? form.start_date : (form.end_date || form.start_date);
    if (!form.is_half_day && form.end_date && form.end_date < form.start_date) {
      setError('End date cannot be earlier than start date.');
      return;
    }
    if (!form.reason.trim()) {
      setError('Please provide a reason for the leave.');
      return;
    }

    // Check balance
    const selectedBal = balances.find(b => b.leave_type_code === form.leave_type);
    if (selectedBal) {
      const startD = new Date(form.start_date);
      const endD = new Date(end);
      const diffTime = Math.abs(endD.getTime() - startD.getTime());
      const dayCount = form.is_half_day ? 0.5 : Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      if (dayCount > selectedBal.available_days) {
        setError(`Insufficient leave balance. You requested ${dayCount} days, but only ${selectedBal.available_days} days are available.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('leave_type', form.leave_type);
      formData.append('start_date', form.start_date);
      formData.append('end_date', end);
      formData.append('is_half_day', String(form.is_half_day));
      if (form.is_half_day) {
        formData.append('half_day_period', form.half_day_period);
      }
      formData.append('reason', form.reason.trim());
      if (attachment) {
        formData.append('attachment', attachment);
      }

      await api.post('/me/leaves/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setSuccessMsg('Leave application submitted successfully!');
      setForm({
        leave_type: balances[0]?.leave_type_code || '',
        start_date: '',
        end_date: '',
        is_half_day: false,
        half_day_period: 'FIRST_HALF',
        reason: '',
      });
      setAttachment(null);
      await loadData();
      setActiveTab('requests');
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRequest = async (id: number) => {
    if (!confirm('Are you sure you want to cancel this pending leave request?')) return;
    setCancellingId(id);
    setError('');
    try {
      await api.delete(`/me/leaves/${id}/`);
      setSuccessMsg('Leave request cancelled successfully.');
      await loadData();
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCancellingId(null);
    }
  };

  const getStatusBadge = (status: LeaveRequest['status']) => {
    switch (status) {
      case 'APPROVED':
        return { label: 'Approved', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle2 };
      case 'REJECTED':
        return { label: 'Rejected', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', icon: XCircle };
      case 'CANCELLED':
        return { label: 'Cancelled', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', icon: AlertTriangle };
      case 'PENDING':
      default:
        return { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: Clock };
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
              <h2 className="text-base font-bold text-slate-900 leading-tight">Request Leave</h2>
              <p className="text-[11px] text-slate-500">Apply & Check Leave Balances</p>
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('apply')}
              className={`px-3 py-1.5 rounded-md transition-all ${activeTab === 'apply' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className={`px-3 py-1.5 rounded-md transition-all ${activeTab === 'requests' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              My Requests {requests.length > 0 && `(${requests.length})`}
            </button>
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

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Leave Balances Header Cards */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              YOUR LEAVE BALANCES
            </span>
            <div className="grid grid-cols-3 gap-2">
              {balances.map(b => (
                <div key={b.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-center">
                  <span className="block text-xs font-semibold text-slate-700 truncate" title={b.leave_type_name}>
                    {b.leave_type_name}
                  </span>
                  <span className="block text-lg font-extrabold text-emerald-600 my-0.5">
                    {b.available_days}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    of {b.total_days} days
                  </span>
                </div>
              ))}
              {balances.length === 0 && !loading && (
                <div className="col-span-3 text-center py-3 text-xs text-slate-400 bg-white rounded-xl border border-slate-200">
                  No active leave policies configured.
                </div>
              )}
            </div>
          </div>

          {/* TAB 1: APPLY FOR LEAVE */}
          {activeTab === 'apply' && (
            <form onSubmit={handleApply} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3.5">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <CalendarOff className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-800">Leave Application Form</h3>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="leave-type-select">
                  Leave Type *
                </label>
                <select
                  id="leave-type-select"
                  value={form.leave_type}
                  onChange={e => setForm({ ...form, leave_type: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  required
                >
                  {balances.map(b => (
                    <option key={b.leave_type_code} value={b.leave_type_code}>
                      {b.leave_type_name} ({b.available_days} days available)
                    </option>
                  ))}
                </select>
              </div>

              {/* Half-day toggle */}
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
                <div>
                  <span className="text-xs font-semibold text-slate-800 block">Half-day Leave</span>
                  <span className="text-[10px] text-slate-500">Apply for 0.5 day only</span>
                </div>
                <input
                  type="checkbox"
                  id="half-day-toggle"
                  checked={form.is_half_day}
                  onChange={e => setForm({ ...form, is_half_day: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                />
              </div>

              {form.is_half_day ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="half-day-date">
                      Leave Date *
                    </label>
                    <input
                      id="half-day-date"
                      type="date"
                      value={form.start_date}
                      onChange={e => setForm({ ...form, start_date: e.target.value, end_date: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="half-day-period">
                      Half Day Session *
                    </label>
                    <select
                      id="half-day-period"
                      value={form.half_day_period}
                      onChange={e => setForm({ ...form, half_day_period: e.target.value as any })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    >
                      <option value="FIRST_HALF">First Half (Morning Session)</option>
                      <option value="SECOND_HALF">Second Half (Afternoon Session)</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="start-date-input">
                      Start Date *
                    </label>
                    <input
                      id="start-date-input"
                      type="date"
                      value={form.start_date}
                      onChange={e => setForm({ ...form, start_date: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="end-date-input">
                      End Date *
                    </label>
                    <input
                      id="end-date-input"
                      type="date"
                      value={form.end_date}
                      onChange={e => setForm({ ...form, end_date: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="reason-input">
                  Reason for Leave *
                </label>
                <textarea
                  id="reason-input"
                  rows={3}
                  value={form.reason}
                  onChange={e => setForm({ ...form, reason: e.target.value })}
                  placeholder="Explain why you are requesting leave..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 resize-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Optional Attachment (Medical certificate, notice, etc.)
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept=".pdf,image/jpeg,image/png"
                    onChange={e => setAttachment(e.target.files?.[0] || null)}
                    className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">PDF, JPG, or PNG (Max 5 MB)</p>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {submitting ? 'Submitting Leave Request...' : 'Submit Leave Request'}
              </button>
            </form>
          )}

          {/* TAB 2: MY REQUESTS */}
          {activeTab === 'requests' && (
            <div className="space-y-3">
              {requests.length === 0 && !loading && (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
                  <CalendarOff className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-slate-800">No Leave Requests</h4>
                  <p className="text-xs text-slate-400 mt-1">You haven't submitted any leave requests yet.</p>
                </div>
              )}

              {requests.map(req => {
                const badge = getStatusBadge(req.status);
                const StatusIcon = badge.icon;
                return (
                  <div key={req.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2.5">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-bold text-sm text-slate-900 block">
                          {req.leave_type_name}
                        </span>
                        <span className="text-xs text-slate-500">
                          {fmtDate(req.start_date)} {req.start_date !== req.end_date ? `to ${fmtDate(req.end_date)}` : ''} 
                          {' · '}
                          <strong className="text-slate-700">{req.days_count} {req.days_count === 1 ? 'day' : 'days'}</strong>
                          {req.is_half_day && ' (Half-day)'}
                        </span>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${badge.bg} ${badge.text} ${badge.border}`}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        {badge.label}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs text-slate-600">
                      <strong className="text-slate-700 block text-[10px] uppercase tracking-wider mb-0.5">Reason:</strong>
                      "{req.reason}"
                    </div>

                    {req.reviewer_notes && (
                      <div className="bg-blue-50/60 p-2.5 rounded-xl border border-blue-100 text-xs text-blue-900">
                        <strong className="block text-[10px] uppercase tracking-wider mb-0.5">
                          Approver Remark ({req.reviewer_name || 'HR / Manager'}):
                        </strong>
                        "{req.reviewer_notes}"
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                      <span>Applied on {fmtDate(req.created_at)}</span>
                      {req.status === 'PENDING' && (
                        <button
                          type="button"
                          onClick={() => handleCancelRequest(req.id)}
                          disabled={cancellingId === req.id}
                          className="text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {cancellingId === req.id ? 'Cancelling...' : 'Cancel Request'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
