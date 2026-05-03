"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCanWrite } from "@/lib/role-context";

export function JobStatusActions({
  jobId,
  currentStatus,
}: {
  jobId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function updateStatus(newStatus: string) {
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("jobs")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", jobId);

      if (updateError) {
        setError(updateError.message);
        return;
      }
      router.refresh();
    } catch {
      setError("Failed to update job status.");
    } finally {
      setLoading(false);
    }
  }

  if (currentStatus === "completed") {
    return (
      <span className="text-xs text-emerald-400">Complete</span>
    );
  }
  if (!canWrite) {
    return <span className="text-xs text-text-secondary">—</span>;
  }

  return (
    <div className="flex items-center gap-1">
      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
      {currentStatus === "new" && (
        <button
          onClick={() => updateStatus("in_progress")}
          disabled={loading}
          className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
        >
          {loading ? "..." : "Start"}
        </button>
      )}
      {(currentStatus === "new" || currentStatus === "in_progress") && (
        <button
          onClick={() => updateStatus("completed")}
          disabled={loading}
          className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {loading ? "..." : "Complete"}
        </button>
      )}
    </div>
  );
}
