# Marine Tech audit and release — September 22, 2026

## Scope and result

Reviewed mobile job editing, calendar queries, auth/session handling, offline queue replay, PDI/photo persistence, dashboard permission guards, admin account creation, QuickBooks routes, Edge Function entry-point authorization, database RLS/schema, release workflows, dependencies, monitoring, and backups. Automated lint scanned 179 application files. This is a broad audit with explicit remaining findings, not a claim that every line or device behavior is defect-free.

The earlier mobile Edit job release (`5e3baa2`, including `cf12a5b`) remains intact. Job metadata editing preserves unrelated scheduling/status/report fields. Regression coverage for that screen is included in the mobile suite.

## Corrected defects

- Authenticated technicians could change their own office assignment. A rolled-back SQL reproduction updated one profile row. Migration 060 now protects identity, role, tier, status, organization, and office fields against non-admin self-editing.
- Disabled profiles still passed `profile_can_write()`. Active-account checks now restrict business-table reads/writes, the admin helper, dashboard sessions, and QuickBooks access. Normal self-contact updates and active staff access remain available.
- PDI photos were inserted into the service-report foreign key, while the dashboard queried a nonexistent PDI foreign key. Migration 061 adds `pdi_report_id`, exclusive parent validation, scoped policies, and missing admin read policies. Online and offline mobile uploads now use it; failed uploads queue instead of silently disappearing.
- Dashboard Create Job called hooks conditionally as permission state loaded. Hooks now run consistently; the permission-transition regression passes.
- Mobile session recovery could leave loading unresolved, and a delayed profile response could restore a stale admin profile after logout. Session generation/request checks reject stale responses and release loading after storage failure.
- Corrupt offline payloads could stop the whole sync. Concurrent sync calls could replay the same queue simultaneously. Per-entry error handling and one in-flight replay address both. New offline reports retain scheduling/descriptions. Existing report edits require reconnection instead of accidentally creating a second job. Failed part photos retain the queue entry. Exhausted retries remain visible in pending counts.
- Web calendar range queries excluded jobs that began before the visible range. Web, mobile, and the GrayYachts portal now include overlapping timestamp/date spans.
- QuickBooks export used a service-role client to read work orders, bypassing office scope. It now reads/writes through the caller's scoped session, returns existing invoice links, uses a stable invoice request ID, and reports persistence failures. Refresh-token saves are checked; callback authorization precedes token exchange.
- Production Turnstile verification previously accepted the always-successful development secret when configuration was missing. Production now fails closed; upstream failures have bounded timeouts and explicit responses. The deployed production secret is configured.
- Office-user creation now checks lookup/promotion failures and removes the newly created Auth account if profile setup fails.
- Undeployed legacy invite/notification handlers now require explicit caller authorization. These legacy functions were not activated or deployed.
- Redirects preserve refreshed auth cookies. Realtime subscriptions respond to table-list changes; the office cookie uses an external-store subscription.
- Live-browser testing reproduced Jobs-page hydration failure: UTC server rendered `7 AM` while the Pacific browser rendered `12 AM`. A UTC development server reproduced the same error; browser-local schedule text now renders after hydration and that reproduction passes.
- At 390px, the desktop sidebar squeezed the web calendar to a nearly unreadable sliver. The dashboard now has a collapsible mobile menu, a full-width content area, and wrapping calendar controls. Live verification measured a 358px calendar and confirmed opening/closing navigation. The native app navigation is separate and unchanged.
- Prepared deployment test gates for both GitHub workflows. GitHub rejected workflow edits because the current OAuth login lacks `workflow` scope. The reviewable patch is saved as `proposed-deployment-test-gates.patch`; active workflows are unchanged.

## Verification

- Dashboard: **214 tests passed**, 24 test files.
- Mobile: **20 tests passed**, four test files, including existing Edit job tests and new auth/offline regressions. Uses native UI stubs; this is not a physical-device test.
- Backend maintenance: **17 tests passed**; recovered legacy monitor: **4 tests passed**.
- Root and mobile TypeScript checks passed. Next/OpenNext production builds passed. Expo exported both native bundles successfully for each supported runtime.
- Authenticated SQL checks passed before migration application (transactional dry run) and after application: self-office change denied; active tech write permission retained; disabled account denied jobs and writes; viewer cannot write; tech office isolation retained; admin can create/read a PDI and its photo. Test writes were rolled back.
- Deployed dashboard checks cover Dashboard, Calendar, Jobs, Reports, and Work Orders with an authenticated browser, plus narrow-screen calendar rendering. All five returned HTTP 200 with zero browser errors after the hydration fix. Screenshots and detailed logs are in the protected local audit backup.
- GrayYachts portal type check, guarded deployment/preflight, and deployed login/portal route checks passed. Portal source commit: `5e75187`, branch `restore/prod-plus-leads` (the current production source; its history differs from the old website main branch).
- Backend monitor at `2026-09-22T17:20:17Z`: no issues, database writable, ~21.3 MB, no archive failures. A fresh post-migration backup completed `2026-09-22T17:38:11Z`: full database decode verified, 15 storage objects, private R2 upload/download SHA-256 matched.

