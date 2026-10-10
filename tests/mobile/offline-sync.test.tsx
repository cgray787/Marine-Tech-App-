import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { syncAll, replayId } from '../../mobile/lib/sync-service';
const mocks = vi.hoisted(() => ({ pending: [] as any[], markFailed: vi.fn(), markSynced: vi.fn(), insert: vi.fn(), upsert: vi.fn(), upload: vi.fn() }));
vi.mock('../../mobile/lib/offline-db', () => ({
  getPendingSync: async () => mocks.pending, getPendingSyncCount: async () => mocks.pending.length,
  markFailed: mocks.markFailed, markSynced: mocks.markSynced, clearSyncedItems: vi.fn(), saveIdMapping: vi.fn(), getAllIdMappings: async () => new Map(),
}));
vi.mock('../../mobile/lib/supabase', () => ({ supabase: {
  from: () => ({ insert: mocks.insert, upsert: mocks.upsert }),
  storage: { from: () => ({ upload: mocks.upload, getPublicUrl: () => ({ data: { publicUrl: 'https://photos.example/photo.jpg' } }) }) },
} }));
function item(table: string, payload: object | string, id = 1) { return { id, table_name: table, record_id: 'offline_1', payload: typeof payload === 'string' ? payload : JSON.stringify(payload) }; }
beforeEach(() => {
  mocks.pending = []; mocks.markFailed.mockReset(); mocks.markSynced.mockReset(); mocks.insert.mockReset().mockResolvedValue({ error: null }); mocks.upsert.mockReset().mockResolvedValue({ error: null }); mocks.upload.mockReset().mockResolvedValue({ error: null });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(1) }));
  vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('marks a malformed queue entry failed and continues with later entries', async () => {
  mocks.pending = [item('jobs', '{bad json'), item('checklist_items', { report_id: 'report-1' }, 2)];
  expect(await syncAll()).toMatchObject({ synced: 1, failed: 1 });
  expect(mocks.markFailed).toHaveBeenCalledWith(1, expect.any(String)); expect(mocks.markSynced).toHaveBeenCalledWith(2);
});
it('links an offline PDI photo to the PDI foreign key', async () => {
  mocks.pending = [item('report_photos', { _offline_report_id: 'pdi-1', bucket: 'pdi-photos', local_uri: 'file://photo.jpg' })];
  await syncAll(); expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ pdi_report_id: 'pdi-1' }));
  expect(mocks.insert.mock.calls[0][0]).not.toHaveProperty('report_id');
});
it('retains a parts entry if its photo upload fails', async () => {
  mocks.pending = [item('parts', { service_report_id: 'report-1', photoUri: 'file://part.jpg' })]; mocks.upload.mockResolvedValue({ error: { message: 'offline' } });
  expect(await syncAll()).toMatchObject({ synced: 0, failed: 1 }); expect(mocks.insert).not.toHaveBeenCalled();
});
it('preserves scheduling fields from an offline service job', async () => {
  const schedule = { scheduled_start: '2026-09-22T16:00:00Z', scheduled_end: '2026-09-24T00:00:00Z', scheduled_date: '2026-09-22', scheduled_end_date: '2026-09-23', service_descriptions: { Oil: 'Change filters' } };
  mocks.pending = [item('jobs', schedule)];
  await syncAll(); expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining(schedule), { onConflict: 'id', ignoreDuplicates: true });
});
// A server commit whose response is lost marks the item failed and retries it.
// Before this, each retry INSERTed a new row with a new server id — duplicate
// jobs and reports. Every replay of one queued record must carry the same id.
it('replays a retried job and report with the SAME id, so a retry cannot duplicate', async () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  for (const table of ['jobs', 'service_reports', 'pdi_reports']) {
    mocks.upsert.mockReset().mockResolvedValueOnce({ error: { message: 'network lost after commit' } }).mockResolvedValue({ error: null });
    mocks.pending = [item(table, { job_id: 'job-real' })];
    expect(await syncAll()).toMatchObject({ failed: 1 });   // first attempt "fails"
    expect(await syncAll()).toMatchObject({ synced: 1 });   // queue retries it
    const [first, second] = mocks.upsert.mock.calls.map((c) => c[0].id);
    expect(first).toMatch(UUID);
    expect(second).toBe(first);
    expect(mocks.upsert.mock.calls[1][1]).toEqual({ onConflict: 'id', ignoreDuplicates: true });
  }
});
it('gives different queued records different ids, and is deterministic', () => {
  expect(replayId('jobs', 'offline_a')).toBe(replayId('jobs', 'offline_a'));
  expect(replayId('jobs', 'offline_a')).not.toBe(replayId('jobs', 'offline_b'));
  expect(replayId('jobs', 'offline_a')).not.toBe(replayId('service_reports', 'offline_a'));
});
it('coalesces concurrent sync requests into a single replay', async () => {
  mocks.pending = [item('checklist_items', { report_id: 'report-1' })];
  const a = syncAll(); const b = syncAll(); expect(a).toBe(b); await Promise.all([a,b]); expect(mocks.insert).toHaveBeenCalledOnce();
});
