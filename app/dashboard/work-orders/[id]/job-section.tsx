"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { laborForJob, linePrice, fmtUSD } from "@/lib/work-orders/totals";
import type { WOJob, WOLine, PriceLevel, LineKind } from "@/lib/work-orders/types";

// ── Types ──────────────────────────────────────────────────────────────────────

type Props = {
  job: WOJob;
  index: number;
  subtotal: number;
  defaultMarginPct: number;
  canEdit: boolean;
  hideCosts: boolean;
  priceLevels: PriceLevel[];
  staff: { id: string; full_name: string }[];
  shopSuppliesAmount: number;
  onEdit: () => void;
};

// ── Labor description helper ───────────────────────────────────────────────────

function laborDescription(job: WOJob): string {
  const rate = Number(job.price_levels?.rate ?? 0);
  if (job.job_type === "flat") return "Flat Rate";
  if (job.job_type === "per_foot") {
    return `Per Foot × ${job.boat_length_ft ?? 0} ft @ $${rate.toFixed(2)}/ft`;
  }
  // frh
  return `Hourly Rate — $${rate.toFixed(2)}/hr × ${job.hours ?? 0} hrs`;
}

function laborQty(job: WOJob): string {
  if (job.job_type === "flat") return "1";
  if (job.job_type === "per_foot") return String(job.boat_length_ft ?? 0);
  return String(job.hours ?? 0);
}

function laborUnitPrice(job: WOJob): string {
  const rate = Number(job.price_levels?.rate ?? 0);
  if (job.job_type === "flat") return fmtUSD(Number(job.flat_price ?? 0));
  return fmtUSD(rate);
}

// ── Job status display ─────────────────────────────────────────────────────────

