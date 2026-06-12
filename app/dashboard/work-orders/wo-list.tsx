"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn, formatDate, statusColor } from "@/lib/utils";
import { computeTotals, fmtUSD } from "@/lib/work-orders/totals";
import { toTotalsInput } from "@/lib/work-orders/queries";
import { createClient } from "@/lib/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type WOListRow = {
  id: string;
  wo_number: number;
  status: string;
  wo_date: string;
  default_margin_pct: number;
  taxes: { name: string; rate_pct: number }[];
  cc_fee_pct: number | null;
  customers: { name: string } | null;
  boats: { name: string } | null;
  work_order_jobs: {
    job_type: string;
    hours: number | null;
    flat_price: number | null;
    boat_length_ft: number | null;
    labor_taxable: boolean;
    price_levels: { rate: number; unit: string } | null;
    work_order_lines: {
      kind: string;
      qty: number;
      unit_cost: number;
      margin_pct: number | null;
      taxable: boolean;
    }[];
  }[];
  work_order_payments: { amount: number }[];
};

// ── Status filter ─────────────────────────────────────────────────────────────

type FilterStatus = "all" | "draft" | "approved" | "completed" | "invoiced";

const FILTER_CHIPS: { label: string; value: FilterStatus }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Approved", value: "approved" },
  { label: "Completed", value: "completed" },
  { label: "Invoiced", value: "invoiced" },
];

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  rows: WOListRow[];
  customers: { id: string; name: string }[];
  canEdit: boolean;
  profileId: string;
};

export function WOList({ rows, customers, canEdit, profileId }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [chosenCustomerId, setChosenCustomerId] = useState("");
  const [creating, setCreating] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  async function handleCreate() {
    if (!chosenCustomerId) return;
    setCreating(true);
    setDialogError(null);
    try {
      const supabase = createClient();
      const [{ data: settings }, { data: me }] = await Promise.all([
        supabase.from("wo_settings").select("*").single(),
        supabase.from("profiles").select("id, location_id, org_id").eq("id", profileId).single(),
      ]);
      if (!me) {
        setDialogError("Could not load your profile.");
        setCreating(false);
        return;
      }
      const { data: created, error } = await supabase
        .from("work_orders")
        .insert({
          org_id: me.org_id,
          location_id: me.location_id,
          customer_id: chosenCustomerId,
          service_advisor: profileId,
          created_by: profileId,
          default_margin_pct: settings?.default_margin_pct ?? 25,
          taxes: settings?.default_taxes ?? [],
          cc_fee_pct: null,
        })
        .select("id")
        .single();
      if (error || !created) {
        setDialogError(error?.message ?? "Work order was not created.");
        setCreating(false);
        return;
      }
      setDialogOpen(false);
      router.push(`/dashboard/work-orders/${created.id}`);
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : "Unknown error");
      setCreating(false);
    }
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Work Orders</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Create and manage customer-facing work orders
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => {
              setChosenCustomerId("");
              setDialogError(null);
              setDialogOpen(true);
            }}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-[#060a12] transition-colors hover:bg-[#d4b87e]"
          >
            New Work Order
          </button>
        )}
      </div>

      {/* Status filter chips */}
      <div className="mb-4 flex gap-2">
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.value}
            onClick={() => setFilter(chip.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === chip.value
                ? "border-gold bg-gold-muted text-gold"
                : "border-border-line text-text-secondary hover:border-gold/30 hover:text-text-primary"
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border-line bg-card-bg">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-line bg-secondary-bg">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  WO #
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Boat
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Amount Due
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-line">
              {filtered.length > 0 ? (
                filtered.map((row) => {
                  const totals = computeTotals(toTotalsInput(row as never));
                  const balanceRed =
                    totals.balanceDue > 0 &&
                    (row.status === "completed" || row.status === "invoiced");
                  return (
                    <tr
                      key={row.id}
                      onClick={() => router.push(`/dashboard/work-orders/${row.id}`)}
                      className="cursor-pointer transition-colors hover:bg-white/5"
                    >
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gold">
                        WO-{row.wo_number}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                        {formatDate(row.wo_date)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-text-primary">
                        {(row.customers as { name: string } | null)?.name ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-text-secondary">
                        {(row.boats as { name: string } | null)?.name ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                            statusColor(row.status)
                          )}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-text-primary">
                        {fmtUSD(totals.amountDue)}
                      </td>
                      <td
                        className={cn(
                          "whitespace-nowrap px-6 py-4 text-right text-sm",
                          balanceRed ? "text-red-400" : "text-text-secondary"
                        )}
                      >
                        {fmtUSD(totals.balanceDue)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-12 text-center text-sm text-text-secondary"
                  >
                    No work orders yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Work Order Dialog */}
      <Dialog.Root
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) setDialogOpen(false);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[400px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[#1a2236] bg-[#0d1320] p-6 text-white">
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="text-xl" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                New Work Order
              </Dialog.Title>
              <Dialog.Close
                aria-label="Close"
                className="text-[#8892A5] hover:text-white"
              >
                <X size={18} />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Create a new work order by selecting a customer.
            </Dialog.Description>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-[#8892A5]">
                  Customer
                </span>
                <select
                  required
                  value={chosenCustomerId}
                  onChange={(e) => setChosenCustomerId(e.target.value)}
                  className="w-full rounded-md border border-[#1a2236] bg-[#060a12] px-3 py-2 text-sm text-white focus:border-[#C9A96E] focus:outline-none"
                >
                  <option value="">Select customer…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              {dialogError && (
                <p className="text-sm text-red-400">{dialogError}</p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close className="px-4 py-2 text-sm text-[#8892A5] hover:text-white">
                Cancel
              </Dialog.Close>
              <button
                disabled={!chosenCustomerId || creating}
                onClick={handleCreate}
                className="rounded-md bg-[#C9A96E] px-4 py-2 text-sm font-semibold text-[#060a12] disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
