"use client";

import { useCallback, useEffect, useState } from "react";
import type { Manufacturer } from "@/lib/campaigns/constants";
import { CAMPAIGN_SERVICE_TYPES, manufacturerLabel } from "@/lib/campaigns/constants";
import type { ServiceCampaign, CampaignLogEntry } from "@/lib/campaigns/types";
import {
  getCampaigns,
  getCampaignLogForJob,
  getCampaignPhotos,
  attachCampaignToExistingJob,
  updateCampaignEntry,
  voidCampaignEntry,
  type CampaignPhoto,
} from "@/lib/campaigns/queries";
import { compensatedHours, laborCodeSummary, completionBlocker, statusLabel } from "@/lib/campaigns/matching";

const MARK: Record<Manufacturer, string> = { axopar: "AX", mercury: "MR" };

const STATUS_STYLE: Record<string, string> = {
  open: "bg-amber-500/15 text-amber-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  not_applicable: "bg-slate-500/15 text-slate-400",
  voided: "bg-slate-500/10 text-slate-500",
};

/**
 * Service campaigns attached to a saved job — the shared hub for the round-trip.
 *
 * The admin attaches a campaign here; the tech opens the same job on the phone,
 * reads these instructions, does the work, and shoots photos; those photos and
 * findings come back to this component. Everything writes to campaign_log and
 * report_photos, so both surfaces read the same rows rather than keeping their
 * own copies.
 *
 * Unlike CampaignDrawer (which stages campaigns while a job is being created),
 * this persists immediately — the job already has an id.
 */
