import * as SQLite from "expo-sqlite";

// ── Service campaigns ───────────────────────────────────────────────────────
// Campaign entries are created by the office and already exist server-side, so
// unlike reports there is no offline id to map — the tech only ever edits, or
// attaches photos to, a row that already has a real id. That makes these queue
// entries much simpler than the report ones.
//
// Declared here at the top of the module for visibility; the implementations sit
// with the other queue writers below.

let db: SQLite.SQLiteDatabase | null = null;

export async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync("marine_tech_offline.db");
  }
  return db;
}

export async function initDB(): Promise<void> {
  const database = await getDB();

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS pending_jobs (
      id TEXT PRIMARY KEY,
      assigned_to TEXT NOT NULL,
      customer_id TEXT,
      boat_id TEXT,
      marina_id TEXT,
      service_types TEXT DEFAULT '[]',
      status TEXT DEFAULT 'completed',
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pending_service_reports (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      tech_id TEXT NOT NULL,
      boat_id TEXT,
      customer_id TEXT,
      boat_name TEXT DEFAULT '',
      owner_name TEXT DEFAULT '',
      make_model TEXT DEFAULT '',
      year INTEGER,
      hin TEXT DEFAULT '',
      marina TEXT DEFAULT '',
      general_notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pending_checklist_items (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      report_type TEXT NOT NULL DEFAULT 'service',
      category TEXT NOT NULL,
      item_name TEXT NOT NULL,
      assessment TEXT,
      notes TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pending_parts (
      id TEXT PRIMARY KEY,
      report_id TEXT,
      name TEXT,
      part_number TEXT,
      quantity INTEGER,
      description TEXT,
      supplier TEXT,
      url TEXT,
      photo_uri TEXT,
      ordered INTEGER,
      tech_id TEXT
    );

    CREATE TABLE IF NOT EXISTS pending_photos (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      local_uri TEXT NOT NULL,
      category TEXT DEFAULT 'other',
      caption TEXT,
      bucket TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('insert', 'update', 'delete')),
      payload TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 0,
      retry_count INTEGER DEFAULT 0,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS id_map (
      offline_id TEXT PRIMARY KEY,
      real_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Add columns if upgrading from older schema
  try {
    await database.execAsync(`ALTER TABLE sync_queue ADD COLUMN retry_count INTEGER DEFAULT 0`);
  } catch {
    // Column already exists
  }
  try {
    await database.execAsync(`ALTER TABLE sync_queue ADD COLUMN last_error TEXT`);
  } catch {
    // Column already exists
  }
}

function generateId(): string {
  return "offline_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

// ── ID Map persistence ──────────────────────────────────────────────────────

export async function saveIdMapping(offlineId: string, realId: string): Promise<void> {
  const database = await getDB();
  await database.runAsync(
    `INSERT OR REPLACE INTO id_map (offline_id, real_id) VALUES (?, ?)`,
    [offlineId, realId]
  );
}

export async function getIdMapping(offlineId: string): Promise<string | null> {
  const database = await getDB();
  const row = await database.getFirstAsync<{ real_id: string }>(
    `SELECT real_id FROM id_map WHERE offline_id = ?`,
    [offlineId]
  );
  return row?.real_id ?? null;
}

export async function getAllIdMappings(): Promise<Map<string, string>> {
  const database = await getDB();
  const rows = await database.getAllAsync<{ offline_id: string; real_id: string }>(
    `SELECT offline_id, real_id FROM id_map`
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.offline_id, row.real_id);
  }
  return map;
}

export async function clearIdMappings(): Promise<void> {
  const database = await getDB();
  await database.execAsync(`DELETE FROM id_map`);
}

// ── Types ───────────────────────────────────────────────────────────────────

export type PendingServiceReport = {
  jobId: string;
  techId: string;
  boatId: string | null;
  customerId: string | null;
  boatName: string;
  ownerName: string;
  makeModel: string;
  year: number | null;
  hin: string;
  marina: string;
  marinaId: string | null;
  generalNotes: string;
  jobName: string;
  jobDescription: string;
  serviceTypes: string[];
  checklistItems: {
    category: string;
    itemName: string;
    assessment: string;
    notes: string | null;
    sortOrder: number;
  }[];
  photos: {
    localUri: string;
    category: string;
    caption?: string;
  }[];
};

export type PendingPDIReport = {
  techId: string;
  boatId: string;
  customerId: string | null;
  boatName: string;
  ownerName: string;
  makeModel: string;
  year: number | null;
  hin: string;
  color: string;
  totalItems: number;
  completedItems: number;
  flaggedItems: number;
  generalNotes: string;
  checklistItems: {
    category: string;
    itemName: string;
    assessment: string;
    notes: string | null;
    sortOrder: number;
  }[];
  photos: {
    localUri: string;
    category: string;
    caption?: string;
  }[];
};

export async function savePendingReport(report: PendingServiceReport): Promise<string> {
  const database = await getDB();
  const jobId = generateId();
  const reportId = generateId();

  // Save the job
  await database.runAsync(
    `INSERT INTO pending_jobs (id, assigned_to, customer_id, boat_id, marina_id, status, created_by)
     VALUES (?, ?, ?, ?, ?, 'completed', ?)`,
    [jobId, report.techId, report.customerId, report.boatId, report.marinaId, report.techId]
  );

  // Enqueue job sync
  await database.runAsync(
    `INSERT INTO sync_queue (table_name, record_id, action, payload)
     VALUES ('jobs', ?, 'insert', ?)`,
    [
      jobId,
      JSON.stringify({
        assigned_to: report.techId,
        customer_id: report.customerId,
        boat_id: report.boatId,
        marina_id: report.marinaId,
        service_types: report.serviceTypes,
        status: "completed",
        created_by: report.techId,
        notes: report.jobDescription || null,
      }),
    ]
  );

  // Save the service report
  await database.runAsync(
    `INSERT INTO pending_service_reports (id, job_id, tech_id, boat_id, customer_id, boat_name, owner_name, make_model, year, hin, marina, general_notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reportId,
      jobId,
      report.techId,
      report.boatId,
      report.customerId,
      report.boatName,
      report.ownerName,
      report.makeModel,
      report.year,
      report.hin,
      report.marina,
      report.generalNotes,
    ]
  );

  // Enqueue report sync (job_id will be resolved during sync)
  await database.runAsync(
    `INSERT INTO sync_queue (table_name, record_id, action, payload)
     VALUES ('service_reports', ?, 'insert', ?)`,
    [
      reportId,
      JSON.stringify({
        _offline_job_id: jobId,
        tech_id: report.techId,
        boat_id: report.boatId,
        customer_id: report.customerId,
        boat_name: report.boatName,
        owner_name: report.ownerName,
        make_model: report.makeModel,
        year: report.year,
        hin: report.hin,
        marina: report.marina,
        general_notes: report.generalNotes,
      }),
    ]
  );

  // Save checklist items
  for (const item of report.checklistItems) {
    const itemId = generateId();
    await database.runAsync(
      `INSERT INTO pending_checklist_items (id, report_id, report_type, category, item_name, assessment, notes, sort_order)
       VALUES (?, ?, 'service', ?, ?, ?, ?, ?)`,
      [itemId, reportId, item.category, item.itemName, item.assessment, item.notes, item.sortOrder]
    );

    await database.runAsync(
      `INSERT INTO sync_queue (table_name, record_id, action, payload)
       VALUES ('checklist_items', ?, 'insert', ?)`,
      [
        itemId,
        JSON.stringify({
          _offline_report_id: reportId,
          category: item.category,
          item_name: item.itemName,
          assessment: item.assessment,
          notes: item.notes,
          sort_order: item.sortOrder,
        }),
      ]
    );
  }

  // Save photos
  for (const photo of report.photos) {
    await savePendingPhoto(reportId, photo.localUri, "report-photos", photo.category, photo.caption);
  }

  return reportId;
}

export async function savePendingPDIReport(report: PendingPDIReport): Promise<string> {
  const database = await getDB();
  const reportId = generateId();

  // Enqueue PDI report sync
  await database.runAsync(
    `INSERT INTO sync_queue (table_name, record_id, action, payload)
     VALUES ('pdi_reports', ?, 'insert', ?)`,
    [
      reportId,
      JSON.stringify({
        tech_id: report.techId,
        boat_id: report.boatId,
        customer_id: report.customerId,
        boat_name: report.boatName,
        owner_name: report.ownerName,
        make_model: report.makeModel,
        year: report.year,
        hin: report.hin,
        color: report.color,
        marina: "",
        total_items: report.totalItems,
        completed_items: report.completedItems,
        flagged_items: report.flaggedItems,
        general_notes: report.generalNotes,
      }),
    ]
  );

  // Save checklist items
  for (const item of report.checklistItems) {
    const itemId = generateId();
    await database.runAsync(
      `INSERT INTO pending_checklist_items (id, report_id, report_type, category, item_name, assessment, notes, sort_order)
       VALUES (?, ?, 'pdi', ?, ?, ?, ?, ?)`,
      [itemId, reportId, item.category, item.itemName, item.assessment, item.notes, item.sortOrder]
    );

    await database.runAsync(
      `INSERT INTO sync_queue (table_name, record_id, action, payload)
       VALUES ('pdi_checklist_items', ?, 'insert', ?)`,
      [
        itemId,
        JSON.stringify({
          _offline_report_id: reportId,
          category: item.category,
          item_name: item.itemName,
          assessment: item.assessment,
          notes: item.notes,
          sort_order: item.sortOrder,
        }),
      ]
    );
  }

  // Save photos
  for (const photo of report.photos) {
    await savePendingPhoto(reportId, photo.localUri, "pdi-photos", photo.category, photo.caption);
  }

  return reportId;
}

export async function savePendingChecklistItem(
  reportId: string,
  reportType: "service" | "pdi",
  category: string,
  itemName: string,
  assessment: string,
  notes: string | null,
  sortOrder: number
): Promise<string> {
  const database = await getDB();
  const itemId = generateId();

  await database.runAsync(
    `INSERT INTO pending_checklist_items (id, report_id, report_type, category, item_name, assessment, notes, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [itemId, reportId, reportType, category, itemName, assessment, notes, sortOrder]
  );

  const tableName = reportType === "pdi" ? "pdi_checklist_items" : "checklist_items";
  await database.runAsync(
    `INSERT INTO sync_queue (table_name, record_id, action, payload)
     VALUES (?, ?, 'insert', ?)`,
    [
      tableName,
      itemId,
      JSON.stringify({
        _offline_report_id: reportId,
        category,
        item_name: itemName,
        assessment,
        notes,
        sort_order: sortOrder,
      }),
    ]
  );

  return itemId;
}

export type PartItem = {
  name: string;
  qty?: number;
  partNum?: string;
  ordered?: boolean;
  photo?: string;
  supplier?: string;
  url?: string;
  description?: string;
};

export async function savePendingParts(
  offlineReportId: string,
  parts: PartItem[],
  techId: string
): Promise<void> {
  const database = await getDB();
  for (const part of parts) {
    const partId = generateId();
    await database.runAsync(
      `INSERT INTO pending_parts (id, report_id, name, part_number, quantity, description, supplier, url, photo_uri, ordered, tech_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        partId,
        offlineReportId,
        part.name,
        part.partNum ?? null,
        part.qty ?? 1,
        part.description ?? null,
        part.supplier ?? null,
        part.url ?? null,
        part.photo ?? null,
        part.ordered ? 1 : 0,
        techId,
      ]
    );

    await database.runAsync(
      `INSERT INTO sync_queue (table_name, record_id, action, payload)
       VALUES ('parts', ?, 'insert', ?)`,
      [
        partId,
        JSON.stringify({
          _offline_report_id: offlineReportId,
          name: part.name,
          partNum: part.partNum ?? null,
          quantity: part.qty ?? 1,
          description: part.description ?? null,
          supplier: part.supplier ?? null,
          url: part.url ?? null,
          photoUri: part.photo ?? null,
          ordered: part.ordered ?? false,
          tech_id: techId,
        }),
      ]
    );
  }
}

export async function savePendingPhoto(
  reportId: string,
  localUri: string,
  bucket: string,
  category: string,
  caption?: string
): Promise<string> {
  const database = await getDB();
  const photoId = generateId();

  await database.runAsync(
    `INSERT INTO pending_photos (id, report_id, local_uri, category, caption, bucket)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [photoId, reportId, localUri, category, caption ?? null, bucket]
  );

  await database.runAsync(
    `INSERT INTO sync_queue (table_name, record_id, action, payload)
     VALUES ('report_photos', ?, 'insert', ?)`,
    [
      photoId,
      JSON.stringify({
        _offline_report_id: reportId,
        local_uri: localUri,
        category,
        caption: caption ?? null,
        bucket,
      }),
    ]
  );

  return photoId;
}

export type SyncQueueItem = {
  id: number;
  table_name: string;
  record_id: string;
  action: string;
  payload: string;
  created_at: string;
  synced: number;
  retry_count: number;
  last_error: string | null;
};

const MAX_RETRIES = 10;

export async function getPendingSync(): Promise<SyncQueueItem[]> {
  const database = await getDB();
  const results = await database.getAllAsync<SyncQueueItem>(
    `SELECT * FROM sync_queue WHERE synced = 0 AND retry_count < ? ORDER BY created_at ASC`,
    [MAX_RETRIES]
  );
  return results;
}

export async function getFailedSyncItems(): Promise<SyncQueueItem[]> {
  const database = await getDB();
  return database.getAllAsync<SyncQueueItem>(
    `SELECT * FROM sync_queue WHERE synced = 0 AND retry_count >= ? ORDER BY created_at ASC`,
    [MAX_RETRIES]
  );
}

export async function getPendingSyncCount(): Promise<number> {
  const database = await getDB();
  const result = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM sync_queue WHERE synced = 0 AND retry_count < ?`,
    [MAX_RETRIES]
  );
  return result?.count ?? 0;
}

export async function markSynced(id: number): Promise<void> {
  const database = await getDB();
  await database.runAsync(`UPDATE sync_queue SET synced = 1 WHERE id = ?`, [id]);
}

export async function markFailed(id: number, error: string): Promise<void> {
  const database = await getDB();
  await database.runAsync(
    `UPDATE sync_queue SET retry_count = retry_count + 1, last_error = ? WHERE id = ?`,
    [error, id]
  );
}

export async function markSyncedBatch(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const database = await getDB();
  const placeholders = ids.map(() => "?").join(",");
  await database.runAsync(
    `UPDATE sync_queue SET synced = 1 WHERE id IN (${placeholders})`,
    ids
  );
}

export async function clearSyncedItems(): Promise<void> {
  const database = await getDB();
  // Clean up pending tables FIRST (while sync_queue still has the synced=1 rows)
  try {
    await database.execAsync(
      `DELETE FROM pending_photos WHERE id IN (SELECT record_id FROM sync_queue WHERE synced = 1 AND table_name = 'report_photos')`
    );
    await database.execAsync(
      `DELETE FROM pending_checklist_items WHERE id IN (SELECT record_id FROM sync_queue WHERE synced = 1)`
    );
    await database.execAsync(
      `DELETE FROM pending_service_reports WHERE id IN (SELECT record_id FROM sync_queue WHERE synced = 1 AND table_name = 'service_reports')`
    );
    await database.execAsync(
      `DELETE FROM pending_jobs WHERE id IN (SELECT record_id FROM sync_queue WHERE synced = 1 AND table_name = 'jobs')`
    );
  } catch (err) {
    console.error("[Sync] Error cleaning pending tables:", err);
  }
  // Now delete from sync_queue LAST
  await database.execAsync(`DELETE FROM sync_queue WHERE synced = 1`);
  // Only clean up id_map when the entire queue is empty — this prevents
  // deleting parent mappings while children still reference them.
  const remaining = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM sync_queue WHERE synced = 0`
  );
  if ((remaining?.count ?? 0) === 0) {
    await database.execAsync(`DELETE FROM id_map`);
  }
}

/**
 * Queue a work-area photo taken while offline. The file stays on the device at
 * `localUri` until the queue drains; sync-service uploads it, then links it.
 */
export async function savePendingCampaignPhoto(
  campaignLogId: string,
  localUri: string,
  caption?: string | null
): Promise<void> {
  const database = await getDB();
  await database.runAsync(
    `INSERT INTO sync_queue (table_name, record_id, action, payload) VALUES (?, ?, ?, ?)`,
    [
      "campaign_photos",
      campaignLogId,
      "insert",
      JSON.stringify({
        campaign_log_id: campaignLogId,
        local_uri: localUri,
        caption: caption ?? null,
      }),
    ]
  );
}

/**
 * Queue findings / hours written while offline.
 *
 * Replaces any earlier un-synced update for the same entry rather than stacking
 * them: a tech editing one note five times should produce a single write when
 * signal returns, and only the last version matters.
 */
export async function savePendingCampaignUpdate(
  campaignLogId: string,
  patch: {
    conditions_found?: string | null;
    actual_hours?: number | null;
    engine_hours?: number | null;
  }
): Promise<void> {
  const database = await getDB();
  await database.runAsync(
    `DELETE FROM sync_queue WHERE table_name = 'campaign_log' AND record_id = ? AND synced = 0`,
    [campaignLogId]
  );
  await database.runAsync(
    `INSERT INTO sync_queue (table_name, record_id, action, payload) VALUES (?, ?, ?, ?)`,
    ["campaign_log", campaignLogId, "update", JSON.stringify({ id: campaignLogId, ...patch })]
  );
}

/** How many campaign writes are still waiting — drives the offline banner. */
export async function countPendingCampaignWrites(): Promise<number> {
  const database = await getDB();
  const row = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM sync_queue
      WHERE synced = 0 AND table_name IN ('campaign_photos', 'campaign_log')`
  );
  return row?.count ?? 0;
}

/**
 * Queue a job photo taken while offline. Mirrors the campaign-photo path: the
 * file stays on the device until the queue drains. The job already exists
 * server-side, so there is no offline id to resolve.
 */
export async function savePendingJobPhoto(
  jobId: string,
  localUri: string,
  caption?: string | null
): Promise<void> {
  const database = await getDB();
  await database.runAsync(
    `INSERT INTO sync_queue (table_name, record_id, action, payload) VALUES (?, ?, ?, ?)`,
    [
      "job_photos",
      jobId,
      "insert",
      JSON.stringify({ job_id: jobId, local_uri: localUri, caption: caption ?? null }),
    ]
  );
}

/** Locally queued job photos, so a tech sees their own shot immediately. */
export async function getPendingJobPhotos(jobId: string): Promise<string[]> {
  const database = await getDB();
  const rows = await database.getAllAsync<{ payload: string }>(
    `SELECT payload FROM sync_queue
      WHERE synced = 0 AND table_name = 'job_photos' AND record_id = ?
      ORDER BY id`,
    [jobId]
  );
  return rows
    .map((r) => {
      try {
        return JSON.parse(r.payload).local_uri as string;
      } catch {
        return null;
      }
    })
    .filter((u): u is string => !!u);
}

/** Locally queued photos for an entry, so a tech sees their own shot immediately. */
export async function getPendingCampaignPhotos(campaignLogId: string): Promise<string[]> {
  const database = await getDB();
  const rows = await database.getAllAsync<{ payload: string }>(
    `SELECT payload FROM sync_queue
      WHERE synced = 0 AND table_name = 'campaign_photos' AND record_id = ?
      ORDER BY id`,
    [campaignLogId]
  );
  return rows
    .map((r) => {
      try {
        return JSON.parse(r.payload).local_uri as string;
      } catch {
        return null;
      }
    })
    .filter((u): u is string => !!u);
}