## Production releases

- Database migrations: `060_active_accounts_and_profile_scope`, `061_pdi_photo_links`, applied through the Supabase Management API and recorded in migration history.
- Dashboard Cloudflare version: `beffcd89-cdca-402b-a9a0-d7816b5bd499`.
- Portal Cloudflare version: `cb7b39d4-da2d-4a95-8c91-7f18bad3da41`.
- Mobile runtime **1.3.0**: update group `f95ca8a3-66fa-4ac3-93b8-81825f06c517`, production branch, iOS + Android.
- Mobile runtime **1.2.0**: update group `4f7999ea-d5f5-4814-b338-f74298543dd3`, production branch, iOS + Android. `app.json` restored to 1.3.0 after publishing.
- OTAs were published from the audited working tree before its final commit, so EAS records the base commit with a dirty marker. The saved source/lockfiles contain those changes. No new native dependency was introduced.

## Remaining findings and limits

1. **Automatic Expo publishing is blocked by an existing invalid GitHub EXPO_TOKEN.** Run `35756004257` failed at `eas whoami` with “The bearer token is invalid.” Local authenticated EAS publishing succeeded for both runtimes. A valid dedicated CI token must be configured separately; account credentials were not copied from the Mac into code or documentation.
2. **Dependency audit:** root has zero advisories after compatible fixes; mobile improved from 27 (10 high) to 20 moderate, zero high/critical. Remaining chains involve old `uuid`/`query-string`/`decode-uri-component` in Expo SDK 54 tooling/runtime dependencies. Suggested force-fixes include incompatible SDK changes/downgrades. A tested SDK/native-build upgrade is needed; no blanket `npm audit fix --force` was used. Metro 0.83.x and PostCSS have explicit patched overrides.
3. **Lint is not clean:** 23 errors and 53 warnings remain across 179 production files, mostly existing effect-driven form state synchronization, React compiler memoization diagnostics, explicit query `any`, and native text entities. Conditional hooks and the realtime ref mutation were fixed. These remaining diagnostics were not hidden with blanket rule disables.
4. **Offline durability:** simultaneous replay is prevented, but crash-between-server-insert-and-local-acknowledgment is not fully idempotent. Queues are device-scoped rather than partitioned by signed-in account. Retry-exhausted items remain visible but do not yet have a dedicated recovery UI. PDI checklist failure still warns after a partially saved report. These need a separately tested queue/report transaction design.
5. **Unverified:** physical iPhone/Android installation/relaunch, native camera permissions, complete airplane-mode report capture, live QuickBooks invoice export (credentials not configured), and full backup restore into a separate environment. No customer emails, live invoices, or service campaigns were triggered for this audit.
6. Supabase advisor still reports default-schema extension placement, exposed SECURITY DEFINER helper grants, and disabled leaked-password protection. RLS is enabled on every inspected public table. The audit's specific account/PDI tests do not constitute a complete independent security assessment or certify historical source/memory files as credential-free.

## Saved sources and recovery

Canonical repo: `Projects/20 - Marine Tech/marine-tech-app` under the shared Artificial Intelligence workspace. GitHub: `cgray787/Marine-Tech-App-`, main. Existing `_repos-mirror/Marine-Tech-App-` is synchronized after the push. Vault project page links this handoff; implementation remains in repositories.

Recovered the live `quo-activity-log` function sources and migration `20260914185402` (`059_quo_sweep_reliability.sql`) into source control. They were missing from this checkout; no live Quo function behavior was changed. Migration prefix 059 now has two distinct historical files, like the pre-existing 026 collision; do not blindly replay every local migration into production.

Pre-audit uncommitted files were copied into the isolated worktree, reviewed, corrected for numbered workspace paths, and saved. Original files/patch, release/test evidence, Git bundles, and source archives are stored in `Backups/Marine Tech/2026-09-22-code-audit` with private permissions. Active historical feature worktrees retain their own branches and edits; they are inventoried/backed up, not overwritten with main.

Rollback application changes through Git and the recorded Cloudflare/EAS versions. Keep the additive PDI column and stored photo links; do not drop customer evidence to roll back a UI release. Reverting account protections would reopen the reproduced permission gaps.
