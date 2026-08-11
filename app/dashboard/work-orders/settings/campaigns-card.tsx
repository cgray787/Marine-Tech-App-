"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ServiceCampaign } from "@/lib/campaigns/types";
import type { Manufacturer } from "@/lib/campaigns/constants";
import { manufacturerLabel } from "@/lib/campaigns/constants";
import { compensatedHours, laborCodeSummary } from "@/lib/campaigns/matching";

type Props = { campaigns: ServiceCampaign[]; orgId: string };

const BLANK = {
  campaign_code: "",
  title: "",
  revision: "",
  description: "",
  instructions: "",
  compensated_hours: "",
  priority: "normal",
  applies_to: "",
  affected_hins: "",
  engine_model: "",
  engine_serial_from: "",
  part_code: "",
  labor_1_code: "",
  labor_1_hours: "",
  labor_2_code: "",
  labor_2_hours: "",
  item_number: "",
  item_description: "",
  item_qty: "",
};

/**
 * The campaign catalog — what the Create Job dropdowns read from.
 *
 * The two manufacturers get different forms on purpose. Axopar issues a Boat
 * Service Task against a HIN with Compensated Work Hours; Mercury issues a
 * warranty claim against an engine serial with part/fail codes and labor codes.
 * Each form mirrors the portal it is transcribed from, and the field labels use
 * the manufacturer's own words so copying across needs no mental translation.
 */
