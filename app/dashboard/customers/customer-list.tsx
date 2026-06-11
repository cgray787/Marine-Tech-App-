"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCanWrite } from "@/lib/role-context";

// Only treat a stored Salesforce URL as a real link if it's https on a
// salesforce.com host. Guards the href against javascript:/data: URIs even
// though the column is server-written today (defense in depth).
function isSafeSalesforceUrl(u: string | null): u is string {
  if (!u) return false;
  try {
    const p = new URL(u);
    return p.protocol === "https:" && p.hostname.endsWith(".salesforce.com");
  } catch {
    return false;
  }
}

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  salesforce_url: string | null;
  created_at: string;
};

type Boat = {
  id: string;
  customer_id: string;
  name: string;
  make_model: string | null;
  year: number | null;
  hin: string | null;
  engine_make: string | null;
  engine_model: string | null;
  engine_hours_port: number | null;
  engine_hours_starboard: number | null;
  color: string | null;
  home_marina: string | null;
  created_at: string;
};

export function CustomerList({
  initialCustomers,
  initialBoats,
}: {
  initialCustomers: Customer[];
  initialBoats: Boat[];
}) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showBoatForm, setShowBoatForm] = useState<string | null>(null);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // When set, the matching add-form is repurposed as an edit-form (Save calls
  // update() instead of insert()). Each holds the id of the row being edited.
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editingBoatId, setEditingBoatId] = useState<string | null>(null);

  // Customer form state
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");

  // Boat form state
  const [boatName, setBoatName] = useState("");
  const [boatMakeModel, setBoatMakeModel] = useState("");
  const [boatYear, setBoatYear] = useState("");
  const [boatHin, setBoatHin] = useState("");
  const [boatEngineMake, setBoatEngineMake] = useState("");
  const [boatEngineModel, setBoatEngineModel] = useState("");
  const [boatEngineHoursPort, setBoatEngineHoursPort] = useState("");
  const [boatEngineHoursStarboard, setBoatEngineHoursStarboard] = useState("");
  const [boatColor, setBoatColor] = useState("");
  const [boatMarina, setBoatMarina] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const payload = {
      name: customerName,
      email: customerEmail || null,
      phone: customerPhone || null,
      address: customerAddress || null,
      notes: customerNotes || null,
    };
    // Edit path — update the existing row. Otherwise insert. org_id/location_id
    // are assigned server-side from the caller's profile by the
    // set_customer_tenant BEFORE INSERT trigger (migration 023) on create,
    // and stay put on update.
    const { error: writeError } = editingCustomerId
      ? await supabase.from("customers").update(payload).eq("id", editingCustomerId)
      : await supabase.from("customers").insert(payload);

    if (writeError) {
      setError(writeError.message);
      setLoading(false);
      return;
    }

    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setCustomerAddress("");
    setCustomerNotes("");
    setShowCustomerForm(false);
    setEditingCustomerId(null);
    setLoading(false);
    router.refresh();
  }

  // Open the customer form pre-populated for editing the given customer.
  function beginEditCustomer(c: Customer) {
    setCustomerName(c.name);
    setCustomerEmail(c.email ?? "");
    setCustomerPhone(c.phone ?? "");
    setCustomerAddress(c.address ?? "");
    setCustomerNotes(c.notes ?? "");
    setEditingCustomerId(c.id);
    setShowCustomerForm(true);
    // Scroll the form into view since the cards live below it.
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelCustomerForm() {
    setShowCustomerForm(false);
    setEditingCustomerId(null);
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setCustomerAddress("");
    setCustomerNotes("");
    setError("");
  }

  async function handleAddBoat(e: React.FormEvent, customerId: string) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const payload = {
      name: boatName,
      make_model: boatMakeModel || null,
      year: boatYear ? parseInt(boatYear) : null,
      hin: boatHin || null,
      engine_make: boatEngineMake || null,
      engine_model: boatEngineModel || null,
      engine_hours_port: boatEngineHoursPort
        ? parseFloat(boatEngineHoursPort)
        : null,
      engine_hours_starboard: boatEngineHoursStarboard
        ? parseFloat(boatEngineHoursStarboard)
        : null,
      color: boatColor || null,
      home_marina: boatMarina || null,
    };
    // Edit branch updates the matching boat; create branch attaches a new boat
    // to the customer. customer_id is set only on create — moving a boat
    // between owners is out of scope for this form.
    const { error: writeError } = editingBoatId
      ? await supabase.from("boats").update(payload).eq("id", editingBoatId)
      : await supabase.from("boats").insert({ customer_id: customerId, ...payload });

    if (writeError) {
      setError(writeError.message);
      setLoading(false);
      return;
    }

    setBoatName("");
    setBoatMakeModel("");
    setBoatYear("");
    setBoatHin("");
    setBoatEngineMake("");
    setBoatEngineModel("");
    setBoatEngineHoursPort("");
    setBoatEngineHoursStarboard("");
    setBoatColor("");
    setBoatMarina("");
    setShowBoatForm(null);
    setEditingBoatId(null);
    setLoading(false);
    router.refresh();
  }

  // Open the boat form for `customerId` pre-populated with this boat's fields.
  function beginEditBoat(b: Boat) {
    setBoatName(b.name ?? "");
    setBoatMakeModel(b.make_model ?? "");
    setBoatYear(b.year != null ? String(b.year) : "");
    setBoatHin(b.hin ?? "");
    setBoatEngineMake(b.engine_make ?? "");
    setBoatEngineModel(b.engine_model ?? "");
    setBoatEngineHoursPort(b.engine_hours_port != null ? String(b.engine_hours_port) : "");
    setBoatEngineHoursStarboard(b.engine_hours_starboard != null ? String(b.engine_hours_starboard) : "");
    setBoatColor(b.color ?? "");
    setBoatMarina(b.home_marina ?? "");
    setEditingBoatId(b.id);
    setShowBoatForm(b.customer_id);
    setExpandedCustomer(b.customer_id);
  }

  async function deleteCustomer(customerId: string, customerName: string) {
    if (
      !confirm(
        `Delete ${customerName}? Their boats, jobs, service reports, and PDI reports will be removed. This can't be undone.`
      )
    )
      return;
    const supabase = createClient();
    // jobs / service_reports / pdi_reports reference customers WITHOUT
    // ON DELETE CASCADE (migration 001), so a single DELETE on the parent
    // would fail with an FK violation. Walk children first, parent last —
    // mirrors the cascade the mobile app's handleDeleteClient does.
    const steps = [
      supabase.from("service_reports").delete().eq("customer_id", customerId),
      supabase.from("pdi_reports").delete().eq("customer_id", customerId),
      supabase.from("jobs").delete().eq("customer_id", customerId),
      // boats has ON DELETE CASCADE so it goes with the parent — no manual
      // step needed, but we DELETE it explicitly so a partial RLS failure
      // surfaces clearly instead of cascading silently.
      supabase.from("boats").delete().eq("customer_id", customerId),
      supabase.from("customers").delete().eq("id", customerId),
    ];
    for (const step of steps) {
      const { error: delError } = await step;
      if (delError) {
        setError(delError.message);
        return;
      }
    }
    router.refresh();
  }

  function cancelBoatForm() {
    setShowBoatForm(null);
    setEditingBoatId(null);
    resetBoatForm();
    setError("");
  }

  function resetBoatForm() {
    setBoatName("");
    setBoatMakeModel("");
    setBoatYear("");
    setBoatHin("");
    setBoatEngineMake("");
    setBoatEngineModel("");
    setBoatEngineHoursPort("");
    setBoatEngineHoursStarboard("");
    setBoatColor("");
    setBoatMarina("");
  }

  // Filter by customer name/email/phone and their boats' name/make-model.
  const q = search.trim().toLowerCase();
  const visibleCustomers = q
    ? initialCustomers.filter((c) => {
        const boats = initialBoats.filter((b) => b.customer_id === c.id);
        const haystack = [
          c.name,
          c.email,
          c.phone,
          ...boats.flatMap((b) => [b.name, b.make_model]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
    : initialCustomers;

  return (
    <div>
      {/* Add Customer — admins only; viewers see no add button or form. */}
      {canWrite && (
      <div className="mb-6">
        {!showCustomerForm ? (
          <button
            onClick={() => setShowCustomerForm(true)}
            className="rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-primary-bg transition-colors hover:bg-gold-hover"
          >
            + Add Client
          </button>
        ) : (
          <div className="rounded-xl border border-border-line bg-card-bg p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">
                {editingCustomerId ? "Edit Client" : "Add New Client"}
              </h2>
              <button
                onClick={cancelCustomerForm}
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

            <form onSubmit={handleAddCustomer} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                    placeholder="John Doe"
                    className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2.5 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                    Email
                  </label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="john@example.com"
                    className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2.5 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="(206) 555-1234"
                    className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2.5 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                    Address
                  </label>
                  <input
                    type="text"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="123 Marina Way"
                    className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2.5 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Notes
                </label>
                <textarea
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  rows={2}
                  placeholder="Additional notes..."
                  className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2.5 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-gold px-6 py-2.5 text-sm font-semibold text-primary-bg transition-colors hover:bg-gold-hover disabled:opacity-50"
                >
                  {loading
                    ? (editingCustomerId ? "Saving..." : "Adding...")
                    : (editingCustomerId ? "Save Changes" : "Add Client")}
                </button>
                <button
                  type="button"
                  onClick={cancelCustomerForm}
                  className="rounded-lg border border-border-line px-6 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
          />
        </svg>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customers by name, email, phone, or boat…"
          className="w-full rounded-lg border border-border-line bg-secondary-bg py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
        />
      </div>

      {/* Customer List */}
      <div className="space-y-4">
        {visibleCustomers.length > 0 ? (
          visibleCustomers.map((customer) => {
            const customerBoats = initialBoats.filter(
              (b) => b.customer_id === customer.id
            );
            const isExpanded = expandedCustomer === customer.id;

            return (
              <div
                key={customer.id}
                className="rounded-xl border border-border-line bg-card-bg"
              >
                {/* Customer Header */}
                <button
                  onClick={() =>
                    setExpandedCustomer(isExpanded ? null : customer.id)
                  }
                  className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-white/5"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/20 text-sm font-semibold text-gold">
                      {customer.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-medium text-text-primary">
                        {customer.name}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {customer.email || "No email"}{" "}
                        {customer.phone ? `| ${customer.phone}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-gold-muted px-2.5 py-0.5 text-xs font-medium text-gold">
                      {customerBoats.length} boat{customerBoats.length !== 1 ? "s" : ""}
                    </span>
                    <svg
                      className={`h-5 w-5 text-text-secondary transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-border-line px-6 py-4">
                    {customer.address && (
                      <p className="mb-2 text-xs text-text-secondary">
                        Address: {customer.address}
                      </p>
                    )}
                    {customer.notes && (
                      <p className="mb-4 text-xs text-text-secondary">
                        Notes: {customer.notes}
                      </p>
                    )}

                    {/* Client actions: Edit + Delete + Salesforce */}
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      {canWrite && (
                        <button
                          onClick={() => beginEditCustomer(customer)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold-muted px-3 py-1.5 text-xs font-medium text-gold transition-colors hover:bg-gold/20"
                        >
                          ✎ Edit Client
                        </button>
                      )}
                      {canWrite && (
                        <button
                          onClick={() => deleteCustomer(customer.id, customer.name)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20"
                        >
                          🗑 Delete Client
                        </button>
                      )}
                      {isSafeSalesforceUrl(customer.salesforce_url) ? (
                        <a
                          href={customer.salesforce_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border-line px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-white/5"
                        >
                          ☁ View in Salesforce
                        </a>
                      ) : (
                        <a
                          href="https://jeffbrownyachts.my.salesforce.com/lightning/o/Account/new?recordTypeId=0123h000000ANsqAAG"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold-muted px-3 py-1.5 text-xs font-medium text-gold transition-colors hover:bg-gold/20"
                        >
                          ➕ Add to Salesforce
                        </a>
                      )}
                    </div>

                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gold">
                        Boats
                      </h3>
                      {canWrite && (
                      <button
                        onClick={() => {
                          // Toggle the boat form; always cancel any in-progress
                          // edit so the form opens in pristine "add" mode.
                          if (showBoatForm === customer.id && !editingBoatId) {
                            cancelBoatForm();
                          } else {
                            cancelBoatForm();
                            setShowBoatForm(customer.id);
                          }
                        }}
                        className="rounded-lg border border-gold/30 px-3 py-1 text-xs font-medium text-gold transition-colors hover:bg-gold-muted"
                      >
                        + Add Boat
                      </button>
                      )}
                    </div>

                    {/* Add Boat Form */}
                    {showBoatForm === customer.id && (
                      <div className="mb-4 rounded-lg border border-border-line bg-secondary-bg p-4">
                        <form
                          onSubmit={(e) => handleAddBoat(e, customer.id)}
                          className="space-y-3"
                        >
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <input
                              type="text"
                              value={boatName}
                              onChange={(e) => setBoatName(e.target.value)}
                              required
                              placeholder="Boat Name *"
                              className="rounded-lg border border-border-line bg-primary-bg px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none"
                            />
                            <input
                              type="text"
                              value={boatMakeModel}
                              onChange={(e) => setBoatMakeModel(e.target.value)}
                              placeholder="Make/Model"
                              className="rounded-lg border border-border-line bg-primary-bg px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none"
                            />
                            <input
                              type="number"
                              value={boatYear}
                              onChange={(e) => setBoatYear(e.target.value)}
                              placeholder="Year"
                              className="rounded-lg border border-border-line bg-primary-bg px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none"
                            />
                            <input
                              type="text"
                              value={boatHin}
                              onChange={(e) => setBoatHin(e.target.value)}
                              placeholder="HIN"
                              className="rounded-lg border border-border-line bg-primary-bg px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none"
                            />
                            <input
                              type="text"
                              value={boatEngineMake}
                              onChange={(e) =>
                                setBoatEngineMake(e.target.value)
                              }
                              placeholder="Engine Make"
                              className="rounded-lg border border-border-line bg-primary-bg px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none"
                            />
                            <input
                              type="text"
                              value={boatEngineModel}
                              onChange={(e) =>
                                setBoatEngineModel(e.target.value)
                              }
                              placeholder="Engine Model"
                              className="rounded-lg border border-border-line bg-primary-bg px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none"
                            />
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.1"
                              value={boatEngineHoursPort}
                              onChange={(e) =>
                                setBoatEngineHoursPort(e.target.value)
                              }
                              placeholder="Engine Hours (Port)"
                              className="rounded-lg border border-border-line bg-primary-bg px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none"
                            />
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.1"
                              value={boatEngineHoursStarboard}
                              onChange={(e) =>
                                setBoatEngineHoursStarboard(e.target.value)
                              }
                              placeholder="Engine Hours (Stbd, twin only)"
                              className="rounded-lg border border-border-line bg-primary-bg px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none"
                            />
                            <input
                              type="text"
                              value={boatColor}
                              onChange={(e) => setBoatColor(e.target.value)}
                              placeholder="Color"
                              className="rounded-lg border border-border-line bg-primary-bg px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none"
                            />
                            <input
                              type="text"
                              value={boatMarina}
                              onChange={(e) => setBoatMarina(e.target.value)}
                              placeholder="Home Marina"
                              className="rounded-lg border border-border-line bg-primary-bg px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="submit"
                              disabled={loading}
                              className="rounded-lg bg-gold px-4 py-2 text-xs font-semibold text-primary-bg transition-colors hover:bg-gold-hover disabled:opacity-50"
                            >
                              {loading
                                ? (editingBoatId ? "Saving..." : "Adding...")
                                : (editingBoatId ? "Save Changes" : "Add Boat")}
                            </button>
                            <button
                              type="button"
                              onClick={cancelBoatForm}
                              className="rounded-lg border border-border-line px-4 py-2 text-xs text-text-secondary hover:text-text-primary"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* Boats List */}
                    {customerBoats.length > 0 ? (
                      <div className="space-y-2">
                        {customerBoats.map((boat) => (
                          <div
                            key={boat.id}
                            className="rounded-lg border border-border-line bg-secondary-bg px-4 py-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-text-primary">
                                  {boat.name}
                                </p>
                                <p className="text-xs text-text-secondary">
                                  {[
                                    boat.make_model,
                                    boat.year,
                                    boat.color,
                                  ]
                                    .filter(Boolean)
                                    .join(" | ")}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {boat.hin && (
                                  <span className="rounded bg-gold-muted px-2 py-0.5 text-xs text-gold">
                                    HIN: {boat.hin}
                                  </span>
                                )}
                                {canWrite && (
                                  <button
                                    onClick={() => beginEditBoat(boat)}
                                    className="rounded-md border border-gold/30 px-2 py-0.5 text-[11px] font-medium text-gold transition-colors hover:bg-gold-muted"
                                    title="Edit boat"
                                  >
                                    ✎ Edit
                                  </button>
                                )}
                              </div>
                            </div>
                            {(boat.engine_make || boat.engine_model) && (
                              <p className="mt-1 text-xs text-text-secondary">
                                Engine:{" "}
                                {[boat.engine_make, boat.engine_model]
                                  .filter(Boolean)
                                  .join(" ")}
                              </p>
                            )}
                            {(boat.engine_hours_port != null ||
                              boat.engine_hours_starboard != null) && (
                              <p className="mt-0.5 text-xs text-text-secondary">
                                Engine Hours:{" "}
                                {boat.engine_hours_port != null &&
                                boat.engine_hours_starboard != null
                                  ? `Port ${boat.engine_hours_port} · Stbd ${boat.engine_hours_starboard}`
                                  : `${boat.engine_hours_port ?? boat.engine_hours_starboard}`}
                              </p>
                            )}
                            {boat.home_marina && (
                              <p className="mt-0.5 text-xs text-text-secondary">
                                Marina: {boat.home_marina}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-text-secondary">
                        No boats registered for this customer
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="rounded-xl border border-border-line bg-card-bg p-12 text-center">
            <p className="text-sm text-text-secondary">
              {q
                ? `No customers match “${search.trim()}”.`
                : "No customers yet. Add one to get started."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
