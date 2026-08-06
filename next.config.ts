import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep the client-side Router Cache for dynamically-rendered routes so
    // re-clicking a recently-opened dashboard tab paints instantly from cache
    // instead of re-running the full server render (auth round-trips + queries).
    // Next's default for dynamic routes is 0 (no reuse) — the main reason
    // tab-to-tab navigation feels slow.
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
