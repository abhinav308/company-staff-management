import React, { useEffect, useState } from 'react';
import { 
  ChevronLeft, 
  Lock, 
  Key, 
  Languages, 
  Bell, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Check, 
  Info,
  Calendar
} from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';

// ================= 1. CHANGE PASSWORD MODAL =================
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { logout } = useAuth();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Password strength checker
  const hasMinLen = newPassword.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const isMatch = newPassword && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!hasMinLen || !hasLetter || !hasNumber) {
      setError('Password must be at least 8 characters long and contain both letters and numbers.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/me/change-password/', {
        old_password: oldPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setSuccess(true);
      setTimeout(() => {
        logout();
        window.location.href = '/login';
      }, 2000);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex justify-center items-end sm:items-center sm:p-4">
      <div className="bg-slate-50 w-full max-w-md h-[95vh] sm:h-[840px] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
        
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
              <h2 className="text-base font-bold text-slate-900 leading-tight">Change Password</h2>
              <p className="text-[11px] text-slate-500">Update Account Credentials</p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success ? (
            <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-3">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Password Changed!</h3>
              <p className="text-xs text-slate-500">
                Your password was updated successfully. Redirecting to login page to re-authenticate...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="old-pass">
                  Current Password *
                </label>
                <input
                  id="old-pass"
                  type="password"
                  value={oldPassword}
                  onChange={e => setOldPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="new-pass">
                  New Password *
                </label>
                <input
                  id="new-pass"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="confirm-pass">
                  Confirm New Password *
                </label>
                <input
                  id="confirm-pass"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  required
                />
              </div>

              {/* Strength Hint Checklist */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1.5 text-[11px]">
                <span className="font-bold text-slate-600 block mb-1">Password Requirements:</span>
                <div className={`flex items-center gap-1.5 ${hasMinLen ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>
                  {hasMinLen ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <div className="w-3.5 h-3.5 rounded-full border border-slate-300" />}
                  <span>Minimum 8 characters</span>
                </div>
                <div className={`flex items-center gap-1.5 ${hasLetter && hasNumber ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>
                  {hasLetter && hasNumber ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <div className="w-3.5 h-3.5 rounded-full border border-slate-300" />}
                  <span>Letters and numbers</span>
                </div>
                <div className={`flex items-center gap-1.5 ${isMatch ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>
                  {isMatch ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <div className="w-3.5 h-3.5 rounded-full border border-slate-300" />}
                  <span>Passwords match</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-md transition-all active:scale-[0.99] disabled:opacity-50 text-xs"
              >
                {submitting ? 'Updating Password...' : 'Save & Re-Login'}
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}

// ================= 2. LANGUAGE MODAL =================
export function LanguageModal({ onClose }: { onClose: () => void }) {
  const [selectedLang, setSelectedLang] = useState<string>(() => {
    return localStorage.getItem('app_language') || 'en';
  });
  const [saved, setSaved] = useState(false);

  const languages = [
    { code: 'en', name: 'English', native: 'English', desc: 'Standard business English' },
    { code: 'hi', name: 'Hindi', native: 'हिंदी', desc: 'राजभाषा हिंदी' },
    { code: 'gj', name: 'Gujarati', native: 'ગુજરાતી', desc: 'સ્થાનિક ભાષા ગુજરાતી' },
  ];

  const handleSelect = (code: string) => {
    setSelectedLang(code);
    localStorage.setItem('app_language', code);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex justify-center items-end sm:items-center sm:p-4">
      <div className="bg-slate-50 w-full max-w-md h-[95vh] sm:h-[840px] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
        
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
              <h2 className="text-base font-bold text-slate-900 leading-tight">Language</h2>
              <p className="text-[11px] text-slate-500">Choose Display Language</p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {saved && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Language preference updated!</span>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm divide-y divide-slate-100">
            {languages.map(lang => {
              const isSelected = selectedLang === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleSelect(lang.code)}
                  className={`w-full min-h-[56px] p-4 flex items-center justify-between text-left transition-all ${
                    isSelected ? 'bg-emerald-50/60' : 'hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{lang.native}</span>
                      <span className="text-xs text-slate-400">({lang.name})</span>
                    </div>
                    <span className="text-[11px] text-slate-500 block mt-0.5">{lang.desc}</span>
                  </div>

                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                      <Check className="w-4 h-4 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="bg-slate-100 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-500">
            <span className="font-semibold text-slate-700 block mb-0.5">Note on Localization:</span>
            Content headers, notifications, and menus adapt to your selected language preference across the app.
          </div>
        </div>
      </div>
    </div>
  );
}

// ================= 3. PUNCH REMINDER MODAL =================
export function PunchReminderModal({ onClose }: { onClose: () => void }) {
  const [time, setTime] = useState<string>(() => localStorage.getItem('punch_reminder_time') || '09:00');
  const [enabled, setEnabled] = useState<boolean>(() => localStorage.getItem('punch_reminder_enabled') === 'true');
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [saved, setSaved] = useState(false);
  const [days, setDays] = useState<string[]>(() => {
    try {
      const savedDays = localStorage.getItem('punch_reminder_days');
      return savedDays ? JSON.parse(savedDays) : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    } catch {
      return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    }
  });

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const handleRequestPermission = async () => {
    if ('Notification' in window) {
      const res = await Notification.requestPermission();
      setPermission(res);
      if (res === 'granted') {
        new Notification('Field Force Attendance', {
          body: 'Punch reminders are now configured and active!',
          icon: '/favicon.ico',
        });
      }
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('punch_reminder_time', time);
    localStorage.setItem('punch_reminder_enabled', String(enabled));
    localStorage.setItem('punch_reminder_days', JSON.stringify(days));

    if (enabled && permission !== 'granted' && 'Notification' in window) {
      handleRequestPermission();
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const toggleDay = (d: string) => {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex justify-center items-end sm:items-center sm:p-4">
      <div className="bg-slate-50 w-full max-w-md h-[95vh] sm:h-[840px] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
        
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
              <h2 className="text-base font-bold text-slate-900 leading-tight">Punch Reminder</h2>
              <p className="text-[11px] text-slate-500">Daily Attendance Notifications</p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {saved && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Punch reminder schedule saved!</span>
            </div>
          )}

          {/* Browser Notification Status Banner */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-slate-900">Browser Notification Permission</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                permission === 'granted' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {permission.toUpperCase()}
              </span>
            </div>

            {permission !== 'granted' && (
              <button
                type="button"
                onClick={handleRequestPermission}
                className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl border border-emerald-200 transition-colors"
              >
                Grant Browser Notification Permission
              </button>
            )}
          </div>

          {/* Reminder Schedule Form */}
          <form onSubmit={handleSave} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold text-slate-900 block">Daily Punch Reminder</span>
                <span className="text-[10px] text-slate-500">Receive an alert before your shift</span>
              </div>
              <input
                type="checkbox"
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
                className="w-5 h-5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="reminder-time">
                Reminder Time *
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="reminder-time"
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-800 font-mono font-bold focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  required
                />
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-2">Repeat On Days</span>
              <div className="flex items-center justify-between gap-1">
                {weekDays.map(d => {
                  const isSelected = days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                        isSelected 
                          ? 'bg-emerald-600 text-white shadow-sm' 
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {d.slice(0, 1)}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              className="w-full min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-md transition-all active:scale-[0.99] text-xs"
            >
              Save Reminder Settings
            </button>
          </form>

          {/* Explanation notice */}
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl flex items-start gap-2.5 text-xs text-slate-600">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <p className="leading-snug">
              Punch reminders utilize the Web Notification API and trigger while this application tab is running in the browser or foreground/background process.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
