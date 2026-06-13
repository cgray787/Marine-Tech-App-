// Shared by the server cookie reader (lib/location/server.ts) and the client
// switcher/hook (lib/location/client.ts) — no next/headers, no "use client",
// so both sides can import it.

export const LOCATION_COOKIE = "mt-location";

// Fired on window by setLocationCookie so client-side data (the calendar's
// react-query keys) can react without a full reload.
export const LOCATION_EVENT = "mt-location-changed";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate a raw cookie value into a location id or null ("all offices"). */
export function parseLocationValue(value: string | null | undefined): string | null {
  return value && UUID_RE.test(value) ? value : null;
}
