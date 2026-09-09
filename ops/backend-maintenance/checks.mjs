const GiB = 1024 ** 3;

export function assess(probes) {
  const issues = [];
  for (const [name, probe] of Object.entries(probes)) {
    if (!probe.ok) issues.push(`${name}: ${probe.error || `HTTP ${probe.status}`}`);
  }
  const metrics = probes.database?.data;
  if (probes.database?.ok) {
    if (!metrics || !Number.isFinite(Number(metrics.wal_bytes)) || !Number.isFinite(Number(metrics.database_bytes))) {
      issues.push("Database probe returned invalid capacity metrics");
    } else {
      if (metrics.read_only) issues.push("Database is in read-only mode");
      const minimumWal = Number(metrics.min_wal_bytes);
      const walWarning = Math.max(256 * 1024 ** 2, 2 * (Number.isFinite(minimumWal) && minimumWal > 0 ? minimumWal : GiB));
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
