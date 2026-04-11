"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Subscribes to Supabase Realtime changes on the given tables
 * and calls router.refresh() to re-fetch server component data.
 */
export function RealtimeRefresh({ tables }: { tables: string[] }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const channel = supabase
      .channel("dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: tables[0] },
        () => router.refresh()
      );

    // Subscribe to additional tables
    for (let i = 1; i < tables.length; i++) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: tables[i] },
        () => router.refresh()
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, tables]);

  return null;
}
