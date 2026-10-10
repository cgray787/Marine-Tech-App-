import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { supabase } from "./supabase";
import {
  getPendingSync,
  markSynced,
  markFailed,
  getPendingSyncCount,
  clearSyncedItems,
  saveIdMapping,
  getAllIdMappings,
  type SyncQueueItem,
} from "./offline-db";

export async function checkConnectivity(): Promise<boolean> {
  const state: NetInfoState = await NetInfo.fetch();
  return state.isConnected === true && state.isInternetReachable !== false;
}

export function subscribeToConnectivity(
  callback: (isOnline: boolean) => void
): () => void {
  return NetInfo.addEventListener((state: NetInfoState) => {
    const online = state.isConnected === true && state.isInternetReachable !== false;
    callback(online);
  });
}

async function uploadPhotoToStorage(
  localUri: string,
  bucket: string,
  reportId: string
): Promise<string | null> {
  try {
    const fileName = `${reportId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const response = await fetch(localUri);
    const arrayBuffer = await response.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, arrayBuffer, { contentType: "image/jpeg" });

    if (uploadError) {
      console.error("[Sync] Photo upload error:", uploadError);
      return null;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(fileName);

    return publicUrl;
  } catch (err) {
    console.error("[Sync] Photo upload failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Idempotent replay for parent rows (jobs, service_reports, pdi_reports).
//
// These used to replay as a plain INSERT with a server-generated id. When the
// server committed but the response was lost — routine on marina signal — the
// item was marked failed (retry_count + 1) and retried, inserting a second job
// or report. Duplicate reports then hid the report entirely from the job page
// and made every edit insert another one (fixed separately on the read side).
//
// Each queued record now gets a UUID derived deterministically from its
// table + record_id. record_id is minted once at enqueue time and stored in
// the sync_queue row, so every retry carries the SAME id, and
// ON CONFLICT (id) DO NOTHING turns a retry of an already-committed row into
// a no-op instead of a duplicate. Needs only INSERT privilege under RLS.
// ---------------------------------------------------------------------------

/** cyrb128: fast, well-mixed 128-bit non-cryptographic hash. */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Deterministic, UUID-shaped id for one queued record. Same input, same id. */
export function replayId(table: string, recordId: string): string {
  const hex = cyrb128(`${table}:${recordId}`).map((n) => n.toString(16).padStart(8, "0")).join("");
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Insert a row at most once, however many times the queue retries it.
 *
 * `seedKey` MUST be unique per row. For most queue entries that is the
 * record_id minted per row at enqueue (generateId()). It is NOT for
 * campaign_photos and job_photos: their record_id is the shared
 * campaignLogId / jobId, identical for every photo of one entry. Seeding those
 * on record_id alone would give every photo the same id and ON CONFLICT DO
 * NOTHING would silently keep only the first — so callers append the photo's
 * on-device local_uri, which is unique per photo and stable across retries.
 * `seedTable` namespaces the seed (several queue types write report_photos).
 */
async function insertOnce(
  table: "jobs" | "service_reports" | "pdi_reports" | "checklist_items" | "pdi_checklist_items" | "report_photos" | "parts",
  seedKey: string,
  row: Record<string, unknown>,
  seedTable: string = table
): Promise<{ id: string; error: { message: string } | null }> {
  const id = replayId(seedTable, seedKey);
  const { error } = await supabase
    .from(table)
    .upsert({ id, ...row }, { onConflict: "id", ignoreDuplicates: true });
  return { id, error };
}

async function processSyncItem(
  item: SyncQueueItem,
  idMap: Map<string, string>
): Promise<boolean> {
  try {
    const payload = JSON.parse(item.payload);
    switch (item.table_name) {
      case "jobs": {
        const { id: newId, error } = await insertOnce("jobs", item.record_id, {
            assigned_to: payload.assigned_to,
            customer_id: payload.customer_id,
            boat_id: payload.boat_id,
            marina_id: payload.marina_id,
            service_types: payload.service_types,
            status: payload.status,
            created_by: payload.created_by,
            notes: payload.notes || null,
            ...(payload.scheduled_start !== undefined ? {
              scheduled_start: payload.scheduled_start, scheduled_end: payload.scheduled_end,
              scheduled_date: payload.scheduled_date, scheduled_end_date: payload.scheduled_end_date,
              service_descriptions: payload.service_descriptions,
            } : {}),
          });

        if (error) {
          console.error("[Sync] Job insert error:", error);
          await markFailed(item.id, error.message);
          return false;
        }
        idMap.set(item.record_id, newId);
        await saveIdMapping(item.record_id, newId);
        return true;
      }

      case "service_reports": {
        // Resolve the job_id from offline to real
        const realJobId = payload._offline_job_id
          ? idMap.get(payload._offline_job_id) ?? payload._offline_job_id
          : payload.job_id;

        // If the real job ID is still an offline ID, the parent failed — skip
        if (typeof realJobId === "string" && realJobId.startsWith("offline_")) {
          const errMsg = `Parent job ${payload._offline_job_id} not yet synced`;
          console.warn("[Sync]", errMsg);
          await markFailed(item.id, errMsg);
          return false;
        }

        const { id: newId, error } = await insertOnce("service_reports", item.record_id, {
            job_id: realJobId,
            tech_id: payload.tech_id,
            boat_id: payload.boat_id,
            customer_id: payload.customer_id,
            boat_name: payload.boat_name,
            owner_name: payload.owner_name,
            make_model: payload.make_model,
            year: payload.year,
            hin: payload.hin,
            marina: payload.marina,
            general_notes: payload.general_notes,
          });

        if (error) {
          console.error("[Sync] Service report insert error:", error);
          await markFailed(item.id, error.message);
          return false;
        }
        idMap.set(item.record_id, newId);
        await saveIdMapping(item.record_id, newId);
        return true;
      }

      case "pdi_reports": {
        const { id: newId, error } = await insertOnce("pdi_reports", item.record_id, {
            tech_id: payload.tech_id,
            boat_id: payload.boat_id,
            customer_id: payload.customer_id,
            boat_name: payload.boat_name,
            owner_name: payload.owner_name,
            make_model: payload.make_model,
            year: payload.year,
            hin: payload.hin,
            color: payload.color,
            marina: payload.marina,
            total_items: payload.total_items,
            completed_items: payload.completed_items,
            flagged_items: payload.flagged_items,
            general_notes: payload.general_notes,
          });

        if (error) {
          console.error("[Sync] PDI report insert error:", error);
          await markFailed(item.id, error.message);
          return false;
        }
        idMap.set(item.record_id, newId);
        await saveIdMapping(item.record_id, newId);
        return true;
      }

      case "checklist_items": {
        const realReportId = payload._offline_report_id
          ? idMap.get(payload._offline_report_id) ?? payload._offline_report_id
          : payload.report_id;

        if (typeof realReportId === "string" && realReportId.startsWith("offline_")) {
          const errMsg = `Parent report ${payload._offline_report_id} not yet synced`;
          console.warn("[Sync]", errMsg);
          await markFailed(item.id, errMsg);
          return false;
        }

        const { error } = await insertOnce("checklist_items", item.record_id, {
          report_id: realReportId,
          category: payload.category,
          item_name: payload.item_name,
          assessment: payload.assessment,
          notes: payload.notes,
          sort_order: payload.sort_order,
        });

        if (error) {
          console.error("[Sync] Checklist item insert error:", error);
          await markFailed(item.id, error.message);
          return false;
        }
        return true;
      }

      case "pdi_checklist_items": {
        const realReportId = payload._offline_report_id
          ? idMap.get(payload._offline_report_id) ?? payload._offline_report_id
          : payload.pdi_report_id;

        if (typeof realReportId === "string" && realReportId.startsWith("offline_")) {
          const errMsg = `Parent PDI report ${payload._offline_report_id} not yet synced`;
          console.warn("[Sync]", errMsg);
          await markFailed(item.id, errMsg);
          return false;
        }

        const { error } = await insertOnce("pdi_checklist_items", item.record_id, {
          pdi_report_id: realReportId,
          category: payload.category,
          item_name: payload.item_name,
          assessment: payload.assessment,
          notes: payload.notes,
          sort_order: payload.sort_order,
        });

        if (error) {
          console.error("[Sync] PDI checklist item insert error:", error);
          await markFailed(item.id, error.message);
          return false;
        }
        return true;
      }

      case "report_photos": {
        const realReportId = payload._offline_report_id
          ? idMap.get(payload._offline_report_id) ?? payload._offline_report_id
          : payload.report_id;

        if (typeof realReportId === "string" && realReportId.startsWith("offline_")) {
          const errMsg = `Parent report ${payload._offline_report_id} not yet synced`;
          console.warn("[Sync]", errMsg);
          await markFailed(item.id, errMsg);
          return false;
        }

        const photoUrl = await uploadPhotoToStorage(
          payload.local_uri,
          payload.bucket,
          realReportId
        );

        if (!photoUrl) {
          await markFailed(item.id, "Photo upload failed");
          return false;
        }

        const { error } = await insertOnce("report_photos", item.record_id, {
          ...(payload.bucket === "pdi-photos" ? { pdi_report_id: realReportId } : { report_id: realReportId }),
          photo_url: photoUrl,
          category: payload.category,
          caption: payload.caption,
        });

        if (error) {
          console.error("[Sync] Report photo insert error:", error);
          await markFailed(item.id, error.message);
          return false;
        }
        return true;
      }

      // Campaign work queued in a marina dead-spot. Both cases reference a
      // campaign_log row the office already created, so there is no offline id to
      // resolve — unlike reports, the parent always exists.
      case "campaign_photos": {
        const photoUrl = await uploadPhotoToStorage(
          payload.local_uri,
          "report-photos",
          `campaigns/${payload.campaign_log_id}`
        );
        if (!photoUrl) {
          await markFailed(item.id, "Campaign photo upload failed");
          return false;
        }
        // record_id here is the shared campaignLogId — seed per photo via local_uri.
        const { error } = await insertOnce("report_photos", `${item.record_id}:${payload.local_uri}`, {
          campaign_log_id: payload.campaign_log_id,
          photo_url: photoUrl,
          category: "campaign",
          caption: payload.caption,
        }, "campaign_photos");
        if (error) {
          console.error("[Sync] Campaign photo insert error:", error);
          await markFailed(item.id, error.message);
          return false;
        }
        return true;
      }

      case "job_photos": {
        const photoUrl = await uploadPhotoToStorage(
          payload.local_uri,
          "report-photos",
          `jobs/${payload.job_id}`
        );
        if (!photoUrl) {
          await markFailed(item.id, "Job photo upload failed");
          return false;
        }
        // record_id here is the shared jobId — seed per photo via local_uri.
        const { error } = await insertOnce("report_photos", `${item.record_id}:${payload.local_uri}`, {
          job_id: payload.job_id,
          photo_url: photoUrl,
          category: "work_area",
          caption: payload.caption,
        }, "job_photos");
        if (error) {
          console.error("[Sync] Job photo insert error:", error);
          await markFailed(item.id, error.message);
          return false;
        }
        return true;
      }

      case "campaign_log": {
        const { id, ...patch } = payload;
        const { error } = await supabase.from("campaign_log").update(patch).eq("id", id);
        if (error) {
          console.error("[Sync] Campaign update error:", error);
          await markFailed(item.id, error.message);
          return false;
        }
        return true;
      }

      case "parts": {
        const realReportId = payload._offline_report_id
          ? idMap.get(payload._offline_report_id) ?? payload._offline_report_id
          : payload.service_report_id;

        if (typeof realReportId === "string" && realReportId.startsWith("offline_")) {
          const errMsg = `Parent report ${payload._offline_report_id} not yet synced`;
          console.warn("[Sync]", errMsg);
          await markFailed(item.id, errMsg);
          return false;
        }

        // parts_insert RLS (028) requires customer_in_my_location(customer_id),
        // and the queue never stored it — so for shop techs every offline part
        // was rejected on each retry and never reached Parts to Order. Copy the
        // customer/job/boat from the (now synced) parent report, as the online
        // path does.
        const { data: parent, error: parentErr } = await supabase
          .from("service_reports")
          .select("customer_id, job_id, boat_id")
          .eq("id", realReportId)
          .maybeSingle();
        if (parentErr) { await markFailed(item.id, parentErr.message); return false; }

        let photoUrl: string | null = null;
        if (payload.photoUri) {
          photoUrl = await uploadPhotoToStorage(payload.photoUri, "report-photos", realReportId);
          if (!photoUrl) { await markFailed(item.id, "Parts photo upload failed"); return false; }
        }

        const { error } = await insertOnce("parts", item.record_id, {
          service_report_id: realReportId,
          customer_id: parent?.customer_id ?? null,
          job_id: parent?.job_id ?? null,
          boat_id: parent?.boat_id ?? null,
          name: payload.name,
          part_number: payload.partNum || null,
          quantity: payload.quantity || 1,
          description: payload.description || null,
          supplier: payload.supplier || null,
          url: payload.url || null,
          photo_url: photoUrl,
          status: payload.ordered ? "ordered" : "need_to_order",
          ordered_at: payload.ordered ? new Date().toISOString() : null,
          created_by: payload.tech_id || null,
        });

        if (error) {
          console.error("[Sync] Parts insert error:", error);
          await markFailed(item.id, error.message);
          return false;
        }
        return true;
      }

      default:
        console.warn("[Sync] Unknown table:", item.table_name);
        await markFailed(item.id, `Unknown table: ${item.table_name}`);
        return false;
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Sync] Error processing item:", errMsg);
    await markFailed(item.id, errMsg);
    return false;
  }
}

async function runSync(): Promise<{
  synced: number;
  failed: number;
  remaining: number;
}> {
  const isOnline = await checkConnectivity();
  if (!isOnline) {
    const remaining = await getPendingSyncCount();
    return { synced: 0, failed: 0, remaining };
  }

  // Load persisted ID mappings from SQLite (crash-safe)
  const idMap = await getAllIdMappings();

  const pending = await getPendingSync();
  let synced = 0;
  let failed = 0;

  // Process items in order (jobs first, then reports, then checklist items, then photos)
  // The sync_queue is already ordered by created_at ASC which respects insertion order
  for (const item of pending) {
    const success = await processSyncItem(item, idMap);
    if (success) {
      await markSynced(item.id);
      synced++;
    } else {
      failed++;
      // If a parent record fails, skip its children
      // (they will retry next sync cycle)
      if (
        item.table_name === "jobs" ||
        item.table_name === "service_reports" ||
        item.table_name === "pdi_reports"
      ) {
        console.warn(
          `[Sync] Parent record failed (${item.table_name}:${item.record_id}), children may fail too`
        );
      }
    }
  }

  // Clean up successfully synced items
  if (synced > 0) {
    await clearSyncedItems();
  }

  const remaining = await getPendingSyncCount();
  console.log(
    `[Sync] Complete: ${synced} synced, ${failed} failed, ${remaining} remaining`
  );

  return { synced, failed, remaining };
}

let inFlight: ReturnType<typeof runSync> | null = null;
export function syncAll(): ReturnType<typeof runSync> {
  if (!inFlight) inFlight = runSync().finally(() => { inFlight = null; });
  return inFlight;
}
