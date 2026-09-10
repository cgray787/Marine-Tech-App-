// Whitelist aggregate counters; never forward raw metrics or connection labels.
export function parseDiskMetrics(text, observedAt = new Date().toISOString()) {
  const wanted = new Set(['node_disk_reads_completed_total', 'node_disk_writes_completed_total',
    'node_disk_read_bytes_total', 'node_disk_written_bytes_total',
    'node_filesystem_avail_bytes', 'node_filesystem_size_bytes', 'node_time_seconds']);
  const disks = new Map();
  let availableBytes, sizeBytes, dataDevice;
  for (const line of text.split('\n')) {
    const match = line.match(/^(\w+)\{([^}]*)\}\s+([\d.eE+-]+)(?:\s|$)/);
    if (!match || !wanted.has(match[1])) continue;
    const value = Number(match[3]);
    if (!Number.isFinite(value) || value < 0) continue;
    // Exporter time survives cached responses; request arrival time does not.
    if (match[1] === 'node_time_seconds') {
      if (value > 0 && Number.isFinite(new Date(value * 1000).getTime())) observedAt = new Date(value * 1000).toISOString();
      continue;
    }
    const labels = Object.fromEntries([...match[2].matchAll(/(\w+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    if (match[1].startsWith('node_filesystem_')) {
      if (labels.mountpoint !== '/data' || labels.device_error) continue;
      // Measure the database volume; unrelated OS root I/O is a separate metric.
      dataDevice = (labels.device || '').replace(/^\/dev\//, '')
        .replace(/^(nvme\d+n\d+)p\d+$/, '$1').replace(/^((?:[sv]d|xvd)[a-z]+)\d+$/, '$1');
      if (match[1] === 'node_filesystem_avail_bytes') availableBytes = value;
      else sizeBytes = value;
    } else {
      // Whole physical devices only, excluding partitions/loop devices.
      if (!/^(nvme\d+n\d+|[sv]d[a-z]+|xvd[a-z]+)$/.test(labels.device || '')) continue;
      const disk = disks.get(labels.device) || { device: labels.device };
      disk[match[1].replace('node_disk_', '')] = value;
      disks.set(labels.device, disk);
    }
  }
  const complete = [...disks.values()].filter(d => d.device === dataDevice && ['reads_completed_total', 'writes_completed_total',
    'read_bytes_total', 'written_bytes_total'].every(k => Number.isFinite(d[k])));
  if (!complete.length || !(sizeBytes > 0) || !Number.isFinite(availableBytes) || availableBytes > sizeBytes) {
    throw new Error('Required disk metrics missing');
  }
  return { observedAt, disks: complete, availableBytes, sizeBytes };
}

export function diskRates(current, previous) {
  if (!current || !previous) return null;
  const seconds = (Date.parse(current.observedAt) - Date.parse(previous.observedAt)) / 1000;
  if (!(seconds >= 30 && seconds <= 600)) return null;
  if (current.disks.length !== previous.disks.length) return null;
  let operations = 0, bytes = 0;
  for (const disk of current.disks) {
    const before = previous.disks.find(d => d.device === disk.device);
    if (!before) return null;
    for (const field of ['reads_completed_total', 'writes_completed_total', 'read_bytes_total', 'written_bytes_total']) {
      const delta = disk[field] - before[field];
      if (!Number.isFinite(delta) || delta < 0) return null; // Restart/reset: establish a new baseline.
      if (field.endsWith('bytes_total')) bytes += delta;
      else operations += delta;
    }
  }
  return { seconds, operationsPerSecond: operations / seconds, bytesPerSecond: bytes / seconds };
}
