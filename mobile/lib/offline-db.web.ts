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
  photos: { localUri: string; category: string; caption?: string }[];
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
  photos: { localUri: string; category: string; caption?: string }[];
};

const unsupported = (name: string) => {
  throw new Error(`[offline-db.web] ${name} is not supported on web`);
};

export async function getDB(): Promise<never> {
  return unsupported("getDB");
}
export async function initDB(): Promise<void> {}
export async function saveIdMapping(_offlineId: string, _realId: string): Promise<void> {}
export async function getIdMapping(_offlineId: string): Promise<string | null> {
  return null;
}
export async function getAllIdMappings(): Promise<Map<string, string>> {
  return new Map();
}
export async function clearIdMappings(): Promise<void> {}
export async function savePendingReport(_report: PendingServiceReport): Promise<string> {
  return unsupported("savePendingReport");
}
export async function savePendingPDIReport(_report: PendingPDIReport): Promise<string> {
  return unsupported("savePendingPDIReport");
}
export async function savePendingChecklistItem(
  _reportId: string,
  _reportType: "service" | "pdi",
  _category: string,
  _itemName: string,
  _assessment: string,
  _notes: string | null,
  _sortOrder: number
): Promise<string> {
  return unsupported("savePendingChecklistItem");
}
export async function savePendingPhoto(
  _reportId: string,
  _localUri: string,
  _bucket: string,
  _category: string,
  _caption?: string
): Promise<string> {
  return unsupported("savePendingPhoto");
}
export async function getPendingSync(): Promise<SyncQueueItem[]> {
  return [];
}
export async function getFailedSyncItems(): Promise<SyncQueueItem[]> {
  return [];
}
export async function getPendingSyncCount(): Promise<number> {
  return 0;
}
export async function markSynced(_id: number): Promise<void> {}
export async function markFailed(_id: number, _error: string): Promise<void> {}
export async function markSyncedBatch(_ids: number[]): Promise<void> {}
export async function clearSyncedItems(): Promise<void> {}
