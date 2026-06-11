"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// "Manager" = role=manager (location-scoped, full data ops in their office —
// the right pick for Seattle / Sausalito tech leads). "Edit" = tech (also
// location-scoped, but the everyday field-tech role). "Read-only" = viewer.
// "Admin" stays for legacy admin profiles (Connor's pre-Owner accounts) — the
// Owner allowlist is what actually controls user management per migration 026.
const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "tech", label: "Edit" },
  { value: "viewer", label: "Read-only" },
];

export function ManageUserControls({
  profileId,
  currentRole,
  name,
}: {
  profileId: string;
  currentRole: string;
  name: string;
}) {
  const router = useRouter();
  const [role, setRole] = useState(currentRole);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function changeRole(newRole: string) {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_set_user_role", {
      target_profile: profileId,
      new_role: newRole,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setRole(newRole);
    // Promoting to Admin removes the user from this list (techs & viewers only).
    router.refresh();
  }

  async function deleteUser() {
    if (
      !confirm(
        `Permanently delete ${name}? Their login is removed and any past work becomes unassigned. This cannot be undone.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_delete_user", {
      target_profile: profileId,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-4 border-t border-border-line pt-4">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-text-secondary">Access</label>
        <select
          value={role}
          disabled={busy}
          onChange={(e) => changeRole(e.target.value)}
          className="rounded-lg border border-border-line bg-secondary-bg px-2 py-1 text-xs text-text-primary focus:border-gold focus:outline-none disabled:opacity-50"
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={deleteUser}
        disabled={busy}
        className="mt-3 w-full rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
      >
        Delete user
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
