import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import EventTimeline from '../../components/EventTimeline';
import Layout from '../../components/Layout';
import MapView, { MapMarker } from '../../components/MapView';
import SelfieImage from '../../components/SelfieImage';
import api from '../../services/api';
import { fmtDate, fmtDuration, fmtTime, STATUS_COLOR } from '../../services/format';
import type { AdminUser, LocationPoint, Page, Session, TrackingEvent, Visit } from '../../types';

export default function UserDetailsPage() {
  const { id } = useParams();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [detail, setDetail] = useState<{
    session: Session;
    locations: LocationPoint[];
    events: TrackingEvent[];
    visits?: Visit[];
  } | null>(null);

  useEffect(() => {
    api.get<AdminUser>(`/admin/users/${id}/`).then((r) => setUser(r.data));
    api.get<Page<Session>>('/admin/sessions/', { params: { user: id } }).then((r) => {
      setSessions(r.data.results);
      setSel(r.data.results[0]?.id ?? null);
    });
  }, [id]);

  useEffect(() => {
    if (sel) {
      api.get(`/admin/sessions/${sel}/`).then((r) => setDetail(r.data));
    }
  }, [sel]);

  const toggleActive = async () => {
    if (!user) return;
    const r = await api.patch<AdminUser>(`/admin/users/${user.id}/`, { is_active: !user.is_active });
    setUser({ ...user, ...r.data });
  };

  const path = useMemo<[number, number][]>(
    () => detail?.locations.map((l) => [l.latitude, l.longitude]) ?? [],
    [detail]
  );

  const markers = useMemo<MapMarker[]>(() => {
    if (!detail) return [];
    const list: MapMarker[] = [];
    if (path.length > 0) {
      list.push({
        id: 'start',
        lat: path[0][0],
        lng: path[0][1],
        label: `Punch In Location · ${fmtTime(detail.session.punch_in_at)}`,
        color: '#2563eb',
      });
      const [la, ln] = path[path.length - 1];
      list.push({
        id: 'last',
        lat: la,
        lng: ln,
        label: `Last Recorded GPS · ${fmtTime(detail.session.last_location_at)}`,
        color: STATUS_COLOR[detail.session.tracking_status],
      });
    }

    if (detail.visits) {
      detail.visits.forEach((v) => {
        if (v.latitude && v.longitude) {
          list.push({
            id: `visit-${v.id}`,
            lat: v.latitude,
            lng: v.longitude,
            label: `Field Visit: ${v.site_name} (${v.status})`,
            color: '#d97706',
          });
        }
      });
    }

    return list;
  }, [detail, path]);

  return (
    <Layout
      title="Employee Profile & Field Activity Inspection"
      subtitle="Ncode Solution IT Division (GNFC) · Audit Record"
    >
      <div className="flex items-center justify-between pb-2">
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-900 hover:text-blue-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm"
        >
          ← Back to Operations Command
        </Link>
      </div>

      {/* Employee Dossier Card */}
      {user && (
        <div className="card space-y-4 border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-900 text-white flex items-center justify-center text-xl font-black">
                {user.first_name?.[0] || user.username?.[0] || 'N'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900">
                    {user.full_name || `${user.first_name} ${user.last_name}`.trim() || user.username}
                  </h2>
                  <span
                    className={`badge ${
                      user.is_active ? 'badge-success' : 'badge-danger'
                    }`}
                  >
                    {user.is_active ? 'Account Active' : 'Account Disabled'}
                  </span>
                </div>
                <p className="text-xs text-teal-700 font-mono font-bold mt-0.5">
                  Employee ID: {user.profile?.employee_id || user.username}
                </p>
              </div>
            </div>

            <button
              className={`btn text-xs ${user.is_active ? 'btn-danger' : 'btn-secondary'}`}
              onClick={toggleActive}
            >
              {user.is_active ? 'Deactivate Account' : 'Activate Account'}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-500 block">Department</span>
              <span className="font-semibold text-slate-800 mt-0.5 block">
                {user.profile?.department || 'IT Division (GNFC)'}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-500 block">Designation</span>
              <span className="font-semibold text-slate-800 mt-0.5 block">
                {user.profile?.designation || 'Field Officer'}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-500 block">ESIC Number</span>
              <span className="font-mono font-semibold text-slate-800 mt-0.5 block">
                {user.profile?.esic_number || '—'}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-500 block">Official Email</span>
              <span className="font-semibold text-slate-800 mt-0.5 block truncate">
                {user.email || '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Sessions Selector Table */}
      <div className="card overflow-x-auto space-y-3">
        <div>
          <h3 className="font-bold text-slate-900 text-sm">Attendance Shift History</h3>
          <p className="text-xs text-slate-500">Select any session to inspect route, selfie, and visits</p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500 border-b border-slate-100">
            <tr>
              <th className="py-2.5">Date</th>
              <th>Punch In</th>
              <th>Punch Out</th>
              <th>Duration</th>
              <th>Interruptions</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-400 text-sm">
                  No attendance sessions on record for this employee.
                </td>
              </tr>
            ) : (
              sessions.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setSel(s.id)}
                  className={`cursor-pointer transition-colors ${
                    s.id === sel ? 'bg-blue-50/70 font-medium' : 'hover:bg-slate-50/60'
                  }`}
                >
                  <td className="py-2.5 font-semibold text-slate-800">{fmtDate(s.punch_in_at)}</td>
                  <td>{fmtTime(s.punch_in_at)}</td>
                  <td>{s.punch_out_at ? fmtTime(s.punch_out_at) : '—'}</td>
                  <td className="font-mono">
                    {s.status === 'ACTIVE' ? 'In Progress' : fmtDuration(s.duration_seconds)}
                  </td>
                  <td>
                    {s.interruptions > 0 ? (
                      <span className="badge badge-warning">{s.interruptions} events</span>
                    ) : (
                      '0'
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        s.status === 'ACTIVE' ? 'badge-success' : 'badge-neutral'
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="text-xs text-blue-900 font-semibold underline"
                      onClick={() => setSel(s.id)}
                    >
                      {s.id === sel ? 'Viewing' : 'Select'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Selected Session Deep Dive */}
      {detail && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-[280px_1fr]">
            {/* Selfie Verification */}
            <div className="card space-y-3">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Punch-In Selfie Verification</h4>
                <p className="text-[11px] text-slate-500">
                  Captured at {fmtTime(detail.session.punch_in_at)}
                </p>
              </div>
              <div className="rounded-xl overflow-hidden border border-slate-200">
                <SelfieImage sessionId={detail.session.id} />
              </div>
              <div className="text-[11px] text-slate-500 space-y-1">
                <div>Shift ID: #{detail.session.id}</div>
                <div>Status: {detail.session.tracking_status}</div>
              </div>
            </div>

            {/* Route Map */}
            <div className="card space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    Route Map ({detail.locations.length} GPS Breadcrumbs)
                  </h4>
                  <p className="text-xs text-slate-500">
                    Traveled route and visited locations for this session
                  </p>
                </div>
                <span className="badge badge-info">
                  {detail.visits?.length ?? 0} Recorded Stops
                </span>
              </div>
              <MapView markers={markers} path={path} height={340} />
            </div>
          </div>

          {/* Visits Table for this session */}
          {detail.visits && detail.visits.length > 0 && (
            <div className="card overflow-x-auto space-y-3">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Field Visits Recorded During Shift</h4>
                <p className="text-xs text-slate-500">Sites visited and meeting outcomes</p>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500 border-b border-slate-100">
                  <tr>
                    <th className="py-2">Site / Stop</th>
                    <th>Location Details</th>
                    <th>Start Time</th>
                    <th>End Time</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.visits.map((v) => (
                    <tr key={v.id}>
                      <td className="py-2.5 font-semibold text-slate-800">{v.site_name}</td>
                      <td className="text-xs text-slate-600">{v.location_name || '—'}</td>
                      <td>{fmtTime(v.start_time)}</td>
                      <td>{v.end_time ? fmtTime(v.end_time) : 'In Progress'}</td>
                      <td>
                        <span
                          className={`badge ${
                            v.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'
                          }`}
                        >
                          {v.status}
                        </span>
                      </td>
                      <td className="text-xs text-slate-600 italic">{v.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Timeline Audit Log */}
          <div className="card space-y-3">
            <div>
              <h4 className="font-bold text-slate-900 text-sm">Complete Session Audit Trail</h4>
              <p className="text-xs text-slate-500">Chronological activity logs and tracking events</p>
            </div>
            <EventTimeline events={detail.events} />
          </div>
        </div>
      )}
    </Layout>
  );
}
