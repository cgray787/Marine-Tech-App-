#!/usr/bin/env node
// Seed App Store reviewer demo account in Supabase.
// Creates: auth user → profile (tech, active) → demo customer + boat + marina + job.
// Idempotent: safe to re-run; reuses existing rows by deterministic email/name.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;

const REVIEWER_EMAIL = "appreview@grayyachts.com";
const REVIEWER_PASSWORD = "ReviewMarine2026!"; // share this in App Review Notes
const REVIEWER_NAME = "App Reviewer";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureAuthUser() {
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email === REVIEWER_EMAIL);
  if (existing) {
    console.log(`✓ auth user exists: ${existing.id}`);
    // Force-reset password so we know it for sure
    await admin.auth.admin.updateUserById(existing.id, {
      password: REVIEWER_PASSWORD,
      email_confirm: true,
    });
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: REVIEWER_EMAIL,
    password: REVIEWER_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
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
    if (existing.role !== "tech" || existing.status !== "active") {
      const { error } = await admin
        .from("profiles")
        .update({ role: "tech", status: "active" })
        .eq("id", existing.id);
      if (error) throw error;
      console.log(`✓ profile updated to tech/active: ${existing.id}`);
    } else {
      console.log(`✓ profile already tech/active: ${existing.id}`);
    }
    return existing.id;
  }
  const { data, error } = await admin
    .from("profiles")
    .insert({
      auth_id: authId,
      email: REVIEWER_EMAIL,
      full_name: REVIEWER_NAME,
      role: "tech",
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`✓ profile created: ${data.id}`);
  return data.id;
}

async function ensureRow(table, match, insert) {
  const query = admin.from(table).select("*");
  for (const [k, v] of Object.entries(match)) query.eq(k, v);
  const { data: rows, error } = await query.limit(1);
  if (error) throw error;
  if (rows && rows.length > 0) {
    console.log(`✓ ${table} row exists: ${rows[0].id}`);
    return rows[0].id;
  }
  const { data, error: insErr } = await admin
    .from(table)
    .insert(insert)
    .select("id")
    .single();
  if (insErr) throw insErr;
  console.log(`✓ ${table} created: ${data.id}`);
  return data.id;
}

async function main() {
  const authId = await ensureAuthUser();
  const profileId = await ensureProfile(authId);

  const customerId = await ensureRow(
    "customers",
    { name: "Demo Customer (App Review)" },
    {
      name: "Demo Customer (App Review)",
      email: "demo@example.com",
      phone: "555-0100",
      address: "123 Harbor Way, Seattle, WA",
      notes: "Seeded for App Store review.",
      created_by: profileId,
    }
  );

  const boatId = await ensureRow(
    "boats",
    { customer_id: customerId, name: "Sea Trial" },
    {
      customer_id: customerId,
      name: "Sea Trial",
      make_model: "Boston Whaler 350 Outrage",
      year: 2022,
      hin: "BWCE0350K122",
      engine_make: "Mercury",
      engine_model: "Verado 350",
      color: "White",
      home_marina: "Shilshole Bay Marina",
    }
  );

  const marinaId = await ensureRow(
    "marinas",
    { name: "Shilshole Bay Marina" },
    {
      name: "Shilshole Bay Marina",
      address: "7001 Seaview Ave NW",
      city: "Seattle",
      state: "WA",
    }
  );

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const startIso = new Date(
    tomorrow.getFullYear(),
    tomorrow.getMonth(),
    tomorrow.getDate(),
    9,
    0,
    0
  ).toISOString();
  const endIso = new Date(
    tomorrow.getFullYear(),
    tomorrow.getMonth(),
    tomorrow.getDate(),
    11,
    0,
    0
  ).toISOString();

  await ensureRow(
    "jobs",
    { assigned_to: profileId, boat_id: boatId, status: "new" },
    {
      assigned_to: profileId,
      customer_id: customerId,
      boat_id: boatId,
      marina_id: marinaId,
      service_types: ["Annual Service", "Engine Inspection"],
      scheduled_date: tomorrow.toISOString().slice(0, 10),
      scheduled_start: startIso,
      scheduled_end: endIso,
      status: "new",
      notes: "Seeded job for App Review walkthrough.",
      created_by: profileId,
    }
  );

  console.log("\n=== App Review credentials ===");
  console.log(`  Email:    ${REVIEWER_EMAIL}`);
  console.log(`  Password: ${REVIEWER_PASSWORD}`);
  console.log("===============================\n");
}

main().catch((err) => {
  console.error("\nERROR:", err.message ?? err);
  if (err.cause) console.error("cause:", err.cause);
  process.exit(1);
});
