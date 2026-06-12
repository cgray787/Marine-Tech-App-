"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { JobTemplate, PriceLevel } from "@/lib/work-orders/types";

type Props = {
  jobTemplates: JobTemplate[];
  activePriceLevels: PriceLevel[];
  allPriceLevels: PriceLevel[];
  orgId: string;
};

type RowState = {
  name: string;
  description: string;
  notes_to_tech: string;
  default_hours: string;
  default_price_level_id: string;
  active: boolean;
};

export function TemplatesCard({ jobTemplates, activePriceLevels, allPriceLevels, orgId }: Props) {
  const router = useRouter();
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [addName, setAddName] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addHours, setAddHours] = useState("");
  const [addPriceLevel, setAddPriceLevel] = useState("");
  const [adding, setAdding] = useState(false);

  // Sync controlled row state from props
  useEffect(() => {
    const state: Record<string, RowState> = {};
    for (const t of jobTemplates) {
      state[t.id] = {
        name: t.name,
        description: t.description ?? "",
        notes_to_tech: t.notes_to_tech ?? "",
        default_hours: t.default_hours != null ? String(t.default_hours) : "",
        default_price_level_id: t.default_price_level_id ?? "",
        active: t.active,
      };
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRowState(state);
  }, [jobTemplates]);

  function setField(id: string, field: keyof RowState, value: string | boolean) {
    setRowState((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function patchRow(t: JobTemplate) {
    const s = rowState[t.id];
    if (!s) return;
    if (!s.name.trim()) { setError("Name cannot be empty."); return; }
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("job_templates")
      .update({
        name: s.name.trim(),
        description: s.description.trim() || null,
        notes_to_tech: s.notes_to_tech.trim() || null,
        default_hours: s.default_hours !== "" ? Number(s.default_hours) : null,
        default_price_level_id: s.default_price_level_id || null,
        active: s.active,
      })
      .eq("id", t.id);
    if (err) { setError(err.message); return; }
    router.refresh();
  }

  async function patchField(id: string, fields: Record<string, unknown>) {
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("job_templates")
      .update(fields)
      .eq("id", id);
    if (err) { setError(err.message); return; }
    router.refresh();
  }

  async function handleAdd() {
    if (!addName.trim()) { setError("Name is required."); return; }
    setAdding(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("job_templates").insert({
      org_id: orgId,
      name: addName.trim(),
      description: addDesc.trim() || null,
      notes_to_tech: addNotes.trim() || null,
      default_hours: addHours !== "" ? Number(addHours) : null,
      default_price_level_id: addPriceLevel || null,
    });
    if (err) { setError(err.message); setAdding(false); return; }
    setAddName("");
    setAddDesc("");
    setAddNotes("");
    setAddHours("");
    setAddPriceLevel("");
    setAdding(false);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border-line bg-card-bg">
      <div className="border-b border-border-line px-6 py-4">
        <h2 className="text-base font-semibold text-text-primary">Job Templates</h2>
        <p className="mt-0.5 text-xs text-text-secondary">
          Reusable job starters. Deactivating hides from the template picker.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-line bg-secondary-bg text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Notes to Tech</th>
              <th className="px-4 py-3">Hrs</th>
              <th className="px-4 py-3">Price Level</th>
              <th className="px-4 py-3 text-center">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-line">
            {jobTemplates.map((t) => {
              const s = rowState[t.id];
              if (!s) return null;
              const dimmed = !s.active;
              return (
                <tr key={t.id} className={dimmed ? "opacity-60" : undefined}>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={s.name}
                      onChange={(e) => setField(t.id, "name", e.target.value)}
                      onBlur={() => patchRow(t)}
                      className="w-full min-w-[140px] rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={s.description}
                      onChange={(e) => setField(t.id, "description", e.target.value)}
                      onBlur={() => patchRow(t)}
                      placeholder="—"
                      className="w-full min-w-[160px] rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary placeholder-text-secondary"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={s.notes_to_tech}
                      onChange={(e) => setField(t.id, "notes_to_tech", e.target.value)}
                      onBlur={() => patchRow(t)}
                      placeholder="—"
                      className="w-full min-w-[180px] rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary placeholder-text-secondary"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={s.default_hours}
                      onChange={(e) => setField(t.id, "default_hours", e.target.value)}
                      onBlur={() => patchRow(t)}
                      placeholder="—"
                      className="w-20 rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={s.default_price_level_id}
                      onChange={(e) => {
                        setField(t.id, "default_price_level_id", e.target.value);
                        patchField(t.id, { default_price_level_id: e.target.value || null });
                      }}
                      className="rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary"
                    >
                      <option value="">—</option>
                      {activePriceLevels.map((pl) => (
                        <option key={pl.id} value={pl.id}>
                          {pl.name}
                        </option>
                      ))}
                      {/* Render current value as a disabled option if it refers to an inactive level */}
                      {(() => {
                        const currentId = s.default_price_level_id;
                        if (!currentId) return null;
                        const isActive = activePriceLevels.some((pl) => pl.id === currentId);
                        if (isActive) return null;
                        const inactivePl = allPriceLevels.find((pl) => pl.id === currentId);
                        if (!inactivePl) return null;
                        return (
                          <option key={inactivePl.id} value={inactivePl.id} disabled>
                            {inactivePl.name} (inactive)
                          </option>
                        );
                      })()}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={s.active}
                      className="accent-gold"
                      onChange={(e) => {
                        setField(t.id, "active", e.target.checked);
                        patchField(t.id, { active: e.target.checked });
                      }}
                    />
                  </td>
                </tr>
              );
            })}

            {/* Add row */}
            <tr className="border-t border-border-line bg-secondary-bg/50">
              <td className="px-4 py-3">
                <input
                  type="text"
                  placeholder="Template name"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="w-full min-w-[140px] rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary placeholder-text-secondary"
                />
              </td>
              <td className="px-4 py-3">
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={addDesc}
                  onChange={(e) => setAddDesc(e.target.value)}
                  className="w-full min-w-[160px] rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary placeholder-text-secondary"
                />
              </td>
              <td className="px-4 py-3">
                <input
                  type="text"
                  placeholder="Notes (optional)"
                  value={addNotes}
                  onChange={(e) => setAddNotes(e.target.value)}
                  className="w-full min-w-[180px] rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary placeholder-text-secondary"
                />
              </td>
              <td className="px-4 py-3">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="—"
                  value={addHours}
                  onChange={(e) => setAddHours(e.target.value)}
                  className="w-20 rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary"
                />
              </td>
              <td className="px-4 py-3">
                <select
                  value={addPriceLevel}
                  onChange={(e) => setAddPriceLevel(e.target.value)}
                  className="rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-sm text-text-primary"
                >
                  <option value="">—</option>
                  {activePriceLevels.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-3 text-center">
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
