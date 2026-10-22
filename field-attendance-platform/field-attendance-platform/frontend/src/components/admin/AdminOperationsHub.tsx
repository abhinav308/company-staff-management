import React, { useEffect, useState } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Calendar, 
  Download, 
  Plus, 
  Trash2, 
  AlertTriangle, 
  Search, 
  FileText, 
  Bell, 
  UserCheck, 
  Send,
  Eye,
  X
} from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { fmtDate, fmtTime } from '../../services/format';
import type { 
  Announcement, 
  EmployeeDocument, 
  Holiday, 
  LeaveRequest, 
  LeaveType, 
  ProfileChangeRequest 
} from '../../types';

// ================= 1. LEAVE APPROVALS TAB =================
export function AdminLeaveApprovals() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Decision Modal State
  const [decisionReq, setDecisionReq] = useState<LeaveRequest | null>(null);
  const [decisionAction, setDecisionAction] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadLeaves = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<LeaveRequest[]>('/admin/leaves/', {
        params: { status: statusFilter || undefined },
      });
      setRequests(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaves();
  }, [statusFilter]);

  const handleDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionReq) return;
    setSubmitting(true);
    setError('');
    setSuccessMsg('');
    try {
      await api.post(`/admin/leaves/${decisionReq.id}/decision/`, {
        decision: decisionAction,
        status: decisionAction,
        comment: comment.trim(),
        notes: comment.trim(),
      });
      setSuccessMsg(`Leave request #${decisionReq.id} marked as ${decisionAction}.`);
      setDecisionReq(null);
      setComment('');
      await loadLeaves();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Leave Approvals Queue</h2>
          <p className="text-xs text-slate-500">Review officer leave requests and adjust annual leave balances</p>
        </div>

        <div className="flex items-center gap-2">
          {['PENDING', 'APPROVED', 'REJECTED', ''].map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                statusFilter === st 
                  ? 'bg-emerald-600 text-white shadow-sm' 
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {st || 'All'}
            </button>
          ))}
        </div>
      </div>

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

      {loading && (
        <div className="py-16 text-center text-slate-400 text-sm">
          Loading leave requests...
        </div>
      )}

      {!loading && requests.length === 0 && (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-800">No Leave Requests</h3>
          <p className="text-xs text-slate-400 mt-1">There are no leave requests matching this status filter.</p>
        </div>
      )}

      {/* Requests Table */}
      {!loading && requests.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="py-3 px-4">Officer Name</th>
                  <th>Leave Type</th>
                  <th>Period</th>
                  <th>Days</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th className="text-right px-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map(req => (
                  <tr key={req.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {req.employee_name}
                      <span className="block text-[10px] text-slate-400 font-normal">
                        Applied {fmtDate(req.created_at)}
                      </span>
                    </td>
                    <td className="font-semibold text-slate-700">{req.leave_type_name}</td>
                    <td className="text-slate-600">
                      {fmtDate(req.start_date)} {req.start_date !== req.end_date ? `to ${fmtDate(req.end_date)}` : ''}
                      {req.is_half_day && <span className="block text-[10px] text-amber-600">Half Day ({req.half_day_period})</span>}
                    </td>
                    <td className="font-bold text-slate-800 font-mono">{req.days_count}</td>
                    <td className="text-slate-600 max-w-xs truncate" title={req.reason}>
                      "{req.reason}"
                    </td>
                    <td>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        req.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        req.status === 'REJECTED' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                        req.status === 'CANCELLED' ? 'bg-slate-100 text-slate-600 border border-slate-200' :
                        'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="text-right px-4">
                      {req.status === 'PENDING' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setDecisionReq(req);
                              setDecisionAction('APPROVED');
                              setComment('');
                            }}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDecisionReq(req);
                              setDecisionAction('REJECTED');
                              setComment('');
                            }}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg text-xs border border-rose-200"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px] font-mono">
                          {req.reviewer_name || 'Processed'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Decision Modal */}
      {decisionReq && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">
                {decisionAction === 'APPROVED' ? 'Approve Leave Request' : 'Reject Leave Request'}
              </h3>
              <button
                type="button"
                onClick={() => setDecisionReq(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs space-y-1">
              <div><strong>Employee:</strong> {decisionReq.employee_name}</div>
              <div><strong>Leave Type:</strong> {decisionReq.leave_type_name} ({decisionReq.days_count} days)</div>
              <div><strong>Dates:</strong> {fmtDate(decisionReq.start_date)} to {fmtDate(decisionReq.end_date)}</div>
              <div><strong>Reason:</strong> "{decisionReq.reason}"</div>
            </div>

            <form onSubmit={handleDecisionSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="decision-comment">
                  Approver Remarks / Comment
                </label>
                <textarea
                  id="decision-comment"
                  rows={3}
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder={decisionAction === 'APPROVED' ? 'e.g. Approved. Ensure handover to shift lead.' : 'e.g. Operational requirement on critical inspection dates.'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 resize-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDecisionReq(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`px-5 py-2 text-white rounded-xl text-xs font-bold shadow-md transition-all ${
                    decisionAction === 'APPROVED' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {submitting ? 'Saving...' : `Confirm ${decisionAction}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ================= 2. HOLIDAY MANAGEMENT TAB =================
export function AdminHolidayManagement() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Add Holiday Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({
    date: '',
    name: '',
    holiday_type: 'NATIONAL' as 'NATIONAL' | 'STATE' | 'OPTIONAL',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchHolidays = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<Holiday[]>('/admin/holidays/', { params: { year: selectedYear } });
      setHolidays(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHolidays();
  }, [selectedYear]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccessMsg('');
    try {
      await api.post('/admin/holidays/', form);
      setSuccessMsg(`Holiday "${form.name}" added successfully.`);
      setIsAddOpen(false);
      setForm({ date: '', name: '', holiday_type: 'NATIONAL', description: '' });
      await fetchHolidays();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete holiday "${name}"?`)) return;
    try {
      await api.delete(`/admin/holidays/${id}/`);
      setSuccessMsg(`Holiday "${name}" deleted.`);
      await fetchHolidays();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Holiday Calendar Management</h2>
          <p className="text-xs text-slate-500">Configure company and gazetted holidays for attendance tracking</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y} Holidays</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Holiday
          </button>
        </div>
      </div>

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

      {/* Holidays List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase border-b border-slate-100 font-semibold">
            <tr>
              <th className="py-3 px-4">Date</th>
              <th>Holiday Name</th>
              <th>Type</th>
              <th>Description</th>
              <th className="text-right px-4">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {holidays.map(h => (
              <tr key={h.id} className="hover:bg-slate-50/70 transition-colors">
                <td className="py-3.5 px-4 font-mono font-bold text-slate-800">{fmtDate(h.date)}</td>
                <td className="font-bold text-slate-900">{h.name}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    h.holiday_type === 'NATIONAL' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                    h.holiday_type === 'STATE' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                    'bg-purple-50 text-purple-700 border border-purple-200'
                  }`}>
                    {h.holiday_type}
                  </span>
                </td>
                <td className="text-slate-500 max-w-sm truncate">{h.description || '—'}</td>
                <td className="text-right px-4">
                  <button
                    type="button"
                    onClick={() => handleDelete(h.id, h.name)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                    title="Delete Holiday"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {holidays.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400">
                  No holidays configured for {selectedYear}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Holiday Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Add Gazetted / Company Holiday</h3>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="h-date">
                  Holiday Date *
                </label>
                <input
                  id="h-date"
                  type="date"
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="h-name">
                  Holiday Name *
                </label>
                <input
                  id="h-name"
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Independence Day"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="h-type">
                  Holiday Classification *
                </label>
                <select
                  id="h-type"
                  value={form.holiday_type}
                  onChange={e => setForm({ ...form, holiday_type: e.target.value as any })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium"
                >
                  <option value="NATIONAL">National Gazetted Holiday</option>
                  <option value="STATE">State / Regional Holiday</option>
                  <option value="OPTIONAL">Optional / Restricted Holiday</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="h-desc">
                  Description / Remarks
                </label>
                <input
                  id="h-desc"
                  type="text"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g. Applicable across all plants and regional offices"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all"
                >
                  {submitting ? 'Adding...' : 'Save Holiday'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ================= 3. DOCUMENT VERIFICATION QUEUE =================
export function AdminDocumentQueue() {
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Decision Modal
  const [selectedDoc, setSelectedDoc] = useState<EmployeeDocument | null>(null);
  const [decision, setDecision] = useState<'VERIFIED' | 'REJECTED'>('VERIFIED');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDocs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<EmployeeDocument[]>('/admin/documents/', {
        params: { status: statusFilter || undefined },
      });
      setDocuments(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, [statusFilter]);

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoc) return;
    setSubmitting(true);
    setError('');
    setSuccessMsg('');
    try {
      await api.post(`/admin/documents/${selectedDoc.id}/verify/`, {
        status: decision,
        reviewer_notes: notes.trim(),
      });
      setSuccessMsg(`Document marked as ${decision}.`);
      setSelectedDoc(null);
      setNotes('');
      await fetchDocs();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async (doc: EmployeeDocument) => {
    try {
      const response = await api.get(`/documents/${doc.id}/download/`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.file_name || `document_${doc.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Document Verification Queue</h2>
          <p className="text-xs text-slate-500">Authenticate identity proofs, qualification certificates, and appointment files</p>
        </div>

        <div className="flex items-center gap-2">
          {['PENDING', 'VERIFIED', 'REJECTED', ''].map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                statusFilter === st 
                  ? 'bg-emerald-600 text-white shadow-sm' 
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {st || 'All'}
            </button>
          ))}
        </div>
      </div>

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

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase border-b border-slate-100 font-semibold">
            <tr>
              <th className="py-3 px-4">Officer</th>
              <th>Category</th>
              <th>File Name</th>
              <th>Uploaded Date</th>
              <th>Status</th>
              <th className="text-right px-4">Verification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {documents.map(doc => (
              <tr key={doc.id} className="hover:bg-slate-50/70 transition-colors">
                <td className="py-3.5 px-4 font-bold text-slate-900">
                  {doc.user_full_name}
                  <span className="block text-[10px] text-slate-400 font-mono font-normal">
                    ID: {doc.employee_id}
                  </span>
                </td>
                <td className="font-semibold text-slate-700">{doc.doc_type_display}</td>
                <td className="font-mono text-slate-600">
                  <button
                    type="button"
                    onClick={() => handleDownload(doc)}
                    className="text-emerald-700 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {doc.file_name}
                  </button>
                </td>
                <td className="text-slate-500">{fmtDate(doc.created_at)}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    doc.status === 'VERIFIED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                    doc.status === 'REJECTED' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                    'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {doc.status}
                  </span>
                </td>
                <td className="text-right px-4">
                  {doc.status === 'PENDING' ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDoc(doc);
                          setDecision('VERIFIED');
                          setNotes('');
                        }}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs"
                      >
                        Verify
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDoc(doc);
                          setDecision('REJECTED');
                          setNotes('');
                        }}
                        className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg text-xs border border-rose-200"
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <span className="text-slate-400 text-[11px]">
                      {doc.reviewer_notes || 'Reviewed'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {documents.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  No documents in this queue.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Verify / Reject Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">
                {decision === 'VERIFIED' ? 'Verify Officer Document' : 'Reject Officer Document'}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedDoc(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs space-y-1">
              <div><strong>Officer:</strong> {selectedDoc.user_full_name} ({selectedDoc.employee_id})</div>
              <div><strong>Document Type:</strong> {selectedDoc.doc_type_display}</div>
              <div><strong>File Name:</strong> {selectedDoc.file_name}</div>
            </div>

            <form onSubmit={handleVerifySubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="ver-notes">
                  Reviewer Notes / Verification Remarks
                </label>
                <textarea
                  id="ver-notes"
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder={decision === 'VERIFIED' ? 'e.g. Identity confirmed against employee master database.' : 'e.g. Incomplete scan or blurred image. Please re-upload.'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 resize-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedDoc(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`px-5 py-2 text-white rounded-xl text-xs font-bold shadow-md transition-all ${
                    decision === 'VERIFIED' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {submitting ? 'Saving...' : `Confirm ${decision}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ================= 4. ANNOUNCEMENTS PUBLISH TAB =================
export function AdminAnnouncementsPublish() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Publish Modal State
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    content: '',
    priority: 'NORMAL' as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT',
    target_role: 'ALL',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchAnnouncements = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<Announcement[]>('/admin/announcements/');
      setAnnouncements(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccessMsg('');
    try {
      await api.post('/admin/announcements/', form);
      setSuccessMsg('Announcement broadcasted successfully to all field personnel.');
      setIsPublishOpen(false);
      setForm({ title: '', content: '', priority: 'NORMAL', target_role: 'ALL' });
      await fetchAnnouncements();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to remove this announcement bulletin?')) return;
    try {
      await api.delete(`/admin/announcements/${id}/`);
      setSuccessMsg('Announcement bulletin removed.');
      await fetchAnnouncements();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Announcements & Bulletins</h2>
          <p className="text-xs text-slate-500">Publish operational notices, policy changes, and urgent field alerts</p>
        </div>

        <button
          type="button"
          onClick={() => setIsPublishOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Broadcast Notice
        </button>
      </div>

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

      {/* Announcements List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {announcements.map(ann => (
          <div key={ann.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2.5">
            <div className="flex items-start justify-between">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                ann.priority === 'URGENT' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                ann.priority === 'HIGH' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                'bg-blue-50 text-blue-700 border border-blue-200'
              }`}>
                {ann.priority} PRIORITY
              </span>
              <button
                type="button"
                onClick={() => handleDelete(ann.id)}
                className="p-1 text-slate-400 hover:text-rose-600 rounded-lg"
                title="Delete Announcement"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <h3 className="font-bold text-sm text-slate-900 leading-snug">
              {ann.title}
            </h3>

            <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed whitespace-pre-wrap">
              {ann.content}
            </p>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span>By {ann.author_name} · {fmtDate(ann.created_at)}</span>
              <span className="font-semibold text-emerald-700">
                {ann.read_count ?? 0} Read{ann.read_count === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        ))}
        {announcements.length === 0 && !loading && (
          <div className="col-span-2 bg-white p-12 rounded-2xl border border-slate-200 text-center">
            <Bell className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-800">No Published Notices</h3>
            <p className="text-xs text-slate-400 mt-1">Publish an announcement to notify officers on their mobile hubs.</p>
          </div>
        )}
      </div>

      {/* Publish Modal */}
      {isPublishOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Broadcast Field Notice</h3>
              <button
                type="button"
                onClick={() => setIsPublishOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePublishSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="ann-title">
                  Announcement Title *
                </label>
                <input
                  id="ann-title"
                  type="text"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Critical Safety Protocol for Substation Maintenance"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="ann-priority">
                  Urgency / Priority *
                </label>
                <select
                  id="ann-priority"
                  value={form.priority}
                  onChange={e => setForm({ ...form, priority: e.target.value as any })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium"
                >
                  <option value="NORMAL">Normal / General Bulletin</option>
                  <option value="HIGH">High Priority Notice</option>
                  <option value="URGENT">Urgent Field Alert</option>
                  <option value="LOW">Low / Information Only</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="ann-content">
                  Message Content *
                </label>
                <textarea
                  id="ann-content"
                  rows={5}
                  value={form.content}
                  onChange={e => setForm({ ...form, content: e.target.value })}
                  placeholder="Provide clear instructions and guidelines for field staff..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 resize-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPublishOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? 'Publishing...' : 'Broadcast Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ================= 5. PROFILE CHANGES QUEUE =================
export function AdminProfileChangeQueue() {
  const [changes, setChanges] = useState<ProfileChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchChanges = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<ProfileChangeRequest[]>('/admin/profile-changes/', {
        params: { status: 'PENDING' },
      });
      setChanges(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChanges();
  }, []);

  const handleDecision = async (id: number, decision: 'APPROVED' | 'REJECTED') => {
    try {
      await api.post(`/admin/profile-changes/${id}/decision/`, {
        status: decision,
        notes: `Processed by Administrator on ${new Date().toLocaleDateString()}`,
      });
      setSuccessMsg(`Change request #${id} marked as ${decision}.`);
      await fetchChanges();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="pb-3 border-b border-slate-200">
        <h2 className="text-lg font-bold text-slate-900">Officer Contact Change Requests</h2>
        <p className="text-xs text-slate-500">Authorize employee phone number and emergency contact detail updates</p>
      </div>

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

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase border-b border-slate-100 font-semibold">
            <tr>
              <th className="py-3 px-4">Officer</th>
              <th>Requested Phone</th>
              <th>Emergency Contact</th>
              <th>Reason</th>
              <th>Submitted Date</th>
              <th className="text-right px-4">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {changes.map(ch => (
              <tr key={ch.id} className="hover:bg-slate-50/70 transition-colors">
                <td className="py-3.5 px-4 font-bold text-slate-900">
                  {ch.user_name}
                  <span className="block text-[10px] text-slate-400 font-mono font-normal">
                    ID: {ch.employee_id || ch.user_id}
                  </span>
                </td>
                <td className="font-mono text-slate-800 font-semibold">{ch.requested_phone || '—'}</td>
                <td className="text-slate-700">
                  {ch.requested_emergency_name ? (
                    <div>
                      <span className="font-semibold">{ch.requested_emergency_name}</span> ({ch.requested_emergency_relation})
                      <span className="block text-[10px] font-mono text-slate-500">{ch.requested_emergency_phone}</span>
                    </div>
                  ) : '—'}
                </td>
                <td className="text-slate-600 max-w-xs truncate">"{ch.reason}"</td>
                <td className="text-slate-500">{fmtDate(ch.created_at)}</td>
                <td className="text-right px-4">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleDecision(ch.id, 'APPROVED')}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecision(ch.id, 'REJECTED')}
                      className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg text-xs border border-rose-200"
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {changes.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  No pending profile contact requests.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
