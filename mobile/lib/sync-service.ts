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

async function processSyncItem(
  item: SyncQueueItem,
  idMap: Map<string, string>
): Promise<boolean> {
  const payload = JSON.parse(item.payload);

  try {
    switch (item.table_name) {
      case "jobs": {
        const { data, error } = await supabase
          .from("jobs")
          .insert({
            assigned_to: payload.assigned_to,
            customer_id: payload.customer_id,
            boat_id: payload.boat_id,
            marina_id: payload.marina_id,
            service_types: payload.service_types,
            status: payload.status,
            created_by: payload.created_by,
            notes: payload.notes || null,
          })
          .select("id")
          .single();

        if (error) {
          console.error("[Sync] Job insert error:", error);
          await markFailed(item.id, error.message);
          return false;
        }
        if (data) {
          idMap.set(item.record_id, data.id);
          await saveIdMapping(item.record_id, data.id);
        }
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

        const { data, error } = await supabase
          .from("service_reports")
          .insert({
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
          })
          .select("id")
          .single();

        if (error) {
          console.error("[Sync] Service report insert error:", error);
          await markFailed(item.id, error.message);
          return false;
        }
        if (data) {
          idMap.set(item.record_id, data.id);
          await saveIdMapping(item.record_id, data.id);
        }
        return true;
      }

      case "pdi_reports": {
        const { data, error } = await supabase
          .from("pdi_reports")
          .insert({
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
          })
          .select("id")
          .single();

        if (error) {
          console.error("[Sync] PDI report insert error:", error);
          await markFailed(item.id, error.message);
          return false;
        }
        if (data) {
          idMap.set(item.record_id, data.id);
          await saveIdMapping(item.record_id, data.id);
        }
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

        const { error } = await supabase.from("checklist_items").insert({
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

        const { error } = await supabase.from("pdi_checklist_items").insert({
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

        const { error } = await supabase.from("report_photos").insert({
          report_id: realReportId,
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

export async function syncAll(): Promise<{
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
