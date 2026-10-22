import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
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

let dbInstance: SQLite.SQLiteDatabase | null = null;
const memoryQueue: StoredLocationRow[] = [];
let memoryIdCounter = 1;

async function getDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (Platform.OS === 'web' || typeof window === 'undefined' || !SQLite.openDatabaseAsync) {
    return null;
  }
  if (!dbInstance) {
    try {
      dbInstance = await SQLite.openDatabaseAsync('attendance_offline.db');
      await dbInstance.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS offline_locations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          accuracy REAL,
          client_ts TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_offline_loc_session ON offline_locations(session_id);
      `);
    } catch (e) {
      console.warn('SQLite initialization failed, using memory queue fallback:', e);
      return null;
    }
  }
  return dbInstance;
}

export async function enqueueLocation(
  sessionId: number,
  point: { latitude: number; longitude: number; accuracy?: number | null; client_ts?: string }
): Promise<void> {
  const ts = point.client_ts || new Date().toISOString();
  const db = await getDb();

  if (db) {
    try {
      await db.runAsync(
        `INSERT INTO offline_locations (session_id, latitude, longitude, accuracy, client_ts, created_at)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [sessionId, point.latitude, point.longitude, point.accuracy ?? null, ts, new Date().toISOString()]
      );
      return;
    } catch (e) {
      console.error('Failed to insert location into SQLite:', e);
    }
  }

  // Memory fallback
  memoryQueue.push({
    id: memoryIdCounter++,
    session_id: sessionId,
    latitude: point.latitude,
    longitude: point.longitude,
    accuracy: point.accuracy ?? null,
    client_ts: ts,
    created_at: new Date().toISOString(),
  });
}

export async function getQueuedLocations(sessionId?: number): Promise<StoredLocationRow[]> {
  const db = await getDb();
  if (db) {
    try {
      if (sessionId) {
        return await db.getAllAsync<StoredLocationRow>(
          `SELECT * FROM offline_locations WHERE session_id = ? ORDER BY client_ts ASC;`,
          [sessionId]
        );
      }
      return await db.getAllAsync<StoredLocationRow>(
        `SELECT * FROM offline_locations ORDER BY client_ts ASC;`
      );
    } catch (e) {
      console.error('Failed to query SQLite offline locations:', e);
    }
  }

  if (sessionId) {
    return memoryQueue.filter(r => r.session_id === sessionId).sort((a, b) => a.client_ts.localeCompare(b.client_ts));
  }
  return [...memoryQueue].sort((a, b) => a.client_ts.localeCompare(b.client_ts));
}

export async function deleteQueuedLocations(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  if (db) {
    try {
      const placeholders = ids.map(() => '?').join(',');
      await db.runAsync(`DELETE FROM offline_locations WHERE id IN (${placeholders});`, ids);
      return;
    } catch (e) {
      console.error('Failed to delete SQLite locations:', e);
    }
  }

  const idSet = new Set(ids);
  for (let i = memoryQueue.length - 1; i >= 0; i--) {
    if (idSet.has(memoryQueue[i].id)) {
      memoryQueue.splice(i, 1);
    }
  }
}

export async function getQueueCount(sessionId?: number): Promise<number> {
  const rows = await getQueuedLocations(sessionId);
  return rows.length;
}

export async function clearAllQueue(): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await db.runAsync('DELETE FROM offline_locations;');
    } catch (e) {
      console.error('Failed to clear SQLite offline queue:', e);
    }
  }
  memoryQueue.length = 0;
}

/**
 * Flushes stored offline location points to the backend /locations/batch/ endpoint.
 * Returns the count of points successfully flushed.
 */
export async function flushOfflineQueue(sessionId: number): Promise<{ flushed: number; remaining: number }> {
  const queued = await getQueuedLocations(sessionId);
  if (queued.length === 0) {
    return { flushed: 0, remaining: 0 };
  }

  // Batch in chunks of up to 100 points
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
    } catch (err) {
      console.warn('Offline queue flush attempt failed (will retry on next sync):', err);
      break;
    }
  }

  const remaining = await getQueueCount(sessionId);
  return { flushed: totalFlushed, remaining };
}
