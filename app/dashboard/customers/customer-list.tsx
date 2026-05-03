"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCanWrite } from "@/lib/role-context";

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
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
  const [boatColor, setBoatColor] = useState("");
  const [boatMarina, setBoatMarina] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: insertError } = await supabase.from("customers").insert({
      name: customerName,
      email: customerEmail || null,
      phone: customerPhone || null,
      address: customerAddress || null,
      notes: customerNotes || null,
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setCustomerAddress("");
    setCustomerNotes("");
    setShowCustomerForm(false);
    setLoading(false);
    router.refresh();
  }

  async function handleAddBoat(e: React.FormEvent, customerId: string) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: insertError } = await supabase.from("boats").insert({
      customer_id: customerId,
      name: boatName,
      make_model: boatMakeModel || null,
      year: boatYear ? parseInt(boatYear) : null,
      hin: boatHin || null,
      engine_make: boatEngineMake || null,
      engine_model: boatEngineModel || null,
      color: boatColor || null,
      home_marina: boatMarina || null,
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    setBoatName("");
    setBoatMakeModel("");
    setBoatYear("");
    setBoatHin("");
    setBoatEngineMake("");
    setBoatEngineModel("");
    setBoatColor("");
    setBoatMarina("");
    setShowBoatForm(null);
    setLoading(false);
    router.refresh();
  }

  function resetBoatForm() {
    setBoatName("");
    setBoatMakeModel("");
    setBoatYear("");
    setBoatHin("");
    setBoatEngineMake("");
    setBoatEngineModel("");
    setBoatColor("");
    setBoatMarina("");
  }

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
            + Add Customer
          </button>
        ) : (
          <div className="rounded-xl border border-border-line bg-card-bg p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">
                Add New Customer
              </h2>
              <button
                onClick={() => setShowCustomerForm(false)}
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
                  {loading ? "Adding..." : "Add Customer"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCustomerForm(false)}
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

      {/* Customer List */}
      <div className="space-y-4">
        {initialCustomers.length > 0 ? (
          initialCustomers.map((customer) => {
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

                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gold">
                        Boats
                      </h3>
                      {canWrite && (
                      <button
                        onClick={() => {
                          resetBoatForm();
                          setShowBoatForm(
                            showBoatForm === customer.id
                              ? null
                              : customer.id
                          );
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
                              {loading ? "Adding..." : "Add Boat"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowBoatForm(null)}
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
                            <div className="flex items-start justify-between">
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
                              {boat.hin && (
                                <span className="rounded bg-gold-muted px-2 py-0.5 text-xs text-gold">
                                  HIN: {boat.hin}
                                </span>
                              )}
                            </div>
                            {(boat.engine_make || boat.engine_model) && (
                              <p className="mt-1 text-xs text-text-secondary">
                                Engine:{" "}
                                {[boat.engine_make, boat.engine_model]
                                  .filter(Boolean)
                                  .join(" ")}
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
              No customers yet. Add one to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
