import { ReactNode, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface NavTab {
  id: string;
  label: string;
  icon?: ReactNode;
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

// A simple SVG icon helper for the sidebar
function Icon({ name }: { name: string }) {
  switch (name) {
    case 'home':
      return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>;
    case 'setup':
      return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
    case 'users':
      return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
    case 'transfer':
      return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>;
    case 'news':
      return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>;
    case 'reports':
      return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
    default:
      return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>;
  }
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
  const location = useLocation();

  const employeeId = user?.profile?.employee_id || user?.username || '';
  const fullName = user?.full_name || user?.username || 'Administrator';
  const designation = user?.profile?.designation || (user?.role === 'ADMIN' ? 'System Administrator' : 'Field Officer');

  const handleLogout = () => {
    setMobileOpen(false);
    logout();
    nav('/login', { replace: true });
  };

  const defaultTabs = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'setup', label: 'Setup', icon: 'setup' },
    { id: 'users', label: 'User Management', icon: 'users' },
    { id: 'transfer', label: 'Transfer', icon: 'transfer' },
    { id: 'news', label: 'News', icon: 'news' },
    { id: 'reports', label: 'Reports', icon: 'reports' },
  ];

  const sidebarTabs = tabs && tabs.length > 0 ? tabs : defaultTabs;

  return (
    <div className="min-h-screen bg-[#e8e9eb] flex font-sans text-slate-800">
      
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-16 bg-[#2c3136] text-white flex flex-col transition-transform ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:static md:flex-shrink-0 border-r border-slate-700`}>
        {/* Sidebar Logo/Home */}
        <div className="h-16 flex items-center justify-center border-b border-slate-700/50 bg-[#353a40]">
           <button onClick={() => nav('/')} className="w-10 h-10 rounded-full bg-white flex items-center justify-center p-1 cursor-pointer">
             <div className="w-full h-full rounded-full border-2 border-[#00a29a] flex items-center justify-center">
                <span className="text-[#00a29a] text-[14px] font-bold leading-none text-center">(n)</span>
             </div>
           </button>
        </div>
        
        {/* Sidebar Links */}
        <div className="flex-1 overflow-y-auto py-4 flex flex-col items-center gap-2">
          {sidebarTabs.map((tab) => {
            const isActive = activeTab === tab.id || (tab.id === 'home' && location.pathname === '/');
            return (
              <button
                key={tab.id}
                onClick={() => {
                  onTabChange?.(tab.id);
                  if (tab.id === 'home') nav('/');
                  setMobileOpen(false);
                }}
                title={tab.label}
                className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
                  isActive ? 'bg-[#00a29a] text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {tab.icon && typeof tab.icon === 'string' ? <Icon name={tab.icon} /> : tab.icon || <Icon name="default" />}
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-slate-700/50">
           <button onClick={handleLogout} title="Logout" className="w-10 h-10 rounded-lg text-slate-400 hover:text-white hover:bg-red-500/20 flex items-center justify-center">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
           </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        
        {/* Top Header */}
        <header className="h-16 bg-white shadow-sm z-30 flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button className="md:hidden text-slate-500" onClick={() => setMobileOpen(true)}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full border border-blue-200 bg-blue-50 flex items-center justify-center">
                 <span className="text-blue-600 font-bold text-sm">(n)</span>
              </div>
              <h1 className="text-sm font-bold text-[#0088ff]">Ncode Staff Portal</h1>
              <span className="text-slate-400 mx-2">≡</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative cursor-pointer">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">0</span>
            </div>
            
            <div className="flex items-center gap-2 cursor-pointer group">
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 overflow-hidden">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
              </div>
              <div className="hidden sm:block">
                <div className="text-xs font-bold text-slate-700 uppercase leading-none">{fullName}</div>
                <div className="text-[10px] text-slate-400 uppercase mt-1">{designation}</div>
              </div>
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {(title || subtitle) && (
             <div className="mb-6 flex items-center justify-between">
                <div>
                  {title && <h2 className="text-2xl font-semibold text-slate-800">{title}</h2>}
                  {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
                </div>
             </div>
          )}
          {children}
          
          {/* Subtle footer */}
          <div className="mt-12 pt-4 border-t border-slate-300 text-center text-xs text-slate-400">
             Design & Developed by © {new Date().getFullYear()} (n)Code Solutions
          </div>
        </main>
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-30 md:hidden" onClick={() => setMobileOpen(false)} />
      )}
    </div>
  );
}
