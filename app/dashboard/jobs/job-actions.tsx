"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function JobStatusActions({
  jobId,
  currentStatus,
}: {
  jobId: string;
  currentStatus: string;
}) {
  const router = useRouter();

  async function updateStatus(newStatus: string) {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("jobs")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", jobId);

      if (error) {
        alert(`Failed to update job: ${error.message}`);
        return;
      }
      router.refresh();
    } catch (err) {
      alert("Failed to update job status. Please try again.");
    }
  }

  if (currentStatus === "completed") {
    return (
      <span className="text-xs text-emerald-400">Complete</span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {currentStatus === "new" && (
        <button
          onClick={() => updateStatus("in_progress")}
          className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/25"
        >
          Start
        </button>
      )}
      {(currentStatus === "new" || currentStatus === "in_progress") && (
        <button
          onClick={() => updateStatus("completed")}
          className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25"
        >
          Complete
        </button>
      )}
    </div>
  );
}
