"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCanWrite } from "@/lib/role-context";

type Customer = { id: string; name: string };
type Boat = { id: string; name: string; customer_id: string; make_model: string };
type Tech = { id: string; full_name: string; email: string };
type Marina = { id: string; name: string };

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
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState("");
  const [notes, setNotes] = useState("");

  const filteredBoats = customerId
    ? boats.filter((b) => b.customer_id === customerId)
    : boats;

  function toggleServiceType(type: string) {
    setServiceTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: insertError } = await supabase.from("jobs").insert({
      customer_id: customerId || null,
      boat_id: boatId || null,
      assigned_to: techId || null,
      marina_id: marinaId || null,
      service_types: serviceTypes,
      scheduled_date: scheduledDate || null,
      notes: notes || null,
      status: "new",
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    // Reset form
    setCustomerId("");
    setBoatId("");
    setTechId("");
    setMarinaId("");
    setServiceTypes([]);
    setScheduledDate("");
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

              {/* Marina */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Marina
                </label>
                <select
                  value={marinaId}
                  onChange={(e) => setMarinaId(e.target.value)}
                  className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2.5 text-sm text-text-primary focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                >
                  <option value="">Select marina...</option>
                  {marinas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Scheduled Date */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Scheduled Date
                </label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2.5 text-sm text-text-primary focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                />
              </div>
            </div>

            {/* Service Types */}
            <div>
              <label className="mb-2 block text-sm font-medium text-text-secondary">
                Service Types
              </label>
              <div className="flex flex-wrap gap-2">
                {SERVICE_TYPE_OPTIONS.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleServiceType(type)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      serviceTypes.includes(type)
                        ? "border-gold bg-gold-muted text-gold"
                        : "border-border-line text-text-secondary hover:border-gold/30 hover:text-text-primary"
                    }`}
                  >
                    {type}
                  </button>
                ))}
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
