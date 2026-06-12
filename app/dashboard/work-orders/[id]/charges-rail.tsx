"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDate } from "@/lib/utils";
import { fmtUSD } from "@/lib/work-orders/totals";
import type { WorkOrderFull, WOSettings, TaxEntry } from "@/lib/work-orders/types";
import type { WOTotals } from "@/lib/work-orders/totals";

// ── Props ──────────────────────────────────────────────────────────────────────

type Props = {
  wo: WorkOrderFull;
  totals: WOTotals;
  canEdit: boolean;
  hideCosts: boolean;
  settings: WOSettings | null;
  patchWO: (fields: Record<string, unknown>) => Promise<void>;
  profileId: string;
};

// ── Section header helper ──────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">
      {children}
    </p>
  );
}

// ── Row helper ─────────────────────────────────────────────────────────────────

function ChargeRow({
  label,
  value,
  bold,
  red,
  gold,
}: {
  label: string;
  value: string;
  bold?: boolean;
  red?: boolean;
  gold?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between py-1", bold && "font-semibold")}>
      <span className={cn("text-sm", bold ? "text-text-primary" : "text-text-secondary")}>
        {label}
      </span>
      <span
        className={cn(
          "text-sm",
          red && "text-red-400",
          gold && "text-gold",
          !red && !gold && (bold ? "text-text-primary" : "text-text-secondary")
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ── ChargesRail ────────────────────────────────────────────────────────────────

export function ChargesRail({ wo, totals, canEdit, hideCosts, settings, patchWO, profileId }: Props) {
  const router = useRouter();

  // ── Controlled inputs synced to server props (#1, #2) ──────────────────────
  const [marginInput, setMarginInput] = useState(String(wo.default_margin_pct));
  useEffect(() => { setMarginInput(String(wo.default_margin_pct)); }, [wo.default_margin_pct]);

  const [ccPctInput, setCcPctInput] = useState(
    String(wo.cc_fee_pct ?? settings?.default_cc_fee_pct ?? 3)
  );
  useEffect(() => {
    setCcPctInput(String(wo.cc_fee_pct ?? settings?.default_cc_fee_pct ?? 3));
  }, [wo.cc_fee_pct, settings?.default_cc_fee_pct]);

  const [ccChecked, setCcChecked] = useState(wo.cc_fee_pct != null);
  useEffect(() => { setCcChecked(wo.cc_fee_pct != null); }, [wo.cc_fee_pct]);

  const [printedNotes, setPrintedNotes] = useState(wo.printed_notes ?? "");
  useEffect(() => { setPrintedNotes(wo.printed_notes ?? ""); }, [wo.printed_notes]);

  const [internalNotes, setInternalNotes] = useState(wo.internal_notes ?? "");
  useEffect(() => { setInternalNotes(wo.internal_notes ?? ""); }, [wo.internal_notes]);

  // Preset tax select state (#8)
  const [presetSelectValue, setPresetSelectValue] = useState("");

  // Custom tax form
  const [customTaxName, setCustomTaxName] = useState("");
  const [customTaxRate, setCustomTaxRate] = useState("");

  // Payment dialog — local-date helper (#5)
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payDate, setPayDate] = useState(today);
  const [payMethod, setPayMethod] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [payLoading, setPayLoading] = useState(false);

  // ── CC fee helpers ──────────────────────────────────────────────────────────
  function handleCcCheck(checked: boolean) {
    setCcChecked(checked);
    const pct = checked ? (Number(ccPctInput) || (settings?.default_cc_fee_pct ?? 3)) : null;
    patchWO({ cc_fee_pct: pct });
  }

  function handleCcPctBlur() {
    if (!ccChecked) return;
    const val = Number(ccPctInput);
    if (!isNaN(val) && val >= 0) patchWO({ cc_fee_pct: val }); // #3: >= 0 (0% is valid)
  }

  // ── Tax helpers ─────────────────────────────────────────────────────────────
  function removeTax(idx: number) {
    const updated = wo.taxes.filter((_, i) => i !== idx);
    patchWO({ taxes: updated });
  }

  function addPresetTax(preset: TaxEntry) {
    const updated = [...wo.taxes, preset];
    patchWO({ taxes: updated });
  }

  function addCustomTax() {
    const rate = Number(customTaxRate);
    if (!customTaxName || isNaN(rate) || rate <= 0) return;
    const updated = [...wo.taxes, { name: customTaxName, rate_pct: rate }];
    patchWO({ taxes: updated });
    setCustomTaxName("");
    setCustomTaxRate("");
  }

  // Preset taxes not yet applied
  const availablePresets = (settings?.default_taxes ?? []).filter(
    (preset) => !wo.taxes.some((t) => t.name === preset.name && t.rate_pct === preset.rate_pct)
  );

  // ── Payment helpers ─────────────────────────────────────────────────────────
  async function handleAddPayment() {
    const amount = Number(payAmount);
    if (isNaN(amount) || amount <= 0) {
      setPayError("Enter a valid amount greater than 0.");
      return;
    }
    setPayLoading(true);
    setPayError(null);
    const supabase = createClient();
    const { error } = await supabase.from("work_order_payments").insert({
      work_order_id: wo.id,
      paid_on: payDate,
      method: payMethod || null,
      note: payNote || null,
      amount,
      recorded_by: profileId,
    });
    if (error) {
      setPayError(error.message);
      setPayLoading(false);
      return;
    }
    setPayDialogOpen(false);
    setPayAmount("");
    setPayMethod("");
    setPayNote("");
    setPayLoading(false);
    router.refresh();
  }

  async function handleDeletePayment(paymentId: string) {
    const confirmed = confirm("Delete this payment record?");
    if (!confirmed) return;
    const supabase = createClient();
    await supabase.from("work_order_payments").delete().eq("id", paymentId);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border-line bg-card-bg divide-y divide-border-line">
      {/* ── 1. Customer Charges ───────────────────────────────────────────── */}
      <div className="p-4">
        <SectionTitle>Customer Charges</SectionTitle>
        {totals.totalLabor > 0 && (
          <ChargeRow label="Total Labor" value={fmtUSD(totals.totalLabor)} />
        )}
        {totals.totalParts > 0 && (
          <ChargeRow label="Total Parts" value={fmtUSD(totals.totalParts)} />
        )}
        {totals.shopSupplies > 0 && (
          <ChargeRow label="Shop Supplies" value={fmtUSD(totals.shopSupplies)} />
        )}
        {totals.shipping > 0 && (
          <ChargeRow label="Shipping &amp; Handling" value={fmtUSD(totals.shipping)} />
        )}
        {totals.other > 0 && (
          <ChargeRow label="Other" value={fmtUSD(totals.other)} />
        )}
        {totals.taxLines.map((tl, i) => (
          <ChargeRow
            key={i}
            label={`${tl.name} (${tl.rate_pct}%)`}
            value={fmtUSD(tl.amount)}
          />
        ))}
        {wo.cc_fee_pct != null && totals.ccFee > 0 && (
          <ChargeRow
            label={`Credit Card Fee (${wo.cc_fee_pct}%)`}
            value={fmtUSD(totals.ccFee)}
          />
        )}
        <div className="my-2 border-t border-border-line" />
        <ChargeRow label="Amount Due" value={fmtUSD(totals.amountDue)} bold gold />
        {totals.amountPaid > 0 && (
          <ChargeRow label="Amount Paid" value={fmtUSD(totals.amountPaid)} />
        )}
        <ChargeRow
          label="Balance Due"
          value={fmtUSD(totals.balanceDue)}
          bold
          red={totals.balanceDue > 0}
        />
      </div>

      {/* ── 2. Pricing controls (canEdit only) ───────────────────────────── */}
      {canEdit && (
        <div className="p-4 space-y-3">
          <SectionTitle>Pricing Controls</SectionTitle>

          {/* Default margin (#1) */}
          <label className="flex items-center gap-2">
            <span className="text-sm text-text-secondary flex-1">Default margin %</span>
            <input
              type="number"
              step="0.5"
              value={marginInput}
              onChange={(e) => setMarginInput(e.target.value)}
              onBlur={() => {
                const val = Number(marginInput);
                if (!isNaN(val) && val !== wo.default_margin_pct) {
                  patchWO({ default_margin_pct: val });
                }
              }}
              className="w-20 rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary"
            />
          </label>

          {/* CC fee */}
          <div className="flex items-center gap-2">
            <input
              id="cc-fee-check"
              type="checkbox"
              checked={ccChecked}
              onChange={(e) => handleCcCheck(e.target.checked)}
              className="accent-gold"
            />
            <label htmlFor="cc-fee-check" className="text-sm text-text-secondary flex-1">
              Credit card fee
            </label>
            <input
              type="number"
              step="0.1"
              value={ccPctInput}
              onChange={(e) => setCcPctInput(e.target.value)}
              disabled={!ccChecked}
              onBlur={handleCcPctBlur}
              className="w-20 rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary disabled:opacity-40"
            />
          </div>
        </div>
      )}

      {/* ── 3. Taxes ──────────────────────────────────────────────────────── */}
      <div className="p-4 space-y-2">
        <SectionTitle>Taxes</SectionTitle>

        {/* Current taxes */}
        {wo.taxes.length === 0 && (
          <p className="text-xs text-text-secondary">No taxes applied.</p>
        )}
        {wo.taxes.map((t, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">
              {t.name} ({t.rate_pct}%)
            </span>
            {canEdit && (
              <button
                onClick={() => removeTax(i)}
                className="text-text-secondary hover:text-red-400 transition-colors"
                aria-label={`Remove ${t.name}`}
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}

        {/* Add preset */}
        {canEdit && availablePresets.length > 0 && (
          <div className="flex gap-2 pt-1">
            <select
              value={presetSelectValue}
              onChange={(e) => setPresetSelectValue(e.target.value)}
              className="flex-1 rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-xs text-text-primary"
            >
              <option value="">Add preset…</option>
              {availablePresets.map((p, i) => (
                <option key={i} value={String(i)}>
                  {p.name} {p.rate_pct}%
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                if (presetSelectValue === "") return;
                addPresetTax(availablePresets[Number(presetSelectValue)]);
                setPresetSelectValue("");
              }}
              className="rounded-lg border border-border-line px-3 py-1 text-xs text-text-secondary hover:text-text-primary"
            >
              Add
            </button>
          </div>
        )}

        {/* Custom tax */}
        {canEdit && (
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              placeholder="Tax name"
              value={customTaxName}
              onChange={(e) => setCustomTaxName(e.target.value)}
              className="flex-1 rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-xs text-text-primary placeholder-text-secondary"
            />
            <input
              type="number"
              step="0.01"
              placeholder="%"
              value={customTaxRate}
              onChange={(e) => setCustomTaxRate(e.target.value)}
              className="w-16 rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-xs text-text-primary placeholder-text-secondary"
            />
            <button
              onClick={addCustomTax}
              className="rounded-lg border border-border-line px-3 py-1 text-xs text-text-secondary hover:text-text-primary"
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* ── 4. Profit (hideCosts guards) ──────────────────────────────────── */}
      {!hideCosts && (
        <div className="p-4">
          <SectionTitle>Internal</SectionTitle>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Profit (internal)</span>
            <span className="text-sm text-gold">{fmtUSD(totals.profit)}</span>
          </div>
        </div>
      )}

      {/* ── 5. Payments ───────────────────────────────────────────────────── */}
      <div className="p-4 space-y-2">
        <SectionTitle>Payments</SectionTitle>

        {(wo.work_order_payments ?? []).length === 0 && (
          <p className="text-xs text-text-secondary">No payments recorded.</p>
        )}

        {(wo.work_order_payments ?? []).map((p) => (
          <div key={p.id} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-text-primary">{fmtUSD(Number(p.amount))}</p>
              <p className="text-xs text-text-secondary">
                {formatDate(p.paid_on)}
                {p.method ? ` · ${p.method}` : ""}
                {p.note ? ` · ${p.note.slice(0, 40)}${p.note.length > 40 ? "…" : ""}` : ""}
              </p>
            </div>
            {canEdit && (
              <button
                onClick={() => handleDeletePayment(p.id)}
                className="mt-0.5 shrink-0 text-text-secondary hover:text-red-400 transition-colors"
                aria-label="Delete payment"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}

        {canEdit && (
          <button
            onClick={() => {
              setPayDate(today());
              setPayAmount("");
              setPayMethod("");
              setPayNote("");
              setPayError(null);
              setPayDialogOpen(true);
            }}
            className="mt-1 rounded-lg border border-border-line px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            + Add Payment
          </button>
        )}
      </div>

      {/* ── 6. Notes ──────────────────────────────────────────────────────── */}
      <div className="p-4 space-y-4">
        <SectionTitle>Notes</SectionTitle>

        <label className="block">
          <span className="mb-1 block text-xs text-text-secondary">
            Printed notes (customer-visible)
          </span>
          <textarea
            rows={3}
            disabled={!canEdit}
            value={printedNotes}
            onChange={(e) => setPrintedNotes(e.target.value)}
            onBlur={() => {
              const val = printedNotes || null;
              if (val !== (wo.printed_notes ?? null)) patchWO({ printed_notes: val });
            }}
            className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary placeholder-text-secondary disabled:opacity-60 resize-none"
            placeholder="Notes visible to the customer…"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-text-secondary">
            Internal notes
          </span>
          <textarea
            rows={3}
            disabled={!canEdit}
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            onBlur={() => {
              const val = internalNotes || null;
              if (val !== (wo.internal_notes ?? null)) patchWO({ internal_notes: val });
            }}
            className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary placeholder-text-secondary disabled:opacity-60 resize-none"
            placeholder="Internal notes (not printed)…"
          />
        </label>
      </div>

      {/* ── Add Payment Dialog ─────────────────────────────────────────────── */}
      <Dialog.Root open={payDialogOpen} onOpenChange={(o) => { if (!o) setPayDialogOpen(false); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[400px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[#1a2236] bg-[#0d1320] p-6 text-white">
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="text-lg font-semibold text-text-primary">
                Add Payment
              </Dialog.Title>
              <Dialog.Close aria-label="Close" className="text-text-secondary hover:text-text-primary">
                <X size={18} />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Record a payment received for this work order.
            </Dialog.Description>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-text-secondary">
                  Date
                </span>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full rounded-md border border-[#1a2236] bg-[#060a12] px-3 py-2 text-sm text-white focus:border-gold focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-text-secondary">
                  Method
                </span>
                <input
                  type="text"
                  placeholder="Check / ACH / Card"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full rounded-md border border-[#1a2236] bg-[#060a12] px-3 py-2 text-sm text-white placeholder-[#8892A5] focus:border-gold focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-text-secondary">
                  Note
                </span>
                <input
                  type="text"
                  placeholder="Optional note"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="w-full rounded-md border border-[#1a2236] bg-[#060a12] px-3 py-2 text-sm text-white placeholder-[#8892A5] focus:border-gold focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-text-secondary">
                  Amount
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full rounded-md border border-[#1a2236] bg-[#060a12] px-3 py-2 text-sm text-white placeholder-[#8892A5] focus:border-gold focus:outline-none"
                />
              </label>

              {payError && <p className="text-sm text-red-400">{payError}</p>}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
                Cancel
              </Dialog.Close>
              <button
                disabled={payLoading || !payAmount}
                onClick={handleAddPayment}
                className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-[#060a12] disabled:opacity-50"
              >
                {payLoading ? "Saving…" : "Save Payment"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
