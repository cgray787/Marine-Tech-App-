import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { syncAll } from '../../mobile/lib/sync-service';
const mocks = vi.hoisted(() => ({ pending: [] as any[], markFailed: vi.fn(), markSynced: vi.fn(), insert: vi.fn(), upload: vi.fn() }));
vi.mock('../../mobile/lib/offline-db', () => ({
  getPendingSync: async () => mocks.pending, getPendingSyncCount: async () => mocks.pending.length,
  markFailed: mocks.markFailed, markSynced: mocks.markSynced, clearSyncedItems: vi.fn(), saveIdMapping: vi.fn(), getAllIdMappings: async () => new Map(),
}));
vi.mock('../../mobile/lib/supabase', () => ({ supabase: {
  from: () => ({ insert: mocks.insert }),
  storage: { from: () => ({ upload: mocks.upload, getPublicUrl: () => ({ data: { publicUrl: 'https://photos.example/photo.jpg' } }) }) },
} }));
function item(table: string, payload: object | string, id = 1) { return { id, table_name: table, record_id: 'offline_1', payload: typeof payload === 'string' ? payload : JSON.stringify(payload) }; }
beforeEach(() => {
  mocks.pending = []; mocks.markFailed.mockReset(); mocks.markSynced.mockReset(); mocks.insert.mockReset().mockResolvedValue({ error: null }); mocks.upload.mockReset().mockResolvedValue({ error: null });
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
  mocks.pending = [item('jobs', schedule)]; mocks.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: 'job-1' }, error: null }) }) });
  await syncAll(); expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining(schedule));
});
it('coalesces concurrent sync requests into a single replay', async () => {
  mocks.pending = [item('checklist_items', { report_id: 'report-1' })];
  const a = syncAll(); const b = syncAll(); expect(a).toBe(b); await Promise.all([a,b]); expect(mocks.insert).toHaveBeenCalledOnce();
});
