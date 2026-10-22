import {
  enqueueLocation,
  getQueuedLocations,
  deleteQueuedLocations,
  clearAllQueue,
  getQueueCount,
} from '../src/services/offlineQueue';

describe('Offline Queue via SQLite/Memory Fallback', () => {
  beforeEach(async () => {
    await clearAllQueue();
  });

  it('enqueues location points with client timestamps and retrieves them in order', async () => {
    const ts1 = '2026-10-19T10:00:00Z';
    const ts2 = '2026-10-19T10:01:00Z';

    await enqueueLocation(101, {
      latitude: 23.0225,
      longitude: 72.5714,
      accuracy: 5.5,
      client_ts: ts1,
    });

    await enqueueLocation(101, {
      latitude: 23.0235,
      longitude: 72.5724,
      accuracy: 4.8,
      client_ts: ts2,
    });

    const rows = await getQueuedLocations(101);
    expect(rows).toHaveLength(2);
    expect(rows[0].latitude).toBe(23.0225);
    expect(rows[0].client_ts).toBe(ts1);
    expect(rows[1].latitude).toBe(23.0235);
    expect(rows[1].client_ts).toBe(ts2);
  });

  it('filters queued points by session id', async () => {
    await enqueueLocation(101, { latitude: 23.1, longitude: 72.1, accuracy: 5 });
    await enqueueLocation(102, { latitude: 23.2, longitude: 72.2, accuracy: 5 });

    const session101 = await getQueuedLocations(101);
    expect(session101).toHaveLength(1);
    expect(session101[0].session_id).toBe(101);

    const session102 = await getQueuedLocations(102);
    expect(session102).toHaveLength(1);
    expect(session102[0].session_id).toBe(102);
  });

  it('deletes processed batch points from queue', async () => {
    await enqueueLocation(101, { latitude: 23.1, longitude: 72.1, accuracy: 5 });
    await enqueueLocation(101, { latitude: 23.2, longitude: 72.2, accuracy: 5 });

    const rows = await getQueuedLocations(101);
    expect(rows).toHaveLength(2);

    await deleteQueuedLocations([rows[0].id]);

    const remaining = await getQueuedLocations(101);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(rows[1].id);
  });

  it('accurately counts queued items', async () => {
    expect(await getQueueCount(101)).toBe(0);
    await enqueueLocation(101, { latitude: 23.1, longitude: 72.1 });
    expect(await getQueueCount(101)).toBe(1);
  });
});