function statusLabel(s: string): string {
  return s === "awaiting_customer"
    ? "Awaiting Customer"
    : s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

// ── LineRow — keyed per line, stable controlled state ──────────────────────────

type LineRowProps = {
  line: WOLine;
  defaultMarginPct: number;
  canEdit: boolean;
  hideCosts: boolean;
  onDelete: (id: string) => void;
};

function LineRow({ line, defaultMarginPct, canEdit, hideCosts, onDelete }: LineRowProps) {
  const router = useRouter();

  const [itemCode, setItemCode] = useState(line.item_code ?? "");
  const [description, setDescription] = useState(line.description ?? "");
  const [unitCost, setUnitCost] = useState(String(line.unit_cost));
  const [marginInput, setMarginInput] = useState(
    line.margin_pct != null ? String(line.margin_pct) : ""
  );
  const [qty, setQty] = useState(String(line.qty));
  const [taxable, setTaxable] = useState(line.taxable);

  // Resync if line prop changes (after refresh)
  useEffect(() => {
    setItemCode(line.item_code ?? "");
    setDescription(line.description ?? "");
    setUnitCost(String(line.unit_cost));
    setMarginInput(line.margin_pct != null ? String(line.margin_pct) : "");
    setQty(String(line.qty));
    setTaxable(line.taxable);
  }, [line]);

  async function patch(fields: Record<string, unknown>) {
    const supabase = createClient();
    await supabase.from("work_order_lines").update(fields).eq("id", line.id);
    router.refresh();
  }

  // Compute display price for the line using current local state
  const currentLine: WOLine = {
    ...line,
    qty: Number(qty) || 0,
    unit_cost: Number(unitCost) || 0,
    margin_pct: marginInput !== "" ? Number(marginInput) : null,
    taxable,
  };
  const displayPrice = linePrice(currentLine, defaultMarginPct);

  // For hideCosts + part: show customer price instead of cost
  const showCostInput = !hideCosts || line.kind !== "part";
  const showMarginCol = !hideCosts;

  return (
    <tr className="border-t border-border-line text-sm">
      {/* Item code */}
      <td className="px-3 py-2">
        {canEdit ? (
          <input
            type="text"
            value={itemCode}
            onChange={(e) => setItemCode(e.target.value)}
            onBlur={() => patch({ item_code: itemCode.trim() || null })}
            placeholder="Part #"
            className="w-24 rounded border border-border-line bg-secondary-bg px-2 py-1 text-xs text-text-primary placeholder-text-secondary"
          />
        ) : (
          <span className="text-text-secondary">{line.item_code ?? "—"}</span>
        )}
      </td>

      {/* Description */}
      <td className="px-3 py-2">
        {canEdit ? (
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => patch({ description: description.trim() || null })}
            placeholder="Description"
            className="w-full min-w-[120px] rounded border border-border-line bg-secondary-bg px-2 py-1 text-xs text-text-primary placeholder-text-secondary"
          />
        ) : (
          <span className="text-text-secondary">{line.description ?? "—"}</span>
        )}
      </td>

      {/* Cost / Price */}
      <td className="px-3 py-2 whitespace-nowrap">
        {canEdit && showCostInput ? (
          <input
            type="number"
            step="0.01"
            min="0"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            onBlur={() => patch({ unit_cost: Number(unitCost) })}
            className="w-24 rounded border border-border-line bg-secondary-bg px-2 py-1 text-xs text-text-primary"
          />
        ) : hideCosts && line.kind === "part" ? (
          // Viewer sees customer price for parts
          <span className="text-text-primary">{fmtUSD(displayPrice / (Number(qty) || 1))}</span>
        ) : (
          <span className="text-text-secondary">{fmtUSD(Number(line.unit_cost))}</span>
        )}
      </td>

      {/* Margin % — hidden for viewers */}
      {showMarginCol && (
        <td className="px-3 py-2 whitespace-nowrap">
          {canEdit && line.kind === "part" ? (
            <input
              type="number"
              step="1"
              value={marginInput}
              onChange={(e) => setMarginInput(e.target.value)}
              onBlur={() => patch({ margin_pct: marginInput !== "" ? Number(marginInput) : null })}
              placeholder={String(defaultMarginPct)}
              className="w-16 rounded border border-border-line bg-secondary-bg px-2 py-1 text-xs text-text-primary placeholder-text-secondary"
            />
          ) : canEdit ? (
            <input
              type="number"
              step="1"
              value={marginInput}
              onChange={(e) => setMarginInput(e.target.value)}
              onBlur={() => patch({ margin_pct: marginInput !== "" ? Number(marginInput) : null })}
              placeholder="0"
              className="w-16 rounded border border-border-line bg-secondary-bg px-2 py-1 text-xs text-text-primary placeholder-text-secondary"
            />
          ) : (
            <span className="text-text-secondary">
              {line.margin_pct != null ? `${line.margin_pct}%` : "—"}
            </span>
          )}
        </td>
      )}

      {/* Qty */}
      <td className="px-3 py-2">
        {canEdit ? (
          <input
            type="number"
            step="0.01"
            min="0"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onBlur={() => patch({ qty: Number(qty) })}
            className="w-16 rounded border border-border-line bg-secondary-bg px-2 py-1 text-xs text-text-primary"
          />
        ) : (
          <span className="text-text-secondary">{line.qty}</span>
        )}
      </td>

      {/* Taxable */}
      <td className="px-3 py-2 text-center">
        <input
          type="checkbox"
          title="Taxable"
          checked={taxable}
          disabled={!canEdit}
          onChange={(e) => {
            setTaxable(e.target.checked);
            patch({ taxable: e.target.checked });
          }}
          className="accent-gold"
        />
      </td>

      {/* Total */}
      <td className="px-3 py-2 text-right whitespace-nowrap text-text-primary">
        {fmtUSD(displayPrice)}
      </td>

      {/* Delete */}
      {canEdit && (
        <td className="px-3 py-2 text-center">
          <button
            onClick={() => onDelete(line.id)}
            className="text-text-secondary hover:text-red-400 transition-colors"
            aria-label="Delete line"
          >
            <X size={13} />
          </button>
        </td>
      )}
    </tr>
  );
}

// ── AddItemRow ─────────────────────────────────────────────────────────────────

type AddItemRowProps = {
  jobId: string;
  nextPosition: number;
  shopSuppliesAmount: number;
  colSpan: number;
};

