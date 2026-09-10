# Free-plan recovery and verified offsite backups

Supabase Management API confirms JBY Yachts organization ztzvkedxazohwpitxvfd
is Free, with no selected paid add-ons. The project retains its 16 GB provisioned
disk; billing downgrade does not establish a disk resize. Database 20.6 MB.
GrayYachts.media jbehcjnmyprcedjgxfpk is INACTIVE; its deployment was untouched.

After the downgrade, app endpoints timed out even while project-level status
said ACTIVE_HEALTHY. One restart was requested in the preceding turn. During
this continuation, Auth, REST, database, and Storage service health all recovered.
No further restart or subscription upgrade was performed. Recovery followed the
restart; no evidence establishes the exact underlying Supabase service failure.

Live authenticated owner login/session validation, dashboard/jobs/calendar HTTP200,
job create/edit, PDI save, and photo upload/attachment/exact readback all passed.
Temporary business records and file removed, diagnostic sessions revoked.
A physical phone UI test was not performed.

## Alert correction

The Free transition changed min_wal_size from 1 GiB to 128 MiB while max_wal_size
remained 1 GiB. The old threshold used twice the recycling minimum and incorrectly
flagged about 1 GiB of retained WAL. Migration 059 adds max_wal_bytes to the protected
aggregate RPC; the monitor uses twice the larger configured allowance, with a
256 MiB floor and 1 GiB fallback maximum. Low filesystem space and archival failure
checks remain active. No WAL files, replication slots, or business data deleted.

Regression reproduced the false alarm before the change. All 15 monitor tests pass.
Reference: https://www.postgresql.org/docs/17/wal-configuration.html
Worker version f68007ab-b5c0-4f78-b187-3b6a1b8c6d27 includes offsite enforcement.

## Offsite backups now active

R2 account access now works. Created private bucket marine-tech-private-backups,
location hint wnam. r2.dev public access disabled; custom domain inventory empty.
Lifecycle nightly-30-days expires marine-tech/ objects after 30 days. Standard
incomplete multipart cleanup remains enabled. Bucket has no public Worker binding.

Machine-local backup config now sets r2_bucket. Actual LaunchAgent run exported
the database and 15 Storage objects, uploaded archive, downloaded it again and
verified matching SHA256. Object: marine-tech-private-backups/marine-tech/2026-09-10T045108Z.tar.gz.
Latest completed_at: 2026-09-10T04:51:56.901108+00:00; launchctl last exit 0.
Protected monitor heartbeat confirms ok=true, offsiteUploaded=true.
REQUIRE_OFFSITE_BACKUP=true is deployed; failed, missing/stale and local-only
backups now raise alerts. Nightly 04:15 local still requires this Mac online;
7 completed local copies and 30-day R2 retention. No full database restore claimed.

Disk I/O spiked during service recovery and verification and was still elevated
at 04:52UTC. Sustained post-recovery sampling remains required before declaring
normal operation. The monitor measures sampled OS rates, not daily credit balance.


## Final live verification

At 2026-09-10T04:56:22.794Z the automatic monitor reported issues=[],
139.44 sampled IOPS and3,121,218 bytes/s over118.882 seconds, below both warning
thresholds. alerted=false and emailError=null indicate recovery notification
accepted. Backup heartbeat is fresh, ok=true, offsiteUploaded=true.
System memory sample showed229 MB available of426 MB visible RAM; CLI reported
zero custom PostgreSQL overrides. No speculative memory tuning applied.
A separate45-second metrics interval had unchanged counters; it is not used as
proof of zero I/O because the metrics exporter may cache samples.

The app is recovered on Free and all scoped live workflow checks passed.
This does not guarantee future I/O availability under every workload; monitoring
and verified nightly offsite backups remain active.
