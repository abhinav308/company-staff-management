import React, { useEffect, useRef, useState } from 'react';
import api, { errorMessage } from '../services/api';
import { fmtDate, fmtDuration, fmtTime } from '../services/format';
import type { Session, TrackingStatus as TrackingStatusType } from '../types';

interface AttendanceTabProps {
  session: Session | null;
  trackingStatus: TrackingStatusType;
  lastTrackingUpdate: Date | null;
  history: Session[];
  busy: boolean;
  onPunchIn: (data: {
    selfie: File;
    latitude: number;
    longitude: number;
    accuracy?: number;
    consent: boolean;
    policy_version: string;
  }) => Promise<void>;
  onPunchOut: () => Promise<void>;
  onNavigateToHistory: () => void;
  onNavigateToVisits: () => void;
}

const POLICY_VERSION = '1.0';

// Helper to compress an image file to max 1280px JPEG ~0.8
async function compressImage(file: File, maxDim = 1280, quality = 0.8): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(new File([blob], 'selfie.jpg', { type: 'image/jpeg' }));
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      } else {
        resolve(file);
      }
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}

function formatLiveTimer(startIso?: string): string {
  if (!startIso) return '00:00:00';
  const start = new Date(startIso).getTime();
  if (isNaN(start)) return '00:00:00';
  const diffSec = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

function formatRelativeSeconds(date?: Date | string | null): string {
  if (!date) return 'No GPS lock';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return 'No GPS lock';
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 5) return 'Just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

export default function AttendanceTab({
  session,
  trackingStatus,
  lastTrackingUpdate,
  history,
  busy,
  onPunchIn,
  onPunchOut,
  onNavigateToHistory,
  onNavigateToVisits,
}: AttendanceTabProps) {
  // Consent State
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [hasPriorConsent, setHasPriorConsent] = useState(false);
  const [showPolicyDetails, setShowPolicyDetails] = useState(false);
  const [loadingConsent, setLoadingConsent] = useState(true);

  // Location State
  const [gpsState, setGpsState] = useState<'idle' | 'acquiring' | 'allowed' | 'denied' | 'unavailable'>('idle');
  const [gpsCoords, setGpsCoords] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const [gpsErrorMsg, setGpsErrorMsg] = useState('');

  // Selfie / Camera State
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreviewUrl, setSelfiePreviewUrl] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  // Active Session Live Timer
  const [liveTimer, setLiveTimer] = useState('00:00:00');
  const [showPunchOutConfirm, setShowPunchOutConfirm] = useState(false);
  const [completedSummary, setCompletedSummary] = useState<{
    duration: string;
    punchIn: string;
    punchOut: string;
  } | null>(null);

  // Screen Wake Lock State
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockRef = useRef<any>(null);

  // Today's Work Notes State
  const [todayNotes, setTodayNotes] = useState(() => {
    return localStorage.getItem('ncode_today_notes') || '';
  });
  const [notesSaved, setNotesSaved] = useState(false);

  // Check consent from backend
  useEffect(() => {
    let unmounted = false;
    api
      .get<{ has_consented: boolean; accepted_at: string | null }>(`/attendance/consent/?policy_version=${POLICY_VERSION}`)
      .then((res) => {
        if (!unmounted && res.data?.has_consented) {
          setHasPriorConsent(true);
          setConsentAccepted(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!unmounted) setLoadingConsent(false);
      });
    return () => {
      unmounted = true;
    };
  }, []);

  // Screen Wake Lock while session is active
  useEffect(() => {
    if (!session) {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      setWakeLockActive(false);
      return;
    }

    if ('wakeLock' in navigator) {
      navigator.wakeLock
        .request('screen')
        .then((lock) => {
          wakeLockRef.current = lock;
          setWakeLockActive(true);
          lock.addEventListener('release', () => {
            setWakeLockActive(false);
          });
        })
        .catch(() => {
          setWakeLockActive(false);
        });
    }

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [session]);

  // Live timer interval
  useEffect(() => {
    if (!session?.punch_in_at) return;
    const interval = setInterval(() => {
      setLiveTimer(formatLiveTimer(session.punch_in_at));
    }, 1000);
    setLiveTimer(formatLiveTimer(session.punch_in_at));
    return () => clearInterval(interval);
  }, [session?.punch_in_at]);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (selfiePreviewUrl) {
        URL.revokeObjectURL(selfiePreviewUrl);
      }
    };
  }, [selfiePreviewUrl]);

  // Start Camera Stream
  const startCamera = async () => {
    setCameraError(null);
    setCameraActive(true);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in this browser environment.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      let msg = 'Camera access was blocked or is unavailable.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission denied. Please allow camera access in your browser settings, or upload a photo below.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No camera device detected on your hardware. Please upload a photo below.';
      } else if (!window.isSecureContext) {
        msg = 'Insecure context detected. Please ensure you are accessing via http://localhost:5173.';
      }
      setCameraError(msg);
      setCameraActive(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    }
  };

  // Stop Camera Stream
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  // Capture frame from video stream
  const captureSelfieFromStream = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setCapturing(true);
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const w = video.videoWidth || 640;
      const h = video.videoHeight || 640;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, w, h);
        canvas.toBlob(
          async (blob) => {
            if (blob) {
              const rawFile = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
              const compressed = await compressImage(rawFile, 1280, 0.8);
              setSelfieFile(compressed);
              if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl);
              setSelfiePreviewUrl(URL.createObjectURL(compressed));
              stopCamera();
            }
            setCapturing(false);
          },
          'image/jpeg',
          0.85
        );
      } else {
        setCapturing(false);
      }
    } catch (e) {
      setCapturing(false);
    }
  };

  // Handle fallback file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 1280, 0.8);
      setSelfieFile(compressed);
      if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl);
      setSelfiePreviewUrl(URL.createObjectURL(compressed));
      setCameraError(null);
      stopCamera();
    } catch (err) {
      setCameraError('Failed to process image file. Please try another photo.');
    }
  };

  // Retake photo
  const handleRetakeSelfie = () => {
    if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl);
    setSelfiePreviewUrl(null);
    setSelfieFile(null);
    startCamera();
  };

  // Acquire High-Accuracy GPS
  const acquireLocation = () => {
    setGpsState('acquiring');
    setGpsErrorMsg('');

    if (!('geolocation' in navigator)) {
      setGpsState('unavailable');
      setGpsErrorMsg('Geolocation is not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setGpsState('allowed');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsState('denied');
          setGpsErrorMsg(
            'Location access was blocked. Please tap the lock/tune icon in your address bar and enable Location permissions.'
          );
        } else {
          setGpsState('unavailable');
          setGpsErrorMsg('Unable to determine your GPS location. Please check device location settings.');
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  // Auto-acquire location once consent is accepted
  useEffect(() => {
    if (!session && consentAccepted && gpsState === 'idle') {
      acquireLocation();
    }
  }, [consentAccepted, session]);

  // Handle Punch In Submission
  const handlePerformPunchIn = async () => {
    if (!selfieFile || !gpsCoords || !consentAccepted) return;

    try {
      // Haptic confirmation
      if (navigator.vibrate) navigator.vibrate([50, 50, 100]);

      await onPunchIn({
        selfie: selfieFile,
        latitude: gpsCoords.latitude,
        longitude: gpsCoords.longitude,
        accuracy: gpsCoords.accuracy,
        consent: true,
        policy_version: POLICY_VERSION,
      });

      // Reset local capture state
      if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl);
      setSelfiePreviewUrl(null);
      setSelfieFile(null);
      stopCamera();
    } catch (err) {
      // Handled by parent error toast
    }
  };

  // Handle Punch Out with confirmation
  const handlePerformPunchOut = async () => {
    if (!session) return;
    try {
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      const durationFmt = formatLiveTimer(session.punch_in_at);
      const punchInFmt = fmtTime(session.punch_in_at);
      const punchOutFmt = fmtTime(new Date().toISOString());

      await onPunchOut();

      setCompletedSummary({
        duration: durationFmt,
        punchIn: punchInFmt,
        punchOut: punchOutFmt,
      });
      setShowPunchOutConfirm(false);
    } catch (err) {
      // Handled by parent
    }
  };

  // Readiness Checklist Evaluation
  const isConsentReady = consentAccepted;
  const isGpsReady = gpsState === 'allowed' && gpsCoords != null;
  const isSelfieReady = selfieFile != null;
  const isReadyToPunchIn = isConsentReady && isGpsReady && isSelfieReady;

  // Save Today's Work Notes
  const handleSaveNotes = () => {
    localStorage.setItem('ncode_today_notes', todayNotes);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2500);
  };

  // Today's summary metrics calculation from history
  const todayIso = new Date().toISOString().split('T')[0];
  const todaySessions = history.filter((s) => s.punch_in_at?.startsWith(todayIso));
  const todayTotalDurationSec = todaySessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0);
  const todayInterruptions = todaySessions.reduce((acc, s) => acc + (s.interruptions || 0), 0);

  // -------------------------------------------------------------
  // RENDER: ACTIVE SESSION VIEW (Shift in progress)
  // -------------------------------------------------------------
  if (session) {
    const isLocationLost =
      trackingStatus === 'LOCATION_UNAVAILABLE' || trackingStatus === 'PERMISSION_DENIED';

    return (
      <div className="space-y-4 pb-2">
        {/* Compliance sharing banner */}
        <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-800 shadow-sm">
          <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span className="font-medium">
            Your location is shared with your administrator while you are punched in.
          </span>
        </div>

        {/* Location Interruption Warning Banner */}
        {isLocationLost && (
          <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-2xl text-xs text-rose-800 space-y-1.5 shadow-sm animate-pulse">
            <div className="flex items-center gap-2 font-bold text-rose-900">
              <svg className="w-4 h-4 text-rose-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>GPS Tracking Signal Lost</span>
            </div>
            <p className="text-[11px] text-rose-700 leading-relaxed">
              Location updates have stopped. Ensure Location is enabled in your device settings and you have clear line-of-sight. The system will recover automatically.
            </p>
          </div>
        )}

        {/* Live Timer Hero Card */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-5 shadow-xl text-center space-y-4 border border-slate-700/60">
          <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${
                isLocationLost ? 'bg-rose-500' : 'bg-emerald-400 animate-ping'
              }`} />
              <span className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
                {isLocationLost ? 'Signal Lost' : 'Duty Shift Active'}
              </span>
            </div>
            {wakeLockActive && (
              <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800">
                <span>💡 Keep-awake on</span>
              </span>
            )}
          </div>

          <div>
            <p className="text-[11px] font-semibold tracking-widest text-slate-400 uppercase">Active Shift Duration</p>
            <div className="text-4xl font-extrabold font-mono tracking-tight text-white mt-1">
              {liveTimer}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-left bg-slate-800/80 rounded-2xl p-3 border border-slate-700 text-xs">
            <div>
              <span className="text-slate-400 text-[10px] block">Punch In Time</span>
              <strong className="text-slate-100 font-semibold">{fmtTime(session.punch_in_at)}</strong>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block">Last GPS Ping</span>
              <strong className="text-slate-100 font-semibold">
                {formatRelativeSeconds(lastTrackingUpdate || session.last_location_at)}
              </strong>
            </div>
          </div>

          {/* Quick Actions (Visits + Punch Out) */}
          <div className="flex flex-col gap-2.5 pt-1">
            <button
              type="button"
              onClick={onNavigateToVisits}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-md transition-all text-xs flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span>Manage Field Visits & Clients</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPunchOutConfirm(true)}
              className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-2xl shadow-md transition-all text-sm tracking-wide uppercase active:scale-[0.98]"
            >
              Punch Out (End Shift)
            </button>
          </div>
        </div>

        {/* Confirmation Modal for Punch Out */}
        {showPunchOutConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-3xl p-5 max-w-sm w-full text-center space-y-4 shadow-2xl border border-slate-200">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 mx-auto flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Conclude Field Shift?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  You have been on duty for <strong className="text-slate-800">{liveTimer}</strong>. Real-time location tracking will stop immediately upon punching out.
                </p>
              </div>
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPunchOutConfirm(false)}
                  disabled={busy}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
                >
                  Keep Working
                </button>
                <button
                  type="button"
                  onClick={handlePerformPunchOut}
                  disabled={busy}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-colors shadow-sm"
                >
                  {busy ? 'Punching out...' : 'Confirm Punch Out'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: IDLE VIEW (Step-by-step Punch-In Flow)
  // -------------------------------------------------------------
  return (
    <div className="space-y-4 pb-2">
      {/* Shift Concluded Summary Modal/Card */}
      {completedSummary && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-3xl p-4 text-center space-y-2.5 shadow-sm">
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center font-bold">
            ✓
          </div>
          <div>
            <h4 className="font-bold text-emerald-950 text-sm">Shift Successfully Concluded</h4>
            <p className="text-xs text-emerald-800 mt-0.5">
              Duration: <strong>{completedSummary.duration}</strong> · Punch Out at {completedSummary.punchOut}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCompletedSummary(null)}
            className="text-xs text-emerald-700 hover:underline font-semibold"
          >
            Dismiss Summary
          </button>
        </div>
      )}

      {/* Main Punch-In Card (State Machine Flow) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-900 text-base">Attendance Punch-In</h2>
            <p className="text-xs text-slate-500">Verify consent, acquire GPS lock, and capture front selfie</p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
            Off duty
          </span>
        </div>

        {/* STEP 1: Consent Policy Card */}
        <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                consentAccepted ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                {consentAccepted ? '✓' : '1'}
              </span>
              <h3 className="font-bold text-xs text-slate-900">Session Location & Selfie Consent</h3>
            </div>
            <button
              type="button"
              onClick={() => setShowPolicyDetails(!showPolicyDetails)}
              className="text-[11px] font-semibold text-blue-600 hover:underline"
            >
              {showPolicyDetails ? 'Hide Details' : 'View Policy'}
            </button>
          </div>

          {showPolicyDetails && (
            <div className="text-[11px] text-slate-600 space-y-2 bg-white rounded-xl p-3 border border-slate-200 leading-relaxed animate-fadeIn">
              <p>
                <strong>Purpose:</strong> Geolocation and selfie photos are collected solely to record shift attendance, verify employee presence in assigned field zones, and ensure officer safety.
              </p>
              <p>
                <strong>Tracking Boundary:</strong> Tracking starts <em>only</em> upon punching in and <em>strictly terminates</em> when you punch out. No tracking occurs during non-work hours.
              </p>
              <p>
                <strong>Access & Retention:</strong> Data is encrypted in transit and at rest, restricted strictly to authorized operations administrators, and automatically purged after corporate retention limits.
              </p>
            </div>
          )}

          <label className="flex items-start gap-2.5 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => setConsentAccepted(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
            />
            <span className="text-xs text-slate-700 leading-snug">
              I consent to session-scoped location tracking and selfie attendance verification for my shift (Policy v{POLICY_VERSION}).
            </span>
          </label>
        </div>

        {/* STEP 2: Location Acquisition */}
        <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                isGpsReady ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                {isGpsReady ? '✓' : '2'}
              </span>
              <h3 className="font-bold text-xs text-slate-900">GPS Position Fix</h3>
            </div>
            <button
              type="button"
              onClick={acquireLocation}
              disabled={gpsState === 'acquiring'}
              className="text-[11px] font-semibold text-blue-600 hover:underline disabled:opacity-50"
            >
              {gpsState === 'acquiring' ? 'Acquiring...' : gpsCoords ? 'Refresh GPS' : 'Acquire GPS'}
            </button>
          </div>

          {gpsState === 'acquiring' && (
            <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 p-2.5 rounded-xl border border-blue-200">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
              <span>Acquiring high-precision GPS satellite fix...</span>
            </div>
          )}

          {gpsState === 'allowed' && gpsCoords && (
            <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-xs space-y-1 text-emerald-900">
              <div className="flex items-center justify-between font-semibold">
                <span>GPS Lock Confirmed</span>
                <span className="text-[11px] text-emerald-700 font-mono">
                  {gpsCoords.accuracy ? `±${Math.round(gpsCoords.accuracy)}m accuracy` : 'Accurate'}
                </span>
              </div>
              <p className="text-[10px] text-emerald-700 font-mono">
                Lat: {gpsCoords.latitude.toFixed(5)}, Lng: {gpsCoords.longitude.toFixed(5)}
              </p>
              {gpsCoords.accuracy && gpsCoords.accuracy > 100 && (
                <p className="text-[11px] text-amber-800 font-semibold pt-1">
                  ⚠️ Low precision (±{Math.round(gpsCoords.accuracy)}m). Move outdoors for best satellite reception.
                </p>
              )}
            </div>
          )}

          {gpsState === 'denied' && (
            <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-xs text-rose-800 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <span>⚠️ Location Permission Blocked</span>
              </p>
              <p className="text-[11px] text-rose-700 leading-relaxed">
                {gpsErrorMsg}
              </p>
              <button
                type="button"
                onClick={acquireLocation}
                className="mt-1 px-2.5 py-1 bg-rose-600 text-white rounded-lg font-bold text-[10px]"
              >
                Retry Location Request
              </button>
            </div>
          )}

          {gpsState === 'unavailable' && (
            <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-xs text-amber-800 space-y-1">
              <p className="font-bold">⚠️ GPS Signal Unavailable</p>
              <p className="text-[11px]">{gpsErrorMsg}</p>
            </div>
          )}
        </div>

        {/* STEP 3: Selfie Capture / Upload Fallback */}
        <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                isSelfieReady ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                {isSelfieReady ? '✓' : '3'}
              </span>
              <h3 className="font-bold text-xs text-slate-900">Front Selfie Verification</h3>
            </div>
            {isSelfieReady && (
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                Selfie captured
              </span>
            )}
          </div>

          {/* Captured Selfie Preview */}
          {selfiePreviewUrl ? (
            <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
              <img
                src={selfiePreviewUrl}
                alt="Captured Selfie"
                className="w-16 h-16 rounded-xl object-cover border border-slate-200 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-xs text-slate-800">Selfie ready for submission</p>
                <p className="text-[10px] text-slate-500">Verified attendance photo attached</p>
              </div>
              <button
                type="button"
                onClick={handleRetakeSelfie}
                className="text-xs font-semibold text-rose-600 hover:text-rose-800 px-2 py-1 bg-rose-50 rounded-lg border border-rose-100"
              >
                Retake
              </button>
            </div>
          ) : cameraActive ? (
            // Live Camera Viewfinder
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square max-w-[280px] mx-auto border-2 border-emerald-500 shadow-md">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Viewfinder Circle Guide */}
              <div className="absolute inset-0 border-2 border-white/60 rounded-full pointer-events-none m-6" />

              {/* Action Buttons overlay */}
              <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-3 z-10 px-4">
                <button
                  type="button"
                  onClick={stopCamera}
                  className="px-3 py-1.5 rounded-xl bg-slate-900/80 text-white text-xs font-semibold backdrop-blur-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={captureSelfieFromStream}
                  disabled={capturing}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-lg active:scale-95 transition-all"
                >
                  {capturing ? 'Snapping...' : 'Snap Photo'}
                </button>
              </div>
            </div>
          ) : (
            // Idle Camera Options (Start Live Camera or Upload Fallback)
            <div className="space-y-2.5">
              {cameraError && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <span>📷 Camera Notice</span>
                  </p>
                  <p className="text-[11px] leading-relaxed">{cameraError}</p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={startCamera}
                  className="flex-1 py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-xl border border-emerald-200 text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Open Live Camera</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl border border-slate-300 text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>Upload Photo Instead</span>
                </button>

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            </div>
          )}
        </div>

        {/* Readiness Checklist */}
        <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/80 space-y-1.5 text-xs">
          <p className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">Punch-In Requirements</p>
          <div className="flex items-center gap-2 text-slate-600">
            <span className={isConsentReady ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
              {isConsentReady ? '✓' : '○'}
            </span>
            <span className={isConsentReady ? 'text-slate-800 font-medium' : 'text-slate-400'}>
              Privacy & Tracking Policy Consent
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <span className={isGpsReady ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
              {isGpsReady ? '✓' : '○'}
            </span>
            <span className={isGpsReady ? 'text-slate-800 font-medium' : 'text-slate-400'}>
              Accurate GPS Location {gpsCoords?.accuracy ? `(±${Math.round(gpsCoords.accuracy)}m)` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <span className={isSelfieReady ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
              {isSelfieReady ? '✓' : '○'}
            </span>
            <span className={isSelfieReady ? 'text-slate-800 font-medium' : 'text-slate-400'}>
              Front Selfie / Verification Photo
            </span>
          </div>
        </div>

        {/* PUNCH IN BUTTON */}
        <button
          type="button"
          onClick={handlePerformPunchIn}
          disabled={!isReadyToPunchIn || busy}
          className={`w-full py-4 rounded-2xl font-bold text-sm uppercase tracking-wider shadow-lg transition-all ${
            isReadyToPunchIn && !busy
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30 active:scale-[0.98]'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
          }`}
        >
          {busy ? 'Verifying & Punching In...' : 'PUNCH IN (START SHIFT)'}
        </button>
      </div>

      {/* Today's Summary Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wide">Today's Shift Activity</h3>
          <span className="text-[11px] font-semibold text-slate-500">{fmtDate(new Date().toISOString())}</span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
            <span className="text-[10px] text-slate-500 block">Logged Hours</span>
            <strong className="text-xs font-bold text-slate-900 font-mono">
              {todayTotalDurationSec > 0 ? fmtDuration(todayTotalDurationSec) : '0h 00m'}
            </strong>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
            <span className="text-[10px] text-slate-500 block">Shifts</span>
            <strong className="text-xs font-bold text-slate-900">{todaySessions.length}</strong>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
            <span className="text-[10px] text-slate-500 block">GPS Drops</span>
            <strong className="text-xs font-bold text-slate-900">{todayInterruptions}</strong>
          </div>
        </div>
      </div>

      {/* Today's Work Notes Card (Replaces plain blue banner) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-xs text-slate-900">Today's Field Notes & Shift Log</h3>
          {notesSaved && (
            <span className="text-[11px] text-emerald-600 font-bold animate-fadeIn">✓ Notes saved</span>
          )}
        </div>
        <textarea
          rows={3}
          value={todayNotes}
          onChange={(e) => setTodayNotes(e.target.value)}
          placeholder="Record notes about today's client meetings, field visits, or tasks..."
          className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 resize-none"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSaveNotes}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors"
          >
            Save Notes
          </button>
        </div>
      </div>

      {/* Recent Sessions List */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 space-y-2.5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wide">Recent Attendance Shifts</h3>
          <button
            type="button"
            onClick={onNavigateToHistory}
            className="text-[11px] font-bold text-blue-600 hover:underline"
          >
            View All History →
          </button>
        </div>

        {history.length === 0 ? (
          <p className="text-xs text-slate-400 py-3 text-center">No previous sessions recorded.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {history.slice(0, 3).map((s) => (
              <div key={s.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <p className="font-semibold text-slate-800">{fmtDate(s.punch_in_at)}</p>
                  <p className="text-[10px] text-slate-500">
                    {fmtTime(s.punch_in_at)} — {s.punch_out_at ? fmtTime(s.punch_out_at) : 'Active'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 font-mono">
                    {s.duration_seconds ? fmtDuration(s.duration_seconds) : 'In Progress'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