function AddItemRow({ jobId, nextPosition, shopSuppliesAmount, colSpan }: AddItemRowProps) {
  const router = useRouter();
  const [kind, setKind] = useState<LineKind>("part");
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    setAdding(true);
    const supabase = createClient();
    await supabase.from("work_order_lines").insert({
      work_order_job_id: jobId,
      kind,
      description: kind === "shop_supplies" ? "Sealant, Zip Ties, Rags, Cleaning Products, Etc." : null,
      qty: 1,
      unit_cost: kind === "shop_supplies" ? shopSuppliesAmount : 0,
      position: nextPosition,
    });
    setAdding(false);
    router.refresh();
  }

  return (
    <tr className="border-t border-border-line bg-card-bg/50">
      <td colSpan={colSpan} className="px-3 py-2">
        <div className="flex items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as LineKind)}
            className="rounded border border-border-line bg-secondary-bg px-2 py-1 text-xs text-text-primary"
          >
            <option value="part">Part</option>
            <option value="shipping">Shipping &amp; Handling</option>
            <option value="flat_service">Flat Service</option>
            <option value="other">Other</option>
            <option value="shop_supplies">Shop Supplies</option>
          </select>
          <button
            onClick={handleAdd}
            disabled={adding}
            className="rounded border border-border-line px-2 py-1 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
          >
            {adding ? "Adding…" : "+ Add Item"}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── JobSection ─────────────────────────────────────────────────────────────────

export function JobSection({
  job,
  index,
  subtotal,
  defaultMarginPct,
  canEdit,
  hideCosts,
  shopSuppliesAmount,
  onEdit,
}: Props) {
  const router = useRouter();

  const assignedTechName = job.profiles?.full_name ?? "TBD";
  const lines = job.work_order_lines ?? [];
  const hasShopSupplies = lines.some((l) => l.kind === "shop_supplies");

  // Build labor TotalsJob inline for laborForJob
  const laborJob = {
    job_type: job.job_type,
    hours: job.hours == null ? null : Number(job.hours),
    flat_price: job.flat_price == null ? null : Number(job.flat_price),
    boat_length_ft: job.boat_length_ft == null ? null : Number(job.boat_length_ft),
    rate: Number(job.price_levels?.rate ?? 0),
    rate_unit: (job.price_levels?.unit ?? "hour") as "hour" | "foot",
    labor_taxable: job.labor_taxable,
    lines: [],
  };
  const laborTotal = laborForJob(laborJob);

  // Columns: Item / Description / Cost(or Price) / [Margin%] / Qty / Tax / Total / [Delete]
  // hideCosts removes the Margin column
  const showMarginCol = !hideCosts;
  const colSpan = 5 + (showMarginCol ? 1 : 0) + (canEdit ? 1 : 0) + 1; // +1 for tax, +1 for total

  async function handleDeleteLine(lineId: string) {
    const supabase = createClient();
    await supabase.from("work_order_lines").delete().eq("id", lineId);
    router.refresh();
  }

  async function handleShopSuppliesToggle(checked: boolean) {
    const supabase = createClient();
    if (!checked) {
      // Remove all shop_supplies lines for this job
      const shopIds = lines.filter((l) => l.kind === "shop_supplies").map((l) => l.id);
      if (shopIds.length > 0) {
        await supabase.from("work_order_lines").delete().in("id", shopIds);
      }
    } else {
      // Add the default shop supplies line
      const nextPos = lines.length > 0 ? Math.max(...lines.map((l) => l.position)) + 1 : 0;
      await supabase.from("work_order_lines").insert({
        work_order_job_id: job.id,
        kind: "shop_supplies",
        description: "Sealant, Zip Ties, Rags, Cleaning Products, Etc.",
        qty: 1,
        unit_cost: shopSuppliesAmount,
        position: nextPos,
      });
    }
    router.refresh();
  }

  const nextPosition =
    lines.length > 0 ? Math.max(...lines.map((l) => l.position)) + 1 : 0;

  return (
    <div className="rounded-xl border border-border-line bg-card-bg overflow-hidden">
      {/* ── Header bar ──────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "bg-gold/80 px-4 py-2 flex items-center justify-between gap-3",
          canEdit && "cursor-pointer hover:bg-gold/90 transition-colors"
        )}
        onClick={canEdit ? onEdit : undefined}
        role={canEdit ? "button" : undefined}
        tabIndex={canEdit ? 0 : undefined}
        onKeyDown={canEdit ? (e) => { if (e.key === "Enter" || e.key === " ") onEdit(); } : undefined}
        aria-label={canEdit ? `Edit job ${index + 1}: ${job.title}` : undefined}
      >
        <span className="font-semibold text-[#0a0f1a]">
          {index + 1}&nbsp;&nbsp;{job.title}
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-[#0a0f1a]/80">{assignedTechName}</span>
          {job.customer_status === "estimate" && (
            <span className="rounded border border-[#0a0f1a]/40 px-1.5 py-0.5 text-[10px] font-semibold text-[#0a0f1a] uppercase tracking-wider">
              ESTIMATE
            </span>
          )}
          {job.job_status !== "open" && (
            <span className="rounded border border-[#0a0f1a]/40 px-1.5 py-0.5 text-[10px] font-semibold text-[#0a0f1a] uppercase tracking-wider">
              {statusLabel(job.job_status)}
            </span>
          )}
          {canEdit && (
            <span className="text-xs text-[#0a0f1a]/60">Edit</span>
          )}
        </div>
      </div>

      {/* ── Lines table ─────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-line bg-secondary-bg/50 text-left">
              <th className="px-3 py-2 text-xs font-medium text-text-secondary">Item</th>
              <th className="px-3 py-2 text-xs font-medium text-text-secondary">Description</th>
              <th className="px-3 py-2 text-xs font-medium text-text-secondary whitespace-nowrap">
                {hideCosts ? "Price" : "Cost"}
              </th>
              {showMarginCol && (
                <th className="px-3 py-2 text-xs font-medium text-text-secondary">Margin %</th>
              )}
              <th className="px-3 py-2 text-xs font-medium text-text-secondary">Qty</th>
              <th className="px-3 py-2 text-xs font-medium text-text-secondary text-center">Tax</th>
              <th className="px-3 py-2 text-xs font-medium text-text-secondary text-right">Total</th>
              {canEdit && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {/* Labor row — read-only */}
            <tr className="border-t border-border-line bg-secondary-bg/20">
              <td className="px-3 py-2 text-text-secondary text-sm">Labor</td>
              <td className="px-3 py-2 text-text-secondary text-sm whitespace-nowrap">
                {laborDescription(job)}
              </td>
              <td className="px-3 py-2 text-text-secondary text-sm whitespace-nowrap">
                {laborUnitPrice(job)}
              </td>
              {showMarginCol && <td className="px-3 py-2 text-text-secondary text-sm">—</td>}
              <td className="px-3 py-2 text-text-secondary text-sm">{laborQty(job)}</td>
              <td className="px-3 py-2 text-center">
                <input type="checkbox" checked={job.labor_taxable} readOnly disabled className="accent-gold" />
              </td>
              <td className="px-3 py-2 text-right text-text-primary font-medium">
                {fmtUSD(laborTotal)}
              </td>
              {canEdit && <td />}
            </tr>

            {/* Line item rows */}
            {lines.map((line) => (
              <LineRow
                key={line.id}
                line={line}
                defaultMarginPct={defaultMarginPct}
                canEdit={canEdit}
                hideCosts={hideCosts}
                onDelete={handleDeleteLine}
              />
            ))}

            {/* Add Item row (canEdit) */}
            {canEdit && (
              <AddItemRow
                jobId={job.id}
                nextPosition={nextPosition}
                shopSuppliesAmount={shopSuppliesAmount}
                colSpan={colSpan}
              />
            )}

            {/* Subtotal footer */}
            <tr className="border-t border-border-line bg-secondary-bg/30">
              <td
                colSpan={colSpan - 1}
                className="px-3 py-2 text-right text-xs font-semibold text-text-secondary"
              >
                Subtotal
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
                {fmtUSD(subtotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Footer controls ──────────────────────────────────────────────────── */}
      {canEdit && (
        <div className="flex items-center justify-between border-t border-border-line px-4 py-2">
          {/* Shop Supplies toggle */}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={hasShopSupplies}
              onChange={(e) => handleShopSuppliesToggle(e.target.checked)}
              className="accent-gold"
            />
            <span className="text-xs text-text-secondary">Shop Supplies</span>
          </label>

          {/* Delete job */}
          <button
            onClick={async () => {
              const confirmed = confirm(`Delete job "${job.title}" and all its lines?`);
              if (!confirmed) return;
              const supabase = createClient();
              await supabase.from("work_order_jobs").delete().eq("id", job.id);
              router.refresh();
            }}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Delete job
          </button>
        </div>
      )}
    </div>
  );
}
