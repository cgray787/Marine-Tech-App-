"use client";

import { setLocationCookie } from "@/lib/location/client";

type Office = { id: string; name: string };

// Renders one card per office + an "All Offices" card. Writing null = all
// offices (matches lib/location parseLocationValue convention). Only reached
// by org-wide users (the page redirects everyone else), so All Offices is safe.
export function OfficePicker({
  locations,
  current,
}: {
  locations: Office[];
  current: string | null;
}) {
  function choose(id: string | null) {
    setLocationCookie(id);
    window.location.href = "/dashboard";
  }
  const cards: Office[] = [...locations, { id: "__all__", name: "All Offices" }];
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center">
      <div className="anchor-bob mb-3 text-4xl text-gold">&#9875;</div>
      <h1 className="mb-1 text-2xl font-bold text-text-primary">Choose an office</h1>
      <p className="mb-8 text-sm text-text-secondary">Pick the office you&apos;re working out of.</p>
      <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((o) => {
          const isAll = o.id === "__all__";
          const selected = isAll ? current === null : current === o.id;
          return (
            <button
              key={o.id}
              onClick={() => choose(isAll ? null : o.id)}
              className={`flex items-center gap-3 rounded-xl border px-5 py-4 text-left transition-colors ${
                selected
                  ? "border-gold bg-gold/10"
                  : "border-border-line bg-card-bg hover:border-gold/50"
              }`}
            >
              <span className="text-2xl text-gold">{isAll ? "▣" : "⚓"}</span>
              <span className="text-base font-medium text-text-primary">{o.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
