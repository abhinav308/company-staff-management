import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import type { TrackingStatus } from '../types';

interface QueuedPoint {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  client_ts: string;
}

const QUEUE_KEY = 'fap_offline_pts';

function getQueue(): QueuedPoint[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(q: QueuedPoint[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-100)));
  } catch {
    // Storage quota or private browsing
  }
}

function clearQueue() {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Browser-side tracking for an ACTIVE session.
 * Features:
 * - Dynamic interval synchronization with backend /tracking/config/
 * - Offline queueing of points in localStorage during network drops
 * - Automatic batch flushing to /api/locations/batch/ when connection resumes
 * - Permission loss detection via Permissions API
 * - Proper audit event logging for interruptions & resumptions
 */
export function useTracking(active: boolean) {
  const [status, setStatus] = useState<TrackingStatus>('ACTIVE');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const intervalMs = useRef(30000);
  const lastSent = useRef(0);
  const down = useRef(false);

  useEffect(() => {
    if (!active) {
      clearQueue();
      return;
    }
    if (!('geolocation' in navigator)) return;

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

    const flushQueue = async () => {
      const queue = getQueue();
      if (queue.length === 0) return;
      try {
        const res = await api.post('/locations/batch/', { points: queue });
        if (res.status === 200 || res.status === 201) {
          clearQueue();
          setStatus('ACTIVE');
          setLastUpdate(new Date());
        }
      } catch {
        // Leave in queue for next sync opportunity
      }
    };

    (async () => {
      try {
        const { data } = await api.get('/tracking/config/');
        intervalMs.current = data.interval_seconds * 1000;
      } catch { /* keep default */ }
      if (cancelled) return;

      // Attempt flushing any offline points from previous connectivity drops
      flushQueue().catch(() => undefined);

      watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const now = Date.now();
          // Throttle to the configured interval, but send immediately when recovering from an interruption.
          if (!down.current && now - lastSent.current < intervalMs.current) return;
          lastSent.current = now;

          const point: QueuedPoint = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? null,
            client_ts: new Date().toISOString(),
          };

          if (!navigator.onLine) {
            const q = getQueue();
            q.push(point);
            saveQueue(q);
            setStatus('OFFLINE');
            return;
          }

          try {
            await api.post('/locations/', {
              latitude: point.latitude,
              longitude: point.longitude,
              accuracy: point.accuracy,
            });
            down.current = false;
            setStatus('ACTIVE');
            setLastUpdate(new Date());

            // Flush backlog if any accumulated during brief disconnection
            flushQueue().catch(() => undefined);
          } catch {
            const q = getQueue();
            q.push(point);
            saveQueue(q);
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
    const goOnline = () => {
      setStatus('ACTIVE');
      flushQueue().catch(() => undefined);
    };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    return () => {
      cancelled = true;
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      if (permission) permission.onchange = null;
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [active]);

  return { status, lastUpdate };
}
