"use client";

import { useEffect, useState } from "react";
import { LOCATION_COOKIE, LOCATION_EVENT, parseLocationValue } from "./constants";

export function readLocationCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${LOCATION_COOKIE}=`));
  return parseLocationValue(match ? match.slice(LOCATION_COOKIE.length + 1) : null);
}

export function setLocationCookie(id: string | null) {
  if (id) {
    document.cookie = `${LOCATION_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`;
  } else {
    document.cookie = `${LOCATION_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }
  window.dispatchEvent(new Event(LOCATION_EVENT));
}

/**
 * Client mirror of lib/location/server.ts `activeLocation()` for pages that
 * fetch with react-query (the calendar). Initial read happens in an effect so
 * SSR markup and the first client render agree (cookie isn't part of the
 * server-rendered HTML for client components).
 */
export function useLocationFilter(): string | null {
  const [loc, setLoc] = useState<string | null>(null);
  useEffect(() => {
    setLoc(readLocationCookie());
    const handler = () => setLoc(readLocationCookie());
    window.addEventListener(LOCATION_EVENT, handler);
    return () => window.removeEventListener(LOCATION_EVENT, handler);
  }, []);
  return loc;
}
