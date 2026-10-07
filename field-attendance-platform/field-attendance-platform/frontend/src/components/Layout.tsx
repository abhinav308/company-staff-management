import { ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface NavTab {
  id: string;
  label: string;
  badge?: number | string;
}

interface LayoutProps {
  title?: string;
  subtitle?: string;
  tabs?: NavTab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  children: ReactNode;
}

export default function Layout({
  title,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  children,
}: LayoutProps) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const employeeId = user?.profile?.employee_id || user?.username || '';
  const fullName = user?.full_name || user?.username || 'Employee';
  const department = user?.profile?.department || 'IT Division (GNFC)';
  const designation =
    user?.profile?.designation || (user?.role === 'ADMIN' ? 'System Administrator' : 'Field Officer');

  const handleTabClick = (tabId: string) => {
    onTabChange?.(tabId);
    setMobileOpen(false);
  };

  const handleLogout = () => {
    setMobileOpen(false);
    logout();
    nav('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Hamburger (mobile/tablet) + Brand Logo & Title */}
            <div className="flex items-center gap-3">
              {tabs && tabs.length > 0 && (
                <button
                  type="button"
                  className="md:hidden p-2 -ml-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
                  onClick={() => setMobileOpen(true)}
                  aria-label="Open mobile navigation"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              )}

              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-blue-600 flex items-center justify-center font-black text-lg text-white shadow-md ring-2 ring-white/10 shrink-0">
                (n)
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold tracking-tight text-white text-sm sm:text-base md:text-lg uppercase">
                    Ncode Solution IT Division
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                    GNFC
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-light hidden sm:block">
                  Field Attendance, Location Tracking & Activity Management
                </p>
              </div>
            </div>

            {/* Right: User Profile & Actions (Desktop) */}
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <div className="flex items-center justify-end gap-2">
                  <span className="text-sm font-semibold text-white">{fullName}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                      user?.role === 'ADMIN'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {user?.role === 'ADMIN' ? 'ADMIN' : 'FIELD USER'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  <span className="font-mono text-teal-400">{employeeId}</span> · {designation}
                </div>
              </div>

              {/* Mobile Profile Pill */}
              <div className="sm:hidden flex items-center gap-1.5">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                    user?.role === 'ADMIN'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {user?.role === 'ADMIN' ? 'ADMIN' : 'FIELD'}
                </span>
              </div>

              <button
                type="button"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-rose-900/40 hover:text-rose-200 border border-slate-700 hover:border-rose-700/50 transition-colors"
                onClick={handleLogout}
                title="Sign out of system"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>

        {/* Desktop Navigation Tabs Bar */}
        {tabs && tabs.length > 0 && (
          <div className="bg-slate-950 border-t border-slate-800/80 px-4 sm:px-6 lg:px-8 hidden md:block">
            <div className="max-w-7xl mx-auto flex gap-1 overflow-x-auto py-1 scrollbar-none">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange?.(tab.id)}
                    className={`px-3.5 py-2 text-xs font-medium rounded-md whitespace-nowrap transition-all flex items-center gap-2 ${
                      isActive
                        ? 'bg-blue-900 text-white shadow-sm ring-1 ring-blue-700'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <span>{tab.label}</span>
                    {tab.badge !== undefined && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          isActive
                            ? 'bg-blue-700 text-white'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* Slide-over Mobile Navigation Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop Overlay */}
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <div className="relative w-full max-w-xs bg-slate-900 text-white shadow-2xl flex flex-col z-10 border-r border-slate-800">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-teal-500 to-blue-600 flex items-center justify-center font-bold text-sm text-white">
                  (n)
                </div>
                <div>
                  <h3 className="font-bold text-xs uppercase text-white tracking-wide">
                    Ncode Solution
                  </h3>
                  <p className="text-[10px] text-teal-400 uppercase font-semibold">
                    IT Division (GNFC)
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Employee Profile Card inside Drawer */}
            <div className="p-4 bg-slate-950/80 border-b border-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-900 border border-blue-700 flex items-center justify-center font-bold text-white text-sm shrink-0">
                  {user?.first_name?.[0] || user?.username?.[0] || 'N'}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{fullName}</p>
                  <p className="text-xs text-teal-400 font-mono font-semibold">{employeeId}</p>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">{designation}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
                <span>{department}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    user?.role === 'ADMIN'
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-emerald-500/20 text-emerald-300'
                  }`}
                >
                  {user?.role}
                </span>
              </div>
            </div>

            {/* Navigation List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Navigation Menu
              </p>
              {tabs &&
                tabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleTabClick(tab.id)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-blue-900 text-white shadow-md ring-1 ring-blue-700'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                      }`}
                    >
                      <span>{tab.label}</span>
                      {tab.badge !== undefined && (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            isActive ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-3 border-t border-slate-800 bg-slate-950">
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 transition-colors"
                onClick={handleLogout}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Sign Out of Portal</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {(title || subtitle) && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200/60 gap-2">
            <div>
              {title && <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>}
              {subtitle && <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
            <div className="text-xs text-slate-500 font-mono flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{department}</span>
            </div>
          </div>
        )}
        {children}
      </main>

      {/* Corporate Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© {new Date().getFullYear()} Ncode Solution IT Division (GNFC). All rights reserved.</p>
          <p className="text-[11px] text-slate-400">
            Internal Enterprise Field Attendance & Location Activity Portal
          </p>
        </div>
      </footer>
    </div>
  );
}
