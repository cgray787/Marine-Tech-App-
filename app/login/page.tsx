"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Cloudflare's documented always-passes test sitekey. Swap with a real
// sitekey by setting NEXT_PUBLIC_TURNSTILE_SITEKEY in wrangler.toml [vars].
const TEST_SITEKEY = "1x00000000000000000000AA";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

/**
 * Which sitekey to render with.
 *
 * A real Turnstile sitekey is bound to its registered domains, so on localhost it
 * fails with error 110200 and the widget never issues a token — leaving SIGN IN
 * permanently disabled. Anyone running `npm run dev` with a populated .env.local
 * therefore could not log in at all, which is also why the scaffolded Playwright
 * e2e tests were never able to authenticate.
 *
 * On a local host we always use Cloudflare's always-passes test key. This cannot
 * weaken production: the check is on the actual hostname the page is served from,
 * and the server still verifies the token via /api/verify-turnstile.
 */
export function resolveSitekey(hostname: string, envKey?: string): string {
  if (LOCAL_HOSTS.has(hostname)) return TEST_SITEKEY;
  return envKey || TEST_SITEKEY;
}

// Tell TS about the global injected by the Turnstile script.
declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          theme?: "light" | "dark" | "auto";
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(
    searchParams.get("error") === "unauthorized"
      ? "Access denied. Admin privileges required."
      : ""
  );
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Lazy initializer rather than an effect: the widget can mount before an effect
  // runs, and rendering it with the wrong key is the exact failure being fixed.
  // Safe for hydration because the sitekey is never written into markup — it is
  // only passed to turnstile.render().
  const [sitekey] = useState(() =>
    typeof window === "undefined"
      ? TEST_SITEKEY
      : resolveSitekey(window.location.hostname, process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY)
  );

  // Render the widget once the Turnstile script has loaded.
  function renderTurnstile() {
    if (!window.turnstile || !widgetRef.current || widgetIdRef.current) return;
    widgetIdRef.current = window.turnstile.render(widgetRef.current, {
      sitekey,
      theme: "dark",
      callback: (token) => setTurnstileToken(token),
      "expired-callback": () => setTurnstileToken(null),
      "error-callback": () => setTurnstileToken(null),
    });
  }

  // In case the script loaded before this component mounted.
  useEffect(() => {
    if (typeof window !== "undefined" && window.turnstile) renderTurnstile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!turnstileToken) {
      setError("Please complete the I'm not a robot check.");
      setLoading(false);
      return;
    }

    // Server-side verify the Turnstile token BEFORE attempting Supabase auth.
    // Any failure here means no password attempt is even made.
    try {
      const verifyRes = await fetch("/api/verify-turnstile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: turnstileToken }),
      });
      const verifyJson = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok || !verifyJson?.ok) {
        setError("Verification failed. Please try again.");
        setLoading(false);
        // Force the widget to issue a fresh token.
        window.turnstile?.reset(widgetIdRef.current ?? undefined);
        setTurnstileToken(null);
        return;
      }
    } catch {
      setError("Verification unreachable. Check your connection and retry.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      // Roll the Turnstile token so retries pass through a fresh challenge.
      window.turnstile?.reset(widgetIdRef.current ?? undefined);
      setTurnstileToken(null);
      return;
    }

    // Hard navigation (not router.push) so the freshly-set Supabase auth
    // cookie travels with the next request — the Next.js client router
    // can race the cookie write on Cloudflare Workers and bounce back to
    // /login with no session attached. Lands on the office picker, which
    // self-redirects single-office staff straight to /dashboard.
    window.location.href = "/dashboard/choose-office";
  }

  return (
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
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
                className="w-full rounded-lg border border-border-line bg-secondary-bg px-4 py-3 pr-12 text-text-primary placeholder-text-secondary/50 transition-colors focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-text-secondary transition-colors hover:text-gold focus:text-gold focus:outline-none"
              >
                {showPassword ? (
                  // eye-off
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                ) : (
                  // eye
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Cloudflare Turnstile — renders an "I'm not a robot" checkbox.
              Script tag below loads the widget runtime; the div is the
              mount point. Theme="dark" matches the form. */}
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="afterInteractive"
            onLoad={renderTurnstile}
          />
          <div ref={widgetRef} className="flex justify-center" />

          <button
            type="submit"
            disabled={loading || !turnstileToken}
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
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-bg px-4">
      <Suspense fallback={
        <div className="w-full max-w-md text-center text-text-secondary">Loading...</div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