export function CampaignsCard({ campaigns, orgId }: Props) {
  const router = useRouter();
  const [mfg, setMfg] = useState<Manufacturer>("axopar");
  const [f, setF] = useState({ ...BLANK });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const set = (k: keyof typeof BLANK, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setError(null);
    if (!f.campaign_code.trim() || !f.title.trim()) {
      setError("Campaign code and title are both required.");
      return;
    }
    setSaving(true);

    const laborCodes = [
      { code: f.labor_1_code.trim(), hours: parseFloat(f.labor_1_hours) },
      { code: f.labor_2_code.trim(), hours: parseFloat(f.labor_2_hours) },
    ].filter((l) => l.code && Number.isFinite(l.hours));

    const parts = f.item_number.trim()
      ? [
          {
            item_number: f.item_number.trim(),
            description: f.item_description.trim(),
            qty: Number.isFinite(parseFloat(f.item_qty)) ? parseFloat(f.item_qty) : 1,
          },
        ]
      : [];

    // Axopar states one figure; Mercury's is the sum of its labor codes.
    const hours =
      mfg === "mercury" && laborCodes.length
        ? laborCodes.reduce((s, l) => s + l.hours, 0)
        : parseFloat(f.compensated_hours) || 0;

    const supabase = createClient();
    const { error: e } = await supabase.from("service_campaigns").insert({
      org_id: orgId,
      manufacturer: mfg,
      campaign_code: f.campaign_code.trim(),
      title: f.title.trim(),
      revision: f.revision.trim() || null,
      description: f.description.trim() || null,
      instructions: f.instructions.trim() || null,
      compensated_hours: hours,
      priority: f.priority,
      applies_to: f.applies_to.trim() || null,
      affected_hins: f.affected_hins
        .split(/[\n,]/)
        .map((h) => h.trim())
        .filter(Boolean),
      engine_model: f.engine_model.trim() || null,
      engine_serial_from: f.engine_serial_from.trim() || null,
      part_code: f.part_code.trim() || null,
      labor_codes: laborCodes,
      part_numbers: parts,
    });

    setSaving(false);
    if (e) {
      setError(
        e.code === "23505"
          ? `A ${manufacturerLabel(mfg)} campaign with code “${f.campaign_code.trim()}” already exists.`
          : e.message
      );
      return;
    }
    setF({ ...BLANK });
    setOpen(false);
    router.refresh();
  }

  async function toggleActive(c: ServiceCampaign) {
    const supabase = createClient();
    const { error: e } = await supabase
      .from("service_campaigns")
      .update({ active: !c.active })
      .eq("id", c.id);
    if (e) setError(e.message);
    else router.refresh();
  }

  const byMfg = (m: Manufacturer) => campaigns.filter((c) => c.manufacturer === m);

  return (
    <div className="rounded-xl border border-border-line bg-card-bg p-5">
      <div className="mb-1 flex items-center gap-3">
        <h2 className="text-lg font-semibold text-text-primary">Service Campaigns</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto rounded-lg border border-border-line px-3 py-1.5 text-xs text-text-secondary hover:border-gold hover:text-text-primary"
        >
          {open ? "Cancel" : "+ Add campaign"}
        </button>
      </div>
      <p className="mb-4 text-sm text-text-secondary">
        Bulletins from Axopar and Mercury. These fill the two campaign dropdowns on
        Create Job.
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-status-bad/40 bg-status-bad/10 px-3 py-2 text-xs text-status-bad">
          {error}
        </p>
      )}

      {open && (
        <div className="mb-5 rounded-lg border border-border-line bg-secondary-bg p-4">
          <div className="mb-4 flex gap-2">
            {(["axopar", "mercury"] as Manufacturer[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMfg(m)}
                className={`flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${
                  mfg === m
                    ? "border-gold bg-gold-muted text-text-primary"
                    : "border-border-line text-text-secondary hover:border-gold/40"
                }`}
              >
                <span className="block text-sm font-semibold">{manufacturerLabel(m)}</span>
                <span className="mt-0.5 block text-[11px] text-text-secondary">
                  {m === "axopar"
                    ? "Boat Service Task · by HIN"
                    : "Warranty claim · by engine serial"}
                </span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label={mfg === "axopar" ? "Campaign code" : "Bulletin number"}
              hint={mfg === "axopar" ? "Service Campaign" : ""}
              value={f.campaign_code}
              onChange={(v) => set("campaign_code", v)}
              placeholder={mfg === "axopar" ? "AX29 25-0110" : "2024-08"}
            />
            <Field
              label="Title"
              hint={mfg === "axopar" ? "Boat Service Task Name" : ""}
              value={f.title}
              onChange={(v) => set("title", v)}
              placeholder={mfg === "axopar" ? "Galvanic isolator" : "Ignition coil replacement"}
            />

            {mfg === "axopar" ? (
              <>
                <Field
                  label="Compensated work hours"
                  hint="Compensated Work Hours"
                  value={f.compensated_hours}
                  onChange={(v) => set("compensated_hours", v)}
                  placeholder="0.5"
                />
                <div>
                  <Label>Priority</Label>
                  <select
                    value={f.priority}
                    onChange={(e) => set("priority", e.target.value)}
                    className={inputCls}
                  >
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <Field
                  label="Part code / fail code"
                  hint="Part Code / Fail Code"
                  value={f.part_code}
                  onChange={(v) => set("part_code", v)}
                  placeholder="306 - COIL 18 - FAILED"
                />
                <Field
                  label="Engine model"
                  value={f.engine_model}
                  onChange={(v) => set("engine_model", v)}
                  placeholder="MERCURY 200EFI CXL 4"
                />
                <Field
                  label="Labor code 1"
                  value={f.labor_1_code}
                  onChange={(v) => set("labor_1_code", v)}
                  placeholder="CA12"
                />
                <Field
                  label="Hours"
                  value={f.labor_1_hours}
                  onChange={(v) => set("labor_1_hours", v)}
                  placeholder="0.5"
                />
                <Field
                  label="Labor code 2 (optional)"
                  value={f.labor_2_code}
                  onChange={(v) => set("labor_2_code", v)}
                  placeholder="CA18"
                />
                <Field
                  label="Hours"
                  value={f.labor_2_hours}
                  onChange={(v) => set("labor_2_hours", v)}
                  placeholder="0.5"
                />
                <Field
                  label="Item number"
                  value={f.item_number}
                  onChange={(v) => set("item_number", v)}
                  placeholder="8M0044991"
                />
                <Field
                  label="Item description"
                  value={f.item_description}
                  onChange={(v) => set("item_description", v)}
                  placeholder="COIL IGNITION"
                />
              </>
            )}

            <Field label="Revision" value={f.revision} onChange={(v) => set("revision", v)} placeholder="B" />
            <Field
              label="Applies to"
              value={f.applies_to}
              onChange={(v) => set("applies_to", v)}
              placeholder={mfg === "axopar" ? "AX29 — EU and US hulls" : "250–450 hp, 2022–2023"}
            />

            <div className="sm:col-span-2">
              <Label>{mfg === "axopar" ? "Issue" : "Description"}</Label>
              <textarea
                rows={2}
                value={f.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Cable to the galvanic isolator not connected correctly."
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Instructions{mfg === "axopar" ? " (Introduction)" : ""}</Label>
              <textarea
                rows={4}
                value={f.instructions}
                onChange={(e) => set("instructions", e.target.value)}
                placeholder="Step-by-step procedure the tech follows."
                className={inputCls}
              />
            </div>

            <div className="sm:col-span-2">
              <Label>
                {mfg === "axopar" ? "Affected HINs" : "Engine serial — from"}
                <span className="ml-1 font-normal normal-case tracking-normal text-text-secondary">
                  {mfg === "axopar"
                    ? "— one per line. Recorded on the bulletin so you know which hulls it covers."
                    : "— “and after”. Recorded for reference; boats have no engine-serial field yet, so this is not matched automatically."}
                </span>
              </Label>
              {mfg === "axopar" ? (
                <textarea
                  rows={2}
                  value={f.affected_hins}
                  onChange={(e) => set("affected_hins", e.target.value)}
                  placeholder={"FI-AXO9C148I425\nFI-AXO9C148I426"}
                  className={inputCls}
                />
              ) : (
                <input
                  value={f.engine_serial_from}
                  onChange={(e) => set("engine_serial_from", e.target.value)}
                  placeholder="3B458751"
                  className={inputCls}
                />
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="mt-4 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-primary-bg hover:bg-gold-hover disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save to catalog"}
          </button>
        </div>
      )}

      {campaigns.length === 0 && !open && (
        <p className="py-2 text-sm italic text-text-secondary">
          No campaigns yet. Add one as each bulletin arrives from Axopar or Mercury.
        </p>
      )}

      {(["axopar", "mercury"] as Manufacturer[]).map((m) => {
        const rows = byMfg(m);
        if (rows.length === 0) return null;
        return (
          <div key={m} className="mt-4">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.13em] text-text-secondary">
              {manufacturerLabel(m)} · {rows.length}
            </p>
            {rows.map((c) => (
              <div
                key={c.id}
                className={`mb-1.5 flex items-start gap-3 rounded-lg border border-border-line bg-secondary-bg p-3 ${
                  c.active ? "" : "opacity-50"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-text-primary">
                    {c.campaign_code} · {c.title}
                    {c.priority === "urgent" && (
                      <span className="ml-2 rounded bg-status-bad/15 px-1.5 py-0.5 text-[10px] font-semibold text-status-bad">
                        URGENT
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-text-secondary">
                    {c.applies_to || c.engine_model || "—"}
                    {c.revision ? ` · rev ${c.revision}` : ""}
                    {c.manufacturer === "axopar" && c.affected_hins?.length
                      ? ` · ${c.affected_hins.length} hull${c.affected_hins.length === 1 ? "" : "s"}`
                      : ""}
                    {c.manufacturer === "mercury" && c.engine_serial_from
                      ? ` · serial ${c.engine_serial_from}+`
                      : ""}
                  </span>
                  {c.manufacturer === "mercury" && (c.part_code || c.labor_codes?.length) && (
                    <span className="mt-0.5 block font-mono text-[10px] text-text-secondary/80">
                      {c.part_code}
                      {c.part_code && c.labor_codes?.length ? " · " : ""}
                      {laborCodeSummary(c.labor_codes)}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-xs text-gold">
                  {compensatedHours(c).toFixed(1)} h
                </span>
                <button
                  type="button"
                  onClick={() => toggleActive(c)}
                  className="shrink-0 rounded border border-border-line px-2 py-1 text-[11px] text-text-secondary hover:border-gold hover:text-text-primary"
                >
                  {c.active ? "Retire" : "Restore"}
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border-line bg-primary-bg px-3 py-2 text-sm text-text-primary placeholder-text-secondary/40 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-text-secondary">
      {children}
    </label>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
      {hint && (
        <span className="mt-1 block font-mono text-[10px] text-text-secondary/70">
          from <span className="text-gold">{hint}</span>
        </span>
      )}
    </div>
  );
}
