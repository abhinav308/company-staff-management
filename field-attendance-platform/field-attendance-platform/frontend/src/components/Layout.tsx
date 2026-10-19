import { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export interface NavTab {
  id: string;
  label: string;
  icon?: string;
  route?: string;
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

function NavIcon({ name, className = 'w-5 h-5 shrink-0' }: { name?: string; className?: string }) {
  switch (name) {
    case 'overview':
    case 'dashboard':
    case 'home':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case 'map':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      );
    case 'users':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      );
    case 'sessions':
    case 'attendance':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'reports':
    case 'visits':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'audit':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    case 'leaves':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2zM3 15a4 4 0 004 4h9" />
        </svg>
      );
    case 'holidays':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      );
    case 'documents':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'announcements':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
        </svg>
      );
    case 'profile_changes':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    default:
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      );
  }
}

interface FloatingTooltipState {
  label: string;
  badge?: number | string;
  top: number;
  left: number;
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
  const location = useLocation();

  // Responsive Drawer state (< 1024px)
  const [mobileOpen, setMobileOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Desktop Collapsible state (>= 1024px), persisted in localStorage
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('admin_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('admin_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  // Portal floating tooltip state for collapsed items (never clipped by sidebar)
  const [floatingTooltip, setFloatingTooltip] = useState<FloatingTooltipState | null>(null);

  const fullName = user?.full_name || user?.username || 'Administrator';
  const designation = user?.profile?.designation || (user?.role === 'ADMIN' ? 'System Administrator' : 'Field Officer');
  const department = user?.profile?.department || 'IT Division (GNFC)';

  const handleLogout = () => {
    setMobileOpen(false);
    logout();
    nav('/login', { replace: true });
  };

  const defaultTabs: NavTab[] = [
    { id: 'overview', label: 'Dashboard', icon: 'overview', route: '/admin' },
    { id: 'map', label: 'Live Field Map', icon: 'map', route: '/admin/map' },
    { id: 'users', label: 'Field Personnel', icon: 'users', route: '/admin/users' },
    { id: 'attendance', label: 'Sessions & Attendance', icon: 'attendance', route: '/admin/sessions' },
    { id: 'visits', label: 'Field Reports', icon: 'reports', route: '/admin/reports' },
    { id: 'audit', label: 'Audit Log', icon: 'audit', route: '/admin/audit' },
  ];

  const sidebarTabs = tabs && tabs.length > 0 ? tabs : defaultTabs;

  // Close drawer on Escape key and return focus to hamburger button
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileOpen) {
        setMobileOpen(false);
        hamburgerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const showTooltip = (e: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>, label: string, badge?: number | string) => {
    if (!collapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setFloatingTooltip({
      label,
      badge,
      top: rect.top + rect.height / 2,
      left: rect.right + 12,
    });
  };

  const hideTooltip = () => {
    setFloatingTooltip(null);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex font-sans text-slate-800 antialiased selection:bg-blue-600 selection:text-white box-border overflow-x-hidden">
      {/* Mobile Dimmed Backdrop (< 1024px) */}
      {mobileOpen && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Close navigation menu"
          onClick={() => {
            setMobileOpen(false);
            hamburgerRef.current?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter') {
              setMobileOpen(false);
              hamburgerRef.current?.focus();
            }
          }}
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Component */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-[#1e293b] text-white flex flex-col h-screen box-border overflow-x-hidden border-r border-slate-700/60 shadow-xl transition-[width,transform] duration-300 ease-in-out will-change-[width,transform] ${
          // Mobile (< 1024px): Off-canvas drawer (always 280px wide)
          mobileOpen ? 'translate-x-0 w-[280px]' : '-translate-x-full w-[280px]'
        } lg:translate-x-0 lg:static lg:h-screen lg:shrink-0 ${
          // Desktop (>= 1024px): Collapsible (272px vs 72px)
          collapsed ? 'lg:w-[72px]' : 'lg:w-[272px]'
        }`}
      >
        {/* Header (Logo + Toggle) */}
        <div className="shrink-0 border-b border-slate-700/60 bg-[#0f172a]/70 box-border">
          {collapsed ? (
            // Collapsed Header (72px): Centered Logo Mark (40px) + Toggle Chevron Below
            <div className="flex flex-col items-center justify-center w-full py-3 gap-2">
              <Link
                to="/admin"
                aria-label="Ncode IT Division Home"
                onMouseEnter={(e) => showTooltip(e, 'Ncode Command Center')}
                onMouseLeave={hideTooltip}
                onFocus={(e) => showTooltip(e, 'Ncode Command Center')}
                onBlur={hideTooltip}
                className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white text-base shadow shrink-0 hover:bg-blue-500 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                (n)
              </Link>
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="Expand sidebar"
                aria-expanded="false"
                onMouseEnter={(e) => showTooltip(e, 'Expand Sidebar')}
                onMouseLeave={hideTooltip}
                onFocus={(e) => showTooltip(e, 'Expand Sidebar')}
                onBlur={hideTooltip}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
                title="Expand sidebar"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          ) : (
            // Expanded Header: Logo Mark (40px) + Title on Left, Collapse Button on Right
            <div className="h-16 flex items-center justify-between px-4 w-full box-border">
              <Link to="/admin" className="flex items-center gap-3 overflow-hidden min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white text-base shadow shrink-0">
                  (n)
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-sm tracking-wide text-white leading-tight truncate">
                    Ncode IT Division
                  </span>
                  <span className="text-[10px] text-blue-400 font-medium tracking-wider uppercase truncate">
                    Command Center
                  </span>
                </div>
              </Link>

              {/* Desktop Collapse Toggle */}
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="Collapse sidebar"
                aria-expanded="true"
                className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0 ml-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                title="Collapse sidebar"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>

              {/* Mobile Drawer Close Button (< 1024px) */}
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  hamburgerRef.current?.focus();
                }}
                aria-label="Close navigation menu"
                className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0 ml-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Navigation Area (Only Nav Scrolls) */}
        <nav
          aria-label="Admin"
          className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2.5 space-y-1.5 box-border"
        >
          {sidebarTabs.map((tab) => {
            const isActive =
              activeTab === tab.id ||
              (tab.route && location.pathname === tab.route) ||
              (tab.id === 'overview' && location.pathname === '/admin');

            const badgeDisplay =
              tab.badge !== undefined && tab.badge !== 0
                ? typeof tab.badge === 'number' && tab.badge > 99
                  ? '99+'
                  : String(tab.badge)
                : null;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (tab.route) nav(tab.route);
                  onTabChange?.(tab.id);
                  setMobileOpen(false);
                }}
                aria-current={isActive ? 'page' : undefined}
                onMouseEnter={(e) => showTooltip(e, tab.label, badgeDisplay || undefined)}
                onMouseLeave={hideTooltip}
                onFocus={(e) => showTooltip(e, tab.label, badgeDisplay || undefined)}
                onBlur={hideTooltip}
                title={!collapsed ? tab.label : undefined}
                className={`relative flex items-center h-11 rounded-xl font-medium text-sm transition-all box-border w-full group focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 focus:ring-offset-slate-900 ${
                  collapsed ? 'justify-center px-0' : 'gap-3 px-3'
                } ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                {/* Fixed 20px Icon Box with Attached Badge on Collapsed */}
                <div className="relative w-5 h-5 flex items-center justify-center shrink-0">
                  <NavIcon name={tab.icon || tab.id} />
                  {/* Collapsed Badge attached to top-right corner of icon */}
                  {collapsed && badgeDisplay && (
                    <span
                      aria-hidden="true"
                      className={`absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full flex items-center justify-center leading-none shadow-md pointer-events-none ${
                        isActive ? 'bg-white text-blue-700' : 'bg-blue-500 text-white'
                      }`}
                    >
                      {badgeDisplay}
                    </span>
                  )}
                </div>

                {/* Expanded Label or Screen-Reader Only Label */}
                {collapsed ? (
                  <span className="sr-only">
                    {tab.label} {badgeDisplay ? `(${badgeDisplay})` : ''}
                  </span>
                ) : (
                  <>
                    <span className="truncate min-w-0 flex-1 text-left">{tab.label}</span>
                    {badgeDisplay && (
                      <span
                        className={`ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
                          isActive
                            ? 'bg-white text-blue-700'
                            : 'bg-slate-800 text-slate-300 group-hover:bg-slate-700'
                        }`}
                      >
                        {badgeDisplay}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer (User Card + Sign Out) */}
        <div className="shrink-0 border-t border-slate-700/60 bg-[#0f172a]/50 p-2.5 box-border">
          {collapsed ? (
            // Collapsed Footer: Centered Avatar + Centered Icon-only Sign Out Button
            <div className="flex flex-col items-center justify-center gap-2.5 w-full">
              <div
                tabIndex={0}
                aria-label={`Logged in as ${fullName}, ${designation}`}
                onMouseEnter={(e) => showTooltip(e, `${fullName} (${designation})`)}
                onMouseLeave={hideTooltip}
                onFocus={(e) => showTooltip(e, `${fullName} (${designation})`)}
                onBlur={hideTooltip}
                className="w-10 h-10 rounded-full bg-slate-700 text-blue-400 font-bold flex items-center justify-center text-sm border border-slate-600 shrink-0 cursor-default focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {fullName.charAt(0).toUpperCase()}
              </div>

              <button
                type="button"
                onClick={handleLogout}
                aria-label="Sign out"
                onMouseEnter={(e) => showTooltip(e, 'Sign Out')}
                onMouseLeave={hideTooltip}
                onFocus={(e) => showTooltip(e, 'Sign Out')}
                onBlur={hideTooltip}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-rose-300 hover:text-white hover:bg-rose-600/20 border border-rose-500/30 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-400"
                title="Sign Out"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          ) : (
            // Expanded Footer: Full user card + Full-width Sign Out Button
            <div className="space-y-2.5 w-full box-border">
              <div className="px-1.5 flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-slate-700 text-blue-400 font-bold flex items-center justify-center text-sm border border-slate-600 shrink-0">
                  {fullName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">{fullName}</p>
                  <p className="text-[10px] text-slate-400 truncate">{designation}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                aria-label="Sign out of administration"
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-300 hover:text-white hover:bg-rose-600/20 border border-rose-500/30 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-400"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Floating Tooltip Portal (Rendered outside sidebar to guarantee zero clipping) */}
      {collapsed &&
        floatingTooltip &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: floatingTooltip.top,
              left: floatingTooltip.left,
              transform: 'translateY(-50%)',
            }}
            className="z-[9999] px-2.5 py-1.5 bg-slate-900/95 backdrop-blur-md text-white text-xs font-semibold rounded-lg shadow-2xl border border-slate-700/80 pointer-events-none flex items-center gap-2 whitespace-nowrap animate-fadeIn"
          >
            <span>{floatingTooltip.label}</span>
            {floatingTooltip.badge && (
              <span className="bg-blue-600 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                {floatingTooltip.badge}
              </span>
            )}
          </div>,
          document.body
        )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-x-hidden box-border">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 z-30 flex items-center justify-between px-4 sm:px-6 shrink-0 shadow-sm box-border">
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger Button (< 1024px only) */}
            <button
              ref={hamburgerRef}
              type="button"
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {title || 'Command Center'}
              </h1>
              {subtitle && (
                <p className="text-xs text-slate-500 truncate hidden sm:block">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Right Header Badges */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 truncate">
              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              <span className="truncate">{department}</span>
            </span>
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-sm shrink-0">
                {fullName.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Page Viewport */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 space-y-6 box-border min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
