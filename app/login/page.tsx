"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    searchParams.get("error") === "unauthorized"
      ? "Access denied. Admin privileges required."
      : ""
  );
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-bg px-4">
      <div className="w-full max-w-md">
        {/* Logo / Branding */}
        <div className="mb-10 text-center">
          <div className="anchor-bob mb-4 inline-block text-5xl text-gold">
            &#9875;
          </div>
          <h1 className="text-3xl font-bold tracking-wider text-text-primary">
            MARINE TECH
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Admin Dashboard
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-xl border border-border-line bg-card-bg p-8">
          <h2 className="mb-6 text-xl font-semibold text-text-primary">
            Sign In
          </h2>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-text-secondary"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@marinetechapp.com"
                className="w-full rounded-lg border border-border-line bg-secondary-bg px-4 py-3 text-text-primary placeholder-text-secondary/50 transition-colors focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-text-secondary"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
                className="w-full rounded-lg border border-border-line bg-secondary-bg px-4 py-3 text-text-primary placeholder-text-secondary/50 transition-colors focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gold py-3 text-sm font-semibold tracking-wide text-primary-bg transition-colors hover:bg-gold-hover disabled:opacity-50"
            >
              {loading ? "Signing in..." : "SIGN IN"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-text-secondary">
          Marine Tech &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
