import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import EventTimeline from '../../components/EventTimeline';
import EvidenceImage from '../../components/EvidenceImage';
import Layout from '../../components/Layout';
import MapView, { type MapMarker } from '../../components/MapView';
import api, { tokens, WS_URL } from '../../services/api';
import { fmtDate, fmtDuration, fmtTime, STATUS_COLOR } from '../../services/format';
import type { AdminSummary, AdminUser, AdminVisitDetail, LivePoint, Page, Session, Visit, VisitPhoto } from '../../types';

type AdminTab = 'overview' | 'users' | 'map' | 'visits' | 'attendance';

const VISIT_CATEGORIES: { id: string; label: string }[] = [
  { id: '', label: 'All Categories' },
  { id: 'SITE_INSPECTION', label: 'Site Inspection & Audit' },
  { id: 'CLIENT_MEETING', label: 'Client / Stakeholder Meeting' },
  { id: 'TECHNICAL_VERIFICATION', label: 'Technical Verification' },
  { id: 'INFRASTRUCTURE_AUDIT', label: 'Infrastructure Audit' },
  { id: 'GOVERNMENT_LIAISON', label: 'Government Liaison' },
  { id: 'EMERGENCY_DISPATCH', label: 'Emergency Dispatch' },
  { id: 'OTHER', label: 'Other Field Visit' },
];

const VISIT_STATUSES: { id: string; label: string }[] = [
  { id: '', label: 'All Statuses' },
  { id: 'IN_PROGRESS', label: 'In Progress (Active)' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'CANCELLED', label: 'Cancelled' },
];

const VISIT_OUTCOMES: { id: string; label: string }[] = [
  { id: '', label: 'All Outcomes' },
  { id: 'PENDING', label: 'Pending / In Progress' },
  { id: 'SATISFACTORY', label: 'Satisfactory / Successful' },
  { id: 'ACTION_REQUIRED', label: 'Action Required' },
  { id: 'FOLLOW_UP_NEEDED', label: 'Follow-Up Needed' },
  { id: 'CANCELLED', label: 'Cancelled' },
];

const CATEGORY_NAMES: Record<string, string> = {
  SITE_INSPECTION: 'Site Inspection',
  CLIENT_MEETING: 'Client Meeting',
  TECHNICAL_VERIFICATION: 'Technical Verification',
  INFRASTRUCTURE_AUDIT: 'Infrastructure Audit',
  GOVERNMENT_LIAISON: 'Govt Liaison',
  EMERGENCY_DISPATCH: 'Emergency Dispatch',
  OTHER: 'Field Visit',
};

