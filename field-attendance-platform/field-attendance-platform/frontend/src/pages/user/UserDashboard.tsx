import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AttendanceTab from '../../components/AttendanceTab';
import EventTimeline from '../../components/EventTimeline';
import EvidenceImage from '../../components/EvidenceImage';
import Layout from '../../components/Layout';
import LiveCamera from '../../components/LiveCamera';
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
  
  const { logout } = useAuth();
  const navigate = useNavigate();

  // Modals state
  const [activeModal, setActiveModalState] = useState<string | null>(null);
  
  // Custom setter that pushes to history so mobile back button works
  const setActiveModal = (modalId: string | null) => {
    if (modalId) {
      window.history.pushState({ modal: modalId }, '');
    } else if (activeModal) {
      window.history.back(); // Pop the state if closing
    }
    setActiveModalState(modalId);
  };

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      // If user presses physical back button, close the modal instead of exiting app
      if (activeModal) {
        setActiveModalState(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeModal]);

  const [leaveForm, setLeaveForm] = useState({
    leave_type: 'SICK',
    start_date: '',
    end_date: '',
    reason: ''
  });
  const [submittingLeave, setSubmittingLeave] = useState(false);

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
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const statusBadge = useMemo(() => {
    if (!isOnline) {
      return {
        label: 'Offline',
        className: 'bg-amber-100 text-amber-800 border-amber-300',
        dotClass: 'bg-amber-500 animate-pulse',
      };
    }
    if (!session) {
      return {
        label: 'Off duty',
        className: 'bg-slate-100 text-slate-700 border-slate-300',
        dotClass: 'bg-slate-400',
      };
    }
    if (tracking.status === 'PERMISSION_DENIED' || tracking.status === 'LOCATION_UNAVAILABLE') {
      return {
        label: 'Location lost',
        className: 'bg-rose-100 text-rose-800 border-rose-300',
        dotClass: 'bg-rose-500 animate-pulse',
      };
    }
    return {
      label: 'On duty',
      className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      dotClass: 'bg-emerald-500',
    };
  }, [isOnline, session, tracking.status]);

  const avatarInitials = useMemo(() => {
    const name = user?.full_name || user?.username || 'Field Officer';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }, [user]);

  const handlePunchIn = async (data: {
    selfie: File;
    latitude: number;
    longitude: number;
    accuracy?: number;
    consent: boolean;
    policy_version: string;
  }) => {
    setBusy(true);
    setError('');
    setSuccessMsg('');
    try {
      const fd = new FormData();
      fd.append('selfie', data.selfie);
      fd.append('latitude', String(data.latitude));
      fd.append('longitude', String(data.longitude));
      if (data.accuracy != null) {
        fd.append('accuracy', String(data.accuracy));
      }
      fd.append('consent', data.consent ? 'true' : 'false');
      fd.append('policy_version', data.policy_version);
      await api.post('/attendance/punch-in/', fd);
      setSuccessMsg('Punched in successfully! Location tracking is now active.');
      await load();
    } catch (e) {
      const msg = errorMessage(e);
      setError(msg);
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const handlePunchOut = async () => {
    if (activeVisit) {
      const msg = `You have an active field visit in progress (${activeVisit.site_name}). Please complete your visit before punching out.`;
      setError(msg);
      throw new Error(msg);
    }
    setBusy(true);
    setError('');
    setSuccessMsg('');
    try {
      let body: any = {};
      try {
        const p = await getPosition(5000);
        body = { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy };
      } catch {
        /* best-effort */
      }
      await api.post('/attendance/punch-out/', body);
      setSuccessMsg('Punched out successfully. Your field work session has completed.');
      await load();
      setActiveTab('dashboard');
    } catch (e) {
      const msg = errorMessage(e);
      setError(msg);
      throw e;
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
    <div className="min-h-screen bg-slate-200/70 flex items-center justify-center sm:py-6 sm:px-4">
      <div className="w-full max-w-md h-screen sm:h-[880px] sm:max-h-[94vh] bg-slate-50 sm:rounded-3xl sm:shadow-2xl flex flex-col overflow-hidden relative sm:border sm:border-slate-300/80">
        {/* Top Header */}
        <header className="px-4 py-3 bg-white border-b border-slate-200/80 flex items-center justify-between shrink-0 shadow-sm z-30">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold flex items-center justify-center text-xs shadow-sm shrink-0">
              {avatarInitials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900 text-sm truncate leading-tight">
                  {user?.full_name || user?.username || 'Field Officer'}
                </span>
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`}
                  title={isOnline ? 'Online' : 'Offline'}
                />
              </div>
              <p className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">
                {fmtDate(new Date().toISOString())}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusBadge.className}`}
              aria-live="polite"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dotClass}`} />
              {statusBadge.label}
            </span>
          </div>
        </header>

        <div className={`flex-1 overflow-y-auto ${activeTab === 'dashboard' ? '' : 'p-4'} flex flex-col relative`}>
          {/* Alert Messages */}
          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 mx-4 mt-4 text-sm text-rose-700 flex items-start gap-3 shrink-0">
              <svg className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="flex-1 whitespace-pre-line">{error}</div>
              <button className="text-rose-400 hover:text-rose-600" onClick={() => setError('')}>✕</button>
            </div>
          )}

          {successMsg && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 mx-4 mt-4 text-sm text-emerald-800 flex items-start gap-3 shrink-0">
              <svg className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">{successMsg}</div>
              <button className="text-emerald-400 hover:text-emerald-600" onClick={() => setSuccessMsg('')}>✕</button>
            </div>
          )}

          {/* ================= TAB 1: ATTENDANCE & PUNCH-IN FLOW ================= */}
          {activeTab === 'dashboard' && (
            <div className="p-4 flex-1">
              <AttendanceTab
                session={session}
                trackingStatus={tracking.status}
                lastTrackingUpdate={tracking.lastUpdate}
                history={history}
                busy={busy}
                onPunchIn={handlePunchIn}
                onPunchOut={handlePunchOut}
                onNavigateToHistory={() => setActiveTab('history')}
                onNavigateToVisits={() => setActiveTab('visits')}
              />
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

      {/* ================= TAB 6: PROFILE (MAIN HUB) ================= */}
      {activeTab === 'profile' && (
        <div className="-mx-4 -mt-4 bg-slate-50 min-h-full pb-6">
          {/* Avatar Section */}
          <div className="bg-white pb-6 pt-8 flex flex-col items-center">
            <div className="relative w-24 h-24 rounded-full border border-dashed border-slate-300 flex items-center justify-center bg-slate-50 mb-3 text-slate-400 text-[10px] font-semibold text-center leading-tight">
               ADD<br/>IMAGE
               <div className="absolute bottom-0 right-0 w-6 h-6 bg-[#00c696] rounded-full flex items-center justify-center text-white border-2 border-white shadow-sm">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
               </div>
            </div>
            <h2 className="text-slate-600 font-bold text-sm tracking-wide">{user?.full_name || user?.username}</h2>
          </div>

          {/* Grid Section */}
          <div className="p-3 bg-slate-50">
            <div className="grid grid-cols-3 gap-2">
              {/* Card 1: Profile */}
              <div className="bg-white rounded p-3 flex flex-col items-center justify-center text-center shadow-sm border border-slate-100 aspect-square cursor-pointer hover:bg-slate-50" onClick={() => setActiveModal('profile')}>
                 <div className="w-10 h-10 rounded-full bg-[#e6f8f3] text-[#00c696] flex items-center justify-center mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                 </div>
                 <span className="text-[10px] text-slate-600 font-medium">Profile</span>
              </div>

              {/* Card 2: View Attendance */}
              <div className="bg-white rounded p-3 flex flex-col items-center justify-center text-center shadow-sm border border-slate-100 aspect-square relative cursor-pointer hover:bg-slate-50" onClick={() => setActiveModal('attendance')}>
                 <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-rose-400 rounded-full"></div>
                 <div className="w-10 h-10 rounded-full bg-[#e6f8f3] text-[#00c696] flex items-center justify-center mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                 </div>
                 <span className="text-[10px] text-slate-600 font-medium leading-tight">View<br/>Attendance</span>
              </div>

              {/* Card 3: Announcements */}
              <div className="bg-white rounded p-3 flex flex-col items-center justify-center text-center shadow-sm border border-slate-100 aspect-square cursor-pointer hover:bg-slate-50" onClick={() => setActiveModal('announcements')}>
                 <div className="w-10 h-10 rounded-full bg-[#e6f8f3] text-[#00c696] flex items-center justify-center mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/></svg>
                 </div>
                 <span className="text-[9px] text-slate-600 font-medium truncate w-full">Announcements</span>
              </div>

              {/* Card 4: Set alarm */}
              <div className="bg-white rounded p-3 flex flex-col items-center justify-center text-center shadow-sm border border-slate-100 aspect-square cursor-pointer hover:bg-slate-50" onClick={() => setActiveModal('alarm')}>
                 <div className="w-10 h-10 rounded-full bg-[#e6f8f3] text-[#00c696] flex items-center justify-center mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                 </div>
                 <span className="text-[10px] text-slate-600 font-medium">Set alarm</span>
              </div>

              {/* Card 5: Request Leave */}
              <div className="bg-white rounded p-3 flex flex-col items-center justify-center text-center shadow-sm border border-slate-100 aspect-square cursor-pointer hover:bg-slate-50" onClick={() => setActiveModal('leave')}>
                 <div className="w-10 h-10 rounded-full bg-[#e6f8f3] text-[#00c696] flex items-center justify-center mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/></svg>
                 </div>
                 <span className="text-[10px] text-slate-600 font-medium leading-tight">Request<br/>Leave</span>
              </div>

              {/* Card 6: CRM */}
              <div className="bg-white rounded p-3 flex flex-col items-center justify-center text-center shadow-sm border border-slate-100 aspect-square relative cursor-pointer hover:bg-slate-50" onClick={() => setActiveModal('crm')}>
                 <div className="absolute top-1 right-1 bg-red-600 text-white text-[8px] font-bold px-1 rounded-sm">NEW</div>
                 <div className="w-10 h-10 rounded-full bg-[#e6f8f3] text-[#00c696] flex items-center justify-center mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                 </div>
                 <span className="text-[10px] text-slate-600 font-medium">CRM</span>
              </div>

              {/* Card 7: Request Reimbursement */}
              <div className="bg-white rounded p-3 flex flex-col items-center justify-center text-center shadow-sm border border-slate-100 aspect-square relative cursor-pointer hover:bg-slate-50" onClick={() => setActiveModal('reimbursement')}>
                 <div className="absolute top-1 right-1 bg-red-600 text-white text-[8px] font-bold px-1 rounded-sm">NEW</div>
                 <div className="w-10 h-10 rounded-full bg-[#e6f8f3] text-[#00c696] flex items-center justify-center mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                 </div>
                 <span className="text-[9px] text-slate-600 font-medium leading-tight">Request<br/>Reimbursement</span>
              </div>

              {/* Card 8: Notes */}
              <div className="bg-white rounded p-3 flex flex-col items-center justify-center text-center shadow-sm border border-slate-100 aspect-square cursor-pointer hover:bg-slate-50" onClick={() => setActiveModal('notes')}>
                 <div className="w-10 h-10 rounded-full bg-[#e6f8f3] text-[#00c696] flex items-center justify-center mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                 </div>
                 <span className="text-[10px] text-slate-600 font-medium">Notes</span>
              </div>

              {/* Card 9: Holiday List */}
              <div className="bg-white rounded p-3 flex flex-col items-center justify-center text-center shadow-sm border border-slate-100 aspect-square cursor-pointer hover:bg-slate-50" onClick={() => setActiveModal('holidays')}>
                 <div className="w-10 h-10 rounded-full bg-[#e6f8f3] text-[#00c696] flex items-center justify-center mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                 </div>
                 <span className="text-[10px] text-slate-600 font-medium leading-tight">Holiday<br/>List</span>
              </div>

              {/* Card 10: My Documents */}
              <div className="bg-white rounded p-3 flex flex-col items-center justify-center text-center shadow-sm border border-slate-100 aspect-square cursor-pointer hover:bg-slate-50" onClick={() => setActiveModal('documents')}>
                 <div className="w-10 h-10 rounded-full bg-[#e6f8f3] text-[#00c696] flex items-center justify-center mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
                 </div>
                 <span className="text-[10px] text-slate-600 font-medium leading-tight">My<br/>Documents</span>
              </div>

              {/* Card 11: Attendance Reminder */}
              <div className="bg-white rounded p-3 flex flex-col items-center justify-center text-center shadow-sm border border-slate-100 aspect-square cursor-pointer hover:bg-slate-50" onClick={() => setActiveModal('reminder')}>
                 <div className="w-10 h-10 rounded-full bg-[#e6f8f3] text-[#00c696] flex items-center justify-center mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
                 </div>
                 <span className="text-[9px] text-slate-600 font-medium leading-tight">Attendance<br/>Reminder</span>
              </div>

              {/* Card 12: Refer & Earn */}
              <div className="bg-white rounded p-3 flex flex-col items-center justify-center text-center shadow-sm border border-slate-100 aspect-square cursor-pointer hover:bg-slate-50" onClick={() => setActiveModal('refer')}>
                 <div className="w-10 h-10 rounded-full bg-[#e6f8f3] text-[#00c696] flex items-center justify-center mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/></svg>
                 </div>
                 <span className="text-[10px] text-slate-600 font-medium leading-tight">Refer<br/>& Earn</span>
              </div>

            </div>
            
            {/* Quick Action Logout Button */}
            <div className="mt-8 mb-8 mx-4">
               <button 
                 onClick={() => {
                   if (confirm("Are you sure you want to log out?")) {
                     logout();
                     navigate('/login', { replace: true });
                   }
                 }}
                 className="w-full py-4 bg-white text-rose-600 font-bold rounded-xl border border-rose-100 shadow-sm flex items-center justify-center gap-2 hover:bg-rose-50 transition-colors"
               >
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                 SECURE LOGOUT
               </button>
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
      {/* ================= MODALS (GENERIC & SPECIFIC) ================= */}
      {activeModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900 text-lg capitalize">{activeModal.replace('-', ' ')}</h3>
              <button className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 text-slate-500 hover:bg-slate-300" onClick={() => setActiveModal(null)}>✕</button>
            </div>
            
            {activeModal === 'leave' ? (
              <form className="p-5 overflow-y-auto" onSubmit={async (e) => {
                e.preventDefault();
                setSubmittingLeave(true);
                try {
                  await api.post('/attendance/leaves/', leaveForm);
                  setSuccessMsg('Leave request submitted successfully!');
                  setActiveModal(null);
                  setLeaveForm({ leave_type: 'SICK', start_date: '', end_date: '', reason: '' });
                } catch (err: any) {
                  setError(err.response?.data?.detail || 'Failed to submit leave request');
                } finally {
                  setSubmittingLeave(false);
                }
              }}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Leave Type *</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                      value={leaveForm.leave_type}
                      onChange={e => setLeaveForm({...leaveForm, leave_type: e.target.value})}
                      required
                    >
                      <option value="SICK">Sick Leave</option>
                      <option value="CASUAL">Casual Leave</option>
                      <option value="PTO">Paid Time Off (PTO)</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Start Date *</label>
                      <input 
                        type="date" 
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm" 
                        value={leaveForm.start_date}
                        onChange={e => setLeaveForm({...leaveForm, start_date: e.target.value})}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">End Date *</label>
                      <input 
                        type="date" 
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm" 
                        value={leaveForm.end_date}
                        onChange={e => setLeaveForm({...leaveForm, end_date: e.target.value})}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Leave *</label>
                    <textarea 
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm min-h-[80px]" 
                      placeholder="Provide details..."
                      value={leaveForm.reason}
                      onChange={e => setLeaveForm({...leaveForm, reason: e.target.value})}
                      required
                    />
                  </div>
                  <button type="submit" disabled={submittingLeave} className="w-full bg-[#00c696] hover:bg-[#00a880] text-white font-bold py-3 rounded-xl shadow-md transition-colors disabled:opacity-50">
                    {submittingLeave ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            ) : activeModal === 'profile' ? (
              <div className="p-5 space-y-4">
                 <div className="divide-y divide-slate-100 text-sm">
                   <div className="py-2.5 flex justify-between"><span className="text-slate-500">Designation</span><span className="font-semibold text-slate-800">{user?.profile?.designation || 'Field Engineer'}</span></div>
                   <div className="py-2.5 flex justify-between"><span className="text-slate-500">ESIC Number</span><span className="font-mono text-slate-800">{user?.profile?.esic_number || '—'}</span></div>
                   <div className="py-2.5 flex justify-between"><span className="text-slate-500">Corporate Email</span><span className="font-medium text-slate-800">{user?.email || '—'}</span></div>
                   <div className="py-2.5 flex justify-between"><span className="text-slate-500">System Role</span><span className="badge badge-neutral">{user?.role}</span></div>
                 </div>
                 <div className="pt-4 border-t border-slate-100">
                   <button 
                     onClick={() => {
                       logout();
                       navigate('/login', { replace: true });
                     }}
                     className="w-full py-3 bg-rose-50 text-rose-600 font-bold rounded-xl border border-rose-100 hover:bg-rose-100"
                   >
                     Log Out
                   </button>
                 </div>
              </div>
            ) : activeModal === 'holidays' ? (
              <div className="p-5 space-y-3">
                 {[
                   { name: 'Diwali', date: '2026-11-08' },
                   { name: 'Christmas', date: '2026-12-25' },
                   { name: 'New Year', date: '2027-01-01' }
                 ].map(h => (
                   <div key={h.date} className="flex justify-between items-center p-3 border border-slate-100 rounded-lg bg-slate-50">
                     <span className="font-bold text-slate-700">{h.name}</span>
                     <span className="text-sm font-mono text-slate-500">{h.date}</span>
                   </div>
                 ))}
              </div>
            ) : activeModal === 'documents' ? (
              <div className="p-5 space-y-3">
                 <div className="p-3 border border-dashed border-slate-300 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500 cursor-pointer hover:bg-slate-100">
                    + Upload Document (PAN / Aadhar)
                 </div>
              </div>
            ) : (
              <div className="p-10 flex flex-col items-center justify-center text-center">
                 <svg className="w-16 h-16 text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                 <h4 className="text-slate-800 font-bold text-lg mb-1">Coming Soon</h4>
                 <p className="text-slate-500 text-sm">This module is actively being developed and will be available shortly.</p>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* BOTTOM NAV */}
      <nav
        aria-label="Officer Bottom Navigation"
        className="bg-white flex items-center justify-around py-1.5 border-t border-slate-200/90 pb-safe z-30 relative shrink-0 shadow-[0_-2px_6px_rgba(0,0,0,0.03)]"
      >
        <button
          type="button"
          aria-label="Attendance Tab"
          className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] px-2 py-1 rounded-xl transition-all ${
            activeTab === 'dashboard'
              ? 'text-emerald-600 font-bold bg-emerald-50/60'
              : 'text-slate-400 hover:text-slate-600'
          }`}
          onClick={() => {
            setActiveTab('dashboard');
            setError('');
            setSuccessMsg('');
          }}
        >
          <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
          </svg>
          <span className="text-[10px]">Attendance</span>
        </button>

        <button
          type="button"
          aria-label="Field Visits Tab"
          className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] px-2 py-1 rounded-xl transition-all ${
            activeTab === 'visits'
              ? 'text-emerald-600 font-bold bg-emerald-50/60'
              : 'text-slate-400 hover:text-slate-600'
          }`}
          onClick={() => {
            setActiveTab('visits');
            setError('');
            setSuccessMsg('');
          }}
        >
          <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <span className="text-[10px]">Field Visits</span>
        </button>

        <button
          type="button"
          aria-label="History Tab"
          className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] px-2 py-1 rounded-xl transition-all ${
            activeTab === 'history'
              ? 'text-emerald-600 font-bold bg-emerald-50/60'
              : 'text-slate-400 hover:text-slate-600'
          }`}
          onClick={() => {
            setActiveTab('history');
            setError('');
            setSuccessMsg('');
          }}
        >
          <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[10px]">History</span>
        </button>

        <button
          type="button"
          aria-label="Profile Tab"
          className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] px-2 py-1 rounded-xl transition-all ${
            activeTab === 'profile'
              ? 'text-emerald-600 font-bold bg-emerald-50/60'
              : 'text-slate-400 hover:text-slate-600'
          }`}
          onClick={() => {
            setActiveTab('profile');
            setError('');
            setSuccessMsg('');
          }}
        >
          <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-[10px]">Profile</span>
        </button>
      </nav>
      </div>
    </div>
  );
}
