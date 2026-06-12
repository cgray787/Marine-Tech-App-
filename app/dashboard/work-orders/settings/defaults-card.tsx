"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { WOSettings, TaxEntry } from "@/lib/work-orders/types";

type Props = {
  woSettings: WOSettings | null;
  orgId: string;
};

export function DefaultsCard({ woSettings, orgId }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  // Controlled numeric inputs
  const [shopSupplies, setShopSupplies] = useState(
    String(woSettings?.shop_supplies_amount ?? 75)
  );
  const [marginPct, setMarginPct] = useState(
    String(woSettings?.default_margin_pct ?? 25)
  );
  const [ccFeePct, setCcFeePct] = useState(
    String(woSettings?.default_cc_fee_pct ?? 3)
  );

  // Taxes
  const [taxes, setTaxes] = useState<TaxEntry[]>(woSettings?.default_taxes ?? []);

  // Add tax form
  const [newTaxName, setNewTaxName] = useState("");
  const [newTaxRate, setNewTaxRate] = useState("");

  // Re-sync from props when server refreshes
  useEffect(() => {
    if (!woSettings) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShopSupplies(String(woSettings.shop_supplies_amount));
    setMarginPct(String(woSettings.default_margin_pct));
    setCcFeePct(String(woSettings.default_cc_fee_pct));
    setTaxes(woSettings.default_taxes ?? []);
  }, [woSettings]);

  async function patchSettings(fields: Record<string, unknown>) {
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("wo_settings")
      .upsert({ org_id: orgId, ...fields }, { onConflict: "org_id" });
    if (err) { setError(err.message); return; }
    router.refresh();
  }

  async function patchTaxes(updated: TaxEntry[]) {
    setTaxes(updated);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("wo_settings")
      .upsert({ org_id: orgId, default_taxes: updated }, { onConflict: "org_id" });
    if (err) { setError(err.message); return; }
    router.refresh();
  }

  function removeTax(idx: number) {
    patchTaxes(taxes.filter((_, i) => i !== idx));
  }

  function addTax() {
    const rate = Number(newTaxRate);
    if (!newTaxName.trim() || isNaN(rate) || rate <= 0) return;
    const updated = [...taxes, { name: newTaxName.trim(), rate_pct: rate }];
    patchTaxes(updated);
    setNewTaxName("");
    setNewTaxRate("");
  }

  return (
    <div className="rounded-xl border border-border-line bg-card-bg">
      <div className="border-b border-border-line px-6 py-4">
        <h2 className="text-base font-semibold text-text-primary">Defaults</h2>
        <p className="mt-0.5 text-xs text-text-secondary">
          Applied to new work orders unless overridden per-WO.
        </p>
      </div>

      <div className="divide-y divide-border-line">
        {/* Numeric defaults */}
        <div className="space-y-4 p-6">
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-text-secondary">Shop supplies ($)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={shopSupplies}
              onChange={(e) => setShopSupplies(e.target.value)}
              onBlur={() => {
                const v = Number(shopSupplies);
                if (shopSupplies.trim() === "" || isNaN(v)) {
                  setShopSupplies(String(woSettings?.shop_supplies_amount ?? 75));
                  return;
                }
                patchSettings({ shop_supplies_amount: v });
              }}
              className="w-28 rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary"
            />
          </label>

          <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-text-secondary">Default margin %</span>
            <input
              type="number"
              step="0.5"
              min="0"
              value={marginPct}
              onChange={(e) => setMarginPct(e.target.value)}
              onBlur={() => {
                const v = Number(marginPct);
                if (marginPct.trim() === "" || isNaN(v)) {
                  setMarginPct(String(woSettings?.default_margin_pct ?? 25));
                  return;
                }
                patchSettings({ default_margin_pct: v });
              }}
              className="w-28 rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary"
            />
          </label>

          <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-text-secondary">Default CC fee %</span>
            <input
              type="number"
              step="0.1"
              min="0"
              value={ccFeePct}
              onChange={(e) => setCcFeePct(e.target.value)}
              onBlur={() => {
                const v = Number(ccFeePct);
                if (ccFeePct.trim() === "" || isNaN(v)) {
                  setCcFeePct(String(woSettings?.default_cc_fee_pct ?? 3));
                  return;
                }
                patchSettings({ default_cc_fee_pct: v });
              }}
              className="w-28 rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary"
            />
          </label>
        </div>

        {/* Default taxes */}
        <div className="p-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Default Taxes
          </p>

          {taxes.length === 0 && (
            <p className="text-xs text-text-secondary">No default taxes configured.</p>
          )}

          {taxes.map((t, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="text-sm text-text-primary">
                {t.name}{" "}
                <span className="text-text-secondary">({t.rate_pct}%)</span>
              </span>
              <button
                onClick={() => removeTax(i)}
                className="text-text-secondary hover:text-red-400 transition-colors"
                aria-label={`Remove ${t.name}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}

          {/* Add tax form */}
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              placeholder="Tax name"
              value={newTaxName}
              onChange={(e) => setNewTaxName(e.target.value)}
              className="flex-1 rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-xs text-text-primary placeholder-text-secondary"
            />
            <input
              type="number"
              step="0.01"
              placeholder="%"
              value={newTaxRate}
              onChange={(e) => setNewTaxRate(e.target.value)}
              className="w-16 rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-xs text-text-primary placeholder-text-secondary"
            />
            <button
              onClick={addTax}
              disabled={!newTaxName.trim() || !newTaxRate}
              className="rounded-lg border border-border-line px-3 py-1 text-xs text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {error && <p className="px-6 pb-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
