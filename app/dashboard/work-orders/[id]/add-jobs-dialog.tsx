"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { JobTemplate, PriceLevel, WOSettings } from "@/lib/work-orders/types";

// ── Props ──────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  woId: string;
  templates: JobTemplate[];
  priceLevels: PriceLevel[];
  settings: WOSettings | null;
  startPosition: number; // current jobs count
};

// ── AddJobsDialog ──────────────────────────────────────────────────────────────

export function AddJobsDialog({
  open,
  onOpenChange,
  woId,
  templates,
  priceLevels,
  settings,
  startPosition,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [blankTitle, setBlankTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const defaultLevelId = priceLevels[0]?.id ?? null;

  const filtered = templates.filter((t) =>
    t.name.toLowerCase().includes(query.toLowerCase())
  );

  function toggleTemplate(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Build list of templates to add in original list order
  function getOrderedSelected(): JobTemplate[] {
    return templates.filter((t) => selected.has(t.id));
  }

  function priceLevelLabel(t: JobTemplate): string {
    if (!t.default_price_level_id) return "no rate";
    const pl = priceLevels.find((p) => p.id === t.default_price_level_id);
    return pl ? pl.name : "no rate";
  }

  async function handleDone() {
    const toAdd = getOrderedSelected();
    const hasBlank = blankTitle.trim().length > 0;
    if (toAdd.length === 0 && !hasBlank) {
      onOpenChange(false);
      return;
    }
    setLoading(true);
    setDialogError(null);
    const supabase = createClient();
    let i = 0;
    let earlyExit = false;

    // Insert selected templates
    for (const t of toAdd) {
      const position = startPosition + i;
      const { data: jobRow, error } = await supabase
        .from("work_order_jobs")
        .insert({
          work_order_id: woId,
          position,
          title: t.name,
          description: t.description,
          notes_to_tech: t.notes_to_tech,
          job_type: "frh",
          hours: t.default_hours,
          price_level_id: t.default_price_level_id ?? defaultLevelId,
        })
        .select("id")
        .single();

      if (error || !jobRow) {
        router.refresh();
        setDialogError(error?.message ?? "Failed to add job");
        setLoading(false);
        return;
      }

      const { error: lineError } = await supabase.from("work_order_lines").insert({
        work_order_job_id: jobRow.id,
        kind: "shop_supplies",
        description: "Sealant, Zip Ties, Rags, Cleaning Products, Etc.",
        qty: 1,
        unit_cost: settings?.shop_supplies_amount ?? 75,
        position: 0,
      });

      if (lineError) {
        earlyExit = true;
        router.refresh();
        setDialogError(`Job "${t.name}" was added but its Shop Supplies line failed: ${lineError.message}`);
        setLoading(false);
        break;
      }

      // Remove successfully inserted template from selection
      setSelected(prev => { const n = new Set(prev); n.delete(t.id); return n; });
      i++;
    }

    // Insert blank job if title provided (skip if template loop exited early on error)
    if (!earlyExit && hasBlank) {
      const position = startPosition + i;
      const title = blankTitle.trim();
      const { data: jobRow, error } = await supabase
        .from("work_order_jobs")
        .insert({
          work_order_id: woId,
          position,
          title,
          description: null,
          notes_to_tech: null,
          job_type: "frh",
          hours: null,
          price_level_id: defaultLevelId,
        })
        .select("id")
        .single();

      if (error || !jobRow) {
        router.refresh();
        setDialogError(error?.message ?? "Failed to add job");
        setLoading(false);
        return;
      }

      const { error: lineError } = await supabase.from("work_order_lines").insert({
        work_order_job_id: jobRow.id,
        kind: "shop_supplies",
        description: "Sealant, Zip Ties, Rags, Cleaning Products, Etc.",
        qty: 1,
        unit_cost: settings?.shop_supplies_amount ?? 75,
        position: 0,
      });

      if (lineError) {
        router.refresh();
        setDialogError(`Job "${title}" was added but its Shop Supplies line failed: ${lineError.message}`);
        setLoading(false);
        return;
      }

      setBlankTitle("");
    }

    // Reset and close (skip if we bailed out early on error)
    if (earlyExit) return;
    setSelected(new Set());
    setQuery("");
    setLoading(false);
    onOpenChange(false);
    router.refresh();
  }

  function handleOpenChange(o: boolean) {
    if (!o) {
      setSelected(new Set());
      setBlankTitle("");
      setQuery("");
      setDialogError(null);
    }
    onOpenChange(o);
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[520px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[#1a2236] bg-[#0d1320] p-6 text-white">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-text-primary">
              Add Jobs
            </Dialog.Title>
            <Dialog.Close aria-label="Close" className="text-text-secondary hover:text-text-primary">
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Select job templates to add to this work order or type a custom job title.
          </Dialog.Description>

          {/* Search */}
          <input
            type="text"
            placeholder="Search templates…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-3 w-full rounded-md border border-[#1a2236] bg-[#060a12] px-3 py-2 text-sm text-white placeholder-[#8892A5] focus:border-gold focus:outline-none"
          />

          {/* Template list */}
          <div className="max-h-80 overflow-y-auto rounded-md border border-[#1a2236] divide-y divide-[#1a2236]">
            {filtered.length === 0 && (
              <p className="px-4 py-3 text-sm text-text-secondary">No templates match.</p>
            )}
            {filtered.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-[#111827]"
              >
                <input
                  type="checkbox"
                  checked={selected.has(t.id)}
                  onChange={() => toggleTemplate(t.id)}
                  className="mt-0.5 accent-gold"
                />
                <div className="min-w-0">
                  <p className="text-sm text-text-primary">{t.name}</p>
                  <p className="text-xs text-text-secondary">
                    {t.default_hours != null ? `${t.default_hours} hrs` : "— hrs"}
                    {" · "}
                    {priceLevelLabel(t)}
                  </p>
                </div>
              </label>
            ))}
          </div>

          {/* Blank job */}
          <div className="mt-4 border-t border-[#1a2236] pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Blank Job
            </p>
            <input
              type="text"
              placeholder="Job title (leave empty to skip)"
              value={blankTitle}
              onChange={(e) => setBlankTitle(e.target.value)}
              className="w-full rounded-md border border-[#1a2236] bg-[#060a12] px-3 py-2 text-sm text-white placeholder-[#8892A5] focus:border-gold focus:outline-none"
            />
          </div>

          {dialogError && (
            <p className="mt-3 text-sm text-red-400">{dialogError}</p>
          )}

          {/* Footer */}
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
              Cancel
            </Dialog.Close>
            <button
              disabled={loading}
              onClick={handleDone}
              className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-[#060a12] disabled:opacity-50"
            >
              {loading ? "Adding…" : "Done"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
