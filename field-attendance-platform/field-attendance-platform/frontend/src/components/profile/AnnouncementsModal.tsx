import React, { useEffect, useState } from 'react';
import { 
  ChevronLeft, 
  Bell, 
  CheckCheck, 
  AlertTriangle, 
  Clock, 
  User, 
  CheckCircle2 
} from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { fmtDate } from '../../services/format';
import type { Announcement } from '../../types';

interface AnnouncementsModalProps {
  onClose: () => void;
  onAnnouncementsRead?: () => void;
}

export default function AnnouncementsModal({ onClose, onAnnouncementsRead }: AnnouncementsModalProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnnouncements = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<any>('/me/announcements/');
      const items = Array.isArray(res.data) 
        ? res.data 
        : (Array.isArray(res.data?.announcements) ? res.data.announcements : []);
      setAnnouncements(items);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const openDetail = async (ann: Announcement) => {
    setSelectedAnnouncement(ann);
    if (!ann.is_read) {
      try {
        await api.post(`/me/announcements/${ann.id}/read/`);
        setAnnouncements(prev => prev.map(a => a.id === ann.id ? { ...a, is_read: true } : a));
        if (onAnnouncementsRead) onAnnouncementsRead();
      } catch (err) {
        console.error('Failed to mark announcement as read', err);
      }
    }
  };

  const markAllRead = async () => {
    try {
      const unreadList = announcements.filter(a => !a.is_read);
      await Promise.all(unreadList.map(a => api.post(`/me/announcements/${a.id}/read/`)));
      setAnnouncements(prev => prev.map(a => ({ ...a, is_read: true })));
      if (onAnnouncementsRead) onAnnouncementsRead();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const getPriorityBadge = (p: Announcement['priority']) => {
    switch (p) {
      case 'URGENT':
        return { label: 'Urgent', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' };
      case 'HIGH':
        return { label: 'High Priority', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
      case 'LOW':
        return { label: 'Info', bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' };
      case 'NORMAL':
      default:
        return { label: 'General', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    }
  };

  const unreadCount = announcements.filter(a => !a.is_read).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex justify-center items-end sm:items-center sm:p-4">
      <div className="bg-slate-50 w-full max-w-md h-[95vh] sm:h-[840px] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
        
        {/* Sticky Header */}
        <header className="px-4 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={selectedAnnouncement ? () => setSelectedAnnouncement(null) : onClose}
              aria-label={selectedAnnouncement ? "Back to Announcements List" : "Back to Profile"}
              className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95 transition-all"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                {selectedAnnouncement ? 'Notice Detail' : 'Announcements'}
              </h2>
              <p className="text-[11px] text-slate-500">
                {unreadCount > 0 ? `${unreadCount} unread official notice${unreadCount > 1 ? 's' : ''}` : 'Official Bulletins & Notices'}
              </p>
            </div>
          </div>

          {!selectedAnnouncement && unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1 text-xs text-emerald-600 font-bold hover:underline p-1"
            >
              <CheckCheck className="w-4 h-4" />
              Mark all read
            </button>
          )}
        </header>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">Loading announcements...</p>
            </div>
          )}

          {/* DETAIL VIEW */}
          {selectedAnnouncement ? (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                {(() => {
                  const b = getPriorityBadge(selectedAnnouncement.priority);
                  return (
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${b.bg} ${b.text} ${b.border}`}>
                      {b.label}
                    </span>
                  );
                })()}
                <span className="text-xs text-slate-400">
                  {fmtDate(selectedAnnouncement.created_at)}
                </span>
              </div>

              <h3 className="text-lg font-bold text-slate-900 leading-snug">
                {selectedAnnouncement.title}
              </h3>

              <div className="flex items-center gap-2 text-xs text-slate-500 pb-3 border-b border-slate-100">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>Posted by {selectedAnnouncement.author_name || 'HR Management'}</span>
              </div>

              <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                {selectedAnnouncement.content}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  Read and acknowledged
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedAnnouncement(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                >
                  Back to List
                </button>
              </div>
            </div>
          ) : (
            /* LIST VIEW */
            <>
              {!loading && announcements.length === 0 && (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
                  <Bell className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-slate-800">No Announcements</h4>
                  <p className="text-xs text-slate-400 mt-1">There are no active company announcements.</p>
                </div>
              )}

              {announcements.map(ann => {
                const badge = getPriorityBadge(ann.priority);
                return (
                  <div
                    key={ann.id}
                    onClick={() => openDetail(ann)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative shadow-sm ${
                      !ann.is_read
                        ? 'bg-white border-emerald-300 ring-1 ring-emerald-400/30'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {!ann.is_read && (
                      <span 
                        className="absolute top-4 right-4 w-2 h-2 rounded-full bg-rose-500 ring-4 ring-rose-100" 
                        aria-label="Unread announcement" 
                      />
                    )}

                    <div className="space-y-1.5 pr-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}>
                          {badge.label}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {fmtDate(ann.created_at)}
                        </span>
                      </div>

                      <h4 className={`text-sm leading-snug ${!ann.is_read ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>
                        {ann.title}
                      </h4>

                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                        {ann.content}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2.5 mt-2 border-t border-slate-100">
                      <span>By {ann.author_name || 'HR Admin'}</span>
                      <span className="text-emerald-600 font-semibold">Tap to view &rarr;</span>
                    </div>
                  </div>
                );
              })}
            </>
          )}

        </div>

      </div>
    </div>
  );
}
