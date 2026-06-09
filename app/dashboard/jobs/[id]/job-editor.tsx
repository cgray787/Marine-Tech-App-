"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCanWrite } from "@/lib/role-context";

// In-place editor for the editable fields on the job detail page. Read-only
// surfaces (customer/boat/report/photos/parts) stay server-rendered above
// this island; this component owns the schedule/tech/marina/services/notes/
// status writes.

type Tech = { id: string; full_name: string; email?: string | null };
type Marina = { id: string; name: string };

export interface JobEditorInitial {
  id: string;
  status: string;
  service_types: string[] | null;
  service_descriptions: Record<string, string> | null;
  notes: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  scheduled_end_date: string | null;
  marina_id: string | null;
  assigned_to: string | null;
}

const SERVICE_TYPE_OPTIONS = [
  "Engine Service",
  "Electrical",
  "Hull & Bottom",
  "Safety Inspection",
  "Navigation Systems",
  "General Maintenance",
  "Winterization",
  "Spring Commissioning",
  "Sea Trial",
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "new", label: "New" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

// ─ helpers ──────────────────────────────────────────────────────────────────
function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isoToTimeInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function combineLocalToIso(dateStr: string, timeStr: string): string | null {
  if (!dateStr || !timeStr) return null;
  const dt = new Date(`${dateStr}T${timeStr}`);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}
function durationHours(startIso: string | null, endIso: string | null): number {
  if (!startIso || !endIso) return 1;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0.5, Math.round((ms / 3_600_000) * 2) / 2);
}
// Derive the initial end-date string from scheduled_end_date (date column) or
// fall back to the date part of scheduled_end (timestamptz). Returns "" if the
// end date equals the start date (single-day job).
function deriveEndDateStr(
  startIso: string | null,
  endDateCol: string | null,
  endIso: string | null,
): string {
  const startDate = startIso ? isoToDateInput(startIso) : "";
  const endDate = endDateCol ?? (endIso ? isoToDateInput(endIso) : "");
  if (!endDate || endDate === startDate) return "";
  return endDate;
}

