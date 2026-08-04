"use client";

import { useEffect, useState } from "react";
import type { Manufacturer } from "@/lib/campaigns/constants";
import { manufacturerLabel } from "@/lib/campaigns/constants";
import type { ServiceCampaign, DraftCampaign } from "@/lib/campaigns/types";
import { getCampaigns } from "@/lib/campaigns/queries";
import {
  compensatedHours,
  laborCodeSummary,
  completionBlocker,
  hoursSummary,
} from "@/lib/campaigns/matching";

const MARK: Record<Manufacturer, string> = { axopar: "AX", mercury: "MR" };

/**
 * The panel that opens under "AXOPAR Service Campaign" / "Mercury Service Campaign"
 * in the SERVICES list. Add one or more campaigns; each carries the manufacturer's
 * instructions plus the tech's findings, hours and photo count.
 *
 * A plain button + list is used rather than a <select>: the same component renders
 * on a phone in a boatyard, where a native picker is a poor target and cannot show
 * scope and hours alongside each option.
 */
export function CampaignDrawer({
  manufacturer,
  drafts,
  onChange,
}: {
  manufacturer: Manufacturer;
  drafts: DraftCampaign[];
  /**
   * Takes an updater, not a value. Computing the next array from the `drafts`
   * prop would read whatever was captured at render — so two edits landing in the
   * same batch (type a finding, tab straight to hours) would see the same stale
   * array and the first edit would be lost.
   */
  onChange: (update: (prev: DraftCampaign[]) => DraftCampaign[]) => void;
}) {
  const [catalog, setCatalog] = useState<ServiceCampaign[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    getCampaigns(manufacturer)
      .then((rows) => alive && setCatalog(rows))
      .catch((e) => alive && setLoadError(e.message ?? "Could not load campaigns"));
    return () => {
      alive = false;
    };
  }, [manufacturer]);

  const label = manufacturerLabel(manufacturer);
  const chosen = new Set(drafts.map((d) => d.campaign.id));
  const pool = (catalog ?? []).filter((c) => !chosen.has(c.id));
  const totals = hoursSummary(drafts);

  function add(c: ServiceCampaign) {
    onChange((prev) =>
      // Guard against a double-click adding the same campaign twice — the database
      // would reject the duplicate, but only after the job had already been created.
      prev.some((d) => d.campaign.id === c.id)
        ? prev
        : [
            ...prev,
            { campaign: c, conditions_found: "", actual_hours: "", engine_hours: "", photo_count: 0 },
          ]
    );
    setPickerOpen(false);
    setExpanded((prev) => new Set(prev).add(c.id));
  }

  function remove(id: string) {
    onChange((prev) => prev.filter((d) => d.campaign.id !== id));
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function patch(id: string, field: keyof DraftCampaign, value: string | number) {
    onChange((prev) =>
      prev.map((d) => (d.campaign.id === id ? { ...d, [field]: value } : d))
    );
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mt-1.5 ml-5 w-[calc(100%-1.25rem)] rounded-lg border border-l-2 border-border-line border-l-gold bg-secondary-bg p-3">
      <div className="mb-2 flex items-center text-[10px] uppercase tracking-[0.12em] text-text-secondary">
        {label} campaigns
        <span className="ml-auto font-mono text-text-secondary/70">
          {drafts.length ? `${drafts.length} added` : "none yet"}
        </span>
      </div>

      {loadError && (
        <p className="mb-2 text-xs text-status-bad">{loadError}</p>
      )}
      {!catalog && !loadError && (
        <p className="py-1 text-xs italic text-text-secondary/70">Loading campaigns…</p>
      )}

      {drafts.map((d) => {
        const c = d.campaign;
        const open = expanded.has(c.id);
        const hrs = compensatedHours(c);
        const blocker = completionBlocker({
          conditions_found: d.conditions_found,
          photo_count: d.photo_count,
        });
        return (
          <div
            key={c.id}
            className="mb-1.5 rounded-lg border border-border-line bg-primary-bg p-2.5"
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 rounded bg-gold-muted px-1.5 py-0.5 font-mono text-[10px] font-bold text-gold">
                {MARK[manufacturer]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-text-primary">
                  {c.campaign_code} · {c.title}
                </span>
                <span className="mt-0.5 block text-[11px] text-text-secondary/80">
                  {c.applies_to || c.engine_model || "—"}
                  {c.revision ? ` · rev ${c.revision}` : ""}
                  {c.priority === "urgent" ? " · urgent" : ""}
                </span>
              </span>
              <span className="shrink-0 font-mono text-xs text-gold">{hrs.toFixed(1)} h</span>
              <button
                type="button"
                onClick={() => remove(c.id)}
                aria-label={`Remove ${c.campaign_code}`}
                className="shrink-0 pl-1 text-sm leading-none text-text-secondary hover:text-status-bad"
              >
                ✕
              </button>
            </div>

            <button
              type="button"
              onClick={() => toggle(c.id)}
              className="mt-1.5 font-mono text-[10px] tracking-wider text-text-secondary hover:text-gold"
            >
              {open ? "▴ collapse" : "▾ instructions, findings & photos"}
            </button>

            {open && (
              <div className="mt-2 border-t border-border-line pt-2">
                {c.description && (
                  <>
                    <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.12em] text-text-secondary/70">
                      Issue
                    </p>
                    <p className="mb-2 whitespace-pre-line text-[11px] leading-relaxed text-text-secondary">
                      {c.description}
                    </p>
                  </>
                )}
                {c.instructions && (
                  <>
                    <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.12em] text-text-secondary/70">
                      Instructions
                    </p>
                    <p className="mb-2 whitespace-pre-line text-[11px] leading-relaxed text-text-secondary">
                      {c.instructions}
                    </p>
                  </>
                )}
                {manufacturer === "mercury" && (c.part_code || c.labor_codes?.length) && (
                  <p className="mb-2 font-mono text-[10px] text-text-secondary/80">
                    {c.part_code}
                    {c.part_code && c.labor_codes?.length ? " · " : ""}
                    {laborCodeSummary(c.labor_codes)}
                  </p>
                )}

                <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-text-secondary/70">
                  Conditions found <span className="text-gold">· required to file</span>
                </label>
                <textarea
                  rows={3}
                  value={d.conditions_found}
                  onChange={(e) => patch(c.id, "conditions_found", e.target.value)}
                  placeholder={`What you found and what you did — the narrative ${label} reads on the claim.`}
                  className="w-full resize-y rounded-lg border border-border-line bg-secondary-bg px-2.5 py-2 text-[11px] text-text-primary placeholder-text-secondary/40 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                />

                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="min-w-[5rem] flex-1">
                    <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-text-secondary/70">
                      Compensated
                    </label>
                    <div className="rounded border border-border-line bg-secondary-bg px-2 py-1.5 font-mono text-[11px] text-text-secondary">
                      {hrs.toFixed(1)} h
                    </div>
                  </span>
                  <span className="min-w-[5rem] flex-1">
                    <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-text-secondary/70">
                      Actual hours
                    </label>
                    <input
                      inputMode="decimal"
                      value={d.actual_hours}
                      onChange={(e) => patch(c.id, "actual_hours", e.target.value)}
                      placeholder="0.0"
                      className="w-full rounded border border-border-line bg-secondary-bg px-2 py-1.5 font-mono text-[11px] text-text-primary placeholder-text-secondary/40 focus:border-gold focus:outline-none"
                    />
                  </span>
                  {manufacturer === "mercury" && (
                    <span className="min-w-[5rem] flex-1">
                      <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-text-secondary/70">
                        Engine hours
                      </label>
                      <input
                        inputMode="decimal"
                        value={d.engine_hours}
                        onChange={(e) => patch(c.id, "engine_hours", e.target.value)}
                        placeholder="115"
                        className="w-full rounded border border-border-line bg-secondary-bg px-2 py-1.5 font-mono text-[11px] text-text-primary placeholder-text-secondary/40 focus:border-gold focus:outline-none"
                      />
                    </span>
                  )}
                </div>

                {blocker && (
                  <p className="mt-2 text-[11px] text-gold">
                    {blocker} before this can be marked complete. Photos are added by the
                    tech in the field app.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {catalog && pool.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="w-full rounded-lg border border-dashed border-border-line px-3 py-2 text-left text-xs text-text-secondary hover:border-gold hover:text-text-primary"
          >
            {pickerOpen
              ? "▴ Close"
              : `+ Add ${drafts.length ? "another" : "a"} ${label} campaign`}
          </button>
          {pickerOpen && (
            <div className="mt-1.5 rounded-lg border border-border-line bg-primary-bg p-1">
              {pool.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => add(c)}
                  className="block w-full rounded px-2 py-2 text-left text-xs text-text-primary hover:bg-gold-muted"
                >
                  <span className="float-right font-mono text-[11px] text-gold">
                    {compensatedHours(c).toFixed(1)} h
                  </span>
                  {c.campaign_code} · {c.title}
                  <span className="mt-0.5 block text-[10px] text-text-secondary/70">
                    {c.applies_to || c.engine_model || "—"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {catalog && catalog.length === 0 && (
        <p className="py-1 text-xs italic text-text-secondary/70">
          No {label} campaigns in the catalog yet — add them in Work Orders → Settings.
        </p>
      )}
      {catalog && catalog.length > 0 && pool.length === 0 && (
        <p className="py-1 text-xs italic text-text-secondary/70">
          All {label} campaigns added.
        </p>
      )}

      {drafts.length > 0 && (
        <div className="mt-2 flex border-t border-border-line pt-2 text-[11px] text-text-secondary">
          Compensated {totals.compensated.toFixed(1)} h
          {totals.actual > 0 && ` · actual ${totals.actual.toFixed(1)} h`}
          <span className="ml-auto font-mono text-gold">
            {totals.actual > 0
              ? `${totals.variance > 0 ? "+" : ""}${totals.variance.toFixed(1)} h`
              : `${totals.compensated.toFixed(1)} h`}
          </span>
        </div>
      )}
    </div>
  );
}
