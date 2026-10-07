import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import EventTimeline from '../../components/EventTimeline';
import EvidenceImage from '../../components/EvidenceImage';
import Layout from '../../components/Layout';
import MapView, { MapMarker } from '../../components/MapView';
import SelfieCapture from '../../components/SelfieCapture';
import TrackingStatus from '../../components/TrackingStatus';
import { useAuth } from '../../hooks/useAuth';
import { useTracking } from '../../hooks/useTracking';
import api, { errorMessage } from '../../services/api';
import { fmtDate, fmtDuration, fmtTime } from '../../services/format';
import type {
  LocationPoint,
  Page,
  Session,
  TrackingEvent,
  Visit,
  VisitOutcome,
  VisitType,
} from '../../types';

const getPosition = (timeout: number) =>
  new Promise<GeolocationPosition>((res, rej) =>
    navigator.geolocation
      ? navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout })
      : rej(new Error('Geolocation is not supported by your browser.'))
  );

type TabType = 'dashboard' | 'tracking' | 'visits' | 'route' | 'history' | 'profile';

const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  SITE_INSPECTION: 'Site Inspection',
  CLIENT_MEETING: 'Client Meeting',
  TECHNICAL_VERIFICATION: 'Technical Verification',
  INFRASTRUCTURE_AUDIT: 'Infrastructure / IT Audit',
  OTHER: 'Other Official Work',
};

const VISIT_OUTCOME_LABELS: Record<VisitOutcome, string> = {
  PENDING: 'Pending / In Progress',
  SATISFACTORY: 'Satisfactory / Completed',
  ACTION_REQUIRED: 'Action Required / Issues Found',
  FOLLOW_UP_NEEDED: 'Follow-Up Needed',
  CANCELLED: 'Cancelled',
};

const VISIT_TYPE_COLORS: Record<VisitType, { bg: string; text: string; border: string }> = {
  SITE_INSPECTION: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  CLIENT_MEETING: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  TECHNICAL_VERIFICATION: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
  INFRASTRUCTURE_AUDIT: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  OTHER: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
};

const OUTCOME_COLORS: Record<VisitOutcome, { bg: string; text: string; border: string }> = {
  PENDING: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  SATISFACTORY: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  ACTION_REQUIRED: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  FOLLOW_UP_NEEDED: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  CANCELLED: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300' },
};

const fmtDurationLive = (startTimeStr: string) => {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(startTimeStr).getTime()) / 1000));
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  return `${h > 0 ? `${h}h ` : ''}${m}m ${s < 10 ? '0' : ''}${s}s`;
};

