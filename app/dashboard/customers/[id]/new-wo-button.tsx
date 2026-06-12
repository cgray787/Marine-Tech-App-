"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  customerId: string;
  profileId: string;
};

export function NewWOButton({ customerId, profileId }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const supabase = createClient();
      const [{ data: settings }, { data: me }] = await Promise.all([
        supabase.from("wo_settings").select("*").single(),
        supabase.from("profiles").select("id, location_id, org_id").eq("id", profileId).single(),
      ]);
      if (!me) {
        setError("Could not load your profile.");
        setCreating(false);
        return;
      }
      const { data: created, error: insertError } = await supabase
        .from("work_orders")
        .insert({
          org_id: me.org_id,
          location_id: me.location_id,
          customer_id: customerId,
          service_advisor: profileId,
          created_by: profileId,
          default_margin_pct: settings?.default_margin_pct ?? 25,
          taxes: settings?.default_taxes ?? [],
          cc_fee_pct: null,
        })
        .select("id")
        .single();
      if (insertError || !created) {
        setError(insertError?.message ?? "Work order was not created.");
        setCreating(false);
        return;
      }
      router.push(`/dashboard/work-orders/${created.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setCreating(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleCreate}
        disabled={creating}
        className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-[#060a12] transition-colors hover:bg-[#d4b87e] disabled:opacity-50"
      >
        {creating ? "Creating…" : "New Work Order"}
      </button>
      {error && (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
