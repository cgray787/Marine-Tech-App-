import { describe, it, expect } from "vitest";

/**
 * The offline queue's replay contract, tested as pure logic.
 *
 * The mobile code itself needs expo-sqlite and a device, so these tests pin the
 * two behaviours that are easy to get wrong and expensive to discover at a boat:
 * update coalescing, and how a queued photo counts toward the completion gate.
 *
 * Mirrors mobile/lib/offline-db.ts (savePendingCampaignUpdate) and
 * mobile/lib/campaigns.ts (completionBlocker).
 */

type QueueRow = { table_name: string; record_id: string; payload: string; synced: 0 | 1 };

/** Mirrors savePendingCampaignUpdate: replace-not-stack for the same entry. */
function queueUpdate(queue: QueueRow[], entryId: string, patch: object): QueueRow[] {
  const kept = queue.filter(
    (r) => !(r.table_name === "campaign_log" && r.record_id === entryId && r.synced === 0)
  );
  return [
    ...kept,
    {
      table_name: "campaign_log",
      record_id: entryId,
      payload: JSON.stringify({ id: entryId, ...patch }),
      synced: 0,
    },
  ];
}

/** Mirrors savePendingCampaignPhoto: photos stack, they are not replaced. */
function queuePhoto(queue: QueueRow[], entryId: string, uri: string): QueueRow[] {
  return [
    ...queue,
    {
      table_name: "campaign_photos",
      record_id: entryId,
      payload: JSON.stringify({ campaign_log_id: entryId, local_uri: uri }),
      synced: 0,
    },
  ];
}

function completionBlocker(e: { conditions_found?: string | null; photoCount: number }) {
  const hasNote = (e.conditions_found ?? "").trim().length > 0;
  if (!hasNote && e.photoCount === 0) return "Needs a photo and a written finding";
  if (e.photoCount === 0) return "Needs at least one photo";
  if (!hasNote) return "Needs a written finding";
  return null;
}

describe("offline update queue — coalescing", () => {
  it("keeps only the latest edit for an entry, not one row per keystroke-save", () => {
    let q: QueueRow[] = [];
    q = queueUpdate(q, "entry-1", { conditions_found: "first" });
    q = queueUpdate(q, "entry-1", { conditions_found: "second" });
    q = queueUpdate(q, "entry-1", { conditions_found: "final" });

    const forEntry = q.filter((r) => r.record_id === "entry-1");
    expect(forEntry).toHaveLength(1);
    expect(JSON.parse(forEntry[0].payload).conditions_found).toBe("final");
  });

  it("does not collapse edits belonging to different entries", () => {
    let q: QueueRow[] = [];
    q = queueUpdate(q, "entry-1", { conditions_found: "a" });
    q = queueUpdate(q, "entry-2", { conditions_found: "b" });
    expect(q).toHaveLength(2);
  });

  it("leaves an already-synced row alone when a new edit arrives", () => {
    let q: QueueRow[] = [
      { table_name: "campaign_log", record_id: "entry-1", payload: "{}", synced: 1 },
    ];
    q = queueUpdate(q, "entry-1", { conditions_found: "new" });
    expect(q.filter((r) => r.synced === 1)).toHaveLength(1);
    expect(q.filter((r) => r.synced === 0)).toHaveLength(1);
  });

  it("carries the entry id in the payload so replay can target the row", () => {
    const q = queueUpdate([], "entry-9", { actual_hours: 0.7 });
    const p = JSON.parse(q[0].payload);
    expect(p.id).toBe("entry-9");
    expect(p.actual_hours).toBe(0.7);
  });
});

describe("offline photo queue — photos accumulate", () => {
  it("keeps every shot rather than replacing the previous one", () => {
    let q: QueueRow[] = [];
    q = queuePhoto(q, "entry-1", "file:///a.jpg");
    q = queuePhoto(q, "entry-1", "file:///b.jpg");
    expect(q.filter((r) => r.table_name === "campaign_photos")).toHaveLength(2);
  });

  it("records the local uri so the file can be uploaded after signal returns", () => {
    const q = queuePhoto([], "entry-1", "file:///shot.jpg");
    expect(JSON.parse(q[0].payload).local_uri).toBe("file:///shot.jpg");
  });

  it("does not interfere with queued updates for the same entry", () => {
    let q: QueueRow[] = [];
    q = queueUpdate(q, "entry-1", { conditions_found: "found it" });
    q = queuePhoto(q, "entry-1", "file:///a.jpg");
    q = queueUpdate(q, "entry-1", { conditions_found: "found it, fixed it" });
    // The photo survives; only the update is coalesced.
    expect(q.filter((r) => r.table_name === "campaign_photos")).toHaveLength(1);
    expect(q.filter((r) => r.table_name === "campaign_log")).toHaveLength(1);
  });
});

describe("completion gate counts queued photos", () => {
  it("a photo waiting to upload still satisfies the gate", () => {
    // The tech took the photo; the network is the app's problem, not theirs.
    expect(completionBlocker({ conditions_found: "Replaced gasket", photoCount: 1 })).toBeNull();
  });

  it("still blocks when nothing has been shot at all", () => {
    expect(completionBlocker({ conditions_found: "Replaced gasket", photoCount: 0 })).toBe(
      "Needs at least one photo"
    );
  });

  it("still blocks with a photo but no finding", () => {
    expect(completionBlocker({ conditions_found: "  ", photoCount: 2 })).toBe(
      "Needs a written finding"
    );
  });
});
