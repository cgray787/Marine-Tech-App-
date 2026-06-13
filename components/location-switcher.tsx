"use client";

import { useRouter } from "next/navigation";
import { setLocationCookie } from "@/lib/location/client";

export type LocationOption = { id: string; name: string };

/**
 * Office filter for org-wide users (admins + Owner). Writes the mt-location
 * cookie, notifies client-side queries, and refreshes server components.
 * Managers/techs never see this — RLS already scopes them to one office.
 */
export function LocationSwitcher({
  locations,
  current,
}: {
  locations: LocationOption[];
  current: string | null;
}) {
  const router = useRouter();

  return (
    <div className="border-b border-border-line px-4 py-3">
      <label
        htmlFor="location-switcher"
        className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-text-secondary"
      >
        Office
      </label>
      <select
        id="location-switcher"
        value={current ?? ""}
        onChange={(e) => {
          setLocationCookie(e.target.value || null);
          router.refresh();
        }}
        className="w-full rounded-lg border border-border-line bg-primary-bg px-2.5 py-1.5 text-sm text-text-primary outline-none transition-colors focus:border-gold/50"
      >
        <option value="">All offices</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}
