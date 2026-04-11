"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Subscribes to Supabase Realtime changes on the given tables
 * and calls router.refresh() to re-fetch server component data.
 */
export function RealtimeRefresh({ tables }: { tables: string[] }) {
  const router = useRouter();
  // Use a ref to avoid re-subscribing when the parent re-renders with a new array reference
  const tablesRef = useRef(tables);
  tablesRef.current = tables;

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const channel = supabase.channel("dashboard-realtime");

    for (const table of tablesRef.current) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => router.refresh()
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
