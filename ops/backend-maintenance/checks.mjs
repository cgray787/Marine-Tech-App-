import { diskRates } from "../../supabase/functions/backend-health-probe/disk-metrics.mjs";

const GiB = 1024 ** 3;

export function assess(probes, previousMetrics = null) {
  const issues = [];
  for (const [name, probe] of Object.entries(probes)) {
    if (!probe.ok) issues.push(`${name}: ${probe.error || `HTTP ${probe.status}`}`);
  }
  const metrics = probes.database?.data;
  if (probes.database?.ok) {
    if (!metrics || !Number.isFinite(Number(metrics.wal_bytes)) || !Number.isFinite(Number(metrics.database_bytes))) {
      issues.push("Database probe returned invalid capacity metrics");
    } else {
      if (!metrics.resources || metrics.resource_error) {
        issues.push("Disk resource monitoring unavailable");
      } else {
        const resources = metrics.resources;
        if (resources.availableBytes / resources.sizeBytes <= 0.2) {
          issues.push("Database filesystem has less than 20% free space");
        }
        const rates = diskRates(resources, previousMetrics?.resources);
        // 80% of documented Nano baselines: 250 IOPS, 5 MB/s.
        // These sampled OS rates are not Supabase's daily credit balance.
        if (rates?.operationsPerSecond >= 200) issues.push("Disk operations approaching the Free plan sustained I/O limit");
        if (rates?.bytesPerSecond >= 4_000_000) issues.push("Disk throughput approaching the Free plan sustained I/O limit");
      }
      if (metrics.read_only) issues.push("Database is in read-only mode");
      const minimumWal = Number(metrics.min_wal_bytes);
      const maximumWal = Number(metrics.max_wal_bytes);
      // min_wal_size is a recycling floor, not a healthy-usage ceiling.
      // Allow the configured soft maximum plus checkpoint/recovery headroom.
      const walAllowance = Math.max(
        Number.isFinite(minimumWal) && minimumWal > 0 ? minimumWal : 0,
        Number.isFinite(maximumWal) && maximumWal > 0 ? maximumWal : GiB,
      );
      const walWarning = Math.max(256 * 1024 ** 2, 2 * walAllowance);
      if (Number(metrics.wal_bytes) >= walWarning) {
        issues.push(`Transaction logs have grown to ${(Number(metrics.wal_bytes) / GiB).toFixed(1)} GiB`);
      }
      if (Number(metrics.database_bytes) >= 400 * 1024 ** 2) {
        issues.push("Database is approaching the Free plan 500 MB database limit");
      }
      const failure = Date.parse(metrics.last_archive_failure_at);
      const success = Date.parse(metrics.last_archived_at);
      if (Number.isFinite(failure) && (!Number.isFinite(success) || failure > success)) {
        issues.push("The latest transaction-log archival attempt failed");
      }
    }
  }
  return issues;
}

export function nextState(previous, issues, now) {
  const failed = issues.length > 0;
  const consecutiveFailures = failed ? (previous?.consecutiveFailures || 0) + 1 : 0;
  const wasAlerted = Boolean(previous?.alerted);
  const repeatDue = now - (previous?.lastEmailAt || 0) >= 60 * 60 * 1000;
  const kind = failed && consecutiveFailures >= 2 && (!wasAlerted || repeatDue)
    ? "outage"
    : !failed && wasAlerted ? "recovery" : null;
  return {
    state: { ...previous, consecutiveFailures, checkedAt: now, issues },
    kind,
  };
}

export function backupIssues(backup, now, requireOffsite = false) {
  const checkedAt = Date.parse(backup?.checkedAt);
  if (!Number.isFinite(checkedAt)) return ["No completed backup heartbeat has been received"];
  if (!backup.ok) return ["The latest nightly backup failed"];
  if (now - checkedAt > 36 * 60 * 60 * 1000) return ["Nightly backup is more than 36 hours old; check the Mac is awake and online"];
  if (requireOffsite && !backup.offsiteUploaded) return ["The latest backup has not been verified offsite"];
  return [];
}
