"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface QbStatus {
  configured: boolean;
  connected: boolean;
  companyName: string | null;
  realmId: string | null;
}

export function QuickBooksCard() {
  const searchParams = useSearchParams();
  const qbParam = searchParams.get("qb");
  const msgParam = searchParams.get("msg");

  const [status, setStatus] = useState<QbStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  // Set banner from URL param on first render
  useEffect(() => {
    if (qbParam === "connected") {
      setBanner({ type: "success", message: "QuickBooks connected successfully." });
    } else if (qbParam === "error") {
      setBanner({
        type: "error",
        message: msgParam ? `QuickBooks error: ${decodeURIComponent(msgParam)}` : "QuickBooks connection failed.",
      });
    } else if (qbParam === "unconfigured") {
      setBanner({
        type: "error",
        message: "QuickBooks is not configured — add INTUIT_CLIENT_ID and INTUIT_CLIENT_SECRET.",
      });
    }
  }, [qbParam, msgParam]);

  // Fetch status on mount
  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    setLoading(true);
    try {
      const res = await fetch("/api/quickbooks/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data as QbStatus);
      }
    } catch {
      // Silently fail — card shows disconnected
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect QuickBooks? You can reconnect at any time.")) return;

    setDisconnecting(true);
    try {
      const res = await fetch("/api/quickbooks/disconnect", { method: "POST" });
      if (res.ok) {
        setBanner({ type: "success", message: "QuickBooks disconnected." });
        await fetchStatus();
      } else {
        const data = await res.json();
        setBanner({ type: "error", message: data.error ?? "Disconnect failed." });
      }
    } catch {
      setBanner({ type: "error", message: "Disconnect failed — please try again." });
    } finally {
      setDisconnecting(false);
    }
  }

  function dismissBanner() {
    setBanner(null);
  }

  return (
    <div className="rounded-xl border border-border-line bg-card-bg">
      <div className="border-b border-border-line px-6 py-4">
        <h2 className="text-base font-semibold text-text-primary">QuickBooks Online</h2>
        <p className="mt-0.5 text-xs text-text-secondary">
          Connect to sync work orders as invoices in QuickBooks.
        </p>
      </div>

      <div className="p-6 space-y-4">
        {/* Banner */}
        {banner && (
          <div
            className={`flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm ${
              banner.type === "success"
                ? "bg-green-900/20 text-green-400 border border-green-800/40"
                : "bg-red-900/20 text-red-400 border border-red-800/40"
            }`}
          >
            <span>{banner.message}</span>
            <button
              onClick={dismissBanner}
              className="shrink-0 text-current opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <p className="text-sm text-text-secondary">Checking connection…</p>
        ) : !status?.configured ? (
          // Not configured
          <div className="rounded-lg border border-border-line bg-secondary-bg px-4 py-3">
            <p className="text-sm text-text-secondary">
              QuickBooks app not configured.{" "}
              <span className="text-text-primary font-medium">
                Add INTUIT_CLIENT_ID and INTUIT_CLIENT_SECRET
              </span>{" "}
              as Cloudflare Worker secrets to enable this integration.
            </p>
          </div>
        ) : status.connected ? (
          // Connected
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
              <span className="text-sm text-text-primary">
                Connected to{" "}
                <span className="font-medium text-gold">
                  {status.companyName ?? "QuickBooks"}
                </span>{" "}
                ✓
              </span>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="rounded-lg border border-border-line px-3 py-1.5 text-xs text-text-secondary hover:text-red-400 hover:border-red-800/60 disabled:opacity-50 transition-colors"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        ) : (
          // Configured but not connected
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-text-secondary" />
              <span className="text-sm text-text-secondary">Not connected</span>
            </div>
            <a
              href="/api/quickbooks/connect"
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-700 hover:bg-green-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              Connect to QuickBooks
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
