#!/usr/bin/env node
// Add a Marine Tech user to Supabase (auth + profile row).
// Idempotent: re-running with the same email updates password / role / name.
//
// Usage:
//   node scripts/add-user.mjs <email> <password> [fullName] [role]
//
// role defaults to "tech"; pass "admin" to make them an admin.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const [, , email, password, fullNameArg, roleArg] = process.argv;
if (!email || !password) {
  console.error("usage: node scripts/add-user.mjs <email> <password> [fullName] [role]");
  process.exit(1);
}
const role = roleArg ?? "tech";
if (!["admin", "tech", "viewer"].includes(role)) {
  console.error(`role must be 'admin', 'tech', or 'viewer' (got '${role}')`);
  process.exit(1);
}
// Derive a reasonable default name from the local-part of the email.
const defaultName = email
  .split("@")[0]
  .replace(/[._-]+/g, " ")
  .replace(/\b\w/g, (c) => c.toUpperCase());
const fullName = fullNameArg ?? defaultName;

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", "..", ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function ensureAuthUser() {
  const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    console.log(`✓ auth user exists: ${existing.id} (password reset)`);
    return existing.id;
  }
  const { data, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) throw createErr;
  console.log(`✓ auth user created: ${data.user.id}`);
  return data.user.id;
}

async function ensureProfile(authId) {
  const { data: existing } = await admin
    .from("profiles")
    .select("*")
    .eq("auth_id", authId)
    .maybeSingle();
  if (existing) {
    if (existing.role !== role || existing.status !== "active" || existing.full_name !== fullName) {
      const { error } = await admin
        .from("profiles")
        .update({ role, status: "active", full_name: fullName })
        .eq("id", existing.id);
      if (error) throw error;
      console.log(`✓ profile updated: ${existing.id}  role=${role}, status=active, name=${fullName}`);
    } else {
      console.log(`✓ profile already correct: ${existing.id}`);
    }
    return existing.id;
  }
  const { data, error } = await admin
    .from("profiles")
    .insert({ auth_id: authId, email, full_name: fullName, role, status: "active" })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`✓ profile created: ${data.id}`);
  return data.id;
}

async function main() {
  console.log(`Adding user: ${email}  name=${fullName}  role=${role}`);
  const authId = await ensureAuthUser();
  await ensureProfile(authId);
  console.log("\n=== Login ===");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Role:     ${role}`);
  console.log("=============");
}

main().catch((err) => {
  console.error("\nERROR:", err.message ?? err);
  process.exit(1);
});
