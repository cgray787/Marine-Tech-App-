"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PriceLevel } from "@/lib/work-orders/types";

type Props = {
  priceLevels: PriceLevel[];
  orgId: string;
};

type RowState = {
  name: string;
  rate: string;
  unit: "hour" | "foot";
  active: boolean;
};

export function PriceLevelsCard({ priceLevels, orgId }: Props) {
  const router = useRouter();
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [addName, setAddName] = useState("");
  const [addRate, setAddRate] = useState("0");
  const [addUnit, setAddUnit] = useState<"hour" | "foot">("hour");
  const [adding, setAdding] = useState(false);

  // Sync controlled row state from props
  useEffect(() => {
    const state: Record<string, RowState> = {};
    for (const pl of priceLevels) {
      state[pl.id] = {
        name: pl.name,
        rate: String(pl.rate),
        unit: pl.unit,
        active: pl.active,
      };
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRowState(state);
  }, [priceLevels]);

  function setField(id: string, field: keyof RowState, value: string | boolean) {
    setRowState((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function patchRow(pl: PriceLevel) {
    const s = rowState[pl.id];
    if (!s) return;
    if (!s.name.trim()) { setError("Name cannot be empty."); return; }
    const rateV = Number(s.rate);
    if (s.rate.trim() === "" || isNaN(rateV)) {
      setField(pl.id, "rate", String(pl.rate));
      return;
    }
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("price_levels")
      .update({ name: s.name.trim(), rate: rateV, unit: s.unit, active: s.active })
      .eq("id", pl.id);
    if (err) { setError(err.message); return; }
    router.refresh();
  }

  async function handleAdd() {
    if (!addName.trim()) { setError("Name is required."); return; }
    setAdding(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("price_levels")
      .insert({ org_id: orgId, name: addName.trim(), rate: Number(addRate), unit: addUnit });
    if (err) { setError(err.message); setAdding(false); return; }
    setAddName("");
    setAddRate("0");
    setAddUnit("hour");
    setAdding(false);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border-line bg-card-bg">
      <div className="border-b border-border-line px-6 py-4">
        <h2 className="text-base font-semibold text-text-primary">Price Levels</h2>
        <p className="mt-0.5 text-xs text-text-secondary">
          Labor rates used when calculating job charges.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-line bg-secondary-bg text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
              <th className="px-6 py-3">Name</th>
              <th className="px-6 py-3">Rate ($)</th>
              <th className="px-6 py-3">Unit</th>
              <th className="px-6 py-3 text-center">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-line">
            {priceLevels.map((pl) => {
              const s = rowState[pl.id];
              if (!s) return null;
              const dimmed = !s.active;
              return (
                <tr key={pl.id} className={dimmed ? "opacity-60" : undefined}>
                  <td className="px-6 py-3">
                    <input
                      type="text"
                      value={s.name}
                      onChange={(e) => setField(pl.id, "name", e.target.value)}
                      onBlur={() => patchRow(pl)}
                      className="w-full rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary"
                    />
                  </td>
                  <td className="px-6 py-3">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={s.rate}
                      onChange={(e) => setField(pl.id, "rate", e.target.value)}
                      onBlur={() => patchRow(pl)}
                      className="w-24 rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary"
                    />
                  </td>
                  <td className="px-6 py-3">
                    <select
                      value={s.unit}
                      onChange={(e) => {
                        setField(pl.id, "unit", e.target.value as "hour" | "foot");
                        // patch immediately on change since it's a select
                        const supabase = createClient();
                        supabase
                          .from("price_levels")
                          .update({ unit: e.target.value })
                          .eq("id", pl.id)
                          .then(({ error: err }) => {
                            if (err) setError(err.message);
                            else router.refresh();
                          });
                      }}
                      className="rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary"
                    >
                      <option value="hour">per hour</option>
                      <option value="foot">per foot</option>
                    </select>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={s.active}
                      className="accent-gold"
                      onChange={(e) => {
                        setField(pl.id, "active", e.target.checked);
                        const supabase = createClient();
                        supabase
                          .from("price_levels")
                          .update({ active: e.target.checked })
                          .eq("id", pl.id)
                          .then(({ error: err }) => {
                            if (err) setError(err.message);
                            else router.refresh();
                          });
                      }}
                    />
                  </td>
                </tr>
              );
            })}

            {/* Add row */}
            <tr className="border-t border-border-line bg-secondary-bg/50">
              <td className="px-6 py-3">
                <input
                  type="text"
                  placeholder="New price level name"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="w-full rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary placeholder-text-secondary"
                />
              </td>
              <td className="px-6 py-3">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={addRate}
                  onChange={(e) => setAddRate(e.target.value)}
                  className="w-24 rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary"
                />
              </td>
              <td className="px-6 py-3">
                <select
                  value={addUnit}
                  onChange={(e) => setAddUnit(e.target.value as "hour" | "foot")}
                  className="rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary"
                >
                  <option value="hour">per hour</option>
                  <option value="foot">per foot</option>
                </select>
              </td>
              <td className="px-6 py-3 text-center">
                <button
                  onClick={handleAdd}
                  disabled={adding || !addName.trim()}
                  className="rounded-lg border border-border-line px-3 py-1 text-xs text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors"
                >
                  {adding ? "Adding…" : "Add"}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {error && <p className="px-6 pb-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
