# Backup timeout recovery, October 13, 2026

Historical incident record. The Mac scheduler described here was subsequently
disabled after the verified [Hostinger VPS cutover](2026-10-13-vps-backups.md).
Use that handoff for current production operations.

## Observed incident

The alert screenshot says `The latest nightly backup failed` at
`2026-10-13T16:45:14.087Z`. The protected monitor at 17:30 UTC reported that as
its only issue, with a failed backup heartbeat from 11:27:25 UTC. The backend
was not reporting an Auth, REST, database or dashboard outage.

The installed runner matched the repository version. Its log recorded
`TimeoutError` on October 13 and `TimeoutExpired` on October 11. The October 13
partial snapshot contains a 651,196-byte database archive, its decoded manifest,
bucket/Vault exports, and 12 Storage objects. The last successful backup's
manifest contains 15 objects. This local evidence places the October 13 failure
in the Storage-download phase. The exact timed-out request was not logged by
the original runner.

The Mac power log identifies a sleep interruption in the same run: dark wake
at 01:17:07 HST, backup start at 01:17:08, and maintenance sleep at 01:17:52.
It slept again at 01:23:24, then woke at 01:27:12 shortly before the failure
heartbeat at 01:27:25. The laptop was on AC. This establishes that the backup
was allowed to sleep mid-transfer; the previous launch command held no sleep
assertion. Exact low-level network failure details were not preserved.

The original request helper made one attempt, and the LaunchAgent ran only
nightly. One timeout therefore left the failed heartbeat in place until another
run succeeded. `nextState()` repeats unresolved alerts hourly. Those repeated
emails described the same failed backup, not fresh app outages each hour.

## Changes

- Three attempts for network timeouts/connection errors and HTTP
  408/429/500/502/503/504, with 5- and 10-second delays. Permanent HTTP errors
  fail immediately. Complete response reads are retried, including a dropped
  connection during a download.
- Database/R2 subprocesses retry timeouts and recognized connection errors;
  authentication failures do not receive an immediate retry.
- Safe stage/error-type logging and a private `last-failure.json` provide
  diagnostics without leaking credentials, command arguments or object URLs.
- The success record is replaced atomically after the verified archive,
  private offsite upload/download checksum and successful monitor heartbeat.
- The existing 04:15 local nightly LaunchAgent also checks hourly using
  `--scheduled`. It skips a nightly window that already has a verified success,
  and retries failed/missing backups. A process lock prevents concurrent runs.
- The LaunchAgent invokes `/usr/bin/caffeinate -is` around the Python utility.
  This holds idle-sleep prevention for its lifetime and system-sleep prevention
  on AC, addressing the observed maintenance-sleep interruption. Display sleep
  remains allowed. Assertions are released automatically when the job exits.
- Existing monitoring thresholds, hourly unresolved alerts, private R2 access,
  seven local copies and 30-day offsite retention remain in place.

This remains a Mac LaunchAgent. It requires the Mac to be awake and online;
there was no migration to an always-on server or subscription change.

## Verification

Two injected reproductions (timeout before response and connection reset during
read) failed on the old request helper. Eight focused tests pass after the fix,
covering recovery, bounded failure, permanent errors, database export retries,
and scheduled deduplication including a newer failure after an earlier success.
Python compilation and `git diff --check` pass.

Runtime copy installed at `~/.local/share/marine-tech-backups/backup.py`.
The reloaded LaunchAgent showed `--scheduled`, `run interval = 3600 seconds`,
and the existing 04:15 calendar trigger. A real launchd run started at
17:36:29 UTC and verified its database archive at 17:37:03 UTC.

The live run completed at **2026-10-13T17:37:43.149839Z**, with a 655,050-byte
database archive, complete decode verification, and all **15 Storage objects**
(30,268,046 bytes). Private R2 upload and downloaded SHA-256 matched. A separate
local read confirmed the archive checksum in `latest-status.json`. The next
scheduled-mode invocation exited 0 and logged
`current-nightly-window-already-verified`, without creating a duplicate backup.

At **17:40:15.503 UTC**, the automatic monitor reported `issues: []`,
`consecutiveFailures: 0`, `backup.ok: true`, `offsiteUploaded: true`, and no
email error. No manual parts-processing check or customer email was triggered.
The existing monitor generated its normal recovery notification.

The final LaunchAgent configuration includes caffeinate, `--scheduled`, the
04:15 trigger and 3600-second recovery interval. A full database restore and
an overnight sleep-cycle test were not performed. The machine must still be
powered on and have working connectivity; this is not an always-on server.

## Rollback and sources

Before-change runner and LaunchAgent plist are saved under the canonical
workspace `Backups/Marine Tech/2026-10-13-backup-recovery/`. Restore both and
reload `com.grayyachts.marine-tech-backup` to roll back. Account credentials
remain in existing machine-local stores.

Evidence: `~/Library/Logs/MarineTechBackup/backup.log`, `pmset -g log`, the local
`caffeinate(8)` manual, protected worker `/status`, launchctl state, local snapshot
inventories and `latest-status.json`.
Implementation: `ops/backups/backup.py`; tests: `ops/backups/test_backup.py`.
Exception classification follows the
[Python urllib exception hierarchy](https://docs.python.org/3.14/library/urllib.error.html).
