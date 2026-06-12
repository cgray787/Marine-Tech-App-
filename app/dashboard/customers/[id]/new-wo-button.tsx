"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createDraftWorkOrder } from "@/lib/work-orders/queries";

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
      const result = await createDraftWorkOrder(supabase, { profileId, customerId });
      if ("error" in result) {
        setError(result.error);
        setCreating(false);
        return;
      }
      router.push(`/dashboard/work-orders/${result.id}`);
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
