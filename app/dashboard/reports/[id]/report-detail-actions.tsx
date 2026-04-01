"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ReportDetailActions({
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
        alert(`Failed to update report: ${error.message}`);
        return;
      }
      router.refresh();
    } catch (err) {
      alert("Failed to update report status. Please try again.");
    }
  }

  if (currentStatus === "approved") {
    return (
      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-400">
        Approved
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => updateStatus("correction_needed")}
        className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
      >
        Request Correction
      </button>
      <button
        onClick={() => updateStatus("approved")}
        className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-primary-bg transition-colors hover:bg-gold-hover"
      >
        Approve Report
      </button>
    </div>
  );
}