export function JobCampaigns({
  jobId,
  boatId,
  customerId,
  orgId,
  canWrite,
}: {
  jobId: string;
  boatId: string | null;
  customerId: string | null;
  orgId: string;
  canWrite: boolean;
}) {
  const [entries, setEntries] = useState<CampaignLogEntry[] | null>(null);
  const [photos, setPhotos] = useState<Record<string, CampaignPhoto[]>>({});
  const [catalog, setCatalog] = useState<Record<Manufacturer, ServiceCampaign[]>>({
    axopar: [],
    mercury: [],
  });
  const [picker, setPicker] = useState<Manufacturer | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const rows = await getCampaignLogForJob(jobId);
      setEntries(rows);
      setPhotos(await getCampaignPhotos(rows.map((r) => r.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load campaigns");
      setEntries([]);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let alive = true;
    Promise.all([getCampaigns("axopar"), getCampaigns("mercury")])
      .then(([a, m]) => alive && setCatalog({ axopar: a, mercury: m }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function attach(c: ServiceCampaign) {
    setBusy(c.id);
    setError("");
    try {
      await attachCampaignToExistingJob({
        campaignId: c.id,
        orgId,
        jobId,
        boatId,
        customerId,
      });
      setPicker(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not attach that campaign");
    } finally {
      setBusy(null);
    }
  }

  async function patch(id: string, field: keyof CampaignLogEntry, value: string) {
    setEntries((prev) =>
      prev ? prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)) : prev
    );
  }

  async function persist(entry: CampaignLogEntry, patchObj: Record<string, unknown>) {
    setBusy(entry.id);
    setError("");
    try {
      await updateCampaignEntry(entry.id, patchObj);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  async function withdraw(entry: CampaignLogEntry) {
    const reason = window.prompt(
      `Withdraw ${entry.campaign_code}?\n\nThe entry is never deleted — it stays in the boat's history marked withdrawn. Give a reason:`
    );
    if (!reason?.trim()) return;
    setBusy(entry.id);
    setError("");
    try {
      await voidCampaignEntry(entry.id, reason);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not withdraw");
    } finally {
      setBusy(null);
    }
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const live = (entries ?? []).filter((e) => e.status !== "voided");
  const withdrawn = (entries ?? []).filter((e) => e.status === "voided");

  return (
    <div className="rounded-2xl border border-border-line bg-card-bg p-5">
      <div className="flex items-center gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">
          Service Campaigns
        </p>
        {live.length > 0 && (
          <span className="rounded bg-gold-muted px-1.5 py-0.5 font-mono text-[10px] text-gold">
            {live.length}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-text-secondary">
        Axopar and Mercury bulletins on this boat. The tech sees these on the phone,
        works from the instructions, and their photos and findings come back here.
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-status-bad/40 bg-status-bad/10 px-3 py-2 text-xs text-status-bad">
          {error}
        </p>
      )}

      {entries === null && (
        <p className="mt-3 text-xs italic text-text-secondary/70">Loading…</p>
      )}

      {entries !== null && live.length === 0 && (
        <p className="mt-3 text-xs italic text-text-secondary/70">
          No campaigns on this job yet.
        </p>
      )}

      <div className="mt-3 space-y-2">
        {live.map((e) => {
          const open = expanded.has(e.id);
          const shots = photos[e.id] ?? [];
          const blocker = completionBlocker({
            conditions_found: e.conditions_found,
            photo_count: shots.length,
          });
          const actual = e.actual_hours != null ? Number(e.actual_hours) : null;
          const comp = Number(e.compensated_hours);
          return (
            <div key={e.id} className="rounded-lg border border-border-line bg-secondary-bg p-3">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 rounded bg-gold-muted px-1.5 py-0.5 font-mono text-[10px] font-bold text-gold">
                  {MARK[e.manufacturer]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-text-primary">
                    {e.campaign_code} · {e.campaign_title}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-text-secondary">
                    {statusLabel(e)}
                    {e.campaign_revision ? ` · rev ${e.campaign_revision}` : ""}
                    {shots.length > 0
                      ? ` · ${shots.length} photo${shots.length === 1 ? "" : "s"}`
                      : " · no photos yet"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-xs text-gold">{comp.toFixed(1)} h</span>
                  {actual != null && (
                    <span
                      className={`block font-mono text-[10px] ${
                        actual > comp ? "text-status-bad" : "text-status-good"
                      }`}
                    >
                      {actual > comp ? "+" : ""}
                      {(actual - comp).toFixed(1)} h
                    </span>
                  )}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                    STATUS_STYLE[e.status]
                  }`}
                >
                  {e.status === "not_applicable" ? "N/A" : e.status}
                </span>
              </div>

              <button
                type="button"
                onClick={() => toggle(e.id)}
                className="mt-1.5 font-mono text-[10px] tracking-wider text-text-secondary hover:text-gold"
              >
                {open ? "▴ collapse" : "▾ instructions, findings & photos"}
              </button>

              {open && (
                <div className="mt-2 border-t border-border-line pt-2">
                  {e.instructions_snapshot && (
                    <>
                      <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.12em] text-text-secondary/70">
                        Instructions — as issued
                      </p>
                      <p className="mb-2 whitespace-pre-line text-[11px] leading-relaxed text-text-secondary">
                        {e.instructions_snapshot}
                      </p>
                    </>
                  )}

                  <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-text-secondary/70">
                    Conditions found <span className="text-gold">· required to file</span>
                  </label>
                  <textarea
                    rows={3}
                    disabled={!canWrite || e.status === "voided"}
                    value={e.conditions_found ?? ""}
                    onChange={(ev) => patch(e.id, "conditions_found", ev.target.value)}
                    onBlur={(ev) =>
                      persist(e, { conditions_found: ev.target.value.trim() || null })
                    }
                    placeholder="What the tech found and did. Usually written on the phone at the boat."
                    className="w-full resize-y rounded-lg border border-border-line bg-primary-bg px-2.5 py-2 text-[11px] text-text-primary placeholder-text-secondary/40 focus:border-gold focus:outline-none disabled:opacity-60"
                  />

                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="min-w-[5rem] flex-1">
                      <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-text-secondary/70">
                        Compensated
                      </span>
                      <div className="rounded border border-border-line bg-primary-bg px-2 py-1.5 font-mono text-[11px] text-text-secondary">
                        {comp.toFixed(1)} h
                      </div>
                    </span>
                    <span className="min-w-[5rem] flex-1">
                      <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-text-secondary/70">
                        Actual hours
                      </span>
                      <input
                        inputMode="decimal"
                        disabled={!canWrite}
                        defaultValue={e.actual_hours ?? ""}
                        onBlur={(ev) =>
                          persist(e, {
                            actual_hours: ev.target.value.trim()
                              ? Number(ev.target.value)
                              : null,
                          })
                        }
                        placeholder="0.0"
                        className="w-full rounded border border-border-line bg-primary-bg px-2 py-1.5 font-mono text-[11px] text-text-primary focus:border-gold focus:outline-none disabled:opacity-60"
                      />
                    </span>
                    <span className="min-w-[6rem] flex-1">
                      <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-text-secondary/70">
                        Claim number
                      </span>
                      <input
                        disabled={!canWrite}
                        defaultValue={e.claim_number ?? ""}
                        onBlur={(ev) =>
                          persist(e, { claim_number: ev.target.value.trim() || null })
                        }
                        placeholder="029443"
                        className="w-full rounded border border-border-line bg-primary-bg px-2 py-1.5 font-mono text-[11px] text-text-primary focus:border-gold focus:outline-none disabled:opacity-60"
                      />
                    </span>
                  </div>

                  {/* Photos shot by the tech on the phone. */}
                  <p className="mb-1 mt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-text-secondary/70">
                    Photos from the field
                  </p>
                  {shots.length === 0 ? (
                    <p className="text-[11px] italic text-text-secondary/60">
                      None yet — the tech adds these from the job on their phone.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {shots.map((p) => (
                        <a
                          key={p.id}
                          href={p.photo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={p.caption ?? "Campaign photo"}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.photo_url}
                            alt={p.caption ?? "Campaign photo"}
                            className="h-16 w-16 rounded border border-border-line object-cover transition-opacity hover:opacity-80"
                          />
                        </a>
                      ))}
                    </div>
                  )}

                  {canWrite && e.status !== "voided" && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={!!blocker || busy === e.id || e.status === "completed"}
                        onClick={() =>
                          persist(e, {
                            status: "completed",
                            completed_at: new Date().toISOString(),
                          })
                        }
                        className="rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-primary-bg hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {e.status === "completed" ? "Completed" : "Mark complete"}
                      </button>
                      <button
                        type="button"
                        disabled={busy === e.id}
                        onClick={() => persist(e, { status: "not_applicable" })}
                        className="rounded-lg border border-border-line px-3 py-1.5 text-xs text-text-secondary hover:border-gold hover:text-text-primary"
                      >
                        Not applicable
                      </button>
                      <button
                        type="button"
                        disabled={busy === e.id}
                        onClick={() => withdraw(e)}
                        className="rounded-lg border border-border-line px-3 py-1.5 text-xs text-text-secondary hover:border-status-bad hover:text-status-bad"
                      >
                        Withdraw
                      </button>
                      {blocker && e.status !== "completed" && (
                        <span className="text-[11px] text-gold">{blocker}.</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Withdrawn entries stay visible — the record is append-only. */}
      {withdrawn.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-text-secondary/60">
            Withdrawn · {withdrawn.length}
          </p>
          {withdrawn.map((e) => (
            <div
              key={e.id}
              className="mb-1 rounded-lg border border-border-line bg-secondary-bg/50 p-2.5 opacity-60"
            >
              <span className="block text-[11px] text-text-secondary line-through">
                {e.campaign_code} · {e.campaign_title}
              </span>
              <span className="block text-[10px] text-text-secondary/70">{statusLabel(e)}</span>
            </div>
          ))}
        </div>
      )}

      {canWrite && (
        <div className="mt-3 flex flex-wrap gap-2">
          {CAMPAIGN_SERVICE_TYPES.map(({ manufacturer }) => {
            const attachedIds = new Set((entries ?? []).filter((e) => e.status !== "voided").map((e) => e.campaign_id));
            const pool = catalog[manufacturer].filter((c) => !attachedIds.has(c.id));
            return (
              <button
                key={manufacturer}
                type="button"
                onClick={() => setPicker(picker === manufacturer ? null : manufacturer)}
                disabled={pool.length === 0}
                className="rounded-lg border border-dashed border-border-line px-3 py-1.5 text-xs text-text-secondary hover:border-gold hover:text-text-primary disabled:opacity-40"
              >
                {picker === manufacturer
                  ? "▴ Close"
                  : `+ ${manufacturerLabel(manufacturer)} campaign${
                      pool.length === 0 ? " (none left)" : ""
                    }`}
              </button>
            );
          })}
        </div>
      )}

      {picker && (
        <div className="mt-2 rounded-lg border border-border-line bg-primary-bg p-1">
          {catalog[picker]
            .filter(
              (c) =>
                !(entries ?? [])
                  .filter((e) => e.status !== "voided")
                  .some((e) => e.campaign_id === c.id)
            )
            .map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={busy === c.id}
                onClick={() => attach(c)}
                className="block w-full rounded px-2 py-2 text-left text-xs text-text-primary hover:bg-gold-muted disabled:opacity-50"
              >
                <span className="float-right font-mono text-[11px] text-gold">
                  {compensatedHours(c).toFixed(1)} h
                </span>
                {c.campaign_code} · {c.title}
                <span className="mt-0.5 block text-[10px] text-text-secondary/70">
                  {c.applies_to || c.engine_model || "—"}
                  {c.manufacturer === "mercury" && c.labor_codes?.length
                    ? ` · ${laborCodeSummary(c.labor_codes)}`
                    : ""}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
