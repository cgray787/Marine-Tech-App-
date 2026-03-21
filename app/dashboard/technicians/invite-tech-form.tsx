"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function InviteTechForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (!email || !fullName) {
      setError("Email and name are required");
      setLoading(false);
      return;
    }

    const supabase = createClient();

    // Generate invite token
    const token = crypto.randomUUID();

    // Create invite record
    const { error: inviteError } = await supabase.from("invites").insert({
      email,
      token,
    });

    if (inviteError) {
      setError(inviteError.message);
      setLoading(false);
      return;
    }

    // Create profile in invited status
    const { error: profileError } = await supabase.from("profiles").insert({
      email,
      full_name: fullName,
      role: "tech",
      status: "invited",
    });

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    setSuccess(`Invite created for ${email}. Token: ${token}`);
    setEmail("");
    setFullName("");
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="mb-6">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-primary-bg transition-colors hover:bg-gold-hover"
        >
          + Invite Technician
        </button>
      ) : (
        <div className="rounded-xl border border-border-line bg-card-bg p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">
              Invite New Technician
            </h2>
            <button
              onClick={() => {
                setOpen(false);
                setError("");
                setSuccess("");
              }}
              className="text-text-secondary hover:text-text-primary"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
              {success}
            </div>
          )}

          <form onSubmit={handleInvite} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="John Smith"
                  className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2.5 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="tech@example.com"
                  className="w-full rounded-lg border border-border-line bg-secondary-bg px-3 py-2.5 text-sm text-text-primary placeholder-text-secondary/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-gold px-6 py-2.5 text-sm font-semibold text-primary-bg transition-colors hover:bg-gold-hover disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send Invite"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setError("");
                  setSuccess("");
                }}
                className="rounded-lg border border-border-line px-6 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
