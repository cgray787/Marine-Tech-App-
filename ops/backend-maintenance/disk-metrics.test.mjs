import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDiskMetrics, diskRates } from '../../supabase/functions/backend-health-probe/disk-metrics.mjs';
import { assess } from './checks.mjs';
const sample = (n = 100) => `
node_disk_reads_completed_total{device="nvme1n1"} ${n}
node_disk_writes_completed_total{device="nvme1n1"} ${n}
node_disk_read_bytes_total{device="nvme1n1"} ${n * 1000}
node_disk_written_bytes_total{device="nvme1n1"} ${n * 1000}
node_filesystem_avail_bytes{device="/dev/nvme1n1",mountpoint="/data",device_error=""} 9e8
node_filesystem_size_bytes{device="/dev/nvme1n1",mountpoint="/data",device_error=""} 1e9
private_metric{credential="must not appear"} 1
`;
test('extracts only aggregate disk metrics and rejects missing or invalid capacity', () => {
  const data = parseDiskMetrics(sample());
  assert.equal(data.availableBytes, 900000000);
  assert.equal(data.disks.length, 1);
  assert.ok(!JSON.stringify(data).includes('credential'));
  assert.throws(() => parseDiskMetrics(''));
  assert.throws(() => parseDiskMetrics(sample().replace('9e8', 'NaN')));
});
test('computes interval I/O and skips restarts, stale samples and changed devices', () => {
  const a = parseDiskMetrics(sample(100), '2026-09-09T00:00:00Z');
  const b = parseDiskMetrics(sample(220), '2026-09-09T00:02:00Z');
  assert.equal(diskRates(b, a).operationsPerSecond, 2);
  assert.equal(diskRates(b, a).bytesPerSecond, 2000);
  assert.equal(diskRates(a, null), null);
  assert.equal(diskRates(b, b), null);
  assert.equal(diskRates({ ...a, observedAt: '2026-09-09T00:04:00Z' }, b), null);
  assert.equal(diskRates({ ...b, observedAt: '2026-09-09T01:00:00Z' }, a), null);
  assert.equal(diskRates({ ...b, disks: [] }, a), null);
});
test('warns on low filesystem space and I/O near Free baselines', () => {
  const a = parseDiskMetrics(sample(100), '2026-09-09T00:00:00Z');
  const b = parseDiskMetrics(sample(300100), '2026-09-09T00:02:00Z');
  b.availableBytes = 100000000;
  const issues = assess({ database: { ok: true, data: { database_bytes: 20000000,
    wal_bytes: 80000000, min_wal_bytes: 80000000, resources: b } } }, { resources: a });
  assert.equal(issues.length, 3);
  assert.ok(issues.some(i => i.includes('filesystem')));
  assert.ok(issues.some(i => i.includes('operations')));
  assert.ok(issues.some(i => i.includes('throughput')));
});
