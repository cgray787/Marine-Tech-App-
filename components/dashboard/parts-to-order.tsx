"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { groupPartsByCustomerBoat, type PartRow } from "@/lib/dashboard/parts";

export function PartsToOrder({ parts }: { parts: PartRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showOrdered, setShowOrdered] = useState(false);

  const toOrder = parts.filter((p) => p.status === "need_to_order");
  const ordered = parts.filter((p) => p.status === "ordered");
  const groups = groupPartsByCustomerBoat(toOrder);

  async function setStatus(id: string, status: "need_to_order" | "ordered") {
    setBusyId(id);
    const supabase = createClient();
    const { error } = await supabase
      .from("parts")
      .update({ status, ordered_at: status === "ordered" ? new Date().toISOString() : null })
      .eq("id", id);
    setBusyId(null);
    if (!error) router.refresh();
  }

  return (
    <div className="mt-6 rounded-xl border border-border-line bg-card-bg">
      <div className="flex items-center justify-between border-b border-border-line px-6 py-4">
        <h2 className="font-semibold text-text-primary">
          Parts to Order{" "}
          <span className="ml-1 rounded-full bg-gold-muted px-2 py-0.5 text-xs font-medium text-gold">
            {toOrder.length}
          </span>
        </h2>
        {ordered.length > 0 && (
          <button
            onClick={() => setShowOrdered((v) => !v)}
            className="text-sm text-gold hover:text-gold-hover"
          >
            {showOrdered ? "Hide" : "Show"} ordered ({ordered.length})
          </button>
        )}
      </div>

      <div className="p-4">
        {toOrder.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-text-secondary">
            No parts to order right now.
          </p>
        ) : (
          <div className="space-y-5">
            {groups.map((c) => (
              <div key={c.customerId}>
                <p className="mb-2 text-sm font-semibold text-text-primary">{c.customerName}</p>
                {c.boats.map((b) => (
                  <div key={b.boatId} className="mb-3">
                    <p className="mb-1.5 text-xs uppercase tracking-wide text-text-secondary">
                      {b.boatName}
                    </p>
                    <div className="space-y-2">
                      {b.parts.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-start justify-between gap-3 rounded-lg border border-gold/40 bg-gold-muted px-4 py-3"
                        >
                          <div className="flex items-start gap-3">
                            {p.photo_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.photo_url} alt={p.name} className="h-12 w-12 rounded object-cover" />
                            )}
                            <div>
                              <p className="text-sm font-medium text-gold">
                                {p.quantity > 1 ? `${p.quantity}× ` : ""}
                                {p.name}
                                {p.part_number ? ` · #${p.part_number}` : ""}
                              </p>
                              {p.description && (
                                <p className="mt-0.5 text-xs text-text-secondary">{p.description}</p>
                              )}
                              {p.supplier && (
                                <p className="mt-0.5 text-xs text-text-secondary">
                                  {p.url ? (
                                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
                                      {p.supplier}
                                    </a>
                                  ) : (
                                    p.supplier
                                  )}
                                </p>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => setStatus(p.id, "ordered")}
                            disabled={busyId === p.id}
                            className="shrink-0 rounded-lg border border-gold px-3 py-1.5 text-xs font-medium text-gold transition-colors hover:bg-gold/20 disabled:opacity-50"
                          >
                            Need to order
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {showOrdered && ordered.length > 0 && (
          <div className="mt-5 border-t border-border-line pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Ordered</p>
            <div className="space-y-2">
              {ordered.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border-line px-4 py-2">
                  <p className="text-sm text-text-secondary line-through">
                    {p.customer_name ?? "Unassigned"} · {p.boat_name ?? "No boat"} · {p.name}
                  </p>
                  <button
                    onClick={() => setStatus(p.id, "need_to_order")}
                    disabled={busyId === p.id}
                    className="shrink-0 rounded-lg border border-border-line px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
                  >
                    Ordered
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