export function JobEditor({
  initial,
  techs,
  marinas: initialMarinas,
}: {
  initial: JobEditorInitial;
  techs: Tech[];
  marinas: Marina[];
}) {
  const router = useRouter();
  const canWrite = useCanWrite();

  // ── form state ──────────────────────────────────────────────────────────
  const [status, setStatus] = useState(initial.status ?? "new");
  const [serviceTypes, setServiceTypes] = useState<string[]>(initial.service_types ?? []);
  // Per-service descriptions keyed by service type string.
  const [serviceDescriptions, setServiceDescriptions] = useState<Record<string, string>>(
    initial.service_descriptions ?? {},
  );
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [assignedTo, setAssignedTo] = useState(initial.assigned_to ?? "");
  const [marinaId, setMarinaId] = useState(initial.marina_id ?? "");
  const [dateStr, setDateStr] = useState(isoToDateInput(initial.scheduled_start));
  const [timeStr, setTimeStr] = useState(isoToTimeInput(initial.scheduled_start));
  const [hours, setHours] = useState<number>(durationHours(initial.scheduled_start, initial.scheduled_end));
  // End date for multi-day jobs. Empty string = single-day.
  const [endDateStr, setEndDateStr] = useState(
    deriveEndDateStr(initial.scheduled_start, initial.scheduled_end_date, initial.scheduled_end),
  );
  const isMultiDay = !!endDateStr && endDateStr > dateStr;

  // ── marinas (with inline-add, mirrored from CreateJobForm) ──────────────
  const [addedMarinas, setAddedMarinas] = useState<Marina[]>([]);
  const [addingMarina, setAddingMarina] = useState(false);
  const [newMarinaName, setNewMarinaName] = useState("");
  const [marinaSaving, setMarinaSaving] = useState(false);
  const [marinaError, setMarinaError] = useState("");
  const allMarinas: Marina[] = [
    ...initialMarinas,
    ...addedMarinas.filter((a) => !initialMarinas.some((m) => m.id === a.id)),
  ];

  // ── save / delete state ─────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  if (!canWrite) {
    return null; // viewers see only the read-only surfaces above
  }

  function toggleService(type: string) {
    setServiceTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
    // When un-checking, remove the description to keep state clean.
    setServiceDescriptions((prev) => {
      if (serviceTypes.includes(type)) {
        const next = { ...prev };
        delete next[type];
        return next;
      }
      return prev;
    });
  }

  function setServiceDescription(type: string, desc: string) {
    setServiceDescriptions((prev) => ({ ...prev, [type]: desc }));
  }

  async function saveNewMarina() {
    const name = newMarinaName.trim();
    if (!name) { setMarinaError("Name required"); return; }
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
    router.refresh();
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    const startIso = combineLocalToIso(dateStr, timeStr);

    let endIso: string | null = null;
    let endDateCol: string | null = null;
    if (startIso) {
      if (isMultiDay) {
        // End = end date at 17:00 local time.
        const endDt = new Date(`${endDateStr}T17:00`);
        endIso = Number.isNaN(endDt.getTime()) ? null : endDt.toISOString();
        endDateCol = endDateStr;
      } else {
        endIso = new Date(new Date(startIso).getTime() + hours * 3_600_000).toISOString();
        endDateCol = null; // single-day: clear the multi-day end date
      }
    }

    // Build descriptions for currently-checked services only.
    const descPayload: Record<string, string> = {};
    for (const type of serviceTypes) {
      const d = serviceDescriptions[type];
      if (d && d.trim()) descPayload[type] = d.trim();
    }

    const supabase = createClient();
    const { error } = await supabase
      .from("jobs")
      .update({
        status,
        service_types: serviceTypes,
        service_descriptions: descPayload,
        notes: notes || null,
        assigned_to: assignedTo || null,
        marina_id: marinaId || null,
        scheduled_start: startIso,
        scheduled_end: endIso,
        scheduled_end_date: endDateCol,
      })
      .eq("id", initial.id);
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("Delete this job? This cannot be undone.")) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("jobs").delete().eq("id", initial.id);
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    router.push("/dashboard/jobs");
  }

  return (
    <div className="space-y-4">
      {/* Schedule + tech + marina row */}
      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-border-line bg-card-bg p-5 lg:grid-cols-3">
        {/* Schedule */}
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Schedule</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] text-text-secondary">Start date</label>
              <input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-text-secondary">End date <span className="font-normal">(optional)</span></label>
              <input
                type="date"
                value={endDateStr}
                min={dateStr}
                onChange={(e) => setEndDateStr(e.target.value)}
                className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
              />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="time"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              className="rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
            />
            {!isMultiDay ? (
              <select
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
              >
                {[0.5, 1, 1.5, 2, 3, 4, 6, 8].map((h) => (
                  <option key={h} value={h}>{h === 0.5 ? "30 min" : h === 1 ? "1 hr" : `${h} hrs`}</option>
                ))}
              </select>
            ) : (
              <div className="flex items-center rounded-lg border border-border-line bg-secondary-bg px-3 py-2">
                <span className="text-xs text-text-secondary">Ends {endDateStr} @ 5 PM</span>
              </div>
            )}
          </div>
        </div>

        {/* Assigned tech */}
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Assigned tech</p>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="mt-2 w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
          >
            <option value="">Unassigned</option>
            {techs.map((t) => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>
        </div>

        {/* Marina */}
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Marina</p>
          {addingMarina ? (
            <div className="mt-2 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  value={newMarinaName}
                  onChange={(e) => setNewMarinaName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); void saveNewMarina(); }
                    else if (e.key === "Escape") { e.preventDefault(); setAddingMarina(false); setMarinaError(""); }
                  }}
                  placeholder="New marina name…"
                  className="flex-1 rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                />
                <button
                  type="button"
                  onClick={saveNewMarina}
                  disabled={marinaSaving || !newMarinaName.trim()}
                  className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold tracking-wide text-primary-bg hover:bg-gold-hover disabled:opacity-50"
                >
                  {marinaSaving ? "…" : "Save"}
                </button>
              </div>
              {marinaError && <p className="text-xs text-red-400">{marinaError}</p>}
            </div>
          ) : (
            <select
              value={marinaId}
              onChange={(e) => {
                if (e.target.value === "__add__") { setAddingMarina(true); return; }
                setMarinaId(e.target.value);
              }}
              className="mt-2 w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
            >
              <option value="">Select marina…</option>
              {allMarinas.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
              <option disabled>──────────</option>
              <option value="__add__">+ Add new marina…</option>
            </select>
          )}
        </div>
      </div>

      {/* Services */}
      <div className="rounded-2xl border border-border-line bg-card-bg p-5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Services</p>
        <div className="mt-2 space-y-2">
          {SERVICE_TYPE_OPTIONS.map((s) => {
            const on = serviceTypes.includes(s);
            return (
              <div key={s}>
                <button
                  type="button"
                  onClick={() => toggleService(s)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                    on
                      ? "border-gold bg-gold/15 text-gold"
                      : "border-border-line bg-secondary-bg text-text-secondary hover:border-gold/40"
                  }`}
                >
                  <span className={`h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center ${
                    on ? "border-gold bg-gold" : "border-text-secondary"
                  }`}>
                    {on && (
                      <svg className="h-2.5 w-2.5 text-primary-bg" viewBox="0 0 10 10" fill="currentColor">
                        <path d="M1.5 5l2.5 2.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  {s}
                </button>
                {on && (
                  <textarea
                    rows={2}
                    value={serviceDescriptions[s] ?? ""}
                    onChange={(e) => setServiceDescription(s, e.target.value)}
                    placeholder={`Notes for ${s}…`}
                    className="mt-1 ml-5 w-[calc(100%-1.25rem)] resize-y rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-xs text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Status + Notes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border-line bg-card-bg p-5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Status</p>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-2 w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="rounded-2xl border border-border-line bg-card-bg p-5 lg:col-span-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Notes</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Notes about this job…"
            className="mt-2 w-full resize-y rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
          />
        </div>
      </div>

      {/* Action bar */}
      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-2xl border border-border-line bg-card-bg p-3 shadow-2xl backdrop-blur">
        <button
          type="button"
          onClick={handleDelete}
          disabled={saving}
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
        >
          Delete job
        </button>
        <div className="flex items-center gap-3">
          {saveError && <span className="text-xs text-red-400">{saveError}</span>}
          {savedFlash && <span className="text-xs text-emerald-400">✓ Saved</span>}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-gold px-4 py-2 text-xs font-semibold tracking-wide text-primary-bg hover:bg-gold-hover disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
