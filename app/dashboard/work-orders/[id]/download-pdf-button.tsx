"use client";

import { useState } from "react";
import type { WorkOrderFull } from "@/lib/work-orders/types";
import type { WOTotals } from "@/lib/work-orders/totals";

interface Props {
  wo: WorkOrderFull;
  totals: WOTotals;
}

export function DownloadPdfButton({ wo, totals }: Props) {
  const [state, setState] = useState<"idle" | "generating" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleClick() {
    setState("generating");
    setErrorMsg(null);
    try {
      const [{ pdf }, { WorkOrderPdf, woFileName }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/lib/work-orders/pdf"),
      ]);

      const blob = await pdf(
        <WorkOrderPdf wo={wo} totals={totals} logoSrc="/jby-logo.png" />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = woFileName(wo);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setState("idle");
    } catch (err) {
      console.error("PDF generation failed", err);
      setErrorMsg(err instanceof Error ? err.message : "PDF generation failed.");
      setState("error");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={state === "generating"}
        className="rounded-lg border border-border-line px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-gold/50 hover:text-text-primary disabled:opacity-50"
      >
        {state === "generating" ? "Generating…" : "Download PDF"}
      </button>
      {state === "error" && errorMsg && (
        <p className="text-xs text-red-400">{errorMsg}</p>
      )}
    </div>
  );
}
