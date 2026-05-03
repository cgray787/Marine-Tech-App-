"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCanWrite } from "@/lib/role-context";

export function PdiStatusActions({
  pdiId,
  currentStatus,
}: {
  pdiId: string;
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
        .from("pdi_reports")
        .update({ status: newStatus })
        .eq("id", pdiId);

      if (updateError) {
        setError(updateError.message);
        return;
      }
      router.refresh();
    } catch {
      setError("Failed to update PDI status.");
    } finally {
      setLoading(false);
    }
  }

  if (currentStatus === "approved") return null;
  if (!canWrite) return null;

  return (
    <div className="flex items-center gap-1">
      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
      {currentStatus === "submitted" && (
        <button
          onClick={() => updateStatus("reviewed")}
          disabled={loading}
          className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
        >
          {loading ? "..." : "Review"}
        </button>
      )}
      {(currentStatus === "submitted" || currentStatus === "reviewed") && (
        <button
          onClick={() => updateStatus("approved")}
          disabled={loading}
          className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {loading ? "..." : "Approve"}
        </button>
      )}
    </div>
  );
}
