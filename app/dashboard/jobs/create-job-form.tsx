"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCanWrite } from "@/lib/role-context";
import {
  SERVICE_TYPE_OPTIONS,
  manufacturerForServiceType,
} from "@/lib/campaigns/constants";
import type { DraftCampaign } from "@/lib/campaigns/types";
import { attachCampaignsToJob } from "@/lib/campaigns/queries";
import { CampaignDrawer } from "@/components/campaigns/CampaignDrawer";

type Customer = { id: string; name: string };
type Boat = { id: string; name: string; customer_id: string; make_model: string };
type Tech = { id: string; full_name: string; email: string };
type Marina = { id: string; name: string };

export function CreateJobForm({
  customers,
  boats,
  techs,
  marinas,
}: {
  customers: Customer[];
  boats: Boat[];
  techs: Tech[];
  marinas: Marina[];
}) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Viewers can't create jobs — entire form is hidden.
  if (!canWrite) return null;

  const [customerId, setCustomerId] = useState("");
  const [boatId, setBoatId] = useState("");
  const [techId, setTechId] = useState("");
  const [marinaId, setMarinaId] = useState("");
  // Optimistically-appended marinas added via the "+ Add new marina" inline
  // form. Server-fetched `marinas` (a Server Component prop) doesn't refresh
  // mid-form, so we keep the new ones in local state and merge for the select.
  const [addedMarinas, setAddedMarinas] = useState<Marina[]>([]);
  // Inline "add marina" UX state. When `addingMarina` is true the dropdown
  // hides itself and shows a name input + Save/Cancel.
  const [addingMarina, setAddingMarina] = useState(false);
  const [newMarinaName, setNewMarinaName] = useState("");
  const [marinaSaving, setMarinaSaving] = useState(false);
  const [marinaError, setMarinaError] = useState("");
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [serviceDescriptions, setServiceDescriptions] = useState<Record<string, string>>({});
  // Campaigns staged per manufacturer until the job row exists and can be linked.
  const [campaignDrafts, setCampaignDrafts] = useState<Record<string, DraftCampaign[]>>({});
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledEndDate, setScheduledEndDate] = useState("");
  const [notes, setNotes] = useState("");

  // True when a multi-day end date is set and is strictly after start.
  const isMultiDay = !!scheduledEndDate && !!scheduledDate && scheduledEndDate > scheduledDate;

  const filteredBoats = customerId
    ? boats.filter((b) => b.customer_id === customerId)
    : boats;

  function toggleServiceType(type: string) {
    setServiceTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
    // Remove description when un-checking.
    setServiceDescriptions((prev) => {
      if (serviceTypes.includes(type)) {
        const next = { ...prev };
        delete next[type];
        return next;
      }
      return prev;
    });
    // Un-checking a campaign type discards anything staged under it, so a job can
    // never be created carrying campaigns whose checkbox is off.
    const mfg = manufacturerForServiceType(type);
    if (mfg && serviceTypes.includes(type)) {
      setCampaignDrafts((prev) => {
        const next = { ...prev };
        delete next[mfg];
        return next;
      });
    }
  }

  function setServiceDescription(type: string, desc: string) {
    setServiceDescriptions((prev) => ({ ...prev, [type]: desc }));
  }

  // Combined marina list for the select — server-fetched marinas + any added
  // inline this session.
  const allMarinas: Marina[] = [
    ...marinas,
    ...addedMarinas.filter((a) => !marinas.some((m) => m.id === a.id)),
  ];

  async function saveNewMarina() {
    const name = newMarinaName.trim();
    if (!name) {
      setMarinaError("Name required");
      return;
    }
    setMarinaSaving(true);
    setMarinaError("");
    const supabase = createClient();
    const { data, error } = await supabase
      .from("marinas")
      .insert({ name })
      .select("id, name")
      .single();
    setMarinaSaving(false);
    if (error || !data) {
      setMarinaError(error?.message ?? "Failed to add marina");
      return;
    }
    setAddedMarinas((prev) => [...prev, data as Marina]);
    setMarinaId(data.id);
    setNewMarinaName("");
    setAddingMarina(false);
    // Trigger a server refresh so the preference list is up-to-date the next
    // time the form mounts; the local state already covers this render.
    router.refresh();
  }

  function cancelAddMarina() {
    setAddingMarina(false);
    setNewMarinaName("");
    setMarinaError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Build per-service descriptions for checked types only.
    const descPayload: Record<string, string> = {};
    for (const type of serviceTypes) {
      const d = serviceDescriptions[type];
      if (d && d.trim()) descPayload[type] = d.trim();
    }

    // Derive scheduled_start / scheduled_end / scheduled_end_date from dates.
    // scheduledDate is a date-only string (from the date input). We treat it as
    // a start-of-day (00:00 local) for the scheduled_start.
    const scheduledStart = scheduledDate
      ? new Date(`${scheduledDate}T09:00`).toISOString()
      : null;
    let scheduledEnd: string | null = null;
    let endDateCol: string | null = null;
    if (scheduledStart) {
      if (isMultiDay) {
        scheduledEnd = new Date(`${scheduledEndDate}T17:00`).toISOString();
        endDateCol = scheduledEndDate;
      } else {
        scheduledEnd = new Date(new Date(scheduledStart).getTime() + 60 * 60 * 1000).toISOString();
      }
    }

    const supabase = createClient();
    const { data: created, error: insertError } = await supabase.from("jobs").insert({
      customer_id: customerId || null,
      boat_id: boatId || null,
      assigned_to: techId || null,
      marina_id: marinaId || null,
      service_types: serviceTypes,
      service_descriptions: descPayload,
      scheduled_date: scheduledDate || null,
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      scheduled_end_date: endDateCol,
      notes: notes || null,
      status: "new",
    }).select("id").single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    // Link staged campaigns now that the job has an id. Deliberately not fatal:
    // the job itself is saved, so a campaign_log failure surfaces as a warning
    // rather than losing the whole entry and making the user retype it.
    const allDrafts = Object.values(campaignDrafts).flat();
    if (created?.id && allDrafts.length > 0) {
      try {
        await attachCampaignsToJob({
          jobId: created.id,
          boatId: boatId || null,
          customerId: customerId || null,
          drafts: allDrafts,
        });
      } catch (e) {
        setError(
          `Job created, but the campaigns could not be attached: ${
            e instanceof Error ? e.message : "unknown error"
          }. Add them from the job page.`
        );
        setLoading(false);
        return;
      }
    }

    // Reset form
    setCustomerId("");
    setBoatId("");
    setTechId("");
    setMarinaId("");
    setServiceTypes([]);
    setServiceDescriptions({});
    setCampaignDrafts({});
    setScheduledDate("");
    setScheduledEndDate("");
    setNotes("");
    setOpen(false);
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="mb-6">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-primary-bg transition-colors hover:bg-gold-hover"
        >
          + Create Job
        </button>
      ) : (
        <div className="rounded-xl border border-border-line bg-card-bg p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">
              Create New Job
            </h2>
            <button
              onClick={() => setOpen(false)}
              className="text-text-secondary hover:text-text-primary"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Customer */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Customer
                </label>
                <select
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    setBoatId("");
                  }}
                  className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2.5 text-sm text-text-primary focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                >
                  <option value="">Select customer...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Boat */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Boat
                </label>
                <select
                  value={boatId}
                  onChange={(e) => setBoatId(e.target.value)}
                  className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2.5 text-sm text-text-primary focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                >
                  <option value="">Select boat...</option>
                  {filteredBoats.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.make_model ? `(${b.make_model})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Technician */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Assign Technician
                </label>
                <select
                  value={techId}
                  onChange={(e) => setTechId(e.target.value)}
                  className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2.5 text-sm text-text-primary focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                >
                  <option value="">Select technician...</option>
                  {techs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Marina — supports inline "+ Add new marina" without leaving the form */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Marina
                </label>
                {addingMarina ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        autoFocus
                        value={newMarinaName}
                        onChange={(e) => setNewMarinaName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void saveNewMarina();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancelAddMarina();
                          }
                        }}
                        placeholder="New marina name…"
                        className="flex-1 rounded-lg border border-border-line bg-secondary-bg px-3 py-2.5 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                      />
                      <button
                        type="button"
                        onClick={saveNewMarina}
                        disabled={marinaSaving || !newMarinaName.trim()}
                        className="rounded-lg bg-gold px-3 py-2.5 text-xs font-semibold tracking-wide text-primary-bg transition-colors hover:bg-gold-hover disabled:opacity-50"
                      >
                        {marinaSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelAddMarina}
                        disabled={marinaSaving}
                        className="rounded-lg border border-border-line bg-secondary-bg px-3 py-2.5 text-xs text-text-secondary hover:bg-border-line disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                    {marinaError && (
                      <p className="text-xs text-red-400">{marinaError}</p>
                    )}
                  </div>
                ) : (
                  <select
                    value={marinaId}
                    onChange={(e) => {
                      if (e.target.value === "__add__") {
                        setAddingMarina(true);
                        return;
                      }
                      setMarinaId(e.target.value);
                    }}
                    className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2.5 text-sm text-text-primary focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                  >
                    <option value="">Select marina...</option>
                    {allMarinas.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                    <option disabled>──────────</option>
                    <option value="__add__">+ Add new marina…</option>
                  </select>
                )}
              </div>

              {/* Scheduled Date */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Start Date
                </label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2.5 text-sm text-text-primary focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                />
              </div>

              {/* End Date (multi-day) */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  End Date <span className="font-normal text-text-secondary/60">(optional — multi-day)</span>
                </label>
                <input
                  type="date"
                  value={scheduledEndDate}
                  min={scheduledDate}
                  onChange={(e) => setScheduledEndDate(e.target.value)}
                  className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2.5 text-sm text-text-primary focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                />
                {isMultiDay && (
                  <p className="mt-1 text-xs text-text-secondary">
                    Multi-day job through {scheduledEndDate}, ends at 5:00 PM.
                  </p>
                )}
              </div>
            </div>

            {/* Service Types with per-service descriptions */}
            <div>
              <label className="mb-2 block text-sm font-medium text-text-secondary">
                Service Types
              </label>
              <div className="space-y-2">
                {SERVICE_TYPE_OPTIONS.map((type) => {
                  const on = serviceTypes.includes(type);
                  const mfg = manufacturerForServiceType(type);
                  return (
                    <div key={type}>
                      <button
                        type="button"
                        onClick={() => toggleServiceType(type)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          on
                            ? "border-gold bg-gold-muted text-gold"
                            : "border-border-line text-text-secondary hover:border-gold/30 hover:text-text-primary"
                        }`}
                      >
                        <span className={`h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center ${
                          on ? "border-gold bg-gold" : "border-current"
                        }`}>
                          {on && (
                            <svg className="h-2.5 w-2.5 text-primary-bg" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1.5 5l2.5 2.5L8.5 2.5" />
                            </svg>
                          )}
                        </span>
                        {type}
                      </button>
                      {on && mfg && (
                        <CampaignDrawer
                          manufacturer={mfg}
                          drafts={campaignDrafts[mfg] ?? []}
                          onChange={(update) =>
                            setCampaignDrafts((prev) => ({
                              ...prev,
                              [mfg]: update(prev[mfg] ?? []),
                            }))
                          }
                        />
                      )}
                      {on && !mfg && (
                        <textarea
                          rows={2}
                          value={serviceDescriptions[type] ?? ""}
                          onChange={(e) => setServiceDescription(type, e.target.value)}
                          placeholder={`Notes for ${type}…`}
                          className="mt-1 ml-5 w-[calc(100%-1.25rem)] resize-y rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-xs text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2.5 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                placeholder="Additional notes..."
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-gold px-6 py-2.5 text-sm font-semibold text-primary-bg transition-colors hover:bg-gold-hover disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Job"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border-line px-6 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
