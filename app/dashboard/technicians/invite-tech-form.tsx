"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCanWrite } from "@/lib/role-context";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export function InviteTechForm() {
  const router = useRouter();
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  // Viewers can't invite techs.
  if (!canWrite) return null;

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    setInviteLink("");

    if (!email || !fullName) {
      setError("Email and name are required");
      setLoading(false);
      return;
    }

    const supabase = createClient();

    // Get current admin user for invited_by
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be logged in to invite technicians");
      setLoading(false);
      return;
    }

    // Look up admin profile ID
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_id", user.id)
      .single();

    if (!adminProfile) {
      setError("Admin profile not found");
      setLoading(false);
      return;
    }

    // Call the send-invite Edge Function
    const { data: fnData, error: fnError } = await supabase.functions.invoke(
      "send-invite",
      {
        body: {
          email,
          invited_by: adminProfile.id,
        },
      }
    );

    if (fnError) {
      setError(fnError.message || "Failed to send invite");
      setLoading(false);
      return;
    }

    const token = fnData?.token;
    const link = fnData?.invite_link || `marine-tech://register?token=${token}`;

    // Create profile in invited status
    const { error: profileError } = await supabase.from("profiles").insert({
      email,
      full_name: fullName,
      role: "tech",
      status: "invited",
    });

    if (profileError) {
      // Ignore duplicate profile errors (e.g. re-inviting)
      if (!profileError.message.includes("duplicate")) {
        setError(profileError.message);
        setLoading(false);
        return;
      }
    }

    setInviteLink(link);
    setSuccess(`Invite sent to ${email}. Share the link below if the email doesn't arrive.`);
    setEmail("");
    setFullName("");
    setLoading(false);
    router.refresh();
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(inviteLink);
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
                setInviteLink("");
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

          {inviteLink && (
            <div className="mb-4 rounded-lg border border-gold/30 bg-gold/5 px-4 py-3">
              <p className="mb-2 text-xs font-medium text-gold">
                Invite Link (share with technician):
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-primary-bg px-3 py-2 text-xs text-text-primary">
                  {inviteLink}
                </code>
                <button
                  onClick={copyToClipboard}
                  className="shrink-0 rounded-lg border border-gold/30 px-3 py-2 text-xs font-medium text-gold transition-colors hover:bg-gold/10"
                >
                  Copy
                </button>
              </div>
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
                  setInviteLink("");
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
