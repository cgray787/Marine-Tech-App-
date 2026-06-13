"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface QbStatus {
  configured: boolean;
  connected: boolean;
  companyName: string | null;
  realmId: string | null;
}

interface Props {
  workOrderId: string;
  syncedInvoiceId: string | null;
  syncedAt: string | null;
  canEdit: boolean;
}

/**
 * QuickBooksButton
 *
 * Renders in the WO editor header (alongside Print / Download PDF).
 * Visible only when canEdit is true.
 *
 * States:
 * - Loading status: skeleton/disabled button
 * - Not configured: muted "QuickBooks not connected" tooltip button
 * - Not connected: same
 * - Synced: "View in QuickBooks ↗" link + small "Re-send" action
 * - Unsynced: "Send to QuickBooks" → loading → success (router.refresh())
 * - Error: inline red message + retry available
 */
export function QuickBooksButton({ workOrderId, syncedInvoiceId, syncedAt, canEdit }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<QbStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the currently-known invoice id so success updates the UI without a
  // full navigation (router.refresh() re-fetches the server component)
  const [invoiceId, setInvoiceId] = useState<string | null>(syncedInvoiceId);

  useEffect(() => {
    fetch("/api/quickbooks/status")
      .then((r) => r.json())
      .then((data: QbStatus) => setStatus(data))
      .catch(() => setStatus({ configured: false, connected: false, companyName: null, realmId: null }))
      .finally(() => setStatusLoading(false));
  }, []);

  if (!canEdit) return null;

  // ── Loading status ─────────────────────────────────────────────────────
  if (statusLoading) {
    return (
      <button
        disabled
        className="rounded-lg border border-border-line px-3 py-1.5 text-xs text-text-secondary opacity-40"
      >
        QuickBooks…
      </button>
    );
  }

  // ── Not configured or not connected ────────────────────────────────────
  if (!status?.configured || !status?.connected) {
    const tooltip = status?.configured
      ? "QuickBooks not connected — go to Work Orders → Settings to connect"
      : "QuickBooks not configured — add INTUIT_CLIENT_ID / INTUIT_CLIENT_SECRET";
    return (
      <button
        disabled
        title={tooltip}
        className="rounded-lg border border-border-line px-3 py-1.5 text-xs text-text-secondary opacity-40 cursor-not-allowed"
      >
        QuickBooks not connected
      </button>
    );
  }

  // ── Already synced ─────────────────────────────────────────────────────
  if (invoiceId) {
    const qboBase =
      process.env.NEXT_PUBLIC_QB_ENV === "production"
        ? "https://qbo.intuit.com"
        : "https://sandbox.qbo.intuit.com";
    const qboUrl = `${qboBase}/app/invoice?txnId=${invoiceId}`;

    return (
      <div className="flex items-center gap-2">
        <a
          href={qboUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-emerald-700/50 px-3 py-1.5 text-xs text-emerald-400 transition-colors hover:border-emerald-500/70 hover:text-emerald-300"
        >
          View in QuickBooks ↗
        </a>
        <button
          onClick={() => {
            if (
              confirm(
                "Re-sending creates a NEW invoice in QuickBooks and detaches this work order from the old one. The previous invoice stays in QuickBooks — delete it there if it's a duplicate. Continue?"
              )
            )
              handleExport();
          }}
          disabled={exporting}
          className="text-xs text-text-secondary hover:text-text-primary disabled:opacity-40"
        >
          {exporting ? "Syncing…" : "Re-send"}
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    );
  }

  // ── Not yet synced ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleExport}
        disabled={exporting}
        className="rounded-lg border border-border-line px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-gold/50 hover:text-text-primary disabled:opacity-50"
      >
        {exporting ? "Syncing…" : "Send to QuickBooks"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );

  // ── Export handler ─────────────────────────────────────────────────────
  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/quickbooks/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderId }),
      });
      const data = (await res.json()) as { invoiceId?: string; qboUrl?: string; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Export failed");
      } else if (data.invoiceId) {
        setInvoiceId(data.invoiceId);
        // Refresh server component so quickbooks_invoice_id is reflected in the page
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }
}
