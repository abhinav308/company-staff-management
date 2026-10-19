import React, { useEffect, useState } from 'react';
import { 
  ChevronLeft, 
  IdCard, 
  UserCheck, 
  Building2, 
  MapPin, 
  Calendar, 
  Clock, 
  Phone, 
  Mail, 
  HeartHandshake, 
  Edit3, 
  AlertTriangle, 
  CheckCircle2, 
  Send, 
  X,
  ShieldCheck
} from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { fmtDate } from '../../services/format';
import type { EmployeeProfile, ProfileChangeRequest, User } from '../../types';

interface HRProfileModalProps {
  onClose: () => void;
}

export default function HRProfileModal({ onClose }: HRProfileModalProps) {
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [pendingRequest, setPendingRequest] = useState<ProfileChangeRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Edit Contact Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    phone: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relation: '',
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchProfile = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<{
        user: User;
        profile: EmployeeProfile;
        pending_change_request: ProfileChangeRequest | null;
      }>('/me/profile/');
      setUser(res.data.user);
      setProfile(res.data.profile);
      setPendingRequest(res.data.pending_change_request);
      
      setEditForm({
        phone: res.data.user.phone || '',
        emergency_contact_name: res.data.profile.emergency_contact_name || '',
        emergency_contact_phone: res.data.profile.emergency_contact_phone || '',
        emergency_contact_relation: res.data.profile.emergency_contact_relation || '',
        reason: '',
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.patch<{ message: string; request_id?: number }>('/me/profile/', editForm);
      setSuccessMsg(res.data.message || 'Change request submitted successfully.');
      setIsEditOpen(false);
      await fetchProfile();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
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
              <h2 className="text-base font-bold text-slate-900 leading-tight">HR Profile</h2>
              <p className="text-[11px] text-slate-500">Official Employment Record</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsEditOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-all active:scale-95"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Edit Contacts
          </button>
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

          {/* Pending HR Change Request Notice */}
          {pendingRequest && (
            <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl space-y-1.5 text-xs text-amber-900">
              <div className="flex items-center gap-2 font-bold text-amber-800">
                <Clock className="w-4 h-4" />
                <span>Contact Update Request Under Review</span>
              </div>
              <p className="text-amber-800 text-[11px]">
                You requested updates to your contact details. The request is currently pending HR approval.
              </p>
              <div className="bg-white/80 p-2 rounded-xl text-[11px] font-mono border border-amber-200/60 mt-1">
                {pendingRequest.requested_phone && <div>Phone: {pendingRequest.requested_phone}</div>}
                {pendingRequest.requested_emergency_name && (
                  <div>Emergency: {pendingRequest.requested_emergency_name} ({pendingRequest.requested_emergency_phone})</div>
                )}
              </div>
            </div>
          )}

          {/* HR Read-only Notice */}
          <div className="bg-blue-50/70 border border-blue-200/70 p-3 rounded-2xl flex items-start gap-2.5 text-xs text-blue-900">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="leading-snug">
              Official HR employment fields are locked for compliance. Phone and emergency contact updates will create a change request for HR approval.
            </p>
          </div>

          {loading && (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">Loading HR records...</p>
            </div>
          )}

          {!loading && profile && user && (
            <>
              {/* Section 1: Employment Details */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <IdCard className="w-4 h-4 text-emerald-600" />
                  EMPLOYMENT & COMPANY DETAILS
                </div>

                <div className="divide-y divide-slate-100 text-xs">
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Employee Code</span>
                    <span className="font-mono font-bold text-slate-900">{profile.employee_id || '—'}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Full Name</span>
                    <span className="font-semibold text-slate-800">{user.full_name || user.username}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Designation</span>
                    <span className="font-semibold text-slate-800">{profile.designation || 'Field Officer'}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Department</span>
                    <span className="font-semibold text-slate-800">{profile.department || 'Operations'}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Company</span>
                    <span className="font-semibold text-slate-800">{profile.company || 'GNFC Ltd.'}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Agency / Contractor</span>
                    <span className="font-medium text-slate-800">{profile.agency || 'Internal Direct'}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Office / Base Hub</span>
                    <span className="font-medium text-slate-800">{profile.office || 'Bharuch Central'}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Zone & District</span>
                    <span className="font-medium text-slate-800">
                      {profile.zone || 'South Zone'} · {profile.district || 'Bharuch'}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Designated Work Location</span>
                    <span className="font-medium text-slate-800">{profile.work_location || 'Field Operations'}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Reporting Manager</span>
                    <span className="font-semibold text-emerald-800">
                      {profile.reporting_manager_name || 'Rajesh Patel (Lead)'}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Joining Date</span>
                    <span className="font-medium text-slate-800">{profile.joining_date ? fmtDate(profile.joining_date) : '2024-01-15'}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Employment Type</span>
                    <span className="badge badge-neutral">{profile.employment_type || 'Full Time Regular'}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Shift Timing</span>
                    <span className="font-mono text-slate-800">{profile.shift_timing || '09:00 AM - 06:00 PM'}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">ESIC / Health ID</span>
                    <span className="font-mono text-slate-800">{profile.esic_number || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Section 2: Contact Information */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <Phone className="w-4 h-4 text-emerald-600" />
                    CONTACT DETAILS
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEditOpen(true)}
                    className="text-xs text-emerald-600 font-bold hover:underline flex items-center gap-1"
                  >
                    Edit
                  </button>
                </div>

                <div className="divide-y divide-slate-100 text-xs">
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Corporate Email</span>
                    <span className="font-medium text-slate-800">{user.email || '—'}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Mobile Phone</span>
                    <span className="font-mono font-semibold text-slate-800">{user.phone || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Section 3: Emergency Contact */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <HeartHandshake className="w-4 h-4 text-rose-500" />
                    EMERGENCY CONTACT
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEditOpen(true)}
                    className="text-xs text-emerald-600 font-bold hover:underline flex items-center gap-1"
                  >
                    Edit
                  </button>
                </div>

                <div className="divide-y divide-slate-100 text-xs">
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Contact Name</span>
                    <span className="font-semibold text-slate-800">
                      {profile.emergency_contact_name || 'Not provided'}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Relationship</span>
                    <span className="font-medium text-slate-800">
                      {profile.emergency_contact_relation || 'Not provided'}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-500">Emergency Phone</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {profile.emergency_contact_phone || 'Not provided'}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

        </div>

        {/* Edit Contact Modal */}
        {isEditOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-end sm:items-center sm:p-4 animate-in fade-in duration-150">
            <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Request Contact Update</h3>
                  <p className="text-[11px] text-slate-500">HR Approval Required</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="edit-phone">
                    Mobile Phone Number
                  </label>
                  <input
                    id="edit-phone"
                    type="tel"
                    value={editForm.phone}
                    onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    required
                  />
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-700 block mb-2">Emergency Contact</span>
                  
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1" htmlFor="edit-em-name">
                        Contact Person Name *
                      </label>
                      <input
                        id="edit-em-name"
                        type="text"
                        value={editForm.emergency_contact_name}
                        onChange={e => setEditForm({ ...editForm, emergency_contact_name: e.target.value })}
                        placeholder="e.g. Ramesh Mehta"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1" htmlFor="edit-em-phone">
                          Phone Number *
                        </label>
                        <input
                          id="edit-em-phone"
                          type="tel"
                          value={editForm.emergency_contact_phone}
                          onChange={e => setEditForm({ ...editForm, emergency_contact_phone: e.target.value })}
                          placeholder="+91 98765 00000"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1" htmlFor="edit-em-rel">
                          Relationship *
                        </label>
                        <input
                          id="edit-em-rel"
                          type="text"
                          value={editForm.emergency_contact_relation}
                          onChange={e => setEditForm({ ...editForm, emergency_contact_relation: e.target.value })}
                          placeholder="e.g. Spouse / Brother"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="edit-reason">
                    Reason for Contact Detail Change
                  </label>
                  <textarea
                    id="edit-reason"
                    rows={2}
                    value={editForm.reason}
                    onChange={e => setEditForm({ ...editForm, reason: e.target.value })}
                    placeholder="e.g. Changed personal phone carrier"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 resize-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsEditOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    {submitting ? 'Submitting...' : 'Submit to HR'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
