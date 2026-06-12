"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { WOJob, PriceLevel, JobType, CustomerStatus, WOJobStatus } from "@/lib/work-orders/types";

// ── Props ──────────────────────────────────────────────────────────────────────

type Props = {
  job: WOJob;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  priceLevels: PriceLevel[];
  staff: { id: string; full_name: string }[];
  canEdit: boolean;
  orgId: string;
};

// ── JobSheet ───────────────────────────────────────────────────────────────────

export function JobSheet({ job, open, onOpenChange, priceLevels, staff, canEdit, orgId }: Props) {
  const router = useRouter();

  // ── Controlled state — synced from props on prop change ────────────────────
  const [title, setTitle] = useState(job.title);
  const [description, setDescription] = useState(job.description ?? "");
  const [notesToTech, setNotesToTech] = useState(job.notes_to_tech ?? "");
  const [cause, setCause] = useState(job.cause ?? "");
  const [correction, setCorrection] = useState(job.correction ?? "");
  const [priceLevelId, setPriceLevelId] = useState(job.price_level_id ?? "");
  const [jobType, setJobType] = useState<JobType>(job.job_type);
  const [hours, setHours] = useState(job.hours != null ? String(job.hours) : "");
  const [flatPrice, setFlatPrice] = useState(job.flat_price != null ? String(job.flat_price) : "");
  const [boatLengthFt, setBoatLengthFt] = useState(
    job.boat_length_ft != null ? String(job.boat_length_ft) : ""
  );
  const [laborTaxable, setLaborTaxable] = useState(job.labor_taxable);
  const [assignedTech, setAssignedTech] = useState(job.assigned_tech ?? "");
  const [customerStatus, setCustomerStatus] = useState<CustomerStatus>(job.customer_status);
  const [jobStatus, setJobStatus] = useState<WOJobStatus>(job.job_status);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedTemplate, setSavedTemplate] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Resync when the job prop changes (e.g. after router.refresh)
  useEffect(() => {
    setTitle(job.title);
    setDescription(job.description ?? "");
    setNotesToTech(job.notes_to_tech ?? "");
    setCause(job.cause ?? "");
    setCorrection(job.correction ?? "");
    setPriceLevelId(job.price_level_id ?? "");
    setJobType(job.job_type);
    setHours(job.hours != null ? String(job.hours) : "");
    setFlatPrice(job.flat_price != null ? String(job.flat_price) : "");
    setBoatLengthFt(job.boat_length_ft != null ? String(job.boat_length_ft) : "");
    setLaborTaxable(job.labor_taxable);
    setAssignedTech(job.assigned_tech ?? "");
    setCustomerStatus(job.customer_status);
    setJobStatus(job.job_status);
  }, [job]);

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!title.trim()) { setSaveError("Title is required."); return; }
    setSaving(true);
    setSaveError(null);
    const supabase = createClient();
    const { error } = await supabase.from("work_order_jobs").update({
      title: title.trim(),
      description: description.trim() || null,
      notes_to_tech: notesToTech.trim() || null,
      cause: cause.trim() || null,
      correction: correction.trim() || null,
      price_level_id: priceLevelId || null,
      job_type: jobType,
      hours: jobType === "frh" && hours !== "" ? Number(hours) : null,
      flat_price: jobType === "flat" && flatPrice !== "" ? Number(flatPrice) : null,
      boat_length_ft: jobType === "per_foot" && boatLengthFt !== "" ? Number(boatLengthFt) : null,
      labor_taxable: laborTaxable,
      assigned_tech: assignedTech || null,
      customer_status: customerStatus,
      job_status: jobStatus,
    }).eq("id", job.id);

    if (error) { setSaveError(error.message); setSaving(false); return; }
    setSaving(false);
    router.refresh();
    onOpenChange(false);
  }

  // ── Save as template ───────────────────────────────────────────────────────
  async function handleSaveAsTemplate() {
    setSavingTemplate(true);
    const supabase = createClient();
    await supabase.from("job_templates").insert({
      org_id: orgId,
      name: title.trim() || job.title,
      description: description.trim() || null,
      notes_to_tech: notesToTech.trim() || null,
      default_hours: jobType === "frh" && hours !== "" ? Number(hours) : null,
      default_price_level_id: priceLevelId || null,
    });
    setSavingTemplate(false);
    setSavedTemplate(true);
    setTimeout(() => setSavedTemplate(false), 2000);
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete() {
    const confirmed = confirm("Delete this job and all its lines? This cannot be undone.");
    if (!confirmed) return;
    setDeleting(true);
    const supabase = createClient();
    await supabase.from("work_order_jobs").delete().eq("id", job.id);
    setDeleting(false);
    onOpenChange(false);
    router.refresh();
  }

  // ── Input className helper ─────────────────────────────────────────────────
  const inputCls =
    "w-full rounded-md border border-[#1a2236] bg-[#060a12] px-3 py-2 text-sm text-white placeholder-[#8892A5] focus:border-gold focus:outline-none disabled:opacity-60";

  const labelCls = "mb-1 block text-xs uppercase tracking-wider text-text-secondary";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[640px] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-[#1a2236] bg-[#0d1320] p-6 text-white">
          {/* Header */}
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-text-primary">
              Job Information
            </Dialog.Title>
            <Dialog.Close aria-label="Close" className="text-text-secondary hover:text-text-primary">
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Edit job details, pricing type, cause, correction, and status.
          </Dialog.Description>

          <div className="space-y-4">
            {/* Title */}
            <label className="block">
              <span className={labelCls}>Title *</span>
              <input
                type="text"
                disabled={!canEdit}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputCls}
                placeholder="Job title"
              />
            </label>

            {/* Description */}
            <label className="block">
              <span className={labelCls}>Description</span>
              <textarea
                rows={2}
                disabled={!canEdit}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputCls + " resize-none"}
                placeholder="Customer-visible job description"
              />
            </label>

            {/* Notes to Tech */}
            <label className="block">
              <span className={labelCls}>Notes to Tech</span>
              <textarea
                rows={2}
                disabled={!canEdit}
                value={notesToTech}
                onChange={(e) => setNotesToTech(e.target.value)}
                className={inputCls + " resize-none"}
                placeholder="Internal notes for the technician"
              />
            </label>

            {/* Cause */}
            <label className="block">
              <span className={labelCls}>Cause</span>
              <textarea
                rows={2}
                disabled={!canEdit}
                value={cause}
                onChange={(e) => setCause(e.target.value)}
                className={inputCls + " resize-none"}
                placeholder="Root cause of the issue"
              />
            </label>

            {/* Correction */}
            <label className="block">
              <span className={labelCls}>Correction</span>
              <textarea
                rows={2}
                disabled={!canEdit}
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
                className={inputCls + " resize-none"}
                placeholder="Work performed / correction applied"
              />
            </label>

            {/* Price Level + Job Type row */}
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className={labelCls}>Price Level</span>
                <select
                  disabled={!canEdit}
                  value={priceLevelId}
                  onChange={(e) => setPriceLevelId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">No rate</option>
                  {priceLevels.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name} (${Number(pl.rate).toFixed(2)}/{pl.unit === "hour" ? "hr" : "ft"})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className={labelCls}>Job Type</span>
                <select
                  disabled={!canEdit}
                  value={jobType}
                  onChange={(e) => setJobType(e.target.value as JobType)}
                  className={inputCls}
                >
                  <option value="frh">FRH (hours × rate)</option>
                  <option value="flat">Flat Rate</option>
                  <option value="per_foot">Per Foot</option>
                </select>
              </label>
            </div>

            {/* Conditional labor inputs */}
            {jobType === "frh" && (
              <label className="block">
                <span className={labelCls}>Hours</span>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  disabled={!canEdit}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className={inputCls}
                  placeholder="0.00"
                />
              </label>
            )}
            {jobType === "flat" && (
              <label className="block">
                <span className={labelCls}>Flat Price ($)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={!canEdit}
                  value={flatPrice}
                  onChange={(e) => setFlatPrice(e.target.value)}
                  className={inputCls}
                  placeholder="0.00"
                />
              </label>
            )}
            {jobType === "per_foot" && (
              <label className="block">
                <span className={labelCls}>Boat Length (ft)</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  disabled={!canEdit}
                  value={boatLengthFt}
                  onChange={(e) => setBoatLengthFt(e.target.value)}
                  className={inputCls}
                  placeholder="0.0"
                />
              </label>
            )}

            {/* Labor taxable */}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={laborTaxable}
                onChange={(e) => setLaborTaxable(e.target.checked)}
                className="accent-gold"
              />
              <span className="text-sm text-text-secondary">Labor taxable</span>
            </label>

            {/* Assigned Tech + Status row */}
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className={labelCls}>Assigned Tech</span>
                <select
                  disabled={!canEdit}
                  value={assignedTech}
                  onChange={(e) => setAssignedTech(e.target.value)}
                  className={inputCls}
                >
                  <option value="">TBD</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className={labelCls}>Customer Status</span>
                <select
                  disabled={!canEdit}
                  value={customerStatus}
                  onChange={(e) => setCustomerStatus(e.target.value as CustomerStatus)}
                  className={inputCls}
                >
                  <option value="estimate">Estimate</option>
                  <option value="approved">Approved</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className={labelCls}>Job Status</span>
              <select
                disabled={!canEdit}
                value={jobStatus}
                onChange={(e) => setJobStatus(e.target.value as WOJobStatus)}
                className={inputCls}
              >
                <option value="open">Open</option>
                <option value="awaiting_customer">Awaiting Customer</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </label>
          </div>

          {saveError && <p className="mt-4 text-sm text-red-400">{saveError}</p>}

          {/* Footer buttons */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#1a2236] pt-4">
            {/* Left side — destructive */}
            {canEdit && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete job"}
              </button>
            )}

            {/* Right side */}
            <div className="ml-auto flex items-center gap-2">
              {canEdit && (
                <button
                  onClick={handleSaveAsTemplate}
                  disabled={savingTemplate}
                  className="rounded-md border border-border-line px-3 py-2 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
                >
                  {savedTemplate ? "Saved ✓" : savingTemplate ? "Saving…" : "Save as template"}
                </button>
              )}
              <Dialog.Close className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
                Cancel
              </Dialog.Close>
              {canEdit && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-[#060a12] disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
