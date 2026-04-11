"use client";

import { useState } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function updateStatus(newStatus: string) {
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("service_reports")
        .update({
          status: newStatus,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", reportId);

      if (updateError) {
        setError(updateError.message);
        return;
      }
      router.refresh();
    } catch {
      setError("Failed to update report status.");
    } finally {
      setLoading(false);
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
      {error && (
        <span className="text-sm text-red-400">{error}</span>
      )}
      <button
        onClick={() => updateStatus("correction_needed")}
        disabled={loading}
        className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
      >
        {loading ? "..." : "Request Correction"}
      </button>
      <button
        onClick={() => updateStatus("approved")}
        disabled={loading}
        className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-primary-bg transition-colors hover:bg-gold-hover disabled:opacity-50"
      >
        {loading ? "..." : "Approve Report"}
      </button>
    </div>
  );
}
