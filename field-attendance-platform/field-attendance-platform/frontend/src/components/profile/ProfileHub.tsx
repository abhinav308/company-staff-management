import React, { useEffect, useRef, useState } from 'react';
import { 
  CalendarCheck, 
  CalendarOff, 
  CalendarDays, 
  FileText, 
  IdCard, 
  FolderLock, 
  Bell, 
  Key, 
  Languages, 
  Clock, 
  LogOut, 
  Camera, 
  Upload, 
  AlertCircle, 
  CheckCircle2, 
  ChevronRight,
  ShieldAlert,
  User as UserIcon
} from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { fmtDate, fmtTime } from '../../services/format';
import { useAuth } from '../../hooks/useAuth';
import type { EmployeeProfile, MyStats, User } from '../../types';

import ViewAttendanceModal from './ViewAttendanceModal';
import RequestLeaveModal from './RequestLeaveModal';
import HolidayListModal from './HolidayListModal';
import NotesModal from './NotesModal';
import HRProfileModal from './HRProfileModal';
import MyDocumentsModal from './MyDocumentsModal';
import AnnouncementsModal from './AnnouncementsModal';
import { ChangePasswordModal, LanguageModal, PunchReminderModal } from './SettingsModals';

interface ProfileHubProps {
  onLogout: () => void;
}