export default function UserDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [history, setHistory] = useState<Session[]>([]);
  const [locations, setLocations] = useState<LocationPoint[]>([]);

  const [selfie, setSelfie] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [, tick] = useState(0);

  // Active visit detection
  const activeVisit = useMemo(
    () => visits.find((v) => v.status === 'IN_PROGRESS') || null,
    [visits]
  );

  // Start Visit Modal state
  const [showStartModal, setShowStartModal] = useState(false);
  const [startForm, setStartForm] = useState({
    site_name: '',
    project_name: '',
    visit_type: 'SITE_INSPECTION' as VisitType,
    location_name: '',
    notes: '',
  });
  const [startGps, setStartGps] = useState<{
    status: 'idle' | 'detecting' | 'fixed' | 'denied' | 'error';
    lat?: number;
    lng?: number;
    accuracy?: number;
    errorMsg?: string;
  }>({ status: 'idle' });

  // Complete Visit Modal state
  const [completeModalVisit, setCompleteModalVisit] = useState<Visit | null>(null);
  const [completeForm, setCompleteForm] = useState({
    outcome: 'SATISFACTORY' as VisitOutcome,
    outcome_notes: '',
    end_location_name: '',
  });
  const [endGps, setEndGps] = useState<{
    status: 'idle' | 'detecting' | 'fixed' | 'denied' | 'error';
    lat?: number;
    lng?: number;
    accuracy?: number;
  }>({ status: 'idle' });

  // Evidence Photo Modal state
  const [photoModalVisit, setPhotoModalVisit] = useState<Visit | null>(null);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);
  const [evidenceCaption, setEvidenceCaption] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);

  // Visit Dossier / Details Drawer state
  const [selectedVisitDetail, setSelectedVisitDetail] = useState<Visit | null>(null);

  // Lightbox Modal state
  const [enlargedPhoto, setEnlargedPhoto] = useState<{
    visitId: number;
    photoId: number;
    caption?: string;
  } | null>(null);

  // My Visits Filters state
  const [visitCategoryFilter, setVisitCategoryFilter] = useState<string>('ALL');
  const [visitStatusFilter, setVisitStatusFilter] = useState<string>('ALL');
  const [visitSearch, setVisitSearch] = useState<string>('');

  const load = useCallback(async () => {
    try {
      const [c, h, vRes] = await Promise.all([
        api.get<{ session: Session | null; events: TrackingEvent[]; visits: Visit[] }>('/attendance/current/'),
        api.get<Page<Session>>('/attendance/history/'),
        api.get<Visit[]>('/attendance/visits/?all=true').catch(() => ({ data: [] as Visit[] })),
      ]);
      setSession(c.data.session);
      setEvents(c.data.events || []);
      // If all visits endpoint returned records, use it; otherwise fallback to session visits
      const visitList = vRes.data && vRes.data.length > 0 ? vRes.data : c.data.visits || [];
      setVisits(visitList);
      setHistory(h.data.results || []);

      if (c.data.session) {
        try {
          const locRes = await api.get<LocationPoint[]>(`/locations/?session=${c.data.session.id}`);
          setLocations(locRes.data || []);
        } catch {
          // best-effort
        }
      } else {
        setLocations([]);
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const tracking = useTracking(!!session);
  useEffect(() => {
    if (session) load();
  }, [tracking.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const punchIn = async () => {
    if (!selfie) return setError('Please capture or upload a selfie to verify attendance.');
    if (!consent) return setError('Please review and check the location consent checkbox.');
    setBusy(true);
    setError('');
    setSuccessMsg('');
    try {
      const pos = await getPosition(20000);
      const fd = new FormData();
      fd.append('selfie', selfie);
      fd.append('latitude', String(pos.coords.latitude));
      fd.append('longitude', String(pos.coords.longitude));
      fd.append('accuracy', String(pos.coords.accuracy));
      await api.post('/attendance/punch-in/', fd);
      setSelfie(null);
      setConsent(false);
      setSuccessMsg('Punched in successfully! Location tracking is now active.');
      await load();
    } catch (e) {
      setError(
        e instanceof GeolocationPositionError
          ? 'Location access is required by Ncode IT Division policy. Please enable GPS/location in your browser.'
          : errorMessage(e)
      );
    } finally {
      setBusy(false);
    }
  };

  const punchOut = async () => {
    if (activeVisit) {
      return setError(
        `You have an active field visit in progress (${activeVisit.site_name}). Please complete your visit before punching out.`
      );
    }
    if (!confirm('Are you sure you want to Punch Out and close your active field session?')) return;
    setBusy(true);
    setError('');
    setSuccessMsg('');
    try {
      let body = {};
      try {
        const p = await getPosition(5000);
        body = { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy };
      } catch {
        /* final location is best-effort */
      }
      await api.post('/attendance/punch-out/', body);
      setSuccessMsg('Punched out successfully. Your field work session has completed.');
      await load();
      setActiveTab('dashboard');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // 1. START FIELD VISIT WORKFLOW
  const openStartVisitModal = async () => {
    if (!session) {
      setError('An active punch-in session is required to start a field visit.');
      return;
    }
    if (activeVisit) {
      setError(
        `You already have an active field visit in progress (${activeVisit.site_name}). Please complete it before starting a new one.`
      );
      return;
    }
    setError('');
    setStartForm({
      site_name: '',
      project_name: '',
      visit_type: 'SITE_INSPECTION',
      location_name: '',
      notes: '',
    });
    setShowStartModal(true);
    setStartGps({ status: 'detecting' });
    try {
      const p = await getPosition(10000);
      setStartGps({
        status: 'fixed',
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        accuracy: p.coords.accuracy,
      });
    } catch (err) {
      if (err instanceof GeolocationPositionError && err.code === err.PERMISSION_DENIED) {
        setStartGps({
          status: 'denied',
          errorMsg: 'Browser location permission denied. Check location settings.',
        });
      } else {
        setStartGps({
          status: 'error',
          errorMsg: 'Could not obtain instant GPS fix. Fallback to session location.',
        });
      }
    }
  };

  const handleStartVisit = async (e: FormEvent) => {
    e.preventDefault();
    if (!startForm.site_name.trim()) {
      setError('Site / Client Name is required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const lat = startGps.lat ?? session?.last_latitude;
      const lng = startGps.lng ?? session?.last_longitude;

      await api.post('/attendance/visits/', {
        site_name: startForm.site_name.trim(),
        project_name: startForm.project_name.trim(),
        visit_type: startForm.visit_type,
        location_name: startForm.location_name.trim(),
        notes: startForm.notes.trim(),
        latitude: lat,
        longitude: lng,
      });

      setShowStartModal(false);
      setSuccessMsg('Field visit started successfully! Location and timestamp logged.');
      await load();
      setActiveTab('visits');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // 2. COMPLETE FIELD VISIT WORKFLOW
  const openCompleteModal = async (v: Visit) => {
    setError('');
    setCompleteModalVisit(v);
    setCompleteForm({
      outcome: 'SATISFACTORY',
      outcome_notes: '',
      end_location_name: v.location_name || '',
    });
    setEndGps({ status: 'detecting' });
    try {
      const p = await getPosition(8000);
      setEndGps({
        status: 'fixed',
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        accuracy: p.coords.accuracy,
      });
    } catch {
      setEndGps({
        status: 'error',
        lat: session?.last_latitude ?? undefined,
        lng: session?.last_longitude ?? undefined,
      });
    }
  };

  const handleCompleteVisitSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!completeModalVisit) return;
    setBusy(true);
    setError('');
    try {
      const lat = endGps.lat ?? session?.last_latitude;
      const lng = endGps.lng ?? session?.last_longitude;

      await api.patch(`/attendance/visits/${completeModalVisit.id}/`, {
        status: 'COMPLETED',
        outcome: completeForm.outcome,
        outcome_notes: completeForm.outcome_notes.trim(),
        end_location_name: completeForm.end_location_name.trim(),
        end_latitude: lat,
        end_longitude: lng,
      });

      const finishedId = completeModalVisit.id;
      setCompleteModalVisit(null);
      setSuccessMsg(`Field visit #${finishedId} has been successfully completed and recorded.`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // 3. EVIDENCE PHOTO WORKFLOW
  const openPhotoModal = (v: Visit) => {
    setError('');
    setPhotoModalVisit(v);
    setEvidenceFile(null);
    setEvidencePreview(null);
    setEvidenceCaption('');
  };

  const handlePhotoFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError('Photo size must be 10 MB or smaller.');
        return;
      }
      setEvidenceFile(file);
      setEvidencePreview(URL.createObjectURL(file));
      setError('');
    }
  };

  const handleUploadEvidence = async (e: FormEvent) => {
    e.preventDefault();
    if (!photoModalVisit || !evidenceFile) {
      setError('Please select or capture a photo first.');
      return;
    }
    setPhotoUploading(true);
    setError('');
    try {
      let photoLat: number | undefined;
      let photoLng: number | undefined;
      try {
        const p = await getPosition(5000);
        photoLat = p.coords.latitude;
        photoLng = p.coords.longitude;
      } catch {
        photoLat = session?.last_latitude ?? undefined;
        photoLng = session?.last_longitude ?? undefined;
      }

      const fd = new FormData();
      fd.append('photo', evidenceFile);
      fd.append('caption', evidenceCaption.trim());
      if (photoLat !== undefined) fd.append('latitude', String(photoLat));
      if (photoLng !== undefined) fd.append('longitude', String(photoLng));

      await api.post(`/attendance/visits/${photoModalVisit.id}/photos/`, fd);
      setPhotoModalVisit(null);
      setEvidenceFile(null);
      setEvidencePreview(null);
      setEvidenceCaption('');
      setSuccessMsg('Evidence photo uploaded successfully.');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPhotoUploading(false);
    }
  };

  const liveSeconds = session ? (Date.now() - new Date(session.punch_in_at).getTime()) / 1000 : 0;

  // Filtered visits list for My Visits tab
  const filteredVisits = useMemo(() => {
    return visits.filter((v) => {
      if (visitCategoryFilter !== 'ALL' && v.visit_type !== visitCategoryFilter) return false;
      if (visitStatusFilter !== 'ALL' && v.status !== visitStatusFilter) return false;
      if (visitSearch.trim()) {
        const q = visitSearch.toLowerCase();
        const matchSite = v.site_name.toLowerCase().includes(q);
        const matchProj = (v.project_name || '').toLowerCase().includes(q);
        const matchLoc = (v.location_name || '').toLowerCase().includes(q);
        const matchNotes = (v.notes || '').toLowerCase().includes(q);
        if (!matchSite && !matchProj && !matchLoc && !matchNotes) return false;
      }
      return true;
    });
  }, [visits, visitCategoryFilter, visitStatusFilter, visitSearch]);

  // Prepare map data
  const mapPath: [number, number][] = locations.map((l) => [l.latitude, l.longitude]);
  const mapMarkers: MapMarker[] = [];

  if (session?.last_latitude && session?.last_longitude) {
    mapMarkers.push({
      id: 'current',
      lat: session.last_latitude,
      lng: session.last_longitude,
      label: `Current Location: ${user?.full_name || 'You'} (${fmtTime(session.last_location_at)})`,
      color: '#059669', // Emerald
    });
  }

  visits.forEach((v) => {
    if (v.latitude && v.longitude) {
      mapMarkers.push({
        id: `visit-${v.id}`,
        lat: v.latitude,
        lng: v.longitude,
        label: `Stop: ${v.site_name} (${v.status})`,
        color: v.status === 'COMPLETED' ? '#2563eb' : '#d97706',
      });
    }
  });

  const navTabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'tracking', label: 'My Tracking' },
    { id: 'visits', label: 'My Visits', badge: visits.length },
    { id: 'route', label: 'My Route' },
    { id: 'history', label: 'Attendance History', badge: history.length },
    { id: 'profile', label: 'Profile' },
  ];

  // Active Field Visit Card Component
  const renderActiveVisitCard = () => {
    if (!activeVisit) return null;
    return (
      <div className="card border-2 border-teal-500 bg-gradient-to-br from-teal-50/60 via-slate-50 to-blue-50/50 shadow-md shadow-teal-900/5 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-teal-200/70 gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              ACTIVE FIELD VISIT IN PROGRESS
            </span>
            <span
              className={`badge text-[11px] font-semibold border ${
                VISIT_TYPE_COLORS[activeVisit.visit_type || 'SITE_INSPECTION'].bg
              } ${VISIT_TYPE_COLORS[activeVisit.visit_type || 'SITE_INSPECTION'].text} ${
                VISIT_TYPE_COLORS[activeVisit.visit_type || 'SITE_INSPECTION'].border
              }`}
            >
              {VISIT_TYPE_LABELS[activeVisit.visit_type || 'SITE_INSPECTION']}
            </span>
            <span className="text-xs font-mono text-slate-500">
              #VIS-{String(activeVisit.id).padStart(4, '0')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-teal-100 text-teal-900 font-mono text-xs font-bold shadow-sm">
              <svg className="w-3.5 h-3.5 text-teal-700 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              Elapsed: {fmtDurationLive(activeVisit.start_time)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 leading-tight">{activeVisit.site_name}</h3>
            {activeVisit.project_name && (
              <p className="text-xs font-medium text-teal-800 mt-0.5">Project: {activeVisit.project_name}</p>
            )}
            {activeVisit.location_name && (
              <p className="text-xs text-slate-600 flex items-center gap-1.5 mt-1.5">
                <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {activeVisit.location_name}
              </p>
            )}
            {activeVisit.notes && (
              <p className="text-xs text-slate-600 bg-white/90 border border-slate-200/80 rounded-lg p-2.5 mt-2 italic">
                "{activeVisit.notes}"
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="bg-white/80 border border-slate-200/70 rounded-xl p-3 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-500">
                <span>Started At:</span>
                <span className="font-semibold text-slate-800">{fmtTime(activeVisit.start_time)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>GPS Fix:</span>
                <span className="font-mono text-slate-800">
                  {activeVisit.latitude && activeVisit.longitude
                    ? `${activeVisit.latitude.toFixed(5)}°, ${activeVisit.longitude.toFixed(5)}°`
                    : 'Session GPS Location'}
                </span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Evidence Photos:</span>
                <span className="font-semibold text-teal-800">
                  {activeVisit.photos?.length || 0} attached
                </span>
              </div>
            </div>

            {/* Quick evidence thumbnail strip */}
            {activeVisit.photos && activeVisit.photos.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Attached Site Evidence ({activeVisit.photos.length})
                </p>
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {activeVisit.photos.map((p) => (
                    <div
                      key={p.id}
                      className="w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-slate-200 shadow-sm cursor-pointer"
                      onClick={() => setEnlargedPhoto({ visitId: activeVisit.id, photoId: p.id, caption: p.caption })}
                      title={p.caption || 'Click to enlarge'}
                    >
                      <EvidenceImage visitId={activeVisit.id} photoId={p.id} caption={p.caption} className="w-16 h-16" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between pt-2 border-t border-teal-200/50 gap-2">
          <span className="text-[11px] text-slate-500">
            Field work in progress. Attach evidence photos and click Complete when finished.
          </span>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              className="btn btn-secondary text-xs flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
              onClick={() => openPhotoModal(activeVisit)}
              disabled={busy}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Add Evidence Photo
            </button>
            <button
              className="btn btn-primary text-xs bg-emerald-600 hover:bg-emerald-700 border-emerald-600 flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
              onClick={() => openCompleteModal(activeVisit)}
              disabled={busy}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              Complete Field Visit
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Layout
      title={session ? 'Field Work Session Active' : 'Daily Field Attendance'}
      subtitle={`Welcome, ${user?.full_name || user?.username} (${user?.profile?.employee_id || user?.username})`}
      tabs={navTabs}
      activeTab={activeTab}
      onTabChange={(t) => {
        setActiveTab(t as TabType);
        setError('');
        setSuccessMsg('');
      }}
    >
      {/* Alert Messages */}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700 flex items-start gap-3">
          <svg className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <div className="flex-1 whitespace-pre-line">{error}</div>
          <button className="text-rose-400 hover:text-rose-600" onClick={() => setError('')}>
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 flex items-start gap-3">
          <svg className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <div className="flex-1">{successMsg}</div>
          <button className="text-emerald-400 hover:text-emerald-600" onClick={() => setSuccessMsg('')}>
            ✕
          </button>
        </div>
      )}

      {/* ================= TAB 1: DASHBOARD ================= */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Active Field Visit highlight if present */}
          {activeVisit && renderActiveVisitCard()}

          {session ? (
            /* Punched In Active Dashboard */
            <div className="space-y-6">
              {/* Top Banner: Shift Active */}
              <div className="card bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-6 shadow-lg shadow-blue-900/10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="badge badge-success bg-emerald-500/20 text-emerald-300 border-emerald-400/30">
                        ● SHIFT ACTIVE
                      </span>
                      <span className="text-xs text-blue-200">Session #{session.id}</span>
                    </div>
                    <h2 className="text-xl font-bold tracking-tight text-white">
                      Field Attendance & Tracking in Progress
                    </h2>
                    <p className="text-xs text-blue-200">
                      Punched in at {fmtTime(session.punch_in_at)} · {fmtDate(session.punch_in_at)}
                    </p>
                  </div>

                  {/* Punch Out Action */}
                  <div className="flex items-center gap-3">
                    <button
                      className="btn btn-secondary text-xs"
                      onClick={openStartVisitModal}
                      disabled={busy || !!activeVisit}
                      title={activeVisit ? 'Complete your active visit before starting a new one' : ''}
                    >
                      + Start Field Visit
                    </button>
                    <button
                      className="btn btn-danger text-xs font-semibold px-4 py-2"
                      onClick={punchOut}
                      disabled={busy}
                    >
                      {busy ? 'Processing...' : 'Punch Out Now'}
                    </button>
                  </div>
                </div>

                {/* Metrics Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/10 text-center">
                  <div>
                    <p className="text-xs text-blue-200">Shift Elapsed</p>
                    <p className="text-xl font-bold font-mono mt-1 text-white">{fmtDuration(liveSeconds)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-200">Tracking Status</p>
                    <p className="text-sm font-semibold mt-1 text-emerald-300">{session.tracking_status}</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-200">Field Visits Logged</p>
                    <p className="text-xl font-bold font-mono mt-1 text-amber-300">{visits.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-200">Route Waypoints</p>
                    <p className="text-xl font-bold font-mono mt-1 text-sky-300">{locations.length}</p>
                  </div>
                </div>
              </div>

              {/* Tracking Status Component */}
              <TrackingStatus
                status={tracking.status}
                lastUpdate={fmtTime(tracking.lastUpdate?.toISOString() ?? session.last_location_at)}
              />

              {/* Visits Quick Section */}
              <div className="card">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                  <div>
                    <h3 className="font-bold text-slate-900">Today's Field Visits ({visits.length})</h3>
                    <p className="text-xs text-slate-500">Official field stops and site inspections</p>
                  </div>
                  <button className="btn btn-ghost text-xs" onClick={() => setActiveTab('visits')}>
                    View All Visits →
                  </button>
                </div>

                {visits.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-sm">
                    No field visits logged yet today. Click "+ Start Field Visit" when arriving at a site.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {visits.slice(0, 4).map((v) => (
                      <div key={v.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-800 text-sm">{v.site_name}</span>
                            <span
                              className={`badge text-[10px] ${
                                VISIT_TYPE_COLORS[v.visit_type || 'SITE_INSPECTION'].bg
                              } ${VISIT_TYPE_COLORS[v.visit_type || 'SITE_INSPECTION'].text}`}
                            >
                              {VISIT_TYPE_LABELS[v.visit_type || 'SITE_INSPECTION']}
                            </span>
                            <span
                              className={`badge ${
                                v.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'
                              }`}
                            >
                              {v.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">
                            {v.project_name ? `${v.project_name} · ` : ''}
                            Started at {fmtTime(v.start_time)}
                            {v.end_time && ` · Ended ${fmtTime(v.end_time)}`}
                            {v.location_name && ` · ${v.location_name}`}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            className="btn btn-ghost text-xs py-1 px-2.5"
                            onClick={() => setSelectedVisitDetail(v)}
                          >
                            Details
                          </button>
                          {v.status === 'IN_PROGRESS' && (
                            <button
                              className="btn btn-primary text-xs py-1 px-3 bg-emerald-600 hover:bg-emerald-700 border-emerald-600"
                              onClick={() => openCompleteModal(v)}
                              disabled={busy}
                            >
                              Complete
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Audit Timeline */}
              <div className="card">
                <h3 className="font-bold text-slate-900 mb-3 pb-2 border-b border-slate-100">
                  Today's Activity Audit Trail
                </h3>
                <EventTimeline events={events} />
              </div>
            </div>
          ) : (
            /* Not Punched In State */
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Punch In Card */}
              <div className="md:col-span-2 card space-y-5 border-slate-200/80 shadow-md">
                <div className="border-b border-slate-100 pb-3">
                  <span className="badge badge-neutral mb-2">ATTENDANCE STATUS: NOT STARTED</span>
                  <h2 className="text-lg font-bold text-slate-900">Punch In Verification</h2>
                  <p className="text-xs text-slate-500">
                    Capture your attendance selfie and allow location permission to start field tracking.
                  </p>
                </div>

                <div className="space-y-4">
                  <SelfieCapture file={selfie} onChange={setSelfie} />

                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs text-slate-600 space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        className="rounded border-slate-300 text-blue-900 focus:ring-blue-600 mt-0.5"
                      />
                      <span>
                        I confirm I am reporting for duty at <strong>Ncode Solution IT Division (GNFC)</strong> and
                        consent to automated GPS tracking during my active working session.
                      </span>
                    </label>
                  </div>

                  <button
                    className="btn btn-primary w-full py-3 text-base font-semibold shadow-md shadow-blue-950/10"
                    onClick={punchIn}
                    disabled={busy || !selfie || !consent}
                  >
                    {busy ? 'Verifying Attendance & GPS...' : 'Punch In & Begin Field Session'}
                  </button>
                </div>
              </div>

              {/* Policy Sidebar */}
              <div className="card space-y-4 bg-slate-50/70 border-slate-200">
                <h3 className="font-bold text-slate-800 text-sm">GNFC Field Work Guidelines</h3>
                <ul className="text-xs text-slate-600 space-y-2.5 list-disc list-inside">
                  <li>Keep browser location permission enabled at all times during your shift.</li>
                  <li>Record each official site inspection or client meeting in the <strong>My Visits</strong> tab.</li>
                  <li>Upload site evidence photos before completing each field visit.</li>
                  <li>Punch Out promptly when field duty concludes for the day.</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 2: MY TRACKING ================= */}
      {activeTab === 'tracking' && (
        <div className="space-y-6">
          <TrackingStatus
            status={tracking.status}
            lastUpdate={fmtTime(tracking.lastUpdate?.toISOString() ?? session?.last_location_at)}
          />
          <div className="card space-y-3">
            <h3 className="font-bold text-slate-900 text-sm">Live Position Map</h3>
            <div className="h-96 w-full rounded-xl overflow-hidden border border-slate-200">
              <MapView markers={mapMarkers} path={mapPath} />
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 3: MY VISITS (PHASE 5 STEP 5.2 OVERHAUL) ================= */}
      {activeTab === 'visits' && (
        <div className="space-y-6">
          {/* Header Action Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200 gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Field Visits & Site Inspections</h2>
              <p className="text-xs text-slate-500">
                Log, monitor, and record evidence for official Ncode / GNFC field stops
              </p>
            </div>
            <button
              className="btn btn-primary text-xs flex items-center justify-center gap-1.5"
              onClick={openStartVisitModal}
              disabled={!session || busy || !!activeVisit}
              title={
                !session
                  ? 'Punch in first to start visits'
                  : activeVisit
                  ? 'Complete your current active visit first'
                  : ''
              }
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Start Field Visit
            </button>
          </div>

          {!session && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span>
                <strong>Attendance Notice:</strong> You must punch in to start an active field work session before logging visits.
              </span>
            </div>
          )}

          {/* Active Field Visit Card if one is in progress */}
          {activeVisit && renderActiveVisitCard()}

          {/* Visits Filter and Search Bar */}
          <div className="card p-4 space-y-3 bg-slate-50/60 border-slate-200">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label text-[11px]">Search Visits</label>
                <input
                  type="text"
                  className="input py-2 text-xs"
                  placeholder="Search site, project, notes..."
                  value={visitSearch}
                  onChange={(e) => setVisitSearch(e.target.value)}
                />
              </div>

              <div>
                <label className="label text-[11px]">Category</label>
                <select
                  className="input py-2 text-xs"
                  value={visitCategoryFilter}
                  onChange={(e) => setVisitCategoryFilter(e.target.value)}
                >
                  <option value="ALL">All Categories</option>
                  <option value="SITE_INSPECTION">Site Inspection</option>
                  <option value="CLIENT_MEETING">Client Meeting</option>
                  <option value="TECHNICAL_VERIFICATION">Technical Verification</option>
                  <option value="INFRASTRUCTURE_AUDIT">Infrastructure / IT Audit</option>
                  <option value="OTHER">Other Official Work</option>
                </select>
              </div>

              <div>
                <label className="label text-[11px]">Status</label>
                <select
                  className="input py-2 text-xs"
                  value={visitStatusFilter}
                  onChange={(e) => setVisitStatusFilter(e.target.value)}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>
          </div>

          {/* Visits Master Records */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Visit History & Inspections ({filteredVisits.length})
              </span>
              <span className="text-[11px] text-slate-500">
                Click any row for complete inspection dossier & evidence photos
              </span>
            </div>

            {filteredVisits.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm space-y-2">
                <svg className="w-10 h-10 mx-auto text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p>No field visits found matching your filters.</p>
                {visits.length === 0 && session && (
                  <button className="btn btn-secondary text-xs mt-2" onClick={openStartVisitModal}>
                    + Start Your First Field Visit
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredVisits.map((v) => {
                  const typeColors = VISIT_TYPE_COLORS[v.visit_type || 'SITE_INSPECTION'];
                  const outcomeColors = OUTCOME_COLORS[v.outcome || 'PENDING'];
                  return (
                    <div
                      key={v.id}
                      className="p-4 hover:bg-slate-50/70 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer"
                      onClick={() => setSelectedVisitDetail(v)}
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-bold text-slate-500">
                            #VIS-{String(v.id).padStart(4, '0')}
                          </span>
                          <span className={`badge text-[10px] ${typeColors.bg} ${typeColors.text}`}>
                            {VISIT_TYPE_LABELS[v.visit_type || 'SITE_INSPECTION']}
                          </span>
                          <span className="font-bold text-slate-900 text-sm">{v.site_name}</span>
                          <span className={`badge ${v.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'}`}>
                            {v.status}
                          </span>
                          {v.outcome && (
                            <span className={`badge text-[10px] ${outcomeColors.bg} ${outcomeColors.text}`}>
                              {VISIT_OUTCOME_LABELS[v.outcome]}
                            </span>
                          )}
                        </div>

                        {v.project_name && (
                          <p className="text-xs font-medium text-teal-800">
                            Project: {v.project_name}
                          </p>
                        )}

                        <div className="text-xs text-slate-500 flex items-center gap-3 flex-wrap">
                          <span>Started: {fmtTime(v.start_time)}</span>
                          {v.end_time && <span>Ended: {fmtTime(v.end_time)}</span>}
                          {v.duration_minutes !== null && v.duration_minutes !== undefined && (
                            <span>Duration: {v.duration_minutes} min</span>
                          )}
                          {v.location_name && <span>Area: {v.location_name}</span>}
                        </div>

                        {v.notes && (
                          <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg p-2 italic line-clamp-1">
                            "{v.notes}"
                          </p>
                        )}
                      </div>

                      {/* Photo indicator & Action buttons */}
                      <div
                        className="flex items-center gap-2 self-start md:self-center shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="inline-flex items-center gap-1 text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
                          <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          </svg>
                          {v.photos?.length ?? 0} photos
                        </span>

                        <button
                          className="btn btn-ghost text-xs py-1.5 px-3"
                          onClick={() => setSelectedVisitDetail(v)}
                        >
                          Dossier
                        </button>

                        {v.status === 'IN_PROGRESS' && (
                          <>
                            <button
                              className="btn btn-secondary text-xs py-1.5 px-3"
                              onClick={() => openPhotoModal(v)}
                              disabled={busy}
                            >
                              Add Photo
                            </button>
                            <button
                              className="btn btn-primary text-xs py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 border-emerald-600"
                              onClick={() => openCompleteModal(v)}
                              disabled={busy}
                            >
                              Complete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 4: MY ROUTE ================= */}
      {activeTab === 'route' && (
        <div className="space-y-6">
          <div className="card space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Session Route Breadcrumbs</h3>
                <p className="text-xs text-slate-500">Continuous GPS trail recorded during your field session</p>
              </div>
              <span className="badge badge-neutral text-xs">{locations.length} Points Tracked</span>
            </div>
            <div className="h-[460px] w-full rounded-xl overflow-hidden border border-slate-200">
              <MapView markers={mapMarkers} path={mapPath} />
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 5: ATTENDANCE HISTORY ================= */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100 text-sm">
              My Attendance & Field Session History
            </h3>
            {history.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">No historical sessions recorded.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="py-2.5">Date</th>
                      <th>Punch In</th>
                      <th>Punch Out</th>
                      <th>Duration</th>
                      <th>Stops / Visits</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {history.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/50">
                        <td className="py-3 font-semibold text-slate-800">{fmtDate(s.punch_in_at)}</td>
                        <td>{fmtTime(s.punch_in_at)}</td>
                        <td>{s.punch_out_at ? fmtTime(s.punch_out_at) : 'Active'}</td>
                        <td className="font-mono text-xs">{fmtDuration(s.duration_seconds)}</td>
                        <td>{s.visits_count ?? '—'}</td>
                        <td>
                          <span className={`badge ${s.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'}`}>
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 6: PROFILE ================= */}
      {activeTab === 'profile' && (
        <div className="card max-w-xl mx-auto space-y-4">
          <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
            <div className="w-16 h-16 rounded-2xl bg-blue-900 text-white flex items-center justify-center font-bold text-xl uppercase shadow-md shadow-blue-950/20">
              {user?.first_name?.[0] || user?.username?.[0] || 'U'}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">{user?.full_name || user?.username}</h3>
              <p className="text-xs font-mono text-teal-700">{user?.profile?.employee_id || user?.username}</p>
              <p className="text-xs text-slate-500">{user?.profile?.department || 'IT Division (GNFC)'}</p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 text-sm">
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-500">Designation</span>
              <span className="font-semibold text-slate-800">{user?.profile?.designation || 'Field Engineer'}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-500">ESIC Number</span>
              <span className="font-mono text-slate-800">{user?.profile?.esic_number || '—'}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-500">Corporate Email</span>
              <span className="font-medium text-slate-800">{user?.email || '—'}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-500">System Role</span>
              <span className="badge badge-neutral">{user?.role}</span>
            </div>
          </div>
        </div>
      )}

      {/* ================= 1. START FIELD VISIT MODAL ================= */}
      {showStartModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Start Field Visit / Site Inspection</h3>
                <p className="text-xs text-slate-500">GNFC Field Force Management System</p>
              </div>
              <button
                className="text-slate-400 hover:text-slate-600 p-1 text-lg leading-none"
                onClick={() => setShowStartModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleStartVisit} className="space-y-4">
              <div>
                <label className="label" htmlFor="visit-category-select">Visit Category *</label>
                <select
                  id="visit-category-select"
                  className="input"
                  value={startForm.visit_type}
                  onChange={(e) => setStartForm({ ...startForm, visit_type: e.target.value as VisitType })}
                  required
                >
                  <option value="SITE_INSPECTION">Site Inspection</option>
                  <option value="CLIENT_MEETING">Client Meeting</option>
                  <option value="TECHNICAL_VERIFICATION">Technical Verification</option>
                  <option value="INFRASTRUCTURE_AUDIT">Infrastructure / IT Audit</option>
                  <option value="OTHER">Other Official Work</option>
                </select>
              </div>

              <div>
                <label className="label" htmlFor="visit-project-input">Project / Department Task</label>
                <input
                  id="visit-project-input"
                  className="input"
                  placeholder="e.g. GNFC Bharuch IT Modernization"
                  value={startForm.project_name}
                  onChange={(e) => setStartForm({ ...startForm, project_name: e.target.value })}
                />
              </div>

              <div>
                <label className="label" htmlFor="visit-site-input">Site / Client Name *</label>
                <input
                  id="visit-site-input"
                  className="input"
                  placeholder="e.g. Substation Sector 4 or GNFC Plant Bay 2"
                  value={startForm.site_name}
                  onChange={(e) => setStartForm({ ...startForm, site_name: e.target.value })}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="label" htmlFor="visit-location-input">Specific Location / Area</label>
                <input
                  id="visit-location-input"
                  className="input"
                  placeholder="e.g. Block B, Control Room 2"
                  value={startForm.location_name}
                  onChange={(e) => setStartForm({ ...startForm, location_name: e.target.value })}
                />
              </div>

              <div>
                <label className="label" htmlFor="visit-notes-input">Visit Purpose & Initial Notes</label>
                <textarea
                  id="visit-notes-input"
                  className="input h-20 resize-none text-xs"
                  placeholder="Detail the purpose and scope of this field visit..."
                  value={startForm.notes}
                  onChange={(e) => setStartForm({ ...startForm, notes: e.target.value })}
                />
              </div>

              {/* Live Location Status Indicator */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
                <span className="font-semibold text-slate-700 block">GPS Verification Status:</span>
                {startGps.status === 'detecting' && (
                  <p className="text-slate-500 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                    Acquiring live browser GPS coordinates...
                  </p>
                )}
                {startGps.status === 'fixed' && (
                  <p className="text-emerald-700 flex items-center gap-1.5 font-mono">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    GPS Fixed: {startGps.lat?.toFixed(5)}°, {startGps.lng?.toFixed(5)}° (Acc: ±
                    {Math.round(startGps.accuracy ?? 10)}m)
                  </p>
                )}
                {startGps.status === 'denied' && (
                  <p className="text-rose-600">
                    ⚠ GPS access was denied. Fallback session coordinates will be used.
                  </p>
                )}
                {startGps.status === 'error' && (
                  <p className="text-amber-700">
                    ⚠ GPS fix unavailable. Current session coordinates will be applied.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowStartModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || !startForm.site_name.trim()}
                >
                  {busy ? 'Starting Visit...' : 'Confirm & Start Field Visit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= 2. COMPLETE FIELD VISIT MODAL ================= */}
      {completeModalVisit && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Complete Field Visit</h3>
                <p className="text-xs text-slate-500">
                  #VIS-{String(completeModalVisit.id).padStart(4, '0')} · {completeModalVisit.site_name}
                </p>
              </div>
              <button
                className="text-slate-400 hover:text-slate-600 p-1 text-lg leading-none"
                onClick={() => setCompleteModalVisit(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCompleteVisitSubmit} className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Visit Start Time:</span>
                  <span className="font-semibold text-slate-800">{fmtTime(completeModalVisit.start_time)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Total Elapsed Duration:</span>
                  <span className="font-semibold text-teal-800 font-mono">
                    {fmtDurationLive(completeModalVisit.start_time)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Evidence Photos:</span>
                  <span className="font-semibold text-slate-800">
                    {completeModalVisit.photos?.length || 0} attached
                  </span>
                </div>
              </div>

              <div>
                <label className="label" htmlFor="complete-outcome-select">Inspection Outcome *</label>
                <select
                  id="complete-outcome-select"
                  className="input"
                  value={completeForm.outcome}
                  onChange={(e) => setCompleteForm({ ...completeForm, outcome: e.target.value as VisitOutcome })}
                  required
                >
                  <option value="SATISFACTORY">Satisfactory / Completed as Planned</option>
                  <option value="ACTION_REQUIRED">Action Required / Issues Identified</option>
                  <option value="FOLLOW_UP_NEEDED">Follow-Up Needed / Further Audit Required</option>
                  <option value="CANCELLED">Cancelled / Rescheduled</option>
                </select>
              </div>

              <div>
                <label className="label" htmlFor="complete-location-input">Ending Location / Exit Point</label>
                <input
                  id="complete-location-input"
                  className="input"
                  placeholder="e.g. Exit Gate 1, Control Room Desk"
                  value={completeForm.end_location_name}
                  onChange={(e) => setCompleteForm({ ...completeForm, end_location_name: e.target.value })}
                />
              </div>

              <div>
                <label className="label" htmlFor="complete-notes-input">Final Remarks & Outcome Notes *</label>
                <textarea
                  id="complete-notes-input"
                  className="input h-24 resize-none text-xs"
                  placeholder="Provide conclusion, observations, and any action items required..."
                  value={completeForm.outcome_notes}
                  onChange={(e) => setCompleteForm({ ...completeForm, outcome_notes: e.target.value })}
                  required
                />
              </div>

              {/* Ending GPS status */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
                <span className="font-semibold text-slate-700 block">Ending GPS Status:</span>
                {endGps.status === 'detecting' && (
                  <p className="text-slate-500 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                    Capturing ending location fix...
                  </p>
                )}
                {endGps.status === 'fixed' && (
                  <p className="text-emerald-700 font-mono">
                    Ending GPS: {endGps.lat?.toFixed(5)}°, {endGps.lng?.toFixed(5)}°
                  </p>
                )}
                {endGps.status === 'error' && (
                  <p className="text-slate-500">
                    Using last known session position for completion.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setCompleteModalVisit(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary bg-emerald-600 hover:bg-emerald-700 border-emerald-600"
                  disabled={busy || !completeForm.outcome_notes.trim()}
                >
                  {busy ? 'Completing...' : 'Confirm & Complete Visit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= 3. ADD EVIDENCE PHOTO MODAL ================= */}
      {photoModalVisit && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Attach Site Evidence Photo</h3>
                <p className="text-xs text-slate-500">{photoModalVisit.site_name}</p>
              </div>
              <button
                className="text-slate-400 hover:text-slate-600 p-1 text-lg leading-none"
                onClick={() => setPhotoModalVisit(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadEvidence} className="space-y-4">
              <div>
                <label className="label">Capture or Select Image *</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-900 hover:file:bg-blue-100"
                  onChange={handlePhotoFileChange}
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Supported formats: JPEG, PNG, WebP (Max 10 MB). On mobile, this opens the camera.
                </p>
              </div>

              {evidencePreview && (
                <div className="rounded-xl overflow-hidden border border-slate-200 max-h-48 flex items-center justify-center bg-slate-950">
                  <img src={evidencePreview} alt="Preview" className="max-h-48 object-contain" />
                </div>
              )}

              <div>
                <label className="label">Photo Caption / Observation</label>
                <input
                  className="input text-xs"
                  placeholder="e.g. Control room PLC unit inspection"
                  value={evidenceCaption}
                  onChange={(e) => setEvidenceCaption(e.target.value)}
                />
              </div>

              <div className="p-2.5 bg-blue-50/60 border border-blue-200/60 rounded-xl text-[11px] text-blue-900">
                Photo will be securely encrypted, authenticated, and tagged with current GPS coordinates.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setPhotoModalVisit(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={photoUploading || !evidenceFile}
                >
                  {photoUploading ? 'Uploading...' : 'Upload Evidence'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= 4. VISIT DOSSIER / DETAIL MODAL ================= */}
      {selectedVisitDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono font-bold text-slate-500">
                    #VIS-{String(selectedVisitDetail.id).padStart(4, '0')}
                  </span>
                  <span
                    className={`badge text-[10px] ${
                      VISIT_TYPE_COLORS[selectedVisitDetail.visit_type || 'SITE_INSPECTION'].bg
                    } ${VISIT_TYPE_COLORS[selectedVisitDetail.visit_type || 'SITE_INSPECTION'].text}`}
                  >
                    {VISIT_TYPE_LABELS[selectedVisitDetail.visit_type || 'SITE_INSPECTION']}
                  </span>
                  <span
                    className={`badge ${
                      selectedVisitDetail.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'
                    }`}
                  >
                    {selectedVisitDetail.status}
                  </span>
                  {selectedVisitDetail.outcome && (
                    <span
                      className={`badge text-[10px] ${OUTCOME_COLORS[selectedVisitDetail.outcome].bg} ${
                        OUTCOME_COLORS[selectedVisitDetail.outcome].text
                      }`}
                    >
                      {VISIT_OUTCOME_LABELS[selectedVisitDetail.outcome]}
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-slate-900 text-lg">{selectedVisitDetail.site_name}</h3>
                {selectedVisitDetail.project_name && (
                  <p className="text-xs text-teal-800 font-medium">
                    Project: {selectedVisitDetail.project_name}
                  </p>
                )}
              </div>
              <button
                className="text-slate-400 hover:text-slate-600 p-1 text-lg leading-none"
                onClick={() => setSelectedVisitDetail(null)}
              >
                ✕
              </button>
            </div>

            {/* Information Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-400 block">Officer Name</span>
                <span className="font-semibold text-slate-800">
                  {selectedVisitDetail.employee_name || user?.full_name}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Employee ID</span>
                <span className="font-mono text-slate-800">
                  {selectedVisitDetail.employee_id || user?.profile?.employee_id}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Department</span>
                <span className="font-semibold text-slate-800">
                  {selectedVisitDetail.department || 'IT Division (GNFC)'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Start Time</span>
                <span className="font-semibold text-slate-800">
                  {fmtTime(selectedVisitDetail.start_time)} · {fmtDate(selectedVisitDetail.start_time)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">End Time</span>
                <span className="font-semibold text-slate-800">
                  {selectedVisitDetail.end_time ? fmtTime(selectedVisitDetail.end_time) : 'In Progress'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Duration</span>
                <span className="font-mono text-slate-800">
                  {selectedVisitDetail.duration_minutes !== null &&
                  selectedVisitDetail.duration_minutes !== undefined
                    ? `${selectedVisitDetail.duration_minutes} minutes`
                    : selectedVisitDetail.status === 'IN_PROGRESS'
                    ? fmtDurationLive(selectedVisitDetail.start_time)
                    : '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Start Location</span>
                <span className="font-medium text-slate-800">
                  {selectedVisitDetail.location_name || 'Recorded at Site'}
                </span>
                {selectedVisitDetail.latitude && (
                  <span className="block font-mono text-[10px] text-slate-500">
                    {selectedVisitDetail.latitude.toFixed(5)}°, {selectedVisitDetail.longitude?.toFixed(5)}°
                  </span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block">End Location</span>
                <span className="font-medium text-slate-800">
                  {selectedVisitDetail.end_location_name || (selectedVisitDetail.end_time ? 'Completed at Site' : '—')}
                </span>
                {selectedVisitDetail.end_latitude && (
                  <span className="block font-mono text-[10px] text-slate-500">
                    {selectedVisitDetail.end_latitude.toFixed(5)}°, {selectedVisitDetail.end_longitude?.toFixed(5)}°
                  </span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block">Shift Session</span>
                <span className="font-mono text-slate-800">#{selectedVisitDetail.session}</span>
              </div>
            </div>

            {/* Notes & Outcome Sections */}
            <div className="space-y-3">
              {selectedVisitDetail.notes && (
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Initial Visit Purpose & Notes
                  </h4>
                  <div className="p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-700">
                    {selectedVisitDetail.notes}
                  </div>
                </div>
              )}

              {selectedVisitDetail.outcome_notes && (
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Inspection Remarks & Outcome
                  </h4>
                  <div className="p-3 bg-emerald-50/50 border border-emerald-200/70 rounded-xl text-xs text-slate-800">
                    {selectedVisitDetail.outcome_notes}
                  </div>
                </div>
              )}
            </div>

            {/* Evidence Photos Gallery */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Site Evidence Photos ({selectedVisitDetail.photos?.length || 0})
                </h4>
                {selectedVisitDetail.status === 'IN_PROGRESS' && (
                  <button
                    className="btn btn-ghost text-xs py-1 px-2.5"
                    onClick={() => {
                      const v = selectedVisitDetail;
                      setSelectedVisitDetail(null);
                      openPhotoModal(v);
                    }}
                  >
                    + Add Photo
                  </button>
                )}
              </div>

              {!selectedVisitDetail.photos || selectedVisitDetail.photos.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                  No evidence photos attached to this visit.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {selectedVisitDetail.photos.map((p) => (
                    <div
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() =>
                        setEnlargedPhoto({
                          visitId: selectedVisitDetail.id,
                          photoId: p.id,
                          caption: p.caption,
                        })
                      }
                    >
                      <EvidenceImage
                        visitId={selectedVisitDetail.id}
                        photoId={p.id}
                        caption={p.caption}
                        className="h-28 w-full"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              {selectedVisitDetail.status === 'IN_PROGRESS' && (
                <button
                  className="btn btn-primary text-xs bg-emerald-600 hover:bg-emerald-700 border-emerald-600"
                  onClick={() => {
                    const v = selectedVisitDetail;
                    setSelectedVisitDetail(null);
                    openCompleteModal(v);
                  }}
                >
                  Complete This Visit
                </button>
              )}
              <button
                className="btn btn-ghost text-xs"
                onClick={() => setSelectedVisitDetail(null)}
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= 5. PHOTO LIGHTBOX MODAL ================= */}
      {enlargedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setEnlargedPhoto(null)}
        >
          <div
            className="max-w-3xl w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl p-2 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-2 text-white border-b border-slate-800">
              <span className="text-xs font-semibold">
                {enlargedPhoto.caption || 'Field Evidence Photo'}
              </span>
              <button
                className="text-slate-400 hover:text-white p-1 text-sm font-bold"
                onClick={() => setEnlargedPhoto(null)}
              >
                ✕ Close
              </button>
            </div>
            <div className="p-2 flex items-center justify-center max-h-[75vh]">
              <EvidenceImage
                visitId={enlargedPhoto.visitId}
                photoId={enlargedPhoto.photoId}
                caption={enlargedPhoto.caption}
                className="max-h-[70vh] w-auto rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
