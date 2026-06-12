"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDate, statusColor } from "@/lib/utils";
import { computeTotals } from "@/lib/work-orders/totals";
import { toTotalsInput } from "@/lib/work-orders/queries";
import type { WorkOrderFull, WOSettings, PriceLevel, JobTemplate } from "@/lib/work-orders/types";
import { ChargesRail } from "./charges-rail";
import { JobSection } from "./job-section";
import { JobSheet } from "./job-sheet";
import { AddJobsDialog } from "./add-jobs-dialog";
import { DownloadPdfButton } from "./download-pdf-button";

// ── Props ──────────────────────────────────────────────────────────────────────

type Props = {
  wo: WorkOrderFull;
  customers: { id: string; name: string; email: string | null; phone: string | null }[];
  boats: { id: string; name: string; make_model: string | null; customer_id: string }[];
  priceLevels: PriceLevel[];
  templates: JobTemplate[];
  settings: WOSettings | null;
  staff: { id: string; full_name: string }[];
  canEdit: boolean;
  hideCosts: boolean;
  profileId: string;
  orgId: string;
};

// ── WOEditor ───────────────────────────────────────────────────────────────────

export function WOEditor({
  wo,
  customers,
  boats,
  priceLevels,
  templates,
  settings,
  staff,
  canEdit,
  hideCosts,
  profileId,
  orgId,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  // ── Job section/dialog state ───────────────────────────────────────────────
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [addJobsOpen, setAddJobsOpen] = useState(false);

  // ── Shared mutation helper ──────────────────────────────────────────────────
  async function patchWO(fields: Record<string, unknown>) {
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase
      .from("work_orders")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", wo.id);
    if (e) setError(e.message);
    else router.refresh();
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete() {
    const confirmed = confirm(
      "Delete this work order and all its jobs, lines, and payments?"
    );
    if (!confirmed) return;
    setError(null);
    const supabase = createClient();
    const { error: delError } = await supabase.from("work_orders").delete().eq("id", wo.id);
    if (delError) { setError(delError.message); return; }
    router.push("/dashboard/work-orders");
  }

  // ── Totals (computed once, passed to rail) ─────────────────────────────────
  const totals = computeTotals(toTotalsInput(wo));

  // ── Filtered boats for selected customer ───────────────────────────────────
  const customerBoats = boats.filter((b) => b.customer_id === wo.customer_id);

  const now = () => new Date().toISOString();

  return (
    <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-6">
      {/* ── Left column ───────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Header card */}
        <div className="rounded-xl border border-border-line bg-card-bg p-6">
          {/* Back link */}
          <Link
            href="/dashboard/work-orders"
            className="mb-4 block text-xs text-text-secondary hover:text-text-primary"
          >
            ← Work Orders
          </Link>

          {/* Error */}
          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

          {/* Title row */}
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-text-primary">
              WO-{wo.wo_number}
            </h1>
            <span
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
                statusColor(wo.status)
              )}
            >
              {wo.status}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Link
                href={`/dashboard/work-orders/${wo.id}/print`}
                className="rounded-lg border border-border-line px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-gold/50 hover:text-text-primary"
              >
                Print
              </Link>
              <DownloadPdfButton wo={wo} totals={totals} />
            </div>
          </div>

          {/* Field grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Customer */}
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-secondary">
                Customer
              </span>
              <select
                disabled={!canEdit}
                value={wo.customer_id}
                onChange={(e) =>
                  patchWO({ customer_id: e.target.value, boat_id: null })
                }
                className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary disabled:opacity-60"
              >
                {/* Only show placeholder when no customer is selected — prevents patching empty string into NOT NULL column (#7) */}
                {!wo.customer_id && <option value="">Select customer…</option>}
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            {/* Boat */}
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-secondary">
                Boat
              </span>
              <select
                disabled={!canEdit}
                value={wo.boat_id ?? ""}
                onChange={(e) =>
                  patchWO({ boat_id: e.target.value || null })
                }
                className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary disabled:opacity-60"
              >
                <option value="">No boat</option>
                {customerBoats.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.make_model ? ` — ${b.make_model}` : ""}
                  </option>
                ))}
              </select>
            </label>

            {/* Service Advisor */}
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-secondary">
                Service Advisor
              </span>
              <select
                disabled={!canEdit}
                value={wo.service_advisor ?? ""}
                onChange={(e) =>
                  patchWO({ service_advisor: e.target.value || null })
                }
                className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary disabled:opacity-60"
              >
                <option value="">None</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </label>

            {/* Date */}
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-secondary">
                Date
              </span>
              <input
                type="date"
                disabled={!canEdit}
                value={wo.wo_date}
                onChange={(e) => patchWO({ wo_date: e.target.value })}
                className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary disabled:opacity-60"
              />
            </label>
          </div>

          {/* Status action row */}
          {canEdit && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {wo.status === "draft" && (
                <button
                  onClick={() =>
                    patchWO({ status: "approved", approved_at: now() })
                  }
                  className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-[#060a12] transition-colors hover:bg-[#d4b87e]"
                >
                  Approve
                </button>
              )}
              {wo.status === "approved" && (
                <>
                  <button
                    onClick={() =>
                      patchWO({ status: "completed", completed_at: now() })
                    }
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
                  >
                    Mark Completed
                  </button>
                  <button
                    onClick={() =>
                      patchWO({ status: "draft", approved_at: null })
                    }
                    className="text-xs text-text-secondary hover:text-text-primary"
                  >
                    ↩ Back to draft
                  </button>
                </>
              )}
              {wo.status === "completed" && (
                <button
                  onClick={() =>
                    patchWO({ status: "invoiced", invoiced_at: now() })
                  }
                  className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-[#060a12] transition-colors hover:bg-[#d4b87e]"
                >
                  Mark Invoiced
                </button>
              )}
            </div>
          )}

          {/* Timestamps — always visible so viewers see milestone history */}
          {(wo.approved_at || wo.completed_at || wo.invoiced_at) && (
            <div className="mt-3 flex flex-col items-end gap-1 text-xs text-text-secondary">
              {wo.approved_at && (
                <span>Approved {formatDate(wo.approved_at)}</span>
              )}
              {wo.completed_at && (
                <span>Completed {formatDate(wo.completed_at)}</span>
              )}
              {wo.invoiced_at && (
                <span>Invoiced {formatDate(wo.invoiced_at)}</span>
              )}
            </div>
          )}

          {/* Delete */}
          {canEdit && (
            <div className="mt-6 border-t border-border-line pt-4">
              <button
                onClick={handleDelete}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Delete Work Order
              </button>
            </div>
          )}
        </div>

        {/* ── Job sections ──────────────────────────────────────────────── */}
        {(wo.work_order_jobs ?? []).length === 0 ? (
          <div className="rounded-xl border border-border-line bg-card-bg p-8 text-center">
            <p className="mb-4 text-sm text-text-secondary">
              No jobs on this work order yet.
            </p>
            {canEdit && (
              <button
                onClick={() => setAddJobsOpen(true)}
                className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-[#060a12] transition-colors hover:bg-[#d4b87e]"
              >
                + Add Jobs
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {(wo.work_order_jobs ?? []).map((job, index) => (
              <JobSection
                key={job.id}
                job={job}
                index={index}
                subtotal={totals.jobSubtotals[index] ?? 0}
                defaultMarginPct={Number(wo.default_margin_pct)}
                canEdit={canEdit}
                hideCosts={hideCosts}
                shopSuppliesAmount={Number(settings?.shop_supplies_amount ?? 75)}
                onEdit={() => setEditingJobId(job.id)}
              />
            ))}
            {canEdit && (
              <button
                onClick={() => setAddJobsOpen(true)}
                className="w-full rounded-xl border border-dashed border-border-line py-3 text-sm text-text-secondary hover:border-gold/50 hover:text-gold transition-colors"
              >
                + Add Jobs
              </button>
            )}
          </div>
        )}

        {/* ── Job edit sheet ────────────────────────────────────────────── */}
        {editingJobId && (() => {
          const editingJob = (wo.work_order_jobs ?? []).find((j) => j.id === editingJobId);
          if (!editingJob) return null;
          return (
            <JobSheet
              job={editingJob}
              open={true}
              onOpenChange={(o) => { if (!o) setEditingJobId(null); }}
              priceLevels={priceLevels}
              staff={staff}
              canEdit={canEdit}
              orgId={orgId}
            />
          );
        })()}

        {/* ── Add Jobs dialog ───────────────────────────────────────────── */}
        <AddJobsDialog
          open={addJobsOpen}
          onOpenChange={setAddJobsOpen}
          woId={wo.id}
          templates={templates}
          priceLevels={priceLevels}
          settings={settings}
          startPosition={wo.work_order_jobs?.length ?? 0}
        />
      </div>

      {/* ── Right column — Charges Rail ───────────────────────────────────── */}
      <div className="mt-4 lg:mt-0">
        <ChargesRail
          wo={wo}
          totals={totals}
          canEdit={canEdit}
          hideCosts={hideCosts}
          settings={settings}
          patchWO={patchWO}
          profileId={profileId}
        />
      </div>
    </div>
  );
}

