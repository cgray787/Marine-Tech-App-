"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ReportStatusActions({
  reportId,
  currentStatus,
}: {
  reportId: string;
  currentStatus: string;
}) {
  const router = useRouter();

  async function updateStatus(newStatus: string) {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("service_reports")
        .update({
          status: newStatus,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", reportId);

      if (error) {
        alert(`Failed to update status: ${error.message}`);
        return;
      }
      router.refresh();
    } catch (err) {
      alert("Failed to update report status. Please try again.");
    }
  }

  if (currentStatus === "approved") return null;

  return (
    <div className="flex items-center gap-1">
      {currentStatus === "submitted" && (
        <button
          onClick={() => updateStatus("reviewed")}
          className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/25"
        >
          Review
        </button>
      )}
      {(currentStatus === "submitted" || currentStatus === "reviewed") && (
        <button
          onClick={() => updateStatus("approved")}
          className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25"
        >
          Approve
        </button>
      )}
    </div>
  );
}