export default function AdminDashboard() {
  const nav = useNavigate();
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (tabParam === 'visits' || tabParam === 'attendance' || tabParam === 'users' || tabParam === 'map') {
      return tabParam as AdminTab;
    }
    return 'overview';
  });
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [live, setLive] = useState<Record<number, LivePoint>>({});
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);

  // Field Visits Tab State
  const [visits, setVisits] = useState<Visit[]>([]);
  const [visitLoading, setVisitLoading] = useState(false);
  const [visitTotalCount, setVisitTotalCount] = useState(0);
  const [visitPage, setVisitPage] = useState(1);
  const [visitPageSize, setVisitPageSize] = useState(15);
  const [visitSearch, setVisitSearch] = useState('');
  const [visitCategory, setVisitCategory] = useState('');
  const [visitStatus, setVisitStatus] = useState('');
  const [visitOutcome, setVisitOutcome] = useState('');
  const [visitDepartment, setVisitDepartment] = useState('');
  const [visitDateFrom, setVisitDateFrom] = useState('');
  const [visitDateTo, setVisitDateTo] = useState('');
  const [visitExportingCsv, setVisitExportingCsv] = useState(false);

  // Visit Inspection Dossier Modal State
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);
  const [selectedVisitDetail, setSelectedVisitDetail] = useState<AdminVisitDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<VisitPhoto | null>(null);

  // Users Tab Filters
  const [q, setQ] = useState('');
  const [activeOnly, setActiveOnly] = useState('');

  // Attendance Tab Filters & CSV Export State
  const [attDateFrom, setAttDateFrom] = useState('');
  const [attDateTo, setAttDateTo] = useState('');
  const [attDepartment, setAttDepartment] = useState('');
  const [attStatus, setAttStatus] = useState('');
  const [departments, setDepartments] = useState<string[]>(['IT Division (GNFC)']);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [attLoading, setAttLoading] = useState(false);

  const [wsOk, setWsOk] = useState(false);
  const [selectedLiveUser, setSelectedLiveUser] = useState<LivePoint | null>(null);

  const refreshSummary = () =>
    api.get<AdminSummary>('/admin/summary/').then((r) => setSummary(r.data));

  // Initial load
  useEffect(() => {
    refreshSummary();
    api.get<LivePoint[]>('/admin/live/').then((r) =>
      setLive(Object.fromEntries(r.data.map((p) => [p.session_id, p])))
    );
    api.get<string[]>('/admin/departments/').then((r) => {
      if (r.data && r.data.length > 0) setDepartments(r.data);
    }).catch(() => undefined);
  }, []);

  // Filtered attendance loader
  const loadSessions = () => {
    setAttLoading(true);
    api
      .get<Page<Session>>('/admin/sessions/', {
        params: {
          date_from: attDateFrom || undefined,
          date_to: attDateTo || undefined,
          department: attDepartment || undefined,
          status: attStatus || undefined,
        },
      })
      .then((r) => setSessions(r.data.results || []))
      .catch(() => undefined)
      .finally(() => setAttLoading(false));
  };

  useEffect(() => {
    loadSessions();
  }, [attDateFrom, attDateTo, attDepartment, attStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtered users loader
  useEffect(() => {
    const t = setTimeout(() => {
      api
        .get<Page<AdminUser>>('/admin/users/', {
          params: { search: q || undefined, active: activeOnly || undefined },
        })
        .then((r) => setUsers(r.data.results));
    }, 250);
    return () => clearTimeout(t);
  }, [q, activeOnly]);

  // Live updates over WebSocket
  useEffect(() => {
    let ws: WebSocket | null = null;
    let stop = false;
    let retry: number;
    const connect = () => {
      ws = new WebSocket(`${WS_URL}/ws/admin/live/?token=${tokens.access}`);
      ws.onopen = () => setWsOk(true);
      ws.onclose = () => {
        setWsOk(false);
        if (!stop) retry = window.setTimeout(connect, 3000);
      };
      ws.onmessage = (m) => {
        const p: LivePoint = JSON.parse(m.data);
        setLive((prev) => {
          const next = { ...prev };
          if (p.status === 'COMPLETED') delete next[p.session_id];
          else next[p.session_id] = p;
          return next;
        });
        refreshSummary();
      };
    };
    connect();
    return () => {
      stop = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);

  // Export CSV Handler
  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      const res = await api.get('/admin/sessions/export-csv/', {
        params: {
          date_from: attDateFrom || undefined,
          date_to: attDateTo || undefined,
          department: attDepartment || undefined,
          status: attStatus || undefined,
        },
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const todayStr = new Date().toISOString().slice(0, 10);
      link.setAttribute('download', `ncode_attendance_${todayStr}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // Client-side CSV fallback
      const headers = ['Date', 'Employee', 'Employee ID', 'Punch In', 'Punch Out', 'Duration Seconds', 'Status'];
      const rows = sessions.map((s) => [
        fmtDate(s.punch_in_at),
        s.display_name,
        s.employee_id || '',
        fmtTime(s.punch_in_at),
        s.punch_out_at ? fmtTime(s.punch_out_at) : '',
        s.duration_seconds,
        s.status,
      ]);
      const csvContent =
        'data:text/csv;charset=utf-8,' +
        [headers.join(','), ...rows.map((e) => e.map((x) => `"${x}"`).join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `ncode_attendance_export.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      setExportingCsv(false);
    }
  };

  const handleResetAttFilters = () => {
    setAttDateFrom('');
    setAttDateTo('');
    setAttDepartment('');
    setAttStatus('');
  };

  const hasActiveAttFilters = Boolean(attDateFrom || attDateTo || attDepartment || attStatus);

  // Filtered visits loader
  const loadVisits = (pageToLoad = visitPage) => {
    setVisitLoading(true);
    api
      .get<Page<Visit> | Visit[]>('/admin/visits/', {
        params: {
          page: pageToLoad,
          page_size: visitPageSize,
          search: visitSearch.trim() || undefined,
          category: visitCategory || undefined,
          status: visitStatus || undefined,
          outcome: visitOutcome || undefined,
          department: visitDepartment || undefined,
          date_from: visitDateFrom || undefined,
          date_to: visitDateTo || undefined,
        },
      })
      .then((r) => {
        const data = r.data;
        if (Array.isArray(data)) {
          setVisits(data);
          setVisitTotalCount(data.length);
        } else if (data && Array.isArray((data as Page<Visit>).results)) {
          setVisits((data as Page<Visit>).results);
          setVisitTotalCount((data as Page<Visit>).count);
        } else {
          setVisits([]);
          setVisitTotalCount(0);
        }
      })
      .catch(() => {
        setVisits([]);
        setVisitTotalCount(0);
      })
      .finally(() => setVisitLoading(false));
  };

  useEffect(() => {
    loadVisits(visitPage);
  }, [visitPage, visitPageSize, visitCategory, visitStatus, visitOutcome, visitDepartment, visitDateFrom, visitDateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => {
      setVisitPage(1);
      loadVisits(1);
    }, 300);
    return () => clearTimeout(t);
  }, [visitSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasActiveVisitFilters = Boolean(
    visitSearch.trim() ||
    visitCategory ||
    visitStatus ||
    visitOutcome ||
    visitDepartment ||
    visitDateFrom ||
    visitDateTo
  );

  const handleResetVisitFilters = () => {
    setVisitSearch('');
    setVisitCategory('');
    setVisitStatus('');
    setVisitOutcome('');
    setVisitDepartment('');
    setVisitDateFrom('');
    setVisitDateTo('');
    setVisitPage(1);
  };

  const handleExportVisitsCsv = async () => {
    setVisitExportingCsv(true);
    try {
      const res = await api.get('/admin/visits/export-csv/', {
        params: {
          search: visitSearch.trim() || undefined,
          category: visitCategory || undefined,
          status: visitStatus || undefined,
          outcome: visitOutcome || undefined,
          department: visitDepartment || undefined,
          date_from: visitDateFrom || undefined,
          date_to: visitDateTo || undefined,
        },
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const todayStr = new Date().toISOString().slice(0, 10);
      link.setAttribute('download', `ncode_field_visits_${todayStr}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Failed to generate Field Visits CSV export. Please check server logs.');
    } finally {
      setVisitExportingCsv(false);
    }
  };

  const handleInspectVisit = (visitId: number) => {
    setSelectedVisitId(visitId);
    setDetailLoading(true);
    setSelectedVisitDetail(null);
    api
      .get<AdminVisitDetail>(`/admin/visits/${visitId}/`)
      .then((r) => setSelectedVisitDetail(r.data))
      .catch((err) => {
        console.error('Failed to load visit details:', err);
        const fallback = visits.find((x) => x.id === visitId);
        if (fallback) {
          setSelectedVisitDetail({
            visit: fallback,
            events: [],
            employee: {
              id: fallback.user,
              name: fallback.employee_name,
              employee_id: fallback.employee_id,
              department: fallback.department || 'IT Division (GNFC)',
              designation: 'Field Officer',
              email: '',
              phone: '',
            },
          });
        }
      })
      .finally(() => setDetailLoading(false));
  };

  const dossierMapMarkers: MapMarker[] = useMemo(() => {
    if (!selectedVisitDetail) return [];
    const v = selectedVisitDetail.visit;
    const m: MapMarker[] = [];
    if (v.latitude != null && v.longitude != null && !isNaN(v.latitude) && !isNaN(v.longitude)) {
      m.push({
        id: 'start',
        lat: v.latitude,
        lng: v.longitude,
        label: `Start: ${v.site_name} (${fmtTime(v.start_time)})`,
        color: '#16a34a',
      });
    }
    if (v.end_latitude != null && v.end_longitude != null && !isNaN(v.end_latitude) && !isNaN(v.end_longitude)) {
      m.push({
        id: 'end',
        lat: v.end_latitude,
        lng: v.end_longitude,
        label: `Completion: ${v.end_location_name || v.site_name} (${v.end_time ? fmtTime(v.end_time) : 'Active'})`,
        color: '#2563eb',
      });
    }
    return m;
  }, [selectedVisitDetail]);

  const dossierMapPath: [number, number][] | undefined = useMemo(() => {
    if (!selectedVisitDetail) return undefined;
    const v = selectedVisitDetail.visit;
    if (
      v.latitude != null &&
      v.longitude != null &&
      v.end_latitude != null &&
      v.end_longitude != null &&
      !isNaN(v.latitude) &&
      !isNaN(v.longitude) &&
      !isNaN(v.end_latitude) &&
      !isNaN(v.end_longitude)
    ) {
      return [
        [v.latitude, v.longitude],
        [v.end_latitude, v.end_longitude],
      ];
    }
    return undefined;
  }, [selectedVisitDetail]);

  const totalVisitPages = Math.max(1, Math.ceil(visitTotalCount / visitPageSize));

  const markers = useMemo(
    () =>
      Object.values(live)
        .filter((p) => p.latitude != null && p.longitude != null)
        .map((p) => ({
          id: p.session_id,
          lat: p.latitude!,
          lng: p.longitude!,
          color: STATUS_COLOR[p.tracking_status],
          label: `${p.display_name} (${p.tracking_status})`,
          onClick: () => setSelectedLiveUser(p),
        })),
    [live]
  );

  const tabs = [
    { id: 'overview', label: 'Executive Overview' },
    { id: 'users', label: 'Employees & Users', badge: users.length },
    { id: 'map', label: 'Live Monitoring Map', badge: Object.keys(live).length },
    { id: 'visits', label: 'Field Visits', badge: visitTotalCount },
    { id: 'attendance', label: 'Attendance Records', badge: sessions.length },
  ];

  return (
    <Layout
      title="Field Activity & Attendance Command Center"
      subtitle="Ncode Solution IT Division (GNFC) · Central Operations"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(t) => setActiveTab(t as AdminTab)}
    >
      {/* Metric Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="card text-center border-l-4 border-l-blue-900">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Total Enrolled</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{summary?.total_users ?? '—'}</p>
        </div>
        <div className="card text-center border-l-4 border-l-emerald-600">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Active Today</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{summary?.active_users ?? '—'}</p>
        </div>
        <div className="card text-center border-l-4 border-l-teal-600">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Live Tracking</p>
          <p className="text-2xl font-bold text-teal-700 mt-1">{summary?.currently_tracking ?? '—'}</p>
        </div>
        <div className="card text-center border-l-4 border-l-rose-500">
          <p className="text-[11px] font-semibold uppercase text-slate-500">GPS Interruptions</p>
          <p className="text-2xl font-bold text-rose-600 mt-1">{summary?.location_unavailable ?? 0}</p>
        </div>
        <div className="card text-center border-l-4 border-l-amber-500">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Field Visits Today</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{summary?.today_visits ?? 0}</p>
        </div>
        <div className="card text-center border-l-4 border-l-slate-700">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Completed Shifts</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{summary?.completed_sessions ?? '—'}</p>
        </div>
      </div>

      {/* ================= TAB 1: OVERVIEW ================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Live Map Preview */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-slate-900">Live Field Map</h2>
                <p className="text-xs text-slate-500">Real-time GPS positions of active field officers</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 relative">
                  {wsOk && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${wsOk ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                </span>
                <span className="text-xs font-semibold text-slate-600">
                  {wsOk ? 'Live WebSocket Connected' : 'Connecting to live feed...'}
                </span>
              </div>
            </div>
            <MapView markers={markers} height={380} />
          </div>

          {/* Active Field Personnel Table */}
          <div className="card overflow-x-auto">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">Active Field Officers Today</h3>
                <p className="text-xs text-slate-500">Currently punched in and tracking</p>
              </div>
              <button className="btn btn-ghost text-xs" onClick={() => setActiveTab('users')}>
                View All Personnel →
              </button>
            </div>

            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="py-2.5">Employee</th>
                  <th>Punch In</th>
                  <th>Last GPS Ping</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.values(live).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400 text-sm">
                      No active field sessions right now.
                    </td>
                  </tr>
                ) : (
                  Object.values(live).map((p) => (
                    <tr key={p.session_id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-semibold text-slate-800">{p.display_name}</td>
                      <td>{fmtTime(p.punch_in_at)}</td>
                      <td>{fmtTime(p.last_location_at)}</td>
                      <td>
                        <span
                          className={`badge ${
                            p.tracking_status === 'ACTIVE' ? 'badge-success' : 'badge-warning'
                          }`}
                        >
                          {p.tracking_status}
                        </span>
                      </td>
                      <td>
                        <Link
                          to={`/admin/users/${p.user_id}`}
                          className="text-xs font-semibold text-blue-900 hover:underline"
                        >
                          Inspect Route →
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= TAB 2: USERS / EMPLOYEES ================= */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="card overflow-x-auto space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-slate-900">Enrolled Field Personnel</h2>
                <p className="text-xs text-slate-500">Manage employee accounts and view session histories</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  className="input !w-60"
                  placeholder="Search Name, ID, ESIC..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <select
                  className="input !w-36"
                  value={activeOnly}
                  onChange={(e) => setActiveOnly(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="1">Currently Active</option>
                  <option value="0">Not Punched In</option>
                </select>
              </div>
            </div>

            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="py-2.5">Name</th>
                  <th>Employee ID</th>
                  <th>Official Email</th>
                  <th>ESIC Number</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Shift Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No matching employee records found.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-semibold text-slate-800">
                        {u.full_name || `${u.first_name} ${u.last_name}`.trim() || u.username}
                      </td>
                      <td className="font-mono text-teal-700 font-semibold">
                        {u.profile?.employee_id || u.username}
                      </td>
                      <td className="text-slate-600">{u.email}</td>
                      <td className="font-mono text-slate-500 text-xs">{u.profile?.esic_number || '—'}</td>
                      <td className="text-xs text-slate-600">{u.profile?.department || 'IT Division'}</td>
                      <td className="text-xs text-slate-600">{u.profile?.designation || 'Field Officer'}</td>
                      <td>
                        <span
                          className={`badge ${
                            u.has_active_session ? 'badge-success' : 'badge-neutral'
                          }`}
                        >
                          {u.has_active_session ? '🟢 In Field' : 'Off Shift'}
                        </span>
                      </td>
                      <td>
                        <Link
                          to={`/admin/users/${u.id}`}
                          className="btn btn-ghost text-xs py-1 px-2.5"
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= TAB 3: LIVE MAP ================= */}
      {activeTab === 'map' && (
        <div className="space-y-4">
          <div className="card space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-slate-900">Live GPS Field Force Map</h2>
                <p className="text-xs text-slate-500">
                  Showing {markers.length} active location broadcasts · Click marker to inspect
                </p>
              </div>
              <span className="badge badge-info">Auto-updating every 30s</span>
            </div>

            <MapView markers={markers} height={520} />

            {selectedLiveUser && (
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-blue-950 text-sm">{selectedLiveUser.display_name}</h4>
                  <p className="text-xs text-blue-800 mt-0.5">
                    Punched in at {fmtTime(selectedLiveUser.punch_in_at)} · Last location at{' '}
                    {fmtTime(selectedLiveUser.last_location_at)} · Status:{' '}
                    <strong>{selectedLiveUser.tracking_status}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="btn btn-primary text-xs"
                    onClick={() => nav(`/admin/users/${selectedLiveUser.user_id}`)}
                  >
                    Open Employee Profile & Route →
                  </button>
                  <button
                    className="btn btn-ghost text-xs"
                    onClick={() => setSelectedLiveUser(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 4: ADMIN FIELD VISITS COMMAND CENTER ================= */}
      {activeTab === 'visits' && (
        <div className="space-y-4">
          <div className="card space-y-4">
            {/* Header + Export Action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
              <div>
                <h2 className="font-bold text-slate-900 text-base sm:text-lg flex items-center gap-2">
                  <span>Field Visit & Inspection Command Center</span>
                  <span className="badge badge-neutral text-xs font-mono">{visitTotalCount} total</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Surveillance log of field visits, site audits, photographic evidence, and official verification trails
                </p>
              </div>

              {/* CSV Export Button */}
              <button
                type="button"
                className="btn btn-secondary inline-flex items-center gap-2 self-start sm:self-auto text-xs font-semibold py-2 px-3.5 shadow-sm"
                onClick={handleExportVisitsCsv}
                disabled={visitExportingCsv || visitTotalCount === 0}
                title="Download CSV export with current filters applied"
              >
                {visitExportingCsv ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <span>Generating CSV...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Export Visits to CSV ({visitTotalCount})</span>
                  </>
                )}
              </button>
            </div>

            {/* Filter & Search Bar: Search, Date Range, Department, Category, Status, Outcome */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span>Filter & Search Field Visits</span>
                </span>
                {hasActiveVisitFilters && (
                  <button
                    type="button"
                    onClick={handleResetVisitFilters}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-800 hover:underline"
                  >
                    Reset Filters
                  </button>
                )}
              </div>

              {/* Search Field */}
              <div className="relative">
                <input
                  type="text"
                  className="input !py-2 !text-xs text-slate-800 w-full pl-9"
                  placeholder="Search by Employee name, Employee ID, Visit ID (#VIS-...), Site, or Project..."
                  value={visitSearch}
                  onChange={(e) => setVisitSearch(e.target.value)}
                />
                <svg
                  className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {visitSearch && (
                  <button
                    type="button"
                    onClick={() => setVisitSearch('')}
                    className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 text-xs p-1"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Filters Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                {/* Date From */}
                <div>
                  <label className="label">Date From</label>
                  <input
                    type="date"
                    className="input !py-1.5 !text-xs text-slate-800"
                    value={visitDateFrom}
                    onChange={(e) => {
                      setVisitDateFrom(e.target.value);
                      setVisitPage(1);
                    }}
                  />
                </div>

                {/* Date To */}
                <div>
                  <label className="label">Date To</label>
                  <input
                    type="date"
                    className="input !py-1.5 !text-xs text-slate-800"
                    value={visitDateTo}
                    onChange={(e) => {
                      setVisitDateTo(e.target.value);
                      setVisitPage(1);
                    }}
                  />
                </div>

                {/* Department Dropdown */}
                <div>
                  <label className="label">Department</label>
                  <select
                    className="input !py-1.5 !text-xs text-slate-800"
                    value={visitDepartment}
                    onChange={(e) => {
                      setVisitDepartment(e.target.value);
                      setVisitPage(1);
                    }}
                  >
                    <option value="">All Departments</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category Dropdown */}
                <div>
                  <label className="label">Visit Category</label>
                  <select
                    className="input !py-1.5 !text-xs text-slate-800"
                    value={visitCategory}
                    onChange={(e) => {
                      setVisitCategory(e.target.value);
                      setVisitPage(1);
                    }}
                  >
                    {VISIT_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Dropdown */}
                <div>
                  <label className="label">Status / Outcome</label>
                  <div className="flex gap-1.5">
                    <select
                      className="input !py-1.5 !text-xs text-slate-800 flex-1"
                      value={visitStatus}
                      onChange={(e) => {
                        setVisitStatus(e.target.value);
                        setVisitPage(1);
                      }}
                    >
                      {VISIT_STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="input !py-1.5 !text-xs text-slate-800 flex-1"
                      value={visitOutcome}
                      onChange={(e) => {
                        setVisitOutcome(e.target.value);
                        setVisitPage(1);
                      }}
                    >
                      {VISIT_OUTCOMES.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Active Filter Summary */}
              <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 border-t border-slate-200/60">
                <span>
                  Showing <strong>{visits.length}</strong> visits on page <strong>{visitPage}</strong> of{' '}
                  <strong>{totalVisitPages}</strong> ({visitTotalCount} total records)
                  {hasActiveVisitFilters && ' (filtered)'}
                </span>
                {visitLoading && <span className="text-blue-800 font-semibold animate-pulse">Loading records...</span>}
              </div>
            </div>

            {/* Desktop Visits Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[850px]">
                <thead className="text-xs uppercase text-slate-500 border-b border-slate-100 bg-slate-50/50">
                  <tr>
                    <th className="py-2.5 px-3">Visit ID</th>
                    <th className="px-3">Officer & Dept</th>
                    <th className="px-3">Purpose & Site</th>
                    <th className="px-3">Category</th>
                    <th className="px-3">Time & Duration</th>
                    <th className="px-3">Status / Outcome</th>
                    <th className="px-3">GPS / Location</th>
                    <th className="px-3">Evidence</th>
                    <th className="px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visitLoading && visits.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <div className="inline-flex items-center gap-2">
                          <svg className="animate-spin h-5 w-5 text-blue-900" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                          </svg>
                          <span>Loading field visits...</span>
                        </div>
                      </td>
                    </tr>
                  ) : visits.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <div className="max-w-md mx-auto space-y-2">
                          <p className="font-medium text-slate-600">
                            {hasActiveVisitFilters
                              ? 'No field visits match the selected search or filter criteria.'
                              : 'No field visits recorded in the system yet.'}
                          </p>
                          {hasActiveVisitFilters && (
                            <button
                              type="button"
                              onClick={handleResetVisitFilters}
                              className="btn btn-secondary !py-1 !px-3 !text-xs"
                            >
                              Reset All Filters
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    visits.map((v) => {
                      const hasGps = v.latitude != null && v.longitude != null;
                      const photosCount = v.photos_count ?? (v.photos?.length || 0);

                      return (
                        <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                          {/* Visit ID */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              #VIS-{String(v.id).padStart(4, '0')}
                            </span>
                          </td>

                          {/* Officer & Dept */}
                          <td className="px-3 whitespace-nowrap">
                            <div className="font-medium text-slate-900">{v.employee_name}</div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                              <span className="font-mono text-teal-700">{v.employee_id}</span>
                              <span>·</span>
                              <span>{v.department || 'IT Division'}</span>
                            </div>
                          </td>

                          {/* Purpose & Site */}
                          <td className="px-3">
                            <div className="font-semibold text-slate-900 max-w-[200px] truncate" title={v.site_name}>
                              {v.site_name}
                            </div>
                            {v.project_name && (
                              <div className="text-[11px] text-slate-500 max-w-[200px] truncate" title={v.project_name}>
                                {v.project_name}
                              </div>
                            )}
                          </td>

                          {/* Category */}
                          <td className="px-3 whitespace-nowrap">
                            <span className="inline-block text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                              {CATEGORY_NAMES[v.visit_type || ''] || v.visit_type || 'General'}
                            </span>
                          </td>

                          {/* Time & Duration */}
                          <td className="px-3 whitespace-nowrap text-xs text-slate-700">
                            <div>{fmtDate(v.start_time)}</div>
                            <div className="text-[11px] text-slate-500">
                              {fmtTime(v.start_time)} → {v.end_time ? fmtTime(v.end_time) : 'Active'}
                              {v.duration_minutes != null && ` (${v.duration_minutes}m)`}
                            </div>
                          </td>

                          {/* Status / Outcome */}
                          <td className="px-3 whitespace-nowrap">
                            <div className="flex flex-col gap-1 items-start">
                              <span
                                className={`badge text-[10px] ${
                                  v.status === 'COMPLETED'
                                    ? 'badge-success'
                                    : v.status === 'CANCELLED'
                                    ? 'badge-neutral'
                                    : 'badge-warning'
                                }`}
                              >
                                {v.status}
                              </span>
                              {v.outcome && (
                                <span className="text-[10px] font-medium text-slate-600">
                                  {v.outcome}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* GPS / Location */}
                          <td className="px-3 whitespace-nowrap">
                            {hasGps ? (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200"
                                title={`Start: ${v.latitude}, ${v.longitude}${v.end_latitude ? ` | End: ${v.end_latitude}, ${v.end_longitude}` : ''}`}
                              >
                                <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span>GPS Logged</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                                <span>No GPS</span>
                              </span>
                            )}
                          </td>

                          {/* Evidence */}
                          <td className="px-3 whitespace-nowrap">
                            {photosCount > 0 ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                <svg className="w-3.5 h-3.5 text-blue-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span>{photosCount} photo{photosCount > 1 ? 's' : ''}</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">None</span>
                            )}
                          </td>

                          {/* Action Button */}
                          <td className="px-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleInspectVisit(v.id)}
                              className="text-xs font-semibold text-blue-900 hover:text-blue-700 hover:underline px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                            >
                              Inspect Dossier →
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile / Tablet Responsive Cards */}
            <div className="md:hidden space-y-3">
              {visitLoading && visits.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Loading field visits...
                </div>
              ) : visits.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  {hasActiveVisitFilters
                    ? 'No field visits match the selected filters.'
                    : 'No field visits recorded yet.'}
                </div>
              ) : (
                visits.map((v) => {
                  const hasGps = v.latitude != null && v.longitude != null;
                  const photosCount = v.photos_count ?? (v.photos?.length || 0);

                  return (
                    <div
                      key={v.id}
                      className="p-4 bg-white rounded-xl border border-slate-200 space-y-2.5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              #VIS-{String(v.id).padStart(4, '0')}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                              {CATEGORY_NAMES[v.visit_type || ''] || v.visit_type || 'Visit'}
                            </span>
                          </div>
                          <h4 className="font-bold text-slate-900 text-sm mt-1">{v.site_name}</h4>
                          {v.project_name && (
                            <p className="text-xs text-slate-500">{v.project_name}</p>
                          )}
                        </div>
                        <span
                          className={`badge text-[10px] ${
                            v.status === 'COMPLETED'
                              ? 'badge-success'
                              : v.status === 'CANCELLED'
                              ? 'badge-neutral'
                              : 'badge-warning'
                          }`}
                        >
                          {v.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-1 border-t border-slate-100">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase">Officer</span>
                          <span className="font-medium text-slate-900">{v.employee_name}</span>
                          <span className="font-mono text-teal-700 text-[11px] block">{v.employee_id}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase">Date & Duration</span>
                          <span>{fmtDate(v.start_time)}</span>
                          <span className="text-slate-500 text-[11px] block">
                            {v.duration_minutes != null ? `${v.duration_minutes} min` : 'In Progress'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                        <div className="flex items-center gap-2">
                          {hasGps && (
                            <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                              📍 GPS
                            </span>
                          )}
                          {photosCount > 0 && (
                            <span className="text-[11px] text-blue-900 font-medium flex items-center gap-1">
                              📷 {photosCount} photo{photosCount > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleInspectVisit(v.id)}
                          className="btn btn-secondary !py-1 !px-2.5 !text-xs font-semibold"
                        >
                          Inspect Dossier →
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Server-Side Pagination Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span>
                  Showing{' '}
                  <strong>{visitTotalCount === 0 ? 0 : (visitPage - 1) * visitPageSize + 1}</strong> to{' '}
                  <strong>{Math.min(visitPage * visitPageSize, visitTotalCount)}</strong> of{' '}
                  <strong>{visitTotalCount}</strong> visits
                </span>
                <span className="text-slate-400">|</span>
                <label className="flex items-center gap-1">
                  <span>Per page:</span>
                  <select
                    value={visitPageSize}
                    onChange={(e) => {
                      setVisitPageSize(Number(e.target.value));
                      setVisitPage(1);
                    }}
                    className="input !py-1 !px-2 !text-xs border-slate-200"
                  >
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </label>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  className="btn btn-secondary !py-1.5 !px-3 !text-xs"
                  onClick={() => setVisitPage((p) => Math.max(1, p - 1))}
                  disabled={visitPage <= 1 || visitLoading}
                >
                  ← Previous
                </button>
                <span className="font-semibold text-slate-800">
                  Page {visitPage} of {totalVisitPages}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary !py-1.5 !px-3 !text-xs"
                  onClick={() => setVisitPage((p) => Math.min(totalVisitPages, p + 1))}
                  disabled={visitPage >= totalVisitPages || visitLoading}
                >
                  Next →
                </button>
              </div>
            </div>
          </div>

          {/* ================= INSPECTION DOSSIER MODAL ================= */}
          {selectedVisitId != null && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-sm overflow-y-auto"
              onClick={() => {
                setSelectedVisitId(null);
                setSelectedVisitDetail(null);
              }}
            >
              <div
                className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-teal-300 bg-teal-950/80 px-2 py-0.5 rounded border border-teal-500/30">
                        #VIS-{String(selectedVisitId).padStart(4, '0')}
                      </span>
                      <h3 className="font-bold text-base sm:text-lg text-white">
                        Field Inspection Dossier
                      </h3>
                      {selectedVisitDetail?.visit.status && (
                        <span
                          className={`badge text-[10px] ${
                            selectedVisitDetail.visit.status === 'COMPLETED'
                              ? 'badge-success'
                              : 'badge-warning'
                          }`}
                        >
                          {selectedVisitDetail.visit.status}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {selectedVisitDetail?.visit.site_name || 'Loading inspection records...'}
                      {selectedVisitDetail?.visit.start_time &&
                        ` · ${fmtDate(selectedVisitDetail.visit.start_time)}`}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVisitId(null);
                      setSelectedVisitDetail(null);
                    }}
                    className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                    aria-label="Close dossier"
                  >
                    ✕
                  </button>
                </div>

                {/* Modal Scrollable Body */}
                <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-sm">
                  {detailLoading && !selectedVisitDetail ? (
                    <div className="py-20 text-center text-slate-400">
                      <div className="inline-flex items-center gap-2">
                        <svg className="animate-spin h-6 w-6 text-blue-900" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                        </svg>
                        <span>Loading complete dossier records...</span>
                      </div>
                    </div>
                  ) : selectedVisitDetail ? (
                    <>
                      {/* SECTION 1: EMPLOYEE PROFILE CARD */}
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200/80">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                            <svg className="w-4 h-4 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7 7z" />
                            </svg>
                            <span>Officer in Field</span>
                          </span>
                          <Link
                            to={`/admin/users/${selectedVisitDetail.employee.id}`}
                            className="text-xs font-semibold text-blue-900 hover:text-blue-700 hover:underline"
                          >
                            Open Officer Profile →
                          </Link>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Name</span>
                            <span className="font-bold text-slate-900">{selectedVisitDetail.employee.name}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Employee ID</span>
                            <span className="font-mono text-teal-700 font-bold bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                              {selectedVisitDetail.employee.employee_id}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Department</span>
                            <span className="text-slate-800">{selectedVisitDetail.employee.department}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Designation</span>
                            <span className="text-slate-800">{selectedVisitDetail.employee.designation}</span>
                          </div>
                        </div>
                      </div>

                      {/* SECTION 2: VISIT DETAILS & OUTCOME */}
                      <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5 pb-2 border-b border-slate-100">
                          <svg className="w-4 h-4 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <span>Visit Parameters & Timing</span>
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Category</span>
                            <span className="font-semibold text-slate-900">
                              {CATEGORY_NAMES[selectedVisitDetail.visit.visit_type || ''] || selectedVisitDetail.visit.visit_type || 'General'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Site / Facility</span>
                            <span className="font-semibold text-slate-900">{selectedVisitDetail.visit.site_name}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Project / Contract</span>
                            <span className="text-slate-800">{selectedVisitDetail.visit.project_name || '—'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Start Timestamp</span>
                            <span className="text-slate-800">
                              {fmtDate(selectedVisitDetail.visit.start_time)} {fmtTime(selectedVisitDetail.visit.start_time)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Completion Timestamp</span>
                            <span className="text-slate-800">
                              {selectedVisitDetail.visit.end_time
                                ? `${fmtDate(selectedVisitDetail.visit.end_time)} ${fmtTime(selectedVisitDetail.visit.end_time)}`
                                : 'Still in progress'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase">Total Duration</span>
                            <span className="font-semibold text-slate-900">
                              {selectedVisitDetail.visit.duration_minutes != null
                                ? `${selectedVisitDetail.visit.duration_minutes} minutes`
                                : 'In Progress'}
                            </span>
                          </div>
                        </div>

                        {/* Start remarks and Final outcome notes */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                              Start Remarks / Objectives
                            </span>
                            <p className="text-slate-700 italic whitespace-pre-wrap">
                              {selectedVisitDetail.visit.notes || 'No start remarks entered.'}
                            </p>
                          </div>

                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-bold uppercase text-slate-500">
                                Outcome & Final Remarks
                              </span>
                              {selectedVisitDetail.visit.outcome && (
                                <span className="badge badge-neutral text-[10px]">
                                  {selectedVisitDetail.visit.outcome}
                                </span>
                              )}
                            </div>
                            <p className="text-slate-700 italic whitespace-pre-wrap">
                              {selectedVisitDetail.visit.outcome_notes || 'No final remarks or outcome recorded yet.'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* SECTION 3: LOCATION & MAP */}
                      <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                            <svg className="w-4 h-4 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>Geographic Verification & Route Map</span>
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {dossierMapMarkers.length > 0 ? `${dossierMapMarkers.length} GPS Pin(s)` : 'No GPS Fix'}
                          </span>
                        </div>

                        {/* Location Points Summary */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="p-2.5 bg-emerald-50/50 rounded-lg border border-emerald-100">
                            <span className="text-emerald-800 font-bold block text-[11px] flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>
                              Start Location: {selectedVisitDetail.visit.location_name || 'Start Point'}
                            </span>
                            <span className="font-mono text-[11px] text-slate-600">
                              {selectedVisitDetail.visit.latitude != null && selectedVisitDetail.visit.longitude != null
                                ? `${selectedVisitDetail.visit.latitude.toFixed(5)}, ${selectedVisitDetail.visit.longitude.toFixed(5)}`
                                : 'Coordinates Unavailable'}
                            </span>
                          </div>

                          <div className="p-2.5 bg-blue-50/50 rounded-lg border border-blue-100">
                            <span className="text-blue-800 font-bold block text-[11px] flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-blue-600 inline-block"></span>
                              Completion Location: {selectedVisitDetail.visit.end_location_name || 'End Point'}
                            </span>
                            <span className="font-mono text-[11px] text-slate-600">
                              {selectedVisitDetail.visit.end_latitude != null && selectedVisitDetail.visit.end_longitude != null
                                ? `${selectedVisitDetail.visit.end_latitude.toFixed(5)}, ${selectedVisitDetail.visit.end_longitude.toFixed(5)}`
                                : 'Coordinates Unavailable / In Progress'}
                            </span>
                          </div>
                        </div>

                        {/* Interactive Leaflet Map */}
                        {dossierMapMarkers.length > 0 ? (
                          <div className="rounded-xl overflow-hidden border border-slate-200">
                            <MapView
                              markers={dossierMapMarkers}
                              path={dossierMapPath}
                              height={280}
                            />
                          </div>
                        ) : (
                          <div className="p-6 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
                            GPS coordinates were not recorded for this inspection. The officer device may have had location services disabled.
                          </div>
                        )}
                      </div>

                      {/* SECTION 4: EVIDENCE PHOTO GALLERY */}
                      <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                            <svg className="w-4 h-4 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>Photographic Evidence Dossier</span>
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {selectedVisitDetail.visit.photos?.length || 0} photo(s)
                          </span>
                        </div>

                        {selectedVisitDetail.visit.photos && selectedVisitDetail.visit.photos.length > 0 ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {selectedVisitDetail.visit.photos.map((p) => (
                              <div
                                key={p.id}
                                onClick={() => setPreviewPhoto(p)}
                                className="group relative rounded-xl border border-slate-200 overflow-hidden bg-slate-900 cursor-pointer shadow-sm hover:shadow-md transition-shadow"
                              >
                                <div className="aspect-video w-full flex items-center justify-center bg-slate-800">
                                  <EvidenceImage
                                    visitId={selectedVisitDetail.visit.id}
                                    photoId={p.id}
                                    caption={p.caption}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  />
                                </div>
                                <div className="p-2 bg-white/95 backdrop-blur-sm border-t border-slate-100">
                                  <p className="text-[11px] font-semibold text-slate-800 truncate" title={p.caption || 'Inspection photo'}>
                                    {p.caption || 'Evidence snapshot'}
                                  </p>
                                  <p className="text-[10px] text-slate-500 font-mono">
                                    {fmtTime(p.captured_at || p.created_at)}
                                  </p>
                                </div>
                                <div className="absolute inset-0 bg-blue-900/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                  <span className="bg-slate-900/80 text-white text-[10px] font-semibold px-2 py-1 rounded shadow">
                                    Click to view full photo 🔍
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-6 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
                            No photographic evidence was uploaded for this field visit.
                          </div>
                        )}
                      </div>

                      {/* SECTION 5: AUDIT TIMELINE */}
                      <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                            <svg className="w-4 h-4 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>Official Session & Inspection Audit Trail</span>
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {selectedVisitDetail.events.length} event(s)
                          </span>
                        </div>

                        {selectedVisitDetail.events.length > 0 ? (
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 max-h-48 overflow-y-auto">
                            <EventTimeline events={selectedVisitDetail.events} />
                          </div>
                        ) : (
                          <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500">
                            No individual audit events logged for this session timeframe.
                          </div>
                        )}
                      </div>
                    </>
                  ) : null}
                </div>

                {/* Modal Footer */}
                <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
                  <span className="text-xs text-slate-500">
                    Ncode Solution IT Division (GNFC) · Field Inspection Security & Audit
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVisitId(null);
                      setSelectedVisitDetail(null);
                    }}
                    className="btn btn-primary !py-1.5 !px-4 !text-xs font-semibold"
                  >
                    Close Dossier
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================= FULL-SIZE PHOTO PREVIEW LIGHTBOX ================= */}
          {previewPhoto && selectedVisitDetail && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm"
              onClick={() => setPreviewPhoto(null)}
            >
              <div
                className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl border border-slate-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm">
                      {previewPhoto.caption || 'Inspection Evidence Snapshot'}
                    </h4>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Captured: {fmtDate(previewPhoto.captured_at || previewPhoto.created_at)} at{' '}
                      {fmtTime(previewPhoto.captured_at || previewPhoto.created_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewPhoto(null)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
                  >
                    ✕
                  </button>
                </div>
                <div className="p-4 bg-slate-950 flex items-center justify-center min-h-[300px] max-h-[70vh]">
                  <EvidenceImage
                    visitId={selectedVisitDetail.visit.id}
                    photoId={previewPhoto.id}
                    caption={previewPhoto.caption}
                    className="max-h-[65vh] max-w-full object-contain rounded-lg"
                  />
                </div>
                <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                  <span className="font-mono text-[11px]">
                    {previewPhoto.latitude != null && previewPhoto.longitude != null
                      ? `GPS Geotag: ${previewPhoto.latitude.toFixed(5)}, ${previewPhoto.longitude.toFixed(5)}`
                      : 'Geotag not recorded'}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary !py-1 !px-3 !text-xs"
                    onClick={() => setPreviewPhoto(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 5: ATTENDANCE RECORDS WITH ADVANCED FILTERS & CSV EXPORT ================= */}
      {activeTab === 'attendance' && (
        <div className="space-y-4">
          <div className="card space-y-4">
            {/* Header + Export Action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
              <div>
                <h2 className="font-bold text-slate-900 text-base sm:text-lg">
                  Attendance Master Log & Shift History
                </h2>
                <p className="text-xs text-slate-500">
                  Detailed shift duration, punch timestamps, GPS audit counts, and department records
                </p>
              </div>

              {/* CSV Export Button */}
              <button
                type="button"
                className="btn btn-secondary inline-flex items-center gap-2 self-start sm:self-auto text-xs font-semibold py-2 px-3.5 shadow-sm"
                onClick={handleExportCsv}
                disabled={exportingCsv || sessions.length === 0}
                title="Download CSV export with current filters applied"
              >
                {exportingCsv ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <span>Generating CSV...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Export to CSV ({sessions.length})</span>
                  </>
                )}
              </button>
            </div>

            {/* Filter Bar: Date Range, Department, Status */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span>Filter Attendance Sessions</span>
                </span>
                {hasActiveAttFilters && (
                  <button
                    type="button"
                    onClick={handleResetAttFilters}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-800 hover:underline"
                  >
                    Reset Filters
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {/* Date From */}
                <div>
                  <label className="label">Date From</label>
                  <input
                    type="date"
                    className="input !py-1.5 !text-xs text-slate-800"
                    value={attDateFrom}
                    onChange={(e) => setAttDateFrom(e.target.value)}
                  />
                </div>

                {/* Date To */}
                <div>
                  <label className="label">Date To</label>
                  <input
                    type="date"
                    className="input !py-1.5 !text-xs text-slate-800"
                    value={attDateTo}
                    onChange={(e) => setAttDateTo(e.target.value)}
                  />
                </div>

                {/* Department Dropdown */}
                <div>
                  <label className="label">Department</label>
                  <select
                    className="input !py-1.5 !text-xs text-slate-800"
                    value={attDepartment}
                    onChange={(e) => setAttDepartment(e.target.value)}
                  >
                    <option value="">All Departments</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Session Status */}
                <div>
                  <label className="label">Shift Status</label>
                  <select
                    className="input !py-1.5 !text-xs text-slate-800"
                    value={attStatus}
                    onChange={(e) => setAttStatus(e.target.value)}
                  >
                    <option value="">All Statuses</option>
                    <option value="ACTIVE">ACTIVE (In Field)</option>
                    <option value="COMPLETED">COMPLETED (Punched Out)</option>
                  </select>
                </div>
              </div>

              {/* Filter Active Feedback */}
              <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 border-t border-slate-200/60">
                <span>
                  Showing <strong>{sessions.length}</strong> matching shift records
                  {hasActiveAttFilters && ' (filtered)'}
                </span>
                {attLoading && <span className="text-blue-800 font-semibold">Updating records...</span>}
              </div>
            </div>

            {/* Attendance Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[700px]">
                <thead className="text-xs uppercase text-slate-500 border-b border-slate-100 bg-slate-50/50">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="px-3">Employee</th>
                    <th className="px-3">Department</th>
                    <th className="px-3">Punch In</th>
                    <th className="px-3">Punch Out</th>
                    <th className="px-3">Duration</th>
                    <th className="px-3">GPS Interruptions</th>
                    <th className="px-3">Stops</th>
                    <th className="px-3">Status</th>
                    <th className="px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-slate-400">
                        {hasActiveAttFilters
                          ? 'No attendance sessions match the selected filters. Try broadening your date range or department.'
                          : 'No attendance sessions recorded in the system yet.'}
                      </td>
                    </tr>
                  ) : (
                    sessions.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3 font-semibold text-slate-800 whitespace-nowrap">
                          {fmtDate(s.punch_in_at)}
                        </td>
                        <td className="px-3 whitespace-nowrap">
                          <div className="font-medium text-slate-900">{s.display_name}</div>
                          {s.employee_id && (
                            <div className="text-[11px] text-teal-700 font-mono">
                              {s.employee_id}
                            </div>
                          )}
                        </td>
                        <td className="px-3 text-xs text-slate-600 whitespace-nowrap">
                          {s.department || 'IT Division (GNFC)'}
                        </td>
                        <td className="px-3 text-xs text-slate-700 whitespace-nowrap">
                          {fmtTime(s.punch_in_at)}
                        </td>
                        <td className="px-3 text-xs text-slate-700 whitespace-nowrap">
                          {s.punch_out_at ? fmtTime(s.punch_out_at) : '—'}
                        </td>
                        <td className="px-3 font-mono text-xs text-slate-800 whitespace-nowrap">
                          {s.status === 'ACTIVE' ? 'In Progress' : fmtDuration(s.duration_seconds)}
                        </td>
                        <td className="px-3 whitespace-nowrap">
                          {s.interruptions > 0 ? (
                            <span className="badge badge-warning text-[10px]">
                              {s.interruptions} issue{s.interruptions > 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">0</span>
                          )}
                        </td>
                        <td className="px-3 text-xs text-slate-700 whitespace-nowrap">
                          {s.visits_count ?? '0'}
                        </td>
                        <td className="px-3 whitespace-nowrap">
                          <span
                            className={`badge ${
                              s.status === 'ACTIVE' ? 'badge-success' : 'badge-neutral'
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="px-3 text-right whitespace-nowrap">
                          <Link
                            to={`/admin/users/${s.user}`}
                            className="text-xs font-semibold text-blue-900 hover:text-blue-700 hover:underline"
                          >
                            Inspect Session →
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
