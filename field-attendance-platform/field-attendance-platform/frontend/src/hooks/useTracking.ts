import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import type { TrackingStatus } from '../types';

/**
 * Browser-side tracking for an ACTIVE session. Only reports what the browser can actually detect;
 * it does not (and cannot) work around permission or OS restrictions.
 */
export function useTracking(active: boolean) {
  const [status, setStatus] = useState<TrackingStatus>('ACTIVE');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const intervalMs = useRef(30000);
  const lastSent = useRef(0);
  const down = useRef(false);

  useEffect(() => {
    if (!active || !('geolocation' in navigator)) return;
    let cancelled = false;
    let watchId: number | undefined;
    let permission: PermissionStatus | undefined;
    lastSent.current = 0;
    down.current = false;

    const report = (event_type: string, metadata: Record<string, unknown> = {}) =>
      api.post('/tracking/events/', { event_type, metadata }).catch(() => undefined);

    const markDown = (denied: boolean, metadata: Record<string, unknown>) => {
      setStatus(denied ? 'PERMISSION_DENIED' : 'LOCATION_UNAVAILABLE');
      if (!down.current) {
        down.current = true;
        report(denied ? 'LOCATION_PERMISSION_DENIED' : 'LOCATION_UNAVAILABLE', metadata);
      }
    };

    (async () => {
      try {
        const { data } = await api.get('/tracking/config/');
        intervalMs.current = data.interval_seconds * 1000;
      } catch { /* keep default */ }
      if (cancelled) return;

      watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const now = Date.now();
          // Throttle to the configured interval, but send immediately when recovering from an interruption.
          if (!down.current && now - lastSent.current < intervalMs.current) return;
          lastSent.current = now;
          try {
            await api.post('/locations/', {
              latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy,
            });
            down.current = false;
            setStatus('ACTIVE');
            setLastUpdate(new Date());
          } catch {
            setStatus('OFFLINE');
          }
        },
        (err) => markDown(err.code === err.PERMISSION_DENIED, { code: err.code, message: err.message }),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
      );

      // Detect permission being revoked while the page is open.
      navigator.permissions?.query({ name: 'geolocation' }).then((p) => {
        permission = p;
        p.onchange = () => { if (p.state === 'denied') markDown(true, { source: 'permissions-api' }); };
      }).catch(() => undefined);
    })();

    const goOffline = () => setStatus('OFFLINE');
    window.addEventListener('offline', goOffline);

    return () => {
      cancelled = true;
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      if (permission) permission.onchange = null;
      window.removeEventListener('offline', goOffline);
    };
  }, [active]);

  return { status, lastUpdate };
}
