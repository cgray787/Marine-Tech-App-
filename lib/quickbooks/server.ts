/**
 * lib/quickbooks/server.ts
 * SERVER-ONLY module — never import from client components.
 *
 * QuickBooks Online OAuth2 helpers:
 * - Environment / config accessors
 * - Service-role Supabase client (tokens are service-role-only by design)
 * - Token exchange, refresh (with Intuit rotation persistence), and authenticated fetch
 * - requireQbRole: session-cookie auth for route handlers (admin | manager)
 */

import { createClient as createSbClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

// ── Environment helpers ────────────────────────────────────────────────────

/** True when both Intuit app credentials are present. */
export function qbConfigured(): boolean {
  return Boolean(process.env.INTUIT_CLIENT_ID && process.env.INTUIT_CLIENT_SECRET);
}

/** Base URL for QuickBooks API calls (sandbox or production). */
export function qbApiBase(): string {
  return process.env.QB_ENV === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

/** The OAuth redirect URI registered in the Intuit developer app. */
export function qbRedirectUri(): string {
  return (
    process.env.QB_REDIRECT_URI ??
    "https://marinetech.grayyachts.com/api/quickbooks/callback"
  );
}

// ── Supabase service-role client ───────────────────────────────────────────

/** Service-role Supabase client — bypasses RLS (for token storage only). */
export function adminDb(): SupabaseClient {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── Basic auth header ──────────────────────────────────────────────────────

/** HTTP Basic Authorization header using Intuit client_id:client_secret. */
export function basicAuthHeader(): string {
  const credentials = Buffer.from(
    `${process.env.INTUIT_CLIENT_ID}:${process.env.INTUIT_CLIENT_SECRET}`
  ).toString("base64");
  return `Basic ${credentials}`;
}

// ── Token exchange ─────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;        // seconds until access token expires
  x_refresh_token_expires_in: number; // seconds until refresh token expires
  token_type: string;
}

/** Exchange an authorization code for access + refresh tokens. */
export async function exchangeCode(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: qbRedirectUri(),
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<TokenResponse>;
}

/** Exchange a refresh token for a new access + refresh token pair. */
export async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<TokenResponse>;
}

// ── Connection row type ────────────────────────────────────────────────────

export interface QbConnection {
  org_id: string;
  realm_id: string;
  access_token: string;
  refresh_token: string;
  access_expires_at: string;
  refresh_expires_at: string;
  company_name: string | null;
  connected_by: string | null;
  connected_at: string;
  updated_at: string;
}

/** Fetch the single qb_connections row (org-wide singleton). */
export async function getConnection(db: SupabaseClient): Promise<QbConnection | null> {
  const { data, error } = await db
    .from("qb_connections")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getConnection: ${error.message}`);
  return data as QbConnection | null;
}

/** Upsert fields into qb_connections (keyed by org_id from the org table). */
export async function saveConnection(
  db: SupabaseClient,
  fields: Omit<QbConnection, "org_id" | "connected_at"> & { connected_by?: string | null }
): Promise<void> {
  // Resolve org_id from the organizations table (single-org setup)
  const { data: org, error: orgErr } = await db
    .from("organizations")
    .select("id")
    .limit(1)
    .single();

  if (orgErr || !org) {
    throw new Error(`saveConnection: could not resolve org_id — ${orgErr?.message}`);
  }

  const { error } = await db.from("qb_connections").upsert(
    { ...fields, org_id: org.id, updated_at: fields.updated_at ?? new Date().toISOString() },
    { onConflict: "org_id" }
  );

  if (error) throw new Error(`saveConnection: ${error.message}`);
}

// ── getFreshAccessToken ────────────────────────────────────────────────────

/**
 * Returns a valid access token.
 * If the access token expires within 2 minutes, rotates it via the refresh
 * token AND persists BOTH new tokens before returning.
 * (Intuit always rotates refresh tokens — must save the new one immediately.)
 */
export async function getFreshAccessToken(db: SupabaseClient): Promise<string> {
  const conn = await getConnection(db);
  if (!conn) throw new Error("No QuickBooks connection found");

  const expiresAt = new Date(conn.access_expires_at).getTime();
  const twoMinutesFromNow = Date.now() + 2 * 60 * 1000;

  if (expiresAt > twoMinutesFromNow) {
    // Still fresh
    return conn.access_token;
  }

  // Needs refresh
  const tokens = await refreshTokens(conn.refresh_token);
  const now = new Date();

  await db.from("qb_connections").update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    access_expires_at: new Date(now.getTime() + tokens.expires_in * 1000).toISOString(),
    refresh_expires_at: new Date(
      now.getTime() + tokens.x_refresh_token_expires_in * 1000
    ).toISOString(),
    updated_at: now.toISOString(),
  }).eq("org_id", conn.org_id);

  return tokens.access_token;
}

// ── qbFetch ────────────────────────────────────────────────────────────────

/**
 * Authenticated fetch against qbApiBase().
 * Adds Authorization + Accept: application/json headers.
 * On 401, forces a token refresh and retries ONCE.
 */
export async function qbFetch(
  db: SupabaseClient,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const doFetch = async (token: string) =>
    fetch(`${qbApiBase()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });

  const accessToken = await getFreshAccessToken(db);
  const res = await doFetch(accessToken);

  if (res.status !== 401) return res;

  // Force refresh and retry once
  const conn = await getConnection(db);
  if (!conn) throw new Error("No QuickBooks connection for retry");

  const tokens = await refreshTokens(conn.refresh_token);
  const now = new Date();

  await db.from("qb_connections").update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    access_expires_at: new Date(now.getTime() + tokens.expires_in * 1000).toISOString(),
    refresh_expires_at: new Date(
      now.getTime() + tokens.x_refresh_token_expires_in * 1000
    ).toISOString(),
    updated_at: now.toISOString(),
  }).eq("org_id", conn.org_id);

  return doFetch(tokens.access_token);
}

// ── requireQbRole ──────────────────────────────────────────────────────────

interface QbRoleContext {
  profile: {
    id: string;
    role: string;
    org_id: string | null;
    [key: string]: unknown;
  };
}

/**
 * Route-handler auth guard for QuickBooks write routes.
 * Reads the caller's Supabase session cookie and verifies role ∈ {admin, manager}.
 * Returns { profile } on success; throws a Response with 401 or 403 on failure.
 */
export async function requireQbRole(): Promise<QbRoleContext> {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore in Server Component context
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_id", user.id)
    .single();

  if (!profile || !["admin", "manager"].includes(profile.role)) {
    throw new Response(JSON.stringify({ error: "Forbidden — admin or manager required" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return { profile };
}