export default function ProfileHub({ onLogout }: ProfileHubProps) {
  const { user: authUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<User | null>(authUser);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [stats, setStats] = useState<MyStats | null>(null);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState<number>(0);

  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [photoSuccess, setPhotoSuccess] = useState('');

  // Active Screen Modal
  const [activeModal, setActiveModal] = useState<string | null>(null);

  const loadProfileData = async () => {
    try {
      const [profRes, statsRes, annRes] = await Promise.all([
        api.get<{ user: User; profile: EmployeeProfile }>('/me/profile/'),
        api.get<MyStats>('/me/stats/'),
        api.get<any>('/me/announcements/'),
      ]);
      setUser(profRes.data.user);
      setProfile(profRes.data.profile);
      setStats(statsRes.data);
      let unread = 0;
      if (typeof annRes.data?.unread_count === 'number') {
        unread = annRes.data.unread_count;
      } else if (Array.isArray(annRes.data)) {
        unread = annRes.data.filter((a: any) => !a.is_read).length;
      } else if (Array.isArray(annRes.data?.announcements)) {
        unread = annRes.data.announcements.filter((a: any) => !a.is_read).length;
      }
      setUnreadAnnouncements(unread);
    } catch (err) {
      console.error('Failed to load profile data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfileData();
  }, []);

  // Handle Photo Picker & Compression to <=512px JPEG
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoError('');
    setPhotoSuccess('');
    setUploadingPhoto(true);

    try {
      // 1. Load image into HTML Image object
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load selected image file.'));
        img.src = objectUrl;
      });

      // 2. Crop square and resize to max 512x512 using canvas
      const canvas = document.createElement('canvas');
      const minDim = Math.min(img.width, img.height);
      const sx = (img.width - minDim) / 2;
      const sy = (img.height - minDim) / 2;

      const targetDim = Math.min(minDim, 512);
      canvas.width = targetDim;
      canvas.height = targetDim;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create canvas rendering context.');

      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, targetDim, targetDim);
      URL.revokeObjectURL(objectUrl);

      // 3. Export to Blob <=512px JPEG
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          b => (b ? resolve(b) : reject(new Error('Canvas image conversion failed.'))),
          'image/jpeg',
          0.85
        );
      });

      // 4. Send to /api/me/photo/
      const formData = new FormData();
      formData.append('photo', blob, 'profile_photo.jpg');

      const uploadRes = await api.post<{ photo_url: string }>('/me/photo/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setPhotoSuccess('Profile photo updated successfully!');
      setTimeout(() => setPhotoSuccess(''), 3000);
      
      // Update local profile state immediately
      setProfile(prev => prev ? { ...prev, photo_url: uploadRes.data.photo_url } : null);
    } catch (err) {
      setPhotoError(errorMessage(err));
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'FO';
    return name
      .split(' ')
      .filter(Boolean)
      .map(p => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const displayName = user?.full_name || user?.username || 'Field Officer';
  const designation = profile?.designation || 'Field Engineer';
  const empCode = profile?.employee_id || 'FO-000';
  const officeZone = `${profile?.office || 'Bharuch Central'} · ${profile?.zone || 'South Zone'}`;
  const reportingManager = profile?.reporting_manager_name || 'Rajesh Patel';

  return (
    <div className="bg-slate-50 min-h-full pb-8">
      {/* Hidden File Input for Photo Upload / Camera */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handlePhotoSelect}
        className="hidden"
        aria-label="Upload profile photo"
      />

      <div className="max-w-md mx-auto space-y-4 px-4 pt-4">

        {/* 1. PROFILE HEADER CARD */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm relative overflow-hidden">
          {/* Subtle gradient background accent */}
          <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 rounded-full bg-emerald-50/80 pointer-events-none" />

          {photoSuccess && (
            <div className="mb-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-1.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{photoSuccess}</span>
            </div>
          )}

          {photoError && (
            <div className="mb-3 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-1.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{photoError}</span>
            </div>
          )}

          <div className="flex items-center gap-4">
            {/* 64px Round Photo with Tap-to-Change Camera Badge */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                title="Change profile photo"
                aria-label="Change profile photo"
                className="w-16 h-16 rounded-full overflow-hidden border-2 border-emerald-500/40 p-0.5 relative group hover:border-emerald-600 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                {profile?.photo_url ? (
                  <img
                    src={profile.photo_url}
                    alt={displayName}
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-black text-lg flex items-center justify-center">
                    {getInitials(displayName)}
                  </div>
                )}

                {/* Camera Overlay on Hover or Loading */}
                <div className={`absolute inset-0 bg-black/40 rounded-full flex items-center justify-center text-white transition-opacity ${
                  uploadingPhoto ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}>
                  {uploadingPhoto ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5" />
                  )}
                </div>
              </button>

              {/* Camera Icon Mini Badge */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-600 border-2 border-white text-white flex items-center justify-center shadow-sm cursor-pointer hover:bg-emerald-700 transition-all"
                title="Tap to change photo"
              >
                <Camera className="w-3 h-3" />
              </div>
            </div>

            {/* Officer Details (No duplicate name, no duplicated status chip) */}
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-extrabold text-slate-900 leading-tight truncate">
                {displayName}
              </h1>
              <p className="text-xs font-semibold text-emerald-700 truncate mt-0.5">
                {designation}
              </p>
              
              <div className="mt-1 text-[11px] text-slate-500 space-y-0.5">
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="text-slate-400">ID:</span>
                  <span className="font-semibold text-slate-700">{empCode}</span>
                </div>
                <div className="truncate">
                  <span className="text-slate-400">Office: </span>
                  <span className="text-slate-700 font-medium">{officeZone}</span>
                </div>
                <div className="truncate">
                  <span className="text-slate-400">Manager: </span>
                  <span className="text-slate-700 font-medium">{reportingManager}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. STATS ROW (3 COMPACT CARDS) */}
        <div className="grid grid-cols-3 gap-2">
          {/* Card 1: Days Present This Month */}
          <div className="bg-white rounded-2xl p-3 border border-slate-200/90 shadow-sm text-center">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              THIS MONTH
            </span>
            <span className="block text-xl font-black text-emerald-600 my-0.5">
              {stats ? stats.days_present_month : '—'}
            </span>
            <span className="text-[10px] font-medium text-slate-500">Days Present</span>
          </div>

          {/* Card 2: Leave Balance Available */}
          <div className="bg-white rounded-2xl p-3 border border-slate-200/90 shadow-sm text-center">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              LEAVE BALANCE
            </span>
            <span className="block text-xl font-black text-amber-600 my-0.5">
              {stats ? stats.leave_balance_total : '—'}
            </span>
            <span className="text-[10px] font-medium text-slate-500">Days Available</span>
          </div>

          {/* Card 3: Last Punch */}
          <div className="bg-white rounded-2xl p-3 border border-slate-200/90 shadow-sm text-center flex flex-col justify-center">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              LAST PUNCH
            </span>
            <span className="block text-xs font-bold text-slate-800 my-1 truncate">
              {stats?.last_punch ? fmtTime(stats.last_punch.punch_in_at) : 'None'}
            </span>
            <span className="text-[10px] text-slate-400 truncate">
              {stats?.last_punch ? fmtDate(stats.last_punch.punch_in_at) : 'No recent punch'}
            </span>
          </div>
        </div>

        {/* 3. SECTIONS WITH SMALL HEADINGS & 2-COLUMN TILES (Min 44px target) */}

        {/* SECTION A: MY WORK */}
        <div className="space-y-2">
          <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
            MY WORK
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            {/* Tile 1: View Attendance */}
            <button
              type="button"
              onClick={() => setActiveModal('attendance')}
              className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-sm flex items-center gap-3 text-left hover:border-emerald-500 hover:bg-emerald-50/30 transition-all active:scale-[0.98] min-h-[56px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <CalendarCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="font-bold text-xs text-slate-800 block truncate">
                  View Attendance
                </span>
                <span className="text-[10px] text-slate-400 truncate block">Calendar & logs</span>
              </div>
            </button>

            {/* Tile 2: Request Leave */}
            <button
              type="button"
              onClick={() => setActiveModal('leave')}
              className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-sm flex items-center gap-3 text-left hover:border-emerald-500 hover:bg-emerald-50/30 transition-all active:scale-[0.98] min-h-[56px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <CalendarOff className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="font-bold text-xs text-slate-800 block truncate">
                  Request Leave
                </span>
                <span className="text-[10px] text-slate-400 truncate block">Apply & balance</span>
              </div>
            </button>

            {/* Tile 3: Holiday List */}
            <button
              type="button"
              onClick={() => setActiveModal('holidays')}
              className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-sm flex items-center gap-3 text-left hover:border-emerald-500 hover:bg-emerald-50/30 transition-all active:scale-[0.98] min-h-[56px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <CalendarDays className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="font-bold text-xs text-slate-800 block truncate">
                  Holiday List
                </span>
                <span className="text-[10px] text-slate-400 truncate block">Gazetted dates</span>
              </div>
            </button>

            {/* Tile 4: Notes */}
            <button
              type="button"
              onClick={() => setActiveModal('notes')}
              className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-sm flex items-center gap-3 text-left hover:border-emerald-500 hover:bg-emerald-50/30 transition-all active:scale-[0.98] min-h-[56px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="font-bold text-xs text-slate-800 block truncate">
                  Notes
                </span>
                <span className="text-[10px] text-slate-400 truncate block">Personal memos</span>
              </div>
            </button>
          </div>
        </div>

        {/* SECTION B: MY HR */}
        <div className="space-y-2">
          <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
            MY HR
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            {/* Tile 1: HR Profile */}
            <button
              type="button"
              onClick={() => setActiveModal('hr_profile')}
              className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-sm flex items-center gap-3 text-left hover:border-emerald-500 hover:bg-emerald-50/30 transition-all active:scale-[0.98] min-h-[56px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                <IdCard className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="font-bold text-xs text-slate-800 block truncate">
                  HR Profile
                </span>
                <span className="text-[10px] text-slate-400 truncate block">Official records</span>
              </div>
            </button>

            {/* Tile 2: My Documents */}
            <button
              type="button"
              onClick={() => setActiveModal('documents')}
              className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-sm flex items-center gap-3 text-left hover:border-emerald-500 hover:bg-emerald-50/30 transition-all active:scale-[0.98] min-h-[56px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <FolderLock className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="font-bold text-xs text-slate-800 block truncate">
                  My Documents
                </span>
                <span className="text-[10px] text-slate-400 truncate block">Vault & files</span>
              </div>
            </button>
          </div>
        </div>

        {/* SECTION C: UPDATES */}
        <div className="space-y-2">
          <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
            UPDATES
          </h2>
          <div className="grid grid-cols-1 gap-2.5">
            {/* Tile 1: Announcements */}
            <button
              type="button"
              onClick={() => setActiveModal('announcements')}
              className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-sm flex items-center justify-between hover:border-emerald-500 hover:bg-emerald-50/30 transition-all active:scale-[0.98] min-h-[56px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 relative">
                  <Bell className="w-5 h-5" />
                  {unreadAnnouncements > 0 && (
                    <span 
                      className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" 
                      aria-label={`${unreadAnnouncements} unread announcements`} 
                    />
                  )}
                </div>
                <div>
                  <span className="font-bold text-xs text-slate-800 block">
                    Announcements
                  </span>
                  <span className="text-[10px] text-slate-400 block">Official bulletins & updates</span>
                </div>
              </div>

              {unreadAnnouncements > 0 && (
                <span 
                  className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-extrabold shadow-sm"
                  aria-label={`${unreadAnnouncements} unread`}
                >
                  {unreadAnnouncements} NEW
                </span>
              )}
            </button>
          </div>
        </div>

        {/* SECTION D: ACCOUNT */}
        <div className="space-y-2">
          <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
            ACCOUNT
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            {/* Tile 1: Change Password */}
            <button
              type="button"
              onClick={() => setActiveModal('change_password')}
              className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-sm flex items-center gap-3 text-left hover:border-emerald-500 hover:bg-emerald-50/30 transition-all active:scale-[0.98] min-h-[56px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                <Key className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="font-bold text-xs text-slate-800 block truncate">
                  Password
                </span>
                <span className="text-[10px] text-slate-400 truncate block">Change login key</span>
              </div>
            </button>

            {/* Tile 2: Language */}
            <button
              type="button"
              onClick={() => setActiveModal('language')}
              className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-sm flex items-center gap-3 text-left hover:border-emerald-500 hover:bg-emerald-50/30 transition-all active:scale-[0.98] min-h-[56px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                <Languages className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="font-bold text-xs text-slate-800 block truncate">
                  Language
                </span>
                <span className="text-[10px] text-slate-400 truncate block">EN / HI / GJ</span>
              </div>
            </button>

            {/* Tile 3: Punch reminder (replaces set alarm) */}
            <button
              type="button"
              onClick={() => setActiveModal('reminder')}
              className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-sm flex items-center gap-3 text-left hover:border-emerald-500 hover:bg-emerald-50/30 transition-all active:scale-[0.98] min-h-[56px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="font-bold text-xs text-slate-800 block truncate">
                  Punch Reminder
                </span>
                <span className="text-[10px] text-slate-400 truncate block">Notification alert</span>
              </div>
            </button>

            {/* Tile 4: Logout */}
            <button
              type="button"
              onClick={() => {
                if (confirm('Are you sure you want to log out of your session?')) {
                  onLogout();
                }
              }}
              className="bg-white rounded-2xl p-3.5 border border-rose-200/80 shadow-sm flex items-center gap-3 text-left hover:bg-rose-50 transition-all active:scale-[0.98] min-h-[56px] focus:outline-none focus:ring-2 focus:ring-rose-500/20 group"
            >
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 group-hover:bg-rose-100">
                <LogOut className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="font-bold text-xs text-rose-600 block truncate">
                  Logout
                </span>
                <span className="text-[10px] text-rose-400 truncate block">Exit application</span>
              </div>
            </button>
          </div>
        </div>

      </div>

      {/* RENDER MODAL SCREENS */}
      {activeModal === 'attendance' && (
        <ViewAttendanceModal onClose={() => setActiveModal(null)} />
      )}

      {activeModal === 'leave' && (
        <RequestLeaveModal 
          onClose={() => setActiveModal(null)} 
          onSuccess={() => loadProfileData()}
        />
      )}

      {activeModal === 'holidays' && (
        <HolidayListModal onClose={() => setActiveModal(null)} />
      )}

      {activeModal === 'notes' && (
        <NotesModal onClose={() => setActiveModal(null)} />
      )}

      {activeModal === 'hr_profile' && (
        <HRProfileModal onClose={() => setActiveModal(null)} />
      )}

      {activeModal === 'documents' && (
        <MyDocumentsModal onClose={() => setActiveModal(null)} />
      )}

      {activeModal === 'announcements' && (
        <AnnouncementsModal 
          onClose={() => setActiveModal(null)} 
          onAnnouncementsRead={() => loadProfileData()}
        />
      )}

      {activeModal === 'change_password' && (
        <ChangePasswordModal onClose={() => setActiveModal(null)} />
      )}

      {activeModal === 'language' && (
        <LanguageModal onClose={() => setActiveModal(null)} />
      )}

      {activeModal === 'reminder' && (
        <PunchReminderModal onClose={() => setActiveModal(null)} />
      )}
    </div>
  );
}
