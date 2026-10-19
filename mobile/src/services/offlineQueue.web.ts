import api from './api';

export interface StoredLocationRow {
  id: number;
  session_id: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  client_ts: string;
  created_at: string;
}

const STORAGE_KEY = 'ncode_offline_locations_web';

function getStoredRows(): StoredLocationRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRows(rows: StoredLocationRow[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {}
}

let webIdCounter = Date.now();

export async function enqueueLocation(
  sessionId: number,
  point: { latitude: number; longitude: number; accuracy?: number | null; client_ts?: string }
): Promise<void> {
  const ts = point.client_ts || new Date().toISOString();
  const rows = getStoredRows();
  rows.push({
    id: webIdCounter++,
    session_id: sessionId,
    latitude: point.latitude,
    longitude: point.longitude,
    accuracy: point.accuracy ?? null,
    client_ts: ts,
    created_at: new Date().toISOString(),
  });
  saveRows(rows);
}

export async function getQueuedLocations(sessionId?: number): Promise<StoredLocationRow[]> {
  const rows = getStoredRows();
  if (sessionId) {
    return rows.filter(r => r.session_id === sessionId).sort((a, b) => a.client_ts.localeCompare(b.client_ts));
  }
  return rows.sort((a, b) => a.client_ts.localeCompare(b.client_ts));
}

export async function deleteQueuedLocations(ids: number[]): Promise<void> {
  const idSet = new Set(ids);
  const rows = getStoredRows().filter(r => !idSet.has(r.id));
  saveRows(rows);
}

export async function getQueueCount(sessionId?: number): Promise<number> {
  const rows = await getQueuedLocations(sessionId);
  return rows.length;
}

export async function clearAllQueue(): Promise<void> {
  saveRows([]);
}

export async function flushOfflineQueue(sessionId: number): Promise<{ flushed: number; remaining: number }> {
  const queued = await getQueuedLocations(sessionId);
  if (queued.length === 0) {
    return { flushed: 0, remaining: 0 };
  }

  const CHUNK_SIZE = 100;
  let totalFlushed = 0;

  for (let i = 0; i < queued.length; i += CHUNK_SIZE) {
    const chunk = queued.slice(i, i + CHUNK_SIZE);
    const payload = {
      points: chunk.map(pt => ({
        latitude: pt.latitude,
        longitude: pt.longitude,
        accuracy: pt.accuracy,
        client_ts: pt.client_ts,
      })),
    };

    try {
      const response = await api.post<{ accepted: number; rejected: number }>('/locations/batch/', payload);
      if (response.status === 200 || response.status === 201) {
        const chunkIds = chunk.map(c => c.id);
        await deleteQueuedLocations(chunkIds);
        totalFlushed += chunk.length;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  const remaining = await getQueueCount(sessionId);
  return { flushed: totalFlushed, remaining };
}
