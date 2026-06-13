"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Office = { id: string; name: string };

export function CreateOfficeUserForm({ locations }: { locations: Office[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("tech");
  const [office, setOffice] = useState(locations[0]?.id ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const isAdmin = role === "admin";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/create-office-user", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email, full_name: fullName, role,
        location_id: isAdmin ? null : office, password,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: json.error ?? "Failed" }); return; }
    setMsg({ ok: true, text: `Created ${email}. Share the password you set.` });
    setEmail(""); setFullName(""); setPassword("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mb-8 rounded-xl border border-border-line bg-card-bg p-5">
      <h2 className="mb-4 text-sm font-semibold text-text-primary">Add a person to an office</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input required type="text" placeholder="Full name" value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary" />
        <input required type="email" placeholder="email@jeffbrownyachts.com" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary" />
        <select value={role} onChange={(e) => setRole(e.target.value)}
          className="rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary">
          <option value="manager">Manager</option>
          <option value="tech">Edit</option>
          <option value="viewer">Read-only</option>
          <option value="admin">Admin — All offices</option>
        </select>
        <select value={office} disabled={isAdmin}
          onChange={(e) => setOffice(e.target.value)}
          className="rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary disabled:opacity-40">
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <input required type="text" placeholder="Temp password (8+ chars)" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-border-line bg-secondary-bg px-3 py-2 text-sm text-text-primary sm:col-span-2" />
      </div>
      {msg && (
        <p className={`mt-3 text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
      )}
      <button type="submit" disabled={busy}
        className="mt-4 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-primary-bg hover:bg-gold-hover disabled:opacity-50">
        {busy ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}
